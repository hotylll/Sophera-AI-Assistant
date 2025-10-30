function handleHistoryListClick(event) {
  const moreButton = event.target.closest('.history-item__more');
  if (moreButton) {
    event.stopPropagation();
    const conversationId = moreButton.dataset.conversationId;
    if (conversationId) {
      toggleHistoryMenu(conversationId, moreButton);
    }
    return;
  }

  const item = event.target.closest('.history-item__main');
  if (!item) {
    return;
  }

  const conversationId = item.dataset.conversationId;
  if (!conversationId) {
    return;
  }

  setActiveConversation(conversationId);
  closeHistoryPanel();
}

function handleHistoryListDoubleClick(event) {
  const mainButton = event.target.closest('.history-item__main');
  if (!mainButton) {
    return;
  }
  const conversationId = mainButton.dataset.conversationId;
  if (conversationId) {
    enterRenameMode(conversationId);
  }
}

function handleHistoryListKeyDown(event) {
  if (event.key !== 'Enter') {
    return;
  }
  const mainButton = event.target.closest('.history-item__main');
  if (!mainButton) {
    return;
  }
  const conversationId = mainButton.dataset.conversationId;
  if (conversationId) {
    setActiveConversation(conversationId);
    closeHistoryPanel();
  }
}

function handleHistoryItemMouseEnter(event) {
  const item = event.target.closest('.history-item');
  if (!item) {
    return;
  }
  const moreButton = item.querySelector('.history-item__more');
  if (moreButton) {
    moreButton.classList.add('history-item__more--visible');
  }
}

function handleHistoryItemMouseLeave(event) {
  const item = event.target.closest('.history-item');
  if (!item) {
    return;
  }
  const moreButton = item.querySelector('.history-item__more');
  if (moreButton && item.dataset.conversationId !== openHistoryMenuId) {
    moreButton.classList.remove('history-item__more--visible');
  }
}

function toggleHistoryMenu(conversationId, anchorButton) {
  if (openHistoryMenuId === conversationId && !historyMenu.hidden) {
    hideHistoryMenu();
    return;
  }

  openHistoryMenuId = conversationId;
  const rect = anchorButton.getBoundingClientRect();
  historyMenu.hidden = false;
  historyMenu.style.position = 'fixed';
  const menuWidth = historyMenu.offsetWidth || 180;
  const left = Math.max(12, Math.min(rect.left + rect.width - menuWidth, window.innerWidth - menuWidth - 12));
  historyMenu.style.top = `${rect.bottom + 4}px`;
  historyMenu.style.left = `${left}px`;
}

function hideHistoryMenu() {
  historyMenu.hidden = true;
  openHistoryMenuId = null;
}

function enterRenameMode(conversationId) {
  const current = conversations.find((item) => item.id === conversationId);
  if (!current) {
    return;
  }
  renameState = {
    conversationId,
    originalTitle: getConversationDisplayTitle(current)
  };
  renderHistoryList();
  const input = historyList.querySelector('.history-item__title-input');
  if (input) {
    input.focus();
    input.select();
  }
}

function exitRenameMode(save) {
  if (!renameState) {
    return;
  }
  const { conversationId, originalTitle } = renameState;
  renameState = null;
  const input = historyList.querySelector('.history-item__title-input');
  if (save && input) {
    const value = input.value.trim();
    const newTitle = value || originalTitle;
    commitHistoryState((draft) => {
      const target = draft.conversations.find((item) => item.id === conversationId);
      if (target) {
        target.title = newTitle;
        target.updatedAt = Date.now();
      }
    });
  } else {
    renderHistoryList();
  }
}

function handleRenameInputKeyDown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    exitRenameMode(true);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    exitRenameMode(false);
  }
}

function openDeleteModal(conversationId) {
  deleteConfirmState = conversationId;
  const entry = conversations.find((item) => item.id === conversationId);
  const title = entry ? getConversationDisplayTitle(entry) : '';
  deleteModalMessage.textContent = i18n.t('historyDeleteMessage', { title });
  deleteModal.hidden = false;
}

function closeDeleteModal() {
  deleteConfirmState = null;
  deleteModal.hidden = true;
}

function deleteConversation(conversationId) {
  commitHistoryState((draft) => {
    const index = draft.conversations.findIndex((item) => item.id === conversationId);
    if (index === -1) {
      return;
    }
    draft.conversations.splice(index, 1);
    if (!draft.conversations.length) {
      const newConversation = createConversation();
      draft.conversations.push(newConversation);
      draft.activeConversationId = newConversation.id;
      return;
    }
    if (draft.activeConversationId === conversationId) {
      draft.activeConversationId = draft.conversations[0].id;
    }
  });
}
import { createI18n, applyTranslations } from './shared/i18n.js';
import { renderMarkdownSafe } from './shared/markdown.js';

const MAX_HISTORY = 40;
const STREAM_SAVE_INTERVAL = 120;
const HISTORY_STORAGE_KEY = 'sidebarConversationHistory';
const LEGACY_STORAGE_KEY = 'sidebarConversationState';
const HISTORY_VERSION = 1;
const SIDEBAR_PORT_NAME = 'ai-sidebar';

const sidebarRoot = document.getElementById('sidebarRoot');
const chatLog = document.getElementById('chatLog');
const welcomeState = document.getElementById('welcomeState');
const composerInput = document.getElementById('composerInput');
const composerHint = document.getElementById('composerHint');
const statusText = document.getElementById('statusText');
const sendButton = document.getElementById('sendButton');
const stopButton = document.getElementById('stopButton');
const newChatButton = document.getElementById('newChatButton');
const settingsButton = document.getElementById('settingsButton');
const menuButton = document.getElementById('menuButton');
const sidebarMain = document.querySelector('.sidebar__main');
const historyPanel = document.getElementById('historyPanel');
const historyOverlay = document.getElementById('historyOverlay');
const historyList = document.getElementById('historyList');
const historyPanelNewChatButton = document.getElementById('historyPanelNewChatButton');
const historyEmptyState = document.getElementById('historyEmptyState');
const welcomeChips = document.getElementById('welcomeChips');
const mentionPopover = document.getElementById('mentionPopover');
const mentionList = document.getElementById('mentionList');
const mentionReloadButton = document.getElementById('mentionReloadButton');

const historyMenu = document.createElement('div');
historyMenu.className = 'history-item-menu';
historyMenu.hidden = true;

