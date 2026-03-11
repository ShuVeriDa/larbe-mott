import { Module } from "@nestjs/common";
import { TokenModule } from "src/token/token.module";
import { WordsController } from "./words.controller";
import { WordsService } from "./words.service";

@Module({
  imports: [TokenModule],
  controllers: [WordsController],
  providers: [WordsService],
})
export class WordsModule {}
