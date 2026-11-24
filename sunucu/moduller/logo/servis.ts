import type { Db, Veritabani } from '#cekirdek/db.ts';
import { kayitNoktasi } from '#cekirdek/db.ts';
import { bulunamadi, gecersiz, UygulamaHatasi } from '#cekirdek/hata.ts';
import { LOGO_AYARLARI } from '#paylasilan/ayarlar/logo.ts';
import { LOGO_CRM_DENETIM_SINIRI } from '#paylasilan/sozlesme/logo-gecisi-sabitleri.ts';
import type { BirimSetleriCevabi, LogoBaglanabilirTur, LogoBelgeAramaCevabi, LogoBelgeAramaTuru, LogoCariHazirlikCevabi, LogoCrmCevabi, LogoCrmDenetimiCevabi, LogoCrmKodCevabi, LogoBaglantiDurumu, LogoGidenIzlemeCevabi, LogoRozetCevabi, LogoRozetTuru, LogoHazirlikCevabi, LogoKontrolCevabi } from '#paylasilan/sozlesme/logo.ts';
import { LOGO_BAGLANABILIR_TURLER, LOGO_MALZEME_ARAMA_EN_AZ, LOGO_MALZEME_ARAMA_EN_COK, LOGO_MALZEME_ARAMA_SONUCU } from '#paylasilan/sozlesme/logo.ts';
import type { FisGonderimSekli, LogoFisBilgisi, MalzemeFisiTuru } from '#paylasilan/sozlesme/stok.ts';
import { modulAyariDegistir, sistemAyariOku } from '../ayarlar/disari.ts';
import { firmaOzeti, firmaOzetleri, tumFirmalar } from '../musteri-tedarikci/disari.ts';
import { logoBirimSetiKullaniliyorMu, logoKartDurumlari, logoKayitNolari, logoyaGidecekMalzemeler, malzemeLogoSonucu } from '../malzemeler/disari.ts';
import type { LogoyaGidecekMalzeme, MalzemeLogoSonucu } from '../malzemeler/disari.ts';
import { yardimciSurumu, yardimciSurumunuSor } from './yardimci-surumu.ts';
import type { KopruIstemcisi, SatirliSonuc } from './kopru.ts';
import {
  BELIRSIZ_BEKLEME_MS, SONUCU_BILINMIYOR, bekletmeGovdesi, denemeZamaniMi, durduMu, durduNeYapmali, GIDEN_NE_YAPMALI, gidenBelgeAdi, gidenIzlemeDurumu, kontrolEdilebilirMi, KONTROL_NE_YAPMALI, kartBekliyorMetni, logodaOlmayanKartlar, TALEP_HIZMET_ILETISI, eklemeGovdesi, kodCakismasiMetni, guncellemeEslemesi, HIZMET_ALANLARI, kapatmaGovdesi, karsilamaGovdesi, karsilamaKaydiBul, malzemeGuncellemeGovdesi, siparisGuncellemeGovdesi, talepGovdesi, satirEslemesi, siparisGovdesi, gecerliBirimSetleri, geriCekilmeMs, hizmetGovdesi, HIZMET_AYARI, MALZEME_GONDERIM_AYARI, kartEylemi, kirp, KUYRUK_SINIRI,
  FATURA_TUR_SINIRI, FATURA_YENIDEN_OKUMA_MS, FIS_GONDERIM_AYARI, gonderimSekli, LOGO_FIS_TURLERI, logoFisDurumu, STOK_FISI_LOGO_TURU, stokFisindenLogoFisi, kontrolAdiminiYorumla, listeOkunmaliMi, malzemeFisiGovdesi, malzemeFisiOzeti, eskiEmirFisiNo, FIS_NO_EN_COK, logoFisNumarasi, OKUMA_HATA_BEKLEME_MS, LOGO_AKISLARI, LOGO_KONTROL_ADIMLARI, logoAkisDurumu, satisSiparisiGovdesi, satisTeklifiGovdesi,
  belgeStokKodlari, CARI_ARAMA_EN_AZ, CARI_ARAMA_EN_COK, logoKodlarinaCevir, sayfaliOkumaSirasi,
} from './kurallar.ts';
import type { GidenIzlemeDurumu, LogoCari, LogoKullanimSatiri, LogoMalzemeKarti, LogoStokSatiri, Sayfa } from './kurallar.ts';
import type { FisDurumSorusu, GonderilecekKarsilama, GonderilecekMalzemeFisi, StokFisi, StokFisSatiri, GonderilecekSatisSiparisi, GonderilecekSatisTeklifi, GonderilecekSiparis, GonderilecekTalep, GuncellenecekSiparisSatiri, HizmetYonu, KopruSonucu } from './kurallar.ts';
import * as s from './sorgular.ts';
import { BELGE_ARAMA_GIDEN_TURU, BELGE_ARAMA_TURU, crmDurumu, crmKodlari, crmSorguyuKeser, crmSorunu, seciliCrmEngeli, crmSorulurMu, PROJE_AYARI, ROZET_BELGELERI, belgeRozetDurumu, teklifBeklerkenSiparisRozeti, bekleyenTaze, projeBekliyorMetni, projeBekliyorNedeni, projeliGovde, satisSiparisiProjesi } from './kurallar.ts';
import { projeGetir, siparisinProjeleri } from '../projeler/disari.ts';
import { logoSiraBelgeleri, logoSiralari, logoSiparisTeklifSiralari } from '../siparisler/disari.ts';
import { aramayiHatirla, baglanacakBelge, baglanacakOzeti, bulguBaglamasi, satisElleEngeli } from './elle-bag.ts';
import type { BelgeTuru, FisTuru, GidenIslemi, GidenSatiri, GidenSonucu } from './sorgular.ts';

// Sürecin belleği: veritabanı geri alınsa da süreç içinde çift açmayı önler. Süreç yeniden başlayınca boştur;
// o zaman kalıcı niyet ve BELIRSIZ_BEKLEME_MS korur.
export interface SurecBellegi {
  // Bu süreçte yazılan, henüz kullanılmamış niyetler: kart no -> niyet zamanı (ms).
  niyetler: Map<number, number>;
  // Bu süreçte gönderilen son açma isteği: kart no -> zaman.
  acmaIstekleri: Map<number, Date>;
  // Birim seti listesinin son okuma denemesi; başarısız okuma her turda yinelenmez.
  sonListeDenemesi: Date | null;
  // Okuma akışlarının son denemesi (akış anahtarı -> zaman): başarısız okuma OKUMA_HATA_BEKLEME_MS dolmadan yinelenmez.
  okumaDenemeleri: Map<string, Date>;
  // 3345 a: irsaliye okumasının ardışık hata sayısı ve son hatası (bekleme her hatada artar).
  irsaliyeHatasi: { sayi: number; son: Date } | null;
  // 3313: "Kart bekliyor" iletisi sahibine bir kez yazılır (belge anahtarı -> ileti); ileti değişince yeniden.
  kartBekleyenler: Map<number, string>;
}

export const yeniSurecBellegi = (): SurecBellegi => ({ niyetler: new Map(), acmaIstekleri: new Map(), sonListeDenemesi: null, okumaDenemeleri: new Map(), irsaliyeHatasi: null, kartBekleyenler: new Map() });

// İş "bekliyor" dönerken sağlık ayrıntısında görünen nedenler: sabit metin, değer taşımaz.
export const BEKLEME_NEDENLERI = {
  // Gönderim ve okuma işleri aynı nedeni paylaşır: okuma işinde biriken kayıt yoktur, metin ikisine de doğru olmalı.
  kapali: 'Logo bağlantısı Sistem Ayarları\'nda kapalı; istek atılmıyor. Logo\'ya gidecek kayıtlar birikir, Logo\'dan okuma yapılmaz.',
  'satin-alma-kapali': 'Logo satın alma gönderimi Sistem Ayarları\'nda kapalı; talep ve siparişler birikiyor, istek atılmıyor.',
  'satis-kapali': 'Logo satış gönderimi Sistem Ayarları\'nda kapalı; teklif ve siparişler birikiyor, istek atılmıyor.',
  'mal-kabul-kapali': 'Logo mal kabul okuması Sistem Ayarları\'nda kapalı; istek atılmıyor.',
  'liste-kapali': 'Logo cari ve ambar listesi okuması Sistem Ayarları\'nda kapalı; istek atılmıyor.',
  'fatura-kapali': 'Logo fatura okuması Sistem Ayarları\'nda kapalı; istek atılmıyor.',
  'malzeme-fisi-kapali': 'Logo malzeme fişi gönderimi Sistem Ayarları\'nda kapalı; fişler birikiyor, istek atılmıyor.',
  'malzeme-karti-kapali': 'Logo malzeme kartı okuması Sistem Ayarları\'nda kapalı; istek atılmıyor.',
  'stok-kapali': 'Logo stok okuması Sistem Ayarları\'nda kapalı; istek atılmıyor.',
  'kullanim-kapali': 'Logo malzeme kullanım okuması Sistem Ayarları\'nda kapalı; istek atılmıyor.',
  'irsaliye-kapali': 'Logo irsaliye okuması Sistem Ayarları\'nda kapalı; istek atılmıyor.',
  'son-alis-kapali': 'Logo son alış fiyatı kopyası Sistem Ayarları\'nda kapalı; istek atılmıyor.',
  'fatura-listesi-kapali': 'Logo fatura listesi okuması Sistem Ayarları\'nda kapalı; istek atılmıyor.',
  'cari-hareket-kapali': 'Logo cari hareket okuması Sistem Ayarları\'nda kapalı; istek atılmıyor.',
  'proje-kapali': 'Logo proje kartı gönderimi Sistem Ayarları\'nda kapalı; projeler gönderilmiyor, belgeler proje kodu olmadan gidiyor.',
  'dis-duzeltme-kapali': 'Logo\'da açılmış siparişi düzeltme kapalı (TMIV2_LOGO_SIPARIS_DUZELTME); istek atılmıyor.',
  'ortam-degiskeni-yok': 'Logo bağlantısı açık ama TMIV2_LOGO_KOPRU_ADRESI ve TMIV2_LOGO_KOPRU_ANAHTARI tanımlı değil; istek atılmıyor.',
} as const;

export interface TurOrtami {
  // null: köprü değişkenleri yok. Anahtar kapalıysa da hiçbir istek atılmaz, hiçbir şey yazılmaz.
  kopru: KopruIstemcisi | null;
  bellek: SurecBellegi;
  saat: () => Date;
  // 3445: "Şimdi oku" anı; saatlik iç aralığı olan okumalar (liste, malzeme kodu, son alış) bu andan eski okumayı beklemez.
  zorlaAni?: Date | null;
  // Yalnız test verir; üretimde Sistem Ayarları'ndaki yön anahtarları geçerlidir (HIZMET_AYARI).
  hizmetAcik?: Readonly<Record<HizmetYonu, boolean>>;
  // Yalnız test verir; üretimde "Logo: malzeme kartı gönderimi" geçerlidir (MALZEME_GONDERIM_AYARI).
  malzemeAcik?: boolean;
  // Logo'ya gitmiş kartın ad güncellemesi (S4 b): kuyruğu ve sonucu malzemelerin işlevleridir; gelene kadar verilmez (UYUM-BORCU).
  malzemeGuncelleme?: MalzemeGuncellemeKaynagi;
  // Silinen Logo kartının Logo'da pasife alınması (2114b, 2114-7, ADR 0017 madde 8): kuyruğu ve sonucu malzemelerin işlevleridir.
  malzemePasif?: MalzemePasifKaynagi;
}

export interface LogoyaGuncellemeGidecekMalzeme {
  no: number;
  stokKodu: string;
  ad: string | null;
  logoKayitNo: string;
  tur: string;
  hizmetYonu: HizmetYonu | null;
  // Malzeme kartında Logo adı ve NAME3-NAME4 bunlardan çıkar (2115-1 a); kaynak vermezse yalnız TMI adı gider.
  aciklama1?: string | null;
  aciklama2?: string | null;
  aciklama3?: string | null;
}
export interface LogoyaPasifGidecekMalzeme {
  no: number;
  stokKodu: string;
  logoKayitNo: string;
  tur: string;
  hizmetYonu: HizmetYonu | null;
}
export interface MalzemePasifKaynagi {
  gidecekler(db: Db, sinir: number): Promise<LogoyaPasifGidecekMalzeme[]>;
  // `kalici`: Logo reddetti; sahibi yeniden denemez, kart pasif kalır.
  sonuc(db: Db, no: number, sonuc: { tamam: true } | { hata: string; kalici: boolean }): Promise<void>;
}
export interface MalzemeGuncellemeKaynagi {
  gidecekler(db: Db, sinir: number): Promise<LogoyaGuncellemeGidecekMalzeme[]>;
  // Gönderilen ad ve açıklamalar da gelir: kart bu arada yeniden değiştiyse sahibi kuyrukta tutar (malzemeler #783, 3491).
  sonuc(db: Db, no: number, sonuc: { ad: string | null; aciklama1?: string | null | undefined; aciklama2?: string | null | undefined; aciklama3?: string | null | undefined }
    & ({ tamam: true } | { hata: string })): Promise<void>;
}

// Kartın giden kutusundaki belge türü: hizmet Logo'da ayrı karttır.
const belgeTuru = (k: LogoyaGidecekMalzeme): BelgeTuru => (k.tur === 'hizmet' ? 'hizmet' : 'malzeme');

// Bir kartın köprüdeki iki adımı: "var mı" ve açma. Malzeme ve hizmet aynı kalkandan geçer.
interface Gonderim {
  belge: BelgeTuru;
  // null: "var mı" yolu yok (hizmet); kalkan yalnız niyetle çalışır, sonucu bilinmeyen istek kendiliğinden yinelenmez.
  varMi: (() => Promise<KopruSonucu>) | null;
  ekle: () => Promise<KopruSonucu>;
}

export type TurSonucu =
  | { tur: 'kapali' }
  | { tur: 'ortam-degiskeni-yok' }
  | { tur: 'bos' }
  | { tur: 'liste'; sonuc: 'okundu' | Exclude<KopruSonucu, { tur: 'basarili' }>['tur'] }
  | { tur: 'niyet'; no: number }
  | { tur: 'gonderim'; no: number; sonuc: GidenSonucu }
  | { tur: 'satin-alma-kapali' }
  | { tur: 'guncelleme' | 'pasif' | 'kapatma' | 'bekletme' | 'iptal' | 'karsilama'; no: number; sonuc: GidenSonucu }
  | { tur: 'pasif-niyet'; no: number }
  | { tur: 'satis-kapali' }
  | { tur: 'mal-kabul-kapali' | 'liste-kapali' | 'fatura-kapali' | 'malzeme-fisi-kapali' | 'malzeme-karti-kapali' | 'stok-kapali' | 'kullanim-kapali' | 'irsaliye-kapali' | 'son-alis-kapali' | 'fatura-listesi-kapali' | 'cari-hareket-kapali' }
  | { tur: 'okuma'; akis: 'mal-kabul' | 'cari' | 'ambar' | 'fatura' | 'malzeme-kodu' | 'malzeme-karti' | 'stok' | 'kullanim' | 'irsaliye' | 'son-alis' | 'fatura-listesi' | 'cari-hareket'; sonuc: 'okundu' | Exclude<KopruSonucu, { tur: 'basarili' }>['tur']; sayi: number; ileti?: string }
  | { tur: 'malzeme-fisi-niyet'; no: number }
  | { tur: 'malzeme-fisi'; no: number; sonuc: GidenSonucu }
  | { tur: `${NiyetliBelge}-niyet`; no: number }
  | { tur: NiyetliBelge; no: number; sonuc: GidenSonucu }
  | { tur: 'dis-duzeltme-kapali' }
  | { tur: 'proje-kapali' }
  | { tur: 'proje-kurulum-bekliyor'; ileti: string }
  | { tur: 'proje-niyet'; no: number }
  | { tur: 'proje'; no: number; sonuc: GidenSonucu }
  | { tur: 'dis-duzeltme'; no: number; sonuc: 'gonderildi' | 'reddedildi' | 'hata' | 'bekliyor' };

// "Var mı" okuması olmayan, yalnız niyetle açılan belgeler.
type NiyetliBelge = 'talep' | 'siparisler-teklifi' | 'siparisler-siparisi';

// Tur iki kısa transaction'dır, köprü cevabı ikisinin arasında, transaction dışında beklenir: Logo kaydı açtıktan sonra geri alınan
// transaction izi kaybettirmesin (UYUM-BORCU 2). İlk transaction okur, niyet ya da red yazar; köprü adımı istekleri atar ve sonucu
// yazacak işi döndürür. Arada kopan tur yinelenince niyet ve "var mı" aynı kaydı bulur, ikinci kayıt açılmaz.
export type TxAcan = Pick<Veritabani, 'tx'>;
export type Yazici<T> = (db: Db) => Promise<T>;
export type KopruAdimi<T = TurSonucu> = () => Promise<Yazici<T>>;

export async function turuKos(vt: TxAcan, hazirla: (db: Db) => Promise<TurSonucu | KopruAdimi>): Promise<TurSonucu> {
  const adim = await vt.tx(hazirla);
  if (typeof adim !== 'function') return adim;
  const yaz = await adim();
  return vt.tx(yaz);
}

const turla = (adim: KopruAdimi<GidenSonucu>, tur: (sonuc: GidenSonucu) => TurSonucu): KopruAdimi => async () => {
  const yaz = await adim();
  return async (db) => tur(await yaz(db));
};

function uygunMu(k: LogoyaGidecekMalzeme): boolean {
  return k.eksikler.length === 0;
}

async function sonucuBildir(db: Db, no: number, sonuc: MalzemeLogoSonucu): Promise<string | null> {
  // Kartın kuralı reddederse (kart bu arada gönderilmiş, kayıt numarası başka kartta) tur düşmez; neden giden kutusuna yazılır.
  const r = await kayitNoktasi(db, () => malzemeLogoSonucu(db, no, sonuc));
  if (r.tamam) return null;
  return kirp(`CORE kartına yazılamadı: ${r.hata instanceof UygulamaHatasi ? r.hata.mesaj : 'kural reddetti'}`);
}

// Bir tur: kuyruktan ilk uygun karta tek adım. Adımlar sırayla: (1) niyet yazılır (tur biter, niyet kalıcı olur);
// (2) sonraki turda "var mı" okunur, varsa numarası yazılır; yoksa kart açılır ve cevap karta bildirilir.
// Tur tek kartla sınırlıdır: kart satırı yalnız sonucun yazıldığı an kilitlenir, kullanıcının kaydı beklemez.
// İstek ancak Sistem Ayarları'ndaki "Logo bağlantısı" açık VE iki ortam değişkeni varken çıkar. Turda en çok bir kart; birim seti
// listesi eskiyse o tur yalnız listeyi okur (köprüye aynı anda tek istek).
export function malzemeTuru(vt: TxAcan, o: TurOrtami): Promise<TurSonucu> {
  return turuKos(vt, (db) => malzemeHazirla(db, o));
}

