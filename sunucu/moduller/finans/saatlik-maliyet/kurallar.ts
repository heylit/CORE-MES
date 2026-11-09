import type { MaliyetSatiri, SaatlikMaliyetSatiri } from '#paylasilan/sozlesme/finans.ts';

export interface Kaynak { anahtar: number; kod: string | null; ad: string; aktif: boolean }

// FNS-76 (2593): her aktif istasyon listededir; pasif kaynak yalnız maliyeti varsa görünür (kaldırılabilsin diye). Maliyeti olup
// kaynağı bulunamayan anahtar da kaybolmaz, adı "Kayıt bulunamadı" ile gelir. Sıra: aktifler önce, sonra ada göre.
export function saatlikMaliyetListesi(kaynaklar: readonly Kaynak[], maliyetler: readonly MaliyetSatiri[]): SaatlikMaliyetSatiri[] {
  const harita = new Map(maliyetler.map((m) => [m.anahtar, m]));
  const gorulen = new Set<number>();
  const satirlar: SaatlikMaliyetSatiri[] = [];
  for (const k of kaynaklar) {
    const maliyet = harita.get(k.anahtar) ?? null;
    if (!k.aktif && maliyet === null) continue;
    gorulen.add(k.anahtar);
    satirlar.push({ ...k, maliyet });
  }
  for (const m of maliyetler) if (!gorulen.has(m.anahtar)) satirlar.push({ anahtar: m.anahtar, kod: null, ad: 'Kayıt bulunamadı', aktif: false, maliyet: m });
  return satirlar.sort((a, b) => Number(b.aktif) - Number(a.aktif) || a.ad.localeCompare(b.ad, 'tr') || a.anahtar - b.anahtar);
}
