// Українська плюралізація для числівників: pluralUk(3, 'вікно', 'вікна', 'вікон')
// → 'вікна'. Враховує 11–14 (завжди третя форма).
export function pluralUk(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  const mod100 = Math.abs(n) % 100
  if (mod100 >= 11 && mod100 <= 14) return many
  const mod10 = mod100 % 10
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}
