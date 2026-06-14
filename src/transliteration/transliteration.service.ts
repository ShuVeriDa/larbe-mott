import { Injectable } from '@nestjs/common';
import { ChScript } from '@prisma/client';
import {
  CYRILLIC_TO_LATIN_BIGRAMS,
  CYRILLIC_TO_LATIN_SINGLE,
} from './maps/cyrillic-to-latin.map';
import {
  CYRILLIC_TO_ARABIC_BIGRAMS,
  CYRILLIC_TO_ARABIC_CONSONANTS,
  CYRILLIC_TO_ARABIC_VOWELS,
  ARABIC_WORD_START_ALEF,
  ARABIC_LONG_VOWEL_SUFFIX,
  ARABIC_DIPHTHONG_BIGRAMS,
  CYRILLIC_TO_ARABIC_STEM_EXCEPTIONS,
} from './maps/cyrillic-to-arabic.map';

export interface TranslitContext {
  isWordStart: boolean;
  isNasalized: boolean;
  hasStress: boolean;
}

interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface TiptapNode {
  type: string;
  text?: string;
  marks?: TiptapMark[];
  content?: TiptapNode[];
  attrs?: Record<string, unknown>;
}

@Injectable()
export class TransliterationService {
  transliterateTiptapJson(doc: object, script: ChScript): object {
    const clone = JSON.parse(JSON.stringify(doc)) as TiptapNode;
    // DEBUG: log superscript-н nodes with their parent context
    const nazInfo: any[] = [];
    const collectWithParent = (n: any, parent: any) => {
      if (n.type === 'text' && n.marks?.some((m: any) => m.type === 'superscript')) {
        nazInfo.push({ nodeText: n.text, parentType: parent?.type, siblingsBefore: (parent?.content ?? []).slice(0, (parent?.content ?? []).indexOf(n)).map((s: any) => ({ type: s.type, text: s.text?.slice(-20) })) });
      }
      if (n.content) n.content.forEach((c: any) => collectWithParent(c, n));
    };
    collectWithParent(clone, null);
    console.log('[TRANSLIT DEBUG] script:', script, 'naz context:', JSON.stringify(nazInfo.slice(0, 3)));
    const result = this.walkNode(clone, script);
    return result;
  }

  transliterateWord(word: string, script: ChScript, isNasalized = false): string {
    return this.transliterateText(word, script, {
      isWordStart: true,
      isNasalized,
      hasStress: false,
    });
  }

  // Returns the set of Cyrillic word strings that are followed by a superscript-н
  // (nazalization marker) in the given Tiptap doc. Used to produce correct displayText
  // for tokens when the script version is active.
  extractNasalizedWords(doc: object): Set<string> {
    const result = new Set<string>();
    const walk = (node: any) => {
      if (Array.isArray(node.content)) {
        const children: any[] = node.content;
        for (let i = 0; i < children.length; i++) {
          const next = children[i + 1];
          if (
            next?.type === 'text' &&
            next.text != null &&
            cyrLower(next.text.trim()) === 'н' &&
            next.marks?.some((m: any) => m.type === 'superscript')
          ) {
            // The nazalized word = last word of base node + 'н' (the superscript char)
            const cur = children[i];
            if (cur?.type === 'text' && typeof cur.text === 'string') {
              const match = cur.text.match(/(\S+)\s*$/);
              if (match) result.add(match[1] + 'н');
            }
          }
          walk(children[i]);
        }
      }
    };
    walk(doc);
    return result;
  }

  private walkNode(node: TiptapNode, script: ChScript): TiptapNode {
    if (node.type === 'text' && typeof node.text === 'string') {
      const isNasalized = this.detectNasalization(node.marks ?? []);
      const hasStress = this.detectStress(node.marks ?? []);
      node.text = this.transliterateText(node.text, script, {
        isWordStart: true,
        isNasalized,
        hasStress,
      });
      return node;
    }

    if (Array.isArray(node.content)) {
      node.content = this.walkChildren(node.content, script);
    }

    return node;
  }

