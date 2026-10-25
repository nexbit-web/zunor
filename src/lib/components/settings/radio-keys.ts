/**
 * Клавіатура радіогрупи за APG: стрілки одразу ПЕРЕМИКАЮТЬ і переносять
 * фокус, Home/End — на краї, рух по колу. Повертає індекс, на який треба
 * перейти, або null, якщо клавіша не наша (Tab, літери) — тоді подію не
 * чіпаємо.
 *
 * Спільна для вибору теми й акцентного кольору: дві копії одного switch
 * рано чи пізно розійшлися б у тому, куди веде стрілка з краю.
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
