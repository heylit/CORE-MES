// SmartES bağlantısının saf kuralları (kart #778): satır eşleme, okuma penceresi, işaretleme ve iş emri gönderimi.
// Kural kodları SME-n; testleri KURAL-TEST.md'de.
import { createHash } from 'node:crypto';
import { SMARTES_OKUMA_KAYNAKLARI } from '#paylasilan/sozlesme/smartes.ts';
import type { SmartesEslemeTuru } from '#paylasilan/sozlesme/smartes.ts';
import { mantiksal, metinAlani, tamSayi, tarihAlani } from './soap.ts';
import type { ParametreDegeri, Parametreler, TabloSatiri } from './soap.ts';

export type EslemeTuru = SmartesEslemeTuru;
export const OKUMA_KAYNAKLARI = SMARTES_OKUMA_KAYNAKLARI;
export type OkumaKaynagi = (typeof OKUMA_KAYNAKLARI)[number];

// Zamanlama (VARSAYIM, brief 8): üretim çekimi ve iş emri gönderimi 5 dk, duruş ve alarm 15 dk.
export const IS_ARALIKLARI_MS = {
  'is-emri-durumu': 5 * 60_000,
  durus: 15 * 60_000,
  alarm: 15 * 60_000,
  gonderim: 5 * 60_000,
  // Kalite, hurda, ambar okuması ve tanım gönderimi (VARSAYIM): on beş dakikada bir; tanımda niyet bir tur, gönderim sonraki turda gider.
  'kalite-ambar': 15 * 60_000,
  tanim: 15 * 60_000,
} as const;

// Pencere (SME-11): ilk okuma son 24 saatten başlar; her okuma en çok 24 saatlik pencere ister (uzun aralık zaman aşımına düşer,
// brief tuzak 7); sonraki pencere öncekinin sonundan 15 dk geriden başlar ki geç yazılan kayıt kaçmasın. Yinelenen kayıt SmartES
// kimliğiyle tekildir.
export const ILK_GERI_MS = 24 * 3_600_000;
export const AZAMI_PENCERE_MS = 24 * 3_600_000;
export const ORTUSME_MS = 15 * 60_000;

// Hatadan sonra aynı pencere yinelenmez (KD-044): her ardışık hatada pencere yarıya iner, en az 5 dk; büyük pencere zaman
// aşımına ya da boyut sınırına takılıp kaynağı kalıcı durdurmasın. Uzunluk son okunan andan sayılır: örtüşme pencereyi geri
// götürmez, her başarılı okuma en az asgari pencere kadar ilerler. Atlanmış pencerenin sonundan geriye örtüşülmez (yine bozuk gelirdi).
export const ASGARI_PENCERE_MS = 5 * 60_000;

export function okumaPenceresi(
  sonBitis: Date | null, simdi: Date, ardisikHata = 0, atlananSon: Date | null = null,
): { bas: Date; son: Date } {
  const uzunluk = Math.max(ASGARI_PENCERE_MS, AZAMI_PENCERE_MS / 2 ** Math.min(Math.max(ardisikHata, 0), 30));
  const t = simdi.getTime();
  if (sonBitis === null) {
    const bas = t - ILK_GERI_MS;
    return { bas: new Date(bas), son: new Date(Math.min(bas + uzunluk, t)) };
  }
  const bas = Math.min(Math.max(sonBitis.getTime() - ORTUSME_MS, atlananSon?.getTime() ?? -Infinity), t);
  return { bas: new Date(bas), son: new Date(Math.max(bas, Math.min(sonBitis.getTime() + uzunluk, t))) };
}

// Asgari pencerede art arda gelen bozuk cevap (okunamayan XML) o pencereyi atlatır; atlama hata metninde yazılır.
// Ağ hatası, zaman aşımı ve SmartES hatası pencereyi hiç atlatmaz: servis kapalıyken veri kaybolmasın.
export const ATLAMA_ESIGI = 3;
const ASGARIYE_INIS = Math.ceil(Math.log2(AZAMI_PENCERE_MS / ASGARI_PENCERE_MS));
export const pencereAtlanmaliMi = (bozuk: boolean, ardisikHata: number): boolean => bozuk && ardisikHata >= ASGARIYE_INIS + ATLAMA_ESIGI;

// Tur başına üst sınırlar: her SmartES çağrısı saniyeler sürebilir; tur bir sonraki turu geciktirmesin.
export const GONDERIM_TUR_SINIRI = 10;

// Başarısız denemeden sonra bekleme: 1, 2, 4 ... dk, en çok 1 saat.
export function geriCekilmeMs(ardisikHata: number): number {
  return Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, ardisikHata - 1));
}

const AZAMI_METIN = 2000;
export const kirp = (s: string): string => (s.length > AZAMI_METIN ? `${s.slice(0, AZAMI_METIN - 1)}…` : s);

