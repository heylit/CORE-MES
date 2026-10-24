import type { Db, Veritabani } from '#cekirdek/db.ts';
import { kayitNoktasi } from '#cekirdek/db.ts';
import { bulunamadi, gecersiz, UygulamaHatasi } from '#cekirdek/hata.ts';
import { LOGO_AYARLARI } from '#paylasilan/ayarlar/logo.ts';
import type { BirimSetleriCevabi, LogoBaglantiDurumu, LogoHazirlikCevabi, LogoKontrolCevabi } from '#paylasilan/sozlesme/logo.ts';
import type { FisGonderimSekli, LogoFisBilgisi, MalzemeFisiTuru } from '#paylasilan/sozlesme/stok.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { firmaOzeti } from '../musteri-tedarikci/disari.ts';
import { logoBirimSetiKullaniliyorMu, logoyaGidecekMalzemeler, malzemeLogoSonucu } from '../malzemeler/disari.ts';
import type { LogoyaGidecekMalzeme, MalzemeLogoSonucu } from '../malzemeler/disari.ts';
import type { KopruIstemcisi, SatirliSonuc } from './kopru.ts';
import {
  BELIRSIZ_BEKLEME_MS, eklemeGovdesi, guncellemeEslemesi, HIZMET_ALANLARI, kapatmaGovdesi, karsilamaGovdesi, karsilamaKaydiBul, malzemeGuncellemeGovdesi, siparisGuncellemeGovdesi, talepGovdesi, satirEslemesi, siparisGovdesi, gecerliBirimSetleri, geriCekilmeMs, hizmetGovdesi, HIZMET_AYARI, kartEylemi, kirp, KUYRUK_SINIRI,
  FATURA_TUR_SINIRI, FATURA_YENIDEN_OKUMA_MS, FIS_GONDERIM_AYARI, gonderimSekli, LOGO_FIS_TURLERI, logoFisDurumu, STOK_FISI_LOGO_TURU, stokFisindenLogoFisi, kontrolAdiminiYorumla, listeOkunmaliMi, malzemeFisiGovdesi, malzemeFisiOzeti, OKUMA_HATA_BEKLEME_MS, LOGO_AKISLARI, LOGO_KONTROL_ADIMLARI, logoAkisDurumu, satisSiparisiGovdesi, satisTeklifiGovdesi,
} from './kurallar.ts';
import type { FisDurumSorusu, GonderilecekKarsilama, GonderilecekMalzemeFisi, StokFisi, StokFisSatiri, GonderilecekSatisSiparisi, GonderilecekSatisTeklifi, GonderilecekSiparis, GonderilecekTalep, GuncellenecekSiparisSatiri, HizmetYonu, KopruSonucu } from './kurallar.ts';
import * as s from './sorgular.ts';
import type { BelgeTuru, FisTuru, GidenSatiri, GidenSonucu } from './sorgular.ts';

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
}

export const yeniSurecBellegi = (): SurecBellegi => ({ niyetler: new Map(), acmaIstekleri: new Map(), sonListeDenemesi: null, okumaDenemeleri: new Map() });

// İş "bekliyor" dönerken sağlık ayrıntısında görünen nedenler: sabit metin, değer taşımaz.
export const BEKLEME_NEDENLERI = {
  kapali: 'Logo bağlantısı Sistem Ayarları\'nda kapalı; kartlar birikiyor, istek atılmıyor.',
  'satin-alma-kapali': 'Logo satın alma gönderimi Sistem Ayarları\'nda kapalı; talep ve siparişler birikiyor, istek atılmıyor.',
  'satis-kapali': 'Logo satış gönderimi Sistem Ayarları\'nda kapalı; teklif ve siparişler birikiyor, istek atılmıyor.',
  'mal-kabul-kapali': 'Logo mal kabul okuması Sistem Ayarları\'nda kapalı; istek atılmıyor.',
  'liste-kapali': 'Logo cari ve ambar listesi okuması Sistem Ayarları\'nda kapalı; istek atılmıyor.',
  'fatura-kapali': 'Logo fatura okuması Sistem Ayarları\'nda kapalı; istek atılmıyor.',
  'malzeme-fisi-kapali': 'Logo malzeme fişi gönderimi Sistem Ayarları\'nda kapalı; fişler birikiyor, istek atılmıyor.',
  'ortam-degiskeni-yok': 'Logo bağlantısı açık ama TMIV2_LOGO_KOPRU_ADRESI ve TMIV2_LOGO_KOPRU_ANAHTARI tanımlı değil; istek atılmıyor.',
} as const;

