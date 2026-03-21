import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { TokenizerModule } from "./markup-engine/tokenizer/tokenizer.module";
import { TextModule } from "./text/text.module";
import { TokenModule } from "./token/token.module";
import { UserModule } from "./user/user.module";
import { ProgressModule } from "./progress/progress.module";
import { WordsModule } from "./words/words.module";
import { DictionaryModule } from './dictionary/dictionary.module';
import { AdminModule } from './admin/admin.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { DeckModule } from './deck/deck.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    UserModule,
    AuthModule,
    TextModule,
    TokenizerModule,
    TokenModule,
    ProgressModule,
    WordsModule,
    DictionaryModule,
    AdminModule,
    SubscriptionModule,
    AnalyticsModule,
    DeckModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
