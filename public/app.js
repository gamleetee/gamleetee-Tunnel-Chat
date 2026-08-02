import {
  base64UrlToBytes,
  bytesToBase64Url,
  decryptEnvelope,
  encryptPayload,
  importRoomKey,
  randomBase64Url
} from './crypto.js';

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const FILE_CHUNK_BYTES = 48 * 1024;
const SOCKET_BACKPRESSURE_LIMIT = 1 * 1024 * 1024;
const NOTIFICATION_SETTING_KEY = 'gamchat.privateNotifications';
const runtimeConfig = Object.freeze({
  apiBaseUrl: window.GAMLEETEE_CONFIG?.apiBaseUrl ?? window.location.origin,
  canonicalWebUrl: window.GAMLEETEE_CONFIG?.canonicalWebUrl ?? window.location.origin,
  native: window.GAMLEETEE_CONFIG?.native === true
});

const elements = {
  screens: [...document.querySelectorAll('[data-screen]')],
  navigation: [...document.querySelectorAll('[data-tab]')],
  createRoom: document.querySelector('#create-room'),
  joinLink: document.querySelector('#join-link'),
  joinRoom: document.querySelector('#join-room'),
  pasteLink: document.querySelector('#paste-link'),
  joinError: document.querySelector('#join-error'),
  activeRoomCard: document.querySelector('#active-room-card'),
  homeRoomCode: document.querySelector('#home-room-code'),
  homeRoomStatus: document.querySelector('#home-room-status'),
  openChat: document.querySelector('#open-chat'),
  chatBack: document.querySelector('#chat-back'),
  emptyGoHome: document.querySelector('#empty-go-home'),
  chatEmpty: document.querySelector('#chat-empty'),
  chatRoom: document.querySelector('#chat-room'),
  chatTitle: document.querySelector('#chat-title'),
  chatBadge: document.querySelector('#chat-badge'),
  invite: document.querySelector('#invite-link'),
  copyInvite: document.querySelector('#copy-invite'),
  shareInvite: document.querySelector('#share-invite'),
  toggleInvite: document.querySelector('#toggle-invite'),
  inviteSheet: document.querySelector('#invite-sheet'),
  leave: document.querySelector('#leave-room'),
  status: document.querySelector('#connection-status'),
  messages: document.querySelector('#messages'),
  composer: document.querySelector('#composer'),
  message: document.querySelector('#message-input'),
  send: document.querySelector('#send-message'),
  fileInput: document.querySelector('#file-input'),
  fileButton: document.querySelector('#choose-file'),
  uploadFile: document.querySelector('#upload-file'),
  attachmentSheet: document.querySelector('#attachment-sheet'),
  attachmentBackdrop: document.querySelector('#attachment-backdrop'),
  closeAttachment: document.querySelector('#close-attachment'),
  transfers: document.querySelector('#transfers'),
  transferSummary: document.querySelector('#transfer-summary'),
  transferSummaryName: document.querySelector('#transfer-summary-name'),
  transferSummaryStatus: document.querySelector('#transfer-summary-status'),
  transferSummaryProgress: document.querySelector('#transfer-summary-progress'),
  roomCode: document.querySelector('#room-code'),
  notificationToggle: document.querySelector('#notification-toggle'),
  notificationNote: document.querySelector('#notification-note'),
  platformName: document.querySelector('#platform-name')
};

let socket;
let roomKey;
let roomId;
let peerCount = 0;
let activeScreen = 'home';
let receiveQueue = Promise.resolve();
const incomingTransfers = new Map();

window.gamleeteeApp = Object.freeze({
  getInviteLink: () => elements.invite?.value ?? '',
  openInvite: (url) => navigateToInvite(url),
  isNative: runtimeConfig.native
});

bootstrap().catch((error) => {
  console.error(error);
  showFatal(error.message);
});

