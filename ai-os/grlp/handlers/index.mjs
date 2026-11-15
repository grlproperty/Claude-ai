/**
 * GRLP agent handlers. Each is the working body of one or more registry
 * agents. They read and write only this business's database.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { rand, addDays, daysBetween, normPhone, validEmail, parseRequirements, scoreLead, matchListings, brandCheck, scorecards, urgency } from './lib.mjs';

const today = (ctx) => ctx.clock().toISOString().slice(0, 10);
const T = (ctx) => ({ ...ctx.tenant.cfg.targets, ...(ctx.db.getSetting('targets', {}) || {}) });
const first = (name) => String(name).trim().split(/\s+/)[0];
const cap = (s) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
const sent = (s) => String(s || '').replace(/^\w/, (c) => c.toUpperCase());
const SIGN = (c) => `Kind regards,\nGarden Route Lifestyle Property\nFind Your Way Home\n${c.phone} · ${c.email}`;
const openTaskFor = (ctx, key) => ctx.db.tasks("status IN ('open','blocked') AND detail LIKE ?", `%${key}%`).length > 0;

export const handlers = {
  // ───────── Buyer enquiry ─────────
  'lead.capture'(ctx, { input }) {
    const phone = normPhone(input.phone); const emailOk = validEmail(input.email);
    if (!phone.valid && !emailOk) return { halt: 'no usable contact detail', missing: ['a valid phone number or email address'] };
    const buyer = ctx.db.put('buyer', {
      name: input.name.trim(), phone: phone.valid ? phone.value : '', email: emailOk ? input.email.trim().toLowerCase() : '',
      international: Boolean(phone.international), source: input.source || 'not recorded', message: input.message || '', listing_ref: input.listing_ref || null,
      consent_marketing: input.consent_marketing === true, status: 'new', received: ctx.db.now(), last_contact: ctx.db.now(), sample: Boolean(input.sample),
    }, ctx.db.nextId('BUY'));
    return { buyerId: buyer.id, phone_valid: phone.valid, email_valid: emailOk, consent_marketing: buyer.consent_marketing,
      notes: [...(input.phone && !phone.valid ? ['Phone number could not be validated'] : []), ...(!buyer.consent_marketing ? ['No marketing consent recorded: reply to this enquiry only; do not add to alerts or newsletters'] : [])] };
  },
  'duplicate.check'(ctx, s) {
    const me = ctx.db.get(s.capture.buyerId);
    const dups = ctx.db.list('buyer').filter((b) => b.id !== me.id && ((me.phone && b.phone === me.phone) || (me.email && b.email === me.email))).map((b) => b.id);
    if (dups.length) ctx.db.update(me.id, { possible_duplicate_of: dups });
    return { duplicates: dups, note: dups.length ? 'Probable duplicate — a person should merge these records' : 'No duplicate found' };
  },
  'requirements.analyse'(ctx, s) {
    const i = s.input; const parsed = parseRequirements(i.message, ctx.tenant.cfg.areas);
    const req = { ...parsed };
    for (const k of ['budget_max', 'budget_min', 'bedrooms_min', 'property_type', 'finance', 'timeframe_months']) if (i[k] != null && i[k] !== '') req[k] = i[k];
    if (i.areas?.length) req.areas = i.areas;
    const gaps = [['budget_max', 'budget'], ['areas', 'preferred areas'], ['bedrooms_min', 'number of bedrooms'], ['finance', 'how the purchase will be financed'], ['timeframe_months', 'when they want to buy']].filter(([k]) => req[k] == null).map(([, label]) => label);
    ctx.db.update(s.capture.buyerId, { requirements: req, requirement_gaps: gaps });
    return { requirements: req, gaps, from_message: Object.keys(parsed) };
  },
  'lead.qualify'(ctx, s) {
    const id = s.capture?.buyerId || s.input.buyerId; const r = scoreLead(ctx.db.get(id));
    ctx.db.update(id, { score: r.score, band: r.band, score_reasons: r.reasons });
    return r;
  },
  'property.match'(ctx, s) {
    const id = s.capture?.buyerId || s.input.buyerId; const matches = matchListings(ctx.db.get(id), ctx.db.list('listing'));
    ctx.db.update(id, { matches: matches.map((m) => m.ref) });
    return { matches, note: matches.length ? `${matches.length} suitable listing(s)` : 'No current listing fits. Buyer kept for future matching.' };
  },
  'agent.notify'(ctx, s) {
    const b = ctx.db.get(s.capture.buyerId); const enquired = b.listing_ref && ctx.db.list('listing').find((l) => l.ref === b.listing_ref);
    const areaAgents = ctx.db.getSetting('area_agents', {}); const area = b.requirements?.areas?.[0];
    const who = enquired?.agent_name || areaAgents[area] || null;
    const within = { hot: 'within 1 hour', warm: 'today', cold: 'within 2 working days' }[b.band];
    const task = ctx.db.addTask({ title: `New ${b.band} buyer lead: ${b.name} — respond ${within}`, detail: `${b.id} · ${who ? `Responsible agent: ${who}` : 'No responsible agent on record for this area — assign one'} · score ${b.score}`, agent: 'GRLP-A067', priority: b.band === 'hot' ? 1 : 2, due: today(ctx), runId: s.run?.id, by: 'GRLP-A067' });
    ctx.db.update(b.id, { responsible_agent: who });
    return { responsible_agent: who || 'UNASSIGNED', respond: within, task };
  },
  async 'reply.draft'(ctx, s) {
    const b = ctx.db.get(s.capture.buyerId); const m = s.match.matches; const gaps = b.requirement_gaps || [];
    let body, source = 'template';
    const facts = { buyer_first_name: first(b.name), enquired_ref: b.listing_ref, matches: m.map((x) => ({ ref: x.ref, area: x.area, price: rand(x.price), bedrooms: x.bedrooms, type: x.property_type })), still_need_to_know: gaps };
    const ai = await ctx.llm.run(ctx.registry.get('GRLP-A068'), `Write the first reply to this buyer enquiry as an email body. Use only these facts:\n${JSON.stringify(facts, null, 2)}\nBuyer's message: """${b.message}"""\nUnder 150 words. End with exactly this sign-off:\n${SIGN(ctx.tenant.cfg.contact)}`, { effort: 'low', knowledge: ctx.kb.search('tone voice brand', { limit: 2 }).map((k) => ctx.kb.read(k.path)) });
    if (ai) { body = ai.text.trim(); source = 'claude'; } else {
      const lines = [`Good day ${first(b.name)},`, '', `Thank you for your enquiry${b.listing_ref ? ` about ${b.listing_ref}` : ''}.`];
      if (m.length) lines.push('', 'From what you have told us, these properties may suit you:', ...m.map((x) => `• ${x.ref} — ${x.bedrooms ? `${x.bedrooms}-bedroom ` : ''}${x.property_type} in ${x.area}, ${rand(x.price)}`));
      if (gaps.length) lines.push('', `To help us find the right home for you, please let us know your ${gaps.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`);
      lines.push('', 'One of our agents will be in touch shortly to arrange a viewing.', '', SIGN(ctx.tenant.cfg.contact));
      body = lines.join('\n');
    }
    const check = brandCheck(body, 'message', ctx.tenant.cfg);
    if (!check.passed) return { halt: 'reply failed the brand check', problems: check.violations, body };
    return { channel: b.email ? 'email' : 'whatsapp', to: b.email || b.phone, subject: `Your property enquiry — Garden Route Lifestyle Property`, body, written_by: source, brand_check: check };
  },
  'viewing.request'(ctx, s) {
    const top = s.match.matches[0]; if (!top) return { viewing: null, note: 'No matching listing yet — no viewing to propose' };
    const v = ctx.db.put('viewing', { buyerId: s.capture.buyerId, ref: top.ref, status: 'to be confirmed by the responsible agent', created: ctx.db.now() }, ctx.db.nextId('VIEW'));
    return { viewing: v.id, ref: top.ref, status: v.status };
  },
  'followup.task'(ctx, s) {
    const b = ctx.db.get(s.capture.buyerId); const due = addDays(today(ctx), { hot: 1, warm: 3, cold: 7 }[b.band]);
    const task = ctx.db.addTask({ title: `Follow up with ${b.name} (${b.band} lead)`, detail: `${b.id} follow-up`, agent: 'GRLP-A097', priority: b.band === 'hot' ? 1 : 3, due, runId: s.run?.id, by: 'GRLP-A097' });
    return { task, due };
  },
  'crm.update'(ctx, s) {
    const b = ctx.db.update(s.capture.buyerId, { status: 'contact pending approval', last_run: s.run?.id });
    return { record: b.id, status: b.status, fields: Object.keys(b).length };
  },
  'conversion.track'(ctx, s) {
    if (s.capture) ctx.db.put('funnel', { buyerId: s.capture.buyerId, stage: 'enquiry', at: ctx.db.now() }, ctx.db.nextId('FUN'));
    const buyers = ctx.db.list('buyer');
    return { buyers: buyers.length, by_band: buyers.reduce((o, b) => ((o[b.band || 'unscored'] = (o[b.band || 'unscored'] || 0) + 1), o), {}), viewings: ctx.db.list('viewing').length };
  },

  // ───────── New listing ─────────
  'listing.register'(ctx, { input }) {
    const l = ctx.db.put('listing', { ...input, status: 'draft', registered: ctx.db.now() }, `LST-${input.ref}`);
    return { listingId: l.id, ref: l.ref };
  },
  'listing.check'(ctx, { input: l }) {
    const need = ['ref', 'address', 'area', 'property_type', 'price', 'mandate_type', 'mandate_expiry', 'agent_name', 'agent_phone'];
    if (!/land|plot|farm/i.test(l.property_type || '')) need.push('bedrooms', 'bathrooms');
    const missing = need.filter((k) => l[k] == null || l[k] === '');
    if (!(l.features?.length >= 3)) missing.push('at least three factual features');
    if (!(l.photos >= 1)) missing.push('photographs');
    const problems = [];
    if (l.price != null && !(Number(l.price) > 0)) problems.push('Price is not a positive number');
    if (l.area && !ctx.tenant.cfg.areas.some((a) => a.toLowerCase() === l.area.toLowerCase())) problems.push(`Area "${l.area}" is not one of the agency's listed areas — confirm spelling`);
    if (l.mandate_expiry && l.mandate_expiry <= today(ctx)) problems.push('Mandate expiry date is not in the future');
    if (missing.length || problems.length) return { halt: 'listing information incomplete', missing, problems };
    return { complete: true, checked: need.length + 2 };
  },
  'mandate.check'(ctx, { input: l }) {
    const items = [['mandate_signed', 'Signed mandate on file'], ['mandatory_disclosure_received', 'Mandatory disclosure form received from the seller'], ['fica_seller_complete', 'Seller FICA documents on file']];
    const missing = items.filter(([k]) => l[k] !== true).map(([, label]) => label);
    const note = 'Checklist of what is recorded only. This is not a legal or regulatory certification.';
    if (missing.length) return { halt: 'compliance documents not recorded — marketing cannot start', missing, note };
    return { present: items.map(([, label]) => label), note };
  },
  async 'listing.copy'(ctx, { input: l }) {
    const ai = await ctx.llm.run(ctx.registry.get('GRLP-A039'), `Write the listing description for this property. Use only these facts and add nothing:\n${JSON.stringify(l, null, 2)}\n60–110 words, one paragraph, ending with a short call to arrange a viewing.`, { effort: 'low', knowledge: ctx.kb.search('tone voice listing description', { limit: 2 }).map((k) => ctx.kb.read(k.path)) });
    if (ai) return { description: ai.text.trim(), written_by: 'claude' };
    const f = l.features.map((x) => x.replace(/\.$/, '')); const list = f.length > 1 ? `${f.slice(0, -1).join(', ')} and ${f.at(-1)}` : f[0];
    const size = [l.size_m2 && `${l.size_m2} m² under roof`, l.erf_m2 && `a ${l.erf_m2} m² erf`].filter(Boolean).join(' on ');
    const what = /land|plot/i.test(l.property_type) ? `This ${l.property_type}` : `This ${l.bedrooms}-bedroom, ${l.bathrooms}-bathroom ${l.property_type}`;
    return { description: `${what} in ${l.suburb || l.area} offers ${list}.${size ? ` It has ${size}.` : ''} ${cap(l.mandate_type)} mandate. Contact us today to arrange a viewing.`, written_by: 'template', note: 'Rules-only draft from the listing facts. Connect Claude, or have the agent polish the wording, before approval.' };
  },
  'seo.prepare'(ctx, { input: l }) {
    const kind = /land|plot/i.test(l.property_type) ? cap(l.property_type) : `${l.bedrooms} Bedroom ${cap(l.property_type)}`;
    let title = `${kind} for Sale in ${l.suburb || l.area} | Garden Route Lifestyle Property`; if (title.length > 60) title = `${kind} for Sale in ${l.suburb || l.area} | GRLP`; if (title.length > 60) title = `${kind} for Sale in ${l.area}`;
    const meta = `${kind} for sale in ${l.suburb || l.area}, ${rand(l.price)}. ${l.features[0]}. Ref ${l.ref}. Contact Garden Route Lifestyle Property to view.`.slice(0, 155);
    return { title, meta_description: meta, keywords: [`property for sale ${l.area}`, `${l.property_type} for sale ${l.area}`, `${l.area} estate agent`, 'Garden Route property'], slug_hint: `${l.ref}-${(l.suburb || l.area)}`.toLowerCase().replace(/[^a-z0-9]+/g, '-') };
  },
  'social.pack'(ctx, { input: l }) {
    const tags = ['#GardenRoute', '#FindYourWayHome', '#GRLP'];
    const areaTag = { george: '#GeorgeProperty', wilderness: '#WildernessProperty', hoekwil: '#WildernessProperty', sedgefield: '#SedgefieldProperty' }[l.area.toLowerCase()]; if (areaTag) tags.push(areaTag);
    tags.push('#HomesForSale', '#PropertyForSale', '#GardenRouteLiving', '#LifestyleProperty', '#SouthAfrica');
    if (/sea|ocean|beach|coast|lagoon/i.test(l.features.join(' '))) tags.push('#CoastalLiving');
    const details = [l.bedrooms && `${l.bedrooms} Bed`, l.bathrooms && `${l.bathrooms} Bath`, l.size_m2 && `${l.size_m2} m²`, rand(l.price), `${cap(l.mandate_type)} mandate`].filter(Boolean).join(' · ');
    const life = l.lifestyle_note || '[Lifestyle line — the listing agent to add one honest sentence on the feeling of the home]';
    const caption = (cta) => [sent(l.features[0]) + '.', details, life, cta, tags.join(' ')].join('\n\n');
    return {
      facebook: { size: '1080 × 1080 px', caption: caption(`Contact ${l.agent_name} on ${l.agent_phone}. Ref ${l.ref}.`) },
      instagram: { size: '1080 × 1080 px', caption: caption(`Contact ${l.agent_name} on ${l.agent_phone} or view the listing — link in bio. Ref ${l.ref}.`) },
      whatsapp: { audience: 'Opted-in buyers only', message: `NEW LISTING — ${l.area.toUpperCase()}\n${l.address}\n${rand(l.price)}\n${[l.bedrooms && `${l.bedrooms} Bed`, l.bathrooms && `${l.bathrooms} Bath`, l.size_m2 && `${l.size_m2} m²`].filter(Boolean).join(' · ')}\n${cap(l.mandate_type)} mandate · Ref ${l.ref}\nReply to arrange a viewing. Reply STOP to opt out.` },
      formula: 'Hook · Details · Lifestyle · CTA · Hashtags (brand kit caption formula)',
    };
  },
  'graphic.brief'(ctx, { input: l }) {
    const b = ctx.tenant.cfg.brand; const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const line = [l.bedrooms && `${l.bedrooms} Bed`, l.bathrooms && `${l.bathrooms} Bath`].filter(Boolean).join('  ·  ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" font-family="Montserrat, Arial, sans-serif">
<rect width="1080" height="1080" fill="#F2F2F0"/>
<rect x="0" y="0" width="1080" height="800" fill="#D5D5D0"/>
<text x="540" y="410" text-anchor="middle" font-size="34" font-weight="600" fill="#5A5A5A">PROPERTY PHOTO</text>
<text x="540" y="456" text-anchor="middle" font-size="22" fill="#5A5A5A">Place the approved, unfiltered photograph here</text>
<rect x="760" y="48" width="272" height="150" fill="#FFFFFF" stroke="${b.primary}" stroke-width="2" stroke-dasharray="10 8"/>
<text x="896" y="112" text-anchor="middle" font-size="20" font-weight="700" fill="${b.primary}">LOGO</text>
<text x="896" y="142" text-anchor="middle" font-size="15" fill="#3A3A3A">Place the approved file.</text>
<text x="896" y="164" text-anchor="middle" font-size="15" fill="#3A3A3A">Do not redraw or recolour.</text>
<rect x="0" y="800" width="1080" height="280" fill="${b.primary}"/>
<text x="64" y="884" font-size="46" font-weight="700" fill="#FFFFFF">FOR SALE — ${esc(l.area.toUpperCase())}</text>
<text x="64" y="946" font-size="36" font-weight="500" fill="#FFFFFF">${esc(rand(l.price))}${line ? `  ·  ${esc(line)}` : ''}</text>
<line x1="64" y1="984" x2="1016" y2="984" stroke="#FFFFFF" stroke-opacity=".4"/>
<text x="64" y="1034" font-size="26" fill="#FFFFFF">Ref ${esc(l.ref)}  ·  ${esc(ctx.tenant.cfg.contact.website)}</text>
</svg>`;
    const file = ctx.tenant.data('creative', `${l.ref}-social-1080.svg`); mkdirSync(ctx.tenant.data('creative'), { recursive: true }); writeFileSync(file, svg);
    return { file, format: '1080 × 1080 px social post', spec: `Layout template with logo slot (approved logo file to be placed, clear space = height of the G in GARDEN), photo area, maroon ${b.primary} footer band, Montserrat type, Ref ${l.ref} and website. Left-aligned text, generous white space.`, also_needed: ['1080 × 1920 story', 'A4/A5 print flyer at 300 dpi CMYK if printing'], note: 'This is a layout template, not finished artwork: a person places the real logo file and photograph.' };
  },
  'brand.check'(ctx, s) {
    const cfg = ctx.tenant.cfg;
    const results = [brandCheck(s.copy.description, 'copy', cfg), brandCheck(s.social.facebook.caption, 'social', cfg), brandCheck(s.social.instagram.caption, 'social', cfg), brandCheck(s.social.whatsapp.message, 'whatsapp', cfg), brandCheck(s.design.spec, 'design', cfg)];
    const violations = results.flatMap((r) => r.violations.map((v) => `${r.kind}: ${v}`)); const warnings = [...new Set(results.flatMap((r) => r.warnings.map((v) => `${r.kind}: ${v}`)))];
    if (violations.length) return { halt: 'brand check failed', problems: violations, warnings };
    return { passed: true, items_checked: results.length, warnings };
  },
  'campaign.assemble'(ctx, s) {
    const l = s.input;
    return { ref: l.ref, listing: { address: l.address, area: l.area, price: rand(l.price), mandate: l.mandate_type, agent: l.agent_name }, description: s.copy.description, written_by: s.copy.written_by, seo: s.seo, facebook: s.social.facebook, instagram: s.social.instagram, whatsapp: s.social.whatsapp, design_file: s.design.file, compliance: s.compliance, brand_warnings: s.brand.warnings, reviewer_checklist: ['Every fact matches the mandate and the property', 'Photographs are honest and well lit', 'Approved logo file placed with clear space', 'Any placeholder completed'] };
  },
  'schedule.content'(ctx, s) {
    // Brand kit weekly schedule: Monday is new-listing launch day (FB, IG); Wednesday is the mid-week push with the WhatsApp alert.
    const t = today(ctx); const dow = new Date(t).getUTCDay(); const toMon = ((8 - dow) % 7) || 7; const mon = addDays(t, toMon), wed = addDays(mon, 2);
    const posts = [['Facebook', mon, s.social.facebook.caption], ['Instagram', mon, s.social.instagram.caption], ['WhatsApp (opted-in list)', wed, s.social.whatsapp.message], ['Facebook', wed, s.social.facebook.caption]]
      .map(([platform, date, text]) => ctx.db.put('scheduled_post', { ref: s.input.ref, platform, date, text, status: 'approved — to be posted by a person (no live connection yet)', approval: s.campaign.approvalId }, ctx.db.nextId('POST')));
    ctx.db.update(`LST-${s.input.ref}`, { status: 'active', description: s.copy.description, marketed: ctx.db.now() });
    return { scheduled: posts.map((p) => ({ id: p.id, platform: p.platform, date: p.date })) };
  },
  'campaign.monitor'(ctx, s) {
    const c = ctx.db.put('campaign', { ref: s.input.ref, type: 'new listing', started: ctx.db.now(), posts: s.schedule.scheduled.length, enquiries: 0 }, ctx.db.nextId('CAMP'));
    const task = ctx.db.addTask({ title: `Review campaign results for ${s.input.ref}`, detail: `${c.id}: record reach and enquiries per platform`, agent: 'GRLP-A055', priority: 3, due: addDays(today(ctx), 14), runId: s.run?.id, by: 'GRLP-A055' });
    return { campaign: c.id, review_task: task };
  },

  // ───────── Sweeps, rentals, finance, knowledge ─────────
  'followup.sweep'(ctx) {
    const q = T(ctx).quiet_days; const raised = [];
    for (const b of ctx.db.list('buyer')) {
      if (['closed', 'bought', 'lost'].includes(b.status) || !b.band) continue;
      const quiet = daysBetween(b.last_contact, ctx.clock());
      if (quiet >= q[b.band] && !openTaskFor(ctx, `${b.id} follow-up`)) {
        raised.push({ buyer: b.id, name: b.name, band: b.band, quiet_days: quiet, task: ctx.db.addTask({ title: `${b.name} has gone quiet (${quiet} days, ${b.band} lead)`, detail: `${b.id} follow-up`, agent: 'GRLP-A035', priority: b.band === 'hot' ? 1 : 2, due: today(ctx), by: 'GRLP-A035' }) });
      }
    }
    return { quiet_buyers: raised };
  },
  'lease.renewals'(ctx) {
    const n = T(ctx).lease_renewal_notice_days; const raised = [];
    for (const l of ctx.db.list('lease')) {
      const left = daysBetween(ctx.clock(), l.end); if (left > n || l.renewal_actioned) continue;
      if (!openTaskFor(ctx, `${l.id} renewal`)) raised.push({ lease: l.id, property: l.property, ends: l.end, days_left: left, task: ctx.db.addTask({ title: `Lease at ${l.property} ends in ${left} days — start the renewal conversation`, detail: `${l.id} renewal. A person decides the terms.`, agent: 'GRLP-A081', priority: left <= 30 ? 1 : 2, due: addDays(today(ctx), 7), by: 'GRLP-A081' }) });
    }
    return { renewals_due: raised };
  },
  'mandate.track'(ctx) {
    const n = T(ctx).mandate_expiry_notice_days; const raised = [];
    for (const l of ctx.db.list('listing')) {
      if (l.status !== 'active' || !l.mandate_expiry) continue; const left = daysBetween(ctx.clock(), l.mandate_expiry);
      if (left <= n && !openTaskFor(ctx, `${l.ref} mandate`)) raised.push({ ref: l.ref, expires: l.mandate_expiry, days_left: left, task: ctx.db.addTask({ title: `Mandate ${l.ref} expires in ${left} days`, detail: `${l.ref} mandate renewal — seller conversation for ${l.agent_name}`, agent: 'GRLP-A017', priority: 2, due: addDays(today(ctx), 3), by: 'GRLP-A017' }) });
    }
    return { mandates_expiring: raised };
  },
  'maintenance.log'(ctx, { input }) {
    const u = urgency(input.description);
    const m = ctx.db.put('maintenance', { property: input.property, description: input.description, reported_by: input.reported_by || 'not recorded', urgency: u.level, status: 'open', logged: ctx.db.now(), sample: Boolean(input.sample) }, ctx.db.nextId('MNT'));
    const task = ctx.db.addTask({ title: `${cap(u.level)} maintenance at ${input.property}: ${input.description.slice(0, 60)}`, detail: `${m.id}. Respond ${u.respond}. Contractor and spend are decided by a person.`, agent: 'GRLP-A084', priority: u.level === 'urgent' ? 1 : u.level === 'high' ? 2 : 3, due: today(ctx), by: 'GRLP-A084' });
    return { request: m.id, urgency: u.level, respond: u.respond, task };
  },
  'maintenance.ack'(ctx, s) {
    const i = s.input; const body = `Good day${i.reported_by ? ` ${first(i.reported_by)}` : ''},\n\nThank you for letting us know about the problem at ${i.property}. We have logged it (reference ${s.log.request}) and will respond ${s.log.respond}.\n\n${SIGN(ctx.tenant.cfg.contact)}`;
    return { to: i.contact || 'contact detail not supplied', body, brand_check: brandCheck(body, 'message', ctx.tenant.cfg) };
  },
  scorecard(ctx) { return scorecards(ctx.db.list('activity'), T(ctx), today(ctx)); },
  'finance.overview'(ctx) {
    const month = today(ctx).slice(0, 7); const e = ctx.db.list('finance_entry').filter((x) => x.date?.startsWith(month)); const sum = (k) => e.filter((x) => x.kind === k).reduce((n, x) => n + x.amount, 0);
    const t = T(ctx); const sc = scorecards(ctx.db.list('activity'), t, today(ctx));
    return { month, entries: e.length, sales_commission: sum('commission'), rental_income: sum('rental_income'), operating_expenses: sum('expense'), outstanding: sum('outstanding'),
      net: sum('commission') + sum('rental_income') - sum('expense'), budget: ctx.db.getSetting('monthly_budget', null),
      forecast_commission: t.commission_rate_pct == null ? null : sc.company.targets.sales_value * t.commission_rate_pct / 100,
      note: e.length ? 'Management information from captured entries — not accounting records.' : 'No finance entries captured for this month. Connect the accounting system or capture entries to populate this.' };
  },
  'kb.answer'(ctx, { input }) { const hits = ctx.kb.search(input.question || input.query || '', { limit: 5 }); return { answer_from: hits.map((h) => ({ document: h.title, path: h.path, version: h.version, status: h.status, excerpt: h.excerpt })), note: hits.length ? 'Answer only from these documents.' : 'Nothing in approved knowledge covers this. Ask a person rather than guess.' }; },
  report(ctx, { input }) { const r = ctx.reports.generate(input?.period || 'week'); return { file: r.file }; },
  orchestrate(ctx) { return { status: 'The orchestrator runs through instruct(); it is not a workflow step.' }; },
};

const inPeriod = (rows, from, key = '_created') => rows.filter((r) => (r[key] || '') >= from);

export const metrics = {
  dashboard(ctx, from, per) {
    const period = per === 'day' ? 'today' : `this ${per}`; const db = ctx.db; const L = (t) => db.list(t); const listings = L('listing'), buyers = L('buyer'), act = L('activity');
    const sc = handlers.scorecard(ctx); const fin = handlers['finance.overview'](ctx);
    const count = (kind) => inPeriod(act, from.slice(0, 10), 'date').filter((a) => a.kind === kind).length;
    const overdue = db.tasks("status='open' AND due IS NOT NULL AND due < ?", today(ctx)).length;
    const days = [...Array(14)].map((_, i) => addDays(today(ctx), i - 13));
    return {
      tiles: [
        { label: 'New enquiries', value: inPeriod(buyers, from).length, hint: period },
        { label: 'Buyer leads', value: buyers.filter((b) => !['closed', 'lost', 'bought'].includes(b.status)).length, hint: `${buyers.filter((b) => b.band === 'hot').length} hot` },
        { label: 'Seller leads', value: L('seller_lead').length, hint: 'in pipeline' },
        { label: 'Active mandates', value: listings.filter((l) => l.status === 'active').length, hint: `${listings.filter((l) => l.status === 'active' && /exclusive|sole/i.test(l.mandate_type || '')).length} exclusive or sole` },
        { label: 'Properties listed', value: inPeriod(listings, from).length, hint: period },
        { label: 'Viewings', value: count('viewing') + inPeriod(L('viewing'), from).length, hint: period },
        { label: 'Offers', value: count('offer'), hint: period },
        { label: 'Sales concluded', value: count('sale'), hint: period },
        { label: 'Rental enquiries', value: inPeriod(L('rental_enquiry'), from).length, hint: period },
        { label: 'Maintenance open', value: L('maintenance').filter((m) => m.status === 'open').length, hint: `${L('maintenance').filter((m) => m.status === 'open' && m.urgency === 'urgent').length} urgent` },
        { label: 'Overdue follow-ups', value: overdue, hint: 'tasks past due', alert: overdue > 0 },
      ],
      tables: [
        { title: `Staff performance — ${sc.month} (${sc.month_elapsed_pct}% of month elapsed)`, note: 'Targets are per agent per month and can be changed under Targets.', columns: ['Agent', 'Prospecting', 'Valuations', 'Excl. mandates', 'Viewings', 'Offers', 'Sales', 'Mandate conv.', 'Commission'],
          rows: sc.agents.map((a) => [a.agent, `${a.prospecting_contact}/${a.targets.prospecting_contacts}${a.on_pace.prospecting ? '' : ' ▼'}`, `${a.valuation}/${a.targets.valuations}${a.on_pace.valuations ? '' : ' ▼'}`, `${a.exclusive_mandate}/${a.targets.exclusive_mandates}${a.on_pace.exclusive_mandates ? '' : ' ▼'}`, a.viewing, a.offer, `${a.sale}/${a.targets.sales}${a.on_pace.sales ? '' : ' ▼'}`, a.conversion.valuation_to_mandate == null ? '—' : `${a.conversion.valuation_to_mandate}%`, a.commission == null ? 'rate not set' : rand(a.commission)]) },
        { title: 'Marketing activity', columns: ['Date', 'Platform', 'Listing', 'Status'], rows: L('scheduled_post').slice(-8).map((p) => [p.date, p.platform, p.ref, p.status]) },
        { title: `Financial overview — ${fin.month}`, note: fin.note, columns: ['Sales commission', 'Rental income', 'Operating expenses', 'Net', 'Outstanding', 'Budget', 'Commission forecast'],
          rows: [[rand(fin.sales_commission), rand(fin.rental_income), rand(fin.operating_expenses), rand(fin.net), rand(fin.outstanding), fin.budget == null ? 'not set' : rand(fin.budget), fin.forecast_commission == null ? 'commission rate not set' : rand(fin.forecast_commission)]] },
      ],
      trends: [{ label: 'Enquiries per day (14 days)', labels: days.map((d) => d.slice(5)), series: days.map((d) => buyers.filter((b) => (b.received || '').slice(0, 10) === d).length) },
        { label: 'Prospecting contacts per day (14 days)', labels: days.map((d) => d.slice(5)), series: days.map((d) => act.filter((a) => a.kind === 'prospecting_contact' && a.date === d).length) }],
      scorecards: sc,
    };
  },
  deadlines(ctx) {
    const t = T(ctx), out = [];
    for (const l of ctx.db.list('listing')) if (l.status === 'active' && l.mandate_expiry && daysBetween(ctx.clock(), l.mandate_expiry) <= t.mandate_expiry_notice_days) out.push({ date: l.mandate_expiry, text: `Mandate ${l.ref} expires` });
    for (const l of ctx.db.list('lease')) if (daysBetween(ctx.clock(), l.end) <= t.lease_renewal_notice_days) out.push({ date: l.end, text: `Lease ends at ${l.property}` });
    for (const k of ctx.db.tasks("status='open' AND due IS NOT NULL")) out.push({ date: k.due, text: k.title });
    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
  },
  warnings(ctx) {
    const out = [];
    for (const m of ctx.db.list('maintenance')) if (m.status === 'open' && m.urgency === 'urgent') out.push({ severity: 'high', text: `Urgent maintenance still open at ${m.property}` });
    const noAgent = ctx.db.list('buyer').filter((b) => b.band && !b.responsible_agent && !['closed', 'lost'].includes(b.status));
    if (noAgent.length) out.push({ severity: 'medium', text: `${noAgent.length} buyer lead(s) have no responsible agent` });
    const sc = handlers.scorecard(ctx); for (const a of sc.agents) if (!a.on_pace.prospecting) out.push({ severity: 'low', text: `${a.agent} is behind pace on prospecting (${a.prospecting_contact} of ${a.targets.prospecting_contacts})` });
    return out;
  },
  opportunities(ctx) {
    const out = []; const listings = ctx.db.list('listing');
    for (const b of ctx.db.list('buyer')) if (b.band === 'hot' && b.matches?.length) out.push(`${b.name} is a hot lead with ${b.matches.length} matching listing(s) — book a viewing`);
    const unmatched = ctx.db.list('buyer').filter((b) => b.band && !b.matches?.length && b.requirements?.areas?.length);
    const demand = unmatched.reduce((o, b) => ((o[b.requirements.areas[0]] = (o[b.requirements.areas[0]] || 0) + 1), o), {});
    for (const [area, n] of Object.entries(demand)) out.push(`${n} qualified buyer(s) want ${area} with no matching stock — a prospecting opportunity for sellers there`);
    if (!listings.length) out.push('No listings loaded yet — connect the listing feed or capture stock to enable buyer matching');
    return out;
  },
  attention(ctx) { return ctx.db.list('buyer').filter((b) => b.band === 'hot' && b.status !== 'closed').map((b) => `Hot lead: ${b.name} (${b.id})`).slice(0, 5); },
  improvements(ctx) {
    const out = []; if (T(ctx).commission_rate_pct == null) out.push('Commission rate is not set, so commission generated and forecasts show as unknown. Management can set it under Targets.');
    if (!Object.keys(ctx.db.getSetting('area_agents', {})).length) out.push('No area-to-agent assignment is recorded, so new leads without a listing land unassigned. Record who covers each area.');
    return out;
  },
};

/** Loads clearly-labelled sample records for testing and demonstration only. */
export function seed(ctx) {
  const t = today(ctx); const db = ctx.db; const S = (o) => ({ ...o, sample: true });
  const listings = [
    ['SAMPLE-GEO-001', 'George', 'George South', 'house', 2850000, 3, 2, 180, 650, 'sole', 75, ['open-plan living area', 'a covered patio', 'a double garage', 'a fenced garden']],
    ['SAMPLE-WIL-002', 'Wilderness', 'Wilderness Heights', 'house', 4950000, 4, 3, 260, 1200, 'exclusive', 20, ['sea views from the main deck', 'a wood-burning fireplace', 'a separate flatlet']],
    ['SAMPLE-SED-003', 'Sedgefield', 'The Island', 'townhouse', 1950000, 2, 2, 110, null, 'open', 120, ['a private courtyard', 'walking distance to the lagoon', 'a single garage']],
    ['SAMPLE-HOE-004', 'Hoekwil', 'Hoekwil', 'vacant land', 1250000, null, null, null, 8000, 'sole', 60, ['mountain views', 'borehole on site', 'a level building platform']],
  ];
  for (const [ref, area, suburb, type, price, bed, bath, size, erf, mandate, exp, features] of listings) db.put('listing', S({ ref, address: `SAMPLE — 1 Example Street, ${suburb}`, area, suburb, property_type: type, price, bedrooms: bed, bathrooms: bath, size_m2: size, erf_m2: erf, mandate_type: mandate, mandate_expiry: addDays(t, exp), features, photos: 12, agent_name: 'Sample Agent A', agent_phone: '082 000 0000', status: 'active', mandate_signed: true, mandatory_disclosure_received: true, fica_seller_complete: true }), `LST-${ref}`);
  const plan = { 'Sample Agent A': { prospecting_contact: 46, valuation: 5, exclusive_mandate: 2, viewing: 7, offer: 2, sale: 1 }, 'Sample Agent B': { prospecting_contact: 22, valuation: 2, exclusive_mandate: 1, viewing: 3, offer: 1, sale: 0 } };
  const dom = Number(t.slice(8, 10));
  for (const [agent, kinds] of Object.entries(plan)) for (const [kind, n] of Object.entries(kinds)) for (let i = 0; i < n; i++) db.put('activity', S({ agent_name: agent, kind, date: `${t.slice(0, 8)}${String(1 + (i % dom)).padStart(2, '0')}`, ...(kind === 'sale' ? { value: 2300000 } : {}) }), db.nextId('ACT'));
  db.put('lease', S({ property: 'SAMPLE — 5 Example Lane, George', tenant: 'Sample Tenant', end: addDays(t, 45) }), db.nextId('LSE'));
  db.put('lease', S({ property: 'SAMPLE — 9 Example Road, Sedgefield', tenant: 'Sample Tenant Two', end: addDays(t, 200) }), db.nextId('LSE'));
  db.put('seller_lead', S({ name: 'Sample Seller', area: 'Wilderness', stage: 'valuation booked' }), db.nextId('SEL'));
  db.audit('system', 'sample.seeded', ctx.tenant.id, { note: 'Sample records only — not real clients or properties' });
  return { listings: listings.length, activities: db.list('activity').length };
}