  // Walk child nodes, handling superscript-н by patching the preceding sibling.
  // Tiptap stores nazalized н as a separate text node { text: "н", marks: [superscript] }.
  // After transliteration the preceding node already ends with the vowel diacritic — we
  // apply nazalization to it and drop the superscript-н node entirely.
  private walkChildren(children: TiptapNode[], script: ChScript): TiptapNode[] {
    const result: TiptapNode[] = [];

    for (const child of children) {
      // Detect superscript-н nazalization node
      if (child.type === 'text' && child.marks?.some((m: TiptapMark) => m.type === 'superscript')) {
        console.log('[CHILD DEBUG] superscript text node: text=', JSON.stringify(child.text), 'cyrLower(trim)=', JSON.stringify(cyrLower((child.text ?? '').trim())), 'marks=', JSON.stringify(child.marks));
      }
      const isNazNode =
        child.type === 'text' &&
        child.text != null &&
        cyrLower(child.text.trim()) === 'н' &&
        this.detectNasalization(child.marks ?? []);

      if (isNazNode) {
        const prevText = this.findLastTextNode(result);
        if (prevText !== null && typeof prevText.text === 'string') {
          if (script === 'LATIN') {
            console.log('[NAZ DEBUG] LATIN: prevText ends:', JSON.stringify(prevText.text.slice(-10)));
            prevText.text = prevText.text + 'ŋ';
          } else {
            console.log('[NAZ DEBUG] ARABIC: prevText ends:', JSON.stringify(prevText.text.slice(-10)));
            const [strip, append] = nazalizationReplacement(prevText.text);
            console.log('[NAZ DEBUG] strip:', strip, 'append:', JSON.stringify(append));
            prevText.text = prevText.text.slice(0, prevText.text.length - strip) + append;
          }
        } else {
          console.log('[NAZ DEBUG] no prevText found!');
        }
        continue;
      }

      // Detect standalone U+0301 stress node (Tiptap splits it off as a separate node
      // when the preceding word has a different mark set, e.g. bold vs plain)
      const isAcuteNode =
        child.type === 'text' &&
        child.text != null &&
        child.text === '́';

      if (isAcuteNode) {
        // The preceding sibling was already transliterated — we need to re-transliterate
        // the last raw Cyrillic node with stress=true. But the node is already processed.
        // Simplest correct approach: mark the previous OUTPUT node's last vowel as long
        // by appending the long-vowel suffix for the last diacritic found.
        const prevText = this.findLastTextNode(result);
        if (prevText !== null && typeof prevText.text === 'string') {
          if (script === 'ARABIC') {
            prevText.text = applyStressToArabic(prevText.text);
          }
          // Latin: stress is not written in the 1992 system — drop silently
        }
        continue;
      }

      result.push(this.walkNode(child, script));
    }

    return result;
  }

