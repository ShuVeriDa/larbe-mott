import { Injectable } from "@nestjs/common";
import { GrammaticalNumber, Language } from "@prisma/client";
import { TokenizerService } from "src/markup-engine/tokenizer/tokenizer.service";
import { normalizeToken } from "src/markup-engine/tokenizer/tokenizer.utils";
import { PrismaService } from "src/prisma.service";

export type PosCode =
  | "NOUN"
  | "ADJECTIVE"
  | "NUMERAL"
  | "PRONOUN"
  | "VERB"
  | "ADVERB"
  | "PUNCT"
  | "UNKNOWN";

export type CandidateSource = "dictionary" | "rule";

export interface PosCandidate {
  code: PosCode;
  chechenName: string;
  score: number;
  source: CandidateSource;
  reasons: string[];
}

export interface AnalyzePosTokenResult {
  token: string;
  normalized: string | null;
  isWord: boolean;
  primaryPartOfSpeech: PosCode;
  primaryPartOfSpeechChechen: string;
  grammaticalClass: "VU" | "DU" | "YU" | "BU" | null;
  grammaticalClassForm: "ву" | "ду" | "ю" | "йу" | "бу" | null;
  grammaticalNumber: "SG" | "PL" | null;
  grammaticalNumberChechen: "цхьаллин терахь" | "дуккхаллин терахь" | null;
  candidates: PosCandidate[];
}

export interface AnalyzePosResult {
  text: string;
  totalTokens: number;
  analyzedWords: number;
  tokens: AnalyzePosTokenResult[];
}

interface RawCandidate {
  code: PosCode;
  score: number;
  source: CandidateSource;
  reason: string;
}

const WORD_REGEX = /\p{L}/u;

const LATIN_TO_CYRILLIC_LOOKALIKE_MAP: Record<string, string> = {
  a: "а",
  c: "с",
  e: "е",
  o: "о",
  p: "р",
  x: "х",
  y: "у",
  k: "к",
  m: "м",
  t: "т",
  b: "в",
};

function normalizeChechenToken(value: string): string {
  const normalized = normalizeToken(value);
  return normalized
    .replace(
      /[aceopxykmtb]/g,
      (char) => LATIN_TO_CYRILLIC_LOOKALIKE_MAP[char] ?? char,
    )
    .replace(/i/g, "і")
    .replace(/Ӏ/g, "і");
}

const POS_CHECHEN_NAME: Record<PosCode, string> = {
  NOUN: "Ц1ердош",
  ADJECTIVE: "Билгалдош",
  NUMERAL: "Терахьдош",
  PRONOUN: "Ц1ерметдош",
  VERB: "Хандош",
  ADVERB: "Куцдош",
  PUNCT: "Пунктуация",
  UNKNOWN: "Билгалдац",
};

const RAW_PRONOUN_FORMS = [
  "со",
  "тхо",
  "вай",
  "хьо",
  "шу",
  "и",
  "иза",
  "уьш",
  "уьзаш",
  "хІара",
  "дІора",
  "кху",
  "цу",
  "мила",
  "муьлш",
  "хІун",
  "муьлха",
  "маса",
  "мел",
  "муха",
  "сан",
  "хьан",
  "цуьнан",
  "вайн",
  "тхан",
  "шун",
  "церан",
  "сайниг",
  "хьайниг",
  "шениг",
  "дерриг",
  "массо",
  "хІора",
  "важ",
  "вуьйш",
  "цхьа",
  "хІумма",
  "милла",
  "масех",
];
const PRONOUN_FORMS = new Set(RAW_PRONOUN_FORMS.map(normalizeChechenToken));

const RAW_NUMERAL_FORMS = [
  "цхьаъ",
  "шиъ",
  "кхоъ",
  "диъ",
  "пхиъ",
  "ялх",
  "ворхІ",
  "бархІ",
  "исс",
  "итт",
  "ткъа",
  "шовзткъа",
  "кхузткъа",
  "бІе",
  "эзар",
];
const NUMERAL_FORMS = new Set(RAW_NUMERAL_FORMS.map(normalizeChechenToken));

