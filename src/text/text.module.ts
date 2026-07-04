import { Module } from "@nestjs/common";
import { AuthModule } from "src/auth/auth.module";
import { FeatureFlagsModule } from "src/feature-flags/feature-flags.module";
import { TokenizerModule } from "src/markup-engine/tokenizer/tokenizer.module";
import { PrismaService } from "src/prisma.service";
import { TextProgressService } from "src/progress/text-progress/text-progress.service";
import { WordProgressModule } from "src/progress/word-progress/word-progress.module";
import { RedisModule } from "src/redis/redis.module";
import { TextScriptModule } from "src/text-script/text-script.module";
import { TransliterationModule } from "src/transliteration/transliteration.module";
import { TrackingModule } from "src/tracking/tracking.module";
import { TextController } from "./text.controller";
import { TextService } from "./text.service";

@Module({
  imports: [
    AuthModule,
    FeatureFlagsModule,
    TokenizerModule,
    WordProgressModule,
    RedisModule,
    TrackingModule,
    TextScriptModule,
    TransliterationModule,
  ],
  controllers: [TextController],
  providers: [TextService, PrismaService, TextProgressService],
  exports: [TextService],
})
export class TextModule {}
