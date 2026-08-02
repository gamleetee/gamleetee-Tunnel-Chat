import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'package.json',
  'capacitor.config.json',
  'vite.config.mjs',
  '../public/icons/gamchat.svg',
  '../public/chat-navigation.js',
  'src/native.js',
  'scripts/prepare-web.mjs',
  'scripts/configure-android.mjs',
  'scripts/configure-android-release.mjs',
  'scripts/configure-android-version.mjs',
  'scripts/configure-ios.mjs'
];
for (const file of requiredFiles) await access(resolve(root, file));

const capacitorConfig = JSON.parse(await readFile(resolve(root, 'capacitor.config.json'), 'utf8'));
if (capacitorConfig.appId !== 'ru.gamleetee.gamchat') throw new Error('Некорректный идентификатор мобильного приложения.');
if (capacitorConfig.appName !== 'gamchat') throw new Error('Некорректное отображаемое имя приложения.');
if (capacitorConfig.webDir !== 'www') throw new Error('Некорректный каталог мобильной веб-сборки.');

const packageConfig = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
for (const dependency of ['@capacitor/browser', '@capacitor/filesystem', '@capacitor/local-notifications']) {
  if (!packageConfig.dependencies[dependency]) throw new Error(`Не подключён мобильный модуль ${dependency}.`);
}
if (packageConfig.version !== '0.2.2') throw new Error('Некорректная версия мобильного приложения.');
if (!packageConfig.devDependencies.sharp) throw new Error('Не подключён генератор нативных размеров иконки.');

const nativeBridge = await readFile(resolve(root, 'src/native.js'), 'utf8');
for (const requiredText of [
  'gamchat.ru',
  'Вам пришло сообщение',
  'LocalNotifications',
  'initializeImmersiveChatNavigation',
  'Filesystem.writeFile',
  'Filesystem.appendFile',
  'Directory.Documents',
  'https://gamchat.ru/apps/',
  'Browser.open',
  '0.2.2'
]) {
  if (!nativeBridge.includes(requiredText)) throw new Error(`В нативном мосте отсутствует ${requiredText}.`);
}

const androidConfig = await readFile(resolve(root, 'scripts/configure-android.mjs'), 'utf8');
for (const requiredText of ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'android:largeHeap']) {
  if (!androidConfig.includes(requiredText)) throw new Error(`В Android-конфигурации отсутствует ${requiredText}.`);
}

const iosConfig = await readFile(resolve(root, 'scripts/configure-ios.mjs'), 'utf8');
for (const requiredText of ['PrivacyInfo.xcprivacy', 'NSPrivacyAccessedAPICategoryFileTimestamp', 'UIFileSharingEnabled']) {
  if (!iosConfig.includes(requiredText)) throw new Error(`В iOS-конфигурации отсутствует ${requiredText}.`);
}

const chatNavigation = await readFile(resolve(root, '../public/chat-navigation.js'), 'utf8');
for (const requiredText of ['chat-room-immersive', 'Вернуться в меню чата', 'exit-home-button']) {
  if (!chatNavigation.includes(requiredText)) throw new Error(`В навигации чата отсутствует ${requiredText}.`);
}

const releaseScript = await readFile(resolve(root, 'scripts/configure-android-release.mjs'), 'utf8');
for (const variable of ['ANDROID_KEYSTORE_FILE','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD']) {
  if (!releaseScript.includes(variable)) throw new Error(`В release-конфигурации отсутствует ${variable}.`);
}

console.log('Mobile configuration is valid.');
