import { z } from 'zod';
import { listeCevapSemasi, sayfaSorguAlanlari } from '../liste.ts';
import { ondalikMetinSemasi } from '../ondalik.ts';
import { surumSemasi } from '../surum.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';
import { KOD_DESENI as NEDEN_KODU } from './durus-nedenleri.ts';
import { EMIR_TURLERI, EMIR_TURU_ADLARI } from './emir-turleri.ts';

// Taslak planlanmamış emirdir ("Plana al" planlı yapar). Ekrandaki adlar: taslak, serbest (planlı), üretimde (başladı), tamamlanan (bitti).
export const EMIR_DURUMLARI = ['taslak', 'planli', 'basladi', 'bitti', 'iptal'] as const;
// Defterde görünen olaylar. Sağlam +1 dokunuşları tek tek listelenmez; sağlam sayacı elle değişince (eksiltme,
// tuş takımıyla ayarlama, bitişte farklı adet) `duzeltme` yazılır.
export const KAYIT_OLAYLARI = ['ayar', 'baslat', 'bitir', 'duraklat', 'durdur', 'devam', 'hurda', 'duzeltme'] as const;
// Defter terminal olaylarına ek olarak ilk parça kalite kararını ayrı gösterir (504 a).
export const DEFTER_OLAYLARI = [...KAYIT_OLAYLARI, 'kalite_onay', 'kalite_red'] as const;
export const CALISMA_DURUMLARI = ['calisiyor', 'durakli', 'durdu'] as const;
// karar_bekliyor: ilk parça kararı beklenirken sayılan parça; red: reddedilen kararın zincirinde kalan parça. İkisi de sağlama katılmaz.
export const SAYIM_TURLERI = ['saglam', 'hurda', 'karar_bekliyor', 'red'] as const;
export const KALITE_KARARLARI = ['onay', 'ret'] as const;
export const AZAMI_ADIM = 30;
// Tek sayım isteğinin taşıyabileceği en büyük adet (mutlak değer). Toplamın sınırını sunucu korur.
export const AZAMI_SAYIM = 1_000_000;
// Terminalin gösterdiği işler: bitmiş ve iptal edilmiş emir terminale gelmez.
export const ACIK_EMIR_DURUMLARI = ['planli', 'basladi'] as const satisfies readonly (typeof EMIR_DURUMLARI)[number][];

// Veritabanı tam sayısının üst sınırı; iş kuralı değildir.
const TAM_SAYI_UST = 2147483647;
const KIMLIK = z.number().int().positive().max(TAM_SAYI_UST);
const yolKimligi = z.coerce.number().pipe(KIMLIK);
// Zaman ISO 8601 metnidir (timestamptz); istemci yerel saate kendisi çevirir.
const zaman = z.string();
const metin = (azami: number, bosIleti: string) => z.string().trim().min(1, bosIleti).max(azami);

export const emirDurumu = z.enum(EMIR_DURUMLARI);
export const kayitOlayi = z.enum(DEFTER_OLAYLARI);
export const calismaDurumu = z.enum(CALISMA_DURUMLARI);

export const emirParametresi = z.object({ id: yolKimligi });
export const adimParametresi = z.object({ id: yolKimligi, adimId: yolKimligi });
// Süzgeç verilmezse bütün durumlar gelir.
// istasyonsuz=1: adımları henüz bir istasyona düşmemiş ya da bitmiş emirler de gelir (salt okunur izleme); verilmezse yalnız istasyonlu emirler.
// Liste kapsamı (kart #1323): varsayılan açık emirler (bitmiş ve iptal hariç); bitenler ayrı, sayfalı uçtan gelir.
// 'hepsi' biten emirleri de isteyen ekranlar içindir (hangi makinede üretildi, parti ağacı).
export const LISTE_KAPSAMLARI = ['acik', 'hepsi'] as const;
export const BITEN_EMIR_DURUMLARI = ['bitti', 'iptal'] as const satisfies readonly (typeof EMIR_DURUMLARI)[number][];
const listeKapsami = z.enum(LISTE_KAPSAMLARI).default('acik');
// Emir no, parça no ya da parça adında geçen metin; büyük küçük harf ayrılmaz.
const aramaMetni = z.string().trim().max(60).optional().transform((m) => (m === '' ? undefined : m));
export const emirlerSorgusu = z.object({ durum: emirDurumu.optional(), istasyonsuz: z.literal('1').optional(), kapsam: listeKapsami });
export const bitenEmirlerSorgusu = z.object({
  ...sayfaSorguAlanlari, durum: z.enum(BITEN_EMIR_DURUMLARI).optional(), istasyonsuz: z.literal('1').optional(), ara: aramaMetni,
});

// Parça serbest metindir: parça modülü gelince bağlanır.
export const emirGovdesi = z.object({
  parcaNo: metin(60, 'Parça no zorunlu.'),
  parcaAd: metin(120, 'Parça adı zorunlu.'),
  adet: z.number().int('Adet tam sayı olmalı.').positive('Adet sıfırdan büyük olmalı.').max(TAM_SAYI_UST),
  istasyonId: KIMLIK,
  // 224 (denetim #27): emir projeyle açılır.
  projeId: KIMLIK,
  // Talimat kontrol listesi: sıra dizideki yerdir. Verilmezse emrin adımı yoktur.
  adimlar: z.array(z.object({
    ad: metin(120, 'Adım adı zorunlu.'),
    // Boş açıklama yok sayılır: çıktıda ya dolu metin ya null vardır.
    aciklama: z.string().trim().max(300).nullish().transform((d) => (d ? d : null)),
  })).max(AZAMI_ADIM, `Bir emirde en çok ${AZAMI_ADIM} adım olur.`).optional(),
});

// Sayılan parçanın refakat partisi (kartı okutulan emir + hammadde lotu; kart #125). Verilmezse sayım partisiz yazılır.
const refakatPartisiId = KIMLIK.optional();

const SAYIM_ASIMI = `Tek seferde en çok ${AZAMI_SAYIM} adet girilir.`;
const sayimAdedi = z.number().int('Adet tam sayı olmalı.').min(-AZAMI_SAYIM, SAYIM_ASIMI).max(AZAMI_SAYIM, SAYIM_ASIMI);
// Her dokunuş bir olaydır. Sağlam ve hurda eksi olabilir (düzeltme, kart #1194); artan hurda nedensiz yazılmaz, eksi hurdada neden
// verilmezse son hurdanın nedeni yazılır. Kollar katıdır: sağlam sayımda hurda nedeni sessizce atılmaz, reddedilir.
export const sayimGovdesi = z.discriminatedUnion('tur', [
  z.object({
    tur: z.literal('saglam'),
    adet: sayimAdedi.refine((a) => a !== 0, 'Adet sıfır olamaz.'),
    refakatPartisiId,
  }).strict(),
  z.object({
    tur: z.literal('hurda'),
    adet: sayimAdedi.refine((a) => a !== 0, 'Adet sıfır olamaz.'),
    hurdaNedeniId: KIMLIK.optional(),
    refakatPartisiId,
  }).strict(),
]).superRefine((g, ctx) => {
  if (g.tur === 'hurda' && g.adet > 0 && g.hurdaNedeniId === undefined) ctx.addIssue({ code: 'custom', path: ['hurdaNedeniId'], message: 'Hurda nedeni seçin.' });
});
// Bir başlatmada seçilebilecek en çok makine; Arkon kaydı bu sınırla okunur.
export const AZAMI_MAKINE_SECIMI = 20;
// Makine (ya da makinesiz işin istasyon yeri) doluyken dönen 409'un ayrıntısı: kimin hangi işi başlattığı. Devralma bu
// kullanımı kimliğiyle kapatır; arada orada başka iş açılmışsa devralma reddedilir. `makine` null: istasyon yeri.
export const makineDoluAyrintisi = z.object({
  kullanimId: KIMLIK,
  makine: z.object({ id: KIMLIK, ad: z.string() }).nullable(),
  emir: z.object({ id: KIMLIK, emirNo: z.string() }),
  kisi: z.object({ id: KIMLIK, ad: z.string() }),
  baslama: z.string(),
});
export const makineDevralGovdesi = z.object({ kullanimId: KIMLIK }).strict();
// Aynı işe katılım (kart #1144): kişinin o işte kesintisiz çalıştığı aralık. Kapanış: kişi duraklattı, kişi ayrıldı ya da
// emir duraklatıldı/durduruldu/bitti ("emir"). Açık aralık kapanış taşımaz.
export const KATILIM_KAPANISLARI = ['duraklat', 'ayril', 'emir'] as const;
export const katilimSemasi = z.object({
  id: KIMLIK,
  kisi: z.object({ id: KIMLIK, ad: z.string() }),
  isEmriId: KIMLIK.nullable(),
  giris: z.string(),
  cikis: z.string().nullable(),
  kapanis: z.enum(KATILIM_KAPANISLARI).nullable(),
});
// Katılınca başka çalışan varsa uyarı döner; işlem reddedilmez.
export const katilimCevabi = z.object({ katilimlar: z.array(katilimSemasi), uyari: z.string().nullable() });
export const durdurGovdesi = z.object({ durusNedeniId: KIMLIK }).strict();
export const adimTamamlaGovdesi = z.object({ tamam: z.boolean() }).strict();

