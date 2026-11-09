/**
 * Схожа відкрита заявка клієнта — тіло 409 від POST /api/jobs
 * (`$lib/server/job-duplicates`), вигляд — `jobs/duplicate-notice.svelte`.
 */
export interface DuplicateJob {
  id: string
  title: string
  /** День роботи («YYYY-MM-DD», Київ); null — категорія без дня. */
  day: string | null
}
