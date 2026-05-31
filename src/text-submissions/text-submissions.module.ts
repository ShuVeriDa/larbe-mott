import { Module } from "@nestjs/common";
import { AuthModule } from "src/auth/auth.module";
import { PrismaService } from "src/prisma.service";
import { TextSubmissionsController } from "./text-submissions.controller";
import { TextSubmissionsService } from "./text-submissions.service";

@Module({
  imports: [AuthModule],
  controllers: [TextSubmissionsController],
  providers: [TextSubmissionsService, PrismaService],
})
export class TextSubmissionsModule {}
