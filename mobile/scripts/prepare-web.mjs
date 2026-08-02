import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const mobileRoot = process.cwd();
const repositoryRoot = resolve(mobileRoot, '..');
const publicRoot = resolve(repositoryRoot, 'public');
const generatedRoot = resolve(mobileRoot, 'generated');
const outputRoot = resolve(mobileRoot, 'www');

await rm(generatedRoot, { recursive: true, force: true });
await rm(outputRoot, { recursive: true, force: true });
await mkdir(generatedRoot, { recursive: true });

for (const file of ['app.js', 'chat-navigation.js', 'crypto.js', 'styles.css']) {
  await copyFile(resolve(publicRoot, file), resolve(generatedRoot, file));
}

await cp(resolve(publicRoot, 'icons'), resolve(generatedRoot, 'icons'), { recursive: true });
await copyFile(resolve(mobileRoot, 'src/native.js'), resolve(generatedRoot, 'native.js'));

const nativeRuntime = `<script>
window.GAMLEETEE_CONFIG = Object.freeze({
  apiBaseUrl: 'https://gamchat.ru',
  canonicalWebUrl: 'https://gamchat.ru',
  native: true
});
let resolveNativeReady;
window.GAMLEETEE_NATIVE_READY = new Promise((resolve) => {
  resolveNativeReady = resolve;
});
window.GAMLEETEE_RESOLVE_NATIVE_READY = resolveNativeReady;
</script>`;

let html = await readFile(resolve(publicRoot, 'index.html'), 'utf8');
html = html
  .replace(/^\s*<link rel="manifest"[^>]*>\s*$/gmu, '')
  .replace(/^\s*<link rel="stylesheet" href="\/install\.css">\s*$/gmu, '')
  .replace(/^\s*<script type="module" src="\/install\.js"><\/script>\s*$/gmu, '')
  .replace(/^\s*<button id="install-app"[\s\S]*?<\/button>\s*$/gmu, '')
  .replace(/^\s*<p id="install-status"[\s\S]*?<\/p>\s*$/gmu, '')
  .replace('<script src="/runtime-config.js"></script>', nativeRuntime)
  .replace(
    '<script type="module" src="/app.js"></script>',
    '<script type="module" src="/native.js"></script>\n    <script type="module" src="/app.js"></script>'
  );

await writeFile(resolve(generatedRoot, 'index.html'), html);

const stylesPath = resolve(generatedRoot, 'styles.css');
const styles = await readFile(stylesPath, 'utf8');
await writeFile(
  stylesPath,
  `${styles}\n\nhtml[data-platform='ios'] body { padding-top: env(safe-area-inset-top); }\n`
);

console.log('Prepared mobile web bundle from public/.');
