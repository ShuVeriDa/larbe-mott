import { TransliterationService } from './transliteration.service';

const svc = new TransliterationService();
const SHADDA = 'ّ'; // U+0651

const lat = (text: string, isWordStart = true, isNasalized = false, hasStress = false) =>
  svc.cyrillicToLatin(text, { isWordStart, isNasalized, hasStress });

const ara = (text: string, isWordStart = true, isNasalized = false, hasStress = false) =>
  svc.cyrillicToArabic(text, { isWordStart, isNasalized, hasStress });

const tiptapDoc = (text: string, marks: { type: string }[] = []) => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text, marks }],
    },
  ],
});

// Two sibling text nodes in one paragraph: base word + superscript-н
const tiptapDocNaz = (baseText: string, nazChar = 'н') => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: baseText, marks: [] },
        { type: 'text', text: nazChar, marks: [{ type: 'superscript' }] },
      ],
    },
  ],
});

const extractText = (doc: object): string => {
  const d = doc as { content: { content: { text: string }[] }[] };
  return d.content[0].content[0].text;
};

const extractAllText = (doc: object): string => {
  const d = doc as { content: { content: { text: string }[] }[] };
  return d.content[0].content.map((n) => n.text ?? '').join('');
};

describe('TransliterationService', () => {
  describe('Palochka normalization', () => {
    it('U+04CF ӏ → treated as Ӏ (U+04C0)', () => {
      expect(lat('ӏахар')).toBe(lat('Ӏахар'));
    });
  });

  describe('Palochka U+04CF in digraphs', () => {
    it('хӏара (U+04CF) same as хӀара (U+04C0) — latin', () => {
      expect(lat('хӏара')).toBe(lat('хӀара')); // both → hara
    });

    it('хӏара (U+04CF) same as хӀара (U+04C0) — arabic', () => {
      expect(ara('хӏара')).toBe(ara('хӀара')); // both → هَرَ
    });

    it('гӏала (U+04CF) same as гӀала (U+04C0)', () => {
      expect(lat('гӏала')).toBe(lat('гӀала')); // both → ġala
    });
  });

  describe('АллахӀ stem exception (Arabic)', () => {
    // Base form
    it('аллахӀ → الله', () => { expect(ara('аллахӀ')).toBe('الله'); });
    it('АллахӀ (uppercase A) → الله', () => { expect(ara('АллахӀ')).toBe('الله'); });
    it('АЛЛАХӀ (all caps) → الله', () => { expect(ara('АЛЛАХӀ')).toBe('الله'); });

    // Digit-1 keyboard variant
    it('аллах1 (digit-1) → الله', () => { expect(ara('аллах1')).toBe('الله'); });
    it('Аллах1 (digit-1, uppercase) → الله', () => { expect(ara('Аллах1')).toBe('الله'); });

    // Case endings — stem الله + transliterated suffix
    it('аллахӀан (genitive) → الله + suffix', () => {
      const r = ara('аллахӀан');
      expect(r.startsWith('الله')).toBe(true);
      expect(r.length).toBeGreaterThan('الله'.length); // suffix present
    });
    it('аллахӀа (ergative) → الله + suffix', () => {
      const r = ara('аллахӀа');
      expect(r.startsWith('الله')).toBe(true);
      expect(r.length).toBeGreaterThan('الله'.length);
    });
    it('аллахӀна (dative) → الله + suffix', () => {
      const r = ara('аллахӀна');
      expect(r.startsWith('الله')).toBe(true);
      expect(r.length).toBeGreaterThan('الله'.length);
    });
    it('аллахӀе (locative) → الله + suffix', () => {
      const r = ara('аллахӀе');
      expect(r.startsWith('الله')).toBe(true);
      expect(r.length).toBeGreaterThan('الله'.length);
    });

    // Stress marks in the source word are stripped before matching
    it('Алла́хӀ (with stress U+0301) → الله', () => {
      expect(ara('Алла́хӀ')).toBe('الله');
    });
    it('Алла́хӀа́н (stress on stem + ending) → الله + suffix', () => {
      const r = ara('Алла́хӀа́н');
      expect(r.startsWith('الله')).toBe(true);
      expect(r.length).toBeGreaterThan('الله'.length);
    });

    // In a phrase: stem gets الله, rest is normal transliteration
    it('аллахӀ реза → starts with الله', () => {
      expect(ara('аллахӀ реза').startsWith('الله')).toBe(true);
    });
    it('(аллахӀан) — in brackets → الله inside', () => {
      expect(ara('(аллахӀан)')).toContain('الله');
    });
  });

  describe('Latin — simple words', () => {
    it('нана → nana', () => {
      expect(lat('нана')).toBe('nana');
    });

    it('гӀала → ġala (bigram гӀ, word-start lowercase)', () => {
      expect(lat('гӀала')).toBe('ġala');
    });

    it('Гала → Gala (uppercase first char)', () => {
      expect(lat('Гала')).toBe('Gala');
    });

    it('хьан → ẋan (bigram хь)', () => {
      expect(lat('хьан')).toBe('ẋan');
    });

    it('кхоъ → qoə (bigram кх + ъ)', () => {
      expect(lat('кхоъ')).toBe('qoə');
    });

    it('е word-start → ye', () => {
      expect(lat('ела')).toBe('yela');
    });

    it('е medial → e', () => {
      expect(lat('деша', false)).toBe('deşa');
    });

    it('юь bigram → yü', () => {
      expect(lat('юьрт')).toBe('yürt');
    });
  });

  describe('Latin — nazalized н', () => {
    it('н nazalized → ŋ', () => {
      expect(lat('хьан', false, true)).toBe('ẋaŋ');
    });
  });

  describe('Arabic — nazalized н (§4.4)', () => {
    // А-финал: tanwin-fath + alif → ـًا
    it('сан (мой) → سًا', () => {
      expect(ara('сан', false, true)).toBe('سًا');
    });

    it('хьан (твой) → حًا', () => {
      expect(ara('хьан', false, true)).toBe('حًا');
    });

    // У-финал: tanwin-damm + waw → ـٌو
    it('шун (ваш) → شٌو', () => {
      expect(ara('шун', false, true)).toBe('شٌو');
    });

    // О-финал: nūn-miniature U+06E8
    it('цон → ﮃٗۨ', () => {
      expect(ara('цон', false, true)).toBe('ﮃٗۨ');
    });

    // Аь-финал (мягкий): nūn-miniature; word-start → с алифом
    it('аьн (word-start) → أَ۬ۨ', () => {
      expect(ara('аьн', true, true)).toBe('أَ۬ۨ');
    });

    // И-финал: tanwin-kasr + ya → ـٍي (tanwin уже содержит касру)
    it('цин (word-start=false) → ﮃٍي', () => {
      expect(ara('цин', false, true)).toBe('ﮃٍي');
    });

    // Слово с н внутри: только финальный н назализуется
    // хьенан без ударения: е=краткий Э → حِ۬نًا (без ي)
    it('хьенан (краткий Э, А-финал) → حِ۬نًا', () => {
      expect(ara('хьенан', false, true)).toBe('حِ۬نًا');
    });

    // хье́нан с ударением: е́=долгий Э → حِ۬ينًا (с ي)
    it('хье́нан (долгий Э со стрессом, А-финал) → حِ۬ينًا', () => {
      expect(ara('хье́нан', false, true)).toBe('حِ۬ينًا');
    });

    // нан: н+а+н(назализ) → ن(н) + َ(а) + ًا(танвин+алиф вместо финального н)
    it('нан — финальный н → танвин, н внутри остаётся → نًا', () => {
      expect(ara('нан', false, true)).toBe('نًا');
    });
  });

  describe('Latin — TipTap JSON walk', () => {
    it('preserves doc structure, transliterates text nodes', () => {
      const doc = tiptapDoc('нана');
      const result = svc.transliterateTiptapJson(doc, 'LATIN');
      expect(extractText(result)).toBe('nana');
    });

    it('superscript-н after base word → ŋ merged into preceding node (latin)', () => {
      // Real Tiptap structure: 'хьан' = ['хьа', 'н'(superscript)]
      const doc = tiptapDocNaz('хьа');
      const result = svc.transliterateTiptapJson(doc, 'LATIN');
      // The superscript-н node is consumed; base node gets ŋ appended
      expect(extractAllText(result)).toBe('ẋaŋ');
    });

    it('superscript-н after base word → tanwin merged into preceding node (arabic)', () => {
      // Real Tiptap structure: 'сан' = ['са', 'н'(superscript)]
      const doc = tiptapDocNaz('са');
      const result = svc.transliterateTiptapJson(doc, 'ARABIC');
      expect(extractAllText(result)).toBe('سًا');
    });

    it('superscript-н after У-final → tanwin-damm+waw (arabic)', () => {
      // 'шун' = ['шу', 'н'(superscript)]
      const doc = tiptapDocNaz('шу');
      const result = svc.transliterateTiptapJson(doc, 'ARABIC');
      expect(extractAllText(result)).toBe('شٌو');
    });

    it('сайн: closed-syllable й before nazalized н → tanwin on preceding А (arabic)', () => {
      // 'сайн' = ['сай', 'н'(superscript)] — й has sukun, final vowel is А on са
      const doc = tiptapDocNaz('сай');
      const result = svc.transliterateTiptapJson(doc, 'ARABIC');
      // с=سْ, а=َ, й=يْ → сайн = tanwin on А → سَيًا (strip fatha, add tanwin+alef)
      expect(extractAllText(result)).toBe('سَيًا');
    });

    it('хье́нан: stressed е→long И/Э, А-final → tanwin (arabic)', () => {
      // хье́нан = ['хье́на', 'н'(superscript)] where ́ is U+0301 inline
      const doc = tiptapDocNaz('хье́на');
      const result = svc.transliterateTiptapJson(doc, 'ARABIC');
      // хь=ح, е́(long Э)=ِ۬ي, н=نْ→ن, а=َ → tanwin-fath+alif
      expect(extractAllText(result)).toBe('حِ۬ينًا');
    });

    it('detects stress mark — stressed а inside word stays a', () => {
      // 'а' inside a word (e.g. нана) is not standalone — no ə substitution
      const doc = tiptapDoc('нана', [{ type: 'stress' }]);
      const result = svc.transliterateTiptapJson(doc, 'LATIN');
      expect(extractText(result)).toBe('nana');
    });

    it('standalone а (conjunction) → ə', () => {
      expect(lat('а')).toBe('ə');
    });

    it('а before comma → ə,', () => {
      expect(lat('нацкъар а, баьлла')).toBe('nacq̇ar ə, bälla');
    });

    it('а before period → ə.', () => {
      expect(lat('нацкъар а.')).toBe('nacq̇ar ə.');
    });

    it('а inside word is not ə', () => {
      expect(lat('нана')).toBe('nana');
    });

    it('does not mutate original doc', () => {
      const doc = tiptapDoc('нана');
      svc.transliterateTiptapJson(doc, 'LATIN');
      expect(extractText(doc)).toBe('нана');
    });
  });

  describe('Arabic — simple words', () => {
    it('нана → نَنَ (н+fatha н+fatha)', () => {
      expect(ara('нана')).toBe('نَنَ');
    });

    it('гӀала → starts with غ (bigram гӀ)', () => {
      expect(ara('гӀала').startsWith('غ')).toBe(true);
    });

    it('г (single) → ڠْ (sukun, no following vowel)', () => {
      expect(ara('г', false)).toBe('ڠْ');
    });

    it('word-start vowel а → أَ (alef + fatha)', () => {
      const result = ara('а');
      expect(result).toBe('أَ');
    });

    it('medial а → fatha diacritic only', () => {
      const result = ara('а', false);
      expect(result).toBe('َ');
    });
  });

  describe('Arabic — stress mark (long vowel)', () => {
    it('stressed а (word-start) via mark → أَا', () => {
      const result = ara('а', true, false, true);
      expect(result).toBe('أَا');
    });

    it('жан-жӏаьла → جَنْ-جْعَ۬لَ', () => {
      expect(ara('жан-жӏаьла')).toBe('جَنْ-جْعَ۬لَ');
    });

    it('э́лира (word-start долгий Э) → إِ۬يلِرَ', () => {
      // э́=долгий Э(إِ۬ي) + л(لِ, касра от и) + и(краткое,ِ уже на л) + р(رَ) + а(َ)
      expect(ara('э́лира')).toBe('إِ۬يلِرَ');
    });

    it('stressed е medial via U+0301 in text → ِ۬ي (long Э)', () => {
      // ге́на: г + е́ + н + а — е́ has U+0301 embedded in text
      // long Э = kasra + softness + ya (no softness on ya itself)
      const result = ara('ге́на');
      expect(result).toBe('ڠِ۬ينَ');
    });

    it('stressed о medial via U+0301 in text → ٗوٗ (long О)', () => {
      // ло́ру: л + о́ + р + у
      const result = ara('ло́ру', false);
      expect(result).toBe('لٗورُ');
    });

    it('stressed аь via U+0301 after bigram → َ۬ا (long Аь)', () => {
      // наь́на: н + аь́ + н + а — softness only on fatha, not on alef
      const result = ara('наь́на', false);
      expect(result).toBe('نَ۬انَ');
    });

    it('stressed и medial via U+0301 → ِي (long И)', () => {
      const result = ara('ни́на', false);
      expect(result).toBe('نِينَ');
    });

    it('stressed у medial via U+0301 → ُو (long У)', () => {
      const result = ara('ну́на', false);
      expect(result).toBe('نُونَ');
    });
  });

  describe('Arabic — gemination (shadda)', () => {
    it('лл → لّ (single л + shadda)', () => {
      // баьлла: б + аь + лл + а
      const result = ara('лл', false);
      expect(result).toBe('ل' + SHADDA);
    });

    it('нн → نّ', () => {
      expect(ara('нн', false)).toBe('ن' + SHADDA);
    });

    it('ккъ → قّ (doubled digraph кх → ق + shadda)', () => {
      // ккъ: leading к is the duplicate of к in къ
      expect(ara('ккъ', false)).toBe('ق' + SHADDA);
    });

    it('ккх → ڤّ (doubled digraph кх → ڤ + shadda)', () => {
      expect(ara('ккх', false)).toBe('ڤ' + SHADDA);
    });

    it('ккӀ → ࢰّ (doubled digraph кӀ → ة + shadda)', () => {
      expect(ara('ккӀ', false)).toBe('ࢰ' + SHADDA);
    });

    it('ттӀ → طّ (doubled digraph тӀ → ط + shadda)', () => {
      expect(ara('ттӀ', false)).toBe('ط' + SHADDA);
    });

    it('single consonant gets sukun (no following vowel)', () => {
      expect(ara('л', false)).toBe('لْ');
    });

    it('ггӀ → غّ (doubled гӀ)', () => {
      expect(ara('ггӀ', false)).toBe('غ' + SHADDA);
    });

    it('ппӀ → ڥّ (doubled пӀ)', () => {
      expect(ara('ппӀ', false)).toBe('ڥ' + SHADDA);
    });

    it('ххь → حّ (doubled хь)', () => {
      expect(ara('ххь', false)).toBe('ح' + SHADDA);
    });

    it('ххӀ → هّ (doubled хӀ)', () => {
      expect(ara('ххӀ', false)).toBe('ه' + SHADDA);
    });

    it('ццӀ → ڗّ (doubled цӀ)', () => {
      expect(ara('ццӀ', false)).toBe('ڗ' + SHADDA);
    });

    it('ччӀ → ݗّ (doubled чӀ)', () => {
      expect(ara('ччӀ', false)).toBe('ݗ' + SHADDA);
    });
  });

  describe('Arabic — sukun (absence of vowel)', () => {
    const SUKUN = 'ْ'; // U+0652

    it('нацкъар — ц before consonant gets sukun', () => {
      const result = ara('нацкъар');
      // ц = ﮃ, followed by кь (consonant) → should have sukun after ﮃ
      expect(result).toContain('ﮃ' + SUKUN);
    });

    it('нацкъар — final р gets sukun (no vowel follows)', () => {
      const result = ara('нацкъар');
      expect(result.endsWith('رْ')).toBe(true);
    });

    it('consonant before vowel has no sukun', () => {
      // н + а: н is before vowel → no sukun
      const result = ara('на', false);
      expect(result).toBe('نَ');
    });

    it('уьдуш — final ш gets sukun', () => {
      expect(ara('уьдуш').endsWith('شْ')).toBe(true);
    });

    it('ловзуш — final ш gets sukun', () => {
      expect(ara('ловзуш', false).endsWith('شْ')).toBe(true);
    });

    it('тергалдеш — final ш gets sukun', () => {
      expect(ara('тергалдеш', false).endsWith('شْ')).toBe(true);
    });
  });

  describe('Arabic — TipTap JSON walk', () => {
    it('transliterates text nodes', () => {
      const doc = tiptapDoc('нана');
      const result = svc.transliterateTiptapJson(doc, 'ARABIC');
      const text = extractText(result);
      expect(text).toContain('ن');
    });
  });

  describe('detectNasalization / detectStress', () => {
    it('returns true for superscript mark', () => {
      expect(svc.detectNasalization([{ type: 'superscript' }])).toBe(true);
    });

    it('returns false without superscript', () => {
      expect(svc.detectNasalization([{ type: 'bold' }])).toBe(false);
    });

    it('returns true for stress mark', () => {
      expect(svc.detectStress([{ type: 'stress' }])).toBe(true);
    });

    it('returns false without stress', () => {
      expect(svc.detectStress([])).toBe(false);
    });
  });
});