  private findLastTextNode(nodes: TiptapNode[]): TiptapNode | null {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.type === 'text' && typeof n.text === 'string') return n;
      if (Array.isArray(n.content)) {
        const found = this.findLastTextNode(n.content);
        if (found) return found;
      }
    }
    return null;
  }

  detectNasalization(marks: TiptapMark[]): boolean {
    return marks.some((m) => m.type === 'superscript');
  }

  detectStress(marks: TiptapMark[]): boolean {
    return marks.some((m) => m.type === 'stress');
  }

  transliterateText(
    text: string,
    script: ChScript,
    ctx: TranslitContext,
  ): string {
    if (script === 'LATIN') return this.cyrillicToLatin(text, ctx);
    return this.cyrillicToArabic(text, ctx);
  }

  cyrillicToLatin(input: string, ctx: TranslitContext): string {
    const text = normalizePalochka(input);
    let result = '';
    let i = 0;
    let wordStart = ctx.isWordStart;

    while (i < text.length) {
      // Try bigrams first — use palochka-safe lowercase for matching
      const bigram = cyrLower(text.slice(i, i + 2));
      const bigramMatch = CYRILLIC_TO_LATIN_BIGRAMS.find(([src]) => src === bigram);
      if (bigramMatch) {
        const [, latinLower] = bigramMatch;
        const isUpper = text[i] !== cyrLower(text[i]);
        result += wordStart && isUpper ? capitalize(latinLower) : latinLower;
        wordStart = false;
        i += 2;
        continue;
      }

      const ch = text[i];
      const chLower = cyrLower(ch);

      // а: standalone word (conjunction/particle) → ə, otherwise → a
      if (chLower === 'а') {
        const nextCh = text[i + 1] ?? '';
        const isStandalone = wordStart && (nextCh === '' || isWordBoundary(nextCh));
        const latin = isStandalone ? 'ə' : 'a';
        const isUpper = ch !== cyrLower(ch);
        result += wordStart && isUpper ? capitalize(latin) : latin;
        wordStart = false;
        i++;
        continue;
      }

      // е: word-start → ye/Ye, medial → e/E
      if (chLower === 'е') {
        const latin = wordStart ? 'ye' : 'e';
        const isUpper = ch !== cyrLower(ch);
        result += wordStart && isUpper ? capitalize(latin) : latin;
        wordStart = false;
        i++;
        continue;
      }

      // н: nazalized → ŋ only for the FINAL н of the word
      if (chLower === 'н') {
        const isLastН = ctx.isNasalized && cyrLower(text.slice(i + 1)).trim() === '';
        const latin = isLastН ? 'ŋ' : 'n';
        const isUpper = ch !== cyrLower(ch);
        result += wordStart && isUpper ? capitalize(latin) : latin;
        wordStart = false;
        i++;
        continue;
      }

      const singleMatch = CYRILLIC_TO_LATIN_SINGLE.find(([src]) => src === chLower);
      if (singleMatch) {
        const [, latinLower] = singleMatch;
        const isUpper = ch !== cyrLower(ch);
        result += wordStart && isUpper ? capitalize(latinLower) : latinLower;
        wordStart = false;
        i++;
        continue;
      }

      // Non-Cyrillic char (space, punctuation) — pass through, reset word-start
      result += ch;
      wordStart = isWordBoundary(ch);
      i++;
    }

    return result;
  }

  cyrillicToArabic(input: string, ctx: TranslitContext): string {
    const text = normalizePalochka(input);
    let result = '';
    let i = 0;
    let wordStart = ctx.isWordStart;
    // Tracks whether the immediately preceding emitted character was a vowel.
    // In Arabic, a vowel following another vowel needs a hamza carrier (alef form),
    // because a diacritic cannot stack on an already-vowelled letter.
    let prevWasVowel = false;

    while (i < text.length) {
      const ch = text[i];
      const chLower = cyrLower(ch);

      // Stem-prefix exception lookup — try at every word-start position.
      // Scan to next word boundary, strip inline stress marks (U+0301), normalize to
      // lowercase, then check if the token starts with a known stem. If so, emit the
      // fixed Arabic prefix and transliterate only the remaining suffix normally.
      if (wordStart) {
        let j = i;
        while (j < text.length && !isWordBoundary(text[j])) j++;
        // Strip U+0301 stress marks before matching so "Алла́хӀан" still matches.
        const rawToken = text.slice(i, j).replace(/́/g, '');
        const tokenLower = cyrLower(rawToken);
        const stemMatch = CYRILLIC_TO_ARABIC_STEM_EXCEPTIONS.find(({ stem }) =>
          tokenLower.startsWith(stem),
        );
        if (stemMatch) {
          result += stemMatch.arabic;
          // Advance past the stem (accounting for stripped stress marks in original)
          const stemLen = stemMatch.stem.length;
          let consumed = 0;
          let k = i;
          while (consumed < stemLen && k < j) {
            if (text[k] === '́') { k++; continue; } // skip stress marks
            consumed++;
            k++;
          }
          // Transliterate the remaining suffix (case ending) normally, not at word-start
          i = k;
          wordStart = false;
          prevWasVowel = false;
          continue;
        }
      }

      // Check for doubled digraph BEFORE bigram matching:
      // Pattern: к + къ = ккъ → ق + shadda (skip the leading duplicate, emit digraph once + shadda)
      const trigramLower = cyrLower(text.slice(i, i + 3));
      const doubledDigram = CYRILLIC_TO_ARABIC_BIGRAMS.find(([src]) =>
        src.length === 2 &&
        cyrLower(trigramLower[0]) === cyrLower(src[0]) &&
        cyrLower(trigramLower.slice(1, 3)) === src,
      );
      if (doubledDigram) {
        result += doubledDigram[1] + SHADDA;
        wordStart = false;
        prevWasVowel = false;
        i += 3;
        continue;
      }

      // Try bigrams (vowel combos and digraph consonants)
      const bigram = cyrLower(text.slice(i, i + 2));
      const bigramMatch = CYRILLIC_TO_ARABIC_BIGRAMS.find(([src]) => src === bigram);
      if (bigramMatch) {
        const [src, arabic] = bigramMatch;
        const isVowelBigram = src in ARABIC_WORD_START_ALEF;
        if (isVowelBigram) {
          // Stress may be encoded as U+0301 after the bigram (e.g. аь́)
          const afterBigram = text[i + 2] === '́';
          // Diphthongs (иэ, уо) are already two-part vowels — stress never elongates them further
          const isDiphthong = ARABIC_DIPHTHONG_BIGRAMS.has(src);
          const isLong = !isDiphthong && (ctx.hasStress || afterBigram);
          if (wordStart || prevWasVowel) {
            // Word-start or post-vowel position: use alef carrier form
            const alef = ARABIC_WORD_START_ALEF[src];
            const long = isLong ? longVowelSuffix(alef) : '';
            result += alef + long;
          } else {
            const long = isLong ? longVowelSuffix(arabic) : '';
            result += arabic + long;
          }
          wordStart = false;
          prevWasVowel = true;
          i += 2;
          if (afterBigram) i++; // consume U+0301
        } else {
          // Consonant digraph — add sukun if no vowel follows (including word boundary)
          const nextChLower = cyrLower(text[i + 2] ?? '');
          const nextIsVowel = isArabicVowelChar(nextChLower);
          const needsSukun = !nextIsVowel;
          result += arabic + (needsSukun ? SUKUN : '');
          wordStart = false;
          prevWasVowel = false;
          i += 2;
        }
        continue;
      }

      // Vowel singles
      if (chLower in CYRILLIC_TO_ARABIC_VOWELS) {
        // Stress may be encoded as U+0301 in the text itself (e.g. е́) — treat it as long vowel
        const nextCharIsAcute = text[i + 1] === '́';
        const isLong = ctx.hasStress || nextCharIsAcute;
        if ((wordStart || prevWasVowel) && chLower in ARABIC_WORD_START_ALEF) {
          // Word-start or post-vowel: vowel needs an alef carrier (hamza rule)
          const alef = ARABIC_WORD_START_ALEF[chLower];
          const long = isLong ? longVowelSuffix(alef) : '';
          result += alef + long;
        } else {
          const diac = CYRILLIC_TO_ARABIC_VOWELS[chLower];
          const long = isLong ? longVowelSuffix(diac) : '';
          result += diac + long;
        }
        wordStart = false;
        prevWasVowel = true;
        i++;
        if (nextCharIsAcute) i++; // consume U+0301
        continue;
      }

      // Nazalized н: replace preceding short-vowel diacritic with tanwin + matres lectionis.
      // Only the FINAL н of the word is nazalized — check that no non-boundary chars follow.
      const isLastН = ctx.isNasalized && cyrLower(text.slice(i + 1)).trim() === '';
      if (chLower === 'н' && isLastН) {
        const [strip, append] = nazalizationReplacement(result);
        result = result.slice(0, result.length - strip) + append;
        wordStart = false;
        prevWasVowel = false;
        i++;
        continue;
      }

      // Consonant — check for gemination or sukun
      const consonantMatch = CYRILLIC_TO_ARABIC_CONSONANTS.find(([src]) => src === chLower);
      if (consonantMatch) {
        const nextChLower = cyrLower(text[i + 1] ?? '');
        const isGeminated = nextChLower === chLower;
        if (isGeminated) {
          result += consonantMatch[1] + SHADDA;
          wordStart = false;
          prevWasVowel = false;
          i += 2;
        } else {
          // Add sukun if no vowel follows (including word boundary and end of string)
          const nextIsVowel = isArabicVowelChar(nextChLower);
          const needsSukun = !nextIsVowel;
          result += consonantMatch[1] + (needsSukun ? SUKUN : '');
          wordStart = false;
          prevWasVowel = false;
          i++;
        }
        continue;
      }

      result += ch;
      wordStart = isWordBoundary(ch);
      prevWasVowel = false;
      i++;
    }

    return result;
  }
}

