import { arkonBelgeAlanlari } from '#paylasilan/sozlesme/arkon.ts';
import type { ANOMALI_DONEM_ADLARI, ArkonDeposu, ArkonKayitTuru, ArkonRolu, MerkezDurumu, OzetDonemi } from '#paylasilan/sozlesme/arkon.ts';
import type { CagriEkibi, DurusNedeni, HurdaNedeni } from '#paylasilan/sozlesme/durus-nedenleri.ts';
import { CAGRI_EKIPLERI } from '#paylasilan/sozlesme/durus-nedenleri.ts';
import type { IsMerkezi, Istasyon, Makine } from '#paylasilan/sozlesme/istasyonlar.ts';
import type { IlkParcaSecimi } from '#paylasilan/sozlesme/rota.ts';
import { AZAMI_MAKINE_SECIMI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { Emir } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { planliDurusGovdesi } from '#paylasilan/sozlesme/vardiya.ts';
import type { PlanliDurusGirdisi, PlanliDurusKapsami, PlanliDurusTekrari } from '#paylasilan/sozlesme/vardiya.ts';
import { tesisGunBasi, tesisGunu, tesisSaati } from '#paylasilan/zaman.ts';
import { svgHatasi } from './svg.ts';
import type { MuayenePlani } from '../kalite-merkezi/disari.ts';

// Rol retlerinde modül adı geçmez: Üretim Terminali'ndeki operatör "Üretim Hazırlık rolünüz" sözünü kendi rolünün adı sanar (G1).
export const ILETILER = {
  rolYok: 'Üretim Hazırlık için rolünüz yok.',
  ozetRolYok: 'Özetim yalnız Arkon operatörü ve amiri içindir.',
  ozetKapsamDisi: 'Bu kişinin özetini göremezsiniz: yalnız kendi özetiniz ya da amiri olduğunuz iş merkezindeki kişiler açılır.',
  silmeSurumu: 'Silmede belgenin sürümü gönderilmeli.',
  tmiYonetir: 'Bu ayar TMI\'de yönetilir (İstasyonlar, Duruş ve Hurda Nedenleri).',
  aletTmide: 'Ölçü aletleri ve kalibrasyon TMI\'de Kalibrasyon sayfasında yönetilir.',
  yetkiTmide: 'Yetkiler TMI\'de yönetilir (Roller).',
  gunlukOkuma: 'Değişiklik günlüğünü yalnız Üretim Hazırlık yöneticisi okur.',
  yalnizYonetici: 'Bu ayarı yalnız Üretim Hazırlık yöneticisi değiştirir.',
  rolYetmez: 'Rolünüz bu belgeyi yazamaz ya da silemez.',
  okumaRolu: 'Rolünüz bu depoyu okuyamaz.',
  ilkParca: 'İlk parça kalitede: kalite kararına kadar ikinci sağlam parça sayılmaz.',
  aletZorunlu: 'Ölçü aleti seçilmeden ölçüm kaydedilmez.',
  aletGecersiz: 'Seçilen ölçü aletinin kalibrasyonu geçerli değil ya da alet kullanım dışı: bu aletle ölçüm kaydedilmez.',
  ilkParcaYeniden: 'Hazırlık yeniden ilk parça onayı istedi: kalite kararına kadar ikinci sağlam parça sayılmaz.',
  ikinciKontrol: 'Kritik ölçüler ikinci kez kontrol edildi işaretlenmeden onay verilemez.',
  kisiTmide: 'Kişiler TMI\'de yönetilir (Personel).',
  ozetTutmuyor: 'Dosya içeriği özetiyle tutmuyor.',
  parcaUyusmuyor: 'Parça sayısı önceki parçalarla uyuşmuyor.',
  sunucuIletisi: 'Bu ileti türünü yalnız sunucu üretir.',
  iletiTuruYok: 'Bu ileti türü tanınmıyor.',
  iletiRolu: 'Rolünüz bu ileti türünü gönderemez.',
  iletiBuyuk: 'İleti çok büyük.',
  iletiHizi: 'Dakikada gönderilebilecek ileti sayısı aşıldı.',
  lotKarariGecersiz: 'Lot kararı eksik: Kabul için bulunan kusurlu sayıları, Red için en az bir kusurlu sayısı ve gerekçe gerekir.',
  lotKarariVar: 'Bu lotun kararı verildi; değiştirmek Kalite Merkezi\'ndedir.',
  lotKarariTutmadi: 'Bulunan kusurlu sayıları AQL planına göre başka karar veriyor; sayıları ya da kararı düzeltin.',
  lotPaketi: 'Lot kararı yalnız kalite istasyonundaki TMI iş emri paketinde verilir.',
  kaliteKarari: 'Bu kayıt karara bağlanmış ya da kapanmış: değiştirmek yalnız kararı veren ya da kapatan role ve yöneticiye açıktır.',
  ilkParcaKmde: 'İlk parça kararı Kalite Merkezi\'nde verilir.',
  kmNumuneYok: 'Bu numune Kalite Merkezi\'ne bağlı değil: ölçüm buradan girilmez.',
  numuneYok: 'Numune isteği bulunamadı.',
  kayitRolYetmez: 'Rolünüz bu kayıt türünü ya da kaynağı yazamaz.',
  olcumKaynagi: 'Ölçüm kaynağı tanınmıyor.',
  isEmriYok: 'Bu paketin TMI iş emri açık değil.',
  yerelPaket: 'Yeni paket TMI\'de emir açılınca oluşur (Rota > Üretim emirleri); emir dışı paket açılmaz.',
  isEmriNo: 'Kaydın emir numarası paketin iş emrininki değil.',
  planCanliDegil: 'Plan canlıya alınmadı: bu iş canlı planda bu istasyona yerleşmeden başlatılamaz.',
  planSiraYetki: 'İş sırasını değiştirme yetkiniz yok.',
  planSiraEski: 'Plan değişti: ekranı yenileyip yeniden sıralayın.',
  planSiraGecersiz: 'Yeni sıra aynı işlerden oluşmalı.',
  planSiraSabit: 'Kilitli ya da dondurulmuş iş yerinden oynatılamaz; öteki işleri onun önüne ya da arkasına taşıyın.',
  planSiraDegismedi: 'Sıralanabilir işlerin sırası değişmedi.',
  kotaYukleme: 'Açık yükleme sayısı sınırına ulaşıldı; önce başlattığınız yüklemeleri tamamlayın.',
  kotaBayt: 'Açık yüklemelerinizin toplam boyutu sınırı aştı.',
  kotaDepo: 'Dosya deposu dolu.',
  dosyaYok: 'Dosya yok.',
  merkezRolu: 'Çizim Merkezi\'nden dosya almak için paket düzenleme yetkisi gerekir.',
  merkezYok: 'Çizim Merkezi\'nde bu belgenin yayında revizyonu yok.',
  merkezTur: 'Bu dosya türünü TMI CORE okumaz (PDF, STEP, IGES ya da STL olmalı).',
  merkezBuyuk: 'Dosya, TMI CORE\'un dosya sınırından büyük.',
  merkezOzet: 'Merkezdeki dosyanın içeriği özetiyle tutmuyor.',
  gunlukSunucu: 'Değişiklik günlüğünü yalnız sunucu yazar.',
  hazirliktaSayim: 'Hazırlıkta sayım yapılmaz · önce ilk parça onayı',
  makineKaynagi: 'Makine kaynaklı (src: auto) kaydı yalnız makine bağlantısı yazar.',
  alanYetkisi: 'Rolünüz bu belgedeki bu değişikliği yapamaz.',
  emirIptal: 'Bu iş emri TMI\'de iptal edildi; iş için kayıt yazılmaz.',
  bitmisIs: 'Bu iş bitti: sayı ve durum değişmez.',
  tmiIstasyonu: 'Bu paketin istasyonu TMI planından değişir.',
  onaysizYayin: 'Paket kalite onayı olmadan yayınlanamaz.',
  onayEskidi: 'Onaydan sonra paketin içeriği değişti: yeniden kaliteye onaya gönderin.',
  stokIstegi: 'Bu malzeme isteği stokta açıldı; durumu Stok Merkezi\'nden değişir.',
  stokMalzemesi: 'Malzeme kartını seçin.',
  stokMiktari: 'Miktarı sıfırdan büyük bir sayı olarak girin.',
  stokIstasyonu: 'İstek istasyondan açılır; istasyon tanınmıyor.',
} as const;

// Sıra önceliktir: birden çok Arkon işlemi taşıyan kişi listede önce gelen rolü alır.
const ROL_SIRASI: readonly (readonly [string, ArkonRolu])[] = [
  ['arkon.yonetici', 'admin'],
  ['arkon.planlama', 'plan'],
  ['arkon.hazirlik', 'prep'],
  ['arkon.kalite', 'quality'],
  ['arkon.bakim', 'maint'],
  ['arkon.amir', 'lead'],
  ['arkon.operator', 'operator'],
];

export function arkonRoluBul(islemler: readonly string[]): ArkonRolu | null {
  return ROL_SIRASI.find(([islem]) => islemler.includes(islem))?.[1] ?? null;
}

// Arkon rolü kişinin rolünden gelir: kişiye ek verilen Arkon işlemi (ör. operatöre planlama) rolü değiştirmez. Rolünde hiç Arkon
// işlemi olmayan kişide rolü ek işlemler belirler.
export function arkonRoluSec(roldenIslemler: readonly string[], tumIslemler: readonly string[]): ArkonRolu | null {
  return arkonRoluBul(roldenIslemler) ?? arkonRoluBul(tumIslemler);
}

// TMI'nin sahip olduğu ayarlar Arkon'a TMI'den okunarak verilir; Arkon'dan yazılamaz. Vardiyalar (shifts) A7'de (#517) Vardiya modülüne geçti.
export const TMI_AYARLARI = ['plant', 'reasons', 'scraps', 'perms', 'shifts', 'holidays'] as const;
export type TmiAyari = (typeof TMI_AYARLARI)[number];
export const tmiAyariMi = (kimlik: string): kimlik is TmiAyari => (TMI_AYARLARI as readonly string[]).includes(kimlik);

// Depo x rol tablosu. Kaynak: Arkon'un kendi varsayılan yetki matrisi (arkon/web/src/app/ortak-ayarlar.ts:48 PERMS0) ve
// depoya yazan ekran kodunun kullandığı denetimler (allowed/can). Matriste her depoya tek yetki düşmez; depoya yazan işlemlerin
// sahibi roller birleşimidir. Yönetici Arkon'da her şeye yetkilidir (ortak-ayarlar.ts:58 `can`). Sunucu bu tabloyu taban
// alır: yönetici matrisi (kv/perms) genişletirse ekran izin verir ama sunucu yine bu tabloyla sınırlar.
type DepoAdi = Exclude<ArkonDeposu, 'kv'>;
const TUM_ROLLER: readonly ArkonRolu[] = ['admin', 'plan', 'prep', 'quality', 'maint', 'lead', 'operator'];

// Yazma: pkgs (pkg.edit, pkg.publish, plan.edit, pkg.approve), results (prod.run, q.meas, q.decide; Hazırlık'ın pin
// kapatması), requests (operatör numune isteği, q.meas, q.decide), draws (page.draw), downs (down.edit), maint (maint.work,
// maint.plan), gauges (gauge.edit; belge TMI Kalibrasyon modülündedir, A7 #518; ileti de yok), logi (logi.req, logi.handle).
const DEPO_YAZARLARI: Readonly<Record<DepoAdi, readonly ArkonRolu[]>> = {
  pkgs: ['admin', 'plan', 'prep', 'quality'],
  results: ['admin', 'operator', 'lead', 'quality', 'prep', 'plan'],
  requests: ['admin', 'operator', 'lead', 'quality'],
  draws: ['admin', 'plan', 'prep'],
  downs: ['admin', 'plan', 'lead'],
  maint: ['admin', 'maint', 'lead'],
  gauges: ['admin', 'quality'],
  logi: ['admin', 'operator', 'lead', 'plan'],
};

// Silme: ekranda silme düğmesi olan yerler (pkg.del, page.draw, down.edit, maint.plan, gauge.edit). Sonuç, numune isteği
// ve malzeme isteği Arkon'da silinmez; matriste karşılığı olmadığı için en dar rol (yönetici) alınır.
const DEPO_SILICILERI: Readonly<Record<DepoAdi, readonly ArkonRolu[]>> = {
  pkgs: ['admin', 'prep'],
  results: ['admin'],
  requests: ['admin'],
  draws: ['admin', 'prep'],
  downs: ['admin', 'plan', 'lead'],
  maint: ['admin', 'maint'],
  gauges: ['admin', 'quality'],
  logi: ['admin'],
};

// kv: anahtar başına yazarlar. Yönetim ayarları yalnız yöneticidedir; vardiyalar TMI Vardiya modülündedir (TMI_AYARLARI).
// handover operatör vardiya devridir (page.op: hepsi); ruleTpls ve seed* Hazırlık'ın (pkg.edit) kayıtlarıdır.
// Tabloda olmayan anahtar için matriste karşılık yoktur: en dar rol (yönetici).
const KV_YAZARLARI: ReadonlyMap<string, readonly ArkonRolu[]> = new Map<string, readonly ArkonRolu[]>([
  ['mode', ['admin']],
  ['policy', ['admin']],
  ['handover', TUM_ROLLER],
  ['ruleTpls', ['admin', 'plan', 'prep']],
  ['seedRules', ['admin', 'plan', 'prep']],
  ['seedV11', ['admin', 'plan', 'prep']],
]);
const YALNIZ_YONETICI: readonly ArkonRolu[] = ['admin'];

// Okuma: depoyu bugün okuyan ekranların rolleri (arkon/web/src/app: bakim-raporlar.ts MaintApp ve raporlar, pano-planlama.ts pano;
// kalite.ts kalibrasyon uyarısı; hazirlik.ts ve cizim-studyosu.ts çizimler). Paket, sonuç, numune isteği, planlı duruş, malzeme isteği ve
// kv ayarlarını operatör ekranı ve açılış da okur: herkese açıktır. gauges açılışta herkesçe istenir ama yalnız kalite ekranı kullanır
// (ortak-ayarlar.ts:145 hatayı yutar). Tablo yazma tablosu gibi tabandır: kv/perms genişletse de sunucu bununla sınırlar.
const DEPO_OKUYUCULARI: Readonly<Partial<Record<ArkonDeposu, readonly ArkonRolu[]>>> = {
  maint: ['admin', 'plan', 'prep', 'quality', 'maint', 'lead'],
  gauges: ['admin', 'plan', 'prep', 'quality', 'lead'],
  draws: ['admin', 'plan', 'prep'],
};

export const okuyabilirMi = (depo: ArkonDeposu, rol: ArkonRolu): boolean => DEPO_OKUYUCULARI[depo]?.includes(rol) ?? true;

export type YazmaReddi = 'tmiYonetir' | 'yalnizYonetici' | 'rolYetmez' | null;
export type BelgeEylemi = 'yaz' | 'sil';

export function yazmaReddi(depo: ArkonDeposu, kimlik: string, rol: ArkonRolu, eylem: BelgeEylemi): YazmaReddi {
  if (depo === 'gauges') return 'tmiYonetir';
  if (depo !== 'kv') {
    return (eylem === 'yaz' ? DEPO_YAZARLARI : DEPO_SILICILERI)[depo].includes(rol) ? null : 'rolYetmez';
  }
  if (tmiAyariMi(kimlik)) return 'tmiYonetir';
  const izinli = (eylem === 'yaz' ? KV_YAZARLARI.get(kimlik) : undefined) ?? YALNIZ_YONETICI;
  if (izinli.includes(rol)) return null;
  return izinli.every((r) => r === 'admin') ? 'yalnizYonetici' : 'rolYetmez';
}

// Arkon'dan emir açılmaz (A5, kart #541): yeni paket yalnız TMI emrinin (`tmi-ue`) ya da iş emrinin (`tmi-ie`) paketidir. Daha önce
// kaydedilmiş emir dışı paket (yerel paket) okunur ve yazılır; yalnız ilk kaydı reddedilir.
export const yerelPaketReddi = (depo: ArkonDeposu, kimlik: string, mevcut: number | null): boolean =>
  depo === 'pkgs' && mevcut === null && paketEmri(kimlik) === null && paketIsEmri(kimlik) === null;

// Sürüm kuralı: var olan belgeye yalnız bildiği sürümü taşıyan yazar (taban yok ya da eski: çakışma, yazılmaz).
// Olmayan belgenin ilk yazımı tabana bakmaz.
export const yazimCakisiyorMu = (mevcut: number | null, taban: number | null): boolean => mevcut !== null && mevcut !== taban;
// Silme de son bilinen sürümle yapılır (store.ts DB.del tabanı gönderir): başkasının sonradan değiştirdiği belge silinmez. Olmayan belgenin silmesi
// tabana bakmaz.
export const silmeCakisiyorMu = (mevcut: number | null, taban: number): boolean => mevcut !== null && mevcut !== taban;

// Arkon'un tesis yapısı: kimlikler TMI kodlarıdır (istasyon kodu Arkon'da makine adıyla da anılır).
const TIP: Record<Istasyon['tip'], string> = {
  talasli: 'cnc', kalite: 'kalite', depo: 'depo', markalama: 'mark', boya: 'boya', montaj: 'montaj',
};
const BAGLANTI: Record<NonNullable<Makine['baglantiTuru']>, string> = {
  focas: 'focas', opcua: 'opcua', mtconnect: 'mtc', modbus: 'modbus', dijital_giris: 'io',
};

export function tesisKur(merkezler: readonly IsMerkezi[], istasyonlar: readonly Istasyon[], makineler: readonly Makine[]) {
  const merkezKodu = new Map(merkezler.map((m) => [m.id, m.kod]));
  const istasyonKodu = new Map(istasyonlar.map((i) => [i.id, i.kod]));
  return {
    wcs: merkezler.map((m) => ({ id: m.kod, name: m.ad, note: m.aciklama ?? '', active: m.aktif })),
    sts: istasyonlar.flatMap((i) => {
      const wc = merkezKodu.get(i.isMerkeziId);
      // tmi: TMI istasyon kimliği; pano küçük resmi Çizim Merkezi'nden bu kimlikle okunur (777).
      return wc === undefined ? [] : [{ id: i.kod, name: i.ad, wc, t: TIP[i.tip], active: i.aktif, tmi: i.id }];
    }),
    mcs: makineler.flatMap((m) => {
      const st = m.istasyonId === null ? undefined : istasyonKodu.get(m.istasyonId);
      if (st === undefined) return [];
      return [{
        id: m.kod, name: m.ad, kind: m.tur ?? '', make: m.markaModel ?? '', serial: m.seriNo ?? '', st,
        conn: m.baglantiTuru === null ? '' : BAGLANTI[m.baglantiTuru], addr: m.baglantiAdresi ?? '', active: m.aktif,
      }];
    }),
  };
}

export const durusNedenleriniCevir = (nedenler: readonly DurusNedeni[]) => nedenler.map((n) => ({
  code: n.kod, l: n.ad, ...(n.simge === null ? {} : { i: n.simge }), cat: n.kategori === 'planli' ? 'p' : 'u',
  ...(n.cagriEkibi === null ? {} : { team: n.cagriEkibi }), ...(n.cagriGecikmeDk === null ? {} : { after: n.cagriGecikmeDk }),
  active: n.aktif,
}));

export const hurdaNedenleriniCevir = (nedenler: readonly HurdaNedeni[]) =>
  nedenler.map((n) => ({ code: n.kod, l: n.ad, active: n.aktif }));

// TMI'de açılmış ama Arkon'da paketi hazırlanmamış emir, Hazırlık'ta taslak paket olarak görünür.
// Hazırlık paketi kaydedince Arkon belgesi olur ve bundan sonra o belge geçerlidir. Revizyon Arkon'un yeni paket
// varsayılanıdır (A); operasyon TMI emrinde yoktur, Hazırlık'ta girilir. `partNo` emrin parça metnidir; `malzemeNo` ürünün
// malzeme kartıdır (bağlamada parça buna bağlanır), adımsız eski emirde null.
export const emirPaketKimligi = (emirId: number) => `tmi-ue-${emirId}`;

export function emirdenTaslakPaket(emir: Emir, istasyon: Istasyon, proje = '') {
  const acilma = Date.parse(emir.acilma);
  return {
    id: emirPaketKimligi(emir.id), no: emir.emirNo, opType: TIP[istasyon.tip], st: {},
    partNo: emir.parcaNo, malzemeNo: emir.malzemeNo ?? null, part: emir.parcaAd, proje, rev: 'A', op: '', machine: istasyon.kod,
    target: emir.adet, cycle: 0, due: '', priority: 'normal', material: '', note: '',
    files: [], primary: null, plan: [], steps: [], status: 'draft', version: 0, dirty: true,
    createdAt: acilma, updatedAt: acilma, by: emir.acan.ad, from: 'tmi',
  };
}

// Rotalı emirde paket iş emri başınadır (kart #199 adım 1): `tmi-ie-<iş emri id>`, makinesi iş emrinin istasyonu. TMI'den gelen alanlar
// (TMI_PAKET_ALANLARI) her okumada iş emrinden yazılır, Hazırlık'ın eklediği resim, plan, kural ve adımlar kalır. Aynı parça ve operasyonun
// son yayınlanmış paketi şablondur: taslak onun resim, plan, kural ve adımlarıyla açılır, Hazırlık tek tıkla yayınlar. Şablon yoksa adımlar
// rotanın geçerli talimatından gelir (emre kopyalanan sürüm uretim-emirleri `disari`'sinde yok; UYUM-BORCU).
export const isEmriPaketKimligi = (isEmriId: number) => `tmi-ie-${isEmriId}`;
// Elle bölünmüş işin (kart #1572) her parçası ayrı pakettir: kendi makinesi, adedi ve sırası. Kayıt ve sayım yine iş emrine yazılır.
export const parcaPaketKimligi = (isEmriId: number, no: number) => `tmi-ie-${isEmriId}-p${no}`;

export const TMI_PAKET_ALANLARI = ['no', 'partNo', 'malzemeNo', 'part', 'proje', 'rev', 'op', 'machine', 'mc', 'target', 'cycle', 'setup', 'due', 'priority', 'tmi'] as const;
const SABLON_ALANLARI = ['files', 'primary', 'plan', 'steps', 'rules', 'samp', 'readCfg', 'derived', 'material', 'note'] as const;

export interface IsEmriPaketGirdisi {
  isEmri: {
    id: number; uretimEmriId: number; emirNo: string; malzemeNo: number; adet: number; teslim: string | null; oncelik: number;
    opNo: number; ad: string; ayarSuresiDk: string | null; birimSureDk: string | null; tur?: string | undefined;
    // Bu adımın işleyeceği adet: önceki biten adımın hurdası düşülmüş (uretim-emirleri adimAdedi); yoksa emir adedi.
    adimAdedi?: number | undefined;
    // Adımın ilk parça seçimi bu revizyonun aynı OP'li adımındadır (744 a); rotasız emirde yok.
    kaynakRotaRevizyonId?: number | null | undefined;
  };
  ekAciklama?: string | null | undefined;
  emir: Pick<Emir, 'parcaNo' | 'parcaAd' | 'acan' | 'acilma'>;
  // Emrin projesinin adı (projeler modülü); projesiz emirde boş metin.
  proje?: string | undefined;
  // İstasyonu bilinmeyen (kaynak seçilmemiş) iş emrinin paketi Hazırlık'ta görünür ama yayınlanamaz (`yayinEksigi`, kart #1257).
  istasyon: Istasyon | null;
  makineKodu: string | null;
  revizyon: string | null;
  talimat: string | null;
  sablon: Record<string, unknown> | null;
  // Rotasız emrin iş emri plana girmez: plan durumu yoktur, yayınlanınca operatöre düşer.
  plan: TmiPlanDurumu | null;
  // Kart #1372: rotasında girensiz adım olan emrin paketi Hazırlık'ta nedeniyle görünür, yayınlanamaz (`yayinEksigi`).
  rotaEksik?: string | null | undefined;
  // Talaşlı istasyondaki emrin CNC kurulum hazırlığı tamamlanmadıysa (kullanıcı kararı 16.10: kilit yok, yalnız uyarı).
  hazirlik?: HazirlikEksigi | null | undefined;
  // Adımın Kalite Merkezi'ndeki son ilk parça kararı (denetim #12, 744 a): tablet ilk parça kapısını buradan okur, sunucu kapısıyla aynı kaynak.
  ilkParca?: { karar: 'onay' | 'ret'; zaman: string } | null | undefined;
  // Adımın rotadaki ilk parça seçimi (744 a): "yok" taslağın ilk parça kuralını kapatır; kayıtlı paketin kuralı paketindir.
  ilkParcaSecimi?: IlkParcaSecimi | undefined;
  // Kalite istasyonunun AQL lot planı (564 2 a): Kalite Merkezi'nin hesabı; sıkılık durdurulmuşsa `durduruldu`.
  aql?: TmiAqlPlani | null | undefined;
  // Adımın rotadaki girenleri (521 3 a): kayıtsız taslağın Malzeme alanına yazılır (`girenMetni`); kayıtlı paket ve dolu şablon değişmez.
  girenler?: readonly AdimGireni[] | undefined;
  // Bölünmüş işin parçası: paket kimliği, hedef adet ve `tmi.parca` parçadandır; istasyon ve makine parçanın kaynağıdır.
  parca?: { no: number; adet: number; toplam: number } | null | undefined;
  // Bölünmüş işin bütün paketi: operatöre düşmez, parçaları düşer (kayıtlı paketin hazırlığı parçalara şablon olur).
  bolunmus?: boolean | undefined;
}

export type HazirlikEksigi = 'yok' | 'suruyor';

// 564 2 a: kalite istasyonunun lot planı Kalite Merkezi'nin AQL hesabından gelir; tablet tek numune sayısı ve tek Ac kullandığı için
// `n` örneklemeli sınıfların en büyüğü, `ac`/`re` majör sınıfınındır (VARSAYIM: istasyonun kusur listesi sınıf ayırmaz, kusur majör sayılır).
// Sınıfların tamamı tabloyla gider, ekran gösterir.
export type TmiAqlPlani =
  | { durduruldu: true }
  | { n: number; ac: number; re: number; siddet: string; seviye: string; siniflar: { sinif: string; aql: string; n: number; ac: number; re: number; yuzde100: boolean }[] };
export function tmiAqlPlani(sonuc: { plan: MuayenePlani } | { durduruldu: true } | { gecersiz: true }): TmiAqlPlani | null {
  if ('durduruldu' in sonuc) return { durduruldu: true };
  if ('gecersiz' in sonuc) return null;
  const { plan } = sonuc;
  const majör = plan.siniflar.find((x) => x.sinif === 'Majör');
  if (majör === undefined) return null;
  return {
    n: plan.n, ac: majör.ac, re: majör.re, siddet: plan.siddet, seviye: plan.ayar.seviye,
    siniflar: plan.siniflar.map((x) => ({ sinif: x.sinif, aql: x.aql, n: x.n, ac: x.ac, re: x.re, yuzde100: x.yuzde100 })),
  };
}

// Uyarı yalnız talaşlı (CNC) istasyonda: öteki istasyonlarda CNC kurulumu yapılmaz. Kurulumu hiç açılmamış emir de uyarı alır.
export function hazirlikEksigi(istasyonTipi: Istasyon['tip'], durum: 'yok' | 'suruyor' | 'tamam' | undefined): HazirlikEksigi | null {
  if (istasyonTipi !== 'talasli') return null;
  return durum === 'tamam' ? null : durum ?? 'yok';
}

const dakika = (d: string | null): number | null => (d === null || !Number.isFinite(Number(d)) ? null : Number(d));

export const talimatAdimlari = (metin: string | null) => (metin ?? '').split(/\r?\n/).map((t) => t.trim()).filter((t) => t !== '')
  .map((t, i) => ({ id: `tmi-${i + 1}`, t, d: '', r: false }));

export interface AdimGireni { kod: string; ad: string | null; miktar: string; birim: string | null }
// Miktar emrin brüt ihtiyacıdır (uretim-emirleri `emirMalzemeIhtiyaci`, dört haneli ondalık metin); sondaki sıfırlar atılır, ondalık ayırıcı virgüldür.
export function girenMetni(girenler: readonly AdimGireni[]): string {
  return girenler.map((g) => {
    const miktar = g.miktar.includes('.') ? g.miktar.replace(/0+$/, '').replace(/\.$/, '').replace('.', ',') : g.miktar;
    return [g.kod, g.ad, `${miktar}${g.birim === null ? '' : ` ${g.birim}`}`].filter((p) => p !== null && p !== '').join(' · ');
  }).join('; ');
}
export function isEmrindenTaslakPaket(g: IsEmriPaketGirdisi): Record<string, unknown> {
  const { isEmri: ie, emir, istasyon, sablon } = g;
  const acilma = Date.parse(emir.acilma);
  const birim = dakika(ie.birimSureDk);
  const ayar = dakika(ie.ayarSuresiDk);
  const opType = istasyon === null ? 'cnc' : TIP[istasyon.tip];
  const kopya = sablon === null ? {} : Object.fromEntries(SABLON_ALANLARI.filter((a) => a in sablon).map((a) => [a, sablon[a]]));
  return {
    id: g.parca ? parcaPaketKimligi(ie.id, g.parca.no) : isEmriPaketKimligi(ie.id), no: ie.emirNo, opType, st: sablon !== null && sablon['opType'] === opType && kayitMi(sablon['st']) ? sablon['st'] : {},
    partNo: emir.parcaNo, malzemeNo: ie.malzemeNo, part: emir.parcaAd, proje: g.proje ?? '', rev: g.revizyon ?? '', op: `Op ${ie.opNo} · ${ie.ad}`,
    machine: istasyon?.kod ?? '', mc: g.makineKodu ?? '', target: g.parca?.adet ?? ie.adimAdedi ?? ie.adet, cycle: birim === null ? null : Math.round(birim * 600) / 10, setup: ayar,
    due: ie.teslim ?? '', priority: ie.oncelik === 1 ? 'urgent' : 'normal', material: '', note: '',
    files: [], primary: null, plan: [], steps: talimatAdimlari(g.talimat), ...kopya,
    ...(g.girenler?.length && doluMetin(kopya['material']) === null ? { material: girenMetni(g.girenler) } : {}),
    ...(g.ilkParcaSecimi === 'yok' ? { rules: ilkParcasizKural(kopya['rules']) } : {}),
    status: 'draft', version: 0, dirty: true, createdAt: acilma, updatedAt: acilma, by: emir.acan.ad, from: 'tmi',
    tmi: { emirId: ie.uretimEmriId, isEmriId: ie.id, opNo: ie.opNo, plan: g.plan, ...adimTuruAlanlari(ie.tur, g.ekAciklama), ...(g.rotaEksik ? { rotaEksik: g.rotaEksik } : {}), ...(g.hazirlik ? { hazirlik: g.hazirlik } : {}), ...(g.ilkParca ? { ilkParca: { karar: g.ilkParca.karar, zaman: g.ilkParca.zaman } } : {}), ...(g.aql ? { aql: g.aql } : {}),
      ...(g.parca ? { parca: { no: g.parca.no, adet: g.parca.adet, toplam: g.parca.toplam } } : {}), ...(g.bolunmus ? { bolunmus: true } : {}) },
  };
}

// Tablet eksik kuralı varsayılanla tamamlar (arkon/web kurallar.ts `RULES0`): şablonun öteki kuralları korunur, yalnız ilk parça kapanır.
function ilkParcasizKural(kural: unknown): Record<string, unknown> {
  const k = kayitMi(kural) ? kural : {};
  return { ...k, q: { ...(kayitMi(k['q']) ? k['q'] : {}), firstPiece: false } };
}

// 744 a: TMI'de adımın sağlamı ilk parça kararını bekler mi. Rota seçimi "her kurulumda" ve iş talaşlıysa bekler (tanınmayan, istasyonsuz iş
// talaşlı sayılır, `ilkParcaOlculeri` gibi). Talaşlı olmayan adımda (kalite, depo, boya, montaj) Arkon kapısı ilk parça ölçüsü istemez; orada
// kilit, kararı tabletten hiç sorulmayan bir bekleyiş olurdu (VARSAYIM).
export function ilkParcaGereksinimi(secim: IlkParcaSecimi, istasyonTipi: Istasyon['tip'] | null): 'gerekli' | 'gerekmez' {
  return secim === 'her_kurulum' && (istasyonTipi === null || istasyonTipi === 'talasli') ? 'gerekli' : 'gerekmez';
}

// Bölünmüş işin kayıtlı bütün paketi parçalara şablondur; yayındaysa parça da onun yayınıyla açılır (parça planın kararıdır, Hazırlık'ı
// yeniden istemez). Parçanın kendi kaydı varsa o geçerlidir.
export const butunPaketSablonu = (butun: unknown): Record<string, unknown> | null => (kayitMi(butun) ? butun : null);
export function parcaYayini(govde: Record<string, unknown>, butun: unknown): Record<string, unknown> {
  if (!kayitMi(butun) || butun['status'] !== 'published') return govde;
  return { ...govde, status: 'published', publishedAt: butun['publishedAt'], dirty: false };
}

// Rota adımı etiketsizdir: türü ve açıklaması paketten hiç yazılmaz (kayıtlı paketlerin içeriği ve sürümü değişmesin).
export const ADIM_TURLERI = ['rework', 'tamir', 'ek'] as const;
export function adimTuruAlanlari(tur: string | undefined, ekAciklama: string | null | undefined): { tur?: string; ekAciklama?: string } {
  if (!ADIM_TURLERI.some((t) => t === tur)) return {};
  const aciklama = (ekAciklama ?? '').trim();
  return { tur: tur as string, ...(aciklama === '' ? {} : { ekAciklama: aciklama }) };
}

// Rotalı işin plan durumu (kart #199, A4): canlı planda yerleşimi var mı, yerleştiği kaynaktaki sırası (1'den) ve kaynak iş emrininkiyle
// eşleşiyor mu. `zorunlu` ayarın (`arkon.yalniz-canli-plan`, kart #1257) değeridir: açıkken operatör paketi yalnız canlı ve eşleşen işte görür,
// başlatma da yalnız onda TMI'ye işlenir (`planBaslatmaReddi`); kapalıyken plan durumu yalnız bilgidir.
// Kişi kaynağında makine yoktur: paketin istasyonu iş emrininkidir, istasyon eşleşmesi yeter. Kaynak, Arkon Planlama'nın sıralama komutuna
// (`planSirasiYaz`) gider: plan kuyruğu kaynak başınadır, bir istasyonda birden çok makine olabilir.
interface PlanKaynagi { tur: string; id: number }
// taslakta: canlıda yok ama açık bir plan taslağında yerleşmiş (uyarı "canlıya alınmadı" der).
// siraOnayi (147 a): canlı işin sırası bir taslakta değişmiş; sıra canlıya ancak taslak onaylanıp canlıya alınınca geçer, ekran bunu gösterir.
export type SiraOnayi = 'taslakta' | 'onayda';
export interface TmiPlanDurumu {
  canli: boolean; sira: number | null; eslesiyor: boolean; kaynak: PlanKaynagi | null; zorunlu: boolean; taslakta?: true; siraOnayi?: SiraOnayi;
}
export const PLANSIZ: TmiPlanDurumu = { canli: false, sira: null, eslesiyor: false, kaynak: null, zorunlu: true };

// Yerleşimler canlı plandaki başlangıç sırasıyla gelir (plan `canliSira`).
export interface PlanYerlesimi {
  isEmriId: number; kaynak: PlanKaynagi; baslangic?: Date | undefined;
  parcalar?: readonly { no: number; kaynak: PlanKaynagi; baslangic: Date }[] | undefined;
}
// Bölünmüş işin parçaları kendi kaynaklarının kuyruğunda ayrı iştir: sıra parçalarla birlikte, başlangıca göre sayılır. Parçanın durumu
// `parcalar` haritasına (paket kimliğiyle) yazılır; parça kendi kaynağındadır, eşleşir. İşin kendisi zarfın (ilk parçanın) yerindedir.
export function planDurumlari(
  yerlesimler: readonly PlanYerlesimi[], isEmriKaynaklari: ReadonlyMap<number, PlanKaynagi | null>, zorunlu = true,
  parcalar?: Map<string, TmiPlanDurumu>,
): Map<number, TmiPlanDurumu> {
  type Birim = { y: PlanYerlesimi; kaynak: PlanKaynagi; no: number | null; baslangic: number; sira: number };
  const birimler = yerlesimler.flatMap((y, sira): Birim[] => (y.parcalar?.length
    ? y.parcalar.map((p) => ({ y, kaynak: p.kaynak, no: p.no, baslangic: p.baslangic.getTime(), sira }))
    : [{ y, kaynak: y.kaynak, no: null, baslangic: y.baslangic?.getTime() ?? 0, sira }]));
  // Parçasız yerleşimler okuma sırasıyla (başlangıç) gelir; parçalar araya başlangıçlarıyla girer.
  if (birimler.some((b) => b.no !== null)) birimler.sort((a, b) => a.baslangic - b.baslangic || a.sira - b.sira || (a.no ?? 0) - (b.no ?? 0));
  const sayac = new Map<string, number>();
  const sonuc = new Map<number, TmiPlanDurumu>();
  for (const b of birimler) {
    const anahtar = `${b.kaynak.tur}:${b.kaynak.id}`;
    const sira = (sayac.get(anahtar) ?? 0) + 1;
    sayac.set(anahtar, sira);
    const kaynak = { tur: b.kaynak.tur, id: b.kaynak.id };
    if (b.no !== null) {
      parcalar?.set(parcaPaketKimligi(b.y.isEmriId, b.no), { canli: true, sira, eslesiyor: true, kaynak, zorunlu });
      if (sonuc.has(b.y.isEmriId)) continue;
    }
    const ie = isEmriKaynaklari.get(b.y.isEmriId) ?? null;
    const zarf = b.y.kaynak;
    const eslesiyor = zarf.tur === 'kisi' ? ie !== null : ie !== null && ie.tur === zarf.tur && ie.id === zarf.id;
    sonuc.set(b.y.isEmriId, { canli: true, sira, eslesiyor, kaynak: { tur: zarf.tur, id: zarf.id }, zorunlu });
  }
  return sonuc;
}

// Arkon Planlama'dan sıralama (A4): ekranın gördüğü sıra (`onceki`) canlı plandaki sırayla aynı olmalı, yeni sıra aynı işlerin dizilişidir.
// Plan sürümü pakete yazılmaz (her canlıya almada bütün paketlerin sürümü değişirdi); eski ekranı bu karşılaştırma yakalar.
export function planSirasiReddi(onceki: readonly number[], yeni: readonly number[], canli: readonly number[]): 'planSiraGecersiz' | 'planSiraEski' | null {
  const a = [...onceki].sort((x, y) => x - y), b = [...yeni].sort((x, y) => x - y);
  if (a.length !== b.length || new Set(a).size !== a.length || a.some((x, i) => x !== b[i])) return 'planSiraGecersiz';
  const gorunen = new Set(onceki);
  const canlida = canli.filter((x) => gorunen.has(x));
  return canlida.length === onceki.length && canlida.every((x, i) => x === onceki[i]) ? null : 'planSiraEski';
}

// Kilitli, dondurulmuş ve bitmiş iş ekranın sırasındaki yerinde kalır, plana yalnız taşınabilen işler gider. Başlamış iş taşınabilir:
// önüne alınan iş operatöre bildirilir, operatör ona geçince çalışan iş duraklatılır.
export function planSirasiTasinacaklar<T>(onceki: readonly T[], yeni: readonly T[], sabit: ReadonlySet<T>): T[] | 'planSiraSabit' | 'planSiraDegismedi' {
  if (onceki.some((x, i) => sabit.has(x) && yeni[i] !== x)) return 'planSiraSabit';
  const tasinacak = yeni.filter((x) => !sabit.has(x));
  const eski = onceki.filter((x) => !sabit.has(x));
  return tasinacak.some((x, i) => x !== eski[i]) ? tasinacak : 'planSiraDegismedi';
}

// Sırası taslakta değişmiş iş emirleri: onaydaki taslak açıktakinden önce gelir (onay bekleyen sıra, kişinin yeni denemesiyle gizlenmez).
export function siraOnaylari(bekleyen: readonly { isEmriId: number; durum: 'acik' | 'onayda' }[]): Map<number, SiraOnayi> {
  const sonuc = new Map<number, SiraOnayi>();
  for (const b of bekleyen) if (b.durum === 'onayda' || !sonuc.has(b.isEmriId)) sonuc.set(b.isEmriId, b.durum === 'onayda' ? 'onayda' : 'taslakta');
  return sonuc;
}
// Yalnız canlı plandaki işin sırası bekleyebilir; canlıda olmayan iş zaten "taslakta" ya da "planlanmadı" der.
export function siraOnayiniYaz(planlar: Map<number, TmiPlanDurumu>, onaylar: ReadonlyMap<number, SiraOnayi>): void {
  for (const [id, siraOnayi] of onaylar) {
    const d = planlar.get(id);
    if (d?.canli) planlar.set(id, { ...d, siraOnayi });
  }
}

export const planSiralayabilirMi = (rol: ArkonRolu): boolean => rol === 'admin' || (yetkiMatrisi()[rol] ?? []).includes('plan.edit');

export const planAcik = (d: TmiPlanDurumu | undefined): boolean => d !== undefined && (!d.zorunlu || (d.canli && d.eslesiyor));

// Ayar açıkken (`zorunlu`) iş emri paketinin ilk başlatması (iş emri bekliyor) canlı ve eşleşen plan ister; başlamış adımın devamı, öteki olaylar
// ve rotasız emrin paketi serbesttir. Ayar kapalıyken başlatma plana bakılmadan işlenir.
export function planBaslatmaReddi(
  tur: ArkonKayitTuru, satir: Readonly<Record<string, unknown>>, isEmriDurumu: string | null, plan: TmiPlanDurumu | undefined, zorunlu = true,
): boolean {
  return zorunlu && tur === 'events' && satir['state'] === 'running' && paketIsEmri(satir['pkgId']) !== null && isEmriDurumu === 'bekliyor' && !planAcik(plan);
}

// İş emri paketinde çalışmaya geçen olay adımı başlatır, biten olay bitirir; parti kuralı bu iki komut için kayıttan önce sorulur.
export function partiKomutu(tur: ArkonKayitTuru, satir: Readonly<Record<string, unknown>>): 'baslat' | 'bitir' | null {
  if (tur !== 'events' || paketIsEmri(satir['pkgId']) === null) return null;
  return satir['state'] === 'running' ? 'baslat' : satir['state'] === 'done' ? 'bitir' : null;
}

// Şablon: aynı malzeme kartının aynı revizyon ve operasyon numaralı, en son yayınlanmış iş emri paketi. Revizyon değişince resim ve kontrol
// planı eskisinden kopyalanmaz (revizyonu bilinmeyen emirde şablon yok).
export function sablonPaket(kayitli: readonly unknown[], malzemeNo: number, opNo: number, revizyon: string | null): Record<string, unknown> | null {
  if (revizyon === null || revizyon === '') return null;
  let secilen: Record<string, unknown> | null = null;
  for (const p of kayitli) {
    if (!kayitMi(p) || p['malzemeNo'] !== malzemeNo || p['rev'] !== revizyon || alanOku(p['tmi'], 'opNo') !== opNo || typeof p['publishedAt'] !== 'number') continue;
    if (secilen === null || (p['publishedAt'] as number) > (secilen['publishedAt'] as number)) secilen = p;
  }
  return secilen;
}

// Kayıtlı iş emri paketine TMI alanlarını yazar; değişen yoksa aynı nesne döner (sürüm aynı kalsın).
export function tmiAlanlariniYaz(kayitli: unknown, kaynak: unknown): unknown {
  if (!kayitMi(kayitli)) return kayitli;
  const yeni = { ...kayitli, ...Object.fromEntries(TMI_PAKET_ALANLARI.map((a) => [a, alanOku(kaynak, a)])) };
  return kanonik(yeni) === kanonik(kayitli) ? kayitli : yeni;
}

// Açık taslağı olmayan (bitmiş ya da plan dışı kalmış) iş emri paketinde plan durumu yoktur: kayıtlı `tmi.plan` yayın anındaki durumdur ve
// bitmiş işte "Planlanmadı" diye takılı kalırdı. Paket `tmi.plan` taşımayınca ekran onu planla süzmez ve etiketlemez.
export function plansizKaynak(kayitli: unknown): unknown {
  const tmi = alanOku(kayitli, 'tmi');
  if (!kayitMi(kayitli) || !kayitMi(tmi) || !('plan' in tmi)) return kayitli;
  const { plan: _plan, ...kalan } = tmi;
  return { ...kayitli, tmi: kalan };
}

// AR-BI-2 (kart #1194): TMI'de biten emrin paketi okumada `tmi.bitti` taşır; terminal işi biten işlere alır ve sayacı kapatır. TMI biten
// emre sayımı zaten reddeder; bayrak olmadan terminal sayıyı yine de artırıp azaltıyordu.
export function bitenEmirIsareti(govde: unknown): unknown {
  if (!kayitMi(govde)) return govde;
  const tmi = alanOku(govde, 'tmi');
  if (kayitMi(tmi) && tmi['bitti'] === true) return govde;
  return { ...govde, tmi: { ...(kayitMi(tmi) ? tmi : {}), bitti: true } };
}

// TMI alanları okumada değişmişse ekran belgeyi yeniden alsın diye sürüm de değişir; yazım bu sürümü kayıtlı sürüm sayar (`tabanCoz`).
export function tmiBirlesikSurum(surum: number, kayitli: unknown, birlesik: unknown): number {
  return kayitli === birlesik ? surum : icerikSurumu({ surum, tmi: TMI_PAKET_ALANLARI.map((a) => alanOku(birlesik, a)) });
}

export function tabanCoz(taban: number | null, kayitli: { surum: number; govde: unknown } | null, birlesik: unknown): number | null {
  return taban !== null && kayitli !== null && taban === tmiBirlesikSurum(kayitli.surum, kayitli.govde, birlesik) ? kayitli.surum : taban;
}

// TMI'den türeyen belgenin sürümü içeriğinin özetidir: içerik değişmedikçe aynı kalır (32 bit FNV-1a).
export function icerikSurumu(deger: unknown): number {
  let h = 0x811c9dc5;
  for (const c of JSON.stringify(deger)) {
    h ^= c.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h || 1;
}

// Kayıt satırının süzgeç sütunları; satır Arkon'un alan adlarıyla gelir. Kişi alanları TMI kimliğinden yazılır.
export interface KayitSutunlari {
  cid: string;
  zaman: Date;
  makine: string | null;
  isMerkezi: string | null;
  emirNo: string | null;
  paketId: string | null;
  maddeId: number | null;
}

// Kayıt anındaki TMI tesisinden çözülen kimlikler; kod tesiste yoksa (ya da satırda kod yoksa) null.
export interface KonumKimlikleri { istasyonId: number | null; isMerkeziId: number | null }

export function konumKimlikleri(
  s: Pick<KayitSutunlari, 'makine' | 'isMerkezi'>,
  istasyonKimlikleri: ReadonlyMap<string, number>,
  merkezKimlikleri: ReadonlyMap<string, number>,
): KonumKimlikleri {
  return {
    istasyonId: s.makine === null ? null : istasyonKimlikleri.get(s.makine) ?? null,
    isMerkeziId: s.isMerkezi === null ? null : merkezKimlikleri.get(s.isMerkezi) ?? null,
  };
}

// Kayıt zamanı: tabletin zamanı sunucu saatinden en çok 12 saat geride ve 2 dakikadan fazla ileride değilse esastır (çevrimdışı kuyruktan
// gelen kayıt kendi zamanını korur, geç gelen kayıtlar aynı ana yığılmaz); dışındaysa sunucu saati yazılır. `istemciZamani` her durumda
// ayrıca saklanır. Pencere tek yerdedir; karar değişirse yalnız bu sabit değişir.
export const ISTEMCI_ZAMANI_PENCERESI = { geriMs: 12 * 3600e3, ileriMs: 2 * 60e3 } as const;
export function kayitZamani(istemci: unknown, simdi: number): number {
  const icinde = typeof istemci === 'number' && Number.isFinite(istemci)
    && istemci >= simdi - ISTEMCI_ZAMANI_PENCERESI.geriMs && istemci <= simdi + ISTEMCI_ZAMANI_PENCERESI.ileriMs;
  return icinde ? istemci : simdi;
}

const metin = (d: unknown): string | null => (typeof d === 'string' && d !== '' ? d.slice(0, 200) : null);

export function kayitSutunlari(satir: Readonly<Record<string, unknown>>, simdi: number): KayitSutunlari | null {
  const cid = metin(satir['cid']);
  if (cid === null) return null;
  const madde = satir['itemId'];
  return {
    cid,
    zaman: new Date(kayitZamani(satir['at'], simdi)),
    makine: metin(satir['machine']),
    isMerkezi: metin(satir['wc']),
    emirNo: metin(satir['orderNo']),
    paketId: metin(satir['pkgId']),
    maddeId: typeof madde === 'number' && Number.isInteger(madde) ? madde : null,
  };
}

// Kayıt zamanı ve kişi sunucudandır. İstemcinin zamanı (çevrilimdışı kuyruktan gelen kayıt dahil) yalnız istemciZamani
// alanında saklanır ve esas sayılmaz; kişiyi anlatan her alan (userId, userName, by, who, user*, operator*, kisi*) atılır.
const KISI_ALANI = /^(by|who|user\w*|operator\w*|kisi\w*)$/i;

export function kayitGovdesi(satir: Readonly<Record<string, unknown>>, kisi: { id: number; ad: string }, simdi: number): Record<string, unknown> {
  const istemci = satir['at'];
  const gelen = Object.fromEntries(Object.entries(satir).filter(([alan]) => alan !== 'at' && alan !== 'istemciZamani' && alan !== KARAR_BEKLIYOR_ALANI && !KISI_ALANI.test(alan)));
  return {
    ...gelen, at: kayitZamani(istemci, simdi), istemciZamani: typeof istemci === 'number' && Number.isFinite(istemci) ? istemci : null,
    userId: String(kisi.id), userName: kisi.ad,
  };
}

// Değişiklik günlüğünü yalnız sunucu yazar; makine kaynağını (src: auto) yalnız ileride hizmet kimliği yazacak (kart #213).
// Hazırlıkta (ekranın yazdığı `state: 'setup'`) iyi parça sayılmaz: ertelenen sayım üretime geçince sağlama yazılıyor, onaysız ilk parçalar
// iyi sayılıyordu. Düzeltme (eksi) ve hurda geçer.
export type KayitReddi = 'gunlukSunucu' | 'makineKaynagi' | 'hazirliktaSayim' | null;
export function kayitReddi(tur: ArkonKayitTuru, satir: Readonly<Record<string, unknown>>): KayitReddi {
  if (tur === 'audit') return 'gunlukSunucu';
  if (tur === 'counts' && satir['state'] === 'setup' && satir['kind'] === 'good' && typeof satir['delta'] === 'number' && satir['delta'] > 0) return 'hazirliktaSayim';
  return satir['src'] === 'auto' ? 'makineKaynagi' : null;
}

// Arkon dosyası türsüz saklanır (özetle anılır). Tür ilk baytlardan bulunur: cevap türü ağdaki sıkıştırmayı seçer (PDF ve resim
// zaten sıkışıktır); tanınmayan içerik (IGES, STL, hazır 3B ağı) türsüz kalır. Tarayıcı türü yorumlamaz: cevap nosniff ve sandbox'tır.
export const DOSYA_IMZA_BAYTI = 16;
export function dosyaTuruBul(ilk: Uint8Array): string {
  const metin = Buffer.from(ilk.subarray(0, DOSYA_IMZA_BAYTI)).toString('latin1');
  if (metin.startsWith('%PDF-')) return 'application/pdf';
  if (metin.startsWith('\x89PNG\r\n\x1a\n')) return 'image/png';
  if (metin.startsWith('\xff\xd8\xff')) return 'image/jpeg';
  if (metin.startsWith('RIFF') && metin.slice(8, 12) === 'WEBP') return 'image/webp';
  if (metin.startsWith('glTF')) return 'model/gltf-binary';
  if (metin.startsWith('ISO-10303-21')) return 'model/step';
  return 'application/octet-stream';
}

// Dosya kotası (kullanıcı kararı): tek dosya 200 MB (sözleşme AZAMI_DOSYA), kişi başına 5 açık yükleme, depo toplamı (tamamlanan dosyalar +
// açık parçalar) 50 GB. Açık parça bayt sınırı kişi başına 1 GiB VARSAYIMDIR.
export const DOSYA_KOTASI = { kisiAcikYukleme: 5, kisiAcikBayt: 1024 ** 3, depoBayt: 50 * 1024 ** 3 } as const;

export type KotaReddi = 'kotaYukleme' | 'kotaBayt' | 'kotaDepo';
// kisiAdet: kişinin açık yükleme sayısı (zaten açık bir yüklemeye devam ediyorsa 0 verilir); yeniBayt: bu parçanın ekleyeceği bayt.
export function yuklemeKotasiHatasi(
  d: { kisiAdet: number; kisiBayt: number; depoBayt: number; yeniBayt: number }, sinir: Readonly<Record<keyof typeof DOSYA_KOTASI, number>> = DOSYA_KOTASI,
): KotaReddi | null {
  if (d.kisiAdet >= sinir.kisiAcikYukleme) return 'kotaYukleme';
  if (d.kisiBayt + d.yeniBayt > sinir.kisiAcikBayt) return 'kotaBayt';
  if (d.depoBayt + d.yeniBayt > sinir.depoBayt) return 'kotaDepo';
  return null;
}

// Çizim Merkezi'nden alma (kart #800). Rol, paketi düzenleyenlerdir (Hazırlık ve Çizim stüdyosundan pakete aktarma aynı yazarlarla gider).
export const merkezdenAlabilirMi = (rol: ArkonRolu): boolean => DEPO_YAZARLARI.pkgs.includes(rol);
// Soru 197 a: merkez çiziminin güncel olup olmadığını paketi okuyabilen her rol sorar (salt okuma; terminal eski revizyonu başlatmadan önce
// gösterir). Dosya almak ve listelemek paket yazanlarda kalır.
export const merkezDurumunuOkuyabilirMi = (rol: ArkonRolu): boolean => okuyabilirMi('pkgs', rol);

const MERKEZ_DOSYA_UZANTISI = { pdf: 'pdf', step: 'step', stl: 'stl', iges: 'igs' } as const;
export type MerkezDosyaTuru = keyof typeof MERKEZ_DOSYA_UZANTISI;
export const merkezTuruMu = (tur: string): tur is MerkezDosyaTuru => Object.hasOwn(MERKEZ_DOSYA_UZANTISI, tur);

// Karar 732 a: dosyasız taslak, malzemeye bağlı ve yayında revizyonu olan, Arkon'un açabildiği belgeleri önerir (PDF teknik resim,
// 3B model); önce teknik resimler. Dosyası olan taslak (şablondan gelmiş) öneri almaz. Hazırlık öneriyi merkezden alarak pakete koyar.
export interface MalzemeCizimi { belgeId: number; ad: string; tip: 'pdf' | 'model' }
export function malzemeCizimleri(
  dosyalar: unknown, belgeler: readonly { id: number; ad: string; revizyonId: number | null; dosyaTuru: string | null; ozet: string | null }[],
): MalzemeCizimi[] {
  if (Array.isArray(dosyalar) && dosyalar.length > 0) return [];
  const sonuc: MalzemeCizimi[] = [];
  for (const b of belgeler) {
    if (b.revizyonId === null || b.ozet === null || b.dosyaTuru === null) continue;
    const tip = merkezDosyaTipi(b.dosyaTuru);
    if (tip !== null) sonuc.push({ belgeId: b.id, ad: b.ad, tip });
  }
  return sonuc.sort((x, y) => (x.tip === y.tip ? x.belgeId - y.belgeId : x.tip === 'pdf' ? -1 : 1));
}

// Arkon dosyayı türüne göre ayırır: PDF teknik resim, öteki 3B model. Resim biçimleri Arkon'da paket dosyası değildir.
export function merkezDosyaTipi(dosyaTuru: string): 'pdf' | 'model' | null {
  if (!merkezTuruMu(dosyaTuru)) return null;
  return dosyaTuru === 'pdf' ? 'pdf' : 'model';
}

// Arkon dosyanın türünü adındaki uzantıdan çıkarır (isModelName); merkezdeki belge adı uzantısız olabilir.
const MERKEZ_UZANTI_DESENI: Readonly<Record<MerkezDosyaTuru, RegExp>> = {
  pdf: /\.pdf$/i, step: /\.(step|stp|p21)$/i, stl: /\.stl$/i, iges: /\.(igs|iges)$/i,
};
export function merkezDosyaAdi(ad: string, dosyaTuru: MerkezDosyaTuru): string {
  const temiz = ad.replace(/[\\/]+/g, '-').trim().slice(0, 120);
  const taban = temiz === '' ? 'Cizim' : temiz;
  return MERKEZ_UZANTI_DESENI[dosyaTuru].test(taban) ? taban : `${taban}.${MERKEZ_DOSYA_UZANTISI[dosyaTuru]}`;
}

export function merkezDurumu(kayitliOzet: string, yayindakiOzet: string | null): MerkezDurumu {
  if (yayindakiOzet === null) return 'yayindan-kalkti';
  return yayindakiOzet === kayitliOzet ? 'guncel' : 'yeni-revizyon';
}

// Paketin Çizim Merkezi'nden alınmış dosyaları (`merkez` belge no, `merkezOzet` alındığı andaki yayındaki özet); yerel yükleme dışarıda kalır.
export function paketMerkezDosyalari(paket: unknown): { belgeId: number; ozet: string; ad: string }[] {
  const dosyalar = alanOku(paket, 'files');
  if (!Array.isArray(dosyalar)) return [];
  return dosyalar.flatMap((d) => {
    const belgeId = alanOku(d, 'merkez'), ozet = alanOku(d, 'merkezOzet'), ad = alanOku(d, 'name');
    return typeof belgeId === 'number' && Number.isSafeInteger(belgeId) && typeof ozet === 'string'
      ? [{ belgeId, ozet, ad: typeof ad === 'string' && ad !== '' ? ad : `Belge ${belgeId}` }] : [];
  });
}

// Denetim #34: merkezdeki çizimin yeni revizyonu yayındaysa ya da çizim yayından kalktıysa iş başlatılmaz (başlatma ve devam); paket güncel
// revizyonla yenilenmelidir. Duraklatma, duruş ve bitirme engellenmez.
export const cizimRevizyonuEski = (ad: string, durum: MerkezDurumu): string => durum === 'yayindan-kalkti'
  ? `Çizim yayından kalktı: ${ad}. Hazırlık paketi güncellemeden iş başlatılamaz.`
  : `Çizimin yeni revizyonu yayında: ${ad}. Hazırlık paketi yeni revizyonla güncellemeden iş başlatılamaz.`;
export function cizimRevizyonuReddi(dosyalar: readonly { belgeId: number; ozet: string; ad: string }[], yayinda: ReadonlyMap<number, string | null>): string | null {
  for (const d of dosyalar) {
    const durum = merkezDurumu(d.ozet, yayinda.get(d.belgeId) ?? null);
    if (durum !== 'guncel') return cizimRevizyonuEski(d.ad, durum);
  }
  return null;
}

// Emrin çizim durumu (Üretim emirleri hazırlık durdurucusu okur; `cnc-kurulum` EmirHazirlikDurumu biçimi). secildi: emrin bir paketinde
// Çizim Merkezi'nden alınmış çizim var; yok: hiç yok; suruyor: biri yeni revizyona geçti ya da yayından kalktı (paket yenilenmeli);
// tamam: hepsi yayındaki revizyonda, zaman o paketlerin son değişikliği.
export interface EmirCizimDurumu { durum: 'yok' | 'suruyor' | 'tamam'; zaman: string | null; secildi: boolean }
export function emirCizimDurumu(
  paketler: readonly { dosyalar: readonly { belgeId: number; ozet: string; ad: string }[]; degisti: string }[], yayinda: ReadonlyMap<number, string | null>,
): EmirCizimDurumu {
  const cizimli = paketler.filter((p) => p.dosyalar.length > 0);
  if (cizimli.length === 0) return { durum: 'yok', zaman: null, secildi: false };
  if (cizimli.some((p) => cizimRevizyonuReddi(p.dosyalar, yayinda) !== null)) return { durum: 'suruyor', zaman: null, secildi: true };
  const zaman = cizimli.map((p) => p.degisti).reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
  return { durum: 'tamam', zaman, secildi: true };
}

// Ekranda kaçışsız basılan ya da hazır sonuç olarak güvenilen alanların biçimi. Arkon belge gövdesini yorumlamaz ama şu alanlar
// ekranda HTML'e girer: her `svg` metni (çizim), paket kontrol planı satırının `id`si ve numune isteğinin `status`u (rapor sayfası).
const NUMUNE_DURUMLARI: readonly string[] = ['waiting', 'measuring', 'approved', 'rejected', 'deviation'];
const AZAMI_DUGUM = 200_000;

export interface BicimHatasi { ileti: string; alan: string }

function svgAlanlari(govde: unknown): BicimHatasi | null {
  const yigin: { deger: unknown; yol: string }[] = [{ deger: govde, yol: 'govde' }];
  let say = 0;
  for (let oge = yigin.pop(); oge !== undefined; oge = yigin.pop()) {
    if (++say > AZAMI_DUGUM) return { ileti: 'Belge gövdesi çok karmaşık.', alan: 'govde' };
    const { deger, yol } = oge;
    if (Array.isArray(deger)) {
      deger.forEach((d, i) => yigin.push({ deger: d, yol: `${yol}.${i}` }));
    } else if (kayitMi(deger)) {
      for (const [anahtar, alt] of Object.entries(deger)) {
        if (anahtar !== 'svg') { yigin.push({ deger: alt, yol: `${yol}.${anahtar}` }); continue; }
        if (alt === null || alt === undefined) continue;
        const neden = typeof alt === 'string' ? svgHatasi(alt) : 'svg metin olmalı';
        if (neden !== null) return { ileti: `Çizim (svg) güvenli değil: ${neden}.`, alan: `${yol}.svg`.slice(0, 200) };
      }
    }
  }
  return null;
}

// Okumada çizim denetimi: yazım denetimi gelmeden saklanmış güvensiz svg istemciye gitmez. Hazır sonuç (`derived` girdisi) bütünüyle
// atılır, çünkü tablet girdisi eksik modeli dosyadan yeniden üretir; girdinin svg'sini boşaltmak üretimi atlatır (model-3b.ts processModel
// hazır sonucu `D` doluysa kullanır). Başka yerdeki svg boş metin olur. Değişiklik yoksa aynı gövde döner.
export function guvensizCizimleriAyikla(govde: unknown): unknown {
  const yollar: (string | number)[][] = [];
  const yigin: { deger: unknown; yol: (string | number)[] }[] = [{ deger: govde, yol: [] }];
  let say = 0;
  for (let oge = yigin.pop(); oge !== undefined && ++say <= AZAMI_DUGUM; oge = yigin.pop()) {
    const { deger, yol } = oge;
    if (Array.isArray(deger)) deger.forEach((d, i) => yigin.push({ deger: d, yol: [...yol, i] }));
    else if (kayitMi(deger)) {
      for (const [anahtar, alt] of Object.entries(deger)) {
        if (anahtar !== 'svg') yigin.push({ deger: alt, yol: [...yol, anahtar] });
        else if (alt !== null && alt !== undefined && (typeof alt !== 'string' || svgHatasi(alt) !== null)) yollar.push([...yol, anahtar]);
      }
    }
  }
  if (yollar.length === 0) return govde;
  const kopya: unknown = structuredClone(govde);
  for (const yol of yollar) {
    const hazir = yol.lastIndexOf('derived');
    const hedef = hazir !== -1 && hazir + 1 < yol.length - 1 ? yol.slice(0, hazir + 2) : yol;
    let ust: unknown = kopya;
    for (const adim of hedef.slice(0, -1)) ust = kayitMi(ust) || Array.isArray(ust) ? (ust as Record<string | number, unknown>)[adim] : undefined;
    const son = hedef.at(-1);
    if (son === undefined || !(kayitMi(ust) || Array.isArray(ust))) continue;
    if (hedef === yol) (ust as Record<string | number, unknown>)[son] = '';
    else if (kayitMi(ust)) delete ust[String(son)];
  }
  return kopya;
}

// Kişi alanı taşıyan alanların türü: biçim değiştirerek (dizi yerine nesne, nesne yerine dizi) oturumdan kişi doldurmayı atlamak engellenir.
// null apReq ve approval için meşrudur (Arkon yayında apReq: null yazar).
function kisiAlaniTuruHatasi(depo: ArkonDeposu, govde: unknown, kimlik: string): BicimHatasi | null {
  const hata = (alan: string, ileti: string): BicimHatasi => ({ ileti, alan: `govde.${alan}` });
  const nesneListesi = (d: unknown): boolean => d === undefined || (Array.isArray(d) && d.every(kayitMi));
  const nesneVeyaYok = (d: unknown): boolean => d === undefined || d === null || kayitMi(d);
  if (depo === 'kv') {
    return kimlik === 'handover' && kayitMi(govde) && !kayitMi(govde['v']) ? hata('v', 'Vardiya devri nesne olmalı.') : null;
  }
  if (!kayitMi(govde)) return null;
  switch (depo) {
    case 'pkgs':
      if (!nesneListesi(govde['history'])) return hata('history', 'Yayın geçmişi nesne listesi olmalı.');
      if (!nesneVeyaYok(govde['apReq'])) return hata('apReq', 'Onay isteği nesne olmalı.');
      return nesneVeyaYok(govde['approval']) ? null : hata('approval', 'Onay nesne olmalı.');
    case 'results': {
      if (!nesneListesi(govde['pins'])) return hata('pins', 'Notlar nesne listesi olmalı.');
      const meas = govde['meas'];
      const acks = govde['acks'];
      if (acks !== undefined && !(kayitMi(acks) && Object.values(acks).every(kayitMi))) return hata('acks', 'Okundu kayıtları nesne olmalı.');
      return meas === undefined || (kayitMi(meas) && Object.values(meas).every(kayitMi)) ? null : hata('meas', 'Ölçümler nesne olmalı.');
    }
    case 'requests': {
      const sonuclar = govde['results'];
      return sonuclar === undefined || (kayitMi(sonuclar) && Object.values(sonuclar).every(kayitMi)) ? null : hata('results', 'Numune ölçümleri nesne olmalı.');
    }
    default: return null;
  }
}

export function belgeBicimiHatasi(depo: ArkonDeposu, govde: unknown, kimlik = ''): BicimHatasi | null {
  // Arkon bütün belgeleri nesne olarak yazar (kv ayarı {v: değer} sarmalıdır): nesne olmayan gövde kişi ve biçim denetimlerini atlatır.
  if (!kayitMi(govde)) return { ileti: 'Belge gövdesi nesne olmalı.', alan: 'govde' };
  const svg = svgAlanlari(govde);
  if (svg !== null) return svg;
  const tur = kisiAlaniTuruHatasi(depo, govde, kimlik);
  if (tur !== null) return tur;
  if (!kayitMi(govde)) return null;
  const alanlar = arkonBelgeAlanlari[depo]?.safeParse(govde);
  if (alanlar !== undefined && !alanlar.success) {
    const yol = alanlar.error.issues[0]?.path.map(String) ?? [];
    return { ileti: `Belge alanı geçersiz: ${yol.join('.') || 'govde'}.`, alan: ['govde', ...yol].join('.') };
  }
  if (depo === 'pkgs' && govde['plan'] !== undefined) {
    const plan = govde['plan'];
    if (!Array.isArray(plan)) return { ileti: 'Kontrol planı liste olmalı.', alan: 'govde.plan' };
    const kotu = plan.findIndex((b) => !kayitMi(b) || !Number.isSafeInteger(b['id']));
    if (kotu !== -1) return { ileti: 'Kontrol planı satırının numarası tam sayı olmalı.', alan: `govde.plan.${kotu}.id` };
  }
  const durum = govde['status'];
  if (depo === 'requests' && durum !== undefined && !(typeof durum === 'string' && NUMUNE_DURUMLARI.includes(durum))) {
    return { ileti: 'Numune durumu bilinmiyor.', alan: 'govde.status' };
  }
  if (depo === 'requests' && durum === 'rejected') return numuneReddiEksigi(govde);
  return null;
}

// İlk parça reddi makineyi durdurur ve operatöre gerekçesiyle gösterilir: ölçüsüz ve gerekçesiz ret kabul edilmez (ekran: arkon/web/src/data/numune.ts).
export const NUMUNE_REDDI_OLCUSUZ = 'Numune reddi için en az bir ölçü girilmeli.';
export const NUMUNE_REDDI_GEREKCESIZ = 'Numune reddi için gerekçe yazılmalı.';
// 798: Kalite Merkezi numunesinin ölçüsü oradadır; ölçüsüz reddi Kalite Merkezi'nin kararı reddeder.
function numuneReddiEksigi(govde: Readonly<Record<string, unknown>>): BicimHatasi | null {
  const sonuclar = govde['results'];
  const kmde = typeof govde['kmNumune'] === 'number';
  if (!kmde && (!kayitMi(sonuclar) || Object.keys(sonuclar).length === 0)) return { ileti: NUMUNE_REDDI_OLCUSUZ, alan: 'govde.results' };
  const not = govde['note'];
  return typeof not === 'string' && not.trim() !== '' ? null : { ileti: NUMUNE_REDDI_GEREKCESIZ, alan: 'govde.note' };
}

// Ölçüm satırının madde numarası raporda ham basılır: verilmişse tam sayıdır.
export function kayitBicimiHatasi(satir: Readonly<Record<string, unknown>>): BicimHatasi | null {
  return satir['itemId'] !== undefined && !Number.isSafeInteger(satir['itemId'])
    ? { ileti: 'Ölçüm madde numarası tam sayı olmalı.', alan: 'itemId' }
    : null;
}

// Kayıt türü x rol. Kaynak: Arkon'un varsayılan matrisi (ortak-ayarlar.ts PERMS0) ve kaydı yazan ekran kodu:
// events, counts (operator.ts:191,203,216,217: prod.run) operator, amir; meas (kalite.ts:35 q.meas; operator.ts ölçümü) + kalite;
// calls (operator.ts:298,307,325; giris-ayarlar-spc.ts:63 prod.ack) + kalite, bakım. audit'i yalnız sunucu yazar.
export const KAYIT_YAZARLARI: Readonly<Record<ArkonKayitTuru, readonly ArkonRolu[]>> = {
  events: ['admin', 'operator', 'lead'],
  counts: ['admin', 'operator', 'lead'],
  meas: ['admin', 'operator', 'lead', 'quality'],
  calls: ['admin', 'operator', 'lead', 'quality', 'maint'],
  audit: [],
};
// Ölçüm kaynağı (kalite.ts: quality, cmm; operator.ts: op) için gönderebilecek roller.
const OLCUM_KAYNAKLARI: ReadonlyMap<string, readonly ArkonRolu[]> = new Map<string, readonly ArkonRolu[]>([
  ['quality', ['admin', 'quality']], ['cmm', ['admin', 'quality']], ['op', ['admin', 'operator', 'lead']],
]);

export type KayitRoluReddi = 'rolYetmez' | 'olcumKaynagi' | null;
export function kayitRoluReddi(tur: ArkonKayitTuru, satir: Readonly<Record<string, unknown>>, rol: ArkonRolu): KayitRoluReddi {
  if (!KAYIT_YAZARLARI[tur].includes(rol)) return 'rolYetmez';
  if (tur !== 'meas' || satir['src'] === undefined || satir['src'] === null) return null;
  const kaynak = typeof satir['src'] === 'string' ? OLCUM_KAYNAKLARI.get(satir['src']) : undefined;
  if (kaynak === undefined) return 'olcumKaynagi';
  return kaynak.includes(rol) ? null : 'rolYetmez';
}

// Kalite kararı: (1) paketin `approval` alanını yalnız kalite ve yönetici yazar, değiştirir, siler (Arkon'da yalnız bakim-raporlar.ts:198 yazar;
// hazirlik.ts yayında var olan alanı aynen geri gönderir: değişmedi sayılır); (2) karar verilmiş (bekleme dışı: ölçülüyor, onay, red, sapma)
// numune isteğini yalnız kalite ve yönetici değiştirir: yeni VE eski belge durumuna bakılır, kararı geri alma ve alan silme de değişikliktir.
// Bekleyen isteğe operatörün yazması serbesttir.
export const KALITE_KARARI_ROLLERI: readonly ArkonRolu[] = ['admin', 'quality'];
// Kapanmış kayıt kilidi: kapanmış arızayı (status 'done', closedAt/closedBy dolu) yalnız bakım ve yönetici, tamamlanmış malzeme isteğini
// (status 'done': "Teslim aldım", bakim-raporlar.ts:276) yalnız teslim alan roller (operatör, amir) ve yönetici değiştirir. Arkon'da kapanmış
// arıza ve tamamlanmış istek için düzenleme ya da yeniden açma akışı yoktur (bakim-raporlar.ts:48 kapanmış arızada işlem göstermez); açık kayıtta
// ve kayıt değişmiyorsa kısıt yoktur.
const ARIZA_KAPALI_ROLLERI: readonly ArkonRolu[] = ['admin', 'maint'];
const ISTEK_TAMAM_ROLLERI: readonly ArkonRolu[] = ['admin', 'operator', 'lead'];
const arizaKapaliMi = (g: unknown): boolean => alanOku(g, 'type') === 'ariza'
  && (alanOku(g, 'status') === 'done' || alanOku(g, 'closedAt') !== undefined || alanOku(g, 'closedBy') !== undefined);

export function belgeRoluReddi(depo: ArkonDeposu, govde: unknown, onceki: unknown, rol: ArkonRolu): boolean {
  const degisti = onceki === undefined || kanonik(govde) !== kanonik(onceki);
  if (depo === 'maint') return arizaKapaliMi(onceki) && degisti && !ARIZA_KAPALI_ROLLERI.includes(rol);
  if (depo === 'logi') return alanOku(onceki, 'status') === 'done' && degisti && !ISTEK_TAMAM_ROLLERI.includes(rol);
  if (KALITE_KARARI_ROLLERI.includes(rol)) return false;
  if (depo === 'pkgs') return kanonik(alanOku(govde, 'approval')) !== kanonik(alanOku(onceki, 'approval'));
  if (depo !== 'requests') return false;
  const kararli = (durum: unknown): boolean => durum !== undefined && durum !== 'waiting';
  if (!kararli(alanOku(govde, 'status')) && !kararli(alanOku(onceki, 'status'))) return false;
  return degisti;
}

// Depo başına yetki tablosunun (DEPO_YAZARLARI) açtığı, Arkon matrisinde (ortak-ayarlar.ts PERMS0) karşılığı olmayan değişiklikler; kalıcı çözüm
// işlem başına yetkidir (#223). (1) Periyodik bakım planını (maint `type: 'plan'`) maint.plan sahibi bakım yazar; amir (maint.work) yalnız "yapıldı"
// işaretinde `lastAt` alanını günceller (bakim-raporlar.ts:66). (2) Paketi yayınlamak ve geri çekmek (`status` 'published'e girer ya da çıkar)
// pkg.publish sahibi planlama ve hazırlığındır (hazirlik.ts:141, :166). (3) Operatör sonucundaki sayım ve durumu (`good`, `scrap`, `baseGood`,
// `state`) prod.run sahibi operatör ve amir yazar; hazırlık (not kapatma) ve kalite (ölçüm) belgeyi bu alanlar değişmeden geri yazar.
// (4) Kalitenin geri gönderdiği paket yayınlanamaz; çalışma kuralında onay açıksa (kv/policy `approval`) kalite onayı olmayan paket yayınlanamaz
// (needApproval, hazirlik.ts:21); silip yeniden oluşturulan paketin onayı yoktur. (5) Numune isteğinde (requests `results`) operatör ve amir boş ölçüm
// alanını doldurur; dolu ölçümü değiştirmek ya da silmek kalite ve yöneticinindir (kişi alanı `by` oturumdan damgalandığı için karşılaştırmaya girmez).
// Yönetici Arkon'da her şeye yetkilidir. Belge değişmiyorsa kısıt yoktur.
const PLAN_YAZARLARI: readonly ArkonRolu[] = ['admin', 'maint'];
const YAYIN_ROLLERI: readonly ArkonRolu[] = ['admin', 'plan', 'prep'];
const SAYIM_ROLLERI: readonly ArkonRolu[] = ['admin', 'operator', 'lead'];
const SONUC_SAYIM_ALANLARI = ['good', 'scrap', 'baseGood', 'state'] as const;

const disindaKalanlar = (g: unknown, haric: readonly string[]): unknown =>
  (kayitMi(g) ? Object.fromEntries(Object.entries(g).filter(([k]) => !haric.includes(k))) : g);

function doluOlcumDegisti(yeni: unknown, eski: unknown): boolean {
  if (!kayitMi(eski)) return false;
  const yeniler = kayitMi(yeni) ? yeni : {};
  return Object.entries(eski).some(([kimlik, olcum]) => kanonik(disindaKalanlar(yeniler[kimlik], ['by'])) !== kanonik(disindaKalanlar(olcum, ['by'])));
}

// Kullanıcı kararı 150 a: ölçüm ölçü aletiyle girilir. Yeni ya da değişen ölçüm (kalite numunesi `requests.results`, operatörün kendi
// ölçümü `results.meas` içinde `who: 'op'`) TMI aletinin kimliğini (`gid`, `tmi-alet-<id>`) taşır. Değişmeyen eski ölçüme bakılmaz;
// kalite kararıyla operatöre kopyalanan sonuç kalite isteğinde denetlenmiştir. Ölçüm yoksa null.
export function olcumAletKimligi(gid: unknown): number | null {
  if (typeof gid !== 'string' || !gid.startsWith(ALET_ONEKI)) return null;
  const id = Number(gid.slice(ALET_ONEKI.length));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function olcumAletleri(depo: ArkonDeposu, govde: unknown, onceki: unknown): { eksik: boolean; aletler: number[] } | null {
  const alan = depo === 'requests' ? 'results' : depo === 'results' ? 'meas' : null;
  if (alan === null) return null;
  const yeniler = alanOku(govde, alan);
  if (!kayitMi(yeniler)) return null;
  const eski = alanOku(onceki, alan);
  const eskiler = kayitMi(eski) ? eski : {};
  let eksik = false;
  const aletler = new Set<number>();
  for (const [kimlik, olcum] of Object.entries(yeniler)) {
    if (!kayitMi(olcum) || (depo === 'results' && olcum['who'] !== 'op')) continue;
    if (kanonik(disindaKalanlar(olcum, ['by'])) === kanonik(disindaKalanlar(eskiler[kimlik], ['by']))) continue;
    const id = olcumAletKimligi(olcum['gid']);
    if (id === null) eksik = true;
    else aletler.add(id);
  }
  return eksik || aletler.size > 0 ? { eksik, aletler: [...aletler] } : null;
}

// AR-BI-1 (kart #1194): biten işte (sonuç `state: 'done'`) sayım ve durum yönetici dahil kimse için değişmez. TMI emri bitince
// sayım zaten reddedilir (uretim-emirleri sayimIhlali); terminalin kendi sonucu da aynı yerde kapanmazsa iki sayı ayrışır.
export function bitmisIsReddi(depo: ArkonDeposu, govde: unknown, onceki: unknown): boolean {
  if (depo !== 'results' || alanOku(onceki, 'state') !== 'done') return false;
  return SONUC_SAYIM_ALANLARI.some((a) => kanonik(alanOku(govde, a)) !== kanonik(alanOku(onceki, a)));
}

// Yayın en az bir operasyon adımı ister (#199 T5): taslaktan yayına geçiş ya da yayındaki paketin yeni sürümü (version değişir). Sürümü
// değişmeyen düzenleme (yayındaki eski adımsız paketin başka alanı) reddedilmez. Ekran aynı koşulu yayın düğmesinde denetler (hazirlik.ts).
export const ADIMSIZ_YAYIN = 'Adımı olmayan paket yayınlanamaz: en az bir operasyon adımı gerekir.';
// Kart #1257 (kullanıcı kararı): istasyonu seçilmemiş TMI işi operatöre gönderilemez, onayla da. Arkon'un eski yerel paketi bu kurala girmez.
export const ISTASYONSUZ_YAYIN = 'İstasyonu seçilmemiş iş operatöre gönderilemez: adımın makinesini ya da kişisini Reçete ve Rota\'da seçin.';

export const ROTA_EKSIK_YAYIN = (neden: string) => `${neden}: Terminal ne tüketeceğini bilemez; rotayı Reçete ve Rota'da tamamlayın.`;

export function yayinEksigi(depo: ArkonDeposu, govde: unknown, onceki: unknown): string | null {
  if (depo !== 'pkgs' || alanOku(govde, 'status') !== 'published') return null;
  const yeniYayin = alanOku(onceki, 'status') !== 'published' || kanonik(alanOku(govde, 'version')) !== kanonik(alanOku(onceki, 'version'));
  if (!yeniYayin) return null;
  const makine = alanOku(govde, 'machine');
  const kimlik = alanOku(govde, 'id');
  const tmiPaketi = typeof kimlik === 'string' && (paketIsEmri(kimlik) !== null || paketEmri(kimlik) !== null);
  if (tmiPaketi && (typeof makine !== 'string' || makine.trim() === '')) return ISTASYONSUZ_YAYIN;
  const rotaEksik = tmiPaketi ? alanOku(alanOku(govde, 'tmi'), 'rotaEksik') : null;
  if (typeof rotaEksik === 'string' && rotaEksik !== '') return ROTA_EKSIK_YAYIN(rotaEksik);
  const adimlar = alanOku(govde, 'steps');
  return Array.isArray(adimlar) && adimlar.length > 0 ? null : ADIMSIZ_YAYIN;
}

export function alanYetkisiReddi(
  depo: ArkonDeposu, govde: unknown, onceki: unknown, rol: ArkonRolu, onayZorunlu: boolean,
): 'alanYetkisi' | 'onaysizYayin' | null {
  if (rol === 'admin') return null;
  if (depo === 'maint' && (alanOku(govde, 'type') === 'plan' || alanOku(onceki, 'type') === 'plan')) {
    const degisti = onceki === undefined || kanonik(disindaKalanlar(govde, ['lastAt'])) !== kanonik(disindaKalanlar(onceki, ['lastAt']));
    return degisti && !PLAN_YAZARLARI.includes(rol) ? 'alanYetkisi' : null;
  }
  if (depo === 'results') {
    const degisti = SONUC_SAYIM_ALANLARI.some((a) => kanonik(alanOku(govde, a)) !== kanonik(alanOku(onceki, a)));
    return degisti && !SAYIM_ROLLERI.includes(rol) ? 'alanYetkisi' : null;
  }
  if (depo === 'requests') return doluOlcumDegisti(alanOku(govde, 'results'), alanOku(onceki, 'results')) && !KALITE_KARARI_ROLLERI.includes(rol) ? 'alanYetkisi' : null;
  if (depo !== 'pkgs') return null;
  if (yenidenKarariDegisti(govde, onceki) && !YAYIN_ROLLERI.includes(rol)) return 'alanYetkisi';
  const yayinda = (g: unknown): boolean => alanOku(g, 'status') === 'published';
  if (yayinda(govde) === yayinda(onceki)) return null;
  if (!YAYIN_ROLLERI.includes(rol)) return 'alanYetkisi';
  if (!yayinda(govde)) return null;
  const onay = alanOku(onceki, 'approval');
  const istek = alanOku(onceki, 'apReq');
  const onayZamani = alanOku(onay, 'at');
  const istekZamani = alanOku(istek, 'at');
  const geriGonderildi = alanOku(onay, 'ok') === false
    && (!kayitMi(istek) || (typeof onayZamani === 'number' && typeof istekZamani === 'number' && onayZamani >= istekZamani));
  if (geriGonderildi) return 'onaysizYayin';
  return onayZorunlu && alanOku(onay, 'ok') !== true ? 'onaysizYayin' : null;
}

// Kart Arkon 33 (kullanıcı kararı): onay, onaylanan içeriğe bağlıdır. İçerik plan, adımlar, dosyalar ve uyarılardır; durum, sürüm ve zaman
// alanları girmez (yayın bunları zaten değiştirir). Ekranın onay denetimi (hazirlik.ts apOk) istemcinin `updatedAt` saatine dayanır, sunucuya
// ulaşmaz; onay anında içeriğin özeti onaya yazılır ve yayın anında özet tutmazsa yayın durur.
export const onayIcerigi = (govde: unknown): string => kanonik({
  plan: alanOku(govde, 'plan'), steps: alanOku(govde, 'steps'), files: alanOku(govde, 'files'), warns: alanOku(alanOku(govde, 'rules'), 'warns'),
});

const ozetsiz = (onay: unknown): unknown => disindaKalanlar(onay, ['ozet']);

// Özeti yalnız sunucu yazar: onay yeni verildiyse (ya da değiştiyse) güncel içeriğin özeti, onay aynı kaldıysa kayıtlı özet korunur
// (istemcinin gönderdiği özet sayılmaz). Onaysız ya da reddedilmiş pakette özet yoktur.
export function onayOzetiDamgala(depo: ArkonDeposu, govde: unknown, onceki: unknown, ozet: string): unknown {
  const onay = alanOku(govde, 'approval');
  if (depo !== 'pkgs' || !kayitMi(govde) || !kayitMi(onay)) return govde;
  const { ozet: _istemcinin, ...gerisi } = onay;
  if (gerisi['ok'] !== true) return 'ozet' in onay ? { ...govde, approval: gerisi } : govde;
  const eski = alanOku(onceki, 'approval');
  const ayni = kanonik(ozetsiz(onay)) === kanonik(ozetsiz(eski));
  const eskiOzet = alanOku(eski, 'ozet');
  const yeniOzet = !ayni ? ozet : typeof eskiOzet === 'string' ? eskiOzet : undefined;
  return { ...govde, approval: yeniOzet === undefined ? gerisi : { ...gerisi, ozet: yeniOzet } };
}

// Yayın (taslaktan yayına ya da yeni sürüm) anında onaylı paketin içerik özeti tutmalı. Onay kuralı kapalıyken onay aranmadığı için özet de
// aranmaz; yönetici onay kuralından muaftır (alanYetkisiReddi). Özetsiz eski onay (bu kuraldan önce verilmiş) yayını durdurmaz.
export function onayEskidiMi(depo: ArkonDeposu, govde: unknown, onceki: unknown, rol: ArkonRolu, onayZorunlu: boolean, ozet: string): boolean {
  if (depo !== 'pkgs' || rol === 'admin' || !onayZorunlu || alanOku(govde, 'status') !== 'published') return false;
  const yeniYayin = alanOku(onceki, 'status') !== 'published' || kanonik(alanOku(govde, 'version')) !== kanonik(alanOku(onceki, 'version'));
  const onay = alanOku(govde, 'approval');
  const kayitli = alanOku(alanOku(onceki, 'approval'), 'ozet');
  return yeniYayin && alanOku(onay, 'ok') === true && typeof kayitli === 'string' && kayitli !== ozet;
}

// Çağrıdan açılan arıza (maint `type: 'ariza'`, `callId` dolu; giris-ayarlar-spc.ts:65) belgeyi üstlenen bakımcı yazar; açan, çağrıyı açan kişidir.
// Yeni arızada açanın çözüleceği çağrı kimliği döner; çağrı kaydı yoksa ya da belge yeni değilse null (yazan kişi kalır).
export function arizaCagrisi(depo: ArkonDeposu, govde: unknown, onceki: unknown): string | null {
  if (depo !== 'maint' || onceki !== undefined || alanOku(govde, 'type') !== 'ariza') return null;
  const cagri = alanOku(govde, 'callId');
  return typeof cagri === 'string' && cagri !== '' ? cagri : null;
}

// AR-15: Bakım'da açılan arıza makineyi TMI'de arızalı yapar, "Kapat · makine hazır" çalışır yapar (plan, Saat ve başlatma denetimi makine
// durumunu okur). Makine belgedeki `mc` (TMI makine kodu); boşsa istasyonun (`st`) tek makinesi çözülür. Açılış yeni belgede, kapanış açık
// belgenin kapanmasındadır; başka her yazım (not, sebep düzeltme) durumu değiştirmez.
export interface ArizaGecisi { durum: 'ariza' | 'calisir'; makine: string | null; istasyon: string | null; baslik: string }
const arizaKapali = (g: unknown): boolean => alanOku(g, 'status') === 'done';
const doluMetin = (d: unknown): string | null => (typeof d === 'string' && d.trim() !== '' ? d.trim() : null);
export function arizaMakineGecisi(depo: ArkonDeposu, govde: unknown, onceki: unknown): ArizaGecisi | null {
  if (depo !== 'maint' || alanOku(govde, 'type') !== 'ariza') return null;
  const durum = onceki === undefined ? (arizaKapali(govde) ? null : 'ariza')
    : !arizaKapali(onceki) && arizaKapali(govde) ? 'calisir' : null;
  if (durum === null) return null;
  return { durum, makine: doluMetin(alanOku(govde, 'mc')), istasyon: doluMetin(alanOku(govde, 'st')), baslik: doluMetin(alanOku(govde, 'title')) ?? '' };
}
// Kapanışta makine yalnız bu arıza yüzünden arızalıysa çalışır olur: aynı makinede açık başka arıza varsa ya da makine elle bakıma alınmışsa kalır.
export const acikArizaMi = (g: unknown, makine: string): boolean =>
  alanOku(g, 'type') === 'ariza' && !arizaKapali(g) && alanOku(g, 'mc') === makine;
export const ARIZA_ACIKLAMASI = (baslik: string): string => (baslik === '' ? 'Arkon Bakım arızası' : `Arkon Bakım: ${baslik}`).slice(0, 200);

// Çalışma kuralı (kv/policy, `{ v: Policy }`): kalite onayı zorunlu mu. Kayıt yoksa Arkon varsayılanı (POLICY0) kapalıdır.
export const onayZorunluMu = (politika: unknown): boolean => alanOku(alanOku(politika, 'v'), 'approval') === true;

// Belgelerdeki kişi alanları (arkon/shared/model.ts). Yol sözdizimi: `a.b` iç içe alan; `dizi[k1,k2]` dizi öğesi, öğeler önceki belgedeki aynı
// kimlik alanlı öğeyle eşlenir (`dizi[]`: dizinle); `*` nesne anahtarı; `@` ardından tetikleyici kardeş alanlar. Kişi alanı kendi değeri ya da
// tetikleyici kardeşlerden biri değişince (öğe yeniyse de) oturumdaki kişiyle ezilir; `@*`: nesnenin bütün öteki alanları ve bu durumda alan
// eksikse de doldurulur. `@` yoksa yalnız kendi değeri değişince ezilir (belgeyi ilk açanın alanı sonraki düzenlemelerde korunur). Kırpılan
// geçmişte (Arkon son 60 girdiyi tutar) kalan öğeler kimlikle eşlendiği için yeniden damgalanmaz. Zaman ya da durumla birlikte yazılan alanlar
// kendi zaman/durum alanına bağlıdır (model.ts: handledBy/handledAt, doneBy/doneAt, ackBy/ackAt, closedBy/closedAt, decidedBy/status).
const KISI_YOLLARI: Readonly<Partial<Record<ArkonDeposu, readonly string[]>>> = {
  pkgs: ['by', 'approval.by@*', 'apReq.by@*', 'history[v,at].by@*', 'fpRe.by@*'],
  results: ['pins[id].by@id,text,at', 'meas.*.by@*', 'acks.*.by@*'],
  requests: ['by', 'decidedBy@status,decidedAt', 'results.*.by@*'],
  downs: ['by'],
  maint: ['by', 'openedBy', 'ackBy@ackAt', 'closedBy@closedAt'],
  logi: ['by', 'handledBy@handledAt', 'doneBy@doneAt'],
};
// kv belgeleri {v: değer} biçimindedir; vardiya devri (operator.ts: { note, by, at }) kişi taşır.
const KV_KISI_YOLLARI: ReadonlyMap<string, readonly string[]> = new Map([['handover', ['v.by@*']]]);

// Operatör ekranı kişi alanına makineyi de ekler ("Ad · TZG-04"): ek kalır; 'CMM' kişi değildir.
function kisiDegeri(deger: unknown, ad: string): unknown {
  if (deger === 'CMM') return deger;
  if (typeof deger === 'string') {
    const ek = deger.indexOf(' · ');
    if (ek !== -1) return `${ad}${deger.slice(ek)}`;
  }
  return ad;
}

const DIZI_PARCASI = /^(\w+)\[([\w,]*)\]$/;

function kisiUygula(yeni: unknown, eski: unknown, yol: readonly string[], tetik: string | undefined, ad: string): unknown {
  const [parca, ...kalan] = yol;
  if (parca === undefined || (!kayitMi(yeni) && !Array.isArray(yeni))) return yeni;
  const dizi = DIZI_PARCASI.exec(parca);
  if (dizi !== null) {
    const alan = dizi[1] ?? '';
    const anahtarlar = (dizi[2] ?? '').split(',').filter((k) => k !== '');
    const liste = (yeni as Record<string, unknown>)[alan];
    if (!Array.isArray(liste)) return yeni;
    const eskiListe = kayitMi(eski) && Array.isArray(eski[alan]) ? (eski[alan] as unknown[]) : [];
    const esle = (oge: unknown, i: number): unknown => anahtarlar.length === 0
      ? eskiListe[i]
      : eskiListe.find((e) => anahtarlar.every((k) => kanonik(alanOku(e, k)) === kanonik(alanOku(oge, k))));
    return { ...(yeni as Record<string, unknown>), [alan]: liste.map((oge, i) => kisiUygula(oge, esle(oge, i), kalan, tetik, ad)) };
  }
  const nesne = yeni as Record<string, unknown>;
  const eskiNesne = kayitMi(eski) ? eski : {};
  if (parca === '*') {
    return Object.fromEntries(Object.entries(nesne).map(([k, v]) => [k, kisiUygula(v, eskiNesne[k], kalan, tetik, ad)]));
  }
  if (kalan.length > 0) {
    if (!Object.hasOwn(nesne, parca)) return yeni;
    return { ...nesne, [parca]: kisiUygula(nesne[parca], eskiNesne[parca], kalan, tetik, ad) };
  }
  const kardesDegisti = (): boolean => {
    if (tetik === undefined) return false;
    const adlar = tetik === '*'
      ? [...new Set([...Object.keys(nesne), ...Object.keys(eskiNesne)])].filter((k) => k !== parca)
      : tetik.split(',');
    return adlar.some((k) => kanonik(nesne[k]) !== kanonik(eskiNesne[k]));
  };
  if (!Object.hasOwn(nesne, parca)) {
    // Yalnız iç içe nesnede (`@*`) alan silinerek damgadan kaçılamaz: değişmeyen öğede eski değer, değişen ya da yeni öğede oturumdaki kişi.
    if (tetik !== '*') return yeni;
    if (!kardesDegisti() && Object.hasOwn(eskiNesne, parca)) return { ...nesne, [parca]: eskiNesne[parca] };
    return { ...nesne, [parca]: ad };
  }
  return nesne[parca] !== eskiNesne[parca] || kardesDegisti() ? { ...nesne, [parca]: kisiDegeri(nesne[parca], ad) } : yeni;
}

// Geçmiş girdisindeki onaylayan adı (`ap`) saklı onaydan türer: yeni ya da değişen girdide onay `ok` ise onaylayan, değilse alan yok.
function gecmisOnayi(onceki: unknown, yeni: unknown): unknown {
  if (!kayitMi(yeni) || !Array.isArray(yeni['history'])) return yeni;
  const eskiGecmis = kayitMi(onceki) && Array.isArray(onceki['history']) ? (onceki['history'] as unknown[]) : [];
  const onay = yeni['approval'];
  const onaylayan = kayitMi(onay) && onay['ok'] === true && typeof onay['by'] === 'string' ? onay['by'] : undefined;
  const gecmis = (yeni['history'] as unknown[]).map((g) => {
    if (!kayitMi(g)) return g;
    const eski = eskiGecmis.find((e) => kanonik(alanOku(e, 'v')) === kanonik(g['v']) && kanonik(alanOku(e, 'at')) === kanonik(g['at']));
    if (eski !== undefined && kanonik(eski) === kanonik(g)) return g;
    const { ap: _eski, ...gerisi } = g;
    return onaylayan === undefined ? gerisi : { ...gerisi, ap: onaylayan };
  });
  return { ...yeni, history: gecmis };
}

export function kisiAlanlariniDoldur(depo: ArkonDeposu, kimlik: string, onceki: unknown, yeni: unknown, ad: string): unknown {
  let sonuc = yeni;
  const yollar = depo === 'kv' ? (KV_KISI_YOLLARI.get(kimlik) ?? []) : (KISI_YOLLARI[depo] ?? []);
  for (const spec of yollar) {
    const [yol, tetik] = spec.split('@');
    sonuc = kisiUygula(sonuc, onceki, (yol ?? '').split('.'), tetik, ad);
  }
  return depo === 'pkgs' ? gecmisOnayi(onceki, sonuc) : sonuc;
}

// Sunucunun ürettiği değişiklik günlüğü (Arkon ekranının alanları: cid, at, userId, userName, area, action, target, detail).
// Ekran `audit()` çağrılarını belge yazılırken kendisi yapıyordu; sunucu bunları belge değişiminden türetir. Alan adları Arkon'un
// AUDIT_AREAS listesindendir; `target` belge kimliği değil ekranın yazdığı konudur (paket ve alet numarası, duruş başlığı, istasyon).
// Sonuç, numune isteği ve malzeme isteği her sayımda yazıldığı için günlüğe girmez.
export interface GunlukSatiri { area: string; action: string; target: string; detail: string | null }

const gunlukMetin = (d: unknown): string => (typeof d === 'string' || typeof d === 'number' ? String(d) : '');
export const alanOku = (govde: unknown, ad: string): unknown => (kayitMi(govde) ? govde[ad] : undefined);
const iceri = (govde: unknown, ad: string, alt: string): unknown => alanOku(alanOku(govde, ad), alt);
const bos = (s: string): string | null => (s === '' ? null : s);
// jsonb anahtar sırasını değiştirir: karşılaştırma anahtar sırasından bağımsız olmalı.
const kanonik = (d: unknown): string => JSON.stringify(d, (_k, v: unknown) => (kayitMi(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));

// Günlükte okunan saat tesisin duvar saatidir (ekranda girilen saat), UTC değil.
const TARIH = (ms: unknown): string => (typeof ms === 'number' && Number.isFinite(ms) ? tesisSaati(ms) : '');

function paketGunlugu(onceki: unknown, sonraki: unknown, belgeVar: boolean, kimlik: string): GunlukSatiri[] {
  const hedef = gunlukMetin(alanOku(sonraki, 'no')) || gunlukMetin(alanOku(onceki, 'no')) || kimlik;
  const rev = `Rev ${gunlukMetin(alanOku(sonraki, 'rev'))}`;
  const satir = (action: string, detail: string | null = null): GunlukSatiri => ({ area: 'paket', action, target: hedef, detail });
  if (!belgeVar) return [satir('oluşturuldu', bos(gunlukMetin(alanOku(sonraki, 'part'))))];
  const sonuc: GunlukSatiri[] = [];
  const eskiDurum = gunlukMetin(alanOku(onceki, 'status'));
  const yeniDurum = gunlukMetin(alanOku(sonraki, 'status'));
  // hazirlik.ts:148 onaya gönderildi
  if (kanonik(alanOku(sonraki, 'apReq')) !== kanonik(alanOku(onceki, 'apReq')) && alanOku(sonraki, 'apReq')) {
    sonuc.push(satir('onaya gönderildi', `${rev} · v${gunlukMetin(alanOku(sonraki, 'version'))}`));
  }
  // bakim-raporlar.ts:200 kalitece onaylandı / geri gönderildi
  const eskiOnay = alanOku(onceki, 'approval');
  const yeniOnay = alanOku(sonraki, 'approval');
  if (yeniOnay && kanonik(yeniOnay) !== kanonik(eskiOnay)) {
    const ok = iceri(sonraki, 'approval', 'ok') === true;
    const not = gunlukMetin(iceri(sonraki, 'approval', 'note'));
    sonuc.push(satir(ok ? 'kalitece onaylandı' : 'geri gönderildi', `${rev}${not === '' ? '' : ` · ${not}`}`));
  }
  // hazirlik.ts:164 yayınlandı (ilk yayın ve yeniden yayın: sürüm artışı), :166 geri çekildi
  const surumDegisti = gunlukMetin(alanOku(sonraki, 'version')) !== gunlukMetin(alanOku(onceki, 'version'));
  if (yeniDurum === 'published' && (eskiDurum !== 'published' || surumDegisti)) {
    const onay = iceri(sonraki, 'approval', 'ok') === true ? ` · onay: ${gunlukMetin(iceri(sonraki, 'approval', 'by'))}` : '';
    sonuc.push(satir('yayınlandı', `${rev} · v${gunlukMetin(alanOku(sonraki, 'version'))} · ${gunlukMetin(alanOku(sonraki, 'machine'))}${onay}`));
  } else if (eskiDurum === 'published' && yeniDurum === 'draft') {
    sonuc.push(satir('geri çekildi'));
  } else if (eskiDurum !== yeniDurum && yeniDurum !== '') {
    sonuc.push(satir(`durum: ${eskiDurum || '—'} → ${yeniDurum}`));
  }
  // pano-planlama.ts:201 istasyon değişti / sıra değişti
  const eskiMakine = gunlukMetin(alanOku(onceki, 'machine'));
  const yeniMakine = gunlukMetin(alanOku(sonraki, 'machine'));
  if (eskiMakine !== yeniMakine && yeniMakine !== '') {
    sonuc.push({ area: 'plan', action: 'istasyon değişti', target: hedef, detail: `${eskiMakine || '—'} → ${yeniMakine}` });
  } else if (gunlukMetin(alanOku(sonraki, 'seq')) !== gunlukMetin(alanOku(onceki, 'seq')) && alanOku(sonraki, 'seq') !== undefined) {
    sonuc.push({ area: 'plan', action: 'sıra değişti', target: hedef, detail: `${yeniMakine} · ${gunlukMetin(alanOku(sonraki, 'seq'))}` });
  }
  return sonuc;
}

function bakimGunlugu(onceki: unknown, sonraki: unknown, belgeVar: boolean, silme: boolean): GunlukSatiri[] {
  const govde = silme ? onceki : sonraki;
  const tur = gunlukMetin(alanOku(govde, 'type'));
  const baslik = gunlukMetin(alanOku(govde, 'title'));
  const mc = gunlukMetin(alanOku(govde, 'mc'));
  const satir = (action: string, target: string, detail: string | null): GunlukSatiri => ({ area: 'bakım', action, target, detail });
  if (tur === 'plan') {
    // bakim-raporlar.ts:65 periyodik plan eklendi / değişti, :78 silindi
    if (silme) return [satir('periyodik plan silindi', mc, bos(baslik))];
    return [satir(belgeVar ? 'periyodik plan değişti' : 'periyodik plan eklendi', mc, `${baslik} · ${gunlukMetin(alanOku(govde, 'everyDays'))} günde bir`)];
  }
  // bakim-raporlar.ts:66 periyodik bakım yapıldı
  if (tur === 'pm') return silme || belgeVar ? [] : [satir('periyodik bakım yapıldı', mc, bos(baslik))];
  // bakim-raporlar.ts:30 arıza işlemleri (mesaj ekranda durumdan seçilir)
  const hedef = `${gunlukMetin(alanOku(govde, 'st'))}${mc === '' ? '' : ` · ${mc}`}`;
  if (silme) return [satir('arıza silindi', hedef, bos(baslik))];
  const eski = gunlukMetin(alanOku(onceki, 'status'));
  const yeni = gunlukMetin(alanOku(sonraki, 'status'));
  if (!belgeVar) return [satir('arıza açıldı', hedef, bos(baslik))];
  return eski === yeni ? [] : [satir(yeni === 'done' ? 'arıza kapatıldı' : yeni === 'work' ? 'arıza üstlenildi' : `arıza durumu: ${eski} → ${yeni}`, hedef, bos(baslik))];
}

function dususGunlugu(onceki: unknown, sonraki: unknown, belgeVar: boolean, silme: boolean): GunlukSatiri[] {
  const govde = silme ? onceki : sonraki;
  const baslik = gunlukMetin(alanOku(govde, 'title'));
  const satir = (action: string, detail: string | null): GunlukSatiri => ({ area: 'planlı duruş', action, target: baslik, detail });
  // pano-planlama.ts:291 silindi
  if (silme) return [satir('silindi', null)];
  const aralik = `${TARIH(alanOku(govde, 'from'))}–${TARIH(alanOku(govde, 'to')).slice(11)}`;
  // bakim-raporlar.ts:67 bakım için eklendi; pano-planlama.ts:288 eklendi / değiştirildi
  if (!belgeVar && baslik.startsWith('Bakım · ')) return [satir('bakım için eklendi', aralik)];
  return [satir(belgeVar ? 'değiştirildi' : 'eklendi', aralik)];
}

const AYAR_GUNLUGU: ReadonlyMap<string, { area: string; action: string }> = new Map([
  ['policy', { area: 'kural', action: 'çalışma kuralları değişti' }], // ayarlar-uretim.ts:51
  ['mode', { area: 'sistem', action: 'çalışma kipi değişti' }],
]);

// önceki: yazımdan önceki gövde (belge yoksa undefined); sonraki: yazılan gövde (silmede undefined). Bir yazım birden çok satır üretebilir.
export function gunlukSatirlari(depo: ArkonDeposu, kimlik: string, onceki: unknown, sonraki: unknown, belgeVar: boolean, silme: boolean): GunlukSatiri[] {
  switch (depo) {
    case 'pkgs':
      if (silme) return [{ area: 'paket', action: 'silindi', target: gunlukMetin(alanOku(onceki, 'no')) || kimlik, detail: bos(gunlukMetin(alanOku(onceki, 'part'))) }]; // hazirlik.ts:119
      return paketGunlugu(onceki, sonraki, belgeVar, kimlik);
    case 'draws': return [{ area: 'paket', action: silme ? 'çizim silindi' : 'çizim kaydedildi', target: gunlukMetin(alanOku(silme ? onceki : sonraki, 'name')) || kimlik, detail: null }];
    case 'maint': return bakimGunlugu(onceki, sonraki, belgeVar, silme);
    case 'downs': return dususGunlugu(onceki, sonraki, belgeVar, silme);
    case 'kv': {
      const ayar = AYAR_GUNLUGU.get(kimlik);
      return ayar === undefined ? [] : [{ ...ayar, target: '', detail: silme ? 'silindi' : null }];
    }
    default: return [];
  }
}

// Arkon sunucusunun yalnız bu kayıt türlerinde paket ve madde süzgeci vardır.
export const paketSuzgeciVar = (tur: ArkonKayitTuru): boolean => tur === 'meas';

// `$` ile başlayan ileti türlerini (belge ve kayıt değişikliği, cihazı yeniden yükleme) Arkon cihazları sunucudan gelmiş sayar
// ve sorgusuz uygular; Arkon arayüzü bu türleri göndermez.
export const sunucuIletisiMi = (ileti: Readonly<Record<string, unknown>>): boolean => {
  const tur = ileti['type'];
  return typeof tur === 'string' && tur.startsWith('$');
};

// İzinli ileti türleri ve gönderebilecek roller. Kaynak: arkon/web/src içindeki bütün `Bus.send` çağrıları; rol, çağrıyı yapan
// ekranın yetki denetimidir (ortak-ayarlar.ts PERMS0). Depo adıyla gönderilenler (downs, gauges, logi, maint) pano-planlama.ts
// putDoc/delDoc'tur: yazarları depo yazma tablosuyla aynıdır. `$` ile başlayanlar sunucuya aittir ve ayrıca reddedilir.
const TUM_ROLLERI: readonly ArkonRolu[] = ['admin', 'plan', 'prep', 'quality', 'maint', 'lead', 'operator'];
const ILETI_GONDERENLERI: ReadonlyMap<string, readonly ArkonRolu[]> = new Map<string, readonly ArkonRolu[]>([
  ['cfg', ['admin', 'plan', 'lead']], // ayarlar (ayarlar-uretim.ts, giris-ayarlar-spc.ts:198,279,290,339,343), planlı duruş (pano-planlama.ts:288,291)
  ['pkg-approved', ['admin', 'quality']], // bakim-raporlar.ts:199
  ['call', TUM_ROLLERI], // operator.ts:298,324; bakim-raporlar.ts:272
  ['call-ack', ['admin', 'quality', 'lead', 'maint']], // giris-ayarlar-spc.ts:62 (prod.ack)
  ['call-done', TUM_ROLLERI], // operator.ts:307
  ['maint', ['admin', 'lead', 'maint']], // giris-ayarlar-spc.ts:65, bakim-raporlar.ts putDoc('maint')
  ['pkg-draft', ['admin', 'prep', 'plan']], // cizim-studyosu.ts:93, pano-planlama.ts:264
  ['pkg-removed', ['admin', 'prep', 'plan']], // hazirlik.ts:119,166, giris-ayarlar-spc.ts:341, pano-planlama.ts:199
  ['pkg-approval', ['admin', 'prep', 'plan']], // hazirlik.ts:148
  ['pkg', ['admin', 'prep', 'plan']], // hazirlik.ts:161, pano-planlama.ts:199
  ['pkg-order', ['admin', 'plan']], // pano-planlama.ts:200
  ['pin-resolved', ['admin', 'prep', 'plan']], // hazirlik.ts:167
  ['sample-result', ['admin', 'quality']], // kalite.ts:137
  ['result', ['admin', 'quality', 'operator', 'lead']], // kalite.ts:144; operator.ts:144 (iş geçişi ve ölçüm sonucu; kullanıcı kararı 101 a)
  ['progress', DEPO_YAZARLARI.results], // operator.ts:94
  ['sample', DEPO_YAZARLARI.requests], // operator.ts:267
  ['downs', DEPO_YAZARLARI.downs], // pano-planlama.ts:27,28 (type: depo adı)
  ['logi', DEPO_YAZARLARI.logi],
]);
export const AZAMI_ILETI_BAYTI = 8 * 1024;

export type IletiReddi = 'iletiTuruYok' | 'iletiRolu' | 'iletiBuyuk' | null;
export function iletiReddi(ileti: Readonly<Record<string, unknown>>, rol: ArkonRolu): IletiReddi {
  const tur = ileti['type'];
  const izinli = typeof tur === 'string' ? ILETI_GONDERENLERI.get(tur) : undefined;
  if (izinli === undefined) return 'iletiTuruYok';
  if (!izinli.includes(rol)) return 'iletiRolu';
  return Buffer.byteLength(JSON.stringify(ileti), 'utf8') > AZAMI_ILETI_BAYTI ? 'iletiBuyuk' : null;
}

// Kişi başına ileti hızı (kayan pencere): pencere içindeki sayı sınırı aşarsa 429.
export const ILETI_HIZI = { adet: 120, pencereMs: 60_000 } as const;
export function hizSiniriAsildi(onceki: readonly number[], simdi: number, sinir: { adet: number; pencereMs: number } = ILETI_HIZI): boolean {
  return onceki.filter((t) => simdi - t < sinir.pencereMs).length >= sinir.adet;
}

const iletiGonderebilir = (tur: string, rol: ArkonRolu): boolean => ILETI_GONDERENLERI.get(tur)?.includes(rol) === true;

// Arkon'un izin anahtarları ve varsayılan matrisi (arkon/web/src/app/ortak-ayarlar.ts:38 PERMS ve :48 PERMS0).
const ARKON_IZINLERI = [
  'page.op', 'page.board', 'page.plan', 'page.prep', 'page.quality', 'page.maint', 'page.report', 'page.draw',
  'prod.run', 'prod.fix', 'prod.station', 'prod.ack', 'logi.req', 'logi.handle', 'plan.edit', 'down.edit',
  'pkg.edit', 'pkg.publish', 'pkg.del', 'pkg.approve', 'q.meas', 'q.decide', 'q.report', 'gauge.edit',
  'maint.work', 'maint.plan', 'adm.users', 'adm.plant', 'adm.shifts', 'adm.backup', 'adm.demo', 'adm.reasons', 'adm.audit',
] as const;
type MatrisRolu = Exclude<ArkonRolu, 'admin'>;
const ARKON_VARSAYILAN_YETKILER: Readonly<Record<MatrisRolu, readonly string[]>> = {
  plan: ['page.op', 'page.board', 'page.plan', 'page.prep', 'page.quality', 'page.report', 'page.draw', 'pkg.edit', 'pkg.publish', 'prod.station', 'q.report', 'adm.shifts', 'plan.edit', 'down.edit', 'logi.handle'],
  prep: ['page.op', 'page.board', 'page.plan', 'page.prep', 'page.quality', 'page.report', 'page.draw', 'pkg.edit', 'pkg.publish', 'pkg.del', 'prod.station', 'q.report'],
  quality: ['page.op', 'page.board', 'page.quality', 'page.report', 'q.meas', 'q.decide', 'q.report', 'prod.ack', 'pkg.approve', 'gauge.edit'],
  lead: ['page.op', 'page.board', 'page.plan', 'page.quality', 'page.maint', 'page.report', 'prod.run', 'prod.fix', 'prod.station', 'prod.ack', 'q.report', 'adm.shifts', 'down.edit', 'logi.req', 'maint.work'],
  maint: ['page.op', 'page.board', 'page.maint', 'page.report', 'prod.ack', 'prod.station', 'maint.work', 'maint.plan'],
  operator: ['page.op', 'prod.run', 'logi.req'],
};

// İzin anahtarı -> sunucu kuralı. Yetkiler tek yerdedir (TMI rol x işlem; sunucu tabloları); Arkon'un Ayarlar > Yetkiler ekranı kaynak
// değildir. Matris sunucunun reddedeceği hiçbir yazmayı izinli göstermez: eşlenen anahtar, Arkon varsayılanı ile sunucu kuralının KESİŞİMİdir.
// Eşlenmeyen anahtar (yalnız ekran görünürlüğü ya da sunucuda karşılığı olmayan: page.*, prod.fix, prod.station, q.report, adm.users,
// adm.plant, adm.backup, adm.demo, adm.reasons, adm.shifts, gauge.edit) Arkon varsayılanını (PERMS0) aynen kullanır. adm.shifts ve
// gauge.edit yalnız salt okunur vardiya ve alet listesini açar; vardiya ve alet TMI'da yazılır.
const IZIN_ESLEMESI: Readonly<Record<string, (rol: ArkonRolu) => boolean>> = {
  'prod.run': (r) => KAYIT_YAZARLARI.counts.includes(r) && KAYIT_YAZARLARI.events.includes(r),
  'prod.ack': (r) => iletiGonderebilir('call-ack', r) && KAYIT_YAZARLARI.calls.includes(r),
  'logi.req': (r) => DEPO_YAZARLARI.logi.includes(r),
  'logi.handle': (r) => DEPO_YAZARLARI.logi.includes(r),
  'plan.edit': (r) => DEPO_YAZARLARI.pkgs.includes(r) && iletiGonderebilir('pkg-order', r),
  'down.edit': (r) => DEPO_YAZARLARI.downs.includes(r),
  'pkg.edit': (r) => DEPO_YAZARLARI.pkgs.includes(r),
  'pkg.publish': (r) => DEPO_YAZARLARI.pkgs.includes(r) && iletiGonderebilir('pkg', r),
  'pkg.del': (r) => DEPO_SILICILERI.pkgs.includes(r),
  'pkg.approve': (r) => DEPO_YAZARLARI.pkgs.includes(r) && iletiGonderebilir('pkg-approved', r),
  'q.meas': (r) => KAYIT_YAZARLARI.meas.includes(r) && KALITE_KARARI_ROLLERI.includes(r),
  'q.decide': (r) => KALITE_KARARI_ROLLERI.includes(r) && DEPO_YAZARLARI.requests.includes(r),
  'maint.work': (r) => DEPO_YAZARLARI.maint.includes(r),
  'maint.plan': (r) => DEPO_YAZARLARI.maint.includes(r),
  'adm.audit': (r) => r === 'admin',
};
export const ESLENMEYEN_IZINLER: readonly string[] = ARKON_IZINLERI.filter((k) => !Object.hasOwn(IZIN_ESLEMESI, k));

// Arkon'a `kv/perms` olarak verilen matris (PermMatrix biçimi). `_known` bütün anahtarları listeler: Arkon eksik anahtarı varsayılandan eklemez.
export function yetkiMatrisi(): Record<string, string[]> & { _known: string[] } {
  const matris: Record<string, string[]> = {};
  for (const rol of Object.keys(ARKON_VARSAYILAN_YETKILER) as MatrisRolu[]) {
    matris[rol] = (ARKON_VARSAYILAN_YETKILER[rol]).filter((k) => IZIN_ESLEMESI[k]?.(rol) ?? true);
  }
  return { ...matris, _known: [...ARKON_IZINLERI] };
}

// Belge sürümü milisaniyedir ve her yazımda en az bir artar (aynı milisaniyede iki yazım da ayrılır).
export const yeniSurum = (eski: number | null, simdi: number): number => Math.max(simdi, (eski ?? 0) + 1);

// Veri kapsamı: Arkon belgeleri ve kayıtları iş merkezini kodla taşır. `machine` istasyon kodudur, `mc` makine kodudur; paket
// (`pkgId`) ve iş emri numarası (`orderNo`) paketin istasyonuna bağlanır. İş merkezi kısıtı olan kişide kayıt ya da belge EN AZ BİR
// iş merkezi çözmeli ve çözülen hepsi kapsamda olmalıdır; tanımsız ya da biçimsiz kod reddedilir. Kısıtsız kişide bu denetim yoktur.
// Kodlar TMI'deki kodla tam eşleşir (büyük-küçük harf, boşluk normalleştirilmez: eşleşmeyen tanımsızdır).
export interface Konum {
  merkez: readonly string[];
  istasyon: readonly string[];
  makine: readonly string[];
  paket: readonly string[];
  paketNo: readonly string[];
  // Kod alanı dolu ama metin değil (dizi, nesne, sayı): kısıtlı kişide ret.
  gecersiz: boolean;
  // Planlı duruş tüm tesisi kapsıyor: kısıtlı kişi yazamaz ve silemez.
  tesisGeneli: boolean;
}
export const KONUMSUZ: Konum = { merkez: [], istasyon: [], makine: [], paket: [], paketNo: [], gecersiz: false, tesisGeneli: false };

const kayitMi = (d: unknown): d is Record<string, unknown> => d !== null && typeof d === 'object' && !Array.isArray(d);

interface Alan { kodlar: string[]; gecersiz: boolean }
// Boş değer (yok, null, '') konum vermez ve geçersiz de değildir; boş olmayan metin koddur; başka her şey geçersizdir.
const alan = (d: unknown): Alan => {
  if (d === undefined || d === null || d === '') return { kodlar: [], gecersiz: false };
  return typeof d === 'string' ? { kodlar: [d], gecersiz: false } : { kodlar: [], gecersiz: true };
};

function konumKur(g: { merkez?: unknown[]; istasyon?: unknown[]; makine?: unknown[]; paket?: unknown[]; paketNo?: unknown[] }, tesisGeneli = false): Konum {
  const coz = (liste: unknown[] | undefined) => (liste ?? []).map(alan);
  const m = coz(g.merkez), i = coz(g.istasyon), k = coz(g.makine), p = coz(g.paket), n = coz(g.paketNo);
  const hepsi = [...m, ...i, ...k, ...p, ...n];
  return {
    merkez: m.flatMap((a) => a.kodlar), istasyon: i.flatMap((a) => a.kodlar), makine: k.flatMap((a) => a.kodlar),
    paket: p.flatMap((a) => a.kodlar), paketNo: n.flatMap((a) => a.kodlar),
    gecersiz: hepsi.some((a) => a.gecersiz), tesisGeneli,
  };
}

// Rotalı emrin adım paketleri aynı emir numarasını taşır ve farklı iş merkezlerinde olabilir: iş emri paketi kimliği konumu kendisi verir,
// numarayla bütün adımların iş merkezi istenmez.
const paketNoKonumu = (paketId: unknown, no: unknown): unknown[] => (paketIsEmri(paketId) === null ? [no] : []);

export const kayitKonumu = (satir: Readonly<Record<string, unknown>>): Konum => konumKur({
  merkez: [satir['wc']], istasyon: [satir['machine']], makine: [satir['mc']], paket: [satir['pkgId']], paketNo: paketNoKonumu(satir['pkgId'], satir['orderNo']),
});

// İletinin konumu: çağrı, numune ve paket iletileri istasyon (`machine`, `st`), iş merkezi (`wc`), makine (`mc`), paket kimliği (`id`,
// yalnız paket iletilerinde; öteki türlerde `id` başka deponun belgesidir) ve iş emri numarası (`orderNo`) taşır.
const PAKET_KIMLIKLI_ILETILER: ReadonlySet<string> = new Set([
  'pkg', 'pkg-removed', 'pkg-approval', 'pkg-approved', 'pkg-draft', 'pin-resolved', 'progress', 'result', 'sample-result',
]);
export function iletiKonumu(ileti: Readonly<Record<string, unknown>>): Konum {
  const tur = ileti['type'];
  return konumKur({
    merkez: [ileti['wc']], istasyon: [ileti['machine'], ileti['st']], makine: [ileti['mc']],
    paket: typeof tur === 'string' && PAKET_KIMLIKLI_ILETILER.has(tur) ? [ileti['id']] : [],
    paketNo: typeof tur === 'string' && PAKET_KIMLIKLI_ILETILER.has(tur) ? paketNoKonumu(ileti['id'], ileti['orderNo']) : [ileti['orderNo']],
  });
}

// Kod taşımayan konum (ayar, günlük, belge değişti iletileri): kapsam süzmesi uygulanmaz.
export const konumBosMu = (k: Konum): boolean =>
  !k.gecersiz && !k.tesisGeneli && k.merkez.length === 0 && k.istasyon.length === 0 && k.makine.length === 0;

// Konumu olan depolar. Çizim, ölçü aleti ve ayar belgelerinin iş merkezi yoktur: kapsam uygulanmaz.
export const KONUMLU_DEPOLAR: ReadonlySet<ArkonDeposu> = new Set<ArkonDeposu>(['pkgs', 'requests', 'logi', 'maint', 'downs', 'results']);
// 298: ekip çağrısı açılınca (calls, phase 'open') TMI bildirim merkezine gider; alıcıyı bildirim modülü ekip eşlemesinden seçer. Yer makine kodu,
// yoksa istasyon kodu. Kabul, yükseltme ve kapatma yeni bildirim açmaz; tanınmayan ekip, yersiz ya da kimliksiz çağrı bildirilmez.
export interface CagriBildirimi { ekip: CagriEkibi; yer: string; not: string | null; cagriKimligi: string }
export function cagriBildirimi(govde: Readonly<Record<string, unknown>>): CagriBildirimi | null {
  const { phase, team, callId, mc, machine, note } = govde;
  if (phase !== 'open' || typeof callId !== 'string' || callId === '') return null;
  const ekip = CAGRI_EKIPLERI.find((e) => e === team);
  if (ekip === undefined) return null;
  const metin = (x: unknown): string | null => (typeof x === 'string' && x !== '' ? x : null);
  const yer = metin(mc) ?? metin(machine);
  return yer === null ? null : { ekip, yer, not: metin(note), cagriKimligi: callId };
}

export const KONUMLU_KAYITLAR: ReadonlySet<ArkonKayitTuru> = new Set<ArkonKayitTuru>(['events', 'counts', 'meas', 'calls']);

// Sonuç belgesinin (results) iş merkezi kendi gövdesinde değil, aynı kimlikli paketin istasyonundadır.
export function belgeKonumu(depo: ArkonDeposu, kimlik: string, govde: unknown): Konum {
  if (depo === 'results') return konumKur({ paket: [kimlik] });
  if (!kayitMi(govde)) return { ...KONUMSUZ, gecersiz: KONUMLU_DEPOLAR.has(depo) };
  switch (depo) {
    case 'pkgs': return konumKur({ istasyon: [govde['machine']], makine: [govde['mc']] });
    case 'requests': return konumKur({ istasyon: [govde['machine']], paket: [govde['pkgId']], paketNo: paketNoKonumu(govde['pkgId'], govde['no']) });
    case 'maint': return konumKur({ merkez: [govde['wc']], istasyon: [govde['st']], makine: [govde['mc']] });
    case 'logi': return konumKur({ merkez: [govde['wc']], istasyon: [govde['st']], paket: [govde['pkgId']] });
    case 'downs':
      if (govde['scope'] === 'all') return konumKur({}, true);
      if (govde['scope'] === 'wc') return konumKur({ merkez: [govde['target']] });
      if (govde['scope'] === 'st') return konumKur({ istasyon: [govde['target']] });
      return { ...KONUMSUZ, gecersiz: true };
    default: return KONUMSUZ;
  }
}

// Paket kaydından konuma: paketin istasyonu ve makinesi.
export const paketKonumu = (machine: unknown, mc: unknown): Konum => konumKur({ istasyon: [machine], makine: [mc] });

export interface TesisHaritasi {
  merkezler: ReadonlyMap<string, number>;
  istasyonlar: ReadonlyMap<string, number>;
  makineler: ReadonlyMap<string, number>;
}

// Kodlardan iş merkezi kimliğine: istasyon ve makine kendi iş merkezine bağlanır. TMI'de olmayan kod haritada yoktur.
export function tesisHaritasiKur(
  merkezler: readonly Pick<IsMerkezi, 'id' | 'kod'>[],
  istasyonlar: readonly Pick<Istasyon, 'id' | 'kod' | 'isMerkeziId'>[],
  makineler: readonly Pick<Makine, 'kod' | 'istasyonId'>[],
): TesisHaritasi {
  const istasyonMerkezi = new Map(istasyonlar.map((i) => [i.id, i.isMerkeziId]));
  return {
    merkezler: new Map(merkezler.map((m) => [m.kod, m.id])),
    istasyonlar: new Map(istasyonlar.map((i) => [i.kod, i.isMerkeziId])),
    makineler: new Map(makineler.flatMap((m) => {
      const merkez = m.istasyonId === null ? undefined : istasyonMerkezi.get(m.istasyonId);
      return merkez === undefined ? [] : [[m.kod, merkez] as const];
    })),
  };
}

export interface KonumCozumu {
  merkezler: number[];
  // Haritada olmayan kod var (kısıtlı kişide ret nedeni).
  tanimsiz: boolean;
}

// Doğrudan kodlar (iş merkezi, istasyon, makine). Paket ve iş emri başvuruları servis katmanında paketin konumuna çevrilip buraya verilir.
export function konumCoz(konum: Konum, tesis: TesisHaritasi): KonumCozumu {
  const bulunan = [
    ...konum.merkez.map((k) => tesis.merkezler.get(k)),
    ...konum.istasyon.map((k) => tesis.istasyonlar.get(k)),
    ...konum.makine.map((k) => tesis.makineler.get(k)),
  ];
  return { merkezler: [...new Set(bulunan.filter((id): id is number => id !== undefined))], tanimsiz: bulunan.includes(undefined) };
}

// Kısıtlı kişide kabul: geçerli biçim, tesis geneli değil, tanımsız kod yok, en az bir iş merkezi ve hepsi kapsamda.
export function kapsamdaMiKisitli(konum: Konum, cozum: KonumCozumu, kapsamdaMi: (merkezId: number) => boolean): boolean {
  return !konum.gecersiz && !konum.tesisGeneli && !cozum.tanimsiz && cozum.merkezler.length > 0 && cozum.merkezler.every(kapsamdaMi);
}

// Liste süzgeci için: kapsam dışı iş merkezlerine ait kodlar ve kapsam içi kodlar.
export function kodlarAyir(tesis: TesisHaritasi, kapsamdaMi: (merkezId: number) => boolean): { yasak: Konum; izinli: Konum } {
  const sec = (harita: ReadonlyMap<string, number>, icinde: boolean) =>
    [...harita].filter(([, id]) => kapsamdaMi(id) === icinde).map(([kod]) => kod);
  const kur = (icinde: boolean): Konum => ({
    ...KONUMSUZ, merkez: sec(tesis.merkezler, icinde), istasyon: sec(tesis.istasyonlar, icinde), makine: sec(tesis.makineler, icinde),
  });
  return { yasak: kur(false), izinli: kur(true) };
}

// Arkon üretim kaydının (olay ve sayım) TMI üretim emri komutuna eşlenmesi (kart #211). Emir bağı paket kimliğidir: `tmi-ue-<emir id>`
// (emir numarası elle değişebildiği için kimlik öneki esastır); bağ yoksa yansıtılmaz. Arkon `reason` alanı TMI neden kodudur
// (kv/reasons ve kv/scraps TMI'den okunur). Karşılığı olmayanlar yansıtılmaz ve "eslenemedi" nedeniyle saklanır: kurulum ayarı (setup),
// none, nedensiz duruş ve nedensiz hurda, hurda azaltma (TMI'de hurda azalmaz), sıfır sayım. Kuyruğa dönüş (queued) ve duraklatma (paused) TMI'de
// duraklatmadır: Arkon başka emre geçerken çalışan eskisini duraklatır (paused); duraklamış emir istasyonu kilitlemez (#241). Çalışmayan emirde TMI değişmez ve kayıt "eslenemedi" olur.
export type YansimaKomutu =
  | { komut: 'basla-ya-da-devam'; makineKodlari: readonly string[] }
  | { komut: 'duraklat' }
  // Hazırlık (Arkon `setup`) TMI'de "ayar" olayıdır: başlamamış işte yazılır, Başlat kapatır ve hazırlık süresi ondan ölçülür.
  | { komut: 'ayar' }
  | { komut: 'kuyruga-al' }
  | { komut: 'durdur'; nedenKodu: string }
  | { komut: 'bitir' }
  // kararBekliyor: adetin ilk parça kararı beklenirken sayılan kısmı (131 b); TMI'de sağlama değil karar bekleyene yazılır.
  // refakatPartisiId: terminalde açık refakat kartı (kart #156); yoksa null ve kartı stok sayımdan bulur.
  | { komut: 'saglam'; adet: number; kararBekliyor: number; refakatPartisiId: number | null }
  // Eksi hurda düzeltmedir (kart #1194): nedeni verilmezse TMI son hurdanın nedenini yazar.
  | { komut: 'hurda'; adet: number; nedenKodu: string | null; refakatPartisiId: number | null };

export interface YansimaKarari {
  // `tmi-ue` paketinde emir; `tmi-ie` paketinde null, emir iş emrinden çözülür (servis.ts `kararinEmri`).
  emirId: number | null;
  isEmriId: number | null;
  // Karşılığı yoksa neden dolu, komut null.
  komut: YansimaKomutu | null;
  neden: string | null;
}

export const YANSIYAN_KAYITLAR: ReadonlySet<ArkonKayitTuru> = new Set<ArkonKayitTuru>(['events', 'counts']);
const EMIR_PAKET_KIMLIGI = /^tmi-ue-(\d{1,9})$/;
const IS_EMRI_PAKET_KIMLIGI = /^tmi-ie-(\d{1,9})(?:-p(\d{1,4}))?$/;
const kodMetni = (d: unknown): string | null => (typeof d === 'string' && d !== '' ? d : null);

// Terminalin başlatırken seçtiği makineler (`mcs`, TMI makine kodları). Yoksa ya da boşsa seçim yoktur: TMI iş emrinin atanmış makinesini kullanır.
// Seçim `mc` alanından türetilmez: `mc` ekranın varsayılan makinesidir ve seçilmemişlik ile seçilmişlik ayırt edilemezdi.
export const MAKINE_SECIMI_GECERSIZ = 'Makine seçimi geçersiz: makine kodlarının tekrarsız listesi olmalı.';
export function makineSecimi(mcs: unknown): readonly string[] | null {
  if (mcs === undefined || mcs === null) return [];
  if (!Array.isArray(mcs) || mcs.length > AZAMI_MAKINE_SECIMI) return null;
  if (!mcs.every((k): k is string => typeof k === 'string' && k !== '')) return null;
  return new Set(mcs).size === mcs.length ? mcs : null;
}

function olayKomutu(satir: Readonly<Record<string, unknown>>): { komut: YansimaKomutu } | { neden: string } {
  const durum = satir['state'];
  switch (durum) {
    case 'running': {
      const secim = makineSecimi(satir['mcs']);
      return secim === null ? { neden: MAKINE_SECIMI_GECERSIZ } : { komut: { komut: 'basla-ya-da-devam', makineKodlari: secim } };
    }
    case 'paused': return { komut: { komut: 'duraklat' } };
    case 'setup': return { komut: { komut: 'ayar' } };
    case 'queued': return { komut: { komut: 'kuyruga-al' } };
    case 'done': return { komut: { komut: 'bitir' } };
    case 'stopped': {
      const kod = kodMetni(satir['reason']);
      return kod === null ? { neden: 'Duruş nedeni yok: TMI nedensiz duruş kabul etmez.' } : { komut: { komut: 'durdur', nedenKodu: kod } };
    }
    default: return { neden: `Durum "${typeof durum === 'string' ? durum : '?'}" için TMI karşılığı yok.` };
  }
}

// Kartın emre ait olduğunu stok sayımda denetler; burada yalnız biçim: pozitif tam sayı değilse kartsız sayılır.
export const REFAKAT_KARTI_ALANI = 'refakatPartisiId';
// Kaydın uyarıları (katılım, sayımın yönlendiren uyarısı #157, girdi uyarısı) boşlukla tek iletiye eklenir; aynı ileti iki kez yazılmaz.
export function uyariBirlestir(var_: string | null | undefined, yeni: string | null | undefined): string | null {
  if (yeni == null || yeni === '') return var_ ?? null;
  if (var_ == null || var_ === '') return yeni;
  return var_.includes(yeni) ? var_ : `${var_} ${yeni}`;
}
function sayimKarti(satir: Readonly<Record<string, unknown>>): number | null {
  const k = satir[REFAKAT_KARTI_ALANI];
  return typeof k === 'number' && Number.isInteger(k) && k > 0 && k <= 2147483647 ? k : null;
}

function sayimKomutu(satir: Readonly<Record<string, unknown>>): { komut: YansimaKomutu } | { neden: string } {
  const delta = satir['delta'];
  const refakatPartisiId = sayimKarti(satir);
  if (typeof delta !== 'number' || !Number.isSafeInteger(delta)) return { neden: 'Sayım farkı tam sayı değil.' };
  if (delta === 0) return { neden: SIFIR_SAYIM };
  if (satir['kind'] === 'good') {
    const bekleyen = satir[KARAR_BEKLIYOR_ALANI];
    const kararBekliyor = typeof bekleyen === 'number' && Number.isSafeInteger(bekleyen) && delta > 0 ? Math.min(Math.max(bekleyen, 0), delta) : 0;
    return { komut: { komut: 'saglam', adet: delta, kararBekliyor, refakatPartisiId } };
  }
  if (satir['kind'] !== 'scrap') return { neden: 'Sayım türü tanınmıyor.' };
  const kod = kodMetni(satir['reason']);
  if (delta < 0) return { komut: { komut: 'hurda', adet: delta, nedenKodu: kod, refakatPartisiId } };
  return kod === null ? { neden: 'Hurda nedeni yok: TMI nedensiz hurda kabul etmez.' } : { komut: { komut: 'hurda', adet: delta, nedenKodu: kod, refakatPartisiId } };
}

// Elle bölünmüş iş (kart #1572): parça kendi adedinden fazla sağlam sayamaz (düzeltme ve hurda serbest). Parça plandan kalktıysa sayım alınmaz.
export const PARCA_PLANDA_YOK = 'Bu parça artık planda yok: plan bölmeyi değiştirdi. Sayımı işin güncel paketinden girin.';
export const parcaAdediAsildi = (no: number, adet: number, kalan: number): string =>
  `Parça ${no} adedi ${adet}: bu parçada en çok ${Math.max(kalan, 0)} sağlam daha sayılabilir.`;
export function parcaSayimReddi(satir: Readonly<Record<string, unknown>>, parca: { no: number; adet: number } | null, sayilan: number): string | null {
  const delta = satir['delta'];
  if (satir['kind'] !== 'good' || typeof delta !== 'number' || delta <= 0) return null;
  if (parca === null) return PARCA_PLANDA_YOK;
  return sayilan + delta > parca.adet ? parcaAdediAsildi(parca.no, parca.adet, parca.adet - sayilan) : null;
}

// Parçalar aynı iş emrinin parçalarıdır ve TMI'de iş emrinin tek durumu vardır: parça olayı öteki parçaları bozmasın. Öteki parça çalışırken
// başlatma TMI'yi değiştirmez (iş zaten çalışıyor), duraklatma ve duruş iş emrini durdurmaz. Biten parça, öteki parçalar bitmeden iş emrini
// bitirmez: çalışan parça yoksa iş emri duraklar, varsa değişmez. Bütün parçalar bitince son parçanın bitişi iş emrini bitirir.
export const PARCA_OTEKI_CALISIYOR = 'Bölünmüş işin öteki parçası çalışıyor: iş emrinin TMI durumu değişmez.';
export const PARCA_OTEKILER_BITMEDI = 'Bölünmüş işin öteki parçaları bitmedi: iş emri hepsi bitince biter.';
export function parcaOlayKarari(karar: YansimaKarari, toplamParca: number, kardesler: readonly (string | null)[]): YansimaKarari {
  if (karar.komut === null || karar.komut.komut === 'saglam' || karar.komut.komut === 'hurda') return karar;
  const calisan = kardesler.some((d) => d === 'running');
  const hepsiBitti = kardesler.length === toplamParca - 1 && kardesler.every((d) => d === 'done');
  if (karar.komut.komut === 'bitir') {
    if (hepsiBitti) return karar;
    return calisan ? { ...karar, komut: null, neden: PARCA_OTEKILER_BITMEDI } : { ...karar, komut: { komut: 'duraklat' }, neden: null };
  }
  return calisan ? { ...karar, komut: null, neden: PARCA_OTEKI_CALISIYOR } : karar;
}

// Paketin bağlı olduğu TMI emri. Kanonik biçim: tmi-ue-00<id> ve benzeri yazımlar aynı emre bağlanmaz.
export function paketEmri(paket: unknown): number | null {
  if (typeof paket !== 'string') return null;
  const eslesme = EMIR_PAKET_KIMLIGI.exec(paket);
  const aday = eslesme?.[1] === undefined ? null : Number(eslesme[1]);
  return aday !== null && emirPaketKimligi(aday) === paket ? aday : null;
}

// Parça paketi de iş emrinindir (kayıt ve sayım iş emrine yazılır); parça numarası `paketParcasi` ile okunur.
export function paketIsEmri(paket: unknown): number | null {
  return paketParcasi(paket)?.isEmriId ?? null;
}

export function paketParcasi(paket: unknown): { isEmriId: number; no: number | null } | null {
  if (typeof paket !== 'string') return null;
  const eslesme = IS_EMRI_PAKET_KIMLIGI.exec(paket);
  if (eslesme?.[1] === undefined) return null;
  const isEmriId = Number(eslesme[1]);
  const no = eslesme[2] === undefined ? null : Number(eslesme[2]);
  const kanonik = no === null ? isEmriPaketKimligi(isEmriId) : parcaPaketKimligi(isEmriId, no);
  return kanonik === paket && (no === null || no > 0) ? { isEmriId, no } : null;
}

// İptal denetimi için paketin emri: `tmi-ue` kimlikten, `tmi-ie` sunucunun yazdığı `tmi.emirId` alanından.
export function paketinEmri(kimlik: string, govde: unknown): number | null {
  const emirId = paketEmri(kimlik);
  if (emirId !== null || paketIsEmri(kimlik) === null) return emirId;
  const tmiEmri = alanOku(alanOku(govde, 'tmi'), 'emirId');
  return typeof tmiEmri === 'number' && Number.isSafeInteger(tmiEmri) ? tmiEmri : null;
}

// TMI komutu emrin sıradaki iş emrine işler: başka adımın paketinden gelen kayıt (önceden hazırlanmış sonraki adım ya da bitmiş adım) eşlenmez.
// Baş kısmı istemcinin eşleştirdiği metindir (TmiYansimalari.tsx); paralel adımla (639) yalnız bitmiş adımın kaydı eşlenmez.
export const PAKET_ADIM_SIRASI = 'Paket başka adımın: bu adım bittikten sonra kaydı TMI\'ye işlenmez.';
// Paralel adım (639): iş emri paketinin komut kuralları adımın durumuyla okunur. Adım bekliyorsa iş planlı, çalışıyorsa başlamış, bittiyse
// bitmiştir; açık olmayan emir (bitmiş, iptal) kendi durumunu taşır. Sıra dışı başlatma reddedilmez, TMI uyarı döner (626 a).
export function adimEmirDurumu(emirDurumu: string, adimDurumu: string | null): string {
  if (adimDurumu === null || (emirDurumu !== 'planli' && emirDurumu !== 'basladi')) return emirDurumu;
  return adimDurumu === 'bekliyor' ? 'planli' : adimDurumu === 'calisiyor' ? 'basladi' : 'bitti';
}
export const ROTALI_EMIR_PAKETI = 'Rotalı emrin kaydı iş emri paketinden gelir; emir paketi kayıtlı değil.';

// Rotalı emir adım adım istasyon değiştirir, tmi-ue paketi ise kaydedildiği makinede kalır. TMI komutu emrin sıradaki iş emrine işlediğinden
// eski istasyondaki paketin kaydı başka adımı başlatırdı: emrin şimdiki istasyonu dışındaki paketin kaydı eşlenmez.
export function paketIstasyonuReddi(paketMakinesi: unknown, emirIstasyonu: string): string | null {
  return paketMakinesi === emirIstasyonu ? null : `Paket başka istasyonun; emir şu an ${emirIstasyonu} istasyonunda.`;
}

export const paketMakinesi = (govde: unknown): unknown =>
  (typeof govde === 'object' && govde !== null ? (govde as Record<string, unknown>)['machine'] : undefined);

export function yansimaKarari(tur: ArkonKayitTuru, satir: Readonly<Record<string, unknown>>): YansimaKarari {
  const emirId = paketEmri(satir['pkgId']);
  const isEmriId = paketIsEmri(satir['pkgId']);
  const sonuc = tur === 'events' ? olayKomutu(satir) : sayimKomutu(satir);
  if ('neden' in sonuc) return { emirId, isEmriId, komut: null, neden: sonuc.neden };
  if (emirId === null && isEmriId === null) {
    return { emirId, isEmriId, komut: null, neden: 'Emir bağı yok: paket kimliği tmi-ue-<emir> ya da tmi-ie-<iş emri> biçiminde değil.' };
  }
  return { emirId, isEmriId, komut: sonuc.komut, neden: null };
}

// Aynı işte birden çok kişi çalışabilir (kart #1144, #1148). Terminal olayı kişinin kendi çalışmasını değiştirir: kişi yalnız kendi çalışmasını
// duraklatır ve bitirir, başkasının çalışmasını durduramaz. Başlatma, insanlı istasyonda başkası çalışırken katılımdır (uyarı döner, ret değil);
// makineli istasyonda çalışan işin yeniden başlatılması TMI'de reddedilir (aynı iş aynı makinede iki kez çalışmaz).
// `benim`: kişinin bu işteki son katılımı; `digerleriAcik`: şu an çalışan öteki kişilerin adları. Katılım satırı hiç yoksa (katılımdan önce
// başlamış iş) kural emre bırakılır: eski davranış.
// `emirCalisiyor`: iş TMI'de çalışıyor (duraklamış ya da durmuş değil); verilmezse bilinmiyor sayılır.
export type KatilimDurumu = { benim: 'acik' | 'duraklamis' | 'yok'; digerleriAcik: readonly string[]; emirCalisiyor?: boolean };
export type KatilimYolu =
  | { yol: 'emir' }
  | { yol: 'katil' }
  | { yol: 'katilim-duraklat' }
  | { yol: 'katilim-ayril' }
  | { yol: 'degisiklik-yok' }
  | { yol: 'ret'; neden: string };

// Kişinin kendi çalışması TMI'de zaten açıkken gelen başlatma (iş başka ekrandan, ör. Fabrika Haritası'ndan başlatılmış): yapılacak değişiklik yoktur, ret değildir.
export const ZATEN_CALISIYOR = 'İş zaten çalışıyor; sizin çalışmanız açık, başlatma TMI\'de değişiklik yapmadı.';

export const KENDI_CALISMANIZ_YOK = (adlar: readonly string[]): string =>
  `Bu işte siz çalışmıyorsunuz; ${adlar.join(', ')} çalışıyor. Yalnız kendi çalışmanız duraklatılır ya da bitirilir.`;
export const BASKASI_CALISIYOR_DURDURMA = (adlar: readonly string[]): string =>
  `Bu işte ${adlar.join(', ')} de çalışıyor; işi durdurmak başkasının çalışmasını keserdi. Kendi çalışmanızı duraklatın.`;

export function katilimYolu(
  komut: 'basla-ya-da-devam' | 'duraklat' | 'kuyruga-al' | 'durdur' | 'bitir',
  emirDurumu: string, kaynak: 'makine' | 'insan', k: KatilimDurumu,
): KatilimYolu {
  if (komut === 'basla-ya-da-devam') {
    // Kişi kendi çalışmasını duraklatmış, iş ötekilerle sürüyor: devam kişinin çalışmasına dönüştür (makineli istasyonda da). Emre gitse
    // TMI "iş zaten çalışıyor" diye reddederdi; ekran duraklamış, TMI çalışıyor kalırdı.
    if (emirDurumu === 'basladi' && k.emirCalisiyor === true && k.benim === 'duraklamis') return { yol: 'katil' };
    if (emirDurumu === 'basladi' && k.emirCalisiyor === true && k.benim === 'acik') return { yol: 'degisiklik-yok' };
    return emirDurumu === 'basladi' && kaynak === 'insan' && (k.digerleriAcik.length > 0 || k.benim === 'acik') ? { yol: 'katil' } : { yol: 'emir' };
  }
  if (k.digerleriAcik.length === 0) return { yol: 'emir' };
  if (komut === 'durdur') return { yol: 'ret', neden: BASKASI_CALISIYOR_DURDURMA(k.digerleriAcik) };
  if (komut === 'bitir') return k.benim === 'yok' ? { yol: 'ret', neden: KENDI_CALISMANIZ_YOK(k.digerleriAcik) } : { yol: 'katilim-ayril' };
  return k.benim === 'acik' ? { yol: 'katilim-duraklat' } : { yol: 'ret', neden: KENDI_CALISMANIZ_YOK(k.digerleriAcik) };
}

// İşin TMI'deki hâli Arkon durumuyla: reddedilen durum kaydından sonra ekran kendi gösterdiğini buna eşitler (tek kaynak TMI).
// Kişi kendi çalışmasını duraklatmışsa iş ötekilerle sürse de kişinin ekranında duraklamıştır. Karşılığı olmayan (iptal) null.
export type ArkonDurumu = 'running' | 'paused' | 'stopped' | 'queued' | 'done';
export function tmidekiDurum(emirDurumu: string, calisma: string | null, benim: KatilimDurumu['benim']): ArkonDurumu | null {
  if (emirDurumu === 'planli') return 'queued';
  if (emirDurumu === 'bitti') return 'done';
  if (emirDurumu !== 'basladi') return null;
  if (calisma === 'calisiyor') return benim === 'duraklamis' ? 'paused' : 'running';
  if (calisma === 'durakli') return 'paused';
  return calisma === 'durdu' ? 'stopped' : null;
}

// Ekran olay ve sayımı ayrı isteklerle yollar: sayım, emri başlatan olaydan önce varabilir. Planlı emre gelen sayım reddedilmez, bu nedenle
// bekletilir (yanlış sayı olmasın diye); emrin başlama kaydı geldiğinde öne alınır, sayım ardından yazılır.
export const SAYIM_ERTELEME = 'Emir başlamadı: başlama kaydı bekleniyor.';
export const GECICI_BEKLEME = 'Geçici hata; yeniden denenecek.';
export const KUYRUK_DEGISIKLIK_YOK = 'Emir çalışmıyordu; kuyruğa alma TMI\'de değişiklik yapmadı.';
export const BITMIS_BITIR = 'Emir zaten bitmiş; bitirme TMI\'de değişiklik yapmadı.';
export const HAZIRLIK_DEGISIKLIK_YOK = 'Emir başlamış ya da hazırlığı yazılmış; hazırlık TMI\'de değişiklik yapmadı.';
export const SIFIR_SAYIM = 'Sayım farkı sıfır.';

// "TMI'ye yazılamayanlar" listesinde varsayılan olarak gizlenen satır türleri (#199 3. tur, TA2): beklenen ya da kendiliğinden çözülecek durumlar.
// Satır silinmez; tür başına sayılır ve istenince gösterilir. Tür, sonuç ve kayıtlı nedenin başından çıkarılır (şema yok): "iş zaten çalışıyor"
// TMI'nin metnidir; TMI metni değişirse satır görünür olur, yani hata görünür tarafa düşer. Önek null ise o sonuçtaki her satır o türdendir.
export interface GizliYansimaTuru { kod: string; ad: string; kurallar: readonly { sonuc: string; onek: string | null }[] }
export const GIZLI_YANSIMA_TURLERI: readonly GizliYansimaTuru[] = [
  { kod: 'kurulum-bosta', ad: 'Kurulum ve boşta durumu', kurallar: [
    { sonuc: 'eslenemedi', onek: 'Durum "setup" için TMI karşılığı yok' }, { sonuc: 'eslenemedi', onek: 'Durum "none" için TMI karşılığı yok' },
    { sonuc: 'eslenemedi', onek: HAZIRLIK_DEGISIKLIK_YOK },
  ] },
  { kod: 'zaten-calisiyor', ad: 'İş zaten çalışıyor', kurallar: [{ sonuc: 'reddedildi', onek: 'İş zaten çalışıyor' }, { sonuc: 'eslenemedi', onek: 'İş zaten çalışıyor' }] },
  { kod: 'kuyruk-degisiklik-yok', ad: 'Kuyruğa alma değişiklik yapmadı', kurallar: [{ sonuc: 'eslenemedi', onek: KUYRUK_DEGISIKLIK_YOK }] },
  { kod: 'zaten-bitmis', ad: 'Emir zaten bitmiş', kurallar: [{ sonuc: 'eslenemedi', onek: BITMIS_BITIR }] },
  { kod: 'sifir-sayim', ad: 'Sıfır sayım', kurallar: [{ sonuc: 'eslenemedi', onek: SIFIR_SAYIM }] },
  { kod: 'bekliyor', ad: 'Kendiliğinden çözülecek (bekliyor)', kurallar: [{ sonuc: 'bekliyor', onek: null }] },
];

export function gizliYansimaTuru(sonuc: string, neden: string | null): string | null {
  const tur = GIZLI_YANSIMA_TURLERI.find((t) => t.kurallar.some((k) => k.sonuc === sonuc && (k.onek === null || (neden ?? '').startsWith(k.onek))));
  return tur?.kod ?? null;
}

// Denetim #24: kayıt isteğinin cevabı yalnız o istekte sonuçlanan kayıtları taşır. Bekleyip sonra (başka istekte ya da arka planda) TMI'ye
// yazılamayan sayım tablet akışına ret iletisiyle döner; ekran cevaptaki retle aynı yoldan adedi geri çevirir. "hatali" cevapta hiç dönmez.
export const SAYIM_YAZILAMADI = 'TMI\'ye yazılırken hata oluştu; yönetici "TMI\'ye yazılamayanlar" ekranından yeniden deneyebilir.';
export function gecikmeliSayimReddi(tur: string, sonuc: string, neden: string | null, buIstekte: boolean): string | null {
  if (tur !== 'counts') return null;
  if (sonuc === 'hatali') return SAYIM_YAZILAMADI;
  if (buIstekte || neden === null) return null;
  if (sonuc === 'reddedildi') return neden;
  return sonuc === 'eslenemedi' && gizliYansimaTuru(sonuc, neden) === null ? neden : null;
}

export interface GecikmeliRetKaydi { cid: string; makine: string | null; is_merkezi: string | null; emir_no: string | null; govde: Record<string, unknown> }
// Konum alanları (machine, wc, orderNo) iletiyi kapsam dışındaki kişiden süzer (`iletiKonumu`).
export const tmiRetIletisi = (k: GecikmeliRetKaydi, ileti: string): Record<string, unknown> => ({
  type: '$tmiRet', kind: 'counts', cid: k.cid, machine: k.makine, wc: k.is_merkezi, orderNo: k.emir_no, row: k.govde, ileti,
});

// Listede bekleyen satırın nedeni: iç hata özeti (SQLSTATE, tablo adı) kullanıcıya gösterilmez.
export function yansimaNedeni(sonuc: string, neden: string | null, sonHata: string | null): string | null {
  if (sonuc !== 'bekliyor') return neden;
  if (sonHata === null) return null;
  return sonHata === SAYIM_ERTELEME ? SAYIM_ERTELEME : GECICI_BEKLEME;
}

// Yeniden kuyruğa alma (#243): yalnız "hatali" satır alınır. Durum kaydı (events) aynı emrin kendinden sonraki bir durum kaydı TMI'ye yazılmışsa alınmaz:
// eski "duraklat" sonradan yazılan "başlat"ın üstüne yazılıp emri yanlış duruma sokardı. Sayım toplamaya eklenir, sıra koruması gerekmez.
export const YENIDEN_YALNIZ_HATALI = 'Yalnız TMI\'ye yazılırken hata veren kayıt yeniden denenir.';
export const YENIDEN_SONRAKI_YAZILDI = 'Bu emirde sonraki durum kayıtları yazıldı; eski durum kaydı yeniden denenmez.';

export function yenidenDenemeReddi(sonuc: string, tur: string, sonrakiDurumYazildi: boolean): string | null {
  if (sonuc !== 'hatali') return YENIDEN_YALNIZ_HATALI;
  if (tur === 'events' && sonrakiDurumYazildi) return YENIDEN_SONRAKI_YAZILDI;
  return null;
}

export interface SiradakiYansima {
  ertelendi: boolean;
  komut: YansimaKomutu['komut'] | null;
}

// Bekleyenlerin işlenme sırası (dizin listesi). Öndekiler yalnız ertelenmiş sayımlarsa ardlarındaki ilk başlama kaydı öne alınır; başka her durumda kayıt sırası.
export function yansimaSirasi(satirlar: readonly SiradakiYansima[]): number[] {
  const sira = satirlar.map((_, i) => i);
  if (satirlar[0]?.ertelendi !== true) return sira;
  const baslama = satirlar.findIndex((y) => y.komut === 'basla-ya-da-devam');
  if (baslama <= 0) return sira;
  const oncekilerSayim = satirlar.slice(0, baslama).every((y) => y.komut === 'saglam' || y.komut === 'hurda');
  return oncekilerSayim ? [baslama, ...sira.filter((i) => i !== baslama)] : sira;
}

// Emir kilidi için en çok bekleme: dolarsa istek düşmez, Arkon kaydı yazılır ve yansıma bekliyor kalır.
export const KILIT_BEKLEME_MS = 2000;

// Kullanıcı kararı 118 a: ileti yoklamasında rol ve kapsam denetimi 10 sn önbellekte tutulur; aynı kişinin oturum işlemleri değişirse geçmez.
export const YOKLAMA_DENETIM_SURESI_MS = 10_000;
export interface YoklamaDenetimi<T> { an: number; imza: string; deger: T }
export const islemImzasi = (islemler: readonly string[]): string => [...islemler].sort().join(',');
export const yoklamaDenetimiGecerli = (d: { an: number; imza: string }, simdi: number, imza: string): boolean =>
  d.imza === imza && simdi >= d.an && simdi - d.an < YOKLAMA_DENETIM_SURESI_MS;
// Bir isteğin bütün emir kilitleri için toplam bekleme: dolunca kalan emirler beklemeden bir kez yoklanır, satırları bekliyor kalır.
export const ISTEK_KILIT_BUTCESI_MS = 4000;

// B-006 ilk parça kapısı: tabletin ilk parça kilidinin (arkon/web/src/app/operator-parcalar.ts `firstGate`, numune planı `sampOf`, kural
// varsayılanı kurallar.ts `RULES0`: firstPiece açık) sunucu karşılığı. İlk parça Başlat'tan sonra üretilir ve normal parça gibi sayılır
// (kullanıcı kararları 129, 130 a): kapı Başlat'ı değil, kalite kararına kadar ilk parçadan sonraki sağlam sayımı durdurur. Yalnız talaşlı (cnc) pakette; tanınmayan iş türü talaşlı sayılır (istasyonlar.ts `opOf`).
// Ölçeni kalite olan ölçü yalnız kalitenin karar verdiği numune isteğinden kapanır: sonuç belgesindeki ölçümü operatör de yazabildiği için kanıt sayılmaz.
// Ölçeni operatör olan ölçü (tezgahta ölçüm kuralı) tablette olduğu gibi sonuç belgesindeki uygun ya da sapmalı ölçümle kapanır.
const IS_TURLERI: ReadonlySet<string> = new Set(['cnc', 'kalite', 'depo', 'mark', 'boya', 'montaj']);
export interface IlkParcaOlcusu { id: string; olcen: 'q' | 'op' }

export function ilkParcaOlculeri(paket: unknown): IlkParcaOlcusu[] {
  if (!kayitMi(paket)) return [];
  const tur = paket['opType'];
  if (typeof tur === 'string' && IS_TURLERI.has(tur) && tur !== 'cnc') return [];
  const plan = Array.isArray(paket['plan']) ? paket['plan'].filter(kayitMi) : [];
  const q = alanOku(paket['rules'], 'q');
  const numune = Array.isArray(paket['samp']) && paket['samp'].length > 0 ? paket['samp'].filter(kayitMi) : null;
  const kurallar = numune !== null
    ? numune.filter((r) => r['when'] === 'first' && Boolean(r['gate']))
      .map((r) => ({ olcen: Array.isArray(r['who']) && r['who'].length > 0 ? r['who'][0] : 'q', olculer: r['items'] === 'crit' ? plan.filter((b) => Boolean(b['crit'])) : Array.isArray(r['items']) ? plan.filter((b) => (r['items'] as unknown[]).includes(b['id'])) : plan }))
    : (alanOku(q, 'firstPiece') ?? true) ? [{ olcen: alanOku(q, 'who') === 'operator' ? 'op' : 'q', olculer: plan.filter((b) => (b['freq'] || 'İlk parça') === 'İlk parça') }] : [];
  const olculer = new Map<string, 'q' | 'op'>();
  for (const k of kurallar) {
    for (const b of k.olculer) {
      const id = String(b['id']);
      if (olculer.get(id) !== 'q') olculer.set(id, k.olcen === 'op' ? 'op' : 'q');
    }
  }
  return [...olculer].map(([id, olcen]) => ({ id, olcen }));
}

const KARAR_DURUMLARI: ReadonlySet<unknown> = new Set(['approved', 'deviation', 'rejected']);
const ACIK_ISTEK_DURUMLARI: ReadonlySet<unknown> = new Set(['waiting', 'measuring']);
const KM_KARARLARI = { approved: 'onay', rejected: 'ret', deviation: 'sapma' } as const;
const ARKON_DURUMLARI = { onay: 'approved', ret: 'rejected', sapma: 'deviation' } as const;
const KM_NEDEN_UZUNLUGU = 80;

// 798: numune isteği Kalite Merkezi'nin numunesidir (tek kayıt). İstenen ölçünün plan maddesi Kalite Merkezi balonuna bağlıysa (795 a,
// `kmBalon`) numune o balonlarla açılır; bağsız madde Arkon'da kalır (796 a: istek yine yazılır, `uyari` döner). Planında hiç bağ olmayan
// (Kalite Merkezi'nden alınmamış) pakette numune açılmaz ve uyarı yoktur. İstek ilk parça kapısındaki kalite ölçüsünü taşıyorsa ilk parça
// numunesidir: kararı yalnız Kalite Merkezi'ndedir (789-2a), terminal Kabul/Red göstermez.
export interface KmNumuneGirdisi { opNo: number; balonlar: number[]; neden: string; parcaSayisi: number | null }
export interface IstekKmPlani { ilkParca: boolean; km: KmNumuneGirdisi | null; uyari: string | null }

export function istekKmPlani(istek: unknown, paket: unknown): IstekKmPlani {
  const olculer = alanOku(istek, 'items');
  const istenen = new Set(Array.isArray(olculer) ? olculer.map(String) : []);
  const kapi = ilkParcaOlculeri(paket).filter((o) => o.olcen === 'q').map((o) => o.id);
  const ilkParca = kapi.some((id) => istenen.has(id));
  const plan = kayitMi(paket) && Array.isArray(paket['plan']) ? paket['plan'].filter(kayitMi) : [];
  const bagli = plan.filter((b) => pozitifTamSayi(b['kmBalon']));
  if (bagli.length === 0) return { ilkParca, km: null, uyari: null };
  const balonlar = [...new Set(bagli.filter((b) => istenen.has(String(b['id']))).map((b) => b['kmBalon'] as number))];
  const opNo = alanOku(alanOku(paket, 'tmi'), 'opNo');
  const bagsiz = plan.filter((b) => istenen.has(String(b['id'])) && !pozitifTamSayi(b['kmBalon'])).length;
  if (!pozitifTamSayi(opNo) || balonlar.length === 0) return { ilkParca, km: null, uyari: KM_UYARILARI.numuneAcilmadi };
  const neden = typeof alanOku(istek, 'reason') === 'string' && (alanOku(istek, 'reason') as string).trim() !== '' ? (alanOku(istek, 'reason') as string).trim() : 'Numune';
  const sayim = alanOku(istek, 'cnt');
  return {
    ilkParca,
    km: { opNo, balonlar, neden: neden.slice(0, KM_NEDEN_UZUNLUGU), parcaSayisi: typeof sayim === 'number' && Number.isSafeInteger(sayim) && sayim >= 0 ? sayim : null },
    uyari: bagsiz > 0 ? KM_UYARILARI.bagsizOlcu(bagsiz) : null,
  };
}

const pozitifTamSayi = (d: unknown): d is number => typeof d === 'number' && Number.isSafeInteger(d) && d > 0;

export const KM_UYARILARI = {
  numuneAcilmadi: 'Numune Kalite Merkezi\'ne açılamadı: ölçüler Arkon\'da kaldı.',
  bagsizOlcu: (n: number) => `${String(n)} ölçünün Kalite Merkezi balonu yok: Arkon'da kaldı.`,
  olcumYazilmadi: (neden: string) => `Ölçüm Kalite Merkezi'ne yazılamadı (${neden}): Arkon'da kaldı.`,
} as const;

// İsteğin kararı: durum karara girince ya da kararın kendisi değişince (ret sonra onay) doğar; aynı kararın yeniden yazılması karar değildir.
// Kalite Merkezi numunesi olan istekte ikinci karar Kalite Merkezi'nin "karar var" reddiyle döner (ilk gelen geçerli).
export function istekKarari(istek: unknown, onceki: unknown): 'onay' | 'ret' | 'sapma' | null {
  const durum = alanOku(istek, 'status');
  if (!KARAR_DURUMLARI.has(durum) || durum === alanOku(onceki, 'status')) return null;
  return KM_KARARLARI[durum as keyof typeof KM_KARARLARI];
}

export const acikIstekMi = (istek: unknown): boolean => ACIK_ISTEK_DURUMLARI.has(alanOku(istek, 'status'));

// Kalite Merkezi'nde verilen karar Arkon isteğine aynalanır: terminal bekleyen numunesini kapatır, operatöre sonuç gider. İlk parça
// numunesinde karar Kalite Merkezi'nin ilk parça kararıdır, istekten sonra verilmiş olmalı.
// Ölçülen balon sayısı (`kmOlculen`) Kalite Merkezi'nde girilen ölçüyle de güncellenir.
export interface KmAynaGirdisi {
  numune: { karar: { karar: 'onay' | 'ret' | 'sapma'; not: string | null; kisi: string | null; zaman: string } | null; olculen: number } | null;
  ilkParcaKarari: { karar: 'onay' | 'ret'; zaman: string } | null;
}
export function kmKarariniAynala(istek: unknown, g: KmAynaGirdisi): Record<string, unknown> | null {
  if (!kayitMi(istek) || !acikIstekMi(istek)) return null;
  const istendi = typeof istek['at'] === 'number' ? istek['at'] : 0;
  // 810 a: ilk parça isteği yalnız Bugün > İlk parça kararından kapanır (kapının kaynağı); numune kararı kapıyı açmadığı için sayılmaz.
  const ilkParca = istek['ilkParca'] === true;
  const fai = ilkParca && g.ilkParcaKarari !== null && Date.parse(g.ilkParcaKarari.zaman) >= istendi ? g.ilkParcaKarari : null;
  const karar = ilkParca ? (fai === null ? null : { karar: fai.karar, not: null, kisi: null, zaman: fai.zaman }) : (g.numune?.karar ?? null);
  const olculen = g.numune?.olculen;
  const yeniOlculen = olculen !== undefined && olculen !== istek['kmOlculen'];
  if (karar === null) {
    if (!yeniOlculen) return null;
    return { ...istek, kmOlculen: olculen, ...(olculen > 0 && istek['status'] === 'waiting' ? { status: 'measuring' } : {}) };
  }
  return {
    ...istek, ...(olculen === undefined ? {} : { kmOlculen: olculen }),
    status: ARKON_DURUMLARI[karar.karar], decidedAt: Date.parse(karar.zaman), decidedBy: karar.kisi ?? '', note: karar.not ?? '',
  };
}

// 798, 796 a: tezgah ölçümü (sonuç belgesi `meas`) Kalite Merkezi'nin ölçüm kaydına da yazılır. Yalnız değişen ölçü gider; plan maddesi
// balona bağlı olmalı (`kmBalon`). Mastar maddesi (`gauge`) geçer/geçmez, öteki sayı gider; sayı olmayan değer bağsız sayılır. Aynı
// parça sayımındaki ölçüler bir yazımdır.
export interface KmOlcumGrubu { parcaSayisi: number | null; olcumler: ({ balonId: number; deger: string } | { balonId: number; nitel: 'gecer' | 'gecmez' })[] }
export function kmOlcumGruplari(paket: unknown, olculer: unknown, onceki: unknown): { gruplar: KmOlcumGrubu[]; bagsiz: number } {
  const plan = kayitMi(paket) && Array.isArray(paket['plan']) ? paket['plan'].filter(kayitMi) : [];
  if (!plan.some((b) => pozitifTamSayi(b['kmBalon'])) || !kayitMi(olculer)) return { gruplar: [], bagsiz: 0 };
  const maddeler = new Map(plan.map((b) => [String(b['id']), b]));
  const gruplar = new Map<number | null, KmOlcumGrubu>();
  let bagsiz = 0;
  for (const [id, m] of Object.entries(olculer)) {
    if (!kayitMi(m) || kanonik(disindaKalanlar(m, ['by'])) === kanonik(disindaKalanlar(alanOku(onceki, id), ['by']))) continue;
    const madde = maddeler.get(id);
    const balonId = madde?.['kmBalon'];
    const v = m['v'];
    const satir = !pozitifTamSayi(balonId) ? null
      : madde?.['gauge'] === true ? { balonId, nitel: m['ok'] === true ? 'gecer' as const : 'gecmez' as const }
        : typeof v === 'number' && Number.isFinite(v) ? { balonId, deger: String(Number(v.toFixed(6))) } : null;
    if (satir === null) { if (v !== undefined && v !== null && v !== '') bagsiz++; continue; }
    const cnt = typeof m['cnt'] === 'number' && Number.isSafeInteger(m['cnt']) && m['cnt'] >= 0 ? m['cnt'] : null;
    const grup = gruplar.get(cnt) ?? { parcaSayisi: cnt, olcumler: [] };
    grup.olcumler.push(satir);
    gruplar.set(cnt, grup);
  }
  return { gruplar: [...gruplar.values()], bagsiz };
}

// Uyarı yalnız sunucudandır: bu yazımda Kalite Merkezi'ne gidilmediyse (`undefined`) kayıtlı uyarı kalır, gidildiyse yenisi yazılır ya da kalkar.
export function kmUyarisiniYaz(govde: unknown, onceki: unknown, uyari: string | null | undefined): unknown {
  if (!kayitMi(govde)) return govde;
  const gerisi = disindaKalanlar(govde, ['kmUyari']) as Record<string, unknown>;
  const son = uyari === undefined ? alanOku(onceki, 'kmUyari') : uyari;
  return typeof son === 'string' ? { ...gerisi, kmUyari: son } : gerisi;
}

// Terminal kural 1/5 (kullanıcı kararı): son numune RED, revizyon ya da paket içeriği (plan, adım, doküman, süre) değiştiyse yeniden başlatmada
// ilk parça onayı kendiliğinden istenmez; plan ya da hazırlık paket üzerinde karar verir (`fpRe`). Ayar (kv/policy `fpRestart`) açıkken (varsayılan) hazırlık ekranı sorar;
// kapalıysa soru da kapı da yoktur. Kararı yayın rolleri verir; kişi ve kararın verildiği andaki karara bağlanmış numuneler (`once`) sunucudan
// damgalanır: tablet saatine dayanılmaz. Karar "istensin" ise paket bir kez çalışmış olsa da yeniden ilk parça Kalite Merkezi'nin kararın
// ardından verdiği onayla kapanır (`yenidenIlkParcaAcik`).
export const ilkParcaYenidenSorulur = (politika: unknown): boolean => alanOku(alanOku(politika, 'v'), 'fpRestart') !== false;

const kararOzu = (g: unknown): unknown => disindaKalanlar(alanOku(g, 'fpRe'), ['by', 'at', 'once', 'cnt']);
export const yenidenKarariDegisti = (govde: unknown, onceki: unknown): boolean => kanonik(kararOzu(govde)) !== kanonik(kararOzu(onceki));

// Karar değiştiyse an ve o ana kadar karara bağlanmış numuneler yeniden yazılır; değişmediyse kayıtlı damga korunur (istemcinin gönderdiği sayılmaz).
// `cnt` kararın verildiği andaki sağlam sayımdır: yeniden ilk parça ondan sonraki ilk sağlam parçadır.
export function yenidenKarariDamgala(
  depo: ArkonDeposu, govde: unknown, onceki: unknown, simdi: number, kararliIstekler: readonly unknown[], sayilan: number,
): unknown {
  const karar = alanOku(govde, 'fpRe');
  if (depo !== 'pkgs' || !kayitMi(govde) || !kayitMi(karar)) return govde;
  const { at: _at, once: _once, cnt: _cnt, ...oz } = karar;
  if (!yenidenKarariDegisti(govde, onceki)) {
    const eski = alanOku(onceki, 'fpRe');
    return { ...govde, fpRe: { ...oz, at: alanOku(eski, 'at'), once: alanOku(eski, 'once'), cnt: alanOku(eski, 'cnt') } };
  }
  const once = kararliIstekler.filter((i) => KARAR_DURUMLARI.has(alanOku(i, 'status'))).map((i) => alanOku(i, 'id')).filter((k): k is string => typeof k === 'string');
  return { ...govde, fpRe: { ...oz, at: simdi, once, cnt: sayilan } };
}

// Kararından önce damgasız kalan kararda taban bilinmez: sayılan bütün sağlam ilk parçadan sonra sayılır.
export const yenidenIlkParcaTabani = (paket: unknown): number => {
  const cnt = alanOku(alanOku(paket, 'fpRe'), 'cnt');
  return typeof cnt === 'number' && Number.isSafeInteger(cnt) ? cnt : 0;
};

// Kalite kararı beklenirken üretim sürer: ilk parça sağlam sayılır, ondan sonraki sağlam parça karar bekleyen sayılır (131 b); karar onayda
// sağlama, retde redde geçirir. Düzeltme (eksi) ve hurda karar bekleyene dokunmaz (VARSAYIM: eksi düzeltme sağlamdan düşer).
export const ILK_PARCA_ADEDI = 1;
export function ilkParcaSayimiAsildi(satir: Readonly<Record<string, unknown>>, ilkdenSonraSayilan: number): boolean {
  const delta = satir['delta'];
  return satir['kind'] === 'good' && typeof delta === 'number' && delta > 0 && ilkdenSonraSayilan + delta > ILK_PARCA_ADEDI;
}

// Sayım kaydına yalnız sunucunun yazdığı alan: istemcinin gönderdiği `kayitGovdesi`nde atılır, yansıma (`sayimKomutu`) buradan okur.
export const KARAR_BEKLIYOR_ALANI = 'tmiKararBekliyor';
export function kararBekleyenAdet(satir: Readonly<Record<string, unknown>>, ilkdenSonraSayilan: number): number {
  const delta = satir['delta'];
  if (!ilkParcaSayimiAsildi(satir, ilkdenSonraSayilan) || typeof delta !== 'number') return 0;
  return Math.min(delta, ilkdenSonraSayilan + delta - ILK_PARCA_ADEDI);
}

// Yeniden ilk parça "istensin" kararı, kararın anından (`fpRe.at`, sunucu damgası) sonra Kalite Merkezi'nin emir için verdiği onayla kapanır
// (denetim #12; ilk kararla aynı kaynak). Ret ya da eski onay kapıyı kapatmaz; damgasız kararda an bilinmediğinden kapı açıktır.
export function yenidenIlkParcaAcik(paket: unknown, karar: { karar: string; zaman: string } | undefined): boolean {
  const k = alanOku(paket, 'fpRe');
  if (alanOku(k, 'on') !== true) return false;
  const an = alanOku(k, 'at');
  return !(karar?.karar === 'onay' && typeof an === 'number' && Date.parse(karar.zaman) > an);
}

// B-006 kritik ölçüde ikinci kontrol: paket kuralı `critTwice` açıksa (varsayılan kapalı, kurallar.ts `RULES0`) ve istekte kritik ölçü varsa kalite
// onayı ikinci kontrol işaretini (`c2: true`) taşır; tablette işaret yokken Onayla kapalıdır (kalite.ts `needC2`). Yalnız onaya geçişte bakılır;
// red ve sapma ile onay tablette de bu işareti istemez. İşaret kalitenin kendi beyanıdır: sunucu beyanın verildiğini denetler, ikinci kişiyi değil.
export function ikinciKontrolEksik(istek: unknown, onceki: unknown, paket: unknown): boolean {
  if (alanOku(istek, 'status') !== 'approved' || alanOku(onceki, 'status') === 'approved' || alanOku(istek, 'c2') === true) return false;
  if (alanOku(alanOku(alanOku(paket, 'rules'), 'q'), 'critTwice') !== true) return false;
  const olculer = alanOku(istek, 'items');
  const plan = alanOku(paket, 'plan');
  if (!Array.isArray(olculer) || !Array.isArray(plan)) return false;
  return plan.some((b) => kayitMi(b) && Boolean(b['crit']) && olculer.includes(b['id']));
}

// İleti budaması (15 dk) cihazın imlecinden sonraki satırları silmişse cihaz depo değişikliklerini kaçırmıştır; yeniden yüklenmesi gerekir.
// Boş tabloda imleç sayaçtır: yeni cihaz da kendini yenileyen cihaz da sayaçtan başlar, döngüye girmez.
export interface IletiAraligi { taban: number | null; tavan: number | null; sayac: number }
export const ILETI_YENIDEN_YUKLE = { type: '$reload' } as const;
export const iletiBasi = (a: IletiAraligi): number => a.tavan ?? a.sayac;
export function iletiKacirildi(son: number, a: IletiAraligi): boolean {
  return a.taban === null ? son < a.sayac : son < a.taban - 1;
}

// Sunuculu Arkon'da malzeme isteği (`logi` deposunda `kind: 'req'`) stokta istek kaydı açar (tekrar eden sayfalar temizliği, madde 10).
// Yeni istek malzeme kartıyla gelir; belge stok kaydının numarasını taşır ve bundan sonra Arkon'dan değişmez, silinmez: durumu stoktan okunur.
// Stoka bağlanmamış eski (serbest metinli) istekler eski akışla kalır.
export const stokIstegiKaynagi = (kimlik: string) => `arkon:logi:${kimlik}`;
export const stokaBagliMi = (govde: unknown): boolean => kayitMi(alanOku(govde, 'stokIstek'));

export interface StokIstegiGirdisi { malzemeId: number; miktar: string; istasyonKodu: string; uretimEmriId: number | null; isEmriId: number | null; not: string | null }

export function stokIstegiKarari(govde: unknown, onceki: unknown): { ret: keyof typeof ILETILER; alan?: string } | { girdi: StokIstegiGirdisi } | null {
  if (stokaBagliMi(onceki)) return { ret: 'stokIstegi' };
  if (onceki !== undefined || !kayitMi(govde) || govde['kind'] !== 'req') return null;
  const malzemeId = govde['malzemeId'];
  if (typeof malzemeId !== 'number' || !Number.isSafeInteger(malzemeId) || malzemeId <= 0) return { ret: 'stokMalzemesi', alan: 'malzemeId' };
  const miktar = Number(govde['qty']);
  if (!Number.isFinite(miktar) || miktar <= 0) return { ret: 'stokMiktari', alan: 'qty' };
  const istasyon = govde['st'];
  if (typeof istasyon !== 'string' || istasyon === '') return { ret: 'stokIstasyonu', alan: 'st' };
  const not = typeof govde['note'] === 'string' && govde['note'].trim() !== '' ? govde['note'].trim().slice(0, 200) : null;
  return { girdi: { malzemeId, miktar: String(miktar), istasyonKodu: istasyon, uretimEmriId: paketEmri(govde['pkgId']), isEmriId: paketIsEmri(govde['pkgId']), not } };
}

// Numune teslimi (kullanıcı kararı 115 a, 125 a): operatörün kaliteye gönderdiği yeni numune isteği stokta haritadaki "Kalite numune"
// kutusuna teslim açar. Yalnız yeni istek (önceki yok, bekliyor) açar; aynı kaynak kimliği ikinci teslimi açmaz. Malzeme ve statüyü stok emirden
// çözer (VARSAYIM: miktar bir parça). Kendiliğinden gitmeme kuralı tablettedir (data/otomatik-numune.ts).
export const numuneTeslimKaynagi = (kimlik: string) => `arkon:requests:${kimlik}`;
export interface NumuneTeslimGirdisi { istasyonKodu: string; uretimEmriId: number | null; isEmriId: number | null; miktar: number; kaynakKimligi: string }

export function numuneTeslimGirdisi(kimlik: string, govde: unknown, onceki: unknown): NumuneTeslimGirdisi | null {
  if (onceki !== undefined || !kayitMi(govde) || govde['status'] !== 'waiting') return null;
  const istasyon = govde['machine'], uretimEmriId = paketEmri(govde['pkgId']), isEmriId = paketIsEmri(govde['pkgId']);
  if (typeof istasyon !== 'string' || istasyon === '' || (uretimEmriId === null && isEmriId === null)) return null;
  return { istasyonKodu: istasyon, uretimEmriId, isEmriId, miktar: 1, kaynakKimligi: numuneTeslimKaynagi(kimlik) };
}

// Teslim bağını yalnız sunucu yazar: istemcinin gönderdiği `numuneTeslim` yok sayılır, kayıtlı bağ sonraki yazımlarda (kalite kararı) korunur.
// 564 1 b: numunenin gönderildiği kalite istasyonu (`kaliteIstasyonu`, kod) da yalnız sunucudandır; kalite istasyonu terminali bununla listeler.
// 798: Kalite Merkezi bağı (`kmNumune`, `ilkParca`, `kmOlculen`, `kmUyari`) da yalnız sunucudandır.
const ISTEGIN_SUNUCU_ALANLARI = ['numuneTeslim', 'kaliteIstasyonu', 'kmNumune', 'ilkParca', 'kmOlculen', 'kmUyari'] as const;
export function numuneTesliminiKoru(govde: unknown, onceki: unknown): unknown {
  if (!kayitMi(govde)) return govde;
  const gerisi = disindaKalanlar(govde, ISTEGIN_SUNUCU_ALANLARI) as Record<string, unknown>;
  const kayitli = Object.fromEntries(ISTEGIN_SUNUCU_ALANLARI.flatMap((a) => (alanOku(onceki, a) === undefined ? [] : [[a, alanOku(onceki, a)]])));
  return { ...gerisi, ...kayitli };
}

// 564 1 b: numunenin gideceği kalite istasyonu, emrin bu adımdan sonraki ilk kalite tipli adımının istasyonudur; yoksa null.
export interface RotaAdimi { id: number; sira: number; istasyonKodu: string | null; istasyonTipi: string | null }
export function kaliteIstasyonuSec(adimlar: readonly RotaAdimi[], isEmriId: number): string | null {
  const sirali = [...adimlar].sort((a, b) => a.sira - b.sira);
  const i = sirali.findIndex((a) => a.id === isEmriId);
  if (i < 0) return null;
  return sirali.slice(i + 1).find((a) => a.istasyonTipi === 'kalite' && a.istasyonKodu !== null)?.istasyonKodu ?? null;
}
// 608 b: rotada sonraki kalite adımı yoksa numune atölyedeki tek aktif kalite istasyonuna gider; hiç yoksa ya da birden çoksa null (kutu yolu).
// Kaynak istasyon sayılmaz: numune kendi istasyonuna gönderilemez.
export function tekKaliteIstasyonu(aktifler: readonly { kod: string; tip: string }[], kaynakKodu: string): string | null {
  const kaliteler = aktifler.filter((i) => i.tip === 'kalite' && i.kod !== kaynakKodu);
  return kaliteler.length === 1 ? kaliteler[0]!.kod : null;
}

// 564 6 a, 600 a: kalite istasyonu terminalinde lotun Kabul ya da Red'i. Sonuç belgesinin (`results`) `lotKarari` alanıdır; karar Kalite
// Merkezi'nin lot kaydına yazılır (kayıt no ve karar `lotKarari.kayit` olarak sunucudan damgalanır), Arkon kendi kararını tutmaz. Red
// ölçü (bulunan kusurlu) ve gerekçe ister; karar verildikten sonra değişmez. Sayı verilmeyen sınıf null'dır, sıfır sayılmaz.
export type LotSinifi = 'Kritik' | 'Majör' | 'Minör';
// Kayıtlı karar istemciden ezilmez; paketten lot bilgisi (TMI alanları) okunur; karar sunucudan damgalanır.
export const lotKarariKoru = (govde: unknown, onceki: unknown): unknown =>
  (kayitMi(govde) && kayitMi(alanOku(onceki, 'lotKarari')) ? { ...govde, lotKarari: alanOku(onceki, 'lotKarari') } : govde);
export function lotPaketi(paket: unknown): { N: number; parcaNo: string; parcaAdi: string | null; istasyonKodu: string } | null {
  const N = alanOku(paket, 'target'), parcaNo = alanOku(paket, 'partNo'), parcaAdi = alanOku(paket, 'part'), istasyon = alanOku(paket, 'machine');
  if (typeof N !== 'number' || typeof parcaNo !== 'string' || typeof istasyon !== 'string') return null;
  return { N, parcaNo, parcaAdi: typeof parcaAdi === 'string' ? parcaAdi : null, istasyonKodu: istasyon };
}
export const lotKarariDamgala = (govde: unknown, by: string, kayit: { no: string; karar: 'Kabul' | 'Ret'; redde?: string }): unknown =>
  ({ ...(govde as object), lotKarari: { ...(alanOku(govde, 'lotKarari') as object), by, kayit } });
export interface LotKarariGirdisi { istenen: 'Kabul' | 'Ret'; bulunan: Record<LotSinifi, number | null>; not: string | null; anahtar: string }
export function lotKarariGirdisi(govde: unknown, onceki: unknown): LotKarariGirdisi | 'lotKarariGecersiz' | 'lotKarariVar' | null {
  const lk = alanOku(govde, 'lotKarari');
  const eski = alanOku(onceki, 'lotKarari');
  if (kayitMi(eski) && kayitMi(alanOku(eski, 'kayit'))) {
    return lk === undefined || kanonik(disindaKalanlar(lk, ['kayit'])) === kanonik(disindaKalanlar(eski, ['kayit'])) ? null : 'lotKarariVar';
  }
  if (lk === undefined || lk === null) return null;
  if (!kayitMi(lk)) return 'lotKarariGecersiz';
  const karar = lk['karar'];
  const b = lk['bulunan'];
  const sayi = (v: unknown): number | null | 'hata' => (v === null || v === undefined ? null : Number.isSafeInteger(v) && (v as number) >= 0 ? v as number : 'hata');
  const bulunan = { Kritik: sayi(alanOku(b, 'Kritik')), Majör: sayi(alanOku(b, 'Majör')), Minör: sayi(alanOku(b, 'Minör')) };
  const not = typeof lk['not'] === 'string' && lk['not'].trim() !== '' ? lk['not'].trim().slice(0, 500) : null;
  const at = lk['at'];
  if ((karar !== 'kabul' && karar !== 'ret') || !kayitMi(b) || typeof at !== 'number' || Object.values(bulunan).some((x) => x === 'hata')) return 'lotKarariGecersiz';
  const sayilar = bulunan as Record<LotSinifi, number | null>;
  if (Object.values(sayilar).every((x) => x === null)) return 'lotKarariGecersiz';
  if (karar === 'ret' && (not === null || !Object.values(sayilar).some((x) => x !== null && x > 0))) return 'lotKarariGecersiz';
  return { istenen: karar === 'kabul' ? 'Kabul' : 'Ret', bulunan: sayilar, not, anahtar: String(at) };
}

// Stok durumu Arkon'un istek durumlarına: teslim edilen istek Arkon'da tamamdır (operatörün "Aldım"ı stokta yoktur).
const STOK_ARKON_DURUMU = { acik: 'open', hazirlaniyor: 'prep', teslim: 'done', iptal: 'cancel' } as const;
export function stokDurumuyla(govde: unknown, durum: { durum: keyof typeof STOK_ARKON_DURUMU; karsilanan: string | null } | undefined): unknown {
  if (!kayitMi(govde) || durum === undefined) return govde;
  return { ...govde, status: STOK_ARKON_DURUMU[durum.durum], karsilanan: durum.karsilanan };
}

// Planlı duruş (kart #519): tek sahip Vardiya'dır. Arkon'un `downs` belgesi Vardiya kaydından türer, Arkon formunun yazımı Vardiya
// kaydına çevrilir; `arkon_belge` içindeki eski `downs` belgeleri okunmaz (kullanıcı kararı: taşınmaz, boş başlar). Belge kimliği Arkon'dan
// açılmış kayıtta Arkon'un kimliğidir (kaynak kimliği), Vardiya'dan açılmışta `tmi-pd-<kimlik>`. Arkon günleri 0 (pazar)-6, Vardiya ISO 1-7.
export const DURUS_BELGESI_ONEKI = 'tmi-pd-';

export interface DurusKaydiOzeti {
  id: number; baslik: string; durusNedeniId: number | null; kapsam: PlanliDurusKapsami; isMerkeziId: number | null; istasyonId: number | null;
  baslangic: string; bitis: string; tekrar: PlanliDurusTekrari; gunler: readonly number[]; tekrarBitis: string | null; aciklama: string | null;
  aktif: boolean; yazan: string | null; yazildi: string; kaynakKimligi: string | null;
}
export interface DurusKodlari { merkez: ReadonlyMap<number, string>; istasyon: ReadonlyMap<number, string>; neden: ReadonlyMap<number, string> }
export interface DurusKimlikleri { merkez: ReadonlyMap<string, number>; istasyon: ReadonlyMap<string, number>; neden: ReadonlyMap<string, number> }

export const durusBelgeKimligi = (d: Pick<DurusKaydiOzeti, 'id' | 'kaynakKimligi'>): string => d.kaynakKimligi ?? `${DURUS_BELGESI_ONEKI}${d.id}`;

export function durusBelgeKimligindenId(kimlik: string): number | null {
  const eslesme = /^tmi-pd-([1-9]\d{0,9})$/.exec(kimlik);
  return eslesme === null ? null : Number(eslesme[1]);
}

const ARKON_KAPSAMI: Readonly<Record<PlanliDurusKapsami, string>> = { tesis: 'all', 'is-merkezi': 'wc', istasyon: 'st' };
const ARKON_TEKRARI: Readonly<Record<PlanliDurusTekrari, string>> = { yok: 'none', gunluk: 'daily', haftalik: 'weekly' };
const tersi = <K extends string>(r: Readonly<Record<K, string>>): ReadonlyMap<string, K> => new Map(Object.entries(r).map(([k, v]) => [v as string, k as K]));
const TMI_KAPSAMI = tersi(ARKON_KAPSAMI);
const TMI_TEKRARI = tersi(ARKON_TEKRARI);

export function durustenBelgeye(d: DurusKaydiOzeti, kodlar: DurusKodlari): Record<string, unknown> {
  const hedef = d.kapsam === 'tesis' ? '' : d.kapsam === 'is-merkezi' ? kodlar.merkez.get(d.isMerkeziId ?? 0) : kodlar.istasyon.get(d.istasyonId ?? 0);
  const neden = d.durusNedeniId === null ? undefined : kodlar.neden.get(d.durusNedeniId);
  return {
    id: durusBelgeKimligi(d), title: d.baslik, ...(neden === undefined ? {} : { reason: neden }), scope: ARKON_KAPSAMI[d.kapsam], target: hedef ?? '',
    from: Date.parse(d.baslangic), to: Date.parse(d.bitis), rep: ARKON_TEKRARI[d.tekrar], days: d.gunler.map((g) => g % 7),
    until: d.tekrarBitis === null ? null : Date.parse(d.tekrarBitis), note: d.aciklama ?? '', by: d.yazan ?? '', at: Date.parse(d.yazildi), active: d.aktif,
  };
}

const dakikaya = (ms: number): string => new Date(Math.floor(ms / 60_000) * 60_000).toISOString();
const msMi = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

// Arkon formunun gövdesi Vardiya girdisine; Vardiya'nın kendi şemasıyla doğrulanır (VR-11 ve VR-12 Vardiya'da ayrıca denetlenir).
// `active` taşımayan gövde (Bakım düğmesi, eski form) kaydın aktifliğini değiştirmez: pasif duruş Arkon'dan güncellenince yeniden devreye girmez.
export function belgedenDurusa(govde: unknown, kimlikler: DurusKimlikleri, mevcutAktif: boolean | null): { girdi: PlanliDurusGirdisi } | { hata: BicimHatasi } {
  if (!kayitMi(govde)) return { hata: { ileti: 'Belge gövdesi nesne olmalı.', alan: 'govde' } };
  const kapsam = TMI_KAPSAMI.get(String(govde['scope']));
  if (kapsam === undefined) return { hata: { ileti: 'Planlı duruş kapsamı bilinmiyor.', alan: 'govde.scope' } };
  const tekrar = TMI_TEKRARI.get(String(govde['rep'] ?? 'none'));
  if (tekrar === undefined) return { hata: { ileti: 'Planlı duruş tekrarı bilinmiyor.', alan: 'govde.rep' } };
  const { from, to, until } = govde;
  if (!msMi(from) || !msMi(to)) return { hata: { ileti: 'Planlı duruşun başlangıç ve bitişi zaman olmalı.', alan: 'govde.from' } };
  if (until !== undefined && until !== null && !msMi(until)) return { hata: { ileti: 'Tekrar bitişi zaman olmalı.', alan: 'govde.until' } };
  const hedef = typeof govde['target'] === 'string' ? govde['target'] : '';
  const merkez = kapsam === 'is-merkezi' ? kimlikler.merkez.get(hedef) : undefined;
  const istasyon = kapsam === 'istasyon' ? kimlikler.istasyon.get(hedef) : undefined;
  if (kapsam === 'is-merkezi' && merkez === undefined) return { hata: { ileti: 'İş merkezi tanınmıyor.', alan: 'govde.target' } };
  if (kapsam === 'istasyon' && istasyon === undefined) return { hata: { ileti: 'İstasyon tanınmıyor.', alan: 'govde.target' } };
  const nedenKodu = govde['reason'];
  const neden = typeof nedenKodu === 'string' && nedenKodu !== '' ? kimlikler.neden.get(nedenKodu) : null;
  if (neden === undefined) return { hata: { ileti: 'Duruş nedeni tanınmıyor.', alan: 'govde.reason' } };
  const gunler = Array.isArray(govde['days']) ? govde['days'] : [];
  if (!gunler.every((g) => Number.isInteger(g) && g >= 0 && g <= 6)) return { hata: { ileti: 'Tekrar günleri 0-6 olmalı.', alan: 'govde.days' } };
  const baslik = typeof govde['title'] === 'string' ? govde['title'].trim().slice(0, 80) : '';
  const not = typeof govde['note'] === 'string' ? govde['note'].trim().slice(0, 300) : '';
  const sonuc = planliDurusGovdesi.safeParse({
    baslik: baslik === '' ? 'Planlı duruş' : baslik, durusNedeniId: neden, kapsam, isMerkeziId: merkez ?? null, istasyonId: istasyon ?? null,
    baslangic: dakikaya(from), bitis: dakikaya(to), tekrar, gunler: tekrar === 'haftalik' ? (gunler as number[]).map((g) => (g === 0 ? 7 : g)) : [],
    tekrarBitis: tekrar === 'yok' || !msMi(until) ? null : dakikaya(until), aciklama: not,
    aktif: typeof govde['active'] === 'boolean' ? govde['active'] : (mevcutAktif ?? true),
  });
  if (!sonuc.success) return { hata: { ileti: sonuc.error.issues[0]?.message ?? 'Planlı duruş geçersiz.', alan: 'govde' } };
  return { girdi: sonuc.data };
}

// A7-V1 (#517): TMI vardiyası Arkon'un vardiya biçimine çevrilir: aktifler, mola başlangıç saati ve dakikası (gece yarısını geçen mola dahil).
// Aktif vardiya yoksa ayar yoktur (null); Arkon vardiya tanımsız açılır, varsayılan vardiya uydurmaz.
export interface TmiVardiyasi { ad: string; baslangic: string; bitis: string; aktif: boolean; molalar: readonly { baslangic: string; bitis: string }[] }
const dakikasi = (saat: string): number => Number(saat.slice(0, 2)) * 60 + Number(saat.slice(3, 5));
export function arkonVardiyalari(vardiyalar: readonly TmiVardiyasi[]): { name: string; start: string; end: string; breaks: { at: string; min: number }[] }[] | null {
  const aktif = vardiyalar.filter((v) => v.aktif);
  if (aktif.length === 0) return null;
  return aktif.map((v) => ({
    name: v.ad, start: v.baslangic.slice(0, 5), end: v.bitis.slice(0, 5),
    breaks: v.molalar.map((m) => ({ at: m.baslangic.slice(0, 5), min: (dakikasi(m.bitis) - dakikasi(m.baslangic) + 1440) % 1440 })),
  }));
}

// Vardiya takvimindeki tatil ve kapalı günler Arkon'a tarih anahtarıyla gider: o gün vardiya penceresi yoktur (OEE planlı süresi, vardiya kilidi).
// Kayıt yoksa ayar yoktur (null).
export interface TmiTakvimGunu { tarih: string; tur: 'tatil' | 'kapali'; ad: string | null }
export function arkonTatilleri(gunler: readonly TmiTakvimGunu[]): Record<string, { type: 'tatil' | 'kapali'; name: string | null }> | null {
  if (gunler.length === 0) return null;
  return Object.fromEntries(gunler.map((g) => [g.tarih.slice(0, 10), { type: g.tur, name: g.ad }]));
}

// A7-K1 (#518): TMI ölçü aleti Arkon'un alet biçimine çevrilir. Kimlik `tmi-alet-<id>`; tarih Arkon'un girdiği gibi tesis günü
// öğlesidir. Son kalibrasyon yalnız uygun kayıttan gelir; kayıt yoksa `last` yoktur (Arkon vadesi geçmiş gösterir).
export interface TmiAleti {
  id: number; no: string; tur: string; ad: string | null; olcmeAraligi: string | null; yer: string | null; periyotGun: number;
  kullanimDisi: boolean; sonKalibrasyon: string | null;
  kayitlar: readonly { tarih: string; sonuc: 'uygun' | 'uygunsuz'; sertifikaNo: string | null; aciklama: string | null; kisiAd: string | null }[];
}
const OGLE_MS = 12 * 3_600_000;
export const ALET_ONEKI = 'tmi-alet-';
export function arkonAletleri(aletler: readonly TmiAleti[]): Record<string, unknown>[] {
  const an = (tarih: string): number => tesisGunBasi(tarih) + OGLE_MS;
  return aletler.map((a) => ({
    id: ALET_ONEKI + String(a.id), no: a.no, type: a.tur,
    ...(a.ad === null ? {} : { name: a.ad }), ...(a.olcmeAraligi === null ? {} : { range: a.olcmeAraligi }), ...(a.yer === null ? {} : { loc: a.yer }),
    interval: a.periyotGun,
    ...(a.sonKalibrasyon === null ? {} : { last: an(a.sonKalibrasyon) }),
    status: a.kullanimDisi ? 'out' : 'ok',
    cals: a.kayitlar.map((k) => ({
      at: an(k.tarih), by: k.kisiAd ?? '', res: k.sonuc === 'uygun' ? 'ok' : 'nok',
      ...(k.sertifikaNo === null ? {} : { cert: k.sertifikaNo }), ...(k.aciklama === null ? {} : { note: k.aciklama }),
    })),
  }));
}

// Rol panosu sayıları Arkon ekranlarının kendi süzgeçleridir: Hazırlık'ta yayına girmemiş paket (taslak ya da incelemede, hazirlik.ts PSTAT),
// Kalite'de bekleyen ya da ölçülen numune isteği (kalite.ts `open`), Bakım'da kapanmamış arıza (bakim-raporlar.ts `open`).
const govdeAlani = (govde: unknown, ad: string): unknown => (kayitMi(govde) ? govde[ad] : undefined);
export const hazirlikBekliyorMu = (govde: unknown): boolean => govdeAlani(govde, 'status') === 'draft' || govdeAlani(govde, 'status') === 'review';
export const kaliteBekliyorMu = (govde: unknown): boolean => govdeAlani(govde, 'status') === 'waiting' || govdeAlani(govde, 'status') === 'measuring';
export const bakimAcikMi = (govde: unknown): boolean => govdeAlani(govde, 'type') === 'ariza' && govdeAlani(govde, 'status') !== 'done';

/* ---------------- Üretim anomalisi (kart #1149, AR-AN-1..4) ---------------- */

// Zamanlar milisaniyedir. Aralık [bas, bit): net aktif süre aralıklarıdır (vardiya; mola ve planlı duruş düşülmüş).
export interface NetAralik { bas: number; bit: number }

const DAKIKA_MS = 60_000;
// Kesirli beklenen adette kayan nokta farkı bir adet eksik göstermesin.
const ADET_PAYI = 1e-9;

// Net aktif aralıkların [bas, bit) ile kesişimi, dakika.
export function kesisimDakika(araliklar: readonly NetAralik[], bas: number, bit: number): number {
  if (bit <= bas) return 0;
  let ms = 0;
  for (const a of araliklar) {
    const b = Math.max(a.bas, bas);
    const s = Math.min(a.bit, bit);
    if (s > b) ms += s - b;
  }
  return ms / DAKIKA_MS;
}

// Net aktif aralıkların [bas, bit) ile kesilmiş kopyası; kesişimi olmayan aralık düşer.
export function araliklariKes(araliklar: readonly NetAralik[], bas: number, bit: number): NetAralik[] {
  return araliklar.flatMap((a) => {
    const b = Math.max(a.bas, bas);
    const s = Math.min(a.bit, bit);
    return s > b ? [{ bas: b, bit: s }] : [];
  });
}

// Çakışan ya da bitişik aralıkları tek aralığa katar (aynı dakika iki kaynakta iki kez sayılmasın diye).
export function araliklariBirlestir(araliklar: readonly NetAralik[]): NetAralik[] {
  const sirali = [...araliklar].sort((a, b) => a.bas - b.bas);
  const sonuc: NetAralik[] = [];
  for (const a of sirali) {
    const son = sonuc[sonuc.length - 1];
    if (son !== undefined && a.bas <= son.bit) son.bit = Math.max(son.bit, a.bit);
    else sonuc.push({ ...a });
  }
  return sonuc;
}

export interface IsEmriBeklenenGirdisi {
  // İş emrinin bugün işleyebileceği adet (AR-AN-9: kalan adet): beklenen bunu aşmaz.
  adet: number;
  // Rota adımının etkin birim süresi; bilinmiyorsa (ya da sıfırsa) null: sıfır uydurulmaz.
  birimSureDk: number | null;
  // İstasyonun verimi, yüzde (satır yoksa 100).
  verimYuzde: number;
  // Canlı plandaki yerleşim.
  baslangic: number;
  bitis: number;
  // Yerleştiği kaynağın günkü net aktif aralıkları.
  araliklar: readonly NetAralik[];
  gunBasi: number;
  simdi: number;
  // Yerleşimin başındaki ilk ayar, dakika (kart 783): yerleşim bu süreyi de kapsar, ama ayarda adet çıkmaz. Ayar geride kaldıysa ya da
  // bilinmiyorsa 0.
  ayarKalanDk?: number;
}

// Beklenen adet: plandaki yerleşim ile gün başından şu ana kadarki net aktif sürenin kesişimi, ilk ayar düşülerek, süre / birim süre x verim.
// Birim süresi bilinmeyen iş emrinde null.
export function isEmriBeklenenAdet(g: IsEmriBeklenenGirdisi): number | null {
  if (g.birimSureDk === null || !(g.birimSureDk > 0)) return null;
  const dakika = Math.max(0, kesisimDakika(g.araliklar, Math.max(g.baslangic, g.gunBasi), Math.min(g.bitis, g.simdi)) - Math.max(0, g.ayarKalanDk ?? 0));
  return Math.min(g.adet, (dakika / g.birimSureDk) * (g.verimYuzde / 100));
}

export interface BeklenenToplami {
  // Bilinen parçaların toplamı.
  adet: number;
  // Bilinmeyen (null) parça sayısı: sıfırdan büyükse toplam kesin değildir.
  eksik: number;
}

export function beklenenTopla(parcalar: readonly (number | null)[]): BeklenenToplami {
  let adet = 0;
  let eksik = 0;
  for (const p of parcalar) {
    if (p === null) eksik += 1;
    else adet += p;
  }
  return { adet, eksik };
}

// Eksik parçası olan toplam hüküm vermeye yetmez: null.
export const kesinBeklenen = (t: BeklenenToplami): number | null => (t.eksik === 0 ? t.adet : null);

// Son girişten (hiç giriş yoksa gün başından) şu ana kadar geçen net aktif dakika.
export function girisYokAktifDakika(araliklar: readonly NetAralik[], sonGiris: number | null, gunBasi: number, simdi: number): number {
  return kesisimDakika(araliklar, Math.max(sonGiris ?? gunBasi, gunBasi), simdi);
}

// AR-AN-1: eşik boyunca giriş yoksa işaret. Eşik boşsa kural kapalıdır; süre ya da beklenen bilinmiyorsa hüküm yoktur (null);
// plan olmayan (beklenen sıfır) kaynak giriş yapmak zorunda değildir.
export function girisYokMu(g: { girisYokAktifDk: number | null; esikDk: number | null; beklenen: number | null }): boolean | null {
  if (g.esikDk === null || g.girisYokAktifDk === null || g.beklenen === null) return null;
  if (g.beklenen <= 0) return false;
  return g.girisYokAktifDk >= g.esikDk;
}

// AR-AN-2: gün içinde üretilen, plandaki adedin (toleransla) altındaysa işaret. Plandaki adet tam adede indirilir (yarım parça beklenmez).
// Tolerans boşsa kural kapalıdır; üretilen ya da beklenen bilinmiyorsa hüküm yoktur (null).
export function adetEksikMi(g: { uretilen: number | null; beklenen: number | null; toleransYuzde: number | null }): boolean | null {
  if (g.uretilen === null || g.beklenen === null || g.toleransYuzde === null) return null;
  const hedef = Math.floor(g.beklenen * (1 - g.toleransYuzde / 100) + ADET_PAYI);
  return g.uretilen < hedef;
}

// AR-AN-3: oran = toplam üretilen / toplam plan. Plan sıfırsa ya da biri bilinmiyorsa null (sıfıra bölünmez).
export function uretimOrani(uretilen: number | null, beklenen: number | null): number | null {
  if (uretilen === null || beklenen === null || !(beklenen > 0)) return null;
  return uretilen / beklenen;
}

// Toplam oran yalnız hem planı hem üretileni bilinen satırlarla kurulur; hiçbiri yoksa oran null.
export function toplamOran(
  satirlar: readonly { uretilen: number | null; beklenen: number | null }[],
): { uretilen: number; beklenen: number; oran: number | null } {
  let uretilen = 0;
  let beklenen = 0;
  for (const s of satirlar) {
    if (s.uretilen === null || s.beklenen === null) continue;
    uretilen += s.uretilen;
    beklenen += s.beklenen;
  }
  return { uretilen, beklenen, oran: uretimOrani(uretilen, beklenen) };
}

export type KaynakAnomalisi = 'normal' | 'isaret' | 'izinli' | 'bilinmiyor';

export interface KaynakKarsilastirmasi {
  // Plandaki sıraya göre üretebilirdi.
  beklenen: number | null;
  // Üretti; kırılım yoksa null.
  uretilen: number | null;
  fark: number | null;
  durum: KaynakAnomalisi;
}

// AR-AN-4: makine ve kişi bazında üretebilirdi / üretti. İzinli kişi beklenene girmez: beklenen sıfırdır, hüküm verilmez.
export function kaynakKarsilastir(
  g: { beklenen: number | null; uretilen: number | null; izinli: boolean; toleransYuzde: number | null },
): KaynakKarsilastirmasi {
  if (g.izinli) return { beklenen: 0, uretilen: g.uretilen, fark: null, durum: 'izinli' };
  const fark = g.beklenen === null || g.uretilen === null ? null : g.uretilen - g.beklenen;
  const eksik = adetEksikMi(g);
  return { beklenen: g.beklenen, uretilen: g.uretilen, fark, durum: eksik === null ? 'bilinmiyor' : eksik ? 'isaret' : 'normal' };
}

// Kişinin beklenen adedi, atandığı her makinenin beklenen adedinden payıdır: pay, kişinin o makinedeki yüzdesinin makineye atanmış herkesin
// yüzdeleri toplamına oranıdır (kart #1306). Yüzde kişinin zamanının bölüşümüdür (IK1): makinede yalnız çalışan kişi makinenin tamamını alır,
// iki makineye bakan kişi iki makinenin toplamını; aynı makinede iki kişi varsa ikisinden de bütün beklenen istenmez. Kişi kaynaklı
// yerleşimler bütün olarak eklenir. Parçalardan biri bilinmiyorsa null.
export function kisiBeklenen(
  makinePaylari: readonly { beklenen: number | null; yuzde: number; makineToplamYuzde: number }[], kisiYerlesimleri: readonly (number | null)[],
): number | null {
  const pay = (m: (typeof makinePaylari)[number]): number | null =>
    m.beklenen === null ? null : m.makineToplamYuzde > 0 ? (m.beklenen * m.yuzde) / m.makineToplamYuzde : m.beklenen;
  return kesinBeklenen(beklenenTopla([...makinePaylari.map(pay), ...kisiYerlesimleri]));
}

// Makineye atanmış herkes izinliyse makineyi çalıştıracak kimse yoktur: makine beklenene girmez. Ataması olmayan makine izne bağlı değildir.
export function makineIzinliMi(atananKisiler: readonly number[], izinliKisiler: ReadonlySet<number>): boolean {
  return atananKisiler.length > 0 && atananKisiler.every((k) => izinliKisiler.has(k));
}

/* ---------------- Anomali zaman olayları (kart 764, AR-AN-13..17) ---------------- */

// İki an arasındaki net aktif dakika (vardiya dışı ve mola sayılmaz); b, a'dan önceyse eksi.
export function netFarkDk(araliklar: readonly NetAralik[], a: number, b: number): number {
  return b >= a ? kesisimDakika(araliklar, a, b) : -kesisimDakika(araliklar, b, a);
}

// t anından dk net aktif dakika sonraki an. Aralıklar o kadar ileri gitmiyorsa null: bilinmeyen an uydurulmaz.
export function netIleri(araliklar: readonly NetAralik[], t: number, dk: number): number | null {
  if (!(dk > 0)) return t;
  let kalan = dk * DAKIKA_MS;
  for (const a of [...araliklar].sort((x, y) => x.bas - y.bas)) {
    if (a.bit <= t) continue;
    const bas = Math.max(a.bas, t);
    if (a.bit - bas >= kalan) return bas + kalan;
    kalan -= a.bit - bas;
  }
  return null;
}

// 766 a: üretime giriş anı ayar başıdır (ayar planın parçasıdır); ayar olayı yoksa başlama.
export function girisAni(z: { ayarBasi: string | null; baslama: string | null }): number | null {
  const an = z.ayarBasi ?? z.baslama;
  return an === null ? null : Date.parse(an);
}

export interface GecikmeGirdisi {
  // Olayın donmuş plan anı; olay yoksa canlı plandaki an.
  planAni: number;
  // Gerçekleşen an (giriş, girdinin gelişi); henüz yoksa null: gecikme şimdiye kadar sürer.
  gerceklesen: number | null;
  simdi: number;
  araliklar: readonly NetAralik[];
  // Boşsa kural kapalıdır (770 b).
  esikDk: number | null;
  // Bu iş için açık olay var mı.
  acik: boolean;
}
export interface GecikmeHukmu { dakika: number; bitti: boolean }

// AR-AN-13 (geç giriş) ve AR-AN-14 (geç teslim): plan anından gerçekleşen ana, yoksa şimdiye, net dakika; eşiği aşınca olay açılır.
// Açık olay eşik değişse ya da kapansa da ölçülmeye devam eder: plan anı donmuştur, dakika geri gitmez. Plandan önce gerçekleşen gecikme değildir.
export function gecikmeHukmu(g: GecikmeGirdisi): GecikmeHukmu | null {
  if (g.esikDk === null && !g.acik) return null;
  const dakika = Math.max(0, netFarkDk(g.araliklar, g.planAni, g.gerceklesen ?? g.simdi));
  if (!g.acik && !(dakika > (g.esikDk as number))) return null;
  return { dakika, bitti: g.gerceklesen !== null };
}

// AR-AN-14: işin girdilerinin hepsinin geldiği an; biri gelmediyse null. Girdisi olmayan işte undefined: kural uygulanmaz.
export function girdiAni(girdiler: readonly { geldi: number | null }[]): number | null | undefined {
  if (girdiler.length === 0) return undefined;
  let son = -Infinity;
  for (const g of girdiler) {
    if (g.geldi === null) return null;
    son = Math.max(son, g.geldi);
  }
  return son;
}

// Tahmini bitiş: iş girdiği andan (girmediyse şimdi ile plandaki başlangıcın geç olanından) plandaki net süresi kadar sonra; plandaki
// bitişten önce olamaz. Kaynağın takvimi o kadar ileri gitmiyorsa null.
export function tahminiBitis(g: { planBas: number; planBit: number; giris: number | null; simdi: number; araliklar: readonly NetAralik[] }): number | null {
  const sure = Math.max(0, netFarkDk(g.araliklar, g.planBas, g.planBit));
  const bas = g.giris ?? Math.max(g.simdi, g.planBas);
  const bitis = netIleri(g.araliklar, bas, sure);
  return bitis === null ? null : Math.max(bitis, g.planBit);
}

export interface ArdilGirdisi {
  // Ardılın bağlantısı: aynı emrin sonraki adımında adımın bağımlılığı, aynı tezgahtaki sonraki işte 'tezgah'.
  bag: 'bekleyen' | 'akisli' | 'bagimsiz' | 'tezgah';
  ardilPlanAni: number;
  // Kök işin başlangıç kayması ve tahmini bitişi.
  kokKaymaDk: number;
  kokTahminiBitis: number | null;
  // Ardılın kaynağının net aralıkları.
  araliklar: readonly NetAralik[];
}

// AR-AN-15 (767 a, tek adım): kök işin gecikmesinin ardıla etkisi, net dakika. Bekleyen adım ve aynı tezgahtaki sonraki iş kökün bitişini
// bekler; akışlı adım ilk devri bekler, devir kökün kaymasıyla gecikir; bağımsız adım etkilenmez. Kök bitişi bilinmiyorsa null.
export function ardilEtkisiDk(g: ArdilGirdisi): number | null {
  if (g.bag === 'bagimsiz' || !(g.kokKaymaDk > 0)) return 0;
  if (g.bag === 'akisli') return g.kokKaymaDk;
  if (g.kokTahminiBitis === null) return null;
  return Math.max(0, netFarkDk(g.araliklar, g.ardilPlanAni, g.kokTahminiBitis));
}

// AR-AN-16: emrin son adımının tahmini bitişi teslim gününün sonunu geçiyorsa takvim dakikası olarak gecikme; geçmiyorsa ya da biri
// bilinmiyorsa null.
export function teslimRiskiDk(g: { tahminiBitis: number | null; teslimSonu: number | null }): number | null {
  if (g.tahminiBitis === null || g.teslimSonu === null || !(g.tahminiBitis > g.teslimSonu)) return null;
  return (g.tahminiBitis - g.teslimSonu) / DAKIKA_MS;
}

export type OlayEylemi =
  | { tur: 'ac'; dakika: number; bitti: boolean }
  | { tur: 'guncelle'; dakika: number; bitti: boolean }
  | { tur: 'kapat' }
  | { tur: 'yok' };

// AR-AN-17: olay aynı iş ve tür için bir kez açılır, sürerken dakikası güncellenir, bitince kapanır; kapanan olay değişmez. Hüküm
// kalmayan açık olay (iş plandan düştü, etki sıfırlandı) kapanır. Sıfır dakikalık olay açılmaz.
export function olayEylemi(mevcut: { kapali: boolean } | null, hukum: GecikmeHukmu | null): OlayEylemi {
  if (mevcut?.kapali) return { tur: 'yok' };
  if (hukum === null) return mevcut === null ? { tur: 'yok' } : { tur: 'kapat' };
  if (mevcut === null) return hukum.dakika > 0 ? { tur: 'ac', ...hukum } : { tur: 'yok' };
  return { tur: 'guncelle', ...hukum };
}

// Plan sapması (781 a): bitiş kayması plan modülünden gelir, Arkon eşikle olaya çevirir. Eşik boşsa kural kapalı; açık olay eşikten bağımsız
// izlenir; değer okunamayan turda açık olay son değerini korur.
export function esikHukmu(g: { deger: number | null; esik: number | null; acik: boolean; sonDeger: number; bitti: boolean }): GecikmeHukmu | null {
  if (g.esik === null && !g.acik) return null;
  if (g.deger === null) return g.acik ? { dakika: g.sonDeger, bitti: g.bitti } : null;
  if (!g.acik && !(g.deger > (g.esik as number))) return null;
  return { dakika: Math.max(0, g.deger), bitti: g.bitti };
}

// Süre aşımı: biten işin gerçek net süresi / planlı net süresi eşik yüzdesini aşıyorsa aşan dakika (planlı süre x (oran - 1)); aşmıyorsa,
// eşik boşsa ya da biri bilinmiyorsa null.
export function sureAsimDk(g: { oran: number | null; planliDk: number | null; esikYuzde: number | null }): number | null {
  if (g.esikYuzde === null || g.oran === null || g.planliDk === null || !(g.planliDk > 0)) return null;
  return (g.oran - 1) * 100 > g.esikYuzde ? (g.oran - 1) * g.planliDk : null;
}

// Terminal durum kayıtlarından duruş aralıkları: duraklatma ve durma, sonraki başka durum kaydına (yoksa `bit`e) kadar.
export function durusAraliklari(kayitlar: readonly { zaman: number; durum: string | null }[], bit: number): NetAralik[] {
  const sirali = [...kayitlar].sort((a, b) => a.zaman - b.zaman);
  const sonuc: NetAralik[] = [];
  sirali.forEach((k, n) => {
    if (k.durum !== 'stopped' && k.durum !== 'paused') return;
    const son = sirali[n + 1]?.zaman ?? bit;
    if (son > k.zaman) sonuc.push({ bas: k.zaman, bit: son });
  });
  return araliklariBirlestir(sonuc);
}

// AR-AN-18 (784 a): toplu girişte adet x birim süre, önceki girişten bu girişe kadarki net süreyi (vardiya; mola, planlı ve kayıtlı duruş
// düşülmüş) aşıyorsa aşan dakika; aşmıyorsa 0. Birim süre ya da önceki giriş bilinmiyorsa null: hüküm verilmez.
export function topluAsimDk(g: { adet: number; birimSureDk: number | null; bas: number | null; bit: number; araliklar: readonly NetAralik[]; duruslar: readonly NetAralik[] }): number | null {
  if (g.birimSureDk === null || !(g.birimSureDk > 0) || g.bas === null || g.bit < g.bas) return null;
  const bas = g.bas;
  const durus = araliklariBirlestir([...g.duruslar]).reduce((t, d) => t + kesisimDakika(g.araliklar, Math.max(d.bas, bas), Math.min(d.bit, g.bit)), 0);
  const net = Math.max(0, kesisimDakika(g.araliklar, bas, g.bit) - durus);
  return Math.max(0, g.adet * g.birimSureDk - net);
}

/* ---------------- Anomali gün kaydı ve dönem istatistiği (kart #1306, AR-AN-5..8) ---------------- */

export type AnomaliDonemi = (typeof ANOMALI_DONEM_ADLARI)[number];

const GUN_MS_TARIH = 86_400_000;
// Tarih metni ('GGGG-AA-GG') üzerinde takvim günü; saat dilimi karışmaz.
export function gunEkle(tarih: string, gun: number): string {
  const [y, a, g] = tarih.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, a - 1, g) + gun * GUN_MS_TARIH).toISOString().slice(0, 10);
}

// AR-AN-5: dönemin ilk ve son günü (ikisi dahil). Hafta Pazartesi başlar; ay takvim ayıdır.
export function donemAraligi(donem: AnomaliDonemi, tarih: string): { bas: string; bit: string } {
  if (donem === 'gun') return { bas: tarih, bit: tarih };
  const [y, a, g] = tarih.split('-').map(Number) as [number, number, number];
  if (donem === 'hafta') {
    const haftaGunu = (new Date(Date.UTC(y, a - 1, g)).getUTCDay() + 6) % 7;
    const bas = gunEkle(tarih, -haftaGunu);
    return { bas, bit: gunEkle(bas, 6) };
  }
  const bas = `${String(y).padStart(4, '0')}-${String(a).padStart(2, '0')}-01`;
  return { bas, bit: new Date(Date.UTC(y, a, 0)).toISOString().slice(0, 10) };
}

// AR-AN-6: performans = üretilen sağlamın standart süresi / çalışılan süre. Çalışılan süre yoksa ya da sıfırsa null (sıfıra bölünmez).
export function performansOrani(standartSn: number | null, calisilanSn: number | null): number | null {
  if (standartSn === null || calisilanSn === null || !(calisilanSn > 0)) return null;
  return standartSn / calisilanSn;
}

// AR-AN-7: açık gün, ertesi gün başından bu kadar sonra kapanır (gece yarısına yakın girilen sayım kayda girsin diye). Yalnız gün içinde
// açılmış (en az bir kez hesaplanmış) gün kapanır: sunucunun kapalı kaldığı gün sonradan bugünkü planla kurulmaz.
export const ANOMALI_KAPANIS_GECIKMESI_MS = 2 * 3_600_000;

// Kapanacak günler, eskiden yeniye. `kapanis` günün bittiği anı verir (gunSiniri; saat dilimi ve vardiya kuraldan dışarıdadır).
export function kapanacakGunler(g: { aciklar: readonly string[]; simdi: number; kapanis: (tarih: string) => number }): string[] {
  return g.aciklar.filter((t) => g.kapanis(t) + ANOMALI_KAPANIS_GECIKMESI_MS <= g.simdi).sort();
}

// Terminal kural 5/5 (kullanıcı kararı): gece yarısını geçen vardiya başladığı güne yazılır. Gün kaydı o gün başlayan vardiyaların en geç
// bitişine kadar sürer (o gün başlayan vardiya yoksa ya da hepsi gün içinde bitiyorsa ertesi gün başına); sonraki gün buradan başlar.
export function gunSiniri(ertesiGunBasi: number, bitisler: readonly (number | null)[]): number {
  return bitisler.reduce<number>((en, b) => (b !== null && b > en ? b : en), ertesiGunBasi);
}

// Şimdi dünün sınırından önceyse dün başlayan vardiya sürüyordur: etkin gün dündür.
export function etkinGun(takvimGunu: string, simdi: number, dununSiniri: number): string {
  return simdi < dununSiniri ? gunEkle(takvimGunu, -1) : takvimGunu;
}

// İstasyon günü: giriş yok ya da eksik adet işaretlerinden biri varsa işaretli; ikisi de yoksa değil; hüküm yoksa null.
export function istasyonIsaretli(girisYok: boolean | null, adetEksik: boolean | null): boolean | null {
  if (girisYok === true || adetEksik === true) return true;
  return girisYok === false || adetEksik === false ? false : null;
}

// Gün içinde biten ya da plandan çıkan iş emri bugünkü hesapta yoktur; o güne kadar kaydedilen beklenen adedi kalır (kart #1306).
// Hesapta olan iş emrinde bugünkü hesap geçerlidir (plan yeniden yayınlandıysa yeni plan).
// Gün içinde biten iş emri canlı plandan düşer; beklenen gün kaydından gelir ve son kayıttan (en çok 15 dk) sonra yapılanı içermez.
// İş tamamlandığı için o gün yapılan sağlam beklenenin altında sayılmaz: fazla üretim gibi görünmez. Kayıt yoksa beklenen bilinmez (null kalır).
export function bitenIsBeklenen(kayitli: number | null, gunSaglami: number): number | null {
  return kayitli === null ? null : Math.max(kayitli, gunSaglami);
}

export function isEmriBeklenenBirlestir(
  hesap: ReadonlyMap<number, number | null>, kayitli: ReadonlyMap<number, number | null>,
): Map<number, { beklenen: number | null; kayittan: boolean }> {
  const sonuc = new Map<number, { beklenen: number | null; kayittan: boolean }>();
  for (const [id, beklenen] of hesap) sonuc.set(id, { beklenen, kayittan: false });
  for (const [id, beklenen] of kayitli) if (!sonuc.has(id)) sonuc.set(id, { beklenen, kayittan: true });
  return sonuc;
}

export interface DonemSatiri {
  beklenen: number | null;
  uretilen: number | null;
  hurda: number | null;
  standartSn: number | null;
  calisilanSn: number | null;
  isaret: boolean | null;
}

export interface DonemToplami {
  beklenen: number;
  uretilen: number;
  hurda: number;
  oran: number | null;
  performans: number | null;
  // İşaretli ve kayıtlı gün sayısı.
  isaretliGun: number;
  gun: number;
}

// AR-AN-8: dönem toplamı günlük oranların ortalaması değildir: Σ üretilen / Σ beklenen (yalnız ikisi de bilinen günlerle) ve
// Σ standart süre / Σ çalışılan süre. Az işli gün sonucu çarpıtmaz.
export function donemTopla(satirlar: readonly DonemSatiri[]): DonemToplami {
  const oran = toplamOran(satirlar);
  let hurda = 0;
  let standart = 0;
  let calisilan = 0;
  let olcum = false;
  for (const s of satirlar) {
    hurda += s.hurda ?? 0;
    if (s.standartSn !== null && s.calisilanSn !== null) {
      standart += s.standartSn;
      calisilan += s.calisilanSn;
      olcum = true;
    }
  }
  return {
    beklenen: oran.beklenen, uretilen: oran.uretilen, hurda, oran: oran.oran,
    performans: olcum ? performansOrani(standart, calisilan) : null,
    isaretliGun: satirlar.filter((s) => s.isaret === true).length, gun: satirlar.length,
  };
}

/* ── Operatör Özetim (kart #1295) ── */

// Tesis günü ('GGGG-AA-GG') üzerinde gün ekleme; takvim günüdür, saat dilimi geçişi etkilemez.
export function tarihEkle(tarih: string, gun: number): string {
  const [y, a, g] = tarih.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, a - 1, g + gun)).toISOString().slice(0, 10);
}

