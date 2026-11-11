/**
 * What the interactive tools say that is not already in a dataset: the quiz
 * packs, the messages the builder writes, and the two sample labels.
 *
 * The same three rules as products/written.mjs, because the same risks apply.
 *
 * 1. No company and no real product is named. Every pack in the quiz is a
 *    kind of thing — "Shampoo", "Trainers" — with a claim on it. A quiz that
 *    put a real brand's wording on screen and called it greenwash would be a
 *    statement about that brand, made ten thousand times.
 * 2. Nothing here is a fact about a term or a scheme. Each quiz pack points at
 *    an entry in the lexicon, and the explanation shown is that entry's own
 *    text. The `why` line is method: what to look for, not what is true.
 * 3. Every message asks a question. None alleges anything and none threatens.
 *    The wording is the wording of the templates in The Complaint Kit and The
 *    Wardrobe & Bathroom Audit; these four are the free ones.
 */

/** `says` — it tells you something you could check. `nothing` — it does not. */
export const QUIZ = [
  { kind: 'Shampoo', claim: '100% Natural', answer: 'nothing', ref: ['t', 'Natural'],
    why: 'A word with no agreed meaning, and a percentage of nothing in particular.' },
  { kind: 'T-shirt', claim: 'Certified organic cotton', fine: 'GOTS · licence number on the label', answer: 'says', ref: ['s', 'GOTS'],
    why: 'A named scheme and a number you can look up on its register. Then read what the scheme does not cover.' },
  { kind: 'Kitchen spray', claim: 'Chemical-free', answer: 'nothing', ref: ['t', 'Chemical-free'],
    why: 'There is nothing that could make this true.' },
  { kind: 'Moisturiser', claim: 'Leaping Bunny approved', answer: 'says', ref: ['s', 'Leaping Bunny'],
    why: 'A named scheme, run by someone other than the brand. It answers one question, and only one.' },
  { kind: 'Coffee cup', claim: 'Eco-friendly', answer: 'nothing', ref: ['t', 'Eco-friendly'],
    why: 'An adjective. No number, no scheme, and no part of the product named.' },
  { kind: 'Notebook', claim: 'Cover: 80% post-consumer recycled board', answer: 'says', ref: ['t', 'Made with recycled materials'],
    why: 'A number, what kind of recycled, and which part it applies to. That is what a checkable claim looks like.' },
  { kind: 'Sunscreen', claim: 'Reef-safe', answer: 'nothing', ref: ['t', 'Reef-safe'],
    why: 'A conclusion, with no agreed test behind it.' },
  { kind: 'Trainers', claim: 'Our greenest pair yet', answer: 'nothing', ref: ['t', 'Greener / More sustainable'],
    why: 'Greener than what, and measured how? A comparison with no baseline cannot be checked.' },
  { kind: 'Eggs', claim: 'Cage-free', answer: 'says', ref: ['t', 'Cage-free'],
    why: 'It does tell you something: exactly one thing. Knowing how narrow is the skill.' },
  { kind: 'Face cream', claim: 'Dermatologist-tested', answer: 'nothing', ref: ['t', 'Dermatologist-tested'],
    why: '“Tested” says nothing about the result.' },
  { kind: 'Jumper', claim: 'Responsibly sourced wool', answer: 'nothing', ref: ['t', 'Responsibly sourced'],
    why: 'Responsible to whom, and verified by whom? No scheme is named.' },
  { kind: 'Jumper', claim: 'Wool certified to the Responsible Wool Standard', answer: 'says', ref: ['s', 'Responsible Down / Wool Standard (RDS / RWS)'],
    why: 'The same jumper, with a scheme named. Now there is something to look up.' },
];

export const QUIZ_BANDS = [
  [10, 'Nothing gets past you'],
  [8, 'A label reader'],
  [5, 'Getting harder to fool'],
  [0, 'The packaging is winning'],
];

/**
 * The messages. `fields` are the blanks the form asks for, in order; a token
 * in {braces} is replaced by what was typed, or left as a [bracketed] prompt
 * if it was not, so a half-filled form still produces something usable.
 */
export const LETTERS = [
  {
    id: 'claim',
    label: 'What evidence is behind a claim',
    fields: [
      ['claim', 'The claim, exactly as written', 'Eco-friendly packaging'],
      ['where', 'Where you saw it', 'the front of the pack'],
    ],
    subject: 'Question about your claim “{claim}”',
    body: [
      'Hello,',
      'On {date} I saw the claim “{claim}” on {where}.',
      'Could you tell me:',
      '1. What evidence supports it — a certificate, a test or a published report that I can read?',
      '2. What it covers: the whole product, one ingredient, the packaging, or a particular range?',
      '3. If it is a comparison, what it is being compared with, and for which year?',
      'I would be grateful for a reply by {due}.',
      'Thank you,',
      '{name}',
    ],
  },
  {
    id: 'ingredient',
    label: 'Where an ingredient comes from',
    fields: [
      ['product', 'The product', 'hand cream'],
      ['ingredient', 'The ingredient, as printed', 'Glycerin'],
    ],
    subject: 'Question about an ingredient in your {product}',
    body: [
      'Hello,',
      'Your {product} lists {ingredient}. Could you tell me whether it is derived from an animal, from a plant, or made synthetically?',
      'If the source varies by batch or supplier, I would be grateful if you could say so.',
      'Thank you,',
      '{name}',
    ],
  },
  {
    id: 'testing',
    label: 'Whether anything is tested on animals',
    fields: [],
    subject: 'Question about animal testing',
    body: [
      'Hello,',
      'Could you tell me:',
      '1. Whether you, your suppliers or any third party test your finished products or their ingredients on animals at any stage.',
      '2. Whether you sell in any market where animal testing is required by law for your products.',
      '3. Whether you are certified by an independent cruelty-free scheme, and if so which one.',
      'Thank you,',
      '{name}',
    ],
  },
  {
    id: 'fibre',
    label: 'Whether a fibre is certified',
    fields: [
      ['product', 'The garment', 'jumper'],
      ['fibre', 'The fibre and percentage, as on the label', '80% wool'],
    ],
    subject: 'Question about the material in your {product}',
    body: [
      'Hello,',
      'The label on your {product} gives its content as {fibre}.',
      'Is that material certified to a named standard? If so, could you tell me which one, and the certificate or licence number?',
      'Thank you,',
      '{name}',
    ],
  },
];

export const SAMPLES = {
  reader:
    'NATURAL & ECO-FRIENDLY hand cream. Cruelty-free. Dermatologist-tested. Leaping Bunny approved.\n' +
    'Ingredients: Aqua, Glycerin, Cera Alba, Cetearyl Alcohol, Lanolin, Squalane, Parfum, Tocopherol, CI 75470.\n' +
    'Gift pouch: 60% wool, 40% recycled polyester. Vegan leather trim.',
  brand:
    'Our new conscious collection is made from sustainable materials and is kinder to the planet. ' +
    'The packaging is eco-friendly and recyclable. Carbon neutral delivery on every order. ' +
    'Cotton certified by GOTS. Responsibly sourced wool.',
};
