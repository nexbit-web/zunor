/*
  Warnings:

  - You are about to drop the column `completedOrders` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `isActiveMaster` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `masterCategories` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `masterDescription` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `portfolioImages` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `portfolioImagesPublicIds` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `totalOrders` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `verificationRejectReason` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `verificationStatus` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `verifiedAt` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "metadataSchema" JSONB;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "metadata" JSONB,
ALTER COLUMN "description" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MasterProfile" ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "completedOrders",
DROP COLUMN "isActiveMaster",
DROP COLUMN "masterCategories",
DROP COLUMN "masterDescription",
DROP COLUMN "portfolioImages",
DROP COLUMN "portfolioImagesPublicIds",
DROP COLUMN "totalOrders",
DROP COLUMN "verificationRejectReason",
DROP COLUMN "verificationStatus",
DROP COLUMN "verifiedAt";
