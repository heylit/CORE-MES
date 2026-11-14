import { kayitNoktasi } from '#cekirdek/db.ts';
import type { Db, Veritabani } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type {
  AlarmlarCevabi, CanliMakineAyrintisiCevabi, MakineBulgulariCevabi, CanliMakinelerCevabi, DurumCevabi, DuruslarCevabi, EslemeCevabi, EslemelerCevabi,
  GidenCevabi, IsEmriDurumlariCevabi, SmartesBaglantiDurumu, GelenAdEsleGovdesi, GelenAdKaldirGovdesi, GelenAdlarCevabi, GelenAdOnerileriOnaylaGovdesi,
  OnerileriOnaylaCevabi, OnerileriOnaylaGovdesi, SmartesHazirlikCevabi, SmartesKontrolCevabi, AmbarHareketleriCevabi, FireHareketleriCevabi, GelenlerCevabi,
  HamKayitCevabi, KaliteOlcumleriCevabi, HesaplarCevabi, AdetKarariCevabi, AdetOnaylariCevabi,
} from '#paylasilan/sozlesme/smartes.ts';
import type { IkinciMenuSayaclari } from '#paylasilan/sayfa-tanimi.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { durusNedenleriniListele, hurdaNedenleriniListele } from '../durus-nedenleri/disari.ts';
import { istasyonlar, makineler, operasyonTipleri, smartesSayimIstasyonlari } from '../istasyonlar/disari.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import {
  gunlukAralikAdetleri, isEmriOzeti, isEmriOzetleri, isEmriZamanlari, makinelerdekiIsler, planlanacakIsEmirleri, smartesSayimi,
} from '../uretim-emirleri/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import type { IstemciHatasi, IstemciSonucu, SmartesIstemcisi } from './istemci.ts';
import {
  adetDegistiMi, alarmOku, alarmParametreleri, alarmSatiri, ambarOku, MAKINE_LISTESI_METODU, smartesMakineleri, BELIRSIZ_ILETISI, durusOku,
  eksikIstegeBagliMetotlar, eksikMetotlar, geriCekilmeMs, KALITE_AMBAR_METOTLARI, KALITE_AMBAR_AYARI, kaliteAmbarParametreleri, kaliteOku,
  KONTROL_PENCERESI_MS, SMARTES_AKISLARI, smartesAkisDurumu, GONDERIM_TUR_SINIRI, gonderimEylemi, gonderimOzeti, IS_EMRI_METODU, isEmriDurumuOku,
  isEmriParametreleri, kapanisParametreleri, kirp, listedekiKodlar, OKUMA_METOTLARI, okumaParametreleri, okumaPenceresi, OPERASYON_METODU, pencereAtlanmaliMi,
  operasyonParametreleri, redOku, skalerBasariliMi, smartesIsEmriNo, smartesOperasyonKodu, sonucBilinmiyorMu, TANIM_AYARI, TANIM_LISTE_METOTLARI,
  TANIM_METOTLARI, TANIM_NIYET_SINIRI, TANIM_TUR_SINIRI, TANIM_TURLERI, tanimEylemi, tanimKoduUygunMu, tanimParametreleri, yasakMetotMu, alarmTekrarTonu,
  birikimliSayac, cizelgeParcalari, nedensizDuruslar, sayimKarsilastir, terminAsimi, bugunDilimleri, ILERLEME_ARALIGI_MS, ILERLEME_METODU, ilerlemeOku,
  ilerlemeParametreleri, MAKINE_AYARI, MAKINE_BILGI_METODU, MAKINE_LISTESI_YENILEME_MS, MAKINE_OKUMA_ARALIGI_MS, MAKINE_TUR_TAVANI_MS,
  makineBilgiParametreleri, makineBilgisiOku, turSirasi, adAnahtari, adDurumu, kodOnerileri, LISTE_METOTLARI, LISTE_TURLERI, listeKayitlari, listeOkunmaliMi,
  listeParametreleri, nedenOnerisi, gelenKalemleri, hamAlanlari, cevrimOku, cevrimSaniyesi, HESAP_METOTLARI, HESAP_TURLERI, hesapOkunmaliMi,
  hesapParametreleri, OEE_PENCERESI_GUN, oeeOku, oeeYuzdeleri, tanimliAnahtari, tanimliSaniyeler, zorlaOkunabilirMi, adetOnayFarklari, ONAY_ILETILERI, SAYIM_AKTARIMI_AYARI,
  onayaGirerMi,
} from './kurallar.ts';
import type {
  AkisAyari, AktifMakine, EslemeTuru, GidecekIsEmri, KaliteAmbarKaynagi, KodOnerisi, ListeTuru, MakineDurumu, OkumaKaynagi, TanimKaydi, TanimTuru,
  CizelgeParcasi, HesapTuru, IsEmriDurumuKaydi,
} from './kurallar.ts';
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
    if (k) {
      await s.isEmriDurumuYaz(db, k, zaman);
      await adetOnayinaAl(db, k, zaman, await sayimGecerliligi(db, k, zaman));
    }
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
  return {
    'is-emri-durumlari': n.isEmriDurumu, duruslar: n.durus, alarmlar: n.alarm, giden: n.gidenHatali, eslemeler: await s.degisenAdSayisi(db),
    'onay-bekliyor': await s.bekleyenOnaySay(db),
  };
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

// Eşleme türünün SmartES'teki listesi; duruş nedeninin kod listesi yoktur (ad listesiyle eşlenir, `gelenAdlar`).
const ESLEME_LISTESI: Readonly<Record<EslemeTuru, ListeTuru | null>> = { istasyon: 'istasyon', makine: 'makine', 'operasyon-tipi': 'operasyon', 'durus-nedeni': null };
const SMARTES_KOD_EN_UZUN = 50;

// Seçilebilir SmartES kodları: son listede olan, pasif olmayan, eşleme koduna sığan. Liste hiç okunamadıysa null.
async function smartesKodListesi(db: Db, tur: EslemeTuru): Promise<{ kod: string; ad: string | null }[] | null> {
  const liste = ESLEME_LISTESI[tur];
  if (liste === null || ((await s.listeOkumasi(db, liste))?.sonBasarili ?? null) === null) return null;
  const sonuc: { kod: string; ad: string | null }[] = [];
  for (const k of await s.listeSatirlari(db, liste)) {
    if (k.var && k.pasif !== true && k.kod !== null && k.kod.length <= SMARTES_KOD_EN_UZUN) sonuc.push({ kod: k.kod, ad: k.ad });
  }
  return sonuc;
}

interface EslemeGorunumu {
  kayitlar: TmiKaydi[];
  eslemeler: Map<number, s.EslemeSatiri>;
  liste: { kod: string; ad: string | null }[] | null;
  oneriler: Map<number, KodOnerisi>;
}

// Öneri yalnız eşlenmemiş aktif kayda, başka kayda verilmemiş koddan çıkar.
async function eslemeGorunumu(db: Db, tur: EslemeTuru): Promise<EslemeGorunumu> {
  const kayitlar = await tmiKayitlari(db, tur);
  const eslemeler = new Map((await s.eslemeler(db, tur)).map((e) => [e.tmiId, e]));
  const liste = await smartesKodListesi(db, tur);
  const kullanilan = new Set([...eslemeler.values()].map((e) => e.smartesKod));
  const oneriler = liste === null
    ? new Map<number, KodOnerisi>()
    : kodOnerileri(kayitlar.filter((k) => k.aktif && !eslemeler.has(k.id)), liste.filter((x) => !kullanilan.has(x.kod)));
  return { kayitlar, eslemeler, liste, oneriler };
}

export async function eslemeleriGetir(db: Db, tur: EslemeTuru): Promise<EslemelerCevabi> {
  const g = await eslemeGorunumu(db, tur);
  return {
    tur,
    satirlar: g.kayitlar.map((k) => ({
      tmiId: k.id, tmiKod: k.kod, tmiAd: k.ad, aktif: k.aktif, smartesKod: g.eslemeler.get(k.id)?.smartesKod ?? null,
      surum: g.eslemeler.get(k.id)?.surum ?? null, oneri: g.oneriler.get(k.id) ?? null,
    })),
    smartesListesi: g.liste,
  };
}

const KOD_TEKIL = { smartes_esleme_kod_tekil: { ileti: 'Bu SmartES kodu bu türde başka bir kayda verilmiş.', alan: 'smartesKod' } };