// --- Satır eşleme ------------------------------------------------------------
// Alan adları SmartFactory servis belgesinden (10.6.2.17; madde numaraları yanlarında); canlı WSDL'de doğrulanmadı. Aday adlar sırayla
// denenir: ilk dolu olan alınır. Değişirse yalnız bu listeler değişir; ham satır her kayıtta saklandığından eski kayıtlar yeniden yorumlanabilir.
export const ALANLAR = {
  isEmriDurumu: {
    id: ['WORKORDER_STATUS_ID', 'WORKORDERSTATUS_ID'],
    isEmriNo: ['WORKORDER_NO', 'WORKORDERNO'],
    erpId: ['ERP_ID', 'ERPID'],
    istasyon: ['WORKSTATION_CODE'],
    operasyon: ['OPERATION_CODE'],
    makine: ['MACHINE_CODE'],
    stok: ['STOCK_NO'],
    saglam: ['OK'],
    red: ['RED'],
    makineSaglam: ['MACHINE_OK'],
    makineRed: ['MACHINE_RED'],
    baslangic: ['START_DATETIME'],
    bitis: ['END_DATETIME'],
    bitti: ['IS_DONE', 'ISDONE'],
    erpSaglam: ['ISERP_OK', 'IS_ERP_OK'],
    erpRed: ['ISERP_RED', 'IS_ERP_RED'],
  },
  // DownTimeStatusListWithoutWorkOrder (md. 91): iş emrine bağlı olmadan başlatılan duruş; satırda iş emri yok, neden adla gelir.
  durus: {
    id: ['ID'],
    makine: ['MACHINE_CODE'],
    neden: ['DOWNTIME_NAME'],
    isEmriNo: [],
    baslangic: ['START_DATETIME'],
    bitis: ['END_DATETIME'],
  },
  // AlarmsList (md. 5): makine başına çağrılır, satırda kimlik ve makine yok; makine alanlarını çağıran ekler (ALARM_MAKINE_ALANLARI).
  alarm: {
    makineId: ['MACHINE_ID'],
    makine: ['MACHINE_CODE'],
    tip: ['ALARMTYPE'],
    kod: ['ALARMNO'],
    aciklama: ['ALARMTEXT'],
    baslangic: ['START_DATETIME'],
    bitis: ['END_DATETIME'],
  },
} as const;

const ilkAlan = (satir: TabloSatiri, adlar: readonly string[]): string | null => adlar.find((a) => metinAlani(satir, a) !== null) ?? null;
const metin = (s: TabloSatiri, adlar: readonly string[]): string | null => {
  const a = ilkAlan(s, adlar);
  return a === null ? null : kirpKod(metinAlani(s, a));
};
const sayi = (s: TabloSatiri, adlar: readonly string[]): number | null => {
  const a = ilkAlan(s, adlar);
  return a === null ? null : tamSayi(s, a);
};
const tarih = (s: TabloSatiri, adlar: readonly string[]): Date | null => {
  const a = ilkAlan(s, adlar);
  return a === null ? null : tarihAlani(s, a);
};
const bayrak = (s: TabloSatiri, adlar: readonly string[]): boolean | null => {
  const a = ilkAlan(s, adlar);
  return a === null ? null : mantiksal(s, a);
};
const kirpKod = (d: string | null): string | null => (d === null ? null : d.slice(0, 200));
// Kimlik pozitif tam sayıdır; yoksa satır tekil yazılamaz ve sayılarak atlanır (SME-12).
// Adet sütunları int: aralık dışı değer satırı reddettirmez, "veri yok" olur.
const adet = (s: TabloSatiri, adlar: readonly string[]): number | null => {
  const n = sayi(s, adlar);
  return n !== null && n >= -2_147_483_648 && n <= 2_147_483_647 ? n : null;
};
const kimlik = (s: TabloSatiri, adlar: readonly string[]): number | null => {
  const n = sayi(s, adlar);
  return n !== null && n > 0 ? n : null;
};

export interface IsEmriDurumuKaydi {
  smartesId: number;
  isEmriNo: string | null;
  erpId: string | null;
  istasyonKodu: string | null;
  operasyonKodu: string | null;
  makineKodu: string | null;
  stokNo: string | null;
  saglam: number | null;
  red: number | null;
  makineSaglam: number | null;
  makineRed: number | null;
  baslangic: Date | null;
  bitis: Date | null;
  bitti: boolean | null;
  erpSaglam: boolean | null;
  erpRed: boolean | null;
  ham: TabloSatiri;
}

export interface DurusKaydi {
  smartesId: number;
  makineKodu: string | null;
  nedenKodu: string | null;
  isEmriNo: string | null;
  baslangic: Date | null;
  bitis: Date | null;
  ham: TabloSatiri;
}

export interface AlarmKaydi {
  smartesId: number;
  makineKodu: string | null;
  alarmKodu: string | null;
  aciklama: string | null;
  baslangic: Date | null;
  bitis: Date | null;
  ham: TabloSatiri;
}

export function isEmriDurumuOku(s: TabloSatiri): IsEmriDurumuKaydi | null {
  const a = ALANLAR.isEmriDurumu;
  const id = kimlik(s, a.id);
  if (id === null) return null;
  return {
    smartesId: id, isEmriNo: metin(s, a.isEmriNo), erpId: metin(s, a.erpId), istasyonKodu: metin(s, a.istasyon), operasyonKodu: metin(s, a.operasyon),
    makineKodu: metin(s, a.makine), stokNo: metin(s, a.stok), saglam: adet(s, a.saglam), red: adet(s, a.red), makineSaglam: adet(s, a.makineSaglam),
    makineRed: adet(s, a.makineRed), baslangic: tarih(s, a.baslangic), bitis: tarih(s, a.bitis), bitti: bayrak(s, a.bitti),
    erpSaglam: bayrak(s, a.erpSaglam), erpRed: bayrak(s, a.erpRed), ham: s,
  };
}