const historyMenuList = document.createElement('div');
historyMenuList.className = 'history-item-menu__list';

const historyMenuRename = document.createElement('button');
historyMenuRename.type = 'button';
historyMenuRename.className = 'history-item-menu__item';
historyMenuRename.dataset.action = 'rename';
historyMenuRename.dataset.icon = '✏️';
historyMenuRename.dataset.i18n = 'historyMenuRename';

const historyMenuDelete = document.createElement('button');
historyMenuDelete.type = 'button';
historyMenuDelete.className = 'history-item-menu__item history-item-menu__item--danger';
historyMenuDelete.dataset.action = 'delete';
historyMenuDelete.dataset.icon = '🗑️';
historyMenuDelete.dataset.i18n = 'historyMenuDelete';

historyMenuList.append(historyMenuRename, historyMenuDelete);
historyMenu.appendChild(historyMenuList);
document.body.appendChild(historyMenu);

const deleteModal = document.createElement('div');
deleteModal.className = 'history-delete-modal';
deleteModal.hidden = true;

deleteModal.innerHTML = `
  <div class="history-delete-modal__backdrop"></div>
  <div class="history-delete-modal__content" role="dialog" aria-modal="true">
    <h2 class="history-delete-modal__title" data-i18n="historyDeleteTitle"></h2>
    <p class="history-delete-modal__message"></p>
    <div class="history-delete-modal__actions">
      <button type="button" class="history-delete-modal__cancel" data-i18n="historyDeleteCancel"></button>
      <button type="button" class="history-delete-modal__confirm" data-i18n="historyDeleteConfirm"></button>
    </div>
  </div>`;

document.body.appendChild(deleteModal);

const deleteModalMessage = deleteModal.querySelector('.history-delete-modal__message');
const deleteModalCancel = deleteModal.querySelector('.history-delete-modal__cancel');
const deleteModalConfirm = deleteModal.querySelector('.history-delete-modal__confirm');

const i18n = createI18n('en');

let sidebarPort = null;
let sidebarPortPromise = null;
let lastBroadcastQuoteId = null;

let historyState = null;
let conversations = [];
let activeConversationId = null;
let activeConversation = null;
let conversation = [];
let responseLanguage = 'auto';
let activeRequest = null;
let streamSaveTimeout = null;
let isWritingHistoryState = false;
let pendingHistoryPersist = false;
let tabCache = [];
let tabRequestId = null;
let mentionState = null;
let mentionSuggestions = [];
let mentionHighlightIndex = -1;
let isHistoryPanelOpen = false;
let openHistoryMenuId = null;
let renameState = null;
let deleteConfirmState = null;

init();
registerEvents();
ensureSidebarPort().catch((error) => {
  console.error('Failed to establish initial sidebar connection:', error);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return;
  }

  if (message.target === 'sidebar' && message.type === 'sidebar:quote') {
    if (message.quoteId && message.quoteId === lastBroadcastQuoteId) {
      sendResponse?.({ success: true, duplicated: true });
      return;
    }

    lastBroadcastQuoteId = message.quoteId || null;
    handleIncomingQuote(message);
    sendResponse?.({ success: true });
    return;
  }
});

async function init() {
  const settings = await storageGet({
    uiLanguage: 'en',
    responseLanguage: 'auto'
  });

  i18n.setLanguage(settings.uiLanguage);
  responseLanguage = settings.responseLanguage;
  applyLocale();

  await initializeHistoryState();

  updateComposerState();
  composerInput.focus({ preventScroll: true });
  requestTabs();
}

function registerEvents() {
  composerInput.addEventListener('input', handleComposerInput);
  composerInput.addEventListener('keydown', handleComposerKeydown);
  composerInput.addEventListener('paste', handleComposerPaste);
  composerInput.addEventListener('click', () => setTimeout(updateComposerState, 0));

  sendButton.addEventListener('click', () => {
    sendMessage();
  });

  if (stopButton) {
    stopButton.addEventListener('click', handleStopClick);
  }

  newChatButton.addEventListener('click', () => {
    startNewChat();
  });

  if (historyPanelNewChatButton) {
    historyPanelNewChatButton.addEventListener('click', () => {
      startNewChat();
      closeHistoryPanel();
    });
  }

  if (menuButton) {
    menuButton.addEventListener('click', toggleHistoryPanel);
  }

  if (historyOverlay) {
    historyOverlay.addEventListener('click', closeHistoryPanel);
  }

  if (sidebarMain) {
    sidebarMain.addEventListener('click', () => {
      if (isHistoryPanelOpen) {
        closeHistoryPanel();
      }
    });
  }

  if (historyList) {
    historyList.addEventListener('click', handleHistoryListClick);
    historyList.addEventListener('dblclick', handleHistoryListDoubleClick);
    historyList.addEventListener('keydown', handleHistoryListKeyDown);
    historyList.addEventListener('mouseenter', handleHistoryItemMouseEnter, true);
    historyList.addEventListener('mouseleave', handleHistoryItemMouseLeave, true);
  }

function handleHistoryItemMouseEnter(event) {
  const item = event.target.closest('.history-item');
  if (!item) {
    return;
  }
  const moreButton = item.querySelector('.history-item__more');
  if (moreButton) {
    moreButton.style.opacity = '1';
  }
}

function handleHistoryItemMouseLeave(event) {
  const item = event.target.closest('.history-item');
  if (!item) {
    return;
  }
  const moreButton = item.querySelector('.history-item__more');
  if (moreButton && item.dataset.conversationId !== openHistoryMenuId) {
    moreButton.style.opacity = '';
  }
}
  historyMenu.addEventListener('click', (event) => {
    const button = event.target.closest('.history-item-menu__item');
    if (!button) {
      return;
    }
    const action = button.dataset.action;
    const conversationId = openHistoryMenuId;
    hideHistoryMenu();
    if (!conversationId) {
      return;
    }
    if (action === 'rename') {
      enterRenameMode(conversationId);
    } else if (action === 'delete') {
      openDeleteModal(conversationId);
    }
  });

  document.addEventListener('click', (event) => {
    if (!historyMenu.hidden && !historyMenu.contains(event.target)) {
      if (!event.target.closest('.history-item__more')) {
        hideHistoryMenu();
      }
    }
  });

  deleteModalCancel.addEventListener('click', () => {
    closeDeleteModal();
  });

  deleteModal.querySelector('.history-delete-modal__backdrop').addEventListener('click', () => {
    closeDeleteModal();
  });

  deleteModalConfirm.addEventListener('click', () => {
    if (deleteConfirmState) {
      deleteConversation(deleteConfirmState);
    }
    closeDeleteModal();
  });

  settingsButton.addEventListener('click', () => {
    chrome.runtime.openOptionsPage().catch((error) => {
      console.error('Failed to open options page:', error);
    });
  });

  welcomeChips.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-chip]');
    if (!button) {
      return;
    }
    const key = button.dataset.chip;
    const phrases = {
      summarize: i18n.t('chipSummarize'),
      explain: i18n.t('chipExplain'),
      translate: i18n.t('chipTranslate')
    };
    const text = phrases[key] || '';
    if (text) {
      composerInput.innerText = text;
      moveCaretToEnd(composerInput);
      updateComposerState();
    }
  });

  mentionList.addEventListener('click', (event) => {
    const item = event.target.closest('li[data-tab-id]');
    if (!item) {
      return;
    }
    insertMention(Number(item.dataset.tabId));
  });

  mentionReloadButton.addEventListener('click', () => {
    requestTabs(true);
  });

  document.addEventListener('click', (event) => {
    if (!mentionPopover.hidden && !mentionPopover.contains(event.target) && !composerInput.contains(event.target)) {
      hideMentionPopover();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isHistoryPanelOpen) {
      closeHistoryPanel();
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }
    if (changes.uiLanguage) {
      i18n.setLanguage(changes.uiLanguage.newValue);
      applyLocale();
    }
    if (changes.responseLanguage) {
      responseLanguage = changes.responseLanguage.newValue;
    }
    if (changes[HISTORY_STORAGE_KEY]) {
      if (isWritingHistoryState) {
        return;
      }
      const newState = changes[HISTORY_STORAGE_KEY].newValue;
      if (newState) {
        setLocalHistoryState(newState);
        refreshUI();
      }
    }
  });
}