export async function eslemeAta(
  db: Db, kisiId: number, g: { tur: EslemeTuru; tmiId: number; smartesKod: string; surum: number | null },
): Promise<EslemeCevabi> {
  if (!(await tmiKayitlari(db, g.tur)).some((k) => k.id === g.tmiId)) throw bulunamadi('Eşlenecek CORE kaydı bulunamadı.');
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

// Öneri onayı: sunucu öneriyi aynı transaction'da yeniden hesaplar ve yalnız hâlâ geçerli olanı yazar. Arada eşlenmiş, kodu başka
// kayda verilmiş ya da önerisi değişmiş satır yazılmaz, sayılır; istek o yüzden düşmez.
export async function onerileriOnayla(db: Db, kisiId: number, g: OnerileriOnaylaGovdesi): Promise<OnerileriOnaylaCevabi> {
  const gorunum = await eslemeGorunumu(db, g.tur);
  let yazilan = 0;
  let atlanan = 0;
  await kisitKorumali(KOD_TEKIL, async () => {
    for (const satir of g.satirlar) {
      const oneri = gorunum.oneriler.get(satir.tmiId);
      if (oneri === undefined || oneri.kod !== satir.smartesKod || (await s.eslemeEkle(db, g.tur, satir.tmiId, oneri.kod, kisiId)) === 0) atlanan++;
      else yazilan++;
    }
  });
  return { yazilan, atlanan };
}

/* ---------------- SmartES listeleri (SME-30) ---------------- */

export type ListeOkumaSonucu = Engel | { tur: 'islendi'; okunan: ListeTuru[]; hatali: ListeTuru[] };

// Tanım listeleri okunur ve saklanır; SmartES'e hiçbir şey yazılmaz. `zorla` (ekrandaki "Şimdi oku") günlük aralığı beklemez.
// İstek hiçbir transaction açıkken beklenmez: her listenin sonucu kendi kısa yazısıdır (`listeYaz` tek deyim).
export async function listeTuru(
  vt: Pick<Veritabani, 'tx'>, o: Pick<TurOrtami, 'istemci' | 'saat'>, secenek: { turler?: readonly ListeTuru[]; zorla?: boolean } = {},
): Promise<ListeOkumaSonucu> {
  const bas = await vt.tx(async (db) => {
    const e = await engel(db, o.istemci);
    if (e !== null) return e;
    const okunacak: ListeTuru[] = [];
    for (const t of secenek.turler ?? LISTE_TURLERI) {
      const iz = await s.listeOkumasi(db, t);
      if (secenek.zorla === true ? zorlaOkunabilirMi(iz, o.saat()) : listeOkunmaliMi(iz, o.saat())) okunacak.push(t);
    }
    return { tur: 'hazir' as const, okunacak };
  });
  if (bas.tur !== 'hazir') return bas;
  const istemci = o.istemci;
  if (istemci === null) return { tur: 'ortam-degiskeni-yok' };
  const okunan: ListeTuru[] = [];
  const hatali: ListeTuru[] = [];
  for (const t of bas.okunacak) {
    const metot = LISTE_METOTLARI[t];
    if (yasakMetotMu(metot)) throw new Error('Bu akış işaretleme ya da silme metodu çağıramaz.');
    const r = await istemci.liste(metot, listeParametreleri(t));
    const zaman = o.saat();
    if (r.tur !== 'basarili') {
      await vt.tx((db) => s.listeHatali(db, t, zaman, hataMetni(r)));
      hatali.push(t);
      // Servise ulaşılamıyorsa öbür listeler de beklemesin.
      if (r.tur === 'ag' || r.tur === 'zaman-asimi') break;
      continue;
    }
    const { kayitlar } = listeKayitlari(t, r.deger);
    // Satır var ama hiçbirinde kod ya da ad yok: alan adı yanlış varsayılmıştır; eski liste yerinde kalır.
    if (r.deger.length > 0 && kayitlar.length === 0) {
      await vt.tx((db) => s.listeHatali(db, t, zaman, kirp(`${metot} cevabında kod ya da ad alanı bulunamadı; alan adı doğrulanana kadar liste güncellenmez.`)));
      hatali.push(t);
      continue;
    }
    await vt.tx((db) => s.listeYaz(db, t, kayitlar, zaman));
    okunan.push(t);
  }
  return { tur: 'islendi', okunan, hatali };
}

/* ---------------- fire ve duruş adı eşlemesi (SME-31) ---------------- */

type AdTuru = s.AdTuru;
interface NedenOzeti { id: number; kod: string; ad: string; aktif: boolean }

// Nedenler sahibi modülden okunur (ADR 0006): fire adı hurda nedenine, duruş adı duruş nedenine bağlanır.
async function nedenler(db: Db, tur: AdTuru): Promise<NedenOzeti[]> {
  const l = tur === 'fire' ? await hurdaNedenleriniListele(db, { yalnizAktif: false }) : await durusNedenleriniListele(db, { yalnizAktif: false });
  return l.map((n) => ({ id: n.id, kod: n.kod, ad: n.ad, aktif: n.aktif }));
}

// Okunan kayıtların üretim ve duruş kaydına işlenmesi ayrı karttır (3173) ve bağlı değildir: eşleme saklanır, kayıt işlenmez.
const ISLEME_BAGLI = false;

const adKarsilastirma = (ad: string): string => ad.trim().toLocaleLowerCase('tr');
const ozet = (n: NedenOzeti): { id: number; kod: string; ad: string } => ({ id: n.id, kod: n.kod, ad: n.ad });

export async function gelenAdlar(db: Db, tur: AdTuru): Promise<GelenAdlarCevabi> {
  const liste = await s.listeSatirlari(db, tur);
  const okuma = await s.listeOkumasi(db, tur);
  const eslemeler = new Map((await s.adEslemeleri(db, tur)).map((e) => [e.anahtar, e]));
  const tumNedenler = await nedenler(db, tur);
  const nedenHaritasi = new Map(tumNedenler.map((n) => [n.id, n]));
  const aktifNedenler = tumNedenler.filter((n) => n.aktif);
  // Hareket satırı adla gelir: listedeki ada (önce hâlâ listede olana) bağlanır; listede olmayan ad kendi satırını açar.
  const addanAnahtar = new Map<string, string>();
  for (const l of [...liste].sort((a, b) => Number(b.var) - Number(a.var))) {
    if (l.ad !== null && !addanAnahtar.has(adKarsilastirma(l.ad))) addanAnahtar.set(adKarsilastirma(l.ad), l.anahtar);
  }
  const bekleyenler = new Map<string, { ad: string; sayi: number; ilk: string | null }>();
  for (const o of await s.okunanAdlar(db, tur)) {
    const anahtar = addanAnahtar.get(adKarsilastirma(o.ad)) ?? adAnahtari(o.ad.trim());
    const onceki = bekleyenler.get(anahtar);
    bekleyenler.set(anahtar, onceki === undefined ? { ad: o.ad.trim(), sayi: o.sayi, ilk: o.ilk }
      : { ad: onceki.ad, sayi: onceki.sayi + o.sayi, ilk: [onceki.ilk, o.ilk].filter((z) => z !== null).sort()[0] ?? null });
  }

  type Satir = GelenAdlarCevabi['satirlar'][number];
  const satir = (k: { anahtar: string; ad: string; smartesId: number | null; grup: string | null; operatorKaynakli: boolean | null; var: boolean; ilkGorulme: Date | null }): Satir => {
    const e = eslemeler.get(k.anahtar);
    const bekleyen = e === undefined ? bekleyenler.get(k.anahtar) : undefined;
    const neden = e === undefined ? undefined : nedenHaritasi.get(e.nedenId);
    const oneri = e === undefined && k.var ? nedenOnerisi(k.ad, aktifNedenler) : null;
    return {
      anahtar: k.anahtar, smartesId: k.smartesId === null ? null : String(k.smartesId), ad: k.ad, grup: k.grup, operatorKaynakli: k.operatorKaynakli, rework: null,
      durum: adDurumu({ var: k.var, eslendi: e !== undefined, ilkGorulme: k.ilkGorulme, ilkBasarili: okuma?.ilkBasarili ?? null }),
      neden: e === undefined ? null : neden === undefined ? { id: e.nedenId, kod: String(e.nedenId), ad: 'Neden bulunamadı' } : ozet(neden),
      sonuc: e?.sonuc ?? null, bekleyen: bekleyen?.sayi ?? 0, oneri: oneri === null ? null : ozet(oneri), ilkBekleyen: bekleyen?.ilk ?? null, surum: e?.surum ?? null,
    };
  };

  const satirlar: Satir[] = [];
  const gorulen = new Set<string>();
  for (const l of liste) {
    gorulen.add(l.anahtar);
    if (l.ad === null) continue;
    // Eşlenmemiş ad listeden çıkmış ya da pasifse ve bekleyen kaydı yoksa gösterilecek bir şey yoktur.
    if (!eslemeler.has(l.anahtar) && (!l.var || l.pasif === true) && !bekleyenler.has(l.anahtar)) continue;
    satirlar.push(satir({ ...l, ad: l.ad }));
  }
  // SmartES listesinde olmayan adla gelmiş kayıtlar ve yalnız adla tutulan eşlemeler: listeden bağımsızdır, "yok" olmaz.
  const listeDisi = new Map<string, string>();
  for (const [anahtar, b] of bekleyenler) if (!gorulen.has(anahtar)) listeDisi.set(anahtar, b.ad);
  for (const e of eslemeler.values()) if (!gorulen.has(e.anahtar) && !listeDisi.has(e.anahtar)) listeDisi.set(e.anahtar, e.ad);
  for (const [anahtar, ad] of listeDisi) satirlar.push(satir({ anahtar, ad, smartesId: null, grup: null, operatorKaynakli: null, var: true, ilkGorulme: null }));
  satirlar.sort((a, b) => a.ad.localeCompare(b.ad, 'tr') || a.anahtar.localeCompare(b.anahtar));

  const secilebilir = new Map(aktifNedenler.map((n) => [n.id, n]));
  for (const x of satirlar) if (x.neden !== null && !secilebilir.has(x.neden.id)) secilebilir.set(x.neden.id, { ...x.neden, aktif: false });
  return {
    tur, sonOkuma: okuma?.sonBasarili?.toISOString() ?? null, sonHata: okuma?.sonSonuc === 'hata' ? okuma.sonHata : null, islemeBagli: ISLEME_BAGLI,
    satirlar, nedenler: [...secilebilir.values()].map(ozet),
  };
}

export async function gelenAdEsle(db: Db, kisiId: number, g: GelenAdEsleGovdesi): Promise<GelenAdlarCevabi> {
  const hedef = (await gelenAdlar(db, g.tur)).satirlar.find((x) => x.anahtar === g.anahtar);
  if (hedef === undefined) throw bulunamadi('SmartES adı bulunamadı; sayfayı yenileyin.');
  const neden = (await nedenler(db, g.tur)).find((n) => n.id === g.nedenId);
  // Pasif neden yeni eşlemeye seçilemez; eşleme zaten o nedendeyse kalabilir.
  if (neden === undefined || (!neden.aktif && hedef.neden?.id !== neden.id)) throw bulunamadi('Seçilen neden bulunamadı ya da pasif.');
  if (g.tur === 'fire' && g.sonuc === null) throw dogrulama('Bu adla gelen firenin ne olacağı seçilmeli.', 'sonuc');
  const yazi: s.AdEslemeYazisi = { tur: g.tur, anahtar: g.anahtar, ad: hedef.ad, nedenId: g.nedenId, sonuc: g.tur === 'fire' ? g.sonuc : null, kisiId };
  if (g.surum === null) {
    // Yeni eşleme sürümsüz gelir; o arada başkası eklemişse üstüne yazılmaz (409).
    if ((await s.adEslemeEkle(db, yazi)) === 0) await surumluGuncelle<number>({ guncelle: async () => null, varMi: async () => true });
  } else {
    const beklenen = g.surum;
    await surumluGuncelle({
      guncelle: () => s.adEslemeGuncelle(db, yazi, beklenen),
      varMi: async () => (await s.adEslemeKilitle(db, g.tur, g.anahtar)) !== null,
      bulunamadiIletisi: 'Eşleme bulunamadı; sayfayı yenileyin.',
    });
  }
  return gelenAdlar(db, g.tur);
}

export async function gelenAdKaldir(db: Db, g: GelenAdKaldirGovdesi): Promise<GelenAdlarCevabi> {
  await surumluGuncelle({
    guncelle: async () => ((await s.adEslemeSil(db, g.tur, g.anahtar, g.surum)) ? true : null),
    varMi: async () => (await s.adEslemeKilitle(db, g.tur, g.anahtar)) !== null,
    bulunamadiIletisi: 'Eşleme bulunamadı; sayfayı yenileyin.',
  });
  return gelenAdlar(db, g.tur);
}

// Öneri onayı: yalnız hâlâ eşlenmemiş ve önerisi aynı kalan ad yazılır; fire "Hatalı" ile yazılır, sonradan değiştirilir.
export async function gelenAdOnerileriniOnayla(db: Db, kisiId: number, g: GelenAdOnerileriOnaylaGovdesi): Promise<OnerileriOnaylaCevabi> {
  const satirlar = new Map((await gelenAdlar(db, g.tur)).satirlar.map((x) => [x.anahtar, x]));
  let yazilan = 0;
  let atlanan = 0;
  for (const istek of g.satirlar) {
    const x = satirlar.get(istek.anahtar);
    const gecerli = x !== undefined && x.neden === null && x.oneri?.id === istek.nedenId;
    const yazi: s.AdEslemeYazisi | null = gecerli
      ? { tur: g.tur, anahtar: x.anahtar, ad: x.ad, nedenId: istek.nedenId, sonuc: g.tur === 'fire' ? 'hatali' : null, kisiId } : null;
    if (yazi !== null && (await s.adEslemeEkle(db, yazi)) > 0) yazilan++;
    else atlanan++;
  }
  return { yazilan, atlanan };
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
export const fireHareketleri = (db: Db, q: Sayfa): Promise<FireHareketleriCevabi> =>
  sayfaliListe(q, { say: () => s.redSay(db), satirlar: (d) => s.redSatirlari<Satir<FireHareketleriCevabi>>(db, d) });
export const ambarHareketleri = (db: Db, q: Sayfa): Promise<AmbarHareketleriCevabi> =>
  sayfaliListe(q, { say: () => s.ambarSay(db), satirlar: (d) => s.ambarSatirlari<Satir<AmbarHareketleriCevabi>>(db, d) });
export const kaliteOlcumleri = (db: Db, q: Sayfa): Promise<KaliteOlcumleriCevabi> =>
  sayfaliListe(q, { say: () => s.kaliteSay(db), satirlar: (d) => s.kaliteSatirlari<Satir<KaliteOlcumleriCevabi>>(db, d) });

export async function hamKayit(db: Db, tur: s.HamTuru, smartesId: number): Promise<HamKayitCevabi> {
  const ham = await s.hamKayit(db, tur, smartesId);
  if (ham === null) throw bulunamadi('Kayıt bulunamadı; sayfayı yenileyin.');
  return { alanlar: hamAlanlari(ham) };
}

export async function gelenler(db: Db, istemci: SmartesIstemcisi | null): Promise<GelenlerCevabi> {
  const baglantiAcik = baglantiDurumu(await sistemAyariOku(db, 'smartes.baglanti'), istemci) === 'acik';
  const n = await s.sayilar(db);
  const ka = await s.kaliteAmbarSayilari(db);
  const hesap = await s.hesapSayilari(db);
  const liste = new Map((await s.listeSayilari(db)).map((l) => [l.tur, l.n]));
  const l = (tur: ListeTuru): number => liste.get(tur) ?? 0;
  return {
    kalemler: gelenKalemleri({
      baglantiAcik,
      kaliteAmbarAcik: await sistemAyariOku(db, KALITE_AMBAR_AYARI),
      izler: new Map((await s.gelenIzleri(db)).map((i) => [i.kaynak, i.sonOkuma])),
      sayilar: new Map([
        ['uretim', n.isEmriDurumu], ['durus', n.durus], ['alarm', n.alarm], ['fire', ka.red], ['ambar', ka.ambar], ['kalite', ka.kalite],
        ['adlar', l('fire') + l('durus')], ['tanimlar', l('istasyon') + l('makine') + l('operasyon')], ['oee', hesap.oee], ['cevrim', hesap.cevrim],
      ]),
    }),
  };
}

/* ---------------- Canlı makine panosu (SME-34) ---------------- */

// Süreç belleği: makine listesi saatte bir yenilenir; kesilen tur `sonraki` makineden sürer. Yeniden başlayan süreçte boştur.
export interface MakineBellegi { makineler: AktifMakine[] | null; listeZamani: number; sonraki: number | null }
export const yeniMakineBellegi = (): MakineBellegi => ({ makineler: null, listeZamani: 0, sonraki: null });

export type MakineOkumaSonucu = Engel | { tur: 'islendi'; okunan: number; makineSayisi: number; kesildi: boolean; hata: string | null };

// Makineler sırayla, makine başına tek istekle okunur (AllMachineInformationList makine kimliği ister). Tur süre tavanını aşarsa ya da
// SmartES'e ulaşılamazsa kesilir; okunamayan makinenin eski kaydı yerinde kalır ve ekranda "veri eski" görünür.
export async function makineTuru(
  vt: Pick<Veritabani, 'tx'>, o: Pick<TurOrtami, 'istemci' | 'saat'>, bellek: MakineBellegi, sayac: () => number = Date.now,
): Promise<MakineOkumaSonucu> {
  const e = await vt.tx((db) => engel(db, o.istemci, MAKINE_AYARI));
  if (e !== null) return e;
  const istemci = o.istemci;
  if (istemci === null) return { tur: 'ortam-degiskeni-yok' };
  for (const metot of [MAKINE_LISTESI_METODU, MAKINE_BILGI_METODU]) if (yasakMetotMu(metot)) throw new Error('Bu akış işaretleme ya da silme metodu çağıramaz.');
  const t0 = sayac();
  const bitir = async (t: { hata: string | null; okunan: number; makineSayisi: number; kesildi: boolean }): Promise<MakineOkumaSonucu> => {
    await vt.tx((db) => s.makineTuruYaz(db, o.saat(), { hata: t.hata, okunan: t.okunan, makineSayisi: t.makineSayisi, turSuresiMs: Math.max(0, Math.round(sayac() - t0)) }));
    return { tur: 'islendi', ...t };
  };
  if (bellek.makineler === null || o.saat().getTime() - bellek.listeZamani >= MAKINE_LISTESI_YENILEME_MS) {
    const r = await istemci.anlik(MAKINE_LISTESI_METODU, []);
    if (r.tur !== 'basarili') return bitir({ hata: hataMetni(r), okunan: 0, makineSayisi: bellek.makineler?.length ?? 0, kesildi: true });
    bellek.makineler = smartesMakineleri(r.deger);
    bellek.listeZamani = o.saat().getTime();
  }
  const sira = turSirasi(bellek.makineler, bellek.sonraki);
  let okunan = 0;
  let hata: string | null = null;
  let kesildi = false;
  for (const [i, m] of sira.entries()) {
    if (sayac() - t0 > MAKINE_TUR_TAVANI_MS) {
      bellek.sonraki = m.id;
      kesildi = true;
      break;
    }
    const r = await istemci.anlik(MAKINE_BILGI_METODU, makineBilgiParametreleri(m.id));
    if (r.tur !== 'basarili') {
      hata = hataMetni(r);
      if (r.tur === 'ag' || r.tur === 'zaman-asimi') {
        // Cevap vermeyen makine sonraki turun başına konmaz: ötekilerin okunmasını engellemesin.
        bellek.sonraki = sira[i + 1]?.id ?? null;
        kesildi = true;
        break;
      }
      continue;
    }
    const satir = r.deger[0];
    const okuma = satir === undefined ? null : makineBilgisiOku(satir, m);
    if (okuma === null) {
      hata = kirp(`${MAKINE_BILGI_METODU} cevabında makine kodu bulunamadı; alan adı doğrulanana kadar o makine yazılmaz.`);
      continue;
    }
    const zaman = o.saat();
    // Son okuma üstüne yazılır; geçmiş (3192) aynı transaction'da örnek olarak eklenir, silinmez (3200 c).
    await vt.tx(async (db) => { await s.makineYaz(db, okuma, zaman); await s.ornekYaz(db, okuma, zaman); });
    okunan += 1;
  }
  if (!kesildi) bellek.sonraki = null;
  return bitir({ hata, okunan, makineSayisi: sira.length, kesildi });
}

export type IlerlemeOkumaSonucu = Engel | { tur: 'islendi'; okunan: number; hata: string | null } | { tur: 'erken' };

// İş emirlerinin SmartES'teki ilerlemesi (tamamlanma yüzdesi, tahmini bitiş) beş dakikada bir, tek istekle okunur.
export async function ilerlemeTuru(vt: Pick<Veritabani, 'tx'>, o: Pick<TurOrtami, 'istemci' | 'saat'>): Promise<IlerlemeOkumaSonucu> {
  const bas = await vt.tx(async (db) => {
    const e = await engel(db, o.istemci, MAKINE_AYARI);
    if (e !== null) return e;
    const iz = await s.ilerlemeOkumasi(db);
    return iz !== null && o.saat().getTime() - iz.sonDeneme.getTime() < ILERLEME_ARALIGI_MS ? { tur: 'erken' as const } : { tur: 'hazir' as const };
  });
  if (bas.tur !== 'hazir') return bas;
  const istemci = o.istemci;
  if (istemci === null) return { tur: 'ortam-degiskeni-yok' };
  if (yasakMetotMu(ILERLEME_METODU)) throw new Error('Bu akış işaretleme ya da silme metodu çağıramaz.');
  const r = await istemci.liste(ILERLEME_METODU, ilerlemeParametreleri(o.saat()));
  const zaman = o.saat();
  if (r.tur !== 'basarili') {
    await vt.tx((db) => s.ilerlemeHatali(db, zaman, hataMetni(r)));
    return { tur: 'islendi', okunan: 0, hata: hataMetni(r) };
  }
  const kayitlar = [...new Map(r.deger.flatMap((satir) => ilerlemeOku(satir) ?? []).map((k) => [k.isEmriNo, k])).values()];
  if (r.deger.length > 0 && kayitlar.length === 0) {
    const hata = kirp(`${ILERLEME_METODU} cevabında beklenen alanlar bulunamadı; alan adı doğrulanana kadar kayıt yazılmaz.`);
    await vt.tx((db) => s.ilerlemeHatali(db, zaman, hata));
    return { tur: 'islendi', okunan: 0, hata };
  }
  await vt.tx((db) => s.ilerlemeYaz(db, kayitlar, zaman));
  return { tur: 'islendi', okunan: kayitlar.length, hata: null };
}

const MAKINE_SATIR_SINIRI = 500;

// Makine SmartES koduyla eşlenmişse CORE'daki istasyonu ve o makinede açık iş yanına yazılır; eşlenmemiş makinede ikisi de boştur.
export async function canliMakineler(db: Db, istemci: SmartesIstemcisi | null, simdi: Date = new Date()): Promise<CanliMakinelerCevabi> {
  const baglanti = baglantiDurumu(await sistemAyariOku(db, 'smartes.baglanti'), istemci);
  const okumaAcik = await sistemAyariOku(db, MAKINE_AYARI);
  const iz = await s.makineOkumaIzi(db);
  const bos = { baglanti, okumaAcik, destekleniyor: true, aralikSaniye: MAKINE_OKUMA_ARALIGI_MS / 1000, sonOkuma: iz?.sonBasarili ?? null };
  if (baglanti !== 'acik' || !okumaAcik) return { ...bos, makineler: [] };
  const satirlar = await s.makineDurumlari(db, MAKINE_SATIR_SINIRI);
  const kodlar = new Map((await s.eslemeler(db, 'makine')).map((e) => [e.smartesKod, e.tmiId]));
  const coreMakineleri = new Map((await makineler(db, { pasiflerDahil: true })).map((m) => [m.id, m]));
  const coreIstasyonlari = new Map((await istasyonlar(db, { pasiflerDahil: true })).map((i) => [i.id, i]));
  const isler = await makinelerdekiIsler(db, [...kodlar.values()]);
  const ilerleme = new Map((await s.ilerlemeler(db, [...isler.values()].map((i) => smartesIsEmriNo(i.emirNo, i.opNo)))).map((i) => [i.isEmriNo, i]));
  const gunBasi = new Date(tesisGunBasi(tesisGunu(simdi)));
  const degisimler = new Map<string, { onceki: MakineDurumu | null; liste: { zaman: string; yeni: MakineDurumu }[] }>();
  for (const d of await s.gunDegisimleri(db, gunBasi, null)) {
    const k = degisimler.get(d.makineKodu) ?? { onceki: null, liste: [] };
    if (d.onceki) k.onceki = d.yeni;
    else k.liste.push({ zaman: d.zaman, yeni: d.yeni });
    degisimler.set(d.makineKodu, k);
  }
  const gunBasiMetni = gunBasi.toISOString();
  return {
    ...bos,
    // Hiç okunamadıysa ve son hata metodun olmadığını söylüyorsa pano "SmartES bu bilgiyi vermiyor" der.
    destekleniyor: !(satirlar.length === 0 && iz !== null && iz.sonBasarili === null && iz.sonHata !== null && iz.sonHata.startsWith('SmartES hatası')),
    makineler: satirlar.map((m) => {
      const coreId = kodlar.get(m.makineKodu);
      const core = coreId === undefined ? undefined : coreMakineleri.get(coreId);
      const istasyon = core?.istasyonId == null ? undefined : coreIstasyonlari.get(core.istasyonId);
      const is = coreId === undefined ? undefined : isler.get(coreId);
      const il = is === undefined ? undefined : ilerleme.get(smartesIsEmriNo(is.emirNo, is.opNo));
      const g = degisimler.get(m.makineKodu);
      return {
        makineKodu: m.makineKodu, makineAdi: m.makineAdi ?? core?.ad ?? null, istasyonKodu: istasyon?.kod ?? null, istasyonAdi: istasyon?.ad ?? null,
        durum: m.durum, durumKodu: m.durumKodu, durumBaslangic: m.durumBaslangic, mod: m.mod, alarm: m.alarm, uyari: m.uyari, programNo: m.programNo,
        programAdi: m.programAdi, sayac: m.sayac, spindleYuku: m.spindleYuku, okundu: m.okundu,
        calisanIs: is === undefined ? null : {
          emirId: is.emirId, emirNo: is.emirNo, opNo: is.opNo, opAdi: is.opAdi, tamamlananYuzde: il?.tamamlananYuzde ?? null, tahminiBitis: il?.tahminiBitis ?? null,
        },
        bugun: bugunDilimleri(gunBasiMetni, g?.onceki ?? null, g?.liste ?? []),
      };
    }),
  };
}

export async function canliMakineAyrintisi(db: Db, makineKodu: string, simdi: Date = new Date()): Promise<CanliMakineAyrintisiCevabi> {
  const m = await s.makineDurumuGetir(db, makineKodu);
  if (m === null) throw bulunamadi('Bu makinenin canlı kaydı yok.');
  const gunBasi = new Date(tesisGunBasi(tesisGunu(simdi)));
  const degisimler = (await s.gunDegisimleri(db, gunBasi, makineKodu)).filter((d) => !d.onceki);
  return {
    makineKodu: m.makineKodu, okundu: m.okundu, mod: m.mod, uyari: m.uyari, sayacToplam: m.sayacToplam, eksenHizi: m.eksenHizi, eksenOrani: m.eksenOrani,
    spindle: { hiz: m.spindleHizi, yuk: m.spindleYuku, oran: m.spindleOrani }, takimCebi: m.takimCebi,
    degisimler: degisimler.map((d) => ({ zaman: d.zaman, eski: d.eski, yeni: d.yeni, aciklama: d.aciklama })).reverse(),
  };
}

/* ---------------- SmartES'in kendi hesapları (SME-33) ---------------- */

export type HesapOkumaSonucu = Engel | { tur: 'islendi'; okunan: HesapTuru[]; hatali: HesapTuru[] };

// OEE raporu ve parça çevrim süresi saatte bir okunur. Okunamayan hesap eski haliyle kalır, hatası izde saklanır.
export async function hesapTuru(vt: Pick<Veritabani, 'tx'>, o: Pick<TurOrtami, 'istemci' | 'saat'>, secenek: { zorla?: boolean } = {}): Promise<HesapOkumaSonucu> {
  const bas = await vt.tx(async (db) => {
    const e = await engel(db, o.istemci);
    if (e !== null) return e;
    const okunacak: HesapTuru[] = [];
    for (const t of HESAP_TURLERI) if (secenek.zorla === true || hesapOkunmaliMi(await s.hesapOkumasi(db, t), o.saat())) okunacak.push(t);
    return { tur: 'hazir' as const, okunacak };
  });
  if (bas.tur !== 'hazir') return bas;
  const istemci = o.istemci;
  if (istemci === null) return { tur: 'ortam-degiskeni-yok' };
  const okunan: HesapTuru[] = [];
  const hatali: HesapTuru[] = [];
  for (const t of bas.okunacak) {
    const metot = HESAP_METOTLARI[t];
    if (yasakMetotMu(metot)) throw new Error('Bu akış işaretleme ya da silme metodu çağıramaz.');
    const r = await istemci.liste(metot, hesapParametreleri(t, o.saat()));
    const zaman = o.saat();
    if (r.tur !== 'basarili') {
      await vt.tx((db) => s.hesapHatali(db, t, zaman, hataMetni(r)));
      hatali.push(t);
      if (r.tur === 'ag' || r.tur === 'zaman-asimi') break;
      continue;
    }
    const oeeler = t === 'oee' ? r.deger.flatMap((satir) => oeeOku(satir) ?? []) : [];
    const cevrimler = t === 'cevrim' ? r.deger.flatMap((satir) => cevrimOku(satir) ?? []) : [];
    // Satır var ama hiçbiri tanınmadı: alan adı yanlış varsayılmıştır; eski kayıtlar yerinde kalır.
    if (r.deger.length > 0 && oeeler.length + cevrimler.length === 0) {
      await vt.tx((db) => s.hesapHatali(db, t, zaman, kirp(`${metot} cevabında beklenen alanlar bulunamadı; alan adı doğrulanana kadar kayıt yazılmaz.`)));
      hatali.push(t);
      continue;
    }
    // Aynı anahtar cevapta iki kez gelirse sonuncusu geçerlidir (tek deyimde aynı satır iki kez yazılamaz).
    if (t === 'oee') await vt.tx((db) => s.oeeYaz(db, [...new Map(oeeler.map((k) => [`${k.vardiyaTarihi}|${k.vardiya}|${k.makineKodu}`, k])).values()], zaman));
    else await vt.tx((db) => s.cevrimYaz(db, [...new Map(cevrimler.map((k) => [k.anahtar, k])).values()], zaman));
    okunan.push(t);
  }
  return { tur: 'islendi', okunan, hatali };
}

const HESAP_SATIR_SINIRI = 500;
const yuzde = (oran: number | null): number | null => (oran === null ? null : Math.round(oran * 10_000) / 100);

// CORE'un makine OEE'sini kablolama verir: OEE modülü bu modülle aynı kattadır, doğrudan ithal edilemez (ADR 0006). Çözücü kendi
// yetki denetimini (oee.oku), sorgu sınırını ve iş merkezi kapsamını uygular.
export type CoreOeeCozucusu = (
  db: Db, kullanici: Kullanici, sorgu: { baslangic: string; bitis: string }, simdi?: number,
) => Promise<{ id: number; oee: number | null }[]>;
let coreOeeCozucusu: CoreOeeCozucusu | null = null;
export const coreOeeCozucusuKaydet = (c: CoreOeeCozucusu | null): void => { coreOeeCozucusu = c; };

// CORE'un aynı makine ve gün için OEE'si: SmartES makine kodu eşlemesinden CORE makinesi bulunur; OEE'yi görme yetkisi olmayana,
// eşlenmemiş makineye ve hesaplanamayan güne null. Bağ kurulmamışsa karşılaştırma boş kalır; SmartES'in değerleri yine görünür.
async function coreOeeleri(db: Db, kullanici: Kullanici, gunler: readonly string[], simdi: Date): Promise<Map<string, number | null>> {
  const sonuc = new Map<string, number | null>();
  const makineOeeleri = coreOeeCozucusu;
  if (makineOeeleri === null || !kullanici.islemler.includes('oee.oku')) return sonuc;
  const kodlar = new Map((await s.eslemeler(db, 'makine')).map((e) => [e.tmiId, e.smartesKod]));
  if (kodlar.size === 0) return sonuc;
  for (const gun of gunler) {
    for (const m of await makineOeeleri(db, kullanici, { baslangic: gun, bitis: gun }, simdi.getTime())) {
      const kod = kodlar.get(m.id);
      if (kod !== undefined) sonuc.set(`${gun}|${kod}`, yuzde(m.oee));
    }
  }
  return sonuc;
}

export async function hesaplar(db: Db, kullanici: Kullanici, simdi: Date = new Date()): Promise<HesaplarCevabi> {
  const ilkGun = tesisGunu(simdi.getTime() - OEE_PENCERESI_GUN * 86_400_000);
  const oeeler = await s.oeeSatirlari(db, ilkGun, HESAP_SATIR_SINIRI);
  const bugun = tesisGunu(simdi.getTime());
  // Gelecek tarihli vardiya satırı için CORE hesabı istenmez.
  const core = await coreOeeleri(db, kullanici, [...new Set(oeeler.map((o) => o.vardiyaTarihi))].filter((g) => g <= bugun), simdi);
  const cevrimler = await s.cevrimSatirlari(db, HESAP_SATIR_SINIRI);
  const isler = cevrimler.length === 0 ? [] : await planlanacakIsEmirleri(db);
  const malzemeler = await malzemeOzetleri(db, isler.map((i) => i.malzemeNo));
  const tanimli = tanimliSaniyeler(isler.flatMap((i) => {
    const m = malzemeler.get(i.malzemeNo);
    return m === undefined ? [] : [{ stokNo: m.kod, opNo: i.opNo, birimSureDk: i.birimSureDk }];
  }));
  return {
    oee: oeeler.map((o) => ({
      vardiyaTarihi: o.vardiyaTarihi, vardiya: o.vardiya, makineKodu: o.makineKodu, ...oeeYuzdeleri(o),
      coreOee: core.get(`${o.vardiyaTarihi}|${o.makineKodu}`) ?? null,
    })),
    cevrim: cevrimler.map((c) => ({
      stokNo: c.stokNo, operasyonKodu: c.operasyonKodu, makineKodu: c.makineKodu, gercekMetni: c.cevrimMetni, gercekSaniye: cevrimSaniyesi(c.cevrimMetni),
      tanimliSaniye: tanimli.get(tanimliAnahtari(c.stokNo, c.operasyonKodu)) ?? null, parcaSayisi: c.parcaSayisi, gunSayisi: c.gunSayisi,
    })),
  };
}

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

/* ---------------- Makine bulguları (kart 3192, adım D1) ---------------- */

type Bulgu = MakineBulgulariCevabi['bulgular'][number];
type Ton = Bulgu['ton'];
type Hucre = { metin: string | null; ton: Ton };
const BOS_HUCRE: Hucre = { metin: null, ton: 'pasif' };
const DURUM_ADI: Record<MakineDurumu, string> = {
  calisiyor: 'Çalışıyor', bekliyor: 'Bekliyor', alarm: 'Alarm', kapali: 'Kapalı', 'baglanti-yok': 'Bağlantı yok', bilinmiyor: 'Bilinmiyor',
};
const DURUM_TONU: Record<MakineDurumu, Ton> = { calisiyor: 'tamam', bekliyor: 'uyari', alarm: 'hata', kapali: 'pasif', 'baglanti-yok': 'pasif', bilinmiyor: 'pasif' };
const SAAT = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
const GUN = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'numeric' });
const saat = (iso: string): string => SAAT.format(new Date(iso));
const sayi = (n: number): string => n.toLocaleString('tr-TR');
const enKotu = (tonlar: readonly Ton[]): Ton => (tonlar.includes('hata') ? 'hata' : tonlar.includes('uyari') ? 'uyari' : 'tamam');

