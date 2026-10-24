import { z } from 'zod';
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
export type YazGovdesi = z.output<typeof yazGovdesi>;
export type YazCevabi = z.output<typeof yazCevabi>;
export type SilCevabi = z.output<typeof silCevabi>;
export type DurumCevabi = z.output<typeof durumCevabi>;
export type KapasiteCevabi = z.output<typeof kapasiteCevabi>;
export type DurumRotaAdimi = z.output<typeof durumRotaAdimiSemasi>;
export type DurumRotaRevizyonu = z.output<typeof durumRotaRevizyonSemasi>;
export type DurumMaliyeti = z.output<typeof durumMaliyetSemasi>;
export type DurumMalzemesi = z.output<typeof durumMalzemeSemasi>;
export type DurumEmirleri = z.output<typeof durumEmirlerSemasi>;