export function durusOku(s: TabloSatiri): DurusKaydi | null {
  const a = ALANLAR.durus;
  const id = kimlik(s, a.id);
  if (id === null) return null;
  return { smartesId: id, makineKodu: metin(s, a.makine), nedenKodu: metin(s, a.neden), isEmriNo: metin(s, a.isEmriNo), baslangic: tarih(s, a.baslangic), bitis: tarih(s, a.bitis), ham: s };
}

// AlarmsList satırında kimlik yok: kayıt makine, alarm tipi, alarm no ve başlangıç zamanıyla tekildir. Bunlardan türetilen pozitif kimlik
// (SHA-256'nın ilk 52 biti) smartes_id olur; aynı alarm sonraki okumada aynı kimlikle gelir, bitişi güncellenir. Makine, alarm no ya da
// başlangıç yoksa satır kimliksizdir; tip yoksa boş sayılır.
export function alarmKimligi(makineId: number, alarmTipi: string | null, alarmNo: string, baslangic: Date): number {
  const ozet = createHash('sha256').update(JSON.stringify([makineId, alarmTipi ?? '', alarmNo, baslangic.toISOString()])).digest('hex');
  return Number.parseInt(ozet.slice(0, 13), 16) + 1;
}

export function alarmOku(s: TabloSatiri): AlarmKaydi | null {
  const a = ALANLAR.alarm;
  const makineId = kimlik(s, a.makineId);
  const alarmNo = metin(s, a.kod);
  const baslangic = tarih(s, a.baslangic);
  if (makineId === null || alarmNo === null || baslangic === null) return null;
  return {
    smartesId: alarmKimligi(makineId, metin(s, a.tip), alarmNo, baslangic), makineKodu: metin(s, a.makine), alarmKodu: alarmNo, aciklama: metin(s, a.aciklama),
    baslangic, bitis: tarih(s, a.bitis), ham: s,
  };
}

// Alarm okuması önce makineleri alır (ActiveMachinesList, md. 1: ID, KOD); her makine için AlarmsList çağrılır ve satıra makine alanları eklenir.
export const MAKINE_LISTESI_METODU = 'ActiveMachinesList';
export const ALARM_MAKINE_ALANLARI = { id: 'MACHINE_ID', kod: 'MACHINE_CODE' } as const;

export interface AktifMakine {
  id: number;
  kod: string | null;
}

// Kimliği pozitif tam sayı olmayan makine satırı atlanır: AlarmsList'e MachineID olmadan gidilmez.
export function smartesMakineleri(satirlar: readonly TabloSatiri[]): AktifMakine[] {
  const sonuc: AktifMakine[] = [];
  for (const s of satirlar) {
    const id = kimlik(s, ['ID']);
    if (id !== null) sonuc.push({ id, kod: metin(s, ['KOD']) });
  }
  return sonuc;
}

export const alarmParametreleri = (makineId: number, p: { bas: Date; son: Date }): Parametreler => [
  ['MachineID', makineId], ['StartDatetime', p.bas], ['EndDatetime', p.son],
];

export const alarmSatiri = (s: TabloSatiri, m: AktifMakine): TabloSatiri => ({
  ...s, [ALARM_MAKINE_ALANLARI.id]: String(m.id), ...(m.kod === null ? {} : { [ALARM_MAKINE_ALANLARI.kod]: m.kod }),
});

// --- Okuma çağrıları (brief 7.2, 7.4) -----------------------------------------

// DownTimeList ve RejectsList parametre almaz, tanım (ad, renk, grup) döner; hareket değildir (md. 37, 38). Alarm makine başına okunur.
export const OKUMA_METOTLARI: Readonly<Record<OkumaKaynagi, string>> = {
  'is-emri-durumu': 'WorkOrdersStatusList',
  durus: 'DownTimeStatusListWithoutWorkOrder',
  alarm: 'AlarmsList',
};

// Filtre "All": işaret durumuna güvenilmez, tekillik TMI'dedir (brief tuzak 14: yanlış yazılan filtre sessizce All olur).
// Duruş metodunun parametre adları belgede büyük harfli ve alt çizgilidir (md. 91); süren duruş da gelir, bitişi sonraki okumada güncellenir.
export function okumaParametreleri(kaynak: Exclude<OkumaKaynagi, 'alarm'>, p: { bas: Date; son: Date }): Parametreler {
  if (kaynak === 'durus') {
    return [['START_DATETIME', p.bas], ['END_DATETIME', p.son], ['WORKSTATION_CODE', ''], ['MACHINE_CODE', ''], ['INCLUDE_ACTIVES', true]];
  }
  return [
    ['StartDatetime', p.bas], ['EndDatetime', p.son], ['IncludeActives', true], ['WorkorderNo', ''], ['TrackingNo', ''], ['ErpID', ''],
    ['WorkstationCode', ''], ['OperationCode', ''], ['MachineCode', ''], ['StockNo', ''], ['WorkorderStatusFilter', 'All'],
  ];
}

// --- İş emri gönderimi (SME-14) -------------------------------------------------

export interface GidecekIsEmri {
  isEmriId: number;
  emirNo: string;
  opNo: number;
  ad: string;
  durum: 'planli' | 'basladi';
  adet: number;
  oncelik: number;
  teslim: string | null;
  baslangic: string | null;
  ayarSuresiDk: string | null;
  birimSureDk: string | null;
  istasyonKodu: string;
  makineKodu: string | null;
  stokNo: string;
  stokAdi: string | null;
}

