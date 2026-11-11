/**
 * The written half of the products.
 *
 * Reference sections are generated from content/data/*.json and are not in
 * this file. What is here is the part that had to be written: the methods, the
 * worksheets' instructions, the template messages and the notices.
 *
 * Three rules were kept while writing it, and should be kept when editing it.
 *
 * 1. No new facts about a company, a scheme or a substance. Anything of that
 *    kind belongs in a dataset, with a source, where the review cycle and the
 *    citation monitor can see it. This file describes how to check, not what
 *    is true.
 * 2. Nothing here tells a reader what the law requires of them. It says what
 *    published guidance asks for and where to read it, and every product says
 *    in its first pages that it is not legal advice.
 * 3. A template asks a question or states what was seen. None of them alleges
 *    intent, and none of them threatens.
 */

export const EDITION = 'Edition 1 · November 2026';

// ------------------------------------------------------------------ notices

/** Shown on its own page straight after the contents of every product. */
export const NOTICE = {
  base: [
    'This is an educational reference published by FERAL FEMME. It is general information. It is not legal, regulatory, financial, medical or any other professional advice, and buying, downloading or reading it creates no adviser–client relationship of any kind.',
    'It does not certify, approve or guarantee that any claim, label, product or business practice is lawful, compliant, safe or ethical, anywhere. Laws, standards and certification rules differ from country to country and change often. What is described here follows the public sources cited, as they stood at the edition date on the cover.',
    'Nothing in it is a statement about the present conduct of any company. Where a company, a certification scheme or an organisation is named, the reference is to the public source given, and that source — not this document — is the authority.',
    'Use your own judgment. Before you act on anything here in a way that carries legal or financial consequences — publishing a claim, signing off packaging, making a formal complaint, saying something in public about a named business — read the primary source yourself and, where the stakes warrant it, take advice from a qualified professional in your own country.',
    'To the fullest extent the law permits, FERAL FEMME and its publisher accept no liability for any loss or damage arising from the use of, or reliance on, this document or anything in it. Nothing in this notice excludes or limits any right you have that cannot lawfully be excluded or limited.',
  ],
  templates:
    'The worksheets and template messages are starting points for you to adapt. They are not legal documents. Using one does not make a claim compliant, a complaint well-founded, or a statement about a business safe to publish.',
  ingredients:
    'It is not medical, dermatological or allergy advice. Formulations change without notice, and the label on the product in your hand — not this document — is the authority on what that product contains.',
};

export const LICENCE = {
  free: [
    'This one is free, and meant to travel. Print it, forward it, pin it up, hand it out — unaltered, with the FERAL FEMME name on it, and never for sale. Use in teaching is welcome.',
    'The same material is searchable and always current in the free tools at feral-femme.co/tools/. If a scheme changes its scope, the tool changes first and the next edition of this follows.',
  ],
  personal: [
    'One copy, one reader. Print as many of the worksheets as you need for your own use, and work through it with whoever you live with. Please do not repost, resell or redistribute the file: what it earns is what pays for the research, and for the free tools staying free.',
    'The reference sections are generated from datasets that are reviewed on a fixed cycle. Buying this edition does not include future editions, but it does include the free public tools at feral-femme.co/tools/, which are always current.',
  ],
  organisation: [
    'One licence covers one organisation. Circulate it internally as widely as you like — to your team, your agency, your printer, anyone who writes or signs off a claim on your behalf. Do not republish it, resell it, or post it publicly.',
    'The reference sections are generated from datasets that are reviewed on a fixed cycle. Buying this edition does not include future editions, but it does include the free public tools at feral-femme.co/tools/, which are always current.',
  ],
  corrections:
    'If something here is wrong, we would rather hear it than not: info@feral-femme.co. Substantive corrections are published in full at feral-femme.co/corrections/, with what was said, what was wrong, and when it changed.',
};

// ------------------------------------------------------ free: the logo guide

