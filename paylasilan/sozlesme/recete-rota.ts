import { z } from 'zod';
import { HATA_KODLARI } from '../hata.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';
import { PLAN_KURALLARI, planCanliOzeti } from './plan.ts';

// Reçete ve Rota Motoru prototipi TMI içinde değiştirilmeden çalışır. Prototip durumunu tarayıcının yerel deposunda tutar (ana
// durum, plan stüdyosu senaryoları, operatör ve menü tercihleri); çerçevedeki köprü bu depoyu TMI'ye bağlar: anahtar başına bir
// kayıt, atölyede ortak, sürüm denetimli.
// Gövde prototipin biçimidir ve TMI'de yorumlanmaz: olduğu gibi saklanır (jsonb), olduğu gibi döner.

// Kalıcı tutulan anahtarlar bu önekle başlar: ana durum `recete-rota-motoru-v1`, ötekiler `recete-rota-motoru-v1:<alt>`
// (`:studio`, `:studio:<senaryo>`, `:op`, `:side`).
export const ANAHTAR_ONEKI = 'recete-rota-motoru-v1';
export const ANAHTAR_BICIMI = /^recete-rota-motoru-v1(?::[A-Za-z0-9_.:-]{1,80})?$/;
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
export const benCevabi = z.object({ kisi: kisiSemasi, yazabilir: z.boolean() });

export const yazGovdesi = z.object({
  anahtar,
  bicim: z.enum(DEGER_BICIMLERI),
  deger: z.unknown().refine((d) => d !== undefined, 'Değer zorunlu.'),
  // Kayıt bu sürümde değilse yazma olmaz (null: kayıt hiç yoksa). Ortak kayıtta başkasının yazdığının üstüne yazılmaz.
  beklenenSurum: z.number().int().nullable(),
});
export const yazCevabi = z.object({ kayit: kayitSemasi });

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

export const silGovdesi = z.object({ anahtar, beklenenSurum: z.number().int() });
export const silCevabi = z.object({ silindi: z.boolean() });

// Bağlı durum (Aşama 2, kart #1104): prototipin `st` biçimindeki bağlı dilimler, sahibi modüllerin okuma işlevlerinden çevrilir.
// Kimlikler prototipin dize kimlikleridir (kaydın sayı kimliğinin metni; `kayitNo` sayıdır). Karşılığı olmayan alan null'dır,
// sıfır uydurulmaz. Koleksiyon boşsa boş dizidir (sahibinde kayıt yok); bir dilimin kaynağı hiç yoksa null'dır.
const kimlikMetni = z.string();
const sayiAlani = z.number().nullable();

export const DURUM_MALZEME_TURLERI = ['ham', 'yari', 'mamul', 'sarf', 'demirbas', 'hizmet'] as const;

export const durumMalzemeSemasi = z.object({
  id: kimlikMetni,
  kayitNo: z.number().int(),
  code: z.string(),
  name: z.string(),
  type: z.enum(DURUM_MALZEME_TURLERI),
  unit: z.string().nullable(),
  // Birim maliyetin sahibi yok.
  cost: z.null(),
  // Serbest (statüsüz) stok: statülü miktar üretimdeki yarı parçadır, statülü kartlarda görünür. Stoku ve kritik seviyesi olmayan kartta null.
  stock: sayiAlani,
  min: sayiAlani,
  aktif: z.boolean(),
  kategori: z.string().nullable(),
  kategoriAdi: z.string().nullable(),
  // Reçetede girdi olarak seçilebilir mi (ticari mal ve hizmet olamaz; kural rota modülünde).
  girdiOlabilir: z.boolean(),
});

export const durumOperasyonSemasi = z.object({
  id: kimlikMetni,
  code: z.string(),
  abbr: z.string().nullable(),
  name: z.string(),
  group: z.string(),
  groupName: z.string(),
  stationId: kimlikMetni.nullable(),
  setup: sayiAlani,
  cycle: sayiAlani,
  aktif: z.boolean(),
});

