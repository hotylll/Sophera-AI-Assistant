// AI Text Assistant - Background Service Worker
// Handles Chrome Built-in AI API calls

console.log('AI Text Assistant: Background service worker started');

const OFFSCREEN_DOCUMENT_PATH = 'ui/offscreen.html';
const OFFSCREEN_DOCUMENT_URL = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
const SIDEBAR_PORT_NAME = 'ai-sidebar';
const CHAT_STREAM_PORT_NAME = 'ai-chat-stream';
const CHAT_MAX_CONTEXT_CHARS = 12000;
const DEFAULT_CHAT_SYSTEM_PROMPT = [
  '# Role: Helpful Browser Companion',
  '',
  'You live inside a Chrome extension sidebar and help users with research, reading, and writing tasks.',
  'Provide concise, well-structured answers and use bullet points or paragraphs when appropriate.',
  'When website context is supplied, ground your response in that information and mention the source naturally.',
  'If the context does not contain an answer, say so and offer useful guidance.',
  'Avoid fabricating details and keep a friendly, professional tone.'
].join('\n');

const sidebarPorts = new Set();
const activeChatStreams = new Map();
const pendingSidebarQuotes = [];

function generateId(prefix) {
  if (self.crypto?.randomUUID) {
    return `${prefix}_${self.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

chrome.action.onClicked.addListener((tab) => {
  if (!chrome.sidePanel?.open) {
    console.warn('Side panel API unavailable.');
    return;
  }

  if (chrome.sidePanel.setOptions && tab?.id != null) {
    chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: 'ui/sidebar.html',
      enabled: true
    }).catch((error) => {
      console.warn('Failed to configure side panel options:', error);
    });
  }

  const targetWindowId = tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
  chrome.sidePanel.open({ windowId: targetWindowId }).catch((error) => {
    console.error('Failed to open side panel:', error);
  });
});

const DEFAULT_ENHANCE_TEMPLATE_EN = [
  '# Role: AI Performance Coach',
  '',
  'Your task is to receive an initial prompt from the `<INPUT>`. Treat this prompt as your "opening line" in a conversation with another AI. Your entire output must be designed to guide that AI to produce a longer, more specific, and more in-depth answer.',
  '',
  '## Operation Guidelines:',
  '1. **Use `<INPUT>` as the Start**: Begin your output with the exact text content of the `<INPUT>`.',
  '2. **Append Follow-up Probes**: Immediately after the `<INPUT>` text, append a series of deep, guiding follow-up questions that force the AI to elaborate.',
  '3. **Types of Probes (sources for longer, more specific responses)**:',
  '   - **Dig Deeper**: "...Please analyze the root causes behind this."',
  '   - **Demand Details**: "...Provide at least three specific examples or data points to support your view."',
  '   - **Explore Boundaries**: "...How would this differ in the context of...? What are its limitations?"',
  '   - **Require Structure**: "...Provide a step-by-step guide."',
  '   - **Set Standards**: "...I need an expert-level, detailed analysis."',
  '4. **Maintain a Conversational Tone**: Sound like a demanding, curious user speaking to an AI.',
  '5. **Example**:',
  '   - `<INPUT>`: "Explain black holes."',
  '   - **Output**: "Explain black holes. Please ensure your explanation goes beyond the basic definition to deeply cover the event horizon, the singularity, and provide at least two concrete examples of how they form. I need a comprehensive answer that a layperson can fully understand."',
  '',
  '## Output Rules:',
  '- Output only the combined new prompt (i.e., `<INPUT>` text + your guiding probes).',
  '- Do not include any explanation or commentary on your process.',
  '- Do not repeat this prompt (the "Role: AI Performance Coach..." directive) itself.',
  '- Do not output the `<INPUT>` tags.',
  '',
  '## Prompt to be Optimized:',
  "<INPUT>${action.selectedText ?? ''}</INPUT>"
].join('\n');
let creatingOffscreenDocument = null;
let lastOffscreenInitTime = null;
const OFFSCREEN_MAX_AGE = 3 * 60 * 1000; // 3 minutes - refresh offscreen document periodically
const OFFSCREEN_CREATE_TIMEOUT = 10000; // 10 seconds timeout for creating offscreen document

// Helper function to add timeout to a promise
function withTimeout(promise, timeoutMs, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

async function closeOffscreenDocument() {
  try {
    const hasDoc = await hasOffscreenDocument();
    if (hasDoc) {
      console.log('Closing existing offscreen document...');
      await chrome.offscreen.closeDocument();
      console.log('Offscreen document closed');
    }
  } catch (error) {
    console.warn('Failed to close offscreen document:', error);
  }
}

async function hasOffscreenDocument() {
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [OFFSCREEN_DOCUMENT_URL]
    });
    return contexts.length > 0;
  }

  const matchedClients = await clients.matchAll();
  return matchedClients.some((client) => client.url === OFFSCREEN_DOCUMENT_URL);
}

async function ensureOffscreenDocument() {
  console.log('ensureOffscreenDocument called');

  // Check if we need to force refresh (service worker restart or expiration)
  const needsRefresh = !lastOffscreenInitTime ||
    (Date.now() - lastOffscreenInitTime) > OFFSCREEN_MAX_AGE;

  if (needsRefresh) {
    console.log(needsRefresh && !lastOffscreenInitTime
      ? 'Service worker restarted, forcing offscreen document recreation'
      : `Offscreen document expired (age: ${Math.round((Date.now() - lastOffscreenInitTime) / 1000)}s), refreshing...`
    );

    // Force close and recreate
    await closeOffscreenDocument();
    lastOffscreenInitTime = null;
    creatingOffscreenDocument = null;
  } else if (await hasOffscreenDocument()) {
    console.log('Offscreen document already exists and is valid');
    return;
  }

  if (!creatingOffscreenDocument) {
    console.log('Creating new offscreen document...');
    creatingOffscreenDocument = withTimeout(
      chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ['DOM_PARSER'],
        justification: 'Run Chrome built-in AI APIs in a DOM-enabled context.'
      }),
      OFFSCREEN_CREATE_TIMEOUT,
      'Offscreen document creation timed out after 10 seconds'
    ).catch((error) => {
      console.error('Failed to create offscreen document:', error);
      creatingOffscreenDocument = null;
      lastOffscreenInitTime = null;
      throw error;
    });
  }

  await creatingOffscreenDocument;
  creatingOffscreenDocument = null;
  lastOffscreenInitTime = Date.now();
  console.log('Offscreen document created successfully');

  // Health check: verify offscreen document is responsive
  try {
    console.log('Performing health check on offscreen document...');
    await withTimeout(
      testOffscreenConnection(),
      3000,
      'Offscreen document health check timed out'
    );
    console.log('Offscreen document health check passed');
  } catch (error) {
    console.error('Offscreen document health check failed:', error);
    // Reset state to force recreation on next call
    lastOffscreenInitTime = null;
    throw error;
  }
}

async function testOffscreenConnection() {
  return new Promise((resolve, reject) => {
    const testId = `health-check-${Date.now()}`;
    const timeout = setTimeout(() => {
      reject(new Error('Health check response timeout'));
    }, 2500);

    const listener = (message, sender, sendResponse) => {
      if (message?.type === 'offscreen:pong' && message?.testId === testId) {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);
        resolve();
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    chrome.runtime.sendMessage({
      target: 'offscreen',
      action: '__healthCheck',
      testId
    }).catch((error) => {
      clearTimeout(timeout);
      chrome.runtime.onMessage.removeListener(listener);
      reject(error);
    });
  });
}

async function delegateAIAction(action, text, options = {}) {
  await ensureOffscreenDocument();
  return chrome.runtime.sendMessage({
    target: 'offscreen',
    action,
    text,
    options
  });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === SIDEBAR_PORT_NAME) {
    sidebarPorts.add(port);

    port.onMessage.addListener((message) => {
      handleSidebarPortMessage(port, message).catch((error) => {
        console.error('Sidebar message handling failed:', error);
        if (message?.requestId) {
          port.postMessage({
            type: 'chat:error',
            requestId: message.requestId,
            code: error.code || 'internal_error',
            error: error.message || 'Unknown error'
          });
        }
      });
    });

    port.onDisconnect.addListener(() => {
      sidebarPorts.delete(port);
      for (const [requestId, stream] of activeChatStreams.entries()) {
        if (stream.sidebarPort === port) {
          try {
            stream.chatPort?.disconnect();
          } catch (error) {
            console.warn('Failed to disconnect chat port:', error);
          }
          activeChatStreams.delete(requestId);
        }
      }
    });

    port.postMessage({ type: 'sidebar:ready' });
    flushPendingSidebarQuotes();
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === 'offscreen') {
    // Message intended for the offscreen document; ignore in service worker.
    return false;
  }

  if (message?.target === 'background' && message?.action === 'getStoredValues') {
    chrome.storage.local.get(message.keys || [])
      .then((values) => {
        sendResponse({ success: true, values });
      })
      .catch((error) => {
        console.error('Failed to load stored values:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  console.log('Received message:', message.action);

  if (message.action === 'quoteToSidebar') {
    handleQuoteToSidebar(message, sender)
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        console.error('Failed to handle quoteToSidebar:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // Handle different actions
  switch (message.action) {
    case 'translate':
      delegateAIAction('translate', message.text, message.options)
        .then(sendResponse)
        .catch((error) => {
          console.error('Translation error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep channel open for async response

    case 'summarize':
      delegateAIAction('summarize', message.text, message.options)
        .then(sendResponse)
        .catch((error) => {
          console.error('Summarization error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep channel open for async response

    case 'rewrite':
      delegateAIAction('rewrite', message.text, message.options)
        .then(sendResponse)
        .catch((error) => {
          console.error('Rewrite error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'askAI':
      delegateAIAction('askAI', message.text, message.options)
        .then(sendResponse)
        .catch((error) => {
          console.error('Ask AI error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'enhance':
      delegateAIAction('enhance', message.text, message.options)
        .then(sendResponse)
        .catch((error) => {
          console.error('Enhance error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'inPlaceTranslate':
      delegateAIAction('inPlaceTranslate', message.text, message.options)
        .then(sendResponse)
        .catch((error) => {
          console.error('In-place translation error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'search':
      handleSearch(message.text);
      return false;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
      return false;
  }
});

async function handleQuoteToSidebar(message, sender) {
  const quoteText = (message?.text || '').trim();
  if (!quoteText) {
    return;
  }

  const source = {
    url: message?.source?.url || sender?.tab?.url || '',
    title: message?.source?.title || sender?.tab?.title || ''
  };

  const quoteId = message?.quoteId || generateId('quote');

  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;

  try {
    if (tabId != null && chrome.sidePanel?.setOptions) {
      await chrome.sidePanel.setOptions({
        tabId,
        path: 'ui/sidebar.html',
        enabled: true
      });
    }
  } catch (error) {
    console.warn('Failed to set side panel options:', error);
  }

  try {
    if (chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ windowId });
    }
  } catch (error) {
    console.warn('Failed to open side panel:', error);
  }

  const payload = {
    target: 'sidebar',
    type: 'sidebar:quote',
    quoteId,
    text: quoteText,
    source
  };

  const delivered = await broadcastSidebarQuote(payload);
  if (!delivered) {
    queueSidebarQuote(payload);
  }
}

function queueSidebarQuote(payload) {
  pendingSidebarQuotes.push(payload);
  flushPendingSidebarQuotes();
}

async function flushPendingSidebarQuotes() {
  if (!pendingSidebarQuotes.length) {
    return;
  }

  const remaining = [];

  for (const payload of pendingSidebarQuotes) {
    const delivered = await broadcastSidebarQuote(payload);
    if (!delivered) {
      let deliveredViaPort = false;
      for (const port of sidebarPorts) {
        try {
          port.postMessage(payload);
          deliveredViaPort = true;
        } catch (error) {
          console.warn('Failed to deliver quote payload to sidebar via port:', error);
        }
      }
      if (!deliveredViaPort) {
        remaining.push(payload);
      }
    }
  }

  pendingSidebarQuotes.length = 0;
  pendingSidebarQuotes.push(...remaining);
}

async function handleSidebarPortMessage(port, message) {
  if (!message || typeof message !== 'object') {
    return;
  }

  switch (message.type) {
    case 'sidebar:listTabs':
      await respondWithTabList(port, message);
      break;
    case 'sidebar:sendMessage':
      await handleSidebarChatRequest(port, message);
      break;
    case 'sidebar:cancelRequest':
      cancelActiveStream(message.requestId, 'cancelled_by_user');
      break;
    default:
      break;
  }
}

async function broadcastSidebarQuote(payload) {
  try {
    const response = await chrome.runtime.sendMessage(payload);
    if (response && response.success) {
      return true;
    }
  } catch (error) {
    if (!error || !String(error.message || error).includes('Receiving end does not exist')) {
      console.warn('Broadcast to sidebar failed:', error);
    }
  }
  return false;
}

async function respondWithTabList(port, message) {
  const requestId = message.requestId;
  try {
    const queryOptions = message.windowId != null ? { windowId: message.windowId } : { currentWindow: true };
    const tabs = await chrome.tabs.query(queryOptions);
    const filtered = tabs
      .filter((tab) => tab?.id != null && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://'))
      .map((tab) => ({
        id: tab.id,
        title: tab.title || tab.url || 'Untitled',
        url: tab.url,
        favicon: tab.favIconUrl || '',
        windowId: tab.windowId,
        active: Boolean(tab.active)
      }));

    port.postMessage({
      type: 'sidebar:listTabs:response',
      requestId,
      tabs: filtered
    });
  } catch (error) {
    console.error('Failed to enumerate tabs:', error);
    port.postMessage({
      type: 'sidebar:listTabs:response',
      requestId,
      error: error.message || 'Failed to enumerate tabs'
    });
  }
}

async function handleSidebarChatRequest(port, message) {
  const { requestId, payload } = message;
  console.log(`handleSidebarChatRequest: requestId=${requestId}, message="${(payload?.message || '').slice(0, 50)}..."`);

  if (!payload || !payload.message || !payload.message.trim()) {
    console.warn('Invalid chat request: message is empty');
    port.postMessage({
      type: 'chat:error',
      requestId,
      code: 'invalid_request',
      error: 'Message cannot be empty.'
    });
    return;
  }

  try {
    console.log('Collecting mention contexts...');
    const contexts = await collectMentionContexts(payload.mentions || []);
    const quotes = Array.isArray(payload.quotes) ? payload.quotes : [];
    console.log(`Collected ${contexts.length} contexts, ${quotes.length} quotes`);

    const chatPayload = {
      message: payload.message,
      history: Array.isArray(payload.history) ? payload.history : [],
      responseLanguage: payload.responseLanguage,
      contexts,
      quotes,
      systemPrompt: payload.systemPrompt || DEFAULT_CHAT_SYSTEM_PROMPT,
      forceDownload: payload.forceDownload === true
    };

    console.log('Starting chat stream...');
    const chatPort = await startChatStream(port, requestId, chatPayload);
    activeChatStreams.set(requestId, { sidebarPort: port, chatPort });
    console.log('Chat stream started successfully');
  } catch (error) {
    console.error('Failed to start chat stream:', error);
    port.postMessage({
      type: 'chat:error',
      requestId,
      code: error.code || 'context_error',
      error: error.message || 'Unable to prepare context.'
    });
  }
}

async function collectMentionContexts(mentions) {
  if (!Array.isArray(mentions) || mentions.length === 0) {
    return [];
  }

  const contexts = [];

  for (const mention of mentions) {
    if (!mention || typeof mention.tabId !== 'number') {
      continue;
    }

    const context = await fetchTabContext(mention.tabId);
    contexts.push({
      tabId: mention.tabId,
      title: context.title,
      url: context.url,
      content: context.content
    });
  }

  return contexts;
}

async function fetchTabContext(tabId) {
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch (error) {
    const err = new Error('Referenced tab is unavailable.');
    err.code = 'tab_unavailable';
    throw err;
  }

  if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    const err = new Error('Referenced tab cannot be accessed.');
    err.code = 'tab_unavailable';
    throw err;
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const title = document.title || '';
        const url = location.href;
        const bodyText = document.body ? document.body.innerText : '';
        return {
          title,
          url,
          content: bodyText
        };
      }
    });

    const content = truncateContext(result?.result?.content || '', CHAT_MAX_CONTEXT_CHARS);
    return {
      title: result?.result?.title || tab.title || 'Untitled',
      url: result?.result?.url || tab.url,
      content
    };
  } catch (error) {
    console.error('Failed to capture tab context:', error);
    const err = new Error('Unable to capture tab content.');
    err.code = 'context_unavailable';
    throw err;
  }
}

function truncateContext(content, limit) {
  if (!content) {
    return '';
  }
  if (content.length <= limit) {
    return content;
  }
  return `${content.slice(0, limit)}\n…`; // ellipsis to indicate truncation
}

async function startChatStream(sidebarPort, requestId, payload) {
  console.log(`startChatStream: requestId=${requestId}`);
  console.log('Ensuring offscreen document...');
  await ensureOffscreenDocument();
  console.log('Offscreen document ready');

  console.log('Creating chat port connection...');
  const chatPort = chrome.runtime.connect({ name: CHAT_STREAM_PORT_NAME });
  console.log('Chat port connected');

  const cleanup = () => {
    const stream = activeChatStreams.get(requestId);
    if (stream && stream.chatPort === chatPort) {
      activeChatStreams.delete(requestId);
    }
  };

  chatPort.onMessage.addListener((message) => {
    if (!message || message.requestId !== requestId) {
      return;
    }

    switch (message.type) {
      case 'chunk':
        sidebarPort.postMessage({ type: 'chat:chunk', requestId, chunk: message.chunk || '' });
        break;
      case 'done':
        console.log(`Chat stream completed: requestId=${requestId}`);
        cleanup();
        sidebarPort.postMessage({ type: 'chat:done', requestId, finalText: message.finalText || '' });
        chatPort.disconnect();
        break;
      case 'error':
        console.error(`Chat stream error: requestId=${requestId}, code=${message.code}`, message.error);
        cleanup();
        sidebarPort.postMessage({
          type: 'chat:error',
          requestId,
          code: message.code || 'ai_error',
          error: message.error || 'AI response failed.'
        });
        chatPort.disconnect();
        break;
      default:
        break;
    }
  });

  chatPort.onDisconnect.addListener(() => {
    console.warn(`Chat port disconnected: requestId=${requestId}`);
    const stream = activeChatStreams.get(requestId);
    if (stream && stream.chatPort === chatPort) {
      activeChatStreams.delete(requestId);
      sidebarPort.postMessage({
        type: 'chat:error',
        requestId,
        code: 'stream_disconnected',
        error: 'Connection to AI service was lost.'
      });
    }
  });

  console.log(`Sending start message to offscreen: requestId=${requestId}`);
  chatPort.postMessage({
    type: 'start',
    requestId,
    payload
  });

  return chatPort;
}

function cancelActiveStream(requestId, reason) {
  const stream = activeChatStreams.get(requestId);
  if (!stream) {
    return;
  }

  try {
    stream.chatPort.postMessage({ type: 'cancel', requestId, reason });
  } catch (error) {
    console.warn('Failed to forward cancel message:', error);
  }

  try {
    stream.chatPort.disconnect();
  } catch (error) {
    console.warn('Failed to disconnect chat port during cancel:', error);
  }

  activeChatStreams.delete(requestId);
}

// ============= Utility Functions =============

// Search using default search engine
function handleSearch(text) {
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
  chrome.tabs.create({ url: searchUrl });
}

// speak feature removed from background

// ============= Installation & Updates =============

chrome.runtime.onInstalled.addListener((details) => {
  const cherryEnhanceTemplateEn = DEFAULT_ENHANCE_TEMPLATE_EN;

  if (details.reason === 'install') {
    console.log('AI Text Assistant installed!');

    // Set default options
    chrome.storage.local.set({
      uiLanguage: 'en',
      responseLanguage: 'auto',
      inputTranslationTargetLanguage: 'en',
      summaryType: 'key-points',
      summaryLength: 'medium',
      summaryFormat: 'markdown',
      rewritePrompt: 'Please rewrite the following text to make it clearer and more concise:',
      enhanceTemplate: cherryEnhanceTemplateEn
    });

    // Open options page
    chrome.runtime.openOptionsPage();
  } else if (details.reason === 'update') {
    console.log('AI Text Assistant updated to version', chrome.runtime.getManifest().version);

    chrome.storage.local.get({ enhanceTemplate: '' }).then(({ enhanceTemplate }) => {
      const legacyTemplates = [
        'Improve and enhance this prompt to make it more effective:',
        'Your task is to refine the following user prompt. Provide only the improved prompt as your response. For example, if the input is "bing key", a good output would be "How to get a Bing API key for free?"\n\nOriginal prompt to enhance:',
        '请优化下面的提示词，仅返回优化后的提示词作为回答。比如输入“bing key”，合适的输出是“如何免费获取 Bing API key？”。\n\n需要增强的原始提示词：',
        '请对用XML标签<INPUT>包裹的用户输入内容进行优化或润色，并保持原内容的含义和完整性。要求：你的输出应当与用户输入内容的语言相同。；请不要包含对本提示词的任何解释，直接给出回复；请不要输出XML标签，直接输出优化后的内容: ',
        'Please optimize or refine the user input wrapped in the XML tag <INPUT> while preserving the original meaning and completeness. Requirements: your output must use the same language as the user input; do not include any explanation about this prompt, respond directly; do not output any XML tags, return only the optimized content:',
        DEFAULT_ENHANCE_TEMPLATE_EN
      ];

      const normalized = (enhanceTemplate || '').trim();
      if (!normalized || legacyTemplates.includes(normalized)) {
        chrome.storage.local.set({ enhanceTemplate: cherryEnhanceTemplateEn });
      }
    });
  }
});
