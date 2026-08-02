import { access, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

const requiredVariables = [
  'ANDROID_KEYSTORE_FILE',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD'
];

for (const variable of requiredVariables) {
  if (!process.env[variable]) {
    throw new Error(`Не задана обязательная переменная ${variable}.`);
  }
}

const keystorePath = process.env.ANDROID_KEYSTORE_FILE;
if (!isAbsolute(keystorePath)) {
  throw new Error('ANDROID_KEYSTORE_FILE должен содержать абсолютный путь.');
}
await access(keystorePath);

const buildFile = resolve(process.cwd(), 'android/app/build.gradle');
let gradle = await readFile(buildFile, 'utf8');
const marker = '// gamleetee release signing';

if (!gradle.includes(marker)) {
  const buildTypesMatch = /\n(\s*)buildTypes\s*\{/u.exec(gradle);
  if (!buildTypesMatch) {
    throw new Error('Не найден блок buildTypes в android/app/build.gradle.');
  }

  const indentation = buildTypesMatch[1];
  const signingBlock = `\n${indentation}${marker}\n${indentation}signingConfigs {\n${indentation}    release {\n${indentation}        storeFile file(System.getenv("ANDROID_KEYSTORE_FILE"))\n${indentation}        storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")\n${indentation}        keyAlias System.getenv("ANDROID_KEY_ALIAS")\n${indentation}        keyPassword System.getenv("ANDROID_KEY_PASSWORD")\n${indentation}    }\n${indentation}}\n`;

  gradle = `${gradle.slice(0, buildTypesMatch.index)}${signingBlock}${gradle.slice(buildTypesMatch.index)}`;

  const buildTypesIndex = gradle.indexOf('buildTypes {');
  const releaseMatch = /release\s*\{/u.exec(gradle.slice(buildTypesIndex));
  if (!releaseMatch) {
    throw new Error('Не найден release build type в android/app/build.gradle.');
  }

  const releaseIndex = buildTypesIndex + releaseMatch.index + releaseMatch[0].length;
  gradle = `${gradle.slice(0, releaseIndex)}\n${indentation}        signingConfig signingConfigs.release${gradle.slice(releaseIndex)}`;
  await writeFile(buildFile, gradle);
}

console.log('Android release signing configured from environment variables.');
