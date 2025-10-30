// AI Text Assistant - Content Script
// Monitors text selection and displays floating toolbar

let toolbar = null;
let selectedText = '';
let selectionRange = null;
let toolbarUtilitySection = null;
let activeResultPopup = null;
let activeResultAnchor = null;
let currentResponseLanguage = 'auto';
let languageModelReady = false;
let languageModelPreparation = null;
let lastTargetInput = null;
let lastTargetSelection = null;

const IN_PLACE_TRANSLATION_ACTION = 'inPlaceTranslate';
const TRIPLE_SPACE_THRESHOLD = 3;
const TRIPLE_SPACE_WINDOW_MS = 500;
const INPUT_TRANSLATE_LOADING_CLASS = 'ai-ipt-translate--loading';
const INPUT_TRANSLATE_ERROR_CLASS = 'ai-ipt-translate--error';
const INPUT_TRANSLATE_ERROR_DURATION = 1800;
const NON_TRANSLATABLE_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'date',
  'datetime-local',
  'file',
  'hidden',
  'image',
  'month',
  'number',
  'password',
  'radio',
  'range',
  'reset',
  'submit',
  'tel',
  'time',
  'url',
  'email',
  'week'
]);

const inputTranslationStates = new WeakMap();
let inputTranslationStylesInjected = false;

const LANGUAGE_MODEL_ACTIONS = new Set(['rewrite', 'askAI', 'enhance']);
const LOCAL_ACTIONS = new Set(['copy', 'search', 'export']);

function actionUsesLanguageModel(action) {
  return LANGUAGE_MODEL_ACTIONS.has(action);
}

const translations = {
  en: {
    translate: 'Translate',
    summarize: 'Summarize',
    rewrite: 'Rewrite',
    askAI: 'Ask AI',
  copy: 'Copy',
  search: 'Search',
  enhance: 'Enhance Prompt',
    export: 'Export',
    more: 'More',
    loading: 'Loading...',
    processing: 'AI is processing, please wait…',
    errorOccurred: 'An error occurred. Please try again.',
    copied: 'Copied to clipboard!',
    exported: 'Exported!',
    promptEnhanced: 'Prompt enhanced!',
    copyFailed: 'Copy failed: {error}',
    cannotReplace: 'Cannot replace text in this element',
    extensionUnavailable: 'AI assistant is unavailable. Please reload the extension and try again.',
    modelPreparing: 'Preparing AI model for first use…',
    modelDownloadFailed: 'Failed to prepare AI model. Please try again.',
    modelDownloadTimeout: 'AI model is still downloading. Please wait a moment and try again.',
    modelUserActivationRequired: 'Please click the button again to allow the AI model download.',
    modelUnavailable: 'AI model is not available on this device.',
    selectText: 'Please select some text first',
    resultCopy: 'Copy',
    resultReplace: 'Replace',
    close: 'Close'
  },
  zh_CN: {
    translate: 'AI翻译',
    summarize: '智能摘要',
    rewrite: '改写表达',
    askAI: 'AI问答',
  copy: '复制',
  search: '搜索',
  enhance: '提示词增强',
    export: '导出',
    more: '更多',
    loading: '加载中…',
    processing: 'AI正在处理中，请稍候…',
    errorOccurred: '发生错误，请重试。',
    copied: '已复制到剪贴板！',
    exported: '已导出！',
    promptEnhanced: '提示词已优化！',
    copyFailed: '复制失败：{error}',
    cannotReplace: '无法在此元素中替换文本',
    extensionUnavailable: 'AI 助手不可用，请重新加载扩展后重试。',
    modelPreparing: '正在准备 AI 模型，请稍候…',
    modelDownloadFailed: 'AI 模型准备失败，请重试。',
    modelDownloadTimeout: 'AI 模型仍在下载，请稍候再试。',
    modelUserActivationRequired: '需要再次点击以允许下载 AI 模型。',
    modelUnavailable: '该设备暂不支持此 AI 模型。',
    selectText: '请先选择文本',
    resultCopy: '复制',
    resultReplace: '替换',
    close: '关闭'
  }
};

let currentLanguage = 'en';

function formatMessage(template, replacements = {}) {
  return Object.keys(replacements).reduce((result, key) => {
    const value = replacements[key];
    return result.replace(new RegExp(`{${key}}`, 'g'), value);
  }, template);
}

function t(key, replacements) {
  const langTable = translations[currentLanguage] || translations.en;
  const message = langTable[key] || translations.en[key] || key;
  return replacements ? formatMessage(message, replacements) : message;
}

function setLanguage(lang) {
  const target = translations[lang] ? lang : 'en';
  if (target === currentLanguage) {
    return;
  }
  currentLanguage = target;

  if (toolbar) {
    const selection = window.getSelection();
    hideToolbar();
    if (selection && selection.toString().trim().length > 0) {
      showToolbar(selection);
    }
  }
}

function setResponseLanguage(lang) {
  currentResponseLanguage = lang || 'auto';
}