export const durumIsMerkeziSemasi = z.object({
  id: kimlikMetni,
  code: z.string(),
  name: z.string(),
  // Haftalık vardiya düzeninin (iş merkezi, gün, vardiya) vardiya modülünde okuma işlevi yok.
  week: z.null(),
  aktif: z.boolean(),
});

export const durumIstasyonSemasi = z.object({
  id: kimlikMetni,
  code: z.string(),
  name: z.string(),
  wcId: kimlikMetni,
  eff: sayiAlani,
  opPer: sayiAlani,
  // Aktif makine sayısı.
  count: z.number().int(),
  cost: z.null(),
  aktif: z.boolean(),
});

export const durumMakineSemasi = z.object({
  id: kimlikMetni,
  code: z.string(),
  name: z.string(),
  stationId: kimlikMetni.nullable(),
  status: z.enum(['aktif', 'bakim', 'ariza']),
  aktif: z.boolean(),
});

export const durumKisiSemasi = z.object({
  id: kimlikMetni,
  name: z.string(),
  code: z.string().nullable(),
  role: z.null(),
  // Atama istasyonu, yoksa yetkin olduğu ilk aktif istasyon (stationAtama false); iş merkezi bu istasyonunkidir.
  stationId: kimlikMetni.nullable(),
  stationAtama: z.boolean(),
  wcId: kimlikMetni.nullable(),
  // Kişinin vardiyasının vardiya modülünde okuma işlevi yok.
  shiftId: z.null(),
  skills: z.array(kimlikMetni),
  cost: z.null(),
  active: z.boolean(),
});

export const durumVardiyaSemasi = z.object({
  id: kimlikMetni,
  name: z.string(),
  start: z.string(),
  end: z.string(),
  breaks: z.array(z.object({ start: z.string(), end: z.string() })),
  netDakika: z.number().int(),
});

// Plan ayarı (kart #1186): prototipin `settings` alan adlarıyla canlı plan ayarı; planın sahibi plan modülüdür.
export const durumAyarSemasi = z.object({
  rule: z.enum(PLAN_KURALLARI),
  dir: z.enum(['ileri', 'geri']),
  buffer: z.number(),
  freezeDays: z.number().int(),
  peopleLimit: z.boolean(),
  planDrafts: z.boolean(),
});

// Stok hareketi (kart #1186): prototipin `moves` biçimi; miktar işaretlidir (giriş +, çıkış -), `t` ms. Statü atlatması iki satırdır.
// Geri alınmış hareket ve geri alma satırı listede yoktur; konum taşıması stok miktarını değiştirmediği için yoktur.
export const durumHareketSemasi = z.object({
  id: z.string(),
  t: z.number(),
  itemId: z.string(),
  qty: z.number(),
  note: z.string(),
  batch: z.null(),
  status: z.string(),
});