// Dönemin ilk günü: gün bugün, hafta pazartesi, ay ayın biri. Bitiş hep bugündür.
export function donemBaslangici(bugun: string, donem: OzetDonemi): string {
  if (donem === 'gun') return bugun;
  if (donem === 'ay') return `${bugun.slice(0, 8)}01`;
  const [y, a, g] = bugun.split('-').map(Number) as [number, number, number];
  const haftaGunu = (new Date(Date.UTC(y, a - 1, g)).getUTCDay() + 6) % 7;
  return tarihEkle(bugun, -haftaGunu);
}

// Kalite sağlam / (sağlam + hurda); hız çalışılan saat başına sağlam. Sayım ya da süre yoksa boş: sıfır uydurulmaz.
export function ozetOranlari(saglam: number | null, hurda: number | null, calismaSn: number | null): { kalite: number | null; saatlikSaglam: number | null } {
  const toplam = (saglam ?? 0) + (hurda ?? 0);
  const kalite = saglam === null || toplam <= 0 ? null : Math.max(0, Math.min(1, saglam / toplam));
  const saatlikSaglam = saglam === null || calismaSn === null || calismaSn <= 0 ? null : Math.max(0, saglam) / (calismaSn / 3600);
  return { kalite, saatlikSaglam };
}

// İsimsiz ekip ortalaması (kullanıcı kararı): 3 kişiden azsa tek kişinin sayısı ortalamadan okunabilir, gösterilmez.
export const EKIP_ALT_SINIRI = 3;
export function ekipOrtalamasi(oranlar: readonly number[]): number | null {
  return oranlar.length < EKIP_ALT_SINIRI ? null : oranlar.reduce((a, b) => a + b, 0) / oranlar.length;
}

