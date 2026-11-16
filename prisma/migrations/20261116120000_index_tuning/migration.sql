-- DropIndex
DROP INDEX "User_username_idx";

-- DropIndex
DROP INDEX "JobView_jobId_idx";

-- DropIndex
DROP INDEX "DispatchEvent_jobId_idx";

-- DropIndex
DROP INDEX "DispatchEvent_masterId_idx";

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "DispatchEvent_masterId_notifiedAt_idx" ON "DispatchEvent"("masterId", "notifiedAt");
