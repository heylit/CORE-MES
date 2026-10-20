/* Elle bölünmüş iş (kart #1572): plan işi adetle parçalara böler, her parça kendi makinesinde ayrı iştir. Sunucu parça paketine
   `tmi.parca` (no, adet, toplam) yazar; bütün işin paketine `tmi.bolunmus` yazar ve o paket operatöre düşmez. */
export interface ParcaPaketi { tmi?: object | null }

const tmiAlani = (p: ParcaPaketi | null | undefined): Record<string, unknown> | null =>
  p && p.tmi && typeof p.tmi === 'object' ? (p.tmi as Record<string, unknown>) : null;

export function parcaEtiketi(p: ParcaPaketi | null | undefined): string | null {
  const parca = tmiAlani(p)?.['parca'] as { no?: unknown; adet?: unknown; toplam?: unknown } | undefined;
  if (!parca || typeof parca.no !== 'number' || typeof parca.adet !== 'number') return null;
  const toplam = typeof parca.toplam === 'number' ? `/${parca.toplam}` : '';
  return `Parça ${parca.no}${toplam} · ${parca.adet} adet`;
}

export const bolunmusMu = (p: ParcaPaketi | null | undefined): boolean => tmiAlani(p)?.['bolunmus'] === true;