async function ensureSidebarPort() {
  if (sidebarPort) {
    return sidebarPort;
  }
  if (sidebarPortPromise) {
    return sidebarPortPromise;
  }

  sidebarPortPromise = new Promise((resolve, reject) => {
    try {
      const port = chrome.runtime.connect({ name: SIDEBAR_PORT_NAME });
      attachSidebarPort(port);
      resolve(port);
    } catch (error) {
      reject(error);
    }
  })
    .catch((error) => {
      console.error('Failed to connect to background port:', error);
      throw error;
    })
    .finally(() => {
      sidebarPortPromise = null;
    });

  return sidebarPortPromise;
}

function attachSidebarPort(port) {
  sidebarPort = port;

  port.onMessage.addListener(handleSidebarPortMessage);
  port.onDisconnect.addListener(() => {
    if (sidebarPort === port) {
      sidebarPort = null;
    }
    setStatus(i18n.t('statusError'), true);
    updateComposerState();
  });

  if (!isConversationStreaming(activeConversationId)) {
    setStatus('', false);
  }
  updateComposerState();
}

function handleSidebarPortMessage(message) {
  if (!message || typeof message !== 'object') {
    return;
  }

  switch (message.type) {
    case 'sidebar:ready':
      requestTabs();
      break;
    case 'sidebar:listTabs:response':
      handleTabResponse(message);
      break;
    case 'sidebar:quote':
      handleIncomingQuote(message);
      break;
    case 'chat:chunk':
      handleChatChunk(message);
      break;
    case 'chat:done':
      handleChatDone(message);
      break;
    case 'chat:error':
      handleChatError(message);
      break;
    default:
      break;
  }
}

function handleIncomingQuote(message) {
  const quoteText = (message?.text || '').trim();
  if (!quoteText) {
    return;
  }
  insertQuoteBlock(quoteText, message.source || {});
}

async function sendMessageToBackground(message) {
  if (!message || typeof message !== 'object') {
    return;
  }

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let port;
    try {
      port = await ensureSidebarPort();
      port.postMessage(message);
      return;
    } catch (error) {
      lastError = error;
      console.warn('Sidebar port message failed, retrying...', error);
      if (port) {
        try {
          port.disconnect();
        } catch (disconnectError) {
          console.debug('Sidebar port disconnect failed:', disconnectError);
        }
        if (sidebarPort === port) {
          sidebarPort = null;
        }
      } else {
        sidebarPort = null;
      }
    }
  }

  throw lastError || new Error('Failed to send message to background');
}

function applyLocale() {
  applyTranslations(sidebarRoot, i18n.t);
  applyTranslations(historyMenu, i18n.t);
  applyTranslations(deleteModal, i18n.t);
  composerInput.dataset.placeholder = i18n.t('promptPlaceholder');
  sendButton.textContent = i18n.t('send');
  composerHint.textContent = i18n.t('mentionHint');
  settingsButton.title = i18n.t('settingsTooltip');
  updateComposerState();
  refreshUI({ refreshHistory: true });
}

async function storageGet(defaults) {
  return new Promise((resolve) => {
    chrome.storage.local.get(defaults, resolve);
  });
}

function storageSet(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, resolve);
  });
}

async function initializeHistoryState() {
  const { historyState: storedHistory, legacyState } = await loadHistoryState();
  let initialState = storedHistory;

  if (!initialState) {
    if (legacyState) {
      initialState = migrateLegacyState(legacyState);
      chrome.storage.local.remove(LEGACY_STORAGE_KEY);
    } else {
      initialState = createDefaultHistoryState();
    }

    const normalized = normalizeHistoryState(initialState);
    setLocalHistoryState(normalized);
    await storageSet({ [HISTORY_STORAGE_KEY]: normalized });
  } else {
    const normalized = normalizeHistoryState(initialState);
    setLocalHistoryState(normalized);
  }

  refreshUI();
}

async function loadHistoryState() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [HISTORY_STORAGE_KEY]: null, [LEGACY_STORAGE_KEY]: null }, (result) => {
      resolve({
        historyState: result[HISTORY_STORAGE_KEY],
        legacyState: result[LEGACY_STORAGE_KEY]
      });
    });
  });
}

