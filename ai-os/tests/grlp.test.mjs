import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { normPhone, parseRequirements, scoreLead, matchListings, brandCheck, scorecards, urgency, rand } from '../grlp/handlers/lib.mjs';
import { ctxFor, example, pending, approveAll } from './helpers.mjs';

const cfg = { hashtags: ['#GardenRoute', '#FindYourWayHome', '#GRLP', '#GeorgeProperty', '#HomesForSale', '#PropertyForSale', '#GardenRouteLiving', '#LifestyleProperty', '#SouthAfrica', '#CoastalLiving'], areas: ['George', 'Wilderness'] };

test('phone numbers, money and requirements', () => {
  assert.equal(normPhone('082 543 2681').value, '+27825432681');
  assert.equal(normPhone('+44 20 7946 0958').international, true);
  assert.equal(normPhone('12345').valid, false);
  assert.equal(rand(2850000), 'R 2 850 000');
  assert.deepEqual(parseRequirements('3 bed house in George up to R3m, cash buyer', cfg.areas), { budget_max: 3000000, bedrooms_min: 3, areas: ['George'], property_type: 'house', finance: 'cash' });
  assert.deepEqual(parseRequirements('please call me', cfg.areas), {}, 'nothing is invented from an empty message');
});

test('lead scoring explains itself', () => {
  const hot = scoreLead({ phone: 'x', email: 'y', requirements: { budget_max: 3e6, finance: 'cash', timeframe_months: 3, areas: ['George'] } });
  assert.equal(hot.band, 'hot'); assert.equal(hot.score, 90); assert.equal(hot.reasons.length, 5);
  assert.equal(scoreLead({ email: 'y' }).band, 'cold');
});

test('property matching respects area, budget and bedrooms', () => {
  const L = [{ ref: 'A', status: 'active', area: 'George', price: 2850000, bedrooms: 3, property_type: 'house' }, { ref: 'B', status: 'active', area: 'Wilderness', price: 2000000, bedrooms: 3, property_type: 'house' }, { ref: 'C', status: 'active', area: 'George', price: 4000000, bedrooms: 4, property_type: 'house' }, { ref: 'D', status: 'sold', area: 'George', price: 2000000, bedrooms: 3, property_type: 'house' }];
  const m = matchListings({ requirements: { areas: ['George'], budget_max: 3000000, bedrooms_min: 3 } }, L);
  assert.deepEqual(m.map((x) => x.ref), ['A']);
  assert.equal(matchListings({ listing_ref: 'C', requirements: { areas: ['Wilderness'] } }, L)[0].ref, 'C', 'the listing they asked about always comes first');
});

