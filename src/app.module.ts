import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { WinstonModule } from "nest-winston";
import { AdminModule } from "./admin/admin.module";
import { AiTranslationModule } from "./ai-translation/ai-translation.module";
import { TokenizationEventsModule } from "./admin/tokenization/tokenization-events.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { AuthModule } from "./auth/auth.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { ObservabilityModule } from "./common/observability/observability.module";
import { DeckModule } from "./deck/deck.module";
import { DictionaryModule } from "./dictionary/dictionary.module";
import { FeedbackModule } from "./feedback/feedback.module";
import { HighlightModule } from "./highlight/highlight.module";
import { NoteModule } from "./note/note.module";
import { HealthModule } from "./health/health.module";
import { LegalModule } from "./legal/legal.module";
import { PageBookmarkModule } from "./page-bookmark/page-bookmark.module";
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
import { DictionaryExportModule } from "./dictionary-export/dictionary-export.module";
import { SuggestionsModule } from "./suggestions/suggestions.module";
import { TextSubmissionsModule } from "./text-submissions/text-submissions.module";
import { UserTextsModule } from "./user-texts/user-texts.module";
import { UserTextReaderModule } from "./user-text-reader/user-text-reader.module";
import { TrackingModule } from "./tracking/tracking.module";
import { ReaderContextModule } from "./reader-context/reader-context.module";
import { GenreModule } from "./genre/genre.module";
import { NotificationModule } from "./notification/notification.module";
import { NotificationsEmailModule } from "./notifications-email/notifications-email.module";
import { TransliterationModule } from "./transliteration/transliteration.module";
import { TextScriptModule } from "./text-script/text-script.module";
import { AnnouncementModule } from "./announcement/announcement.module";
import { HeritageModule } from "./heritage/heritage.module";
import { GeoModule } from "./geo/geo.module";
import { envValidationSchema } from "./config/env.validation";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createWinstonOptions(config.get("NODE_ENV")),
    }),
    RedisModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({ wildcard: false, delimiter: '.' }),
    ObservabilityModule,
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
    TokenizationEventsModule,
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
    HighlightModule,
    NoteModule,
    PhrasebookModule,
    SettingsModule,
    StatisticsModule,
    HealthModule,
    LegalModule,
    PageBookmarkModule,
    AiTranslationModule,
    DictionaryExportModule,
    SuggestionsModule,
    TextSubmissionsModule,
    UserTextsModule,
    UserTextReaderModule,
    TrackingModule,
    ReaderContextModule,
    GenreModule,
    NotificationModule,
    NotificationsEmailModule,
    TransliterationModule,
    TextScriptModule,
    AnnouncementModule,
    HeritageModule,
    GeoModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