export const IS_EMRI_METODU = 'WorkOrdersCreateUpdate';
export const OPERASYON_METODU = 'OperationCreateUpdate';

// SmartES iş emri no: üretim emri no ve adım no (her adım ayrı iş emridir, brief tuzak 12).
export const smartesIsEmriNo = (emirNo: string, opNo: number): string => `${emirNo}-${opNo}`;
// Operasyon kodu adım numarasıdır (VARSAYIM): iş emrinde operasyon tipi kimliği yok (BASKA-MODUL-ISTEKLERI madde 1); gelince eşlemeden okunur.
export const smartesOperasyonKodu = (opNo: number): string => String(opNo);

const dakika = (d: string | null, carpan = 1): number => {
  if (d === null) return 0;
  const n = Number(d) * carpan;
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : 0;
};

// Tarih metni (yyyy-mm-dd; zaman metninin ilk on karakteri) SmartES saat diliminde günün başı olarak gider; zamana çeviren istemcinin saat dilimidir.
const gunBasi = (t: string): Date => tarihAlani({ T: `${t.slice(0, 10)}T00:00:00` }, 'T') ?? new Date(Number.NaN);

// Parametre adları ve sırası belgedeki gibidir (md. 39): çarpanın adı belgede "Multipler" yazılır. Adet önceki gönderimden farklıysa
// QuantityUpdate true gider ("adet değişikliği yapılıyorsa kullanılır"); yoksa SmartES var olan iş emrinin adedini değiştirmeyebilir (VARSAYIM).
export function isEmriParametreleri(i: GidecekIsEmri, kapanis: 'yok' | 'bitti' | 'pasif', bugun: string, adetDegisti = false): Parametreler {
  return [
    ['WorkOrderNo', smartesIsEmriNo(i.emirNo, i.opNo)],
    ['WorkstationCode', i.istasyonKodu],
    ['OperationCode', smartesOperasyonKodu(i.opNo)],
    ['MachineCode', i.makineKodu ?? ''],
    ['WorkOrderDate', gunBasi(i.baslangic ?? bugun)],
    ['StockNo', i.stokNo],
    ['Quantity', i.adet],
    ['Multipler', 1],
    ['EstimatedPreparationTime', dakika(i.ayarSuresiDk)],
    ['EstimatedRunTime', dakika(i.birimSureDk, i.adet)],
    ['EstimatedResetTime', 0],
    ['Description', `${i.emirNo} / ${i.opNo} ${i.ad}`.slice(0, 200)],
    ['Priority', i.oncelik],
    ['IsPassive', kapanis === 'pasif'],
    ['IsDone', kapanis === 'bitti'],
    ['IsQualityControl', false],
    ['StockDescription', (i.stokAdi ?? '').slice(0, 150)],
    ['ErpID', String(i.isEmriId)],
    ['DeliveryDatetime', i.teslim === null ? null : gunBasi(i.teslim)],
    ['Priority2', 0],
    ['TrackingNo', i.emirNo],
    ['QuantityUpdate', adetDegisti],
    ['RouteCode', ''],
  ];
}

// OperationCreateUpdate (md. 75). ID 0 yeni ya da koda göre var olan kayıttır (VARSAYIM: belge "Bkz. ID*" der, tanımı vermez).
export const operasyonParametreleri = (i: Pick<GidecekIsEmri, 'istasyonKodu' | 'opNo' | 'ad'>): Parametreler => [
  ['ID', 0], ['Code', smartesOperasyonKodu(i.opNo)], ['Name', i.ad.slice(0, 50)], ['WorkstationCode', i.istasyonKodu], ['IsPassive', false],
  ['IsQualityControl', false],
];

// Gönderilen alanların özeti: değişmeyen iş emri yeniden gönderilmez, değişen (adet, istasyon, makine, termin...) gönderilir.
// QuantityUpdate özete girmez: değişikliğin sonucudur, alanı değildir; girseydi bir sonraki tur özet farkıyla yeniden gönderirdi.
const OZETE_GIRMEZ = new Set(['QuantityUpdate']);
export function gonderimOzeti(p: Parametreler): string {
  return JSON.stringify(p.filter(([a]) => !OZETE_GIRMEZ.has(a)).map(([a, d]) => [a, d instanceof Date ? d.toISOString() : d]));
}

// Son gönderilen adet (özetteki Quantity); özet okunamazsa null.
export function ozettekiAdet(ozet: string): number | null {
  try {
    const dizi: unknown = JSON.parse(ozet);
    if (!Array.isArray(dizi)) return null;
    const oge: unknown = dizi.find((o) => Array.isArray(o) && o[0] === 'Quantity');
    return Array.isArray(oge) && typeof oge[1] === 'number' ? oge[1] : null;
  } catch {
    return null;
  }
}

export const adetDegistiMi = (oncekiOzet: string | null, adet: number): boolean => {
  if (oncekiOzet === null) return false;
  const once = ozettekiAdet(oncekiOzet);
  return once !== null && once !== adet;
};

export type GonderimEylemi = 'gonder' | 'bekle' | 'atla';

