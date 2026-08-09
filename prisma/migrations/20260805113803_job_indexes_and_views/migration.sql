-- DropIndex
DROP INDEX "Job_category_city_status_idx";

-- DropIndex
DROP INDEX "Job_clientId_idx";

-- DropIndex
DROP INDEX "Job_expiresAt_idx";

-- CreateTable
CREATE TABLE "JobView" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobView_jobId_idx" ON "JobView"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobView_jobId_viewerId_key" ON "JobView"("jobId", "viewerId");

-- CreateIndex
CREATE INDEX "Job_status_city_category_createdAt_idx" ON "Job"("status", "city", "category", "createdAt");

-- CreateIndex
CREATE INDEX "Job_clientId_createdAt_idx" ON "Job"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "Job_status_expiresAt_idx" ON "Job"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "JobView" ADD CONSTRAINT "JobView_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
