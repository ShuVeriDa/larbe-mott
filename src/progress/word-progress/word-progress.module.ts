import { Module } from "@nestjs/common";
import { WordProgressService } from "./word-progress.service";

@Module({
  controllers: [],
  providers: [WordProgressService],
})
export class WordProgressModule {}
