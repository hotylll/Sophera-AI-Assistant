let languageDetectorInstance = null;

export function normalizeLanguageCode(code) {
  if (!code || code === 'auto') {
    return null;
  }
  if (code === 'zh_CN' || code === 'zh-CN') {
    return 'zh';
  }
  return code;
}

export function languageInstruction(code) {
  if (!code || code === 'auto') {
    return '';
  }
  switch (code) {
    case 'zh_CN':
    case 'zh-CN':
      return 'Please respond in Simplified Chinese.';
    case 'en':
      return 'Please respond in English.';
    default:
      return `Please respond in ${code}.`;
  }
}

export function isChineseLanguageCode(code) {
  const normalized = normalizeLanguageCode(code);
  return normalized === 'zh';
}

export async function ensureResultLanguage(text, desiredLanguage) {
  const targetLang = normalizeLanguageCode(desiredLanguage);
  if (!targetLang || !text || !text.trim()) {
    return text;
  }

  if (typeof Translator === 'undefined') {
    return text;
  }

  let sourceLang = 'en';
  const detector = await getLanguageDetector();
  if (detector) {
    try {
      const detections = await detector.detect(text);
      sourceLang = detections[0]?.detectedLanguage || sourceLang;
    } catch (error) {
      console.warn('Language detection failed for result:', error);
    }
  }

  if (sourceLang === targetLang) {
    return text;
  }

  const availability = await Translator.availability({
    sourceLanguage: sourceLang,
    targetLanguage: targetLang
  });

  if (availability === 'unavailable') {
    return text;
  }

  const translator = await Translator.create({
    sourceLanguage: sourceLang,
    targetLanguage: targetLang,
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', (event) => {
        if (event.total > 0) {
          console.log(`Post-processing translation download: ${Math.round((event.loaded / event.total) * 100)}%`);
        }
      });
    }
  });

  try {
    return await translator.translate(text);
  } finally {
    translator.destroy?.();
  }
}

export function resolveOutputLanguage(code) {
  return 'en';
}

export async function getStoredValues(keys) {
  const response = await chrome.runtime.sendMessage({
    target: 'background',
    action: 'getStoredValues',
    keys
  });

  if (!response?.success) {
    throw new Error(response?.error || 'Failed to load settings');
  }

  return response.values || {};
}

export async function getLanguageDetector() {
  if (typeof LanguageDetector === 'undefined') {
    return null;
  }

  if (!languageDetectorInstance) {
    const availability = await LanguageDetector.availability();
    if (availability === 'unavailable') {
      return null;
    }

    languageDetectorInstance = await LanguageDetector.create({
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => {
          if (event.total > 0) {
            console.log(`Language detector download: ${Math.round((event.loaded / event.total) * 100)}%`);
          }
        });
      }
    });
  }

  return languageDetectorInstance;
}

export async function createLanguageModelSession(options, desiredLanguage, forceDownload = false) {
  if (typeof LanguageModel === 'undefined') {
    throw new Error('Prompt API not available. This requires Chrome 138+ with AI features enabled.');
  }

  const availability = await LanguageModel.availability();
  if (availability === 'unavailable') {
    throw new Error('Language model is not available on this device');
  }

  const needsDownload = availability === 'downloadable' || availability === 'downloading';
  const finalForceDownload = forceDownload || needsDownload;

  if (needsDownload && !finalForceDownload) {
    const error = new Error('user_activation_required');
    error.code = 'user_activation_required';
    throw error;
  }

  return LanguageModel.create({
    ...options,
    outputLanguage: resolveOutputLanguage(desiredLanguage),
    download: finalForceDownload,
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', (event) => {
        if (event.total > 0) {
          console.log(`Language model download: ${Math.round((event.loaded / event.total) * 100)}%`);
        }
      });
    }
  });
}