// Adım D1: canlı durum, nedensiz duruş, sayım farkı, termin, tekrar eden alarm ve üç grafik. Program, çevrim, OEE, ilerleme oranı ve takım
// yükü sonraki adımlardadır: kutuları "veri yok" der (null), sıfır uydurulmaz.
export async function makineBulgulari(db: Db, istemci: SmartesIstemcisi | null, simdi: Date = new Date()): Promise<MakineBulgulariCevabi> {
  const okumaAcik = baglantiDurumu(await sistemAyariOku(db, 'smartes.baglanti'), istemci) === 'acik' && (await sistemAyariOku(db, MAKINE_AYARI));
  const iz = await s.makineOkumaIzi(db);
  if (!okumaAcik) return { okumaAcik, sonOkuma: iz?.sonBasarili ?? null, kutular: [], bulgular: [], karne: [], grafikler: null };
  const simdiMetni = simdi.toISOString();
  const gunBasi = new Date(tesisGunBasi(tesisGunu(simdi)));
  const makinelerListesi = await s.makineDurumlari(db, MAKINE_SATIR_SINIRI);
  const ad = new Map(makinelerListesi.map((m) => [m.makineKodu, m.makineAdi]));
  const coreKodu = new Map((await s.eslemeler(db, 'makine')).map((e) => [e.smartesKod, e.tmiId]));
  const smartesKodu = new Map([...coreKodu].map(([k, id]) => [id, k]));

  const degisimler = new Map<string, { onceki: MakineDurumu | null; liste: { zaman: string; yeni: MakineDurumu }[] }>();
  for (const d of await s.gunDegisimleri(db, gunBasi, null)) {
    const k = degisimler.get(d.makineKodu) ?? { onceki: null, liste: [] };
    if (d.onceki) k.onceki = d.yeni;
    else k.liste.push({ zaman: d.zaman, yeni: d.yeni });
    degisimler.set(d.makineKodu, k);
  }
  const duruslar = await s.durusAraliklari(db, gunBasi, simdi);
  const cizelge = new Map<string, CizelgeParcasi[]>(makinelerListesi.map((m) => {
    const g = degisimler.get(m.makineKodu);
    return [m.makineKodu, cizelgeParcalari(bugunDilimleri(gunBasi.toISOString(), g?.onceki ?? null, g?.liste ?? []), duruslar.filter((x) => x.makineKodu === m.makineKodu), simdiMetni)];
  }));

  // SmartES iş emri no'su giden kutusundan CORE iş emrine, oradan emir no ve opa bağlanır; bağlanamayan satırda emir boş kalır.
  const sayimlar = await s.gunSayimlari(db, gunBasi);
  const ilerlemeler = await s.butunIlerlemeler(db);
  const giden = new Map((await s.gidenNolari(db, [...sayimlar.flatMap((x) => (x.isEmriNo === null ? [] : [x.isEmriNo])), ...ilerlemeler.map((x) => x.isEmriNo)]))
    .map((g) => [g.no, g.isEmriId]));
  const isEmirleri = await isEmriOzetleri(db, [...giden.values()]);
  const zamanlar = await isEmriZamanlari(db, [...giden.values()]);
  const emri = (no: string | null) => {
    const id = no === null ? undefined : giden.get(no);
    const ie = id === undefined ? undefined : isEmirleri.get(id);
    return { emirNo: ie?.emirNo ?? null, opNo: ie?.opNo ?? null, id: id ?? null, ie };
  };

  const bulgular: Bulgu[] = [];
  const bulgu = (b: Omit<Bulgu, 'makineAdi'>) => { bulgular.push({ ...b, makineAdi: ad.get(b.makineKodu) ?? null }); };
  const nedensizDk = new Map<string, number>();
  for (const [kod, parcalar] of cizelge) {
    for (const n of nedensizDuruslar(parcalar, simdiMetni)) {
      nedensizDk.set(kod, (nedensizDk.get(kod) ?? 0) + n.sureDk);
      bulgu({
        id: `durus:${kod}:${n.baslangic}`, tur: 'durus', ton: n.suruyor ? 'hata' : 'uyari', makineKodu: kod, emirNo: null, opNo: null,
        baslik: n.suruyor ? `${n.sureDk} dakikadır duruyor, duruş nedeni girilmemiş` : `${saat(n.baslangic)}–${saat(n.bitis)} arası ${n.sureDk} dk nedeni girilmemiş duruş`,
        hesap: `Çalışmıyor ${saat(n.baslangic)}–${n.suruyor ? 'şimdi' : saat(n.bitis)} = ${n.sureDk} dk (eşik 3 dk); bu aralıkta nedenli duruş kaydı yok`,
        ne: 'Operatör terminalde duruş nedenini seçer; süre makineden gelir.', zaman: n.baslangic,
      });
    }
  }
  const sayimHucresi = new Map<string, Hucre>();
  let enBuyukFark = 0;
  let enBuyukFarkliMakine: string | null = null;
  for (const x of sayimlar) {
    const k = sayimKarsilastir(x);
    if (k === null) continue;
    const e = emri(x.isEmriNo);
    sayimHucresi.set(x.makineKodu, { metin: `${sayi(k.makine)} / ${sayi(k.operator)}`, ton: k.asti ? 'hata' : 'tamam' });
    if (!k.asti) continue;
    if (Math.abs(k.fark) > enBuyukFark) { enBuyukFark = Math.abs(k.fark); enBuyukFarkliMakine = x.makineKodu; }
    bulgu({
      id: `sayim:${x.makineKodu}:${x.isEmriNo ?? ''}`, tur: 'sayim', ton: 'hata', makineKodu: x.makineKodu, emirNo: e.emirNo, opNo: e.opNo,
      baslik: `makine ${sayi(k.makine)} saydı, operatör ${sayi(k.operator)} girdi`,
      hesap: `Makine ${sayi(k.makine)}; operatör sağlam + red ${sayi(k.operator)}; fark ${sayi(Math.abs(k.fark))} (tolerans ${k.tolerans})`,
      ne: 'Sayım kontrol edilir: girilmemiş fire ya da ayar parçası olabilir.', zaman: x.sonOkuma,
    });
  }
  const bitisHucresi = new Map<string, Hucre>();
  for (const il of ilerlemeler) {
    const e = emri(il.isEmriNo);
    const teslim = e.id === null ? null : (zamanlar.get(e.id)?.emirTeslim ?? null);
    const kaynak = e.ie?.kaynak;
    const kod = kaynak?.tur === 'makine' ? smartesKodu.get(kaynak.id) : undefined;
    if (il.tahminiBitis === null || kod === undefined) continue;
    const gecikme = teslim === null ? null : terminAsimi(il.tahminiBitis, teslim);
    bitisHucresi.set(kod, { metin: saat(il.tahminiBitis), ton: gecikme === null ? 'tamam' : 'hata' });
    if (gecikme === null || teslim === null) continue;
    bulgu({
      id: `bitis:${il.isEmriNo}`, tur: 'bitis', ton: 'hata', makineKodu: kod, emirNo: e.emirNo, opNo: e.opNo,
      baslik: `iş ${GUN.format(new Date(il.tahminiBitis))} ${saat(il.tahminiBitis)}’te biter, termin ${GUN.format(new Date(`${teslim}T12:00:00Z`))}`,
      hesap: `SmartES tahmini bitiş ${GUN.format(new Date(il.tahminiBitis))} ${saat(il.tahminiBitis)}; emrin teslimi ${teslim}; ${gecikme} gün geç`,
      ne: 'Planlama sıraya bakar: vardiya uzatılır ya da iş bölünür.', zaman: simdiMetni,
    });
  }
  const alarmSayisi = new Map<string, Hucre>();
  for (const a of await s.alarmTekrarlari(db, new Date(simdi.getTime() - 7 * 86_400_000))) {
    const t = alarmTekrarTonu(a.gunler, simdiMetni);
    const onceki = alarmSayisi.get(a.makineKodu);
    const n = a.gunler.length + Number(onceki?.metin ?? 0);
    alarmSayisi.set(a.makineKodu, { metin: String(n), ton: enKotu([onceki?.ton ?? 'tamam', t?.ton ?? 'tamam']) });
    if (t === null) continue;
    bulgu({
      id: `alarm:${a.makineKodu}:${a.alarmKodu}`, tur: 'alarm', ton: t.ton, makineKodu: a.makineKodu, emirNo: null, opNo: null,
      baslik: `“${a.aciklama ?? a.alarmKodu}” 7 günde ${t.sayi} kez`,
      hesap: `Alarm ${a.alarmKodu}: ${a.gunler.map((g) => GUN.format(new Date(g))).join(', ')} = ${t.sayi} kez (eşik 3)`,
      ne: 'Bakıma bildirilir.', zaman: a.son,
    });
  }
  bulgular.sort((a, b) => (a.ton === b.ton ? b.zaman.localeCompare(a.zaman) : a.ton === 'hata' ? -1 : b.ton === 'hata' ? 1 : 0));

  const say = (tur: Bulgu['tur']) => bulgular.filter((b) => b.tur === tur);
  const kutu = (tur: Bulgu['tur'], alt: string | null) => {
    const b = say(tur);
    return { tur, deger: String(b.length), alt: b.length === 0 ? null : alt, ton: b.length === 0 ? 'tamam' as const : enKotu(b.map((x) => x.ton)) };
  };
  const yok = (tur: Bulgu['tur']) => ({ tur, deger: null, alt: null, ton: 'pasif' as const });
  const calisan = makinelerListesi.filter((m) => m.durum === 'calisiyor').length;
  const alarmda = makinelerListesi.filter((m) => m.durum === 'alarm').length;
  const bekleyen = makinelerListesi.filter((m) => m.durum === 'bekliyor').length;
  const toplamNedensiz = [...nedensizDk.values()].reduce((t, n) => t + n, 0);
  // Durumu okunabilen makine yoksa çalışan ve nedensiz duruş sayılamaz: sıfır değil "veri yok".
  const durumBilinen = makinelerListesi.some((m) => m.durum !== 'bilinmiyor');
  const kutular: MakineBulgulariCevabi['kutular'] = [
    durumBilinen
      ? { tur: 'durum', deger: `${calisan} / ${makinelerListesi.length}`, alt: `çalışıyor · ${alarmda} alarm, ${bekleyen} bekliyor`, ton: alarmda > 0 ? 'hata' : bekleyen > 0 ? 'uyari' : 'tamam' }
      : { tur: 'durum', deger: null, alt: null, ton: 'pasif' },
    durumBilinen ? kutu('durus', `toplam ${toplamNedensiz} dk nedensiz`) : yok('durus'),
    kutu('sayim', `en büyük fark ${sayi(enBuyukFark)} adet`),
    yok('program'), yok('cevrim'),
    kutu('bitis', 'termini geçen iş'),
    yok('oee'), yok('oran'), yok('yuk'),
    kutu('alarm', '7 günde 3 ve üzeri'),
  ];
  const karne = makinelerListesi.map((m) => ({
    makineKodu: m.makineKodu, makineAdi: m.makineAdi,
    hucreler: {
      durum: { metin: DURUM_ADI[m.durum], ton: DURUM_TONU[m.durum] },
      durus: nedensizDk.has(m.makineKodu) ? { metin: `${nedensizDk.get(m.makineKodu)} dk`, ton: say('durus').some((b) => b.makineKodu === m.makineKodu && b.ton === 'hata') ? 'hata' as const : 'uyari' as const } : BOS_HUCRE,
      sayim: sayimHucresi.get(m.makineKodu) ?? BOS_HUCRE,
      program: BOS_HUCRE, cevrim: BOS_HUCRE,
      bitis: bitisHucresi.get(m.makineKodu) ?? BOS_HUCRE,
      oee: BOS_HUCRE, oran: BOS_HUCRE, yuk: BOS_HUCRE,
      alarm: alarmSayisi.get(m.makineKodu) ?? { metin: '0', ton: 'tamam' as const },
    },
  }));

  // Duruş nedenleri: bugünkü SmartES duruş süreleri, nedeni CORE'daki eşlenmiş adıyla; nedensiz toplam ayrı çubuk.
  const nedenAdlari = new Map<string, string>();
  const nedenler = new Map((await durusNedenleriniListele(db, { yalnizAktif: false })).map((n) => [n.id, n.ad]));
  for (const e of await s.eslemeler(db, 'durus-nedeni')) { const a = nedenler.get(e.tmiId); if (a !== undefined) nedenAdlari.set(e.smartesKod, a); }
  const nedenDk = new Map<string, number>();
  for (const d of duruslar) {
    if (d.nedenKodu === null) continue;
    const bas = Math.max(Date.parse(d.baslangic), gunBasi.getTime());
    const bit = Math.min(d.bitis === null ? simdi.getTime() : Date.parse(d.bitis), simdi.getTime());
    if (bit <= bas) continue;
    const etiket = nedenAdlari.get(d.nedenKodu) ?? d.nedenKodu;
    nedenDk.set(etiket, (nedenDk.get(etiket) ?? 0) + (bit - bas) / 60_000);
  }
  const durusCubuklari = [...[...nedenDk].map(([etiket, dk]) => ({ etiket, deger: Math.round(dk) })), ...(toplamNedensiz > 0 ? [{ etiket: 'Nedeni girilmemiş', deger: toplamNedensiz }] : [])]
    .filter((x) => x.deger > 0).sort((a, b) => b.deger - a.deger);

  // Sayım eğrisi: en büyük farkı olan makine (yoksa sayımı olan ilk makine), gün başından bu saate saat saat.
  const saatBaslari: number[] = [];
  for (let t = gunBasi.getTime(); t <= simdi.getTime(); t += 3_600_000) saatBaslari.push(t);
  const secilen = enBuyukFarkliMakine ?? sayimlar[0]?.makineKodu ?? null;
  let sayimGrafigi: NonNullable<MakineBulgulariCevabi['grafikler']>['sayim'] = null;
  if (secilen !== null && saatBaslari.length > 0) {
    const makine = birikimliSayac(await s.ornekler(db, secilen, gunBasi, simdi), saatBaslari);
    const seriler = [{ ad: 'Makine sayacı', degerler: makine }];
    const coreId = coreKodu.get(secilen);
    if (coreId !== undefined) {
      const sinirlar = [...saatBaslari, simdi.getTime()].map((t) => new Date(t).toISOString());
      let toplam = 0;
      seriler.push({ ad: 'Operatör (CORE)', degerler: (await gunlukAralikAdetleri(db, 'makine', [coreId], sinirlar)).map((g) => {
        const a = g.get(coreId);
        toplam += (a?.saglam ?? 0) + (a?.hurda ?? 0);
        return toplam;
      }) });
    }
    sayimGrafigi = { makineKodu: secilen, etiketler: saatBaslari.map((t) => saat(new Date(t).toISOString())), seriler };
  }
  const bitis = new Date(Math.ceil(simdi.getTime() / 3_600_000) * 3_600_000).toISOString();
  return {
    okumaAcik, sonOkuma: iz?.sonBasarili ?? null, kutular, bulgular, karne,
    grafikler: {
      cizelge: { baslangic: gunBasi.toISOString(), bitis, simdi: simdiMetni, satirlar: [...cizelge].map(([makineKodu, parcalar]) => ({ makineKodu, parcalar: parcalar.map((p) => ({ ...p, not: p.not === null ? '' : (nedenAdlari.get(p.not) ?? p.not) })) })) },
      duruslar: durusCubuklari,
      sayim: sayimGrafigi,
    },
  };
}
/* ---------------- Adet onayı (3173 b, 3193 a; ADR 0013 eki) ---------------- */

