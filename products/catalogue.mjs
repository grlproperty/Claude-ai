/**
 * The eight products: what each one is, and what goes in it, in order.
 *
 * Four are free and four are sold. The free ones are the reference, complete:
 * every word, every mark, every ingredient and every fibre the site holds. The
 * sold ones are that reference put to work — worksheets to fill in, templates
 * to send, a method to follow from the first page to the last. Nothing is held
 * back from a free product to make a paid one look fuller; the difference is
 * between knowing and doing, and it is meant to be visible on the contents
 * page.
 *
 * `make(data)` returns the sections. The engine in build.mjs adds the cover,
 * the contents, the notice and the page numbers.
 */
import * as W from './written.mjs';
import {
  sec, intro, h3, p, paras, steps, checks, callout, ruleNote, keep, key, ws, fill, pair, letter, said, rewrites,
  termBrand, termReader, scheme, material, ingredient, cmpTerms, cmpMaterials, cmpIngredients,
  authorities, regulators, pocket, colophon, byCat, CATS, esc,
} from './parts.mjs';

const E = W.EDITION;

const schemesByCat = (certs) =>
  byCat(certs.schemes).map(([c, list]) => `${h3(CATS[c] ?? c)}${list.map(scheme).join('')}`).join('');

const animalFibres = (mats) => mats.materials.filter((m) => m.cat === 'animal');
const otherFibres = (mats) => mats.materials.filter((m) => m.cat !== 'animal');
const ingBy = (ings, cat) => ings.ingredients.filter((i) => i.cat === cat);

const wardrobeCard = ({ mats, certs }) =>
  pocket({
    tag: 'Wardrobe · pocket card',
    title: 'Before the till: the label',
    blocks: [
      ['Read', 'the sewn-in label, by percentage. The swing tag is marketing.'],
      ['Animal fibres, by name:', animalFibres(mats).map((m) => m.name).join(' · ') + '.'],
      ['“Vegan” and “faux”', 'say what it is not. Find the fibre.'],
      ['Marks about animals:', certs.schemes.filter((s) => s.cat === 'animals').map((s) => s.name).join(' · ') + '. Look each one up.'],
      ['A fibre name', 'is not a welfare claim. That sits in a named certification, or nowhere.'],
    ],
  });

const bathroomCard = ({ ings }) =>
  pocket({
    tag: 'Bathroom · pocket card',
    title: 'Before the till: the ingredients',
    blocks: [
      ['Animal-derived:', ingBy(ings, 'Animal').map((i) => i.name).join(' · ') + '.'],
      ['Ask first — origin varies:', ingBy(ings, 'Varies').map((i) => i.name).join(' · ') + '.'],
      ['The order', 'is by weight, down to one per cent.'],
      ['The list', 'shows contents, not testing. For testing, look for a named scheme.'],
    ],
  });

const cutNote = '<p class="cut-note">Print at 100%. Cut along the dashed line. Fold once.</p>';

// ======================================================================= free

const phrasebook = {
  slug: 'phrasebook',
  num: '01',
  tier: 'free',
  title: 'The Phrasebook',
  line: 'Thirty-six label words, decoded.',
  sub: 'Thirty-six words that sound like a promise on a label, with what each one is meant to make you think — and what it actually tells you.',
  kind: 'Reference · 36 words',
  licence: 'free',
  stamp: 'Free · print it · pass it on',
  tocIntro: 'Read part one once. Keep part two for when you meet a word you do not trust.',
  keywords: ['greenwashing', 'labels', 'claims', 'consumer'],
  make: ({ gw, copy }) => [
    sec('Part one', 'Six habits', `
${intro('You do not need to memorise anything. You need six habits, and each takes about a minute once it is a habit.')}
${steps(copy.consumerSteps)}`),
    sec('Part two', `${gw.terms.length} words, decoded`, `
${intro('These are the terms that do the most work on packaging and carry the least. For each: what you are meant to think, what it tells you, and where that reading comes from.')}
${byCat(gw.terms).map(([c, list]) => `${h3(CATS[c] ?? c)}${list.map(termReader).join('')}`).join('')}`, 'tight'),
    sec('Part three', 'What this cannot do', `
${intro('A phrasebook that claimed to settle every question would be doing the thing it warns you about.')}
${paras([
  'It will not tell you whether a particular product is ethical. No document can. Checking one brand means reading its published policy, the scope of its certifications, where it sells and who owns it — and any answer goes out of date when a formulation or a supplier changes.',
  'What it gives you is what each word does and does not tell you, and where that reading comes from. It takes a minute per product and produces an answer you can explain, which is worth more than one you have to trust.',
])}
${colophon('free', E)}`),
  ],
};