// Rota (kart #1184): sahibi rota modülüdür. Revizyon kimliği sunucu kimliğinin dizesidir; adım kimliği `o<OP no>` (kaydetten sonra da değişmez), `seq` sıradır.
// Prototipte karşılığı olmayan alanlar (kişi ve fason kaynağı, makine ve kişi adayları, termin günü) adımda aynen taşınır ki kaydet onları silmesin.
// `routes.base`, adım girdilerinin statüsü ve adım çıktısı sunucuda yoktur: null/yok gelir, prototip kayıttakini korur.
export const DURUM_ROTA_DURUMLARI = ['taslak', 'onay', 'onayli', 'yururlukte'] as const;
const sureAlani = z.object({ setup: sayiAlani, proc: sayiAlani, chg: sayiAlani, cycle: sayiAlani });
export const durumRotaAdimiSemasi = z.object({
  id: kimlikMetni,
  // Adımın sırası (10, 20, ...); OP numarası `opNo`dur ve sıra değişse de adımla kalır.
  seq: z.number().int(),
  opNo: z.number().int(),
  opId: kimlikMetni,
  name: z.string(),
  stationId: kimlikMetni.nullable(),
  machineId: kimlikMetni.nullable(),
  kisiId: kimlikMetni.nullable(),
  fasonId: kimlikMetni.nullable(),
  terminGun: z.number().int().nullable(),
  setup: sayiAlani,
  proc: sayiAlani,
  chg: sayiAlani,
  cycle: sayiAlani,
  dep: z.enum(['bagimli', 'ortulu', 'bagimsiz']),
  depQty: sayiAlani,
  rejectPct: z.number(),
  split: z.enum(['tek', 'bol']),
  minLot: sayiAlani,
  resetup: z.boolean(),
  alts: z.array(kimlikMetni),
  altTimes: z.record(z.string(), z.object({ setup: sayiAlani, cycle: sayiAlani })),
  digerAdaylar: z.array(sureAlani.extend({ tur: z.enum(['makine', 'kisi']), id: kimlikMetni })),
  ins: z.array(z.object({ itemId: kimlikMetni, qty: z.number(), scrap: z.number() })),
  outs: z.array(z.object({ itemId: kimlikMetni, qty: z.number(), kind: z.literal('yan') })),
});
export const durumRotaSemasi = z.object({ base: z.null(), steps: z.array(durumRotaAdimiSemasi) });
export const durumRotaRevizyonSemasi = z.object({
  id: kimlikMetni,
  itemId: kimlikMetni,
  no: z.string(),
  status: z.enum(DURUM_ROTA_DURUMLARI),
  surum: z.number().int(),
  note: z.string(),
  created: z.number(),
  approvedAt: z.number().nullable(),
  data: durumRotaSemasi,
});

// Emirler (kart #1185): sahibi uretim-emirleri. `st.orders` satırları; kimlikler dize. Emir kimliği `uretim_emri.id`nin metnidir.
export const DURUM_EMIR_DURUMLARI = ['taslak', 'serbest', 'uretimde', 'tamam', 'iptal'] as const;
export const durumEmirSemasi = z.object({
  id: kimlikMetni,
  kayitNo: z.number().int(),
  no: z.string(),
  itemId: kimlikMetni,
  qty: z.number(),
  start: z.string().nullable(),
  due: z.string().nullable(),
  priority: z.number().int().min(1).max(4),
  note: z.string().nullable(),
  // Emrin açıldığı rota revizyonunun kimliği (sunucu kimliğinin metni); revizyonu olmayan emirde null.
  rev: kimlikMetni.nullable(),
  status: z.enum(DURUM_EMIR_DURUMLARI),
  // Milisaniye (epoch). doneAt: bitiş zamanı, bitmemişte null.
  created: z.number(),
  doneAt: z.number().nullable(),
  // Emir türü sahibinin türüdür (seri, fai, numune, prototip, stok, rework, bakim_deneme, fason).
  tur: z.string(),
  parentId: kimlikMetni.nullable(),
  // Alt emrin ana emirdeki ayrılma adımı (1 tabanlı, ana emrin iş emri sırası) ve katılma adımı (aynı sırada); kol olmayan alt emirde null.
  kol: z.object({ n: z.number().int(), m: z.number().int() }).nullable(),
  // Birleşip kapanan alt partinin katıldığı emir.
  birlestigiId: kimlikMetni.nullable(),
  surum: z.number().int(),
  // Rotasız emir (rev null, kullanıcı kararı 14.10.2026): adımları emrin kendi iş emirleridir; ekran bunları rota yerine kullanır ve düzenler.
  rotasiz: z.boolean().optional(),
  adimlar: z.array(z.object({
    seq: z.number().int(), opNo: z.number().int(), ad: z.string(), opId: kimlikMetni.nullable(), stationId: kimlikMetni.nullable(),
    setup: z.number().nullable(), cycle: z.number().nullable(), durum: z.enum(['bekliyor', 'calisiyor', 'tamam']),
  })).optional(),
});
// opStatus ve opProg anahtarı `<emir>|root|<sıra>`: emrin kendi iş emrinin sırası (1 tabanlı). Prototip bunu rota adımına kendi emir
// adımlarından çevirir (kolda ayrılma adımı kadar kayarak). Bekleyen iş emri opStatus'ta yoktur; opProg yalnız bitmemiş adımın sağlam adedidir.
// opYer (aynı anahtar): rotalı emirde adımın emirdeki iç ya da dış üretimi (UE-URY). Emirde fasona alınan ya da içeri alınan adım rotadan
// ayrılabilir; plan rotanın değil emrin seçimini kullanır. fasonId doluysa adım fasondadır (istasyon ve süre yok, terminGun firma süresi).
export const durumEmirYeriSemasi = z.object({
  fasonId: kimlikMetni.nullable(), terminGun: z.number().int().nullable(), stationId: kimlikMetni.nullable(), setup: z.number().nullable(), cycle: z.number().nullable(),
});
export const durumEmirlerSemasi = z.object({
  orders: z.array(durumEmirSemasi),
  opStatus: z.record(z.string(), z.enum(['calisiyor', 'tamam'])),
  opProg: z.record(z.string(), z.number()),
  opYer: z.record(z.string(), durumEmirYeriSemasi).optional(),
});
// Birim maliyetler finanstadır (kart #1187). Anahtar kaydın sayı kimliğinin metnidir; satırı olmayan kalemin maliyeti bilinmiyordur (haritada yok).
// Tutar numeric metnidir; sürüm yazmada geri gönderilir (köprü tutar). yazabilir: finans.yonet var mı (ekranın yazma alanlarını açar; uç yine denetler).
export const durumMaliyetGirdisi = z.object({ birimMaliyet: z.string(), paraBirimi: z.string(), surum: z.number().int().min(1) });
export const durumMaliyetSemasi = z.object({
  yazabilir: z.boolean(),
  malzeme: z.record(z.string(), durumMaliyetGirdisi),
  istasyon: z.record(z.string(), durumMaliyetGirdisi),
  kisi: z.record(z.string(), durumMaliyetGirdisi),
});

