// * де діє тема: темна — налаштування кабінету, вмикається лише на
// * /dashboard/** і /admin; усе до входу завжди світле. Клас `dark` на <html>
// * ставимо ми: до першого кадру — скрипт в app.html, далі — ефект у
// * кореневому лейауті. Міняєш правило — міняй обидва місця

/** Шлях, на якому діє обрана тема (кабінет і адмінка). */
export function isThemedPath(pathname: string): boolean {
  return (
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/') ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/')
  )
}