export const LOGO_STEPS = [
  {
    t: 'Find the name',
    b: 'A certification names itself. A leaf, a globe, a ticked circle or the words “eco approved” with no scheme behind them is the brand’s own artwork, and tells you what the brand thinks of itself.',
  },
  {
    t: 'Find the number',
    b: 'Many schemes issue a licence or certificate number and ask for it to be printed beside the mark. A missing number is not proof of anything — some schemes do not use them — but where there is one, it is the fastest thing on the pack to check.',
  },
  {
    t: 'Look it up at the source',
    b: 'Most schemes publish a searchable list of who they certify. Search the brand there, not on the brand’s own website. If the scheme keeps a register and the brand is not in it, ask the scheme — that is what it is there for.',
  },
  {
    t: 'Read what it covers',
    b: 'Each entry in this guide gives what the scheme verifies and, separately, what it does not. The second line is the useful one. Almost every mark is narrower than the feeling it gives off.',
  },
  {
    t: 'Check what the mark is attached to',
    b: 'One certified ingredient is not a certified product, and one certified product is not a certified brand. Read the small print next to the logo for what, exactly, it is being claimed for.',
  },
  {
    t: 'Notice what is missing',
    b: 'No single mark answers every question; each answers one. A mark about animals says nothing about wages, and a mark about fibres says nothing about the factory. What a pack does not carry is information too.',
  },
];

// -------------------------------------------------- free: the ingredient card

export const INCI_RULES = [
  {
    t: 'The names are standardised',
    b: 'Cosmetics are labelled with INCI names, an international naming system. It is why water appears as Aqua and beeswax as Cera Alba — and why a list can look more alarming, or more innocent, than it is.',
  },
  {
    t: 'The order means something',
    b: 'Under the EU Cosmetic Products Regulation, ingredients are listed in descending order of weight. Those below one per cent may follow in any order, and colourants may be listed last, in any order, by CI number. Other markets use similar rules; check your own.',
  },
  {
    t: '“Parfum” is one word for many substances',
    b: 'A fragrance blend may be listed under a single name, so its components do not each appear — with exceptions for certain listed allergens. If scent matters to you, the list will not settle it; the brand has to.',
  },
  {
    t: 'One substance, several names',
    b: 'The same ingredient can appear under a common name, a Latin name, a chemical name or a colour index number. Every entry here gives the names a label is likely to use.',
  },
  {
    t: 'Origin is not printed',
    b: 'Several common ingredients can come from an animal, a plant or a laboratory, and the name is identical in each case. Those are marked “ask first”. The list cannot tell you; only the brand can.',
  },
  {
    t: 'A list is about contents, not conduct',
    b: 'An ingredients list says what is in the product. It says nothing about whether the product or its ingredients were tested on animals — that depends on the brand’s policy and the markets it sells in. For that, look for a named certification.',
  },
];

// ------------------------------------------------------ free: the fabric card

export const FABRIC_RULES = [
  {
    t: 'Read the percentages, not the swing tag',
    b: 'In most markets the sewn-in label is a required statement of fibre content, by percentage. The card tied to the sleeve is marketing. When the two disagree in emphasis, the sewn-in one is the one that counts.',
  },
  {
    t: 'A fibre name is not a welfare claim',
    b: 'The label tells you what a garment is made of. It does not tell you where the fibre was grown or sheared, how an animal was kept, or who sewed it. Those answers, where they exist, sit in a named certification — or nowhere.',
  },
  {
    t: '“Vegan” and “faux” say what it is not',
    b: 'Neither word tells you what the material is. Turn to the fibre list for that, and then to the entry for that fibre here.',
  },
];

// ------------------------------------------------- paid: the brand audit

export const AUDIT_STANDARD = [
  {
    t: 'Public record only',
    b: 'If you cannot link to it, you cannot use it. A dated screenshot of a page that has since been deleted is a record. Something you were told, or something everybody knows, is not.',
  },
  {
    t: 'Date everything',
    b: 'Policies change and pages are rewritten. A finding is true as of the day you checked, and it is worth nothing without that day written next to it.',
  },
  {
    t: 'Quote the claim; never paraphrase it',
    b: 'The exact wording is the evidence. “Made with recycled materials” and “made from recycled materials” are different claims, and the difference is the audit.',
  },
  {
    t: 'Keep a finding and a conclusion apart',
    b: '“The scheme’s public register does not list this brand, searched on this date” is a finding. “The brand is lying” is a conclusion, and it is not one this workbook can support. Write down the first kind. Hold the second kind loosely.',
  },
  {
    t: 'Look for the answer before you record the gap',
    b: 'Read the brand’s FAQ, its policy pages and its latest report before deciding something is missing. When it is, record it as “not found”, with the date and the places you looked.',
  },
  {
    t: 'Not disclosed is not the same as failed',
    b: 'A small brand with no sustainability report has not thereby done anything wrong, and a large one with a long report has not thereby done anything right. The audit measures what can be shown.',
  },
];

