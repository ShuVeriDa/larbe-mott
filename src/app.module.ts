import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { AdminModule } from "./admin/admin.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AuthModule } from "./auth/auth.module";
import { DeckModule } from "./deck/deck.module";
import { DictionaryModule } from "./dictionary/dictionary.module";
import { FeedbackModule } from "./feedback/feedback.module";
import { TokenizerModule } from "./markup-engine/tokenizer/tokenizer.module";
import { ProgressModule } from "./progress/progress.module";
import { RedisModule } from "./redis/redis.module";
import { RedisService } from "./redis/redis.service";
import { SubscriptionModule } from "./subscription/subscription.module";
import { TextModule } from "./text/text.module";
import { TokenModule } from "./token/token.module";
import { UserModule } from "./user/user.module";
import { WordsModule } from "./words/words.module";

@Module({
  imports: [
    ConfigModule.forRoot(),
    RedisModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),
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
    FeedbackModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
