import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { WinstonModule } from "nest-winston";
import { AdminModule } from "./admin/admin.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { AuthModule } from "./auth/auth.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { DeckModule } from "./deck/deck.module";
import { DictionaryModule } from "./dictionary/dictionary.module";
import { FeedbackModule } from "./feedback/feedback.module";
import { PhrasebookModule } from "./phrasebook/phrasebook.module";
import { SettingsModule } from "./settings/settings.module";
import { StatisticsModule } from "./statistics/statistics.module";
import { createWinstonOptions } from "./logger/logger.config";
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
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createWinstonOptions(config.get("NODE_ENV")),
    }),
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
    DashboardModule,
    DeckModule,
    FeedbackModule,
    PhrasebookModule,
    SettingsModule,
    StatisticsModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
