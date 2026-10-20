import { z } from 'zod';

// CNC Kurulum Motoru prototipi TMI içinde değiştirilmeden çalışır. Prototip bütün durumunu tarayıcının yerel deposunda tek
// anahtarla (JSON) tutar; çerçevedeki köprü bu depoyu TMI'ye bağlar: anahtar başına bir kayıt, atölyede ortak, sürüm denetimli.
// Gövde prototipin biçimidir ve TMI'de yorumlanmaz: olduğu gibi saklanır (jsonb), olduğu gibi döner.

// Kalıcı tutulan anahtarlar bu önekle başlar (prototipin anahtarı `cnc-kurulum-motoru.v1`).
export const ANAHTAR_ONEKI = 'cnc-kurulum-motoru.';
export const ANAHTAR_BICIMI = /^cnc-kurulum-motoru\.[A-Za-z0-9_.-]{1,80}$/;
// json: değer JSON metniydi, ayrıştırılmış saklanır; metin: JSON olmayan düz metin, dize olarak saklanır.
export const DEGER_BICIMLERI = ['json', 'metin'] as const;

const anahtar = z.string().regex(ANAHTAR_BICIMI, 'Geçersiz anahtar.');

export const kayitSemasi = z.object({
  anahtar: z.string(),
  bicim: z.enum(DEGER_BICIMLERI),
  deger: z.unknown(),
  surum: z.number().int(),
});

export const kayitlarCevabi = z.object({ kayitlar: z.array(kayitSemasi) });

export const kisiSemasi = z.object({ id: z.number().int(), ad: z.string() });
// hazirlikOnaylayabilir: yazma işlemi olmadan yalnız hazırlık onayları kaydedilir (sunucu öteki alanları almaz).
// takimDegistirebilir: takım değişimi ve kullanım düzeltmesi sunucuya gider (yoksa yalnız açık sekmede kalır).
export const benCevabi = z.object({ kisi: kisiSemasi, yazabilir: z.boolean(), hazirlikOnaylayabilir: z.boolean(), takimDegistirebilir: z.boolean() });

export const yazGovdesi = z.object({
  anahtar,
  bicim: z.enum(DEGER_BICIMLERI),
  deger: z.unknown().refine((d) => d !== undefined, 'Değer zorunlu.'),
  // Kayıt bu sürümde değilse yazma olmaz (null: kayıt hiç yoksa). Ortak kayıtta başkasının yazdığının üstüne yazılmaz.
  beklenenSurum: z.number().int().nullable(),
});
export const yazCevabi = z.object({ kayit: kayitSemasi });

export const silGovdesi = z.object({ anahtar, beklenenSurum: z.number().int() });
export const silCevabi = z.object({ silindi: z.boolean() });

// Kurulumda seçilen iş emri, yani emrin bir operasyonu (plan: belgeler/cnc/cnc-kurulum-plan.md, A; karar 266 a). Seçim
// prototipin durumuna değil bu anahtara yazılır: prototip değiştirilmez, Parça No alanı emirden doldurulur.
export const EMIR_ANAHTARI = `${ANAHTAR_ONEKI}emir`;

// Açık iş emri seçeneği: kurulumun ihtiyacı olan alanlar; istasyon adıyla. id iş emrinindir.
export const emirSecenegiSemasi = z.object({
  id: z.number().int(),
  uretimEmriId: z.number().int(),
  emirNo: z.string(),
  opNo: z.number().int(),
  ad: z.string(),
  parcaNo: z.string(),
  parcaAd: z.string(),
  adet: z.number().int(),
  istasyon: z.string(),
});
export const emirlerCevabi = z.object({ emirler: z.array(emirSecenegiSemasi) });

// Kurulum iş emri başınadır (kullanıcı kararları 17.10.2026 ve 266 a): iş emrinin seçimleri, parça bilgisi ve hazırlık onayları
// IS_EMRI_ANLIK_ONEKI ile iş emri kimliğinin anahtarında saklanır; yalnız emir seçme komutuyla değişir. Prototipin hangi adımları
// "seçildi" diye geçtiği ayrı anahtardadır ve iş emriyle birlikte saklanır. EMIR_ANLIK_ONEKI altındaki her anahtar çerçeveye gitmez
// ve genel uçtan yazılmaz; 266 a öncesinin üretim emri başına saklanan kayıtları da bu önektedir, okunmaz.
export const EMIR_ANLIK_ONEKI = `${EMIR_ANAHTARI}.`;
export const IS_EMRI_ANLIK_ONEKI = `${EMIR_ANLIK_ONEKI}is-emri.`;
export const SECIM_ANAHTARI = `${ANAHTAR_ONEKI}secim`;
// beklenenSurum prototip durumunun sürümüdür (null: durum hiç yazılmadı); emir seçimi durumu değiştirir.
export const emirSecGovdesi = z.object({ isEmriId: z.number().int().positive(), beklenenSurum: z.number().int().nullable() });
export const emirSecCevabi = z.object({ emir: emirSecenegiSemasi });