const logoGuide = {
  slug: 'logo-guide',
  num: '02',
  tier: 'free',
  title: 'The Logo Guide',
  line: 'Twenty-two certification marks, and what each covers.',
  sub: 'Twenty-two certification marks: who runs each, what it verifies, and — the useful line — what it does not.',
  kind: 'Reference · 22 marks',
  licence: 'free',
  stamp: 'Free · print it · pass it on',
  tocIntro: 'Part one is how to check any mark. Part two is the marks themselves, grouped by what they are about.',
  keywords: ['certification', 'labels', 'cruelty-free', 'organic', 'fair trade'],
  make: ({ certs }) => [
    sec('Part one', 'Six checks for any logo', `
${intro('A logo is a claim like any other. These six checks work on every mark in this guide and on every mark that is not in it.')}
${steps(W.LOGO_STEPS)}`),
    sec('Part two', `${certs.schemes.length} marks, and what each covers`, `
${intro('For each scheme: who runs it, what it verifies, and what it does not. Almost every one is narrower than the feeling it gives off.')}
${schemesByCat(certs)}`),
    sec('Part three', 'Before you rely on a mark', `
${intro('Schemes revise their standards, and brands gain and lose certification.')}
${paras([
  'Each entry describes a scheme’s scope as set out in the source cited, at the edition date on the cover. The scheme’s own website is the authority on what it requires today, and its own register is the authority on who holds it.',
  'A mark that is absent tells you nothing by itself: certification costs money, and small producers often go without. A mark that is present tells you one thing, precisely. This guide is for knowing which thing.',
])}
${colophon('free', E)}`),
  ],
};

const ingredientReader = {
  slug: 'ingredient-reader',
  num: '03',
  tier: 'free',
  title: 'The Ingredient Reader',
  line: 'Fifty-three ingredient names, by where they come from.',
  sub: 'Fifty-three names from the back of the bottle: which come from an animal, which might, and how to read the list they sit in.',
  kind: 'Reference · 53 names',
  licence: 'free',
  stamp: 'Free · with a pocket card',
  notice: { ingredients: true },
  tocIntro: 'Part one explains how an ingredients list works. Parts two and three are the names worth knowing. The pocket card is at the back.',
  keywords: ['ingredients', 'INCI', 'cosmetics', 'vegan', 'animal-derived'],
  make: (d) => {
    const { ings } = d;
    const rest = ['Plant', 'Mineral', 'Synthetic'];
    return [
      sec('Part one', 'How to read the list', `
${intro('Six things about an ingredients list that the list itself does not tell you.')}
${steps(W.INCI_RULES)}`),
      sec('Part two', 'Animal-derived', `
${intro(`${ingBy(ings, 'Animal').length} ingredients that come from an animal, with the names a label uses for each.`)}
${ingBy(ings, 'Animal').map(ingredient).join('')}`),
      sec('Part three', 'Ask first', `
${intro(`${ingBy(ings, 'Varies').length} ingredients that can come from an animal, a plant or a laboratory. The name on the label is the same whichever it is, so the only way to know is to ask the brand.`)}
${ingBy(ings, 'Varies').map(ingredient).join('')}`, 'tight'),
      sec('Part four', 'The rest of the list', `
${intro('The plant, mineral and synthetic names you will meet most often, so that an unfamiliar word is not mistaken for an animal one.')}
${rest.map((c) => `${h3(c)}${cmpIngredients(ingBy(ings, c))}`).join('')}
${ruleNote('Origin is not conduct.', ings.note)}`),
      sec('Part five', 'The pocket card', `
${intro('The two lists that matter in a shop, on something small enough to carry.')}
${cutNote}
${bathroomCard(d)}
${colophon('free', E)}`),
    ];
  },
};

const fabricReader = {
  slug: 'fabric-reader',
  num: '04',
  tier: 'free',
  title: 'The Fabric Reader',
  line: 'Twenty-one fibres, and what each one cost.',
  sub: 'Twenty-one fibres from the sewn-in label: what each is, what it cost the animal where there was one, and what exists instead.',
  kind: 'Reference · 21 fibres',
  licence: 'free',
  stamp: 'Free · with a pocket card',
  tocIntro: 'Part one is how to read a clothing label. Parts two and three are the fibres. The pocket card is at the back.',
  keywords: ['fabric', 'fibres', 'wool', 'leather', 'clothing labels'],
  make: (d) => {
    const { mats } = d;
    return [
      sec('Part one', 'How to read the label', `
${intro('Three things to know before the fibre names mean anything.')}
${steps(W.FABRIC_RULES)}`),
      sec('Part two', 'Animal fibres', `
${intro(`${animalFibres(mats).length} materials taken from an animal, with the welfare position on each and what can be worn instead.`)}
${animalFibres(mats).map((m) => material(m, false)).join('')}`),
      sec('Part three', 'Plant and synthetic fibres', `
${intro('Not automatically better, and not all alike. What each is, and what to ask of it.')}
${otherFibres(mats).map((m) => material(m, false)).join('')}`),
      sec('Part four', 'The pocket card', `
${intro('The fibre names and the marks, on something small enough to carry.')}
${cutNote}
${wardrobeCard(d)}
${colophon('free', E)}`),
    ];
  },
};