const RAW_ADVERB_FORMS = [
  "кхуза",
  "цига",
  "лакха",
  "тахана",
  "селхана",
  "кхана",
  "буса",
  "цундела",
  "сонталла",
  "хІуьттаренна",
  "бегашина",
  "чекха",
  "хаза",
  "дика",
  "вуно",
  "цІахь",
  "цІера",
  "Іай",
  "бІаьста",
  "гурахь",
  "сарахь",
  "оьрсашха",
  "гІаш",
];
const ADVERB_FORMS = new Set(RAW_ADVERB_FORMS.map(normalizeChechenToken));

const NOUN_PLURAL_SUFFIXES = ["ш", "й", "аш", "ауш", "рчий", "рший"];
const VERB_SUFFIXES = ["ира", "на", "ла", "та", "да", "ур", "уш", "за", "ра"];
const VERB_PREFIXES = ["схьа", "дІа", "чу", "ара", "тІе", "охьа", "кІел"];
const INITIAL_UPPERCASE_REGEX = /^\p{Lu}/u;
const CLASS_FORM_TO_CODE = new Map<string, "VU" | "DU" | "YU" | "BU">([
  ["ву", "VU"],
  ["ду", "DU"],
  ["ю", "YU"],
  ["йу", "YU"],
  ["бу", "BU"],
]);
const NUMBER_CHECHEN_NAME: Record<
  "SG" | "PL",
  "цхьаллин терахь" | "дуккхаллин терахь" | null
> = {
  SG: "цхьаллин терахь",
  PL: "дуккхаллин терахь",
};
const SINGULAR_PRONOUN_FORMS = new Set(
  [
    "со",
    "хьо",
    "и",
    "иза",
    "сан",
    "хьан",
    "цуьнан",
    "сайниг",
    "хьайниг",
    "шениг",
  ].map(normalizeChechenToken),
);
const PLURAL_PRONOUN_FORMS = new Set(
  [
    "тхо",
    "вай",
    "шу",
    "уьш",
    "уьзаш",
    "вайн",
    "тхан",
    "шун",
    "церан",
    "муьлш",
  ].map(normalizeChechenToken),
);

@Injectable()
export class WordPosService {
  constructor(
    private readonly tokenizer: TokenizerService,
    private readonly prisma: PrismaService,
  ) {}

  async analyzeText(text: string): Promise<AnalyzePosResult> {
    const tokens = this.tokenizer.tokenize(text);
    const normalizedWords = [
      ...new Set(
        tokens
          .map((token) => token.value)
          .filter((token) => WORD_REGEX.test(token))
          .map((token) => normalizeChechenToken(token))
          .filter(Boolean),
      ),
    ];

    const [lemmas, forms] = normalizedWords.length
      ? await Promise.all([
          this.prisma.lemma.findMany({
            where: {
              language: Language.CHE,
              normalized: { in: normalizedWords },
            },
            select: { normalized: true, partOfSpeech: true, baseForm: true },
          }),
          this.prisma.morphForm.findMany({
            where: {
              normalized: { in: normalizedWords },
              lemma: { language: Language.CHE },
            },
            select: {
              normalized: true,
              gramNumber: true,
              lemma: { select: { partOfSpeech: true, baseForm: true } },
            },
          }),
        ])
      : [[], []];

    const lemmaByNormalized = new Map<
      string,
      { partOfSpeech: string | null; baseForm: string }
    >();
    for (const lemma of lemmas) {
      if (!lemmaByNormalized.has(lemma.normalized)) {
        lemmaByNormalized.set(lemma.normalized, {
          partOfSpeech: lemma.partOfSpeech,
          baseForm: lemma.baseForm,
        });
      }
    }

    const formsByNormalized = new Map<
      string,
      {
        partOfSpeech: string | null;
        baseForm: string;
        gramNumber: GrammaticalNumber | null;
      }[]
    >();
    for (const form of forms) {
      const bucket = formsByNormalized.get(form.normalized) ?? [];
      bucket.push({
        partOfSpeech: form.lemma.partOfSpeech,
        baseForm: form.lemma.baseForm,
        gramNumber: form.gramNumber ?? null,
      });
      formsByNormalized.set(form.normalized, bucket);
    }

    const analyzedTokens: AnalyzePosTokenResult[] = [];
    let previousWordNormalized: string | null = null;
    for (const token of tokens) {
      const analyzed = this.analyzeToken(
        token.value,
        token.position,
        previousWordNormalized,
        lemmaByNormalized,
        formsByNormalized,
      );
      analyzedTokens.push(analyzed);

      if (analyzed.isWord && analyzed.normalized) {
        previousWordNormalized = analyzed.normalized;
      }
    }

    return {
      text,
      totalTokens: analyzedTokens.length,
      analyzedWords: analyzedTokens.filter((t) => t.isWord).length,
      tokens: analyzedTokens,
    };
  }