async function bootstrap() {
  registerServiceWorker();
  bindEvents();
  restoreSettings();
  setPlatformName();

  if (runtimeConfig.native && window.GAMLEETEE_NATIVE_READY) {
    await window.GAMLEETEE_NATIVE_READY;
  }

  const url = new URL(window.GAMLEETEE_INITIAL_URL ?? window.location.href);
  const requestedRoom = url.searchParams.get('room');
  const secret = url.hash.slice(1);

  if (!requestedRoom && !secret) {
    switchScreen('home');
    return;
  }

  if (!requestedRoom || !secret) {
    throw new Error('Ссылка-приглашение неполная. Попросите создателя комнаты отправить новую ссылку.');
  }

  roomId = requestedRoom;
  roomKey = await importRoomKey(secret);
  enterChat(buildInviteUrl(roomId, secret));
  connectSocket();
}

function bindEvents() {
  elements.navigation.forEach((button) => button.addEventListener('click', () => switchScreen(button.dataset.tab)));
  elements.createRoom.addEventListener('click', createRoom);
  elements.joinRoom.addEventListener('click', joinFromInput);
  elements.pasteLink.addEventListener('click', pasteInviteLink);
  elements.joinLink.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') joinFromInput();
  });
  elements.openChat.addEventListener('click', () => switchScreen('chat'));
  elements.chatBack.addEventListener('click', () => switchScreen('home'));
  elements.emptyGoHome.addEventListener('click', () => switchScreen('home'));
  elements.copyInvite.addEventListener('click', copyInviteLink);
  elements.shareInvite.addEventListener('click', shareInviteLink);
  elements.toggleInvite.addEventListener('click', () => {
    elements.inviteSheet.hidden = !elements.inviteSheet.hidden;
    elements.toggleInvite.textContent = elements.inviteSheet.hidden ? 'Пригласить' : 'Скрыть';
  });
  elements.leave.addEventListener('click', leaveRoom);
  elements.composer.addEventListener('submit', sendChatMessage);
  elements.message.addEventListener('input', resizeComposer);
  elements.fileButton.addEventListener('click', openAttachmentSheet);
  elements.uploadFile.addEventListener('click', () => elements.fileInput.click());
  elements.closeAttachment.addEventListener('click', closeAttachmentSheet);
  elements.attachmentBackdrop.addEventListener('click', closeAttachmentSheet);
  elements.fileInput.addEventListener('change', () => {
    const [file] = elements.fileInput.files;
    if (file) sendFile(file).catch(handleTransferError);
    elements.fileInput.value = '';
  });
  elements.notificationToggle.addEventListener('change', configureNotifications);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && activeScreen === 'chat') elements.chatBadge.hidden = true;
  });
}

