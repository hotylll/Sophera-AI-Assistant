// AI Text Assistant - Options Page Script

const translations = {
  en: {
    pageTitle: '⚙️ Sophera AI Assistant Settings',
    pageSubtitle: 'Customize your Sophera AI Assistant experience',
    languageSectionTitle: '🌐 Interface Language',
    uiLanguageLabel: 'UI Language',
    uiLanguageHint: 'Switch the language of toolbar, popup, and notifications',
    uiLanguageOptions: {
      en: 'English',
      zh_CN: 'Simplified Chinese'
    },
    responseLanguageLabel: 'AI Response Language',
    responseLanguageHint: 'Choose the default language for AI replies (summaries, rewrites, Ask AI, etc.)',
    responseLanguageOptions: {
      auto: 'Match detected language',
      en: 'English',
      zh_CN: 'Simplified Chinese'
    },
    languageNote: 'Language changes take effect immediately for new UI elements. Reload existing toolbars if needed.',
    summarizerSectionTitle: '📝 Summarizer Settings',
    summaryTypeLabel: 'Summary Type',
    summaryTypeHint: 'Choose how you want summaries to be formatted',
    summaryTypeOptions: {
      'key-points': 'Key Points (bullet list)',
      tldr: 'TL;DR (quick overview)',
      teaser: 'Teaser (engaging highlights)',
      headline: 'Headline (title format)'
    },
    summaryLengthLabel: 'Summary Length',
    summaryLengthHint: 'Control the length of generated summaries',
    summaryLengthOptions: {
      short: 'Short (concise)',
      medium: 'Medium (balanced)',
      long: 'Long (detailed)'
    },
    summaryFormatLabel: 'Output Format',
    summaryFormatHint: 'Choose the output format for summaries',
    summaryFormatOptions: {
      markdown: 'Markdown',
      'plain-text': 'Plain Text'
    },
    rewriterSectionTitle: '✍️ Rewriter Settings',
    rewritePromptLabel: 'Custom Rewrite Prompt',
    rewritePromptPlaceholder: 'Enter your custom rewrite instructions...',
    rewritePromptHint: 'Customize how text should be rewritten (e.g., "Make it more formal", "Simplify for beginners")',
    enhanceSectionTitle: '✨ Prompt Enhancement',
    enhanceTemplateLabel: 'Enhancement Template',
    enhanceTemplatePlaceholder: 'Enter your prompt enhancement template...',
    enhanceTemplateHint: 'Template for enhancing prompts in input fields',
    inputTranslationSectionTitle: '⌨️ Input Box Translation',
    inputTranslationDescription: 'Configure the triple-spacebar translation feature',
    inputTranslationTargetLabel: 'Target Language',
    inputTranslationTargetHint: 'Select the target language for triple-space translation',
    inputTranslationTargetOptions: {
      en: 'English',
      zh_CN: 'Simplified Chinese'
    },
    toolbarSectionTitle: '🎨 Toolbar Customization',
    visibleButtonsLabel: 'Visible Buttons',
    visibleButtonsHint: 'Choose which buttons to display in the toolbar',
    buttonTranslate: 'Translate',
    buttonSummarize: 'Summarize',
    buttonRewrite: 'Rewrite',
    buttonAskAI: 'Ask AI',
    buttonCopy: 'Copy',
  buttonSearch: 'Search',
    buttonEnhance: 'Enhance',
    buttonExport: 'Export',
    saveBtn: 'Save Settings',
    resetBtn: 'Reset to Defaults',
    settingsSaved: 'Settings saved successfully!',
    settingsReset: 'Settings reset to defaults',
    confirmReset: 'Are you sure you want to reset all settings to defaults?' ,
    apiAvailabilityTitle: 'AI API Availability',
    toolbarPreviewTitle: 'How to Use',
    rewritePromptDefault: 'Please rewrite the following text to make it clearer, more concise, and better structured while preserving the original meaning:',
    enhanceTemplateDefault: [
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
    ].join('\n')
  },
  zh_CN: {
    pageTitle: '⚙️ Sophera AI 助手设置',
    pageSubtitle: '自定义你的 Sophera AI 助手体验',
    languageSectionTitle: '🌐 界面语言',
    uiLanguageLabel: '界面语言',
    uiLanguageHint: '切换工具栏、弹窗及通知的显示语言',
    uiLanguageOptions: {
      en: '英语',
      zh_CN: '简体中文'
    },
    responseLanguageLabel: 'AI 回答语言',
    responseLanguageHint: '选择 AI 回复（摘要、改写、问答等）的默认语言',
    responseLanguageOptions: {
      auto: '跟随检测语言',
      en: '英语',
      zh_CN: '简体中文'
    },
    languageNote: '语言切换会即时应用于新的界面元素，如需刷新工具栏请重新选中文本。',
    summarizerSectionTitle: '📝 摘要设置',
    summaryTypeLabel: '摘要类型',
    summaryTypeHint: '选择你希望的摘要呈现方式',
    summaryTypeOptions: {
      'key-points': '要点列表',
      tldr: 'TL;DR（快速概览）',
      teaser: '亮点摘要',
      headline: '标题式摘要'
    },
    summaryLengthLabel: '摘要长度',
    summaryLengthHint: '控制生成摘要的详细程度',
    summaryLengthOptions: {
      short: '短（精简）',
      medium: '中等（平衡）',
      long: '长（详细）'
    },
    summaryFormatLabel: '输出格式',
    summaryFormatHint: '选择摘要的输出格式',
    summaryFormatOptions: {
      markdown: 'Markdown',
      'plain-text': '纯文本'
    },
    rewriterSectionTitle: '✍️ 改写设置',
    rewritePromptLabel: '自定义改写提示词',
    rewritePromptPlaceholder: '填写你的改写要求…',
    rewritePromptHint: '自定义改写风格，例如“请更正式一些”或“简化为新手友好”。',
    enhanceSectionTitle: '✨ 提示词增强',
    enhanceTemplateLabel: '增强模板',
    enhanceTemplatePlaceholder: '填写你的提示词增强模板…',
    enhanceTemplateHint: '用于在输入框中优化提示词的模板',
    inputTranslationSectionTitle: '⌨️ 输入框翻译',
    inputTranslationDescription: '配置三次空格翻译功能',
    inputTranslationTargetLabel: '目标语言',
    inputTranslationTargetHint: '选择三次空格翻译的目标语言',
    inputTranslationTargetOptions: {
      en: '英语',
      zh_CN: '简体中文'
    },
    toolbarSectionTitle: '🎨 工具栏自定义',
    visibleButtonsLabel: '显示的按钮',
    visibleButtonsHint: '选择工具栏中需要显示的按钮',
    buttonTranslate: '翻译',
    buttonSummarize: '摘要',
    buttonRewrite: '改写',
    buttonAskAI: '问答',
    buttonCopy: '复制',
  buttonSearch: '搜索',
    buttonEnhance: '增强',
    buttonExport: '导出',
    saveBtn: '保存设置',
    resetBtn: '恢复默认',
    settingsSaved: '设置已保存！',
    settingsReset: '设置已恢复为默认值',
    confirmReset: '确定要将所有设置恢复为默认值吗？',
    apiAvailabilityTitle: 'AI API 可用性',
    toolbarPreviewTitle: '使用说明',
    rewritePromptDefault: '请将以下文本改写得更加清晰、简洁并优化结构，同时保留原意：',
    enhanceTemplateDefault: [
      '# 角色：AI 提示词工程师 (Prompt Engineer)',
      '',
      '你的唯一任务是接收一个来自 `<INPUT>` 的用户提示词，并将其重写为一个专家级的、结构化的新提示词。这个新提示词必须被设计为能从 AI 模型中引导出更长、更具体、更高质量的响应。',
      '',
      '## 操作指南：',
      '1. **分析意图**：精确识别 `<INPUT>` 中用户最原始、最核心的意图。',
      '2. **赋予角色（Role）**：为 AI 分配一个清晰、专业的角色，例如“你是一名资深的 XX 领域专家…”。',
      '3. **明确任务（Task）**：阐述 AI 需要完成的具体任务。',
      '4. **注入上下文（Context）**：补充必要的背景信息，帮助 AI 理解任务所处的环境（如“目标读者是…”、“场景发生在…”）。',
      '5. **要求具体化（Specificity）**：要求 AI 输出更长、更详尽的内容，可加入“详细阐述”、“深入分析”、“提供具体示例或数据支持”，必要时探讨“为什么”和“如何做”。',
      '6. **定义输出格式（Format）**：为 AI 的回答规定一个清晰结构，例如“使用 Markdown 标题”、“分为若干部分逐一展开”、“提供一个包含三列的表格”。',
      '7. **设置约束条件（Constraints）**：添加语气、长度或风格限制，如“保持专业语气”、“避免行话”、“篇幅不少于 500 字”。',
      '8. **忠于原意**：不得偏离或扭曲 `<INPUT>` 中的核心意图。',
      '',
      '## 输出规则：',
      '- 只输出重写后的新提示词文本，不包含任何对修改过程的说明或评论。',
      '- 不要重复本提示词（“角色：AI 提示词工程师…”）本身。',
      '- 不要输出 `<INPUT>` 标签。',
      '',
      '## 待优化提示词：',
      "<INPUT>${action.selectedText ?? ''}</INPUT>"
    ].join('\n')
  }
};