async function malzemeHazirla(db: Db, o: TurOrtami): Promise<TurSonucu | KopruAdimi> {
  if (!(await sistemAyariOku(db, 'logo.baglanti'))) return { tur: 'kapali' };
  if (o.kopru === null) return { tur: 'ortam-degiskeni-yok' };
  const kopru = o.kopru;
  const okuma = await s.birimSetiOkumasi(db);
  if (listeOkunmaliMi(okuma?.sonOkumaAn ?? null, o.bellek.sonListeDenemesi, o.saat())) return listeyiOku(o, kopru);
  const gecerliBirimler = gecerliBirimSetleri(await s.birimSetleri(db), okuma !== null);
  // Tek oran alış ve satışa gider (LB10 a); sayı ayarı türü gereği boş olabilir, boşsa KDV gönderilmez.
  const kdv = await sistemAyariOku(db, 'logo.kdv-orani');
  // Hizmetin oranı ayrı ayardır (KH3 b); boş gelir, boşsa gönderilmez.
  const hizmetKdv = await sistemAyariOku(db, 'logo.hizmet-kdv-orani');
  const hizmetAcik = o.hizmetAcik ?? {
    alinan: await sistemAyariOku(db, HIZMET_AYARI.alinan), verilen: await sistemAyariOku(db, HIZMET_AYARI.verilen),
  };
  const malzemeAcik = o.malzemeAcik ?? (await sistemAyariOku(db, MALZEME_GONDERIM_AYARI)) === true;
  // Kapalı yöndeki hizmet kartı ve gönderimi kapalıyken malzeme kartı sorguda atlanır (sınırdan önce): istek yok, satır yok, kart bekler.
  const hizmetYonleri = (['alinan', 'verilen'] as const).filter((y) => hizmetAcik[y]);
  const kuyruk = (await logoyaGidecekMalzemeler(db, KUYRUK_SINIRI, { malzemeDahil: malzemeAcik, hizmetYonleri })).filter(uygunMu);
  if (kuyruk.length === 0) return pasifTuru(db, o, kopru);
  // Kart numarası türler arasında tekildir (tek kart tablosu).
  const satirlar = new Map<number, GidenSatiri>();
  for (const belge of ['malzeme', 'hizmet'] as const) {
    const nolar = kuyruk.filter((k) => belgeTuru(k) === belge).map((k) => k.no);
    if (nolar.length > 0) for (const g of await s.gidenSatirlari(db, belge, nolar)) satirlar.set(g.belgeNo, g);
    await yenidenVerilenleriAc(db, o.saat(), belge, kuyruk.filter((k) => belgeTuru(k) === belge).map((k) => ({ id: k.no, durum: k.durum })), satirlar);
  }
  const simdi = o.saat();
  for (const kart of kuyruk) {
    const g = satirlar.get(kart.no) ?? null;
    const taze = g?.niyetZamani != null && o.bellek.niyetler.get(kart.no) === g.niyetZamani.getTime();
    const eylem = kartEylemi(g, simdi, taze, o.bellek.acmaIstekleri.get(kart.no) ?? null);
    if (eylem === 'bekle') continue;
    // Kuralı tutmayan kart (geçersiz karşılık dahil) niyet yazılmadan ve istek atılmadan "hata" olur.
    const gonderim = gonderimKur(kopru, await logoKoduyla(db, kart), kart.tur === 'hizmet' ? hizmetKdv : kdv, gecerliBirimler);
    if ('hata' in gonderim) return { tur: 'gonderim', no: kart.no, sonuc: await reddet(db, o, kart, g, gonderim.hata) };
    // "Var mı" okunamıyorsa eski niyet, Logo'da kartın açılmış olabileceğidir: kendiliğinden yeniden açılmaz (kart #777 kararı).
    if (eylem === 'gonder' && !taze && gonderim.varMi === null) {
      return { tur: 'gonderim', no: kart.no, sonuc: await reddet(db, o, kart, g, SONUCU_BILINMIYOR) };
    }
    if (eylem === 'niyet-yaz') {
      await s.niyetYaz(db, gonderim.belge, kart.no, simdi);
      o.bellek.niyetler.set(kart.no, simdi.getTime());
      return { tur: 'niyet', no: kart.no };
    }
    // Niyet bu turda kullanılır: tur yarıda kalsa da bu süreçte bir daha taze sayılmaz.
    o.bellek.niyetler.delete(kart.no);
    return turla(() => gonder(o, kart, g, gonderim, taze), (sonuc) => ({ tur: 'gonderim', no: kart.no, sonuc }));
  }
  return pasifTuru(db, o, kopru);
}


const LOGODAN_GELEN_KART = 'Kart Logo\'dan alındı ya da bağlandı; Logo\'ya pasife alma gönderilmedi. Gerekiyorsa Logo\'da elle bakın.';

// Silinen Logo kartının Logo'da kullanım dışı bırakılması (2114b, 2114-7, ADR 0017 madde 8): açma kuyruğu boşken, güncellemeden önce tek kart.
// İstek yalnız bağlantı ve kendi ayarı açıkken alınır; tur da yalnız ikisi açıkken koşar. Giden kutusunda kart belgesinin "pasif" satırıdır: önce niyet
// kalıcı yazılır (tur biter), sonraki turda istek gider. Yineleme zararsızdır: zaten kullanım dışı kart yardımcıda başarıdır.
async function pasifTuru(db: Db, o: TurOrtami, kopru: KopruIstemcisi): Promise<TurSonucu | KopruAdimi> {
  // 3073 a: kendi ayarı kapalıyken sıradaki istek gitmez, birikir (önceden alınmış istek de).
  if (!o.malzemePasif || !(await sistemAyariOku(db, 'logo.malzeme-pasif-gonderimi'))) return guncellemeTuru(db, o, kopru);
  const kaynak = o.malzemePasif;
  for (const kart of await kaynak.gidecekler(db, KUYRUK_SINIRI)) {
    // Silmede yazılan ölçüt burada yeniden uygulanır: ölçütten önce kuyruğa girmiş istek de Logo'nun kendi kartına gitmez.
    if (!(await s.logodaTmiActi(db, kart.no))) {
      await kaynak.sonuc(db, kart.no, { hata: LOGODAN_GELEN_KART, kalici: true });
      return { tur: 'pasif', no: kart.no, sonuc: 'reddedildi' };
    }
    const belge: BelgeTuru = kart.tur === 'hizmet' ? 'hizmet' : 'malzeme';
    const g = await s.gidenSatiri(db, belge, kart.no, 'pasif');
    // Kalıcı reddi malzemeler tutar (kart "reddedildi" kalır, kuyruğa yalnız kullanıcı yeniden isteyince girer); burada yalnız bekleme sayılır.
    if (g?.sonrakiDeneme && g.sonrakiDeneme.getTime() > o.saat().getTime()) continue;
    if (!g?.niyetZamani) {
      await s.niyetYaz(db, belge, kart.no, o.saat(), 'pasif');
      return { tur: 'pasif-niyet', no: kart.no };
    }
    const kod = (await logoKoduyla(db, { stokKodu: kart.stokKodu })).stokKodu.trim();
    const yon = kart.hizmetYonu;
    const adim = tekAdim(o, g, {
      belge, id: kart.no, islem: 'pasif',
      calis: async () => {
        if (kart.tur === 'hizmet' && yon === null) return { sonuc: 'reddedildi', hata: 'Hizmet kartının yönü yok.' };
        const c = kart.tur === 'hizmet' && yon !== null ? await kopru.hizmetPasifeAl(yon, kart.logoKayitNo, kod) : await kopru.malzemePasifeAl(kart.logoKayitNo, kod);
        return c.tur === 'basarili' ? { tamam: true, kayitNo: kart.logoKayitNo, deger: { tamam: true as const } } : { sonuc: c.tur, hata: `Logo'da pasife alma: ${c.ileti}` };
      },
      bildir: (yazDb, x, sonuc) => kaynak.sonuc(yazDb, kart.no, 'tamam' in x ? x : { hata: x.hata, kalici: sonuc === 'reddedildi' }),
    });
    return turla(adim, (sonuc) => ({ tur: 'pasif', no: kart.no, sonuc }));
  }
  return guncellemeTuru(db, o, kopru);
}

// Logo'ya gitmiş kartın ad ve açıklama güncellemesi: açma kuyruğu boşken tek kart. Güncelleme yinelenirse aynı değerleri yazar (zararsız), niyet gerekmez.
async function guncellemeTuru(db: Db, o: TurOrtami, kopru: KopruIstemcisi): Promise<TurSonucu | KopruAdimi> {
  if (!o.malzemeGuncelleme) return { tur: 'bos' };
  // Kapalıyken kuyruk okunmaz, istek atılmaz; kartlar "bekliyor" kalır, kart açma etkilenmez.
  if (!(await sistemAyariOku(db, 'logo.malzeme-guncelleme-gonderimi'))) return { tur: 'bos' };
  const kaynak = o.malzemeGuncelleme;
  for (const kart of await kaynak.gidecekler(db, KUYRUK_SINIRI)) {
    const g = await s.gidenSatiri(db, 'malzeme-guncelleme', kart.no);
    if (!denemeZamaniMi(g, o.saat())) continue;
    // Hizmet Logo'da açılırken TMI adıyla açılır (hizmetGovdesi); açıklama kuralı yalnız malzeme kartınındır.
    const logodaki = await logoKoduyla(db, kart);
    const r = malzemeGuncellemeGovdesi(kart.tur === 'hizmet' ? { stokKodu: logodaki.stokKodu, ad: kart.ad } : logodaki);
    const yon = kart.hizmetYonu;
    const adim = tekAdim(o, g, {
      belge: 'malzeme-guncelleme', id: kart.no,
      calis: async () => {
        if ('hata' in r) return { sonuc: 'reddedildi', hata: r.hata };
        if (kart.tur === 'hizmet' && yon === null) return { sonuc: 'reddedildi', hata: 'Hizmet kartının yönü yok.' };
        const c = kart.tur === 'hizmet' && yon !== null
          ? await kopru.hizmetGuncelle(yon, { [HIZMET_ALANLARI.kod]: r.govde.code, [HIZMET_ALANLARI.ad]: r.govde.name })
          : await kopru.malzemeGuncelle(r.govde);
        return c.tur === 'basarili' ? { tamam: true, kayitNo: kart.logoKayitNo, deger: { tamam: true as const } } : { sonuc: c.tur, hata: `Güncelleme: ${c.ileti}` };
      },
      // Kaynağın verdiği açıklamalar da döner (3491); vermediği alan cevapta yoktur.
      bildir: (yazDb, x) => kaynak.sonuc(yazDb, kart.no, {
        ad: kart.ad, ...Object.fromEntries((['aciklama1', 'aciklama2', 'aciklama3'] as const).filter((a) => kart[a] !== undefined).map((a) => [a, kart[a]])), ...x,
      }),
    });
    return turla(adim, (sonuc) => ({ tur: 'guncelleme', no: kart.no, sonuc }));
  }
  return { tur: 'bos' };
}

// Tek istekli adım (güncelleme, kapatma, iptal, karşılama): sonucu sahibine yazılır, iz giden kutusuna. Başarıda sahibin kuralı reddederse
// "yazilamadi" olur ve bekleme sonrası yinelenir; adımın kendisi yinelenmesi zararsız olacak biçimde kurulur.
type AdimSonucu<T> = { tamam: true; kayitNo: string; deger: T } | { sonuc: Exclude<GidenSonucu, 'gonderildi' | 'zaten-vardi'>; hata: string };
function tekAdim<T>(
  o: TurOrtami, g: GidenSatiri | null,
  a: {
    belge: BelgeTuru; id: number; islem?: GidenIslemi; calis: () => Promise<AdimSonucu<T>>;
    bildir: (db: Db, x: T | { hata: string }, sonuc: GidenSonucu) => Promise<void>;
  },
): KopruAdimi<GidenSonucu> {
  return async () => {
    const r = await a.calis();
    return async (db) => {
      const zaman = o.saat();
      const bekleme = new Date(zaman.getTime() + geriCekilmeMs((g?.ardisikHata ?? 0) + 1));
      const yazilamadi = (b: Awaited<ReturnType<typeof kayitNoktasi>>): string | null =>
        b.tamam ? null : kirp(`CORE kaydına yazılamadı: ${b.hata instanceof UygulamaHatasi ? b.hata.mesaj : 'kural reddetti'}`);
      if ('tamam' in r) {
        const hata = yazilamadi(await kayitNoktasi(db, () => a.bildir(db, r.deger, 'gonderildi')));
        await s.denemeYaz(db, a.belge, a.id, hata === null
          ? { zaman, sonuc: 'gonderildi', hata: null, logoKayitNo: r.kayitNo, niyetZamani: null, sonrakiDeneme: null, basarili: true }
          : { zaman, sonuc: 'yazilamadi', hata, logoKayitNo: null, niyetZamani: null, sonrakiDeneme: bekleme, basarili: false }, a.islem);
        return hata === null ? 'gonderildi' : 'yazilamadi';
      }
      const hata = kirp(r.hata);
      const ek = yazilamadi(await kayitNoktasi(db, () => a.bildir(db, { hata }, r.sonuc)));
      await s.denemeYaz(db, a.belge, a.id, {
        zaman, sonuc: r.sonuc, hata: ek ? kirp(`${hata} ${ek}`) : hata, logoKayitNo: null, niyetZamani: null, sonrakiDeneme: bekleme, basarili: false,
      }, a.islem);
      return r.sonuc;
    };
  };
}

function gonderimKur(kopru: KopruIstemcisi, kart: LogoyaGidecekMalzeme, kdv: number | null, gecerliBirimler: ReadonlySet<string>): Gonderim | { hata: string } {
  if (kart.tur === 'hizmet') {
    const r = hizmetGovdesi(kart, { kdv, gecerliBirimler });
    if ('hata' in r || kart.hizmetYonu === null) return { hata: 'hata' in r ? r.hata : 'Hizmet kartının yönü yok.' };
    const yon = kart.hizmetYonu;
    return {
      belge: 'hizmet', varMi: kopru.hizmetVarMiYoluVar ? () => kopru.hizmetVarMi(yon, kart.stokKodu.trim()) : null,
      ekle: () => kopru.hizmetEkle(yon, r.govde),
    };
  }
  const r = eklemeGovdesi(kart, { kdv, gecerliBirimler });
  if ('hata' in r) return r;
  return { belge: 'malzeme', varMi: () => kopru.malzemeVarMi(r.govde.code), ekle: () => kopru.malzemeEkle(r.govde) };
}

function listeyiOku(o: TurOrtami, kopru: KopruIstemcisi): KopruAdimi {
  return async () => {
    o.bellek.sonListeDenemesi = o.saat();
    const r = await kopru.birimSetleri();
    return async (db) => {
      if (r.tur !== 'basarili') return { tur: 'liste', sonuc: r.tur };
      await s.kopruListesiniYaz(db, r.setler, o.saat());
      return { tur: 'liste', sonuc: 'okundu' };
    };
  };
}

async function basarisizYaz(
  db: Db, o: TurOrtami, kart: LogoyaGidecekMalzeme, g: GidenSatiri | null,
  sonuc: GidenSonucu, hata: string, niyet: Date | null | undefined, bekleme?: number,
): Promise<GidenSonucu> {
  const simdi = o.saat();
  const yazilamadi = await sonucuBildir(db, kart.no, { hata });
  await s.denemeYaz(db, belgeTuru(kart), kart.no, {
    zaman: simdi, sonuc, hata: yazilamadi ? kirp(`${hata} ${yazilamadi}`) : hata, logoKayitNo: null, niyetZamani: niyet,
    sonrakiDeneme: new Date(simdi.getTime() + (bekleme ?? geriCekilmeMs((g?.ardisikHata ?? 0) + 1))), basarili: false,
  });
  return sonuc;
}

// Önceki belirsiz açma isteğinin niyeti varsa korunur: karşılık düzelince gönderim yine "var mı" ile başlar.
const reddet = (db: Db, o: TurOrtami, kart: LogoyaGidecekMalzeme, g: GidenSatiri | null, hata: string): Promise<GidenSonucu> =>
  basarisizYaz(db, o, kart, g, 'reddedildi', hata, undefined);

// Köprü adımları transaction dışında; dönen iş sonucu ikinci transaction'da yazar.
// `taze`: niyet bu süreçte bir önceki turda yazıldı ve hiç kullanılmadı; bu kart için Logo'ya hiç açma isteği gitmemiştir.
async function gonder(o: TurOrtami, kart: LogoyaGidecekMalzeme, g: GidenSatiri | null, k: Gonderim, taze: boolean): Promise<Yazici<GidenSonucu>> {
  const ardisik = g?.ardisikHata ?? 0;
  const basarisiz = (sonuc: GidenSonucu, hata: string, niyet: Date | null | undefined, bekleme?: number): Yazici<GidenSonucu> =>
    (db) => basarisizYaz(db, o, kart, g, sonuc, hata, niyet, bekleme);
  const basarili = (sonuc: 'gonderildi' | 'zaten-vardi', logicalRef: number): Yazici<GidenSonucu> => async (db) => {
    const simdi = o.saat();
    const kayitNo = String(logicalRef);
    // Karta tur sırasında değişmiş karşılık değil, bu turda gönderilen (kuyruktan okunan) değerler yazılır.
    const yazilamadi = await sonucuBildir(db, kart.no, { kayitNo, logoKartTuru: kart.logoKartTuru, logoBirimSeti: kart.logoBirimSeti });
    if (k.belge === 'malzeme') await s.malzemeKoduEkle(db, kart.stokKodu.trim(), simdi);
    if (yazilamadi) {
      // Logo'da kayıt var ama TMI kartı almadı: yeniden denemede "var mı" aynı kaydı bulur; yeni kart açılmaz.
      await s.denemeYaz(db, k.belge, kart.no, {
        zaman: simdi, sonuc: 'yazilamadi', hata: kirp(`Logo kaydı ${kayitNo}. ${yazilamadi}`), logoKayitNo: null, niyetZamani: undefined,
        sonrakiDeneme: new Date(simdi.getTime() + geriCekilmeMs(ardisik + 1)), basarili: false,
      });
      return 'yazilamadi';
    }
    await s.denemeYaz(db, k.belge, kart.no, {
      zaman: simdi, sonuc, hata: null, logoKayitNo: kayitNo, niyetZamani: null, sonrakiDeneme: null, basarili: true,
    });
    return sonuc;
  };
  const okumaHatasi = (r: Exclude<KopruSonucu, { tur: 'basarili' }>): Yazici<GidenSonucu> =>
    // Okuma kart açmaz: niyet olduğu gibi kalır (önceki belirsiz istek hâlâ geçerli olabilir).
    basarisiz(r.tur === 'reddedildi' ? 'reddedildi' : r.tur, `"Var mı" okuması: ${r.ileti}`, undefined);

  if (k.varMi !== null) {
    const varMi = await k.varMi();
    if (varMi.tur !== 'basarili') return okumaHatasi(varMi);
    if (varMi.logicalRef !== null) {
      // 2089-1 a, 2089-2 a: açma isteği hiç gitmemişken bulunan kart TMI'nin değildir; eşlenmez. Niyet boşalır: sonraki deneme yine
      // taze niyetle başlar ve yine eşlemez. Eski niyette (önceki süreç ya da belirsiz istek) kart TMI'nin olabilir: eşlenir, ikinci kart açılmaz.
      if (k.belge === 'malzeme' && taze) return basarisiz('reddedildi', kodCakismasiMetni(varMi.logoAdi), null);
      return basarili('zaten-vardi', varMi.logicalRef);
    }
  }

  o.bellek.acmaIstekleri.set(kart.no, o.saat());
  const ekle = await k.ekle();
  if (ekle.tur === 'basarili') {
    if (ekle.logicalRef !== null) return basarili('gonderildi', ekle.logicalRef);
    return basarisiz('belirsiz', 'Köprü başarı dedi ama kayıt numarası vermedi; sonraki denemede "var mı" okunacak.', o.saat(), BELIRSIZ_BEKLEME_MS);
  }
  // Sonucu bilinmeyen istek: niyet yenilenir, BELIRSIZ_BEKLEME_MS dolmadan yeni açma isteği gitmez, önce "var mı" okunur.
  if (ekle.tur === 'belirsiz') return basarisiz('belirsiz', ekle.ileti, o.saat(), BELIRSIZ_BEKLEME_MS);
  // Kesin açılmadı: niyet boşalır, sonraki deneme yine niyetle başlar.
  o.bellek.acmaIstekleri.delete(kart.no);
  return basarisiz(ekle.tur, ekle.ileti, null);
}