function resolveOutputLanguage(code) {
  if (!code || code === 'auto') {
    return 'en';
  }
  if (code === 'zh_CN' || code === 'zh-CN' || code === 'zh') {
    return 'en';
  }
  if (code === 'es' || code === 'ja') {
    return code;
  }
  if (code.startsWith('es')) {
    return 'es';
  }
  if (code.startsWith('ja')) {
    return 'ja';
  }
  return 'en';
}

chrome.storage.local.get({ uiLanguage: 'en', responseLanguage: 'auto' }, ({ uiLanguage, responseLanguage }) => {
  setLanguage(uiLanguage);
  setResponseLanguage(responseLanguage);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.action === 'reloadSettings') {
    chrome.storage.local.get({
      uiLanguage: currentLanguage,
      responseLanguage: currentResponseLanguage
    }, ({ uiLanguage, responseLanguage }) => {
      setLanguage(uiLanguage);
      setResponseLanguage(responseLanguage);
    });
  }
});

// Listen for text selection
document.addEventListener('mouseup', handleTextSelection);
document.addEventListener('selectionchange', handleSelectionChange);
document.addEventListener('focusin', handleInputTranslationFocus, true);
document.addEventListener('focusout', handleInputTranslationBlur, true);
document.addEventListener('keydown', handleTripleSpaceKeydown, true);

function handleTextSelection(e) {
  if (toolbar && toolbar.contains(e.target)) {
    return;
  }

  if (activeResultPopup && activeResultPopup.contains(e.target)) {
    return;
  }

  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 0) {
      selectedText = text;
      selectionRange = selection.getRangeAt(0);
      showToolbar(selection);
    } else {
      hideToolbar();
    }
  }, 10);
}

function handleSelectionChange() {
  const selection = window.getSelection();
  if (selection.toString().trim().length === 0) {
    const activeElement = document.activeElement;
    if (activeElement && toolbar && toolbar.contains(activeElement)) {
      return;
    }
    if (activeResultPopup && activeResultPopup.contains(activeElement)) {
      return;
    }
    if (toolbar && toolbar.matches(':hover')) {
      return;
    }
    if (activeResultPopup && activeResultPopup.matches(':hover')) {
      return;
    }
    hideToolbar();
  }
}

function showToolbar(selection) {
  hideToolbar();

  toolbar = document.createElement('div');
  toolbar.id = 'ai-text-assistant-toolbar';
  toolbar.className = 'ai-toolbar';

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  toolbar.style.position = 'fixed';
  toolbar.style.left = `${rect.left + (rect.width / 2)}px`;
  toolbar.style.top = `${rect.top - 50}px`;
  toolbar.style.transform = 'translateX(-50%)';
  toolbar.style.zIndex = '999999';

  const coreButtons = [
    { id: 'translate', label: t('translate'), icon: '🌐' },
    { id: 'summarize', label: t('summarize'), icon: '📝' },
    { id: 'rewrite', label: t('rewrite'), icon: '✍️' },
    { id: 'askAI', label: t('askAI'), icon: '🤖' }
  ];

  const utilityButtons = [
    { id: 'copy', label: t('copy'), icon: '📋' },
    { id: 'search', label: t('search'), icon: '🔍' }
  ];

  const advancedButtons = [
    { id: 'enhance', label: t('enhance'), icon: '✨' },
    { id: 'export', label: t('export'), icon: '💾' }
  ];

  // Core buttons section
  const coreSection = document.createElement('div');
  coreSection.className = 'toolbar-section core-section';
  coreButtons.forEach(btn => {
    coreSection.appendChild(createButton(btn));
  });
  toolbar.appendChild(coreSection);

  // More button to toggle utility section
  const moreBtn = createButton({
    id: 'more',
    label: t('more'),
    icon: '⋯'
  });
  moreBtn.classList.add('more-btn');
  toolbar.appendChild(moreBtn);

  // Utility section (initially hidden)
  const utilitySection = document.createElement('div');
  utilitySection.className = 'toolbar-section utility-section hidden';
  utilityButtons.forEach(btn => {
    utilitySection.appendChild(createButton(btn));
  });
  advancedButtons.forEach(btn => {
    utilitySection.appendChild(createButton(btn));
  });
  toolbar.appendChild(utilitySection);
  toolbarUtilitySection = utilitySection;

  document.body.appendChild(toolbar);
  adjustToolbarPosition();
}

function createButton({ id, label, icon }) {
  const button = document.createElement('button');
  button.className = 'toolbar-btn';
  button.dataset.action = id;
  button.title = label;

  const iconSpan = document.createElement('span');
  iconSpan.className = 'btn-icon';
  iconSpan.textContent = icon;

  const labelSpan = document.createElement('span');
  labelSpan.className = 'btn-label';
  labelSpan.textContent = label;

  button.appendChild(iconSpan);
  button.appendChild(labelSpan);

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    handleButtonClick(id, button);
  });

  return button;
}

function adjustToolbarPosition() {
  if (!toolbar) return;

  const rect = toolbar.getBoundingClientRect();

  if (rect.left < 10) {
    toolbar.style.left = '10px';
    toolbar.style.transform = 'none';
  } else if (rect.right > window.innerWidth - 10) {
    toolbar.style.left = `${window.innerWidth - rect.width - 10}px`;
    toolbar.style.transform = 'none';
  }

  if (rect.top < 10) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const selectionRect = range.getBoundingClientRect();
      toolbar.style.top = `${selectionRect.bottom + 10}px`;
    }
  }
}