// Okunan satırın onaya girmemiş farkı kuyruğa yazılır. Yalnız sayım kaynağı SmartES olan istasyonun, o istasyon SmartES'e geçtikten
// sonra başlamış satırı girer (gecerlilik null: istasyon terminalden sayılıyor, satır yalnız SmartES sayfasında durur). Red adedi fire
// eşlemesi (3174) gelince kuyruğa girer: şimdi yazılırsa o güne dek reddedilmiş sayılıp bir daha gelmezdi.
// Aynı satırı iki okuma aynı anda kuyruğa yazamaz: çağıran önce durum satırını yazar, satır kilidi ikinciyi bekletir ve o, ilkinin farkını görür.
// Sayımı SmartES'ten gelen istasyonlar ve satırın onaya girebileceği en erken başlangıç: istasyonun SmartES'e geçtiği an ile "SmartES:
// sayım aktarımı" anahtarının açık görüldüğü ilk andan geç olanı. Anahtar kapalıyken boştur: hiçbir satır onaya girmez ve onaylanamaz.
// Anahtar kapalıyken başlamış satır açılınca da girmez (geçmiş toptan aktarılmaz).
export async function sayimGecerlilikleri(db: Db, zaman: Date): Promise<Map<number, Date>> {
  const acilis = await s.aktarimAcilisiYaz(db, await sistemAyariOku(db, SAYIM_AKTARIMI_AYARI), zaman);
  if (acilis === null) return new Map();
  return new Map([...(await smartesSayimIstasyonlari(db))].map(([id, g]) => [id, g.getTime() > acilis.getTime() ? g : acilis]));
}

