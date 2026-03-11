export class TokenResponseDto {
  tokenId: string;
  word: string;
  normalized: string;
  lemma: string | null;
  translation: string | null;
  forms: string[];
  source: string | null;
}
