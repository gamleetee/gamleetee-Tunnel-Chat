import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

const SUPPORTED_HOSTS = new Set(['gamchat.ru', 'www.gamchat.ru']);

function normalizeInviteUrl(value) {
  const url = new URL(value);
  if (!SUPPORTED_HOSTS.has(url.hostname)) return null;
  if (!url.searchParams.get('room') || !url.hash.slice(1)) return null;
  return url.href;
}

function openInvite(value) {
  const invite = normalizeInviteUrl(value);
  if (!invite) return;

  if (window.gamleeteeApp?.openInvite) {
    window.gamleeteeApp.openInvite(invite);
  } else {
    window.GAMLEETEE_INITIAL_URL = invite;
  }
}

async function shareInvitation() {
  const invite = window.gamleeteeApp?.getInviteLink?.();
  if (!invite) return;

  await Share.share({
    title: 'Приглашение в gamleetee Чат',
    text: 'Откройте ссылку, чтобы войти в защищённую комнату.',
    url: invite,
    dialogTitle: 'Поделиться приглашением'
  });
}

async function initializeNativeBridge() {
  try {
    document.documentElement.dataset.platform = Capacitor.getPlatform();

    const launch = await App.getLaunchUrl();
    if (launch?.url) {
      const invite = normalizeInviteUrl(launch.url);
      if (invite) window.GAMLEETEE_INITIAL_URL = invite;
    }

    await App.addListener('appUrlOpen', ({ url }) => openInvite(url));

    const shareButton = document.querySelector('#share-invite');
    shareButton?.addEventListener('click', () => {
      shareInvitation().catch((error) => {
        console.error('Не удалось открыть системное меню отправки', error);
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
