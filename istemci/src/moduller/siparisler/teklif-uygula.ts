import type { SiparisAyrintisi, TeklifAyrintiCevabi } from '#paylasilan/sozlesme/siparisler.ts';

// 3637: "Siparişe uygula" penceresinin karşılaştırması. Eşleme sunucudakiyle aynıdır (sıra ve malzeme); sunucu yine denetler.
// Tutarlar sunucudan gelir: sipariş toplamı siparişin, yeni toplam sürümün alanıdır; burada hesaplanmaz.
export interface UygulamaSatiri { sira: number; tanim: string; eski: string | null; yeni: string | null; degisti: boolean }
export interface UygulamaFarki {
  satirlar: UygulamaSatiri[];
  // Siparişin bir kalemi teklif satırıyla eşleşmiyorsa sunucu uygulamayı reddeder; ekran önceden söyler.
  eslesmeyen: boolean;
  kdv: { eski: string; yeni: string } | null;
  odeme: { eski: string | null; yeni: string } | null;
  // Termin siparişe geçmez; sürümde farklı bir termin varsa ayrıca söylenir.
  terminFarki: { surum: string; siparis: string } | null;
  toplam: { eski: string | null; yeni: string | null };
  genel: { eski: string | null; yeni: string | null } | null;
}

const sayiAyni = (a: string | null, b: string | null): boolean => (a === null || b === null ? a === b : Number(a) === Number(b));

export function uygulamaFarki(teklif: TeklifAyrintiCevabi, surumNo: number, siparis: SiparisAyrintisi): UygulamaFarki | null {
  const surum = teklif.surumler.find((s) => s.surumNo === surumNo);
  if (surum === undefined) return null;
  const fiyat = new Map(surum.fiyatlar.map((f) => [f.satirId, f.iskontoluFiyat]));
  let eslesmeyen = teklif.satirlar.length !== siparis.satirlar.length;
  const satirlar = siparis.satirlar.map((k): UygulamaSatiri => {
    const t = teklif.satirlar.find((x) => x.sira === k.sira && x.malzemeNo === k.malzemeNo);
    const yeni = t === undefined ? null : (fiyat.get(t.id) ?? null);
    if (yeni === null) eslesmeyen = true;
    return { sira: k.sira, tanim: t?.tanim ?? k.malzemeAdi ?? `Kalem ${k.sira}`, eski: k.birimFiyat, yeni, degisti: !sayiAyni(k.birimFiyat, yeni) };
  });
  const kdv = surum.kdvOrani !== null && !sayiAyni(surum.kdvOrani, siparis.kdvOrani) ? { eski: siparis.kdvOrani, yeni: surum.kdvOrani } : null;
  const odeme = surum.odemeKosulu !== null && surum.odemeKosulu !== siparis.odemeKosulu ? { eski: siparis.odemeKosulu, yeni: surum.odemeKosulu } : null;
  const terminFarki = surum.terminTarihi !== null && surum.terminTarihi !== siparis.termin ? { surum: surum.terminTarihi, siparis: siparis.termin } : null;
  return {
    satirlar, eslesmeyen, kdv, odeme, terminFarki,
    toplam: { eski: siparis.araToplam, yeni: surum.toplam },
    genel: surum.genelToplam === null ? null : { eski: siparis.genelToplam, yeni: surum.genelToplam },
  };
}

// Değişen bir şey yoksa sunucu "Değişiklik yok" der; ekran düğmeyi kapatır.
export const uygulamaDegisiklikVar = (f: UygulamaFarki): boolean => f.satirlar.some((s) => s.degisti) || f.kdv !== null || f.odeme !== null;