export const AUDIT_CLAIM_TYPES = [
  ['A — Absolute', 'A flat statement with no qualifier: “sustainable”, “cruelty-free”, “non-toxic”.'],
  ['C — Comparative', 'Better than something: “greener”, “30% less plastic”, “lower impact”.'],
  ['F — Factual', 'Specific and checkable: a named certification, a percentage, a material.'],
  ['I — Implied', 'Carried by a picture, a colour, a product name or a logo rather than by a sentence.'],
];

export const AUDIT_QUESTIONS = [
  ['1', 'Is there a number?', 'A percentage, a weight, a date. A claim with no number in it is usually an adjective.'],
  ['2', 'Is the baseline named?', 'For any comparison: compared with what, and measured when. “Less” without a “than” is not a claim that can be checked.'],
  ['3', 'What does it cover?', 'The whole product, one ingredient, the packaging, or one range. Note the narrowest thing the wording could honestly mean.'],
  ['4', 'Who says so?', 'The brand itself, or an independent body you can name and look up.'],
  ['5', 'Can you read the evidence?', 'A certificate, a test report, a published method. “Available on request” counts only once you have requested it.'],
];

export const AUDIT_VERDICTS = [
  ['S', 'Supported', 'Evidence found, and it covers what the wording says.'],
  ['P', 'Partly', 'Evidence found, but it covers less than the wording implies.'],
  ['U', 'Unsupported', 'No evidence found after a real search. Record where you looked.'],
  ['?', 'Cannot tell', 'The evidence exists but cannot be read, or the claim is too vague to test.'],
];

export const RECORD_PLACES = [
  {
    t: 'Advertising regulators',
    b: 'Many publish their rulings in a searchable archive. Search the brand and its parent company, and read the ruling itself rather than a report of it.',
  },
  {
    t: 'Consumer and competition authorities',
    b: 'They announce investigations, undertakings and enforcement action on their own websites. An announcement that an investigation has opened is not a finding; look for how it closed.',
  },
  {
    t: 'Courts',
    b: 'Judgments are public in most countries. A case that has been filed tells you what one side alleges. Only a judgment, or the terms of a settlement, tells you how it ended.',
  },
  {
    t: 'The company’s own filings',
    b: 'Annual reports and regulatory filings often list litigation and regulatory matters the company considers material — in its own words, which is useful to have.',
  },
  {
    t: 'Established reporting',
    b: 'Treat a news report as a signpost to the primary document, then go and read that document. Cite the original publisher for anything you take from their reporting.',
  },
];

export const RECORD_RUNGS = [
  ['Complaint or claim filed', 'One side says so. Nothing has been decided.'],
  ['Investigation opened', 'An authority is looking. Nothing has been found.'],
  ['Ruling or finding', 'A named body has decided. Record which body, and exactly what it decided.'],
  ['Settlement', 'The matter ended by agreement — often expressly without admission of liability. Say so if it does.'],
  ['Dismissed or withdrawn', 'It ended without a finding against the company. It stays ended.'],
  ['Overturned or under appeal', 'An earlier decision no longer stands, or may not. Check before you rely on it.'],
];

export const DISCLOSURE_CHECKS = [
  'The parent company is named somewhere on the brand’s own site',
  'Other brands under the same owner can be identified',
  'A supplier or factory list is published',
  'An animal-testing policy is published, including its position on markets where testing is required',
  'A sourcing policy for materials or ingredients is published',
  'A sustainability or impact report gives numbers, with a baseline year',
  'Any targets are validated by a named independent body',
  'The brand has publicly corrected or withdrawn a claim in the past',
];

