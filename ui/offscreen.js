import {
  languageInstruction,
  ensureResultLanguage,
  createLanguageModelSession,
  getStoredValues,
  isChineseLanguageCode,
  normalizeLanguageCode,
  getLanguageDetector
} from './shared/ai-common.js';
import { createI18n, resolveLanguage } from './shared/i18n.js';

console.log('AI Text Assistant: Offscreen document initialized');

// Session cache to avoid recreating sessions unnecessarily
// This helps prevent "user activation required" errors when sending messages after a delay
let cachedChatSession = null;
let sessionCreatedAt = null;
const SESSION_MAX_AGE = 2 * 60 * 1000; // 2 minutes (reduced from 5 to avoid session timeout)
const PROMPT_TIMEOUT = 60 * 1000; // 60 seconds timeout for prompt API calls

function isCachedSessionValid() {
  if (!cachedChatSession) {
    return false;
  }
  if (!sessionCreatedAt) {
    return false;
  }
  const age = Date.now() - sessionCreatedAt;
  const isValid = age < SESSION_MAX_AGE;
  if (!isValid) {
    console.log(`Cached session expired (age: ${Math.round(age / 1000)}s, max: ${Math.round(SESSION_MAX_AGE / 1000)}s)`);
  }
  return isValid;
}

function invalidateCachedSession() {
  if (cachedChatSession) {
    try {
      cachedChatSession.destroy?.();
      console.log('Cached session destroyed');
    } catch (error) {
      console.debug('Error destroying cached session:', error);
    }
    cachedChatSession = null;
    sessionCreatedAt = null;
  }
}

// Helper function to add timeout to a promise
function withTimeout(promise, timeoutMs, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== 'offscreen') {
    return false;
  }

  // Health check ping/pong
  if (message?.action === '__healthCheck') {
    console.log('Offscreen: Health check received, responding with pong');
    chrome.runtime.sendMessage({
      type: 'offscreen:pong',
      testId: message.testId
    }).catch((error) => {
      console.error('Failed to send pong response:', error);
    });
    sendResponse({ success: true });
    return true;
  }

  const handler = aiHandlers[message.action];

  if (!handler) {
    sendResponse({ success: false, error: 'Unknown action' });
    return false;
  }

  handler(message.text, message.options)
    .then((result) => {
      sendResponse({ success: true, result });
    })
    .catch((error) => {
      console.error(`${message.action} error:`, error);
      sendResponse({ success: false, error: error.message, code: error.code });
    });

  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ai-chat-stream') {
    return;
  }

  port.onMessage.addListener((message) => {
    if (!message) {
      return;
    }

    if (message.type === 'cancel') {
      port.disconnect();
      return;
    }

    if (message.type !== 'start') {
      return;
    }

    const { requestId, payload } = message;
    handleChatStreamRequest(port, requestId, payload).catch((error) => {
      console.error('Chat stream failed:', error);
      if (isPortDisconnectedError(error)) {
        return;
      }
      try {
        safePortPostMessage(port, {
          type: 'error',
          requestId,
          code: error.code || 'ai_error',
          error: error.message || 'Failed to generate AI response.'
        });
      } catch (postError) {
        if (!isPortDisconnectedError(postError)) {
          console.error('Failed to report chat error to background:', postError);
        }
      }
    });
  });

  port.onDisconnect.addListener(() => {
    // Nothing special yet, streaming will stop automatically.
  });
});

const aiHandlers = {
  translate: handleTranslate,
  summarize: handleSummarize,
  rewrite: handleRewrite,
  askAI: handleAskAI,
  enhance: handleEnhance,
  inPlaceTranslate: handleInPlaceTranslate
};

const DEFAULT_CHAT_SYSTEM_PROMPT = [
  '# Role: Helpful Browser Companion',
  '',
  'You live inside a Chrome extension sidebar and assist the user with any question or task.',
  'Rely on any provided context from browser tabs but never fabricate details.',
  'Keep responses concise, structured, and easy to skim. Mention context titles naturally when they influence the answer.'
].join('\n');

