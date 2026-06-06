import { Module } from "@nestjs/common";
import { AuthModule } from "src/auth/auth.module";
import { TokenizerModule } from "src/markup-engine/tokenizer/tokenizer.module";
import { PrismaService } from "src/prisma.service";
import { TextSubmissionsController } from "./text-submissions.controller";
import { TextSubmissionsService } from "./text-submissions.service";

@Module({
  imports: [AuthModule, TokenizerModule],
  controllers: [TextSubmissionsController],
  providers: [TextSubmissionsService, PrismaService],
})
export class TextSubmissionsModule {}
