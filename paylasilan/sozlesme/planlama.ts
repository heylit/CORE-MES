import { z } from 'zod';
import { HATA_KODLARI } from '../hata.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';
import { PLAN_KURALLARI, itilenPay, planCanliOzeti, senaryolarCevabi } from './plan.ts';
import { PLANLAMA_ANAHTARI_BICIMI, receteRotaDurumCevabi, yazGovdesi } from './recete-rota.ts';
import { isTasiGovdesi, planaAlGovdesi } from './planlama-atolye.ts';

// Planlama sözleşmesi (658 b): planlama sayfası, çalışma kaydı ve plan motoru plan modülünün uçlarıdır (/plan/...). Reçete ve Rota yalnız
// veri verir (receteRotaDurumCevabi); planın alanlarını plan modülü ekler.

const kimlikMetni = z.string();

// Planlama çalışması ve sayfa tercihleri plan modülünün kayıt tablosundadır; gövde Reçete ve Rota'nın kayıt biçimidir, anahtar yalnız planlama anahtarı.
const planlamaAnahtari = z.string().regex(PLANLAMA_ANAHTARI_BICIMI, 'Geçersiz planlama anahtarı.');
// 2129-2 b: çalışmadan düşen bekleyen değişikliğin kararı. Sunucu defteri önceki ve yeni bekleyen listesinden yazar; karar yalnız düşen
// satıra işler. Reddin gerekçesi zorunludur. Kararı gelmeyen düşen satır, plan güncellendiyse uygulanmış, değilse geri alınmış sayılır.
export const BEKLEYEN_KARARLARI = ['uygulandi', 'reddedildi'] as const;
export const DEFTER_GEREKCESI_EN_COK = 500;
export const bekleyenKarari = z.discriminatedUnion('karar', [
  z.object({ id: z.string().min(1).max(200), karar: z.literal('uygulandi') }).strict(),
  z.object({ id: z.string().min(1).max(200), karar: z.literal('reddedildi'), gerekce: z.string().trim().min(1).max(DEFTER_GEREKCESI_EN_COK) }).strict(),
]);
export const planlamaYazGovdesi = yazGovdesi.extend({ anahtar: planlamaAnahtari, kararlar: z.array(bekleyenKarari).max(400).optional() });

// Değişiklik defteri (2129-2 b): en yeni önde, sayfa sayfa. `once` verilirse ondan küçük kimlikliler gelir. Son dört olay planın onay ve
// canlıya alma adımlarıdır (3308-9 a); o satırlarda bekleyenId `plan:<kimlik>` biçimindedir.
export const DEFTER_ONAY_OLAYLARI = ['onaya-gonderildi', 'onaydan-cekildi', 'geri-gonderildi', 'canliya-alindi'] as const;
export const DEFTER_OLAYLARI = ['degisiklik', 'kaynak', 'uygulandi', 'reddedildi', 'geri-alindi', ...DEFTER_ONAY_OLAYLARI] as const;
export const DEFTER_SAYFASI = 100;
export const degisiklikDefteriSorgusu = z.object({ once: z.coerce.number<number>().int().positive().optional() }).strict();
export const defterSatiri = z.object({
  id: z.number().int(),
  olay: z.enum(DEFTER_OLAYLARI),
  bekleyenId: z.string(),
  ne: z.string(),
  ayrinti: z.string(),
  isler: z.array(z.string()),
  gerekce: z.string().nullable(),
  kisi: z.string().nullable(),
  zaman: zamanSemasi,
});
export const degisiklikDefteriCevabi = z.object({ satirlar: z.array(defterSatiri), dahaVar: z.boolean() });
// 2311 S1: planlama çalışmasını en son kimin ne zaman yazdığı ("şu an X düzenliyor" şeridi). Hafif okuma; sayfa kısa aralıkla sorar.
// Kayıt yoksa hepsi null; kişi adı okunamazsa kisi null.
export const duzenleyenCevabi = z.object({
  kisiId: z.number().int().nullable(),
  kisi: z.string().nullable(),
  zaman: zamanSemasi.nullable(),
  surum: z.number().int().nullable(),
});
export const planlamaSilGovdesi = z.object({ anahtar: planlamaAnahtari, beklenenSurum: z.number().int() });

// Planlama sayfasının açılış verisi (288 a): çalışma kaydı (`:planlama`) Reçete ve Rota kaydı ve kaynak okumasıyla sunucuda birleşmiş olarak
// gelir; sayfa birleştirmez. Çalışma yoksa (hiç kaydedilmemiş ya da kayıt biçimi eski) null. Sürüm çalışma kaydınındır (yazmada beklenen
// sürüm); kayıt yoksa null.
// 1962 / 1963 a: birleşme başka sayfadaki değişikliği bulup planı eskittiyse (veri sürümü arttıysa) neyin değiştiği. Alan motor girdisinin
// üst alanıdır; ariza makine durumundan kurulan arızadır, receteRotaKaydi Reçete ve Rota'nın ana kaydıdır. Farklar en çok 50 (yol, eski, yeni);
// kesik, sınırda kesildiyse true. Kişi ve zaman yoktur: birleşme yalnız farkı bilir, kimi değişiklik defteri verir (1975).
export const KAYNAK_DEGISIKLIK_ALANLARI = [
  'tezgahlar', 'personel', 'vardiyalar', 'calismaGunleri', 'tatiller', 'urunler', 'malzemeler', 'siparisler', 'fasoncular', 'opAdet',
  'devamsizlik', 'satinalma', 'ariza', 'receteRotaKaydi',
] as const;
export const KAYNAK_FARKI_EN_COK = 50;
export const kaynakDegisikligi = z.object({
  alanlar: z.array(z.enum(KAYNAK_DEGISIKLIK_ALANLARI)),
  farklar: z.array(z.object({ yol: z.string(), eski: z.unknown(), yeni: z.unknown() })).max(KAYNAK_FARKI_EN_COK),
  kesik: z.boolean(),
  // 3233 a: değişiklik yalnız yeni sipariş eklemekse o siparişlerin kimlikleri (sayfa yalnız onları dizdirir); başka her durumda null ya da yok.
  eklenenSiparisler: z.array(z.string()).nullable().optional(),
});