export interface TurOrtami {
  // null: köprü değişkenleri yok. Anahtar kapalıysa da hiçbir istek atılmaz, hiçbir şey yazılmaz.
  kopru: KopruIstemcisi | null;
  bellek: SurecBellegi;
  saat: () => Date;
  // Yalnız test verir; üretimde Sistem Ayarları'ndaki yön anahtarları geçerlidir (HIZMET_AYARI).
  hizmetAcik?: Readonly<Record<HizmetYonu, boolean>>;
  // Logo'ya gitmiş kartın ad güncellemesi (S4 b): kuyruğu ve sonucu malzemelerin işlevleridir; gelene kadar verilmez (UYUM-BORCU).
  malzemeGuncelleme?: MalzemeGuncellemeKaynagi;
}

export interface LogoyaGuncellemeGidecekMalzeme {
  no: number;
  stokKodu: string;
  ad: string | null;
  logoKayitNo: string;
  tur: string;
  hizmetYonu: HizmetYonu | null;
}
export interface MalzemeGuncellemeKaynagi {
  gidecekler(db: Db, sinir: number): Promise<LogoyaGuncellemeGidecekMalzeme[]>;
  // Gönderilen ad da gelir: kart bu arada yeniden değiştiyse sahibi kuyrukta tutar (malzemeler #783).
  sonuc(db: Db, no: number, sonuc: { ad: string | null } & ({ tamam: true } | { hata: string })): Promise<void>;
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
  | { tur: 'guncelleme' | 'kapatma' | 'iptal' | 'karsilama'; no: number; sonuc: GidenSonucu }
  | { tur: 'satis-kapali' }
  | { tur: 'mal-kabul-kapali' | 'liste-kapali' | 'fatura-kapali' | 'malzeme-fisi-kapali' }
  | { tur: 'okuma'; akis: 'mal-kabul' | 'cari' | 'ambar' | 'fatura'; sonuc: 'okundu' | Exclude<KopruSonucu, { tur: 'basarili' }>['tur']; sayi: number }
  | { tur: 'malzeme-fisi-niyet'; no: number }
  | { tur: 'malzeme-fisi'; no: number; sonuc: GidenSonucu }
  | { tur: `${NiyetliBelge}-niyet`; no: number }
  | { tur: NiyetliBelge; no: number; sonuc: GidenSonucu };

// "Var mı" okuması olmayan, yalnız niyetle açılan belgeler.
type NiyetliBelge = 'talep' | 'siparisler-teklifi' | 'siparisler-siparisi';

// Tur iki kısa transaction'dır, köprü cevabı ikisinin arasında, transaction dışında beklenir: Logo kaydı açtıktan sonra geri alınan
// transaction izi kaybettirmesin (UYUM-BORCU 2). İlk transaction okur, niyet ya da red yazar; köprü adımı istekleri atar ve sonucu
// yazacak işi döndürür. Arada kopan tur yinelenince niyet ve "var mı" aynı kaydı bulur, ikinci kayıt açılmaz.
export type TxAcan = Pick<Veritabani, 'tx'>;
type Yazici<T> = (db: Db) => Promise<T>;
type KopruAdimi<T = TurSonucu> = () => Promise<Yazici<T>>;

async function turuKos(vt: TxAcan, hazirla: (db: Db) => Promise<TurSonucu | KopruAdimi>): Promise<TurSonucu> {
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
  return kirp(`TMI kartına yazılamadı: ${r.hata instanceof UygulamaHatasi ? r.hata.mesaj : 'kural reddetti'}`);
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
  // Kapalı yöndeki hizmet kartı atlanır: istek yok, satır yok, kart bekler.
  const kuyruk = (await logoyaGidecekMalzemeler(db, KUYRUK_SINIRI, { hizmetDahil: true }))
    .filter((k) => uygunMu(k) && (k.tur !== 'hizmet' || (k.hizmetYonu !== null && hizmetAcik[k.hizmetYonu])));
  if (kuyruk.length === 0) return guncellemeTuru(db, o, kopru);
  // Kart numarası türler arasında tekildir (tek kart tablosu).
  const satirlar = new Map<number, GidenSatiri>();
  for (const belge of ['malzeme', 'hizmet'] as const) {
    const nolar = kuyruk.filter((k) => belgeTuru(k) === belge).map((k) => k.no);
    if (nolar.length > 0) for (const g of await s.gidenSatirlari(db, belge, nolar)) satirlar.set(g.belgeNo, g);
  }
  const simdi = o.saat();
  for (const kart of kuyruk) {
    const g = satirlar.get(kart.no) ?? null;
    const taze = g?.niyetZamani != null && o.bellek.niyetler.get(kart.no) === g.niyetZamani.getTime();
    const eylem = kartEylemi(g, simdi, taze, o.bellek.acmaIstekleri.get(kart.no) ?? null);
    if (eylem === 'bekle') continue;
    // Kuralı tutmayan kart (geçersiz karşılık dahil) niyet yazılmadan ve istek atılmadan "hata" olur.
    const gonderim = gonderimKur(kopru, kart, kart.tur === 'hizmet' ? hizmetKdv : kdv, gecerliBirimler);
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
    return turla(() => gonder(o, kart, g, gonderim), (sonuc) => ({ tur: 'gonderim', no: kart.no, sonuc }));
  }
  return guncellemeTuru(db, o, kopru);
}

const SONUCU_BILINMIYOR = 'Önceki açma isteğinin sonucu bilinmiyor ve bu belge için Logo\'da "var mı" okunamıyor; Logo\'da kontrol edin. Kendiliğinden yeniden gönderilmez.';

// Logo'ya gitmiş kartın ad güncellemesi: açma kuyruğu boşken tek kart. Güncelleme yinelenirse aynı adı yazar (zararsız), niyet gerekmez.
async function guncellemeTuru(db: Db, o: TurOrtami, kopru: KopruIstemcisi): Promise<TurSonucu | KopruAdimi> {
  if (!o.malzemeGuncelleme) return { tur: 'bos' };
  // Kapalıyken kuyruk okunmaz, istek atılmaz; kartlar "bekliyor" kalır, kart açma etkilenmez.
  if (!(await sistemAyariOku(db, 'logo.malzeme-guncelleme-gonderimi'))) return { tur: 'bos' };
  const kaynak = o.malzemeGuncelleme;
  for (const kart of await kaynak.gidecekler(db, KUYRUK_SINIRI)) {
    const g = await s.gidenSatiri(db, 'malzeme-guncelleme', kart.no);
    if (g?.sonrakiDeneme && g.sonrakiDeneme.getTime() > o.saat().getTime()) continue;
    const r = malzemeGuncellemeGovdesi(kart);
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
      bildir: (yazDb, x) => kaynak.sonuc(yazDb, kart.no, { ad: kart.ad, ...x }),
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
  a: { belge: BelgeTuru; id: number; calis: () => Promise<AdimSonucu<T>>; bildir: (db: Db, x: T | { hata: string }) => Promise<void> },
): KopruAdimi<GidenSonucu> {
  return async () => {
    const r = await a.calis();
    return async (db) => {
      const zaman = o.saat();
      const bekleme = new Date(zaman.getTime() + geriCekilmeMs((g?.ardisikHata ?? 0) + 1));
      const yazilamadi = (b: Awaited<ReturnType<typeof kayitNoktasi>>): string | null =>
        b.tamam ? null : kirp(`TMI kaydına yazılamadı: ${b.hata instanceof UygulamaHatasi ? b.hata.mesaj : 'kural reddetti'}`);
      if ('tamam' in r) {
        const hata = yazilamadi(await kayitNoktasi(db, () => a.bildir(db, r.deger)));
        await s.denemeYaz(db, a.belge, a.id, hata === null
          ? { zaman, sonuc: 'gonderildi', hata: null, logoKayitNo: r.kayitNo, niyetZamani: null, sonrakiDeneme: null, basarili: true }
          : { zaman, sonuc: 'yazilamadi', hata, logoKayitNo: null, niyetZamani: null, sonrakiDeneme: bekleme, basarili: false });
        return hata === null ? 'gonderildi' : 'yazilamadi';
      }
      const hata = kirp(r.hata);
      const ek = yazilamadi(await kayitNoktasi(db, () => a.bildir(db, { hata })));
      await s.denemeYaz(db, a.belge, a.id, {
        zaman, sonuc: r.sonuc, hata: ek ? kirp(`${hata} ${ek}`) : hata, logoKayitNo: null, niyetZamani: null, sonrakiDeneme: bekleme, basarili: false,
      });
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
async function gonder(o: TurOrtami, kart: LogoyaGidecekMalzeme, g: GidenSatiri | null, k: Gonderim): Promise<Yazici<GidenSonucu>> {
  const ardisik = g?.ardisikHata ?? 0;
  const basarisiz = (sonuc: GidenSonucu, hata: string, niyet: Date | null | undefined, bekleme?: number): Yazici<GidenSonucu> =>
    (db) => basarisizYaz(db, o, kart, g, sonuc, hata, niyet, bekleme);
  const basarili = (sonuc: 'gonderildi' | 'zaten-vardi', logicalRef: number): Yazici<GidenSonucu> => async (db) => {
    const simdi = o.saat();
    const kayitNo = String(logicalRef);
    // Karta tur sırasında değişmiş karşılık değil, bu turda gönderilen (kuyruktan okunan) değerler yazılır.
    const yazilamadi = await sonucuBildir(db, kart.no, { kayitNo, logoKartTuru: kart.logoKartTuru, logoBirimSeti: kart.logoBirimSeti });
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
    if (varMi.logicalRef !== null) return basarili('zaten-vardi', varMi.logicalRef);
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
export type Tamam = { tamam: true } | { hata: string };
export interface LogoyaGidecekKarsilama extends GonderilecekKarsilama { firmaId: number }

export interface SatinAlmaKaynagi {
  gidecekler(db: Db, sinir: number): Promise<LogoyaGidecekSiparis[]>;
  sonuc(db: Db, id: number, sonuc: SiparisLogoSonucu): Promise<void>;
  guncellemeGidecekler(db: Db, sinir: number): Promise<LogoyaGuncellemeGidecekSiparis[]>;
  guncellemeSonucu(db: Db, id: number, sonuc: { satirlar: SatirBaglari } | { hata: string }): Promise<void>;
  kapatmaGidecekler(db: Db, sinir: number): Promise<LogoyaKapatmaGidecekSiparis[]>;
  kapatmaSonucu(db: Db, id: number, sonuc: Tamam): Promise<void>;
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
  kirp(`TMI kaydına yazılamadı: ${r.hata instanceof UygulamaHatasi ? r.hata.mesaj : 'kural reddetti'}`);

// Bir tur, sırayla ilk işi olan adım: talep fişi açma, sipariş açma, düzenleme, kapatma, iptal, karşılama. Turda en çok bir yazma isteği.
// İstek ancak "Logo bağlantısı" ve "Logo: satın alma gönderimi" açık VE köprü değişkenleri varken çıkar.
export function satinAlmaTuru(vt: TxAcan, o: SatinAlmaTurOrtami): Promise<TurSonucu> {
  return turuKos(vt, async (db) => {
    if (!(await sistemAyariOku(db, 'logo.baglanti'))) return { tur: 'kapali' };
    if (!(await sistemAyariOku(db, 'logo.satin-alma-gonderimi'))) return { tur: 'satin-alma-kapali' };
    if (o.kopru === null) return { tur: 'ortam-degiskeni-yok' };
    const kopru = o.kopru;
    return (await talepTuru(db, o, kopru)) ?? (await siparisAcmaTuru(db, o, kopru)) ?? (await siparisGuncellemeTuru(db, o, kopru))
      ?? (await kapatmaTuru(db, o, kopru)) ?? (await iptalTuru(db, o, kopru)) ?? (await karsilamaTuru(db, o, kopru)) ?? { tur: 'bos' };
  });
}

// Süreç belleğinin anahtarı belge türüyle ayrılır: talep ve sipariş kimlikleri ayrı sayaçlardır.
// Satış işinin belleği ayrıdır; içinde teklif ve sipariş kimlikleri aynı yolla ayrılır.
// Malzeme fişleri stoğun tek sayacıdır (türden bağımsız tekil kimlik): çok büyük artı taraftadır (kimlikler bunun altındadır).
const FIS_ANAHTAR_KAYMASI = 1_000_000_000;
const bellekAnahtari = (belge: BelgeTuru, id: number): number =>
  (LOGO_FIS_TURLERI as readonly string[]).includes(belge) ? FIS_ANAHTAR_KAYMASI + id : belge === 'talep' || belge === 'siparisler-siparisi' ? -id : id;

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
    yazilamadi = kirp(`Logo satırları TMI satırlarıyla eşlenemedi (Logo ${refler?.length ?? 0}, TMI ${satirlar.length}).`);
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
  const kdv = await sistemAyariOku(db, 'logo.kdv-orani');
  const hizmetKdv = await sistemAyariOku(db, 'logo.hizmet-kdv-orani');
  for (const sip of kuyruk) {
    const g = satirlar.get(sip.id) ?? null;
    const { anahtar, eylem } = await kalkanEylemi(o, 'siparis', sip.id, g);
    if (eylem === 'bekle') continue;
    const bildir: Bildir<SiparisLogoSonucu> = (yazDb, x) => o.kaynak.sonuc(yazDb, sip.id, x);
    const cariKodu = (await firmaOzeti(db, sip.firmaId))?.logoCariKodu ?? null;
    const r = siparisGovdesi(sip, { cariKodu, kdv, hizmetKdv });
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
  },
): Promise<TurSonucu | KopruAdimi | null> {
  if (a.kuyruk.length === 0) return null;
  const satirlar = new Map<number, GidenSatiri>();
  for (const g of await s.gidenSatirlari(db, a.belge, a.kuyruk.map((k) => k.id))) satirlar.set(g.belgeNo, g);
  for (const t of a.kuyruk) {
    const g = satirlar.get(t.id) ?? null;
    const { anahtar, taze, eylem } = await kalkanEylemi(o, a.belge, t.id, g);
    if (eylem === 'bekle') continue;
    const bildir: Bildir<SiparisLogoSonucu> = (yazDb, x) => a.bildir(yazDb, t, x);
    const sonucla = (sonuc: GidenSonucu): TurSonucu => ({ tur: a.belge, no: t.id, sonuc });
    const basarisiz = (sonuc: GidenSonucu, hata: string, niyet: Date | null | undefined, bekleme?: number): Yazici<TurSonucu> =>
      async (yazDb) => sonucla(await basarisizAcma(yazDb, o, a.belge, t.id, g, bildir, sonuc, hata, niyet, bekleme));
    const r = await a.govde(t);
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
    govde: async (t) => talepGovdesi(t),
    ekle: (_t, govde) => kopru.talepEkle(govde),
    bildir: (yazDb, t, x) => o.kaynak.talepSonucu(yazDb, t.id, x),
  });
}

// Bekleme süresi dolmamış adım atlanır.
async function sirasiGelen<T extends { id: number }>(db: Db, o: TurOrtami, belge: BelgeTuru, kuyruk: readonly T[]): Promise<{ is: T; g: GidenSatiri | null } | null> {
  for (const is of kuyruk) {
    const g = await s.gidenSatiri(db, belge, is.id);
    if (!g?.sonrakiDeneme || g.sonrakiDeneme.getTime() <= o.saat().getTime()) return { is, g };
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
  const adim = tekAdim(o, g, {
    belge: 'siparis-guncelleme', id: sip.id,
    calis: async (): Promise<AdimSonucu<{ satirlar: SatirBaglari }>> => {
      const once = await kopru.siparisSatirlari(sip.no.trim());
      if (once.tur !== 'basarili') return { sonuc: once.tur, hata: `Satır okuması: ${once.ileti}` };
      const onceki = once.satirRefleri === null ? null : guncellemeEslemesi(sip.satirlar, once.satirRefleri, sip.kaldirilanSatirRefleri);
      // Yeni satırlar önceki denemede eklenmişse kayıtlarıyla gider; eklenmemişse kayıtsız (köprü ekler).
      const satirlar = onceki === null ? sip.satirlar : sip.satirlar.map((x, i) => ({ ...x, logoSatirRef: onceki[i]!.logoSatirRef }));
      const r = siparisGuncellemeGovdesi({ ...sip, satirlar }, { cariKodu, kdv, hizmetKdv });
      if ('hata' in r) return { sonuc: 'reddedildi', hata: r.hata };
      const c = await kopru.siparisGuncelle(r.govde);
      if (c.tur !== 'basarili') return { sonuc: c.tur, hata: `Düzenleme: ${c.ileti}` };
      const sonra = await kopru.siparisSatirlari(sip.no.trim());
      const esleme = sonra.tur === 'basarili' && sonra.satirRefleri !== null
        ? guncellemeEslemesi(satirlar, sonra.satirRefleri, sip.kaldirilanSatirRefleri) : null;
      if (esleme === null) return { sonuc: 'yazilamadi', hata: 'Düzenleme gitti ama Logo satırları TMI satırlarıyla eşlenemedi.' };
      return { tamam: true, kayitNo: sip.logoKayitNo, deger: { satirlar: esleme } };
    },
    bildir: (yazDb, x) => o.kaynak.guncellemeSonucu(yazDb, sip.id, x),
  });
  return turla(adim, (sonuc) => ({ tur: 'guncelleme', no: sip.id, sonuc }));
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
  const adim = tekAdim<{ karsilamaRef: string }>(o, g, {
    belge: 'karsilama', id: k.id,
    calis: async () => {
      const r = karsilamaGovdesi(k, cariKodu);
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
  const cariler = new Map<number, string | null>();
  const cariKodu = async (firmaId: number | null): Promise<string | null> => {
    if (firmaId === null) return null;
    if (!cariler.has(firmaId)) cariler.set(firmaId, (await firmaOzeti(db, firmaId))?.logoCariKodu ?? null);
    return cariler.get(firmaId) ?? null;
  };
  // Köprü adımı veritabanına dönmez: gövdeyi kuran ilk transaction aynı firmanın kodunu önbelleğe almıştır.
  const bilinenCariKodu = (firmaId: number | null): string | null => (firmaId === null ? null : cariler.get(firmaId) ?? null);
  const teklif = await niyetliAcmaTuru(db, o, {
    belge: 'siparisler-teklifi', kuyruk: await o.kaynak.teklifGidecekler(db, KUYRUK_SINIRI),
    govde: async (t) => satisTeklifiGovdesi(t, { cariKodu: await cariKodu(t.firmaId), kdv, hizmetKdv }),
    // Logo teklifi CRM satış müşterisi kaydı ister (not 2.6, validate 4208); yoksa istek atılmaz.
    onKosul: async (t) => {
      const kod = bilinenCariKodu(t.firmaId) ?? '';
      const m = await kopru.satisMusterisiVarMi(kod.trim());
      if (m.tur !== 'basarili') return { sonuc: m.tur === 'reddedildi' ? 'reddedildi' : m.tur, hata: `Satış müşterisi okuması: ${m.ileti}` };
      return m.logicalRef === null ? { sonuc: 'reddedildi', hata: kirp(`Cari ${kod.trim()} Logo'da satış müşterisi (CRM) olarak tanımlı değil.`) } : null;
    },
    ekle: async (_t, govde) => {
      const r = await kopru.satisTeklifiEkle(govde);
      // Cevapta satır kayıtları yoksa teklif kaydından okunur (cevabın satır kabı notta yok).
      if (r.tur !== 'basarili' || r.logicalRef === null || r.satirRefleri !== null) return r;
      const oku = await kopru.satisTeklifiOku(r.logicalRef);
      return oku.tur === 'basarili' ? { ...r, satirRefleri: oku.satirRefleri } : r;
    },
    bildir: (yazDb, t, x) => o.kaynak.teklifSonucu(yazDb, t.id, x),
  });
  if (teklif !== null) return teklif;
  const siparis = await niyetliAcmaTuru(db, o, {
    belge: 'siparisler-siparisi', kuyruk: await o.kaynak.siparisGidecekler(db, KUYRUK_SINIRI),
    govde: async (t) => satisSiparisiGovdesi(t),
    // Gövde kuralı teklif kaydının geçerli olduğunu denetledi.
    ekle: (t, govde) => kopru.satisSiparisiAc(Number(t.teklifKayitNo), govde),
    bildir: (yazDb, t, x) => o.kaynak.siparisSonucu(yazDb, t.id, x),
  });
  return siparis ?? { tur: 'bos' };
}

/* ---------------- Okuma akışları (logo -> TMI): yalnız GET, yalnız saklanır ---------------- */

// Okunan satır stoka, satın almaya ya da başka modüle işlenmez (UYUM-BORCU "bağlamada kapanacak"). İstek ancak "Logo bağlantısı" ve akışın
// kendi anahtarı açık VE köprü değişkenleri varken çıkar. Turda en çok bir okuma isteği (fatura turu hariç: sınırlı sayıda sipariş, sıralı).
async function okumaKapisi(
  db: Db, o: TurOrtami, ayar: LogoAyarAnahtari, kapali: 'mal-kabul-kapali' | 'liste-kapali' | 'fatura-kapali' | 'malzeme-fisi-kapali',
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
        return async () => ({ tur: 'okuma', akis: 'mal-kabul', sonuc: r.tur, sayi: 0 });
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
      if (!listeOkunmaliMi(okuma?.sonOkumaAn ?? null, o.bellek.okumaDenemeleri.get(liste) ?? null, o.saat())) continue;
      return async (): Promise<Yazici<TurSonucu>> => {
        o.bellek.okumaDenemeleri.set(liste, o.saat());
        const r = liste === 'cari' ? await kopru.cariListesiOku() : await kopru.ambarListesiOku();
        if (r.tur !== 'basarili') return async () => ({ tur: 'okuma', akis: liste, sonuc: r.tur, sayi: 0 });
        return async (db2) => {
          await s.listeYaz(db2, liste, r.veri, o.saat());
          return { tur: 'okuma', akis: liste, sonuc: 'okundu', sayi: r.veri.length };
        };
      };
    }
    return { tur: 'bos' };
  });
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
      return { tur: 'okuma', akis: 'fatura', sonuc: r.tur, sayi: okunan };
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
      return kuyruk.flatMap((x) => {
        const f = fisler.get(x.id);
        // Stokta olmayan fiş (silinmez; VARSAYIM) kuyrukta kalır, gönderilmez.
        if (!f) return [];
        const ek = f.tur === 'sarf' && f.uretimEmriId !== null ? (fireler.get(f.uretimEmriId) ?? []) : [];
        return [{ tur: x.tur, id: x.id, no: f.no, fis: stokFisindenLogoFisi(f, ek) }];
      });
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
  for (const f of await o.kaynak.gidecekler(db, KUYRUK_SINIRI)) {
    const g = await s.gidenSatiri(db, f.tur, f.id);
    const durum = await s.esitlemeDurumu(db, f.tur, f.id);
    const okunan = durum?.bekleyen ?? 0;
    const hedef = f.fis === null ? null : malzemeFisiOzeti(f.fis);
    const logoda = g?.logoKayitNo ?? null;
    if (logoda !== null && hedef !== null && hedef === durum?.sonSatirOzeti) {
      await s.esitlendi(db, f.tur, f.id, okunan, hedef);
      continue;
    }
    if (logoda !== null) {
      if (g?.sonrakiDeneme && g.sonrakiDeneme.getTime() > o.saat().getTime()) continue;
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
    const r = malzemeFisiGovdesi(fis);
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
      await s.silmeHatasiYaz(yazDb, f.tur, f.id, {
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

export async function birimSetiEkle(db: Db, kisiId: number, kod: string, ad: string | null): Promise<{ kod: string }> {
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

type LogoAyarAnahtari = keyof typeof LOGO_AYARLARI;
const ACIK_KAPALI_AYARLARI = (Object.keys(LOGO_AYARLARI) as LogoAyarAnahtari[]).filter((a) => LOGO_AYARLARI[a].tur === 'boolean');

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
  return { zaman, ulasildi: adimlar.some((a) => a.sonuc === 'tamam'), adimlar };
}
