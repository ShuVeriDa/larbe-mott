import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { RedisModule } from "src/redis/redis.module";
import { TextProgressService } from "./text-progress.service";

@Module({
  imports: [RedisModule],
  controllers: [],
  providers: [TextProgressService, PrismaService],
  exports: [TextProgressService],
})
export class TextProgressModule {}
