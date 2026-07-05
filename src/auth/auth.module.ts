import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule, JwtModuleOptions, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaService } from "src/prisma.service";
import { MailModule } from "src/mail/mail.module";
import { ImageProcessingModule } from "src/common/image-processing/image-processing.module";
import { ImageProcessingService } from "src/common/image-processing/image-processing.service";
import { UserService } from "src/user/user.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { GoogleStrategy } from "./strategies/google.strategy";
import { PermissionGuard } from "./permissions/permission.guard";
import { PermissionsService } from "./permissions/permissions.service";
import { PasswordResetCleanupTask } from "./password-reset-cleanup.task";
import { EmailChangeCleanupTask } from "./email-change-cleanup.task";
import { RefreshTokenLockService } from "./refresh-token-lock.service";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PrismaService,
    JwtStrategy,
    GoogleStrategy,
    PermissionsService,
    PermissionGuard,
    UserService,
    JwtService,
    ConfigService,
    PasswordResetCleanupTask,
    EmailChangeCleanupTask,
    RefreshTokenLockService,
    ImageProcessingService,
  ],
  exports: [PermissionsService, RefreshTokenLockService],
  imports: [
    ConfigModule,
    PassportModule,
    MailModule,
    ImageProcessingModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.getOrThrow<string>("JWT_ACCESS_SECRET"),
      }),
    }),
  ],
})
export class AuthModule {}