// Default settings
const DEFAULT_SETTINGS = {
  uiLanguage: 'en',
  responseLanguage: 'auto',
  inputTranslationTargetLanguage: 'en',
  summaryType: 'key-points',
  summaryLength: 'medium',
  summaryFormat: 'markdown',
  rewritePrompt: translations.en.rewritePromptDefault,
  enhanceTemplate: translations.en.enhanceTemplateDefault,
  visibleButtons: {
    translate: true,
    summarize: true,
    rewrite: true,
    askAI: true,
    copy: true,
    search: true,
    enhance: true,
    export: true
  }
};

let currentLanguage = 'en';

function t(key) {
  const langPack = translations[currentLanguage] || translations.en;
  return langPack[key] ?? translations.en[key] ?? key;
}

function setLanguage(lang) {
  currentLanguage = translations[lang] ? lang : 'en';
  applyLanguage();
}

function applyLanguage() {
  const localeCode = currentLanguage === 'zh_CN' ? 'zh-CN' : 'en';
  document.documentElement.lang = localeCode;
  document.title = t('pageTitle');

  setText('pageTitle', t('pageTitle'));
  setText('pageSubtitle', t('pageSubtitle'));
  setText('languageSectionTitle', t('languageSectionTitle'));
  setText('uiLanguageLabel', t('uiLanguageLabel'));
  setText('uiLanguageHint', t('uiLanguageHint'));
  setText('responseLanguageLabel', t('responseLanguageLabel'));
  setText('responseLanguageHint', t('responseLanguageHint'));
  setText('languageNote', t('languageNote'));
  setText('summarizerSectionTitle', t('summarizerSectionTitle'));
  setText('summaryTypeLabel', t('summaryTypeLabel'));
  setText('summaryTypeHint', t('summaryTypeHint'));
  setText('summaryLengthLabel', t('summaryLengthLabel'));
  setText('summaryLengthHint', t('summaryLengthHint'));
  setText('summaryFormatLabel', t('summaryFormatLabel'));
  setText('summaryFormatHint', t('summaryFormatHint'));
  setText('rewriterSectionTitle', t('rewriterSectionTitle'));
  setText('rewritePromptLabel', t('rewritePromptLabel'));
  setText('rewritePromptHint', t('rewritePromptHint'));
  setText('enhanceSectionTitle', t('enhanceSectionTitle'));
  setText('enhanceTemplateLabel', t('enhanceTemplateLabel'));
  setText('enhanceTemplateHint', t('enhanceTemplateHint'));
  setText('inputTranslationSectionTitle', t('inputTranslationSectionTitle'));
  setText('inputTranslationDescription', t('inputTranslationDescription'));
  setText('inputTranslationTargetLabel', t('inputTranslationTargetLabel'));
  setText('inputTranslationTargetHint', t('inputTranslationTargetHint'));
  setText('toolbarSectionTitle', t('toolbarSectionTitle'));
  setText('visibleButtonsLabel', t('visibleButtonsLabel'));
  setText('visibleButtonsHint', t('visibleButtonsHint'));

  setLabelWithIcon('btnTranslateLabel', '🌐', t('buttonTranslate'));
  setLabelWithIcon('btnSummarizeLabel', '📝', t('buttonSummarize'));
  setLabelWithIcon('btnRewriteLabel', '✍️', t('buttonRewrite'));
  setLabelWithIcon('btnAskAILabel', '🤖', t('buttonAskAI'));
  setLabelWithIcon('btnCopyLabel', '📋', t('buttonCopy'));
  setLabelWithIcon('btnSearchLabel', '🔍', t('buttonSearch'));
  setLabelWithIcon('btnEnhanceLabel', '✨', t('buttonEnhance'));
  setLabelWithIcon('btnExportLabel', '💾', t('buttonExport'));

  setOptionLabels('uiLanguage', translations[currentLanguage].uiLanguageOptions);
  setOptionLabels('responseLanguage', translations[currentLanguage].responseLanguageOptions);
  setOptionLabels('inputTranslationTargetLanguage', translations[currentLanguage].inputTranslationTargetOptions);
  setOptionLabels('summaryType', translations[currentLanguage].summaryTypeOptions);
  setOptionLabels('summaryLength', translations[currentLanguage].summaryLengthOptions);
  setOptionLabels('summaryFormat', translations[currentLanguage].summaryFormatOptions);

  setButtonText('saveBtn', t('saveBtn'));
  setButtonText('resetBtn', t('resetBtn'));

  setPlaceholder('rewritePrompt', t('rewritePromptPlaceholder'));
  setPlaceholder('enhanceTemplate', t('enhanceTemplatePlaceholder'));

  updateNavLabels();
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el && typeof text === 'string') {
    el.textContent = text;
  }
}