/* ---------------- Satın alma: sipariş, talep fişi, karşılama (#205 karar 1; kullanıcı kararları S1 a, S2 b, S3 b; kart #777) ---------------- */

// Sahibi satın almadır: kuyrukları ve sonuçları onun disari.ts işlevleri verir (yön logo -> satın alma). İşlevler gelene kadar iş kaydedilmez
// (UYUM-BORCU "bağlamada kapanacak"); test bu arayüzü sahte kaynakla verir.
export interface LogoyaGidecekSiparis extends GonderilecekSiparis {
  firmaId: number;
  durum: 'bekliyor' | 'hata';
}
export interface LogoyaGuncellemeGidecekSiparis extends LogoyaGidecekSiparis {
  logoKayitNo: string;
  satirlar: readonly GuncellenecekSiparisSatiri[];
  // TMI'den kaldırılmış satırların Logo kayıtları: Logo'da kapatılır, silinmez; eşlemede yeni satır sayılmaz.
  kaldirilanSatirRefleri: readonly string[];
}
export type SatirBaglari = { satirId: number; logoSatirRef: string }[];
export type SiparisLogoSonucu = { kayitNo: string; satirlar: SatirBaglari } | { hata: string };
export interface LogoyaIptalGidecekSiparis { id: number; no: string; logoKayitNo: string }
export interface LogoyaKapatmaGidecekSiparis extends LogoyaIptalGidecekSiparis { satirRefleri: readonly string[] }
export interface LogoyaBekletmeGidecekSiparis extends LogoyaGuncellemeGidecekSiparis { istek: 'beklet' | 'serbest' }
export type Tamam = { tamam: true } | { hata: string };
export interface LogoyaGidecekKarsilama extends GonderilecekKarsilama { firmaId: number }

export interface SatinAlmaKaynagi {
  gidecekler(db: Db, sinir: number): Promise<LogoyaGidecekSiparis[]>;
  sonuc(db: Db, id: number, sonuc: SiparisLogoSonucu): Promise<void>;
  guncellemeGidecekler(db: Db, sinir: number): Promise<LogoyaGuncellemeGidecekSiparis[]>;
  guncellemeSonucu(db: Db, id: number, sonuc: { satirlar: SatirBaglari } | { hata: string }): Promise<void>;
  kapatmaGidecekler(db: Db, sinir: number): Promise<LogoyaKapatmaGidecekSiparis[]>;
  kapatmaSonucu(db: Db, id: number, sonuc: Tamam): Promise<void>;
  bekletmeGidecekler(db: Db, sinir: number): Promise<LogoyaBekletmeGidecekSiparis[]>;
  bekletmeSonucu(db: Db, id: number, istek: 'beklet' | 'serbest', sonuc: Tamam): Promise<void>;
  iptalGidecekler(db: Db, sinir: number): Promise<LogoyaIptalGidecekSiparis[]>;
  iptalSonucu(db: Db, id: number, sonuc: Tamam): Promise<void>;
  talepGidecekler(db: Db, sinir: number): Promise<GonderilecekTalep[]>;
  talepSonucu(db: Db, id: number, sonuc: SiparisLogoSonucu): Promise<void>;
  karsilamaGidecekler(db: Db, sinir: number): Promise<LogoyaGidecekKarsilama[]>;
  karsilamaSonucu(db: Db, siparisSatirId: number, sonuc: { karsilamaRef: string } | { hata: string }): Promise<void>;
}

export interface SatinAlmaTurOrtami extends TurOrtami {
  kaynak: SatinAlmaKaynagi;
}

const yazilamadiMetni = (r: { tamam: boolean; hata?: unknown }): string =>
  kirp(`CORE kaydına yazılamadı: ${r.hata instanceof UygulamaHatasi ? r.hata.mesaj : 'kural reddetti'}`);

// Bir tur, sırayla ilk işi olan adım: talep fişi açma, sipariş açma, düzenleme, kapatma, iptal, karşılama. Turda en çok bir yazma isteği.
// İstek ancak "Logo bağlantısı" ve "Logo: satın alma gönderimi" açık VE köprü değişkenleri varken çıkar.
export function satinAlmaTuru(vt: TxAcan, o: SatinAlmaTurOrtami): Promise<TurSonucu> {
  return turuKos(vt, async (db) => {
    if (!(await sistemAyariOku(db, 'logo.baglanti'))) return { tur: 'kapali' };
    if (!(await sistemAyariOku(db, 'logo.satin-alma-gonderimi'))) return { tur: 'satin-alma-kapali' };
    if (o.kopru === null) return { tur: 'ortam-degiskeni-yok' };
    const kopru = o.kopru;
    return (await talepTuru(db, o, kopru)) ?? (await siparisAcmaTuru(db, o, kopru)) ?? (await siparisGuncellemeTuru(db, o, kopru))
      ?? (await kapatmaTuru(db, o, kopru)) ?? (await bekletmeTuru(db, o, kopru)) ?? (await iptalTuru(db, o, kopru)) ?? (await karsilamaTuru(db, o, kopru)) ?? { tur: 'bos' };
  });
}

// Süreç belleğinin anahtarı belge türüyle ayrılır: talep ve sipariş kimlikleri ayrı sayaçlardır.
// Satış işinin belleği ayrıdır; içinde teklif ve sipariş kimlikleri aynı yolla ayrılır.
// Malzeme fişleri stoğun tek sayacıdır (türden bağımsız tekil kimlik): çok büyük artı taraftadır (kimlikler bunun altındadır).
const FIS_ANAHTAR_KAYMASI = 1_000_000_000;
const bellekAnahtari = (belge: BelgeTuru, id: number): number =>
  (LOGO_FIS_TURLERI as readonly string[]).includes(belge) ? FIS_ANAHTAR_KAYMASI + id : belge === 'talep' || belge === 'siparisler-siparisi' ? -id : id;

// 3313: sahibi modül belgeyi yeniden "bekliyor"a aldıysa (düzenlendi, yeniden verildi) durdurma kalkar; "hata"da kalan belge durur.
async function yenidenVerilenleriAc(
  db: Db, simdi: Date, belge: BelgeTuru, isler: readonly { id: number; durum?: string }[], satirlar: Map<number, GidenSatiri>, islem?: GidenIslemi,
): Promise<void> {
  for (const is of isler) {
    const g = satirlar.get(is.id) ?? null;
    if (g !== null && is.durum === 'bekliyor' && durduMu(g) && (await s.duraniYenidenAc(db, belge, is.id, simdi, islem))) satirlar.set(is.id, { ...g, sonrakiDeneme: simdi });
  }
}

// 3313: satır kartları Logo'da mı (yerel kayıt ve okunmuş kopya; Logo'ya sorulmaz) ve hizmet satırı var mı.
async function satirKartlari(db: Db, b: Parameters<typeof belgeStokKodlari>[0]): Promise<{ eksik: string[]; hizmet: string[] }> {
  const kodlar = belgeStokKodlari(b);
  if (kodlar.length === 0) return { eksik: [], hizmet: [] };
  const durumlar = await logoKartDurumlari(db, kodlar);
  const harita = await s.logoKodHaritasi(db, kodlar);
  const logoKodu = (k: string): string => harita.get(k) ?? k;
  const aynada = await s.aynadakiKodlar(db, kodlar.map(logoKodu));
  return { eksik: logodaOlmayanKartlar(kodlar, durumlar, logoKodu, aynada), hizmet: kodlar.filter((k) => durumlar.get(k)?.hizmet === true) };
}
// Eksik kartta belge gitmez, deneme sayılmaz; neden sahibine bir kez yazılır (sahibinin ekranında görünür).
// İzleme ekranı için süreç belleği: sunucu yeniden açılınca ilk turlarda yeniden dolar; bir saattir görülmeyen kayıt eskimiş sayılır.
const kartBekleyenBelgeler = new Map<string, { belge: BelgeTuru; no: number; ileti: string; goruldu: Date; durum: 'kart-bekliyor' | 'proje-bekliyor' }>();
const kartKaydiAnahtari = (belge: BelgeTuru, no: number): string => `${belge}:${no}`;
async function kartBekliyor(
  db: Db, o: TurOrtami, belge: BelgeTuru, no: number, anahtar: number, eksik: readonly string[], bildir: Bildir<SiparisLogoSonucu>,
): Promise<void> {
  const ileti = kartBekliyorMetni(eksik);
  kartBekleyenBelgeler.set(kartKaydiAnahtari(belge, no), { belge, no, ileti, goruldu: o.saat(), durum: 'kart-bekliyor' });
  await bekleyeniBildir(db, o, anahtar, ileti, bildir);
}
async function bekleyeniBildir(db: Db, o: TurOrtami, anahtar: number, ileti: string, bildir: Bildir<{ hata: string }> | null): Promise<void> {
  if (bildir === null || o.bellek.kartBekleyenler.get(anahtar) === ileti) return;
  await bildir(db, { hata: ileti });
  o.bellek.kartBekleyenler.set(anahtar, ileti);
}
// 3315 a: belgenin projesi Logo'ya gitmeden belge gitmez, deneme sayılmaz (kart bekliyor kalıbı). Anahtar kapalıyken belge projesiz gider.
async function projeBekliyor(
  db: Db, o: TurOrtami, belge: BelgeTuru, no: number, anahtar: number, kod: string, bildir: Bildir<{ hata: string }> | null,
): Promise<void> {
  kartBekleyenBelgeler.set(kartKaydiAnahtari(belge, no), { belge, no, ileti: projeBekliyorNedeni(kod), goruldu: o.saat(), durum: 'proje-bekliyor' });
  await bekleyeniBildir(db, o, anahtar, projeBekliyorMetni(kod), bildir);
}

async function kalkanEylemi(o: TurOrtami, belge: BelgeTuru, id: number, g: GidenSatiri | null) {
  const anahtar = bellekAnahtari(belge, id);
  const taze = g?.niyetZamani != null && o.bellek.niyetler.get(anahtar) === g.niyetZamani.getTime();
  return { anahtar, taze, eylem: kartEylemi(g, o.saat(), taze, o.bellek.acmaIstekleri.get(anahtar) ?? null) };
}

type Bildir<X> = (db: Db, x: X) => Promise<void>;

async function basarisizAcma(
  db: Db, o: TurOrtami, belge: BelgeTuru, id: number, g: GidenSatiri | null, bildir: Bildir<{ hata: string }>,
  sonuc: GidenSonucu, hata: string, niyet: Date | null | undefined, bekleme?: number,
): Promise<GidenSonucu> {
  const simdi = o.saat();
  const b = await kayitNoktasi(db, () => bildir(db, { hata }));
  await s.denemeYaz(db, belge, id, {
    zaman: simdi, sonuc, hata: b.tamam ? hata : kirp(`${hata} ${yazilamadiMetni(b)}`), logoKayitNo: null, niyetZamani: niyet,
    sonrakiDeneme: new Date(simdi.getTime() + (bekleme ?? geriCekilmeMs((g?.ardisikHata ?? 0) + 1))), basarili: false,
  });
  return sonuc;
}

// Logo'da kayıt açıldı: satır kayıt numaraları TMI satırlarına eşlenmeden sonuç yazılmaz. Eşlenemezse "yazilamadi"; sipariş yeniden
// denemede numarayla bulunur, yeni kayıt açılmaz.
async function acmaSonucuYaz(
  db: Db, o: TurOrtami, belge: BelgeTuru, id: number, g: GidenSatiri | null, satirlar: readonly { satirId: number }[],
  bildir: Bildir<SiparisLogoSonucu>, sonuc: 'gonderildi' | 'zaten-vardi', logicalRef: number, refler: number[] | null,
): Promise<GidenSonucu> {
  const simdi = o.saat();
  const kayitNo = String(logicalRef);
  const esleme = refler === null ? null : satirEslemesi(satirlar, refler);
  let yazilamadi: string | null;
  if (esleme === null) {
    yazilamadi = kirp(`Logo satırları CORE satırlarıyla eşlenemedi (Logo ${refler?.length ?? 0}, CORE ${satirlar.length}).`);
    await kayitNoktasi(db, () => bildir(db, { hata: `Logo kaydı ${kayitNo}. ${yazilamadi}` }));
  } else {
    const b = await kayitNoktasi(db, () => bildir(db, { kayitNo, satirlar: esleme }));
    yazilamadi = b.tamam ? null : yazilamadiMetni(b);
  }
  if (yazilamadi) {
    await s.denemeYaz(db, belge, id, {
      zaman: simdi, sonuc: 'yazilamadi', hata: kirp(`Logo kaydı ${kayitNo}. ${yazilamadi}`), logoKayitNo: null, niyetZamani: null,
      sonrakiDeneme: new Date(simdi.getTime() + geriCekilmeMs((g?.ardisikHata ?? 0) + 1)), basarili: false,
    });
    return 'yazilamadi';
  }
  await s.denemeYaz(db, belge, id, { zaman: simdi, sonuc, hata: null, logoKayitNo: kayitNo, niyetZamani: null, sonrakiDeneme: null, basarili: true });
  return sonuc;
}

async function siparisAcmaTuru(db: Db, o: SatinAlmaTurOrtami, kopru: KopruIstemcisi): Promise<TurSonucu | KopruAdimi | null> {
  const kuyruk = await o.kaynak.gidecekler(db, KUYRUK_SINIRI);
  if (kuyruk.length === 0) return null;
  const satirlar = new Map<number, GidenSatiri>();
  for (const g of await s.gidenSatirlari(db, 'siparis', kuyruk.map((k) => k.id))) satirlar.set(g.belgeNo, g);
  await yenidenVerilenleriAc(db, o.saat(), 'siparis', kuyruk, satirlar);
  const kdv = await sistemAyariOku(db, 'logo.kdv-orani');
  const hizmetKdv = await sistemAyariOku(db, 'logo.hizmet-kdv-orani');
  for (const sip of kuyruk) {
    const g = satirlar.get(sip.id) ?? null;
    const { anahtar, eylem } = await kalkanEylemi(o, 'siparis', sip.id, g);
    if (eylem === 'bekle') continue;
    const bildir: Bildir<SiparisLogoSonucu> = (yazDb, x) => o.kaynak.sonuc(yazDb, sip.id, x);
    if (eylem === 'niyet-yaz') {
      const { eksik } = await satirKartlari(db, sip);
      if (eksik.length > 0) { await kartBekliyor(db, o, 'siparis', sip.id, anahtar, eksik, bildir); continue; }
    }
    const pj = await belgeProjesi(db, sip.projeId ?? null);
    if ('bekliyor' in pj) { await projeBekliyor(db, o, 'siparis', sip.id, anahtar, pj.bekliyor, bildir); continue; }
    kartBekleyenBelgeler.delete(kartKaydiAnahtari('siparis', sip.id));
    const cariKodu = (await firmaOzeti(db, sip.firmaId))?.logoCariKodu ?? null;
    const r = projeliGovde(siparisGovdesi(await logoKoduyla(db, sip), { cariKodu, kdv, hizmetKdv }), pj.kod);
    if ('hata' in r) return { tur: 'gonderim', no: sip.id, sonuc: await basarisizAcma(db, o, 'siparis', sip.id, g, bildir, 'reddedildi', r.hata, undefined) };
    if (eylem === 'niyet-yaz') {
      // Saat bir kez okunur: belleğe yazılan değer kalıcı niyetle aynı olmazsa niyet sonraki turda taze sayılmaz.
      const niyet = o.saat();
      await s.niyetYaz(db, 'siparis', sip.id, niyet);
      o.bellek.niyetler.set(anahtar, niyet.getTime());
      return { tur: 'niyet', no: sip.id };
    }
    o.bellek.niyetler.delete(anahtar);
    return async () => {
      const yaz = await siparisGonder(o, kopru, sip, g, r.govde, cariKodu ?? '');
      return async (yazDb) => {
        const sonuc = await yaz(yazDb);
        // Fatura okuması siparişi numarasıyla arar; numara Logo'da açılan siparişin yanına yazılır.
        if (sonuc === 'gonderildi' || sonuc === 'zaten-vardi') await s.siparisNoYaz(yazDb, sip.id, sip.no.trim());
        return { tur: 'gonderim', no: sip.id, sonuc };
      };
    };
  }
  return null;
}

async function siparisGonder(
  o: SatinAlmaTurOrtami, kopru: KopruIstemcisi, sip: LogoyaGidecekSiparis, g: GidenSatiri | null,
  govde: Record<string, unknown>, cariKodu: string,
): Promise<Yazici<GidenSonucu>> {
  const no = sip.no.trim();
  const bildir: Bildir<SiparisLogoSonucu> = (db, x) => o.kaynak.sonuc(db, sip.id, x);
  const basarisiz = (sonuc: GidenSonucu, hata: string, niyet: Date | null | undefined, bekleme?: number): Yazici<GidenSonucu> =>
    (db) => basarisizAcma(db, o, 'siparis', sip.id, g, bildir, sonuc, hata, niyet, bekleme);
  const okumaHatasi = (adim: string, r: Exclude<KopruSonucu, { tur: 'basarili' }>): Yazici<GidenSonucu> =>
    basarisiz(r.tur === 'reddedildi' ? 'reddedildi' : r.tur, `${adim}: ${r.ileti}`, undefined);
  const sonucYaz = (sonuc: 'gonderildi' | 'zaten-vardi', ref: number, refler: number[] | null): Yazici<GidenSonucu> =>
    (db) => acmaSonucuYaz(db, o, 'siparis', sip.id, g, sip.satirlar, bildir, sonuc, ref, refler);

  const bul = await kopru.siparisBul(no);
  if (bul.tur !== 'basarili') return okumaHatasi('Numarayla bulma', bul);
  if (bul.logicalRef !== null) {
    const satirlar = await kopru.siparisSatirlari(no);
    if (satirlar.tur !== 'basarili') return okumaHatasi('Satır okuması', satirlar);
    return sonucYaz('zaten-vardi', bul.logicalRef, satirlar.satirRefleri);
  }
  const cari = await kopru.cariVarMi(cariKodu);
  if (cari.tur !== 'basarili') return okumaHatasi('Cari okuması', cari);
  if (cari.logicalRef === null) return basarisiz('reddedildi', kirp(`Cari kodu ${cariKodu} Logo'da yok.`), null);

  const anahtar = bellekAnahtari('siparis', sip.id);
  o.bellek.acmaIstekleri.set(anahtar, o.saat());
  const ekle: SatirliSonuc = await kopru.siparisEkle(govde);
  if (ekle.tur === 'basarili') {
    if (ekle.logicalRef !== null) return sonucYaz('gonderildi', ekle.logicalRef, ekle.satirRefleri);
    return basarisiz('belirsiz', 'Köprü başarı dedi ama kayıt numarası vermedi; sonraki denemede numarayla bulunacak.', o.saat(), BELIRSIZ_BEKLEME_MS);
  }
  if (ekle.tur === 'belirsiz') return basarisiz('belirsiz', ekle.ileti, o.saat(), BELIRSIZ_BEKLEME_MS);
  o.bellek.acmaIstekleri.delete(anahtar);
  return basarisiz(ekle.tur, ekle.ileti, null);
}