// ======================================================================= paid

const brandAudit = {
  slug: 'brand-audit-workbook',
  num: '05',
  tier: 'paid',
  title: 'The Brand Audit Workbook',
  line: 'Audit a brand from the public record, in six modules.',
  sub: 'Check a brand yourself, from the public record, in an afternoon — and come out with findings you can source, date and stand behind.',
  kind: 'Workbook · six modules',
  licence: 'personal',
  licenceLabel: 'Personal licence',
  stamp: 'Worksheets · templates · reference',
  notice: { templates: true },
  tocIntro: 'Work the six modules in order; each feeds the next. The reference sections at the back are for looking things up while you do.',
  keywords: ['brand audit', 'greenwashing', 'due diligence', 'worksheets'],
  make: ({ gw, certs, mats, ings, sources, regs }) => [
    sec('Start here', 'The standard', `
${intro('An audit is only as good as the rule it was run to. These six are the ones Feral Femme works to, and the workbook assumes them throughout.')}
${steps(W.AUDIT_STANDARD)}
${callout('What an audit is not', [
  'It is not an investigation, and it does not find things out that are not already public. It collects what a brand says, sets it beside what can be shown, and records the difference with a date on it.',
  'It ends in findings, not in a judgment of anyone’s character. Keep it that way and what you write afterwards will be both fairer and much harder to argue with.',
])}`),
    sec('Start here', 'How the workbook runs', `
${intro('Six modules, about three hours in all. You need a browser, a printer and something to write with.')}
<table class="key">${W.AUDIT_MODULES.map((m) => `<tr><td class="k k--narrow">${esc(m[0])}</td><td class="k k--mid">${esc(m[1])}</td><td class="d">${esc(m[2])}</td><td class="t">${esc(m[3])}</td></tr>`).join('')}</table>
${fill('The audit, at a glance', [
  'Brand:',
  'Company behind it, if known:',
  'Website and accounts:',
  'Products or range I am looking at:',
  'Why I am auditing it:',
  'Date started:',
])}`),
    sec('Module one', 'The claim inventory', `
${intro('Before anything can be checked it has to be written down. Collect every claim the brand makes about animals, people or the environment — in its own words, with where and when you saw it.')}
${h3('Where claims live')}
${checks(W.CLAIM_PLACES)}
${keep(`${h3('Four kinds of claim')}${key(W.AUDIT_CLAIM_TYPES, 'k--mid')}`)}
${ws({ title: 'Worksheet 1 · Claim inventory', page: true, cols: [
  { h: 'No.', w: '7%' }, { h: 'The claim, exactly as written', w: '43%' }, { h: 'Where seen', w: '24%' }, { h: 'Date', w: '14%' }, { h: 'Type', w: '12%', hint: 'A C F I' },
] })}`),
    sec('Module two', 'Testing each claim', `
${intro('Take the claims one at a time and ask the same five questions of each. Then give it one of four verdicts — and write down where you looked.')}
${h3('Five questions')}
${key(W.AUDIT_QUESTIONS.map((q) => [q[1], q[2]]), 'k--mid')}
${h3('Four verdicts')}
${key(W.AUDIT_VERDICTS.map((v) => [`${v[0]} — ${v[1]}`, v[2]]), 'k--mid')}
${ruleNote('Look the word up.', 'If a claim rests on a single adjective, find it in Reference B at the back before you go any further. What it is taken to mean and what it tells you are usually different things.')}
${ws({ title: 'Worksheet 2 · Claim tests', size: 'tall', page: true, cols: [
  { h: 'Claim no.', w: '9%' }, { h: 'Number?', w: '12%' }, { h: 'Baseline?', w: '13%' }, { h: 'Covers what', w: '18%' }, { h: 'Who says so', w: '16%' }, { h: 'Evidence read — where', w: '22%' }, { h: 'Verdict', w: '10%', hint: 'S P U ?' },
] })}`),
    sec('Module three', 'The certifications', `
${intro('A certification is the strongest kind of claim a brand can make, because somebody else can be asked about it. So ask.')}
${key(W.LOGO_STEPS.map((s) => [s.t, s.b]), 'k--mid')}
${ws({ title: 'Worksheet 3 · Certification check', size: 'tall', legend: 'Attached to: the product · one ingredient · the brand as a whole', cols: [
  { h: 'Scheme named on pack or site', w: '24%' }, { h: 'Number shown', w: '14%' }, { h: 'Found on the scheme’s register — date', w: '22%' }, { h: 'Attached to', w: '16%' }, { h: 'Does not cover (Reference A)', w: '24%' },
], rows: 6 })}
${h3('If the brand is not on the register')}
${p('Ask the scheme. It is a question, not a report: the register may be out of date, or the brand may be certified under its company name.')}
${letter(W.LETTER_SCHEME, 'Template · licence check')}`),
    sec('Module four', 'What it is made of', `
${intro('Composition is the one part of an audit the brand has to print. Read the label or the ingredients list for the products you are looking at, and record what is there.')}
${paras([
  'For fabrics, copy the fibres and percentages from the sewn-in label and look each one up in Reference C. For cosmetics and household products, check the list against the animal-derived names and then against the “ask first” names — those whose origin the label cannot tell you.',
  'Where the origin is not printed, the finding is “not stated”, and the next step is a question to the brand. Record the date you asked.',
])}
${ws({ title: 'Worksheet 4 · Composition', legend: 'Origin: animal · plant · synthetic · mineral · not stated', cols: [
  { h: 'Product', w: '22%' }, { h: 'Material or ingredient, as printed', w: '28%' }, { h: 'Origin', w: '16%' }, { h: 'Certified? Which scheme', w: '18%' }, { h: 'Asked the brand — date', w: '16%' },
], rows: 12 })}`),
    sec('Module five', 'The record', `
${intro('What regulators, courts and the company itself have put on the public record. This is the module where precision matters most, because it is the one where being loosely right is the same as being wrong.')}
${h3('Where to look')}
${steps(W.RECORD_PLACES)}
${keep(`${h3('The status of a matter')}
${p('Every matter you find is on one of these rungs. Record which, in these words, and do not move it up a rung in the retelling.')}
${key(W.RECORD_RUNGS, 'k--mid')}`)}
${ruleNote('Search the parent as well as the brand.', 'Matters are usually recorded against the legal entity, not the name on the pack. The Record Checker at feral-femme.co/tools/record/ is a place to start; it is not exhaustive, and the absence of a brand from it means only that it is not in it.')}
${ws({ title: 'Worksheet 5 · The record', size: 'tall', cols: [
  { h: 'Matter, in one line', w: '26%' }, { h: 'Body or court', w: '17%' }, { h: 'Date', w: '11%' }, { h: 'Rung', w: '14%' }, { h: 'Link to the primary document', w: '32%' },
], rows: 6 })}`),
    sec('Module six', 'Ownership and disclosure', `
${intro('Who owns the brand, and what it is willing to publish about itself. Tick what you can find; for what you cannot, record where you looked.')}
${ws({ title: 'Worksheet 6 · Disclosure', right: 'Found · where · date', cols: [
  { h: 'Published by the brand', w: '46%' }, { h: 'Found', w: '10%', hint: 'Y / N' }, { h: 'Where, or where I looked', w: '30%' }, { h: 'Date', w: '14%' },
], rows: W.DISCLOSURE_CHECKS.map((c) => [c, null, null, null]) })}
${ruleNote('Not disclosed is not the same as failed.', 'A small brand with no report has not thereby done anything wrong. Record the gap as a gap.')}`),
    sec('The result', 'The scorecard', `
${intro('One page that says what you found. It is the page to keep, and the page to come back to when you check again in a year.')}
${ws({ title: 'Scorecard', size: 'short', right: 'One per brand, per audit', cols: [
  { h: 'Line', w: '44%' }, { h: 'Result', w: '38%' }, { h: 'As of', w: '18%' },
], rows: [
  'Claims found', 'Supported', 'Partly supported', 'Unsupported', 'Cannot tell',
  'Marks found, and how many confirmed at the scheme', 'Animal-derived materials or ingredients',
  'Matters on the record, with the rung of each', 'Disclosure items found, out of eight', 'Questions sent, and answered',
].map((r) => [r, null, null]) })}
${pair('What I can say, with a source', 'What I cannot say yet')}
${ruleNote('The scorecard is a working note.', 'It records what you found on the dates you looked. It is not a rating, and it should not be published as one.')}`),
    sec('Going public', 'Writing it up fairly', `
${intro('If the audit is only for you, stop at the scorecard. If you intend to say any of it out loud, these are the rules that keep it accurate.')}
${steps(W.FAIR_RULES)}
${ruleNote('Before you publish.', W.PUBLIC_NOTE)}`),
    sec('Going public', 'The sentences, and the right of reply', `
${intro('The same finding can be written two ways. One of them you can defend with a link.')}
${said(W.FAIR_PATTERNS)}
${letter(W.LETTER_REPLY, 'Template · request for comment')}`),
    sec('Reference A', 'Certification scopes', `
${intro(`${certs.schemes.length} schemes. For each: who runs it, what it verifies, and what it does not.`)}
${schemesByCat(certs)}`),
    sec('Reference B', 'The phrasebook', `
${intro(`${gw.terms.length} words that appear in claims, with what each one actually tells you. The full entries, with sources, are in The Phrasebook, which is free.`)}
${byCat(gw.terms).map(([c, list]) => `${h3(CATS[c] ?? c)}${cmpTerms(list)}`).join('')}`),
    sec('Reference C', 'Materials and ingredients', `
${intro('What things are made of, in brief. The full entries are in The Fabric Reader and The Ingredient Reader, which are free.')}
${h3('Fibres and materials')}
${cmpMaterials(mats.materials)}
${h3('Cosmetic and household ingredients')}
${cmpIngredients(ings.ingredients)}`),
    sec('Reference D', 'Where to look', `
${intro('The public sources this workbook draws on, and the bodies that publish rulings and take complaints.')}
${h3('Regulators and complaint bodies')}
${regulators(regs.bodies)}
${h3('Primary authorities')}
${authorities(sources.authorities)}
${colophon('personal', E)}`),
  ],
};

