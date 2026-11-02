import { kayitNoktasi } from '#cekirdek/db.ts';
import type { Db, Veritabani } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type {
  AlarmlarCevabi, DurumCevabi, DuruslarCevabi, EslemeCevabi, EslemelerCevabi, GidenCevabi, IsEmriDurumlariCevabi, SmartesBaglantiDurumu,
  SmartesHazirlikCevabi, SmartesKontrolCevabi,
} from '#paylasilan/sozlesme/smartes.ts';
import type { IkinciMenuSayaclari } from '#paylasilan/sayfa-tanimi.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { durusNedenleriniListele } from '../durus-nedenleri/disari.ts';
import { istasyonlar, makineler, operasyonTipleri } from '../istasyonlar/disari.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import { isEmriOzeti, planlanacakIsEmirleri } from '../uretim-emirleri/disari.ts';
import type { IstemciHatasi, IstemciSonucu, SmartesIstemcisi } from './istemci.ts';
import {
  adetDegistiMi, alarmOku, alarmParametreleri, alarmSatiri, ambarOku, MAKINE_LISTESI_METODU, smartesMakineleri, BELIRSIZ_ILETISI, durusOku, eksikIstegeBagliMetotlar, eksikMetotlar, geriCekilmeMs, KALITE_AMBAR_METOTLARI, KALITE_AMBAR_AYARI,
  kaliteAmbarParametreleri, kaliteOku, KONTROL_PENCERESI_MS, SMARTES_AKISLARI, smartesAkisDurumu, GONDERIM_TUR_SINIRI, gonderimEylemi, gonderimOzeti,
  IS_EMRI_METODU, isEmriDurumuOku, isEmriParametreleri, kapanisParametreleri, kirp,
  listedekiKodlar, OKUMA_METOTLARI, okumaParametreleri, okumaPenceresi, OPERASYON_METODU, pencereAtlanmaliMi, operasyonParametreleri, redOku,
  skalerBasariliMi, smartesIsEmriNo, smartesOperasyonKodu, sonucBilinmiyorMu, TANIM_AYARI, TANIM_LISTE_METOTLARI, TANIM_METOTLARI, TANIM_NIYET_SINIRI,
  TANIM_TUR_SINIRI, TANIM_TURLERI, tanimEylemi, tanimKoduUygunMu, tanimParametreleri, yasakMetotMu,
} from './kurallar.ts';
import type { AkisAyari, EslemeTuru, GidecekIsEmri, KaliteAmbarKaynagi, OkumaKaynagi, TanimKaydi, TanimTuru } from './kurallar.ts';
import { smartesTarihi } from './soap.ts';
import type { Parametreler, TabloSatiri } from './soap.ts';
import * as s from './sorgular.ts';
import { tanimKaynagi } from './tanim-kaynagi.ts';
import type { TanimKaynagi } from './tanim-kaynagi.ts';

// İş "bekliyor" dönerken sağlık ayrıntısında görünen nedenler: sabit metin, değer taşımaz.
export const BEKLEME_NEDENLERI = {
  kapali: 'SmartES bağlantısı Sistem Ayarları\'nda kapalı; istek atılmıyor.',
  'ortam-degiskeni-yok': 'SmartES bağlantısı açık ama TMIV2_SMARTES_ADRESI tanımlı değil; istek atılmıyor.',
  'akis-kapali': 'Bu akışın Sistem Ayarları anahtarı kapalı; istek atılmıyor.',
} as const;

// İstek atılmış ama sonucu yerelde yazılamamış kayıt: yazı ve yazıldıktan sonra süreç belleğinde yapılacak iş.
export interface BekleyenYazi {
  yaz: (db: Db) => Promise<void>;
  sonra?: () => void;
}

type YazanAkis = 'gonderim' | 'tanim';

export interface TurOrtami {
  // null: adres değişkeni yok. Anahtar kapalıysa da hiçbir istek atılmaz, hiçbir şey yazılmaz.
  istemci: SmartesIstemcisi | null;
  saat: () => Date;
  // Süreç belleği: bu süreçte SmartES'te açıldığı bilinen istasyon + operasyon çiftleri (her iş emrinde yeniden açılmasın).
  operasyonlar: Set<string>;
  // Süreç belleği: kaynak başına ardışık okuma hatası ve son atlanan pencerenin sonu (KD-044). Yeniden başlayan süreç tam
  // pencereyle başlar ve hata sürerse yine küçültür; kalıcı tutulması gerekmez.
  okumalar: Map<string, OkumaBellegi>;
  // Süreç belleği: yazan akış başına, isteği atılmış ama sonucu yazılamamış kayıtlar (`sonucYaz`). Yeniden başlayan süreçte
  // boştur; o durumda kayıt yerelde sonuçsuz kalır ve sonraki tur önceki gibi davranır (işaret ve iş emri yeniden gider, tanım belirsiz olur).
  bekleyenler: Map<YazanAkis, BekleyenYazi[]>;
  // Tanım gönderimi (isteğe bağlı: verilmezse hiçbir tanım gitmez). Kaynak testte değiştirilir; niyetler bu süreçte niyeti yazılmış kayıtlardır.
  tanimKaynagi?: TanimKaynagi;
  niyetler?: Set<string>;
}

export interface OkumaBellegi { ardisikHata: number; atlananSon: Date | null }

export const yeniSurecBellegi = (): Set<string> => new Set();
export const yeniOkumaBellegi = (): Map<string, OkumaBellegi> => new Map();
export const yeniBekleyenBellegi = (): Map<YazanAkis, BekleyenYazi[]> => new Map();

type Engel = { tur: 'kapali' } | { tur: 'ortam-degiskeni-yok' } | { tur: 'akis-kapali' };

