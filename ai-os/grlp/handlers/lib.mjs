/** Pure helpers for GRLP agents. No I/O, so every rule here is unit-tested. */
export const rand = (n) => (n == null || isNaN(n) ? 'POA' : `R ${Math.round(n).toLocaleString('en-ZA').replace(/[  ,]/g, ' ')}`);
export const addDays = (d, n) => new Date(new Date(d).getTime() + n * 864e5).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 864e5);

export function normPhone(raw) {
  if (!raw) return { value: '', valid: false };
  let d = String(raw).replace(/[^\d+]/g, '');
  if (d.startsWith('00')) d = `+${d.slice(2)}`;
  if (/^0\d{9}$/.test(d)) d = `+27${d.slice(1)}`;
  else if (/^27\d{9}$/.test(d)) d = `+${d}`;
  const valid = /^\+27\d{9}$/.test(d) || /^\+(?!27)\d{8,14}$/.test(d);
  return { value: valid ? d : String(raw).trim(), valid, international: valid && !d.startsWith('+27') };
}
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e || '');

/** Pull only what the buyer explicitly said out of free text. */
export function parseRequirements(text, areas) {
  const t = String(text || ''); const out = {};
  const m = /R\s?(\d[\d\s,.]*)\s?(m(?:il(?:lion)?)?|k)?\b/i.exec(t);
  if (m) { let n = parseFloat(m[1].replace(/[\s,]/g, '')); if (/^m/i.test(m[2] || '')) n *= 1e6; else if (/^k/i.test(m[2] || '')) n *= 1e3; if (n >= 100000) out.budget_max = n; }
  const b = /(\d)\s*[- ]?\s*bed/i.exec(t); if (b) out.bedrooms_min = Number(b[1]);
  const found = areas.filter((a) => new RegExp(`\\b${a}\\b`, 'i').test(t)); if (found.length) out.areas = found;
  const ty = /\b(house|apartment|flat|townhouse|vacant land|plot|farm|smallholding)\b/i.exec(t); if (ty) out.property_type = ty[1].toLowerCase();
  if (/\bcash\b/i.test(t)) out.finance = 'cash'; else if (/pre[- ]?approv/i.test(t)) out.finance = 'pre-approved';
  return out;
}

export function scoreLead(b) {
  const r = b.requirements || {}; const reasons = []; let s = 0;
  const add = (n, why) => { s += n; reasons.push(`+${n} ${why}`); };
  if (r.budget_max) add(25, 'budget stated');
  if (['cash', 'pre-approved'].includes(r.finance)) add(25, `finance: ${r.finance}`); else if (r.finance === 'bond needed') add(10, 'needs a bond, not yet approved');
  const tf = Number(r.timeframe_months); if (tf && tf <= 3) add(20, 'wants to buy within 3 months'); else if (tf && tf <= 6) add(10, 'wants to buy within 6 months');
  if (r.areas?.length) add(10, 'areas specified');
  if (b.phone && b.email) add(10, 'phone and email given'); else if (b.phone || b.email) add(5, 'one contact method given');
  if (b.listing_ref) add(10, 'enquired about a specific listing');
  return { score: s, band: s >= 70 ? 'hot' : s >= 40 ? 'warm' : 'cold', reasons };
}

