import { z } from 'zod';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';

// Akış Süresi (kart #1338): üretim emrinin hammadde kabulünden sevke kadar geçen zamanı, bekleme dahil, kaynak modüllerin
// kayıtlarından okur ve hesaplar. Yalnız okur; süreler dakikadır (takvim saati), ölçülemeyen değer null döner.

const TAM_SAYI_UST = 2147483647;
const KIMLIK = z.number().int().positive().max(TAM_SAYI_UST);
const dakika = z.number().nonnegative();

export const emirParametresi = z.object({ id: z.coerce.number().pipe(KIMLIK) });

// Şeritteki bölümler: bekleme (girdisi hazır, adım başlamadı; ya da statülü stokta), hazırlık, işleme, duraklama,
// duruş (nedenli), fasonda, sevk bekleme (sevke hazır, sevk edilmedi).
export const BOLUM_TURLERI = ['bekleme', 'hazirlik', 'isleme', 'duraklama', 'durus', 'fason', 'sevk'] as const;
export type BolumTuru = (typeof BOLUM_TURLERI)[number];

export const bolumSemasi = z.object({
  tur: z.enum(BOLUM_TURLERI),
  baslangic: zamanSemasi,
  bitis: zamanSemasi,
  // Sürüyor: bitişi "şimdi"dir, kayıt kapanmamıştır.
  acik: z.boolean(),
});

export const SERIT_TURLERI = ['hammadde', 'adim', 'sevk'] as const;

export const seritSemasi = z.object({
  anahtar: z.string(),
  tur: z.enum(SERIT_TURLERI),
  baslik: z.string(),
  // Adım şeridinde istasyon ya da "Fason"; diğerlerinde null.
  altBaslik: z.string().nullable(),
  bolumler: z.array(bolumSemasi),
});

export const adimOlcusuSemasi = z.object({
  isEmriId: KIMLIK,
  opNo: z.number().int(),
  istasyon: z.string().nullable(),
  fason: z.boolean(),
  // Girdisi hazır olduktan sonra adımın başlamasını bekleme; girdi bağımlılığa göre hazırdır (bekleyende önceki adımın bitişi,
  // akışlıda devir adedi kadar sağlam, bağımsızda bekleme yok). Bitirilip yeniden açılan adımın bitir-başlat arası da eklenir.
  beklemeDk: dakika.nullable(),
  hazirlikDk: dakika.nullable(),
  islemeDk: dakika.nullable(),
  duraklamaDk: dakika.nullable(),
  durusDk: dakika.nullable(),
  fasonDk: dakika.nullable(),
  saglamAdet: z.number().int().nonnegative(),
  // İşleme süresi ÷ sağlam adet; sayım yoksa null.
  cevrimBirimDk: dakika.nullable(),
  standartBirimDk: dakika.nullable(),
  standartHazirlikDk: dakika.nullable(),
  terminGun: z.number().int().nullable(),
});

export const statuKalisiSemasi = z.object({
  statuId: KIMLIK,
  ad: z.string(),
  tur: z.enum(['HM', 'YM', 'MM']).nullable(),
  girenAdet: z.number().nonnegative(),
  cikanAdet: z.number().nonnegative(),
  bekleyenAdet: z.number().nonnegative(),
  // Statüye girişten sonraki adımın tüketmesine (statü çevirme, sarf ya da sevk) kadar; adet ağırlıklı, ilk giren ilk çıkar.
  ortalamaKalisDk: dakika.nullable(),
  enUzunKalisDk: dakika.nullable(),
  enEskiBekleyenDk: dakika.nullable(),
});

export const hammaddePartisiSemasi = z.object({
  partiId: KIMLIK,
  lotNo: z.string().nullable(),
  malKabul: zamanSemasi.nullable(),
  // Partinin emirde ilk kullanılması: sarf, HM statüsünden çevirme ya da ilk adımın başlaması; hangisi önceyse.
  kullanim: zamanSemasi.nullable(),
  beklemeDk: dakika.nullable(),
});

export const olcuSemasi = z.object({ dk: dakika.nullable(), acik: z.boolean() });

