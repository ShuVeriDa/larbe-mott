import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { AdminDictionaryProcessor } from "./admin-dictionary.processor";
import { AdminDictionaryService } from "./admin-dictionary.service";

@Module({
  providers: [AdminDictionaryService, AdminDictionaryProcessor, PrismaService],
  exports: [AdminDictionaryService, AdminDictionaryProcessor],
})
export class AdminDictionaryModule {}
