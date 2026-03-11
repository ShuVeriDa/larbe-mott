import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { TokenizerModule } from "./markup-engine/tokenizer/tokenizer.module";
import { TextModule } from "./text/text.module";
import { TokenModule } from "./token/token.module";
import { UserModule } from "./user/user.module";
import { ProgressModule } from './progress/progress.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    UserModule,
    AuthModule,
    TextModule,
    TokenizerModule,
    TokenModule,
    ProgressModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
