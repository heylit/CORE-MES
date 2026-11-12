import type { TeslimKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';

// Teslim al panelinin açılış istasyonu: terminal odağı, kişinin bulunduğu istasyon, son seçim, gelen teslimin istasyonu, tek istasyon.
// 3085 (B7): birden çok istasyon varken ilki kendiliğinden seçilmez; seçilmemişse panel önce konum ister.
export function teslimAlIstasyonu(kutu: TeslimKutusuCevabi, odakIstasyonId: number | null, son: number | null): number | null {
  const kapsamda = (id: number | null | undefined): id is number => id != null && kutu.istasyonlar.some((i) => i.id === id);
  if (odakIstasyonId !== null) return odakIstasyonId;
  if (kutu.buradakiIstasyonId !== null) return kutu.buradakiIstasyonId;
  if (kapsamda(son)) return son;
  const gelen = kutu.gelenler.find((t) => kapsamda(t.hedef.istasyonId))?.hedef.istasyonId;
  return gelen ?? (kutu.istasyonlar.length === 1 ? kutu.istasyonlar[0]!.id : null);
}