const claimsDesk = {
  slug: 'claims-desk',
  num: '06',
  tier: 'paid',
  title: 'The Claims Desk',
  line: 'A claims review procedure and working file, for brands.',
  sub: 'For anyone who writes or signs off a claim. A review procedure, the evidence each of thirty-six terms calls for, and the working file that shows what you checked.',
  kind: 'Working file · for brands',
  licence: 'organisation',
  licenceLabel: 'Single-organisation licence',
  stamp: 'Procedure · register · working file',
  notice: { templates: true },
  tocIntro: 'The method and the five working documents are the part you use. The four reference sections are what you consult while using them.',
  keywords: ['green claims', 'substantiation', 'marketing claims', 'claims review'],
  make: ({ gw, certs, mats, sources, regs, copy }) => [
    sec('Method', 'How to run a claims review', `
${intro('Six steps. The whole method fits on two pages; everything after it is either a document the method produces or a reference the method needs.')}
${steps(copy.procedure)}
${ruleNote('The easiest failure to find, and to fix.', 'A comparative claim with no stated comparator — “greener”, “better for the planet”, “more sustainable”. Either name the baseline or delete the comparison.')}`),
    sec('Working document 1', 'The claim inventory', `
${intro('Step one, on paper. Every claim, quoted exactly, with where it appears — including the ones nobody remembers approving.')}
${h3('Where claims live')}
${checks(W.CLAIM_PLACES)}
${keep(`${h3('Four kinds of claim')}${key(W.AUDIT_CLAIM_TYPES, 'k--mid')}`)}
${ruleNote('Give every claim an owner.', 'The person who can say where the evidence is. A claim nobody owns is a claim nobody has checked.')}
${ws({ title: 'Working document 1 · Claim inventory', page: true, cols: [
  { h: 'No.', w: '7%' }, { h: 'The claim, exactly as it appears', w: '41%' }, { h: 'Where it appears', w: '26%' }, { h: 'Type', w: '12%', hint: 'A C F I' }, { h: 'Owner', w: '14%' },
] })}`),
    sec('Working document 2', 'The implied claim', `
${intro('Step five, on paper. What the page says without saying it. Walk through the product as a buyer meets it and tick anything that applies; each tick is a claim, and goes in the inventory.')}
${checks(W.IMPLIED_CHECKS)}
${ws({ title: 'Working document 2 · Implied claims found', size: 'tall', cols: [
  { h: 'What creates the impression', w: '34%' }, { h: 'What a buyer would now believe', w: '36%' }, { h: 'Can we support that?', w: '16%' }, { h: 'Inventory no.', w: '14%' },
], rows: 6 })}`),
    sec('Working document 3', 'The evidence file', `
${intro('Step three, on paper. One line per claim: the document that supports it, where it is kept, and when it runs out. A claim with an empty line here is not ready.')}
${ws({ title: 'Working document 3 · Substantiation index', cols: [
  { h: 'Claim no.', w: '9%' }, { h: 'The document that supports it', w: '33%' }, { h: 'Issued by', w: '18%' }, { h: 'Dated', w: '11%' }, { h: 'Expires', w: '11%' }, { h: 'Kept where', w: '18%' },
], rows: 12 })}
${h3('When the evidence is with a supplier')}
${p('A supplier’s assurance is not evidence until the document behind it is in your own file. Ask for it in writing, and log what comes back.')}
${letter(W.LETTER_SUPPLIER, 'Template · supplier evidence request')}
${ws({ title: 'Supplier request log', size: 'short', cols: [
  { h: 'Supplier', w: '24%' }, { h: 'Asked for', w: '30%' }, { h: 'Date sent', w: '13%' }, { h: 'Received', w: '13%' }, { h: 'Complete?', w: '20%' },
], rows: 7 })}`),
    sec('Working document 4', 'Sign-off', `
${intro('Step six, on paper. The verdict on each claim, a name against it, and a date. Print it, fill it in, keep it.')}
${ws({ title: 'Working document 4 · Sign-off sheet', size: 'tall', legend: 'Verdict: keep · reword · remove', cols: [
  { h: 'Claim no.', w: '9%' }, { h: 'Final wording', w: '35%' }, { h: 'Evidence ref.', w: '14%' }, { h: 'Verdict', w: '14%' }, { h: 'Approved by', w: '16%' }, { h: 'Date', w: '12%' },
], rows: 8 })}
${h3('Before you sign')}
${checks([
  'Every claim in the imagery is in the inventory, as well as every claim in the copy',
  'Every certification has been read against its published scope, not against what is remembered of it',
  'Every comparative claim names its baseline on the pack or the page, not in a footnote elsewhere',
  'Every line of the evidence file names a document we hold today',
  'There is a named person against each verdict',
])}`),
    sec('Working document 5', 'The change log', `
${intro('A claims file is true on the day it is signed. This is the page that keeps it true afterwards.')}
${h3('Re-open the file when')}
${checks(W.REOPEN_CHECKS)}
${ws({ title: 'Working document 5 · Change log', cols: [
  { h: 'Date', w: '11%' }, { h: 'What changed', w: '30%' }, { h: 'Claims affected', w: '17%' }, { h: 'Action taken', w: '24%' }, { h: 'Re-approved by', w: '18%' },
], rows: 8 })}
${h3('If a claim is questioned')}
${steps(W.CHALLENGE_STEPS)}`),
    sec('Reference A', 'The claim register', `
${intro(`${gw.terms.length} terms. For each: what a buyer infers from it, what it actually means, and what you should be ready to show if you use it. The last line is the one to read before signing anything off.`)}
${byCat(gw.terms).map(([c, list]) => `${h3(CATS[c] ?? c)}${list.map((t) => termBrand(t, copy.tests[t.term])).join('')}`).join('')}`),
    sec('Reference B', 'Certification scopes', `
${intro(`${certs.schemes.length} schemes. For each: who runs it, what it verifies, and what it does not. The gap between the last two is where most claims break, because the logo suggests the wider reading and the standard supports the narrower one.`)}
${schemesByCat(certs)}`),
    sec('Reference C', 'Material claims', `
${intro(`${mats.materials.length} materials, with the welfare and environmental position on each and the alternatives that exist. For when a claim rests on what something is made of.`)}
${mats.materials.map((m) => material(m, true)).join('')}`, 'tight'),
    sec('Reference D', 'Eight claims, rewritten', `
${intro('Eight common patterns, each with why it fails and a version that says something. The rewrite is longer every time. That is the trade: a sentence you can support costs more words than a word you cannot.')}
${rewrites(copy.rewrites)}
${ruleNote('These are illustrations of form.', 'The figures, dates and schemes in the rewrites are invented for the example. Yours have to be true, and you have to hold the document that shows it.')}
${ruleNote('Notice what the last one does.', 'It volunteers a limitation the brand was under no obligation to mention. That sentence does more than the certification logo, because it is the one a sceptical reader did not expect.')}`),
    sec('Sources', 'Where to check for yourself', `
${intro('Every reference entry traces back to one of these. None is behind a paywall. If you disagree with something here, this is where to go and settle it.')}
${h3('Regulators and guidance')}
${regulators(regs.bodies)}
${h3('Primary authorities')}
${authorities(sources.authorities)}
${colophon('organisation', E)}`),
  ],
};

