const STYLE_ID = 'gamchat-immersive-chat-styles';
const IMMERSIVE_CLASS = 'chat-room-immersive';

let initialized = false;

export function initializeImmersiveChatNavigation() {
  if (initialized) return;
  initialized = true;

  const elements = {
    body: document.body,
    chatScreen: document.querySelector('#chat-screen'),
    chatRoom: document.querySelector('#chat-room'),
    chatEmpty: document.querySelector('#chat-empty'),
    chatBack: document.querySelector('#chat-back'),
    leaveRoom: document.querySelector('#leave-room'),
    roomCode: document.querySelector('#room-code'),
    status: document.querySelector('#connection-status'),
    messages: document.querySelector('#messages'),
    chatBadge: document.querySelector('#chat-badge'),
    openChat: document.querySelector('#open-chat'),
    navigation: document.querySelector('.bottom-nav'),
    chatTab: document.querySelector('[data-tab="chat"]')
  };

  if (!elements.body || !elements.chatScreen || !elements.chatRoom || !elements.chatBack || !elements.leaveRoom) {
    return;
  }

  installStyles();
  configureTopbar(elements);

  const activeRoomMenu = createActiveRoomMenu(elements);
  let menuMode = false;

  const hasActiveRoom = () => Boolean(elements.roomCode?.textContent.trim()) && !elements.leaveRoom.disabled;

  const setNavigationHidden = (hidden) => {
    elements.body.classList.toggle(IMMERSIVE_CLASS, hidden);
    if (!elements.navigation) return;
    if (hidden) elements.navigation.setAttribute('aria-hidden', 'true');
    else elements.navigation.removeAttribute('aria-hidden');
  };

  const markChatTabActive = () => {
    document.querySelectorAll('[data-screen]').forEach((screen) => {
      screen.classList.toggle('is-active', screen.dataset.screen === 'chat');
    });
    document.querySelectorAll('[data-tab]').forEach((button) => {
      const selected = button.dataset.tab === 'chat';
      button.classList.toggle('is-active', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  };

  const updateMenuDetails = () => {
    const code = elements.roomCode?.textContent.trim() || '—';
    const status = elements.status?.textContent.trim() || 'Комната подключена';
    activeRoomMenu.querySelector('[data-active-room-code]').textContent = code;
    activeRoomMenu.querySelector('[data-active-room-status]').textContent = status;
  };

  const showChatMenu = () => {
    if (!hasActiveRoom()) return;
    menuMode = true;
    setNavigationHidden(false);
    markChatTabActive();
    updateMenuDetails();
    elements.chatRoom.hidden = true;
    if (elements.chatEmpty) elements.chatEmpty.hidden = true;
    activeRoomMenu.hidden = false;
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const openRoom = () => {
    if (!hasActiveRoom()) return;
    menuMode = false;
    markChatTabActive();
    activeRoomMenu.hidden = true;
    if (elements.chatEmpty) elements.chatEmpty.hidden = true;
    elements.chatRoom.hidden = false;
    setNavigationHidden(true);
    if (elements.chatBadge) elements.chatBadge.hidden = true;
    requestAnimationFrame(() => {
      if (elements.messages) elements.messages.scrollTop = elements.messages.scrollHeight;
    });
  };

  activeRoomMenu.querySelector('[data-open-active-room]').addEventListener('click', openRoom);

  elements.chatBack.addEventListener('click', (event) => {
    if (!hasActiveRoom() || elements.chatRoom.hidden) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showChatMenu();
  }, { capture: true });

  elements.openChat?.addEventListener('click', () => queueMicrotask(openRoom), { capture: true });
  elements.chatTab?.addEventListener('click', () => {
    if (hasActiveRoom()) queueMicrotask(openRoom);
  }, { capture: true });

  const roomObserver = new MutationObserver(() => {
    if (!hasActiveRoom()) {
      menuMode = false;
      activeRoomMenu.hidden = true;
      setNavigationHidden(false);
      return;
    }

    updateMenuDetails();
    if (!menuMode && !elements.chatRoom.hidden && elements.chatScreen.classList.contains('is-active')) {
      setNavigationHidden(true);
    }
  });

  roomObserver.observe(elements.chatRoom, { attributes: true, attributeFilter: ['hidden'] });
  roomObserver.observe(elements.leaveRoom, { attributes: true, attributeFilter: ['disabled'] });
  if (elements.roomCode) roomObserver.observe(elements.roomCode, { childList: true, characterData: true, subtree: true });
  if (elements.status) roomObserver.observe(elements.status, { childList: true, characterData: true, subtree: true });
  roomObserver.observe(elements.chatScreen, { attributes: true, attributeFilter: ['class'] });

  if (elements.messages) {
    const messageObserver = new MutationObserver((records) => {
      if (!menuMode || !elements.chatBadge) return;
      const receivedMessage = records.some((record) => [...record.addedNodes].some((node) => (
        node instanceof Element && node.matches('.message.incoming')
      )));
      if (receivedMessage) elements.chatBadge.hidden = false;
    });
    messageObserver.observe(elements.messages, { childList: true });
  }

  if (hasActiveRoom() && !elements.chatRoom.hidden && elements.chatScreen.classList.contains('is-active')) {
    openRoom();
  }
}

function configureTopbar(elements) {
  elements.chatBack.setAttribute('aria-label', 'Вернуться в меню чата');
  elements.chatBack.title = 'Вернуться в меню чата';

  elements.leaveRoom.setAttribute('aria-label', 'Выйти из комнаты и вернуться домой');
  elements.leaveRoom.title = 'Выйти из комнаты';
  elements.leaveRoom.classList.add('exit-home-button');
  elements.leaveRoom.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z"/>
    </svg>`;
}

function createActiveRoomMenu(elements) {
  const section = document.createElement('section');
  section.id = 'active-chat-menu';
  section.className = 'chat-empty panel immersive-chat-menu';
  section.hidden = true;
  section.innerHTML = `
    <div class="empty-symbol" aria-hidden="true">◇</div>
    <p class="eyebrow">Активная комната</p>
    <h2>Комната <span data-active-room-code>—</span></h2>
    <p data-active-room-status>Комната подключена</p>
    <button class="primary-button" type="button" data-open-active-room>Вернуться в чат</button>`;
  elements.chatScreen.append(section);
  return section;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    body.${IMMERSIVE_CLASS} .bottom-nav {
      display: none !important;
    }

    body.${IMMERSIVE_CLASS} .app-shell {
      padding-bottom: max(14px, env(safe-area-inset-bottom));
    }

    body.${IMMERSIVE_CLASS} #chat-screen {
      min-height: calc(100dvh - max(14px, env(safe-area-inset-bottom)));
    }

    body.${IMMERSIVE_CLASS} .chat-room {
      height: calc(100dvh - 132px - max(14px, env(safe-area-inset-bottom)));
    }

    .exit-home-button svg {
      width: 23px;
      height: 23px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.9;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .immersive-chat-menu {
      margin-top: min(16vh, 130px);
    }

    .immersive-chat-menu .eyebrow {
      margin-bottom: 8px;
    }

    .immersive-chat-menu h2 span {
      color: var(--accent-bright);
    }

    @media (max-width: 640px) {
      body.${IMMERSIVE_CLASS} .app-shell {
        width: 100%;
        padding-top: max(8px, env(safe-area-inset-top));
      }

      body.${IMMERSIVE_CLASS} .chat-topbar {
        top: max(6px, env(safe-area-inset-top));
        margin-inline: 8px;
      }

      body.${IMMERSIVE_CLASS} .chat-room {
        height: calc(100dvh - 104px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
        margin: 8px 8px 0;
        border-bottom-left-radius: 18px;
        border-bottom-right-radius: 18px;
      }
    }
  `;
  document.head.append(style);
}
