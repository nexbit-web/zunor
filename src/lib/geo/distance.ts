// Відстань між двома точками на карті. Чисте ядро: без БД і мережі.
//
// Шестикутна сітка на кшталт Uber (H3) тут навмисно не потрібна: вона
// розвʼязує задачу мільйонів машин у русі. У нас диспетчер і так тримає в
// памʼяті до 500 кандидатів на заявку, і порахувати відстань до кожного
// формулою — дешевше за будь-який індекс.

export interface GeoPoint {
  lat: number
  lng: number
}

const EARTH_RADIUS_KM = 6371

const rad = (deg: number) => (deg * Math.PI) / 180

/**
 * Відстань по прямій (формула гаверсинуса), км. По дорогах виходить
 * більше, але для «хто ближче» порядок той самий — а саме він і потрібен.
 */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}