const IN_PLACE_TRANSLATION_TEMPLATE = `You are a professional {{to}} native translator who needs to fluently translate text into {{to}}.

## Translation Rules
1. Output only the translated content, without explanations or additional content (such as "Here's the translation:" or "Translation as follows:")
2. The returned translation must maintain exactly the same number of paragraphs and format as the original text
3. If the text contains HTML tags, consider where the tags should be placed in the translation while maintaining fluency
4. For content that should not be translated (such as proper nouns, code, etc.), keep the original text.
5. If input contains %%, use %% in your output, if input has no %%, don't use %% in your output{{title_prompt}}{{summary_prompt}}{{terms_prompt}}

## OUTPUT FORMAT:
- **Single paragraph input** → Output translation directly (no separators, no extra text)
- **Multi-paragraph input** → Use %% as paragraph separator between translations

## Examples
### Multi-paragraph Input:
Paragraph A
%%
Paragraph B
%%
Paragraph C
%%
Paragraph D

### Multi-paragraph Output:
Translation A
%%
Translation B
%%
Translation C
%%
Translation D

### Single paragraph Input:
Single paragraph content

### Single paragraph Output:
Direct translation without separators`;

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

const DEFAULT_ENHANCE_TEMPLATE_ZH = [
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
].join('\n');

const ENHANCE_SELECTED_TEXT_PLACEHOLDER_REGEX = /\$\{action\.selectedText\s*\?\?\s*(['"])\1\}/g;

async function handleTranslate(text) {
  if (!('Translator' in self)) {
    throw new Error('Translator API not available in this browser');
  }

  const settings = await getStoredValues(['responseLanguage']);
  let sourceLang = 'en';
  const detector = await getLanguageDetector();
  if (detector) {
    try {
      const detections = await detector.detect(text);
      sourceLang = detections[0]?.detectedLanguage || sourceLang;
    } catch (error) {
      console.warn('Language detection failed:', error);
    }
  }

  const preferredTarget = normalizeLanguageCode(settings.responseLanguage);
  const targetLang = preferredTarget || (sourceLang === 'en' ? 'zh' : 'en');

  if (targetLang === sourceLang) {
    return text;
  }
  const availability = await Translator.availability({
    sourceLanguage: sourceLang,
    targetLanguage: targetLang
  });

  if (availability === 'unavailable') {
    throw new Error(`Translation from ${sourceLang} to ${targetLang} is not supported`);
  }

  const translator = await Translator.create({
    sourceLanguage: sourceLang,
    targetLanguage: targetLang,
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', (event) => {
        if (event.total > 0) {
          console.log(`Translation model download: ${Math.round((event.loaded / event.total) * 100)}%`);
        }
      });
    }
  });

  const result = await translator.translate(text);
  translator.destroy?.();
  return result;
}

async function handleSummarize(text) {
  if (!('Summarizer' in self)) {
    throw new Error('Summarizer API not available');
  }

  const availability = await Summarizer.availability();
  if (availability === 'unavailable') {
    throw new Error('Summarizer is not available on this device');
  }

  const options = await getStoredValues(['summaryType', 'summaryLength', 'summaryFormat', 'responseLanguage']);

  const summarizerOptions = {
    type: options.summaryType || 'key-points',
    format: options.summaryFormat || 'markdown',
    length: options.summaryLength || 'medium',
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', (event) => {
        if (event.total > 0) {
          console.log(`Summarizer model download: ${Math.round((event.loaded / event.total) * 100)}%`);
        }
      });
    }
  };

  const summarizer = await Summarizer.create(summarizerOptions);
  const result = await summarizer.summarize(text);
  summarizer.destroy?.();
  return ensureResultLanguage(result, options.responseLanguage);
}

async function handleRewrite(text, options = {}) {
  const storage = await getStoredValues(['rewritePrompt', 'responseLanguage']);
  const finalResponseLanguage = options.responseLanguage || storage.responseLanguage;

  const session = await createLanguageModelSession({
    systemPrompt: 'You are a helpful writing assistant that improves text clarity and quality.'
  }, finalResponseLanguage, options.forceDownload === true);
  const customPrompt = storage.rewritePrompt ||
    'Please rewrite the following text to make it clearer, more concise, and better structured while preserving the original meaning:';

  const languageHint = languageInstruction(finalResponseLanguage);
  const fullPrompt = `${customPrompt}${languageHint ? `\n\n${languageHint}` : ''}\n\n${text}`;
  try {
    const result = await session.prompt(fullPrompt);
    return ensureResultLanguage(result, finalResponseLanguage);
  } finally {
    session.destroy();
  }
}

