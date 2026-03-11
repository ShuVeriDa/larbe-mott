import { Module } from "@nestjs/common";
import { AuthModule } from "src/auth/auth.module";
import { TokenizerModule } from "src/markup-engine/tokenizer/tokenizer.module";
import { PrismaService } from "src/prisma.service";
import { TextProgressService } from "src/progress/text-progress/text-progress.service";
import { WordProgressModule } from "src/progress/word-progress/word-progress.module";
import { TextController } from "./text.controller";
import { TextService } from "./text.service";

@Module({
  imports: [AuthModule, TokenizerModule, WordProgressModule],
  controllers: [TextController],
  providers: [TextService, PrismaService, TextProgressService],
})
export class TextModule {}
