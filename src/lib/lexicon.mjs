/**
 * The lexicon the interactive tools read: every term, mark, material and
 * ingredient the site holds, reduced to what a scanner needs to find it in a
 * pasted label and say something true about it.
 *
 * Nothing in here is new information. It is the four reviewed datasets, plus
 * the claim tests the Claims Desk prints, plus the names a label actually uses
 * for each thing — which is the one part that had to be written, because a
 * dataset names a scheme the way the scheme names itself and a pack does not.
 *
 * Written out as /assets/js/lexicon.js, a plain script that sets a global, so
 * the single-file build can carry it once and every tool can read it without
 * a fetch (which file:// would refuse).
 */
import { slugify } from './util.mjs';

/** Names a pack is likely to print, by the scheme's name in the dataset. */
const SCHEME_NAMES = {
  'Leaping Bunny': ['Leaping Bunny', 'Cruelty Free International'],
  'PETA — Beauty Without Bunnies': ['Beauty Without Bunnies', 'PETA approved', 'PETA cruelty free', '=PETA'],
  'Certified Vegan (Vegan Society / Vegan Action)': ['Certified Vegan', 'Vegan Society', 'Vegan Action', 'Vegan trademark'],
  'RSPCA Assured': ['RSPCA Assured', '=RSPCA'],
  'Certified Humane': ['Certified Humane', 'Humane Farm Animal Care'],
  RSPO: ['=RSPO', 'Roundtable on Sustainable Palm Oil'],
  GOTS: ['=GOTS', 'Global Organic Textile Standard'],
  'OEKO-TEX Standard 100': ['OEKO-TEX', 'Oeko Tex', 'Standard 100'],
  Fairtrade: ['Fairtrade', 'Fairtrade International', '=FLOCERT'],
  'B Corp': ['B Corp', 'B Corporation', 'B-Corp', 'BCorp'],
  FSC: ['=FSC', 'Forest Stewardship Council'],
  'Soil Association Organic': ['Soil Association'],
  'USDA Organic / EU Organic Leaf': ['USDA Organic', 'EU Organic', 'Organic Leaf', '=USDA'],
  'Rainforest Alliance': ['Rainforest Alliance'],
  'Fair Wear Foundation': ['Fair Wear Foundation', 'Fair Wear'],
  'Responsible Down / Wool Standard (RDS / RWS)': [
    'Responsible Down Standard',
    'Responsible Wool Standard',
    '=RDS',
    '=RWS',
  ],
  'Global Recycled Standard (GRS)': ['Global Recycled Standard', '=GRS'],
  bluesign: ['bluesign'],
  'Cradle to Cradle Certified': ['Cradle to Cradle', '=C2C'],
  'Fair Trade Certified (US)': ['Fair Trade Certified', 'Fair Trade USA'],
  'ZQ Merino': ['ZQ Merino', 'ZQRX', '=ZQ'],
  'Regenerative Organic Certified (ROC)': ['Regenerative Organic Certified', 'Regenerative Organic'],
};

/** What a clothing label or a product page calls each material. */
const MATERIAL_NAMES = {
  Leather: ['leather', 'genuine leather', 'real leather', 'full grain leather', 'suede', 'nubuck', 'cowhide', 'lambskin', 'calfskin'],
  Wool: ['wool', 'lambswool', 'lambs wool', 'virgin wool'],
  Cashmere: ['cashmere'],
  'Down & Feathers': ['duck down', 'goose down', 'down filling', 'down fill', 'down feathers', 'feather filling', 'feathers', '%down'],
  Silk: ['silk', 'mulberry silk'],
  Fur: ['fur', 'real fur', 'mink', 'fox fur', 'rabbit fur', 'raccoon fur', 'chinchilla'],
  Mohair: ['mohair'],
  Angora: ['angora'],
  'Exotic skins': ['python', 'crocodile', 'alligator', 'ostrich leather', 'snakeskin', 'lizard skin', 'exotic skin'],
  'Viscose / Rayon': ['viscose', 'rayon'],
  Cotton: ['cotton'],
  'Hemp & Linen': ['hemp', 'linen', 'flax'],
  'Recycled Polyester (rPET)': ['recycled polyester', 'rpet'],
  'Bamboo fabric': ['bamboo', 'bamboo viscose'],
  Alpaca: ['alpaca'],
  Shearling: ['shearling', 'sheepskin'],
  'Peace Silk (Ahimsa)': ['peace silk', 'ahimsa silk', 'ahimsa'],
  'Merino wool': ['merino', 'merino wool'],
  'Organic cotton': ['organic cotton'],
  'Tencel / Lyocell': ['tencel', 'lyocell'],
  'Deadstock / recycled fabric': ['deadstock', 'recycled fabric'],
};