// Satırın istasyonu CORE iş emrinden bulunur (giden kutusundaki tek karşılık); iş emri bulunamıyorsa SmartES iş istasyonu kodunun
// eşlemesinden. İstasyon bulunamıyorsa ya da terminalden sayılıyorsa null: satır onaya girmez.
async function sayimGecerliligi(db: Db, k: IsEmriDurumuKaydi, zaman: Date): Promise<Date | null> {
  const kaynaklar = await sayimGecerlilikleri(db, zaman);
  if (kaynaklar.size === 0) return null;
  const isEmriId = await s.tekGidenIsEmri(db, k.isEmriNo);
  const istasyonId = isEmriId !== null
    ? ((await isEmriOzeti(db, isEmriId))?.istasyonId ?? null)
    : (k.istasyonKodu === null ? null : ((await s.eslemeler(db, 'istasyon')).find((e) => e.smartesKod === k.istasyonKodu)?.tmiId ?? null));
  return istasyonId === null ? null : (kaynaklar.get(istasyonId) ?? null);
}

export async function adetOnayinaAl(db: Db, k: IsEmriDurumuKaydi, zaman: Date, gecerlilik: Date | null): Promise<number> {
  if (gecerlilik === null || !onayaGirerMi(k.baslangic, gecerlilik)) return 0;
  const farklar = adetOnayFarklari({ saglam: k.saglam, red: null }, await s.onayToplamlari(db, k.smartesId));
  for (const f of farklar) await s.onaySatiriEkle(db, { smartesId: k.smartesId, ...f, zaman });
  return farklar.length;
}