// 499 a, 506 a: çalışma planı ile canlı plan farkı (atölyenin "canlı planla aynı" rozeti). k: motorun işlem kimliği (sipariş.k), anahtar plan
// modülünün `emirNo|opNo`'su. Saat kıyaslanmaz (canlıya almada saati plan modülü kurar); kıyas tezgâh ve tezgâhtaki sıradır. yeni: canlıda
// yeri yok; tezgah: canlıda başka tezgâhta; sira: aynı tezgâhta sırası değişen (en az iş); eksik: canlıda olup çalışmada yazılacak olmayan
// iş; tasinan = tezgah + sira. Biten ve fason iş sayılmaz. ayni: hiç fark yok. guncel: plan çalışmanın güncel verisiyle çözülmüş (ayni'ya
// karışmaz). yazilamaz: çalışmada olup plan modülünde karşılığı olmayan iş (kişi kaynağı, planlanacak iş emri değil); kıyasa girmez.
// Çalışma ya da çalışmada plan yoksa cevap null.
export const CALISMA_FARKI_TURLERI = ['yeni', 'tezgah', 'sira', 'eksik'] as const;
export const canliFarkiCevabi = z.object({
  planSurumu: z.number().int(), ayni: z.boolean(), guncel: z.boolean(),
  tasinan: z.number().int(), tezgah: z.number().int(), sira: z.number().int(), yeni: z.number().int(), eksik: z.number().int(),
  isler: z.array(z.object({ k: z.string().nullable(), anahtar: z.string(), tur: z.enum(CALISMA_FARKI_TURLERI) })),
  yazilamaz: z.array(z.string()),
}).nullable();

// 505 a, 506 a: taban plan (adımın ilk canlıya alınan yeri, 33 a) ve son canlı plan, sayfanın anahtarlarıyla ("Plan ve gerçekleşen" sekmesi).
// k: çalışmada karşılığı yoksa (çalışma yok, emir sayfada değil) null. Bölünmüş canlı işte parcalar dolu, ana satır zarftır. İş, tabanı
// ya da canlı yeri olan iş emirleridir (biten dahil); ikisi de yoksa listede yoktur.
const planKaynagi = z.object({ tur: z.enum(['makine', 'kisi']), id: z.number().int().positive() });
const planYeri = z.object({ kaynak: planKaynagi, baslangic: zamanSemasi, bitis: zamanSemasi });
export const tabanVeCanliCevabi = z.object({
  planSurumu: z.number().int(),
  isler: z.array(z.object({
    k: z.string().nullable(), anahtar: z.string(), isEmriId: z.number().int().positive(), uretimEmriId: z.number().int().positive(),
    taban: planYeri.extend({ planSurumu: z.number().int() }).nullable(),
    canli: planYeri.extend({ parcalar: z.array(planYeri.extend({ no: z.number().int().positive(), adet: z.number().int().positive() })) }).nullable(),
  })),
});

// 503 a: çalışma planı kişiye yeni plan taslağı olarak yazılır (atölyenin "Onaya gönder" ve "Çalışmayı canlıya al"ı). calismaSurumu
// okunan çalışma kaydının sürümüdür: arada başkası yazdıysa reddedilir; sunucu yalnız kayıtlı çalışmayı yazar. planSurumu verilirse plan
// arada canlıya alındıysa reddedilir. Onaya gönderme ve canlıya alma plan modülünün uçlarıyla kalır.
export const calismaTaslagiGovdesi = z.object({
  ad: z.string().trim().min(1, 'Taslak adı gerekli.').max(80),
  calismaSurumu: z.number().int(),
  planSurumu: z.number().int().nonnegative().optional(),
});
// yazilan, atlanan plan modülünün kuyruk yazmasınındır (atlanan: başlamış, kilitli ya da dondurulmuş iş); yazilamaz canliFarkiCevabi'ndaki gibi.
export const calismaTaslagiCevabi = z.object({
  taslak: z.object({ id: z.number().int().positive(), surum: z.number().int() }),
  yazilan: z.number().int(), atlanan: z.number().int(), yazilamaz: z.array(z.string()),
  // 507 2 a: çalışmanın ek vardiyaları taslağa geçer; atlanan: sunucuda karşılığı olmayan (elle girilmiş, kapsam dışı ya da kullanımda
  // olmayan) makine ya da vardiya. Eski istemciler okumadığı için isteğe bağlı; sunucu her cevapta doldurur.
  ekMesai: z.object({ yazilan: z.number().int(), atlanan: z.number().int() }).optional(),
  // B-2482-14: elle bölmenin adım adedine uyarlanan ya da motorca uygulanmayan payları (iş bütün ya da motorun kendi bölmesiyle yazıldı).
  uyarilar: z.array(z.string()).optional(),
  // 3793: öncülünün sunucudaki bitişinden önce kalan, arkasına itilen paylar.
  itilen: z.array(itilenPay).optional(),
});

// 507 3 a (503'ün tersi): plan taslağının yerleşimleri ve kilitleri çalışmaya yazılır (eski "Çalışmaya aç"ın planı). Yalnız çalışmada
// işlemi olan, bitmemiş, makinedeki iş yazılır; plan "güncel değil" olur, sayfa yeniden çözer. Veri, arıza, tercih ve ağırlıklar yazılmaz.
// taslakSurumu ve calismaSurumu okunan sürümlerdir: arada yazıldıysa reddedilir.
export const taslaktanCalismayaGovdesi = z.object({
  taslakId: z.number().int().positive(), taslakSurumu: z.number().int().positive(), calismaSurumu: z.number().int(),
});
// atlanan: taslakta yerleşik ama çalışmaya yazılamayan iş (anahtar "emir no|OP no"; çalışmada işlemi yok, bitmiş ya da kişide).
// oncekiSurum: geri almanın döneceği sürüm.
export const taslaktanCalismayaCevabi = z.object({
  calismaSurumu: z.number().int(), oncekiSurum: z.number().int(), yazilan: z.number().int(), kilitli: z.number().int(), atlanan: z.array(z.string()),
});
// 508 2 a: çalışma kaydı geçmişteki bir önceki sürümüne döner. calismaSurumu okunan sürümdür: arada başka yazma olduysa reddedilir (409).
export const calismaGeriAlGovdesi = z.object({ calismaSurumu: z.number().int() });
// 3308-5 a: çalışma planı tek komutla onaya gider ya da canlıya alınır. Plan taslağı, onay ve canlıya alma aynı işlemdedir: biri reddedilirse
// hiçbiri yazılmaz, yarım kalmış taslak olmaz. Canlıya alma alanları plan modülünün canlıya alma gövdesindekilerle aynıdır.
export const calismaGonderGovdesi = calismaTaslagiGovdesi.extend({ not: z.string().trim().max(500).nullish() });
// "Canlı değişti" onayı (cakismalariKabul) yoktur: taslak komutla aynı işlemde açılır, tabanı o anki canlıdır. Araya başka canlıya alma
// girerse komut reddedilir ve kişi yeniden yollar.
export const calismaCanliyaAlGovdesi = calismaGonderGovdesi.extend({
  baslayanlar: z.enum(['sabitle']).optional(),
  dortSaatGerekcesi: z.string().max(500).nullable().prefault(null),
});
export const calismaGonderCevabi = calismaTaslagiCevabi.extend({ senaryolar: senaryolarCevabi });
export const calismaGeriAlCevabi = z.object({ calismaSurumu: z.number().int(), donulenSurum: z.number().int() });