// Dilim, sahibinin okuma yetkisi olmayan kullanıcıya null gelir (kart #1104).
// Elle tanımlanan statü (prototipte `statuses`). Tablo tek kaynaktır: ekran bağlıyken listeyi durumdan okur, ekleme, değişiklik ve silme bu
// komutlarla gider (geçiş planı adım 4). Alanlar prototipin adlarıyla; kısıtlar tablonunkiyle aynıdır.
const statuTanimiKimligi = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'Statü kimliği harf, rakam, - ya da _ olmalıdır.');
const statuTanimiAlanlari = z.object({
  code: z.string().trim().min(1, 'Statü kodu boş olamaz.').max(5, 'Statü kodu en çok 5 karakterdir.'),
  name: z.string().trim().min(1, 'Statü adı boş olamaz.').max(200),
  kind: z.enum(['uretim', 'kalite', 'ret', 'giris']),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Renk #RRGGBB biçiminde olmalıdır.'),
});
export const statuTanimiSemasi = statuTanimiAlanlari.extend({ id: statuTanimiKimligi, surum: z.number().int() });
export const statuTanimiParametresi = z.object({ id: statuTanimiKimligi });
// beklenenSurum null: yeni statü (kimlik varsa reddedilir).
export const statuTanimiKaydetGovdesi = statuTanimiAlanlari.extend({ beklenenSurum: z.number().int().positive().nullable() });
export const statuTanimiSilGovdesi = z.object({ beklenenSurum: z.number().int().positive() });
export const statuTanimiCevabi = z.object({ statuses: z.array(statuTanimiSemasi) });

