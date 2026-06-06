-- CreateEnum
CREATE TYPE "UserTextType" AS ENUM ('ORIGINAL', 'EXTERNAL');

-- CreateTable
CREATE TABLE "user_text" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "language" "Language" NOT NULL DEFAULT 'CHE',
    "author" TEXT,
    "sourceUrl" TEXT,
    "type" "UserTextType" NOT NULL DEFAULT 'EXTERNAL',
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_text_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_text_userId_idx" ON "user_text"("userId");

-- CreateIndex
CREATE INDEX "user_text_userId_type_idx" ON "user_text"("userId", "type");

-- AddForeignKey
ALTER TABLE "user_text" ADD CONSTRAINT "user_text_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
