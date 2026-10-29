// zod taşımaz: istemci bu listeleri ve kuralları değer olarak ithal eder (eslint.config.js ZODSUZ).
// Sınıf: D1 tasarım Class I (değiştirilemez), D2 tasarım Class II, P1 proses (ilk parça ister), P2 proses (ilk parça istemez).
export const SINIFLAR = ['D1', 'D2', 'P1', 'P2'] as const;
export const SINIF_ADLARI: Readonly<Record<(typeof SINIFLAR)[number], string>> = {
  D1: 'D1 Tasarım, Class I', D2: 'D2 Tasarım, Class II', P1: 'P1 Proses, FAI tetikler', P2: 'P2 Proses, FAI yok',
};
export const ACILIYETLER = ['normal', 'yuksek', 'acil'] as const;
export const ACILIYET_ADLARI: Readonly<Record<(typeof ACILIYETLER)[number], string>> = { normal: 'Normal', yuksek: 'Yüksek', acil: 'Acil' };
// Görevlerim'deki hedef süre (iş günü).
export const HEDEF_IS_GUNU: Readonly<Record<(typeof ACILIYETLER)[number], number>> = { acil: 1, yuksek: 3, normal: 5 };

// Sınıflandırma soruları; önerilen sınıfı kurallar.ts hesaplar. Yalnız süre ya da tezgah tercihi değişiyorsa talep gerekmez:
// bu planlama parametresidir ve mevcut modülde kalır (1120 a).
export const SINIFLANDIRMA_SORULARI = ['cizim', 'fff', 'proses', 'sure'] as const;
export const SINIFLANDIRMA_SORU_METINLERI: Readonly<Record<(typeof SINIFLANDIRMA_SORULARI)[number], string>> = {
  cizim: 'Çizim, model veya malzeme şartı değişiyor mu?',
  fff: 'Form, uyum veya işlev etkileniyor mu? Parça eskisinin yerine takılamaz hale geliyor mu?',
  proses: 'NC programı, proses, fason tedarikçisi veya malzeme kaynağı değişiyor mu?',
  sure: 'Değişen yalnızca süre veya tezgâh tercihi mi?',
};
export const CEVAPLAR = ['evet', 'hayir'] as const;

export const TALEP_DURUMLARI = ['gonderildi', 'analizde', 'ccb_bekliyor', 'musteri_onayi_bekliyor', 'onaylandi', 'emir_acildi', 'reddedildi'] as const;
export const TALEP_DURUM_ADLARI: Readonly<Record<(typeof TALEP_DURUMLARI)[number], string>> = {
  gonderildi: 'Gönderildi', analizde: 'Etki analizi', ccb_bekliyor: 'CCB kararı', musteri_onayi_bekliyor: 'Müşteri onayı',
  onaylandi: 'Onaylandı', emir_acildi: 'ECO açıldı', reddedildi: 'Reddedildi',
};
export const EMIR_DURUMLARI = ['acik', 'revizyon_hazirlaniyor', 'yayina_hazir', 'karar', 'uygulamada', 'dogrulama', 'kapandi'] as const;
export const EMIR_DURUM_ADLARI: Readonly<Record<(typeof EMIR_DURUMLARI)[number], string>> = {
  acik: 'Açıldı', revizyon_hazirlaniyor: 'Revizyon hazırlığı', yayina_hazir: 'Yayın onayı', karar: 'Disposition',
  uygulamada: 'Uygulama ve FAI', dogrulama: 'Doğrulama', kapandi: 'Kapandı',
};

// Geçerlilik: seri (son ürünün ilk seri numarasından), tarih (o günden sonra başlayan emirler) ya da bütün açık emirler.
export const GECERLILIK_TURLERI = ['seri', 'tarih', 'tum'] as const;