export interface OzetGunu { tarih: string; saglam: number | null; hurda: number | null }
export interface Rozet { kod: string; baslik: string; aciklama: string }

// Rozetler gün gün sayımdan çıkar; kaydı olmayan gün (hafta sonu, izin) seriyi bozmaz, sayılmaz da.
export function ozetRozetleri(gunler: readonly OzetGunu[], bugun: string): Rozet[] {
  const kayitli = gunler.filter((g) => g.saglam !== null || g.hurda !== null).sort((a, b) => a.tarih.localeCompare(b.tarih));
  const rozetler: Rozet[] = [];
  let seri = 0;
  for (let i = kayitli.length - 1; i >= 0; i -= 1) {
    if ((kayitli[i]?.hurda ?? 0) > 0) break;
    seri += 1;
  }
  if (seri >= 2) {
    const surer = kayitli[kayitli.length - 1]?.tarih === bugun;
    rozetler.push({ kod: 'sifir-hurda', baslik: `${seri} gün üst üste sıfır hurda`, aciklama: surer ? 'Seri bugün de sürüyor' : 'Son çalıştığın günlerde' });
  }
  const buAy = kayitli.filter((g) => g.tarih.slice(0, 7) === bugun.slice(0, 7) && (g.saglam ?? 0) > 0);
  if (buAy.length >= 2) {
    const enIyi = buAy.reduce((a, b) => ((b.saglam ?? 0) > (a.saglam ?? 0) ? b : a));
    rozetler.push({ kod: 'en-iyi-gun', baslik: 'Bu ayın en çok sağlam çıkan günü', aciklama: `${enIyi.tarih.slice(8, 10)}.${enIyi.tarih.slice(5, 7)} · ${enIyi.saglam} adet` });
  }
  return rozetler;
}

