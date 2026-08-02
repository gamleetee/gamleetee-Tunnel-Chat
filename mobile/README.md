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

- `Mobile Android` собирает debug APK и SHA-256 checksum.
- `Mobile iOS` собирает приложение для iOS Simulator без подписи.
- Сборки сохраняются как артефакты workflow на 14 дней.

Debug APK предназначен только для тестирования. Для публичных обновлений нужен один постоянный release keystore.

## App Links и Universal Links

Android-конфигурация содержит проверяемую ссылку `https://gamchat.ru`. Для завершения проверки необходимо заменить заполнитель в `associations/assetlinks.template.json` отпечатком постоянного сертификата подписи и опубликовать итоговый файл как:

```text
https://gamchat.ru/.well-known/assetlinks.json
```

Для iOS нужно заменить `__APPLE_TEAM_ID__` в `associations/apple-app-site-association.template` после получения Apple Team ID и опубликовать итоговый файл без расширения как:

```text
https://gamchat.ru/.well-known/apple-app-site-association
```

Шаблоны с заполнителями нельзя публиковать как рабочие association-файлы.

## Следующий этап

1. Проверить автоматические debug-сборки.
2. Создать постоянный Android release keystore.
3. Добавить секреты подписи в GitHub Actions.
4. Автоматически выпускать APK/AAB через GitHub Releases.
5. После получения Apple Developer Team ID подключить TestFlight.
