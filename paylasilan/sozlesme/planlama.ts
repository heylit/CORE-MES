import { z } from 'zod';
import { HATA_KODLARI } from '../hata.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';
import { PLAN_KURALLARI, planCanliOzeti } from './plan.ts';
import { PLANLAMA_ANAHTARI_BICIMI, receteRotaDurumCevabi, yazGovdesi } from './recete-rota.ts';

// Planlama sözleşmesi (658 b): planlama sayfası, çalışma kaydı ve plan motoru plan modülünün uçlarıdır (/plan/...). Reçete ve Rota yalnız
// veri verir (receteRotaDurumCevabi); planın alanlarını plan modülü ekler.

const kimlikMetni = z.string();

// Planlama çalışması ve sayfa tercihleri plan modülünün kayıt tablosundadır; gövde Reçete ve Rota'nın kayıt biçimidir, anahtar yalnız planlama anahtarı.
const planlamaAnahtari = z.string().regex(PLANLAMA_ANAHTARI_BICIMI, 'Geçersiz planlama anahtarı.');
export const planlamaYazGovdesi = yazGovdesi.extend({ anahtar: planlamaAnahtari });
export const planlamaSilGovdesi = z.object({ anahtar: planlamaAnahtari, beklenenSurum: z.number().int() });

// Planlama sayfasının açılış verisi (288 a): çalışma kaydı (`:planlama`) Reçete ve Rota kaydı ve kaynak okumasıyla sunucuda birleşmiş olarak
// gelir; sayfa birleştirmez. Çalışma yoksa (hiç kaydedilmemiş ya da kayıt biçimi eski) null. Sürüm çalışma kaydınındır (yazmada beklenen
// sürüm); kayıt yoksa null.
export const planlamaCalismasiCevabi = z.object({
  calisma: z.record(z.string(), z.unknown()).nullable(),
  surum: z.number().int().nullable(),
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
  })).nullable().optional(),
  // Canlı plan ayarı; plan okuması oturumla açıktır.
  settings: durumAyarSemasi,
  // Canlı planın özeti: üst şerit "canlı / canlıya alınmadı" der. Plan okuması oturumla açıktır; alan eski sürümde yoktu.
  planCanli: planCanliOzeti.optional(),
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
  acikSiparisler: z.array(z.object({ kod: kimlikMetni, miktar: z.number().positive(), tarih: tarihSemasi.nullable(), siparisNo: z.string() })).nullable(),
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

// Planlama değerlendirmesi (Soru 357 a): planlama sayfasının tarayıcıda motoru koşturan kartları sunucuda hesaplanır. Uç yalnız okur:
// kayıtlı ve sunucuda birleşmiş çalışmayla (288 a) planlar kurulur ve karşılaştırılır, sonuç döner; hiçbir kayıt yazılmaz. Ekran çalışma
// göndermez, neyin deneneceğini gönderir; `surum` çalışma kaydının sürümü değilse hesap yapılmaz (409). Saatler çalışmanın ekseninde
// (başlangıç günü 00:00'dan saat), terminler çalışmanın biçiminde ('GGGG-AA-GG SS:DD'). Veri yoksa null. TL alanları yalnız maliyeti
// görene (finans.maliyet-oku) döner, göremeyende null'dır (`maliyetGorunur`). `plan` çalışmanın plan kaydı biçimindedir (S.plan,
// dataVer çalışmanınki); ekran seçeneği alırsa kendi yazma yoluyla yazar.
export const DEGERLENDIRME_TURLERI = [
  'plan-kur', 'plan-uygula', 'plan-secenekleri', 'termin-secenekleri', 'termin-uzatma', 'malzeme-terminleri', 'malzeme-one-cekme', 'parti-bolme', 'siparis-kari',
] as const;
export const TERMIN_UZATMA_GUNLERI = [1, 2, 3, 5] as const;
export const PARTI_SAYISI_EN_COK = 20;
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
  z.object({ tur: z.literal('siparis-kari') }).strict(),
]);
// İki adım (463 a): başlatma girdiyi okur ve hesabı başlatır, sonuç kimlikle transaction açmadan okunur; hesap uç transaction'ını beklemez.
export const degerlendirmeGovdesi = z.object({ surum: z.number().int().positive(), istek: degerlendirmeIstegi }).strict();
export const degerlendirmeBaslatCevabi = z.object({ is: z.string().uuid() });
export const degerlendirmeParametresi = z.object({ is: z.string().uuid() });

const tl = z.number().nullable();
const saatDegeri = z.number();
const planTermini = z.string();
const planKaydiSemasi = z.record(z.string(), z.unknown());
const ekMesaiSemasi = z.object({ makineId: z.string(), gun: z.number().int(), vardiya: z.string(), tl });
const planKur = z.object({ tur: z.literal('plan-kur'), plan: planKaydiSemasi });
const planUygula = z.object({ tur: z.literal('plan-uygula'), plan: planKaydiSemasi });
const planSecenekleri = z.object({
  tur: z.literal('plan-secenekleri'),
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
const beklemeSemasi = z.object({ tl, ilk: tl, ara: tl, son: tl });
const siparisKari = z.object({
  tur: z.literal('siparis-kari'),
  satirlar: z.array(z.object({
    siparisId: z.string(), planda: z.boolean(),
    malzeme: tl, talas: tl, talasKg: z.number().nullable(), isleme: tl, ayar: tl, genelGider: tl, ekMesai: tl, fason: tl, finansman: tl,
    bekleme: beklemeSemasi.nullable(), toplam: tl, tutar: tl, kar: tl, net: tl, gecikmeBedeli: tl,
    gecikmeSaat: z.number().nullable(), erkenSaat: z.number().nullable(), eksik: z.array(z.string()),
  })),
  bekleme: z.object({ tl, fin: tl, saat: saatDegeri }),
});
export const degerlendirmeSonucu = z.discriminatedUnion('tur', [
  planKur, planUygula, planSecenekleri, terminSecenekleri, terminUzatma, malzemeTerminleri, malzemeOneCekme, partiBolme, siparisKari,
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
export const yillikCozBaslatCevabi = z.object({ is: z.string().uuid() });
export const yillikCozParametresi = z.object({ is: z.string().uuid() });
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
export type PlanlamaSilGovdesi = z.output<typeof planlamaSilGovdesi>;
export type PlanlamaCalismasiCevabi = z.output<typeof planlamaCalismasiCevabi>;
export type CanliFarkiCevabi = z.output<typeof canliFarkiCevabi>;
export type TabanVeCanliCevabi = z.output<typeof tabanVeCanliCevabi>;
export type CalismaTaslagiGovdesi = z.output<typeof calismaTaslagiGovdesi>;
export type CalismaTaslagiCevabi = z.output<typeof calismaTaslagiCevabi>;
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
