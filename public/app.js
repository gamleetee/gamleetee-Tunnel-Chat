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
const runtimeConfig = Object.freeze({
  apiBaseUrl: window.GAMLEETEE_CONFIG?.apiBaseUrl ?? window.location.origin,
  canonicalWebUrl: window.GAMLEETEE_CONFIG?.canonicalWebUrl ?? window.location.origin,
  native: window.GAMLEETEE_CONFIG?.native === true
});

const elements = {
  landing: document.querySelector('#landing'),
  chat: document.querySelector('#chat'),
  createRoom: document.querySelector('#create-room'),
  invite: document.querySelector('#invite-link'),
  copyInvite: document.querySelector('#copy-invite'),
  leave: document.querySelector('#leave-room'),
  status: document.querySelector('#connection-status'),
  messages: document.querySelector('#messages'),
  composer: document.querySelector('#composer'),
  message: document.querySelector('#message-input'),
  send: document.querySelector('#send-message'),
  fileInput: document.querySelector('#file-input'),
  fileButton: document.querySelector('#choose-file'),
  transfers: document.querySelector('#transfers'),
  roomCode: document.querySelector('#room-code')
};

let socket;
let roomKey;
let roomId;
let peerCount = 0;
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

  if (runtimeConfig.native && window.GAMLEETEE_NATIVE_READY) {
    await window.GAMLEETEE_NATIVE_READY;
  }

  const url = new URL(window.GAMLEETEE_INITIAL_URL ?? window.location.href);
  const requestedRoom = url.searchParams.get('room');
  const secret = url.hash.slice(1);

  if (!requestedRoom && !secret) return;
  if (!requestedRoom || !secret) {
    throw new Error('Ссылка-приглашение неполная. Попросите создателя комнаты отправить новую ссылку.');
  }

  roomId = requestedRoom;
  roomKey = await importRoomKey(secret);
  enterChat(buildInviteUrl(roomId, secret));
  connectSocket();
}

function bindEvents() {
  elements.createRoom.addEventListener('click', createRoom);
  elements.copyInvite.addEventListener('click', copyInviteLink);
  elements.leave.addEventListener('click', leaveRoom);
  elements.composer.addEventListener('submit', sendChatMessage);
  elements.fileButton.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', () => {
    const [file] = elements.fileInput.files;
    if (file) sendFile(file).catch(handleTransferError);
    elements.fileInput.value = '';
  });
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

function buildInviteUrl(inviteRoomId, secret) {
  const inviteUrl = new URL(runtimeConfig.canonicalWebUrl);
  inviteUrl.search = '';
  inviteUrl.hash = secret;
  inviteUrl.searchParams.set('room', inviteRoomId);
  return inviteUrl.href;
}

function navigateToInvite(invite) {
  const incomingUrl = new URL(invite);
  if (incomingUrl.hostname !== 'gamchat.ru' && incomingUrl.hostname !== 'www.gamchat.ru') {
    throw new Error('Ссылка ведёт на неподдерживаемый домен.');
  }

  const targetRoom = incomingUrl.searchParams.get('room');
  const secret = incomingUrl.hash.slice(1);
  if (!targetRoom || !secret) {
    throw new Error('Ссылка-приглашение неполная.');
  }

  const localUrl = new URL(window.location.href);
  localUrl.search = '';
  localUrl.hash = secret;
  localUrl.searchParams.set('room', targetRoom);
  window.location.assign(localUrl);
}

function enterChat(inviteUrl) {
  elements.landing.hidden = true;
  elements.chat.hidden = false;
  elements.invite.value = inviteUrl;
  elements.roomCode.textContent = roomId.slice(0, 8);
  setConnectionState('connecting', 'Подключение к защищённой комнате…');
  updateControls();
}

