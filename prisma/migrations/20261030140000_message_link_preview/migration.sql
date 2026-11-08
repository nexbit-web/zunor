-- Картка посилання в повідомленні чату ($lib/server/link-preview).
-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "linkPreview" JSONB;