async function handleAskAI(text, options = {}) {
  const settings = await getStoredValues(['responseLanguage']);
  const finalResponseLanguage = options.responseLanguage || settings.responseLanguage;

  const session = await createLanguageModelSession({
    systemPrompt: 'You are a helpful AI assistant. Provide clear, concise, and informative responses.'
  }, finalResponseLanguage, options.forceDownload === true);
  const languageHint = languageInstruction(finalResponseLanguage);
  const prompt = `Please analyze or answer questions about the following text.${languageHint ? `\n\n${languageHint}` : ''}\n\n${text}`;
  try {
    const result = await session.prompt(prompt);
    return ensureResultLanguage(result, finalResponseLanguage);
  } finally {
    session.destroy();
  }
}

async function handleEnhance(text, options = {}) {
  const storage = await getStoredValues(['enhanceTemplate', 'responseLanguage']);
  const finalResponseLanguage = options.responseLanguage || storage.responseLanguage;
  const sanitizedText = sanitizeEnhanceInput(text);
  const templateFromStorage = (storage.enhanceTemplate || '').trim();
  const usingChinese = isChineseLanguageCode(finalResponseLanguage);
  const template = templateFromStorage || (usingChinese ? DEFAULT_ENHANCE_TEMPLATE_ZH : DEFAULT_ENHANCE_TEMPLATE_EN);
  const resolvedTemplate = buildEnhanceResolvedTemplate(template, sanitizedText, usingChinese);
  const { systemPrompt, userPrompt } = splitEnhanceResolvedTemplate(
    resolvedTemplate,
    sanitizedText,
    usingChinese
  );
  const normalizedSystemPrompt = systemPrompt.trim();
  const fallbackSystemPrompt = stripEnhanceInputHeadings(usingChinese ? DEFAULT_ENHANCE_TEMPLATE_ZH : DEFAULT_ENHANCE_TEMPLATE_EN);

  const session = await createLanguageModelSession({
    systemPrompt: normalizedSystemPrompt || fallbackSystemPrompt
  }, finalResponseLanguage, options.forceDownload === true);

  try {
    let result = await session.prompt(userPrompt);
    result = sanitizeEnhancedResult(result);
    return ensureResultLanguage(result, finalResponseLanguage);
  } finally {
    session.destroy();
  }
}

async function handleInPlaceTranslate(text, options = {}) {
  const rawInput = typeof text === 'string' ? text : '';
  const trimmedInput = rawInput.trim();
  if (!trimmedInput) {
    return rawInput;
  }

  const settings = await getStoredValues(['inputTranslationTargetLanguage']);
  const targetSetting = settings.inputTranslationTargetLanguage || 'en';
  const systemPrompt = buildInPlaceTranslationPrompt(targetSetting);
  const userPrompt = buildInPlaceTranslationUserPrompt(targetSetting, trimmedInput);

  const session = await createLanguageModelSession({
    systemPrompt
  }, 'en', true);

  try {
    if (session?.ready && typeof session.ready.then === 'function') {
      await withTimeout(
        session.ready,
        PROMPT_TIMEOUT,
        'Translation model initialization timed out'
      );
    }

    const response = await withTimeout(
      session.prompt(userPrompt),
      PROMPT_TIMEOUT,
      'Translation timed out'
    );

    const preliminary = typeof response === 'string' ? response.trim() : '';
    if (!preliminary) {
      const error = new Error('No translation result');
      error.code = 'empty_translation';
      throw error;
    }

    const ensured = await ensureResultLanguage(preliminary, targetSetting);
    const finalText = normalizeInPlaceTranslationOutput(ensured);

    if (!finalText) {
      const error = new Error('Translation unavailable');
      error.code = 'translation_failed';
      throw error;
    }

    return finalText;
  } finally {
    session.destroy?.();
  }
}

function buildInPlaceTranslationPrompt(targetCode) {
  const label = resolveInPlaceTargetLanguageLabel(targetCode);
  const replacements = {
    to: label,
    title_prompt: '',
    summary_prompt: '',
    terms_prompt: ''
  };
  return IN_PLACE_TRANSLATION_TEMPLATE.replace(/{{(\w+)}}/g, (_, key) => {
    return replacements[key] ?? '';
  });
}