function migrateLegacyState(legacyState) {
  if (!legacyState || typeof legacyState !== 'object') {
    return createDefaultHistoryState();
  }

  const messages = Array.isArray(legacyState.conversation)
    ? legacyState.conversation.map(normalizeMessage)
    : [];

  const conversation = createConversation({
    messages,
    title: deriveConversationTitle(messages),
    createdAt: legacyState.createdAt || Date.now(),
    updatedAt: legacyState.updatedAt || Date.now()
  });

  return {
    version: HISTORY_VERSION,
    conversations: [conversation],
    activeConversationId: conversation.id
  };
}

function createDefaultHistoryState() {
  const conversation = createConversation();
  return {
    version: HISTORY_VERSION,
    conversations: [conversation],
    activeConversationId: conversation.id
  };
}

function createConversation(initial = {}) {
  const now = Date.now();
  const messages = Array.isArray(initial.messages) ? initial.messages.map(normalizeMessage) : [];
  clipMessages(messages);
  const conversation = {
    id: initial.id || generateId('conv'),
    title: initial.title || '',
    messages,
    createdAt: initial.createdAt || now,
    updatedAt: initial.updatedAt || now
  };

  if (!conversation.title) {
    conversation.title = deriveConversationTitle(conversation.messages);
  }

  return conversation;
}

function normalizeHistoryState(state) {
  if (!state || typeof state !== 'object') {
    return createDefaultHistoryState();
  }

  const normalized = {
    version: HISTORY_VERSION,
    conversations: Array.isArray(state.conversations)
      ? state.conversations.map((conversation) => createConversation(conversation))
      : createDefaultHistoryState().conversations,
    activeConversationId: state.activeConversationId || null
  };

  normalized.conversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  if (!normalized.conversations.length) {
    const conversation = createConversation();
    normalized.conversations.push(conversation);
  }

  if (!normalized.activeConversationId || !normalized.conversations.some((item) => item.id === normalized.activeConversationId)) {
    normalized.activeConversationId = normalized.conversations[0].id;
  }

  return normalized;
}

function setLocalHistoryState(state) {
  historyState = normalizeHistoryState(state);
  conversations = historyState.conversations;
  activeConversationId = historyState.activeConversationId;
  activeConversation = conversations.find((item) => item.id === activeConversationId) || conversations[0] || null;
  conversation = activeConversation ? activeConversation.messages : [];
}

function normalizeMessage(message = {}) {
  const timestamp = message.timestamp || Date.now();
  return {
    id: message.id || generateId('msg'),
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: message.content || '',
    parts: Array.isArray(message.parts) ? message.parts : null,
    mentions: Array.isArray(message.mentions) ? message.mentions : [],
    quotes: normalizeQuoteList(message.quotes),
    pending: Boolean(message.pending),
    timestamp,
    errorCode: message.errorCode || null,
    meta: typeof message.meta === 'object' && message.meta ? { ...message.meta } : null
  };
}

function normalizeQuoteList(quotes) {
  if (!Array.isArray(quotes) || !quotes.length) {
    return [];
  }
  return quotes.map((quote) => ({
    text: (quote?.text || '').trim(),
    sourceTitle: quote?.sourceTitle || '',
    sourceUrl: quote?.sourceUrl || ''
  })).filter((quote) => quote.text);
}

function clipMessages(messages) {
  if (!Array.isArray(messages)) {
    return;
  }
  if (messages.length > MAX_HISTORY) {
    messages.splice(0, messages.length - MAX_HISTORY);
  }
}

function deriveConversationTitle(messages = []) {
  const firstUser = messages.find((message) => message.role === 'user' && message.content && message.content.trim());
  if (firstUser) {
    return truncateTitle(firstUser.content.trim());
  }
  return '';
}