// Plan ayarı (kart #1186): prototipin `settings` alan adlarıyla canlı plan ayarı; planın sahibi plan modülüdür.
export const durumAyarSemasi = z.object({
  rule: z.enum(PLAN_KURALLARI),
  dir: z.enum(['ileri', 'geri']),
  buffer: z.number(),
  freezeDays: z.number().int(),
  peopleLimit: z.boolean(),
  planDrafts: z.boolean(),
});

// Planlama sayfasının ve Reçete ve Rota ekranının okuduğu birleşik durum (658 b): Reçete ve Rota'nın verdiği dilimler ve plan modülünün
// alanları; plan modülü birleştirir (GET /plan/planlama-kaynagi), Reçete ve Rota plan okumaz.
export const durumCevabi = receteRotaDurumCevabi.extend({
  // Başlamış adımlar (391 a, kalanın tek kaynağı sunucu): anahtar `emirNo|opNo`; makine terminalin çalıştırdığı, yoksa planınki; kalan
  // verimli dakika son sayım anından (yoksa başlamadan) itibarendir. saglam terminal sayacı, adet adımın işleyeceği adet. Emir yetkisi yoksa null.
  calisanAdimlar: z.array(z.object({
    anahtar: z.string(), makineId: kimlikMetni.nullable(), baslangic: zamanSemasi.nullable(), sayimAni: zamanSemasi.nullable(),
    kalanVerimliDk: z.number(), saglam: z.number().int(), adet: z.number().int(),
    // 3681: bölünmüş adımın payı başına sayım (kişi payında kişinin, makine payında makinenin sağlamı); bölünmemiş adımda ve çözücü bağlı değilken yok.
    paylar: z.array(z.object({ makineId: kimlikMetni.nullable(), kisiId: kimlikMetni.nullable(), sayilan: z.number().int().nonnegative() })).optional(),
  })).nullable().optional(),
  // Canlı plan ayarı; plan okuması oturumla açıktır.
  settings: durumAyarSemasi,
  // Canlı planın özeti: üst şerit "canlı / canlıya alınmadı" der. Plan okuması oturumla açıktır; alan eski sürümde yoktu.
  planCanli: planCanliOzeti.optional(),
  // Kokpit kartlarının sipariş bağı (3297-5 a). Anahtar emir kimliği; siparişe bağlı olmayan emir listede yoktur. `siparis` yalnız gruplama
  // anahtarıdır; no, musteri ve kalem yalnız siparişi okuyabilene gelir (yoksa null). Fiyat taşımaz. Emir yetkisi yoksa null.
  siparisBaglari: z.record(z.string(), z.object({
    siparis: z.string(), no: z.string().nullable(), musteri: z.string().nullable(), kalem: z.number().int().nullable(),
  })).nullable().optional(),
});

// Plan kapasitesi (kart #1324): Vardiya takviminden prototipin kendi vardiya hesabına eklediği farklar; bugünden KAPASITE_GUNU gün.
// Fazla mesai dakikası vardiyayla örtüşmeyen planlı çalışmadır (yalnız sıfırdan büyük günler). İstasyon satırı yalnız istasyona özel
// fazla mesaisi olan istasyonda gelir (iş merkezininkini de içerir). Kişide izinli onaylı izin günleri, paylar iş merkezi başına atama
// yüzdesi / 100. Okuma yetkisi olmayan dilim null.
export const KAPASITE_GUNU = 180;
const gunDakikasi = z.object({ tarih: tarihSemasi, dakika: z.number().int().positive() });
export const kapasiteCevabi = z.object({
  baslangic: tarihSemasi,
  isMerkezleri: z.array(z.object({ id: kimlikMetni, fazlaMesai: z.array(gunDakikasi) })).nullable(),
  istasyonlar: z.array(z.object({ id: kimlikMetni, fazlaMesai: z.array(gunDakikasi) })).nullable(),
  kisiler: z.array(z.object({
    id: kimlikMetni, izinli: z.array(tarihSemasi), fazlaMesai: z.array(gunDakikasi), paylar: z.array(z.object({ wcId: kimlikMetni, pay: z.number().positive() })),
  })).nullable(),
});

// 525 1 a, 533 a: planın satın alma eki (çerçevenin kaynak okuması ve sunucunun birleştirmesi aynı veriyi alır). `acikSiparisler`: ham
// malzemenin açık satın alma siparişinden kalan miktar (malzemenin biriminde) ve beklenen teslim günü; satın almayı okuyamayana null.
// `tedarikTerminleri`: malzemenin Satın Alma'daki tedarik termini ve yazma sürümü; satırı olmayan malzeme listede yoktur. `kod` plandaki
// malzeme kodudur (kartın numarası). Malzemeleri okuyamayana ikisi de null.
export const satinAlmaEkiCevabi = z.object({
  // 3369: `satir` gelişin Satın Alma'daki kararlı anahtarı (plan kaydındaki malzeme payı bununla eşlenir), `tedarikci` teklifteki ad.
  acikSiparisler: z.array(z.object({
    kod: kimlikMetni, miktar: z.number().positive(), tarih: tarihSemasi.nullable(), siparisNo: z.string(),
    satir: z.number().int().optional(), tedarikci: z.string().nullable().optional(),
  })).nullable(),
  tedarikTerminleri: z.array(z.object({ kod: kimlikMetni, termin: tarihSemasi.nullable(), surum: z.number().int(), aciklama: z.string() })).nullable(),
  // 1280 a, 1329: ham malzemenin fiyatı Satın Alma'dandır; plan kendi kg listesini tutmaz. `alisFiyati` teslim edilmiş siparişlerin TL ağırlıklı
  // ortalama birim fiyatı (malzemenin biriminde), `kg` Satın Alma'da geçerli son kg fiyatı ve tarihi (yalnız başvuru; alış yoksa tahmini birim
  // fiyat olur). Hesaplanamayan null. Yalnız maliyeti görene (finans.maliyet-oku) dolar, göremeyene null; alan eski sürümde yoktu.
  malzemeFiyatlari: z.array(z.object({
    kod: kimlikMetni,
    alisFiyati: z.number().nonnegative().nullable(),
    teslimSayisi: z.number().int().nonnegative(),
    kg: z.object({
      kaliteKodu: z.string(), form: z.string().nullable(), gecerlilik: tarihSemasi,
      kgFiyati: z.number().nonnegative(), paraBirimi: z.string(), tlKgFiyati: z.number().nonnegative().nullable(), tlBirimFiyati: z.number().nonnegative().nullable(),
    }).nullable(),
  })).nullable().optional(),
});

