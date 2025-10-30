// AI Text Assistant - Popup Script

const translations = {
  en: {
    popupTitle: '🤖 Sophera AI Assistant',
    popupSubtitle: 'Chrome Built-in AI Powered',
    translatorLabel: 'Translator API',
    summarizerLabel: 'Summarizer API',
    promptLabel: 'Prompt API',
    statusChecking: 'Checking…',
    statusAvailable: 'Available',
    statusNotAvailable: 'Not Available',
    statusError: 'Error',
    howToTitle: 'How to Use',
    howToStep1: 'Select any text on a webpage',
    howToStep2: 'Click the floating toolbar buttons',
    howToStep3: 'AI processes text locally & privately',
    howToStep4: 'Works completely offline!',
    settingsBtnLabel: 'Open Settings',
    helpBtnLabel: 'Help & Documentation',
    footer: 'Version 1.0.0 | Privacy-First | Offline Capable'
  },
  zh_CN: {
    popupTitle: '🤖 Sophera AI 助手',
    popupSubtitle: '基于 Chrome 内置 AI',
    translatorLabel: '翻译 API',
    summarizerLabel: '摘要 API',
    promptLabel: '提示词 API',
    statusChecking: '检测中…',
    statusAvailable: '可用',
    statusNotAvailable: '不可用',
    statusError: '错误',
    howToTitle: '使用方法',
    howToStep1: '在网页上选中任意文本',
    howToStep2: '点击浮动工具栏上的按钮',
    howToStep3: 'AI 会在本地私密处理文本',
    howToStep4: '完全离线也能工作',
    settingsBtnLabel: '打开设置',
    helpBtnLabel: '帮助与文档',
    footer: '版本 1.0.0｜隐私优先｜离线可用'
  }
};

let currentLanguage = 'en';

function t(key) {
  const langTable = translations[currentLanguage] || translations.en;
  return langTable[key] || translations.en[key] || key;
}

function setLanguage(lang) {
  const newLang = translations[lang] ? lang : 'en';
  currentLanguage = newLang;
  applyLanguage();
}

function applyLanguage() {
  document.documentElement.lang = currentLanguage;

  const titleEl = document.getElementById('popupTitle');
  if (titleEl) titleEl.textContent = t('popupTitle');

  const subtitleEl = document.getElementById('popupSubtitle');
  if (subtitleEl) subtitleEl.textContent = t('popupSubtitle');

  const translatorLabel = document.getElementById('translatorLabel');
  if (translatorLabel) translatorLabel.textContent = t('translatorLabel');

  const summarizerLabel = document.getElementById('summarizerLabel');
  if (summarizerLabel) summarizerLabel.textContent = t('summarizerLabel');

  const promptLabel = document.getElementById('promptLabel');
  if (promptLabel) promptLabel.textContent = t('promptLabel');

  const howToTitle = document.getElementById('howToTitle');
  if (howToTitle) howToTitle.textContent = t('howToTitle');

  const steps = [
    { id: 'howToStep1', key: 'howToStep1' },
    { id: 'howToStep2', key: 'howToStep2' },
    { id: 'howToStep3', key: 'howToStep3' },
    { id: 'howToStep4', key: 'howToStep4' }
  ];

  steps.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  });

  const settingsLabel = document.getElementById('settingsBtnLabel');
  if (settingsLabel) settingsLabel.textContent = t('settingsBtnLabel');

  const helpLabel = document.getElementById('helpBtnLabel');
  if (helpLabel) helpLabel.textContent = t('helpBtnLabel');

  const footer = document.getElementById('popupFooter');
  if (footer) footer.textContent = t('footer');

  resetStatusIndicators();
}

function resetStatusIndicators() {
  ['translator', 'summarizer', 'prompt'].forEach((key) => {
    const container = document.getElementById(`${key}Status`);
    if (container) {
      updateStatus(container, 'loading', t('statusChecking'));
    }
  });
}

// Check API availability on load
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get({ uiLanguage: 'en' }, ({ uiLanguage }) => {
    setLanguage(uiLanguage);
    checkAPIStatus();
    setupEventListeners();
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.action === 'reloadSettings') {
    chrome.storage.local.get({ uiLanguage: currentLanguage }, ({ uiLanguage }) => {
      setLanguage(uiLanguage);
      resetStatusIndicators();
      checkAPIStatus();
    });
  }
});

function setupEventListeners() {
  // Settings button
  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Help button
  document.getElementById('helpBtn').addEventListener('click', () => {
    chrome.tabs.create({
      url: 'https://developer.chrome.com/docs/ai/built-in'
    });
  });
}

async function checkAPIStatus() {
  // Check Translator API
  checkTranslatorAPI();

  // Check Summarizer API
  checkSummarizerAPI();

  // Check Prompt API
  checkPromptAPI();
}

async function checkTranslatorAPI() {
  const statusElement = document.getElementById('translatorStatus');

  try {
    if ('Translator' in self) {
      const availability = await Translator.availability({
        sourceLanguage: 'en',
        targetLanguage: 'zh'
      });

      if (availability === 'available' || availability === 'downloadable' || availability === 'downloading') {
        updateStatus(statusElement, 'active', t('statusAvailable'));
      } else {
        updateStatus(statusElement, 'inactive', t('statusNotAvailable'));
      }
    } else {
      updateStatus(statusElement, 'inactive', t('statusNotAvailable'));
    }
  } catch (error) {
    console.error('Translator API check failed:', error);
    updateStatus(statusElement, 'inactive', t('statusError'));
  }
}

async function checkSummarizerAPI() {
  const statusElement = document.getElementById('summarizerStatus');

  try {
    if ('Summarizer' in self) {
      const availability = await Summarizer.availability();

      if (availability === 'available' || availability === 'downloadable' || availability === 'downloading') {
        updateStatus(statusElement, 'active', t('statusAvailable'));
      } else {
        updateStatus(statusElement, 'inactive', t('statusNotAvailable'));
      }
    } else {
      updateStatus(statusElement, 'inactive', t('statusNotAvailable'));
    }
  } catch (error) {
    console.error('Summarizer API check failed:', error);
    updateStatus(statusElement, 'inactive', t('statusError'));
  }
}

async function checkPromptAPI() {
  const statusElement = document.getElementById('promptStatus');

  try {
    if ('LanguageModel' in self) {
      const availability = await LanguageModel.availability();

      if (availability === 'available' || availability === 'downloadable' || availability === 'downloading') {
        updateStatus(statusElement, 'active', t('statusAvailable'));
      } else {
        updateStatus(statusElement, 'inactive', t('statusNotAvailable'));
      }
    } else {
      updateStatus(statusElement, 'inactive', t('statusNotAvailable'));
    }
  } catch (error) {
    console.error('Prompt API check failed:', error);
    updateStatus(statusElement, 'inactive', t('statusError'));
  }
}

function updateStatus(element, statusClass, text) {
  if (!element) return;

  const indicator = element.querySelector('.status-indicator');
  const textNode = element.querySelector('.status-text');

  if (indicator) {
    indicator.classList.remove('active', 'inactive', 'loading');
    indicator.classList.add(statusClass);
  }

  if (textNode) {
    textNode.textContent = text;
  }
}