// Karar (disposition) kodları. Mod: otomatik (sistem uygular), onaylı (planlama ya da kalite onaylar), MRB (kalite karar verir).
export const KARAR_KODLARI = [
  'yeniden_olustur', 'kalanlari_gecir', 'eskiyle_tamamla', 'eskiyle_tamamla_sapma', 'rework', 'eski_yedek', 'hurda', 'beklet', 'islem_yok',
] as const;
export const KARAR_KODU_ADLARI: Readonly<Record<(typeof KARAR_KODLARI)[number], string>> = {
  yeniden_olustur: 'Yeni revizyonla yeniden oluştur', kalanlari_gecir: 'Kalanları yeni revizyona geçir',
  eskiyle_tamamla: 'Eski revizyonla tamamla', eskiyle_tamamla_sapma: 'Eski revizyon + sapma', rework: 'Rework emri aç',
  eski_yedek: 'Eski konfigürasyon yedeği', hurda: 'Hurdaya ayır', beklet: 'Karantinada beklet', islem_yok: 'İşlem yok',
};
export const KARAR_MODLARI = ['otomatik', 'onayli', 'mrb'] as const;
export const KARAR_MODU_ADLARI: Readonly<Record<(typeof KARAR_MODLARI)[number], string>> = { otomatik: 'Otomatik', onayli: 'Onaylı', mrb: 'MRB' };
// Hurda, rework, sapma ve yedek her zaman MRB kararıdır (1122 düzeltmesi: ayrı işlem).
export const MRB_KODLARI = ['eskiyle_tamamla_sapma', 'rework', 'hurda', 'eski_yedek'] as const satisfies readonly (typeof KARAR_KODLARI)[number][];
export const KARAR_HEDEFLERI = ['emir', 'stok'] as const;

// Hangi işlemin (karar-ver ya da mrb-karar) kararı verdiğini istemci ve sunucu aynı yerden okur.
export function mrbKarariMi(mod: (typeof KARAR_MODLARI)[number], kod: (typeof KARAR_KODLARI)[number]): boolean {
  return mod === 'mrb' || (MRB_KODLARI as readonly string[]).includes(kod);
}

// Soruların cevabından önerilen sınıf; istemci formu ve sunucu aynı kuralı kullanır. 'planlama': yalnız süre ya da tezgah tercihi, talep gerekmez.
// Eksik cevapta null.
type SoruCevabi = (typeof CEVAPLAR)[number] | null;
export function onerilenSinif(c: Readonly<Record<(typeof SINIFLANDIRMA_SORULARI)[number], SoruCevabi>>): (typeof SINIFLAR)[number] | 'planlama' | null {
  if (c.cizim === 'evet') return c.fff === 'evet' ? 'D1' : c.fff === 'hayir' ? 'D2' : null;
  if (c.cizim !== 'hayir') return null;
  if (c.proses === 'evet') return 'P1';
  if (c.proses !== 'hayir') return null;
  return c.sure === 'evet' ? 'planlama' : c.sure === 'hayir' ? 'P2' : null;
}

export const FAI_TURLERI = ['tam', 'kismi'] as const;
export const FAI_DURUMLARI = ['bekliyor', 'onaylandi'] as const;
// Kapanış koşulu sahibi modül bağlı değilse 'bilinmiyor' döner (Aşama 1).
export const KAPANIS_KOSULLARI = ['kararlar', 'fai', 'uyumsuz_seri', 'yeni_revizyonla_uretim'] as const;
export const KOSUL_HALLERI = ['tamam', 'eksik', 'bilinmiyor'] as const;

// Geçmiş satırı olayı; imzalı olaylar imza anlamını da taşır.
export const GECMIS_OLAYLARI = [
  'talep_gonderildi', 'siniflandirildi', 'etki_analizi', 'ccb_onay', 'ccb_ret', 'musteri_onayi', 'emir_acildi', 'taslak_acildi',
  'kalem_kaydedildi', 'yayina_gonderildi', 'geri_gonderildi', 'yayinlandi', 'karar', 'mrb_karar', 'toplu_karar', 'karar_ertelendi',
  'kararlar_tamam', 'fai_onaylandi', 'fai_tamam', 'kapandi',
] as const;
export const IMZA_ANLAMLARI = {
  ccb_onay: 'Değişikliği onaylıyorum',
  ccb_ret: 'Reddediyorum',
  musteri_onayi: 'Müşteri onay belgesini doğruladım',
  yayinlandi: 'Yayın ve geçerliliği onaylıyorum',
  karar: 'Disposition’ı onaylıyorum',
  mrb_karar: 'MRB kararını onaylıyorum',
  toplu_karar: 'Sistem önerilerini onaylıyorum',
  fai_onaylandi: 'İlk parçanın tasarıma uygunluğunu onaylıyorum',
  kapandi: 'Değişikliğin uygulandığını ve doğrulandığını onaylıyorum',
} as const satisfies Partial<Record<(typeof GECMIS_OLAYLARI)[number], string>>;

// İç olay günlüğü (1124 a): salt okunur, dışarı gönderilmez. `ilgili`, Aşama 2'de olayı işleyecek modüldür.
export const OLAY_TURLERI = [
  'talep_gonderildi', 'etki_analizi', 'musteri_onayi_istendi', 'emir_acildi', 'revizyon_yayinlandi', 'gecerlilik', 'karar_onerildi',
  'emir_karari', 'stok_karari', 'emir_karantinada', 'rework_istendi', 'sapma_acildi', 'fai_onaylandi', 'emir_kapandi',
] as const;
export const OLAY_ILGILILERI = ['uretim-emirleri', 'rota', 'cizimler', 'malzemeler', 'stok', 'plan', 'kalite-merkezi', 'sevkiyat'] as const;

