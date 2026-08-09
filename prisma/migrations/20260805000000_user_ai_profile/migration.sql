-- Синхронізація історії міграцій із фактичною базою.
--
-- Колонку aiNote замінили на aiProfile (JSONB) прямою заливкою схеми
-- (db push), не створивши міграцію. Через це `migrate dev` бачив дрейф
-- і пропонував ПОВНИЙ РЕСЕТ бази.
--
-- У наявній базі ця зміна вже є, тому міграція позначається як applied
-- через `prisma migrate resolve --applied` і НЕ виконується.
-- Ідемпотентні IF EXISTS / IF NOT EXISTS — щоб на чистій базі (новий
-- інстанс, CI) той самий файл відпрацював коректно.

ALTER TABLE "User" DROP COLUMN IF EXISTS "aiNote";
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiProfile" JSONB;