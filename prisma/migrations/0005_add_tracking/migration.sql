-- CreateTable
CREATE TABLE "tracking_event" (
    "id" BIGSERIAL NOT NULL,
    "visitorId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "path" TEXT,
    "referrer" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "country" TEXT,
    "city" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_daily_stats" (
    "date" TIMESTAMP(3) NOT NULL,
    "uniqueVisitors" INTEGER NOT NULL,
    "sessions" INTEGER NOT NULL,
    "pageviews" INTEGER NOT NULL,
    "totalEvents" INTEGER NOT NULL,
    "avgSessionSec" INTEGER NOT NULL,
    "bounceRate" DOUBLE PRECISION NOT NULL,
    "topPaths" JSONB NOT NULL,
    "topReferrers" JSONB NOT NULL,
    "topCountries" JSONB NOT NULL,
    "topCities" JSONB NOT NULL,
    "topEventTypes" JSONB NOT NULL,
    "deviceBreakdown" JSONB NOT NULL,
    "browserBreakdown" JSONB NOT NULL,
    "osBreakdown" JSONB NOT NULL,

    CONSTRAINT "tracking_daily_stats_pkey" PRIMARY KEY ("date")
);

-- CreateIndex
CREATE INDEX "tracking_event_createdAt_idx" ON "tracking_event"("createdAt");

-- CreateIndex
CREATE INDEX "tracking_event_visitorId_createdAt_idx" ON "tracking_event"("visitorId", "createdAt");

-- CreateIndex
CREATE INDEX "tracking_event_eventType_createdAt_idx" ON "tracking_event"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "tracking_event_path_createdAt_idx" ON "tracking_event"("path", "createdAt");