// Dönemin plana göre başarısı: beklenen adedi bilinen günlerin sağlamı / beklenen toplamı. Kayıtlı ama beklenen adedi bilinmeyen
// gün hesaba girmez, sayısı söylenir. Hiç beklenen yoksa null.
export function donemBasarisi(gunler: readonly (OzetGunu & { beklenen: number | null; standartla: number })[]):
  { uretilen: number; beklenen: number; oran: number; eksikGun: number; standartla: number } | null {
  let uretilen = 0, beklenen = 0, eksikGun = 0, standartla = 0;
  for (const g of gunler) {
    const kayitli = g.saglam !== null || g.hurda !== null;
    if (g.beklenen === null) { if (kayitli) eksikGun += 1; continue; }
    uretilen += Math.max(0, g.saglam ?? 0);
    beklenen += g.beklenen;
    standartla += g.standartla;
  }
  return beklenen > 0 ? { uretilen, beklenen, oran: uretilen / beklenen, eksikGun, standartla } : null;
}

// Özetim mesaileri: bir günün mesaisi o gün başlayan aralıkların ilk ve son anıdır (molalar arada kalır). Gece vardiyasının ertesi güne taşan
// parçası (öncekinden MESAI_BOSLUK_MS'den az sonra başlayan ve ertesi gün öğlene kadar biten) başladığı güne yazılır, ertesi güne sayılmaz.
// Listenin ilk gününe önceki günden taşan parça ayırt edilemez: çağıran bir gün önceden okur ve o günü atar.
export const MESAI_BOSLUK_MS = 2 * 3_600_000;
export interface MesaiGunuGirdisi { tarih: string; dakika: number; kapali: { tur: 'tatil' | 'kapali'; ad: string | null } | null }
export interface MesaiGunu extends MesaiGunuGirdisi { baslangic: string | null; bitis: string | null }
export function mesaiGunleri(gunler: readonly MesaiGunuGirdisi[], araliklar: readonly { baslangic: string; bitis: string }[]): MesaiGunu[] {
  const parcalar = araliklar.map((x) => ({ bas: Date.parse(x.baslangic), bit: Date.parse(x.bitis) })).sort((x, y) => x.bas - y.bas)
    .map((p) => ({ ...p, gun: tesisGunu(p.bas) }));
  const alinan = new Set<number>();
  return gunler.map((g) => {
    let bas: number | null = null;
    let bit: number | null = null;
    parcalar.forEach((p, i) => {
      if (alinan.has(i)) return;
      const tasan = bit !== null && p.gun !== g.tarih && p.bas - bit < MESAI_BOSLUK_MS && p.bit <= tesisGunBasi(p.gun) + 12 * 3_600_000;
      if (p.gun === g.tarih || tasan) {
        alinan.add(i);
        bas ??= p.bas;
        bit = Math.max(bit ?? p.bit, p.bit);
      }
    });
    return { ...g, baslangic: bas === null ? null : new Date(bas).toISOString(), bitis: bit === null ? null : new Date(bit).toISOString() };
  });
}

