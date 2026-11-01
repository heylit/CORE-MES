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
// stokDusebilir: stok kartına bağlı kalemin azalan adedi stoktan düşer; stokKartiBaglayabilir: kalemi stok kartına bağlar (malzemeler.yaz).
// emirGorebilir: açık emir listesi (GET /cnc-kurulum/emirler) bu kişiye açıktır; değilse çerçeve listeyi hiç istemez.
export const benCevabi = z.object({
  kisi: kisiSemasi, yazabilir: z.boolean(), hazirlikOnaylayabilir: z.boolean(), takimDegistirebilir: z.boolean(), stokDusebilir: z.boolean(),
  stokKartiBaglayabilir: z.boolean(), emirGorebilir: z.boolean(),
});

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

// Takım stoğu stoktadır (153 a). Prototipin kütüphane kalemi (`inv` anahtarı) malzeme kartına bağlanır (163 b); bağlı kalemin adedi
// okurken stoğun kullanılabilir miktarıdır, kalemde `tmiStok` işaretiyle gelir. Prototipte azalan adet (takım değişimi, uç seti,
// elle azaltma) stoktan düşer (164 b); artış stoğa girmez (giriş Stok ekranından).
export const KUTUPHANE_KIMLIGI = /^[A-Za-z0-9_.-]{1,64}$/;
const kutuphaneKimligi = z.string().regex(KUTUPHANE_KIMLIGI, 'Geçersiz kütüphane kimliği.');
export const stokDusGovdesi = z.object({ kimlik: kutuphaneKimligi, miktar: z.number().int().min(1).max(10000) });
export const stokDusCevabi = z.object({ hareketSayisi: z.number().int().nonnegative() });
export const stokKartlariSorgusu = z.object({ metin: z.string().trim().max(100).optional(), sayfa: z.coerce.number().int().min(1).max(10000).default(1) });
export const stokKartiSemasi = z.object({ malzemeId: z.number().int(), kod: z.string(), ad: z.string().nullable(), birim: z.string().nullable() });
export const stokKartlariCevabi = z.object({ kartlar: z.array(stokKartiSemasi), toplam: z.number().int().nullable() });
// malzemeId null bağı kaldırır.
export const stokKartiBaglaGovdesi = z.object({ kimlik: kutuphaneKimligi, malzemeId: z.number().int().positive().nullable() });
export const stokKartiBaglaCevabi = z.object({ kart: stokKartiSemasi.nullable() });

// Tezgâh ayarı (1091 a, 1139 b): tezgâh İstasyonlar'daki makine kaydıdır; motorun alanları makine başına tutulur. Kodlar prototipin
// kodlarıdır. Boş alan bilinmiyor demektir (motor kendi varsayılanını kullanır); sıfır uydurulmaz.
export const TEZGAH_TURLERI = ['mill', 'lathe', 'millturn'] as const;
export const TEZGAH_KONTROLLERI = ['heid', 'iso'] as const;
export const MODEL_TURU = /^m_[a-z0-9]{1,20}$/;
const devir = z.number().int().min(1).max(100000).nullable();
export const tezgahAyariSemasi = z.object({
  tur: z.enum(TEZGAH_TURLERI).nullable(),
  kontrol: z.enum(TEZGAH_KONTROLLERI).nullable(),
  konik: z.string().trim().min(1).max(40).nullable(),
  cepSayisi: z.number().int().min(1).max(999).nullable(),
  devir,
  isMiliDevri: devir,
  canliTakim: z.boolean().nullable(),
  canliDevir: devir,
  elle: z.boolean().nullable(),
  modelTuru: z.string().regex(MODEL_TURU, 'Geçersiz model türü.').nullable(),
});
// istasyonId: makinenin istasyonu (takım yükü ve iş emri istasyon başınadır), yoksa null. surum: ayar satırının sürümü; ayarı olmayan makinede 0 (ilk yazma 0 ile gelir).
export const tezgahSemasi = z.object({
  makineId: z.number().int(), kod: z.string(), ad: z.string(), istasyonId: z.number().int().nullable(), aktif: z.boolean(), ayar: tezgahAyariSemasi.nullable(),
  surum: z.number().int().nonnegative(),
});
export const tezgahlarCevabi = z.object({ tezgahlar: z.array(tezgahSemasi) });
export const tezgahParametresi = z.object({ makineId: z.coerce.number().int().positive().max(2147483647) });
export const tezgahAyarGovdesi = tezgahAyariSemasi.extend({ beklenenSurum: z.number().int().min(0).max(2147483647) })
  .refine((g) => g.canliDevir === null || g.canliTakim === true, { message: 'Canlı takım devri yalnız canlı takımlı tezgâhta girilir.', path: ['canliDevir'] });
export const tezgahAyarCevabi = z.object({ tezgah: tezgahSemasi });