export const planlamaCalismasiCevabi = z.object({
  calisma: z.record(z.string(), z.unknown()).nullable(),
  surum: z.number().int().nullable(),
  // Yalnız planlama sayfasının okumasında; değişiklik yoksa null ya da yok.
  kaynakDegisikligi: kaynakDegisikligi.nullable().optional(),
  // 3725: yalnız planlama sayfasının okumasında (GET /plan/planlama-calismasi), ayrı uçlarındaki cevabın aynısı; ayrı uçların yetkisi
  // olmayana null. Öteki okumalarda yok.
  kaynak: durumCevabi.nullable().optional(),
  satinAlmaEki: satinAlmaEkiCevabi.nullable().optional(),
});

// Planlama değerlendirmesi (Soru 357 a): planlama sayfasının tarayıcıda motoru koşturan kartları sunucuda hesaplanır. Uç yalnız okur:
// kayıtlı ve sunucuda birleşmiş çalışmayla (288 a) planlar kurulur ve karşılaştırılır, sonuç döner; hiçbir kayıt yazılmaz. Ekran çalışma
// göndermez, neyin deneneceğini gönderir; `surum` çalışma kaydının sürümü değilse hesap yapılmaz (409). Saatler çalışmanın ekseninde
// (başlangıç günü 00:00'dan saat), terminler çalışmanın biçiminde ('GGGG-AA-GG SS:DD'). Veri yoksa null. TL alanları yalnız maliyeti
// görene (finans.maliyet-oku) döner, göremeyende null'dır (`maliyetGorunur`). `plan` çalışmanın plan kaydı biçimindedir (S.plan,
// dataVer çalışmanınki); ekran seçeneği alırsa kendi yazma yoluyla yazar.
export const DEGERLENDIRME_TURLERI = [
  'plan-kur', 'plan-uygula', 'plan-secenekleri', 'termin-secenekleri', 'termin-uzatma', 'malzeme-terminleri', 'malzeme-one-cekme', 'parti-bolme',
  'plan-iyilestir', 'one-al', 'sira-degistir',
] as const;
export const TERMIN_UZATMA_GUNLERI = [1, 2, 3, 5] as const;
export const PARTI_SAYISI_EN_COK = 20;
export const SIRA_EN_COK = 60;
const planSiparisi = z.string().min(1).max(80);
export const degerlendirmeIstegi = z.discriminatedUnion('tur', [
  // Planı kur (576): kuraldan sıfırdan kurar; kayıtlı plan kullanılmaz.
  z.object({ tur: z.literal('plan-kur') }).strict(),
  // Bekleyen değişikliği uygula (755 a): kayıtlı plan taban alınır, yalnız verilen siparişlerin işleri yeniden dizilir; '*' bütün işler.
  // Kilitli ve donuk bölgedeki işler yerinde kalır.
  z.object({ tur: z.literal('plan-uygula'), isler: z.array(z.union([planSiparisi, z.literal('*')])).min(1).max(5000) }).strict(),
  z.object({ tur: z.literal('plan-secenekleri') }).strict(),
  z.object({ tur: z.literal('termin-secenekleri'), siparisId: planSiparisi }).strict(),
  z.object({ tur: z.literal('termin-uzatma'), gun: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5)]) }).strict(),
  z.object({ tur: z.literal('malzeme-terminleri') }).strict(),
  z.object({ tur: z.literal('malzeme-one-cekme') }).strict(),
  // adetler null: yalnız darboğaz bilgisi (form için); verilirse toplamı siparişin adedi olmalı.
  z.object({
    tur: z.literal('parti-bolme'), siparisId: planSiparisi, dagitim: z.enum(['ayni', 'dag']),
    adetler: z.array(z.number().int().positive()).min(2).max(PARTI_SAYISI_EN_COK).nullable(),
  }).strict(),
  // 2129-1 b: kayıtlı planı iyileştirme araması ve siparişi öne alma önizlemesi. Plan güncel olmalı; sonuç yazılmaz, ekran kabul ederse yazar.
  z.object({ tur: z.literal('plan-iyilestir') }).strict(),
  z.object({ tur: z.literal('one-al'), siparisId: planSiparisi }).strict(),
  // 2149: tezgâh kuyruğunda sıra. `sira` adımların istenen sırasıdır; başka tezgâhtaki adım bu tezgâha taşınır. Sabit ve başlamış adım yerinde kalır.
  z.object({
    tur: z.literal('sira-degistir'), tezgah: planSiparisi,
    sira: z.array(planSiparisi).min(1).max(SIRA_EN_COK).refine((l) => new Set(l).size === l.length, 'Aynı adım iki kez verilemez.'),
  }).strict(),
]);
// İki adım (463 a): başlatma girdiyi okur ve hesabı başlatır, sonuç kimlikle transaction açmadan okunur; hesap uç transaction'ını beklemez.
export const degerlendirmeGovdesi = z.object({ surum: z.number().int().positive(), istek: degerlendirmeIstegi }).strict();
export const degerlendirmeBaslatCevabi = z.object({ is: z.guid() });
export const degerlendirmeParametresi = z.object({ is: z.guid() });

