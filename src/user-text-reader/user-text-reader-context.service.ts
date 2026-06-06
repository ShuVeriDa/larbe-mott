import { Injectable } from "@nestjs/common";
import { HighlightService } from "src/highlight/highlight.service";
import { NoteService } from "src/note/note.service";
import { UserTextReaderService } from "./user-text-reader.service";

/**
 * Combines page data, highlights and notes for the UserText reader.
 * Returns same ReaderContextResponse shape as ReaderContextService
 * so the frontend useReaderContext hook works transparently.
 */
@Injectable()
export class UserTextReaderContextService {
  constructor(
    private readonly readerService: UserTextReaderService,
    private readonly highlightService: HighlightService,
    private readonly noteService: NoteService,
  ) {}

  async getContext(userId: string, userTextId: string, pageNumber: number) {
    const [page, highlights, notes] = await Promise.all([
      this.readerService.getPage(userId, userTextId, pageNumber),
      this.highlightService.getForPage(userId, userTextId, pageNumber),
      this.noteService.getForPage(userId, userTextId, pageNumber),
    ]);

    return {
      page,
      phrases: [], // Phrase lookup not available for private texts
      highlights,
      notes,
    };
  }
}
