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

for (const file of ['app.js', 'crypto.js', 'styles.css']) {
  await copyFile(resolve(publicRoot, file), resolve(generatedRoot, file));
}

await cp(resolve(publicRoot, 'icons'), resolve(generatedRoot, 'icons'), { recursive: true });
await copyFile(resolve(mobileRoot, 'src/native.js'), resolve(generatedRoot, 'native.js'));

let html = await readFile(resolve(publicRoot, 'index.html'), 'utf8');
html = html
  .replace(/^\s*<link rel="manifest"[^>]*>\s*$/gmu, '')
  .replace(/^\s*<link rel="stylesheet" href="\/install\.css">\s*$/gmu, '')
  .replace(/^\s*<script type="module" src="\/install\.js"><\/script>\s*$/gmu, '')
  .replace(/^\s*<button id="install-app"[\s\S]*?<\/button>\s*$/gmu, '')
  .replace(/^\s*<p id="install-status"[\s\S]*?<\/p>\s*$/gmu, '')
  .replace(
    '<script type="module" src="/app.js"></script>',
    '<script type="module" src="/native.js"></script>\n    <script type="module" src="/app.js"></script>'
  )
  .replace(
    '<button id="copy-invite" class="secondary-button" type="button">Копировать</button>',
    '<button id="copy-invite" class="secondary-button" type="button">Копировать</button>\n            <button id="share-invite" class="secondary-button" type="button">Поделиться</button>'
  );

await writeFile(resolve(generatedRoot, 'index.html'), html);

await writeFile(
  resolve(generatedRoot, 'runtime-config.js'),
  `window.GAMLEETEE_CONFIG = Object.freeze({\n  apiBaseUrl: 'https://gamchat.ru',\n  canonicalWebUrl: 'https://gamchat.ru',\n  native: true\n});\n\nlet resolveNativeReady;\nwindow.GAMLEETEE_NATIVE_READY = new Promise((resolve) => {\n  resolveNativeReady = resolve;\n});\nwindow.GAMLEETEE_RESOLVE_NATIVE_READY = resolveNativeReady;\n`
);

const stylesPath = resolve(generatedRoot, 'styles.css');
const styles = await readFile(stylesPath, 'utf8');
await writeFile(
  stylesPath,
  `${styles}\n\n#share-invite { width: 100%; }\nhtml[data-platform='ios'] body { padding-top: env(safe-area-inset-top); }\nbody { padding-bottom: env(safe-area-inset-bottom); }\n`
);

console.log('Prepared mobile web bundle from public/.');
