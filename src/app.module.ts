import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { UserModule } from "./user/user.module";
import { TextModule } from './text/text.module';

@Module({
  imports: [ConfigModule.forRoot(), UserModule, AuthModule, TextModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
