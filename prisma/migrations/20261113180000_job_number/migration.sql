-- Номер заявки для людей — цифрами (власник): його бачать клієнт і
-- майстер на заявці й замовленні, за ним підтримка знаходить заявку.
-- Видає база при створенні заявки (послідовність), з 100001 по порядку.
-- Наявні заявки отримують номери тут же — за часом створення.
--
-- Замовлення несе номер своєї заявки копією (jobNumber): після відмови
-- майстра заявка відкривається знову й зв'язок (selectedOrderId) зі
-- старим замовленням рветься, а номер у ньому має лишитись.
--
-- Те саме, що Prisma робить для `@default(autoincrement())` (SERIAL:
-- послідовність Job_number_seq, що належить колонці), лише з 100001 і з
-- номерами для наявних рядків. Нові колонки в наявних таблицях — RLS уже
-- ввімкнено.

-- AlterTable: Job.number
CREATE SEQUENCE "Job_number_seq";
ALTER TABLE "Job" ADD COLUMN "number" INTEGER;

UPDATE "Job" AS j
SET "number" = 100000 + s.rn
FROM (
    SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS rn
    FROM "Job"
) AS s
WHERE j."id" = s."id";

-- Наступна заявка — одразу після найбільшого номера (порожня таблиця —
-- 100001).
SELECT setval('"Job_number_seq"', COALESCE((SELECT MAX("number") FROM "Job"), 100000));

ALTER TABLE "Job" ALTER COLUMN "number" SET DEFAULT nextval('"Job_number_seq"');
ALTER TABLE "Job" ALTER COLUMN "number" SET NOT NULL;
ALTER SEQUENCE "Job_number_seq" OWNED BY "Job"."number";

-- CreateIndex
CREATE UNIQUE INDEX "Job_number_key" ON "Job"("number");

-- AlterTable: Order.jobNumber
ALTER TABLE "Order" ADD COLUMN "jobNumber" INTEGER;

-- Наявні замовлення: номер заявки за поточним зв'язком…
UPDATE "Order" AS o
SET "jobNumber" = j."number"
FROM "Job" AS j
WHERE j."selectedOrderId" = o."id";

-- …а для тих, від яких заявка вже відкрилась знову, — за подією
-- створення (payload.jobId, api/proposals/[id]/accept).
UPDATE "Order" AS o
SET "jobNumber" = j."number"
FROM "OrderEvent" AS e
JOIN "Job" AS j ON j."id" = e."payload"->>'jobId'
WHERE e."orderId" = o."id"
  AND e."type" = 'CREATED'
  AND o."jobNumber" IS NULL;

-- CreateIndex
CREATE INDEX "Order_jobNumber_idx" ON "Order"("jobNumber");