function buildInPlaceTranslationUserPrompt(targetCode, content) {
  const languageLabel = resolveInPlaceTargetLanguageLabel(targetCode);
  const normalizedContent = content.replace(/\s+$/u, '');
  return [
    `Translate the following text into ${languageLabel}.`,
    'Apply the translation rules from the system prompt. Return only the translated content without commentary.',
    'If multiple paragraphs exist, preserve structure and separate paragraphs with %% as instructed.',
    '',
    '<INPUT>',
    normalizedContent,
    '</INPUT>'
  ].join('\n');
}

function resolveInPlaceTargetLanguageLabel(code) {
  if (code === 'zh_CN' || code === 'zh-CN' || code === 'zh') {
    return 'Simplified Chinese';
  }
  return 'English';
}

function normalizeInPlaceTranslationOutput(text) {
  if (text == null) {
    return '';
  }
  const trimmed = String(text).trim();
  if (!trimmed) {
    return '';
  }
  if (!trimmed.includes('%%')) {
    return trimmed;
  }

  const segments = trimmed.split('%%').map((segment) => segment.trim());
  return segments.join('\n\n').trim();
}

function sanitizeEnhancedResult(result) {
  if (!result) {
    return result;
  }

  let cleaned = result.trim();

  // Remove any XML tags that might have been accidentally included
  cleaned = cleaned.replace(/<\/?INPUT>/gi, '');

  // Remove surrounding quotes if present
  cleaned = cleaned.replace(/^"|"$/g, '');

  // Remove common prefixes that AI might add
  cleaned = cleaned.replace(/^Here\b.*?:/i, '');
  cleaned = cleaned.replace(/^\s*Here\b.*?\n+/i, '');
  cleaned = cleaned.replace(/^\s*\*\*[^\n]+\*\*\s*:*/g, '');
  cleaned = cleaned.replace(/^\s*\*\*[^\n]+\*\*\s*/g, '');

  // Return the full cleaned text (not just first line), as optimization might be multi-line
  return cleaned.trim();
}

function buildEnhanceResolvedTemplate(template, sanitizedText, usingChinese) {
  const fallbackTemplate = usingChinese ? DEFAULT_ENHANCE_TEMPLATE_ZH : DEFAULT_ENHANCE_TEMPLATE_EN;
  const base = (template && template.trim()) ? template : fallbackTemplate;
  const content = sanitizedText ?? '';

  ENHANCE_SELECTED_TEXT_PLACEHOLDER_REGEX.lastIndex = 0;
  const placeholderReplaced = base.replace(ENHANCE_SELECTED_TEXT_PLACEHOLDER_REGEX, content);
  if (placeholderReplaced !== base) {
    return placeholderReplaced;
  }

  if (base.includes('<INPUT>') && base.includes('</INPUT>')) {
    return base.replace(/<INPUT>[\s\S]*?<\/INPUT>/i, `<INPUT>${content}</INPUT>`);
  }

  if (!content) {
    return base;
  }

  return `${base}\n\n<INPUT>${content}</INPUT>`;
}

function splitEnhanceResolvedTemplate(resolvedTemplate, sanitizedText, usingChinese, depth = 0) {
  const fallbackTemplate = usingChinese ? DEFAULT_ENHANCE_TEMPLATE_ZH : DEFAULT_ENHANCE_TEMPLATE_EN;
  const templateText = (resolvedTemplate && resolvedTemplate.trim())
    ? resolvedTemplate
    : buildEnhanceResolvedTemplate(fallbackTemplate, sanitizedText, usingChinese);

  const fallbackUser = sanitizedText
    ? `<INPUT>${sanitizedText}</INPUT>`
    : (usingChinese ? '请按照系统指令优化文本。' : 'Please refine the text according to the system instructions.');

  const inputMatch = templateText.match(/<INPUT>[\s\S]*?<\/INPUT>/i);
  const userPrompt = (inputMatch ? inputMatch[0] : fallbackUser).trim();

  let systemPrompt = templateText;
  if (inputMatch) {
    systemPrompt = `${templateText.slice(0, inputMatch.index)}${templateText.slice(inputMatch.index + inputMatch[0].length)}`;
  }

  systemPrompt = stripEnhanceInputHeadings(systemPrompt);

  if (!systemPrompt && depth === 0) {
    const fallbackResolved = buildEnhanceResolvedTemplate(fallbackTemplate, sanitizedText, usingChinese);
    return splitEnhanceResolvedTemplate(fallbackResolved, sanitizedText, usingChinese, depth + 1);
  }

  const finalSystemPrompt = systemPrompt || stripEnhanceInputHeadings(fallbackTemplate) || fallbackTemplate;

  return {
    systemPrompt: finalSystemPrompt.trim(),
    userPrompt
  };
}

