-- CreateTable
CREATE TABLE "DispatchEvent" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "wave" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "DispatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DispatchEvent_jobId_idx" ON "DispatchEvent"("jobId");

-- CreateIndex
CREATE INDEX "DispatchEvent_masterId_idx" ON "DispatchEvent"("masterId");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchEvent_jobId_masterId_key" ON "DispatchEvent"("jobId", "masterId");
