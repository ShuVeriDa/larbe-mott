import { Module } from "@nestjs/common";
import { AuthModule } from "src/auth/auth.module";
import { TokenizerModule } from "src/markup-engine/tokenizer/tokenizer.module";
import { PrismaService } from "src/prisma.service";
import { TextController } from "./text.controller";
import { TextService } from "./text.service";

@Module({
  imports: [AuthModule, TokenizerModule],
  controllers: [TextController],
  providers: [TextService, PrismaService],
})
export class TextModule {}
