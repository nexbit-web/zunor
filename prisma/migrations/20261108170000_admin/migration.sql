-- Адмінка /admin: другий фактор співробітників і журнал дій.
--
-- Секрет TOTP лежить зашифрованим; журнал лише дописується (співробітника
-- з записами в журналі видалити з бази не можна — RESTRICT, і це навмисно:
-- акаунти в Zunor знеособлюються, а не видаляються). RLS — у цій же
-- міграції (AGENTS.md, розділ «Prisma»).

-- CreateTable
CREATE TABLE "StaffTwoFactor" (
    "userId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3),
    "lastStep" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffTwoFactor_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AdminAction" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "details" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAction_createdAt_idx" ON "AdminAction"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAction_actorId_createdAt_idx" ON "AdminAction"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAction_targetType_targetId_idx" ON "AdminAction"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "StaffTwoFactor" ADD CONSTRAINT "StaffTwoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAction" ADD CONSTRAINT "AdminAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS
ALTER TABLE "StaffTwoFactor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminAction" ENABLE ROW LEVEL SECURITY;