export const durumCevabi = z.object({
  items: z.array(durumMalzemeSemasi).nullable(),
  // Ölçü birimi kodları (pasif olan eski kartta durur, yeni kayıtta seçilemez).
  units: z.array(z.object({ kod: z.string(), aktif: z.boolean() })).nullable(),
  opdefs: z.array(durumOperasyonSemasi).nullable(),
  wcs: z.array(durumIsMerkeziSemasi).nullable(),
  stations: z.array(durumIstasyonSemasi).nullable(),
  machines: z.array(durumMakineSemasi).nullable(),
  people: z.array(durumKisiSemasi).nullable(),
  // Ürün kimliği -> yürürlükteki revizyonun rotası; revizyonlar iptal hariç hepsidir.
  routes: z.record(z.string(), durumRotaSemasi).nullable(),
  routeRevs: z.array(durumRotaRevizyonSemasi).nullable(),
  // Aktif fason firmalar (adımın "Fason firma" seçicisi); rota okuma yetkisi yoksa null. Alan eski sürümde yoktu (isteğe bağlı).
  fasonFirms: z.array(z.object({ id: kimlikMetni, code: z.string().nullable(), name: z.string() })).nullable().optional(),
  cal: z.object({ shifts: z.array(durumVardiyaSemasi), holidays: z.array(z.string()) }),
  // Emir yetkisi yoksa null; alan eski sürümde yoktu (isteğe bağlı), sunucu her zaman yazar.
  emirler: durumEmirlerSemasi.nullable().optional(),
  // Başlamış adımlar (391 a, kalanın tek kaynağı sunucu): anahtar `emirNo|opNo`; makine terminalin çalıştırdığı, yoksa planınki; kalan
  // verimli dakika son sayım anından (yoksa başlamadan) itibarendir. saglam terminal sayacı, adet adımın işleyeceği adet. Emir yetkisi yoksa null.
  calisanAdimlar: z.array(z.object({
    anahtar: z.string(), makineId: kimlikMetni.nullable(), baslangic: zamanSemasi.nullable(), sayimAni: zamanSemasi.nullable(),
    kalanVerimliDk: z.number(), saglam: z.number().int(), adet: z.number().int(),
  })).nullable().optional(),
  // Bitmemiş adımın işleyeceği adet emir adedinden farklıysa (önceki biten adımın hurdası düşülmüş, tek kaynak uretim-emirleri adimAdedi):
  // anahtar `emirNo|opNo`. Farksız adım gelmez. Emir yetkisi yoksa null.
  adimAdetleri: z.record(z.string(), z.number().int().nonnegative()).nullable().optional(),
  // finans.maliyet-oku yoksa null.
  maliyet: durumMaliyetSemasi.nullable(),
  // Canlı plan ayarı; plan okuması oturumla açıktır.
  settings: durumAyarSemasi,
  // Canlı planın özeti: üst şerit "canlı / canlıya alınmadı" der. Plan okuması oturumla açıktır; alan eski sürümde yoktu.
  planCanli: planCanliOzeti.optional(),
  // Elle tanımlanan statüler, sırasıyla (tablodan). Alan eski sürümde yoktu.
  statuses: z.array(statuTanimiSemasi).optional(),
  // Son stok hareketleri, eskiden yeniye; stok okuma yetkisi yoksa null.
  moves: z.array(durumHareketSemasi).nullable(),
  // Malzeme listesi üst sınırda kesildiyse true (kalan kartlar okunmadı).
  malzemeKesildi: z.boolean(),
});

