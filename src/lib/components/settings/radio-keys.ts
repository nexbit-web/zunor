/**
 * Клавіатура радіогрупи за APG: стрілки перемикають і переносять фокус,
 * Home/End — на краї. Повертає новий індекс або null, якщо клавіша не наша.
 */
export function nextRadioIndex(
  key: string,
  index: number,
  count: number,
): number | null {
  const last = count - 1

  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return index === last ? 0 : index + 1
    case 'ArrowLeft':
    case 'ArrowUp':
      return index === 0 ? last : index - 1
    case 'Home':
      return 0
    case 'End':
      return last
    default:
      return null
  }
}
