import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const versionName = process.env.ANDROID_VERSION_NAME?.trim();
const versionCode = Number.parseInt(process.env.ANDROID_VERSION_CODE ?? '', 10);

if (!versionName || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(versionName)) {
  throw new Error('ANDROID_VERSION_NAME должен быть версией вида 1.2.3.');
}
if (!Number.isInteger(versionCode) || versionCode < 1 || versionCode > 2_100_000_000) {
  throw new Error('ANDROID_VERSION_CODE должен быть положительным целым числом.');
}

const buildFile = resolve(process.cwd(), 'android/app/build.gradle');
let gradle = await readFile(buildFile, 'utf8');

if (!/versionCode\s+\d+/u.test(gradle) || !/versionName\s+["'][^"']+["']/u.test(gradle)) {
  throw new Error('Не найдены versionCode и versionName в android/app/build.gradle.');
}

gradle = gradle
  .replace(/versionCode\s+\d+/u, `versionCode ${versionCode}`)
  .replace(/versionName\s+["'][^"']+["']/u, `versionName "${versionName}"`);

await writeFile(buildFile, gradle);
console.log(`Android version configured: ${versionName} (${versionCode}).`);
