import { Module } from "@nestjs/common";
import { AuthModule } from "src/auth/auth.module";
import { PrismaService } from "src/prisma.service";
import { UserTextReaderModule } from "src/user-text-reader/user-text-reader.module";
import { UserTextsController } from "./user-texts.controller";
import { UserTextsService } from "./user-texts.service";

@Module({
  imports: [AuthModule, UserTextReaderModule],
  controllers: [UserTextsController],
  providers: [UserTextsService, PrismaService],
})
export class UserTextsModule {}
