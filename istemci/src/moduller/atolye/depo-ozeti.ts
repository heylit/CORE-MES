import { useCallback } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { GozOzetleriCevabi } from '#paylasilan/sozlesme/stok.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { hucreAnahtari, type GozMalzemeleri } from './kurallar.ts';
import { rafGozleriOku, stokOkurMu } from './veri.ts';

// 3202 B: raf başına stoklu gözlerin malzemeleri (hücre anahtarı -> malzemeler, miktarı büyükten küçüğe). Göz kimlikleri rafın göz
// listesinden, miktar ve birim Stok'un göz özeti ucundan. Stok okuma yetkisi yoksa hiç istek atılmaz (Risk K1): okur false, raflar boş.
export interface RafOzetleri { okur: boolean; raflar: ReadonlyMap<number, ReadonlyMap<string, GozMalzemeleri>> }

async function rafOzetiOku(rafId: number): Promise<ReadonlyMap<string, GozMalzemeleri>> {
  const gozler = await rafGozleriOku(rafId);
  const malzemeler = new Map<number, GozMalzemeleri>();
  for (let i = 0; i < gozler.length; i += 500) {
    const idler = gozler.slice(i, i + 500).map((g) => g.id).join(',');
    for (const g of (await api.get<GozOzetleriCevabi>(`/stok/goz-ozetleri?gozIdler=${idler}`)).gozler) malzemeler.set(g.gozId, g.malzemeler);
  }
  return new Map(gozler.flatMap((g) => {
    const m = malzemeler.get(g.id);
    return m && m.length > 0 ? [[hucreAnahtari(g.bolme, g.kat, g.goz), m] as const] : [];
  }));
}

export function useRafOzetleri(rafIdler: readonly number[]): RafOzetleri {
  const oturum = useOturum();
  const okur = oturum.data?.islemler.some(stokOkurMu) === true;
  const anahtar = rafIdler.join(',');
  const birlestir = useCallback((sonuclar: { data?: ReadonlyMap<string, GozMalzemeleri> }[]): RafOzetleri => {
    const raflar = new Map<number, ReadonlyMap<string, GozMalzemeleri>>();
    anahtar.split(',').forEach((id, i) => { const v = sonuclar[i]?.data; if (v) raflar.set(Number(id), v); });
    return { okur, raflar };
  }, [anahtar, okur]);
  return useQueries({
    queries: rafIdler.map((id) => ({ queryKey: anahtarlar.rafOzeti(id), queryFn: () => rafOzetiOku(id), enabled: okur })),
    combine: birlestir,
  });
}
