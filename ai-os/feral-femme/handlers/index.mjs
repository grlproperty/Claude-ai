/**
 * Feral Femme agent handlers. They read and write only this business's
 * database, and read the site's own content through a declared read-only mount.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { CLASSES, NEEDS_SOURCE, slug, checkSource, classifyClaims, voiceCheck, factCheck, datasetStatus, frameCheck } from './lib.mjs';

const today = (ctx) => ctx.clock().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 864e5).toISOString().slice(0, 10);
const siteJson = (ctx, ...p) => (ctx.tenant.hasMount('site') && existsSync(ctx.tenant.mount('site', ...p)) ? JSON.parse(readFileSync(ctx.tenant.mount('site', ...p), 'utf8')) : null);
const authorities = (ctx) => siteJson(ctx, 'data', 'sources.json')?.authorities || [];
const notes = (ctx) => (ctx.tenant.hasMount('site') && existsSync(ctx.tenant.mount('site', 'field-notes')) ? readdirSync(ctx.tenant.mount('site', 'field-notes')).filter((f) => f.endsWith('.md')).sort() : []);
const inv = (ctx, s) => ctx.db.get(s.open.investigation);
const q = (x) => JSON.stringify(String(x));

export const handlers = {
  // ───────── New investigation ─────────
  'investigation.open'(ctx, { input }) {
    if (!ctx.tenant.cfg.industries.includes(input.industry)) return { halt: 'industry not recognised', missing: [`industry must be one of: ${ctx.tenant.cfg.industries.join(', ')}`] };
    const i = ctx.db.put('investigation', { title: input.title, industry: input.industry, question: input.question, status: 'research', opened: ctx.db.now(), sample: Boolean(input.sample) }, ctx.db.nextId('INV'));
    return { investigation: i.id, industry: i.industry };
  },
  'research.brief'(ctx, s) {
    const i = inv(ctx, s);
    const brief = { investigation: i.id, question: i.question, scope: `What the public record establishes about this question within ${i.industry}. Feral Femme summarises existing investigations; it does not gather new evidence.`,
      sources_required: ['The primary instrument where one exists (regulation, ruling, filing, inquiry report)', 'The original published investigation, credited by name', 'Peer-reviewed studies for any scientific claim, with their limitations', 'A credible source that disagrees, if one exists'],
      each_source_needs: ['publisher', 'title', 'https link', 'publication date', 'type: primary, coverage, study or dataset'],
      each_claim_needs: [`a classification: ${CLASSES.join(', ')}`, 'the numbers of the sources that support it', 'for a figure: a named body and a dated publication'], standards: 'knowledge/Research Standards/research-standards.md' };
    ctx.db.update(i.id, { brief });
    return brief;
  },
  'sources.register'(ctx, s) {
    const src = s.input.sources || [];
    if (!src.length) return { halt: 'no public sources supplied yet', missing: ['sources: a list of {publisher, title, url, date, type}'] };
    ctx.db.update(s.open.investigation, { sources: src });
    return { registered: src.length, primary: src.filter((x) => x.type === 'primary').length };
  },
  'source.verify'(ctx, s) {
    const auth = authorities(ctx); const results = s.input.sources.map((x, i) => ({ n: i + 1, publisher: x.publisher, ...checkSource(x, auth) }));
    const bad = results.filter((r) => !r.ok);
    if (bad.length) return { halt: 'sources incomplete', problems: bad.map((r) => `Source ${r.n} (${r.publisher || 'unnamed'}): ${r.problems.join('; ')}`), results };
    return { results, standing_list_checked: auth.length, note: 'Structure verified. Whether each source says what is claimed is confirmed by a person at the next gate.' };
  },
  'evidence.classify'(ctx, s) {
    const claims = s.input.claims || [];
    if (!claims.length) return { halt: 'no claims supplied', missing: ['claims: a list of {text, classification, sources: [source numbers]}'] };
    const r = classifyClaims(claims, s.input.sources);
    if (!r.ok) return { halt: 'evidence classification failed', problems: r.problems };
    ctx.db.update(s.open.investigation, { claims, status: 'verification' });
    return { table: r.table, advisories: r.advisories, counts: claims.reduce((o, c) => ((o[c.classification] = (o[c.classification] || 0) + 1), o), {}) };
  },
  'verification.sheet'(ctx, s) {
    const src = s.input.sources;
    return { investigation: s.open.investigation, instruction: 'Open each source and confirm that it says what the claim says, in the classification given. Approve only if every line holds. Reject with the line numbers that do not.',
      lines: s.input.claims.map((c, i) => ({ n: i + 1, claim: c.text, classification: c.classification, check_against: (c.sources || []).map((k) => ({ publisher: src[k - 1].publisher, title: src[k - 1].title, date: src[k - 1].date, url: src[k - 1].url })), limitation: c.limitation || null })),
      source_checks: s.verify.results };
  },
  async 'draft.fieldnote'(ctx, s) {
    const i = inv(ctx, s); const { claims, sources } = s.input; const order = notes(ctx).length + 1;
    const fm = `---\ntitle: ${q(i.title)}\nsummary: ${q(s.input.summary || i.question)}\ntopic: ${q(i.industry)}\ntopics: [${q(i.industry)},"Note"]\nform: "Short"\nduration: 3\ndate: ${today(ctx)}\norder: ${order}\n---\n`;
    const srcList = `\n\n## Sources\n\n${sources.map((x) => `- ${x.publisher}, "${x.title}" (${x.date}) — ${x.url}`).join('\n')}\n`;
    let body, written_by = 'skeleton';
    const ai = await ctx.llm.run(ctx.registry.get('FF-A034'), `Write a field note of 250–450 words from this human-confirmed verification sheet. Use only these claims; add no fact, figure, name or date that is not here. Credit each publisher by name in the prose. Word every allegation as an allegation. State what is not established.\n\nTitle: ${i.title}\nQuestion: ${i.question}\n\nClaims:\n${claims.map((c, n) => `${n + 1}. [${c.classification}] ${c.text}${c.limitation ? ` (limitation: ${c.limitation})` : ''} — sources ${(c.sources || []).join(', ') || 'none'}`).join('\n')}\n\nSources:\n${sources.map((x, n) => `${n + 1}. ${x.publisher}, "${x.title}", ${x.date}`).join('\n')}\n\nReturn the body only, in Markdown, without a title and without a sources list.`, { effort: 'high', knowledge: ctx.kb.search('editorial voice standards sourcing', { limit: 3 }).map((k) => ctx.kb.read(k.path)) });
    if (ai) { body = ai.text.trim(); written_by = 'claude'; } else {
      const line = (c) => `${c.text}${(c.sources || []).length ? ` Source: ${(c.sources).map((k) => `${sources[k - 1].publisher} (${sources[k - 1].date})`).join('; ')}.` : ''}${c.limitation ? ` Limitation: ${c.limitation}` : ''}`;
      const sect = (label, list) => (list.length ? `\n\n## ${label}\n\n${list.map(line).join('\n\n')}` : '');
      body = `<!-- DRAFT SKELETON assembled from the verification sheet. The prose is still to be written by the Editorial Director, or by Claude once it is connected. -->${sect('What the record shows', claims.filter((c) => NEEDS_SOURCE.has(c.classification)))}${sect('How we read it', claims.filter((c) => ['opinion', 'editorial_interpretation'].includes(c.classification)))}${sect('What is not established', claims.filter((c) => c.classification === 'unresolved'))}`;
    }
    const file = `${String(order).padStart(2, '0')}-${slug(i.title)}.md`;
    ctx.db.update(i.id, { status: 'draft', draft_file: file });
    return { file, markdown: fm + body + srcList, written_by };
  },
  'fact.check'(ctx, s) {
    const r = factCheck(s.draft.markdown, s.input.claims, s.input.sources);
    if (!r.passed) return { halt: 'fact check failed', problems: r.violations };
    return r;
  },
  'voice.check'(ctx, s) {
    const r = voiceCheck(s.draft?.markdown || s.input?.text || '', inv(ctx, s)?.title || s.input?.title || '');
    if (!r.passed) return { halt: 'voice check failed', problems: r.violations, warnings: r.warnings };
    return r;
  },
  'editorial.review'(ctx, s) {
    return { investigation: s.open.investigation, file: s.draft.file, written_by: s.draft.written_by, draft: s.draft.markdown, fact_check: s.factcheck, voice_check: s.voice, classifications: s.classify.counts, advisories: s.classify.advisories,
      verification_confirmed_by_approval: s.sheet.approvalId, reviewer_checklist: ['Framing is as strong as the evidence and no stronger', 'Every publisher is credited by name', 'Allegations read as allegations', 'What is not established is stated'] };
  },
  async 'visual.brief'(ctx, s) {
    const i = inv(ctx, s);
    const src = s.input.sources[0]; const cfg = ctx.tenant.cfg;
    const brief = { investigation: i.id, reference: `Field note "${i.title}" and its sources`, disclosure: cfg.disclosure,
      figure: ['Fox ears: prosthetic, real fur tones, always worn — never a costume headband', 'The blaze: a white stripe painted from brow to nose', 'Painted muzzle: darkened nose tip and a line to the lip', 'Smudged eye: dark, slept-in shadow — never clean glamour make-up', 'One restraint: a collar, wire, thread or line — a single detail, not a set', 'The stare: direct and unsmiling'],
      setting_options: ['The studio — a plain ground, one or two figures, one idea', 'The street — protest, crowd, megaphone, hand-painted slogans', 'The scene — the industry itself as a set; one documented case per frame'],
      direction: 'Hard flash or plain daylight. Real texture: plaster, tile, fur, skin. Portrait 4:5 or 3:4. Crimson enters as an object in the scene, never as a wash over the picture.',
      constraints: ['Conceptual, not documentary: never presented as a photograph of a real event', 'No likeness of a real, identifiable person', 'No company logo, product or trade dress', 'No stock photography, cute animals or gore', 'Not the retired 2024 look: no caged collage, soft-focus chains or cool desaturated grading. A cage may appear; it is not the whole idea'],
      archive_frame: { layout: ['Wordmark top left; series or section stamp top right, in Space Mono', 'Headline in Cormorant Garamond; the turn of the sentence sits in a crimson highlight', 'One image: the figure, or an engraving-style drawing of the animal', 'Source and handle at the foot'], sentence: s.input.summary || null, source: { publisher: src.publisher, date: src.date }, handle: cfg.handles.instagram, disclosure: cfg.disclosure },
      concept: null, image_prompt: null, caption: null, status: 'concept to be written by the founder' };
    brief.frame_check = frameCheck(brief.archive_frame);
    const ai = await ctx.llm.run(ctx.registry.get('FF-A045'), `Propose one visual essay concept for the field note "${i.title}" (${i.industry}). Give: a two-sentence concept, an image prompt, and a caption of at most 30 words that explains the idea and does not imply documentation. The recurring figure always has: ${brief.figure.join('; ')}. Direction: ${brief.direction} Respect these constraints:\n- ${brief.constraints.join('\n- ')}`, { schema: { type: 'object', additionalProperties: false, required: ['concept', 'image_prompt', 'caption'], properties: { concept: { type: 'string' }, image_prompt: { type: 'string' }, caption: { type: 'string' } } }, effort: 'medium' });
    if (ai) Object.assign(brief, ai.json, { status: 'concept proposed by Claude — founder to direct' });
    ctx.db.put('visual', { ...brief, state: 'in production' }, ctx.db.nextId('VIS'));
    return brief;
  },
  'final.package'(ctx, s) {
    const hasAllegation = s.input.claims.some((c) => c.classification === 'allegation');
    return { gate_action: hasAllegation ? 'allegation.publish' : 'editorial.publish',
      why_this_level: hasAllegation ? 'Contains an allegation about a named party: explicit authorisation required' : 'No allegations: standard editorial approval',
      file: { name: s.draft.file, markdown: s.draft.markdown }, written_by: s.draft.written_by, visual: s.visual, editorial_review_approval: s.review.approvalId, verification_approval: s.sheet.approvalId,
      before_approving: [...(s.draft.written_by === 'skeleton' ? ['The file is an assembled skeleton. Write the prose before publishing.'] : []), 'Set the publication date in the front matter to the day it goes live', 'Confirm topic and topics match the site\'s existing labels'] };
  },
  'publication.record'(ctx, s) {
    const ap = ctx.db.approval(s.final.approvalId);
    const n = ctx.db.put('field_note', { investigation: s.open.investigation, file: s.draft.file, approved_by: ap.decided_by, approved_at: ap.decided_at, delivered: ap.dispatch, status: ap.dispatch?.adapter === 'site-file' ? 'written to site content — commit and push to deploy' : 'approved — file in outbox, to be added to content/field-notes by a person' }, ctx.db.nextId('NOTE'));
    ctx.db.update(s.open.investigation, { status: 'approved for publication' });
    return { note: n.id, status: n.status, file: ap.dispatch?.file };
  },
  'briefing.prepare'(ctx, s) {
    return { briefing: 'The Research Briefing', how_it_sends: 'Automatically: after the site deploys, scripts/send-briefing.mjs creates one MailerLite campaign per new note, named by its slug, and skips any that already exists.', action_for_a_person: 'None beyond publishing. To preview without sending: npm run briefing (dry run) in the site repository.', note_file: s.draft.file, rule: 'The briefing carries the note in full and nothing else.' };
  },
  async 'social.prepare'(ctx, s) {
    const i = inv(ctx, s); const pubs = [...new Set(s.input.sources.map((x) => x.publisher))].join('; ');
    const base = `${i.title}\n\n${s.input.summary || i.question}\n\nSources: ${pubs}. Full note and links: feral-femme.co/field-notes/`;
    const v = voiceCheck(base, i.title); if (!v.passed) return { halt: 'social caption failed the voice check', problems: v.violations };
    return { posts: [{ platform: 'Instagram', text: base, visual: 'Approved visual essay frame with its disclosure' }, { platform: 'LinkedIn', text: base }, { platform: 'Facebook', text: base }], voice_check: v, note: 'Captions use only the approved title, summary and source names.' };
  },
  'archive.update'(ctx, s) {
    const i = ctx.db.update(s.open.investigation, { status: 'archived', archived: ctx.db.now() });
    const a = ctx.db.put('archive_entry', { investigation: i.id, title: i.title, industry: i.industry, sources: s.input.sources.length, claims: s.input.claims.length, note: s.publish.note, approvals: [s.sheet.approvalId, s.review.approvalId, s.final.approvalId, s.social.approvalId] }, ctx.db.nextId('ARC'));
    return { archive_entry: a.id };
  },

  // ───────── Digital product ─────────
  'product.opportunity'(ctx, { input }) {
    const cat = ctx.tenant.cfg.catalogue; const existing = [...cat.paid.map((p) => p.name), ...cat.free].find((n) => n.toLowerCase() === input.name.toLowerCase());
    const p = ctx.db.put('product', { name: input.name, purpose: input.purpose, kind: input.kind || 'paid document', status: 'opportunity', revises_existing: Boolean(existing), opened: ctx.db.now(), sample: Boolean(input.sample) }, ctx.db.nextId('PRD'));
    return { product: p.id, revises_existing: Boolean(existing), catalogue_checked: cat.verified };
  },
  'product.research'(ctx, s) {
    const d = s.input.demand_evidence || [], src = s.input.sources || []; const missing = [];
    if (!d.length) missing.push('demand_evidence: what shows readers want this (reader requests, tool usage, sales of a related document)');
    if (!src.length) missing.push('sources: the public sources the content will rest on');
    if (missing.length) return { halt: 'product research incomplete', missing };
    const checks = src.map((x, i) => ({ n: i + 1, ...checkSource(x, authorities(ctx)) })); const bad = checks.filter((c) => !c.ok);
    if (bad.length) return { halt: 'product sources incomplete', problems: bad.map((c) => `Source ${c.n}: ${c.problems.join('; ')}`) };
    return { demand_evidence: d.length, sources: checks };
  },
  'product.outline'(ctx, s) {
    const sec = s.input.sections || [];
    if (sec.length < 3) return { halt: 'outline needs at least three sections', missing: ['sections: a list of section titles'] };
    return { name: s.input.name, purpose: s.input.purpose, sections: sec.map((t, i) => ({ n: i + 1, title: t })), standard: 'Same sourcing standard as a field note: every factual statement traceable to a named source.' };
  },
  async 'product.content'(ctx, s) {
    const ai = await ctx.llm.run(ctx.registry.get('FF-A074'), `Draft the working document "${s.input.name}" (${s.input.purpose}) with these sections: ${s.input.sections.join('; ')}. Use only these sources and name them where used:\n${s.input.sources.map((x, n) => `${n + 1}. ${x.publisher}, "${x.title}", ${x.date}`).join('\n')}\nMark anything you could not source as [NEEDS SOURCE].`, { effort: 'high' });
    const text = ai ? ai.text : `# ${s.input.name}\n\n<!-- DRAFT SKELETON. Content is still to be written. -->\n\n${s.input.sections.map((t) => `## ${t}\n\n[To be written from the registered sources]`).join('\n\n')}\n\n## Sources\n\n${s.input.sources.map((x) => `- ${x.publisher}, "${x.title}" (${x.date}) — ${x.url}`).join('\n')}\n`;
    return { text, written_by: ai ? 'claude' : 'skeleton' };
  },
  'product.review'(ctx, s) {
    const v = voiceCheck(s.content.text, s.input.name); const unsourced = (s.content.text.match(/\[NEEDS SOURCE\]/g) || []).length;
    if (!v.passed) return { halt: 'product failed the voice check', problems: v.violations };
    return { voice: v, unsourced_markers: unsourced, complete: s.content.written_by !== 'skeleton' && unsourced === 0 };
  },
  'product.design'(ctx, s) {
    const b = ctx.tenant.cfg.brand;
    const free = s.input.kind === 'free guide';
    return { format: 'PDF, A4, print-and-keep', ground: free ? 'Blush #F6DFE2 (free guides sit on blush)' : 'Crimson #8E0B14 cover (paid workbooks sit on crimson); inside pages on blush and white',
      palette: { blush: '#F6DFE2', crimson: b.primary, ink: b.ink, white: '#FDFCFC', note: 'Roughly 60% blush, 25% crimson, 10% ink, 5% white. Ink is for text and symbols, never a ground. Flat colour: no gradients, no tints of crimson, no new hues.' },
      typography: { display: 'Bodoni Moda Medium, uppercase — name, section titles, numerals', editorial: 'Cormorant Garamond — headlines, ledes, claims; sentence case', reading: 'Jost Light — body', evidence: 'Space Mono, uppercase — labels, dates, counts, sources, stamps' },
      layout: ['Same grid, same numeral and same foot as the existing documents', 'Wordmark FERAL FEMME. with its full stop; clear space the height of the capital F', 'Square corners, hairline rules, depth from a hard offset shadow — never a blur', 'A named source beside every claim; sources page at the back', 'No advertising, no affiliate links, no emoji'], sections: s.outline.sections.length };
  },
  'product.qa'(ctx, s) {
    const cat = ctx.tenant.cfg.catalogue; const price = s.input.price; const norm = [...new Set(cat.paid.map((p) => p.price))];
    const findings = []; let action = 'product.release';
    if (s.input.kind !== 'free guide') {
      if (price == null) return { halt: 'no price decided', missing: ['price: set by the founder — the system will not suggest or invent one'] };
      if (!norm.includes(price)) { action = 'price.change'; findings.push(`Price ${cat.currency} ${price} differs from the catalogue (${cat.currency} ${norm.join(', ')}) — explicit authorisation required`); }
    }
    if (!s.review.complete) findings.push(s.content.written_by === 'skeleton' ? 'Content is still a skeleton' : `${s.review.unsourced_markers} statement(s) still need a source`);
    return { release_action: action, findings, ready: findings.length === 0 || (findings.length === 1 && action === 'price.change') };
  },
  'product.package'(ctx, s) {
    return { gate_action: s.qa.release_action, product: s.opportunity.product, name: s.input.name, kind: s.input.kind || 'paid document', price: s.input.price ?? null, currency: ctx.tenant.cfg.catalogue.currency, outline: s.outline.sections, design: s.design, quality: s.qa, content: s.content.text,
      before_approving: s.qa.ready ? ['Read the document in full against its sources'] : ['NOT READY TO SELL — see quality findings. Approve only to confirm the plan; the document must be finished and re-checked before listing.'] };
  },
  'product.listing'(ctx, s) {
    ctx.db.update(s.opportunity.product, { status: s.qa.ready ? 'approved — listing prepared' : 'approved in principle — content unfinished', price: s.input.price ?? null });
    return { listing: { title: s.input.name, description: s.input.purpose, price: s.input.price == null ? 'Free' : `${ctx.tenant.cfg.catalogue.currency} ${s.input.price}`, contents: s.outline.sections.map((x) => x.title), funding_line: 'Feral Femme is funded by its readers — donations, and the documents it sells.' }, publish: 'A person adds the listing and the file to the shop. No checkout connection exists in this system yet.' };
  },
  'product.report'(ctx, s) {
    const task = ctx.db.addTask({ title: `Record first-month sales for ${s.input.name}`, detail: `${s.opportunity.product}: capture units and revenue from the checkout provider`, agent: 'FF-A109', priority: 3, due: addDays(today(ctx), 30), runId: s.run?.id, by: 'FF-A109' });
    return { tracking_task: task, note: 'Sales data is captured by hand until the checkout provider is connected.' };
  },

  // ───────── Integrity sweep, knowledge ─────────
  'dataset.review'(ctx) {
    if (!ctx.tenant.hasMount('site')) return { datasets: [], note: 'Site content is not mounted' };
    const dir = ctx.tenant.mount('site', 'data'); const out = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const st = datasetStatus(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')), f, today(ctx)); out.push(st);
      if (['overdue', 'due soon'].includes(st.status) && !ctx.db.tasks("status='open' AND detail LIKE ?", `%dataset ${f}%`).length) st.task = ctx.db.addTask({ title: `Review dataset "${st.title}" — ${st.status} (${st.due})`, detail: `dataset ${f}: re-verify every entry against its source, then update "reviewed"`, agent: 'FF-A092', priority: st.status === 'overdue' ? 1 : 2, due: st.due, by: 'FF-A092' });
    }
    return { datasets: out };
  },
  'notes.audit'(ctx) {
    const problems = []; const files = notes(ctx);
    for (const f of files) { const t = readFileSync(ctx.tenant.mount('site', 'field-notes', f), 'utf8'); const fm = /^---\n([\s\S]*?)\n---/.exec(t)?.[1] || ''; for (const k of ['title', 'summary', 'topic', 'date']) if (!new RegExp(`^${k}:\\s*\\S`, 'm').test(fm)) problems.push(`${f}: missing ${k}`); }
    return { notes: files.length, problems };
  },
  'kb.answer'(ctx, { input }) { const hits = ctx.kb.search(input.question || input.query || '', { limit: 5 }); return { answer_from: hits.map((h) => ({ document: h.title, path: h.path, version: h.version, status: h.status, excerpt: h.excerpt })), note: hits.length ? 'Answer only from these documents.' : 'Nothing in approved knowledge covers this. Ask the Editorial Director rather than guess.' }; },
  orchestrate() { return { status: 'The orchestrator runs through instruct(); it is not a workflow step.' }; },
};

export const adapters = {
  /** Writes an approved field note into the site's content folder. Off unless enabled in tenant.json AND the mount is read-write. */
  'site-file'(ctx, ap) {
    if (ctx.tenant.mountMode('site') !== 'rw') throw new Error('site-file adapter is enabled but the site mount is read-only');
    const f = ctx.tenant.mount('site', 'field-notes', ap.payload.file.name);
    if (existsSync(f)) throw new Error(`${ap.payload.file.name} already exists in the site content — nothing overwritten`);
    writeFileSync(f, ap.payload.file.markdown);
    return { adapter: 'site-file', file: f, note: 'Written to the site content folder. Commit and push to deploy; the briefing then sends itself.' };
  },
};