// Gönderilmiş ve özeti aynı iş emri atlanır; hatalı olan bekleme süresi dolunca yeniden denenir.
export function gonderimEylemi(
  g: { ozet: string | null; durum: 'gonderildi' | 'hata' | 'kapandi'; sonrakiDeneme: Date | null } | null,
  ozet: string,
  simdi: Date,
): GonderimEylemi {
  if (g === null) return 'gonder';
  if (g.durum === 'hata') return g.sonrakiDeneme !== null && g.sonrakiDeneme > simdi ? 'bekle' : 'gonder';
  // Kapatılmış iş emri listeye geri döndüyse (iptal geri alındı) SmartES'te yeniden açılır.
  if (g.durum === 'kapandi') return 'gonder';
  return g.ozet === ozet ? 'atla' : 'gonder';
}

const ISO_ZAMAN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// Kapanış (SME-15): listeden çıkan iş emri son gönderilen alanlarıyla IsDone (bitti) ya da IsPassive (iptal, bulunamadı) olarak
// yeniden gönderilir; silinmez (brief tuzak 10). Alanlar özetten kurulur: özet gönderilen parametrelerin kendisidir.
export function kapanisParametreleri(ozet: string, kapanis: 'bitti' | 'pasif'): Parametreler | null {
  let dizi: unknown;
  try {
    dizi = JSON.parse(ozet);
  } catch {
    return null;
  }
  if (!Array.isArray(dizi)) return null;
  const sonuc: (readonly [string, ParametreDegeri])[] = [];
  for (const oge of dizi) {
    if (!Array.isArray(oge) || oge.length !== 2 || typeof oge[0] !== 'string') return null;
    const [eskiAd, d] = oge as [string, unknown];
    // Belgeyle uyumdan önce yazılmış özetteki çarpan adı belgedeki ada çevrilir.
    const ad = eskiAd === 'Multiplier' ? 'Multipler' : eskiAd;
    if (ad === 'IsPassive') sonuc.push([ad, kapanis === 'pasif']);
    else if (ad === 'IsDone') sonuc.push([ad, kapanis === 'bitti']);
    else if (typeof d === 'string' && ISO_ZAMAN.test(d)) sonuc.push([ad, new Date(d)]);
    else if (d === null || typeof d === 'string' || typeof d === 'number' || typeof d === 'boolean') sonuc.push([ad, d]);
    else return null;
    // QuantityUpdate özette yoktur; kapanış adedi değiştirmez, belgedeki sırada false gider.
    if (ad === 'TrackingNo') sonuc.push(['QuantityUpdate', false]);
  }
  return sonuc;
}

// Skaler cevap: hata metni doluysa red; AffectedRows=0 ve boş hata "değişiklik yok"tur, başarıdır (brief tuzak 6).
export const skalerBasariliMi = (r: { hata: string | null }): boolean => r.hata === null;

// --- Kalite, hurda ve ambar okuması (SME-20) ------------------------------------
// Metot, parametre ve alan adları SmartFactory servis belgesinden (md. 46, 53, 64); canlı WSDL'de doğrulanmadı. Ham satır her kayıtta
// saklanır; ilk gerçek bağlantıda ham satır okunur, yalnız bu listeler düzeltilir (UYUM-BORCU 11).
export const KALITE_AMBAR_KAYNAKLARI = ['red', 'ambar', 'kalite'] as const;
export type KaliteAmbarKaynagi = (typeof KALITE_AMBAR_KAYNAKLARI)[number];

export const KALITE_AMBAR_METOTLARI: Readonly<Record<KaliteAmbarKaynagi, string>> = {
  // RejectsList fire tanımlarını döner (md. 38); fire hareketi iş emri bilgisiyle bu metottadır (md. 46).
  red: 'WsWorkordersRejectStatusList',
  ambar: 'WarehouseStatusList',
  kalite: 'QualityControlStatusList',
};

// Bu akışlar kaydı SmartES'te "aktarıldı" işaretlemez ve hiçbir MES kaydını silmez ya da değiştirmez (kullanıcı kararı).
// İstek atılmadan önce metot adı bu kurala bakar; kural bozulursa tur istek atmadan düşer.
export const YASAK_METOT_KALIBI = /(SetIsErp|SetErpOkRed|Delete)$/;
export const yasakMetotMu = (metot: string): boolean => YASAK_METOT_KALIBI.test(metot);

export const KALITE_AMBAR_ALANLARI = {
  // Fire satırında neden kodu yoktur; REJECT_NAME ("fire numarası") neden kodudur, ad ayrıca gelmez.
  red: {
    id: ['ID'],
    isEmriNo: ['WORKORDER_NO'],
    istasyon: ['WORKSTATION_CODE'],
    makine: ['MACHINE_CODE'],
    stok: ['STOCK_NO'],
    adet: ['REJECT_QUANTITY'],
    nedenKodu: ['REJECT_NAME'],
    neden: [],
    zaman: ['LOG_DATETIME'],
  },
  // Ambar hareketinde iş emri no yoktur (belge no DOCUMENT_NUMBER ham satırda kalır); zaman belge tarihidir, yoksa kayıt zamanı.
  ambar: {
    id: ['ID'],
    isEmriNo: [],
    stok: ['STOCK_NO'],
    ambar: ['WAREHOUSE_CODE'],
    tur: ['TYPE'],
    miktar: ['QUANTITY'],
    zaman: ['DATE', 'LOG_DATETIME'],
  },
  kalite: {
    id: ['ID'],
    isEmriNo: ['WORKORDER_NO'],
    stok: ['STOCK_NO'],
    istasyon: ['WORKSTATION_CODE'],
    makine: ['MACHINE_CODE'],
    olcumAdi: ['MEASURE_NAME'],
    olcumDegeri: ['MEASURE_VALUE'],
    sonuc: ['MEASURE_STATUS', 'STATUS'],
    zaman: ['MEASURE_DATETIME', 'END_DATETIME', 'START_DATETIME', 'CREATED_DATETIME'],
  },
} as const;

