import { Injectable } from "@nestjs/common";
import { HighlightService } from "src/highlight/highlight.service";
import { NoteService } from "src/note/note.service";
import { TextService } from "src/text/text.service";

@Injectable()
export class ReaderContextService {
  constructor(
    private readonly textService: TextService,
    private readonly highlightService: HighlightService,
    private readonly noteService: NoteService,
  ) {}

  async getContext(userId: string, textId: string, pageNumber: number) {
    const [page, phrases, highlights, notes] = await Promise.all([
      this.textService.getPage(textId, pageNumber, userId),
      this.textService.getPagePhrases(textId, pageNumber),
      this.highlightService.getForPage(userId, textId, pageNumber),
      this.noteService.getForPage(userId, textId, pageNumber),
    ]);

    return { page, phrases, highlights, notes };
  }
}