// Numarayla bulma ucu olmayan belge (talep fişi, satış teklifi, tekliften satış siparişi): kalkan niyet ve belirsiz beklemedir; sonucu
// bilinmeyen istekten sonra kendiliğinden yeniden açılmaz (hizmet kartıyla aynı karar, kart #777). onKosul istek atmadan önceki okumadır
// (satış müşterisi); "yok" derse belge açılmaz, niyet boşalır. govde ilk transaction'da, onKosul ve ekle köprü adımında koşar.
async function niyetliAcmaTuru<T extends { id: number; satirlar: readonly { satirId: number }[] }>(
  db: Db, o: TurOrtami, a: {
    belge: NiyetliBelge; kuyruk: readonly T[];
    govde: (t: T) => Promise<{ govde: Record<string, unknown> } | { hata: string }>;
    onKosul?: (t: T) => Promise<{ hata: string; sonuc: GidenSonucu } | null>;
    ekle: (t: T, govde: Record<string, unknown>) => Promise<SatirliSonuc>;
    bildir: (db: Db, t: T, x: SiparisLogoSonucu) => Promise<void>;
    // 3315: belgenin CORE projesi (yoksa null); verilmezse belge projesiz gider.
    projeId?: (t: T) => Promise<number | null>;
    // 3360-2 a: elle bağlanmış belgeden doğan iş gönderilmez; neden yazılır ve iş durur (kendiliğinden yeniden denenmez).
    elleEngeli?: (t: T) => Promise<string | null>;
  },
): Promise<TurSonucu | KopruAdimi | null> {
  if (a.kuyruk.length === 0) return null;
  const satirlar = new Map<number, GidenSatiri>();
  for (const g of await s.gidenSatirlari(db, a.belge, a.kuyruk.map((k) => k.id))) satirlar.set(g.belgeNo, g);
  await yenidenVerilenleriAc(db, o.saat(), a.belge, a.kuyruk as readonly { id: number; durum?: string }[], satirlar);
  for (const t of a.kuyruk) {
    const g = satirlar.get(t.id) ?? null;
    const { anahtar, taze, eylem } = await kalkanEylemi(o, a.belge, t.id, g);
    if (eylem === 'bekle') continue;
    const bildir: Bildir<SiparisLogoSonucu> = (yazDb, x) => a.bildir(yazDb, t, x);
    const sonucla = (sonuc: GidenSonucu): TurSonucu => ({ tur: a.belge, no: t.id, sonuc });
    const basarisiz = (sonuc: GidenSonucu, hata: string, niyet: Date | null | undefined, bekleme?: number): Yazici<TurSonucu> =>
      async (yazDb) => sonucla(await basarisizAcma(yazDb, o, a.belge, t.id, g, bildir, sonuc, hata, niyet, bekleme));
    const elle = a.elleEngeli ? await a.elleEngeli(t) : null;
    if (elle !== null) return basarisiz('reddedildi', elle, null)(db);
    if (eylem === 'niyet-yaz') {
      const k = await satirKartlari(db, t as Parameters<typeof belgeStokKodlari>[0]);
      if (a.belge === 'talep' && k.hizmet.length > 0) return basarisiz('reddedildi', TALEP_HIZMET_ILETISI, undefined)(db);
      if (k.eksik.length > 0) { await kartBekliyor(db, o, a.belge, t.id, anahtar, k.eksik, bildir); continue; }
    }
    const pj = a.projeId ? await belgeProjesi(db, await a.projeId(t)) : { kod: null };
    if ('bekliyor' in pj) { await projeBekliyor(db, o, a.belge, t.id, anahtar, pj.bekliyor, bildir); continue; }
    kartBekleyenBelgeler.delete(kartKaydiAnahtari(a.belge, t.id));
    const r = projeliGovde(await a.govde(t), pj.kod);
    if ('hata' in r) return basarisiz('reddedildi', r.hata, undefined)(db);
    if (eylem === 'gonder' && !taze) return basarisiz('reddedildi', SONUCU_BILINMIYOR, undefined)(db);
    if (eylem === 'niyet-yaz') {
      // Saat bir kez okunur: belleğe yazılan değer kalıcı niyetle aynı olmazsa niyet sonraki turda taze sayılmaz.
      const niyet = o.saat();
      await s.niyetYaz(db, a.belge, t.id, niyet);
      o.bellek.niyetler.set(anahtar, niyet.getTime());
      return { tur: `${a.belge}-niyet`, no: t.id };
    }
    o.bellek.niyetler.delete(anahtar);
    return async (): Promise<Yazici<TurSonucu>> => {
      const engel = a.onKosul ? await a.onKosul(t) : null;
      if (engel !== null) return basarisiz(engel.sonuc, engel.hata, engel.sonuc === 'reddedildi' ? null : undefined);
      o.bellek.acmaIstekleri.set(anahtar, o.saat());
      const ekle = await a.ekle(t, r.govde);
      if (ekle.tur === 'basarili') {
        if (ekle.logicalRef !== null) {
          const ref = ekle.logicalRef;
          return async (yazDb) => sonucla(await acmaSonucuYaz(yazDb, o, a.belge, t.id, g, t.satirlar, bildir, 'gonderildi', ref, ekle.satirRefleri));
        }
        return basarisiz('belirsiz', 'Köprü başarı dedi ama kayıt numarası vermedi.', o.saat(), BELIRSIZ_BEKLEME_MS);
      }
      if (ekle.tur === 'belirsiz') return basarisiz('belirsiz', ekle.ileti, o.saat(), BELIRSIZ_BEKLEME_MS);
      o.bellek.acmaIstekleri.delete(anahtar);
      return basarisiz(ekle.tur, ekle.ileti, null);
    };
  }
  return null;
}

async function talepTuru(db: Db, o: SatinAlmaTurOrtami, kopru: KopruIstemcisi): Promise<TurSonucu | KopruAdimi | null> {
  return niyetliAcmaTuru(db, o, {
    belge: 'talep', kuyruk: await o.kaynak.talepGidecekler(db, KUYRUK_SINIRI),
    govde: async (t) => talepGovdesi(await logoKoduyla(db, t)),
    projeId: (t) => Promise.resolve(t.projeId ?? null),
    ekle: (_t, govde) => kopru.talepEkle(govde),
    bildir: (yazDb, t, x) => o.kaynak.talepSonucu(yazDb, t.id, x),
  });
}

// Bekleme süresi dolmamış adım atlanır.
async function sirasiGelen<T extends { id: number }>(db: Db, o: TurOrtami, belge: BelgeTuru, kuyruk: readonly T[]): Promise<{ is: T; g: GidenSatiri | null } | null> {
  for (const is of kuyruk) {
    let g = await s.gidenSatiri(db, belge, is.id);
    const durum = (is as { durum?: unknown }).durum;
    if (durum === 'bekliyor' && durduMu(g) && (await s.duraniYenidenAc(db, belge, is.id, o.saat()))) g = await s.gidenSatiri(db, belge, is.id);
    if (denemeZamaniMi(g, o.saat())) return { is, g };
  }
  return null;
}

// Düzenleme: önce Logo satırları okunur, sonra Read+Modify+Post. Yeni satırlar ancak satır sayısı tutarsa bağlanır; önceki denemede eklenmiş
// ama TMI'ye bağlanamamış yeni satırlar yeniden eklenmesin diye okuma sonucuna göre kayıtları gövdeye konur.
async function siparisGuncellemeTuru(db: Db, o: SatinAlmaTurOrtami, kopru: KopruIstemcisi): Promise<KopruAdimi | null> {
  const sira = await sirasiGelen(db, o, 'siparis-guncelleme', await o.kaynak.guncellemeGidecekler(db, KUYRUK_SINIRI));
  if (sira === null) return null;
  const { is: sip, g } = sira;
  const kdv = await sistemAyariOku(db, 'logo.kdv-orani');
  const hizmetKdv = await sistemAyariOku(db, 'logo.hizmet-kdv-orani');
  const cariKodu = (await firmaOzeti(db, sip.firmaId))?.logoCariKodu ?? null;
  // Köprü adımı veritabanına dönmez: eşleme bu transaction'da okunur.
  const harita = await s.logoKodHaritasi(db, belgeStokKodlari(sip));
  const adim = tekAdim(o, g, {
    belge: 'siparis-guncelleme', id: sip.id,
    calis: async (): Promise<AdimSonucu<{ satirlar: SatirBaglari }>> => {
      const once = await kopru.siparisSatirlari(sip.no.trim());
      if (once.tur !== 'basarili') return { sonuc: once.tur, hata: `Satır okuması: ${once.ileti}` };
      const onceki = once.satirRefleri === null ? null : guncellemeEslemesi(sip.satirlar, once.satirRefleri, sip.kaldirilanSatirRefleri);
      // Yeni satırlar önceki denemede eklenmişse kayıtlarıyla gider; eklenmemişse kayıtsız (köprü ekler).
      const satirlar = onceki === null ? sip.satirlar : sip.satirlar.map((x, i) => ({ ...x, logoSatirRef: onceki[i]!.logoSatirRef }));
      const r = siparisGuncellemeGovdesi(logoKodlarinaCevir({ ...sip, satirlar }, harita), { cariKodu, kdv, hizmetKdv });
      if ('hata' in r) return { sonuc: 'reddedildi', hata: r.hata };
      const c = await kopru.siparisGuncelle(r.govde);
      if (c.tur !== 'basarili') return { sonuc: c.tur, hata: `Düzenleme: ${c.ileti}` };
      const sonra = await kopru.siparisSatirlari(sip.no.trim());
      const esleme = sonra.tur === 'basarili' && sonra.satirRefleri !== null
        ? guncellemeEslemesi(satirlar, sonra.satirRefleri, sip.kaldirilanSatirRefleri) : null;
      if (esleme === null) return { sonuc: 'yazilamadi', hata: 'Düzenleme gitti ama Logo satırları CORE satırlarıyla eşlenemedi.' };
      return { tamam: true, kayitNo: sip.logoKayitNo, deger: { satirlar: esleme } };
    },
    bildir: (yazDb, x) => o.kaynak.guncellemeSonucu(yazDb, sip.id, x),
  });
  return turla(adim, (sonuc) => ({ tur: 'guncelleme', no: sip.id, sonuc }));
}

// 2966-1 b: kendi anahtarı ("Logo: sipariş bekletme gönderimi") kapalıyken kuyruk okunmaz, istek atılmaz; istek CORE'da sırada kalır.
// Önce Logo satırları okunur: CORE'un bildiği satır Logo'da yoksa gövde gönderilmez (düzenleme gövdesi eksik satırı kapatırdı).
async function bekletmeTuru(db: Db, o: SatinAlmaTurOrtami, kopru: KopruIstemcisi): Promise<KopruAdimi | null> {
  if (!(await sistemAyariOku(db, 'logo.siparis-bekletme-gonderimi'))) return null;
  const sira = await sirasiGelen(db, o, 'siparis-bekletme', await o.kaynak.bekletmeGidecekler(db, KUYRUK_SINIRI));
  if (sira === null) return null;
  const { is: sip, g } = sira;
  const kdv = await sistemAyariOku(db, 'logo.kdv-orani');
  const hizmetKdv = await sistemAyariOku(db, 'logo.hizmet-kdv-orani');
  const cariKodu = (await firmaOzeti(db, sip.firmaId))?.logoCariKodu ?? null;
  const harita = await s.logoKodHaritasi(db, belgeStokKodlari(sip));
  const ad = sip.istek === 'beklet' ? 'Bekletme' : 'Serbest bırakma';
  const adim = tekAdim<Tamam>(o, g, {
    belge: 'siparis-bekletme', id: sip.id,
    calis: async () => {
      const r = bekletmeGovdesi(logoKodlarinaCevir(sip, harita), { cariKodu, kdv, hizmetKdv }, sip.istek);
      if ('hata' in r) return { sonuc: 'reddedildi', hata: `${ad}: ${r.hata}` };
      const once = await kopru.siparisSatirlari(sip.no.trim());
      if (once.tur !== 'basarili') return { sonuc: once.tur, hata: `Satır okuması: ${once.ileti}` };
      if (once.satirRefleri === null || guncellemeEslemesi(sip.satirlar, once.satirRefleri, []) === null) {
        return { sonuc: 'reddedildi', hata: `${ad}: Logo'daki satırlar CORE'dakiyle tutmuyor; Logo'da elle bakın.` };
      }
      const c = await kopru.siparisGuncelle(r.govde);
      return c.tur === 'basarili' ? { tamam: true, kayitNo: sip.logoKayitNo, deger: { tamam: true } } : { sonuc: c.tur, hata: `${ad}: ${c.ileti}` };
    },
    bildir: (yazDb, x) => o.kaynak.bekletmeSonucu(yazDb, sip.id, sip.istek, x),
  });
  return turla(adim, (sonuc) => ({ tur: 'bekletme', no: sip.id, sonuc }));
}

async function kapatmaTuru(db: Db, o: SatinAlmaTurOrtami, kopru: KopruIstemcisi): Promise<KopruAdimi | null> {
  const sira = await sirasiGelen(db, o, 'siparis-kapatma', await o.kaynak.kapatmaGidecekler(db, KUYRUK_SINIRI));
  if (sira === null) return null;
  const { is: sip, g } = sira;
  const adim = tekAdim<Tamam>(o, g, {
    belge: 'siparis-kapatma', id: sip.id,
    calis: async () => {
      const r = kapatmaGovdesi(sip.satirRefleri);
      if ('hata' in r) return { sonuc: 'reddedildi', hata: r.hata };
      const c = await kopru.siparisKapat(sip.no.trim(), r.govde);
      return c.tur === 'basarili' ? { tamam: true, kayitNo: sip.logoKayitNo, deger: { tamam: true } } : { sonuc: c.tur, hata: `Kapatma: ${c.ileti}` };
    },
    bildir: (yazDb, x) => o.kaynak.kapatmaSonucu(yazDb, sip.id, x),
  });
  return turla(adim, (sonuc) => ({ tur: 'kapatma', no: sip.id, sonuc }));
}

// İptal Logo'da fişi silmez, başlığı iptal işaretler (not 2.3 "cancel"); önce siparişin talep karşılamaları geri alınır (peg/byOrder: köprü
// önce miktarı 0 yazar, sonra siler; not 3b). İkisinin yinelenmesi zararsız sayıldı (VARSAYIM), bu yüzden niyet yazılmaz.
async function iptalTuru(db: Db, o: SatinAlmaTurOrtami, kopru: KopruIstemcisi): Promise<KopruAdimi | null> {
  const sira = await sirasiGelen(db, o, 'siparis-iptal', await o.kaynak.iptalGidecekler(db, KUYRUK_SINIRI));
  if (sira === null) return null;
  const { is: sip, g } = sira;
  const adim = tekAdim<Tamam>(o, g, {
    belge: 'siparis-iptal', id: sip.id,
    calis: async () => {
      const ref = Number(sip.logoKayitNo);
      if (!Number.isSafeInteger(ref) || ref <= 0) return { sonuc: 'reddedildi', hata: 'Siparişin Logo kayıt numarası geçersiz.' };
      const k = await kopru.karsilamaKaldir(ref);
      if (k.tur !== 'basarili') return { sonuc: k.tur, hata: `Karşılama geri alma: ${k.ileti}` };
      const c = await kopru.siparisIptal(sip.no.trim());
      return c.tur === 'basarili' ? { tamam: true, kayitNo: sip.logoKayitNo, deger: { tamam: true } } : { sonuc: c.tur, hata: `İptal: ${c.ileti}` };
    },
    bildir: (yazDb, x) => o.kaynak.iptalSonucu(yazDb, sip.id, x),
  });
  return turla(adim, (sonuc) => ({ tur: 'iptal', no: sip.id, sonuc }));
}

// Karşılama: önce siparişin karşılama listesi okunur (yinelenen istek ikinci kayıt açmasın), yoksa yazılır. Talep fişi onaylı açıldığı için
// (logoStatus 1) karşılama kabul edilir (not 3b).
async function karsilamaTuru(db: Db, o: SatinAlmaTurOrtami, kopru: KopruIstemcisi): Promise<KopruAdimi | null> {
  const kuyruk = (await o.kaynak.karsilamaGidecekler(db, KUYRUK_SINIRI)).map((k) => ({ ...k, id: k.siparisSatirId }));
  const sira = await sirasiGelen(db, o, 'karsilama', kuyruk);
  if (sira === null) return null;
  const { is: k, g } = sira;
  const cariKodu = (await firmaOzeti(db, k.firmaId))?.logoCariKodu ?? null;
  const logodaki = await logoKoduyla(db, k);
  const adim = tekAdim<{ karsilamaRef: string }>(o, g, {
    belge: 'karsilama', id: k.id,
    calis: async () => {
      const r = karsilamaGovdesi(logodaki, cariKodu);
      if ('hata' in r) return { sonuc: 'reddedildi', hata: r.hata };
      const siparisRef = Number(k.siparisKayitNo);
      if (!Number.isSafeInteger(siparisRef) || siparisRef <= 0) return { sonuc: 'reddedildi', hata: 'Siparişin Logo kayıt numarası geçersiz.' };
      const liste = await kopru.karsilamaOku(siparisRef);
      if (liste.tur !== 'basarili') return { sonuc: liste.tur, hata: `Karşılama okuması: ${liste.ileti}` };
      const var_ = karsilamaKaydiBul(liste.govde, Number(k.siparisSatirRef));
      if (var_ === undefined) return { sonuc: 'belirsiz', hata: 'Karşılama listesi beklenen biçimde değil.' };
      if (var_ !== null) return { tamam: true, kayitNo: String(var_), deger: { karsilamaRef: String(var_) } };
      const c = await kopru.karsilamaEkle(r.govde);
      if (c.tur !== 'basarili') return { sonuc: c.tur, hata: `Karşılama: ${c.ileti}` };
      if (c.logicalRef === null) return { sonuc: 'belirsiz', hata: 'Köprü başarı dedi ama karşılama kayıt numarası vermedi; sonraki denemede listeden okunacak.' };
      return { tamam: true, kayitNo: String(c.logicalRef), deger: { karsilamaRef: String(c.logicalRef) } };
    },
    bildir: (yazDb, x) => o.kaynak.karsilamaSonucu(yazDb, k.id, x),
  });
  return turla(adim, (sonuc) => ({ tur: 'karsilama', no: k.id, sonuc }));
}

/* ---------------- Satış: teklif ve tekliften sipariş (Siparişler) ---------------- */

// Sahibi Siparişler'dir: kuyrukları ve sonuçları onun disari.ts işlevleri verir (yön logo -> siparisler). Kalkan anahtarı Siparişler sırasının
// kimliğidir; Portal sırasının eski 'satis-*' izleriyle karışmasın diye belge türü ayrıdır. Tekliften gelmeyen sipariş Logo'ya gitmez (UYUM-BORCU).
export interface LogoyaGidecekSatisTeklifi extends GonderilecekSatisTeklifi {
  firmaId: number | null;
}

export interface SatisKaynagi {
  teklifGidecekler(db: Db, sinir: number): Promise<LogoyaGidecekSatisTeklifi[]>;
  teklifSonucu(db: Db, id: number, sonuc: SiparisLogoSonucu): Promise<void>;
  siparisGidecekler(db: Db, sinir: number): Promise<GonderilecekSatisSiparisi[]>;
  siparisSonucu(db: Db, id: number, sonuc: SiparisLogoSonucu): Promise<void>;
}

export interface SatisTurOrtami extends TurOrtami {
  kaynak: SatisKaynagi;
}