function hideToolbar() {
  if (toolbar && toolbar.parentNode) {
    toolbar.parentNode.removeChild(toolbar);
    toolbar = null;
    toolbarUtilitySection = null;
  }
  removeActiveResultPopup();
  clearCachedInputTarget();
}

async function handleButtonClick(action, sourceButton) {
  if (action === 'more') {
    if (toolbarUtilitySection) {
      toolbarUtilitySection.classList.toggle('hidden');
    }
    return;
  }

  if (!selectedText) {
    showNotification(t('selectText'), 'error');
    return;
  }

  removeActiveResultPopup();
  showLoading();

  const activeElement = document.activeElement;
  const isEnhanceInInput = action === 'enhance' && activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
  cacheTargetInput(activeElement, action);

  let processingNotice = null;
  let processingTimeoutId;

  try {
    if (LOCAL_ACTIONS.has(action)) {
      switch (action) {
        case 'copy':
          handleCopy();
          return;
        case 'search':
          handleSearch();
          return;
        case 'export':
          handleExport();
          return;
        default:
          break;
      }
    }

    if (action === 'askAI') {
      await handleQuoteToSidebar(selectedText);
      hideLoading();
      hideToolbar();
      return;
    }

    if (actionUsesLanguageModel(action)) {
      await ensureLanguageModelReady();
    }

    processingTimeoutId = setTimeout(() => {
      processingNotice = showNotification(t('processing'), 'info', 0);
    }, 1500);

    const messagePayload = {
      action,
      text: selectedText,
      options: {
        responseLanguage: currentResponseLanguage
      }
    };

    const needsForceDownload = actionUsesLanguageModel(action) && languageModelReady === false;
    if (needsForceDownload) {
      messagePayload.options.forceDownload = true;
    }

    const response = await sendMessageToBackground(messagePayload);

    if (response && response.success) {
      showResult(response.result, action, sourceButton);
    } else {
      const errorMessage = response?.error || t('errorOccurred');
      handleActionError(new Error(errorMessage));
    }
  } catch (error) {
    console.error(`${action} action failed:`, error);
    handleActionError(error);
  } finally {
    if (processingTimeoutId) {
      clearTimeout(processingTimeoutId);
    }
    if (processingNotice) {
      processingNotice.remove();
    }
    hideLoading();
  }
}

async function handleQuoteToSidebar(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    showNotification(t('selectText'), 'error');
    return;
  }

  try {
    await chrome.runtime.sendMessage({
      action: 'quoteToSidebar',
      text: trimmed,
      source: {
        url: location.href,
        title: document.title || ''
      }
    }).catch((error) => {
      throw error;
    });
  } catch (error) {
    console.error('Failed to send quote to sidebar:', error);
    showNotification(t('errorOccurred'), 'error');
  }
}

function handleCopy() {
  navigator.clipboard.writeText(selectedText).then(() => {
    hideLoading();
    showNotification(t('copied'));
  }).catch(err => {
    hideLoading();
    showError(t('copyFailed', { error: err.message }));
  });
}

function handleSearch() {
  chrome.runtime.sendMessage({
    action: 'search',
    text: selectedText
  });
  hideLoading();
  hideToolbar();
}

// speak feature removed

