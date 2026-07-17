import { Module } from "@nestjs/common";
import { AuthModule } from "src/auth/auth.module";
import { PrismaService } from "src/prisma.service";
import { UserTextReaderModule } from "src/user-text-reader/user-text-reader.module";
import { AiTranslationModule } from "src/ai-translation/ai-translation.module";
import { GenreModule } from "src/genre/genre.module";
import { UserTextsController } from "./user-texts.controller";
import { UserTextsService } from "./user-texts.service";
import { UserTextGenerationController } from "./user-text-generation.controller";
import { UserTextGenerationService } from "./user-text-generation.service";

@Module({
  imports: [AuthModule, UserTextReaderModule, AiTranslationModule, GenreModule],
  controllers: [UserTextsController, UserTextGenerationController],
  providers: [UserTextsService, UserTextGenerationService, PrismaService],
})
export class UserTextsModule {}