const adliKayit = z.object({ id: KIMLIK, ad: z.string() });

// Başlamış emrin anlık hali. Sayaç sıfırı gerçek sıfırdır ("henüz sayılmadı"); sayacın olmaması `canli: null` ile söylenir.
export const canliSemasi = z.object({
  // null: emir bitti; sayaçlar son değerlerinde kalır, çalışma durumu artık yoktur.
  calisma: calismaDurumu.nullable(),
  saglam: z.number().int().nonnegative(),
  hurda: z.number().int().nonnegative(),
  // Yalnız durmuşken dolu: duraklatma neden taşımaz.
  durusNedeni: adliKayit.nullable(),
  // Duraklamanın ya da duruşun başladığı an; çalışırken ve bitince null.
  durusBaslangic: zaman.nullable(),
  // Yalnız çalışan (başlatılmış, bitmemiş) iş emri; iş emirsiz emirde, adımlar arasında ve bitince null. Makine fason ya da kişi
  // kaynaklı işte null. İsteğe bağlı: bu alandan önce yazılmış istemci verisi geçerli kalır.
  isEmri: z.object({ id: KIMLIK, opNo: z.number().int().positive(), ad: z.string(), makineId: KIMLIK.nullable() }).nullable().optional(),
});

// Paralel adım (kart 639): emrin açık adımları, her biri kendi istasyonunda ve çalışma hâlinde. Bekleyen adımlı emirde en çok biri
// çalışır; akışlı ve bağımsız adımlar aynı anda açık olabilir. calisma yalnız çalışan adımda doludur.
export const acikAdimSemasi = z.object({
  isEmriId: KIMLIK,
  opNo: z.number().int().positive(),
  ad: z.string(),
  istasyon: adliKayit.nullable(),
  durum: z.lazy(() => isEmriDurumu),
  calisma: calismaDurumu.nullable(),
  makineId: KIMLIK.nullable(),
  // Önceki adımın sağlamı eksi bu adımın sağlam, karar bekleyen, hurda ve kol açmadan girilmiş hatalı toplamı (kola ayrılan hatalı adıma
  // girenden zaten düşer, 1188). Artı: adıma gelmiş, henüz işlenmemiş parça.
  // Eksi: bu adım önceki adımın teslim etmediği parçayı saydı (647 a); önceki adımda o kadar eksi bakiye vardır, önceki adım saydıkça kapanır.
  // Önceki adımı olmayan ya da bağımsız adımda null.
  eksik: z.number().int().nullable(),
  // 1188: bu adımda girilmiş hatalı parça kayıtlarının adet toplamı (kol açılsa da, karar verilse de); hatalı giriş adımda üretimdir.
  // Kaydı yoksa 0 (gerçek sıfır). İsteğe bağlı: sunucu her zaman yazar, alanı olmayan eski veride sayı bilinmiyor demektir.
  hataliAdet: z.number().int().nonnegative().optional(),
});

// Onaylı kapanışın sonucu (1082 a); emir okumaları da taşıdığı için burada.
export const KAPANIS_SONUCLARI = ['tamamlandi', 'saglamsiz'] as const;

export const emirSemasi = z.object({
  id: KIMLIK,
  emirNo: z.string(),
  parcaNo: z.string(),
  parcaAd: z.string(),
  adet: z.number().int().positive(),
  istasyon: adliKayit,
  durum: emirDurumu,
  acan: adliKayit,
  acilma: zaman,
  baslama: zaman.nullable(),
  bitis: zaman.nullable(),
  iptal: zaman.nullable(),
  // null: emir bitmedi. Sıfır "bitti, sağlam parça çıkmadı" demektir.
  saglamAdet: z.number().int().nonnegative().nullable(),
  // null: emir hiç başlamadı (planlı ya da iptal).
  canli: canliSemasi.nullable().optional(),
  // Ürünün malzeme kartı; istasyonlu (iş emirsiz) emirde null. İsteğe bağlı: bu alandan önce yazılmış istemci verisi geçerli kalır.
  malzemeNo: KIMLIK.nullable().optional(),
  // İptal sürümle yazılır: başka ekranın arada yaptığı değişiklik ezilmez. İsteğe bağlı: önceki istemci verisi geçerli kalır.
  surum: surumSemasi.optional(),
  // İş emirli emirde açık adımlar; iş emirsiz emirde boş. İsteğe bağlı: bu alandan önce yazılmış istemci verisi geçerli kalır.
  acikAdimlar: z.array(acikAdimSemasi).optional(),
  // Şu an başlatılabilecek adımlar (bekleyen adım sırası, akışlı ve bağımsız adımlar); sıra dışı olanı uyarıyla başlar (626 a).
  baslatilabilirAdimlar: z.array(KIMLIK).optional(),
  // Kapanış iki onayla tamamlandıysa dolu; açık kapanışta ve kapanışa girmeyen emirde null. İsteğe bağlı: yalnız izleme ve biten listeleri doldurur.
  kapanisSonucu: z.enum(KAPANIS_SONUCLARI).nullable().optional(),
});

export const adimSemasi = z.object({
  id: KIMLIK,
  sira: z.number().int().positive(),
  ad: z.string(),
  aciklama: z.string().nullable(),
  tamam: z.boolean(),
  // İkisi birlikte dolu ya da birlikte null: işaret geri alınınca kim ve ne zaman da silinir.
  tamamlayan: adliKayit.nullable(),
  tamamlanma: zaman.nullable(),
});

// Yalnız eklenen defterin satırı.
export const kayitSemasi = z.object({
  id: KIMLIK,
  emirId: KIMLIK,
  kisi: adliKayit,
  istasyon: adliKayit,
  olay: kayitOlayi,
  // Yalnız bitişte dolu: emrin kapanış sağlam adedi.
  saglamAdet: z.number().int().nonnegative().nullable(),
  // Hurdada eklenen adet (artı), düzeltmede sağlam sayacındaki değişim (artı ya da eksi), kalite kararında karara giren adet; öbür olaylarda null.
  adet: z.number().int().nullable().optional(),
  durusNedeni: adliKayit.nullable().optional(),
  hurdaNedeni: adliKayit.nullable().optional(),
  // Yalnız kalite kararında: kararı veren (kisi parçayı sayandır). Karar veren tutulmadan önce yazılmış satırda null (bilinmez).
  kararVeren: adliKayit.nullable().optional(),
  zaman,
});