function handleExport() {
  const blob = new Blob([selectedText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `text-export-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  hideLoading();
  showNotification(t('exported'));
}

function cacheTargetInput(element, action) {
  lastTargetInput = null;
  lastTargetSelection = null;

  if (!element || action !== 'enhance') {
    return;
  }

  if (!isEditableElement(element)) {
    return;
  }

  lastTargetInput = element;

  if ('selectionStart' in element && 'selectionEnd' in element) {
    lastTargetSelection = {
      start: element.selectionStart ?? 0,
      end: element.selectionEnd ?? element.selectionStart ?? 0
    };
  }
}

function applyResultToCachedInput(text) {
  if (!lastTargetInput || !document.contains(lastTargetInput)) {
    clearCachedInputTarget();
    return false;
  }

  if (!isEditableElement(lastTargetInput)) {
    clearCachedInputTarget();
    return false;
  }

  try {
    const target = lastTargetInput;
    const value = target.value ?? '';
    const selection = lastTargetSelection || {};
    const start = clampSelectionIndex(selection.start, value.length);
    const end = clampSelectionIndex(selection.end, value.length, start);
    const replacement = text ?? '';

    target.value = value.slice(0, start) + replacement + value.slice(end);

    const newPos = start + replacement.length;
    if (typeof target.setSelectionRange === 'function') {
      target.setSelectionRange(newPos, newPos);
    }
    if (typeof target.focus === 'function') {
      target.focus();
    }

    clearCachedInputTarget();
    return true;
  } catch (error) {
    console.error('Failed to apply result to input:', error);
    clearCachedInputTarget();
    return false;
  }
}

function replaceSelectedText(newText) {
  if (!selectionRange || !selectionRange.commonAncestorContainer) {
    return false;
  }

  try {
    selectionRange.deleteContents();
    selectionRange.insertNode(document.createTextNode(newText));
    return true;
  } catch (e) {
    console.error('Failed to replace text:', e);
    return false;
  }
}

function showLoading() {
  if (!toolbar) return;

  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'toolbar-loading';
  loadingDiv.textContent = t('loading');
  loadingDiv.id = 'toolbar-loading';
  toolbar.appendChild(loadingDiv);

  toolbar.querySelectorAll('.toolbar-btn').forEach(btn => {
    btn.disabled = true;
  });
}

function hideLoading() {
  const loading = document.getElementById('toolbar-loading');
  if (loading) loading.remove();

  if (toolbar) {
    toolbar.querySelectorAll('.toolbar-btn').forEach(btn => {
      btn.disabled = false;
    });
  }
}

function showResult(result, action, anchorElement) {
  removeActiveResultPopup();

  const popup = document.createElement('div');
  popup.className = 'ai-result-tooltip';
  popup.innerHTML = `
    <div class="ai-result-tooltip-arrow"></div>
    <div class="ai-result-tooltip-header">
      <span class="ai-result-tooltip-title">${escapeHtml(t(action))}</span>
      <button class="ai-result-tooltip-close" aria-label="${escapeHtml(t('close'))}">✕</button>
    </div>
    <div class="ai-result-tooltip-body">${formatResultContent(result)}</div>
    <div class="ai-result-tooltip-actions">
      <button class="ai-result-tooltip-btn result-copy">📋 ${escapeHtml(t('resultCopy'))}</button>
      <button class="ai-result-tooltip-btn result-replace">↩️ ${escapeHtml(t('resultReplace'))}</button>
    </div>
  `;

  document.body.appendChild(popup);
  activeResultPopup = popup;
  activeResultAnchor = (anchorElement && anchorElement.isConnected) ? anchorElement : (toolbar || null);

  positionResultPopup();

  popup.querySelector('.ai-result-tooltip-close').addEventListener('click', () => {
    removeActiveResultPopup();
  });

  popup.querySelector('.result-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(result);
    showNotification(t('copied'));
  });

  popup.querySelector('.result-replace').addEventListener('click', () => {
    handleReplaceResult(result);
    removeActiveResultPopup();
  });
}

function handleReplaceResult(text) {
  // First attempt: Use cached input element
  if (applyResultToCachedInput(text)) {
    showNotification(t('promptEnhanced'));
    hideToolbar();
    return;
  }

  // Second attempt: Check current active element
  const activeElement = document.activeElement;
  if (tryApplyToElement(activeElement, text)) {
    showNotification(t('promptEnhanced'));
    hideToolbar();
    return;
  }

  // Third attempt: Find recent input element in the page
  const recentInput = findRecentInputElement();
  if (recentInput && tryApplyToElement(recentInput, text)) {
    showNotification(t('promptEnhanced'));
    hideToolbar();
    return;
  }

  // Final fallback: Replace selected text in page
  if (replaceSelectedText(text)) {
    showNotification(t('promptEnhanced'));
    hideToolbar();
    return;
  }

  showError(t('cannotReplace'));
}

function positionResultPopup() {
  if (!activeResultPopup) {
    return;
  }

  const popup = activeResultPopup;
  const anchor = (activeResultAnchor && activeResultAnchor.isConnected) ? activeResultAnchor : (toolbar && toolbar.isConnected ? toolbar : null);

  const popupRect = popup.getBoundingClientRect();
  let left;
  let top;
  let positionAbove = false;

  if (anchor) {
    const anchorRect = anchor.getBoundingClientRect();
    left = anchorRect.left + anchorRect.width / 2 - popupRect.width / 2;
    left = Math.min(Math.max(12, left), window.innerWidth - popupRect.width - 12);

    top = anchorRect.bottom + 12;
    if (top + popupRect.height > window.innerHeight - 12) {
      top = anchorRect.top - popupRect.height - 12;
      positionAbove = true;
    }

    popup.classList.toggle('ai-result-tooltip--above', positionAbove);
    popup.style.left = `${left}px`;
    popup.style.top = `${Math.max(12, top)}px`;

    const updatedRect = popup.getBoundingClientRect();
    let arrowOffset = anchorRect.left + anchorRect.width / 2 - updatedRect.left;
    arrowOffset = Math.max(16, Math.min(updatedRect.width - 16, arrowOffset));
    popup.style.setProperty('--arrow-left', `${arrowOffset}px`);
  } else {
    left = (window.innerWidth - popupRect.width) / 2;
    top = Math.min(window.innerHeight - popupRect.height - 20, 80);

    popup.classList.remove('ai-result-tooltip--above');
    popup.style.left = `${Math.max(12, left)}px`;
    popup.style.top = `${Math.max(12, top)}px`;
    popup.style.setProperty('--arrow-left', `${popupRect.width / 2}px`);
  }
}

function formatResultContent(text) {
  return renderMarkdownSafe(text);
}

function renderMarkdownSafe(text) {
  const escaped = escapeHtml(text);
  if (!escaped.trim()) {
    return '';
  }

  const lines = escaped.split(/\r?\n/);
  let html = '';
  let inUl = false;
  let inOl = false;
  let inCodeBlock = false;
  let codeFenceLength = 0;
  let codeBlockLanguage = '';
  const codeBlockLines = [];

  const closeLists = () => {
    if (inUl) {
      html += '</ul>';
      inUl = false;
    }
    if (inOl) {
      html += '</ol>';
      inOl = false;
    }
  };

  const flushCodeBlock = () => {
    if (!inCodeBlock) {
      return;
    }
    html += renderCodeBlock(codeBlockLines.join('\n'), codeBlockLanguage);
    codeBlockLines.length = 0;
    codeBlockLanguage = '';
    codeFenceLength = 0;
    inCodeBlock = false;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmedLine = line.trim();

    if (inCodeBlock) {
      if (isClosingCodeFence(trimmedLine, codeFenceLength)) {
        flushCodeBlock();
      } else if (isOpeningCodeFence(trimmedLine)) {
        codeBlockLines.push(line);
      } else {
        codeBlockLines.push(line);
      }
      continue;
    }

    if (isOpeningCodeFence(trimmedLine)) {
      closeLists();
      inCodeBlock = true;
      codeFenceLength = extractFenceLength(trimmedLine);
      codeBlockLanguage = extractLanguage(trimmedLine, codeFenceLength);
      continue;
    }

    if (isTableHeaderLine(lines, index)) {
      closeLists();
      const { tableHtml, endIndex } = consumeTableBlock(lines, index);
      html += tableHtml;
      index = endIndex;
      continue;
    }

    if (!trimmedLine) {
      closeLists();
      html += '<p class="ai-md-paragraph ai-md-paragraph--spacer">&nbsp;</p>';
      continue;
    }

    const unorderedMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (unorderedMatch) {
      if (!inUl) {
        closeLists();
        html += '<ul class="ai-md-list">';
        inUl = true;
      }
      html += `<li>${applyInlineMarkdown(unorderedMatch[1])}</li>`;
      continue;
    }

    const orderedMatch = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      if (!inOl) {
        closeLists();
        html += '<ol class="ai-md-list">';
        inOl = true;
      }
      html += `<li>${applyInlineMarkdown(orderedMatch[2])}</li>`;
      continue;
    }

    closeLists();

    const headingMatch = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = Math.min(6, headingMatch[1].length);
      const content = applyInlineMarkdown(headingMatch[2]);
      html += `<h${level} class="ai-md-heading ai-md-heading-${level}">${content}</h${level}>`;
      continue;
    }

    const blockquoteMatch = line.match(/^\s*>\s?(.*)$/);
    if (blockquoteMatch) {
      html += `<blockquote class="ai-md-blockquote">${applyInlineMarkdown(blockquoteMatch[1])}</blockquote>`;
      continue;
    }

    html += `<p class="ai-md-paragraph">${applyInlineMarkdown(line)}</p>`;
  }

  flushCodeBlock();
  closeLists();
  return html || `<p class="ai-md-paragraph">${escaped}</p>`;
}

function applyInlineMarkdown(text) {
  let result = text;

  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code class="ai-md-code">$1</code>');

  // Links
  result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Bold
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic (avoid conflict with bold by excluding already converted strong tags)
  result = result.replace(/(^|[^*])\*([^*]+)\*/g, (_, prefix, content) => `${prefix}<em>${content}</em>`);

  return result;
}

function renderCodeBlock(content, language) {
  const languageAttr = language ? ` data-language="${language}"` : '';
  const languageClass = language ? ` ai-md-codeblock__code--${normalizeLanguageClass(language)}` : '';
  return `<pre class="ai-md-codeblock"><code class="ai-md-codeblock__code${languageClass}"${languageAttr}>${content}</code></pre>`;
}

function normalizeLanguageClass(language) {
  return language.replace(/[^a-z0-9+\-#]/gi, '-').toLowerCase();
}

function isOpeningCodeFence(line) {
  return /^`{3,}/.test(line);
}

function isClosingCodeFence(line, fenceLength) {
  if (!fenceLength) {
    return line === '```';
  }
  const fence = '`'.repeat(fenceLength);
  return line === fence;
}

function extractFenceLength(line) {
  const match = line.match(/^`{3,}/);
  return match ? match[0].length : 3;
}

function extractLanguage(line, fenceLength) {
  const meta = line.slice(fenceLength).trim();
  if (!meta) {
    return '';
  }
  const [language] = meta.split(/\s+/);
  return language;
}

function isTableHeaderLine(lines, index) {
  if (!Array.isArray(lines) || index < 0 || index >= lines.length - 1) {
    return false;
  }
  const headerLine = lines[index];
  const separatorLine = lines[index + 1];
  if (!containsTableDelimiter(headerLine) || !separatorLine) {
    return false;
  }
  return isTableSeparatorLine(separatorLine.trim());
}

function consumeTableBlock(lines, startIndex) {
  const headerLine = lines[startIndex];
  const headerCells = parseTableRow(headerLine);

  let endIndex = startIndex + 1;
  const bodyRows = [];

  for (let i = startIndex + 2; i < lines.length; i += 1) {
    const rowLine = lines[i];
    if (!rowLine || !containsTableDelimiter(rowLine)) {
      break;
    }
    if (!rowLine.trim()) {
      break;
    }
    if (isTableSeparatorLine(rowLine.trim())) {
      break;
    }
    bodyRows.push(parseTableRow(rowLine));
    endIndex = i;
  }

  const headerHtml = headerCells.map((cell) => `<th>${applyInlineMarkdown(cell)}</th>`).join('');
  const bodyHtml = bodyRows
    .map((row) => `<tr>${row.map((cell) => `<td>${applyInlineMarkdown(cell)}</td>`).join('')}</tr>`)
    .join('');

  const tableHtml = `<table class="ai-md-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
  return {
    tableHtml,
    endIndex
  };
}

function parseTableRow(line) {
  const trimmed = (line || '').trim();
  const sanitized = trimmed.replace(/^\||\|$/g, '');
  if (!sanitized) {
    return [''];
  }
  return sanitized.split('|').map((cell) => cell.trim());
}

function containsTableDelimiter(line) {
  return typeof line === 'string' && line.includes('|');
}

function isTableSeparatorLine(line) {
  if (!line) {
    return false;
  }
  const normalized = line.trim();
  if (!normalized) {
    return false;
  }
  if (!/-/.test(normalized)) {
    return false;
  }
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(normalized);
}

function handleInputTranslationFocus(event) {
  const target = event.target;
  if (!isTranslatableInput(target)) {
    return;
  }
  getInputTranslationState(target);
}

function handleInputTranslationBlur(event) {
  const target = event.target;
  if (!isTranslatableInput(target)) {
    return;
  }
  resetInputTranslationState(target);
}

function handleTripleSpaceKeydown(event) {
  const target = event.target;
  if (!isTranslatableInput(target)) {
    return;
  }
  if (event.defaultPrevented) {
    return;
  }
  if (event.isComposing) {
    return;
  }
  const state = getInputTranslationState(target);
  if (!state || state.isProcessing) {
    return;
  }

  if (!isPlainSpaceKey(event)) {
    resetInputTranslationCounter(state);
    return;
  }

  const now = Date.now();
  if (!state.lastTimestamp || (now - state.lastTimestamp) > TRIPLE_SPACE_WINDOW_MS) {
    state.count = 0;
  }
  state.lastTimestamp = now;
  state.count += 1;

  if (state.timer) {
    clearTimeout(state.timer);
  }

  state.timer = setTimeout(() => {
    resetInputTranslationCounter(state);
    state.timer = null;
  }, TRIPLE_SPACE_WINDOW_MS);

  if (state.count >= TRIPLE_SPACE_THRESHOLD) {
    resetInputTranslationCounter(state);
    state.isProcessing = true;
    clearInputTranslationPendingTask(state);
    state.pendingTask = setTimeout(() => {
      state.pendingTask = null;
      startInPlaceTranslation(target);
    }, 0);
  }
}

function isPlainSpaceKey(event) {
  if (!event || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
    return false;
  }
  return event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar';
}

function getInputTranslationState(element) {
  let state = inputTranslationStates.get(element);
  if (!state) {
    state = {
      count: 0,
      lastTimestamp: 0,
      timer: null,
      isProcessing: false,
      pendingTask: null
    };
    inputTranslationStates.set(element, state);
  }
  return state;
}

function resetInputTranslationCounter(state) {
  if (!state) {
    return;
  }
  state.count = 0;
  state.lastTimestamp = 0;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  clearInputTranslationPendingTask(state);
}

function resetInputTranslationState(element) {
  const state = inputTranslationStates.get(element);
  if (!state) {
    return;
  }
  resetInputTranslationCounter(state);
  state.isProcessing = false;
}

function clearInputTranslationPendingTask(state) {
  if (!state || !state.pendingTask) {
    return;
  }
  clearTimeout(state.pendingTask);
  state.pendingTask = null;
}

async function startInPlaceTranslation(element) {
  if (!element || !document.contains(element)) {
    return;
  }

  const state = getInputTranslationState(element);
  clearInputTranslationPendingTask(state);
  const originalValue = getEditableElementValue(element);
  const sanitizedSource = originalValue.replace(/[ \t]+$/u, '');

  if (!sanitizedSource.trim()) {
    resetInputTranslationCounter(state);
    state.isProcessing = false;
    return;
  }

  ensureInputTranslationStyles();
  element.classList.remove(INPUT_TRANSLATE_ERROR_CLASS);
  element.classList.add(INPUT_TRANSLATE_LOADING_CLASS);

  let hadError = false;

  try {
    const response = await sendMessageToBackground({
      action: IN_PLACE_TRANSLATION_ACTION,
      text: sanitizedSource
    });

    if (!response || !response.success) {
      throw new Error(response?.error || 'Translation failed');
    }

    const translated = typeof response.result === 'string' ? response.result.trim() : '';
    if (!translated) {
      throw new Error('Translation unavailable');
    }

    applyTranslationToElement(element, translated);
  } catch (error) {
    console.error('In-place translation failed:', error);
    hadError = true;
    indicateInputTranslationError(element);
  } finally {
    element.classList.remove(INPUT_TRANSLATE_LOADING_CLASS);
    if (hadError) {
      setTimeout(() => {
        element.classList.remove(INPUT_TRANSLATE_ERROR_CLASS);
      }, INPUT_TRANSLATE_ERROR_DURATION);
    }
    resetInputTranslationCounter(state);
    state.isProcessing = false;
  }
}

function applyTranslationToElement(element, text) {
  if (!element || !document.contains(element)) {
    return;
  }

  if (typeof element.value === 'string') {
    const scrollTop = typeof element.scrollTop === 'number' ? element.scrollTop : null;
    element.value = text;
    if (typeof element.setSelectionRange === 'function') {
      const position = text.length;
      element.setSelectionRange(position, position);
    }
    if (scrollTop !== null) {
      element.scrollTop = scrollTop;
    }
    if (typeof element.focus === 'function') {
      element.focus();
    }
    element.classList.remove(INPUT_TRANSLATE_ERROR_CLASS);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  if (element.isContentEditable) {
    element.textContent = text;
    element.classList.remove(INPUT_TRANSLATE_ERROR_CLASS);
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
}

function indicateInputTranslationError(element) {
  ensureInputTranslationStyles();
  if (element && element.classList) {
    element.classList.add(INPUT_TRANSLATE_ERROR_CLASS);
  }
  showNotification(t('errorOccurred'), 'error');
}

function ensureInputTranslationStyles() {
  if (inputTranslationStylesInjected) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'ai-input-translation-style';
  style.textContent = `
.${INPUT_TRANSLATE_LOADING_CLASS} {
  box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.45) !important;
  outline: 2px solid rgba(26, 115, 232, 0.35) !important;
  transition: box-shadow 0.2s ease, outline 0.2s ease;
}

.${INPUT_TRANSLATE_ERROR_CLASS} {
  box-shadow: 0 0 0 2px rgba(217, 48, 37, 0.5) !important;
  outline: 2px solid rgba(217, 48, 37, 0.35) !important;
  transition: box-shadow 0.2s ease, outline 0.2s ease;
}
`;
  (document.head || document.documentElement).appendChild(style);
  inputTranslationStylesInjected = true;
}

function getEditableElementValue(element) {
  if (!element) {
    return '';
  }
  if (typeof element.value === 'string') {
    return element.value;
  }
  if (element.isContentEditable) {
    return element.textContent || '';
  }
  return '';
}

function isTranslatableInput(element) {
  if (!element || !document.contains(element)) {
    return false;
  }
  if (element.tagName === 'TEXTAREA') {
    return !element.readOnly && !element.disabled;
  }
  if (element.tagName === 'INPUT') {
    const type = (element.type || 'text').toLowerCase();
    if (NON_TRANSLATABLE_INPUT_TYPES.has(type)) {
      return false;
    }
    return !element.readOnly && !element.disabled;
  }
  if (element.isContentEditable) {
    return true;
  }
  return false;
}

function removeActiveResultPopup() {
  if (activeResultPopup) {
    activeResultPopup.remove();
    activeResultPopup = null;
  }
  activeResultAnchor = null;
}

function replaceSelectedText(newText) {
  if (!selectionRange) return;

  try {
    selectionRange.deleteContents();
    selectionRange.insertNode(document.createTextNode(newText));
  } catch (e) {
    console.error('Failed to replace text:', e);
    showError(t('cannotReplace'));
  }
}

function sendMessageToBackground(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(runtimeError);
        return;
      }
      if (response && response.error instanceof Error) {
        reject(response.error);
        return;
      }
      resolve(response);
    });
  });
}