  private analyzeToken(
    token: string,
    tokenPosition: number,
    previousWordNormalized: string | null,
    lemmaByNormalized: Map<
      string,
      { partOfSpeech: string | null; baseForm: string }
    >,
    formsByNormalized: Map<
      string,
      {
        partOfSpeech: string | null;
        baseForm: string;
        gramNumber: GrammaticalNumber | null;
      }[]
    >,
  ): AnalyzePosTokenResult {
    const isWord = WORD_REGEX.test(token);
    if (!isWord) {
      return {
        token,
        normalized: null,
        isWord: false,
        primaryPartOfSpeech: "PUNCT",
        primaryPartOfSpeechChechen: POS_CHECHEN_NAME.PUNCT,
        grammaticalClass: null,
        grammaticalClassForm: null,
        grammaticalNumber: null,
        grammaticalNumberChechen: null,
        candidates: [
          {
            code: "PUNCT",
            chechenName: POS_CHECHEN_NAME.PUNCT,
            score: 1,
            source: "rule",
            reasons: ["Token does not contain letters"],
          },
        ],
      };
    }

    const normalized = normalizeChechenToken(token);
    const rawCandidates: RawCandidate[] = [];
    const grammaticalClass = this.detectGrammaticalClass(normalized);

    const lemma = lemmaByNormalized.get(normalized);
    if (lemma?.partOfSpeech) {
      rawCandidates.push({
        code: this.mapDbPosToCode(lemma.partOfSpeech),
        score: 0.99,
        source: "dictionary",
        reason: `Matched lemma "${lemma.baseForm}" from dictionary`,
      });
    }

    const forms = formsByNormalized.get(normalized) ?? [];
    for (const form of forms) {
      if (!form.partOfSpeech) continue;
      rawCandidates.push({
        code: this.mapDbPosToCode(form.partOfSpeech),
        score: 0.95,
        source: "dictionary",
        reason: `Matched morphology form for lemma "${form.baseForm}"`,
      });
    }

    rawCandidates.push(
      ...this.detectByRules(normalized, token, tokenPosition, grammaticalClass),
    );

    const candidates = this.mergeCandidates(rawCandidates);
    const [primary] = candidates;
    const grammaticalNumber = this.detectGrammaticalNumber(
      normalized,
      primary.code,
      grammaticalClass,
      forms,
      previousWordNormalized,
    );

    return {
      token,
      normalized,
      isWord: true,
      primaryPartOfSpeech: primary.code,
      primaryPartOfSpeechChechen: primary.chechenName,
      grammaticalClass: grammaticalClass?.code ?? null,
      grammaticalClassForm: grammaticalClass?.form ?? null,
      grammaticalNumber,
      grammaticalNumberChechen: grammaticalNumber
        ? NUMBER_CHECHEN_NAME[grammaticalNumber]
        : null,
      candidates,
    };
  }

  private mergeCandidates(candidates: RawCandidate[]): PosCandidate[] {
    if (!candidates.length) {
      return [
        {
          code: "UNKNOWN",
          chechenName: POS_CHECHEN_NAME.UNKNOWN,
          score: 0,
          source: "rule",
          reasons: ["No dictionary match and no rule matched"],
        },
      ];
    }

    const byCode = new Map<PosCode, PosCandidate>();
    for (const candidate of candidates) {
      const existing = byCode.get(candidate.code);
      if (!existing) {
        byCode.set(candidate.code, {
          code: candidate.code,
          chechenName: POS_CHECHEN_NAME[candidate.code],
          score: candidate.score,
          source: candidate.source,
          reasons: [candidate.reason],
        });
        continue;
      }

      existing.score = Math.max(existing.score, candidate.score);
      if (candidate.source === "dictionary") {
        existing.source = "dictionary";
      }
      if (!existing.reasons.includes(candidate.reason)) {
        existing.reasons.push(candidate.reason);
      }
    }

    return [...byCode.values()].sort((a, b) => b.score - a.score);
  }

