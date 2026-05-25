-- CreateTable
CREATE TABLE "user_deck_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lemmaId" TEXT NOT NULL,
    "deckType" "DeckType" NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_deck_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_deck_log_userId_createdAt_idx" ON "user_deck_log"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "user_deck_log_userId_idx" ON "user_deck_log"("userId");

-- AddForeignKey
ALTER TABLE "user_deck_log" ADD CONSTRAINT "user_deck_log_lemmaId_fkey" FOREIGN KEY ("lemmaId") REFERENCES "lemma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_deck_log" ADD CONSTRAINT "user_deck_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