export const FAIR_RULES = [
  { t: 'Lead with the source, not the verdict', b: 'Say who found what, and link to it. The reader should be able to check you in one click.' },
  { t: 'Quote exactly', b: 'The claim in the brand’s words; the finding in the source’s words. Paraphrase is where errors get in.' },
  { t: 'Date it', b: 'Begin with “as of” and the day you checked. If the brand changes the page tomorrow, you were still right.' },
  { t: 'Name the rung', b: 'Filed, investigated, found, settled, dismissed. Use the word that is true and no stronger one.' },
  { t: 'Say what you did not find, and where you looked', b: '“I could not find a supplier list on the brand’s site on this date” is honest. “They hide their suppliers” is not something you know.' },
  { t: 'Offer a reply before you publish', b: 'Send the brand what you intend to say and give them a fair chance to correct it. Use the template on the next page, and include what they send.' },
  { t: 'Label opinion as opinion', b: 'You are entitled to a view. Put “I think” in front of it, and keep it in a different sentence from the facts.' },
  { t: 'Correct in public', b: 'If you got something wrong, fix it where you said it, and say that you did.' },
];

export const LETTER_REPLY = {
  subject: 'Request for comment — [brand], [topic]',
  body: [
    'Hello,',
    'I am preparing [a post / an article / a review] about [brand]’s claim that “[exact wording]”, which I saw on [packaging / page address] on [date].',
    'From public sources I found the following: [finding, with link]. [Second finding, with link.]',
    'I was not able to find: [what you looked for, and where you looked].',
    'Before I publish on [date], I would like to give you the opportunity to correct anything that is inaccurate, or to point me to evidence I have missed. I will include your response.',
    'Thank you,',
    '[Your name]',
  ],
};

// --------------------------------------------------- paid: the claims desk

export const IMPLIED_CHECKS = [
  'The colour palette — greens, browns, kraft textures — on a product with no environmental evidence behind it',
  'Photographs or drawings of leaves, water, animals or landscape',
  'A seal, badge or roundel we designed ourselves that could be taken for a certification',
  'A real certification logo placed near products it does not cover',
  'The product or range name itself — “Pure”, “Eco”, “Natural”, “Kind”',
  'Hashtags and captions on social posts, which are claims like any other',
  'A claim on the outer box that is true of the box and not of what is in it',
  'A founder’s story or “our values” page that promises more than the product pages can evidence',
];

export const LETTER_SUPPLIER = {
  subject: 'Evidence request — [material / ingredient / claim]',
  body: [
    'Hello,',
    'We are reviewing the claims we make about [product]. To go on describing it as “[claim]”, we need to hold the evidence ourselves.',
    'Please could you send, by [date]:',
    '1. The current certificate or licence for [scheme], showing its number, its scope and its expiry date.',
    '2. The name of the certified entity exactly as it appears on the scheme’s register.',
    '3. For any percentage or comparative figure: the method, the baseline and the year.',
    '4. Confirmation of whether this applies to everything supplied to us, or to specific batches or lines.',
    'If any of this cannot be provided, please tell us. We would rather change our wording than keep a claim we cannot support.',
    'Regards,',
    '[Name, role]',
  ],
};

// --------------------------------------- paid: the wardrobe & bathroom audit

export const HOME_RULE = [
  'Nothing in this workbook asks you to throw anything away. What you already own has already been made, and binning it changes nothing about how.',
  'The audit is of what you buy next. You will go through two rooms, write down what is there, find out what you can about it, and decide — once, in advance, and calmly — what you will look for when each thing runs out or wears through.',
  'It takes about four weeks at an hour a week. Nobody is marking it.',
];

export const HOME_WEEKS = [
  {
    t: 'Week one — the wardrobe',
    items: [
      'Pull out the ten things you wear most. Start there, not with the whole rail.',
      'Read the sewn-in label on each and copy the fibres and percentages onto the inventory.',
      'Look each fibre up in the fibre file. Mark the animal-derived ones.',
      'Note any certification named on the label, and look it up in the logo section.',
      'Give each item one verdict: keep, repair, or replace when worn out.',
    ],
  },
  {
    t: 'Week two — the bathroom shelf',
    items: [
      'Line up everything you use in a normal week.',
      'For each, check the ingredients list against the animal-derived names.',
      'Then check it against the “ask first” names, and write down any you find.',
      'Note any cruelty-free or vegan mark, and whether it is a named scheme.',
      'Circle the three products you will finish soonest. Those are the ones that matter first.',
    ],
  },
  {
    t: 'Week three — ask',
    items: [
      'Pick the three brands you buy from most.',
      'Send each the question that applies, using the templates.',
      'Log the date you asked.',
      'When a reply comes, mark it specific or not. Most are not. That is information.',
    ],
  },
  {
    t: 'Week four — the replacement list',
    items: [
      'For each thing that will run out or wear out soon, write what you will look for instead.',
      'Name the certification you will require, if one applies.',
      'Look for one candidate for each, and check it the same way you checked what you own.',
      'Cut out the two pocket cards and put them where you will have them in a shop.',
    ],
  },
];

