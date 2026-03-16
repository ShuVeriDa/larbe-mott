import { Module } from "@nestjs/common";
import { AuthModule } from "src/auth/auth.module";
import { DictionaryModule } from "src/markup-engine/dictionary/dictionary.module";
import { TokenizerModule } from "src/markup-engine/tokenizer/tokenizer.module";
import { PrismaService } from "src/prisma.service";
import { ProgressModule } from "src/progress/progress.module";
import { TextModule } from "src/text/text.module";
import { TokenModule } from "src/token/token.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { AdminDictionaryController } from "./dictionary/admin-dictionary.controller";
import { AdminTextService } from "./text/admin-text.service";
import { AdminTextsController } from "./text/admin-texts.controller";
import { AdminTokensController } from "./token/admin-tokens.controller";
import { AdminTokenService } from "./token/admin-tokens.service";
import { AdminUnknownWordsController } from "./unknown-words/admin-unknown-words.controller";
import { AdminUnknownWordsService } from "./unknown-words/admin-unknown-words.service";
import { AdminUsersController } from "./users/admin-users.controller";
import { AdminUsersService } from "./users/admin-users.service";

@Module({
  imports: [
    AuthModule,
    TextModule,
    TokenModule,
    TokenizerModule,
    ProgressModule,
    DictionaryModule,
  ],
  controllers: [
    AdminController,
    AdminTextsController,
    AdminTokensController,
    AdminDictionaryController,
    AdminUnknownWordsController,
    AdminUsersController,
  ],
  providers: [
    AdminService,
    AdminTextService,
    AdminTokenService,
    AdminUnknownWordsService,
    AdminUsersService,
    PrismaService,
  ],
})
export class AdminModule {}