// Bir tur: önce teklif, sonra tekliften sipariş; turda en çok bir yazma isteği. İstek ancak "Logo bağlantısı" ve "Logo: satış gönderimi"
// açık VE köprü değişkenleri varken çıkar.
export function satisTuru(vt: TxAcan, o: SatisTurOrtami): Promise<TurSonucu> {
  return turuKos(vt, (db) => satisHazirla(db, o));
}

async function satisHazirla(db: Db, o: SatisTurOrtami): Promise<TurSonucu | KopruAdimi> {
  if (!(await sistemAyariOku(db, 'logo.baglanti'))) return { tur: 'kapali' };
  if (!(await sistemAyariOku(db, 'logo.satis-gonderimi'))) return { tur: 'satis-kapali' };
  if (o.kopru === null) return { tur: 'ortam-degiskeni-yok' };
  const kopru = o.kopru;
  const kdv = await sistemAyariOku(db, 'logo.kdv-orani');
  const hizmetKdv = await sistemAyariOku(db, 'logo.hizmet-kdv-orani');
  // 3391-2 a: firma kartında seçilmiş CRM satış müşterisi kodu da okunur; teklif o kodla gider.
  const cariler = new Map<number, { cari: string | null; crm: string | null }>();
  const firmaKodlari = async (firmaId: number | null): Promise<{ cari: string | null; crm: string | null }> => {
    if (firmaId === null) return { cari: null, crm: null };
    if (!cariler.has(firmaId)) {
      const f = await firmaOzeti(db, firmaId);
      cariler.set(firmaId, { cari: f?.logoCariKodu ?? null, crm: f?.logoCrmKodu ?? null });
    }
    return cariler.get(firmaId) ?? { cari: null, crm: null };
  };
  // Köprü adımı veritabanına dönmez: gövdeyi kuran ilk transaction aynı firmanın kodunu önbelleğe almıştır.
  const bilinenKodlar = (firmaId: number | null): { cari: string | null; crm: string | null } =>
    (firmaId === null ? { cari: null, crm: null } : cariler.get(firmaId) ?? { cari: null, crm: null });
  const teklif = await niyetliAcmaTuru(db, o, {
    belge: 'siparisler-teklifi', kuyruk: await o.kaynak.teklifGidecekler(db, KUYRUK_SINIRI),
    govde: async (t) => {
      const k = await firmaKodlari(t.firmaId);
      return satisTeklifiGovdesi(await logoKoduyla(db, t), { cariKodu: k.cari, crmKodu: k.crm, kdv, hizmetKdv });
    },
    // Logo teklifi CRM satış müşterisi kaydı ister (not 2.6, validate 4208); yoksa istek atılmaz.
    onKosul: async (t) => {
      const k = bilinenKodlar(t.firmaId);
      const kod = (k.cari ?? '').trim();
      const m = await kopru.satisMusterisiVarMi(kod);
      if (m.tur !== 'basarili') return { sonuc: m.tur === 'reddedildi' ? 'reddedildi' : m.tur, hata: `Satış müşterisi okuması: ${m.ileti}` };
      if (m.logicalRef === null) return { sonuc: 'reddedildi', hata: kirp(`Cari ${kod} Logo'da satış müşterisi (CRM) olarak tanımlı değil.`) };
      const engel = seciliCrmEngeli(k.crm, kod, m);
      return engel === null ? null : { sonuc: 'reddedildi', hata: engel };
    },
    ekle: async (_t, govde) => {
      const r = await kopru.satisTeklifiEkle(govde);
      // Cevapta satır kayıtları yoksa teklif kaydından okunur (cevabın satır kabı notta yok).
      if (r.tur !== 'basarili' || r.logicalRef === null || r.satirRefleri !== null) return r;
      const oku = await kopru.satisTeklifiOku(r.logicalRef);
      return oku.tur === 'basarili' ? { ...r, satirRefleri: oku.satirRefleri } : r;
    },
    bildir: (yazDb, t, x) => o.kaynak.teklifSonucu(yazDb, t.id, x),
    elleEngeli: (t) => satisElleEngeli(db, { tur: 'teklif', siraId: t.id }),
  });
  if (teklif !== null) return teklif;
  const siparis = await niyetliAcmaTuru(db, o, {
    belge: 'siparisler-siparisi', kuyruk: await o.kaynak.siparisGidecekler(db, KUYRUK_SINIRI),
    govde: async (t) => satisSiparisiGovdesi(t),
    // Teklif projesiz gider (CORE'da proje siparişten açılır).
    projeId: async (t) => {
      if (t.siparisId == null) return null;
      return satisSiparisiProjesi(await siparisinProjeleri(db, t.siparisId));
    },
    // Satırlar Logo'daki teklif satırına bağlıdır, stok kodu taşımaz: kart denetimi (3313) teklif giderken yapıldı, burada boş geçer.
    // Gövde kuralı teklif kaydının geçerli olduğunu denetledi.
    ekle: (t, govde) => kopru.satisSiparisiAc(Number(t.teklifKayitNo), govde),
    bildir: (yazDb, t, x) => o.kaynak.siparisSonucu(yazDb, t.id, x),
    elleEngeli: (t) => satisElleEngeli(db, { tur: 'siparis', teklifKayitNo: t.teklifKayitNo }),
  });
  return siparis ?? { tur: 'bos' };
}

// 3315 a: belgenin projesi. Anahtar kapalıyken, projesiz belgede ve proje kaydı yoksa kod gitmez; proje Logo'da değilse belge bekler.
// VARSAYIM: aktif olmayan ve Logo'ya gitmemiş projenin belgesi beklemez, projesiz gider (proje işi yalnız aktif projeyi gönderir).
export async function belgeProjesi(db: Db, projeId: number | null): Promise<{ kod: string | null } | { bekliyor: string }> {
  if (projeId === null || (await sistemAyariOku(db, PROJE_AYARI)) !== true) return { kod: null };
  const p = await projeGetir(db, projeId);
  if (p === null) return { kod: null };
  if ((await s.logodakiProjeler(db, [projeId])).length > 0) return { kod: p.kod };
  return p.durum === 'aktif' ? { bekliyor: p.kod } : { kod: null };
}

// 2116-3 c: Logo'ya giden her belgede malzeme kodu eşlemeden geçer (Logo kodu TMI biçimine uymayan kart TMI'de kendi koduyla açıldı).
// Eşlemesi olmayan kod aynen gider. Belgenin geri kalanına ve TMI'deki kayda dokunulmaz.
async function logoKoduyla<T extends Parameters<typeof logoKodlarinaCevir>[0]>(db: Db, b: T): Promise<T> {
  return logoKodlarinaCevir(b, await s.logoKodHaritasi(db, belgeStokKodlari(b)));
}

/* ---------------- Okuma akışları (logo -> TMI): yalnız GET, yalnız saklanır ---------------- */

// Okunan satır stoka, satın almaya ya da başka modüle işlenmez (UYUM-BORCU "bağlamada kapanacak"). İstek ancak "Logo bağlantısı" ve akışın
// kendi anahtarı açık VE köprü değişkenleri varken çıkar. Turda en çok bir okuma isteği (fatura turu hariç: sınırlı sayıda sipariş, sıralı).
export async function okumaKapisi(
  db: Db, o: TurOrtami, ayar: LogoAyarAnahtari,
  kapali: 'mal-kabul-kapali' | 'liste-kapali' | 'fatura-kapali' | 'malzeme-fisi-kapali' | 'malzeme-karti-kapali' | 'stok-kapali' | 'kullanim-kapali' | 'irsaliye-kapali' | 'son-alis-kapali' | 'fatura-listesi-kapali' | 'cari-hareket-kapali',
): Promise<TurSonucu | KopruIstemcisi> {
  if (!(await sistemAyariOku(db, 'logo.baglanti'))) return { tur: 'kapali' };
  if (!(await sistemAyariOku(db, ayar))) return { tur: kapali };
  return o.kopru ?? { tur: 'ortam-degiskeni-yok' };
}

// Başarısız okuma bekleme süresi dolmadan yinelenmez: köprü kapalıyken ya da anahtar yanlışken her turda istek atılmaz.
const okumaSirasiGeldi = (o: TurOrtami, anahtar: string): boolean => {
  const son = o.bellek.okumaDenemeleri.get(anahtar);
  return !son || o.saat().getTime() - son.getTime() >= OKUMA_HATA_BEKLEME_MS;
};

// Mal kabul: since = tablodaki son satır kaydı. Satır kaydı tekildir, imleç geriye gitmez; tekrar okuma çift satır açmaz.
export function malKabulTuru(vt: TxAcan, o: TurOrtami): Promise<TurSonucu> {
  return turuKos(vt, async (db) => {
    const kopru = await okumaKapisi(db, o, 'logo.mal-kabul-okumasi', 'mal-kabul-kapali');
    if ('tur' in kopru) return kopru;
    if (!okumaSirasiGeldi(o, 'mal-kabul')) return { tur: 'bos' };
    const imlec = await s.malKabulImleci(db);
    return async () => {
      const r = await kopru.malKabulOku(imlec?.sonRef ?? 0);
      if (r.tur !== 'basarili') {
        o.bellek.okumaDenemeleri.set('mal-kabul', o.saat());
        return async () => ({ tur: 'okuma', akis: 'mal-kabul', sonuc: r.tur, sayi: 0, ileti: r.ileti });
      }
      o.bellek.okumaDenemeleri.delete('mal-kabul');
      return async (db2) => {
        await s.malKabulYaz(db2, r.veri.satirlar, o.saat());
        return { tur: 'okuma', akis: 'mal-kabul', sonuc: 'okundu', sayi: r.veri.satirlar.length };
      };
    };
  });
}

// Cari ve ambar listesi saatte bir; turda eskimiş ilk liste okunur (köprüye aynı anda tek istek), diğeri sonraki turda.
export function listeOkumaTuru(vt: TxAcan, o: TurOrtami): Promise<TurSonucu> {
  return turuKos(vt, async (db) => {
    const kopru = await okumaKapisi(db, o, 'logo.liste-okumasi', 'liste-kapali');
    if ('tur' in kopru) return kopru;
    for (const liste of ['cari', 'ambar'] as const) {
      const okuma = await s.listeOkumasi(db, liste);
      if (!listeOkunmaliMi(okuma?.sonOkumaAn ?? null, o.bellek.okumaDenemeleri.get(liste) ?? null, o.saat(), o.zorlaAni ?? null)) continue;
      return async (): Promise<Yazici<TurSonucu>> => {
        o.bellek.okumaDenemeleri.set(liste, o.saat());
        const r = liste === 'cari' ? await kopru.cariListesiOku() : await kopru.ambarListesiOku();
        if (r.tur !== 'basarili') return async () => ({ tur: 'okuma', akis: liste, sonuc: r.tur, sayi: 0, ileti: r.ileti });
        return async (db2) => {
          await s.listeYaz(db2, liste, r.veri, o.saat());
          return { tur: 'okuma', akis: liste, sonuc: 'okundu', sayi: r.veri.length };
        };
      };
    }
    return { tur: 'bos' };
  });
}

// Logo malzeme kodu listesi (2089-2 a): malzemeler yeni kod verirken Logo'da kullanılanı atlar. "Logo bağlantısı" açık ve köprü varken saatte bir okunur.
export function malzemeKoduTuru(vt: TxAcan, o: TurOrtami): Promise<TurSonucu> {
  return turuKos(vt, async (db) => {
    if (!(await sistemAyariOku(db, 'logo.baglanti'))) return { tur: 'kapali' };
    const kopru = o.kopru;
    if (kopru === null) return { tur: 'ortam-degiskeni-yok' };
    const okuma = await s.listeOkumasi(db, 'malzeme');
    if (!listeOkunmaliMi(okuma?.sonOkumaAn ?? null, o.bellek.okumaDenemeleri.get('malzeme-kodu') ?? null, o.saat(), o.zorlaAni ?? null)) return { tur: 'bos' };
    return async (): Promise<Yazici<TurSonucu>> => {
      o.bellek.okumaDenemeleri.set('malzeme-kodu', o.saat());
      const r = await kopru.malzemeKodlari();
      if (r.tur !== 'basarili') return async () => ({ tur: 'okuma', akis: 'malzeme-kodu', sonuc: r.tur, sayi: 0, ileti: r.ileti });
      return async (db2) => {
        await s.malzemeKodlariniYaz(db2, r.kodlar, o.saat());
        return { tur: 'okuma', akis: 'malzeme-kodu', sonuc: 'okundu', sayi: r.kodlar.length };
      };
    };
  });
}

// Ters yöndeki bağ (2089-2 a): malzemeler logoyu ithal edemez; sunucu/kablolama.ts bu çözücüyü malzemelere kaydeder. Yetki denetlemez.
export function logodaKullanilanMalzemeKodlari(db: Db, kodlar: readonly string[]): Promise<string[]> {
  return s.logodaOlanMalzemeKodlari(db, kodlar);
}

// 2116: malzeme kartı ve stok toplamı sayfa sayfa okunur (iş turunda tek sayfa); tam tur ilk açılışta ve ayar kapatılıp açılınca başlar (3077 a, 3316-K2 a). Okunan yalnız logo
// modülünün aynasına yazılır, TMI kartına ya da stoğuna işlenmez (2116-1 a, 2116-2 a); Logo'ya hiçbir şey gitmez.
function sayfaliOkumaTuru<T>(
  akis: s.SayfaliAkis, ayar: LogoAyarAnahtari, kapali: 'malzeme-karti-kapali' | 'stok-kapali' | 'kullanim-kapali',
  oku: (kopru: KopruIstemcisi, since: number) => Promise<{ tur: 'basarili'; veri: Sayfa<T> } | Exclude<KopruSonucu, { tur: 'basarili' }>>,
  yaz: (db: Db, kayitlar: readonly T[], zaman: Date) => Promise<void>,
): (vt: TxAcan, o: TurOrtami) => Promise<TurSonucu> {
  return (vt, o) => turuKos(vt, async (db) => {
    const kopru = await okumaKapisi(db, o, ayar, kapali);
    if ('tur' in kopru) {
      if (kopru.tur === kapali) await s.acilistaTurIste(db, akis);
      return kopru;
    }
    if (!okumaSirasiGeldi(o, akis)) return { tur: 'bos' };
    const imlec = await s.okumaImleci(db, akis);
    const sira = sayfaliOkumaSirasi(imlec);
    if (sira === 'bekle') return { tur: 'bos' };
    const since = sira === 'devam' && imlec ? imlec.sonRef : 0;
    const turBasi = sira === 'devam' && imlec ? imlec.turBasi : o.saat();
    return async (): Promise<Yazici<TurSonucu>> => {
      const r = await oku(kopru, since);
      if (r.tur !== 'basarili') {
        o.bellek.okumaDenemeleri.set(akis, o.saat());
        return async () => ({ tur: 'okuma', akis, sonuc: r.tur, sayi: 0, ileti: r.ileti });
      }
      o.bellek.okumaDenemeleri.delete(akis);
      return async (db2) => {
        const simdi = o.saat();
        await s.sayfaYaz(db2, akis, turBasi, simdi, r.veri.sonraki, r.veri.kayitlar.length, () => yaz(db2, r.veri.kayitlar, simdi));
        return { tur: 'okuma', akis, sonuc: 'okundu', sayi: r.veri.kayitlar.length };
      };
    };
  });
}

export const malzemeKartiOkumaTuru = sayfaliOkumaTuru<LogoMalzemeKarti>(
  'malzeme-karti', 'logo.malzeme-okumasi', 'malzeme-karti-kapali', (k, since) => k.malzemeKartlariOku(since), s.malzemeKartlariniYaz,
);
export const stokOkumaTuru = sayfaliOkumaTuru<LogoStokSatiri>(
  'stok', 'logo.stok-okumasi', 'stok-kapali', (k, since) => k.stokToplamlariOku(since), s.stokToplamlariniYaz,
);
// 3079 a: kendi ayarıyla; "Geçişi bitir" kapatır.
export const kullanimOkumaTuru = sayfaliOkumaTuru<LogoKullanimSatiri>(
  'kullanim', 'logo.kullanim-okumasi', 'kullanim-kapali', (k, since) => k.kullanimlariOku(since), s.kullanimlariYaz,
);

// Malzemeler "Logo'dan gelenler" listesini ve stok karşılaştırmasını bunlarla okur (sunucu/kablolama.ts bağlar). Yetki denetlemez; okuyan uç denetler.
export function logodakiMalzemeKartlari(db: Db, o: { kodlar?: readonly string[]; ara?: string; sinir: number; sonra: number }): Promise<s.AynadakiKart[]> {
  return s.aynadakiKartlar(db, o);
}
export function logodakiStokToplamlari(db: Db, malzemeKodlari: readonly string[]): Promise<(LogoStokSatiri & { sonOkuma: string })[]> {
  return s.aynadakiStoklar(db, malzemeKodlari);
}

// Geçiş sayfası (3068): aynanın özeti ve okuma durumu. Okuma açık değilse ayna eski kalabilir; tur sürerken sayılar artar.
export interface LogoAynaOzeti {
  kartlar: s.AynaOzetSatiri[];
  okuma: { acik: boolean; suruyor: boolean; okunan: number | null; sonTamam: string | null };
  // 3080 a: tek kart canlı araması açık mı (düğme buna göre).
  arama: { acik: boolean };
  // 3079 a: kullanım izi en az bir tam turda okunduysa "Kullanılanlar" süzgeci kurulur; okunmadıysa liste "Stoğu olanlar"la kalır.
  kullanim: { acik: boolean; sonTamam: string | null };
}
// 3474-1: Logo geçişi cariler sekmesi. Ayna saatlik cari listesi okumasıdır (listeOkumaTuru); okuma kapalıysa ayna eskir, sekme bunu söyler.
export interface LogoCariAynasi { acik: boolean; sonOkuma: string | null; cariler: { kod: string; ad: string | null }[] }
export async function logodakiCariAynasi(db: Db): Promise<LogoCariAynasi> {
  const acik = (await sistemAyariOku(db, 'logo.baglanti')) === true && (await sistemAyariOku(db, 'logo.liste-okumasi')) === true;
  const okuma = await s.listeOkumasi(db, 'cari');
  return { acik, sonOkuma: okuma?.sonOkumaAn.toISOString() ?? null, cariler: await s.cariAynasi(db) };
}

export async function logodakiMalzemeOzeti(db: Db, o: { ara?: string }): Promise<LogoAynaOzeti> {
  const acik = (await sistemAyariOku(db, 'logo.baglanti')) === true && (await sistemAyariOku(db, 'logo.malzeme-okumasi')) === true;
  const i = await s.okumaImleci(db, 'malzeme-karti');
  const u = await s.okumaImleci(db, 'kullanim');
  return {
    kartlar: await s.aynaOzeti(db, o),
    kullanim: { acik: acik && (await sistemAyariOku(db, 'logo.kullanim-okumasi')) === true, sonTamam: u?.sonTamamMetni ?? null },
    arama: { acik: await logoMalzemeAramasiAcik(db) },
    // İmleç başta değilse tur yarıdadır; hiç tam tur bitmemişse ya da istenen tur başlamadıysa da okuma sürüyor sayılır.
    okuma: { acik, suruyor: acik && sayfaliOkumaSirasi(i) !== 'bekle', okunan: i?.sayi ?? null, sonTamam: i?.sonTamamMetni ?? null },
  };
}

