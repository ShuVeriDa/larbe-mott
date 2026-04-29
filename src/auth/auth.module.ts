import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule, JwtModuleOptions, JwtService } from "@nestjs/jwt";
import { PrismaService } from "src/prisma.service";
import { MailModule } from "src/mail/mail.module";
import { UserService } from "src/user/user.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { PermissionGuard } from "./permissions/permission.guard";
import { PermissionsService } from "./permissions/permissions.service";
import { PasswordResetCleanupTask } from "./password-reset-cleanup.task";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PrismaService,
    JwtStrategy,
    PermissionsService,
    PermissionGuard,
    UserService,
    JwtService,
    ConfigService,
    PasswordResetCleanupTask,
  ],
  exports: [PermissionsService],
  imports: [
    ConfigModule,
    MailModule,
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