// Ana anahtar kapalıysa ya da adres yoksa hiçbir akış istek atmaz; akışın kendi anahtarı varsa o da açık olmalıdır (varsayılan kapalı).
async function engel(db: Db, istemci: SmartesIstemcisi | null, akisAyari?: AkisAyari): Promise<Engel | null> {
  if (!(await sistemAyariOku(db, 'smartes.baglanti'))) return { tur: 'kapali' };
  if (istemci === null) return { tur: 'ortam-degiskeni-yok' };
  if (akisAyari !== undefined && !(await sistemAyariOku(db, akisAyari))) return { tur: 'akis-kapali' };
  return null;
}

const hataMetni = (h: IstemciHatasi): string => kirp(h.tur === 'fault' ? `SmartES hatası: ${h.ileti}` : h.ileti);

/* ---------------- transaction düzeni ---------------- */

// SmartES isteği hiçbir transaction açıkken beklenmez: tur okur ya da niyet yazar (kısa transaction), isteği atar, sonucu ayrı kısa
// transaction'da yazar. Geri alınan bir tur SmartES'teki yazıyı geri alamaz; sonuç yazılamazsa uzak taraf ile yerel kayıt ayrışmasın
// ve istek yinelenmesin diye sonuç süreç belleğinde bekler, akışın sonraki turunda hiçbir istekten önce yazılır.

function kuyruk(o: TurOrtami, akis: YazanAkis): BekleyenYazi[] {
  let k = o.bekleyenler.get(akis);
  if (k === undefined) {
    k = [];
    o.bekleyenler.set(akis, k);
  }
  return k;
}

function kuyruktanDus(k: BekleyenYazi[], y: BekleyenYazi): void {
  const i = k.indexOf(y);
  if (i >= 0) k.splice(i, 1);
  y.sonra?.();
}

// Yazan turun ilk transaction'ı: önce bekleyen sonuçlar, sonra turun okuması. Bekleyenler yalnız commit'ten sonra kuyruktan düşer.
async function turBasi<T>(vt: Veritabani, o: TurOrtami, akis: YazanAkis, is: (db: Db) => Promise<T>): Promise<T> {
  const k = kuyruk(o, akis);
  const yazilacaklar = [...k];
  const r = await vt.tx(async (db) => {
    for (const y of yazilacaklar) await y.yaz(db);
    return is(db);
  });
  for (const y of yazilacaklar) kuyruktanDus(k, y);
  return r;
}

// İsteğin sonucu: transaction düşerse hata turu durdurur, sonuç kuyrukta kalır.
async function sonucYaz(vt: Veritabani, o: TurOrtami, akis: YazanAkis, y: BekleyenYazi): Promise<void> {
  const k = kuyruk(o, akis);
  k.push(y);
  await vt.tx(y.yaz);
  kuyruktanDus(k, y);
}

/* ---------------- okuma (SME-11, SME-12) ---------------- */

export type OkumaSonucu = Engel
  | { tur: 'okundu'; okunan: number; kimliksiz: number }
  | { tur: 'hata'; ileti: string }
  | { tur: 'atlandi'; ileti: string };

// Bir tur: kaynağın kaldığı yerden tek pencere okunur, her satır SmartES kimliğiyle yazılır, pencere ilerler.
// Okuma hatasında pencere ilerlemez, hiçbir satır yazılmaz ve sonraki pencere küçülür; asgari pencerede süren bozuk cevap
// pencereyi atlatır (KD-044, kurallar.ts `okumaPenceresi`, `pencereAtlanmaliMi`).
export async function okumaTuru(vt: Veritabani, kaynak: OkumaKaynagi, o: TurOrtami): Promise<OkumaSonucu> {
  const bas = await vt.tx(async (db) => (await engel(db, o.istemci)) ?? { tur: 'hazir' as const, sonBitis: (await s.okuma(db, kaynak))?.sonBitis ?? null });
  if (bas.tur !== 'hazir') return bas;
  if (o.istemci === null) return { tur: 'ortam-degiskeni-yok' };
  const istemci = o.istemci;
  return pencereliOkuma(vt, o, istemci, bas.sonBitis, {
    anahtar: kaynak,
    oku: (p) => (kaynak === 'alarm' ? alarmlariOku(istemci, p) : istemci.liste(OKUMA_METOTLARI[kaynak], okumaParametreleri(kaynak, p))),
    basarili: (db, sonBitis, zaman, okunan, kimliksiz) => s.okumaBasarili(db, kaynak, sonBitis, zaman, okunan, kimliksiz),
    hatali: (db, zaman, ileti) => s.okumaHatali(db, kaynak, zaman, ileti),
    atlandi: (db, sonBitis, zaman, ileti) => s.okumaAtlandi(db, kaynak, sonBitis, zaman, ileti),
    yaz: (db, satir, zaman) => satirYaz(db, kaynak, satir, zaman),
  });
}

// AlarmsList makine başına çağrılır (MachineID zorunlu): makineler her pencerede yeniden okunur, satırlara makine alanları eklenir.
// Bir makinenin okuması düşerse pencerenin tamamı hatadır: pencere ilerlemez, öteki makinelerin satırları da yazılmaz, sonraki tur yeniden okur.
async function alarmlariOku(istemci: SmartesIstemcisi, p: { bas: Date; son: Date }): Promise<IstemciSonucu<TabloSatiri[]>> {
  const makineler = await istemci.liste(MAKINE_LISTESI_METODU, []);
  if (makineler.tur !== 'basarili') return makineler;
  const satirlar: TabloSatiri[] = [];
  for (const m of smartesMakineleri(makineler.deger)) {
    const r = await istemci.liste(OKUMA_METOTLARI.alarm, alarmParametreleri(m.id, p));
    if (r.tur !== 'basarili') return r;
    for (const satir of r.deger) satirlar.push(alarmSatiri(satir, m));
  }
  return { tur: 'basarili', deger: satirlar };
}

