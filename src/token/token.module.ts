import { Module } from "@nestjs/common";
import { TokenInfoCacheService } from "src/cache/token-info-cache.service";
import { TokenizerModule } from "src/markup-engine/tokenizer/tokenizer.module";
import { PrismaService } from "src/prisma.service";
import { WordProgressModule } from "src/progress/word-progress/word-progress.module";
import { TrackingModule } from "src/tracking/tracking.module";
import { TokenController } from "./token.controller";
import { TokenService } from "./token.service";

@Module({
  imports: [WordProgressModule, TokenizerModule, TrackingModule],
  controllers: [TokenController],
  providers: [TokenService, PrismaService, TokenInfoCacheService],
  exports: [TokenService, TokenInfoCacheService],
})
export class TokenModule {}
