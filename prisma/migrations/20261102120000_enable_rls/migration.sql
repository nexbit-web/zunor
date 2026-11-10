-- RLS на всіх таблицях схеми public — запас на випадок зовнішнього доступу
-- до бази (Neon Data API, окрема роль для аналітики): без політик така
-- роль не побачить жодного рядка.
--
-- Застосунок цього не помічає: Prisma ходить роллю-ВЛАСНИКОМ таблиць, а
-- власник RLS обходить. Тому тут лише ENABLE, без FORCE — з FORCE правило
-- діяло б і на власника, і без політик Prisma отримувала б порожні списки.
--
-- Цикл, а не список таблиць: підхоплює всі, що є на момент застосування,
-- включно з _prisma_migrations. Нові таблиці з наступних міграцій RLS самі
-- не отримають — див. AGENTS.md, розділ «Prisma».
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