// 3316: toplu okuma ekrandan istenmez (kart canlı aranır). "Geçişi bitir" Sistem Ayarları'nda açık kalmış okumaları kapatır, okunmuş kopya
// silinmez. Değişiklik ayar geçmişine yazılır.
const GECIS_AYARLARI = ['logo.malzeme-okumasi', 'logo.stok-okumasi'] as const;
const GECIS_KAYNAGI = { modul: 'logo', yetki: 'ayarlar.yaz' } as const;
// 3313: "Yeniden gönder". Yalnız duran belge (kalıcı ret) yeniden sıraya girer; belirsiz sonuçlu belge (ulaşılamadı, zaman aşımı, CORE'a
// yazılamadı) elle gönderilmez, kendi beklemesiyle yinelenir. Belge sıradaki ilk turda gider; deneme geçmişi kalır.
export async function gidenYenidenGonder(db: Db, g: { belge: BelgeTuru; no: number; islem?: GidenIslemi }, simdi: Date): Promise<boolean> {
  return s.duraniYenidenAc(db, g.belge, g.no, simdi, g.islem);
}
export async function duranlariYenidenGonder(
  db: Db, belgeler: readonly { belge: string; no: number; islem: GidenIslemi }[], simdi: Date,
): Promise<{ sirada: number; durmayan: number }> {
  let sirada = 0;
  for (const b of belgeler) {
    if (!s.belgeTuruMu(b.belge)) throw gecersiz(`Bilinmeyen belge türü: ${b.belge}`);
    if (b.islem === 'pasif' && b.belge !== 'malzeme' && b.belge !== 'hizmet') throw gecersiz('Pasife alma yalnız malzeme ve hizmet kartındadır.');
    if (await gidenYenidenGonder(db, { belge: b.belge, no: b.no, islem: b.islem }, simdi)) sirada += 1;
  }
  return { sirada, durmayan: belgeler.length - sirada };
}

// 3313: bağlantı izleme ekranının Logo giden bölümü. Yalnız okur; tutar, fiyat ve firma adı taşımaz (belge türü ve CORE numarası yeter).
const IZLEME_SINIRI = 500;
// 3315 madde 7: proje kodu açıldıktan sonra değişmez; kart kaydedilince proje kendiliğinden yeniden gider.
const PROJE_DURDU_NE_YAPMALI = 'Logo reddetti. Proje kartını düzeltip kaydedin; yeniden gider (ya da "Yeniden gönder").';
export async function gidenIzleme(db: Db, simdi: Date): Promise<LogoGidenIzlemeCevabi> {
  const satirlar = await s.gidenIzlemeSatirlari(db, IZLEME_SINIRI + 1);
  const kesildi = satirlar.length > IZLEME_SINIRI;
  const zaman = (d: Date | null): string | null => (d === null ? null : d.toISOString());
  const belgeler: LogoGidenIzlemeCevabi['belgeler'] = satirlar.slice(0, IZLEME_SINIRI).map((g) => {
    const durum = gidenIzlemeDurumu(g);
    return {
      belge: g.belgeTuru, belgeAdi: gidenBelgeAdi(g.belgeTuru, g.islem), no: g.belgeNo, islem: g.islem, durum, neden: g.sonHata,
      neYapmali: kontrolEdilebilirMi(g) ? KONTROL_NE_YAPMALI : durum === 'durdu' ? (g.belgeTuru === 'proje' ? PROJE_DURDU_NE_YAPMALI : durduNeYapmali(g.sonHata)) : GIDEN_NE_YAPMALI[durum], yenidenGonderilebilir: durum === 'durdu',
      kontrolEdilebilir: kontrolEdilebilirMi(g), denemeSayisi: g.denemeSayisi,
      sonDeneme: zaman(g.sonDeneme), sonrakiDeneme: durum === 'durdu' ? null : zaman(g.sonrakiDeneme),
    };
  });
  for (const [k, v] of kartBekleyenBelgeler) {
    if (!bekleyenTaze(v.goruldu, simdi)) { kartBekleyenBelgeler.delete(k); continue; }
    const i = belgeler.findIndex((b) => b.belge === v.belge && b.no === v.no && b.islem === 'gonder');
    const satir = {
      belge: v.belge, belgeAdi: gidenBelgeAdi(v.belge, 'gonder'), no: v.no, islem: 'gonder' as const, durum: v.durum, neden: v.ileti,
      neYapmali: GIDEN_NE_YAPMALI[v.durum], yenidenGonderilebilir: false, kontrolEdilebilir: false,
      denemeSayisi: i >= 0 ? belgeler[i]!.denemeSayisi : null, sonDeneme: i >= 0 ? belgeler[i]!.sonDeneme : null, sonrakiDeneme: null,
    };
    if (i >= 0) belgeler[i] = satir;
    else belgeler.push(satir);
  }
  const say = (d: GidenIzlemeDurumu): number => belgeler.filter((b) => b.durum === d).length;
  return {
    sayac: { durdu: say('durdu'), yenidenDenenecek: say('yeniden-denenecek'), kartBekliyor: say('kart-bekliyor'), projeBekliyor: say('proje-bekliyor'), sirada: say('sirada') },
    belgeler, kesildi,
  };
}

export async function gecisiBitir(db: Db, kisiId: number): Promise<void> {
  for (const a of [...GECIS_AYARLARI, 'logo.kullanim-okumasi'] as const) {
    const simdi = (await sistemAyariOku(db, a)) === true;
    if (simdi) await modulAyariDegistir(db, kisiId, a, false, true, { ...GECIS_KAYNAGI, yol: '/logo-gecisi/bitir' });
  }
}

// 2116-3 c: Logo'dan alınan ve TMI'de başka kodla açılan kartın eşlemesi; aynı transaction'da kartla birlikte yazılır. Yalnız malzemeler çağırır.
export async function malzemeEslemesiYaz(db: Db, e: { stokKodu: string; logoKodu: string; logoKayitNo: number }): Promise<void> {
  const stokKodu = e.stokKodu.trim();
  const logoKodu = e.logoKodu.trim();
  if (stokKodu === logoKodu) return;
  await s.eslemeYaz(db, { stokKodu, logoKodu, logoKayitNo: e.logoKayitNo });
}
// Okunan Logo satırının (mal kabul, fatura) kodu TMI kartına çevrilir; eşlemesi olmayan kod aynen kalır.
export function tmiStokKodlari(db: Db, logoKodlari: readonly string[]): Promise<Map<string, string>> {
  return s.tmiKodHaritasi(db, logoKodlari);
}

// 2118: cari arama ve tek cari, kullanıcının isteğiyle (yalnız GET). Ayar ve köprü kısa transaction'da okunur, köprü cevabı transaction dışında
// beklenir. Kapalıysa ya da köprü yoksa istek atılmaz; sebep kullanıcıya döner.
export type CariOkumasi<T> = { tur: 'tamam'; veri: T } | { tur: 'kapali' | 'ortam-degiskeni-yok' | 'hata'; ileti: string };

async function cariKapisi(vt: TxAcan, kopru: KopruIstemcisi | null): Promise<KopruIstemcisi | { tur: 'kapali' | 'ortam-degiskeni-yok'; ileti: string }> {
  const acik = await vt.tx(async (db) => (await sistemAyariOku(db, 'logo.baglanti')) === true && (await sistemAyariOku(db, 'logo.cari-aramasi')) === true);
  if (!acik) return { tur: 'kapali', ileti: 'Logo\'dan cari arama Sistem Ayarları\'nda kapalı ("Logo bağlantısı" ve "Logo: cari arama").' };
  return kopru ?? { tur: 'ortam-degiskeni-yok', ileti: BEKLEME_NEDENLERI['ortam-degiskeni-yok'] };
}

export async function logoCariAra(vt: TxAcan, kopru: KopruIstemcisi | null, metin: string): Promise<CariOkumasi<LogoCari[]>> {
  const q = metin.trim();
  if (q.length < CARI_ARAMA_EN_AZ || q.length > CARI_ARAMA_EN_COK) {
    throw gecersiz(`Arama metni ${CARI_ARAMA_EN_AZ}-${CARI_ARAMA_EN_COK} karakter olmalı.`);
  }
  const k = await cariKapisi(vt, kopru);
  if ('tur' in k) return k;
  const r = await k.cariAra(q);
  return r.tur === 'basarili' ? { tur: 'tamam', veri: r.veri } : { tur: 'hata', ileti: r.ileti };
}

export async function logoCariOku(vt: TxAcan, kopru: KopruIstemcisi | null, kod: string): Promise<CariOkumasi<LogoCari | null>> {
  const k = await cariKapisi(vt, kopru);
  if ('tur' in k) return k;
  const r = await k.cariOku(kod.trim());
  return r.tur === 'basarili' ? { tur: 'tamam', veri: r.veri } : { tur: 'hata', ileti: r.ileti };
}

const crmKapaliNedeni = (acik: boolean, kopru: KopruIstemcisi | null): string | null =>
  !acik ? 'Sistem Ayarları\'nda "Logo bağlantısı" kapalı; CRM durumu okunmuyor.' : kopru === null ? BEKLEME_NEDENLERI['ortam-degiskeni-yok'] : null;

// 3359 ek: teklif ve satış siparişinin firması Logo'ya hazır mı; firma kartında cari kodu yoksa yardımcıya sorulmaz. Firma yoksa null (404).
export async function cariHazirligi(vt: TxAcan, kopru: KopruIstemcisi | null, firmaId: number): Promise<LogoCariHazirlikCevabi | null> {
  const { acik, firma } = await vt.tx(async (db) => ({ acik: (await sistemAyariOku(db, 'logo.baglanti')) === true, firma: await firmaOzeti(db, firmaId) }));
  if (firma === null) return null;
  const kod = (firma.logoCariKodu ?? '').trim();
  if (kod === '') return { durum: 'cari-yok', neden: null };
  const kapali = crmKapaliNedeni(acik, kopru);
  if (kapali !== null || kopru === null) return { durum: 'okunamadi', neden: kapali };
  return crmDurumu(await kopru.satisMusterisiVarMi(kod));
}

// 3391-2 a: firma kartında CRM kodu seçilirken carinin Logo'daki bağları (yalnız GET). Bağ yoksa veri null.
export async function cariCrmKodlariOku(
  vt: TxAcan, kopru: KopruIstemcisi | null, kod: string,
): Promise<CariOkumasi<{ kodlar: string[]; secilebilir: boolean } | null>> {
  const acik = await vt.tx(async (db) => (await sistemAyariOku(db, 'logo.baglanti')) === true);
  const kapali = crmKapaliNedeni(acik, kopru);
  if (kapali !== null || kopru === null) return { tur: acik ? 'ortam-degiskeni-yok' : 'kapali', ileti: kapali ?? BEKLEME_NEDENLERI['ortam-degiskeni-yok'] };
  const r = await kopru.satisMusterisiVarMi(kod.trim());
  if (r.tur !== 'basarili') return { tur: 'hata', ileti: `Satış müşterisi okuması: ${r.ileti}` };
  if (r.logicalRef === null) return { tur: 'tamam', veri: null };
  const l = crmKodlari(r);
  return { tur: 'tamam', veri: { kodlar: l?.kodlar ?? [], secilebilir: l?.secilebilir ?? false } };
}

// 3391-2 a: Logo geçişinde CRM bağı denetimi; yalnız GET, transaction dışında ve sırayla. Ulaşılamayan yardımcıda tarama durur.
// Tek lisanslı yardımcı denetim boyunca başka Logo işlerini bekletir: aynı anda tek denetim, toplam süre sınırlı (Risk K3).
export const LOGO_CRM_DENETIM_SURESI_MS = 120_000;
let crmDenetimiSuruyor = false;
export async function crmDenetimi(vt: TxAcan, kopru: KopruIstemcisi | null, saat: () => number = Date.now): Promise<LogoCrmDenetimiCevabi> {
  if (crmDenetimiSuruyor) return { durum: 'okunamadi', neden: 'Başka bir CRM bağı denetimi sürüyor; bitince yeniden deneyin.', taranan: 0, eksik: false, satirlar: [] };
  crmDenetimiSuruyor = true;
  try {
    return await crmDenetimiYap(vt, kopru, saat);
  } finally {
    crmDenetimiSuruyor = false;
  }
}
async function crmDenetimiYap(vt: TxAcan, kopru: KopruIstemcisi | null, saat: () => number): Promise<LogoCrmDenetimiCevabi> {
  const { acik, firmalar } = await vt.tx(async (db) => {
    const idler = (await tumFirmalar(db)).filter((f) => f.aktif && f.tur !== 'tedarikci').map((f) => f.id);
    const ozet = [...(await firmaOzetleri(db, idler)).values()].filter(crmSorulurMu).sort((a, b) => a.id - b.id);
    return { acik: (await sistemAyariOku(db, 'logo.baglanti')) === true, firmalar: ozet };
  });
  const kapali = crmKapaliNedeni(acik, kopru);
  if (kapali !== null || kopru === null) return { durum: 'okunamadi', neden: kapali, taranan: 0, eksik: false, satirlar: [] };
  const sirada = firmalar.slice(0, LOGO_CRM_DENETIM_SINIRI);
  const satirlar: LogoCrmDenetimiCevabi['satirlar'] = [];
  const bitis = saat() + LOGO_CRM_DENETIM_SURESI_MS;
  let taranan = 0;
  for (const f of sirada) {
    if (saat() >= bitis) {
      return { durum: 'okunamadi', neden: `Süre sınırı (${String(LOGO_CRM_DENETIM_SURESI_MS / 60_000)} dk) doldu; Logo işlerini bekletmemek için durduruldu.`, taranan, eksik: true, satirlar };
    }
    const cari = (f.logoCariKodu ?? '').trim();
    const r = await kopru.satisMusterisiVarMi(cari);
    if (crmSorguyuKeser(r)) return { durum: 'okunamadi', neden: crmDurumu(r).neden, taranan, eksik: true, satirlar };
    taranan += 1;
    const sorun = crmSorunu(f.logoCrmKodu, r);
    if (sorun !== null) satirlar.push({ firmaId: f.id, kod: f.kod, ad: f.ad, cariKodu: cari, sorun, sayi: crmKodlari(r)?.sayi ?? null, secili: f.logoCrmKodu });
  }
  return { durum: 'tamam', neden: null, taranan, eksik: firmalar.length > sirada.length, satirlar };
}

// 3359 a: carinin Logo CRM satış müşterisi durumu, ekranda göstermek için (teklif gönderimindeki ön koşulla aynı okuma). Yalnız GET; firma ve
// ayar kısa transaction'da okunur, yardımcı transaction dışında ve sırayla beklenir (yardımcı tek lisanslıdır).
// Logo cari aramasında bağlanmamış carinin de CRM durumu (kullanıcı 20.11 08:15): koddan sorulur, CORE firması gerekmez.
// Kapalıysa ya da yardımcıya ulaşılamazsa kalan kodlar okunamadı döner (aynı kesme kuralı).
// 3480 Risk K1: yardımcı istekleri sırayla işler; liste her açılışta 50 GET atıp sipariş ve teklif gönderimini bekletmesin diye
// okunmuş durum (var ya da yok) kod başına 5 dakika bellekte tutulur. Okunamayan tutulmaz.
export const CRM_KOD_BELLEK_MS = 5 * 60_000;
const crmKodBellegi = new Map<string, { zaman: number; durum: LogoCrmKodCevabi['durumlar'][number] }>();
export function crmKodBelleginiTemizle(): void { crmKodBellegi.clear(); }
export async function cariKodCrmDurumlari(
  vt: TxAcan, kopru: KopruIstemcisi | null, kodlar: readonly string[], saat: () => number = Date.now,
): Promise<LogoCrmKodCevabi> {
  const acik = await vt.tx(async (db) => (await sistemAyariOku(db, 'logo.baglanti')) === true);
  const durumlar: LogoCrmKodCevabi['durumlar'] = [];
  let kesildi: string | null = crmKapaliNedeni(acik, kopru);
  for (const kod of kodlar) {
    if (kesildi !== null || kopru === null) { durumlar.push({ kod, durum: 'okunamadi', neden: kesildi, kodlar: null }); continue; }
    const anahtar = kod.toUpperCase();
    const bellek = crmKodBellegi.get(anahtar);
    const simdi = saat();
    if (bellek !== undefined && simdi - bellek.zaman >= 0 && simdi - bellek.zaman < CRM_KOD_BELLEK_MS) { durumlar.push({ ...bellek.durum, kod }); continue; }
    const r = await kopru.satisMusterisiVarMi(kod);
    const d = crmDurumu(r);
    if (crmSorguyuKeser(r)) kesildi = d.neden;
    const durum = { kod, ...d, kodlar: crmKodlari(r) };
    if (durum.durum !== 'okunamadi') crmKodBellegi.set(anahtar, { zaman: simdi, durum });
    durumlar.push(durum);
  }
  return { durumlar };
}

export async function cariCrmDurumlari(vt: TxAcan, kopru: KopruIstemcisi | null, idler: readonly number[]): Promise<LogoCrmCevabi> {
  const { acik, firmalar } = await vt.tx(async (db) => ({
    acik: (await sistemAyariOku(db, 'logo.baglanti')) === true,
    firmalar: [...(await firmaOzetleri(db, [...idler])).values()].filter(crmSorulurMu),
  }));
  if (firmalar.length === 0) return { durumlar: [] };
  const kapali = crmKapaliNedeni(acik, kopru);
  const durumlar: LogoCrmCevabi['durumlar'] = [];
  let kesildi: string | null = kapali;
  for (const f of firmalar) {
    if (kesildi !== null || kopru === null) { durumlar.push({ firmaId: f.id, durum: 'okunamadi', neden: kesildi, kodlar: null }); continue; }
    const r = await kopru.satisMusterisiVarMi((f.logoCariKodu ?? '').trim());
    const d = crmDurumu(r);
    if (crmSorguyuKeser(r)) kesildi = d.neden;
    durumlar.push({ firmaId: f.id, ...d, kodlar: crmKodlari(r) });
  }
  return { durumlar };
}