// 3B modeller (1212 a): dosya Çizim Merkezi'ndedir; CNC Kurulum makineye ya da bağlama aparatına yayındaki bir 3B model belgesini bağlar.
// Aparat anahtarı ekranın kalem kimliğidir (gömülü ya da kayıttaki özel aparat). Modeli olmayan hedef ekranda çizilen gövdeyle görünür.
export const MODEL_DOSYA_TURLERI = ['glb', 'gltf', 'step', 'iges', 'stl'] as const;
export const APARAT_ANAHTARI = /^[A-Za-z0-9_.:-]{1,80}$/;
export const modelHedefiSemasi = z.discriminatedUnion('tur', [
  z.object({ tur: z.literal('makine'), makineId: z.number().int().positive().max(2147483647) }),
  z.object({ tur: z.literal('aparat'), anahtar: z.string().regex(APARAT_ANAHTARI, 'Geçersiz aparat.') }),
]);
export const modelBelgesiSemasi = z.object({
  belgeId: z.number().int(), ad: z.string(), harf: z.string(), ozet: z.string(), dosyaTuru: z.enum(MODEL_DOSYA_TURLERI),
});
// surum: bağ satırının sürümü; hiç bağlanmamış hedefte 0 (ilk bağlama 0 ile gelir).
export const cncModelSemasi = z.object({
  id: z.number().int(), hedef: modelHedefiSemasi, belge: modelBelgesiSemasi.nullable(), surum: z.number().int().nonnegative(),
});
export const modellerCevabi = z.object({ modeller: z.array(cncModelSemasi) });
export const modelBaglaGovdesi = z.object({
  hedef: modelHedefiSemasi, belgeId: z.number().int().positive().max(2147483647).nullable(), beklenenSurum: z.number().int().min(0).max(2147483647),
});
export const modelBaglaCevabi = z.object({ model: cncModelSemasi });

// Ham malzeme analizden (1705 a): seçili iş emrinin ürününün yayındaki 3B modelinin geometri analizi. olcu döndürülmüş en küçük
// kutudur (a >= b >= c, mm; pay eklenmemiş: payı kurulumun kendi ayarı ekler); hacim ağ kapalı değilse null. Okunamıyorsa neden
// dolu, olcu null: emir-yok (iş emri seçilmedi), malzeme-yok (emrin ürün kartı yok), model-yok, analiz-yok (bu içeriğin analizi yok: bekliyor ya da hatalı).
export const HAM_ANALIZI_NEDENLERI = ['emir-yok', 'malzeme-yok', 'model-yok', 'analiz-yok'] as const;
export const hamAnaliziCevabi = z.object({
  neden: z.enum(HAM_ANALIZI_NEDENLERI).nullable(),
  model: z.object({ belgeAdi: z.string(), harf: z.string() }).nullable(),
  olcu: z.object({ a: z.number().nonnegative(), b: z.number().nonnegative(), c: z.number().nonnegative(), hacimMm3: z.number().positive().nullable() }).nullable(),
});
export const modelSecenekleriSorgusu = z.object({ ara: z.string().trim().max(100).optional() });
export const modelSecenekleriCevabi = z.object({ belgeler: z.array(modelBelgesiSemasi) });
export const modelParametresi = z.object({ id: z.coerce.number().int().positive().max(2147483647) });

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
export type StokDusGovdesi = z.output<typeof stokDusGovdesi>;
export type StokDusCevabi = z.output<typeof stokDusCevabi>;
export type StokKartlariSorgusu = z.output<typeof stokKartlariSorgusu>;
export type StokKarti = z.output<typeof stokKartiSemasi>;
export type StokKartlariCevabi = z.output<typeof stokKartlariCevabi>;
export type StokKartiBaglaGovdesi = z.output<typeof stokKartiBaglaGovdesi>;
export type StokKartiBaglaCevabi = z.output<typeof stokKartiBaglaCevabi>;
export type TezgahAyari = z.output<typeof tezgahAyariSemasi>;
export type Tezgah = z.output<typeof tezgahSemasi>;
export type TezgahlarCevabi = z.output<typeof tezgahlarCevabi>;
export type TezgahAyarGovdesi = z.output<typeof tezgahAyarGovdesi>;
export type TezgahAyarCevabi = z.output<typeof tezgahAyarCevabi>;
export type ModelHedefi = z.output<typeof modelHedefiSemasi>;
export type ModelBelgesi = z.output<typeof modelBelgesiSemasi>;
export type CncModel = z.output<typeof cncModelSemasi>;
export type ModellerCevabi = z.output<typeof modellerCevabi>;
export type ModelBaglaGovdesi = z.output<typeof modelBaglaGovdesi>;
export type ModelBaglaCevabi = z.output<typeof modelBaglaCevabi>;
export type ModelSecenekleriCevabi = z.output<typeof modelSecenekleriCevabi>;
export type HamAnaliziCevabi = z.output<typeof hamAnaliziCevabi>;