const tl = z.number().nullable();
const saatDegeri = z.number();
const planTermini = z.string();
const planKaydiSemasi = z.record(z.string(), z.unknown());
const ekMesaiSemasi = z.object({ makineId: z.string(), gun: z.number().int(), vardiya: z.string(), tl });
const planKur = z.object({ tur: z.literal('plan-kur'), plan: planKaydiSemasi });
const planUygula = z.object({ tur: z.literal('plan-uygula'), plan: planKaydiSemasi });
const planSecenekleri = z.object({
  tur: z.literal('plan-secenekleri'),
  // en az bir aday bedeli bilinmediği için ele alınmadı (seçilen ek mesailerin hepsinin bedeli bilinir)
  bedeliBilinmeyenEkMesai: z.boolean(),
  secenekler: z.array(z.object({
    // çubuğun konumu (0 termin önce, 100 kâr önce) ve gecikme bedelinin çarpanı
    denge: z.number().min(0).max(100), carpan: z.number(),
    ekMesai: z.array(ekMesaiSemasi), ekMesaiTl: tl,
    geciken: z.number().int(), isSayisi: z.number().int(), gecikmeSaat: saatDegeri,
    // fiyatı bilinen siparişlerin net kârı toplamından ek mesai bedeli düşülmüş; eksik: fiyatı ya da maliyeti eksik sipariş sayısı
    netKar: tl, eksik: z.number().int(),
    plan: planKaydiSemasi,
  })),
});
const terminSecenekleri = z.object({
  tur: z.literal('termin-secenekleri'),
  siparisId: z.string(), havuz: z.boolean(),
  // karşılaştırma tabanı: havuzdaki teklif için siparişsiz plan, plandaki sipariş için girilen terminli plan
  taban: z.enum(['siparissiz', 'girilen-termin']),
  yerlesti: z.boolean(),
  satirlar: z.array(z.object({
    secenek: z.enum(['en-erken', '3-gun', '7-gun', '14-gun', 'girilen']), termin: planTermini,
    bitis: z.number().nullable(), gecikmeSaat: z.number().nullable(), tutar: tl, netKar: tl,
    digerKarFarki: tl, digerGecikmeFarki: z.number().nullable(), toplamKar: tl,
  })),
});
const terminUzatma = z.object({
  tur: z.literal('termin-uzatma'),
  gun: z.number().int(),
  // gecikme bedeli en büyük altı sipariş; planı en çok iyileştiren üstte
  satirlar: z.array(z.object({
    siparisId: z.string(), yeniTermin: planTermini, gecikmeSimdi: z.number().nullable(), gecikmeUzatinca: z.number().nullable(),
    netKarFarki: tl, gecikmeSaatFarki: saatDegeri, gecikenFarki: z.number().int(),
  })),
});
export const DEGERLENDIRME_TERMIN_DURUMLARI = ['termin', 'termin-bekleniyor', 'siparis-yok'] as const;
export const DEGERLENDIRME_MALZEME_DURUMLARI = ['hizlandir', 'plan-once-istiyor', 'ertelenebilir', 'uygun', 'bagli-is-yok', 'siparis-yok'] as const;
const malzemeTerminleri = z.object({
  tur: z.literal('malzeme-terminleri'),
  // siparis: satın alma satırı (satinalmaSira çalışmadaki satın alma satırının sırası; plana tahmini eklenen satırda null), eksik: siparişi verilmemiş ihtiyaç
  satirlar: z.array(z.object({
    tur: z.enum(['siparis', 'eksik']), satinalmaSira: z.number().int().nullable(), termin: z.enum(DEGERLENDIRME_TERMIN_DURUMLARI),
    kod: z.string(), miktar: z.number(), tedarikci: z.string().nullable(),
    soz: z.number().nullable(), etkin: z.number().nullable(), plan: z.number().nullable(), enGec: z.number().nullable(),
    farkGun: z.number().nullable(), siparisEnGec: z.number().nullable(),
    durum: z.enum(DEGERLENDIRME_MALZEME_DURUMLARI), isler: z.array(z.string()),
  })),
});
const malzemeOneCekme = z.object({
  tur: z.literal('malzeme-one-cekme'),
  gunler: z.array(z.number().int()),
  taban: z.object({ tl, gecikmeSaat: saatDegeri, geciken: z.number().int(), yerlesmeyen: z.number().int() }),
  satirlar: z.array(z.object({
    satinalmaSira: z.number().int().nullable(), kod: z.string(), tedarikci: z.string().nullable(), soz: z.number(), isler: z.array(z.string()),
    kazanc: z.array(z.object({ gun: z.number().int(), tl, saat: saatDegeri, geciken: z.number().int(), kurtulan: z.array(z.string()) })),
  })),
});
const partiBolme = z.object({
  tur: z.literal('parti-bolme'),
  siparisId: z.string(),
  darbogaz: z.object({ adim: z.string(), makineId: z.string(), alternatifler: z.array(z.string()) }).nullable(),
  sonuc: z.object({
    partiler: z.array(z.object({ siparisId: z.string(), adet: z.number().int(), makineId: z.string().nullable() })),
    gecikmeOnce: saatDegeri, gecikmeSonra: saatDegeri, bitisSonra: z.number().nullable(), tl,
    // bölünmüş sipariş kayıtları (çalışmanın sipariş biçimi) ve onlarla kurulan plan
    siparisler: z.array(z.record(z.string(), z.unknown())), plan: planKaydiSemasi,
  }).nullable(),
});
// Önizlemede bitişi değişen sipariş: önceki ve yeni bitiş (plan saati; yerleşmediyse null) ve gecikme durumundaki değişim.
export const HAMLE_DURUMLARI = ['zamanina-girdi', 'gecikmeye-dustu', 'ayni'] as const;
const degisenSiparis = z.object({ siparisId: z.string(), once: z.number().nullable(), sonra: z.number().nullable(), durum: z.enum(HAMLE_DURUMLARI) });
// plan null: daha iyisi bulunamadı (iyileştirme) ya da sipariş öne alınamadı (öne al); neden metni yalnız o durumda.
const planIyilestir = z.object({
  tur: z.literal('plan-iyilestir'),
  plan: planKaydiSemasi.nullable(), gecikmeOnce: saatDegeri, gecikmeSonra: z.number().nullable(), degisen: z.array(degisenSiparis),
});
const oneAl = z.object({
  tur: z.literal('one-al'),
  siparisId: z.string(), plan: planKaydiSemasi.nullable(), yol: z.string().nullable(), neden: z.string().nullable(),
  bitisOnce: z.number().nullable(), bitisSonra: z.number().nullable(), gecikmeOnce: saatDegeri, gecikmeSonra: z.number().nullable(),
  degisen: z.array(degisenSiparis),
});
// plan null: sıra kurulamadı ya da motor istenen sırayı tutamadı; neden metni yalnız o durumda. `sira` sonuçtaki sıradır (plan null ise kayıtlı).
const siraDegistir = z.object({
  tur: z.literal('sira-degistir'),
  tezgah: z.string(), sira: z.array(z.string()), plan: planKaydiSemasi.nullable(), neden: z.string().nullable(),
  gecikmeOnce: saatDegeri, gecikmeSonra: z.number().nullable(), degisen: z.array(degisenSiparis),
});
export const degerlendirmeSonucu = z.discriminatedUnion('tur', [
  planKur, planUygula, planSecenekleri, terminSecenekleri, terminUzatma, malzemeTerminleri, malzemeOneCekme, partiBolme,
  planIyilestir, oneAl, siraDegistir,
]);
export const degerlendirmeCevabi = z.object({
  calismaSurumu: z.number().int(),
  dataVer: z.number(),
  baslangic: tarihSemasi.nullable(),
  // planın şimdisi (saat), sunucunun saatinden
  simdi: z.number(),
  maliyetGorunur: z.boolean(),
  sonuc: degerlendirmeSonucu,
});
// Hesap sırasında çıkan ret (plan yok, sipariş yok, adet, süre) uçtaki hatanın kodu ve iletisiyle döner.
export const degerlendirmeDurumuCevabi = z.discriminatedUnion('durum', [
  z.object({ durum: z.literal('suruyor') }),
  z.object({ durum: z.literal('bitti'), cevap: degerlendirmeCevabi }),
  z.object({ durum: z.literal('hata'), kod: z.enum(HATA_KODLARI), mesaj: z.string() }),
]);
// Yıllık plan çözümü (454/6 a): kaba kapasite modeli (LP metni) sayfada kurulur, HiGHS sunucuda çözer; tarayıcıda çözücü yoktur. Çözüm
// 60 saniyeye kadar sürer ve uç transaction'ı o kadar bekleyemez: başlatma iş kimliğiyle hemen döner, sonuç kimlikle okunur.
// Gövde sınırı sunucunun istek sınırının (1 MiB) altında kalır.
export const YILLIK_LP_AZAMI = 900_000;
export const YILLIK_SUTUN_AZAMI = 20_000;
export const yillikCozGovdesi = z.object({
  lp: z.string().min(1).max(YILLIK_LP_AZAMI),
  // saniye; HiGHS'in zaman sınırı
  sure: z.number().int().min(1).max(60),
  // değeri ve gölge fiyatı istenen sütunlar
  want: z.array(z.string().min(1).max(80)).max(YILLIK_SUTUN_AZAMI),
});
export const yillikCozBaslatCevabi = z.object({ is: z.guid() });
export const yillikCozParametresi = z.object({ is: z.guid() });
// HiGHS'in cevabı: model durumu (7 en iyi, 13 süre doldu, 8 çözüm yok, 14 adım sınırı), amaç (sonlu değilse null), istenen sütunların
// değeri ve indirgenmiş maliyeti (çözücü vermezse null).
export const yillikCozumSemasi = z.object({
  s: z.number().int(),
  ob: z.number().nullable(),
  val: z.record(z.string(), z.number()).nullable(),
  dual: z.record(z.string(), z.number().nullable()).nullable(),
});
export const yillikCozDurumuCevabi = z.discriminatedUnion('durum', [
  z.object({ durum: z.literal('suruyor') }),
  z.object({ durum: z.literal('bitti'), cozum: yillikCozumSemasi }),
  z.object({ durum: z.literal('hata'), mesaj: z.string() }),
]);
export type PlanlamaYazGovdesi = z.output<typeof planlamaYazGovdesi>;
export type BekleyenKarari = z.output<typeof bekleyenKarari>;
export type DefterOlayi = (typeof DEFTER_OLAYLARI)[number];
export type DefterSatiri = z.output<typeof defterSatiri>;
export type DegisiklikDefteriCevabi = z.output<typeof degisiklikDefteriCevabi>;
export type DuzenleyenCevabi = z.output<typeof duzenleyenCevabi>;
export type PlanlamaSilGovdesi = z.output<typeof planlamaSilGovdesi>;
export type PlanlamaCalismasiCevabi = z.output<typeof planlamaCalismasiCevabi>;
export type KaynakDegisikligi = z.output<typeof kaynakDegisikligi>;
export type KaynakDegisiklikAlani = (typeof KAYNAK_DEGISIKLIK_ALANLARI)[number];
export type CanliFarkiCevabi = z.output<typeof canliFarkiCevabi>;
export type TabanVeCanliCevabi = z.output<typeof tabanVeCanliCevabi>;
export type CalismaTaslagiGovdesi = z.output<typeof calismaTaslagiGovdesi>;
export type CalismaTaslagiCevabi = z.output<typeof calismaTaslagiCevabi>;
export type CalismaGonderGovdesi = z.output<typeof calismaGonderGovdesi>;
export type CalismaCanliyaAlGovdesi = z.output<typeof calismaCanliyaAlGovdesi>;
export type CalismaGonderCevabi = z.output<typeof calismaGonderCevabi>;
export type TaslaktanCalismayaGovdesi = z.output<typeof taslaktanCalismayaGovdesi>;
export type TaslaktanCalismayaCevabi = z.output<typeof taslaktanCalismayaCevabi>;
export type CalismaGeriAlCevabi = z.output<typeof calismaGeriAlCevabi>;
export type DurumCevabi = z.output<typeof durumCevabi>;
export type KapasiteCevabi = z.output<typeof kapasiteCevabi>;
export type SatinAlmaEkiCevabi = z.output<typeof satinAlmaEkiCevabi>;
export type DegerlendirmeIstegi = z.output<typeof degerlendirmeIstegi>;
export type DegerlendirmeSonucu = z.output<typeof degerlendirmeSonucu>;
export type DegerlendirmeCevabi = z.output<typeof degerlendirmeCevabi>;
export type DegerlendirmeGovdesi = z.output<typeof degerlendirmeGovdesi>;
export type DegerlendirmeDurumuCevabi = z.output<typeof degerlendirmeDurumuCevabi>;
export type YillikCozGovdesi = z.output<typeof yillikCozGovdesi>;
export type YillikCozumu = z.output<typeof yillikCozumSemasi>;
export type YillikCozDurumuCevabi = z.output<typeof yillikCozDurumuCevabi>;

