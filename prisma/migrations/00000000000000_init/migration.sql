-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DictionarySource" AS ENUM ('ADMIN', 'IMPORT', 'ONLINE', 'CACHE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('LEARNER', 'SUPPORT', 'CONTENT', 'LINGUIST', 'ADMIN', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "PermissionCode" AS ENUM ('CAN_EDIT_TEXTS', 'CAN_EDIT_DICTIONARY', 'CAN_EDIT_MORPHOLOGY', 'CAN_MANAGE_USERS', 'CAN_MANAGE_BILLING', 'CAN_VIEW_ANALYTICS', 'CAN_VIEW_LOGS', 'CAN_MANAGE_FEATURE_FLAGS');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('CHE', 'RU');

-- CreateEnum
CREATE TYPE "Level" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

-- CreateEnum
CREATE TYPE "WordStatus" AS ENUM ('NEW', 'LEARNING', 'KNOWN');

-- CreateEnum
CREATE TYPE "TokenStatus" AS ENUM ('ANALYZED', 'AMBIGUOUS', 'NOT_FOUND');

-- CreateEnum
CREATE TYPE "AnalysisSource" AS ENUM ('ADMIN', 'CACHE', 'ONLINE', 'MORPHOLOGY');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'FROZEN', 'DELETED');

-- CreateEnum
CREATE TYPE "UserEventType" AS ENUM ('START_SESSION', 'OPEN_TEXT', 'CLICK_WORD', 'ADD_TO_DICTIONARY', 'FAIL_LOOKUP');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "hashedRefreshToken" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "phone" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "language" "Language" DEFAULT 'CHE',
    "level" "Level" DEFAULT 'A1',
    "lastActiveAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "signupAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "name" "RoleName" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" TEXT NOT NULL,
    "code" "PermissionCode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_role_assignment" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,

    CONSTRAINT "user_role_assignment_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "user_dictionary_folder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_dictionary_folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_dictionary_entry" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "normalized" TEXT,
    "translation" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "learningLevel" "WordStatus" NOT NULL DEFAULT 'NEW',
    "repetitionCount" INTEGER NOT NULL DEFAULT 0,
    "folderId" TEXT,
    "lemmaId" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "user_dictionary_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_entry" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "rawWord" TEXT NOT NULL,
    "rawWordAlt" TEXT,
    "rawTranslate" TEXT NOT NULL,
    "notes" TEXT,
    "source" "DictionarySource",
    "createdById" TEXT,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dictionary_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_cache" (
    "id" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "lemmaId" TEXT,
    "translation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dictionary_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "headword" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "lemmaId" TEXT,

    CONSTRAINT "headword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lemma" (
    "id" TEXT NOT NULL,
    "baseForm" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "partOfSpeech" TEXT,
    "frequency" INTEGER,

    CONSTRAINT "lemma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "morph_form" (
    "id" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "grammarTag" TEXT,
    "lemmaId" TEXT NOT NULL,
    "entryId" TEXT,

    CONSTRAINT "morph_form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sense" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "definition" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "sense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "example" (
    "id" TEXT NOT NULL,
    "senseId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "translation" TEXT,

    CONSTRAINT "example_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unknown_word" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "seenCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unknown_word_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_event" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "UserEventType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "text" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "level" "Level",
    "language" "Language" NOT NULL,
    "author" TEXT NOT NULL,
    "source" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "text_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "text_page" (
    "id" TEXT NOT NULL,
    "textId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "contentRich" JSONB NOT NULL,
    "contentRaw" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "text_page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "text_processing_version" (
    "id" TEXT NOT NULL,
    "textId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "text_processing_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "text_token" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "pageId" TEXT,
    "position" INTEGER NOT NULL,
    "original" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "startOffset" INTEGER,
    "endOffset" INTEGER,
    "status" "TokenStatus" NOT NULL DEFAULT 'ANALYZED',
    "vocabId" TEXT,

    CONSTRAINT "text_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "text_vocabulary" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "lemmaId" TEXT,
    "translation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "text_vocabulary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_analysis" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "lemmaId" TEXT,
    "source" "AnalysisSource" NOT NULL,
    "probability" DOUBLE PRECISION,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "token_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_word_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lemmaId" TEXT NOT NULL,
    "status" "WordStatus" NOT NULL DEFAULT 'NEW',
    "seenCount" INTEGER NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "lastSeen" TIMESTAMP(3),
    "nextReview" TIMESTAMP(3),
    "easeFactor" DOUBLE PRECISION,
    "interval" INTEGER,

    CONSTRAINT "user_word_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_text_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "textId" TEXT NOT NULL,
    "progressPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastOpened" TIMESTAMP(3),

    CONSTRAINT "user_text_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_language_idx" ON "users"("language");

-- CreateIndex
CREATE INDEX "users_level_idx" ON "users"("level");

-- CreateIndex
CREATE UNIQUE INDEX "role_name_key" ON "role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permission_code_key" ON "permission"("code");

-- CreateIndex
CREATE INDEX "user_role_assignment_roleId_idx" ON "user_role_assignment"("roleId");

-- CreateIndex
CREATE INDEX "user_dictionary_folder_userId_idx" ON "user_dictionary_folder"("userId");

-- CreateIndex
CREATE INDEX "user_dictionary_entry_userId_idx" ON "user_dictionary_entry"("userId");

-- CreateIndex
CREATE INDEX "user_dictionary_entry_folderId_idx" ON "user_dictionary_entry"("folderId");

-- CreateIndex
CREATE INDEX "user_dictionary_entry_learningLevel_idx" ON "user_dictionary_entry"("learningLevel");

-- CreateIndex
CREATE UNIQUE INDEX "user_dictionary_entry_userId_normalized_key" ON "user_dictionary_entry"("userId", "normalized");

-- CreateIndex
CREATE INDEX "dictionary_entry_rawWord_idx" ON "dictionary_entry"("rawWord");

-- CreateIndex
CREATE INDEX "dictionary_entry_createdById_idx" ON "dictionary_entry"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_cache_normalized_key" ON "dictionary_cache"("normalized");

-- CreateIndex
CREATE INDEX "dictionary_cache_normalized_idx" ON "dictionary_cache"("normalized");

-- CreateIndex
CREATE INDEX "headword_normalized_idx" ON "headword"("normalized");

-- CreateIndex
CREATE INDEX "lemma_normalized_idx" ON "lemma"("normalized");

-- CreateIndex
CREATE INDEX "lemma_language_normalized_idx" ON "lemma"("language", "normalized");

-- CreateIndex
CREATE UNIQUE INDEX "lemma_normalized_language_key" ON "lemma"("normalized", "language");

-- CreateIndex
CREATE INDEX "morph_form_normalized_idx" ON "morph_form"("normalized");

-- CreateIndex
CREATE UNIQUE INDEX "morph_form_normalized_lemmaId_key" ON "morph_form"("normalized", "lemmaId");

-- CreateIndex
CREATE UNIQUE INDEX "unknown_word_normalized_key" ON "unknown_word"("normalized");

-- CreateIndex
CREATE INDEX "user_event_userId_idx" ON "user_event"("userId");

-- CreateIndex
CREATE INDEX "user_event_type_idx" ON "user_event"("type");

-- CreateIndex
CREATE INDEX "text_publishedAt_idx" ON "text"("publishedAt");

-- CreateIndex
CREATE INDEX "text_page_textId_pageNumber_idx" ON "text_page"("textId", "pageNumber");

-- CreateIndex
CREATE UNIQUE INDEX "text_processing_version_textId_version_key" ON "text_processing_version"("textId", "version");

-- CreateIndex
CREATE INDEX "text_token_normalized_idx" ON "text_token"("normalized");

-- CreateIndex
CREATE INDEX "text_token_versionId_position_idx" ON "text_token"("versionId", "position");

-- CreateIndex
CREATE INDEX "text_token_pageId_idx" ON "text_token"("pageId");

-- CreateIndex
CREATE INDEX "text_token_vocabId_idx" ON "text_token"("vocabId");

-- CreateIndex
CREATE INDEX "text_vocabulary_normalized_idx" ON "text_vocabulary"("normalized");

-- CreateIndex
CREATE INDEX "text_vocabulary_versionId_idx" ON "text_vocabulary"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "text_vocabulary_versionId_normalized_key" ON "text_vocabulary"("versionId", "normalized");

-- CreateIndex
CREATE INDEX "token_analysis_lemmaId_idx" ON "token_analysis"("lemmaId");

-- CreateIndex
CREATE INDEX "token_analysis_tokenId_idx" ON "token_analysis"("tokenId");

-- CreateIndex
CREATE INDEX "user_word_progress_userId_idx" ON "user_word_progress"("userId");

-- CreateIndex
CREATE INDEX "user_word_progress_lemmaId_idx" ON "user_word_progress"("lemmaId");

-- CreateIndex
CREATE UNIQUE INDEX "user_word_progress_userId_lemmaId_key" ON "user_word_progress"("userId", "lemmaId");

-- CreateIndex
CREATE INDEX "user_text_progress_userId_idx" ON "user_text_progress"("userId");

-- CreateIndex
CREATE INDEX "user_text_progress_textId_idx" ON "user_text_progress"("textId");

-- CreateIndex
CREATE UNIQUE INDEX "user_text_progress_userId_textId_key" ON "user_text_progress"("userId", "textId");

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignment" ADD CONSTRAINT "user_role_assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignment" ADD CONSTRAINT "user_role_assignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_dictionary_folder" ADD CONSTRAINT "user_dictionary_folder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_dictionary_entry" ADD CONSTRAINT "user_dictionary_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_dictionary_entry" ADD CONSTRAINT "user_dictionary_entry_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "user_dictionary_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_dictionary_entry" ADD CONSTRAINT "user_dictionary_entry_lemmaId_fkey" FOREIGN KEY ("lemmaId") REFERENCES "lemma"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictionary_entry" ADD CONSTRAINT "dictionary_entry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "headword" ADD CONSTRAINT "headword_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "dictionary_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "headword" ADD CONSTRAINT "headword_lemmaId_fkey" FOREIGN KEY ("lemmaId") REFERENCES "lemma"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "morph_form" ADD CONSTRAINT "morph_form_lemmaId_fkey" FOREIGN KEY ("lemmaId") REFERENCES "lemma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "morph_form" ADD CONSTRAINT "morph_form_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "dictionary_entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sense" ADD CONSTRAINT "sense_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "dictionary_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "example" ADD CONSTRAINT "example_senseId_fkey" FOREIGN KEY ("senseId") REFERENCES "sense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_event" ADD CONSTRAINT "user_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text" ADD CONSTRAINT "text_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_page" ADD CONSTRAINT "text_page_textId_fkey" FOREIGN KEY ("textId") REFERENCES "text"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_processing_version" ADD CONSTRAINT "text_processing_version_textId_fkey" FOREIGN KEY ("textId") REFERENCES "text"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_token" ADD CONSTRAINT "text_token_vocabId_fkey" FOREIGN KEY ("vocabId") REFERENCES "text_vocabulary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_token" ADD CONSTRAINT "text_token_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "text_processing_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_token" ADD CONSTRAINT "text_token_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "text_page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_vocabulary" ADD CONSTRAINT "text_vocabulary_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "text_processing_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_vocabulary" ADD CONSTRAINT "text_vocabulary_lemmaId_fkey" FOREIGN KEY ("lemmaId") REFERENCES "lemma"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_analysis" ADD CONSTRAINT "token_analysis_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "text_token"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_analysis" ADD CONSTRAINT "token_analysis_lemmaId_fkey" FOREIGN KEY ("lemmaId") REFERENCES "lemma"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_word_progress" ADD CONSTRAINT "user_word_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_word_progress" ADD CONSTRAINT "user_word_progress_lemmaId_fkey" FOREIGN KEY ("lemmaId") REFERENCES "lemma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_text_progress" ADD CONSTRAINT "user_text_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_text_progress" ADD CONSTRAINT "user_text_progress_textId_fkey" FOREIGN KEY ("textId") REFERENCES "text"("id") ON DELETE CASCADE ON UPDATE CASCADE;