function sanitizeEnhanceInput(text) {
  if (text == null) {
    return '';
  }
  return String(text).replace(/<\/?INPUT>/gi, '');
}

function stripEnhanceInputHeadings(text) {
  if (!text) {
    return '';
  }

  let cleaned = text.replace(/<INPUT>[\s\S]*?<\/INPUT>/gi, '');
  cleaned = cleaned.replace(/^[ \t]*##\s*(?:Text\s*to\s*(?:Refine|Process|Optimize)|待处理文本|待优化文本)[:：]?\s*(?:\r?\n)?/gim, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}

const offscreenI18n = createI18n('en');

function buildQuoteSection(quotes, question, language) {
  if (!Array.isArray(quotes) || !quotes.length) {
    return '';
  }

  const resolvedLang = resolveLanguage(language);
  offscreenI18n.setLanguage(resolvedLang);

  const normalizedQuestion = (question || '').trim() || '（用户尚未提供明确问题）';

  const formattedQuotes = quotes
    .map((quote) => {
      const text = (quote?.text || '').trim();
      if (!text) {
        return '';
      }
      const header = quote?.sourceTitle || quote?.sourceUrl || '';
      const quotedText = text
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      const metaLine = header ? `\n> — ${header}` : '';
      return `${quotedText}${metaLine}`;
    })
    .filter(Boolean)
    .join('\n\n');

  if (!formattedQuotes) {
    return '';
  }

  const instruction = offscreenI18n.t('promptInstruction');
  const contextHeader = offscreenI18n.t('promptContextHeader');
  const questionHeader = offscreenI18n.t('promptQuestionHeader');

  return [
    instruction,
    '',
    `# ${contextHeader}`,
    '',
    formattedQuotes,
    '',
    `# ${questionHeader}`,
    '',
    normalizedQuestion
  ].join('\n');
}

async function handleChatStreamRequest(port, requestId, payload = {}) {
  const settings = await getStoredValues(['responseLanguage']);
  const finalResponseLanguage = payload.responseLanguage || settings.responseLanguage;
  const normalizedTargetLanguage = normalizeLanguageCode(finalResponseLanguage);
  const needsTranslation = Boolean(normalizedTargetLanguage && normalizedTargetLanguage !== 'en');
  const languageHint = needsTranslation
    ? languageInstruction('en')
    : languageInstruction(finalResponseLanguage);
  const systemPrompt = payload.systemPrompt || DEFAULT_CHAT_SYSTEM_PROMPT;
  const history = Array.isArray(payload.history) ? payload.history : [];
  const contexts = Array.isArray(payload.contexts) ? payload.contexts : [];
  const quotes = Array.isArray(payload.quotes) ? payload.quotes : [];
  const message = payload.message || '';
  const forceDownload = payload.forceDownload === true;

  const contextSection = contexts.length
    ? contexts.map((ctx, index) => {
        const header = ctx.title ? `${ctx.title} (${ctx.url || ''})` : ctx.url || `Context ${index + 1}`;
        return `Context ${index + 1}: ${header}\n${ctx.content || ''}`.trim();
      }).join('\n\n')
    : '';

  const historySection = history.length
    ? history.map((turn) => {
        const role = turn.role === 'assistant' ? 'Assistant' : 'User';
        return `${role}: ${turn.content}`;
      }).join('\n')
    : '';

  const quoteTemplate = buildQuoteSection(quotes, message, finalResponseLanguage);
  const promptSections = [];

  if (contextSection) {
    promptSections.push('Relevant context from browser tabs:\n' + contextSection);
  }
  if (historySection) {
    promptSections.push('Conversation so far:\n' + historySection);
  }

  if (quoteTemplate) {
    promptSections.push(quoteTemplate);
  } else {
    promptSections.push('User message:\n' + message);
  }

  if (languageHint) {
    promptSections.push(languageHint);
  }

  const userPrompt = promptSections.join('\n\n') || message || '请根据给定信息回答。';
  const sessionOptions = { systemPrompt };

  // Helper to get or create a session with retry logic
  const getOrCreateSession = async (retryWithDownload = false) => {
    // If we have a valid cached session and not forcing download, reuse it
    if (isCachedSessionValid() && !forceDownload && !retryWithDownload) {
      console.log('Reusing cached chat session');
      return cachedChatSession;
    }

    // Otherwise, invalidate old session and create a new one
    invalidateCachedSession();
    console.log('Creating new chat session');

    try {
      const newSession = await createLanguageModelSession(
        sessionOptions,
        finalResponseLanguage,
        forceDownload || retryWithDownload
      );

      // Cache the new session
      cachedChatSession = newSession;
      sessionCreatedAt = Date.now();

      return newSession;
    } catch (error) {
      // If we get a user_activation_required error and haven't tried forceDownload yet,
      // retry with forceDownload=true
      if (error.code === 'user_activation_required' && !retryWithDownload && !forceDownload) {
        console.warn('User activation required, retrying with forceDownload...');
        return getOrCreateSession(true);
      }
      throw error;
    }
  };

  let session = null;
  let shouldKeepSession = true;

  try {
    session = await getOrCreateSession();
    console.log('Starting streaming with session...');
    await streamResultWithFallback(session, userPrompt, port, requestId, {
      needsTranslation,
      desiredLanguage: finalResponseLanguage
    });
    console.log('Streaming completed successfully');
  } catch (error) {
    if (!isPortDisconnectedError(error)) {
      const isTimeout = error.message && error.message.includes('timed out');
      console.error(`Chat stream error (${isTimeout ? 'TIMEOUT' : 'GENERAL'}):`, error.message);

      // Invalidate the cached session since it failed
      invalidateCachedSession();
      shouldKeepSession = false;

      console.log('Retrying with fresh session and forceDownload...');

      try {
        // Create a fresh session with forceDownload
        session = await getOrCreateSession(true);

        await streamResultWithFallback(session, userPrompt, port, requestId, {
          needsTranslation,
          desiredLanguage: finalResponseLanguage,
          skipStreaming: true
        });

        console.log('Retry succeeded, caching new session');
        // If retry succeeded, cache this session
        cachedChatSession = session;
        sessionCreatedAt = Date.now();
        shouldKeepSession = true;
        return;
      } catch (retryError) {
        console.error('Retry also failed:', retryError.message);
        // If retry also failed, don't keep the session
        shouldKeepSession = false;
        throw retryError;
      }
    }
    console.error('Port disconnected error, abandoning request');
    shouldKeepSession = false;
    throw error;
  } finally {
    // Only destroy the session if it's not cached or if we encountered an error
    if (!shouldKeepSession && session) {
      console.log('Cleaning up failed session');
      session.destroy?.();
      if (session === cachedChatSession) {
        cachedChatSession = null;
        sessionCreatedAt = null;
      }
    }
  }
}

async function streamResultWithFallback(session, prompt, port, requestId, options = {}) {
  const { needsTranslation = false, desiredLanguage = null, skipStreaming = false } = options;
  let aggregated = '';
  let chunkCount = 0;

  const handleChunk = (chunk) => {
    if (!chunk) {
      return;
    }
    chunkCount += 1;
    aggregated += chunk;
    if (!needsTranslation) {
      safePortPostMessage(port, { type: 'chunk', requestId, chunk });
    }
  };

  if (!skipStreaming && typeof session.promptStreaming === 'function') {
    try {
      console.log('Starting streaming prompt...');
      const streamResult = await withTimeout(
        session.promptStreaming(prompt),
        PROMPT_TIMEOUT,
        'Prompt streaming timed out after 30 seconds'
      );
      const consumed = await consumeStreamResult(streamResult, handleChunk);
      if (!consumed && !chunkCount) {
        console.log('Stream not consumed, falling back to single prompt');
        aggregated = await withTimeout(
          session.prompt(prompt),
          PROMPT_TIMEOUT,
          'Prompt call timed out after 30 seconds'
        );
      }
    } catch (error) {
      if (isPortDisconnectedError(error)) {
        throw error;
      }
      console.warn('promptStreaming failed, falling back to single response:', error);
      if (!aggregated && !chunkCount) {
        aggregated = await withTimeout(
          session.prompt(prompt),
          PROMPT_TIMEOUT,
          'Prompt call timed out after 30 seconds'
        );
      }
    }
  } else {
    console.log('Using single prompt (streaming not available or skipped)');
    aggregated = await withTimeout(
      session.prompt(prompt),
      PROMPT_TIMEOUT,
      'Prompt call timed out after 30 seconds'
    );
  }

  if (needsTranslation) {
    let translated = aggregated;
    try {
      translated = await ensureResultLanguage(aggregated, desiredLanguage);
    } catch (error) {
      console.warn('Post-translation failed, falling back to original text:', error);
    }
    await emitFakeStream(translated || '', port, requestId);
    return;
  }

  if (!chunkCount) {
    await emitFakeStream(aggregated || '', port, requestId);
    return;
  }

  safePortPostMessage(port, { type: 'done', requestId, finalText: aggregated });
}

async function consumeStreamResult(streamResult, onChunk) {
  if (!streamResult) {
    return false;
  }

  if (typeof streamResult === 'string') {
    onChunk(streamResult);
    return true;
  }

  if (streamResult?.stream?.getReader) {
    await readStream(streamResult.stream.getReader(), onChunk);
    return true;
  }

  if (streamResult?.readable?.getReader) {
    await readStream(streamResult.readable.getReader(), onChunk);
    return true;
  }

  if (typeof streamResult[Symbol.asyncIterator] === 'function') {
    for await (const value of streamResult) {
      const chunk = toChunkString(value);
      if (chunk) {
        onChunk(chunk);
      }
    }
    return true;
  }

  if (streamResult?.response?.body?.getReader) {
    await readStream(streamResult.response.body.getReader(), onChunk);
    return true;
  }

  return false;
}

async function readStream(reader, onChunk) {
  while (reader) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    const chunk = toChunkString(value);
    if (chunk) {
      onChunk(chunk);
    }
  }
}

function toChunkString(value) {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value?.text && typeof value.text === 'string') {
    return value.text;
  }
  if (value?.delta && typeof value.delta === 'string') {
    return value.delta;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toChunkString(item)).join('');
  }
  try {
    return String(value);
  } catch (error) {
    console.warn('Unable to coerce chunk to string:', error);
    return '';
  }
}