interface OkumaIslemleri {
  // Bellekteki hata sayacının anahtarı; kaynaklar arasında tekildir.
  anahtar: string;
  oku: (p: { bas: Date; son: Date }) => Promise<IstemciSonucu<TabloSatiri[]>>;
  basarili: (db: Db, sonBitis: Date, zaman: Date, okunan: number, kimliksiz: number) => Promise<void>;
  hatali: (db: Db, zaman: Date, ileti: string) => Promise<void>;
  atlandi: (db: Db, sonBitis: Date, zaman: Date, ileti: string) => Promise<void>;
  // Satırı yazar; kimliği olmadığı için yazılamayan satırda false.
  yaz: (db: Db, satir: TabloSatiri, zaman: Date) => Promise<boolean>;
}

type PencereSonucu = Exclude<OkumaSonucu, Engel>;

// Okuma SmartES'e yazmaz: sonuç transaction'ı düşerse pencere ilerlemez, satırlar yazılmaz ve sonraki tur aynı pencereyi yeniden okur.
async function pencereliOkuma(vt: Veritabani, o: TurOrtami, istemci: SmartesIstemcisi, sonBitis: Date | null, k: OkumaIslemleri): Promise<PencereSonucu> {
  const bellek = o.okumalar.get(k.anahtar) ?? { ardisikHata: 0, atlananSon: null };
  const pencere = okumaPenceresi(sonBitis, o.saat(), bellek.ardisikHata, bellek.atlananSon);
  const r = await k.oku(pencere);
  const zaman = o.saat();
  if (r.tur !== 'basarili') {
    const ileti = hataMetni(r);
    if (pencereAtlanmaliMi(r.tur === 'bozuk', bellek.ardisikHata + 1)) {
      const metin = kirp(`Okunamayan pencere atlandı (${smartesTarihi(pencere.bas)} - ${smartesTarihi(pencere.son)}): ${ileti}`);
      await vt.tx((db) => k.atlandi(db, pencere.son, zaman, metin));
      o.okumalar.set(k.anahtar, { ardisikHata: 0, atlananSon: pencere.son });
      return { tur: 'atlandi', ileti: metin };
    }
    await vt.tx((db) => k.hatali(db, zaman, ileti));
    o.okumalar.set(k.anahtar, { ardisikHata: bellek.ardisikHata + 1, atlananSon: bellek.atlananSon });
    return { tur: 'hata', ileti };
  }
  // Yazılamayan satır (kimliksiz ya da veri biçimi reddi) sayılır; tur düşmez, öteki satırlar ve pencere ilerler.
  const kimliksiz = await vt.tx(async (db) => {
    let n = 0;
    for (const satir of r.deger) {
      if (!(await satirYazKorumali(db, () => k.yaz(db, satir, zaman)))) n++;
    }
    await k.basarili(db, pencere.son, zaman, r.deger.length, n);
    return n;
  });
  o.okumalar.set(k.anahtar, { ardisikHata: 0, atlananSon: bellek.atlananSon });
  return { tur: 'okundu', okunan: r.deger.length, kimliksiz };
}

// Kısıt ihlali ve veri biçimi hatası (SQLSTATE 22) yalnız o satırı geri alır. Başka hata (süre, kilitlenme, bağlantı)
// fırlar: sonuç transaction'ı bütünüyle geri alınır, pencere yeniden okunur, satır kaybolmaz.
const veriBicimiHatasi = (h: unknown): boolean => {
  const kod = h instanceof Error ? (h as Error & { code?: unknown }).code : undefined;
  return typeof kod === 'string' && kod.startsWith('22');
};

async function satirYazKorumali(db: Db, yaz: () => Promise<boolean>): Promise<boolean> {
  try {
    const r = await kayitNoktasi(db, yaz);
    return r.tamam && r.deger;
  } catch (hata) {
    if (veriBicimiHatasi(hata)) return false;
    throw hata;
  }
}

async function satirYaz(db: Db, kaynak: OkumaKaynagi, satir: Readonly<Record<string, string>>, zaman: Date): Promise<boolean> {
  if (kaynak === 'is-emri-durumu') {
    const k = isEmriDurumuOku(satir);
    if (k) await s.isEmriDurumuYaz(db, k, zaman);
    return k !== null;
  }
  if (kaynak === 'durus') {
    const k = durusOku(satir);
    if (k) await s.durusYaz(db, k, zaman);
    return k !== null;
  }
  const k = alarmOku(satir);
  if (k) await s.alarmYaz(db, k, zaman);
  return k !== null;
}

/* ---------------- kalite, hurda, ambar okuması (SME-20) ---------------- */

export type KaliteAmbarSonucu = OkumaSonucu;

// Yalnız okur ve saklar: kayıt SmartES kimliğiyle tekildir, SmartES'te hiçbir işaret konmaz, hiçbir kayıt silinmez ya da değiştirilmez
// (Reject/Warehouse/QualityControl ...SetIsErp metotları çağrılmaz). Okunan veri stok ya da kalite modülüne işlenmez.
export async function kaliteAmbarTuru(vt: Veritabani, kaynak: KaliteAmbarKaynagi, o: TurOrtami): Promise<KaliteAmbarSonucu> {
  const bas = await vt.tx(async (db) =>
    (await engel(db, o.istemci, KALITE_AMBAR_AYARI)) ?? { tur: 'hazir' as const, sonBitis: (await s.akisIzi(db, kaynak))?.sonBitis ?? null });
  if (bas.tur !== 'hazir') return bas;
  if (o.istemci === null) return { tur: 'ortam-degiskeni-yok' };
  const istemci = o.istemci;
  const metot = KALITE_AMBAR_METOTLARI[kaynak];
  if (yasakMetotMu(metot)) throw new Error('Bu akış işaretleme ya da silme metodu çağıramaz.');
  const yaz = async (db: Db, satir: TabloSatiri, zaman: Date): Promise<boolean> => {
    if (kaynak === 'red') {
      const k = redOku(satir);
      if (k) await s.redYaz(db, k, zaman);
      return k !== null;
    }
    if (kaynak === 'ambar') {
      const k = ambarOku(satir);
      if (k) await s.ambarYaz(db, k, zaman);
      return k !== null;
    }
    const k = kaliteOku(satir);
    if (k) await s.kaliteYaz(db, k, zaman);
    return k !== null;
  };
  return pencereliOkuma(vt, o, istemci, bas.sonBitis, {
    anahtar: kaynak,
    oku: (p) => istemci.liste(metot, kaliteAmbarParametreleri(kaynak, p)),
    basarili: (db, sonBitis, zaman, okunan, kimliksiz) => s.akisBasarili(db, kaynak, sonBitis, zaman, okunan, kimliksiz),
    hatali: (db, zaman, ileti) => s.akisHatali(db, kaynak, zaman, ileti),
    atlandi: (db, sonBitis, zaman, ileti) => s.akisAtlandi(db, kaynak, sonBitis, zaman, ileti),
    yaz,
  });
}