const homeAudit = {
  slug: 'wardrobe-bathroom-audit',
  num: '07',
  tier: 'paid',
  title: 'The Wardrobe & Bathroom Audit',
  line: 'Four weeks, two rooms, and a list for what you buy next.',
  sub: 'Four weeks, an hour a week, two rooms. Find out what you already own is made of — and decide, once, what you will buy next.',
  kind: 'Workbook · four weeks',
  licence: 'personal',
  licenceLabel: 'Personal licence',
  stamp: 'Worksheets · templates · pocket cards',
  notice: { templates: true, ingredients: true },
  tocIntro: 'The four weeks are the workbook. The three files between them are what you look things up in while you work.',
  keywords: ['wardrobe audit', 'ingredients', 'vegan', 'cruelty-free', 'workbook'],
  make: (d) => {
    const { certs, mats, ings } = d;
    const rest = ['Plant', 'Mineral', 'Synthetic'];
    return [
      sec('Start here', 'The rule, and the four weeks', `
${intro('One rule first, because it changes what the next four weeks are for.')}
<div class="callout"><p class="lbl">The rule</p>${paras(W.HOME_RULE)}</div>
${W.HOME_WEEKS.map((w) => `<div class="week"><h4>${esc(w.t)}</h4>${checks(w.items)}</div>`).join('')}`),
      sec('Week one', 'The wardrobe', `
${intro('Ten things, not the whole rail. Read the sewn-in label on each and write down what it says.')}
${steps(W.FABRIC_RULES)}
${keep(`${h3('Filling in the inventory')}${key(W.GUIDE_WARDROBE, 'k--mid')}`)}
${ws({ title: 'Worksheet 1 · Wardrobe inventory', page: true, legend: 'Verdict: keep · repair · replace when worn out', cols: [
  { h: 'Item', w: '22%' }, { h: 'Fibres and percentages, as on the label', w: '32%' }, { h: 'Animal-derived?', w: '14%' }, { h: 'Certification named', w: '18%' }, { h: 'Verdict', w: '14%' },
], rows: 20 })}`),
      sec('File one', 'The fibre file', `
${intro(`${mats.materials.length} materials. What each one is, the welfare and environmental position on it, and what exists instead.`)}
${h3('Animal fibres')}
${animalFibres(mats).map((m) => material(m, true)).join('')}
${h3('Plant and synthetic fibres')}
${otherFibres(mats).map((m) => material(m, true)).join('')}`, 'tight'),
      sec('Week two', 'The bathroom shelf', `
${intro('Everything you use in a normal week, lined up. Read the back of each one against the two lists in the ingredient file.')}
${steps(W.INCI_RULES)}
${ws({ title: 'Worksheet 2 · Bathroom shelf', page: true, rows: 16, before: `<h3 style="margin-top:0">Filling in the shelf sheet</h3>${key(W.GUIDE_BATHROOM, 'k--mid')}`, cols: [
  { h: 'Product', w: '22%' }, { h: 'Animal-derived names found', w: '24%' }, { h: '“Ask first” names found', w: '24%' }, { h: 'Mark on pack — named scheme?', w: '18%' }, { h: 'Runs out', w: '12%' },
] })}`),
      sec('File two', 'The ingredient file', `
${intro(`${ings.ingredients.length} ingredients, in three groups: those that come from an animal, those that might, and the rest.`)}
${h3('Animal-derived')}
${ingBy(ings, 'Animal').map(ingredient).join('')}
${h3('Ask first — origin varies')}
${ingBy(ings, 'Varies').map(ingredient).join('')}
${rest.map((c) => `${h3(c)}${cmpIngredients(ingBy(ings, c))}`).join('')}
${ruleNote('Origin is not conduct.', ings.note)}`),
      sec('File three', 'The marks', `
${intro(`${certs.schemes.length} certification schemes: what each verifies and what it does not. Use it for any mark you wrote down in weeks one and two.`)}
${schemesByCat(certs)}`),
      sec('Week three', 'Ask', `
${intro('Three brands, one question each. The point is not the reply you hope for; it is finding out what kind of reply you get.')}
${letter(W.LETTER_INGREDIENT, 'Template · where an ingredient comes from')}
${letter(W.LETTER_TESTING, 'Template · animal testing')}
${letter(W.LETTER_FIBRE, 'Template · a fibre and its certification')}
${h3('Reading the reply')}
${checks(W.REPLY_READING)}
${ws({ title: 'Worksheet 3 · Reply log', size: 'tall', cols: [
  { h: 'Brand', w: '18%' }, { h: 'Question sent', w: '24%' }, { h: 'Date sent', w: '12%' }, { h: 'Replied', w: '12%' }, { h: 'Specific?', w: '10%', hint: 'Y / N' }, { h: 'What they said', w: '24%' },
], rows: 6 })}`),
      sec('Week four', 'The replacement list', `
${intro('The page the other three weeks were for. Nothing on it happens today; it happens the next time something runs out.')}
${ws({ title: 'Worksheet 4 · Replacement list', size: 'tall', cols: [
  { h: 'What is running out or wearing out', w: '24%' }, { h: 'What I will look for instead', w: '26%' }, { h: 'Certification I will require', w: '20%' }, { h: 'A candidate', w: '18%' }, { h: 'Checked?', w: '12%' },
], rows: 7 })}
${fill('My three rules, in my own words', ['1.', '2.', '3.'])}
${ruleNote('Check the candidate the way you checked what you own.', 'A replacement chosen on the strength of its packaging is the same purchase as the one it replaces.')}`),
      sec('To carry', 'The pocket cards', `
${intro('Both rooms, on two cards. They are a prompt for reading a label, not a substitute for reading it.')}
${cutNote}
${wardrobeCard(d)}
${bathroomCard(d)}`),
      sec('Colophon', 'Licence, corrections, edition', `
${intro('What you may do with this, what to do if something in it is wrong, and which edition it is.')}
${colophon('personal', E)}`),
    ];
  },
};

