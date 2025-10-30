export function escapeHtml(raw) {
  if (raw == null) {
    return '';
  }
  return String(raw).replace(/[&<>'"]/g, (match) => {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return map[match] || match;
  });
}

export function renderMarkdownSafe(markdownText) {
  const text = escapeHtml(markdownText || '');
  if (!text.trim()) {
    return '';
  }

  const lines = text.split(/\r?\n/);
  let html = '';
  let inUl = false;
  let inOl = false;
  let inCodeBlock = false;
  let codeBlockLanguage = '';
  const codeBlockLines = [];
  let codeFenceLength = 0;

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

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmedLine = line.trim();

    if (inCodeBlock) {
      if (isClosingCodeFence(trimmedLine, codeFenceLength)) {
        html += renderCodeBlock(codeBlockLines.join('\n'), codeBlockLanguage);
        codeBlockLines.length = 0;
        codeBlockLanguage = '';
        inCodeBlock = false;
        codeFenceLength = 0;
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
      html += '<p class="ai-md-paragraph ai-md-paragraph--spacer"></p>';
      continue;
    }

    const listMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    if (listMatch) {
      if (!inUl) {
        closeLists();
        html += '<ul class="ai-md-list">';
        inUl = true;
      }
      html += `<li>${applyInlineMarkdown(listMatch[1])}</li>`;
      continue;
    }

    const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (orderedMatch) {
      if (!inOl) {
        closeLists();
        html += '<ol class="ai-md-list">';
        inOl = true;
      }
      html += `<li>${applyInlineMarkdown(orderedMatch[1])}</li>`;
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

  if (inCodeBlock) {
    html += renderCodeBlock(codeBlockLines.join('\n'), codeBlockLanguage);
  }

  closeLists();
  return html || `<p class="ai-md-paragraph">${text}</p>`;
}

function applyInlineMarkdown(text) {
  let result = text;

  result = result.replace(/`([^`]+)`/g, '<code class="ai-md-code">$1</code>');

  result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  result = result.replace(/(^|[^*])\*([^*]+)\*/g, (_, prefix, content) => `${prefix}<em>${content}</em>`);

  return result;
}

export function renderMarkdownToFragment(markdownText) {
  const html = renderMarkdownSafe(markdownText);
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
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