/** Spellings a pack uses for a term that the dataset files under one name. */
const TERM_EXTRA = {
  'Eco-friendly': ['eco friendly', 'ecofriendly', 'environmentally friendly', 'earth friendly', 'planet friendly'],
  Sustainable: ['sustainable', 'sustainably', 'sustainably made', 'sustainably sourced'],
  'Cruelty-free': ['cruelty free', 'not tested on animals', 'never tested on animals'],
  'Carbon-neutral': ['carbon neutral', 'co2 neutral', 'carbon neutral delivery'],
  'Net-zero': ['net zero'],
  'Non-toxic': ['non toxic', 'nontoxic', 'toxin free'],
  'Chemical-free': ['chemical free', 'free from chemicals', 'no chemicals'],
  'Plant-based': ['plant based', 'plant powered', 'plant derived'],
  'Conscious / Mindful': ['conscious', 'mindful', 'consciously made', 'conscious choice'],
  'No nasties': ['no nasties', 'nasties free', 'free from nasties'],
  'Ethically sourced': ['ethically sourced', 'ethical', 'ethically made'],
  'Responsibly sourced': ['responsibly sourced', 'responsible sourcing'],
  'Made with recycled materials': ['made with recycled materials', 'recycled materials', 'made from recycled'],
  'Dermatologist-tested': ['dermatologist tested', 'dermatologically tested', 'dermatologist approved'],
  'Reef-safe': ['reef safe', 'reef friendly'],
  'Ocean-bound plastic': ['ocean bound plastic', 'ocean plastic'],
  'Palm-oil free': ['palm oil free', 'no palm oil'],
  'Small-batch / Artisan': ['small batch', 'artisan', 'artisanal'],
  'Climate positive / Climate neutral': ['climate positive', 'climate neutral', 'carbon positive', 'climate friendly'],
  'Greener / More sustainable': ['greener', 'more sustainable', 'kinder to the planet', 'better for the planet', 'better for the environment'],
};

/**
 * Terms whose name in the dataset is also an ordinary word. "Clean" on its own
 * is what skin is after washing; only the phrases are the claim.
 */
const TERM_ONLY = {
  'Clean / Clean beauty': ['clean beauty', 'clean formula', 'clean formulation', 'clean ingredients', 'clean skincare', 'clean cosmetics'],
  Natural: ['natural', 'all natural', 'naturally derived', 'naturals'],
};

/**
 * Words with no agreed meaning: the claim checker says these need defining or
 * replacing, rather than evidencing. Every one of them is described that way
 * in its own test in products/copy.json.
 */
const VAGUE = new Set([
  'Natural',
  'Eco-friendly',
  'Sustainable',
  'Clean / Clean beauty',
  'Non-toxic',
  'Chemical-free',
  'Conscious / Mindful',
  'No nasties',
  'Greener / More sustainable',
  'Climate positive / Climate neutral',
  'Small-batch / Artisan',
  'Ethically sourced',
  'Responsibly sourced',
  'Hypoallergenic',
  'Reef-safe',
]);

const splitNames = (name) =>
  name
    .split(/\s*\/\s*|\s*\(\s*|\s*\)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

const uniq = (arr) => [...new Set(arr.map((s) => s.trim()).filter(Boolean))];

export function buildLexicon({ greenwashing, certifications, materials, ingredients, tests }) {
  const entries = [];

  for (const t of greenwashing.terms) {
    entries.push({
      k: 't',
      n: t.term,
      u: `/tools/greenwashing/${slugify(t.term)}/`,
      c: t.cat,
      p: uniq(TERM_ONLY[t.term] ?? [...splitNames(t.term), ...(TERM_EXTRA[t.term] ?? [])]),
      a: t.claim,
      b: t.actual,
      x: tests[t.term] ?? '',
      v: VAGUE.has(t.term) ? 1 : 0,
    });
  }

  for (const s of certifications.schemes) {
    entries.push({
      k: 's',
      n: s.name,
      u: `/tools/certifications/${slugify(s.name)}/`,
      c: s.cat,
      p: uniq(SCHEME_NAMES[s.name] ?? [s.name]),
      r: s.runby,
      a: s.verifies,
      b: s.notguarantee,
    });
  }

  for (const m of materials.materials) {
    entries.push({
      k: 'm',
      n: m.name,
      u: `/tools/materials/${slugify(m.name)}/`,
      c: m.cat,
      p: uniq(MATERIAL_NAMES[m.name] ?? splitNames(m.name)),
      a: m.what,
      b: m.welfare,
      alt: m.alternatives,
    });
  }

  for (const i of ingredients.ingredients) {
    entries.push({
      k: 'i',
      n: i.name,
      u: `/tools/ingredients/${slugify(i.name)}/`,
      c: i.cat,
      p: uniq([i.name, ...(i.aliases ?? [])]),
      a: i.what,
      b: i.note ?? '',
    });
  }

  return {
    edition: [greenwashing.reviewed, certifications.reviewed, materials.reviewed, ingredients.reviewed].sort().pop(),
    originNote: ingredients.note,
    entries,
  };
}

/** The script body. Kept on one line per entry so a diff of it is readable. */
export function lexiconScript(lex) {
  return (
    '/* Generated by src/lib/lexicon.mjs from content/data — do not edit by hand. */\n' +
    'window.FF_LEX = ' +
    JSON.stringify(lex).replace(/</g, '\\u003c') +
    ';\n'
  );
}
