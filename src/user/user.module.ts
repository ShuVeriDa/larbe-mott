import { Module } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PermissionsService } from "src/auth/permissions/permissions.service";
import { PrismaService } from "src/prisma.service";
import { ImageProcessingModule } from "src/common/image-processing/image-processing.module";
import { AccountCleanupService } from "./account-cleanup.service";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";

@Module({
  imports: [ImageProcessingModule],
  controllers: [UserController],
  providers: [
    UserService,
    PrismaService,
    JwtService,
    PermissionsService,
    AccountCleanupService,
  ],
})
export class UserModule {}