/* ---------------- iş emri gönderimi (SME-14, SME-15) ---------------- */

export type GonderimSonucu = Engel | { tur: 'islendi'; gonderilen: number; kapanan: number; hatali: number };

async function eslemeHaritasi(db: Db, tur: EslemeTuru): Promise<Map<number, string>> {
  return new Map((await s.eslemeler(db, tur)).map((e) => [e.tmiId, e.smartesKod]));
}

// Gönderim listesi: planlı ve başlamış iş emirlerinden SmartES karşılığı olan istasyondakiler. Karşılığı olmayan istasyon
// SmartES'e bağlı sayılmaz; iş emri sessizce atlanır. Makine karşılığı yoksa makine boş gider (operatör seçer, brief tuzak 13).
async function gidecekIsEmirleri(db: Db, bugun: string): Promise<GidecekIsEmri[]> {
  const istasyonKodlari = await eslemeHaritasi(db, 'istasyon');
  if (istasyonKodlari.size === 0) return [];
  const makineKodlari = await eslemeHaritasi(db, 'makine');
  const isler = await planlanacakIsEmirleri(db);
  const malzemeler = await malzemeOzetleri(db, isler.map((i) => i.malzemeNo));
  const sonuc: GidecekIsEmri[] = [];
  for (const i of isler) {
    if (i.durum !== 'planli' && i.durum !== 'basladi') continue;
    // İş emrinin istasyonu planlanacak listede yok; özetten okunur (BASKA-MODUL-ISTEKLERI madde 2).
    const ozet = await isEmriOzeti(db, i.id);
    const istasyonKodu = ozet?.istasyonId == null ? undefined : istasyonKodlari.get(ozet.istasyonId);
    const malzeme = malzemeler.get(i.malzemeNo);
    if (istasyonKodu === undefined || malzeme === undefined) continue;
    sonuc.push({
      isEmriId: i.id, emirNo: i.emirNo, opNo: i.opNo, ad: i.ad, durum: i.durum, adet: i.adimAdedi ?? i.adet, oncelik: i.oncelik,
      teslim: i.teslim, baslangic: i.baslangic ?? bugun, ayarSuresiDk: i.ayarSuresiDk, birimSureDk: i.birimSureDk, istasyonKodu,
      makineKodu: i.kaynak?.tur === 'makine' ? (makineKodlari.get(i.kaynak.id) ?? null) : null, stokNo: malzeme.kod, stokAdi: malzeme.ad,
    });
  }
  return sonuc;
}

async function operasyonuHazirla(o: TurOrtami, istemci: SmartesIstemcisi, i: GidecekIsEmri): Promise<IstemciHatasi | null> {
  const anahtar = `${i.istasyonKodu}\u0000${smartesOperasyonKodu(i.opNo)}`;
  if (o.operasyonlar.has(anahtar)) return null;
  // İstasyon + operasyon çifti SmartES'te önceden tanımlı olmalı (brief tuzak 3); var olanda dönen ret yutulur.
  const r = await istemci.skaler(OPERASYON_METODU, operasyonParametreleri(i), { yinele: true });
  if (r.tur === 'ag' || r.tur === 'zaman-asimi') return r;
  if (r.tur === 'basarili' && skalerBasariliMi(r.deger)) o.operasyonlar.add(anahtar);
  return null;
}

