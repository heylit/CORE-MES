import type { KomutTanimi } from './kaynak-komutlari.ts';

// Plan ve Stok komutları (kart #1186): prototipin eylemi sahibi modülün VAR OLAN ucuna gider; kural, yetki ve çakışma sahibindedir.
// Tablo zod taşımaz (kaynak-komutlari.ts ile aynı neden); sunucu testi aynı tabloyla sahibin ucunu dener.
export const PLAN_STOK_KOMUTLARI: Readonly<Record<string, KomutTanimi>> = {
  // Plan: prototipin hesapladığı kuyruk sırası, atama ve dondurma yalnız kişinin taslağına yazılır (`taslak` verilmezse yeni taslak açılır).
  // Ayar `plan-ayar` ile ayrı yazılır; canlıya alma yalnız taslağın onayıyla (Planlama stüdyosu). `planSurumu`: ekranın
  // okuduğu canlı plan sürümü; arada başkası canlıya aldıysa plan modülü 409 döner (eşzamanlı planlama koruması). Terminal sırayı canlı plandan okur.
  'plan-yaz': { yol: '/plan/kuyruklari-yaz', alanlar: ['kuyruklar', 'planSurumu', 'taslak'], tekrarKorumali: true },
  // Plan ayarı yalnız plan modülünün ayar ucundan yazılır, kişiye yeni açılan taslağa; canlı ayar taslak canlıya alınınca değişir.
  'plan-ayar': { yol: '/plan/ayar', alanlar: ['ayar'], sabit: { taslak: null }, tekrarKorumali: true },
  // Plan öncelik ayarları bütün siparişlerin sırasını değiştirir, plan.bedel-ayari ister; 148 a: kişiye açılan yeni taslağa yazılır, canlıya
  // taslağın onayıyla geçer. Öncelik çarpanları (195 a) aynı uçtan gider; aralık ve yetki denetimi plan modülündedir.
  'plan-bedel-ayari': {
    yol: '/plan/bedel-ayari',
    alanlar: [
      'tabanBedelSaat', 'finansmanOraniGun', 'karRiskiOraniGun', 'yuksekEsigi', 'dusukEsigi',
      'yuksekCarpani', 'normalCarpani', 'dusukCarpani',
    ],
    sabit: { taslak: null },
    tekrarKorumali: true,
  },
  // Stok: bitmiş emrin kalan sarfı ve çıktısı (prototipin "emri tamamla"sı). `:id` üretim emrinin sayı kimliğidir.
  'stok-emir-tamamla': { yol: '/stok/uretim-emirleri/:id/tamamla', parametre: ['id'], alanlar: ['miktar', 'aciklama'], tekrarKorumali: true },
  // Stok: emrin çıktısından bir kısmının üretim alanına girişi.
  'stok-uretim-girisi': { yol: '/stok/uretim-girisi', alanlar: ['uretimEmriId', 'malzemeId', 'miktar', 'konumId'], tekrarKorumali: true },
  // Stok: konumdaki sayım düzeltmesi (prototipin "eldeki stok" elle değişikliği).
  'stok-sayim': { yol: '/stok/sayim', alanlar: ['konumId', 'satirlar'], tekrarKorumali: true },
};
