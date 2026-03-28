import { Module } from "@nestjs/common";
import { AuthModule } from "src/auth/auth.module";
import { DictionaryModule } from "src/markup-engine/dictionary/dictionary.module";
import { MorphologyModule } from "src/markup-engine/morphology/morphology.module";
import { TokenizerModule } from "src/markup-engine/tokenizer/tokenizer.module";
import { PrismaService } from "src/prisma.service";
import { ProgressModule } from "src/progress/progress.module";
import { TextModule } from "src/text/text.module";
import { TokenModule } from "src/token/token.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { AdminDictionaryController } from "./dictionary/admin-dictionary.controller";
import { AdminMorphologyController } from "./morphology/admin-morphology.controller";
import { AdminMorphologyService } from "./morphology/admin-morphology.service";
import { AdminTextService } from "./text/admin-text.service";
import { AdminTextsController } from "./text/admin-texts.controller";
import { AdminTokensController } from "./token/admin-tokens.controller";
import { AdminTokenService } from "./token/admin-tokens.service";
import { AdminUnknownWordsController } from "./unknown-words/admin-unknown-words.controller";
import { AdminUnknownWordsService } from "./unknown-words/admin-unknown-words.service";
import { AdminUsersController } from "./users/admin-users.controller";
import { AdminUsersService } from "./users/admin-users.service";
import { UserAnalyticsService } from "./users/user-analytics.service";
import { AdminBillingController } from "./billing/admin-billing.controller";
import { AdminBillingService } from "./billing/admin-billing.service";
import { AdminAnalyticsController } from "./analytics/admin-analytics.controller";
import { AdminAnalyticsService } from "./analytics/admin-analytics.service";
import { AdminFeatureFlagsController } from "./feature-flags/admin-feature-flags.controller";
import { AdminFeatureFlagsService } from "./feature-flags/admin-feature-flags.service";
import { AdminFeedbackController } from "./feedback/admin-feedback.controller";
import { AdminFeedbackService } from "./feedback/admin-feedback.service";
import { AdminTagsController } from "./tags/admin-tags.controller";
import { AdminTagsService } from "./tags/admin-tags.service";
import { AdminPhrasebookController } from "./phrasebook/admin-phrasebook.controller";
import { AdminPhrasebookService } from "./phrasebook/admin-phrasebook.service";
import { AdminDashboardController } from "./dashboard/admin-dashboard.controller";
import { AdminDashboardService } from "./dashboard/admin-dashboard.service";

@Module({
  imports: [
    AuthModule,
    TextModule,
    TokenModule,
    TokenizerModule,
    ProgressModule,
    DictionaryModule,
    MorphologyModule,
  ],
  controllers: [
    AdminController,
    AdminTextsController,
    AdminTokensController,
    AdminDictionaryController,
    AdminUnknownWordsController,
    AdminUsersController,
    AdminBillingController,
    AdminAnalyticsController,
    AdminFeatureFlagsController,
    AdminMorphologyController,
    AdminFeedbackController,
    AdminTagsController,
    AdminPhrasebookController,
    AdminDashboardController,
  ],
  providers: [
    AdminService,
    AdminTextService,
    AdminTagsService,
    AdminTokenService,
    AdminUnknownWordsService,
    AdminUsersService,
    UserAnalyticsService,
    AdminBillingService,
    AdminAnalyticsService,
    AdminFeatureFlagsService,
    AdminMorphologyService,
    AdminFeedbackService,
    AdminPhrasebookService,
    AdminDashboardService,
    PrismaService,
  ],
})
export class AdminModule {}
