import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { OnlineDictionaryProcessor } from "./online-dictionary.processor";
import { OnlineDictionaryService } from "./online-dictionary.service";

@Module({
  providers: [
    OnlineDictionaryService,
    OnlineDictionaryProcessor,
    PrismaService,
  ],
  exports: [OnlineDictionaryService, OnlineDictionaryProcessor],
})
export class OnlineDictionaryModule {}
