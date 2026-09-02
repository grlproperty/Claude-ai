/**
 * Links terms in a field note to the entry that defines them.
 *
 * A note explains a case; an entry defines a term. They were written as
 * separate things and left unconnected, so a reader who hit "Leaping Bunny"
 * mid-sentence had no way to find out what it actually certifies without
 * going back to the tools index and searching. Every note carried the same
 * boilerplate links to the six indexes and not one link to anything specific.
 *
 * It also matters for how the entry pages are found at all. They are new and
 * nothing points at them; internal links from the written work are the only
 * signal this site can give that they exist.
 *
 * Conservative by design. Only the first mention of a term is linked, never
 * more than MAX_PER_NOTE in one note, and never inside an existing link, a
 * heading, or code — the first because a paragraph stitched with links is
 * unreadable, the rest because they produce invalid or absurd markup.
 */

import { slugify } from './util.mjs';

const MAX_PER_NOTE = 6;
const MIN_TERM_LENGTH = 5;

/** Regions where a match must be ignored, by opening tag. */
const SKIP = /^(a|h[1-6]|code|pre|script|style)$/i;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Build the lookup once per build: term (lowercased) -> href.
 *
 * Longer terms are registered first so that "Certified Vegan" wins over
 * "Vegan" when both could match at the same position.
 */
export function buildTermIndex(types, data) {
  const terms = [];

  for (const type of types) {
    for (const entry of data[type.id][type.collection]) {
      const name = type.nameOf(entry);
      // Names carrying a parenthetical or a slash are the display form, not
      // the phrase anyone writes in prose. Take the part before it.
      const plain = name.split(/\s*[(/—]/)[0].trim();
      if (plain.length < MIN_TERM_LENGTH) continue;
      terms.push({ term: plain, href: `${type.base}${slugify(name)}/`, generic: Boolean(type.generic) });
    }
  }

  return terms.sort((a, b) => b.term.length - a.term.length);
}

/**
 * Walk the HTML once, linking in text regions only.
 */
export function crosslink(html, terms) {
  if (!terms.length) return html;

  const used = new Set();
  let linked = 0;
  let out = '';
  let i = 0;
  const openSkips = [];

  while (i < html.length) {
    const lt = html.indexOf('<', i);

    if (lt === -1) {
      out += openSkips.length ? html.slice(i) : linkText(html.slice(i));
      break;
    }

    const text = html.slice(i, lt);
    out += openSkips.length ? text : linkText(text);

    const gt = html.indexOf('>', lt);
    if (gt === -1) {
      out += html.slice(lt);
      break;
    }

    const tag = html.slice(lt, gt + 1);
    const m = /^<(\/?)([a-zA-Z0-9]+)/.exec(tag);
    if (m && SKIP.test(m[2])) {
      if (m[1]) openSkips.pop();
      else if (!/\/>$/.test(tag)) openSkips.push(m[2]);
    }

    out += tag;
    i = gt + 1;
  }

  return out;

  function linkText(chunk) {
    if (!chunk.trim() || linked >= MAX_PER_NOTE) return chunk;

    for (const { term, href, generic } of terms) {
      if (linked >= MAX_PER_NOTE) break;
      if (used.has(term.toLowerCase())) continue;

      const re = new RegExp(`(^|[^\\w-])(${escapeRe(term)})(?![\\w-])`, 'i');
      const hit = re.exec(chunk);
      if (!hit) continue;

      // A one-word generic term followed by a capitalised word is part of a
      // name, not a use of the term: "Clean Clothes Campaign", "Roundtable on
      // Sustainable Palm Oil", "Ecodesign for Sustainable Products
      // Regulation". Linking those to a greenwashing entry asserts something
      // false about a real organisation. Proper-noun datasets are exempt —
      // "Boohoo Group" really is Boohoo.
      if (generic && !/\s/.test(term)) {
        const after = chunk.slice(hit.index + hit[0].length);
        if (/^\s+[A-Z]/.test(after)) continue;
      }

      used.add(term.toLowerCase());
      linked += 1;
      chunk =
        chunk.slice(0, hit.index) +
        hit[1] +
        `<a class="crosslink" href="${href}">${hit[2]}</a>` +
        chunk.slice(hit.index + hit[0].length);
    }

    return chunk;
  }
}
