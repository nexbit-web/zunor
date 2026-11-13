-- Push-сповіщення в застосунок (Expo Push Service): пристрої людини.
--
-- Один токен — один пристрій (унікальний): увійшли на тому ж телефоні
-- іншим акаунтом — рядок переходить до нього. Людину видалили з бази —
-- її пристрої йдуть разом із нею.
-- RLS — у цій же міграції (AGENTS.md, розділ «Prisma»): нова таблиця
-- його сама не отримує.

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS
ALTER TABLE "PushToken" ENABLE ROW LEVEL SECURITY;