const NOT_CONNECTED = (label, src) => ({ label, value: '—', hint: `connect ${src}` });
export const metrics = {
  dashboard(ctx, from, period) {
    const db = ctx.db; const L = (t) => db.list(t); const invs = L('investigation'); const active = invs.filter((i) => i.status !== 'archived');
    const pend = db.approvals("status='pending'"); const ds = ctx.tenant.hasMount('site') ? readdirSync(ctx.tenant.mount('site', 'data')).filter((f) => f.endsWith('.json')).map((f) => datasetStatus(siteJson(ctx, 'data', f), f, today(ctx))) : [];
    const m = (kind) => { const r = L('metric_entry').filter((e) => e.kind === kind).at(-1); return r ? { value: r.value, hint: `captured ${r.date}` } : null; };
    const tile = (label, kind, src) => (m(kind) ? { label, ...m(kind) } : NOT_CONNECTED(label, src));
    const d2 = ctx.registry.inDept('D02').map((a) => a.id);
    return {
      tiles: [
        { label: 'Active investigations', value: active.length, hint: `${invs.length - active.length} archived` },
        { label: 'Research tasks', value: db.tasks("status='open'").filter((t) => d2.includes(t.agent_id)).length, hint: 'open' },
        { label: 'Sources awaiting verification', value: pend.filter((a) => a.action === 'source.verification.confirm').length, hint: 'verification sheets to confirm', alert: pend.some((a) => a.action === 'source.verification.confirm') },
        { label: 'Draft field notes', value: invs.filter((i) => i.status === 'draft').length, hint: 'in production' },
        { label: 'Editorial approvals', value: pend.filter((a) => /editorial|allegation/.test(a.action)).length, hint: 'awaiting the Editorial Director' },
        { label: 'Scheduled publications', value: L('field_note').filter((n) => /approved|written/.test(n.status)).length, hint: 'approved, not yet live' },
        { label: 'Visual essays in production', value: L('visual').filter((v) => v.state === 'in production').length, hint: `${siteJson(ctx, 'data', 'archive.json')?.entries.length ?? '—'} in the archive` },
        { label: 'Published field notes', value: notes(ctx).length, hint: 'in site content' },
        { label: 'Research archive', value: L('archive_entry').length, hint: `${siteJson(ctx, 'data', 'library.json')?.entries.length ?? '—'} library entries on site` },
        { label: 'Datasets needing review', value: ds.filter((d) => ['overdue', 'due soon'].includes(d.status)).length, hint: `of ${ds.length}`, alert: ds.some((d) => d.status === 'overdue') },
        tile('Website traffic', 'traffic', 'analytics (off by default; disclose first)'), tile('SEO performance', 'search_clicks', 'Search Console'),
        tile('Briefing subscribers', 'subscribers', 'MailerLite'), tile('Product sales', 'product_sales', 'the checkout provider'), tile('Donations', 'donations', 'PayPal'), tile('Revenue', 'revenue', 'PayPal and checkout'),
      ],
      tables: [
        { title: 'Investigations', columns: ['ID', 'Title', 'Industry', 'Status', 'Sources', 'Claims'], rows: invs.slice(-10).map((i) => [i.id, i.title, i.industry, i.status, i.sources?.length ?? 0, i.claims?.length ?? 0]) },
        { title: 'Tool datasets and their review cycle', note: 'Read from the site\'s own data files.', columns: ['Dataset', 'Last reviewed', 'Review due', 'Status'], rows: ds.map((d) => [d.title, d.reviewed || '—', d.due || '—', d.status]) },
        { title: 'Products in development', columns: ['ID', 'Name', 'Kind', 'Status'], rows: L('product').map((p) => [p.id, p.name, p.kind, p.status]) },
      ],
      trends: [{ label: 'Coverage by industry (published notes are labelled by topic on the site; investigations here)', labels: ctx.tenant.cfg.industries.map((x) => x.split(' ')[0]), series: ctx.tenant.cfg.industries.map((x) => invs.filter((i) => i.industry === x).length) }],
    };
  },
  deadlines(ctx) {
    const out = ctx.db.tasks("status='open' AND due IS NOT NULL").map((t) => ({ date: t.due, text: t.title }));
    if (ctx.tenant.hasMount('site')) for (const f of readdirSync(ctx.tenant.mount('site', 'data')).filter((x) => x.endsWith('.json'))) { const d = datasetStatus(siteJson(ctx, 'data', f), f, today(ctx)); if (d.due && d.days_left <= 30 && !out.some((o) => o.text.includes(d.title))) out.push({ date: d.due, text: `Dataset review due: ${d.title}` }); }
    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
  },
  warnings(ctx) {
    const out = [];
    if (ctx.tenant.hasMount('site')) for (const f of readdirSync(ctx.tenant.mount('site', 'data')).filter((x) => x.endsWith('.json'))) { const d = datasetStatus(siteJson(ctx, 'data', f), f, today(ctx)); if (d.status === 'overdue') out.push({ severity: 'high', text: `Dataset "${d.title}" passed its review date (${d.due}) — a stale reference becomes misleading` }); }
    const a = handlers['notes.audit'](ctx); for (const p of a.problems) out.push({ severity: 'medium', text: `Published note ${p}` });
    return out;
  },
  opportunities(ctx) {
    const invs = ctx.db.list('investigation'); const none = ctx.tenant.cfg.industries.filter((x) => !invs.some((i) => i.industry === x));
    return invs.length && none.length ? [`No investigation open in: ${none.join(', ')}`] : [];
  },
  attention(ctx) { return ctx.db.list('investigation').filter((i) => i.status === 'draft').map((i) => `Draft awaiting review: ${i.title} (${i.id})`); },
  improvements(ctx) {
    const out = []; if (!ctx.db.list('metric_entry').length) out.push('Subscriber, donation, sales and traffic figures are not connected. Capture them by hand, or connect MailerLite and PayPal read-only.');
    return out;
  },
};

export function seed(ctx) {
  ctx.db.audit('system', 'sample.seeded', ctx.tenant.id, { note: 'No sample records needed' });
  return { note: 'Feral Femme reads its live site content directly, so no sample records are loaded. To exercise the system, run the example input of the new-investigation workflow (it is built from an entry already in the Record Checker dataset and is marked sample).' };
}
