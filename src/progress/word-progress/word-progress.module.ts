import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { RedisModule } from "src/redis/redis.module";
import { WordProgressService } from "./word-progress.service";

@Module({
  imports: [RedisModule],
  controllers: [],
  providers: [WordProgressService, PrismaService],
  exports: [WordProgressService],
})
export class WordProgressModule {}
