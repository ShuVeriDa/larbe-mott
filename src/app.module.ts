import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { TokenizerModule } from "./markup-engine/tokenizer/tokenizer.module";
import { TextModule } from "./text/text.module";
import { UserModule } from "./user/user.module";

@Module({
  imports: [
    ConfigModule.forRoot(),
    UserModule,
    AuthModule,
    TextModule,
    TokenizerModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