// Salt okunur izleme (kart #1191): adımları henüz bir istasyona düşmemiş ya da bitmiş emir de görünür; istasyon yoksa null (uydurulmaz).
export const izlemeEmirSemasi = emirSemasi.extend({ istasyon: adliKayit.nullable() });
export const emirlerCevabi = z.object({ emirler: z.array(emirSemasi) });
export const izlemeListeCevabi = z.object({ emirler: z.array(izlemeEmirSemasi) });
export const bitenEmirlerCevabi = listeCevapSemasi(izlemeEmirSemasi);
export const emirAyrintiCevabi = z.object({
  emir: izlemeEmirSemasi,
  kayitlar: z.array(kayitSemasi),
  // Sıraya göre; adımı olmayan emirde boş dizi.
  adimlar: z.array(adimSemasi).optional(),
  // 283 a: emirden ayrılan kolların (torunlar, katılmış kollar dahil) hurda toplamı; emrin kendi hurdasına karışmaz. Kolu yoksa null.
  // İsteğe bağlı: sunucu her zaman yazar, bu alandan önce yazılmış istemci verisi geçerli kalır.
  kolHurdasi: z.number().int().nullable().optional(),
});
// Emir komutları emrin son halini döner.
export const emirCevabi = z.object({ emir: emirSemasi });
export const adimCevabi = z.object({ emir: emirSemasi, adimlar: z.array(adimSemasi) });
// Ana sayfa sayıları. Sayım sıfır olabilir, gerçektir. null: planlanacak ve açık için kişinin iş emirli listeyi okuma yetkisi
// yok; bugün için kişinin bugün sağlam sayımı yok (sıfır uydurulmaz). Gün tesis günüdür.
export const ozetCevabi = z.object({
  planlanacak: z.number().int().nonnegative().nullable(),
  acik: z.number().int().nonnegative().nullable(),
  kuyrugum: z.number().int().nonnegative(),
  bugunSaglam: z.number().int().nullable(),
  // İş emirli emirlerin aşama sayıları (liste okuyamayan kişiye null). Kalite bekleyen: modülde kalite durumu tutulmuyor, null.
  // İsteğe bağlı: sunucu her zaman yazar, bu alandan önce yazılmış istemci verisi geçerli kalır.
  asamalar: z.object({
    planlanacak: z.number().int().nonnegative(),
    planda: z.number().int().nonnegative(),
    uretimde: z.number().int().nonnegative(),
    duraklatilmis: z.number().int().nonnegative(),
    kaliteBekleyen: z.number().int().nonnegative().nullable(),
    buHaftaBiten: z.number().int().nonnegative(),
  }).nullable().optional(),
});

// Panel serileri: son N gün (tesis günü, bugün dahil). Kaydı olmayan gün listede yer almaz.
export const AZAMI_PANEL_GUNU = 366;
export const panelSorgusu = (varsayilan: number) => z.object({
  gun: z.coerce.number().int().min(1).max(AZAMI_PANEL_GUNU).default(varsayilan),
});
export const gunlukUretimCevabi = z.object({
  gunler: z.array(z.object({ gun: tarihSemasi, saglam: z.number().int(), hurda: z.number().int() })),
});
// Duruş süresi, başlangıcı pencere içinde kalan durdurmalardan; süren duruş şimdiye kadar sayılır.
export const durusDagilimiCevabi = z.object({
  nedenler: z.array(z.object({ neden: z.object({ id: KIMLIK, ad: z.string() }), adet: z.number().int().positive(), dakika: z.number().nonnegative() })),
});

// Son terminal olayları, bütün emirlerde, yeniden eskiye. `sonra` verilirse yalnız o andan sonrakiler (yoklama için).
// Defterdeki olaylara ek olarak sağlam sayım dokunuşu `saglam` olarak gelir; `adet` sayımda dolu (eksiltmede eksi).
export const SON_OLAY_TURLERI = [...DEFTER_OLAYLARI, 'saglam'] as const;
export const AZAMI_SON_OLAY = 200;
export const sonOlaylarSorgusu = z.object({
  sonra: zamanSemasi.optional(),
  sayi: z.coerce.number().int().min(1).max(AZAMI_SON_OLAY).default(50),
});
export const sonOlaylarCevabi = z.object({
  olaylar: z.array(z.object({
    id: z.string(),
    olay: z.enum(SON_OLAY_TURLERI),
    emir: z.object({ id: KIMLIK, emirNo: z.string(), parcaNo: z.string() }),
    isEmri: z.object({ id: KIMLIK, opNo: z.number().int().positive(), ad: z.string() }).nullable(),
    makine: adliKayit.nullable(),
    istasyon: adliKayit,
    kisi: adliKayit,
    adet: z.number().int().nullable(),
    durusNedeni: adliKayit.nullable(),
    // Yalnız kalite kararında: kararı veren (kisi parçayı sayandır); bilinmiyorsa null.
    kararVeren: adliKayit.nullable().optional(),
    zaman,
  })),
});

export type EmirDurumu = z.output<typeof emirDurumu>;
export type OzetCevabi = z.output<typeof ozetCevabi>;
export type GunlukUretimCevabi = z.output<typeof gunlukUretimCevabi>;
export type DurusDagilimiCevabi = z.output<typeof durusDagilimiCevabi>;
export type SonOlaylarCevabi = z.output<typeof sonOlaylarCevabi>;
export type SonOlayTuru = (typeof SON_OLAY_TURLERI)[number];
export type KayitOlayi = z.output<typeof kayitOlayi>;
export type CalismaDurumu = z.output<typeof calismaDurumu>;
export type SayimTuru = (typeof SAYIM_TURLERI)[number];
export type KaliteKarari = (typeof KALITE_KARARLARI)[number];
export type Canli = z.output<typeof canliSemasi>;
export type EmirAdimi = z.output<typeof adimSemasi>;
export type Emir = z.output<typeof emirSemasi>;
export type IzlemeEmri = z.output<typeof izlemeEmirSemasi>;
export type UretimKaydi = z.output<typeof kayitSemasi>;
export type EmirKaydi = z.output<typeof emirGovdesi>;
export type EmirGovdesi = z.input<typeof emirGovdesi>;
export type SayimKaydi = z.output<typeof sayimGovdesi>;
export type SayimGovdesi = z.input<typeof sayimGovdesi>;
export type MakineDoluAyrintisi = z.output<typeof makineDoluAyrintisi>;
export type MakineDevralGovdesi = z.input<typeof makineDevralGovdesi>;
export type Katilim = z.output<typeof katilimSemasi>;
export type KatilimCevabi = z.output<typeof katilimCevabi>;
export type KatilimKapanisi = (typeof KATILIM_KAPANISLARI)[number];
export type AdimTamamlaGovdesi = z.input<typeof adimTamamlaGovdesi>;
export type EmirlerSorgusu = z.input<typeof emirlerSorgusu>;
export type EmirlerCevabi = z.output<typeof emirlerCevabi>;
export type IzlemeListeCevabi = z.output<typeof izlemeListeCevabi>;
export type BitenEmirlerCevabi = z.output<typeof bitenEmirlerCevabi>;
export type BitenEmirlerSorgusu = z.input<typeof bitenEmirlerSorgusu>;
export type EmirAyrintiCevabi = z.output<typeof emirAyrintiCevabi>;
export type EmirCevabi = z.output<typeof emirCevabi>;
export type AdimCevabi = z.output<typeof adimCevabi>;

/* ---------------- iş emirli üretim emri (K1, K3; kart #262) ---------------- */

export const ONCELIKLER = [1, 2, 3, 4] as const;
export const IS_EMRI_DURUMLARI = ['bekliyor', 'calisiyor', 'tamam'] as const;
// Kaynak bir makine, bir kişi ya da fason firmadır (firma kimliği finansındır); plan ve ekran yalnız makine ya da kişi atar.
export const IS_EMRI_KAYNAK_TURLERI = ['makine', 'kisi', 'fason'] as const;
export const ATANABILIR_KAYNAK_TURLERI = ['makine', 'kisi'] as const;
export const BAGIMLILIKLAR = ['bekleyen', 'akisli', 'bagimsiz'] as const;
export const FASON_YONLERI = ['gidis', 'donus'] as const;
// Rotadan gelen adım 'rota'dır; kola sonradan konan adım rework, tamir ya da ek adımdır (PB-K1).
export const IS_EMRI_TURLERI = ['rota', 'rework', 'tamir', 'ek'] as const;
export const EK_ADIM_TURLERI = ['rework', 'tamir', 'ek'] as const;
export { EMIR_TURLERI, EMIR_TURU_ADLARI };