// planli: açık emrin henüz başlamamış seri aralığı; başlamışsa uretimde (1143 a).
export const SERI_DURUMLARI = ['planli', 'uretimde', 'stokta', 'sahada'] as const;
export const UYUM_HALLERI = ['uyumlu', 'uyumsuz', 'sapmali', 'bilinmiyor'] as const;
export const IPLIK_KATMANLARI = ['tasarim', 'planlama', 'emir', 'uretim'] as const;
export const IPLIK_HALLERI = ['yururlukte', 'gecersiz', 'calisiyor', 'karantina', 'acik'] as const;
export const TASARIM_OTORITELERI = ['musteri', 'ic'] as const;
export const PARCA_HALLERI = ['aktif', 'yalniz_yedek'] as const;
export const STOK_HALLERI = ['serbest', 'eski_yedek', 'hurda', 'rework'] as const;

// Açık: talepte emir_acildi ve reddedildi dışı, emirde kapandi dışı.
export const LISTE_KAPSAMLARI = ['acik', 'kapali', 'tumu'] as const;
// Görevlerim'deki değişiklik hattı aşamaları.
export const HAT_ASAMALARI = ['talep', 'revizyon', 'yayin', 'karar', 'fai', 'kapanis'] as const;
// Görevlerim kapsamı (1146 b): benim, oturumdaki kişinin işlemlerine göre; ekip, bütün bekleyen işler.
export const GOREV_KAPSAMLARI = ['benim', 'ekip'] as const;
// Bekleyen adımı yapacak işlem; Sorumlu sütunu işlem adından yazılır. Talep açma bekleyen adım değildir.
export const GOREV_ISLEMLERI = [
  'degisiklik-yonetimi.siniflandir', 'degisiklik-yonetimi.ccb-karar', 'degisiklik-yonetimi.musteri-onayi', 'degisiklik-yonetimi.emir-ac',
  'degisiklik-yonetimi.revizyon-hazirla', 'degisiklik-yonetimi.yayinla', 'degisiklik-yonetimi.karar-ver', 'degisiklik-yonetimi.mrb-karar',
  'degisiklik-yonetimi.fai-onayla', 'degisiklik-yonetimi.kapat',
] as const;

export type Sinif = (typeof SINIFLAR)[number];
export type Aciliyet = (typeof ACILIYETLER)[number];
export type SiniflandirmaSorusu = (typeof SINIFLANDIRMA_SORULARI)[number];
export type Cevap = (typeof CEVAPLAR)[number];
export type TalepDurumu = (typeof TALEP_DURUMLARI)[number];
export type EmirDurumu = (typeof EMIR_DURUMLARI)[number];
export type GecerlilikTuru = (typeof GECERLILIK_TURLERI)[number];
export type KararKodu = (typeof KARAR_KODLARI)[number];
export type KararModu = (typeof KARAR_MODLARI)[number];
export type KararHedefi = (typeof KARAR_HEDEFLERI)[number];
export type FaiTuru = (typeof FAI_TURLERI)[number];
export type FaiDurumu = (typeof FAI_DURUMLARI)[number];
export type KapanisKosulu = (typeof KAPANIS_KOSULLARI)[number];
export type KosulHali = (typeof KOSUL_HALLERI)[number];
export type GecmisOlayi = (typeof GECMIS_OLAYLARI)[number];
export type OlayTuru = (typeof OLAY_TURLERI)[number];
export type OlayIlgilisi = (typeof OLAY_ILGILILERI)[number];
export type SeriDurumu = (typeof SERI_DURUMLARI)[number];
export type UyumHali = (typeof UYUM_HALLERI)[number];
export type IplikHali = (typeof IPLIK_HALLERI)[number];
export type HatAsamasi = (typeof HAT_ASAMALARI)[number];
export type GorevKapsami = (typeof GOREV_KAPSAMLARI)[number];
export type GorevIslemi = (typeof GOREV_ISLEMLERI)[number];
export type ListeKapsami = (typeof LISTE_KAPSAMLARI)[number];
export type TasarimOtoritesi = (typeof TASARIM_OTORITELERI)[number];
export type ParcaHali = (typeof PARCA_HALLERI)[number];
export type StokHali = (typeof STOK_HALLERI)[number];