// Fazla mesai toplamı: reddedilen satır İK'dan gelmez. Saati girilmemiş satır varsa toplam bilinmez (null); satır yoksa 0 saattir.
export function fazlaMesaiSaati(satirlar: readonly { saat: number | null }[]): number | null {
  let toplam = 0;
  for (const s of satirlar) {
    if (s.saat === null) return null;
    toplam += s.saat;
  }
  return Math.round(toplam * 100) / 100;
}

// AR-AN-9: beklenenin tavanı iş emrinin kalan adedidir: adet - önceki günlerin net sağlamı (en az 0). Dün bitmeye yakın işte
// bugünkü beklenen, kalan adetten büyük olmaz.
export function kalanAdet(adet: number, oncekiSaglam: number): number {
  return Math.max(0, adet - oncekiSaglam);
}

// AR-AN-10: istasyonun üretileni plandaki iş emirlerinin günlük sağlamıdır; geri kalan sayım plan dışıdır ve orana girmez.
// Plandaki iş emirlerinin sayımı başka istasyona yazılmışsa üretilen, istasyonun toplamını aşmaz. İş emri sayımı bilinmiyorsa
// (eski kayıt) bütün sayım üretilendir ve plan dışı bilinmez.
export function planliUretim(toplam: number, planli: number | null): { uretilen: number; planDisi: number | null } {
  if (planli === null) return { uretilen: toplam, planDisi: null };
  const uretilen = Math.min(toplam, Math.max(0, planli));
  return { uretilen, planDisi: toplam - uretilen };
}

