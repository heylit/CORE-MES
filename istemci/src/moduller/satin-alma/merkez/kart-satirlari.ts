import { useEffect, useState } from 'react';

// Malzemeler üst kattadır (ADR 0006); satırları kuran işlev uygulama açılırken main.tsx'ten verilir.
export interface KartKaydiKisaltmasi {
  tur: string; g: Record<string, unknown>; com: { ad: string | null; kod: string | null; birim: string | null; sertifika: string[] };
}
type SatirKaynagi = (k: KartKaydiKisaltmasi) => Promise<KartSatiri[]>;
let kaynak: SatirKaynagi | null = null;
export const kartSatiriKaynagiKur = (f: SatirKaynagi): void => { kaynak = f; };

// 3706-2: hizmet, sarf ve demirbaş kartının föy satırları. Satırları Malzemeler modülü kurar (parça ilk kullanımda yüklenir); burada
// kart başına bir kez hesaplanır, hazır olunca dinleyenler (ekran ve taşıyıcı) haberdar edilir. Hazır değilken liste boştur.
export type KartSatiri = { ad: string; deger: string };
const ONBELLEK = new Map<string, readonly KartSatiri[]>();
const BEKLEYEN = new Set<string>();
const DINLEYENLER = new Set<() => void>();
const anahtar = (k: KartKaydiKisaltmasi): string => JSON.stringify(k);

function iste(k: KartKaydiKisaltmasi): Promise<void> {
  const a = anahtar(k);
  if (ONBELLEK.has(a) || BEKLEYEN.has(a)) return Promise.resolve();
  BEKLEYEN.add(a);
  return (kaynak === null ? Promise.resolve([] as KartSatiri[]) : kaynak(k)).catch(() => [] as KartSatiri[]).then((s) => {
    ONBELLEK.set(a, s); BEKLEYEN.delete(a);
    DINLEYENLER.forEach((f) => { f(); });
  });
}
export const kartSatirlari = (k: KartKaydiKisaltmasi | undefined): readonly KartSatiri[] => {
  if (k === undefined) return [];
  const s = ONBELLEK.get(anahtar(k));
  if (s === undefined) void iste(k);
  return s ?? [];
};
/** Yükleme sırasında: bu kartların satırları hazır olana dek beklenir (ilk çizim eksiksiz olsun). */
export const kartSatirlariniHazirla = async (kartlar: readonly (KartKaydiKisaltmasi | undefined)[]): Promise<void> => {
  await Promise.all(kartlar.flatMap((k) => (k === undefined ? [] : [iste(k)])));
};
export const kartSatirlariDinle = (f: () => void): (() => void) => { DINLEYENLER.add(f); return () => { DINLEYENLER.delete(f); }; };

/** Kart satırları hazır olunca yeniden çizilir. */
export function useKartSatirlari(k: KartKaydiKisaltmasi | undefined): readonly KartSatiri[] {
  const [, yaz] = useState(0);
  useEffect(() => kartSatirlariDinle(() => { yaz((n) => n + 1); }), []);
  return kartSatirlari(k);
}

/** Sunucunun kart ayrıntısına kartın türe özel satırlarını ekler (aynı adlı satır iki kez yazılmaz). */
export function ayrintiyiBirlestir(ayrinti: readonly KartSatiri[], k: KartKaydiKisaltmasi | undefined): KartSatiri[] {
  const var_ = new Set(ayrinti.map((x) => x.ad.toLocaleLowerCase('tr-TR')));
  return [...ayrinti, ...kartSatirlari(k).filter((x) => !var_.has(x.ad.toLocaleLowerCase('tr-TR')))];
}
