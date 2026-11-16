// * JSON-LD для <script type="application/ld+json">. Голий JSON.stringify не
// * екранує `<`: імʼя з `</script>` розриває тег — stored XSS. U+2028/U+2029
// * будуються через fromCharCode, бо в редакторі невидимі

const LINE_SEP = String.fromCharCode(0x2028)
const PARA_SEP = String.fromCharCode(0x2029)

const ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  [LINE_SEP]: '\\u2028',
  [PARA_SEP]: '\\u2029',
}

const UNSAFE_RE = new RegExp(`[<>&${LINE_SEP}${PARA_SEP}]`, 'g')

/** JSON.stringify, безпечний для вставки всередину <script>. */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(UNSAFE_RE, (c) => ESCAPES[c] ?? c)
}