function setLabelWithIcon(id, icon, text) {
  const el = document.getElementById(id);
  if (el && typeof text === 'string') {
    el.textContent = `${icon} ${text}`;
  }
}

function setOptionLabels(selectId, mapping = {}) {
  const select = document.getElementById(selectId);
  if (!select) return;
  Array.from(select.options).forEach((option) => {
    const label = mapping[option.value];
    if (label) {
      option.textContent = label;
    }
  });
}

function setButtonText(id, text) {
  const el = document.getElementById(id);
  if (el && typeof text === 'string') {
    el.textContent = text;
  }
}

function setPlaceholder(id, text) {
  const el = document.getElementById(id);
  if (el && typeof text === 'string') {
    el.placeholder = text;
  }
}

function updateNavLabels() {
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.getAttribute('data-i18n');
    if (!key) return;
    const value = t(key);
    if (typeof value === 'string') {
      node.textContent = value;
    }
  });
}

// Load settings on page load
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('resetBtn').addEventListener('click', resetSettings);
  document.getElementById('uiLanguage').addEventListener('change', (event) => {
    setLanguage(event.target.value);
  });

  initializeFieldObservers();
});

// Load settings from storage
function loadSettings() {
  chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
    document.getElementById('uiLanguage').value = settings.uiLanguage || DEFAULT_SETTINGS.uiLanguage;
    document.getElementById('responseLanguage').value = settings.responseLanguage || DEFAULT_SETTINGS.responseLanguage;
    document.getElementById('inputTranslationTargetLanguage').value = settings.inputTranslationTargetLanguage || DEFAULT_SETTINGS.inputTranslationTargetLanguage;

    setLanguage(settings.uiLanguage || DEFAULT_SETTINGS.uiLanguage);

    // Summarizer settings
    document.getElementById('summaryType').value = settings.summaryType;
    document.getElementById('summaryLength').value = settings.summaryLength;
    document.getElementById('summaryFormat').value = settings.summaryFormat;

    // Rewriter settings
    document.getElementById('rewritePrompt').value = settings.rewritePrompt || (translations[currentLanguage].rewritePromptDefault ?? DEFAULT_SETTINGS.rewritePrompt);

    // Enhancement settings
    document.getElementById('enhanceTemplate').value = settings.enhanceTemplate || (translations[currentLanguage].enhanceTemplateDefault ?? DEFAULT_SETTINGS.enhanceTemplate);

    // Visible buttons
    const visibleButtons = settings.visibleButtons || DEFAULT_SETTINGS.visibleButtons;
    Object.keys(visibleButtons).forEach(buttonId => {
      const checkbox = document.getElementById(`btn-${buttonId}`);
      if (checkbox) {
        checkbox.checked = visibleButtons[buttonId];
      }
    });

    console.log('Settings loaded:', settings);

    refreshFieldStates();
  });
}

