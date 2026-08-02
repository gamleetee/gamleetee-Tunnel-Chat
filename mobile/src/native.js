import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import { initializeImmersiveChatNavigation } from './chat-navigation.js';

const SUPPORTED_HOSTS = new Set(['gamchat.ru', 'www.gamchat.ru']);
const NOTIFICATION_CHANNEL_ID = 'private-messages';
const APPS_URL = 'https://gamchat.ru/apps/';
const DOWNLOAD_FOLDER = 'gamchat';
const FILESYSTEM_CHUNK_BYTES = 512 * 1024;

function normalizeInviteUrl(value) {
  const url = new URL(value);
  if (!SUPPORTED_HOSTS.has(url.hostname)) return null;
  if (!url.searchParams.get('room') || !url.hash.slice(1)) return null;
  return url.href;
}

function openInvite(value) {
  const invite = normalizeInviteUrl(value);
  if (!invite) return;
  if (window.gamleeteeApp?.openInvite) window.gamleeteeApp.openInvite(invite);
  else window.GAMLEETEE_INITIAL_URL = invite;
}

async function shareInvitation(invite) {
  const url = invite || window.gamleeteeApp?.getInviteLink?.();
  if (!url) return;
  await Share.share({
    title: 'Приглашение в gamchat',
    text: 'Откройте ссылку, чтобы войти в защищённую комнату.',
    url,
    dialogTitle: 'Поделиться приглашением'
  });
}

async function requestNotificationPermission() {
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display === 'granted') return true;
  const requested = await LocalNotifications.requestPermissions();
  return requested.display === 'granted';
}

async function showPrivateNotification(detail = {}) {
  const allowed = await requestNotificationPermission();
  if (!allowed) return;
  const id = Math.max(1, Date.now() % 2_147_483_647);
  await LocalNotifications.schedule({
    notifications: [{
      id,
      title: detail.title || 'gamchat',
      body: 'Вам пришло сообщение',
      channelId: Capacitor.getPlatform() === 'android' ? NOTIFICATION_CHANNEL_ID : undefined,
      schedule: { at: new Date(Date.now() + 100) },
      extra: { private: true }
    }]
  });
}

function sanitizeFileName(value) {
  const normalized = String(value || 'gamchat-file')
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '_')
    .replace(/^\.+/u, '')
    .trim();
  return normalized.slice(0, 180) || `gamchat-file-${Date.now()}`;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function ensureDocumentPermission() {
  if (Capacitor.getPlatform() !== 'android') return;
  const current = await Filesystem.checkPermissions();
  if (current.publicStorage === 'granted') return;
  const requested = await Filesystem.requestPermissions();
  if (requested.publicStorage !== 'granted') {
    throw new Error('Нет разрешения на сохранение файлов.');
  }
}

async function writeBlobToDocuments(blob, requestedName) {
  await ensureDocumentPermission();

  const fileName = sanitizeFileName(requestedName);
  const path = `${DOWNLOAD_FOLDER}/${Date.now()}-${fileName}`;
  let result;

  if (blob.size === 0) {
    result = await Filesystem.writeFile({
      path,
      directory: Directory.Documents,
      data: '',
      recursive: true
    });
  } else {
    for (let offset = 0; offset < blob.size; offset += FILESYSTEM_CHUNK_BYTES) {
      const bytes = new Uint8Array(
        await blob.slice(offset, offset + FILESYSTEM_CHUNK_BYTES).arrayBuffer()
      );
      const data = bytesToBase64(bytes);
      if (offset === 0) {
        result = await Filesystem.writeFile({
          path,
          directory: Directory.Documents,
          data,
          recursive: true
        });
      } else {
        await Filesystem.appendFile({
          path,
          directory: Directory.Documents,
          data
        });
      }
    }
  }

  return { fileName, path, uri: result?.uri ?? '' };
}

