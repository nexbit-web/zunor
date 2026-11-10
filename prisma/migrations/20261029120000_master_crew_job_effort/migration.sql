-- Формат роботи майстра й обсяг заявки.
--
-- Авто й «сам / з командою» досі жили в MasterProfile.metadata (JSON).
-- Вони не залежать від категорії послуг, тож переїжджають у колонки з
-- типами; у metadata лишаються тільки вміння в межах категорії (skills).

-- CreateEnum
CREATE TYPE "CrewType" AS ENUM ('SOLO', 'TEAM', 'COMPANY');

-- AlterTable
ALTER TABLE "MasterProfile" ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "crew" "CrewType",
ADD COLUMN     "hasVehicle" BOOLEAN;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "effort" INTEGER;

-- Обсяг — лише 1–10: шкалу знають розсилка й підписи, інше число з
-- будь-якого шляху запису — помилка, а не новий рівень.
ALTER TABLE "Job" ADD CONSTRAINT "Job_effort_range" CHECK ("effort" BETWEEN 1 AND 10);

-- Перенесення відповідей. Беремо лише справжні true/false: битий JSON
-- лишається null («не відповідав»), а не перетворюється на «ні».
UPDATE "MasterProfile"
SET "hasVehicle" = ("metadata"->>'vehicle')::boolean
WHERE jsonb_typeof("metadata"->'vehicle') = 'boolean';

UPDATE "MasterProfile"
SET "crew" = (CASE WHEN ("metadata"->>'team')::boolean THEN 'TEAM' ELSE 'SOLO' END)::"CrewType"
WHERE jsonb_typeof("metadata"->'team') = 'boolean';

-- Одне джерело правди: перенесене з JSON прибираємо.
UPDATE "MasterProfile"
SET "metadata" = "metadata" - 'vehicle' - 'team'
WHERE jsonb_typeof("metadata") = 'object'
  AND ("metadata" ? 'vehicle' OR "metadata" ? 'team');