// 3360 a: beş listede "Logo'da ara". Ayar kısa transaction'da, köprü transaction dışında; CORE karşılığı giden kutusundan okunur.
export const BELGE_ARAMA_GUN = 365;
export async function logoBelgeAramasiAcik(db: Db): Promise<boolean> {
  return (await sistemAyariOku(db, 'logo.baglanti')) === true && (await sistemAyariOku(db, 'logo.belge-aramasi')) === true;
}
export const LOGO_BELGE_ARAMA_KAPALI = 'Logo\'da belge araması Sistem Ayarları\'nda kapalı ("Logo bağlantısı" ve "Logo: belge araması").';
export async function logoBelgeAra(
  vt: TxAcan, kopru: KopruIstemcisi | null, tur: LogoBelgeAramaTuru, metin: string, fiyatGorunur: boolean, a: { kisiId?: number; belge?: number } = {},
): Promise<LogoBelgeAramaCevabi> {
  const baglanacakId = a.belge;
  const q = metin.trim();
  const bos = (durum: 'kapali' | 'ortam-degiskeni-yok' | 'hata', ileti: string): LogoBelgeAramaCevabi => ({ durum, ileti, fiyatGorunur, belgeler: [], baglanacak: null });
  // 3360-2 a: bağlanacak belge önce okunur (yoksa 404, köprüye gidilmez).
  const bagTuru = baglanacakId === undefined ? null : (LOGO_BAGLANABILIR_TURLER as readonly string[]).includes(tur) ? (tur as LogoBaglanabilirTur) : null;
  if (baglanacakId !== undefined && bagTuru === null) throw gecersiz('Bu belge türünde bağlama yok.');
  const ilk = bagTuru === null || baglanacakId === undefined ? null : await vt.tx((db) => baglanacakBelge(db, bagTuru, baglanacakId));
  if (!(await vt.tx(logoBelgeAramasiAcik))) return bos('kapali', LOGO_BELGE_ARAMA_KAPALI);
  if (kopru === null) return bos('ortam-degiskeni-yok', BEKLEME_NEDENLERI['ortam-degiskeni-yok']);
  const r = await kopru.belgeAra(BELGE_ARAMA_TURU[tur], q, BELGE_ARAMA_GUN);
  if (r.tur !== 'basarili') return bos('hata', r.ileti);
  if (a.kisiId !== undefined) aramayiHatirla(a.kisiId, tur, r.veri, Date.now());
  const core = await vt.tx(async (db) => {
    const giden = await s.logoKaydinaGidenler(db, BELGE_ARAMA_GIDEN_TURU[tur], r.veri.map((b) => String(b.logoKayitNo)));
    // 3374: satış teklifi ve siparişinin giden satırı Siparişler'in Logo sırasıdır; CORE kimliği sıradan okunur.
    const siraTuru = tur === 'teklif' ? 'teklif' : tur === 'satis-siparisi' ? 'siparis' : null;
    const belgesi = siraTuru === null ? null : new Map((await logoSiraBelgeleri(db, siraTuru, giden.map((g) => g.belgeNo))).map((e) => [e.siraId, e.belgeId]));
    const m = new Map<string, number>();
    for (const g of giden) {
      const id = belgesi === null ? g.belgeNo : belgesi.get(g.belgeNo);
      if (id !== undefined && !m.has(g.logoKayitNo)) m.set(g.logoKayitNo, id);
    }
    return m;
  });
  // Bağlanabilirlik bağlamanın kendi kuralıdır; burada yalnız gösterilir, bağlama komutu yeniden denetler.
  const bag = ilk;
  const belgeler = r.veri.map((b) => {
    const id = core.get(String(b.logoKayitNo));
    return {
      ...b, tutar: fiyatGorunur ? b.tutar : null, dovizTuru: fiyatGorunur ? b.dovizTuru : null, core: id === undefined ? null : { id },
      bagla: bag === null ? null : bulguBaglamasi(bag, b, id !== undefined && id !== bag.id),
    };
  });
  return {
    durum: 'tamam', fiyatGorunur, belgeler, baglanacak: bag === null ? null : baglanacakOzeti(bag, fiyatGorunur),
    ileti: belgeler.length === 0 ? `Logo'da son ${String(BELGE_ARAMA_GUN)} günde bu metinle belge yok.` : null,
  };
}

// 3080 a: Logo geçişinde tek kart canlı araması. Arama yalnız GET'tir ve transaction dışında beklenir; bulunanlar kişinin süreç belleğinde
// tutulur (tek sunucu). "Ekle" köprüye gitmez: kişinin son aramasında gördüğü kartı okunmuş kopyaya yazar, başka kart yazılamaz.
const ARAMA_BELLEGI_MS = 30 * 60_000;
const aramaBellegi = new Map<number, { kartlar: Map<number, LogoMalzemeKarti>; zaman: number }>();
// 3080 a, 3319: canlı arama "Logo bağlantısı" ve "Logo: malzeme araması" açıkken yapılır; katalog düğmesi de bu durumu okur.
export async function logoMalzemeAramasiAcik(db: Db): Promise<boolean> {
  return (await sistemAyariOku(db, 'logo.baglanti')) === true && (await sistemAyariOku(db, 'logo.malzeme-aramasi')) === true;
}
export const LOGO_ARAMA_KAPALI = 'Logo\'da malzeme araması Sistem Ayarları\'nda kapalı ("Logo bağlantısı" ve "Logo: malzeme araması").';
export async function logoMalzemeAra(
  vt: TxAcan, kopru: KopruIstemcisi | null, kisiId: number, metin: string, saat: () => number = Date.now,
): Promise<CariOkumasi<LogoMalzemeKarti[]>> {
  const q = metin.trim();
  if (q.length < LOGO_MALZEME_ARAMA_EN_AZ || q.length > LOGO_MALZEME_ARAMA_EN_COK) {
    throw gecersiz(`Arama metni ${LOGO_MALZEME_ARAMA_EN_AZ}-${LOGO_MALZEME_ARAMA_EN_COK} karakter olmalı.`);
  }
  const acik = await vt.tx(logoMalzemeAramasiAcik);
  if (!acik) return { tur: 'kapali', ileti: LOGO_ARAMA_KAPALI };
  if (kopru === null) return { tur: 'ortam-degiskeni-yok', ileti: BEKLEME_NEDENLERI['ortam-degiskeni-yok'] };
  const r = await kopru.malzemeAra(q);
  if (r.tur !== 'basarili') return { tur: 'hata', ileti: r.ileti };
  const kartlar = r.veri.slice(0, LOGO_MALZEME_ARAMA_SONUCU);
  aramaBellegi.set(kisiId, { kartlar: new Map(kartlar.map((k) => [k.logoKayitNo, k])), zaman: saat() });
  return { tur: 'tamam', veri: kartlar };
}
export async function logoAramaSonucunuEkle(db: Db, kisiId: number, refler: readonly number[], zaman: Date): Promise<number> {
  const b = aramaBellegi.get(kisiId);
  if (!b || zaman.getTime() - b.zaman > ARAMA_BELLEGI_MS) return 0;
  const kartlar = [...new Set(refler)].map((r) => b.kartlar.get(r)).filter((k): k is LogoMalzemeKarti => k !== undefined);
  await s.malzemeKartlariniYaz(db, kartlar, zaman);
  return kartlar.length;
}

// Fatura: Logo'ya giden siparişlerin numarası logo_giden'den (kayıt) ve logo_siparis_no'dan gelir; okuması en eski sipariş önce, sıralı, turda
// en çok FATURA_TUR_SINIRI sipariş. Reddeden sipariş sırayı tıkamaz; ağ, yetki ve belirsiz hatada tur durur. Her siparişin okuması transaction
// dışında beklenir, sonucu kendi kısa transaction'ında yazılır: yarıda kalan turda yazılanlar kalır, yeniden okuma aynı satırları günceller.
export async function faturaTuru(vt: TxAcan, o: TurOrtami): Promise<TurSonucu> {
  const hazir = await vt.tx(async (db): Promise<TurSonucu | { kopru: KopruIstemcisi; siparisler: { siparisNo: string }[] }> => {
    const kopru = await okumaKapisi(db, o, 'logo.fatura-okumasi', 'fatura-kapali');
    if ('tur' in kopru) return kopru;
    if (!okumaSirasiGeldi(o, 'fatura')) return { tur: 'bos' };
    const siparisler = await s.faturaSiparisleri(db, new Date(o.saat().getTime() - FATURA_YENIDEN_OKUMA_MS), FATURA_TUR_SINIRI);
    if (siparisler.length === 0) return { tur: 'bos' };
    return { kopru, siparisler };
  });
  if ('tur' in hazir) return hazir;
  const { kopru, siparisler } = hazir;
  let okunan = 0;
  for (const { siparisNo } of siparisler) {
    const r = await kopru.faturaOku(siparisNo);
    if (r.tur === 'basarili') {
      await vt.tx((db) => s.faturaYaz(db, siparisNo, r.veri, o.saat()));
      okunan += r.veri.length;
    } else if (r.tur === 'reddedildi') {
      await vt.tx((db) => s.faturaDenemesiYaz(db, siparisNo, o.saat()));
    } else {
      o.bellek.okumaDenemeleri.set('fatura', o.saat());
      return { tur: 'okuma', akis: 'fatura', sonuc: r.tur, sayi: okunan, ileti: r.ileti };
    }
  }
  o.bellek.okumaDenemeleri.delete('fatura');
  return { tur: 'okuma', akis: 'fatura', sonuc: 'okundu', sayi: okunan };
}

/* ---------------- Malzeme fişi (kaynağı stok; 293 a, 294 c, 298 a) ---------------- */

// 233: fiş Logo'yla eşitlenir. Kaynak her fiş için bugünkü satırları verir; satırı yoksa `fis` null (numara yine verilir: Logo'daki fiş silinecek).
export interface EsitlenecekFis {
  tur: FisTuru;
  id: number;
  no: string;
  // 2948: kural değişmeden önceki numara (yalnız emir fişi); Logo'da o numarayla durabilecek fiş için korunur.
  eskiNo?: string | null;
  fis: GonderilecekMalzemeFisi | null;
}

// Tur kuyruğu ve sonucu bu arayüzden okur; test sahte kaynakla verir. Gerçek kaynak `stokMalzemeFisiKaynagi`dır.
export interface MalzemeFisiKaynagi {
  gidecekler(db: Db, sinir: number): Promise<EsitlenecekFis[]>;
  sonuc(db: Db, tur: FisTuru, id: number, sonuc: { kayitNo: string } | { hata: string }): Promise<void>;
}

export interface MalzemeFisiTurOrtami extends TurOrtami {
  kaynak: MalzemeFisiKaynagi;
}

// Stoğun disari.ts işlevleri (bağ isler.ts'te). Fişin sahibi stoktur; Logo değişiklik akışını izler ve satırları gönderim anında okur.
export interface StokFisDegisikligi { id: number; tur: MalzemeFisiTuru; uretimEmriId: number | null; degisiklik: number; degisiklikZamani: string; gonderimIstegi: string | null }
export interface StokFisKaynaklari {
  degisiklikler(db: Db, a: { zaman: string | null; id: number; sinir: number }): Promise<StokFisDegisikligi[]>;
  fisler(db: Db, idler: readonly number[]): Promise<Map<number, StokFisi & { uretimEmriId: number | null }>>;
  emirFisleri(db: Db, emirIdler: readonly number[]): Promise<{ id: number; tur: MalzemeFisiTuru; uretimEmriId: number }[]>;
  // Emir başına proje (üretim emirlerinin disari.ts'i); projesiz emir haritada yoktur.
  emirProjeleri(db: Db, emirIdler: readonly number[]): Promise<Map<number, number>>;
}

// Akış `degisiklik_zamani` sırasıyladır; zaman işlemin başlangıcıdır, geç biten işlem daha önceki zamanla görünebilir. Her tur bu kadar
// geriden yeniden okunur; aynı değişiklik ikinci kez sayılmaz (sayaç karşılaştırması). VARSAYIM: iki dakikadan uzun süren stok işlemi yok.
const FIS_AKISI_ORTUSME_MS = 2 * 60_000;
const FIS_AKISI_SAYFASI = 500;

const fisSekilleri = async (db: Db): Promise<Record<MalzemeFisiTuru, FisGonderimSekli>> => {
  const sekil = {} as Record<MalzemeFisiTuru, FisGonderimSekli>;
  for (const [tur, anahtar] of Object.entries(FIS_GONDERIM_AYARI) as [MalzemeFisiTuru, (typeof FIS_GONDERIM_AYARI)[MalzemeFisiTuru]][]) {
    sekil[tur] = gonderimSekli(await sistemAyariOku(db, anahtar));
  }
  return sekil;
};
const fisKanaliAcik = async (db: Db): Promise<boolean> =>
  (await sistemAyariOku(db, 'logo.baglanti')) && (await sistemAyariOku(db, 'logo.malzeme-fisi-gonderimi'));

// Stoğun değişen fişleri giden kutusuna işlenir: sayaç artışı bekleyen değişikliğe, yeni elle istek isteğe. Fire gönderimi kapalıyken
// fire satırları sarf fişindedir: fire fişi değişince emrin sarf fişi de eşitlenir.
export async function fisDegisiklikleriniAl(db: Db, k: StokFisKaynaklari): Promise<number> {
  const imlec = await s.fisImleci(db);
  if (imlec === null) throw new Error('logo_malzeme_fisi_imleci satırı yok (göç 20261024173400).');
  const fireKapali = (await fisSekilleri(db)).fire === 'kapali';
  let konum = { zaman: new Date(Date.parse(imlec.zaman) - FIS_AKISI_ORTUSME_MS).toISOString(), id: 0 };
  let enBuyuk = imlec.enBuyukFisId;
  let son: { zaman: string; id: number } | null = null;
  let sayi = 0;
  for (;;) {
    const sayfa = await k.degisiklikler(db, { ...konum, sinir: FIS_AKISI_SAYFASI });
    const fireEmirleri = new Set<number>();
    for (const d of sayfa) {
      const tur = STOK_FISI_LOGO_TURU[d.tur];
      await s.fisDegisikligiYaz(db, tur, d.id, d.degisiklik);
      if (d.gonderimIstegi !== null) await s.fisIstegiYaz(db, tur, d.id, d.gonderimIstegi);
      if (fireKapali && d.tur === 'fire' && d.uretimEmriId !== null) fireEmirleri.add(d.uretimEmriId);
      enBuyuk = Math.max(enBuyuk, d.id);
    }
    // Örtüşme penceresinde yeniden okunan fire fişi sarfı boşuna işaretleyebilir; sonuç aynı satırlarla eşitlenir, istek gitmez.
    for (const f of await k.emirFisleri(db, [...fireEmirleri])) if (f.tur === 'sarf') await s.fisIsaretle(db, 'sarf-fisi', f.id);
    sayi += sayfa.length;
    const sonuncu = sayfa.at(-1);
    if (sonuncu) son = { zaman: sonuncu.degisiklikZamani, id: sonuncu.id };
    if (sayfa.length < FIS_AKISI_SAYFASI || !sonuncu) break;
    konum = { zaman: sonuncu.degisiklikZamani, id: sonuncu.id };
  }
  if (son !== null) await s.fisImleciYaz(db, { zaman: son.zaman, fisId: son.id, enBuyukFisId: enBuyuk });
  else if (enBuyuk > imlec.enBuyukFisId) await s.fisImleciYaz(db, { ...imlec, enBuyukFisId: enBuyuk });
  return sayi;
}

export function stokMalzemeFisiKaynagi(k: StokFisKaynaklari): MalzemeFisiKaynagi {
  return {
    async gidecekler(db, sinir) {
      await fisDegisiklikleriniAl(db, k);
      const sekil = await fisSekilleri(db);
      const turler = (s2: FisGonderimSekli): FisTuru[] =>
        (Object.keys(sekil) as MalzemeFisiTuru[]).filter((t) => sekil[t] === s2).map((t) => STOK_FISI_LOGO_TURU[t]);
      const kuyruk = await s.malzemeFisiKuyrugu(db, { otomatik: turler('otomatik'), elle: turler('elle'), sinir });
      if (kuyruk.length === 0) return [];
      const fisler = await k.fisler(db, kuyruk.map((x) => x.id));
      // Fire kapalıyken sarf fişi emrin fire satırlarını da taşır.
      const fireler = new Map<number, StokFisSatiri[]>();
      if (sekil.fire === 'kapali') {
        const sarfEmirleri = [...fisler.values()].flatMap((f) => (f.tur === 'sarf' && f.uretimEmriId !== null ? [f.uretimEmriId] : []));
        const fireFisleri = (await k.emirFisleri(db, sarfEmirleri)).filter((f) => f.tur === 'fire');
        const fireSatirlari = await k.fisler(db, fireFisleri.map((f) => f.id));
        for (const f of fireFisleri) fireler.set(f.uretimEmriId, [...(fireSatirlari.get(f.id)?.satirlar ?? [])]);
      }
      // 3315: emir fişinin projesi emrin projesidir; proje Logo'da değilse fiş bekler (kart bekliyor kalıbı, deneme sayılmaz).
      const emirProjeleri = await k.emirProjeleri(db, [...fisler.values()].flatMap((f) => (f.uretimEmriId === null ? [] : [f.uretimEmriId])));
      const sonuc: EsitlenecekFis[] = [];
      for (const x of kuyruk) {
        const f = fisler.get(x.id);
        // Stokta olmayan fiş (silinmez; VARSAYIM) kuyrukta kalır, gönderilmez.
        if (!f) continue;
        const ek = f.tur === 'sarf' && f.uretimEmriId !== null ? (fireler.get(f.uretimEmriId) ?? []) : [];
        const fis = stokFisindenLogoFisi(f, ek);
        const pj = fis === null ? { kod: null } : await belgeProjesi(db, f.uretimEmriId === null ? null : (emirProjeleri.get(f.uretimEmriId) ?? null));
        if ('bekliyor' in pj) {
          kartBekleyenBelgeler.set(kartKaydiAnahtari(x.tur, x.id), { belge: x.tur, no: x.id, ileti: projeBekliyorNedeni(pj.bekliyor), goruldu: new Date(), durum: 'proje-bekliyor' });
          continue;
        }
        kartBekleyenBelgeler.delete(kartKaydiAnahtari(x.tur, x.id));
        sonuc.push({ tur: x.tur, id: x.id, no: f.no, eskiNo: eskiEmirFisiNo(f), fis: fis === null ? null : { ...fis, projeKodu: pj.kod } });
      }
      return sonuc;
    },
    async sonuc() {},
  };
}

// Stok, fişlerinin Logo durumunu bu çözücüyle okur (bağ sunucu/kablolama.ts).
export async function malzemeFisiLogoDurumlari(
  db: Db, sorular: readonly (FisDurumSorusu & { uretimEmriId: number | null; gonderimIstegi: string | null })[],
): Promise<Map<number, LogoFisBilgisi>> {
  const sekil = await fisSekilleri(db);
  const kanalAcik = await fisKanaliAcik(db);
  const enBuyukFisId = (await s.fisImleci(db))?.enBuyukFisId ?? 0;
  const giden = await s.fisGidenDurumlari(db, sorular.map((q) => ({ tur: STOK_FISI_LOGO_TURU[q.tur], id: q.id })));
  return new Map(sorular.map((q) => [q.id, logoFisDurumu(q, giden.get(`${STOK_FISI_LOGO_TURU[q.tur]}:${q.id}`) ?? null, {
    sekil: sekil[q.tur], fireSekli: sekil.fire, kanalAcik, enBuyukFisId,
  })]));
}

// Açmada fişi numarayla arama yok: kalkan yalnız niyet ve belirsiz beklemedir (hizmet kartıyla aynı). Sonucu bilinmeyen istekten sonra
// kendiliğinden yeniden gönderilmez; Logo'da kontrol istenir. Turda en çok bir yazma isteği.
// 233 eşitleme: Logo'daki fişin satırları değiştiyse ya da boşaldıysa fiş önce silinir (Logo'da satır silinmez), sonraki turda aynı numarayla
// yeniden açılır; değişmediyse istek gitmez.
export function malzemeFisiTuru(vt: TxAcan, o: MalzemeFisiTurOrtami): Promise<TurSonucu> {
  return turuKos(vt, (db) => malzemeFisiHazirla(db, o));
}