export const LETTER_INGREDIENT = {
  subject: 'Question about an ingredient in [product]',
  body: [
    'Hello,',
    'Your [product] lists [ingredient name as printed]. Could you tell me whether it is derived from an animal, from a plant, or made synthetically?',
    'If the source varies by batch or supplier, I would be grateful if you could say so.',
    'Thank you,',
    '[Your name]',
  ],
};

export const LETTER_TESTING = {
  subject: 'Question about animal testing',
  body: [
    'Hello,',
    'Could you tell me:',
    '1. Whether you, your suppliers or any third party test your finished products or their ingredients on animals at any stage.',
    '2. Whether you sell in any market where animal testing is required by law for your products.',
    '3. Whether you are certified by an independent cruelty-free scheme, and if so which one.',
    'Thank you,',
    '[Your name]',
  ],
};

export const LETTER_FIBRE = {
  subject: 'Question about the [wool / down / leather] in [garment]',
  body: [
    'Hello,',
    'The label on your [garment] gives its content as [fibre and percentage].',
    'Is that material certified to a named standard? If so, could you tell me which one, and the certificate or licence number?',
    'Thank you,',
    '[Your name]',
  ],
};

export const REPLY_READING = [
  'A specific answer names a source, a scheme or a number. “Plant-derived, from coconut” is an answer. “Certified to this standard, licence number this” is an answer.',
  '“We take animal welfare extremely seriously” is not an answer, however sincerely it is meant. Record it as no answer, and decide what that means to you.',
  'No reply after two weeks is also recorded, as exactly that.',
];

// ------------------------------------------------- paid: the complaint kit

export const COMPLAINT_RULES = [
  {
    t: 'Say what you saw, not what you think they meant',
    b: 'You can prove what was printed. You cannot prove why. A complaint that sticks to the first is harder to dismiss and safer to make.',
  },
  {
    t: 'One claim per complaint',
    b: 'Pick the clearest example and make it well. A list of ten grievances is easier to set aside than one sentence nobody can explain.',
  },
  {
    t: 'Ask before you accuse',
    b: 'The brand may have the evidence and simply not have published it. Asking first costs you two weeks and makes everything after it stronger.',
  },
  {
    t: 'Keep everything',
    b: 'The pack, the screenshot, the dates, every message in and out. A regulator will ask, and so, eventually, will you.',
  },
  {
    t: 'Be the calmest person in the correspondence',
    b: 'No threats, no adjectives, no capital letters. Do not name or publish the details of individual staff. A measured complaint is taken more seriously, and it is the only kind worth sending.',
  },
];

export const COMPLAINT_ROUTES = [
  ['The wording is vague, or you cannot find the evidence for it', 'Ask the brand', 'Step three'],
  ['A certification mark or name is used and you cannot find the brand on the scheme’s register', 'Ask the scheme', 'Step four'],
  ['The claim appears in advertising and you believe it misleads', 'The advertising regulator', 'Step five'],
  ['It concerns labelling or trading practice more widely', 'The consumer protection authority', 'Step five'],
  ['The product is sold through a retailer or a marketplace', 'Tell them as well', 'Step six'],
];

export const EVIDENCE_CHECKS = [
  'A photograph of the pack, front and back, with the claim legible',
  'A screenshot of the web page, showing the address bar and the date',
  'The page saved or archived, in case it changes',
  'The exact wording copied out, character for character',
  'Where and when you saw it: shop, site, platform, date and time',
  'For a physical product, the batch or lot code if there is one',
  'For an advert, a recording or screenshot, and where it ran',
];

