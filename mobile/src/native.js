import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import { initializeImmersiveChatNavigation } from './chat-navigation.js';

const SUPPORTED_HOSTS = new Set(['gamchat.ru', 'www.gamchat.ru']);
const NOTIFICATION_CHANNEL_ID = 'private-messages';

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

async function initializeNativeBridge() {
  try {
    const platform = Capacitor.getPlatform();
    document.documentElement.dataset.platform = platform;
    const versionLabel = document.querySelector('.about-card dl div:first-child dd');
    if (versionLabel) versionLabel.textContent = '0.2.1';
    initializeImmersiveChatNavigation();

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