function truncateTitle(text, maxLength = 60) {
  if (!text) {
    return '';
  }
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}…` : text;
}

function getConversationDisplayTitle(conversationEntry) {
  if (!conversationEntry) {
    return '';
  }
  return conversationEntry.title || deriveConversationTitle(conversationEntry.messages) || i18n.t('historyUntitled');
}

function getConversationPreview(conversationEntry) {
  if (!conversationEntry || !Array.isArray(conversationEntry.messages)) {
    return '';
  }
  const reversed = [...conversationEntry.messages].reverse();
  const lastMessage = reversed.find((message) => message.content && message.content.trim());
  if (!lastMessage) {
    return '';
  }
  const sanitized = lastMessage.content.replace(/\s+/g, ' ').trim();
  return truncateTitle(sanitized, 80);
}

function formatConversationTimestamp(timestamp) {
  if (!timestamp) {
    return '';
  }
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString();
}

function refreshUI(options = {}) {
  const { refreshHistory = true } = options;
  if (refreshHistory) {
    renderHistoryList();
  }
  renderConversation();
  updateComposerState();
  updateStatusIndicators();
}

function updateStatusIndicators() {
  const pending = isConversationStreaming(activeConversationId);
  if (pending) {
    setStatus(i18n.t('aiTyping'));
  } else {
    setStatus('', false);
  }
}

function isConversationStreaming(conversationId) {
  if (!conversationId) {
    return false;
  }
  if (activeRequest && activeRequest.conversationId === conversationId) {
    return true;
  }
  const convo = conversations.find((item) => item.id === conversationId);
  if (!convo) {
    return false;
  }
  return convo.messages.some((message) => message.pending);
}

function queuePersistHistoryState() {
  if (isWritingHistoryState) {
    pendingHistoryPersist = true;
    return;
  }
  isWritingHistoryState = true;
  storageSet({ [HISTORY_STORAGE_KEY]: historyState })
    .catch((error) => {
      console.error('Failed to persist history state:', error);
    })
    .finally(() => {
      isWritingHistoryState = false;
      if (pendingHistoryPersist) {
        pendingHistoryPersist = false;
        queuePersistHistoryState();
      }
    });
}

function scheduleHistoryPersist() {
  if (streamSaveTimeout) {
    return;
  }
  streamSaveTimeout = setTimeout(() => {
    streamSaveTimeout = null;
    queuePersistHistoryState();
  }, STREAM_SAVE_INTERVAL);
}

function commitHistoryState(mutator, { refreshHistory = true, throttle = false } = {}) {
  const draft = JSON.parse(JSON.stringify(historyState || createDefaultHistoryState()));
  mutator(draft);
  const normalized = normalizeHistoryState(draft);
  setLocalHistoryState(normalized);
  refreshUI({ refreshHistory });
  if (throttle) {
    scheduleHistoryPersist();
  } else {
    queuePersistHistoryState();
  }
}

function ensureActiveConversation() {
  if (activeConversation) {
    return;
  }
  const draft = JSON.parse(JSON.stringify(historyState || createDefaultHistoryState()));
  if (!draft.conversations.length) {
    const conversationEntry = createConversation();
    draft.conversations.push(conversationEntry);
    draft.activeConversationId = conversationEntry.id;
  } else if (!draft.activeConversationId) {
    draft.activeConversationId = draft.conversations[0].id;
  }
  const normalized = normalizeHistoryState(draft);
  setLocalHistoryState(normalized);
  refreshUI();
  queuePersistHistoryState();
}

function setActiveConversation(conversationId) {
  if (!conversationId || conversationId === activeConversationId) {
    return;
  }

  commitHistoryState((draft) => {
    const exists = draft.conversations.some((item) => item.id === conversationId);
    if (!exists) {
      return;
    }
    draft.activeConversationId = conversationId;
  });

  updateStatusIndicators();
  setTimeout(() => {
    scrollToBottom();
  }, 0);
}

// New history management functions will be added below

function renderConversation() {
  const wasAtBottom = isScrolledToBottom(chatLog);
  chatLog.textContent = '';
  conversation.forEach((message) => {
    chatLog.appendChild(createMessageElement(message));
  });
  welcomeState.hidden = conversation.length > 0;
  if (wasAtBottom) {
    scrollToBottom();
  }
}

function renderHistoryList() {
  if (!historyList) {
    return;
  }

  historyList.textContent = '';

  const hasHistory = conversations.some((item) => item.messages.length > 0);
  if (historyEmptyState) {
    historyEmptyState.hidden = hasHistory;
  }

  conversations.forEach((conversationEntry) => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.dataset.conversationId = conversationEntry.id;
    item.setAttribute('role', 'listitem');

    if (conversationEntry.id === activeConversationId) {
      item.classList.add('history-item--active');
    }

    const mainButton = document.createElement('button');
    mainButton.type = 'button';
    mainButton.className = 'history-item__main';
    mainButton.dataset.conversationId = conversationEntry.id;

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'history-item__content';

    if (renameState && renameState.conversationId === conversationEntry.id) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'history-item__title-input';
      input.value = renameState.originalTitle;
      input.addEventListener('keydown', handleRenameInputKeyDown);
      input.addEventListener('blur', () => exitRenameMode(true));
      contentWrapper.appendChild(input);
    } else {
      const titleElement = document.createElement('div');
      titleElement.className = 'history-item__title';
      titleElement.textContent = getConversationDisplayTitle(conversationEntry);
      contentWrapper.appendChild(titleElement);
    }

    const previewText = getConversationPreview(conversationEntry);
    if (previewText) {
      const previewElement = document.createElement('div');
      previewElement.className = 'history-item__preview';
      previewElement.textContent = previewText;
      contentWrapper.appendChild(previewElement);
    }

    const timestampElement = document.createElement('div');
    timestampElement.className = 'history-item__timestamp';
    timestampElement.textContent = formatConversationTimestamp(conversationEntry.updatedAt);
    contentWrapper.appendChild(timestampElement);

    mainButton.appendChild(contentWrapper);

    const menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'history-item__more';
    menuButton.dataset.conversationId = conversationEntry.id;
    menuButton.setAttribute('aria-label', i18n.t('menuAria'));
    menuButton.innerHTML = '&#x22EE;';

    item.append(mainButton, menuButton);
    historyList.appendChild(item);
  });
}

function createMessageElement(message) {
  const wrapper = document.createElement('div');
  wrapper.className = `chat-message chat-message--${message.role}`;
  wrapper.dataset.messageId = message.id;

  const bubble = document.createElement('div');
  bubble.className = 'chat-message__bubble';

  if (message.role === 'system') {
    bubble.textContent = message.content;
  } else if (message.role === 'user') {
    renderUserParts(message, bubble);
  } else {
    if (message.pending && !message.content) {
      bubble.appendChild(createTypingIndicator());
    } else {
      bubble.innerHTML = formatAssistantContent(message.content);
    }
  }

  wrapper.appendChild(bubble);

  if (message.meta && message.meta.cancelled) {
    const status = document.createElement('div');
    status.className = 'chat-message__status chat-message__status--cancelled';
    status.textContent = i18n.t('responseCancelled');
    wrapper.appendChild(status);
  }
  return wrapper;
}

function renderUserParts(message, target) {
  const quotes = Array.isArray(message.quotes) ? message.quotes : [];
  quotes.forEach((quote) => {
    const quoteBlock = document.createElement('div');
    quoteBlock.className = 'chat-user-quote';

    const icon = document.createElement('span');
    icon.className = 'chat-user-quote__icon';
    icon.textContent = '❝';
    quoteBlock.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'chat-user-quote__body';

    if (quote.sourceTitle || quote.sourceUrl) {
      const meta = document.createElement('div');
      meta.className = 'chat-user-quote__meta';
      meta.textContent = quote.sourceTitle || quote.sourceUrl;
      body.appendChild(meta);
    }

    const content = document.createElement('div');
    content.className = 'chat-user-quote__content';
    appendTextWithBreaks(content, quote.text || '');
    body.appendChild(content);

    quoteBlock.appendChild(body);
    target.appendChild(quoteBlock);
  });
  const parts = Array.isArray(message.parts) ? message.parts : [{ type: 'text', value: message.content }];
  const hasQuestionText = parts.some((part) => part.type !== 'mention' && part.value && part.value.trim());
  if (quotes.length && hasQuestionText) {
    target.appendChild(document.createElement('br'));
  }
  parts.forEach((part) => {
    if (part.type === 'mention') {
      const pill = document.createElement('span');
      pill.className = 'mention-pill';
      pill.textContent = part.title || `@${part.tabId}`;
      target.appendChild(pill);
      target.appendChild(document.createTextNode(' '));
    } else {
      appendTextWithBreaks(target, part.value);
    }
  });
}

function appendTextWithBreaks(target, text) {
  if (!text) {
    return;
  }
  const segments = text.split(/\n/);
  segments.forEach((segment, index) => {
    target.appendChild(document.createTextNode(segment));
    if (index < segments.length - 1) {
      target.appendChild(document.createElement('br'));
    }
  });
}

function formatAssistantContent(text) {
  if (!text) {
    return '';
  }
  const rendered = renderMarkdownSafe(text);
  return `<div class="ai-md-container">${rendered}</div>`;
}

function createTypingIndicator() {
  const container = document.createElement('div');
  container.className = 'chat-message__typing';
  container.innerHTML = '<span></span><span></span><span></span>';
  return container;
}

function handleComposerInput(event) {
  if (event.inputType === 'insertParagraph') {
    document.execCommand('insertLineBreak');
    event.preventDefault();
    return;
  }
  normalizeComposer();
  updateComposerState();
}

function handleComposerKeydown(event) {
  if (event.key === 'Escape' && !mentionPopover.hidden) {
    hideMentionPopover();
    return;
  }

  if (!mentionPopover.hidden) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveMentionHighlight(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveMentionHighlight(-1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const current = mentionSuggestions[mentionHighlightIndex];
      if (current) {
        insertMention(current.id);
      }
      return;
    }
  }

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
    return;
  }

  if (event.key === 'Backspace') {
    handleMentionBackspace(event);
  }
}

function handleComposerPaste(event) {
  event.preventDefault();
  const text = event.clipboardData.getData('text/plain');
  document.execCommand('insertText', false, text);
}

function handleMentionBackspace(event) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }
  const range = selection.getRangeAt(0);
  if (!range.collapsed) {
    return;
  }

  let container = range.startContainer;
  let offset = range.startOffset;

  if (container.nodeType === Node.TEXT_NODE) {
    if (offset > 0) {
      return;
    }
    const previous = container.previousSibling;
    if (previous && previous.classList && previous.classList.contains('mention-pill')) {
      previous.remove();
      event.preventDefault();
      updateComposerState();
    }
  } else if (container.nodeType === Node.ELEMENT_NODE && offset > 0) {
    const child = container.childNodes[offset - 1];
    if (child && child.classList && child.classList.contains('mention-pill')) {
      child.remove();
      event.preventDefault();
      updateComposerState();
    }
  }
}

function normalizeComposer() {
  if (composerInput.textContent === '\n') {
    composerInput.textContent = '';
  }
}

function updateComposerState() {
  const { text } = extractComposerPayload();
  const trimmed = text.trim();
  const busy = isConversationStreaming(activeConversationId);
  sendButton.disabled = !trimmed || busy;
  if (stopButton) {
    stopButton.hidden = !busy;
  }

  const mention = detectMentionState();
  if (mention) {
    mentionState = mention;
    showMentionPopover(mention.query);
  } else {
    mentionState = null;
    hideMentionPopover();
  }
}

function detectMentionState() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (!range.collapsed || !composerInput.contains(range.startContainer)) {
    return null;
  }

  let container = range.startContainer;
  let offset = range.startOffset;

  if (container.nodeType !== Node.TEXT_NODE) {
    if (container.nodeType === Node.ELEMENT_NODE && offset > 0) {
      const previous = container.childNodes[offset - 1];
      if (previous && previous.nodeType === Node.TEXT_NODE) {
        container = previous;
        offset = previous.textContent.length;
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  const textBefore = container.textContent.slice(0, offset);
  const atIndex = textBefore.lastIndexOf('@');
  if (atIndex === -1) {
    return null;
  }
  if (atIndex > 0) {
    const prev = textBefore[atIndex - 1];
    if (prev && !/\s/.test(prev)) {
      return null;
    }
  }

  const query = textBefore.slice(atIndex + 1);
  if (/\s/.test(query) || query.includes('@')) {
    return null;
  }

  const mentionRange = range.cloneRange();
  mentionRange.setStart(container, atIndex);
  return { query, range: mentionRange };
}

function showMentionPopover(query) {
  if (!tabCache.length) {
    requestTabs();
  }
  const filtered = filterTabs(query);
  mentionSuggestions = filtered;
  mentionHighlightIndex = filtered.length ? 0 : -1;
  renderMentionList(filtered);
  mentionPopover.hidden = false;
}

function hideMentionPopover() {
  mentionPopover.hidden = true;
  mentionSuggestions = [];
  mentionHighlightIndex = -1;
}

function renderMentionList(tabs) {
  mentionList.textContent = '';
  mentionReloadButton.hidden = true;

  if (!tabs.length) {
    const empty = document.createElement('div');
    empty.className = 'mention-popover__empty';
    empty.textContent = tabCache.length ? i18n.t('mentionNoResults') : i18n.t('mentionLoading');
    mentionList.appendChild(empty);
    return;
  }

  tabs.forEach((tab, index) => {
    const item = document.createElement('li');
    item.className = 'mention-popover__item';
    if (index === mentionHighlightIndex) {
      item.classList.add('mention-popover__item--active');
    }
    item.dataset.tabId = String(tab.id);

    const icon = document.createElement('div');
    icon.className = 'mention-popover__item-icon';
    if (tab.favicon) {
      icon.style.backgroundImage = `url(${tab.favicon})`;
    }

    const title = document.createElement('div');
    title.className = 'mention-popover__item-title';
    title.textContent = tab.title || tab.url || 'Untitled';

    const url = document.createElement('div');
    url.className = 'mention-popover__item-url';
    url.textContent = tab.url || '';

    item.appendChild(icon);
    item.appendChild(title);
    item.appendChild(url);
    mentionList.appendChild(item);
  });
}

function moveMentionHighlight(step) {
  if (!mentionSuggestions.length) {
    return;
  }
  mentionHighlightIndex = (mentionHighlightIndex + step + mentionSuggestions.length) % mentionSuggestions.length;
  renderMentionList(mentionSuggestions);
}

function filterTabs(query) {
  if (!query) {
    return tabCache.slice(0, 10);
  }
  const lower = query.toLowerCase();
  return tabCache.filter((tab) => {
    const title = (tab.title || '').toLowerCase();
    const url = (tab.url || '').toLowerCase();
    return title.includes(lower) || url.includes(lower);
  }).slice(0, 10);
}

function requestTabs(force = false) {
  if (!force && tabCache.length) {
    return;
  }
  tabRequestId = generateId('tabs');
  sendMessageToBackground({
    type: 'sidebar:listTabs',
    requestId: tabRequestId
  }).catch((error) => {
    console.error('Failed to request tab list:', error);
  });
}

function handleTabResponse(message) {
  if (tabRequestId && message.requestId !== tabRequestId) {
    return;
  }
  if (message.error) {
    tabCache = [];
    mentionList.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'mention-popover__empty';
    empty.textContent = i18n.t('statusError');
    mentionList.appendChild(empty);
    mentionReloadButton.hidden = false;
    return;
  }

  tabCache = Array.isArray(message.tabs) ? message.tabs : [];
  if (mentionState) {
    showMentionPopover(mentionState.query);
  }
}

function insertMention(tabId) {
  const mention = mentionSuggestions.find((item) => item.id === tabId) || tabCache.find((item) => item.id === tabId);
  if (!mention) {
    return;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const currentMention = mentionState || detectMentionState();
  if (!currentMention) {
    return;
  }

  const { range } = currentMention;
  range.deleteContents();

  const pill = document.createElement('span');
  pill.className = 'mention-pill';
  pill.contentEditable = 'false';
  pill.dataset.tabId = String(mention.id);
  pill.dataset.title = mention.title;
  pill.textContent = mention.title;

  range.insertNode(pill);
  const space = document.createTextNode(' ');
  pill.after(space);

  const newRange = document.createRange();
  newRange.setStart(space, space.textContent.length);
  newRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(newRange);

  mentionState = null;
  hideMentionPopover();
  updateComposerState();
}

function insertQuoteBlock(text, source = {}) {
  removeExistingQuoteBlocks();

  const quote = document.createElement('div');
  quote.className = 'composer-quote';
  quote.contentEditable = 'false';
  quote.dataset.quoteText = text;
  if (source.title) {
    quote.dataset.quoteSourceTitle = source.title;
  }
  if (source.url) {
    quote.dataset.quoteSourceUrl = source.url;
  }

  const icon = document.createElement('span');
  icon.className = 'composer-quote__icon';
  icon.textContent = '❝';

  const body = document.createElement('div');
  body.className = 'composer-quote__body';

  if (source.title || source.url) {
    const meta = document.createElement('div');
    meta.className = 'composer-quote__meta';
    meta.textContent = source.title || source.url || '';
    body.appendChild(meta);
  }

  const content = document.createElement('div');
  content.className = 'composer-quote__content';
  content.textContent = text;
  body.appendChild(content);

  quote.appendChild(icon);
  quote.appendChild(body);

  composerInput.insertBefore(quote, composerInput.firstChild);
  const separator = document.createElement('br');
  composerInput.insertBefore(separator, quote.nextSibling);

  focusComposerAfterNode(separator);
  composerInput.focus({ preventScroll: true });
  updateComposerState();
}

function removeExistingQuoteBlocks() {
  const existing = composerInput.querySelectorAll('.composer-quote');
  existing.forEach((node) => {
    const next = node.nextSibling;
    node.remove();
    if (next && next.nodeName === 'BR') {
      next.remove();
    }
  });
}

function focusComposerAfterNode(node) {
  const range = document.createRange();
  const selection = window.getSelection();
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function extractComposerPayload() {
  const parts = [];
  const quotes = [];
  composerInput.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        parts.push({ type: 'text', value: node.textContent });
      }
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.classList.contains('composer-quote')) {
        quotes.push({
          text: node.dataset.quoteText || node.textContent.trim(),
          sourceTitle: node.dataset.quoteSourceTitle || '',
          sourceUrl: node.dataset.quoteSourceUrl || ''
        });
        return;
      }

      if (node.classList.contains('mention-pill')) {
        const tabId = Number(node.dataset.tabId);
        if (!Number.isNaN(tabId)) {
          parts.push({
            type: 'mention',
            tabId,
            title: node.dataset.title || node.textContent.replace(/^@/, '')
          });
        }
        return;
      }

      if (node.tagName === 'BR') {
        parts.push({ type: 'text', value: '\n' });
        return;
      }

      if (node.textContent) {
        parts.push({ type: 'text', value: node.textContent });
      }
    }
  });

  const merged = mergeTextParts(parts);
  const text = merged.map((part) => (part.type === 'mention' ? `@${part.title}` : part.value)).join('');
  const mentions = merged.filter((part) => part.type === 'mention').map((part) => ({
    tabId: part.tabId,
    title: part.title
  }));

  return { parts: merged, text, mentions, quotes };
}

function mergeTextParts(parts) {
  const result = [];
  parts.forEach((part) => {
    if (part.type === 'text') {
      if (result.length && result[result.length - 1].type === 'text') {
        result[result.length - 1].value += part.value;
      } else {
        result.push({ type: 'text', value: part.value });
      }
    } else {
      result.push(part);
    }
  });
  return result;
}

function clearComposer() {
  composerInput.innerHTML = '';
  updateComposerState();
}

async function sendMessage() {
  if (activeRequest) {
    return;
  }

  const { parts, text, mentions, quotes } = extractComposerPayload();
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  ensureActiveConversation();
  const conversationId = activeConversationId;
  const history = conversation.filter((item) => item.role === 'user' || item.role === 'assistant').map((item) => ({
    role: item.role,
    content: item.content
  }));

  const timestamp = Date.now();
  const userMessage = {
    id: generateId('user'),
    role: 'user',
    content: text,
    parts,
    mentions,
    quotes,
    pending: false,
    timestamp
  };

  const assistantMessage = {
    id: generateId('assistant'),
    role: 'assistant',
    content: '',
    pending: true,
    timestamp
  };

  const requestId = generateId('req');

  commitHistoryState((draft) => {
    const conversationEntry = draft.conversations.find((item) => item.id === conversationId);
    if (!conversationEntry) {
      return;
    }
    conversationEntry.messages.push(userMessage, assistantMessage);
    clipMessages(conversationEntry.messages);
    if (!conversationEntry.title) {
      conversationEntry.title = deriveConversationTitle(conversationEntry.messages);
    }
    conversationEntry.updatedAt = Date.now();
    draft.activeConversationId = conversationEntry.id;
  });

  activeRequest = {
    requestId,
    assistantId: assistantMessage.id,
    conversationId
  };

  setStatus(i18n.t('aiTyping'));
  sendButton.disabled = true;
  scrollToBottom();

  try {
    await sendMessageToBackground({
      type: 'sidebar:sendMessage',
      requestId,
      payload: {
        message: trimmed,
        quotes,
        mentions,
        history,
        responseLanguage,
        systemPrompt: null,
        conversationId
      }
    });
  } catch (error) {
    console.error('Failed to send message to background:', error);
    const errorText = i18n.t('statusError');
    updateAssistantMessage(conversationId, assistantMessage.id, () => errorText, {
      pending: false,
      errorCode: 'port_disconnected'
    });
    finalizeActiveRequest(true, errorText);
  }

  clearComposer();
  closeHistoryPanel();
}

function handleStopClick() {
  if (!activeRequest) {
    return;
  }

  const { requestId } = activeRequest;
  cancelActiveRequest();

  sendMessageToBackground({
    type: 'sidebar:cancelRequest',
    requestId
  }).catch((error) => {
    console.warn('Failed to cancel active request:', error);
  });
}

function cancelActiveRequest() {
  if (!activeRequest) {
    return;
  }

  const { conversationId, assistantId } = activeRequest;

  updateAssistantMessage(conversationId, assistantId, (current) => current, {
    pending: false,
    flag: 'cancelled'
  });

  finalizeActiveRequest(false);
}

function handleChatChunk(message) {
  if (!activeRequest || message.requestId !== activeRequest.requestId) {
    return;
  }
  const chunk = message.chunk || '';
  if (!chunk) {
    return;
  }

  const conversationId = activeRequest.conversationId;
  updateAssistantMessage(conversationId, activeRequest.assistantId, (current) => current + chunk, {
    pending: true,
    throttle: true
  });
}

function handleChatDone(message) {
  if (!activeRequest || message.requestId !== activeRequest.requestId) {
    return;
  }
  const conversationId = activeRequest.conversationId;
  const finalText = message.finalText || '';
  updateAssistantMessage(conversationId, activeRequest.assistantId, () => finalText, {
    pending: false
  });
  finalizeActiveRequest();
}

function handleChatError(message) {
  if (!activeRequest || message.requestId !== activeRequest.requestId) {
    return;
  }
  const errorMessage = getErrorMessage(message.code) || message.error || i18n.t('streamingError');
  const conversationId = activeRequest.conversationId;
  updateAssistantMessage(conversationId, activeRequest.assistantId, () => errorMessage, {
    pending: false,
    errorCode: message.code || 'unknown'
  });
  finalizeActiveRequest(true, conversationId === activeConversationId ? errorMessage : '');
}

function updateAssistantMessage(conversationId, messageId, updater, options = {}) {
  const { pending = false, errorCode = null, throttle = false, flag = null } = options;

  commitHistoryState((draft) => {
    const targetConversation = draft.conversations.find((item) => item.id === conversationId);
    if (!targetConversation) {
      return;
    }
    const messageEntry = targetConversation.messages.find((item) => item.id === messageId);
    if (!messageEntry) {
      return;
    }
    const previous = messageEntry.content || '';
    messageEntry.content = typeof updater === 'function' ? updater(previous) : updater;
    messageEntry.pending = pending;
    messageEntry.errorCode = errorCode;
    if (flag) {
      messageEntry.meta = Object.assign({}, messageEntry.meta, { [flag]: true });
    }
    messageEntry.timestamp = Date.now();
    targetConversation.updatedAt = Date.now();
  }, { refreshHistory: true, throttle });
}

function finalizeActiveRequest(hasError = false, errorText = '') {
  const previousRequest = activeRequest;
  activeRequest = null;
  if (previousRequest && previousRequest.conversationId && previousRequest.conversationId !== activeConversationId) {
    updateStatusIndicators();
    queuePersistHistoryState();
    return;
  }
  if (hasError && errorText) {
    setStatus(errorText, true);
  } else {
    setStatus('', false);
  }
  updateComposerState();
  queuePersistHistoryState();
}

function setStatus(text, isError = false) {
  statusText.textContent = text || '';
  statusText.classList.toggle('composer__status--error', Boolean(text && isError));
  if (stopButton) {
    stopButton.hidden = !isConversationStreaming(activeConversationId);
  }
}

function getErrorMessage(code) {
  switch (code) {
    case 'tab_unavailable':
      return i18n.t('tabClosedError');
    case 'context_unavailable':
      return i18n.t('contextFetchError');
    case 'ai_error':
      return i18n.t('streamingError');
    default:
      return null;
  }
}

function startNewChat() {
  if (activeRequest) {
    const { requestId } = activeRequest;
    cancelActiveRequest();
    if (requestId) {
      sendMessageToBackground({
        type: 'sidebar:cancelRequest',
        requestId,
        reason: 'new_chat'
      }).catch((error) => {
        console.warn('Failed to cancel request before starting new chat:', error);
      });
    }
  }

  activeRequest = null;

  commitHistoryState((draft) => {
    const conversationEntry = createConversation();
    draft.conversations.push(conversationEntry);
    draft.activeConversationId = conversationEntry.id;
  });
  updateStatusIndicators();
  clearComposer();
  closeHistoryPanel();
}

function isScrolledToBottom(container) {
  const threshold = 24;
  return container.scrollTop >= container.scrollHeight - container.clientHeight - threshold;
}

function scrollToBottom() {
  chatLog.scrollTop = chatLog.scrollHeight;
}

function moveCaretToEnd(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function generateId(prefix) {
  if (crypto?.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function toggleHistoryPanel() {
  if (isHistoryPanelOpen) {
    closeHistoryPanel();
  } else {
    openHistoryPanel();
  }
}

function openHistoryPanel() {
  if (isHistoryPanelOpen) {
    return;
  }
  isHistoryPanelOpen = true;
  sidebarRoot.classList.add('sidebar--history-open');
  if (historyPanel) {
    historyPanel.setAttribute('aria-hidden', 'false');
  }
  if (historyOverlay) {
    historyOverlay.hidden = false;
    requestAnimationFrame(() => {
      historyOverlay.classList.add('history-overlay--visible');
    });
  }
}

function closeHistoryPanel() {
  if (!isHistoryPanelOpen) {
    return;
  }
  isHistoryPanelOpen = false;
  sidebarRoot.classList.remove('sidebar--history-open');
  if (historyPanel) {
    historyPanel.setAttribute('aria-hidden', 'true');
  }
  if (historyOverlay) {
    const onTransitionEnd = () => {
      historyOverlay.hidden = true;
      historyOverlay.removeEventListener('transitionend', onTransitionEnd);
    };
    historyOverlay.classList.remove('history-overlay--visible');
    if (getComputedStyle(historyOverlay).transitionDuration === '0s') {
      historyOverlay.hidden = true;
    } else {
      historyOverlay.addEventListener('transitionend', onTransitionEnd);
    }
  }
}
