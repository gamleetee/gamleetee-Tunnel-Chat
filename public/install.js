import { initializeImmersiveChatNavigation } from './chat-navigation.js';

const installButton = document.querySelector('#install-app');
const installStatus = document.querySelector('#install-status');

let installPrompt;

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIosDevice() {
  return /iphone|ipad|ipod/iu.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function showInstallStatus(message, state = 'info') {
  installStatus.hidden = false;
  installStatus.dataset.state = state;
  installStatus.textContent = message;
}

function manualInstallInstructions() {
  if (isIosDevice()) {
    return 'На iPhone или iPad откройте сайт в Safari, нажмите «Поделиться», затем «На экран Домой» и «Добавить».';
  }

  if (/android/iu.test(navigator.userAgent)) {
    return 'Откройте меню браузера ⋮ и выберите «Установить приложение» или «Добавить на главный экран».';
  }

  return 'Откройте меню браузера и выберите «Установить приложение». В Chromium-браузерах также можно нажать значок установки справа в адресной строке.';
}

function configureInstallExperience() {
  if (!installButton || !installStatus) return;

  if (isStandaloneMode()) {
    installButton.hidden = true;
    showInstallStatus('Приложение уже запущено в установленном режиме.', 'success');
    return;
  }

  installButton.hidden = false;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    installButton.hidden = false;
    installButton.textContent = 'Установить приложение';
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = undefined;
    installButton.hidden = true;
    showInstallStatus('Приложение успешно установлено.', 'success');
  });

  installButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    if (isStandaloneMode()) {
      installButton.hidden = true;
      showInstallStatus('Приложение уже установлено и запущено.', 'success');
      return;
    }

    if (!installPrompt) {
      showInstallStatus(manualInstallInstructions(), 'info');
      return;
    }

    const currentPrompt = installPrompt;
    installPrompt = undefined;
    installButton.disabled = true;
    installButton.textContent = 'Открываем установку…';

    try {
      const promptResult = await currentPrompt.prompt();
      const choice = promptResult?.outcome ? promptResult : await currentPrompt.userChoice;

      if (choice?.outcome === 'accepted') {
        showInstallStatus('Установка подтверждена. Приложение появится среди программ устройства.', 'success');
        installButton.hidden = true;
      } else {
        installButton.textContent = 'Установить приложение';
        showInstallStatus(`Установка была отменена. ${manualInstallInstructions()}`, 'info');
      }
    } catch (error) {
      console.error('Не удалось открыть системное окно установки', error);
      installButton.textContent = 'Как установить приложение';
      showInstallStatus(`Браузер не открыл системное окно. ${manualInstallInstructions()}`, 'warning');
    } finally {
      installButton.disabled = false;
    }
  }, { capture: true });
}

initializeImmersiveChatNavigation();
configureInstallExperience();