function connectSocket() {
  const apiUrl = new URL(runtimeConfig.apiBaseUrl);
  const protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  const basePath = apiUrl.pathname.replace(/\/$/u, '');
  socket = new WebSocket(
    `${protocol}//${apiUrl.host}${basePath}/ws?room=${encodeURIComponent(roomId)}`
  );

  socket.addEventListener('open', () => {
    setConnectionState('waiting', 'Подключено. Ожидание второго участника…');
  });

  socket.addEventListener('message', (event) => {
    receiveQueue = receiveQueue
      .then(() => handleSocketMessage(event.data))
      .catch((error) => {
        console.error('Не удалось обработать входящее сообщение', error);
        addSystemMessage('Не удалось расшифровать сообщение. Возможно, ключи в ссылках-приглашениях отличаются.');
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

  socket.addEventListener('error', () => {
    setConnectionState('offline', 'Не удалось подключиться к серверу туннеля.');
  });
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
  if (event.event === 'connected') {
    peerCount = event.peerCount;
  } else if (event.event === 'peer-joined') {
    peerCount = event.peerCount;
    addSystemMessage('Второй участник вошёл в комнату.');
    window.dispatchEvent(new CustomEvent('gamleetee:peer-joined'));
  } else if (event.event === 'peer-left') {
    peerCount = event.peerCount;
    addSystemMessage('Другой участник вышел из комнаты.');
  }

  if (peerCount === 2) {
    setConnectionState('online', 'Зашифрованный туннель активен');
  } else {
    setConnectionState('waiting', 'Ожидание второго участника…');
  }

  updateControls();
}

async function handleEncryptedPayload(payload) {
  switch (payload.kind) {
    case 'chat':
      addChatMessage(payload.text, 'incoming', payload.sentAt);
      break;
    case 'file-start':
      startIncomingTransfer(payload);
      break;
    case 'file-chunk':
      receiveFileChunk(payload);
      break;
    case 'file-end':
      finishIncomingTransfer(payload);
      break;
    default:
      throw new Error('Неизвестный тип зашифрованных данных.');
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
  elements.message.focus();
}

async function sendFile(file) {
  if (!canSend()) throw new Error('Второй участник ещё не подключён.');
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Текущая версия принимает файлы размером до 100 МБ.');
  }

  const transferId = crypto.randomUUID();
  const totalChunks = Math.ceil(file.size / FILE_CHUNK_BYTES);
  const transfer = createTransferCard(file.name, file.size, 'outgoing');

  await sendEncrypted({
    kind: 'file-start',
    transferId,
    name: file.name,
    size: file.size,
    mime: file.type || 'application/octet-stream',
    totalChunks
  });

  for (let index = 0; index < totalChunks; index += 1) {
    const offset = index * FILE_CHUNK_BYTES;
    const chunk = new Uint8Array(await file.slice(offset, offset + FILE_CHUNK_BYTES).arrayBuffer());

    await waitForSocketDrain();
    await sendEncrypted({
      kind: 'file-chunk',
      transferId,
      index,
      data: bytesToBase64Url(chunk)
    });

    updateTransferCard(transfer, ((index + 1) / totalChunks) * 100, 'Отправка…');
  }

  await sendEncrypted({ kind: 'file-end', transferId });
  updateTransferCard(transfer, 100, 'Отправлено');
}

function startIncomingTransfer(payload) {
  if (
    typeof payload.name !== 'string' ||
    !Number.isInteger(payload.size) ||
    payload.size < 0 ||
    payload.size > MAX_FILE_BYTES ||
    !Number.isInteger(payload.totalChunks) ||
    payload.totalChunks < 0
  ) {
    throw new Error('Некорректные сведения о файле.');
  }

  incomingTransfers.set(payload.transferId, {
    ...payload,
    chunks: new Array(payload.totalChunks),
    receivedChunks: 0,
    card: createTransferCard(payload.name, payload.size, 'incoming')
  });
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

  const progress = transfer.totalChunks === 0
    ? 100
    : (transfer.receivedChunks / transfer.totalChunks) * 100;
  updateTransferCard(transfer.card, progress, 'Получение…');
}

function finishIncomingTransfer(payload) {
  const transfer = incomingTransfers.get(payload.transferId);
  if (!transfer || transfer.receivedChunks !== transfer.totalChunks) {
    throw new Error('Передача файла не завершена.');
  }

  const blob = new Blob(transfer.chunks, { type: transfer.mime });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = transfer.name;
  link.textContent = 'Скачать файл';
  link.className = 'download-link';
  link.addEventListener('click', () => setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000), {
    once: true
  });

  transfer.card.querySelector('.transfer-actions').append(link);
  updateTransferCard(transfer.card, 100, 'Получено');
  incomingTransfers.delete(payload.transferId);
}

async function sendEncrypted(payload) {
  if (!canSend()) throw new Error('Зашифрованный туннель ещё не готов.');
  const envelope = await encryptPayload(roomKey, payload);
  socket.send(envelope);
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
  elements.message.placeholder = enabled
    ? 'Введите сообщение…'
    : 'Ожидание второго участника…';
}

function addChatMessage(text, direction, sentAt) {
  const item = document.createElement('article');
  item.className = `message ${direction}`;

  const body = document.createElement('p');
  body.textContent = text;

  const time = document.createElement('time');
  time.dateTime = sentAt;
  time.textContent = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(sentAt));

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
  const card = document.createElement('article');
  card.className = `transfer-card ${direction}`;

  const title = document.createElement('strong');
  title.textContent = name;

  const meta = document.createElement('span');
  meta.textContent = formatBytes(size);

  const status = document.createElement('span');
  status.className = 'transfer-status';
  status.textContent = direction === 'incoming' ? 'Подготовка к получению…' : 'Подготовка к отправке…';

  const progress = document.createElement('progress');
  progress.max = 100;
  progress.value = 0;

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

function setConnectionState(state, text) {
  elements.status.dataset.state = state;
  elements.status.textContent = text;
}

async function copyInviteLink() {
  await navigator.clipboard.writeText(elements.invite.value);
  window.dispatchEvent(new CustomEvent('gamleetee:invite-copied'));
  const original = elements.copyInvite.textContent;
  elements.copyInvite.textContent = 'Скопировано';
  setTimeout(() => {
    elements.copyInvite.textContent = original;
  }, 1_500);
}

function leaveRoom() {
  socket?.close(1000, 'Пользователь вышел');
  const cleanUrl = new URL(window.location.href);
  cleanUrl.search = '';
  cleanUrl.hash = '';
  window.location.assign(cleanUrl);
}

function handleTransferError(error) {
  console.error(error);
  addSystemMessage(error.message || 'Не удалось передать файл.');
}

function showFatal(message) {
  elements.landing.hidden = false;
  elements.chat.hidden = true;
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