function switchScreen(name) {
  if (!['home', 'chat', 'settings'].includes(name)) return;
  activeScreen = name;
  elements.screens.forEach((screen) => screen.classList.toggle('is-active', screen.dataset.screen === name));
  elements.navigation.forEach((button) => {
    const selected = button.dataset.tab === name;
    button.classList.toggle('is-active', selected);
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (name === 'chat') elements.chatBadge.hidden = true;
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function createRoom() {
  const secret = randomBase64Url(32);
  const nextRoomId = randomBase64Url(12);
  const nextUrl = new URL(window.location.href);
  nextUrl.search = '';
  nextUrl.hash = secret;
  nextUrl.searchParams.set('room', nextRoomId);
  window.location.assign(nextUrl);
}

function joinFromInput() {
  elements.joinError.hidden = true;
  try {
    navigateToInvite(elements.joinLink.value.trim());
  } catch (error) {
    elements.joinError.textContent = error.message;
    elements.joinError.hidden = false;
  }
}

async function pasteInviteLink() {
  try {
    elements.joinLink.value = await navigator.clipboard.readText();
    elements.joinLink.focus();
  } catch {
    elements.joinError.textContent = 'Браузер не разрешил прочитать буфер обмена. Вставьте ссылку вручную.';
    elements.joinError.hidden = false;
  }
}

function buildInviteUrl(inviteRoomId, secret) {
  const inviteUrl = new URL(runtimeConfig.canonicalWebUrl);
  inviteUrl.search = '';
  inviteUrl.hash = secret;
  inviteUrl.searchParams.set('room', inviteRoomId);
  return inviteUrl.href;
}

function navigateToInvite(invite) {
  if (!invite) throw new Error('Вставьте ссылку-приглашение.');
  let incomingUrl;
  try {
    incomingUrl = new URL(invite);
  } catch {
    throw new Error('Ссылка имеет неверный формат.');
  }

  if (!['gamchat.ru', 'www.gamchat.ru'].includes(incomingUrl.hostname)) {
    throw new Error('Ссылка ведёт на неподдерживаемый домен.');
  }

  const targetRoom = incomingUrl.searchParams.get('room');
  const secret = incomingUrl.hash.slice(1);
  if (!targetRoom || !secret) throw new Error('Ссылка-приглашение неполная.');

  const localUrl = new URL(window.location.href);
  localUrl.search = '';
  localUrl.hash = secret;
  localUrl.searchParams.set('room', targetRoom);
  window.location.assign(localUrl);
}

function enterChat(inviteUrl) {
  const shortCode = roomId.slice(0, 8);
  elements.chatEmpty.hidden = true;
  elements.chatRoom.hidden = false;
  elements.activeRoomCard.hidden = false;
  elements.leave.disabled = false;
  elements.invite.value = inviteUrl;
  elements.roomCode.textContent = shortCode;
  elements.homeRoomCode.textContent = shortCode;
  elements.chatTitle.textContent = `Комната ${shortCode}`;
  setConnectionState('connecting', 'Подключение к защищённой комнате…');
  updateControls();
  switchScreen('chat');
}

function connectSocket() {
  const apiUrl = new URL(runtimeConfig.apiBaseUrl);
  const protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  const basePath = apiUrl.pathname.replace(/\/$/u, '');
  socket = new WebSocket(`${protocol}//${apiUrl.host}${basePath}/ws?room=${encodeURIComponent(roomId)}`);

  socket.addEventListener('open', () => setConnectionState('waiting', 'Подключено. Ожидание второго участника…'));
  socket.addEventListener('message', (event) => {
    receiveQueue = receiveQueue
      .then(() => handleSocketMessage(event.data))
      .catch((error) => {
        console.error('Не удалось обработать входящее сообщение', error);
        addSystemMessage('Не удалось расшифровать сообщение. Возможно, ключи в приглашениях отличаются.');
      });
  });
  socket.addEventListener('close', (event) => {
    peerCount = 0;
    const message = event.code === 4003
      ? 'В этой комнате уже находятся два участника.'
      : 'Соединение с туннелем разорвано.';
    setConnectionState('offline', message);
    updateControls();
  });
  socket.addEventListener('error', () => setConnectionState('offline', 'Не удалось подключиться к серверу туннеля.'));
}

async function handleSocketMessage(rawData) {
  const text = typeof rawData === 'string' ? rawData : await rawData.text();
  const parsed = JSON.parse(text);
  if (parsed.type === 'system') {
    handleSystemEvent(parsed);
    return;
  }
  const payload = await decryptEnvelope(roomKey, text);
  await handleEncryptedPayload(payload);
}

function handleSystemEvent(event) {
  if (event.event === 'connected') peerCount = event.peerCount;
  else if (event.event === 'peer-joined') {
    peerCount = event.peerCount;
    addSystemMessage('Второй участник вошёл в комнату.');
    window.dispatchEvent(new CustomEvent('gamleetee:peer-joined'));
  } else if (event.event === 'peer-left') {
    peerCount = event.peerCount;
    addSystemMessage('Другой участник вышел из комнаты.');
  }

  if (peerCount === 2) setConnectionState('online', 'Защищённый туннель активен');
  else setConnectionState('waiting', 'Ожидание второго участника…');
  updateControls();
}

async function handleEncryptedPayload(payload) {
  switch (payload.kind) {
    case 'chat':
      addChatMessage(payload.text, 'incoming', payload.sentAt);
      notifyPrivateMessage();
      if (activeScreen !== 'chat') elements.chatBadge.hidden = false;
      break;
    case 'file-start': startIncomingTransfer(payload); break;
    case 'file-chunk': receiveFileChunk(payload); break;
    case 'file-end': finishIncomingTransfer(payload); break;
    default: throw new Error('Неизвестный тип зашифрованных данных.');
  }
}

async function sendChatMessage(event) {
  event.preventDefault();
  const text = elements.message.value.trim();
  if (!text || !canSend()) return;
  const sentAt = new Date().toISOString();
  await sendEncrypted({ kind: 'chat', id: crypto.randomUUID(), text, sentAt });
  addChatMessage(text, 'outgoing', sentAt);
  elements.message.value = '';
  resizeComposer();
  elements.message.focus();
}

async function sendFile(file) {
  if (!canSend()) throw new Error('Второй участник ещё не подключён.');
  if (file.size > MAX_FILE_BYTES) throw new Error('Можно отправлять файлы размером до 100 МБ.');

  const transferId = crypto.randomUUID();
  const totalChunks = Math.ceil(file.size / FILE_CHUNK_BYTES);
  const transfer = createTransferCard(file.name, file.size, 'outgoing');
  showTransferSummary(file.name, 0, 'Подготовка к отправке…');
  closeAttachmentSheet();

  await sendEncrypted({
    kind: 'file-start', transferId, name: file.name, size: file.size,
    mime: file.type || 'application/octet-stream', totalChunks
  });

  for (let index = 0; index < totalChunks; index += 1) {
    const offset = index * FILE_CHUNK_BYTES;
    const chunk = new Uint8Array(await file.slice(offset, offset + FILE_CHUNK_BYTES).arrayBuffer());
    await waitForSocketDrain();
    await sendEncrypted({ kind: 'file-chunk', transferId, index, data: bytesToBase64Url(chunk) });
    const progress = ((index + 1) / totalChunks) * 100;
    updateTransferCard(transfer, progress, 'Отправка…');
    showTransferSummary(file.name, progress, `Отправка ${Math.round(progress)}%`);
  }

  await sendEncrypted({ kind: 'file-end', transferId });
  updateTransferCard(transfer, 100, 'Отправлено');
  showTransferSummary(file.name, 100, 'Отправлено');
  setTimeout(hideCompletedTransferSummary, 2_500);
}

function startIncomingTransfer(payload) {
  if (
    typeof payload.name !== 'string' || !Number.isInteger(payload.size) || payload.size < 0 ||
    payload.size > MAX_FILE_BYTES || !Number.isInteger(payload.totalChunks) || payload.totalChunks < 0
  ) throw new Error('Некорректные сведения о файле.');

  incomingTransfers.set(payload.transferId, {
    ...payload,
    chunks: new Array(payload.totalChunks),
    receivedChunks: 0,
    card: createTransferCard(payload.name, payload.size, 'incoming')
  });
  showTransferSummary(payload.name, 0, 'Подготовка к получению…');
}

function receiveFileChunk(payload) {
  const transfer = incomingTransfers.get(payload.transferId);
  if (!transfer || !Number.isInteger(payload.index) || payload.index < 0 || payload.index >= transfer.totalChunks) {
    throw new Error('Получена некорректная часть файла.');
  }
  if (!transfer.chunks[payload.index]) {
    transfer.chunks[payload.index] = base64UrlToBytes(payload.data);
    transfer.receivedChunks += 1;
  }
  const progress = transfer.totalChunks === 0 ? 100 : (transfer.receivedChunks / transfer.totalChunks) * 100;
  updateTransferCard(transfer.card, progress, 'Получение…');
  showTransferSummary(transfer.name, progress, `Получение ${Math.round(progress)}%`);
}

function finishIncomingTransfer(payload) {
  const transfer = incomingTransfers.get(payload.transferId);
  if (!transfer || transfer.receivedChunks !== transfer.totalChunks) throw new Error('Передача файла не завершена.');

  const blob = new Blob(transfer.chunks, { type: transfer.mime });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = transfer.name;
  link.textContent = 'Скачать файл';
  link.className = 'download-link';
  link.addEventListener('click', () => setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000), { once: true });
  transfer.card.querySelector('.transfer-actions').append(link);
  updateTransferCard(transfer.card, 100, 'Получено');
  showTransferSummary(transfer.name, 100, 'Файл получен');
  setTimeout(hideCompletedTransferSummary, 2_500);
  incomingTransfers.delete(payload.transferId);
}

async function sendEncrypted(payload) {
  if (!canSend()) throw new Error('Зашифрованный туннель ещё не готов.');
  socket.send(await encryptPayload(roomKey, payload));
}

async function waitForSocketDrain() {
  while (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount > SOCKET_BACKPRESSURE_LIMIT) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (!canSend()) throw new Error('Другой участник отключился во время передачи файла.');
}

function canSend() {
  return socket?.readyState === WebSocket.OPEN && peerCount === 2;
}

function updateControls() {
  const enabled = canSend();
  elements.message.disabled = !enabled;
  elements.send.disabled = !enabled;
  elements.fileButton.disabled = !enabled;
  elements.message.placeholder = enabled ? 'Сообщение…' : 'Ожидание второго участника…';
}

function addChatMessage(text, direction, sentAt) {
  const item = document.createElement('article');
  item.className = `message ${direction}`;
  const body = document.createElement('p');
  body.textContent = text;
  const time = document.createElement('time');
  time.dateTime = sentAt;
  time.textContent = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(sentAt));
  item.append(body, time);
  elements.messages.append(item);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function addSystemMessage(text) {
  const item = document.createElement('p');
  item.className = 'system-message';
  item.textContent = text;
  elements.messages.append(item);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function createTransferCard(name, size, direction) {
  const placeholder = elements.transfers.querySelector('.muted');
  placeholder?.remove();
  const card = document.createElement('article');
  card.className = `transfer-card ${direction}`;
  const title = document.createElement('strong');
  title.textContent = name;
  const meta = document.createElement('span');
  meta.textContent = formatBytes(size);
  const progress = document.createElement('progress');
  progress.max = 100;
  progress.value = 0;
  const status = document.createElement('span');
  status.className = 'transfer-status';
  status.textContent = direction === 'incoming' ? 'Подготовка к получению…' : 'Подготовка к отправке…';
  const actions = document.createElement('div');
  actions.className = 'transfer-actions';
  card.append(title, meta, progress, status, actions);
  elements.transfers.prepend(card);
  return card;
}

function updateTransferCard(card, value, label) {
  card.querySelector('progress').value = value;
  card.querySelector('.transfer-status').textContent = label;
}

function showTransferSummary(name, value, label) {
  elements.transferSummary.hidden = false;
  elements.transferSummaryName.textContent = name;
  elements.transferSummaryStatus.textContent = label;
  elements.transferSummaryProgress.value = value;
}

function hideCompletedTransferSummary() {
  if (Number(elements.transferSummaryProgress.value) === 100) elements.transferSummary.hidden = true;
}

function setConnectionState(state, text) {
  elements.status.dataset.state = state;
  elements.status.textContent = text;
  elements.homeRoomStatus.textContent = text;
}

async function copyInviteLink() {
  await navigator.clipboard.writeText(elements.invite.value);
  window.dispatchEvent(new CustomEvent('gamleetee:invite-copied'));
  const original = elements.copyInvite.textContent;
  elements.copyInvite.textContent = 'Скопировано';
  setTimeout(() => { elements.copyInvite.textContent = original; }, 1_500);
}

async function shareInviteLink() {
  const invite = elements.invite.value;
  if (!invite) return;
  if (runtimeConfig.native) {
    window.dispatchEvent(new CustomEvent('gamleetee:share-invite', { detail: { invite } }));
    return;
  }
  if (navigator.share) {
    await navigator.share({ title: 'Приглашение в gamchat', text: 'Откройте ссылку, чтобы войти в защищённую комнату.', url: invite });
  } else {
    await copyInviteLink();
  }
}

function leaveRoom() {
  socket?.close(1000, 'Пользователь вышел');
  const cleanUrl = new URL(window.location.href);
  cleanUrl.search = '';
  cleanUrl.hash = '';
  window.location.assign(cleanUrl);
}

function openAttachmentSheet() {
  elements.attachmentBackdrop.hidden = false;
  elements.attachmentSheet.hidden = false;
}

function closeAttachmentSheet() {
  elements.attachmentBackdrop.hidden = true;
  elements.attachmentSheet.hidden = true;
}

function resizeComposer() {
  elements.message.style.height = 'auto';
  elements.message.style.height = `${Math.min(elements.message.scrollHeight, 120)}px`;
}

function restoreSettings() {
  elements.notificationToggle.checked = localStorage.getItem(NOTIFICATION_SETTING_KEY) === 'enabled';
}

async function configureNotifications() {
  const enabled = elements.notificationToggle.checked;
  if (!enabled) {
    localStorage.setItem(NOTIFICATION_SETTING_KEY, 'disabled');
    elements.notificationNote.textContent = 'Приватные уведомления выключены.';
    window.dispatchEvent(new CustomEvent('gamleetee:notification-setting', { detail: { enabled: false } }));
    return;
  }

  if (!runtimeConfig.native && 'Notification' in window) {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      elements.notificationToggle.checked = false;
      localStorage.setItem(NOTIFICATION_SETTING_KEY, 'disabled');
      elements.notificationNote.textContent = 'Браузер не разрешил уведомления.';
      return;
    }
  }

  localStorage.setItem(NOTIFICATION_SETTING_KEY, 'enabled');
  elements.notificationNote.textContent = 'Текст переписки скрыт: уведомление покажет только «Вам пришло сообщение».';
  window.dispatchEvent(new CustomEvent('gamleetee:notification-setting', { detail: { enabled: true } }));
}

async function notifyPrivateMessage() {
  if (localStorage.getItem(NOTIFICATION_SETTING_KEY) !== 'enabled' || document.visibilityState === 'visible') return;
  const detail = { title: 'gamchat', body: 'Вам пришло сообщение' };
  if (runtimeConfig.native) {
    window.dispatchEvent(new CustomEvent('gamleetee:private-notification', { detail }));
    return;
  }
  if ('Notification' in window && Notification.permission === 'granted') {
    const registration = await navigator.serviceWorker?.ready;
    await registration?.showNotification(detail.title, {
      body: detail.body,
      icon: '/icons/gamchat.svg',
      badge: '/icons/gamchat.svg',
      tag: 'gamchat-private-message',
      renotify: true
    });
  }
}

function setPlatformName() {
  const platform = document.documentElement.dataset.platform;
  elements.platformName.textContent = platform === 'android' ? 'Android' : platform === 'ios' ? 'iOS' : 'Веб';
}

function handleTransferError(error) {
  console.error(error);
  addSystemMessage(error.message || 'Не удалось передать файл.');
  showTransferSummary('Передача файла', 0, error.message || 'Ошибка');
}

function showFatal(message) {
  switchScreen('home');
  const error = document.querySelector('#fatal-error');
  error.hidden = false;
  error.textContent = message;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function registerServiceWorker() {
  if (!runtimeConfig.native && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js'));
  }
}