// Bir tur: değişmiş ya da hiç gönderilmemiş iş emirleri gönderilir, listeden çıkanlar kapatılır. Turda en çok GONDERIM_TUR_SINIRI
// istek; ağ hatası turu durdurur.
export async function gonderimTuru(vt: Veritabani, o: TurOrtami): Promise<GonderimSonucu> {
  const bas = await turBasi(vt, o, 'gonderim', async (db) => {
    const e = await engel(db, o.istemci);
    if (e !== null) return e;
    const bugun = smartesTarihi(o.saat()).slice(0, 10);
    const liste = await gidecekIsEmirleri(db, bugun);
    const gidenler = new Map((await s.gidenSatirlari(db, liste.map((i) => i.isEmriId))).map((g) => [g.isEmriId, g]));
    return { tur: 'hazir' as const, bugun, liste, gidenler };
  });
  if (bas.tur !== 'hazir') return bas;
  const istemci = o.istemci;
  if (istemci === null) return { tur: 'ortam-degiskeni-yok' };
  const { bugun, liste, gidenler } = bas;
  let gonderilen = 0;
  let kapanan = 0;
  let hatali = 0;
  let kalan = GONDERIM_TUR_SINIRI;

  const gonder = async (isEmriId: number, no: string, p: Parametreler, basari: { tur: 'gonderildi'; ozet: string } | { tur: 'kapandi' }, ardisik: number): Promise<boolean> => {
    kalan--;
    const r = await istemci.skaler(IS_EMRI_METODU, p, { yinele: true });
    const zaman = o.saat();
    if (r.tur === 'basarili' && skalerBasariliMi(r.deger)) {
      await sonucYaz(vt, o, 'gonderim', { yaz: (db) => s.gidenDenemesiYaz(db, { isEmriId, smartesIsEmriNo: no, zaman, sonuc: basari }) });
      if (basari.tur === 'gonderildi') gonderilen++;
      else kapanan++;
      return true;
    }
    const hata = r.tur === 'basarili' ? kirp(`SmartES reddetti: ${r.deger.hata ?? ''}`) : hataMetni(r);
    const sonraki = new Date(zaman.getTime() + geriCekilmeMs(ardisik + 1));
    await sonucYaz(vt, o, 'gonderim', { yaz: (db) => s.gidenDenemesiYaz(db, { isEmriId, smartesIsEmriNo: no, zaman, sonuc: { tur: 'hata', hata, sonraki } }) });
    hatali++;
    return r.tur !== 'ag' && r.tur !== 'zaman-asimi';
  };

  for (const i of liste) {
    if (kalan <= 0) break;
    const g = gidenler.get(i.isEmriId) ?? null;
    const p = isEmriParametreleri(i, 'yok', bugun, adetDegistiMi(g?.ozet ?? null, i.adet));
    const ozet = gonderimOzeti(p);
    if (gonderimEylemi(g, ozet, o.saat()) !== 'gonder') continue;
    const opHata = await operasyonuHazirla(o, istemci, i);
    const no = smartesIsEmriNo(i.emirNo, i.opNo);
    if (opHata) {
      const zaman = o.saat();
      const sonuc = { tur: 'hata' as const, hata: hataMetni(opHata), sonraki: new Date(zaman.getTime() + geriCekilmeMs((g?.ardisikHata ?? 0) + 1)) };
      await sonucYaz(vt, o, 'gonderim', { yaz: (db) => s.gidenDenemesiYaz(db, { isEmriId: i.isEmriId, smartesIsEmriNo: no, zaman, sonuc }) });
      hatali++;
      return { tur: 'islendi', gonderilen, kapanan, hatali };
    }
    if (!(await gonder(i.isEmriId, no, p, { tur: 'gonderildi', ozet }, g?.ardisikHata ?? 0))) return { tur: 'islendi', gonderilen, kapanan, hatali };
  }

  if (kalan > 0) {
    const sinir = kalan;
    const kapanislar = await vt.tx(async (db) => {
      const sonuc: { g: s.GidenSatiri; p: Parametreler }[] = [];
      for (const g of await s.kapanacaklar(db, liste.map((i) => i.isEmriId), o.saat(), sinir)) {
        const durum = (await isEmriOzeti(db, g.isEmriId))?.durum;
        const p = g.ozet === null ? null : kapanisParametreleri(g.ozet, durum === 'tamam' ? 'bitti' : 'pasif');
        if (p !== null) sonuc.push({ g, p });
      }
      return sonuc;
    });
    for (const { g, p } of kapanislar) {
      if (!(await gonder(g.isEmriId, g.smartesIsEmriNo, p, { tur: 'kapandi' }, g.ardisikHata))) break;
    }
  }
  return { tur: 'islendi', gonderilen, kapanan, hatali };
}

/* ---------------- tanım gönderimi (SME-21) ---------------- */

export type TanimSonucuTur =
  | Engel
  | { tur: 'islendi'; niyet: number; gonderilen: number; zatenVar: number; belirsiz: number; hatali: number; turHatasi: string | null };

interface TanimAdayi {
  kayit: TanimKaydi;
  eylem: 'niyet-yaz' | 'gonder' | 'belirsiz-yap';
}

const tanimAnahtari = (k: Pick<TanimKaydi, 'tur' | 'tmiId'>): string => `${k.tur}:${k.tmiId}`;

// Gönderilecek TMI kayıtları. İstasyonda SmartES kod eşlemesi olan kayıt gitmez (karşılığı vardır); stok kartının eşleme türü yoktur,
// SmartES'te var olup olmadığı gönderimden hemen önce SmartES listesinden anlaşılır. Gönderilmiş, var olan ve belirsiz kayıt atlanır.
async function tanimAdaylari(db: Db, tur: TanimTuru, o: TurOrtami, kaynak: TanimKaynagi, niyetler: ReadonlySet<string>): Promise<TanimAdayi[]> {
  const izler = new Map((await s.tanimIzleri(db, tur)).map((i) => [i.tmiId, i]));
  const simdi = o.saat();
  const adaylar: TanimAdayi[] = [];
  const degerlendir = (k: TanimKaydi): void => {
    if (!tanimKoduUygunMu(k.kod)) return;
    const eylem = tanimEylemi(izler.get(k.tmiId) ?? null, niyetler.has(tanimAnahtari(k)), simdi);
    if (eylem !== 'atla') adaylar.push({ kayit: k, eylem });
  };
  if (tur === 'istasyon') {
    const eslenenler = new Set((await s.eslemeler(db, 'istasyon')).map((e) => e.tmiId));
    for (const k of await kaynak.istasyonlar(db)) if (!eslenenler.has(k.tmiId)) degerlendir(k);
    return adaylar;
  }
  // Sayfa üst sınırı: sonSayfa bildirmeyen bir kaynak turu sonsuza kadar tutmasın.
  for (let sayfa = 1; sayfa <= 1000; sayfa++) {
    const r = await kaynak.stoklar(db, sayfa);
    for (const k of r.kayitlar) degerlendir(k);
    if (r.sonSayfa || adaylar.length >= TANIM_NIYET_SINIRI + TANIM_TUR_SINIRI) break;
  }
  return adaylar;
}

