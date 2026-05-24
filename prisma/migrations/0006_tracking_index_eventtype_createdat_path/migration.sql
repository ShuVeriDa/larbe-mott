-- CreateIndex
CREATE INDEX "tracking_event_eventType_createdAt_path_idx" ON "tracking_event"("eventType", "createdAt", "path");