// 3282 1d: kişinin taslağı. Kokpit'te planlayanın kararları (taşı, plana al, ayar, emrin yönü) önce kişinin taslağına komut olarak yazılır;
// ortak çalışma değişmez, başkasının yazması taslağı bozmaz. Görünüm her okumada güncel ortak çalışmaya komutlar yeniden oynatılarak kurulur.
// "Uygula" komutları tek işlemde ortak çalışmaya yazar; taslak açıldığından beri başkasının değiştirdiği emir, tezgâh ya da plan ayarına
// dokunan komut için seçim ister. Bu, plan modülünün onaya giden plan taslağından (calismaTaslagiGovdesi) ayrıdır.
export const TASLAK_KOMUTU_EN_COK = 200;
const taslakKimlik = z.string().trim().min(1).max(120);
// Motorun en uzun ufku 182 gün (motor/engine.js UFUK_ENCOK); ufkun kendisi çalışmanın ayarıdır, sunucu komutta ayrıca sınar.
const durusSaati = z.number().min(0).max(182 * 24).multipleOf(0.25);
const ekMesaiGunu = z.number().int().min(0).max(182);
// 3652: acik = sert kısıt, uyari = plan sınırlamaz ama kullanım sayılır ve aşım uyarılır, kapali = plan kaynağı hiç saymaz.
export const KAYNAK_KISIT_KIPLERI = ['acik', 'uyari', 'kapali'] as const;
export type KaynakKisitKipi = (typeof KAYNAK_KISIT_KIPLERI)[number];
// Ayar komutu Kokpit Ayarlar panelinin alanlarıdır (istemci kokpit/ayarlar.ts AYAR_ALANLARI); sınırlar aynı.
export const taslakAyarlari = z.object({
  w: z.object({
    dondurma: z.number().min(0).max(72), mat: z.enum(['karma', 'uyari', 'sert']), yon: z.enum(['ileri', 'geri']), gerideTasinir: z.boolean(),
    famK: z.number().min(0).max(1),
  }).partial().strict(),
  param: z.object({
    tampon: z.boolean(), tamponZ: z.number().min(0).max(3), mesaiHafta: z.number().min(0).max(60), maxChg: z.number().int().min(0).max(500),
    geriTamponGun: z.number().int().min(0).max(30), chgTL: z.number().min(0).max(100000),
  }).partial().strict(),
  // Çalışmanın süre ayarları (D.ayarlar); eski satırlarda alan yoktur.
  ayarlar: z.object({
    programSaat: z.number().min(0).max(72), faiSaat: z.number().min(0).max(24), transferOran: z.number().min(0.05).max(1), tasimaSaat: z.number().min(0).max(24),
  }).partial().strict().optional(),
  // Açılan ve kapanan kısıtlar (çalışmanın kapali listesi).
  ac: z.array(taslakKimlik).max(40), kapat: z.array(taslakKimlik).max(40),
  // 3652: aparat, ölçü aleti ve takım kısıtının kipi (çalışmanın kisitKipi alanı). Gelen tür yazılır; gelmeyen tür kayıtlı kipini korur.
  kisitKipi: z.object({ aparat: z.enum(KAYNAK_KISIT_KIPLERI), olcu: z.enum(KAYNAK_KISIT_KIPLERI), takim: z.enum(KAYNAK_KISIT_KIPLERI) }).partial().strict().optional(),
}).strict();
export const taslakKomutu = z.discriminatedUnion('tur', [
  isTasiGovdesi.omit({ calismaSurumu: true }).extend({ tur: z.literal('tasi') }).strict(),
  planaAlGovdesi.omit({ calismaSurumu: true }).extend({ tur: z.literal('plana-al') }).strict(),
  z.object({ tur: z.literal('ayar'), ayar: taslakAyarlari, ayrinti: z.string().trim().max(500) }).strict(),
  z.object({ tur: z.literal('yon'), emirId: taslakKimlik, yon: z.enum(['plan', 'ileri', 'geri']) }).strict(),
  // 3335-2: kişinin yeniden planlama isteği. isler emir kimlikleridir; tek başına '*' bütün plandır. Veri değişmez, dizme işleri yeniden dizer.
  // baslamisDiz (3600): başlamış işlerin kalanı da dizilir; yalnız plan.baslamis-diz taşıyan yazabilir (komut yazılırken ve Uygula'da denetlenir).
  // kilitKaldir (3600): istenen emirlerin başlamamış işlerindeki elle kilitler kalkar ve dizme geçici (denge) kilidi tutmaz; Geri al kilitleri getirir.
  z.object({ tur: z.literal('yeniden-planla'), isler: z.array(taslakKimlik).min(1).max(5000).refine((l) => !l.includes('*') || l.length === 1, { message: "'*' tek başına verilir." }), kilitKaldir: z.boolean().optional(), baslamisDiz: z.boolean().optional() }).strict(),
  // 3282 2a-1: tezgâhın elle girilen arıza ya da bakım duruşu (çalışmanın down satırı). bas ve bit planın ekseninde saattir (başlangıç
  // gününün 00:00'ı 0), çeyrek saat adımlı. Silme satırı değeriyle bulur; otomatik (arızadan ya da bakım planından gelen) satır silinmez.
  z.object({ tur: z.literal('durus'), tezgah: taslakKimlik, bas: durusSaati, bit: durusSaati, neden: z.enum(['arıza', 'bakım']) }).strict(),
  z.object({ tur: z.literal('durus-sil'), tezgah: taslakKimlik, bas: durusSaati, bit: durusSaati }).strict(),
  // 3282 2a-2: ek mesai tezgâha gün ve vardiya açar; personel o vardiyada tezgâhı çalıştıracak kişidir (3282-7 b), boşsa operatörsüz.
  z.object({ tur: z.literal('ek-mesai'), tezgah: taslakKimlik, gun: ekMesaiGunu, vardiya: taslakKimlik, personel: taslakKimlik.nullable() }).strict(),
  z.object({ tur: z.literal('ek-mesai-sil'), tezgah: taslakKimlik, gun: ekMesaiGunu, vardiya: taslakKimlik }).strict(),
  // 3335-3b: adımda sorun bildir, "adım uzadı". isId motorun işlem kimliğidir (emir.adım); ekSaat adımın süresine eklenen saattir (çeyrek
  // saat adımlı). Aynı adıma yeni bildirim öncekinin yerine geçer. Oran ya da bitiş istemciden alınmaz; sunucu çalışmadan okur.
  z.object({ tur: z.literal('adim-uzadi'), isId: taslakKimlik, ekSaat: z.number().min(0.25).max(240).multipleOf(0.25) }).strict(),
  z.object({ tur: z.literal('adim-uzadi-sil'), isId: taslakKimlik }).strict(),
  // 3335-3c: adımda sorun bildir, "malzeme yok" ve "kişi yok": adım kadar'dan önce başlayamaz. kadar planın ekseninde saattir (başlangıç
  // gününün 00:00'ı 0, çeyrek saat adımlı); şimdiden sonra ve ufuk içinde olduğunu sunucu denetler. Aynı adıma yeni bildirim öncekinin yerine geçer.
  z.object({ tur: z.literal('adim-bekler'), isId: taslakKimlik, kadar: durusSaati, neden: z.enum(['malzeme', 'kisi']) }).strict(),
  z.object({ tur: z.literal('adim-bekler-sil'), isId: taslakKimlik }).strict(),
  // 3488 c: adımı elle böl. isId adımın kimliğidir (emir.adım, pay eki yok); paylar 2-6 parça, her biri adet ve adımın uygun tezgâhı. Adet
  // toplamı adımın adedidir (sunucu denetler). Aynı adıma yeni bölme öncekinin yerine geçer; sil bölmeyi kaldırır, motor yine kendisi yerleştirir.
  z.object({ tur: z.literal('elle-bol'), isId: taslakKimlik, paylar: z.array(z.object({ adet: z.number().int().min(1).max(1_000_000), tezgah: taslakKimlik }).strict()).min(2).max(6) }).strict(),
  z.object({ tur: z.literal('elle-bol-sil'), isId: taslakKimlik }).strict(),
]);
// taslakSurumu: sayfanın gördüğü taslak sürümü (taslak yoksa null); iki sekmede aynı kişinin yazması birbirini ezmez.
export const taslakKomutGovdesi = z.object({ taslakSurumu: z.number().int().nullable(), komut: taslakKomutu }).strict();
export const taslakSurumGovdesi = z.object({ taslakSurumu: z.number().int() }).strict();
// secimler: çatışma anahtarı başına karar; 'benim' komutu yine uygular, 'onun' komutu taslaktan düşer.
export const taslakUygulaGovdesi = z.object({
  taslakSurumu: z.number().int(),
  secimler: z.record(z.string().max(130), z.enum(['benim', 'onun'])).optional(),
}).strict();
// 3282 1d-2: taslağın yeniden dizilmesi. Değerlendirme taslağın görünümünde koşar (ortak çalışmanınki gibi, işçi ve kişi başına tek iş);
// sonucu yalnız sunucu tutar. diz o işin planını taslağa komut olarak yazar; plan istemciden alınmaz (Risk 1d-2 K1).
export const taslakDegerlendirmeGovdesi = z.object({ taslakSurumu: z.number().int(), istek: degerlendirmeIstegi }).strict();
export const taslakDizGovdesi = z.object({ taslakSurumu: z.number().int(), is: z.guid() }).strict();
// Satırdaki komut: kişinin gönderdikleri ve sunucunun yazdığı dizme (planı satırda gösterilmez).
export const taslakSatirKomutu = z.union([taslakKomutu, z.object({ tur: z.literal('diz'), isler: z.array(z.string()) }).strict()]);
// Komut satırı: sunucunun yazdığı ad ve zamanla. hata: güncel ortak çalışmaya artık uygulanamıyorsa nedeni (başladı, emir kalktı, plan
// yeniden dizilmeli...).
export const taslakSatiri = z.object({ komut: taslakSatirKomutu, ne: z.string(), t: z.number(), hata: z.string().nullable() });
export const taslakCevabi = z.object({
  taslak: z.object({ surum: z.number().int(), tabanSurum: z.number().int(), satirlar: z.array(taslakSatiri) }).nullable(),
  // Taslağın uygulanmış görünümü; taslak yoksa ortak çalışma. surum ortak çalışmanın sürümüdür.
  calisma: z.record(z.string(), z.unknown()).nullable(),
  surum: z.number().int().nullable(),
});
// Uygula: çatışma varsa ve seçim eksikse yazılmaz, çatışmalar döner. anahtar: 'emir:<id>', 'tezgah:<id>' ya da '*' (plan ayarı ya da yeniden dizilen plan).
// kaynaklar (3733): anahtara araya giren değişikliği kimin, ne zaman, neyle yaptığı. sinif: ben (kişinin başka penceredeki değişikliği),
// diger (başka kişi), ayar (plan ayarı; kim yaptıysa), eksen (plan ekseni kaydı; sistem). Veri yenilemesi çatışma sayılmaz, listelenmez.
export const taslakCatismaKaynagi = z.object({
  sinif: z.enum(['ben', 'diger', 'ayar', 'eksen']), kim: z.string(), zaman: z.string().nullable(), ne: z.string(), ayrinti: z.string(),
});
export const taslakCatismasi = z.object({ anahtar: z.string(), ad: z.string(), komutlar: z.array(z.string()), kaynaklar: z.array(taslakCatismaKaynagi).optional() });
export const taslakUygulaCevabi = z.discriminatedUnion('durum', [
  z.object({ durum: z.literal('uygulandi'), calismaSurumu: z.number().int(), uygulanan: z.number().int(), dusen: z.number().int() }),
  z.object({ durum: z.literal('secim'), catismalar: z.array(taslakCatismasi) }),
]);
export type TaslakKomutu = z.output<typeof taslakKomutu>;
export type TaslakSatirKomutu = z.output<typeof taslakSatirKomutu>;
export type TaslakDegerlendirmeGovdesi = z.output<typeof taslakDegerlendirmeGovdesi>;
export type TaslakAyarlari = z.output<typeof taslakAyarlari>;
export type TaslakCevabi = z.output<typeof taslakCevabi>;
export type TaslakUygulaCevabi = z.output<typeof taslakUygulaCevabi>;
export type TaslakCatismasi = z.output<typeof taslakCatismasi>;
export type TaslakCatismaKaynagi = z.output<typeof taslakCatismaKaynagi>;
