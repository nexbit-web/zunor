-- AlterTable
ALTER TABLE "User" ADD COLUMN     "district" TEXT;

-- AlterTable
ALTER TABLE "MasterProfile" ADD COLUMN     "travelRadiusKm" INTEGER;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "district" TEXT;

-- AlterTable
ALTER TABLE "DispatchEvent" ADD COLUMN     "distanceKm" DOUBLE PRECISION;
