// Small, safe Markdown for the agent's answers: headings, paragraphs, lists, bold, italics, inline code,
// code blocks, quotes and callout cards. Everything is escaped first, so HTML in an answer (or in a file
// name it quotes) is shown as text, never run. Links are shown as plain text (no href). Unclosed markers
// stay as written, which keeps a streaming answer readable while it arrives.
//
// Callouts (the agent's "cards", see agent/voice.json): "> [!riesgo] Título" + "> detalle" lines.
// Kinds: riesgo/peligro, ok/bien, idea/consejo, paso/pasos, nota/info. Their icon is an
// <i data-icon> slot that the view fills (applyIcons in views/icons.js).
// File names in inline code (`src/db.js`) become <code class="file-ref" data-path> for the view to link.
import { escapeHtml } from '../../core/format.js';
import { strings } from '../../i18n/es.js';

const CALLOUTS = {
  riesgo: 'danger', peligro: 'danger', problema: 'danger',
  ok: 'ok', bien: 'ok', listo: 'ok',
  idea: 'idea', consejo: 'idea',
  paso: 'step', pasos: 'step', hacer: 'step',
  nota: 'info', info: 'info',
};
// A file or folder path: no spaces, and a folder separator or a file extension
const FILE_REF = /^(?!-)[\w@.\-/]{1,200}$/;
const looksLikePath = (text) => FILE_REF.test(text) && (/\//.test(text) || /\.[a-z0-9]{1,8}$/i.test(text)) && !/^\.+$/.test(text);

function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`\n]+)`/g, (_, code) => (looksLikePath(code)
      ? `<code class="file-ref" data-path="${code}" role="button" tabindex="0">${code}</code>`
      : `<code>${code}</code>`))
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '$1');
}

function quote(lines) {
  const head = /^\[!([a-záéíóú]+)\]\s*(.*)$/i.exec(lines[0]?.trim() ?? '');
  const kind = head && CALLOUTS[head[1].toLowerCase()];
  if (!kind) return `<blockquote>${markdownToHtml(lines.join('\n'))}</blockquote>`;
  const title = head[2].trim() || strings.chat.callouts[kind];
  const body = lines.slice(1).join('\n').trim();
  return `<div class="callout callout-${kind}"><div class="callout-head"><span class="callout-icon"><i data-icon="${kind}"></i></span><strong>${inline(title)}</strong></div>${body ? `<div class="callout-body">${markdownToHtml(body)}</div>` : ''}</div>`;
}

export function markdownToHtml(source) {
  const lines = String(source ?? '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let paragraph = [];
  let list = null; // { tag: 'ul' | 'ol', items: [] }
  let code = null; // lines of an open code block
  let quoted = null; // lines of an open quote / callout

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quoted) out.push(quote(quoted));
    quoted = null;
  };

  for (const line of lines) {
    if (code) {
      if (/^```/.test(line.trim())) { out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = null; }
      else code.push(line);
      continue;
    }
    const quoteLine = /^\s*>\s?(.*)$/.exec(line);
    if (quoteLine) {
      flushParagraph(); flushList();
      // a new "[!kind]" line starts the next callout
      if (quoted && /^\[![a-záéíóú]+\]/i.test(quoteLine[1].trim())) flushQuote();
      (quoted ??= []).push(quoteLine[1]);
      continue;
    }
    flushQuote();
    if (/^```/.test(line.trim())) { flushParagraph(); flushList(); code = []; continue; }
    const heading = /^#{1,6}\s+(.+)$/.exec(line.trim());
    const bullet = /^\s*[-*•]\s+(.+)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (heading) { flushParagraph(); flushList(); out.push(`<h4>${inline(heading[1])}</h4>`); continue; }
    if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? 'ul' : 'ol';
      if (list?.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push((bullet ?? numbered)[1]);
      continue;
    }
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    flushList();
    paragraph.push(line.trim());
  }
  if (code) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); // still streaming
  flushQuote();
  flushParagraph();
  flushList();
  return out.join('');
}
