import { Module } from "@nestjs/common";
import { AuthModule } from "src/auth/auth.module";
import { DictionaryModule } from "src/markup-engine/dictionary/dictionary.module";
import { TokenizerModule } from "src/markup-engine/tokenizer/tokenizer.module";
import { HighlightService } from "src/highlight/highlight.service";
import { NoteService } from "src/note/note.service";
import { PrismaService } from "src/prisma.service";
import { TextScriptModule } from "src/text-script/text-script.module";
import { UserTextReaderContextController } from "./user-text-reader-context.controller";
import { UserTextReaderContextService } from "./user-text-reader-context.service";
import { UserTextReaderService } from "./user-text-reader.service";
import { UserTextTokenizerProcessor } from "./user-text-tokenizer.processor";

@Module({
  imports: [AuthModule, TokenizerModule, DictionaryModule, TextScriptModule],
  controllers: [UserTextReaderContextController],
  providers: [
    UserTextTokenizerProcessor,
    UserTextReaderService,
    UserTextReaderContextService,
    HighlightService,
    NoteService,
    PrismaService,
  ],
  exports: [UserTextTokenizerProcessor],
})
export class UserTextReaderModule {}