test('brand check enforces the brand kit', () => {
  const tags = cfg.hashtags.slice(0, 9).join(' ');
  assert.ok(brandCheck(`A quiet home with a garden and a garage.\n\n${tags}`, 'social', cfg).passed);
  assert.match(brandCheck('It has a pool, a garden, and a garage.', 'copy', cfg).violations[0], /final "and"/);
  assert.match(brandCheck('Guaranteed to sell fast', 'copy', cfg).violations[0], /Price promise/);
  assert.match(brandCheck('Close to the shopping center', 'copy', cfg).violations[0], /US spelling/);
  assert.match(brandCheck('Nice home #GardenRoute #Wow', 'social', cfg).violations.join('|'), /hashtags \(caption formula.*not on the approved list/);
  assert.ok(brandCheck('A dream home in paradise', 'copy', cfg).warnings.length === 2);
});

test('sales performance engine follows the targets', () => {
  const act = [...Array(40)].map(() => ({ agent_name: 'A', kind: 'prospecting_contact', date: '2026-11-10' })).concat([{ agent_name: 'A', kind: 'valuation', date: '2026-11-03' }, { agent_name: 'A', kind: 'valuation', date: '2026-11-04' }, { agent_name: 'A', kind: 'exclusive_mandate', date: '2026-11-05' }, { agent_name: 'A', kind: 'sale', date: '2026-11-09', value: 2000000 }, { agent_name: 'A', kind: 'sale', date: '2026-10-09', value: 9 }]);
  const t = { sales: 2, avg_sale_price: 2200000, exclusive_mandates: 4, valuations: 8, prospecting_contacts: 80, commission_rate_pct: null, working_days_per_month: 21 };
  const s = scorecards(act, t, '2026-11-15'); const a = s.agents[0];
  assert.equal(a.prospecting_contact, 40); assert.equal(a.progress.prospecting, 50); assert.equal(a.on_pace.prospecting, true);
  assert.equal(a.sale, 1, 'last month is excluded'); assert.equal(a.conversion.valuation_to_mandate, 50);
  assert.equal(a.commission, null, 'commission is unknown until a rate is set — never guessed');
  assert.equal(scorecards(act, { ...t, commission_rate_pct: 5 }, '2026-11-15').agents[0].commission, 100000);
  assert.equal(scorecards(act, { ...t, prospecting_contacts: 160 }, '2026-11-15').agents[0].on_pace.prospecting, false, 'changing a target changes the scorecard');
  assert.equal(s.company.targets.sales_value, 4400000);
});

test('maintenance urgency', () => { assert.equal(urgency('Burst pipe in kitchen').level, 'urgent'); assert.equal(urgency('Geyser is leaking').level, 'high'); assert.equal(urgency('Door handle loose').level, 'routine'); });

test('workflow: new buyer enquiry, end to end', async () => {
  const c = await ctxFor('grlp'); c.seed(c);
  const run = await c.workflows.start('new-buyer-enquiry', example(c, 'new-buyer-enquiry'));
  assert.equal(run.status, 'waiting_approval');
  const ap = pending(c)[0]; assert.equal(ap.action, 'client.message.send'); assert.match(ap.payload.body, /SAMPLE-GEO-001/); assert.match(ap.payload.body, /Find Your Way Home/);
  const b = c.db.list('buyer')[0]; assert.equal(b.band, 'hot'); assert.equal(b.consent_marketing, false); assert.deepEqual(b.matches, ['SAMPLE-GEO-001']);
  assert.ok(!existsSync(c.tenant.data('outbox')), 'nothing is released before approval');
  await approveAll(c, 'Kandy Grieve', run.id);
  const done = c.db.run(run.id); assert.equal(done.status, 'completed');
  assert.equal(c.db.runSteps(run.id).filter((s) => s.status === 'done').length, 11);
  assert.equal(c.db.list('viewing').length, 1); assert.ok(c.db.tasks("status='open'").length >= 2);
  // a second enquiry with the same phone is flagged as a duplicate
  const again = await c.workflows.start('new-buyer-enquiry', example(c, 'new-buyer-enquiry'));
  assert.equal(c.db.run(again.id).state.dedupe.duplicates.length, 1);
  c.close();
});

test('workflow: an enquiry with no usable contact detail stops and says why', async () => {
  const c = await ctxFor('grlp');
  const run = await c.workflows.start('new-buyer-enquiry', { name: 'No Contact', phone: '123' });
  assert.equal(run.status, 'blocked'); assert.match(run.error, /no usable contact/);
  const fixed = await c.workflows.resume(run.id, { email: 'someone@example.com' });
  assert.equal(fixed.status, 'waiting_approval');
  await assert.rejects(() => c.workflows.start('new-buyer-enquiry', {}), /needs: name/);
  c.close();
});

test('workflow: new property listing, end to end', async () => {
  const c = await ctxFor('grlp');
  const input = example(c, 'new-property-listing');
  const run = await c.workflows.start('new-property-listing', input);
  assert.equal(run.status, 'waiting_approval');
  const ap = pending(c)[0]; assert.equal(ap.action, 'campaign.launch');
  assert.match(ap.payload.description, /4-bedroom, 2-bathroom house in Heatherlands/); assert.doesNotMatch(ap.payload.description, /, and /);
  assert.equal((ap.payload.facebook.caption.match(/#\w+/g) || []).length, 9); assert.ok(ap.payload.seo.title.length <= 60);
  const svg = readFileSync(ap.payload.design_file, 'utf8'); assert.match(svg, /width="1080" height="1080"/); assert.match(svg, /#991C1F/); assert.match(svg, /Do not redraw/);
  assert.equal(c.db.get('LST-SAMPLE-GEO-010').status, 'draft', 'not marketed before approval');
  await approveAll(c, 'Mandy Pelser', run.id);
  assert.equal(c.db.run(run.id).status, 'completed'); assert.equal(c.db.get('LST-SAMPLE-GEO-010').status, 'active');
  assert.equal(c.db.list('scheduled_post').length, 4);
  assert.ok(c.db.list('scheduled_post').every((p) => /to be posted by a person/.test(p.status)));
  c.close();
});

test('workflow: a listing with missing facts or compliance documents cannot be marketed', async () => {
  const c = await ctxFor('grlp'); const base = example(c, 'new-property-listing');
  const a = await c.workflows.start('new-property-listing', { ...base, ref: 'SAMPLE-X1', price: null, features: ['one'] });
  assert.equal(a.status, 'blocked'); assert.deepEqual(a.state.check.missing, ['price', 'at least three factual features']);
  const b = await c.workflows.start('new-property-listing', { ...base, ref: 'SAMPLE-X2', fica_seller_complete: false });
  assert.equal(b.status, 'blocked'); assert.match(b.error, /compliance documents/); assert.match(b.state.compliance.note, /not a legal/);
  const d = await c.workflows.start('new-property-listing', { ...base, ref: 'SAMPLE-X3', features: ['a pool, a garden, and a garage', 'guaranteed to sell', 'a view'] });
  assert.equal(d.status, 'blocked'); assert.match(d.error, /brand check failed/);
  assert.equal(pending(c).length, 0);
  c.close();
});

test('daily sweep finds quiet buyers, expiring leases and mandates — once', async () => {
  let now = new Date('2026-11-15T08:00:00Z'); const c = await ctxFor('grlp', { clock: () => now }); c.seed(c);
  const run = await c.workflows.start('new-buyer-enquiry', example(c, 'new-buyer-enquiry')); await approveAll(c, 'Kandy Grieve', run.id);
  now = new Date('2026-11-20T08:00:00Z');
  for (const t of c.db.tasks("status='open'")) c.db.setTask(t.id, 'done');
  const s1 = (await c.workflows.start('daily-sweep')).state;
  assert.equal(s1.quiet.quiet_buyers.length, 1); assert.equal(s1.leases.renewals_due.length, 1); assert.equal(s1.mandates.mandates_expiring.length, 1);
  const s2 = (await c.workflows.start('daily-sweep')).state;
  assert.equal(s2.quiet.quiet_buyers.length + s2.leases.renewals_due.length + s2.mandates.mandates_expiring.length, 0, 'no duplicate tasks');
  c.close();
});

test('orchestrator routes instructions, and never guesses', async () => {
  const c = await ctxFor('grlp'); c.seed(c);
  const a = await c.orchestrator.instruct(`New buyer enquiry ${JSON.stringify(example(c, 'new-buyer-enquiry'))}`); assert.equal(a.status, 'waiting_approval');
  const b = await c.orchestrator.instruct('We have a new buyer lead from the website'); assert.equal(b.status, 'needs_information'); assert.deepEqual(b.missing, ['name']);
  const k = await c.orchestrator.instruct('What are the brand colours?'); assert.equal(k.status, 'done'); assert.match(JSON.stringify(k.result), /brand-kit\.md/);
  const s = await c.orchestrator.instruct('Show me the sales scorecard'); assert.equal(s.result.agents.length, 2);
  const q = await c.orchestrator.instruct('Write a LinkedIn post about the market'); assert.equal(q.status, 'queued'); assert.match(q.summary, /Claude connected/);
  const u = await c.orchestrator.instruct('zzz qqq'); assert.equal(u.status, 'unrouted');
  c.close();
});
