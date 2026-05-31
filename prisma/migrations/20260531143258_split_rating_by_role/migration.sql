/*
  Warnings:

  - You are about to drop the column `avgRating` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `reviewsCount` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "avgRating",
DROP COLUMN "reviewsCount",
ADD COLUMN     "avgRatingAsClient" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "avgRatingAsMaster" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "reviewsCountAsClient" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reviewsCountAsMaster" INTEGER NOT NULL DEFAULT 0;
