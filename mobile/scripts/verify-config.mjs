import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'package.json',
  'capacitor.config.ts',
  'vite.config.mjs',
  'src/native.js',
  'scripts/prepare-web.mjs',
  'scripts/configure-android.mjs',
  'scripts/configure-ios.mjs'
];

for (const file of requiredFiles) {
  await access(resolve(root, file));
}

const capacitorConfig = await readFile(resolve(root, 'capacitor.config.ts'), 'utf8');
if (!capacitorConfig.includes("appId: 'ru.gamleetee.gamchat'")) {
  throw new Error('Некорректный идентификатор мобильного приложения.');
}

const nativeBridge = await readFile(resolve(root, 'src/native.js'), 'utf8');
if (!nativeBridge.includes('gamchat.ru')) {
  throw new Error('В нативном мосте отсутствует домен gamchat.ru.');
}

console.log('Mobile configuration is valid.');