const complaintKit = {
  slug: 'complaint-kit',
  num: '08',
  tier: 'paid',
  title: 'The Complaint Kit',
  line: 'Ask, escalate and speak up, with a template for each step.',
  sub: 'You have seen a claim you do not believe. This is how to ask about it, who to take it to, and how to say so without overstating what you know.',
  kind: 'Kit · six steps',
  licence: 'personal',
  licenceLabel: 'Personal licence',
  stamp: 'Templates · logs · regulator list',
  notice: { templates: true },
  tocIntro: 'The six steps are in the order they should be taken. Most complaints end at step three, and that counts as a result.',
  keywords: ['complaint', 'greenwashing', 'advertising regulator', 'templates'],
  make: ({ gw, certs, sources, regs }) => {
    const countries = [...new Set(regs.bodies.map((b) => b.country))];
    return [
      sec('Before you start', 'Five rules, and where to go', `
${intro('A complaint that is calm, specific and evidenced gets read. These five rules are what make it that.')}
${steps(W.COMPLAINT_RULES)}
${h3('Which route')}
${key(W.COMPLAINT_ROUTES, 'k--mid')}`),
      sec('Step one', 'The evidence', `
${intro('Capture it before you do anything else. Pages change, and adverts stop running.')}
${checks(W.EVIDENCE_CHECKS)}
${ws({ title: 'Evidence log', size: 'tall', cols: [
  { h: 'Item', w: '26%' }, { h: 'What it shows', w: '34%' }, { h: 'Captured — date and time', w: '20%' }, { h: 'Saved where', w: '20%' },
], rows: 8 })}`),
      sec('Step two', 'The problem, in one sentence', `
${intro('If you cannot say what is wrong in a sentence, nobody you send it to will be able to either. Most problems are one of five kinds.')}
${key(W.PROBLEM_TYPES, 'k--mid')}
${fill('Problem statement', [
  'The claim, exactly as written:',
  'Where and when I saw it:',
  'What a reasonable person would take it to mean:',
  'What I looked for and could not find:',
  'What I am asking for:',
])}`),
      sec('Step three', 'Ask the brand', `
${intro('Start here, every time. The brand may have the evidence and simply not have published it — and if it does not, having asked is what makes every later step stronger.')}
${letter(W.LETTER_BRAND, 'Template · first message to the brand')}
${letter(W.LETTER_FOLLOWUP, 'Template · follow-up after two weeks')}
${keep(`${h3('Reading the reply')}${checks(W.REPLY_READING)}`)}
${fill('What the brand said', [
  'Reply received on:',
  'The evidence they pointed to:',
  'What that evidence covers:',
  'What is still unanswered:',
])}`),
      sec('Step four', 'Ask the scheme', `
${intro('Only where a certification is named or implied. A scheme has its own reasons to want to know when its mark is used by someone it does not certify.')}
${paras([
  'Search the scheme’s public register first, under the brand name and the company name. Reference B at the back lists what each of the schemes covers, so you can tell whether the mark is being used for the thing it certifies.',
  'Then ask the scheme a question. Do not tell it what the answer is.',
])}
${letter(W.LETTER_SCHEME, 'Template · licence check')}`),
      sec('Step five', 'The regulator', `
${intro('Where the claim is in advertising and the brand’s answer did not settle it. Read the body’s own guidance on how to complain before you write.')}
${checks(W.REGULATOR_NOTES)}
${letter(W.LETTER_REGULATOR, 'Template · complaint to a regulator', 'Use the body’s own form if it has one')}
${keep(`${h3(`Bodies in ${countries.length} countries`)}${regulators(regs.bodies)}`)}`),
      sec('Step six', 'The retailer', `
${intro('If the product is sold by someone other than the brand, they are repeating the claim. They are often quicker to act than the brand is.')}
${letter(W.LETTER_RETAILER, 'Template · message to a retailer or marketplace')}`),
      sec('Keep', 'The log, and how it ends', `
${intro('One line for everything sent and everything received. It is the document you will be asked for, and the one that tells you when to stop.')}
${h3('Five ways it can end')}
${key(W.OUTCOMES, 'k--mid')}
${ruleNote('Know when to stop.', 'A complaint that has been asked, answered and logged is finished, whether or not you liked the answer. The log is what lets you put it down.')}
${ws({ title: 'Complaint log', size: 'tall', page: true, cols: [
  { h: 'Date', w: '11%' }, { h: 'Sent to', w: '19%' }, { h: 'What I sent', w: '26%' }, { h: 'Reply due', w: '12%' }, { h: 'Reply received', w: '14%' }, { h: 'Next step', w: '18%' },
] })}`),
      sec('Going public', 'Saying it out loud', `
${intro('You may want to post about it. These are the rules that keep what you say accurate, and the sentences that stay inside what you know.')}
${steps(W.FAIR_RULES)}
${ruleNote('Before you publish.', W.PUBLIC_NOTE)}
${said(W.FAIR_PATTERNS)}`),
      sec('Reference A', 'The phrasebook', `
${intro(`${gw.terms.length} words that appear in claims: what each is taken to mean, what it tells you, and the source for that reading.`)}
${byCat(gw.terms).map(([c, list]) => `${h3(CATS[c] ?? c)}${list.map(termReader).join('')}`).join('')}`),
      sec('Reference B', 'Certification scopes', `
${intro(`${certs.schemes.length} schemes: who runs each, what it verifies, and what it does not.`)}
${schemesByCat(certs)}`),
      sec('Sources', 'Where to check for yourself', `
${intro('The public sources the reference sections draw on.')}
${authorities(sources.authorities)}
${colophon('personal', E)}`),
    ];
  },
};

export const CATALOGUE = [
  phrasebook, logoGuide, ingredientReader, fabricReader,
  brandAudit, claimsDesk, homeAudit, complaintKit,
];