// Bir tur: yeni kayıt için önce niyet yazılır (istek yok); niyeti önceki turda bu süreçte yazılmış kayıt, SmartES listesinde yoksa gönderilir.
// Niyeti başka süreçten kalmış ya da sonucu bilinmeyen kayıt 'belirsiz' olur ve kendiliğinden yinelenmez. Liste okunamazsa hiçbir şey gitmez.
// Hiçbir silme, işaretleme ya da güncelleme metodu çağrılmaz; yalnız SmartES'te kodu olmayan kayda tanım gider.
export async function tanimTuru(vt: Veritabani, o: TurOrtami): Promise<TanimSonucuTur> {
  const e = await turBasi(vt, o, 'tanim', (db) => engel(db, o.istemci, TANIM_AYARI));
  if (e !== null) return e;
  const istemci = o.istemci;
  if (istemci === null) return { tur: 'ortam-degiskeni-yok' };
  const kaynak = o.tanimKaynagi ?? tanimKaynagi;
  const niyetler = o.niyetler ?? new Set<string>();
  const sonuc = { niyet: 0, gonderilen: 0, zatenVar: 0, belirsiz: 0, hatali: 0 };
  let turHatasi: string | null = null;
  let kalan = TANIM_TUR_SINIRI;
  let niyetKalan = TANIM_NIYET_SINIRI;
  let durdur = false;

  for (const tur of TANIM_TURLERI) {
    if (durdur) break;
    const metot = TANIM_METOTLARI[tur];
    if (yasakMetotMu(metot) || yasakMetotMu(TANIM_LISTE_METOTLARI[tur])) throw new Error('Bu akış işaretleme ya da silme metodu çağıramaz.');
    // Niyet ve belirsiz yazıları istek atmaz; süreç belleği ve sayaçlar commit'ten sonra güncellenir.
    const hazirlik = await vt.tx(async (db) => {
      const adaylar = await tanimAdaylari(db, tur, o, kaynak, niyetler);
      const gonderilecekler: TanimKaydi[] = [];
      const eklenen: string[] = [];
      const cikan: string[] = [];
      for (const a of adaylar) {
        if (a.eylem === 'belirsiz-yap') {
          await s.tanimSonucuYaz(db, tur, a.kayit.tmiId, o.saat(), { tur: 'belirsiz', hata: BELIRSIZ_ILETISI }, false);
          cikan.push(tanimAnahtari(a.kayit));
        } else if (a.eylem === 'niyet-yaz') {
          if (eklenen.length >= niyetKalan) continue;
          if (await s.tanimNiyetiYaz(db, a.kayit, o.saat())) eklenen.push(tanimAnahtari(a.kayit));
        } else {
          gonderilecekler.push(a.kayit);
        }
      }
      return { gonderilecekler, eklenen, cikan };
    });
    for (const a of hazirlik.cikan) niyetler.delete(a);
    for (const a of hazirlik.eklenen) niyetler.add(a);
    sonuc.belirsiz += hazirlik.cikan.length;
    sonuc.niyet += hazirlik.eklenen.length;
    niyetKalan -= hazirlik.eklenen.length;
    const { gonderilecekler } = hazirlik;
    if (gonderilecekler.length === 0) continue;

    // SmartES'te kodu olan kaydın adı ezilmesin: gönderimden önce liste (yalnız okuma) bir kez okunur.
    const liste = await istemci.liste(TANIM_LISTE_METOTLARI[tur], []);
    const kodlar = liste.tur === 'basarili' ? listedekiKodlar(tur, liste.deger) : null;
    if (liste.tur !== 'basarili' || kodlar === null) {
      turHatasi = liste.tur !== 'basarili'
        ? hataMetni(liste)
        : kirp(`${TANIM_LISTE_METOTLARI[tur]} cevabında kod alanı bulunamadı; alan adı doğrulanana kadar tanım gönderilmez.`);
      continue;
    }
    for (const k of gonderilecekler) {
      const zaman = o.saat();
      const niyettenCik = (): void => { niyetler.delete(tanimAnahtari(k)); };
      if (kodlar.has(k.kod.toLowerCase())) {
        await vt.tx((db) => s.tanimSonucuYaz(db, tur, k.tmiId, zaman, { tur: 'zaten-var' }, false));
        niyettenCik();
        sonuc.zatenVar++;
        continue;
      }
      if (kalan <= 0) break;
      kalan--;
      const r = await istemci.skaler(TANIM_METOTLARI[tur], tanimParametreleri(k), { yinele: false });
      const sonra = o.saat();
      if (r.tur === 'basarili' && skalerBasariliMi(r.deger)) {
        await sonucYaz(vt, o, 'tanim', { yaz: (db) => s.tanimSonucuYaz(db, tur, k.tmiId, sonra, { tur: 'gonderildi' }, true), sonra: niyettenCik });
        sonuc.gonderilen++;
        continue;
      }
      if (r.tur !== 'basarili' && sonucBilinmiyorMu(r.tur, r.tur === 'http' ? r.durum : undefined)) {
        const hata = kirp(`${BELIRSIZ_ILETISI} (${hataMetni(r)})`);
        await sonucYaz(vt, o, 'tanim', { yaz: (db) => s.tanimSonucuYaz(db, tur, k.tmiId, sonra, { tur: 'belirsiz', hata }, true), sonra: niyettenCik });
        sonuc.belirsiz++;
        turHatasi = hataMetni(r);
        durdur = true;
        break;
      }
      const hata = r.tur === 'basarili' ? kirp(`SmartES reddetti: ${r.deger.hata ?? ''}`) : hataMetni(r);
      await sonucYaz(vt, o, 'tanim', {
        yaz: async (db) => {
          const ardisik = (await s.tanimIzleri(db, tur)).find((i) => i.tmiId === k.tmiId)?.ardisikHata ?? 0;
          await s.tanimSonucuYaz(db, tur, k.tmiId, sonra, { tur: 'hata', hata, sonraki: new Date(sonra.getTime() + geriCekilmeMs(ardisik + 1)) }, true);
        },
        sonra: niyettenCik,
      });
      sonuc.hatali++;
    }
  }
  const zaman = o.saat();
  const sonHata = turHatasi;
  if (sonHata === null) await vt.tx((db) => s.akisBasarili(db, 'tanim', null, zaman, null, null));
  else await vt.tx((db) => s.akisHatali(db, 'tanim', zaman, sonHata));
  return { tur: 'islendi', ...sonuc, turHatasi };
}

/* ---------------- ekran ---------------- */

export function baglantiDurumu(acik: boolean, istemci: SmartesIstemcisi | null): SmartesBaglantiDurumu {
  if (!acik) return 'kapali';
  return istemci === null ? 'ortam-degiskeni-yok' : 'acik';
}