/* ---------------- Emek verimi (kart #1324) ---------------- */

export interface EmekMesaiGunu {
  // Tesis gününün başı ve sonraki günün başı (ms).
  bas: number;
  bit: number;
  // İzinli gün mesaiye girmez.
  izinli: boolean;
  // Vardiya takviminde olmayan onaylı fazla mesai (saniye); izinli günde de sayılmaz.
  fazlaMesaiSn?: number;
  // O gün başlayan vardiyaların net aralıkları; null: o günün takvimi bilinmiyor.
  araliklar?: readonly NetAralik[] | null;
}

// AR-AN-11: kişinin mesai süresi, vardiya takviminin net aralıklarının izinli olmayan günlerle kesişimi (şimdiye kadar) ile o günlerin
// takvim dışı onaylı fazla mesaisidir. Takvimi bilinmeyen kişinin mesaisi bilinmez (null); sıfır uydurulmaz.
// Günün kendi aralıkları (o gün başlayan vardiyalar) verilirse ortak aralıkların yerine o kullanılır: gece vardiyası başladığı güne sayılır.
export function mesaiSaniyesi(g: { araliklar: readonly NetAralik[] | null; gunler: readonly EmekMesaiGunu[]; simdi: number }): number | null {
  if (g.gunler.length === 0) return g.araliklar === null ? null : 0;
  let toplam = 0;
  for (const d of g.gunler) {
    const araliklar = d.araliklar === undefined ? g.araliklar : d.araliklar;
    if (araliklar === null) return null;
    if (!d.izinli) toplam += kesisimDakika(araliklar, d.bas, Math.min(d.bit, g.simdi)) * 60 + (d.fazlaMesaiSn ?? 0);
  }
  return Math.round(toplam);
}

