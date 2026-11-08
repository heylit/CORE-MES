import type { KomutTanimi } from './kaynak-komutlari.ts';

// Stok komutları (kart #1186): prototipin eylemi sahibi modülün VAR OLAN ucuna gider; kural, yetki ve çakışma sahibindedir.
// Tablo zod taşımaz (kaynak-komutlari.ts ile aynı neden); sunucu testi aynı tabloyla sahibin ucunu dener.
export const STOK_KOMUTLARI: Readonly<Record<string, KomutTanimi>> = {
  // Stok: bitmiş emrin kalan sarfı ve çıktısı (prototipin "emri tamamla"sı). `:id` üretim emrinin sayı kimliğidir.
  'stok-emir-tamamla': { yol: '/stok/uretim-emirleri/:id/tamamla', parametre: ['id'], alanlar: ['miktar', 'aciklama'], tekrarKorumali: true },
  // Stok: emrin çıktısından bir kısmının üretim alanına girişi.
  'stok-uretim-girisi': { yol: '/stok/uretim-girisi', alanlar: ['uretimEmriId', 'malzemeId', 'miktar', 'konumId'], tekrarKorumali: true },
  // Stok: konumdaki sayım düzeltmesi (prototipin "eldeki stok" elle değişikliği).
  'stok-sayim': { yol: '/stok/sayim', alanlar: ['konumId', 'satirlar'], tekrarKorumali: true },
};