export async function durum(db: Db, istemci: SmartesIstemcisi | null): Promise<DurumCevabi> {
  return {
    baglanti: baglantiDurumu(await sistemAyariOku(db, 'smartes.baglanti'), istemci),
    okumalar: await s.okumalar(db),
    sayilar: await s.sayilar(db),
  };
}

export async function menuSayaclari(db: Db): Promise<IkinciMenuSayaclari> {
  const n = await s.sayilar(db);
  return { 'is-emri-durumlari': n.isEmriDurumu, duruslar: n.durus, alarmlar: n.alarm, giden: n.gidenHatali };
}

interface TmiKaydi {
  id: number;
  kod: string;
  ad: string;
  aktif: boolean;
}

// Eşlenecek TMI kayıtları sahibi modülden okunur (ADR 0006); kopyası tutulmaz.
async function tmiKayitlari(db: Db, tur: EslemeTuru): Promise<TmiKaydi[]> {
  switch (tur) {
    case 'istasyon': return istasyonlar(db, { pasiflerDahil: true });
    case 'makine': return makineler(db, { pasiflerDahil: true });
    case 'operasyon-tipi': return operasyonTipleri(db, { pasiflerDahil: true });
    case 'durus-nedeni': return durusNedenleriniListele(db, { yalnizAktif: false });
  }
}

export async function eslemeleriGetir(db: Db, tur: EslemeTuru): Promise<EslemelerCevabi> {
  const kayitlar = await tmiKayitlari(db, tur);
  const eslemeler = new Map((await s.eslemeler(db, tur)).map((e) => [e.tmiId, e]));
  return {
    tur,
    satirlar: kayitlar.map((k) => ({
      tmiId: k.id, tmiKod: k.kod, tmiAd: k.ad, aktif: k.aktif, smartesKod: eslemeler.get(k.id)?.smartesKod ?? null, surum: eslemeler.get(k.id)?.surum ?? null,
    })),
  };
}

const KOD_TEKIL = { smartes_esleme_kod_tekil: { ileti: 'Bu SmartES kodu bu türde başka bir kayda verilmiş.', alan: 'smartesKod' } };

export async function eslemeAta(
  db: Db, kisiId: number, g: { tur: EslemeTuru; tmiId: number; smartesKod: string; surum: number | null },
): Promise<EslemeCevabi> {
  if (!(await tmiKayitlari(db, g.tur)).some((k) => k.id === g.tmiId)) throw bulunamadi('Eşlenecek TMI kaydı bulunamadı.');
  const surum = await kisitKorumali(KOD_TEKIL, () => {
    if (g.surum === null) {
      return eslemeEkleVeyaCakis(db, g.tur, g.tmiId, g.smartesKod, kisiId);
    }
    const beklenen = g.surum;
    return surumluGuncelle({
      guncelle: () => s.eslemeGuncelle(db, g.tur, g.tmiId, g.smartesKod, kisiId, beklenen),
      varMi: async () => (await s.eslemeKilitle(db, g.tur, g.tmiId)) !== null,
      bulunamadiIletisi: 'Eşleme bulunamadı; sayfayı yenileyin.',
    });
  });
  return { tmiId: g.tmiId, smartesKod: g.smartesKod, surum };
}

// Yeni eşleme sürümsüz gelir; o arada başkası eklemişse üstüne yazılmaz (409).
async function eslemeEkleVeyaCakis(db: Db, tur: EslemeTuru, tmiId: number, kod: string, kisiId: number): Promise<number> {
  const surum = await s.eslemeEkle(db, tur, tmiId, kod, kisiId);
  if (surum > 0) return surum;
  return surumluGuncelle<number>({ guncelle: async () => null, varMi: async () => true });
}

export async function eslemeKaldir(db: Db, g: { tur: EslemeTuru; tmiId: number; surum: number }): Promise<EslemeCevabi> {
  await surumluGuncelle({
    guncelle: async () => ((await s.eslemeSil(db, g.tur, g.tmiId, g.surum)) ? true : null),
    varMi: async () => (await s.eslemeKilitle(db, g.tur, g.tmiId)) !== null,
    bulunamadiIletisi: 'Eşleme bulunamadı; sayfayı yenileyin.',
  });
  return { tmiId: g.tmiId, smartesKod: null, surum: null };
}

type Sayfa = { sayfa: number; sayfaBoyu?: number | undefined };
type Satir<C extends { satirlar: unknown[] }> = C['satirlar'][number];

export const isEmriDurumlari = (db: Db, q: Sayfa): Promise<IsEmriDurumlariCevabi> =>
  sayfaliListe(q, { say: () => s.isEmriDurumuSay(db), satirlar: (d) => s.isEmriDurumuSatirlari<Satir<IsEmriDurumlariCevabi>>(db, d) });
export const duruslar = (db: Db, q: Sayfa): Promise<DuruslarCevabi> =>
  sayfaliListe(q, { say: () => s.durusSay(db), satirlar: (d) => s.durusSatirlari<Satir<DuruslarCevabi>>(db, d) });
export const alarmlar = (db: Db, q: Sayfa): Promise<AlarmlarCevabi> =>
  sayfaliListe(q, { say: () => s.alarmSay(db), satirlar: (d) => s.alarmSatirlari<Satir<AlarmlarCevabi>>(db, d) });
export const giden = (db: Db, q: Sayfa): Promise<GidenCevabi> =>
  sayfaliListe(q, { say: () => s.gidenSay(db), satirlar: (d) => s.gidenListeSatirlari<Satir<GidenCevabi>>(db, d) });

/* ---------------- bağlantı hazırlığı ve canlı kontrol (SME-H) ---------------- */

