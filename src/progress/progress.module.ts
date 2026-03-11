import { Module } from "@nestjs/common";
import { ProgressService } from "./progress.service";

@Module({
  controllers: [],
  providers: [ProgressService],
})
export class ProgressModule {}
