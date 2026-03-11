import { Module } from "@nestjs/common";
import { TokenInfoCacheService } from "src/cache/token-info-cache.service";
import { PrismaService } from "src/prisma.service";
import { WordProgressModule } from "src/progress/word-progress/word-progress.module";
import { TokenController } from "./token.controller";
import { TokenService } from "./token.service";

@Module({
  imports: [WordProgressModule],
  controllers: [TokenController],
  providers: [TokenService, PrismaService, TokenInfoCacheService],
  exports: [TokenService, TokenInfoCacheService],
})
export class TokenModule {}