async function emitFakeStream(text, port, requestId) {
  if (!text) {
    safePortPostMessage(port, { type: 'done', requestId, finalText: '' });
    return;
  }

  const segments = splitTextForStreaming(text);
  for (const segment of segments) {
    safePortPostMessage(port, { type: 'chunk', requestId, chunk: segment });
    await delay(40);
  }

  safePortPostMessage(port, { type: 'done', requestId, finalText: text });
}

function isPortDisconnectedError(error) {
  if (!error) {
    return false;
  }
  if (error.code === 'port_disconnected') {
    return true;
  }
  const message = String(error?.message || error);
  return message.includes('disconnected port object');
}

function safePortPostMessage(port, message) {
  if (!port) {
    throw createPortDisconnectedError();
  }
  try {
    port.postMessage(message);
  } catch (error) {
    if (isPortDisconnectedError(error)) {
      throw createPortDisconnectedError(error);
    }
    throw error;
  }
}

function createPortDisconnectedError(cause) {
  const error = new Error('Port disconnected');
  error.code = 'port_disconnected';
  if (cause) {
    error.cause = cause;
  }
  return error;
}

function splitTextForStreaming(text) {
  const parts = [];
  const sentences = text.split(/(?<=[。！？.!?\n])/u);
  let buffer = '';

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) {
      continue;
    }
    if ((buffer + ' ' + trimmed).trim().length > 120) {
      if (buffer) {
        parts.push(buffer.trim());
      }
      buffer = trimmed;
    } else {
      buffer = `${buffer} ${trimmed}`.trim();
    }
  }

  if (buffer) {
    parts.push(buffer.trim());
  }

  return parts.length ? parts : [text];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
