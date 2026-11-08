-- Назва компанії — це імʼя акаунта (User.name), як імʼя в приватного майстра.
--
-- Анкета тепер спершу питає «приватний майстер чи компанія», і компанія
-- одразу вписує назву замість імені. User.name показують усюди, де видно
-- майстра (профіль, пропозиції, чат, відгуки), тож окрема колонка лише
-- дублювала б його — і дві назви рано чи пізно розійшлись би.

-- Назву, яку компанія вже вказала, переносимо в імʼя: вона й мала бути вивіскою.
UPDATE "User" AS u
SET "name" = btrim(mp."companyName")
FROM "MasterProfile" AS mp
WHERE mp."userId" = u."id"
  AND mp."crew" = 'COMPANY'
  AND length(btrim(coalesce(mp."companyName", ''))) >= 2;

-- AlterTable
ALTER TABLE "MasterProfile" DROP COLUMN "companyName";