export const PROBLEM_TYPES = [
  ['An absolute with nothing behind it', '“Sustainable”, “eco-friendly”, “non-toxic”, with no evidence and no definition. Look the word up in the phrasebook at the back.'],
  ['A comparison with no baseline', '“Greener”, “less plastic”, “lower impact” — than what, and since when?'],
  ['A certification implied but not held', 'A scheme’s name or mark is used and the brand is not on the scheme’s register, or the mark is a look-alike.'],
  ['A part standing in for the whole', 'True of one ingredient, the packaging or one range, and presented as true of the product or the brand.'],
  ['A claim made by the picture', 'Nature imagery, colour or a badge creating an impression the words never quite state.'],
];

export const LETTER_BRAND = {
  subject: 'Question about your claim “[exact wording]”',
  body: [
    'Hello,',
    'On [date] I saw the claim “[exact wording]” on [your packaging / page address / advert].',
    'Could you tell me:',
    '1. What evidence supports it — a certificate, a test or a published report that I can read?',
    '2. What it covers: the whole product, one ingredient, the packaging, or a particular range?',
    '3. [For a comparison] What it is being compared with, and for which year?',
    'I would be grateful for a reply by [date, two weeks from today].',
    'Thank you,',
    '[Your name]',
  ],
};

export const LETTER_FOLLOWUP = {
  subject: 'Following up: your claim “[exact wording]”',
  body: [
    'Hello,',
    'I wrote on [date] asking what evidence supports the claim “[exact wording]”, and have not yet had a reply. My original message is below.',
    'I am still interested in the answer. If I have not heard by [date], I will record that no evidence was provided when asked.',
    'Thank you,',
    '[Your name]',
  ],
};

export const LETTER_SCHEME = {
  subject: 'Licence check — [brand]',
  body: [
    'Hello,',
    '[Brand] displays your [mark / name] on [product / page address], which I saw on [date]. A photograph is attached.',
    'I searched your public register for [the names you searched] and could not find them.',
    'Could you confirm whether [brand] is currently certified or licensed by you, and if so for which products?',
    'Thank you,',
    '[Your name]',
  ],
};

export const LETTER_REGULATOR = {
  subject: 'Complaint about an advertising claim — [brand]',
  body: [
    'The advertiser: [brand, and the company behind it if you know it].',
    'Where and when: [packaging / page address / platform / publication], seen on [date]. A copy is attached.',
    'The claim: “[exact wording]”.',
    'Why I believe it is misleading: A reasonable person reading this would understand [what it implies]. I could not find evidence that supports that. Specifically, [what is missing, or what you found that points the other way, with links].',
    'What I have already done: I asked the advertiser for its evidence on [date]. [They did not reply. / Their reply is attached.]',
    '[Optional, and only if you have read it:] Your published guidance at [address] says [short quotation].',
    '[Your name and contact details]',
  ],
};

export const LETTER_RETAILER = {
  subject: 'A claim on your listing for [product]',
  body: [
    'Hello,',
    'You list [product] with the claim “[exact wording]” ([page address], seen on [date]).',
    'I asked the brand what evidence supports it on [date]. [They did not reply. / They replied that …]',
    'Could you tell me whether you hold evidence for the claims made on your listings, and whether you will review this one?',
    'Thank you,',
    '[Your name]',
  ],
};

export const REGULATOR_NOTES = [
  'Regulators differ. Some rule on individual complaints and publish the outcome. Others do not answer individually at all, and use what they are sent to decide where to investigate. Read the body’s own “how to complain” page before you write, and follow its form if it has one.',
  'Whether a regulator covers a brand’s own website and its social media, as well as paid advertising, also varies. Its remit page will say.',
  'If your country is not listed, search for its advertising self-regulatory body and its consumer protection authority. Within the European Union, start with your national consumer authority.',
];

export const OUTCOMES = [
  ['Resolved informally', 'The advertiser changes or withdraws the wording without a formal ruling. This is the most common good outcome, and it counts.'],
  ['Upheld', 'The body agrees the claim misled. It is a decision about the claim, not a finding about anyone’s intentions.'],
  ['Not upheld', 'The body was not persuaded. That is not proof the claim was true — only that the case was not made.'],
  ['Outside remit', 'Wrong body. Its reply will usually say who the right one is.'],
  ['No response', 'Record it, with the date. Decide whether to try another route.'],
];

// ------------------------------------------------- added with the worksheets