async function saveNativeDownload(link) {
  if (link.dataset.nativeSaving === 'true') return;

  const card = link.closest('.transfer-card');
  const status = card?.querySelector('.transfer-status');
  const originalLabel = link.textContent;
  link.dataset.nativeSaving = 'true';
  link.textContent = 'Сохранение…';
  if (status) status.textContent = 'Сохранение в память телефона…';

  try {
    const response = await fetch(link.href);
    if (!response.ok) throw new Error(`Не удалось прочитать файл: HTTP ${response.status}`);
    const blob = await response.blob();
    const saved = await writeBlobToDocuments(blob, link.download);
    link.textContent = 'Сохранено';
    link.dataset.nativeSavedUri = saved.uri;
    link.setAttribute('aria-label', `Файл сохранён: ${saved.path}`);
    if (status) status.textContent = `Сохранено в Documents/${DOWNLOAD_FOLDER}`;
  } catch (error) {
    console.error('Не удалось сохранить полученный файл', error);
    link.textContent = 'Повторить сохранение';
    if (status) status.textContent = 'Не удалось сохранить файл';
  } finally {
    delete link.dataset.nativeSaving;
    if (!link.textContent) link.textContent = originalLabel || 'Скачать файл';
  }
}

function bindNativeLinks() {
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;

    const downloadLink = event.target.closest('a.download-link');
    if (downloadLink) {
      event.preventDefault();
      event.stopPropagation();
      saveNativeDownload(downloadLink).catch((error) => {
        console.error('Не удалось обработать нативное сохранение файла', error);
      });
      return;
    }

    const appsLink = event.target.closest('a[href="/apps/"], a[href="https://gamchat.ru/apps/"]');
    if (!appsLink) return;
    event.preventDefault();
    event.stopPropagation();
    Browser.open({ url: APPS_URL, toolbarColor: '#18171d' }).catch((error) => {
      console.error('Не удалось открыть страницу приложений', error);
    });
  }, { capture: true });
}

async function initializeNativeBridge() {
  try {
    const platform = Capacitor.getPlatform();
    document.documentElement.dataset.platform = platform;
    const versionLabel = document.querySelector('.about-card dl div:first-child dd');
    if (versionLabel) versionLabel.textContent = '0.2.2';
    initializeImmersiveChatNavigation();
    bindNativeLinks();

    if (platform === 'android') {
      await LocalNotifications.createChannel({
        id: NOTIFICATION_CHANNEL_ID,
        name: 'Приватные сообщения',
        description: 'Уведомления без текста переписки',
        importance: 4,
        vibration: true
      });
    }

    const launch = await App.getLaunchUrl();
    if (launch?.url) {
      const invite = normalizeInviteUrl(launch.url);
      if (invite) window.GAMLEETEE_INITIAL_URL = invite;
    }

    await App.addListener('appUrlOpen', ({ url }) => openInvite(url));

    window.addEventListener('gamleetee:share-invite', (event) => {
      shareInvitation(event.detail?.invite).catch((error) => {
        console.error('Не удалось открыть системное меню отправки', error);
      });
    });

    window.addEventListener('gamleetee:notification-setting', (event) => {
      if (event.detail?.enabled) {
        requestNotificationPermission().catch((error) => {
          console.error('Не удалось запросить разрешение на уведомления', error);
        });
      }
    });

    window.addEventListener('gamleetee:private-notification', (event) => {
      showPrivateNotification(event.detail).catch((error) => {
        console.error('Не удалось показать приватное уведомление', error);
      });
    });

    window.addEventListener('gamleetee:peer-joined', () => {
      if ('vibrate' in navigator) navigator.vibrate(80);
    });
  } finally {
    window.GAMLEETEE_RESOLVE_NATIVE_READY?.();
  }
}

initializeNativeBridge().catch((error) => {
  console.error('Не удалось инициализировать нативную оболочку', error);
  window.GAMLEETEE_RESOLVE_NATIVE_READY?.();
});