// Ondalık miktar: virgül ya da nokta ayracı; sonlu sayı değilse "veri yok" (sıfır uydurulmaz).
const ondalik = (s: TabloSatiri, adlar: readonly string[]): number | null => {
  const a = ilkAlan(s, adlar);
  if (a === null) return null;
  const d = metinAlani(s, a)?.replace(',', '.');
  if (d === undefined || !/^-?\d+(\.\d+)?$/.test(d)) return null;
  const n = Number(d);
  return Number.isFinite(n) && Math.abs(n) < 1e15 ? n : null;
};

export interface RedKaydi {
  smartesId: number;
  isEmriNo: string | null;
  istasyonKodu: string | null;
  makineKodu: string | null;
  stokNo: string | null;
  adet: number | null;
  nedenKodu: string | null;
  neden: string | null;
  zaman: Date | null;
  ham: TabloSatiri;
}

export interface AmbarKaydi {
  smartesId: number;
  isEmriNo: string | null;
  stokNo: string | null;
  ambarKodu: string | null;
  hareketTuru: string | null;
  miktar: number | null;
  zaman: Date | null;
  ham: TabloSatiri;
}

export interface KaliteKaydi {
  smartesId: number;
  isEmriNo: string | null;
  stokNo: string | null;
  istasyonKodu: string | null;
  makineKodu: string | null;
  olcumAdi: string | null;
  olcumDegeri: string | null;
  sonuc: string | null;
  zaman: Date | null;
  ham: TabloSatiri;
}

export function redOku(s: TabloSatiri): RedKaydi | null {
  const a = KALITE_AMBAR_ALANLARI.red;
  const id = kimlik(s, a.id);
  if (id === null) return null;
  return {
    smartesId: id, isEmriNo: metin(s, a.isEmriNo), istasyonKodu: metin(s, a.istasyon), makineKodu: metin(s, a.makine), stokNo: metin(s, a.stok),
    adet: adet(s, a.adet), nedenKodu: metin(s, a.nedenKodu), neden: metin(s, a.neden), zaman: tarih(s, a.zaman), ham: s,
  };
}

export function ambarOku(s: TabloSatiri): AmbarKaydi | null {
  const a = KALITE_AMBAR_ALANLARI.ambar;
  const id = kimlik(s, a.id);
  if (id === null) return null;
  return {
    smartesId: id, isEmriNo: metin(s, a.isEmriNo), stokNo: metin(s, a.stok), ambarKodu: metin(s, a.ambar), hareketTuru: metin(s, a.tur),
    miktar: ondalik(s, a.miktar), zaman: tarih(s, a.zaman), ham: s,
  };
}

export function kaliteOku(s: TabloSatiri): KaliteKaydi | null {
  const a = KALITE_AMBAR_ALANLARI.kalite;
  const id = kimlik(s, a.id);
  if (id === null) return null;
  return {
    smartesId: id, isEmriNo: metin(s, a.isEmriNo), stokNo: metin(s, a.stok), istasyonKodu: metin(s, a.istasyon), makineKodu: metin(s, a.makine),
    olcumAdi: metin(s, a.olcumAdi), olcumDegeri: metin(s, a.olcumDegeri), sonuc: metin(s, a.sonuc), zaman: tarih(s, a.zaman), ham: s,
  };
}

// Filtre "All": işaret durumuna güvenilmez, kayıt tekilliği TMI'dedir (SmartES kimliği). Parametre adları metottan metoda değişir (md. 46, 53, 64):
// ambarda StartDate/EndDate, kalitede büyük T'li StartDateTime/EndDateTime. Fire ve kalite filtresinin değerleri belgede sayılmaz; "All"
// WorkorderStatusFilter ile ambar filtresindeki addır (VARSAYIM).
export function kaliteAmbarParametreleri(kaynak: KaliteAmbarKaynagi, p: { bas: Date; son: Date }): Parametreler {
  switch (kaynak) {
    case 'red':
      return [['WorkordersRejectStatusFilter', 'All'], ['StartDatetime', p.bas], ['EndDatetime', p.son]];
    case 'ambar':
      return [['StartDate', p.bas], ['EndDate', p.son], ['WarehouseCodes', ''], ['WarehouseStatusFilter', 'All']];
    case 'kalite':
      return [['StartDateTime', p.bas], ['EndDateTime', p.son], ['QualityControlStatusFilter', 'All']];
  }
}

// --- Tanım gönderimi (SME-21) ----------------------------------------------------
// WorkStationCreateUpdate (md. 74) ve StockCreateUpdate (md. 29, temel varyant) parametre adları belgeden; canlı WSDL'de doğrulanmadı.
// Yalnız SmartES'te karşılığı olmayan kayıt gider; var olan kodun adı SmartES'te ezilmesin diye önce liste okunur.
export const TANIM_TURLERI = ['istasyon', 'stok'] as const;
export type TanimTuru = (typeof TANIM_TURLERI)[number];

