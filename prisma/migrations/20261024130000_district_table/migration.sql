-- CreateEnum
CREATE TYPE "DistrictGroup" AS ENUM ('CITY', 'SUBURB');

-- CreateTable
CREATE TABLE "District" (
    "id" TEXT NOT NULL,
    "citySlug" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" "DistrictGroup" NOT NULL DEFAULT 'CITY',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "District_isActive_sortOrder_idx" ON "District"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "District_citySlug_slug_key" ON "District"("citySlug", "slug");

-- AddForeignKey
ALTER TABLE "District" ADD CONSTRAINT "District_citySlug_fkey" FOREIGN KEY ("citySlug") REFERENCES "City"("slug") ON DELETE CASCADE ON UPDATE CASCADE;