// AR-AN-12: emek verimi = kişinin girdiği sağlamın standart süresi / mesai süresi. Katılım süresi kullanılmaz: aynı anda birden çok makineye
// bakan kişide çalışılan süre iki kez sayılır, mesai sayılmaz. Mesai yoksa ya da sıfırsa null (sıfıra bölünmez).
export function emekVerimi(standartSn: number | null, mesaiSn: number | null): number | null {
  if (standartSn === null || mesaiSn === null || !(mesaiSn > 0)) return null;
  return standartSn / mesaiSn;
}

// Üretim Hazırlık kuyruk sırası (kart 527, 519 1 c): istasyon kuyruğunun sırası Arkon'undur, canlı plan referanstır. Plan sırası değişmez;
// "Plana öner" A4 komutudur (`planSirasiReddi`).
export const KUYRUK_ILETILERI = {
  gecersiz: 'Yeni sıra, ekrandaki işlerin dizilişi olmalı.',
  eski: 'Kuyruk değişti: ekranı yenileyip yeniden sıralayın.',
  pakete: 'Yalnız TMI iş emri işleri sıralanır.',
  sabit: 'Kilitli ya da dondurulmuş iş yerinden oynatılamaz.',
  degismedi: 'Sıra değişmedi.',
  bos: 'Bu kuyrukta Hazırlık sırası yok.',
} as const;

