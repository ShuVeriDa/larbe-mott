// Stem-prefix exceptions: if a word token (after stress-mark removal and cyrLower) starts
// with one of these stems, the stem is replaced with the Arabic prefix and the remaining
// suffix (case ending) is transliterated normally.
// Keys must use Ӏ (U+04C0) — normalizePalochka + cyrLower applied before matching.
export const CYRILLIC_TO_ARABIC_STEM_EXCEPTIONS: { stem: string; arabic: string }[] = [
  // АллахӀ and all its case forms: АллахӀан, АллахӀа, АллахӀна, АллахӀе …
  // Also handles digit-1 keyboard variant (аллах1*).
  // Longer stem listed first so аллахӀ1 (unlikely) doesn't shadow аллахӀ.
  { stem: 'аллахӀ', arabic: 'الله' },
  { stem: 'аллах1', arabic: 'الله' },
];

// Bigrams must be checked before single chars
export const CYRILLIC_TO_ARABIC_BIGRAMS: [string, string][] = [
  ['гӀ', 'غ'],
  ['кх', 'ڤ'],
  ['къ', 'ق'],
  ['кӀ', 'ࢰ'],
  ['пӀ', 'ڥ'],
  ['тӀ', 'ط'],
  ['хь', 'ح'],
  ['хӀ', 'ه'],
  ['цӀ', 'ڗ'],
  ['чӀ', 'ݗ'],
  ['аь', 'َ۬'], // fatha + U+06EC
  ['оь', 'ٗ۬'], // inv-damma + U+06EC
  ['уь', 'ُ۬'], // damma + U+06EC
  ['юь', 'يُ۬'],
  ['яь', 'يَ۬'],
  ['иэ', 'ِئِ۬'], // /ie/ diphthong: kasra + hamza-on-ya (U+0626) + kasra + U+06EC — §4.5
  ['уо', 'ُؤٗ'], // /uo/ diphthong: damma + hamza-on-waw (U+0624) + inv-damma — §4.5
  // э handled via CYRILLIC_TO_ARABIC_VOWELS (single char, not a true bigram)
];

export const CYRILLIC_TO_ARABIC_CONSONANTS: [string, string][] = [
  ['б', 'ب'],
  ['в', 'و'],
  ['г', 'ڠ'],
  ['д', 'د'],
  ['ж', 'ج'],
  ['з', 'ز'],
  ['й', 'ي'],
  ['к', 'ك'],
  ['л', 'ل'],
  ['м', 'م'],
  ['н', 'ن'], // nazalized handled in service
  ['п', 'پ'],
  ['р', 'ر'],
  ['с', 'س'],
  ['т', 'ت'],
  ['ф', 'ف'],
  ['х', 'خ'],
  ['ц', 'ﮃ'],
  ['ч', 'چ'],
  ['ш', 'ش'],
  ['ъ', 'ء'],
  ['Ӏ', 'ع'],
];

// Vowels: map to diacritic (medial form); word-start gets alef + diacritic in service
export const CYRILLIC_TO_ARABIC_VOWELS: Record<string, string> = {
  'а': 'َ',       // fatha
  'и': 'ِ',       // kasra
  'у': 'ُ',       // damma
  'о': 'ٗ',       // inverted damma
  'е': 'ِ۬', // kasra + U+06EC
  'э': 'ِ۬', // kasra + U+06EC (same as е medial)
  'ю': 'يُ',
  'я': 'يَ',
};

// Word-start alef forms: vowel char → alef + diacritic
export const ARABIC_WORD_START_ALEF: Record<string, string> = {
  'а':  'أَ',
  'аь': 'أَ۬',
  'и':  'إِ',
  'иэ': 'إِئِ۬', // /ie/ diphthong at word start: alef-kasra + hamza-on-ya + kasra + U+06EC
  'э':  'إِ۬',
  'у':  'أُ',
  'уо': 'أُؤٗ', // /uo/ diphthong at word start: alef-damma + hamza-on-waw + inv-damma
  'уь': 'أُ۬',
  'о':  'أٗ',
  'оь': 'أٗ۬',
  'е':  'يِ۬',
  'ю':  'يُ',
  'юь': 'يُ۬',
  'я':  'يَ',
  'яь': 'يَ۬',
};

// Diphthong bigrams that must never receive long-vowel extension (ударение не удлиняет дифтонг)
export const ARABIC_DIPHTHONG_BIGRAMS = new Set(['иэ', 'уо']);

// Long vowel extensions (after stress mark): base vowel diacritic → matres lectionis suffix
// Вав — matres lectionis, не несёт огласовку сам; огласовка уже на предыдущем согласном.
export const ARABIC_LONG_VOWEL_SUFFIX: Record<string, string> = {
  'َ': 'ا',    // fatha → alef (А долгий: ـَا)
  'ُ': 'و',    // damma → waw (У долгий: ـُو)
  'ِ': 'ي',    // kasra → ya (И долгий: ـِي)
  'ٗ': 'و',    // inv-damma → waw (О долгий: ـٗو, по §4.1)
};

// Nazalization suffixes for final vowels (superscript н)
export const ARABIC_NAZALIZATION: Record<string, string> = {
  'а':  'ًa',  // tanwin fath + alif: ـًا
  'и':  'ٍi',  // tanwin kasr: ـٍي
  'у':  'ٌu',  // tanwin damm: ـٌو
  // аь, э, уь, о, оь → U+06E8
  'аь': 'ۨ',
  'э':  'ۨ',
  'уь': 'ۨ',
  'о':  'ۨ',
  'оь': 'ۨ',
};