export const isEmriDurumu = z.enum(IS_EMRI_DURUMLARI);
export const atanabilirKaynak = z.object({ tur: z.enum(ATANABILIR_KAYNAK_TURLERI), id: KIMLIK });

export const adimliListeSorgusu = z.object({
  // Arşivdeki eski (adımsız) emirler ayrı listedir, salt okunur.
  arsiv: z.enum(['true', 'false']).optional().transform((a) => a === 'true'),
  // Verilince yalnız o projeye bağlı, arşiv dışı emirler (projeler sayfasındaki liste); kapsam uygulanmaz.
  projeId: z.coerce.number().int().positive().optional(),
  kapsam: listeKapsami,
});
export const adimliBitenlerSorgusu = z.object({ ...sayfaSorguAlanlari, durum: z.enum(BITEN_EMIR_DURUMLARI).optional(), ara: aramaMetni });
export const isEmriParametresi = z.object({ id: yolKimligi, isEmriId: yolKimligi });
export const fasonHareketiCevabi = z.object({ emir: z.lazy(() => adimliEmirAyrintisi), hareketId: KIMLIK });
export const partiBolCevabi = z.object({ emir: z.lazy(() => adimliEmirAyrintisi), altEmirId: KIMLIK });

export const planaAlGovdesi = z.object({ surum: surumSemasi }).strict();
export const adimliIptalGovdesi = z.object({ surum: surumSemasi }).strict();
export const oncelikGovdesi = z.object({ oncelik: z.number().int().min(1, 'Öncelik 1-4 olmalı.').max(4, 'Öncelik 1-4 olmalı.'), surum: surumSemasi }).strict();
// Bekleyen iş emrine kaynak atanır ya da kaldırılır (null: atanmamış, ilk sistemdeki "Tezgahsız").
export const adimKaynagiGovdesi = z.object({ opNo: KIMLIK, kaynak: atanabilirKaynak.nullable(), surum: surumSemasi }).strict();
// Açılmış emirde başlamamış adım içeriye ya da fasona alınır; rota değişmez. Fasonda firma ve termin günü zorunlu, içeride verilmez.
export const URETIM_YERLERI = ['ic', 'fason'] as const;
export const uretimYeriGovdesi = z.object({
  opNo: KIMLIK, yer: z.enum(URETIM_YERLERI), firmaId: KIMLIK.nullable(), terminGun: z.number().int().min(1).max(365).nullable(), surum: surumSemasi,
}).strict();
// Adımı fasona alırken seçilecek aktif fason firmalar (emir ekranı müşteri ve tedarikçi yetkisi istemeden seçer).
export const fasonFirmalariCevabi = z.object({ firmalar: z.array(z.object({ id: KIMLIK, kod: z.string().nullable(), ad: z.string() })) });

// Kola konan adım: rotada yoktur; operasyon tipi, kaynak ve süre elle verilir. Op numarası emirde tekildir ve komşularının arasındadır.
// oncekiOpNo: hangi adımdan sonra girdiği (null: kolun başı).
export const ekAdimSemasi = z.object({
  oncekiOpNo: KIMLIK.nullable(),
  opNo: KIMLIK,
  tur: z.enum(EK_ADIM_TURLERI),
  ad: metin(80, 'Adım adı zorunlu.'),
  operasyonTipiId: KIMLIK,
  kaynak: z.object({ tur: z.enum(IS_EMRI_KAYNAK_TURLERI), id: KIMLIK }).nullable(),
  ayarSuresiDk: ondalikMetinSemasi.nullable(),
  birimSureDk: ondalikMetinSemasi.nullable(),
  terminGun: z.number().int().min(1).max(365).nullable(),
  aciklama: z.string().trim().max(300).nullish().transform((d) => (d ? d : null)),
}).strict();

// Parti bölme (kullanıcı kararları A, PB-K2..K4): bölünen adım ve sonrakiler başlamamışsa önceki adımlar bitmeden de bölünür.
// birlesmeOpNo verilirse kol o adıma kadar yürür, o adım ve sonrası üstte yapılır; ekAdimlar kola rework, tamir ya da ek adım koyar.
export const partiBolGovdesi = z.object({
  adimSira: z.number().int().positive(), adet: z.number().int('Adet tam sayı olmalı.').positive('Adet sıfırdan büyük olmalı.'), surum: surumSemasi,
  birlesmeOpNo: KIMLIK.nullable().optional(),
  // Verilmezse kol üstün türünü alır.
  emirTuru: z.enum(EMIR_TURLERI).optional(),
  ekAdimlar: z.array(ekAdimSemasi).max(AZAMI_ADIM, `Bir kola en çok ${AZAMI_ADIM} adım eklenir.`).optional(),
}).strict();
export const ekAdimGovdesi = ekAdimSemasi.extend({ surum: surumSemasi }).strict();