// Hazırlık adımlarının sunucudaki onay defteri: her adımın geçerli onayını kimin, ne zaman verdiği. `imza` prototipin adım
// imzasıdır; seçim değişince prototipte onay düşer, buradaki satır eski imzayla kalır (çerçeve imzayı karşılaştırır).
// Hazırlık onayı yalnız onay alanlarını taşır (bütün durumu değil): gövde küçük kalır ve denetim defterine tam girer.
// Sınırlar prototipin ürettiğinin çok üstündedir (en çok 120 cep, imza makine/dosya/takım adlarından oluşur).
export const hazirlikOnayGovdesi = z.object({
  hazirlik: z.object({
    done: z.record(z.string().min(1).max(80), z.string().max(2000))
      .refine((d) => Object.keys(d).length <= 200, 'Hazırlık adımı sayısı sınırı aşıyor.').optional(),
    fin: z.object({ ts: z.number(), sig: z.string().max(20000) }).nullable().optional(),
    at: z.number().int().min(0).optional(),
  }),
  // Onaylayıcı kayıt açamaz: kayıt var olmalı ve bu sürümde olmalı.
  beklenenSurum: z.number().int(),
});

export const hazirlikOnayiSemasi = z.object({
  adim: z.string(),
  olay: z.enum(['onay', 'tamam']),
  imza: z.string().nullable(),
  kisi: kisiSemasi,
  zaman: z.string(),
});
// "Kurulum tamam": seçili emirde kurulumu kimin ne zaman tamamladığı. gecerli, tamamlandıktan sonra seçimler değiştiyse yanlıştır.
export const kurulumDurumuSemasi = z.object({ kisi: kisiSemasi, zaman: z.string(), gecerli: z.boolean() });
export const hazirlikCevabi = z.object({ onaylar: z.array(hazirlikOnayiSemasi), kurulum: kurulumDurumuSemasi.nullable() });
// Kişi kendi gördüğü durumu tamamlar: durum bu sürümde değilse kayıt olmaz.
export const kurulumTamamGovdesi = z.object({ beklenenSurum: z.number().int() });
export const kurulumTamamCevabi = z.object({ kurulum: kurulumDurumuSemasi });

// Takım değişimi ve kullanım düzeltmesi (cnc-kurulum.takim-degistir): kurulumda seçili iş emrinin istasyonunda yüklü takıma
// yazılır. Değişim kullanımı sıfırlar; düzeltme kullanımı (dakika, adet) verilen farkla değiştirir, sıfırın altına indirmez.
// Fark olarak gelir: istemcinin gördüğünden sonra üretimden gelen sayım silinmez. Sınırlar cep sınırındadır.
const takimCebi = { cep: z.number().int().min(0).max(999), takimKimligi: z.string().min(1).max(200) };
const kullanimFarki = z.number().finite().min(-1e9).max(1e9);
export const takimOlaylariGovdesi = z.object({
  olaylar: z.array(z.discriminatedUnion('tur', [
    z.object({ tur: z.literal('degisim'), ...takimCebi }),
    z.object({ tur: z.literal('duzeltme'), ...takimCebi, farkDk: kullanimFarki, farkAdet: kullanimFarki }),
  ])).min(1).max(120),
});
// yazilan: deftere giren olay sayısı (yüklü olmayan cep ve değişmeyen düzeltme yazılmaz).
export const takimOlaylariCevabi = z.object({ yazilan: z.number().int().nonnegative() });

export type Kayit = z.output<typeof kayitSemasi>;
export type KayitlarCevabi = z.output<typeof kayitlarCevabi>;
export type BenCevabi = z.output<typeof benCevabi>;
export type YazGovdesi = z.output<typeof yazGovdesi>;
export type YazCevabi = z.output<typeof yazCevabi>;
export type SilCevabi = z.output<typeof silCevabi>;
export type EmirSecenegi = z.output<typeof emirSecenegiSemasi>;
export type EmirlerCevabi = z.output<typeof emirlerCevabi>;
export type HazirlikOnayGovdesi = z.output<typeof hazirlikOnayGovdesi>;
export type HazirlikOnayi = z.output<typeof hazirlikOnayiSemasi>;
export type HazirlikCevabi = z.output<typeof hazirlikCevabi>;
export type EmirSecGovdesi = z.output<typeof emirSecGovdesi>;
export type EmirSecCevabi = z.output<typeof emirSecCevabi>;
export type KurulumDurumu = z.output<typeof kurulumDurumuSemasi>;
export type KurulumTamamGovdesi = z.output<typeof kurulumTamamGovdesi>;
export type KurulumTamamCevabi = z.output<typeof kurulumTamamCevabi>;
export type TakimOlaylariGovdesi = z.output<typeof takimOlaylariGovdesi>;
export type TakimOlaylariCevabi = z.output<typeof takimOlaylariCevabi>;
