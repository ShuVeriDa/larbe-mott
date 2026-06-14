-- CreateEnum
CREATE TYPE "ChScript" AS ENUM ('LATIN', 'ARABIC');

-- CreateTable
CREATE TABLE "text_script_version" (
    "id" TEXT NOT NULL,
    "textId" TEXT NOT NULL,
    "script" "ChScript" NOT NULL,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'IDLE',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "text_script_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "text_script_page" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "contentRich" JSONB NOT NULL,

    CONSTRAINT "text_script_page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_text_script_version" (
    "id" TEXT NOT NULL,
    "userTextId" TEXT NOT NULL,
    "script" "ChScript" NOT NULL,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'IDLE',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_text_script_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_text_script_page" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "contentRich" JSONB NOT NULL,

    CONSTRAINT "user_text_script_page_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "text_script_version_textId_script_key" ON "text_script_version"("textId", "script");

-- CreateIndex
CREATE UNIQUE INDEX "text_script_page_versionId_pageNumber_key" ON "text_script_page"("versionId", "pageNumber");

-- CreateIndex
CREATE UNIQUE INDEX "user_text_script_version_userTextId_script_key" ON "user_text_script_version"("userTextId", "script");

-- CreateIndex
CREATE UNIQUE INDEX "user_text_script_page_versionId_pageNumber_key" ON "user_text_script_page"("versionId", "pageNumber");

-- AddForeignKey
ALTER TABLE "text_script_version" ADD CONSTRAINT "text_script_version_textId_fkey" FOREIGN KEY ("textId") REFERENCES "text"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_script_page" ADD CONSTRAINT "text_script_page_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "text_script_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_text_script_version" ADD CONSTRAINT "user_text_script_version_userTextId_fkey" FOREIGN KEY ("userTextId") REFERENCES "user_text"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_text_script_page" ADD CONSTRAINT "user_text_script_page_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "user_text_script_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;