export function matchListings(buyer, listings) {
  const r = buyer.requirements || {}; const out = [];
  for (const l of listings) {
    if (l.status !== 'active') continue;
    const enquired = buyer.listing_ref && buyer.listing_ref === l.ref;
    const reasons = []; let score = 0; let ok = true;
    if (r.areas?.length) { if (r.areas.some((a) => [l.area, l.suburb].filter(Boolean).some((x) => x.toLowerCase() === a.toLowerCase()))) { score += 40; reasons.push(`in ${l.area}`); } else ok = false; }
    if (r.budget_max) { if (l.price <= r.budget_max * 1.05) { score += Math.round(30 * Math.min(1, l.price / r.budget_max)); reasons.push(l.price <= r.budget_max ? 'within budget' : 'within 5% above budget'); } else ok = false; }
    if (r.bedrooms_min) { if ((l.bedrooms || 0) >= r.bedrooms_min) { score += 15; reasons.push(`${l.bedrooms} bedrooms`); } else ok = false; }
    if (r.property_type) { if ((l.property_type || '').toLowerCase() === r.property_type) { score += 15; reasons.push(l.property_type); } else ok = false; }
    if (enquired) { reasons.unshift('the listing they enquired about'); score += 100; ok = true; }
    if (ok && (score > 0)) out.push({ ref: l.ref, area: l.area, price: l.price, bedrooms: l.bedrooms, property_type: l.property_type, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}

const EXAGGERATED = ['once in a lifetime', 'dream home', 'must-see', 'must see', 'unbelievable', 'jaw-dropping', 'breathtaking', 'magnificent', 'unbeatable', 'paradise', 'bargain', 'best in town', 'perfect in every way', 'luxury at its finest'];
const PROMISES = ['guaranteed', 'will sell for', 'valued at', 'is worth r', 'sure to appreciate', 'guaranteed return', 'cannot lose', 'below market value'];
const US_SPELLING = ['color', 'colors', 'neighbor', 'neighbors', 'neighborhood', 'center', 'centers', 'favorite', 'realize', 'organize', 'organized', 'customize', 'jewelry', 'gray', 'meters', 'liter', 'traveling', 'fiber', 'cozy', 'program'];
const CAPS_OK = new Set(['FOR', 'SALE', 'NEW', 'LISTING', 'GRLP', 'SOLD', 'ON', 'SHOW', 'POA', 'UNDER', 'OFFER', 'TO', 'RENT', 'WAY', 'HOME', 'FIND', 'YOUR', 'REF', 'STOP', 'SAMPLE', 'GARDEN', 'ROUTE']);

/** Brand kit rules as checks. `kind`: copy | social | whatsapp | message | design */
export function brandCheck(text, kind, cfg) {
  const violations = [], warnings = []; const low = text.toLowerCase();
  for (const p of PROMISES) if (low.includes(p)) violations.push(`Price promise or valuation wording: "${p}" (no agent may promise a price or value)`);
  for (const p of EXAGGERATED) if (low.includes(p)) warnings.push(`Possibly exaggerated language: "${p}" (brand kit: no flowery or exaggerated language)`);
  if (/\w+,\s+[^,.!?\n]{1,40},\s+and\s/i.test(text)) violations.push('Comma before the final "and" in a list (brand kit: do not use one)');
  for (const w of US_SPELLING) if (new RegExp(`\\b${w}\\b`, 'i').test(text)) violations.push(`US spelling "${w}" (brand kit: South African spelling throughout)`);
  if ((text.match(/!/g) || []).length > 1) warnings.push('More than one exclamation mark');
  const areas = new Set(cfg.areas.flatMap((a) => a.toUpperCase().split(' ')));
  const caps = (text.replace(/#\w+/g, '').match(/\b[A-Z]{4,}\b/g) || []).filter((w) => !CAPS_OK.has(w) && !areas.has(w));
  if (caps.length) warnings.push(`Words in capitals: ${[...new Set(caps)].join(', ')}`);
  if (/\[[^\]]{3,}\]/.test(text)) warnings.push('Contains a placeholder that a person must complete');
  if (kind === 'social') {
    const tags = text.match(/#\w+/g) || [];
    if (tags.length < 8 || tags.length > 10) violations.push(`${tags.length} hashtags (caption formula: 8–10 from the approved list)`);
    const bad = tags.filter((t) => !cfg.hashtags.includes(t)); if (bad.length) violations.push(`Hashtags not on the approved list: ${bad.join(' ')}`);
  }
  if (kind === 'whatsapp' && text.split(/\s+/).length > 200) violations.push('WhatsApp message over 200 words');
  if (kind === 'design') { if (!/ref/i.test(text)) violations.push('Design has no property reference number'); if (!/logo/i.test(text)) violations.push('Design has no logo placement'); }
  return { kind, passed: violations.length === 0, violations, warnings };
}

/** Sales performance engine: activity against configurable targets. */
export function scorecards(activities, targets, today) {
  const month = today.slice(0, 7); const day = Number(today.slice(8, 10));
  const dim = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
  const week = addDays(today, -6);
  const KINDS = ['prospecting_contact', 'valuation', 'mandate', 'exclusive_mandate', 'viewing', 'offer', 'sale'];
  const by = {};
  for (const a of activities) {
    if (!a.date?.startsWith(month)) continue;
    const c = (by[a.agent_name] ??= { agent: a.agent_name, ...Object.fromEntries(KINDS.map((k) => [k, 0])), prospecting_today: 0, prospecting_week: 0, sales_value: 0, commission: 0, commission_known: true });
    c[a.kind] = (c[a.kind] || 0) + 1;
    if (a.kind === 'exclusive_mandate') c.mandate++;
    if (a.kind === 'prospecting_contact') { if (a.date === today) c.prospecting_today++; if (a.date >= week) c.prospecting_week++; }
    if (a.kind === 'sale') {
      c.sales_value += a.value || 0;
      if (a.commission != null) c.commission += a.commission; else if (targets.commission_rate_pct != null) c.commission += (a.value || 0) * targets.commission_rate_pct / 100; else c.commission_known = false;
    }
  }
  const pace = day / dim; const pct = (n, t) => (t ? Math.round((n / t) * 100) : null);
  const cards = Object.values(by).map((c) => ({
    ...c,
    targets: { daily_prospecting: +(targets.prospecting_contacts / targets.working_days_per_month).toFixed(1), weekly_prospecting: Math.round(targets.prospecting_contacts / (targets.working_days_per_month / 5)), prospecting_contacts: targets.prospecting_contacts, valuations: targets.valuations, exclusive_mandates: targets.exclusive_mandates, sales: targets.sales },
    progress: { prospecting: pct(c.prospecting_contact, targets.prospecting_contacts), valuations: pct(c.valuation, targets.valuations), exclusive_mandates: pct(c.exclusive_mandate, targets.exclusive_mandates), sales: pct(c.sale, targets.sales) },
    on_pace: { prospecting: c.prospecting_contact >= targets.prospecting_contacts * pace, valuations: c.valuation >= targets.valuations * pace, exclusive_mandates: c.exclusive_mandate >= targets.exclusive_mandates * pace, sales: c.sale >= targets.sales * pace },
    conversion: { contact_to_valuation: pct(c.valuation, c.prospecting_contact), valuation_to_mandate: pct(c.mandate, c.valuation), viewing_to_offer: pct(c.offer, c.viewing), offer_to_sale: pct(c.sale, c.offer) },
    commission: c.commission_known ? c.commission : null,
  }));
  const sum = (k) => cards.reduce((n, c) => n + (c[k] || 0), 0);
  const n = cards.length || 1;
  return {
    month, month_elapsed_pct: Math.round(pace * 100), agents: cards,
    company: { agents: cards.length, prospecting_contact: sum('prospecting_contact'), valuation: sum('valuation'), mandate: sum('mandate'), exclusive_mandate: sum('exclusive_mandate'), viewing: sum('viewing'), offer: sum('offer'), sale: sum('sale'), sales_value: sum('sales_value'),
      commission: cards.every((c) => c.commission != null) ? cards.reduce((x, c) => x + c.commission, 0) : null,
      targets: { prospecting_contacts: targets.prospecting_contacts * n, valuations: targets.valuations * n, exclusive_mandates: targets.exclusive_mandates * n, sales: targets.sales * n, sales_value: targets.sales * n * targets.avg_sale_price },
      mandate_conversion_pct: pct(sum('mandate'), sum('valuation')) },
  };
}

export function urgency(desc) {
  const t = desc.toLowerCase();
  if (/(gas|fire|flood|burst|no water|electric shock|sparks|sewage|break-?in|security)/.test(t)) return { level: 'urgent', respond: 'today' };
  if (/(geyser|leak|no hot water|blocked|no power|electric)/.test(t)) return { level: 'high', respond: 'within one working day' };
  return { level: 'routine', respond: 'within three working days' };
}