// Rotanın statülü adımından kendiliğinden açılan statü tanımı (kart #1107). Statülü stok miktarı stok tarafındadır.
// Plan kapasitesi (kart #1324): Vardiya takviminden prototipin kendi vardiya hesabına eklediği farklar; bugünden KAPASITE_GUNU gün.
// Fazla mesai dakikası vardiyayla örtüşmeyen planlı çalışmadır (yalnız sıfırdan büyük günler). İstasyon satırı yalnız istasyona özel
// fazla mesaisi olan istasyonda gelir (iş merkezininkini de içerir). Kişide izinli onaylı izin günleri, paylar iş merkezi başına atama
// 525 1 a, 533 a: planın satın alma eki (çerçevenin kaynak okuması ve sunucunun birleştirmesi aynı veriyi alır). `acikSiparisler`: ham
// malzemenin açık satın alma siparişinden kalan miktar (malzemenin biriminde) ve beklenen teslim günü; satın almayı okuyamayana null.
// `tedarikTerminleri`: malzemenin Satın Alma'daki tedarik termini ve yazma sürümü; satırı olmayan malzeme listede yoktur. `kod` plandaki
// malzeme kodudur (kartın numarası). Malzemeleri okuyamayana ikisi de null.
export const satinAlmaEkiCevabi = z.object({
  acikSiparisler: z.array(z.object({ kod: kimlikMetni, miktar: z.number().positive(), tarih: tarihSemasi.nullable(), siparisNo: z.string() })).nullable(),
  tedarikTerminleri: z.array(z.object({ kod: kimlikMetni, termin: tarihSemasi.nullable(), surum: z.number().int(), aciklama: z.string() })).nullable(),
});

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

export const STATU_TURLERI = ['HM', 'YM', 'MM'] as const;
export const statuSemasi = z.object({
  id: z.number().int(),
  malzemeNo: z.string(),
  ad: z.string(),
  kaynakAdim: z.string(),
  // Statü hangi mamülün adımıdır: kaynak adımın ürününün stok kodu (aynı HM farklı mamüllerde ayrı statü olur). Eski biçimli adımda null.
  urunKodu: z.string().nullable(),
  // Statünün açıldığı rota revizyonunun harfi (her revizyon kendi statüsünü açar); revizyonsuz rotada null.
  revizyon: z.string().nullable(),
  renk: z.string(),
  tur: z.enum(STATU_TURLERI),
  zaman: zamanSemasi,
});
export const statulerCevabi = z.object({ statuler: z.array(statuSemasi) });

// Planın termini girilmemiş fason adımı için geçmiş teslimattan süre tahmini (satın alma). Sorgu "malzeme-operasyonTipi-firma-adet"
// dörtlülerinin virgüllü listesidir; cevap aynı sırada gün (ondalık olabilir) ya da veri yoksa null.
const FASON_TAHMIN_DORTLUSU = String.raw`\d{1,10}-\d{1,10}-\d{1,10}-\d{1,9}(?:\.\d{1,6})?`;
export const fasonTahminSorgusu = z.object({
  s: z.string().regex(new RegExp(`^${FASON_TAHMIN_DORTLUSU}(?:,${FASON_TAHMIN_DORTLUSU}){0,99}$`), 'Sorgu malzeme-operasyon-firma-adet dörtlülerinin virgüllü listesi olmalı (en çok 100).')
    .transform((t) => t.split(',').map((d) => { const [m, o, f, a] = d.split('-'); return { malzemeNo: Number(m), operasyonTipiId: Number(o), firmaId: Number(f), adet: Number(a) }; })),
});
export const fasonTahminCevabi = z.object({ gunler: z.array(z.number().nonnegative().nullable()) });

