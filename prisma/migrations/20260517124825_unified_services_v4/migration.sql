-- AlterTable
ALTER TABLE "User" ADD COLUMN     "completedOrders" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isActiveMaster" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "masterCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "masterDescription" TEXT,
ADD COLUMN     "portfolioImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "portfolioImagesPublicIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totalOrders" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verificationRejectReason" TEXT,
ADD COLUMN     "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "verifiedAt" TIMESTAMP(3);