async function malzemeFisiHazirla(db: Db, o: MalzemeFisiTurOrtami): Promise<TurSonucu | KopruAdimi> {
  const kopru = await okumaKapisi(db, o, 'logo.malzeme-fisi-gonderimi', 'malzeme-fisi-kapali');
  if ('tur' in kopru) return kopru;
  for (const kaynaktan of await o.kaynak.gidecekler(db, KUYRUK_SINIRI)) {
    const g = await s.gidenSatiri(db, kaynaktan.tur, kaynaktan.id);
    // Numara bir kez seçilir ve yazılır; fiş sonra hep o numarayla açılır ve silinir (2948).
    const kayitli = await s.fisNumarasi(db, kaynaktan.tur, kaynaktan.id);
    const numara = logoFisNumarasi(kaynaktan.no, kaynaktan.eskiNo ?? null, g === null ? null : { ...g, numara: kayitli });
    // Sığmayan numara yazılmaz (gövde kuralı reddeder, sütun kısıtı da almaz).
    if (kayitli === null && numara !== '' && numara.length <= FIS_NO_EN_COK) await s.fisNumarasiYaz(db, kaynaktan.tur, kaynaktan.id, numara);
    const f: EsitlenecekFis = { ...kaynaktan, no: numara, fis: kaynaktan.fis === null ? null : { ...kaynaktan.fis, no: numara } };
    const durum = await s.esitlemeDurumu(db, f.tur, f.id);
    const okunan = durum?.bekleyen ?? 0;
    const hedef = f.fis === null ? null : malzemeFisiOzeti(f.fis);
    const logoda = g?.logoKayitNo ?? null;
    if (logoda !== null && hedef !== null && hedef === durum?.sonSatirOzeti) {
      await s.esitlendi(db, f.tur, f.id, okunan, hedef);
      continue;
    }
    if (logoda !== null) {
      if (!denemeZamaniMi(g, o.saat())) continue;
      return fisSilmeAdimi(o, kopru, f, g);
    }
    if (f.fis === null) {
      // Niyeti yazılmış fiş Logo'da açılmış olabilir: kuyrukta kalır, kendiliğinden silinmez ya da düşmez.
      if (g?.niyetZamani == null) await s.esitlendi(db, f.tur, f.id, okunan, null);
      continue;
    }
    const fis = f.fis;
    const { anahtar, taze, eylem } = await kalkanEylemi(o, f.tur, f.id, g);
    if (eylem === 'bekle') continue;
    const bildir: Bildir<{ hata: string }> = (yazDb, x) => o.kaynak.sonuc(yazDb, f.tur, f.id, x);
    const basarisiz = (sonuc: GidenSonucu, hata: string, niyet: Date | null | undefined, bekleme?: number): Yazici<TurSonucu> =>
      async (yazDb) => {
        const yazilan = await basarisizAcma(yazDb, o, f.tur, f.id, g, bildir, sonuc, hata, niyet, bekleme);
        await s.fisIstegiKapat(yazDb, f.tur, f.id);
        return { tur: 'malzeme-fisi', no: f.id, sonuc: yazilan };
      };
    const r = malzemeFisiGovdesi(await logoKoduyla(db, fis));
    if ('hata' in r) return basarisiz('reddedildi', r.hata, undefined)(db);
    if (eylem === 'gonder' && !taze) return basarisiz('reddedildi', SONUCU_BILINMIYOR, undefined)(db);
    if (eylem === 'niyet-yaz') {
      const niyet = o.saat();
      await s.niyetYaz(db, f.tur, f.id, niyet);
      o.bellek.niyetler.set(anahtar, niyet.getTime());
      return { tur: 'malzeme-fisi-niyet', no: f.id };
    }
    o.bellek.niyetler.delete(anahtar);
    return async (): Promise<Yazici<TurSonucu>> => {
      o.bellek.acmaIstekleri.set(anahtar, o.saat());
      const ekle = await kopru.malzemeFisiEkle(f.tur, r.govde);
      if (ekle.tur === 'basarili') {
        if (ekle.logicalRef === null) return basarisiz('belirsiz', 'Köprü başarı dedi ama fiş kayıt numarası vermedi; Logo\'da kontrol edin.', o.saat(), BELIRSIZ_BEKLEME_MS);
        const kayitNo = String(ekle.logicalRef);
        return async (yazDb) => {
          const b = await kayitNoktasi(yazDb, () => o.kaynak.sonuc(yazDb, f.tur, f.id, { kayitNo }));
          const simdi = o.saat();
          // Fiş Logo'da açıldı ama TMI kaydı almadı: niyet korunur, fiş kendiliğinden ikinci kez gitmez.
          if (!b.tamam) {
            await s.denemeYaz(yazDb, f.tur, f.id, {
              zaman: simdi, sonuc: 'yazilamadi', hata: kirp(`Logo fiş kaydı ${kayitNo}. ${yazilamadiMetni(b)}`), logoKayitNo: null, niyetZamani: undefined,
              sonrakiDeneme: new Date(simdi.getTime() + geriCekilmeMs((g?.ardisikHata ?? 0) + 1)), basarili: false,
            });
            await s.fisIstegiKapat(yazDb, f.tur, f.id);
            return { tur: 'malzeme-fisi', no: f.id, sonuc: 'yazilamadi' };
          }
          await s.denemeYaz(yazDb, f.tur, f.id, { zaman: simdi, sonuc: 'gonderildi', hata: null, logoKayitNo: kayitNo, niyetZamani: null, sonrakiDeneme: null, basarili: true });
          await s.esitlendi(yazDb, f.tur, f.id, okunan, hedef);
          // Sonuç kesin: aynı fişin sonraki eşitlemesi belirsiz bekleme süresini beklemez.
          o.bellek.acmaIstekleri.delete(anahtar);
          return { tur: 'malzeme-fisi', no: f.id, sonuc: 'gonderildi' };
        };
      }
      if (ekle.tur === 'belirsiz') return basarisiz('belirsiz', ekle.ileti, o.saat(), BELIRSIZ_BEKLEME_MS);
      o.bellek.acmaIstekleri.delete(anahtar);
      return basarisiz(ekle.tur, ekle.ileti, null);
    };
  }
  return { tur: 'bos' };
}

// Silme tekrarlanabilir: fiş yoksa (404) silinmiş sayılır. Sonucu bilinmeyen silme geri çekilmeyle yeniden denenir.
function fisSilmeAdimi(o: MalzemeFisiTurOrtami, kopru: KopruIstemcisi, f: EsitlenecekFis, g: GidenSatiri | null): KopruAdimi {
  return async (): Promise<Yazici<TurSonucu>> => {
    const sil = await kopru.malzemeFisiSil(f.tur, f.no);
    const simdi = o.saat();
    if (sil.tur === 'basarili') {
      return async (yazDb) => {
        await s.silindiYaz(yazDb, f.tur, f.id, simdi);
        return { tur: 'malzeme-fisi', no: f.id, sonuc: 'silindi' };
      };
    }
    const hata = kirp(`Logo'daki fiş değişiklik için silinemedi: ${sil.ileti}`);
    return async (yazDb) => {
      const b = await kayitNoktasi(yazDb, () => o.kaynak.sonuc(yazDb, f.tur, f.id, { hata }));
      await s.pasifHatasiYaz(yazDb, f.tur, f.id, {
        zaman: simdi, sonuc: sil.tur, hata: b.tamam ? hata : kirp(`${hata} ${yazilamadiMetni(b)}`),
        sonrakiDeneme: new Date(simdi.getTime() + geriCekilmeMs((g?.ardisikHata ?? 0) + 1)),
      });
      await s.fisIstegiKapat(yazDb, f.tur, f.id);
      return { tur: 'malzeme-fisi', no: f.id, sonuc: sil.tur };
    };
  };
}

/* ---------------- Birim seti listesi uçları (LB6 c, LB11 a) ---------------- */

export function baglantiDurumu(acik: boolean, kopru: KopruIstemcisi | null): LogoBaglantiDurumu {
  if (!acik) return 'kapali';
  return kopru === null ? 'ortam-degiskeni-yok' : 'acik';
}

// Malzemelerin karşılık yazımı ve gönderim listesi bunu kablolamayla okur (LOG-1 a): liste okunduysa yalnız listedekiler, okunmadıysa elle eklenenler.
export async function gecerliBirimSetiKodlari(db: Db): Promise<ReadonlySet<string>> {
  return gecerliBirimSetleri(await s.birimSetleri(db), (await s.birimSetiOkumasi(db)) !== null);
}

export async function birimSetleriniGetir(db: Db, kopru: KopruIstemcisi | null): Promise<BirimSetleriCevabi> {
  const okuma = await s.birimSetiOkumasi(db);
  const setler = await s.birimSetleri(db);
  const gecerli = gecerliBirimSetleri(setler, okuma !== null);
  return {
    setler: setler.map((k) => ({ ...k, gecerli: gecerli.has(k.kod) })),
    sonOkuma: okuma?.sonOkuma ?? null,
    baglanti: baglantiDurumu(await sistemAyariOku(db, 'logo.baglanti'), kopru),
  };
}

// Harfi farklı ikinci kod reddedilir: "ADET" ve "adet" iki ayrı set görünür, karşılık seçerken karışır (LOG-4).
// Tekil dizin yok (dolu tablo); eşzamanlı iki farklı harfli ekleme ikisini de yazabilir, tek yönetici işi olduğu için kabul.
export async function birimSetiEkle(db: Db, kisiId: number, kod: string, ad: string | null): Promise<{ kod: string }> {
  const farkli = await s.birimSetiHarfFarkliKod(db, kod);
  if (farkli) throw gecersiz(`Birim seti ${farkli.kod} zaten var; kod yalnız büyük/küçük harfle ayrılamaz.`);
  await s.birimSetiElleYaz(db, kod, ad, kisiId);
  return { kod };
}

// Bir karşılıkta kullanılan birim seti kaldırılamaz (LB11 a); köprü listesinden gelen satırın yalnız elle işareti kalkar.
export async function birimSetiKaldir(db: Db, kod: string): Promise<{ kod: string }> {
  const satir = await s.birimSetiKilitle(db, kod);
  if (!satir) throw bulunamadi('Birim seti bulunamadı.');
  if (!satir.elle) throw gecersiz('Bu birim seti köprü listesinden geliyor; elle eklenmediği için kaldırılamaz.');
  if (await logoBirimSetiKullaniliyorMu(db, kod)) {
    throw gecersiz(`Birim seti ${kod} bir birim karşılığında kullanılıyor; önce karşılığı değiştirin.`);
  }
  await s.birimSetiElleKaldir(db, kod);
  return { kod };
}

/* ---------------- Bağlantı hazırlığı ve canlı kontrol ---------------- */

export type LogoAyarAnahtari = keyof typeof LOGO_AYARLARI;
const ACIK_KAPALI_AYARLARI = (Object.keys(LOGO_AYARLARI) as LogoAyarAnahtari[]).filter((a) => LOGO_AYARLARI[a].tur === 'boolean');

// Sayfalı okumada sayı son tam turun (ya da süren turun) okunan kaydıdır.
async function sayfaliOzet(db: Db, akis: s.SayfaliAkis): Promise<{ sayi: number | null; son: string | null }> {
  const i = await s.okumaImleci(db, akis);
  return { sayi: i?.sayi ?? null, son: i?.sonTamamMetni ?? null };
}

export async function hazirlik(db: Db, kopru: KopruIstemcisi | null, ortam: LogoHazirlikCevabi['ortam']): Promise<LogoHazirlikCevabi> {
  const ayarlar: Record<string, boolean> = {};
  for (const a of ACIK_KAPALI_AYARLARI) ayarlar[a] = (await sistemAyariOku(db, a)) === true;
  const ozetler = await s.gidenOzetleri(db);
  const okuma = await s.birimSetiOkumasi(db);
  const okumalar = await s.okumaOzeti(db);
  const okunan = {
    'mal-kabul': { sayi: okumalar.malKabul, son: okumalar.malKabulSon },
    'cari-ambar': { sayi: okumalar.cariAmbar, son: okumalar.cariAmbarSon },
    fatura: { sayi: okumalar.fatura, son: okumalar.faturaSon },
    'malzeme-karti': await sayfaliOzet(db, 'malzeme-karti'),
    stok: await sayfaliOzet(db, 'stok'),
    kullanim: await sayfaliOzet(db, 'kullanim'),
    'son-alis': await s.sonAlisOzeti(db),
    'malzeme-arama': { sayi: null, son: null },
    cari: { sayi: null, son: null },
  } as const;
  return {
    baglanti: baglantiDurumu(ayarlar['logo.baglanti'] === true, kopru),
    ortam,
    ayarlar: ACIK_KAPALI_AYARLARI.map((a) => ({ anahtar: a, baslik: LOGO_AYARLARI[a].baslik, acik: ayarlar[a] === true })),
    akislar: LOGO_AKISLARI.map((t) => {
      const ilgili = ozetler.filter((o) => t.belgeTurleri.includes(o.belgeTuru));
      const sonDeneme = ilgili.map((o) => o.sonDeneme).filter((z) => z !== null).sort().at(-1) ?? null;
      // Okuma akışında "gönderilen" okunan satır sayısıdır, "hatalı" yoktur (okuma hatası kayıt bırakmaz).
      const ok = t.okuma ? okunan[t.okuma] : null;
      return {
        anahtar: t.anahtar, yon: t.yon, baslik: t.baslik, aciklama: t.aciklama,
        durum: logoAkisDurumu(t, { ortamVar: kopru !== null, ayarlar }),
        gonderilen: ok ? ok.sayi : t.belgeTurleri.length === 0 ? null : ilgili.reduce((n, o) => n + o.gonderilen, 0),
        hatali: ok || t.belgeTurleri.length === 0 ? null : ilgili.reduce((n, o) => n + o.hatali, 0),
        sonDeneme: ok ? ok.son : t.anahtar === 'birim-setleri' ? okuma?.sonOkuma ?? null : sonDeneme,
      };
    }),
    sonBirimSetiOkuma: okuma?.sonOkuma ?? null,
    yardimci: yardimciSurumu(),
  };
}

// Kontrol "Logo bağlantısı" anahtarına bakmaz: anahtarı açmadan önce köprünün hazır olduğu görülsün diye. Yalnız okur.
export async function kontrol(kopru: KopruIstemcisi | null, saat: () => Date = () => new Date()): Promise<LogoKontrolCevabi> {
  const zaman = saat().toISOString();
  if (kopru === null) {
    return {
      zaman, ulasildi: false,
      adimlar: LOGO_KONTROL_ADIMLARI.map((a) => ({ ...a, sonuc: 'atlandi' as const, sureMs: null, ileti: 'TMIV2_LOGO_KOPRU_ADRESI ve TMIV2_LOGO_KOPRU_ANAHTARI tanımlı değil; istek atılmadı.' })),
    };
  }
  const adimlar: LogoKontrolCevabi['adimlar'] = [];
  let devam = true;
  for (const a of LOGO_KONTROL_ADIMLARI) {
    if (!devam) {
      adimlar.push({ ...a, sonuc: 'atlandi', sureMs: null, ileti: 'Önceki adım başarısız; istek atılmadı.' });
      continue;
    }
    const bas = Date.now();
    const r = kontrolAdiminiYorumla(await kopru.kontrolOku(a.yol));
    adimlar.push({ ...a, sonuc: r.sonuc, sureMs: Date.now() - bas, ileti: r.ileti });
    devam = r.devam;
  }
  // 3314: canlı kontrol sürümü de sorar; sonuç hazırlık ve bağlantı izleme ekranında görünür.
  if (adimlar.some((a) => a.sonuc === 'tamam')) await yardimciSurumunuSor(kopru, saat);
  return { zaman, ulasildi: adimlar.some((a) => a.sonuc === 'tamam'), adimlar };
}

// 3344: liste ve ayrıntıdaki Logo rozeti. Logo'ya istek atılmaz; giden kutusu, süreç belleğindeki bekleme ve (malzemede) kartın kayıt
// numarası okunur. Eskimiş bekleme sayılmaz (izlemeyle aynı süre).
// 3374: satış teklifi ve siparişinin giden satırı Siparişler'in Logo sırası kimliğiyle tutulur (belge kimliğiyle değil); teklifte
// her verilen sürüm ayrı sıradır (Logo'da ayrı teklif). Rozet izi olan en yeni sıranındır: yeni sürüm sıradayken eski sürümün Logo kaydı
// belgeyi "Logo'da" göstermez.
const SATIS_SIRA_TURU: Partial<Record<LogoRozetTuru, 'teklif' | 'siparis'>> = { teklif: 'teklif', 'satis-siparisi': 'siparis' };
export async function belgeRozetleri(db: Db, tur: LogoRozetTuru, idler: readonly number[], simdi: Date): Promise<LogoRozetCevabi> {
  const tekil = [...new Set(idler)];
  const belgeler = ROZET_BELGELERI[tur] as readonly BelgeTuru[];
  const siraTuru = SATIS_SIRA_TURU[tur];
  // Belge kimliği -> giden kutusundaki kimlikler (en yeni önce). Satış dışında ikisi aynıdır.
  const kayitlar = new Map<number, number[]>(tekil.map((id) => [id, siraTuru === undefined ? [id] : []]));
  if (siraTuru !== undefined) {
    for (const e of await logoSiralari(db, siraTuru, tekil)) kayitlar.get(e.belgeId)?.unshift(e.siraId);
  }
  const nolar = [...new Set([...kayitlar.values()].flat())];
  const giden = new Map<number, GidenSatiri>();
  for (const b of belgeler) for (const g of await s.gidenSatirlari(db, b, nolar)) if (!giden.has(g.belgeNo) || g.logoKayitNo !== null) giden.set(g.belgeNo, g);
  const bagli = tur === 'malzeme' ? await logoKayitNolari(db, tekil) : new Map<number, string>();
  const elle = new Set<number>();
  for (const b of belgeler) for (const e of await s.elleBagliNolar(db, b, nolar)) elle.add(e.belgeNo);
  const durumlar: LogoRozetCevabi['durumlar'] = [];
  const teklifBekleyenler: number[] = [];
  for (const id of tekil) {
    const sira = kayitlar.get(id) ?? [];
    const no = sira.find((n) => giden.has(n) || belgeler.some((b) => kartBekleyenBelgeler.has(kartKaydiAnahtari(b, n))));
    const g = no === undefined ? null : giden.get(no) ?? null;
    const v = no === undefined ? null : belgeler.map((b) => kartBekleyenBelgeler.get(kartKaydiAnahtari(b, no))).find((x) => x !== undefined) ?? null;
    const bekleyen = v !== null && bekleyenTaze(v.goruldu, simdi) ? v : null;
    const d = belgeRozetDurumu(g, bekleyen, bagli.get(id) ?? null);
    if (d !== null) durumlar.push({ id, ...d, elle: d.durum === 'logoda' && no !== undefined && elle.has(no) });
    else if (tur === 'satis-siparisi' && sira.length > 0) teklifBekleyenler.push(id);
  }
  // Sipariş sırası var ama giden kutusunda satırı yok: teklif Logo'ya gitmediği için sipariş için deneme yapılmamıştır.
  if (teklifBekleyenler.length > 0) {
    const baglar = await logoSiparisTeklifSiralari(db, teklifBekleyenler);
    const teklifBelgeleri = ROZET_BELGELERI.teklif as readonly BelgeTuru[];
    const teklifNolari = baglar.map((b) => b.teklifSiraId);
    const teklifGiden = new Map<number, GidenSatiri>();
    for (const b of teklifBelgeleri) for (const g of await s.gidenSatirlari(db, b, teklifNolari)) if (!teklifGiden.has(g.belgeNo) || g.logoKayitNo !== null) teklifGiden.set(g.belgeNo, g);
    for (const b of baglar) {
      const g = teklifGiden.get(b.teklifSiraId) ?? null;
      const v = teklifBelgeleri.map((t) => kartBekleyenBelgeler.get(kartKaydiAnahtari(t, b.teklifSiraId))).find((x) => x !== undefined) ?? null;
      const teklif = belgeRozetDurumu(g, v !== null && bekleyenTaze(v.goruldu, simdi) ? v : null, null);
      const d = teklifBeklerkenSiparisRozeti({ no: b.teklifNo, surumNo: b.teklifSurumNo, sirahata: b.teklifHata }, teklif);
      if (d !== null) durumlar.push({ id: b.siparisId, ...d, elle: false });
    }
  }
  return { durumlar };
}