async function ensureLanguageModelReady() {
  if (typeof LanguageModel === 'undefined') {
    return;
  }

  if (languageModelReady) {
    return;
  }

  if (languageModelPreparation) {
    await languageModelPreparation;
    return;
  }

  const prepare = async () => {
    const hadActivation = Boolean(navigator.userActivation && navigator.userActivation.isActive);

    let availability;
    try {
      availability = await LanguageModel.availability();
    } catch (error) {
      console.warn('Language model availability check failed:', error);
      return;
    }

  if (availability === 'available' || availability === 'after-download') {
      languageModelReady = true;
      return;
    }

    if (availability === 'unavailable' || availability === 'no') {
      throw new Error('model_unavailable');
    }

    if (!['downloadable', 'downloading'].includes(availability)) {
      return;
    }

    if (!hadActivation) {
      throw new Error('user_activation_required');
    }

    let notice = showNotification(t('modelPreparing'), 'info', 0);

    try {
      const session = await LanguageModel.create({
        systemPrompt: 'Prepare language model for upcoming AI action.',
        outputLanguage: resolveOutputLanguage(currentResponseLanguage),
        monitor(monitor) {
          monitor.addEventListener('downloadprogress', (event) => {
            if (!notice || !notice.isConnected || !event.total) {
              return;
            }
            const percent = Math.round((event.loaded / event.total) * 100);
            notice.textContent = `${t('modelPreparing')} (${percent}%)`;
          });
        }
      });

      if (session?.ready && typeof session.ready.then === 'function') {
        try {
          await session.ready;
        } catch (readyError) {
          console.warn('Language model ready promise rejected:', readyError);
        }
      }

      session.destroy?.();

      const maxWaitMs = 10000;
      const intervalMs = 500;
      const start = Date.now();

      while (Date.now() - start < maxWaitMs) {
        let status;
        try {
          status = await LanguageModel.availability();
        } catch (statusError) {
          console.warn('Availability poll failed:', statusError);
          await sleep(intervalMs);
          continue;
        }

        if (status === 'available' || status === 'after-download') {
          languageModelReady = true;
          return;
        }

        await sleep(intervalMs);
      }

      throw new Error('model_download_timeout');
    } catch (error) {
      if (error?.message && error.message.includes('user gesture')) {
        throw new Error('user_activation_required');
      }
      throw error;
    } finally {
      if (notice) {
        notice.remove();
      }
    }
  };

  languageModelPreparation = prepare();

  try {
    await languageModelPreparation;
  } finally {
    languageModelPreparation = null;
  }
}

