/** Pure checks for Feral Femme agents: the editorial standards as code. */
export const CLASSES = ['established_fact', 'allegation', 'finding', 'opinion', 'editorial_interpretation', 'unresolved'];
export const NEEDS_SOURCE = new Set(['established_fact', 'allegation', 'finding']);
export const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 80);
const ATTRIBUTION = /\b(alleg\w*|accus\w*|claim\w*|according to|sued|suing|lawsuit|complain\w*|said|says|stated|filed|charged|argu\w*)\b/i;
const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** Structural source check. It cannot tell whether the source says what a claim says — a person does that. */
export function checkSource(src, authorities) {
  const problems = [];
  if (!src.publisher) problems.push('no publisher named');
  if (!src.title) problems.push('no title');
  if (!src.url || !/^https:\/\//.test(src.url) || !host(src.url)) problems.push('no working https link');
  if (!src.date || !DATE.test(String(src.date))) problems.push('no publication date (YYYY, YYYY-MM or YYYY-MM-DD)');
  if (!['primary', 'coverage', 'study', 'dataset'].includes(src.type)) problems.push('type must be primary, coverage, study or dataset');
  const h = host(src.url || '');
  const standing = authorities.some((a) => (h && host(a.url) === h) || (src.publisher && a.name.toLowerCase() === src.publisher.toLowerCase()));
  return { ok: problems.length === 0, problems, authority: standing ? 'on the standing list of cited authorities' : 'not on the standing list — a person must vet this publisher' };
}

export function classifyClaims(claims, sources) {
  const problems = [], table = [];
  claims.forEach((c, i) => {
    const n = i + 1; const refs = (c.sources || []).map((k) => sources[k - 1]).filter(Boolean);
    if (!CLASSES.includes(c.classification)) problems.push(`Claim ${n}: classification must be one of ${CLASSES.join(', ')}`);
    if (NEEDS_SOURCE.has(c.classification) && !refs.length) problems.push(`Claim ${n}: no traceable source`);
    if ((c.sources || []).some((k) => !sources[k - 1])) problems.push(`Claim ${n}: refers to a source number that does not exist`);
    if (c.classification === 'allegation' && !ATTRIBUTION.test(c.text)) problems.push(`Claim ${n}: an allegation must say who alleges it — as worded it reads as established fact`);
    if (c.classification === 'established_fact' && ATTRIBUTION.test(c.text) && /alleg|accus|lawsuit|sued/i.test(c.text)) problems.push(`Claim ${n}: describes an allegation but is classified as established fact`);
    if (/\d/.test(c.text.replace(/\b(19|20)\d{2}\b/g, '')) && NEEDS_SOURCE.has(c.classification) && refs.some((s) => !s.publisher || !s.date)) problems.push(`Claim ${n}: a figure needs a named body and a dated publication`);
    if (c.classification === 'established_fact' && refs.length && refs.every((s) => s.type === 'coverage')) table.push({ n, note: 'Rests on coverage only — cite the primary instrument if one exists' });
    table.push({ n, classification: c.classification, text: c.text, sources: refs.map((s) => `${s.publisher} (${s.date})`), limitation: c.limitation || null });
  });
  return { ok: problems.length === 0, problems, table: table.filter((t) => t.text), advisories: table.filter((t) => t.note) };
}

const SENSATIONAL = ['shocking', 'horrifying', 'horrific', "you won't believe", 'slams', 'slammed', 'destroys', 'exposed', 'bombshell', 'jaw-dropping', 'sickening', 'disgusting', 'outrageous', 'evil', 'monsters', 'the truth about', 'what they don\'t want you to know', 'mind-blowing', 'insane', 'unbelievable', 'nightmare', 'scandalous', 'heartbreaking', 'guilt-free', 'guilt free', 'join the movement', 'act now', 'hurry', "don't miss", 'last chance'];
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
export function voiceCheck(text, title = '') {
  const violations = [], warnings = []; const skeleton = /DRAFT SKELETON/.test(text);
  text = text.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/<!--[\s\S]*?-->/g, '');
  const low = `${title}\n${text}`.toLowerCase();
  for (const w of SENSATIONAL) if (new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(low)) violations.push(`Sensational or clickbait wording: "${w}"`);
  if (/!/.test(text) || /!/.test(title)) violations.push('Exclamation mark (the voice is restrained)');
  if (EMOJI.test(text) || EMOJI.test(title)) violations.push('Emoji (brand kit: none)');
  if (/\b(should feel|you should be ashamed|shame on|how can you)\b/i.test(text)) warnings.push('Reads as preachy — show what is behind the label and leave the choice with the reader');
  if (/\?$/.test(title.trim()) && /\byou\b/i.test(title)) warnings.push('Headline is a question addressed to the reader — check it is not bait');
  const caps = (text.match(/\b[A-Z]{6,}\b/g) || []).filter((w) => !['FERAL', 'FEMME', 'SAMPLE'].includes(w)); if (caps.length) warnings.push(`Words in capitals: ${[...new Set(caps)].join(', ')} (brand kit: no capitals for emphasis)`);
  if (/\b(clearly|obviously|undeniably|everyone knows|it is a fact that)\b/i.test(text)) warnings.push('Certainty words — make sure the evidence carries them');
  if (skeleton) warnings.push('This is an assembled skeleton, not written prose');
  return { passed: violations.length === 0, violations, warnings };
}

const nums = (s) => (String(s).match(/\d[\d,.]*\d|\d/g) || []).map((x) => x.replace(/[,.]$/, '').replace(/,/g, ''));
/** Every figure in the draft must be traceable to the verification sheet, and every publisher credited. */
export function factCheck(markdown, claims, sources) {
  const body = markdown.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/https?:\/\/\S+/g, '');
  const allowed = new Set([...claims.flatMap((c) => nums(c.text)), ...sources.flatMap((s) => [...nums(s.date), ...nums(s.title)])]);
  const stray = [...new Set(nums(body).filter((n) => !allowed.has(n)))];
  const used = new Set(claims.flatMap((c) => c.sources || []));
  const uncredited = sources.filter((s, i) => used.has(i + 1) && !body.toLowerCase().includes(s.publisher.toLowerCase())).map((s) => s.publisher);
  const violations = [...stray.map((n) => `Figure "${n}" is not on the verification sheet`), ...uncredited.map((p) => `Publisher not credited by name: ${p}`)];
  return { passed: violations.length === 0, violations, figures_checked: nums(body).length, publishers_credited: used.size - uncredited.length };
}

export function datasetStatus(d, file, today) {
  if (!d.reviewed || !d.reviewCycleDays) return { file, title: d.title || file, status: 'no review cycle declared' };
  const due = new Date(new Date(d.reviewed).getTime() + d.reviewCycleDays * 864e5).toISOString().slice(0, 10);
  const days = Math.floor((new Date(due) - new Date(today)) / 864e5);
  return { file, title: d.title || file, reviewed: d.reviewed, due, days_left: days, status: days < 0 ? 'overdue' : days <= 14 ? 'due soon' : 'current' };
}

/** Brand kit, "one case per frame": one sentence, one image, one source — and the disclosure travels with it. */
export function frameCheck(f) {
  const problems = [];
  if (!f.sentence) problems.push('no sentence'); else if (f.sentence.split(/(?<=[.?])\s+/).filter(Boolean).length > 2) problems.push('more than one idea — a frame carries a single case');
  if (!f.source?.publisher) problems.push('no named source — a frame without a source is not published');
  if (!f.handle) problems.push('no handle at the foot');
  if (!f.disclosure) problems.push('no AI-imagery disclosure');
  return { ok: problems.length === 0, problems };
}
