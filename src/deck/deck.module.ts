import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { DeckController } from "./deck.controller";
import { DeckService } from "./deck.service";

@Module({
  controllers: [DeckController],
  providers: [DeckService, PrismaService],
  exports: [DeckService],
})
export class DeckModule {}