// Save settings to storage
function saveSettings() {
  const settings = {
    uiLanguage: document.getElementById('uiLanguage').value,
    responseLanguage: document.getElementById('responseLanguage').value,
    inputTranslationTargetLanguage: document.getElementById('inputTranslationTargetLanguage').value,
    summaryType: document.getElementById('summaryType').value,
    summaryLength: document.getElementById('summaryLength').value,
    summaryFormat: document.getElementById('summaryFormat').value,
    rewritePrompt: document.getElementById('rewritePrompt').value.trim(),
    enhanceTemplate: document.getElementById('enhanceTemplate').value.trim(),
    visibleButtons: {
      translate: document.getElementById('btn-translate').checked,
      summarize: document.getElementById('btn-summarize').checked,
      rewrite: document.getElementById('btn-rewrite').checked,
      askAI: document.getElementById('btn-askAI').checked,
      copy: document.getElementById('btn-copy').checked,
      search: document.getElementById('btn-search').checked,
      enhance: document.getElementById('btn-enhance').checked,
      export: document.getElementById('btn-export').checked
    }
  };

  chrome.storage.local.set(settings, () => {
    console.log('Settings saved:', settings);
    showStatusMessage('settingsSaved', 'success');

    // Notify content scripts to reload settings
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { action: 'reloadSettings' }).catch(() => {
          // Ignore errors for tabs that don't have content script
        });
      });
    });
  });
}