export const emirAkisiCevabi = z.object({
  emir: z.object({
    id: KIMLIK,
    emirNo: z.string(),
    adet: z.number().int().positive(),
    durum: z.string(),
    teslim: tarihSemasi.nullable(),
  }),
  simdi: zamanSemasi,
  damgalar: z.object({
    malKabul: zamanSemasi.nullable(),
    uretimBasladi: zamanSemasi.nullable(),
    uretimBitti: zamanSemasi.nullable(),
    sevkeHazir: zamanSemasi.nullable(),
    sevk: zamanSemasi.nullable(),
  }),
  olculer: z.object({
    uctanUca: olcuSemasi,
    hammaddeBekleme: olcuSemasi,
    uretimAkis: olcuSemasi,
    sevkBekleme: olcuSemasi,
    islemeToplamDk: dakika.nullable(),
    // İşleme toplamı ÷ üretim akış süresi (0-1); ölçülemezse null.
    akisVerimi: z.number().min(0).max(1).nullable(),
  }),
  seritler: z.array(seritSemasi),
  adimlar: z.array(adimOlcusuSemasi),
  statuler: z.array(statuKalisiSemasi),
  hammadde: z.array(hammaddePartisiSemasi),
});

// Refakat kartının akışı (kart #708): emir yolculuğuyla aynı hesap, kartın kapsamıyla (kartın lotu ve kartla sayılan partilerin
// hareketleri, kartla sayılanlar). Anlar kartın her kaydıdır: hammadde kabulü, kartın açılışı, teslimler, adım olayları, kartla
// sayımlar, fason gidiş/dönüş, sevke hazır ve sevk; zamana göre.
export const kartParametresi = z.object({ id: z.coerce.number().pipe(KIMLIK) });
export const KART_ANI_TURLERI = [
  'mal_kabul', 'kart_acildi', 'teslim_gonderildi', 'teslim_alindi', 'teslim_reddedildi',
  'ayar', 'baslat', 'duraklat', 'durdur', 'devam', 'bitir', 'saglam', 'hurda', 'fason_gidis', 'fason_donus', 'sevke_hazir', 'sevk',
] as const;
export type KartAniTuru = (typeof KART_ANI_TURLERI)[number];
export const kartAniSemasi = z.object({
  zaman: zamanSemasi,
  tur: z.enum(KART_ANI_TURLERI),
  // Adımın anıysa adımı; değilse null.
  isEmriId: KIMLIK.nullable(),
  opNo: z.number().int().nullable(),
  // Teslimde "kaynak → hedef", adımda istasyon ya da "Fason", hammaddede lot; yoksa null.
  yer: z.string().nullable(),
  // Teslimde gönderilen ya da alınan miktar, sayımda (kayıttaki işaretiyle) ve fasonda adet.
  miktar: z.string().nullable(),
});
export const kartAkisiCevabi = emirAkisiCevabi.extend({
  kart: z.object({ id: KIMLIK, etiket: z.string(), durum: z.string(), lotNo: z.string().nullable(), acilis: zamanSemasi }),
  // Adım olayları emrindir (olayda kart yok): emrin başka kartı varsa anlar o kartın işini de gösterebilir.
  olaylarEmrin: z.literal(true),
  anlar: z.array(kartAniSemasi),
});

export const emirListesiCevabi = z.object({
  emirler: z.array(z.object({
    id: KIMLIK,
    emirNo: z.string(),
    urun: z.string(),
    adet: z.number().int().positive(),
    durum: z.string(),
    teslim: tarihSemasi.nullable(),
  })),
});

export type Bolum = z.output<typeof bolumSemasi>;
export type Serit = z.output<typeof seritSemasi>;
export type AdimOlcusu = z.output<typeof adimOlcusuSemasi>;
export type StatuKalisi = z.output<typeof statuKalisiSemasi>;
export type HammaddePartisi = z.output<typeof hammaddePartisiSemasi>;
export type Olcu = z.output<typeof olcuSemasi>;
export type EmirAkisiCevabi = z.output<typeof emirAkisiCevabi>;
export type EmirListesiCevabi = z.output<typeof emirListesiCevabi>;
export type KartAni = z.output<typeof kartAniSemasi>;
export type KartAkisiCevabi = z.output<typeof kartAkisiCevabi>;