const SHADDA = 'ّ'; // U+0651 — Arabic shadda (gemination mark)
const SUKUN  = 'ْ'; // U+0652 — Arabic sukun (absence of vowel)

// Cyrillic vowel chars — a following consonant gets sukun when the consonant has no vowel after it
const ARABIC_VOWEL_CHARS = new Set(['а', 'и', 'у', 'о', 'е', 'э', 'ю', 'я', 'ё']);
const isArabicVowelChar = (ch: string): boolean => ARABIC_VOWEL_CHARS.has(ch);

const capitalize = (s: string): string =>
  s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);

// Palochka U+04CF (lowercase) has no distinct lowercase in Unicode — toLowerCase() maps
// it back to U+04CF which breaks map key matching against U+04C0. Normalise to U+04C0.
const normalizePalochka = (s: string): string => s.replace(/ӏ/g, 'Ӏ');

const cyrLower = (s: string): string =>
  [...s].map((c) => (c === 'Ӏ' || c === 'ӏ' ? 'Ӏ' : c.toLowerCase())).join('');

const isWordBoundary = (ch: string): boolean => /[\s\-–—.,;:!?…«»""''()\[\]]/.test(ch);

const longVowelSuffix = (arabicWithDiac: string): string => {
  for (const [diac, suffix] of Object.entries(ARABIC_LONG_VOWEL_SUFFIX)) {
    if (arabicWithDiac.includes(diac)) return suffix;
  }
  return '';
};

