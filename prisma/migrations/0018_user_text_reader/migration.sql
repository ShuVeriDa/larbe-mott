-- CreateTable: UserTextProcessingVersion
CREATE TABLE "user_text_processing_version" (
    "id" TEXT NOT NULL,
    "userTextId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'IDLE',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "trigger" "ProcessingTrigger" NOT NULL DEFAULT 'MANUAL',
    "useNormalization" BOOLEAN NOT NULL DEFAULT true,
    "useMorphAnalysis" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_text_processing_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable: UserTextToken
CREATE TABLE "user_text_token" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "pageIndex" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "original" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "startOffset" INTEGER,
    "endOffset" INTEGER,
    "status" "TokenStatus" NOT NULL DEFAULT 'ANALYZED',
    "vocabId" TEXT,

    CONSTRAINT "user_text_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable: UserTextVocabulary
CREATE TABLE "user_text_vocabulary" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "lemmaId" TEXT,
    "translation" TEXT,

    CONSTRAINT "user_text_vocabulary_pkey" PRIMARY KEY ("id")
);

-- CreateTable: UserTextTokenAnalysis
CREATE TABLE "user_text_token_analysis" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "lemmaId" TEXT,
    "source" "AnalysisSource" NOT NULL DEFAULT 'ADMIN',
    "probability" DOUBLE PRECISION,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_text_token_analysis_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "user_text_processing_version_userTextId_idx" ON "user_text_processing_version"("userTextId");
CREATE INDEX "user_text_processing_version_userTextId_isCurrent_idx" ON "user_text_processing_version"("userTextId", "isCurrent");
CREATE INDEX "user_text_token_versionId_idx" ON "user_text_token"("versionId");
CREATE INDEX "user_text_token_versionId_pageIndex_idx" ON "user_text_token"("versionId", "pageIndex");
CREATE INDEX "user_text_vocabulary_versionId_idx" ON "user_text_vocabulary"("versionId");
CREATE UNIQUE INDEX "user_text_vocabulary_versionId_normalized_key" ON "user_text_vocabulary"("versionId", "normalized");
CREATE INDEX "user_text_token_analysis_tokenId_idx" ON "user_text_token_analysis"("tokenId");

-- ForeignKeys
ALTER TABLE "user_text_processing_version" ADD CONSTRAINT "user_text_processing_version_userTextId_fkey" FOREIGN KEY ("userTextId") REFERENCES "user_text"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_text_processing_version" ADD CONSTRAINT "user_text_processing_version_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_text_token" ADD CONSTRAINT "user_text_token_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "user_text_processing_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_text_token" ADD CONSTRAINT "user_text_token_vocabId_fkey" FOREIGN KEY ("vocabId") REFERENCES "user_text_vocabulary"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_text_vocabulary" ADD CONSTRAINT "user_text_vocabulary_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "user_text_processing_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_text_vocabulary" ADD CONSTRAINT "user_text_vocabulary_lemmaId_fkey" FOREIGN KEY ("lemmaId") REFERENCES "lemma"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_text_token_analysis" ADD CONSTRAINT "user_text_token_analysis_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "user_text_token"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_text_token_analysis" ADD CONSTRAINT "user_text_token_analysis_lemmaId_fkey" FOREIGN KEY ("lemmaId") REFERENCES "lemma"("id") ON DELETE SET NULL ON UPDATE CASCADE;
