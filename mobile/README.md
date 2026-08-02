# gamleetee Чат — мобильная основа

Этот каталог создаёт приложения Android и iOS из общего защищённого веб-клиента `public/`.
Нативные проекты генерируются повторяемо через Capacitor и не хранятся в Git, чтобы репозиторий не был заполнен производными файлами Android Studio и Xcode.

## Идентификаторы

- Название: `gamleetee Чат`
- Android Application ID: `ru.gamleetee.gamchat`
- iOS Bundle ID: `ru.gamleetee.gamchat`
- Сервер: `https://gamchat.ru`
- WebSocket: `wss://gamchat.ru/ws`
- Пользовательская схема: `gamchat://`

## Возможности первой версии

- тот же чат со сквозным AES-256-GCM шифрованием;
- передача файлов до 100 МБ;
- открытие комнат по ссылкам `https://gamchat.ru/?room=...#...`;
- системное меню «Поделиться»;
- вибрация на Android при подключении второго участника;
- единая кодовая база для браузера, Android и iOS.

## Локальная подготовка

Требуется Node.js 22.12 или новее.

```bash
cd mobile
npm install
npm run verify
npm run build:web
```

### Android debug APK

Нужны Android SDK 36 и JDK 21.

```bash
cd mobile
npm run build:android:debug
```

Результат:

```text
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

### Android signed release

Команда требует постоянный keystore и четыре переменные окружения:

```text
ANDROID_KEYSTORE_FILE
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
ANDROID_VERSION_NAME
ANDROID_VERSION_CODE
```

Пример запуска без сохранения секретов в Git:

```bash
cd mobile
ANDROID_KEYSTORE_FILE=/absolute/path/gamleetee-release.jks \
ANDROID_KEYSTORE_PASSWORD='...' \
ANDROID_KEY_ALIAS='gamleetee' \
ANDROID_KEY_PASSWORD='...' \
ANDROID_VERSION_NAME='0.1.0' \
ANDROID_VERSION_CODE='1' \
npm run build:android:release
```

Результаты:

```text
mobile/android/app/build/outputs/apk/release/app-release.apk
mobile/android/app/build/outputs/bundle/release/app-release.aab
```

Один и тот же release keystore должен использоваться для всех последующих обновлений. Потеря ключа делает прямое обновление ранее установленного APK невозможным.

### iOS Simulator

Нужны macOS и Xcode.

```bash
cd mobile
npm run build:ios:simulator
```

Результат создаётся в:

```text
mobile/ios/build/Build/Products/Debug-iphonesimulator/App.app
```

## GitHub Actions

### Mobile Android

Workflow собирает:

- debug APK;
- тестовый release APK;
- тестовый release AAB;
- SHA-256 checksums.

Release-файлы этого workflow подписываются одноразовым CI-ключом. Они проверяют корректность release-процесса, но не являются официальными обновляемыми релизами.

### Mobile iOS

Workflow собирает приложение для iOS Simulator без подписи и сохраняет его как artifact на 14 дней.

### Mobile Android Release

Workflow запускается:

- вручную с указанием версии;
- автоматически при отправке тега `mobile-vX.Y.Z`.

Он создаёт официальный GitHub Release со следующими файлами:

```text
gamleetee-chat.apk
gamleetee-chat.aab
assetlinks.json
SHA256SUMS.txt
APK-SIGNATURE.txt
```

Стабильные ссылки после первого официального релиза:

```text
https://github.com/gamleetee/gamleetee-Tunnel-Chat/releases/latest/download/gamleetee-chat.apk
https://github.com/gamleetee/gamleetee-Tunnel-Chat/releases/latest/download/gamleetee-chat.aab
https://github.com/gamleetee/gamleetee-Tunnel-Chat/releases/latest/download/assetlinks.json
```

## GitHub Secrets для Android release

В настройках репозитория нужно создать четыре Actions Secrets:

```text
ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

`ANDROID_KEYSTORE_BASE64` содержит весь keystore в Base64, а не путь к файлу.

Linux:

```bash
base64 -w 0 gamleetee-release.jks
```

macOS:

```bash
base64 < gamleetee-release.jks | tr -d '\n'
```

Полученную строку следует сохранить только в GitHub Secret `ANDROID_KEYSTORE_BASE64`. Сам `.jks` нельзя коммитить в репозиторий.

## Выпуск версии

После добавления секретов релиз можно запустить вручную из Actions либо тегом:

```bash
git tag mobile-v0.1.0
git push origin mobile-v0.1.0
```

Workflow:

1. восстанавливает keystore во временный каталог runner;
2. собирает подписанные APK и AAB;
3. проверяет подпись APK через `apksigner`;
4. создаёт контрольные суммы;
5. генерирует `assetlinks.json` из реального сертификата;
6. создаёт или обновляет GitHub Release;
7. удаляет временный keystore.

## App Links и Universal Links

После первого официального Android-релиза созданный `assetlinks.json` нужно опубликовать как:

```text
https://gamchat.ru/.well-known/assetlinks.json
```

До этого шаблон `associations/assetlinks.template.json` содержит заполнитель и не должен публиковаться как рабочий файл.

Для iOS нужно заменить `__APPLE_TEAM_ID__` в `associations/apple-app-site-association.template` после получения Apple Team ID и опубликовать итоговый файл без расширения как:

```text
https://gamchat.ru/.well-known/apple-app-site-association
```

## Следующий этап

1. Создать и безопасно сохранить постоянный Android release keystore.
2. Добавить четыре GitHub Secrets.
3. Выпустить `mobile-v0.1.0`.
4. Проверить установку и обновление APK на реальном Android.
5. После получения Apple Developer Team ID подключить TestFlight.
