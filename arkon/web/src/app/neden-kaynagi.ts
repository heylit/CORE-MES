/* Neden listesinin kaynağı. Sunucu kipinde neden sahibi TMI'dir: Arkon'un yerleşik kodları (D-xx, H-xx) listeye karışmaz.
   Yerel (sunucusuz) kipte kayıtlı liste yoksa yerleşik varsayılan açılır. */
export function nedenKaynagi<T>(sunucuKipi: boolean, gelen: readonly T[] | null | undefined, varsayilan: readonly T[]): T[] {
  if (gelen && gelen.length) return gelen.slice();
  return sunucuKipi ? [] : varsayilan.slice();
}

/* Yerleşik öneri kodları (D-05 gibi) TMI listesinde yoksa öneri düşer; olmayan nedene karo çizilmez. */
export function onerileriSuz<O extends { code: string }>(oneriler: readonly O[], liste: readonly { code: string }[]): O[] {
  return oneriler.filter((o) => liste.some((r) => r.code === o.code));
}