  private mapDbPosToCode(pos: string): PosCode {
    const normalized = pos.trim().toUpperCase();

    if (
      normalized === "NOUN" ||
      normalized === "СУЩ" ||
      normalized.includes("СУЩЕСТВ")
    ) {
      return "NOUN";
    }
    if (
      normalized === "ADJ" ||
      normalized === "ADJECTIVE" ||
      normalized.includes("ПРИЛАГАТ")
    ) {
      return "ADJECTIVE";
    }
    if (
      normalized === "NUM" ||
      normalized === "NUMERAL" ||
      normalized.includes("ЧИСЛИТ")
    ) {
      return "NUMERAL";
    }
    if (
      normalized === "PRON" ||
      normalized === "PRONOUN" ||
      normalized.includes("МЕСТОИМ")
    ) {
      return "PRONOUN";
    }
    if (normalized === "VERB" || normalized.includes("ГЛАГОЛ")) {
      return "VERB";
    }
    if (
      normalized === "ADV" ||
      normalized === "ADVERB" ||
      normalized.includes("НАРЕЧ")
    ) {
      return "ADVERB";
    }

    return "UNKNOWN";
  }

  private detectByRules(
    normalizedWord: string,
    rawToken: string,
    tokenPosition: number,
    grammaticalClass: {
      code: "VU" | "DU" | "YU" | "BU";
      form: "ву" | "ду" | "ю" | "йу" | "бу";
    } | null,
  ): RawCandidate[] {
    const candidates: RawCandidate[] = [];

    if (grammaticalClass) {
      candidates.push({
        code: "VERB",
        score: 0.88,
        source: "rule",
        reason: `Matched grammatical class form "${grammaticalClass.form}"`,
      });
    }

    if (PRONOUN_FORMS.has(normalizedWord)) {
      candidates.push({
        code: "PRONOUN",
        score: 0.92,
        source: "rule",
        reason: "Matched known pronoun form from grammar rules",
      });
    }

    if (NUMERAL_FORMS.has(normalizedWord)) {
      candidates.push({
        code: "NUMERAL",
        score: 0.92,
        source: "rule",
        reason: "Matched base cardinal numeral form",
      });
    }

    if (/(лг[Ііi]а|алг[Ііi]а)$/iu.test(normalizedWord)) {
      candidates.push({
        code: "NUMERAL",
        score: 0.86,
        source: "rule",
        reason: 'Ordinal numeral suffix "-лгІа/-алгІа"',
      });
    }

    if (/зза$/u.test(normalizedWord)) {
      candidates.push({
        code: "ADVERB",
        score: 0.83,
        source: "rule",
        reason: 'Multiplicative suffix "-зза" (adverb of measure)',
      });
      candidates.push({
        code: "NUMERAL",
        score: 0.57,
        source: "rule",
        reason: 'Numeral-derived multiplicative form with suffix "-зза"',
      });
    }

    if (ADVERB_FORMS.has(normalizedWord)) {
      candidates.push({
        code: "ADVERB",
        score: 0.9,
        source: "rule",
        reason: "Matched known adverb form from grammar rules",
      });
    }

    if (this.looksLikeProperName(rawToken, tokenPosition, normalizedWord)) {
      candidates.push({
        code: "NOUN",
        score: 0.74,
        source: "rule",
        reason: "Looks like a proper name (capitalized token in sentence)",
      });
    }

    if (
      NOUN_PLURAL_SUFFIXES.some((suffix) => normalizedWord.endsWith(suffix))
    ) {
      candidates.push({
        code: "NOUN",
        score: 0.78,
        source: "rule",
        reason: "Matched productive noun plural suffix",
      });
    }

    if (normalizedWord.length > 3 && normalizedWord.endsWith("р")) {
      candidates.push({
        code: "NOUN",
        score: 0.62,
        source: "rule",
        reason: 'Possible masdar (verbal noun) with suffix "-р"',
      });
    }

    if (VERB_PREFIXES.some((prefix) => normalizedWord.startsWith(prefix))) {
      candidates.push({
        code: "VERB",
        score: 0.72,
        source: "rule",
        reason: "Matched common verb directional prefix",
      });
    }

    if (
      normalizedWord.length > 2 &&
      VERB_SUFFIXES.some((suffix) => normalizedWord.endsWith(suffix))
    ) {
      candidates.push({
        code: "VERB",
        score: 0.79,
        source: "rule",
        reason: "Matched common verb tense/participle suffix",
      });
    }

    if (normalizedWord.length > 3 && normalizedWord.endsWith("ца")) {
      candidates.push({
        code: "VERB",
        score: 0.64,
        source: "rule",
        reason: 'Negative marker "-ца" often used with verbal forms',
      });
    }

    if (normalizedWord.length > 4 && /(о|х|хо|ах|ха)$/u.test(normalizedWord)) {
      candidates.push({
        code: "ADJECTIVE",
        score: 0.68,
        source: "rule",
        reason: "Matched comparative adjective ending pattern",
      });
    }

    if (/^(б|в|д|й)[\p{L}\p{M}]{3,}$/u.test(normalizedWord)) {
      candidates.push({
        code: "ADJECTIVE",
        score: 0.59,
        source: "rule",
        reason: "Starts with possible class marker used in adjectives",
      });
    }

    return candidates;
  }

