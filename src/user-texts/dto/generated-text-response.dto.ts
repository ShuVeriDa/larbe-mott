export interface TipTapNode {
  type: string;
  text?: string;
  content?: TipTapNode[];
}

export interface TipTapDoc {
  type: "doc";
  content: TipTapNode[];
}

export interface GeneratedTextResponseDto {
  content: TipTapDoc;
  usedWords: string[];
  description: string | null;
  genreId: string | null;
}
