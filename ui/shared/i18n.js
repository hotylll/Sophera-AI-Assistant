const translations = {
  en: {
    sidebarTitle: 'AI Companion',
    sidebarSubtitle: 'Ask anything, anywhere',
    newChat: 'New chat',
    promptPlaceholder: 'Send a message or type @ to add a page…',
    mentionHint: 'AI responses may be incorrect, please verify carefully',
    mentionLoading: 'Loading tabs…',
    mentionNoResults: 'No matching tabs',
    mentionSectionTitle: 'Open tabs',
    mentionRetry: 'Reload tabs',
    aiTyping: 'AI is replying…',
    tabClosedError: 'The referenced tab is no longer available.',
    contextFetchError: 'Could not read the tab content.',
    streamingError: 'The AI response was interrupted.',
    statusError: 'Something went wrong.',
    send: 'Send',
    welcomeTitle: 'Hello there!',
    welcomeSubtitle: 'Start a conversation or reference a tab to include its context.',
    chipSummarize: 'Summarize this page',
    chipExplain: 'Explain what I\'m reading',
    chipTranslate: 'Translate highlighted section',
    menuAria: 'Open menu',
    settingsTooltip: 'Open settings',
    settingsLabel: 'Settings',
    historyTitle: 'History',
    historyNewChat: 'New chat',
    historyEmpty: 'No conversations yet',
    historyUntitled: 'Untitled chat',
    historyMenuRename: 'Rename',
    historyMenuDelete: 'Delete',
    historyDeleteTitle: 'Delete conversation?',
    historyDeleteMessage: 'This will delete "{title}".',
    historyDeleteConfirm: 'Delete',
    historyDeleteCancel: 'Cancel',
    stop: 'Stop',
    responseCancelled: 'Response canceled by user.',
    inputTranslationTitle: 'Input Box Translation',
    inputTranslationHint: 'Target language for triple-space translation',
    promptInstruction: 'You are an AI assistant. You are provided with a piece of text quoted from a webpage as context. Please answer the user\'s next question strictly based on this context.',
    promptContextHeader: 'Context',
    promptQuestionHeader: 'User Question'
  },
  zh_CN: {
    sidebarTitle: 'AI 助手',
    sidebarSubtitle: '随时提问，随处协助',
    newChat: '开启新对话',
    promptPlaceholder: '输入消息，或输入 @ 添加页面…',
    mentionHint: 'AI回答可能出错，请仔细核对',
    mentionLoading: '正在加载标签页…',
    mentionNoResults: '没有匹配的标签页',
    mentionSectionTitle: '打开的标签页',
    mentionRetry: '重新加载',
    aiTyping: 'AI 正在回复…',
    tabClosedError: '引用的标签页已不可用。',
    contextFetchError: '无法读取该标签页内容。',
    streamingError: 'AI 回复被中断。',
    statusError: '发生了一点问题。',
    send: '发送',
    welcomeTitle: '你好！',
    welcomeSubtitle: '开始对话，或引用标签页让 AI 理解你的上下文。',
    chipSummarize: '总结当前页面',
    chipExplain: '解释我正在阅读的内容',
    chipTranslate: '翻译高亮内容',
    menuAria: '打开菜单',
    settingsTooltip: '打开设置',
    settingsLabel: '设置',
    historyTitle: '历史记录',
    historyNewChat: '开启新对话',
    historyEmpty: '暂无对话记录',
    historyUntitled: '未命名对话',
    historyMenuRename: '重命名',
    historyMenuDelete: '删除',
    historyDeleteTitle: '要删除对话吗？',
    historyDeleteMessage: '这将删除“{title}”。',
    historyDeleteConfirm: '删除',
    historyDeleteCancel: '取消',
    stop: '停止',
    responseCancelled: '回复已由用户停止。',
    inputTranslationTitle: '输入框翻译',
    inputTranslationHint: '三次空格翻译的目标语言',
    promptInstruction: '你是一个AI助手。现在为你提供一段从网页上引用的文本作为上下文，请你严格基于此上下文来回答用户接下来的问题。',
    promptContextHeader: '上下文',
    promptQuestionHeader: '用户问题'
  }
};

export function createI18n(initialLanguage = 'en') {
  let currentLanguage = resolveLanguage(initialLanguage);

  const t = (key, replacements) => {
    const table = translations[currentLanguage] || translations.en;
    const template = table[key] || translations.en[key] || key;
    if (!replacements) {
      return template;
    }
    return Object.keys(replacements).reduce((acc, placeholder) => {
      return acc.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), replacements[placeholder]);
    }, template);
  };

  return {
    t,
    setLanguage(lang) {
      currentLanguage = resolveLanguage(lang);
    },
    getLanguage() {
      return currentLanguage;
    }
  };
}

export function applyTranslations(root, translate) {
  const elements = root.querySelectorAll('[data-i18n]');
  elements.forEach((element) => {
    const key = element.dataset.i18n;
    if (!key) {
      return;
    }
    const attr = element.dataset.i18nAttr;
    const value = translate(key);
    if (attr) {
      element.setAttribute(attr, value);
    } else {
      element.textContent = value;
    }
  });
}

export function resolveLanguage(lang) {
  if (!lang) {
    return 'en';
  }
  if (lang === 'zh_CN' || lang === 'zh-CN' || lang === 'zh') {
    return 'zh_CN';
  }
  return translations[lang] ? lang : 'en';
}

export function getTranslations() {
  return translations;
}
