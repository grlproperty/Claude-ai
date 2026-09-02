import { Marked } from 'marked';

/** Escape for HTML text and double-quoted attribute contexts. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Typographic pass applied to plain-text fields (titles, summaries, captions)
 * so the editorial voice reads correctly without authors hand-typing entities.
 * Markdown body copy goes through `renderMarkdown`, which applies marked's own
 * smartypants-equivalent handling.
 */
export function typo(value) {
  return String(value ?? '')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/\.\.\./g, '…')
    .replace(/(^|[\s(\[])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(\w)'(\w)/g, '$1’$2')
    .replace(/(^|[\s(\[])'/g, '$1‘')
    .replace(/'/g, '’');
}

/** Long-form British date, e.g. "11 March 2013". */
export function formatDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

export function formatMonth(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

export function isoDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** 200 wpm, rounded up, floored at one minute. */
export function readingTime(text) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/**
 * Reverses the entity escaping marked applies to inline text. Heading text is
 * captured from rendered HTML for the table of contents and then re-escaped on
 * output, so without this an apostrophe ships as a visible `&#39;`.
 */
export function decodeEntities(html) {
  return String(html ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

export function stripMarkdown(md) {
  return String(md ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function excerpt(text, length = 200) {
  const clean = stripMarkdown(text);
  if (clean.length <= length) return clean;
  const cut = clean.slice(0, length);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/**
 * Markdown renderer. Headings are given stable ids so the table of contents,
 * deep links, and the citation apparatus can all address them.
 */
export function renderMarkdown(md, { headings } = {}) {
  // A fresh instance per document: the heading-id counter and the collected
  // table of contents are per-document state, and a shared renderer would leak
  // one entry's headings into the next.
  const marked = new Marked({ gfm: true, breaks: false });
  const seen = new Map();

  marked.use({
    renderer: {
      // marked 12 passes already-parsed inline HTML, not tokens.
      heading(text, depth) {
        const plain = decodeEntities(stripMarkdown(text));
        let id = slugify(plain);
        if (seen.has(id)) {
          const n = seen.get(id) + 1;
          seen.set(id, n);
          id = `${id}-${n}`;
        } else {
          seen.set(id, 1);
        }
        if (headings && depth >= 2 && depth <= 3) headings.push({ depth, id, text: plain });
        return `<h${depth} id="${id}">${text}</h${depth}>\n`;
      },
      link(href, title, text) {
        const external = /^https?:\/\//.test(href ?? '');
        const attrs = [
          `href="${esc(href)}"`,
          title ? `title="${esc(title)}"` : '',
          external ? 'target="_blank" rel="noopener noreferrer"' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return `<a ${attrs}>${text}</a>`;
      },
      // Wrapped so a wide table scrolls inside itself rather than the page.
      table(header, body) {
        return `<div class="scroll-x"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>\n`;
      },
    },
  });

  return marked.parse(String(md ?? ''), { async: false });
}

/** Days since an ISO date, used to flag datasets that are due for review. */
export function daysSince(iso) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return Infinity;
  return Math.floor((Date.now() - then.getTime()) / 86400000);
}

export const attr = (name, value) => (value ? ` ${name}="${esc(value)}"` : '');
