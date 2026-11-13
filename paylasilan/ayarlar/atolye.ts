import type { AyarTanimi } from '../ayar-tanimi.ts';
import { KROKI_SAYDAMLIGI, RAF_KODLAMA_ADI, RAF_KODLAMALARI, RAF_KODLAMASI_VARSAYILAN } from '../sozlesme/atolye.ts';

// 2122-2 b: kroki saydamlığı herkes için tek değer (fabrika ve bütün bölümler); her açılışta yeniden ayarlanmaz.
// Değiştiren haritayı düzenleyendir (2122-5 a): Fabrika Haritası düzenleyicisinden, kroki hizalamasıyla aynı yetkiyle.

export const ATOLYE_AYARLARI = {
  'atolye.kroki-saydamligi': {
    modul: 'atolye',
    tur: 'sayi',
    varsayilan: KROKI_SAYDAMLIGI.varsayilan,
    enAz: KROKI_SAYDAMLIGI.enAz,
    enCok: KROKI_SAYDAMLIGI.enCok,
    ondalik: 0,
    baslik: 'Fabrika Haritası: kroki saydamlığı (%)',
    aciklama: 'Krokinin plan altında görünme oranı; fabrikada ve bütün bölümlerde aynı. Haritayı düzenleyen düzenleyicideki kaydırıcıyla da değiştirir.',
  },
  // 3168 a, 3171 a: bütün raflarda tek kodlama; eski düzen seçilebilir kalır. Değişince bütün göz ve stok konumu kodları aynı
  // kayıtta değişir ve etiket penceresi açılır; bu yüzden genel ayar ucundan değil, Stok > Ayarlar'daki komuttan değişir.
  'atolye.raf-kodlama': {
    modul: 'atolye',
    tur: 'secim',
    varsayilan: RAF_KODLAMASI_VARSAYILAN,
    secenekler: RAF_KODLAMALARI.map((deger) => ({ deger, etiket: RAF_KODLAMA_ADI[deger] })),
    baslik: 'Raf kodlama',
    aciklama: 'Raf gözlerinin kodu. Değişince bütün gözlerin kodu değişir; etiketler yeniden basılır.',
    degistirenEkran: 'Stok > Ayarlar',
  },
} as const satisfies Record<string, AyarTanimi>;