// Stress mark came as a separate Tiptap node after an already-transliterated node.
// Find the last vowel diacritic in the output and append the long-vowel matres lectionis.
const applyStressToArabic = (arabicText: string): string => {
  const suffix = longVowelSuffix(arabicText.slice(-6));
  return suffix ? arabicText + suffix : arabicText;
};

// §4.4: nazalized н → tanwin + matres lectionis on the preceding vowel.
// А/У/И: strip the plain diacritic (tanwin already encodes it), append tanwin+mater.
// Soft vowels (Аь/Э/Уь/Оь) and О: diacritic stays, only ۨ (U+06E8) appended.
//
// Strategy: scan codepoints from the END to locate the LAST base vowel diacritic
// (fatha/kasra/damma/inv-damma), skipping only matres (ا و ي) on the way.
// We must NOT scan past any base diacritic — the first one we find FROM THE END is
// the final vowel. The softness mark ۬ (U+06EC) immediately follows its base diacritic,
// so we check for it only AFTER finding the base diacritic, not as a separate scan.
const nazalizationReplacement = (precedingResult: string): [number, string] => {
  // Base vowel diacritics — the only chars that determine nazalization type
  const BASE_DIAC: Record<string, 'а' | 'у' | 'и' | 'о'> = {
    'َ': 'а',  // fatha   U+064E
    'ُ': 'у',  // damma   U+064F
    'ِ': 'и',  // kasra   U+0650
    'ٗ': 'о',  // inv-damma U+0657
  };
  // Everything that is NOT a base diacritic or softness mark ۬ — skip when scanning back.
  // This includes consonant letters, matres (ا و ي used as long-vowel carriers),
  // sukun ْ, shadda ّ, hamza carriers (ئ ؤ), etc.
  const SKIP = new Set([
    'ْ', 'ّ',                    // sukun, shadda
    'ا', 'و', 'ي',               // matres lectionis (long vowel carriers)
    'ئ', 'ؤ', 'أ', 'إ',          // hamza carriers (diphthongs, word-start)
    // All Arabic consonant letters are implicitly skipped because BASE_DIAC won't match them.
  ]);

  const codepoints = [...precedingResult];
  let j = codepoints.length - 1;

  // Track what we passed over while scanning back, to detect long-vowel matres
  let hasMatresAlef = false, hasMatresWaw = false, hasMatresYa = false;
  let hasSoftMark = false;

  // Scan backwards: collect matres/sukun/shadda/consonants until we hit a base diacritic or ۬
  while (j >= 0) {
    const c = codepoints[j];
    if (c in BASE_DIAC) break;            // found the base diacritic — stop
    if (c === '۬') { hasSoftMark = true; j--; break; } // softness mark — stop, base diac is next
    // record matres as we pass them
    if (c === 'ا') hasMatresAlef = true;
    if (c === 'و') hasMatresWaw  = true;
    if (c === 'ي') hasMatresYa   = true;
    j--;
  }

  const baseDiac = j >= 0 ? BASE_DIAC[codepoints[j]] : undefined;

  // Soft vowels (Аь/Э/Уь/Оь) and О → append nūn miniature ۨ only (diacritic stays)
  if (hasSoftMark || baseDiac === 'о') return [0, 'ۨ'];

  // Long А (fatha + alef already in string): just append tanwin, alef stays → ـًا
  if (baseDiac === 'а' && hasMatresAlef) return [0, 'ً'];
  // Long У (damma + waw already in string)
  if (baseDiac === 'у' && hasMatresWaw)  return [0, 'ٌ'];
  // Long И (kasra + ya already in string)
  if (baseDiac === 'и' && hasMatresYa)   return [0, 'ٍ'];

  // Short А: strip fatha, add tanwin-fath + alif
  if (baseDiac === 'а') return [1, 'ًا'];
  // Short У: strip damma, add tanwin-damm + waw
  if (baseDiac === 'у') return [1, 'ٌو'];
  // Short И: strip kasra, add tanwin-kasr + ya
  if (baseDiac === 'и') return [1, 'ٍي'];

  return [0, 'ۨ']; // fallback
};