// Rotasız emir (B13, kullanıcı kararı 14.10.2026): malzemeli emir rota seçmeden açılır, adımları sonradan Reçete ve Rota'da eklenir.
// Açılış "Rotasız üretim emri" ayarına bağlıdır.
const gunMetni = (ad: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${ad} YYYY-AA-GG olmalı.`);
export const rotasizEmirGovdesi = z.object({
  malzemeNo: KIMLIK,
  adet: z.number().int('Adet tam sayı olmalı.').positive('Adet sıfırdan büyük olmalı.').max(TAM_SAYI_UST),
  teslim: gunMetni('Teslim').nullable(),
  oncelik: z.number().int().min(1, 'Öncelik 1-4 olmalı.').max(4, 'Öncelik 1-4 olmalı.').optional(),
  baslangic: gunMetni('Başlangıç').nullish(),
  aciklama: z.string().trim().max(300, 'Açıklama en çok 300 karakter.').nullish(),
  taslak: z.boolean().optional(),
  emirTuru: z.enum(EMIR_TURLERI).optional(),
  projeId: KIMLIK.nullish(),
  // Projenin siparişindeki onaylı, aynı malzemeli satır (176 a); verilirse proje zorunludur.
  siparisSatiriId: KIMLIK.nullish(),
}).strict();
export const rotasizEmirCevabi = z.object({ uretimEmriId: KIMLIK });

// E-1, 224: emir açma ekranlarının (rotasız emir, Emre kopyala) proje ve sipariş satırı seçenekleri. Satırlar sunucunun bağlayacağı
// satırlardır (projenin onaylı siparişi, aynı malzeme). Tek satırlı projede seçim gerekmez, sunucu bağlar; birden çoksa seçilir. Fiyat yok.
export const acilisSecenekleriSorgusu = z.object({ malzemeNo: z.coerce.number().int().positive(), emirTuru: z.enum(EMIR_TURLERI).optional() });
export const acilisSecenekleriCevabi = z.object({
  projeZorunlu: z.boolean(),
  projeler: z.array(z.object({
    id: KIMLIK, kod: z.string(), ad: z.string(),
    satirlar: z.array(z.object({ id: KIMLIK, siparisNo: z.string(), satirNo: z.number().int(), adet: z.string(), termin: z.string().nullable() })),
  })),
});
export type AcilisSecenekleri = z.output<typeof acilisSecenekleriCevabi>;

const adimBileseni = z.object({
  malzemeId: KIMLIK,
  miktar: z.number().min(0.0001, 'Miktar en az 0,0001 olmalı.').max(1_000_000),
  fireYuzde: z.number().min(0, 'Fire yüzde 0-100 olmalı.').max(100, 'Fire yüzde 0-100 olmalı.'),
}).strict();
const rotasizAdimAlanlari = {
  ad: metin(80, 'Adım adı zorunlu.'),
  operasyonTipiId: KIMLIK,
  kaynak: z.object({ tur: z.enum(IS_EMRI_KAYNAK_TURLERI), id: KIMLIK }).nullable(),
  ayarSuresiDk: ondalikMetinSemasi.nullable(),
  birimSureDk: ondalikMetinSemasi.nullable(),
  terminGun: z.number().int().min(1).max(365).nullable(),
  aciklama: z.string().trim().max(300).nullish().transform((d) => (d ? d : null)),
  bilesenler: z.array(adimBileseni).max(50, 'Bir adımda en çok 50 bileşen olur.').optional(),
};
// oncekiOpNo: hangi adımdan sonra girdiği (null: emrin başı). Yer ve op numarası kuralı kola konan adımınkiyle aynıdır.
export const rotasizAdimEkleGovdesi = z.object({ oncekiOpNo: KIMLIK.nullable(), opNo: KIMLIK, ...rotasizAdimAlanlari, surum: surumSemasi }).strict();
// Verilmeyen alan kalır; bilesenler verilirse listenin tamamının yerine geçer.
export const rotasizAdimDuzenleGovdesi = z.object({
  opNo: KIMLIK,
  ad: rotasizAdimAlanlari.ad.optional(),
  operasyonTipiId: KIMLIK.optional(),
  kaynak: rotasizAdimAlanlari.kaynak.optional(),
  ayarSuresiDk: rotasizAdimAlanlari.ayarSuresiDk.optional(),
  birimSureDk: rotasizAdimAlanlari.birimSureDk.optional(),
  terminGun: rotasizAdimAlanlari.terminGun.optional(),
  aciklama: z.string().trim().max(300).nullable().optional(),
  bilesenler: rotasizAdimAlanlari.bilesenler,
  surum: surumSemasi,
}).strict();
export const rotasizAdimSilGovdesi = z.object({ opNo: KIMLIK, surum: surumSemasi }).strict();
export const ekAdimKaldirGovdesi = z.object({ opNo: KIMLIK, surum: surumSemasi }).strict();
// null: birleşme planı kalkar, kol üstün kalan adımlarını yeniden taşır.
export const birlesmePlaniGovdesi = z.object({ birlesmeOpNo: KIMLIK.nullable(), surum: surumSemasi }).strict();
// Kaynak parti kapanır (iptal), adedi bu emre eklenir; iki sürüm de denetlenir.
export const partiBirlestirGovdesi = z.object({ kaynakEmirId: KIMLIK, surum: surumSemasi, kaynakSurum: surumSemasi }).strict();

const fasonAdedi = (ad: string) => z.number().int(`${ad} tam sayı olmalı.`).nonnegative(`${ad} eksi olamaz.`).max(AZAMI_SAYIM);
// Malzeme · Teslim panelindeki "Fasona gönder" bölümü (kart #97): okutulan emrin sıradaki fason iş emri; sırada fason yoksa null.
// gonderilebilir: adıma giren adet (ilk adımda emrin adedi); toplam gönderim bunu aşamaz.
export const siradakiFasonCevabi = z.object({
  fason: z.object({
    uretimEmriId: KIMLIK, emirNo: z.string(), isEmriId: KIMLIK, opNo: z.number().int(), ad: z.string(), firma: z.string().nullable(),
    gonderilen: z.number().int().nonnegative(), donenSaglam: z.number().int().nonnegative(), donenHurda: z.number().int().nonnegative(),
    gonderilebilir: z.number().int(),
  }).nullable(),
});
export const fasonGidisGovdesi = z.object({ adet: fasonAdedi('Gönderilen adet').positive('Gönderilen adet sıfırdan büyük olmalı.') }).strict();

const kodluKayit = z.object({ id: KIMLIK, kod: z.string().nullable(), ad: z.string() });
export const isEmriKaynagi = z.object({
  tur: z.enum(IS_EMRI_KAYNAK_TURLERI), id: KIMLIK, kod: z.string().nullable(), ad: z.string(),
});

export const adimliEmirOzeti = z.object({
  id: KIMLIK,
  emirNo: z.string(),
  // İş emirli emirde ürün malzeme kartıdır (no); arşivdeki eski emirde null, kod ve ad emrin metnidir.
  urun: z.object({ id: KIMLIK.nullable(), kod: z.string(), ad: z.string() }),
  adet: z.number().int().positive(),
  oncelik: z.number().int().min(1).max(4),
  baslangic: tarihSemasi.nullable(),
  teslim: tarihSemasi.nullable(),
  durum: emirDurumu,
  arsiv: z.boolean(),
  // Bölme ağacı: bölünmemiş emirde üst ve sıra boştur; alt partiler iptal (birleşmiş) olmayan doğrudan alt emirlerdir.
  // birlestigiEmirId: birleştirilip kapanan (iptal) partinin katıldığı emir; diğerlerinde boş.
  // Alan isteğe bağlıdır: sunucu her zaman yazar, bölmeden önce yazılmış istemci verisi de geçerli kalır.
  parti: z.object({
    ustEmirId: KIMLIK.nullable(), bolunmeSira: z.number().int().positive().nullable(), altEmirIdleri: z.array(KIMLIK), birlestigiEmirId: KIMLIK.nullable(),
    // Kolun üste katıldığı ya da katılacağı adımın op numarası; kol olmayan emirde ve planı olmayan açık kolda null.
    birlesmeOpNo: KIMLIK.nullable().optional(),
  }).optional(),
  kaynakRotaRevizyonId: KIMLIK.nullable(),
  // İsteğe bağlı: sunucu her zaman yazar; arşivdeki eski emir 'seri'dir.
  emirTuru: z.enum(EMIR_TURLERI).optional(),
  // İsteğe bağlı: sunucu her zaman yazar; projesiz emirde null.
  projeId: KIMLIK.nullable().optional(),
  // İsteğe bağlı: sunucu her zaman yazar; sipariş satırına bağlı olmayan emirde null.
  siparisSatiriId: KIMLIK.nullable().optional(),
  adimSayisi: z.number().int().nonnegative(),
  tamamAdim: z.number().int().nonnegative(),
  // Bitmemiş ilk iş emri; hepsi bitmişse ya da emir iş emirsizse null.
  siradaki: z.object({
    id: KIMLIK, opNo: z.number().int(), ad: z.string(), durum: isEmriDurumu,
    kaynak: isEmriKaynagi.nullable(), istasyon: kodluKayit.nullable(),
  }).nullable(),
  aciklama: z.string().nullable(),
  acilma: zamanSemasi,
  surum: surumSemasi,
});

export const isEmriSemasi = z.object({
  id: KIMLIK,
  opNo: z.number().int(),
  sira: z.number().int(),
  tip: z.object({ id: KIMLIK, ad: z.string(), kod: z.string() }),
  ad: z.string(),
  // İsteğe bağlı: sunucu her zaman yazar, bu alandan önce yazılmış istemci verisi geçerli kalır.
  tur: z.enum(IS_EMRI_TURLERI).optional(),
  ekAciklama: z.string().nullable().optional(),
  kaynak: isEmriKaynagi.nullable(),
  istasyon: kodluKayit.nullable(),
  ayarSuresiDk: ondalikMetinSemasi.nullable(),
  birimSureDk: ondalikMetinSemasi.nullable(),
  // Yalnız fasonda: takvim günü.
  terminGun: z.number().int().nullable(),
  bagimlilik: z.enum(BAGIMLILIKLAR),
  devirAdedi: z.number().int().nullable(),
  talimatSurumu: z.number().int().nullable(),
  durum: isEmriDurumu,
  baslama: zamanSemasi.nullable(),
  bitis: zamanSemasi.nullable(),
  saglamAdet: z.number().int().nonnegative().nullable(),
  bilesenler: z.array(z.object({ malzeme: kodluKayit, miktar: ondalikMetinSemasi, fireYuzde: ondalikMetinSemasi })),
  adaylar: z.array(z.object({ kaynak: isEmriKaynagi, ayarSuresiDk: ondalikMetinSemasi.nullable(), birimSureDk: ondalikMetinSemasi.nullable() })),
  // Yalnız fason iş emrinde; gidiş ve dönüşler sırayla.
  fason: z.object({
    gonderilen: z.number().int().nonnegative(),
    donenSaglam: z.number().int().nonnegative(),
    donenHurda: z.number().int().nonnegative(),
    hareketler: z.array(z.object({
      id: KIMLIK, yon: z.enum(FASON_YONLERI), adet: z.number().int().nonnegative(), hurdaAdet: z.number().int().nonnegative().nullable(),
      kisi: adliKayit, zaman: zamanSemasi,
    })),
  }).nullable(),
  // Önceki adıma göre işlenmemiş (artı) ya da önceki adımda eksi kalan (eksi) adet; anlamı acikAdimSemasi.eksik ile aynı. İsteğe bağlı: sunucu her zaman yazar.
  eksik: z.number().int().nullable().optional(),
  // Emirde üretim yerinin son değişimi (kim, ne zaman, hangi yere); hiç değişmediyse null. İsteğe bağlı: sunucu her zaman yazar.
  uretimYeriDegisimi: z.object({ yer: z.enum(URETIM_YERLERI), kisi: adliKayit, zaman: zamanSemasi }).nullable().optional(),
});

export const adimliEmirAyrintisi = adimliEmirOzeti.extend({
  isEmirleri: z.array(isEmriSemasi),
  // Arşivdeki eski emrin özgün bilgisi; iş emirli emirde null.
  eski: z.object({
    durum: z.string(), istasyon: kodluKayit.nullable(), baslama: zamanSemasi.nullable(), bitis: zamanSemasi.nullable(),
    saglamAdet: z.number().int().nullable(),
  }).nullable(),
  // 1045 b, 1064: bütün parçası hurda ya da red olan emir durur, yeniden başlamaz; eksik adet için planlama yeni emir açar. Sunucu her
  // ayrıntıda doldurur; isteğe bağlılığı yalnız bu alanı bilmeyen öteki modüllerin test verisi içindir.
  hataliDurdu: z.boolean().optional(),
});

export const adimliListeCevabi = z.object({ emirler: z.array(adimliEmirOzeti) });
// Ana sayfa kartları: arşiv dışı iş emirli emirlerin görünen duruma göre sayısı, listeyi taşımadan. Açık: taslak, planlı ya da başladı.
// Geciken: açık ve teslimi bugünden (tesis günü) önce; teslimsiz emir gecikmiş sayılmaz.
export const adimliOzetCevabi = z.object({
  taslak: z.number().int(), planli: z.number().int(), basladi: z.number().int(), acik: z.number().int(), geciken: z.number().int(), biten: z.number().int(),
});
export const adimliBitenlerCevabi = listeCevapSemasi(adimliEmirOzeti);
export const adimliEmirCevabi = z.object({ emir: adimliEmirAyrintisi });

// Sayım sınırı aşımı (647 a): adımın sayımı, önceki adımın o anki sağlamını aştığında yazılır ama iz bırakır. Satır, aşımı yapan
// sayımdır; adet sınırı geçen kısım, oncekiSaglam aşım anında önceki adımın sağlamıdır. Aşım yoksa liste boştur.
export const asimSemasi = z.object({
  sayimId: KIMLIK,
  isEmriId: KIMLIK,
  opNo: z.number().int().positive(),
  kisi: adliKayit,
  adet: z.number().int().positive(),
  oncekiSaglam: z.number().int().nonnegative(),
  zaman: zamanSemasi,
});
export const asimlarCevabi = z.object({ asimlar: z.array(asimSemasi) });

// Süreler dakikadır; ölçülemeyen değer (sayım yok, başlamamış, ayar yok) null döner.
export const sureOzetiCevabi = z.object({
  isEmriId: KIMLIK,
  baslama: zaman.nullable(),
  bitis: zaman.nullable(),
  saglam: z.number().int(),
  hurda: z.number().int(),
  hazirlikDk: z.number().nullable(),
  brutBirimDk: z.number().nullable(),
  netBirimDk: z.number().nullable(),
  tekliAraliklarDk: z.array(z.number()),
  tekliOrtalamaDk: z.number().nullable(),
});

// İş emirli emri (ayrıntı, refakat kartı) okuyabilen işlemlerden biri yeter; istemci düğmeyi buna göre gösterir.
export const ADIMLI_OKUMA_ISLEMLERI = ['sayfa.uretim-emirleri', 'sayfa.rota', 'uretim-emirleri.yaz', 'uretim-emirleri.fason', 'plan.yaz'] as const;

// 100x150 refakat kartı: emir başına tek kart, tek QR. Adımda istasyon yoksa fason firmanın adı yazılır.
export const refakatKartiCevabi = z.object({
  emirId: KIMLIK,
  qr: z.string(),
  emirNo: z.string(),
  urun: z.object({ kod: z.string(), ad: z.string() }),
  adet: z.number().int().positive(),
  teslim: tarihSemasi.nullable(),
  // Ana emirde üst emir ve sıra boştur.
  parti: z.object({ ustEmirNo: z.string().nullable(), bolunmeSira: z.number().int().positive().nullable() }),
  adimlar: z.array(z.object({ opNo: z.number().int(), ad: z.string(), yer: z.string().nullable(), fason: z.boolean() })),
});

// Hazırlık durdurucuları (120-122 a, denetim #14): eksik madde iş emrinin başlamasını durdurur. Kalibrasyon ve çizim muaf tutulamaz (121 a);
// CNC kurulumu ve özel proses müdürün gerekçesiyle geçilir (264 a). Maddenin durumunu sahibi modül verir; vermeyen madde emirde aranmaz.
export const HAZIRLIK_MADDELERI = ['cnc', 'cizim', 'kalibrasyon', 'ozel-proses'] as const;
export const MUAF_TUTULABILEN_MADDELER = ['cnc', 'ozel-proses'] as const;
export const hazirlikMaddesi = z.enum(HAZIRLIK_MADDELERI);
export const hazirlikMuafiyetiGovdesi = z.object({
  madde: z.enum(MUAF_TUTULABILEN_MADDELER),
  // Boşsa muafiyet emrin bütün iş emirlerinedir.
  isEmriId: KIMLIK.nullable(),
  gerekce: metin(500, 'Gerekçe yaz.'),
});
const hazirlikMuafiyeti = z.object({
  madde: z.enum(MUAF_TUTULABILEN_MADDELER), isEmriId: KIMLIK.nullable(), kisiId: KIMLIK, kisiAdi: z.string().nullable(), gerekce: z.string(), zaman: zamanSemasi,
});
export const hazirlikCevabi = z.object({
  // Madde başına: sahibi bağlı değilse 'bilinmiyor'; emirde aranmıyorsa 'gerekmez'; eksikse 'eksik', muafsa 'muaf'.
  maddeler: z.array(z.object({ madde: hazirlikMaddesi, durum: z.enum(['tamam', 'eksik', 'muaf', 'gerekmez', 'bilinmiyor']), muafTutulur: z.boolean() })),
  muafiyetler: z.array(hazirlikMuafiyeti),
});

export type RefakatKartiCevabi = z.output<typeof refakatKartiCevabi>;
export type HazirlikMaddesi = (typeof HAZIRLIK_MADDELERI)[number];
export type HazirlikMuafiyetiGovdesi = z.output<typeof hazirlikMuafiyetiGovdesi>;
export type HazirlikCevabi = z.output<typeof hazirlikCevabi>;
export type SureOzetiCevabi = z.output<typeof sureOzetiCevabi>;
export type AcikAdim = z.output<typeof acikAdimSemasi>;
export type Asim = z.output<typeof asimSemasi>;
export type AsimlarCevabi = z.output<typeof asimlarCevabi>;
export type IsEmriDurumu = z.output<typeof isEmriDurumu>;
export type AtanabilirKaynak = z.output<typeof atanabilirKaynak>;
export type IsEmriKaynagi = z.output<typeof isEmriKaynagi>;
export type AdimliEmirOzeti = z.output<typeof adimliEmirOzeti>;
export type AdimliEmirAyrintisi = z.output<typeof adimliEmirAyrintisi>;
export type IsEmri = z.output<typeof isEmriSemasi>;
export type AdimliListeSorgusu = z.input<typeof adimliListeSorgusu>;
export type AdimliListeCevabi = z.output<typeof adimliListeCevabi>;
export type AdimliOzetCevabi = z.output<typeof adimliOzetCevabi>;
export type AdimliBitenlerCevabi = z.output<typeof adimliBitenlerCevabi>;
export type AdimliEmirCevabi = z.output<typeof adimliEmirCevabi>;
export type FasonHareketiCevabi = z.output<typeof fasonHareketiCevabi>;
export type PartiBolCevabi = z.output<typeof partiBolCevabi>;
export type PartiBolGovdesi = z.input<typeof partiBolGovdesi>;
export type PartiBirlestirGovdesi = z.input<typeof partiBirlestirGovdesi>;
export type IsEmriTuru = (typeof IS_EMRI_TURLERI)[number];
export type EmirTuru = (typeof EMIR_TURLERI)[number];
export type EkAdim = z.output<typeof ekAdimSemasi>;
export type EkAdimGovdesi = z.input<typeof ekAdimGovdesi>;
export type EkAdimKaldirGovdesi = z.input<typeof ekAdimKaldirGovdesi>;
export type RotasizEmirGovdesi = z.input<typeof rotasizEmirGovdesi>;
export type RotasizAdimEkleGovdesi = z.input<typeof rotasizAdimEkleGovdesi>;
export type RotasizAdimEkle = z.output<typeof rotasizAdimEkleGovdesi>;
export type RotasizAdimDuzenleGovdesi = z.input<typeof rotasizAdimDuzenleGovdesi>;
export type RotasizAdimDuzenle = z.output<typeof rotasizAdimDuzenleGovdesi>;
export type RotasizAdimSilGovdesi = z.input<typeof rotasizAdimSilGovdesi>;
export type BirlesmePlaniGovdesi = z.input<typeof birlesmePlaniGovdesi>;
export type PlanaAlGovdesi = z.input<typeof planaAlGovdesi>;
export type OncelikGovdesi = z.input<typeof oncelikGovdesi>;
export type AdimKaynagiGovdesi = z.input<typeof adimKaynagiGovdesi>;
// Hatalı parça (1033 a, 1034, 1036 a): operatör nedeni ve adedi verir, sonucu seçmez. Parça kola geçer (bölünemeyen emirde emrin kendi
// adımlarına, 4 a); kolun ilk adımı kalite kararı, ikincisi kalite kararıyla planlamanın dolduracağı rework adımıdır.
// Neden terminalin bildiği hurda nedeni kodudur; iş emri verilmezse emrin terminaldeki çalışan adımıdır.
// 1211: kabul ve şartlı kabulde parça olduğu gibi ana partiye katılır; şartlı kabulde stok şartlı olur, not (şart) zorunludur.
export const HATALI_KARARLARI = ['rework', 'hurda', 'red', 'kabul', 'sartli_kabul'] as const;
export const hataliGovdesi = z.object({
  isEmriId: KIMLIK.optional(),
  hurdaNedeniKodu: z.string().regex(NEDEN_KODU, 'Hatalı nedeni seçin.'),
  adet: z.number().int('Adet tam sayı olmalı.').min(1, 'Adet sıfırdan büyük olmalı.').max(AZAMI_SAYIM, `Tek seferde en çok ${AZAMI_SAYIM} adet girilir.`),
  aciklama: z.string().trim().max(300, 'Not en çok 300 karakter olur.').nullish().transform((d) => (d ? d : null)),
}).strict();
// uyari: emrin kendisine adım girdiğinde hatalı adımın bitişinden gelen uyarı (adım sağlamsız biter).
export const hataliCevabi = z.object({
  kayitId: KIMLIK, hedefEmir: z.object({ id: KIMLIK, emirNo: z.string() }), kolAcildi: z.boolean(), uyari: z.string().nullable(),
});
export const hataliKaydiSemasi = z.object({
  id: KIMLIK,
  uretimEmri: z.object({ id: KIMLIK, emirNo: z.string(), parcaNo: z.string(), parcaAd: z.string() }),
  isEmri: z.object({ id: KIMLIK, opNo: z.number().int(), ad: z.string() }),
  hedefEmir: z.object({ id: KIMLIK, emirNo: z.string() }),
  kaliteIsEmriId: KIMLIK,
  reworkIsEmriId: KIMLIK.nullable(),
  hurdaNedeni: z.object({ id: KIMLIK, kod: z.string(), ad: z.string() }),
  adet: z.number().int().positive(),
  aciklama: z.string().nullable(),
  kisi: z.object({ id: KIMLIK, ad: z.string().nullable() }),
  zaman,
  karar: z.enum(HATALI_KARARLARI).nullable(),
  kararKisi: z.object({ id: KIMLIK, ad: z.string().nullable() }).nullable(),
  kararZamani: zaman.nullable(),
  kararNotu: z.string().nullable(),
  ncrKimlik: z.string().nullable(),
});
// Kalite "rework" dedikten sonra planlama ikinci adımı doldurur: ad, operasyon tipi, kaynak (iç ya da fason) ve süre. Fasonda süre yok,
// termin günü vardır (tablo kısıtı); kaynak boş kalırsa adım atanmamış bekler.
export const reworkAdimiGovdesi = z.object({
  ad: metin(80, 'Adım adı zorunlu.'),
  operasyonTipiId: KIMLIK,
  kaynak: z.object({ tur: z.enum(IS_EMRI_KAYNAK_TURLERI), id: KIMLIK }).nullable(),
  ayarSuresiDk: ondalikMetinSemasi.nullable(),
  birimSureDk: ondalikMetinSemasi.nullable(),
  terminGun: z.number().int().min(1).max(365).nullable(),
  aciklama: z.string().trim().max(300).nullish().transform((d) => (d ? d : null)),
  surum: surumSemasi,
}).strict();
// Açık (kararsız) kayıtlar eskiden yeniye, ötekiler yeniden eskiye; emir verilirse o emrin ve kolunun kayıtları.
export const hataliListeSorgusu = z.object({ acik: z.enum(['0', '1']).optional(), emirId: yolKimligi.optional() }).strict();
export const hataliListeCevabi = z.object({ kayitlar: z.array(hataliKaydiSemasi) });

export type UretimYeriGovdesi = z.input<typeof uretimYeriGovdesi>;
export type UretimYeri = (typeof URETIM_YERLERI)[number];
export type FasonFirmalariCevabi = z.output<typeof fasonFirmalariCevabi>;
export type FasonGidisGovdesi = z.input<typeof fasonGidisGovdesi>;
export type SiradakiFasonCevabi = z.output<typeof siradakiFasonCevabi>;
export type HataliGovdesi = z.input<typeof hataliGovdesi>;
export type HataliKaydi = z.output<typeof hataliGovdesi>;
export type HataliCevabi = z.output<typeof hataliCevabi>;
export type HataliKarari = (typeof HATALI_KARARLARI)[number];
export type HataliKaydiOzeti = z.output<typeof hataliKaydiSemasi>;
export type ReworkAdimiGovdesi = z.input<typeof reworkAdimiGovdesi>;
export type HataliListeCevabi = z.output<typeof hataliListeCevabi>;

// Onaylı kapanış (1072 a, 1073 a, 1074 a, 1075 a, 1076 a, 1077 b, 1079 a, 1080 a, 1082 a). Emir son adımda "bitti" olur (ekranda
// "Üretimi bitti"); kapanış bunun üstünde ayrı kayıttır. Maddeler canlı okunur: kendi maddeleri bu modülün, ötekileri sahibi modülün
// çözücüsünden (kablolama.ts) gelir; bağlı olmayan madde 'bilinmiyor' döner ve kapanışı durdurmaz. Eksik madde durdurur; yalnız müdür
// gerekçeyle muaf tutar. Kalite ve müdür onayı sırasızdır, ikisi de gerekir; iki rolü olan kişi ikisini de verebilir (1077 teyit).
export const KAPANIS_MADDELERI = ['is-emirleri', 'ilk-parca', 'hatali', 'olcum', 'izlenebilirlik', 'fason', 'stok', 'sevkiyat', 'ncr'] as const;
// Sahibi başka modül olan maddeler: olcum ve ncr Kalite Merkezi, izlenebilirlik ve stok Stok, sevkiyat Sevkiyat, fason belgesi Satın Alma.
export const DIS_KAPANIS_MADDELERI = ['olcum', 'izlenebilirlik', 'fason', 'stok', 'sevkiyat', 'ncr'] as const satisfies readonly (typeof KAPANIS_MADDELERI)[number][];
export const KAPANIS_MADDE_HALLERI = ['tamam', 'eksik', 'muaf', 'gerekmez', 'bilinmiyor'] as const;
// Görünen aşama: belge (eksik madde var), onay (eksik yok, onay bekliyor), tamam (iki onay verildi; emir kilitli).
export const KAPANIS_ASAMALARI = ['belge', 'onay', 'tamam'] as const;
// Sağlamsız emir (1079 a: bütün parça hurda ya da red) "Kapandı (sağlamsız)" olur; sevkiyat ve stok maddeleri aranmaz.
export const KAPANIS_ONAYLARI = ['kalite', 'mudur'] as const;
export const KAPANIS_OLAYLARI = ['kalite_onay', 'mudur_onay', 'kalite_ret', 'mudur_ret', 'muaf', 'tamamlandi', 'geri_acildi'] as const;

export const kapanisMaddesi = z.enum(KAPANIS_MADDELERI);
const kapanisNotu = z.string().trim().max(500, 'Not en çok 500 karakter.').nullish().transform((d) => (d ? d : null));
const kapanisGerekcesi = metin(500, 'Gerekçe yaz.');
// İlk kayıt emir bitince açılır (sürüm 1); her komut sürümü bir artırır.
export const kapanisOnayGovdesi = z.object({ not: kapanisNotu, surum: surumSemasi }).strict();
// Ret verilmiş onayları düşürür; kapanış açık kalır.
export const kapanisRetGovdesi = z.object({ gerekce: kapanisGerekcesi, surum: surumSemasi }).strict();
export const kapanisMuafGovdesi = z.object({ madde: kapanisMaddesi, gerekce: kapanisGerekcesi, surum: surumSemasi }).strict();
// 1080 a: tamamlanan emri yalnız müdür gerekçeyle geri açar; iki onay yeniden gerekir.
export const kapanisGeriAcGovdesi = z.object({ gerekce: kapanisGerekcesi, surum: surumSemasi }).strict();
// 1064 ve 1079 a: duran (bütün parçası hurda ya da red olmuş) emrin bekleyen adımları kalkar, emir sağlamsız biter ve kapanışa düşer.
// Sürüm emrin sürümüdür.
export const emirKapatGovdesi = z.object({ surum: surumSemasi }).strict();

const kisiZamani = z.object({ kisiId: KIMLIK, kisiAdi: z.string().nullable(), zaman: zamanSemasi });
export const kapanisMaddeSemasi = z.object({
  madde: kapanisMaddesi,
  durum: z.enum(KAPANIS_MADDE_HALLERI),
  // Sahibi modülün tek satırlık açıklaması (ör. "80 / 120 depodan çıktı"); yoksa null.
  ayrinti: z.string().nullable(),
});
export const kapanisMuafiyeti = kisiZamani.extend({ madde: kapanisMaddesi, gerekce: z.string() });
export const kapanisDefterSatiri = kisiZamani.extend({
  olay: z.enum(KAPANIS_OLAYLARI), gerekce: z.string().nullable(), madde: kapanisMaddesi.nullable(),
});
export const kapanisCevabi = z.object({
  uretimEmriId: KIMLIK,
  emirNo: z.string(),
  urun: z.object({ kod: z.string(), ad: z.string() }),
  emirTuru: z.enum(EMIR_TURLERI),
  adet: z.number().int().positive(),
  saglamAdet: z.number().int().nonnegative(),
  bitis: zamanSemasi,
  asama: z.enum(KAPANIS_ASAMALARI),
  // Yalnız tamamda dolu.
  sonuc: z.enum(KAPANIS_SONUCLARI).nullable(),
  // Göçten önce bitmiş emir: onaysız tamam sayıldı (1072 a varsayımı); maddeleri ve onayları yoktur.
  eski: z.boolean(),
  maddeler: z.array(kapanisMaddeSemasi),
  onaylar: z.object({ kalite: kisiZamani.nullable(), mudur: kisiZamani.nullable() }),
  muafiyetler: z.array(kapanisMuafiyeti),
  defter: z.array(kapanisDefterSatiri),
  surum: surumSemasi,
});
// Varsayılan: tamamlanmamış kapanışlar (belge ve onay), en eski biten önce. asama=tamam son tamamlananlar önce.
export const kapanislarSorgusu = z.object({
  ...sayfaSorguAlanlari, asama: z.enum(KAPANIS_ASAMALARI).optional(), ara: aramaMetni,
});
export const kapanisListeSatiri = z.object({
  uretimEmriId: KIMLIK, emirNo: z.string(), urun: z.object({ kod: z.string(), ad: z.string() }),
  adet: z.number().int().positive(), saglamAdet: z.number().int().nonnegative(), bitis: zamanSemasi,
  asama: z.enum(KAPANIS_ASAMALARI), sonuc: z.enum(KAPANIS_SONUCLARI).nullable(),
  // Onaya açık kapanışta verilmemiş onaylar; belge ve tamamda boş.
  bekleyenOnaylar: z.array(z.enum(KAPANIS_ONAYLARI)),
  eksikMadde: z.number().int().nonnegative(),
});
export const kapanisListeCevabi = listeCevapSemasi(kapanisListeSatiri);

export type KapanisMaddesi = (typeof KAPANIS_MADDELERI)[number];
export type DisKapanisMaddesi = (typeof DIS_KAPANIS_MADDELERI)[number];
export type KapanisMaddeHali = (typeof KAPANIS_MADDE_HALLERI)[number];
export type KapanisAsamasi = (typeof KAPANIS_ASAMALARI)[number];
export type KapanisOnayi = (typeof KAPANIS_ONAYLARI)[number];
export type KapanisOlayi = (typeof KAPANIS_OLAYLARI)[number];
export type KapanisSonucu = (typeof KAPANIS_SONUCLARI)[number];
export type KapanisOnayGovdesi = z.input<typeof kapanisOnayGovdesi>;
export type KapanisRetGovdesi = z.input<typeof kapanisRetGovdesi>;
export type KapanisMuafGovdesi = z.input<typeof kapanisMuafGovdesi>;
export type KapanisGeriAcGovdesi = z.input<typeof kapanisGeriAcGovdesi>;
export type EmirKapatGovdesi = z.input<typeof emirKapatGovdesi>;
export type KapanisCevabi = z.output<typeof kapanisCevabi>;
export type KapanislarSorgusu = z.output<typeof kapanislarSorgusu>;
export type KapanisListeSatiri = z.output<typeof kapanisListeSatiri>;
export type KapanisListeCevabi = z.output<typeof kapanisListeCevabi>;
// Sahibi modülün çözücüsünün emir başına verdiği bilgi.
// Sunucu imzası: (db, uretimEmriId) => Promise<KapanisMaddeBilgisi | null>; null ya da kayıtsız madde "bilinmiyor" olur ve durdurmaz.
export interface KapanisMaddeBilgisi { durum: 'tamam' | 'eksik' | 'gerekmez'; ayrinti: string | null }