export async function adetOnaylari(db: Db, q: Sayfa & { gorunum: 'bekliyor' | 'karar' }): Promise<AdetOnaylariCevabi> {
  const cevap = await sayfaliListe(q, { say: () => s.onaySay(db, q.gorunum), satirlar: (d) => s.onaySatirlari(db, q.gorunum, d) });
  const isEmirleri = await isEmriOzetleri(db, cevap.satirlar.flatMap((x) => (x.isEmriId === null ? [] : [x.isEmriId])));
  const adlar = await kisiAdlari(db, cevap.satirlar.flatMap((x) => (x.kararVerenKisiId === null ? [] : [x.kararVerenKisiId])));
  return {
    ...cevap,
    satirlar: cevap.satirlar.map(({ isEmriId, kararVerenKisiId, ...x }) => {
      const ie = isEmriId === null ? undefined : isEmirleri.get(isEmriId);
      return {
        ...x,
        emirId: ie?.uretimEmriId ?? null, emirNo: ie?.emirNo ?? null, opNo: ie?.opNo ?? null,
        kararVeren: kararVerenKisiId === null ? null : (adlar.get(kararVerenKisiId) ?? null),
      };
    }),
  };
}

// Her satır kendi kayıt noktasında işlenir: biri reddedilirse (adım çalışmıyor, emir kapalı) ötekiler yine yazılır, reddedilen nedeniyle döner
// ve onay bekler. Sayım üretim-emirleri komutundan geçer; makine SmartES makine eşlemesinden verilir, eşlenmemişse komut seçer.
export async function adetOnayla(db: Db, kisiId: number, idler: readonly number[]): Promise<AdetKarariCevabi> {
  const makineler = new Map((await s.eslemeler(db, 'makine')).map((e) => [e.smartesKod, e.tmiId]));
  const simdi = new Date();
  const kaynaklar = await sayimGecerlilikleri(db, simdi);
  const zaman = simdi.toISOString();
  let islenen = 0;
  const hatalar: AdetKarariCevabi['hatalar'] = [];
  for (const id of new Set(idler)) {
    const r = await kayitNoktasi(db, async () => {
      const satir = await s.onaySatiriKilitle(db, id);
      if (satir === null || satir.durum !== 'bekliyor') throw cakisma(ONAY_ILETILERI.karardaDegil);
      if (satir.tur !== 'saglam') throw cakisma(ONAY_ILETILERI.redIslenmez);
      const ie = satir.isEmriId === null ? null : await isEmriOzeti(db, satir.isEmriId);
      if (ie === null) throw cakisma(ONAY_ILETILERI.isEmriYok);
      // Satır beklerken istasyon terminale alınmış (ya da aktarım kapatılmış) olabilir: o üretimi terminal sayar, onay ikinci kez yazardı.
      const gecerlilik = ie.istasyonId === null ? undefined : kaynaklar.get(ie.istasyonId);
      if (gecerlilik === undefined || !onayaGirerMi(satir.baslangic, gecerlilik)) throw cakisma(ONAY_ILETILERI.kaynakDegisti);
      const makineId = satir.makineKodu === null ? undefined : makineler.get(satir.makineKodu);
      await smartesSayimi(db, kisiId, ie.uretimEmriId, { tur: 'saglam', adet: satir.adet, ...(makineId === undefined ? {} : { makineId }) }, { onayKimligi: id, isEmriId: ie.id });
      await s.onayKarariYaz(db, id, { durum: 'onaylandi', kisiId, zaman, redNedeni: null });
    });
    if (r.tamam) islenen++;
    else hatalar.push({ id, ileti: r.hata.message });
  }
  return { islenen, hatalar };
}

// Red CORE'a yazmaz ve SmartES'e dokunmaz (ADR 0013 karar 6); reddedilen adet aynı satırdan yeniden gelmez.
export async function adetReddet(db: Db, kisiId: number, idler: readonly number[], neden: string): Promise<AdetKarariCevabi> {
  const zaman = new Date().toISOString();
  let islenen = 0;
  const hatalar: AdetKarariCevabi['hatalar'] = [];
  for (const id of new Set(idler)) {
    if (await s.onayKarariYaz(db, id, { durum: 'reddedildi', kisiId, zaman, redNedeni: neden })) islenen++;
    else hatalar.push({ id, ileti: ONAY_ILETILERI.karardaDegil });
  }
  return { islenen, hatalar };
}