function handleActionError(error) {
  const message = error?.message || '';

  if (!message) {
    showError(t('errorOccurred'));
    return;
  }

  if (message === 'user_activation_required' || message.includes('user gesture')) {
    showNotification(t('modelUserActivationRequired'), 'error');
    return;
  }

  if (message === 'model_unavailable') {
    showError(t('modelUnavailable'));
    return;
  }

  if (message === 'model_download_timeout') {
    showNotification(t('modelDownloadTimeout'), 'error');
    return;
  }

  if (message === 'canceled' || message === 'undefined') {
    showError(t('modelDownloadFailed'));
    return;
  }

  if (message.includes('Receiving end does not exist') ||
      message.includes('Extension context invalidated') ||
      message.includes('No active service worker')) {
    showError(t('extensionUnavailable'));
    return;
  }

  showError(t('modelDownloadFailed'));
}

function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'ai-notification error';
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);

  setTimeout(() => errorDiv.remove(), 3000);
}

function showNotification(message, type = 'success', duration = 2000) {
  const notifDiv = document.createElement('div');
  notifDiv.className = `ai-notification ${type}`;
  notifDiv.textContent = message;
  document.body.appendChild(notifDiv);

  if (duration > 0) {
    setTimeout(() => notifDiv.remove(), duration);
  }

  return notifDiv;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.addEventListener('resize', positionResultPopup);
window.addEventListener('scroll', positionResultPopup, true);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isEditableElement(element) {
  if (!element) {
    return false;
  }
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    return !element.readOnly && !element.disabled;
  }
  return false;
}