/** Where a brand's claims are actually made. Used by both audit products. */
export const CLAIM_PLACES = [
  'The front of the pack, and the back, and the outer box',
  'Every product page, including the bullet points and the image captions',
  'The “about”, “our values” and “sustainability” pages',
  'The FAQ, where the careful version of a claim usually lives',
  'The social bio, and the captions and hashtags of the last twenty posts',
  'Paid adverts, including the ones only shown to other people',
  'Press releases, and the wording retailers have copied from them',
];

export const AUDIT_MODULES = [
  ['One', 'The claim inventory', 'Every claim the brand makes, quoted exactly.', '40 min'],
  ['Two', 'Testing each claim', 'Five questions and one of four verdicts per claim.', '45 min'],
  ['Three', 'The certifications', 'Each mark checked at the scheme, not at the brand.', '20 min'],
  ['Four', 'What it is made of', 'Materials and ingredients, and where they come from.', '20 min'],
  ['Five', 'The record', 'Rulings, cases and enforcement, each at its true status.', '30 min'],
  ['Six', 'Ownership and disclosure', 'Who owns it, and what it publishes about itself.', '20 min'],
];

/** The stronger sentence, and the one the evidence supports. Form only: the brackets are blanks. */
export const FAIR_PATTERNS = [
  ['“They lie about being cruelty-free.”', '“As of [date], I could not find [brand] on [scheme]’s public register. I have asked both the brand and the scheme.”'],
  ['“They were fined for greenwashing.”', '“On [date], [named body] ruled that [the advert] was misleading. The ruling is here: [link].”'],
  ['“They are being sued for it.”', '“A claim was filed in [court] on [date]. It alleges [what it alleges]. It has not been decided.”'],
  ['“They hide their suppliers.”', '“I could not find a supplier list on [brand]’s website on [date].”'],
  ['“Their sustainability claims are fake.”', '“[Brand] describes [product] as ‘[exact wording]’. I asked what evidence supports that on [date] and have not had a reply.”'],
  ['“Everyone knows they test on animals.”', '“[Brand]’s published policy, read on [date], says: ‘[quotation]’.”'],
];

export const REOPEN_CHECKS = [
  'The packaging or the website is being redesigned',
  'A supplier, a factory or a formulation changes',
  'A certificate reaches its expiry date',
  'The product goes on sale in a new country',
  'A scheme you rely on publishes a new version of its standard',
  'A regulator you answer to publishes new guidance',
  'A claim is questioned — by a customer, a retailer, a journalist or a regulator',
  'Twelve months have passed since the last sign-off',
];

export const CHALLENGE_STEPS = [
  { t: 'Pull the file before you reply', b: 'Find the entry for the claim: the wording, the evidence reference, the date and the name against it. Answer from the file, not from memory.' },
  { t: 'Send the document, not a reassurance', b: 'If the evidence exists, the fastest way through is to show it. If it has lapsed or never existed, say so internally at once.' },
  { t: 'Change the wording first, argue second', b: 'A claim that cannot be supported today should come down today. Whether it could once be supported is a separate conversation.' },
  { t: 'Take advice when the question is formal', b: 'A letter from a regulator, a lawyer or a competitor is the point at which a qualified professional in your own country should be reading it with you. This document is not a substitute for that.' },
];

export const PUBLIC_NOTE =
  'What you publish about a named business is your own statement, and the law on that differs widely between countries. Nothing on these pages makes a statement safe to publish. If you are unsure, do not publish it, or take advice first.';

/** How to fill in the two inventories. Rows of [column, what goes in it]. */
export const GUIDE_WARDROBE = [
  ['Fibres and percentages', 'Copy them exactly, in the order printed. “Wool 80%, polyamide 20%” — not “mostly wool”.'],
  ['Animal-derived?', 'Look each fibre up in File one. Write the fibre, not just yes or no.'],
  ['Certification named', 'Only a scheme with a name counts. Write the name, then look it up in File three.'],
  ['Verdict', 'Keep, repair, or replace when worn out. There is no column for throwing away.'],
];

export const GUIDE_BATHROOM = [
  ['Animal-derived names', 'Check the list against the first group in File two, including the other names each one goes by.'],
  ['“Ask first” names', 'The second group in File two. The label cannot tell you the origin; write the name down for week three.'],
  ['Mark on pack', 'Write the scheme’s name if there is one. A rabbit or a leaf with no name beside it is artwork.'],
  ['Runs out', 'Roughly when. The three that run out soonest are where week four starts.'],
];
