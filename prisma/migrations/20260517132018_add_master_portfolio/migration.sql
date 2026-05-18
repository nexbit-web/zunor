-- AlterTable
ALTER TABLE "MasterProfile" ADD COLUMN     "portfolioImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "portfolioImagesPublicIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
