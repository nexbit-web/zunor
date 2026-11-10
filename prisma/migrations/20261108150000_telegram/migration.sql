-- Telegram-бот для сповіщень: чат із ботом, куди дублюються сповіщення.
--
-- Унікальний: один чат Telegram — один акаунт Zunor. Підключив той самий
-- Telegram до іншого акаунта — зі старого він відʼєднується.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "telegramLinkedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");
