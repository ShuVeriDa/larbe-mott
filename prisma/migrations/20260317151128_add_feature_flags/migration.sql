-- CreateTable
CREATE TABLE "feature_flag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_feature_flag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "featureFlagId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_feature_flag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_key_key" ON "feature_flag"("key");

-- CreateIndex
CREATE INDEX "feature_flag_isEnabled_idx" ON "feature_flag"("isEnabled");

-- CreateIndex
CREATE INDEX "user_feature_flag_featureFlagId_idx" ON "user_feature_flag"("featureFlagId");

-- CreateIndex
CREATE UNIQUE INDEX "user_feature_flag_userId_featureFlagId_key" ON "user_feature_flag"("userId", "featureFlagId");

-- AddForeignKey
ALTER TABLE "user_feature_flag" ADD CONSTRAINT "user_feature_flag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_feature_flag" ADD CONSTRAINT "user_feature_flag_featureFlagId_fkey" FOREIGN KEY ("featureFlagId") REFERENCES "feature_flag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