function clampSelectionIndex(value, max, fallback = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return Math.min(Math.max(0, fallback), max);
  }
  return Math.min(Math.max(0, value), max);
}

function clearCachedInputTarget() {
  lastTargetInput = null;
  lastTargetSelection = null;
}

function tryApplyToElement(element, text) {
  if (!element || !document.contains(element)) {
    return false;
  }

  if (!isEditableElement(element)) {
    return false;
  }

  try {
    const value = element.value ?? '';
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? start;
    const replacement = text ?? '';

    element.value = value.slice(0, start) + replacement + value.slice(end);

    const newPos = start + replacement.length;
    if (typeof element.setSelectionRange === 'function') {
      element.setSelectionRange(newPos, newPos);
    }
    if (typeof element.focus === 'function') {
      element.focus();
    }

    return true;
  } catch (error) {
    console.error('Failed to apply text to element:', error);
    return false;
  }
}

function findRecentInputElement() {
  // Common AI chat interface selectors
  const commonSelectors = [
    'textarea[placeholder*="Message"]',
    'textarea[placeholder*="message"]',
    'textarea[placeholder*="Ask"]',
    'textarea[placeholder*="ask"]',
    'textarea[placeholder*="Type"]',
    'textarea[placeholder*="type"]',
    'textarea[placeholder*="Chat"]',
    'textarea[placeholder*="chat"]',
    'textarea[data-id="root"]',
    'textarea#prompt-textarea',
    'div[contenteditable="true"]',
    'textarea',
    'input[type="text"]'
  ];

  // Try common selectors first
  for (const selector of commonSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (isEditableElement(element) && element.offsetParent !== null) {
          return element;
        }
      }
    } catch (e) {
      continue;
    }
  }

  // Fallback: find any visible editable element
  const allInputs = document.querySelectorAll('input, textarea');
  for (const input of allInputs) {
    if (isEditableElement(input) && input.offsetParent !== null) {
      return input;
    }
  }

  return null;
}

// Hide toolbar when clicking outside
document.addEventListener('click', (e) => {
  if (toolbar && !toolbar.contains(e.target)) {
    if (!e.target.closest('.ai-result-tooltip')) {
      hideToolbar();
    }
  }
});

// Fade toolbar on scroll
let scrollTimeout;
window.addEventListener('scroll', () => {
  if (toolbar) {
    toolbar.style.opacity = '0.3';
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      if (toolbar) toolbar.style.opacity = '1';
    }, 200);
  }
}, { passive: true });