export const TANIM_METOTLARI: Readonly<Record<TanimTuru, string>> = { istasyon: 'WorkStationCreateUpdate', stok: 'StockCreateUpdate' };
export const TANIM_LISTE_METOTLARI: Readonly<Record<TanimTuru, string>> = { istasyon: 'WorkStationList', stok: 'StocksList' };
export const TANIM_KOD_ALANLARI: Readonly<Record<TanimTuru, readonly string[]>> = {
  istasyon: ['CODE'],
  stok: ['STOCK_NO'],
};

// Tur başına gönderim üst sınırı: tur tek transaction'dır ve her istek saniyeler sürebilir.
export const TANIM_TUR_SINIRI = 20;
// Tur başına yeni niyet üst sınırı (gönderim sonraki turda gider).
export const TANIM_NIYET_SINIRI = 50;
export const TANIM_KOD_EN_UZUN = 50;

export interface TanimKaydi {
  tur: TanimTuru;
  tmiId: number;
  kod: string;
  ad: string;
}

// Kod eşleme kuralıyla aynı: boşluksuz uç, en çok 50 karakter. Uygun olmayan kod SmartES kodu olamaz, kayıt atlanır.
export const tanimKoduUygunMu = (kod: string): boolean => kod.length >= 1 && kod.length <= TANIM_KOD_EN_UZUN && kod === kod.trim();

export function tanimParametreleri(k: TanimKaydi): Parametreler {
  // ID 0 yeni kayıttır (VARSAYIM: belge "Bkz. ID*" der, tanımı vermez). Günlük kapasite 1 = elle giriş, değer verilmez (0).
  return k.tur === 'istasyon'
    ? [['ID', 0], ['Code', k.kod], ['Name', k.ad.slice(0, 50)], ['DailyCapacityCalculateType', 1], ['DailyCapacityCalculateValue', 0], ['IsPassive', false]]
    : [['StockNo', k.kod], ['StockDescription', k.ad.slice(0, 150)]];
}

// Liste cevabındaki kodlar (büyük/küçük harf duyarsız). Satır var ama hiçbirinde kod alanı yoksa null: alan adı yanlış varsayılmıştır,
// "yok" sayılıp kayıt gönderilmez.
export function listedekiKodlar(tur: TanimTuru, satirlar: readonly TabloSatiri[]): Set<string> | null {
  const kodlar = new Set<string>();
  for (const s of satirlar) {
    const alan = TANIM_KOD_ALANLARI[tur].find((a) => metinAlani(s, a) !== null);
    const d = alan === undefined ? null : metinAlani(s, alan);
    if (d !== null) kodlar.add(d.toLowerCase());
  }
  return satirlar.length > 0 && kodlar.size === 0 ? null : kodlar;
}

export type TanimDurumu = 'niyet' | 'gonderildi' | 'zaten-var' | 'hata' | 'belirsiz';
export interface TanimIzi {
  durum: TanimDurumu;
  ardisikHata: number;
  sonrakiDeneme: Date | null;
}
export type TanimEylemi = 'niyet-yaz' | 'gonder' | 'belirsiz-yap' | 'atla';

// Çift gönderim kalkanı (niyet): istek atılmadan önce niyet ayrı bir turda kalıcı yazılır; niyet yalnız onu yazan süreçte "taze" sayılır
// ve gönderilir. Taze olmayan niyet (süreç yeniden başladı, istek çıkmış olabilir) 'belirsiz' olur ve kendiliğinden yinelenmez.
// Sonucu bilinmeyen istek de (ağ, zaman aşımı, bozuk cevap) 'belirsiz' olur. SmartES'in açıkça reddettiği (hata) bekleme süresiyle yeniden niyet yazar.
export function tanimEylemi(iz: TanimIzi | null, taze: boolean, simdi: Date): TanimEylemi {
  if (iz === null) return 'niyet-yaz';
  switch (iz.durum) {
    case 'gonderildi':
    case 'zaten-var':
    case 'belirsiz':
      return 'atla';
    case 'hata':
      return iz.sonrakiDeneme !== null && iz.sonrakiDeneme > simdi ? 'atla' : 'niyet-yaz';
    case 'niyet':
      return taze ? 'gonder' : 'belirsiz-yap';
  }
}

export const BELIRSIZ_ILETISI = 'Gönderimin sonucu bilinmiyor; SmartES\'te kodu kontrol edin. Kendiliğinden yinelenmez.';

// Sonucu bilinmeyen istek: cevap hiç gelmedi ya da okunamadı. İstek SmartES'e ulaşmış olabilir.
export const sonucBilinmiyorMu = (tur: 'zaman-asimi' | 'ag' | 'http' | 'fault' | 'bozuk', durum?: number): boolean =>
  tur === 'zaman-asimi' || tur === 'ag' || tur === 'bozuk' || (tur === 'http' && (durum ?? 500) >= 500);

// --- Bağlantı hazırlığı ve canlı kontrol (SME-H) -----------------------------

export type AkisKaynagi = 'bagli' | 'baglanmadi' | 'kodda-yok';
export type SmartesAkisDurumu = 'hazir' | 'kapali' | 'ayar-eksik' | 'baglanmadi' | 'kodda-yok';

