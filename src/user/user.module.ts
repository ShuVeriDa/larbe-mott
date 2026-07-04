import { Module } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PermissionsService } from "src/auth/permissions/permissions.service";
import { RefreshTokenLockService } from "src/auth/refresh-token-lock.service";
import { PrismaService } from "src/prisma.service";
import { ImageProcessingModule } from "src/common/image-processing/image-processing.module";
import { AccountCleanupService } from "./account-cleanup.service";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";
import { UserHeritageService } from "./user-heritage.service";

@Module({
  imports: [ImageProcessingModule],
  controllers: [UserController],
  providers: [
    UserService,
    UserHeritageService,
    PrismaService,
    JwtService,
    PermissionsService,
    RefreshTokenLockService,
    AccountCleanupService,
  ],
})
export class UserModule {}
