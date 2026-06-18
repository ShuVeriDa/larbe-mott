-- CreateTable
CREATE TABLE IF NOT EXISTS "spelling_entries" (
    "id" TEXT NOT NULL,
    "wrongForm" TEXT NOT NULL,
    "correctForm" TEXT NOT NULL,
    "comment" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spelling_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "spelling_entries_wrongForm_key" ON "spelling_entries"("wrongForm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "spelling_entries_wrongForm_idx" ON "spelling_entries"("wrongForm");

-- AddForeignKey
ALTER TABLE "spelling_entries" ADD CONSTRAINT "spelling_entries_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