export const KALITE_AMBAR_AYARI = 'smartes.kalite-ambar-okumasi';
export const TANIM_AYARI = 'smartes.tanim-gonderimi';
export type AkisAyari = typeof KALITE_AMBAR_AYARI | typeof TANIM_AYARI;

export interface SmartesAkisTanimi {
  anahtar: string;
  yon: 'tmi-smartes' | 'smartes-tmi';
  baslik: string;
  aciklama: string;
  kaynak: AkisKaynagi;
  // Akışın kendi anahtarı (varsayılan kapalı); yoksa yalnız ana bağlantı anahtarına bağlıdır.
  ayar?: AkisAyari;
}

export const SMARTES_AKISLARI: readonly SmartesAkisTanimi[] = [
  { anahtar: 'is-emri', yon: 'tmi-smartes', baslik: 'İş emri gönderimi', kaynak: 'bagli',
    aciklama: 'SmartES karşılığı olan istasyonun planlı iş emri gider (WorkOrdersCreateUpdate, OperationCreateUpdate).' },
  { anahtar: 'tanimlar', yon: 'tmi-smartes', baslik: 'İstasyon ve stok tanımları', kaynak: 'bagli', ayar: TANIM_AYARI,
    aciklama: 'Ayrı anahtar: "SmartES tanım gönderimi". SmartES\'te kodu olmayan aktif istasyon ve stok kartı tanım olarak gider '
      + '(WorkStationCreateUpdate, StockCreateUpdate); var olan kod gönderilmez, sonucu bilinmeyen gönderim yinelenmez. Kod eşlemesi kendiliğinden yazılmaz; rota tanımı yok.' },
  { anahtar: 'is-emri-durumu', yon: 'smartes-tmi', baslik: 'Üretim sayıları (sağlam, red)', kaynak: 'bagli',
    aciklama: 'WorkOrdersStatusList beş dakikada bir, tarih aralığıyla okunur. TMI bu işareti koymaz; işareti mevcut program koyar (346 a).' },
  { anahtar: 'durus', yon: 'smartes-tmi', baslik: 'Duruşlar', kaynak: 'bagli',
    aciklama: 'İş emrine bağlı olmadan başlatılan duruşlar (DownTimeStatusListWithoutWorkOrder) on beş dakikada bir okunur.' },
  { anahtar: 'alarm', yon: 'smartes-tmi', baslik: 'Alarmlar', kaynak: 'bagli',
    aciklama: 'Makineler (ActiveMachinesList) okunur, her makinenin alarmları (AlarmsList) on beş dakikada bir okunur.' },
  { anahtar: 'uretim-kaydi', yon: 'smartes-tmi', baslik: 'Üretim kaydına aktarım', kaynak: 'baglanmadi',
    aciklama: 'Okunan sayılar SmartES tablolarında durur; üretim emrine yazılması bağlamada açılır.' },
  { anahtar: 'kalite-ambar', yon: 'smartes-tmi', baslik: 'Kalite, hurda ve ambar hareketi', kaynak: 'bagli', ayar: KALITE_AMBAR_AYARI,
    aciklama: 'Ayrı anahtar: "SmartES kalite, hurda ve ambar okuması". WsWorkordersRejectStatusList, WarehouseStatusList ve QualityControlStatusList on beş dakikada bir okunur '
      + 've yalnız saklanır; stok ya da kalite kaydına işlenmez, SmartES\'te "aktarıldı" işaretlenmez.' },
];

// SME-H1: akış ancak kodu bağlı, TMIV2_SMARTES_ADRESI tanımlı, "SmartES bağlantısı" açık ve (varsa) akışın kendi anahtarı açıkken hazırdır.
export function smartesAkisDurumu(
  t: Pick<SmartesAkisTanimi, 'kaynak'>, d: { ortamVar: boolean; acik: boolean; akisAcik?: boolean },
): SmartesAkisDurumu {
  if (t.kaynak !== 'bagli') return t.kaynak;
  if (!d.ortamVar) return 'ayar-eksik';
  return d.acik && d.akisAcik !== false ? 'hazir' : 'kapali';
}

// Okuma ve gönderim metotları olmadan bağlantı çalışmaz; WSDL'de yoksa adlar yanlış varsayılmıştır (UYUM-BORCU 4).
export const GEREKLI_METOTLAR: readonly string[] = [
  ...Object.values(OKUMA_METOTLARI), MAKINE_LISTESI_METODU, IS_EMRI_METODU, OPERASYON_METODU,
];

export const eksikMetotlar = (wsdldekiler: readonly string[]): string[] => GEREKLI_METOTLAR.filter((m) => !wsdldekiler.includes(m));

// Sonradan eklenen akışların metotları: eksikliği kontrolü kırmızı yapmaz (var olan kurulumlar bozulmasın), yalnız bildirilir.
export const ISTEGE_BAGLI_METOTLAR: readonly string[] = [
  'WsWorkordersRejectStatusList', 'WarehouseStatusList', 'QualityControlStatusList', 'WorkStationList', 'WorkStationCreateUpdate', 'StocksList', 'StockCreateUpdate',
];

export const eksikIstegeBagliMetotlar = (wsdldekiler: readonly string[]): string[] => ISTEGE_BAGLI_METOTLAR.filter((m) => !wsdldekiler.includes(m));

// SME-H2: kontrolün okuma penceresi kısa tutulur (son bir saat): SmartES'e büyük liste yükü bindirilmez.
export const KONTROL_PENCERESI_MS = 3_600_000;