// Planlama değerlendirmesi (Soru 357 a): planlama sayfasının tarayıcıda motoru koşturan kartları sunucuda hesaplanır. Uç yalnız okur:
// kayıtlı ve sunucuda birleşmiş çalışmayla (288 a) planlar kurulur ve karşılaştırılır, sonuç döner; hiçbir kayıt yazılmaz. Ekran çalışma
// göndermez, neyin deneneceğini gönderir; `surum` çalışma kaydının sürümü değilse hesap yapılmaz (409). Saatler çalışmanın ekseninde
// (başlangıç günü 00:00'dan saat), terminler çalışmanın biçiminde ('GGGG-AA-GG SS:DD'). Veri yoksa null. TL alanları yalnız maliyeti
// görene (finans.maliyet-oku) döner, göremeyende null'dır (`maliyetGorunur`). `plan` çalışmanın plan kaydı biçimindedir (S.plan,
// dataVer çalışmanınki); ekran seçeneği alırsa kendi yazma yoluyla yazar.
export const DEGERLENDIRME_TURLERI = [
  'plan-secenekleri', 'termin-secenekleri', 'termin-uzatma', 'malzeme-terminleri', 'malzeme-one-cekme', 'parti-bolme', 'siparis-kari',
] as const;
export const TERMIN_UZATMA_GUNLERI = [1, 2, 3, 5] as const;
export const PARTI_SAYISI_EN_COK = 20;
const planSiparisi = z.string().min(1).max(80);
export const degerlendirmeIstegi = z.discriminatedUnion('tur', [
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
  planSecenekleri, terminSecenekleri, terminUzatma, malzemeTerminleri, malzemeOneCekme, partiBolme, siparisKari,
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
export type FasonTahminCevabi = z.output<typeof fasonTahminCevabi>;
export type Statu = z.output<typeof statuSemasi>;
export type StatulerCevabi = z.output<typeof statulerCevabi>;
export type StatuTanimi = z.output<typeof statuTanimiSemasi>;
export type StatuTanimiKaydetGovdesi = z.output<typeof statuTanimiKaydetGovdesi>;
export type StatuTanimiCevabi = z.output<typeof statuTanimiCevabi>;

export type Kayit = z.output<typeof kayitSemasi>;
export type KayitlarCevabi = z.output<typeof kayitlarCevabi>;
export type BenCevabi = z.output<typeof benCevabi>;
export type PlanlamaCalismasiCevabi = z.output<typeof planlamaCalismasiCevabi>;
export type CanliFarkiCevabi = z.output<typeof canliFarkiCevabi>;
export type TabanVeCanliCevabi = z.output<typeof tabanVeCanliCevabi>;
export type CalismaTaslagiGovdesi = z.output<typeof calismaTaslagiGovdesi>;
export type CalismaTaslagiCevabi = z.output<typeof calismaTaslagiCevabi>;
export type TaslaktanCalismayaGovdesi = z.output<typeof taslaktanCalismayaGovdesi>;
export type TaslaktanCalismayaCevabi = z.output<typeof taslaktanCalismayaCevabi>;
export type CalismaGeriAlCevabi = z.output<typeof calismaGeriAlCevabi>;
export type YazGovdesi = z.output<typeof yazGovdesi>;
export type YazCevabi = z.output<typeof yazCevabi>;
export type SilCevabi = z.output<typeof silCevabi>;
export type DurumCevabi = z.output<typeof durumCevabi>;
export type KapasiteCevabi = z.output<typeof kapasiteCevabi>;
export type SatinAlmaEkiCevabi = z.output<typeof satinAlmaEkiCevabi>;
export type DurumRotaAdimi = z.output<typeof durumRotaAdimiSemasi>;
export type DurumRotaRevizyonu = z.output<typeof durumRotaRevizyonSemasi>;
export type DurumMaliyeti = z.output<typeof durumMaliyetSemasi>;
export type DurumMalzemesi = z.output<typeof durumMalzemeSemasi>;
export type DurumEmirleri = z.output<typeof durumEmirlerSemasi>;
export type DegerlendirmeIstegi = z.output<typeof degerlendirmeIstegi>;
export type DegerlendirmeSonucu = z.output<typeof degerlendirmeSonucu>;
export type DegerlendirmeCevabi = z.output<typeof degerlendirmeCevabi>;
export type DegerlendirmeGovdesi = z.output<typeof degerlendirmeGovdesi>;
export type DegerlendirmeDurumuCevabi = z.output<typeof degerlendirmeDurumuCevabi>;
export type YillikCozGovdesi = z.output<typeof yillikCozGovdesi>;
export type YillikCozumu = z.output<typeof yillikCozumSemasi>;
export type YillikCozDurumuCevabi = z.output<typeof yillikCozDurumuCevabi>;