export async function hazirlik(db: Db, istemci: SmartesIstemcisi | null, ortam: SmartesHazirlikCevabi['ortam']): Promise<SmartesHazirlikCevabi> {
  const acik = await sistemAyariOku(db, 'smartes.baglanti');
  const okumalar = new Map((await s.okumalar(db)).map((o) => [o.kaynak as string, o]));
  const izler = await s.akisIzleri(db);
  const n = await s.sayilar(db);
  const kalite = await s.kaliteAmbarSayilari(db);
  const tanim = await s.tanimSayilari(db);
  const akisAyarlari = new Map<string, boolean>();
  for (const t of SMARTES_AKISLARI) if (t.ayar !== undefined) akisAyarlari.set(t.anahtar, await sistemAyariOku(db, t.ayar));
  const sayi: Readonly<Record<string, { islenen: number | null; hatali: number | null }>> = {
    'is-emri': { islenen: n.gidenGonderilen, hatali: n.gidenHatali },
    'is-emri-durumu': { islenen: n.isEmriDurumu, hatali: null },
    durus: { islenen: n.durus, hatali: null },
    alarm: { islenen: n.alarm, hatali: null },
    'kalite-ambar': { islenen: kalite.red + kalite.ambar + kalite.kalite, hatali: null },
    tanimlar: { islenen: tanim.gonderilen, hatali: tanim.hatali },
  };
  // Akışın izi: eski üç okuma smartes_okuma'da, yenileri smartes_akis_izi'nde. Kalite-ambar üç kaynaktan biridir; en yeni deneme ve ilk hata gösterilir.
  const iz = (anahtar: string): { sonDeneme: string | null; sonHata: string | null } => {
    const okuma = okumalar.get(anahtar);
    if (okuma !== undefined) return { sonDeneme: okuma.sonDeneme, sonHata: okuma.sonSonuc === 'hata' ? okuma.sonHata : null };
    const ilgili = izler.filter((i) => (anahtar === 'kalite-ambar' ? i.akis !== 'tanim' : anahtar === 'tanimlar' && i.akis === 'tanim'));
    return {
      sonDeneme: ilgili.map((i) => i.sonDeneme).sort().at(-1) ?? null,
      sonHata: ilgili.find((i) => i.sonSonuc === 'hata')?.sonHata ?? null,
    };
  };
  return {
    baglanti: baglantiDurumu(acik, istemci),
    ortam,
    akislar: SMARTES_AKISLARI.map((t) => {
      const son = iz(t.anahtar);
      return {
        anahtar: t.anahtar, yon: t.yon, baslik: t.baslik, aciklama: t.aciklama,
        durum: smartesAkisDurumu(t, { ortamVar: istemci !== null, acik, akisAcik: akisAyarlari.get(t.anahtar) ?? true }),
        ayar: t.ayar ?? null,
        islenen: sayi[t.anahtar]?.islenen ?? null,
        hatali: sayi[t.anahtar]?.hatali ?? null,
        sonDeneme: son.sonDeneme,
        sonHata: son.sonHata,
      };
    }),
  };
}

// SME-H2: kontrol "SmartES bağlantısı" anahtarına bakmaz (açmadan önce denensin diye) ve yalnız okur: WSDL ve son bir saatin
// üretim listesi. Okunan satır kaydedilmez, işaretlenmez.
// İsteğe bağlı (sonradan eklenen akışların) metotları eksikse bildirilir; sonucu kırmızı yapmaz.
const isteBagliNotu = (wsdldekiler: readonly string[]): string => {
  const eksik = eksikIstegeBagliMetotlar(wsdldekiler);
  return eksik.length === 0 ? '' : ` İsteğe bağlı akışların metotları yok: ${eksik.join(', ')}.`;
};

export async function kontrol(istemci: SmartesIstemcisi | null, saat: () => Date = () => new Date()): Promise<SmartesKontrolCevabi> {
  const simdi = saat();
  const adlar = ['Servis tanımı (WSDL) ve metot adları', 'Salt okunur liste (WorkOrdersStatusList, son bir saat)'];
  if (istemci === null) {
    return {
      zaman: simdi.toISOString(), ulasildi: false,
      adimlar: adlar.map((ad) => ({ ad, sonuc: 'atlandi' as const, sureMs: null, ileti: 'TMIV2_SMARTES_ADRESI tanımlı değil; istek atılmadı.' })),
    };
  }
  const adimlar: SmartesKontrolCevabi['adimlar'] = [];
  let bas = Date.now();
  const w = await istemci.wsdl();
  let ulasildi = w.tur === 'basarili';
  if (w.tur === 'basarili') {
    const eksik = eksikMetotlar(w.deger);
    adimlar.push({
      ad: adlar[0] ?? '', sonuc: eksik.length === 0 ? 'tamam' : 'hata', sureMs: Date.now() - bas,
      ileti: eksik.length === 0
        ? `${w.deger.length} metot var; gerekenlerin hepsi bulundu.${isteBagliNotu(w.deger)}`
        : `Servis cevap verdi, ama şu metotlar yok: ${eksik.join(', ')}.`,
    });
  } else {
    adimlar.push({ ad: adlar[0] ?? '', sonuc: 'hata', sureMs: Date.now() - bas, ileti: hataMetni(w) });
  }
  // Servise hiç ulaşılamadıysa liste denenmez: 1/3/9 sn yeniden denemeyle boşuna beklenmesin.
  if (w.tur === 'ag' || w.tur === 'zaman-asimi') {
    adimlar.push({ ad: adlar[1] ?? '', sonuc: 'atlandi', sureMs: null, ileti: 'Servise ulaşılamadı; istek atılmadı.' });
    return { zaman: simdi.toISOString(), ulasildi: false, adimlar };
  }
  bas = Date.now();
  const l = await istemci.liste(OKUMA_METOTLARI['is-emri-durumu'], okumaParametreleri('is-emri-durumu', { bas: new Date(simdi.getTime() - KONTROL_PENCERESI_MS), son: simdi }));
  if (l.tur === 'basarili') ulasildi = true;
  adimlar.push({
    ad: adlar[1] ?? '', sonuc: l.tur === 'basarili' ? 'tamam' : 'hata', sureMs: Date.now() - bas,
    ileti: l.tur === 'basarili' ? `${l.deger.length} satır okundu (kaydedilmedi).` : hataMetni(l),
  });
  return { zaman: simdi.toISOString(), ulasildi, adimlar };
}