// Reset settings to defaults
function resetSettings() {
  if (confirm(t('confirmReset'))) {
    const resetValues = {
      ...DEFAULT_SETTINGS,
      rewritePrompt: translations[currentLanguage].rewritePromptDefault || DEFAULT_SETTINGS.rewritePrompt,
      enhanceTemplate: translations[currentLanguage].enhanceTemplateDefault || DEFAULT_SETTINGS.enhanceTemplate
    };

    chrome.storage.local.set(resetValues, () => {
      console.log('Settings reset to defaults');
      loadSettings();
      showStatusMessage('settingsReset', 'success');
    });
  }
}

function initializeFieldObservers() {
  document.querySelectorAll('.md-field select, .md-field textarea, .md-field input[type="text"]').forEach((control) => {
    const field = control.closest('.md-field');
    if (!field) return;
    const handler = () => {
      const hasValue = control.value != null && control.value.trim() !== '';
      field.classList.toggle('has-value', hasValue);
    };
    control.addEventListener('input', handler);
    control.addEventListener('change', handler);
  });

  refreshFieldStates();
}

function refreshFieldStates() {
  document.querySelectorAll('.md-field').forEach((field) => {
    const control = field.querySelector('select, textarea, input[type="text"]');
    if (!control) return;
    const hasValue = control.value != null && control.value.trim() !== '';
    field.classList.toggle('has-value', hasValue);
  });
}

// Show status message
function showStatusMessage(messageKey, type = 'success') {
  const existing = document.querySelector('.status-message');
  if (existing) {
    existing.remove();
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = `status-message ${type}`;
  messageDiv.textContent = t(messageKey);
  document.body.appendChild(messageDiv);

  setTimeout(() => {
    messageDiv.style.opacity = '0';
    setTimeout(() => messageDiv.remove(), 300);
  }, 3000);
}

// Test AI availability on page load
window.addEventListener('load', async () => {
  try {
    // Check if AI APIs are available
    const checks = [];

    if ('ai' in self && 'summarizer' in self.ai) {
      checks.push('✓ Summarizer API available');
    } else {
      checks.push('✗ Summarizer API not available');
    }

    if ('translation' in self) {
      checks.push('✓ Translator API available');
    } else {
      checks.push('✗ Translator API not available');
    }

    if ('ai' in self && 'languageModel' in self.ai) {
      checks.push('✓ Prompt API (Language Model) available');
    } else {
      checks.push('✗ Prompt API not available');
    }

    console.log('AI API Availability:', checks);
  } catch (error) {
    console.error('Error checking AI availability:', error);
  }
});