  private detectGrammaticalClass(normalizedWord: string): {
    code: "VU" | "DU" | "YU" | "BU";
    form: "ву" | "ду" | "ю" | "йу" | "бу";
  } | null {
    const code = CLASS_FORM_TO_CODE.get(normalizedWord);
    if (!code) return null;
    if (normalizedWord === "ву") return { code, form: "ву" };
    if (normalizedWord === "ду") return { code, form: "ду" };
    if (normalizedWord === "бу") return { code, form: "бу" };
    if (normalizedWord === "ю") return { code, form: "ю" };
    return { code, form: "йу" };
  }

  private detectGrammaticalNumber(
    normalizedWord: string,
    primaryPos: PosCode,
    grammaticalClass: {
      code: "VU" | "DU" | "YU" | "BU";
      form: "ву" | "ду" | "ю" | "йу" | "бу";
    } | null,
    forms: { gramNumber: GrammaticalNumber | null }[],
    previousWordNormalized: string | null,
  ): "SG" | "PL" | null {
    const numberFromDictionary = this.detectNumberFromDictionary(forms);
    if (numberFromDictionary) return numberFromDictionary;

    if (PLURAL_PRONOUN_FORMS.has(normalizedWord)) return "PL";
    if (SINGULAR_PRONOUN_FORMS.has(normalizedWord)) return "SG";

    // Noun after numeral is usually singular in Chechen.
    if (
      primaryPos === "NOUN" &&
      previousWordNormalized &&
      (NUMERAL_FORMS.has(previousWordNormalized) ||
        /(лг[Ііi]а|алг[Ііi]а)$/iu.test(previousWordNormalized))
    ) {
      return "SG";
    }

    if (
      NOUN_PLURAL_SUFFIXES.some((suffix) => normalizedWord.endsWith(suffix))
    ) {
      return "PL";
    }

    // "ву" is a singular class marker form.
    if (grammaticalClass?.form === "ву") return "SG";

    return null;
  }

  private detectNumberFromDictionary(
    forms: { gramNumber: GrammaticalNumber | null }[],
  ): "SG" | "PL" | null {
    let hasPl = false;
    let hasSg = false;
    for (const form of forms) {
      if (form.gramNumber === GrammaticalNumber.PL) hasPl = true;
      if (form.gramNumber === GrammaticalNumber.SG) hasSg = true;
    }
    if (hasPl) return "PL";
    if (hasSg) return "SG";
    return null;
  }

  private looksLikeProperName(
    rawToken: string,
    tokenPosition: number,
    normalizedWord: string,
  ): boolean {
    if (tokenPosition === 0) return false;
    if (!INITIAL_UPPERCASE_REGEX.test(rawToken)) return false;
    if (normalizedWord.length < 2) return false;
    if (PRONOUN_FORMS.has(normalizedWord)) return false;
    if (NUMERAL_FORMS.has(normalizedWord)) return false;
    if (ADVERB_FORMS.has(normalizedWord)) return false;
    return true;
  }
}