export interface KuyrukIsi { kimlik: string; sira: number | null }

// Ekranın gördüğü kuyruk (`onceki`) bugünkü kuyrukla aynı işlerden oluşmalı ve Hazırlık sırası olan işler aynı dizilişte görünmeli: arada
// sıralayan kişi ya da kuyruğa giren, çıkan iş eski ekranı reddettirir. Sırasız işlerin dizilişi plandandır; onu ekranın kendisi gösterir.
export function kuyrukSirasiReddi(onceki: readonly string[], yeni: readonly string[], mevcut: readonly KuyrukIsi[]): 'gecersiz' | 'eski' | null {
  const a = [...onceki].sort(), b = [...yeni].sort();
  if (a.length !== b.length || new Set(a).size !== a.length || a.some((x, i) => x !== b[i])) return 'gecersiz';
  const m = mevcut.map((x) => x.kimlik).sort();
  if (m.length !== a.length || m.some((x, i) => x !== a[i])) return 'eski';
  const sira = new Map(mevcut.flatMap((x) => (x.sira === null ? [] : [[x.kimlik, x.sira] as const])));
  const gorunen = onceki.filter((k) => sira.has(k));
  const kayitli = [...sira.keys()].sort((x, y) => sira.get(x)! - sira.get(y)!);
  return gorunen.every((k, i) => k === kayitli[i]) ? null : 'eski';
}

export interface PlanSaati { baslangic: string; bitis: string }
// Canlı planın saatleri paket kimliğiyle: bölünmemiş iş kendi yerleşimi, bölünmüş işin bütün paketi zarf, parça kendi yeri.
export function planSaatleri(
  yerlesimler: readonly { isEmriId: number; baslangic: Date; bitis: Date; parcalar?: readonly { no: number; baslangic: Date; bitis: Date }[] | undefined }[],
): Map<string, PlanSaati> {
  const sonuc = new Map<string, PlanSaati>();
  for (const y of yerlesimler) {
    sonuc.set(isEmriPaketKimligi(y.isEmriId), { baslangic: y.baslangic.toISOString(), bitis: y.bitis.toISOString() });
    for (const p of y.parcalar ?? []) sonuc.set(parcaPaketKimligi(y.isEmriId, p.no), { baslangic: p.baslangic.toISOString(), bitis: p.bitis.toISOString() });
  }
  return sonuc;
}

// İş emri paketinin `tmi` alanına kuyruk sırası ve plan saati eklenir (TMI alanıdır, istemciden alınmaz). Yoksa alan yazılmaz.
export function kuyrukAlanlariniEkle(
  govde: Record<string, unknown>, ek: { kuyruk: { sira: number; kisi: string; zaman: string } | null; planSaati: PlanSaati | null },
): Record<string, unknown> {
  if (ek.kuyruk === null && ek.planSaati === null) return govde;
  const tmi = kayitMi(govde['tmi']) ? govde['tmi'] : {};
  return { ...govde, tmi: { ...tmi, ...(ek.kuyruk ? { kuyruk: ek.kuyruk } : {}), ...(ek.planSaati ? { planSaati: ek.planSaati } : {}) } };
}

// 639h (847 b): adım önceki adımın teslim etmediği parçayı saydıysa (uretim-emirleri `eksik` eksi, 647 a) fazla sayılan adet paketin
// `tmi.eksi` alanına yazılır; operatör kartı bunu gösterir. Artı (henüz işlenmemiş) ya da bilinmeyen eksik alan yazmaz.
export function eksiAlaniniEkle(govde: Record<string, unknown>, eksik: number | null | undefined): Record<string, unknown> {
  if (typeof eksik !== 'number' || !Number.isSafeInteger(eksik) || eksik >= 0) return govde;
  const tmi = kayitMi(govde['tmi']) ? govde['tmi'] : {};
  return { ...govde, tmi: { ...tmi, eksi: -eksik } };
}
