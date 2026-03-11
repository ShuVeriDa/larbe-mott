import { Module } from "@nestjs/common";
import { ProgressService } from "./progress.service";
import { TextProgressModule } from "./text-progress/text-progress.module";
import { WordProgressModule } from "./word-progress/word-progress.module";

@Module({
  imports: [WordProgressModule, TextProgressModule],
  controllers: [],
  providers: [ProgressService],
  exports: [ProgressService, WordProgressModule, TextProgressModule],
})
export class ProgressModule {}
