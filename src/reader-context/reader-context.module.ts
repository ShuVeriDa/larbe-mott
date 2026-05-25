import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { HighlightService } from "src/highlight/highlight.service";
import { NoteService } from "src/note/note.service";
import { TextModule } from "src/text/text.module";
import { AuthModule } from "src/auth/auth.module";
import { ReaderContextController } from "./reader-context.controller";
import { ReaderContextService } from "./reader-context.service";

@Module({
  imports: [AuthModule, TextModule],
  controllers: [ReaderContextController],
  providers: [ReaderContextService, HighlightService, NoteService, PrismaService],
})
export class ReaderContextModule {}
