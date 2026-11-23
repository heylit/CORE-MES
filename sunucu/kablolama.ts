import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { ayarDegistiDinle, kurumLogosuOku, sistemAyariOku } from './moduller/ayarlar/disari.ts';
import { dolayliPersonelCozucusu, emilmeyenDogrudanCozucusu, genelGiderOraniCozucusu, projeMasrafiCozucusu, satisSevkleriCozucusu, satisSiparisleriCozucusu, sevkIsiOzetiCozucusu, siparisOzetiCozucusu, stokCikisiCozucusu } from './moduller/finans/disari.ts';
import * as akis from './moduller/akis/disari.ts';
import * as arkon from './moduller/arkon/disari.ts';
import { ayniDosyaKaynagiKaydet as cizimAyniDosyaKaynagiKaydet, cizimdekiYerler, kaydaBagliBelgeler } from './moduller/belge-merkezi/disari.ts';
import * as atolye from './moduller/atolye/disari.ts';
import * as cncKurulum from './moduller/cnc-kurulum/disari.ts';
import { gkkOzetiCozucusuKaydet } from './moduller/etiket-merkezi/disari.ts';
import { malzemeKartiIzleri as degisiklikKartIzleri, yururluktekiParcaRevizyonlari } from './moduller/degisiklik-yonetimi/disari.ts';
import { firmaPasifEngeli as finansFirmaPasifEngeli, malzemeKartiIzleri as finansKartIzleri } from './moduller/finans/disari.ts';
import { aktifIstasyonlar, istasyondakiKisiler, malzemeKartiIzleri as istasyonKartIzleri } from './moduller/istasyonlar/disari.ts';
import { istasyonAcildiDinle, istasyonSilinecekDinle } from './moduller/istasyonlar/disari.ts';
import * as bildirim from './moduller/bildirim/disari.ts';
import { epostaAdresCozucusuKaydet as bildirimEpostaAdresCozucusu, epostaAyarOkuyucusuKaydet as bildirimEpostaAyarOkuyucusu, epostaLogoOkuyucusuKaydet as bildirimEpostaLogoOkuyucusu, istasyonCozucusuKaydet as bildirimIstasyonCozucusu } from './moduller/bildirim/disari.ts';
import { makineOeeleri } from './moduller/oee/disari.ts';
import { coreOeeCozucusuKaydet as smartesCoreOeeCozucusu } from './moduller/smartes/disari.ts';
import { malzemeKartiIzleri as markalamaKartIzleri, markalamaOperasyonCozucusu } from './moduller/markalama/disari.ts';
import * as idariIsler from './moduller/idari-isler/disari.ts';
import * as ik from './moduller/ik/disari.ts';
import { aletKimlikleri as kalibrasyonAletleri } from './moduller/kalibrasyon/disari.ts';
import { kisilerinIslemleri } from './moduller/kisiler/disari.ts';
import * as kaliteMerkezi from './moduller/kalite-merkezi/disari.ts';
import * as logo from './moduller/logo/disari.ts';
import * as ortakDosyalar from './moduller/ortak-dosyalar/disari.ts';
import * as projeler from './moduller/projeler/disari.ts';
import * as plan from './moduller/plan/disari.ts';
import { acilSiparisOnaylandi, isEmriTakimHazirlaDurumlari, bakimCozucusu as planBakimCozucusu, bayatAdimBittiYansit, bayatEmirBittiYansit, bayatEmirIptalYansit, bayatFasonHareketiYansit, bayatIsEmirleriDegistiYansit, bayatSatinAlmaTerminiYansit, canliMakineAyrimlari, canliPaylar, canliPlan, malzemeKartiIzleri as planKartIzleri, malzemeMaliyetiCozucusu, planMotoruCozucusu, sunucuPlanCozucusu, tahminiMaliyetCozucusu, teklifDene } from './moduller/plan/disari.ts';
import { isEmriTahminiMaliyetleri, projedeSayilanBelgeler, uretimEmriMalzemeMaliyetleri } from './moduller/proje-maliyet/disari.ts';
import { satisSatiriAcikTalepleriKilitle, satisSatiriBagliKalemler, satisSiparisiKalemCozucusu } from './moduller/satin-alma/disari.ts';
import { alimDinle, terminDinle as satinAlmaTerminDinle, belgeGenelGiderOranlari, emirTedarikDurumlari, kaliteDurumuCozucusu, malzemeKartiIzleri as satinAlmaKartIzleri, onayliListeCozucusu, parcaRevizyonuCozucusu as siparisParcaRevizyonuCozucusu, fasonKonumuCozucusu, planlananGidisCozucusu, emirKartKullanimiCozucusu, stokMiktariCozucusu, stokYokCozucusu, tuketimSerisiCozucusu } from './moduller/satin-alma/disari.ts';
import * as receteRota from './moduller/recete-rota/disari.ts';
import { satinAlmaKademeOkuyucusu, siparisSatiriBelgeleri, siparisSatirlari } from './moduller/satin-alma/disari.ts';
import {
  logoAcilisCozucusu, logoAynaOzetiCozucusu, logoBirimSetiCozucusu, logoEslemeYaziciCozucusu, logoKartAynasiCozucusu, logoKodCozucusu, logoTmiKodCozucusu, rotaRevizyonlariCozucusu, kartIzleriCozucusu,
} from './moduller/malzemeler/disari.ts';
import { firmaAra, firmaDegistiDinle, firmaOzeti, firmaOzetleri, firmaPasifEngeliKaydet, logoCariAynasiKaydet, logoCariCozuculeriKaydet, logoCrmCozucusuKaydet, tumFirmalar } from './moduller/musteri-tedarikci/disari.ts';
import { ROTA_OKUMA_ISLEMLERI, talimatSurumuAdimlari as rotaTalimatSurumuAdimlari } from './moduller/rota/disari.ts';
import { araHalCozucusuKaydet as rotaAraHalCozucusu, opNumaralariDizildiDinle as rotaOpNumaralariDizildiDinle, emreKopyala as rotaEmreKopyala, siparisAcilisiRotasi as rotaSiparisAcilisiRotasi, revizyonunRotasi as rotaRevizyonunRotasi, durumRevizyonlari, emreGelenSablonOzetleri, emreGelenSablonaAdimEkle, emirBittiYansit as rotaEmirBittiYansit, adimBittiYansit as rotaAdimBittiYansit, emirRotaHazirliklari, isEmriAparatHazirliklari, isEmriOperasyonKodlari, isEmriKopyalandiYansit, isEmriOlcuAletiHazirliklari, malzemeKartiIzleri as rotaKartIzleri, talasliAdimSureleri, yuzeyIslemiAdimlari, yururlukteOperasyonlar } from './moduller/rota/disari.ts';
import { talasliAdimCozucusu, yuzeyAdimlariCozucusu } from './moduller/geometri/disari.ts';
import * as sevkiyat from './moduller/sevkiyat/disari.ts';
import { bagliTalepCozucusu, satinAlinacakKalemler } from './moduller/siparisler/disari.ts';
import { bagliEmirCozucusu, kalemEmirCozucusu, kapanisEksigiCozucusu, malzemeKartiIzleri as siparisKartIzleri, siparisAyrintisi, siparisDegistiDinle, siparisIptalEdildiDinle, siparisListesi, onayBekleyenSiparisler, siparisAcanlari, siparisSatiriOzetleri, siparisOnayiGeriAlindiDinle, siparisOnaylandiDinle, siparisRevizeEdildiDinle, takvimKayitlari as siparisTakvimi, teklifDenemeCozucusu } from './moduller/siparisler/disari.ts';
import { siparisListesiSorgusu } from '#paylasilan/sozlesme/siparisler.ts';
import { STOK_ISLEMLERI } from '#paylasilan/islemler/stok.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { ADIMLI_OKUMA_ISLEMLERI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/tesis-zamani.ts';
import type { MalzemeKartiAnahtari, MalzemeKartiIzi } from '#paylasilan/malzeme-karti-izi.ts';
import * as stok from './moduller/stok/disari.ts';
import * as uretimEmirleri from './moduller/uretim-emirleri/disari.ts';
import * as vardiya from './moduller/vardiya/disari.ts';

// Ters yöndeki bütün bağlar burada (ADR 0006): haberi veren modül dinleyeni ithal edemez, dinleyen de kendini yükleme anında
// kaydetmez. Kayıt yükleme yan etkisiyle olsaydı, dinleyen modül yüklenmeden koşan süreç (iş, araç, test) olayı sessizce
// kaçırır, çözücüsü olmayan stok sayımı statüsüz yazardı. Sıra bugünkü yükleme sırasıdır (stok, sonra sevkiyat): aynı olayın
// dinleyicileri bu sırayla, komutla aynı işlemde koşar.
export interface Bag {
  readonly ad: string;
  readonly eksik: boolean;
  readonly kur: () => void;
}

// Tip denetimi derlemede yakalar; işlevin çalışma anında yokluğu (ihraç adı değişti, modül yarım yüklendi) burada yakalanır.
// 3429-3 F2: stok ile siparişler birbirini ithal etmez; sipariş kalemleri stoka buradan verilir.
const siparisStokAyirmasi = siparisAyrintisi && stok.siparisAyirmalariniEsitle && (async (db: Db, olay: { siparisId: number; kullanici: { id: number } }) => {
  const sp = await siparisAyrintisi(db, olay.siparisId);
  await stok.siparisAyirmalariniEsitle(db, olay.kullanici.id, {
    siparisId: sp.id, siparisNo: sp.no, onayli: sp.durum === 'onayli',
    kalemler: sp.satirlar.map((k) => ({
      id: k.id, malzemeNo: k.malzemeNo, ad: k.malzemeAdi ?? k.malzemeKodu ?? `Kart ${String(k.malzemeNo)}`, miktar: k.miktar, birim: k.birim, stoktan: k.karsilama === 'stok',
    })),
  });
});

export function bag<T>(ad: string, kur: ((karsilik: T) => unknown) | undefined, karsilik: T | undefined): Bag {
  return {
    ad,
    eksik: typeof kur !== 'function' || typeof karsilik !== 'function',
    kur: () => { kur!(karsilik!); },
  };
}

// 3405 a: kademeli uyarı kaynakları, yalnız kaynak modülün dışa açık okumasıyla. Kaydın sorumlu kişisi olmayan kaynakta K2-K3 işi
// yapan işlemi, K4-K5 yönetici işlemi taşıyanlara gider (motor ayardaki rolü ekler). Kayıt dönemi taşır: yeni vade yeni kayıttır.
const GUN_MS = 86_400_000;
const gunEkle = (t: string, g: number): string => new Date(Date.parse(`${t}T00:00:00Z`) + g * GUN_MS).toISOString().slice(0, 10);
async function islemSahipleri(db: Db): Promise<(islem: Islem) => number[]> {
  const l = [...await kisilerinIslemleri(db)];
  return (islem) => l.filter(([, i]) => i.includes(islem)).map(([k]) => k);
}
// Eşleme saftır (kademe-okuyuculari.test.ts sınar); okuyucu yalnız kaynak modülün okumasını ve işlem sahiplerini verir.
type Sahip = (islem: Islem) => number[];
export const kalibrasyonKademeKayitlari = (aletler: Awaited<ReturnType<typeof kalibrasyonAletleri>>, sahip: Sahip): bildirim.KademeKaydi[] => {
  const yapan = sahip('kalibrasyon.yaz');
  return aletler.flatMap((a) => (a.vade === null || a.durum === 'kullanim-disi' || a.durum === 'kayit-yok' ? [] : [{
    kayit: `${String(a.id)}:${a.vade}`, no: a.no, baslik: `${a.no} · ${a.tur}`, yol: '/kalibrasyon' as const, sonGun: a.vade, yapanlar: yapan, yoneticiler: [],
  }]));
};
export const bakimKademeKayitlari = (planlar: Awaited<ReturnType<typeof arkon.periyodikBakimlar>>, sahip: Sahip): bildirim.KademeKaydi[] => {
  const yapan = sahip('arkon.bakim');
  const amir = sahip('arkon.amir');
  return planlar.flatMap((p) => {
    if (p.sonYapilma === null) return [];
    const vade = gunEkle(tesisGunu(p.sonYapilma), p.herGun);
    return [{ kayit: `${p.kimlik}:${vade}`, no: p.makineKod, baslik: p.baslik === '' ? p.makineKod : `${p.makineKod} · ${p.baslik}`, yol: '/arkon/bakim' as const,
      sonGun: vade, yapanlar: yapan, yoneticiler: amir }];
  });
};
export const siparisTerminKademeKayitlari = (kayitlar: Awaited<ReturnType<typeof siparisTakvimi>>, sahip: Sahip, acanlar: ReadonlyMap<number, number> = new Map()): bildirim.KademeKaydi[] => {
  const yazan = sahip('siparisler.yaz');
  const onaylayan = sahip('siparisler.onayla');
  return kayitlar.flatMap((k) => (k.bitti ? [] : [{
    kayit: `${k.kimlik}:${k.tarih}`, no: k.no ?? k.kimlik, baslik: k.baslik, yol: '/siparisler' as const, sonGun: k.tarih, sahip: acanlar.get(Number(k.kimlik)) ?? null,
    yapanlar: yazan, yoneticiler: onaylayan,
  }]));
};
// 3478: onay bekleyen satış siparişi; işi onaylayanlar yapar, yönetici ayardaki rol ya da kademe yöneticileridir. Kayıt açılış anını taşır.
export const siparisOnayKademeKayitlari = (siparisler: Awaited<ReturnType<typeof onayBekleyenSiparisler>>, sahip: Sahip): bildirim.KademeKaydi[] => {
  const onaylayan = sahip('siparisler.onayla');
  return siparisler.map((s) => ({
    kayit: `${String(s.id)}:${s.beklemeAni}`, no: s.no, baslik: `${s.no}: onay bekliyor`, yol: `/siparisler/${String(s.id)}` as const,
    baslangic: tesisGunu(new Date(s.beklemeAni)), baslangicAni: s.beklemeAni, sahip: s.acanId, yapanlar: onaylayan, yoneticiler: [],
  }));
};
// 3478: açık DÖF termini kaliteyi yazana, MRB kararı bekleyen uygunsuzluk kararı verene (onaylayan) gider; yönetici ayardaki rol.
export const dofKademeKayitlari = (dofler: Awaited<ReturnType<typeof kaliteMerkezi.acikDofler>>, sahip: Sahip): bildirim.KademeKaydi[] => {
  const yazan = sahip('kalite-merkezi.yaz');
  return dofler.map((d) => ({ kayit: `${d.kimlik}:${d.termin}`, no: d.no, baslik: `${d.no}: DÖF termini`, yol: '/kalite-merkezi/dof' as const, sonGun: d.termin, yapanlar: yazan, yoneticiler: [] }));
};
export const hataliParcaKademeKayitlari = (ncrler: Awaited<ReturnType<typeof kaliteMerkezi.kararBekleyenNcrler>>, sahip: Sahip): bildirim.KademeKaydi[] => {
  const karar = sahip('kalite-merkezi.onayla');
  return ncrler.map((n) => ({
    kayit: `${n.kimlik}:${n.tarih}`, no: n.no, baslik: `${n.no}: karar bekliyor`, yol: '/kalite-merkezi/uygunsuzluklar' as const, baslangic: n.tarih, yapanlar: karar, yoneticiler: [],
  }));
};
// 3429-2 D: termin riskli onaylı sipariş; işi satış yazanlar yapar, onaylayanlar yönetir (siparisler.termin ile aynı alıcılar).
export const siparisTerminRiskiKademeKayitlari = (
  riskler: readonly akis.SiparisTerminRiski[], numaralar: ReadonlyMap<number, string>, sahip: Sahip, acanlar: ReadonlyMap<number, number> = new Map(),
): bildirim.KademeKaydi[] => {
  const yazan = sahip('siparisler.yaz');
  const onaylayan = sahip('siparisler.onayla');
  return riskler.map((r) => {
    const no = numaralar.get(r.siparisId) ?? String(r.siparisId);
    return {
      kayit: `${String(r.siparisId)}:${r.termin}`, no, baslik: `Sipariş ${no}: plan termini ${String(r.gun)} gün aşıyor`, yol: `/siparisler/${String(r.siparisId)}` as const,
      sonGun: r.termin, sahip: acanlar.get(r.siparisId) ?? null, yapanlar: yazan, yoneticiler: onaylayan,
    };
  });
};
const kalibrasyonVadeleri = async (db: Db) => kalibrasyonKademeKayitlari(await kalibrasyonAletleri(db), await islemSahipleri(db));
const bakimVadeleri = async (db: Db) => bakimKademeKayitlari(await arkon.periyodikBakimlar(db), await islemSahipleri(db));
const siparisTerminleri = async (db: Db) => {
  const bugun = tesisGunu(new Date());
  const kayitlar = await siparisTakvimi(db, gunEkle(bugun, -400), gunEkle(bugun, 60));
  return siparisTerminKademeKayitlari(kayitlar, await islemSahipleri(db), await siparisAcanlari(db, kayitlar.map((k) => Number(k.kimlik))));
};
// Açık (bitmemiş) siparişler termin takviminden; risk yalnız onaylıda hesaplanır (akış). VARSAYIM: termini 60 günden uzak sipariş
// henüz izlenmez (takvim penceresi siparisler.termin ile aynı).
const siparisOnaylari = async (db: Db) => siparisOnayKademeKayitlari(await onayBekleyenSiparisler(db), await islemSahipleri(db));
const dofTerminleri = async (db: Db) => dofKademeKayitlari(await kaliteMerkezi.acikDofler(db), await islemSahipleri(db));
const hataliParcaKararlari = async (db: Db) => hataliParcaKademeKayitlari(await kaliteMerkezi.kararBekleyenNcrler(db), await islemSahipleri(db));
const siparisTerminRiskleriOku = async (db: Db) => {
  const bugun = tesisGunu(new Date());
  const acik = (await siparisTakvimi(db, gunEkle(bugun, -400), gunEkle(bugun, 60))).filter((k) => !k.bitti);
  const numaralar = new Map(acik.map((k) => [Number(k.kimlik), k.no ?? k.kimlik]));
  return siparisTerminRiskiKademeKayitlari(await akis.siparisTerminRiskleri(db, [...numaralar.keys()]), numaralar, await islemSahipleri(db), await siparisAcanlari(db, [...numaralar.keys()]));
};

// 3272-3 a: emri siparişe kilitleyen bağ: satın alma siparişi aşamasındaki tedarik ya da stok fişi. Talep kilitlemez, uyarır (3272-2).
const siparisEmirBaglari = async (db: Db, idler: readonly number[]) => {
  const durumlar = await emirTedarikDurumlari(db, idler, []);
  const tedarik = new Set(durumlar.flatMap((x) => (x.asama === 'siparis' && x.uretimEmriId !== null ? [x.uretimEmriId] : [])));
  const talep = new Set(durumlar.flatMap((x) => (x.asama === 'talep' && x.uretimEmriId !== null ? [x.uretimEmriId] : [])));
  const fisler = await stok.emirMalzemeFisleri(db, idler);
  return { tedarik, talep, stok: new Set([...fisler].flatMap(([id, f]) => (f.sarf.length + f.giris.length + f.hurda.length > 0 ? [id] : []))) };
};

// 2118: cari okuması uçta transaction dışında koşar (köprü 60 sn bekleyebilir); logonun ayar okuması aynı bağlantıyı kullanır.
const cariAra = (db: Db, metin: string) => logo.logodaCariAra({ tx: (f) => f(db) }, metin);
const cariOku = (db: Db, kod: string) => logo.logodanCariOku({ tx: (f) => f(db) }, kod);
const crmKodlariOku = (db: Db, kod: string) => logo.logodanCrmKodlari({ tx: (f) => f(db) }, kod);

type KartIzleri = (db: Db, kartlar: readonly MalzemeKartiAnahtari[]) => Promise<MalzemeKartiIzi[]>;

// Arşiv (2114c): kartın izini tutan her modülün sayımı modül adıyla birleşir. Biri yoksa bağ eksik sayılır; eksik sayım kalıcı
// silmeye "bağı yok" dedirtirdi. Sayımlar sırayla koşar: aynı işlemin tek bağlantısını paylaşırlar.
function kartIzleriTopla(kaynaklar: Readonly<Record<string, KartIzleri | undefined>>) {
  const liste = Object.entries(kaynaklar);
  if (liste.some(([, sayim]) => typeof sayim !== 'function')) return undefined;
  return async (db: Db, kartlar: readonly MalzemeKartiAnahtari[]) => {
    const izler: (MalzemeKartiIzi & { modul: string })[] = [];
    for (const [modul, sayim] of liste) for (const iz of await sayim!(db, kartlar)) izler.push({ ...iz, modul });
    return izler;
  };
}

// 2067 (kart 3288-2): müşteri, sipariş ve proje klasörleri. Ortak Dosyalar kaynak modülleri ithal etmez; kaydın zinciri (firma,
// sipariş, proje) burada kaynakların `disari.ts`'inden kurulur. Yalnız müşteri (ya da ikisi) türündeki firmaya klasör açılır.
type Zincir = ortakDosyalar.KayitZinciri;
const musteriMi = (tur: string) => tur === 'musteri' || tur === 'ikisi';
const firmaBilgisi = (f: { id: number; kod: string | null; ad: string }) => ({ id: f.id, kod: f.kod, ad: f.ad });
const siparisBilgisi = (s: { id: number; no: string; musteriSiparisNo: string | null; durum: string }) =>
  ({ id: s.id, no: s.no, musteriSiparisNo: s.musteriSiparisNo, iptal: s.durum === 'iptal' });

async function siparisOku(db: Db, id: number) {
  try {
    return await siparisAyrintisi(db, id);
  } catch (h) {
    if (h instanceof UygulamaHatasi && h.durum === 404) return null;
    throw h;
  }
}
async function firmaZinciri(db: Db, id: number): Promise<Zincir | null> {
  const f = await firmaOzeti(db, id);
  return f === null || !musteriMi(f.tur) ? null : { tur: 'firma', firma: firmaBilgisi(f) };
}
async function siparisZinciri(db: Db, id: number): Promise<Zincir | null> {
  const sp = await siparisOku(db, id);
  const f = sp === null ? null : await firmaOzeti(db, sp.firmaId);
  return sp === null || f === null ? null : { tur: 'siparis', firma: firmaBilgisi(f), siparis: siparisBilgisi(sp) };
}
async function projeZinciri(db: Db, id: number): Promise<Zincir | null> {
  const p = await projeler.projeGetir(db, id);
  if (p === null) return null;
  const f = p.firmaId === null ? null : await firmaOzeti(db, p.firmaId);
  const sp = p.siparisId === null ? null : await siparisOku(db, p.siparisId);
  return { tur: 'proje', firma: f === null ? null : firmaBilgisi(f), siparis: sp === null ? null : siparisBilgisi(sp), proje: { id: p.id, kod: p.kod, ad: p.ad } };
}
const esitle = (oku: (db: Db, id: number) => Promise<Zincir | null>) => async (db: Db, kisiId: number, id: number) => {
  const z = await oku(db, id);
  if (z !== null) await ortakDosyalar.kayitEsitle(db, kisiId, z);
};
const firmaEsitle = esitle(firmaZinciri);
const siparisEsitle = esitle(siparisZinciri);
const projeEsitle = esitle(projeZinciri);

// Hazır listeler (kart 3390, 3390 a). Risk K1: her grup dosyanın kaynak ucundaki okuma işlemiyle süzülür; o işlem yoksa grup hiç gelmez.
// İşlem listeleri kaynak uçlarınınkiyle aynıdır (belge-merkezi OKUMA, satin-alma belge ucu, stok OKUMA ve SON_PARTI_OKUMA).
const CIZIM_OKUMA: readonly Islem[] = ['sayfa.cizimler', 'belge-merkezi.oku'];
const SATIN_ALMA_OKUMA: readonly Islem[] = ['satin-alma.oku', 'satin-alma.yaz'];
const PARTI_OKUMA: readonly Islem[] = ['sayfa.stok', ...STOK_ISLEMLERI];
const IRSALIYE_OKUMA: readonly Islem[] = [...PARTI_OKUMA, ...SATIN_ALMA_OKUMA];
// 3390-2: adım fotoğrafı, plan ve talimat medyası listeleri kaynak modülün disari.ts'inden gelir (uçlarıyla tek liste).
const okur = (k: Kullanici, islemler: readonly Islem[]): boolean => islemler.some((i) => k.islemler.includes(i));
const yol = (...p: (string | number)[]): string => `/${p.map(String).join('/')}`;

async function emirAyrintisiOku(db: Db, id: number) {
  try {
    return await uretimEmirleri.adimliEmirAyrintisi(db, id);
  } catch (h) {
    if (h instanceof UygulamaHatasi && h.durum === 404) return null;
    throw h;
  }
}

// Sağlayıcıların okuduğu kaynak işlevleri; test, süzmeyi gerçek sağlayıcıyla sahte kaynak üstünde ölçer.
export const URETIM_EMRI_KAYNAKLARI = {
  liste: (db: Db) => uretimEmirleri.adimliEmirListesi(db, false, null, true),
  bitenler: (db: Db, ara: string | null, sinir: number) => uretimEmirleri.adimliBitenEmirler(db, { durum: 'bitti', ara }, { sayfa: 1, sayfaBoyu: sinir }),
  planAraligi: plan.canliPlanAraligi,
  isEmriBilgileri: uretimEmirleri.isEmriPlanBilgileri,
  emir: emirAyrintisiOku,
  cizimler: (db: Db, malzemeId: number) => kaydaBagliBelgeler(db, 'malzemeler', malzemeId),
  talimatKunyeleri: uretimEmirleri.emrinTalimatKunyeleri,
  talimatAdimlari: rotaTalimatSurumuAdimlari,
  listeFotograflari: uretimEmirleri.emirListeFotograflari,
  partiBelgeleri: stok.emrinPartiBelgeleri,
  siparisSatirlari: siparisSatiriOzetleri,
};
export const SATIN_ALMA_KAYNAKLARI = { satirlar: siparisSatirlari, belgeler: siparisSatiriBelgeleri, stokBelgeleri: stok.siparisSatirlarininBelgeleri };
type EmirKaynaklari = typeof URETIM_EMRI_KAYNAKLARI;
type Emir = NonNullable<Awaited<ReturnType<EmirKaynaklari['emir']>>>;
type Grup = ortakDosyalar.HazirKayitSonucu['gruplar'][number];

// Plan listesinin penceresi: bugünün başından 7 gün (K2: plan yalnız çizim ve talimatı açar).
const PLAN_GUN = 7;
const planPenceresi = (simdi: Date): [Date, Date] => {
  const bas = tesisGunBasi(tesisGunu(simdi));
  return [new Date(bas), new Date(bas + PLAN_GUN * 86_400_000)];
};
const emirSatiri = (e: { id: number; emirNo: string; urun: { kod: string; ad: string }; adet: number }, alt?: string) =>
  ({ anahtar: String(e.id), no: e.emirNo, baslik: `${e.urun.kod} ${e.urun.ad}`.trim(), alt: alt ?? `${String(e.adet)} adet` });

// Emrin kaynak grupları; her grup kendi kaynak ucunun okuma işlemiyle süzülür (Risk K1). `tam` değilse yalnız çizim ve talimat (K2).
async function emirGruplari(db: Db, kaynak: EmirKaynaklari, k: Kullanici, e: Emir, tam: boolean): Promise<Grup[]> {
  const gruplar: Grup[] = [];
  if (e.urun.id !== null && okur(k, CIZIM_OKUMA)) {
    const belgeler = (await kaynak.cizimler(db, e.urun.id)).flatMap((b) => (b.revizyonId === null ? [] : [{ ...b, revizyonId: b.revizyonId }]));
    gruplar.push({ kaynak: 'cizim', dosyalar: belgeler.map((b) => ({
      ad: b.ad, dosyaTuru: b.dosyaTuru, bilgi: b.revKodu === null ? null : `Rev ${b.revKodu}`, zaman: null,
      indir: yol('cizimler', b.id, 'revizyonlar', b.revizyonId, 'dosya'), ac: yol('cizimler', 'belge', b.id),
    })) });
  }
  if (okur(k, ROTA_OKUMA_ISLEMLERI)) {
    const dosyalar: Grup['dosyalar'] = [];
    const gorulen = new Set<string>();
    for (const t of await kaynak.talimatKunyeleri(db, e.id)) {
      for (const a of (await kaynak.talimatAdimlari(db, t.malzemeNo, t.opNo, t.surum)) ?? []) {
        for (const m of a.medya) {
          if (gorulen.has(m.ozet)) continue;
          gorulen.add(m.ozet);
          dosyalar.push({ ad: m.ad, dosyaTuru: null, bilgi: `OP${String(t.opNo)} · talimat ${String(t.surum)}`, zaman: null, ac: null, indir: yol('rota', 'talimat-medyasi', m.ozet) });
        }
      }
    }
    gruplar.push({ kaynak: 'talimat', dosyalar });
  }
  if (!tam) return gruplar;
  if (okur(k, uretimEmirleri.ADIM_DURUMU_OKUMA_ISLEMLERI)) {
    gruplar.push({ kaynak: 'adim-foto', dosyalar: (await kaynak.listeFotograflari(db, e.id)).map((f) => ({
      ad: `${f.ad}.jpg`, dosyaTuru: 'jpg', bilgi: f.ad, zaman: f.zaman, ac: null, indir: yol('adimli-emirler', e.id, 'liste-fotografi', f.adimId, f.ozet),
    })) });
  }
  if (okur(k, PARTI_OKUMA)) {
    gruplar.push({ kaynak: 'parti', dosyalar: (await kaynak.partiBelgeleri(db, e.id)).map((b) => ({
      ad: b.ad, dosyaTuru: null, bilgi: b.lotNo === null ? null : `Parti ${b.lotNo}`, zaman: null, ac: null, indir: yol('stok', 'partiler', b.partiId, 'belgeler', b.belgeId),
    })) });
  }
  return gruplar;
}

type EmirListesi = 'uretim-emri' | 'uretim-kaydi' | 'plan';
const EMIR_LISTE_OKUMA: Record<EmirListesi, readonly Islem[]> = {
  'uretim-emri': ADIMLI_OKUMA_ISLEMLERI, 'uretim-kaydi': ADIMLI_OKUMA_ISLEMLERI, plan: plan.PLAN_OKUMA_ISLEMLERI,
};

// Üç liste aynı emir kaydını okur: açık ve kapalı bütün emirler, yalnız bitenler (üretim kayıtları) ve bu haftanın canlı planı.
export const uretimEmriSaglayicisi = (
  kaynak: EmirKaynaklari = URETIM_EMRI_KAYNAKLARI, liste: EmirListesi = 'uretim-emri', simdi: () => Date = () => new Date(),
): ortakDosyalar.HazirSaglayici => {
  async function plandakiler(db: Db): Promise<Map<number, string>> {
    const [bas, bit] = planPenceresi(simdi());
    const isler = await kaynak.planAraligi(db, bas, bit);
    const bilgi = await kaynak.isEmriBilgileri(db, isler.map((x) => x.isEmriId));
    const ilk = new Map<number, string>();
    for (const x of isler) {
      const emirId = bilgi.get(x.isEmriId)?.uretimEmriId;
      if (emirId !== undefined && !ilk.has(emirId)) ilk.set(emirId, x.baslangic);
    }
    return ilk;
  }
  return {
    okuma: EMIR_LISTE_OKUMA[liste],
    async kayitlar(db, ara, sinir) {
      if (liste === 'uretim-kaydi') {
        return (await kaynak.bitenler(db, ara, sinir)).satirlar.map((e) => emirSatiri(e));
      }
      const { emirler } = await kaynak.liste(db);
      if (liste === 'plan') {
        const ilk = await plandakiler(db);
        const bul = new Map(emirler.map((e) => [e.id, e]));
        return [...ilk].flatMap(([id, bas]) => {
          const e = bul.get(id);
          return e === undefined || !ortakDosyalar.aramaUyar(ara, e.emirNo, e.urun.kod, e.urun.ad) ? [] : [emirSatiri(e, `${String(e.adet)} adet · plan ${ortakDosyalar.planSaati(new Date(bas))}`)];
        }).slice(0, sinir);
      }
      return emirler.filter((e) => ortakDosyalar.aramaUyar(ara, e.emirNo, e.urun.kod, e.urun.ad)).slice(0, sinir).map((e) => emirSatiri(e));
    },
    async kayit(db, k, anahtar) {
      const id = Number(anahtar);
      if (!Number.isSafeInteger(id) || id <= 0) return null;
      const e = await kaynak.emir(db, id);
      if (e === null) return null;
      if (liste === 'uretim-kaydi' && e.durum !== 'bitti') return null;
      if (liste === 'plan' && !(await plandakiler(db)).has(e.id)) return null;
      const gruplar = await emirGruplari(db, kaynak, k, e, liste !== 'plan');
      const satir = e.siparisSatiriId == null ? null : (await kaynak.siparisSatirlari(db, [e.siparisSatiriId])).get(e.siparisSatiriId) ?? null;
      const klasorler: ortakDosyalar.HazirKayitSonucu['klasorler'] = liste === 'plan' ? [] : [
        ...(satir === null ? [] : [{ tur: 'siparis' as const, id: satir.siparisId }]),
        ...(e.projeId == null ? [] : [{ tur: 'proje' as const, id: e.projeId }]),
      ];
      return {
        kayit: emirSatiri(e, `${String(e.adet)} adet${satir === null ? '' : ` · ${satir.siparisNo}`}`),
        kayitYolu: yol('uretim-emirleri', e.id), gruplar, klasorler,
      };
    },
  };
};

// Satın alma siparişi satırların sipariş numarasıyla toplanır (VARSAYIM: sipariş no tekil; satin_alma_siparis talep ve teklifle anahtarlanır).
export const satinAlmaSaglayicisi = (kaynak: typeof SATIN_ALMA_KAYNAKLARI = SATIN_ALMA_KAYNAKLARI): ortakDosyalar.HazirSaglayici => ({
  okuma: SATIN_ALMA_OKUMA,
  async kayitlar(db, ara, sinir) {
    const gruplar = new Map<string, { tedarikci: string; satir: number; kalemler: string[] }>();
    for (const x of await kaynak.satirlar(db)) {
      const g = gruplar.get(x.siparisNo) ?? { tedarikci: x.tedarikciAdi, satir: 0, kalemler: [] };
      g.satir += 1;
      g.kalemler.push(x.kalemAdi);
      gruplar.set(x.siparisNo, g);
    }
    return [...gruplar].filter(([no, g]) => ortakDosyalar.aramaUyar(ara, no, g.tedarikci, ...g.kalemler))
      .sort(([a], [b]) => b.localeCompare(a, 'tr')).slice(0, sinir)
      .map(([no, g]) => ({ anahtar: no, no, baslik: g.tedarikci, alt: `${String(g.satir)} satır` }));
  },
  async kayit(db, k, anahtar) {
    const satirlar = (await kaynak.satirlar(db)).filter((x) => x.siparisNo === anahtar);
    if (satirlar.length === 0) return null;
    const kalem = new Map(satirlar.map((x) => [x.id, x.kalemAdi]));
    const ids = satirlar.map((x) => x.id);
    const gruplar: ortakDosyalar.HazirKayitSonucu['gruplar'] = [];
    const belgeler = await kaynak.belgeler(db, ids);
    gruplar.push({ kaynak: 'satin-alma', dosyalar: [...belgeler].flatMap(([satirId, l]) => l.map((b) => ({
      ad: b.ad, dosyaTuru: null, bilgi: kalem.get(satirId) ?? null, zaman: null, ac: null, indir: yol('satin-alma-siparis-satirlari', satirId, 'belgeler', b.id, 'dosya'),
    }))) });
    if (okur(k, IRSALIYE_OKUMA) || okur(k, PARTI_OKUMA)) {
      const st = await kaynak.stokBelgeleri(db, ids);
      if (okur(k, IRSALIYE_OKUMA)) {
        gruplar.push({ kaynak: 'irsaliye', dosyalar: st.irsaliyeler.map((b) => ({
          ad: b.ad, dosyaTuru: null, bilgi: `Mal kabul ${b.malKabulNo}`, zaman: null, ac: null, indir: yol('stok', 'mal-kabuller', b.malKabulId, 'irsaliyeler', b.belgeId),
        })) });
      }
      if (okur(k, PARTI_OKUMA)) {
        gruplar.push({ kaynak: 'parti', dosyalar: st.partiBelgeleri.map((b) => ({
          ad: b.ad, dosyaTuru: null, bilgi: b.lotNo === null ? null : `Parti ${b.lotNo}`, zaman: null, ac: null, indir: yol('stok', 'partiler', b.partiId, 'belgeler', b.belgeId),
        })) });
      }
    }
    return {
      kayit: { anahtar, no: anahtar, baslik: satirlar[0]!.tedarikciAdi, alt: `${String(satirlar.length)} satır` },
      kayitYolu: '/satin-alma/siparisler', gruplar, klasorler: [],
    };
  },
});

// Toplu komutun kaynağı: bütün müşteri firmaları, siparişler (sayfa sayfa) ve projeler; zincir firma ve sipariş başına bir kez okunur.
async function mevcutKayitlar(db: Db): Promise<Zincir[]> {
  const firmalar = new Map((await tumFirmalar(db)).map((f) => [f.id, f]));
  const sonuc: Zincir[] = [...firmalar.values()].filter((f) => musteriMi(f.tur)).map((f) => ({ tur: 'firma', firma: firmaBilgisi(f) }));
  const siparisler = new Map<number, ReturnType<typeof siparisBilgisi> & { firmaId: number }>();
  for (let sayfa = 1; ; sayfa += 1) {
    const l = await siparisListesi(db, siparisListesiSorgusu.parse({ sayfa, sayfaBoyu: 200, sirala: 'no', yon: 'artan' }));
    for (const sp of l.satirlar) siparisler.set(sp.id, { ...siparisBilgisi(sp), firmaId: sp.firmaId });
    if (l.satirlar.length < l.sayfaBoyu) break;
  }
  for (const { firmaId, ...sp } of siparisler.values()) {
    const f = firmalar.get(firmaId);
    if (f !== undefined) sonuc.push({ tur: 'siparis', firma: firmaBilgisi(f), siparis: sp });
  }
  for (const p of await projeler.projeSecenekleri(db, { yalnizAktif: false })) {
    const f = p.firmaId === null ? undefined : firmalar.get(p.firmaId);
    const sp = p.siparisId === null ? undefined : siparisler.get(p.siparisId);
    sonuc.push({
      tur: 'proje', firma: f === undefined ? null : firmaBilgisi(f), siparis: sp === undefined ? null : { id: sp.id, no: sp.no, musteriSiparisNo: sp.musteriSiparisNo, iptal: sp.iptal },
      proje: { id: p.id, kod: p.kod, ad: p.ad },
    });
  }
  return sonuc;
}

// 3443: Ortak Dosyalar'da dosyanın müşterisi ve projesi. Müşteri araması firma modülünün sınırıyla (en çok 50) gelir; proje listesi
// müşteriye göre kaynakta, metinle burada süzülür (proje sayısı yüzlerle sınırlı, VARSAYIM).
const kucuk = (m: string): string => m.trim().toLocaleLowerCase('tr-TR');
export const ortakDosyalarMusteriProjeKaynagi = (): ortakDosyalar.MusteriProjeKaynagi => ({
  firmalar: async (db, idler) => new Map([...(await firmaOzetleri(db, [...idler])).values()].map((f) => [f.id, { ad: f.ad, tur: f.tur }])),
  projeler: async (db, idler) => {
    const istenen = new Set(idler);
    const satirlar = (await projeler.projeSecenekleri(db, { yalnizAktif: false })).filter((p) => istenen.has(p.id));
    return new Map(satirlar.map((p) => [p.id, { kod: p.kod, ad: p.ad, firmaId: p.firmaId }]));
  },
  musteriAra: (db, metin, sinir) => firmaAra(db, { metin, sinir, tur: 'musteri' }),
  projeAra: async (db, metin, firmaId, sinir) => {
    const ara = kucuk(metin);
    const satirlar = await projeler.projeSecenekleri(db, firmaId === null ? {} : { firmaId });
    return satirlar.filter((p) => ara === '' || kucuk(`${p.kod} ${p.ad}`).includes(ara)).slice(0, sinir).map((p) => ({ id: p.id, kod: p.kod, ad: p.ad, firmaId: p.firmaId }));
  },
});

export function sunucununBaglari(): Bag[] {
  return [
    bag('emir açıldı -> stok', uretimEmirleri.emirAcildiDinle, stok.emirAcildiYansit),
    bag('sağlam sayım -> stok', uretimEmirleri.saglamSayimDinle, stok.uretimSayimiYansitUyarili),
    bag('hurda sayım -> stok', uretimEmirleri.hurdaSayimDinle, stok.hurdaSayimiYansitUyarili),
    bag('sağlam sayım -> takım ömrü', uretimEmirleri.saglamSayimDinle, cncKurulum.takimSayimiYansit),
    bag('hurda sayım -> takım ömrü', uretimEmirleri.hurdaSayimDinle, cncKurulum.takimSayimiYansit),
    bag('kalite kararı -> stok', uretimEmirleri.kaliteKarariDinle, stok.kaliteKarariYansit),
    bag('emir bitti -> stok', uretimEmirleri.emirBittiDinle, stok.emirBittiYansit),
    bag('emir iptal -> stok', uretimEmirleri.emirIptalDinle, stok.emirIptalYansit),
    bag('emir birleşti -> stok', uretimEmirleri.emirBirlestiDinle, stok.emirBirlestiYansit),
    bag('fason hareketi -> stok', uretimEmirleri.fasonHareketiDinle, stok.fasonHareketiYansit),
    bag('fason sevki -> stok', sevkiyat.fasonSevkiDinle, stok.fasonSevkiYansit),
    bag('depo çıkışı fason gidişi -> üretim emirleri', stok.fasonGidisYaziciKaydet, uretimEmirleri.fasonGidisYaz),
    bag('ürün sevki -> stok', sevkiyat.urunSevkiDinle, stok.urunSevkiYansit),
    bag('lot no -> sevkiyat adres araması', sevkiyat.lotEmriCozucusuKaydet, stok.lotunEmri),
    bag('açık NCR partileri -> stok sevki', stok.acikNcrPartiCozucusu, kaliteMerkezi.acikNcrPartileri),
    bag('adım statüsü çözücüsü -> stok', stok.adimStatusuCozucusu, receteRota.adimStatusu),
    bag('makine 3B görünümü -> atölye', atolye.makineModelTuruCozucusu, cncKurulum.makineModelTurleri),
    bag('depoda stoklu malzemeler -> atölye 3B modeli', atolye.depoMalzemeCozucusu, stok.haritaStokluMalzemeleri),
    bag('raf silme engeli (malzeme, açık iş) -> atölye', atolye.rafSilmeEngeliCozucusu, stok.gozSilmeEngelleri),
    bag('bölüm açıldı -> stok deposu', atolye.bolumAcildiDinle, stok.bolumAcildiYansit),
    bag('istasyon açıldı -> stok konumu', istasyonAcildiDinle, stok.istasyonAcildiYansit),
    bag('istasyon silinecek -> kullanılmamış stok konumu', istasyonSilinecekDinle, stok.istasyonSilinecekYansit),
    bag('adım çıktısı çözücüsü -> stok', stok.adimCiktisiCozucusu, receteRota.adimCiktisi),
    bag('ara hal çözücüsü -> rota önizlemesi', rotaAraHalCozucusu, receteRota.adimAraHalleri),
    bag('rota OP numaraları dizildi -> reçete adım bağları', rotaOpNumaralariDizildiDinle, receteRota.opNumaralariDizildiYansit),
    bag('rota operasyon kodu -> plan iş emri satırı', uretimEmirleri.operasyonKoduCozucusu, isEmriOperasyonKodlari),
    bag('statü listesi -> stok', stok.statuListesiCozucusu, receteRota.receteRotaStatuleri),
    bag('parça revizyonu -> stok partisi', stok.parcaRevizyonuCozucusu, yururluktekiParcaRevizyonlari),
    bag('parça revizyonu -> sipariş satırı', siparisParcaRevizyonuCozucusu, yururluktekiParcaRevizyonlari),
    bag('rota revizyonları -> malzemeler', rotaRevizyonlariCozucusu, durumRevizyonlari),
    bag('rota yüzey adımları -> geometri yüzey işaretleri', yuzeyAdimlariCozucusu, yuzeyIslemiAdimlari),
    bag('rota talaşlı adım süreleri -> geometri süre kartı', talasliAdimCozucusu, talasliAdimSureleri),
    bag('rota operasyonları -> markalama tanımı', markalamaOperasyonCozucusu, yururlukteOperasyonlar),
    bag('emir bitti -> sevkiyat', uretimEmirleri.emirBittiDinle, sevkiyat.emirBittiYansit),
    bag('logo durumu -> stok malzeme fişi', stok.malzemeFisiLogoCozucusu, logo.malzemeFisiLogoDurumlari),
    bag('logo birim setleri -> malzemeler karşılık', logoBirimSetiCozucusu, logo.gecerliBirimSetiKodlari),
    bag('logo malzeme kodları -> malzemeler yeni stok kodu', logoKodCozucusu, logo.logodaKullanilanMalzemeKodlari),
    bag('logo malzeme aynası -> malzemeler Logo\'dan gelenler', logoKartAynasiCozucusu, logo.logodakiMalzemeKartlari),
    bag('logo gönderim izi -> malzemeler Logo\'da pasife alma', logoAcilisCozucusu, logo.logodaTmiActi),
    bag('logo ayna özeti -> malzemeler Logo geçişi', logoAynaOzetiCozucusu, logo.logodakiMalzemeOzeti),
    bag('logo kod eşlemesi -> malzemeler Logo\'dan alma', logoEslemeYaziciCozucusu, logo.malzemeEslemesiYaz),
    bag('logo kodundan TMI kodu -> malzemeler', logoTmiKodCozucusu, logo.tmiStokKodlari),
    bag('logo cari okuması -> müşteri-tedarikçi', (ara: typeof cariAra) => logoCariCozuculeriKaydet({ ara, oku: cariOku }),
      [logo.logodaCariAra, logo.logodanCariOku].every((f) => typeof f === 'function') ? cariAra : undefined),
    bag('logo cari aynası -> müşteri-tedarikçi Logo geçişi', logoCariAynasiKaydet, logo.logodakiCariAynasi),
    bag('finans pasif engeli -> müşteri-tedarikçi Logo geçişi geri al', firmaPasifEngeliKaydet, finansFirmaPasifEngeli),
    bag('logo CRM bağları -> müşteri-tedarikçi CRM seçimi', logoCrmCozucusuKaydet, typeof logo.logodanCrmKodlari === 'function' ? crmKodlariOku : undefined),
    bag('emir bitti -> rota gerçekleşen süre önerisi', uretimEmirleri.emirBittiDinle, rotaEmirBittiYansit),
    bag('adım bitti -> rota gerçekleşen süre önerisi', uretimEmirleri.adimBittiDinle, rotaAdimBittiYansit),
    bag('iş emri kopyalandı -> rota şartname sabiti', uretimEmirleri.isEmriKopyalandiDinle, isEmriKopyalandiYansit),
    bag('fason hareketi -> sevkiyat', uretimEmirleri.fasonHareketiDinle, sevkiyat.fasonHareketiYansit),
    bag('stok yok istekleri -> satın alma', stokYokCozucusu, stok.stokYokIstekleri),
    bag('iş emri tahmini maliyeti -> plan', tahminiMaliyetCozucusu, isEmriTahminiMaliyetleri),
    bag('projede sayılan belgeler -> finans genel gider', projeMasrafiCozucusu, projedeSayilanBelgeler),
    bag('emirsiz stok çıkışı -> finans genel gider', stokCikisiCozucusu, stok.emirsizCikisTutari),
    bag('plan makine ayrımı -> üretim emirleri', uretimEmirleri.planAyrimiCozucusu, canliMakineAyrimlari),
    bag('plan payları -> üretim emirleri terminali', uretimEmirleri.planPaylariCozucusu, canliPaylar),
    bag('üretim emri malzeme maliyeti -> plan', malzemeMaliyetiCozucusu, uretimEmriMalzemeMaliyetleri),
    bag('sipariş onaylandı -> plan acil sipariş', siparisOnaylandiDinle, acilSiparisOnaylandi),
    // 3272: onayda proje ve emirler kendiliğinden açılır (acil siparişin emri açıldıktan sonra: o kalem yeniden açılmaz). Onay geri alınınca
    // dokunulmamış emir kalemden çözülür, iptalde iptal olur (3272-3 a). Rota, satın alma ve stok uretim-emirlerini ithal eder; çözücüyle gelir.
    bag('sipariş onaylandı -> proje ve emir açılışı', siparisOnaylandiDinle, uretimEmirleri.siparisOnaylandiAc),
    bag('sipariş onayı geri alındı -> emirler kalemden çözülür', siparisOnayiGeriAlindiDinle, uretimEmirleri.siparisOnayiGeriAlindiCoz),
    bag('sipariş iptal edildi -> dokunulmamış emirler iptal', siparisIptalEdildiDinle, uretimEmirleri.siparisIptalEdildiIptal),
    // 3429-3 F2: "Stoktan" kalemin depoya ayırma isteği siparişin her değişikliğinde (açılış, düzenleme, her durum geçişi) eşitlenir: onayda açılır,
    // onay geri alınınca, iptalde ve kapanışta kapanır. Yeni sürüm (SIP-40) kalem, miktar ve yolu değiştirmez. Eşitleme tekrarlanabilir.
    bag('sipariş değişti -> stok ayırma isteği', siparisDegistiDinle, siparisStokAyirmasi),
    bag('rota, satın alma ve stok -> sipariş açılışı', (emirBaglari: typeof siparisEmirBaglari) => uretimEmirleri.siparisAcilisiCozuculeriKaydet({
      turunRotasi: rotaSiparisAcilisiRotasi, revizyonunRotasi: rotaRevizyonunRotasi, emreKopyala: rotaEmreKopyala, emirBaglari,
      rezervesiVar: async (db, emirId) => (await stok.emrinRezerveleri(db, emirId)).size > 0,
    }), [uretimEmirleri.siparisAcilisiCozuculeriKaydet, rotaSiparisAcilisiRotasi, rotaRevizyonunRotasi, rotaEmreKopyala, emirTedarikDurumlari, stok.emirMalzemeFisleri, stok.emrinRezerveleri]
      .every((f) => typeof f === 'function') ? siparisEmirBaglari : undefined),
    // 3244 b, 3254 a: yeniden onaylanan siparişin termini bağlı proje bitişine ve başlamamış emir teslimine kayar; elle değişen bağsızdır.
    bag('sipariş onaylandı -> proje bitişi', siparisOnaylandiDinle, projeler.projeBitisiniSiparisTermineKaydir),
    // 3396 Risk K-A: biten, iptal edilen ya da silinen emrin açık hazırlık görevi kademe döngüsünde iptal olur.
    bag('emir durumu -> projeler hazırlık kademesi', projeler.kapaliEmirCozucusuKaydet, uretimEmirleri.hazirligiKapananEmirler),
    // 3576: iptal olayı aynı işlemde emrin açık hazırlık görevlerini kapatır; 15 dakikalık iş yedek kalır.
    bag('emir iptal -> projeler hazırlık görevleri', uretimEmirleri.emirIptalDinle, projeler.emirIptalHazirlikKapat),
    // 3458 (dilim 2): Görevleri dağıt projeye bağlı açık emirlere hazırlık görevi açar.
    bag('proje emirleri -> projeler görev dağıtımı', projeler.hazirlikHedefCozucusuKaydet, uretimEmirleri.projeninHazirlikHedefleri),
    // 3405 a: kademeli uyarı kaynakları açık kayıtlarını ortak motora verir; iş günü İK resmi tatilini düşer.
    bag('İK resmi tatil -> kademeli uyarı', bildirim.kademeTatilCozucusuKaydet, typeof ik.resmiTatilGunleri === 'function'
      ? async (db: Db, bas: string, bit: string) => (await ik.resmiTatilGunleri(db, bas, bit)).map((t) => t.tarih) : undefined),
    ...(['satin-alma.talep-onay', 'satin-alma.siparis-verilmedi', 'satin-alma.teklif-cevapsiz', 'satin-alma.teslim'] as const).map((k) =>
      bag(`satın alma ${k} -> kademeli uyarı`, (o: bildirim.KademeOkuyucusu) => { bildirim.kademeKaynagiKaydet(k, o); }, typeof satinAlmaKademeOkuyucusu === 'function' ? satinAlmaKademeOkuyucusu(k) : undefined)),
    bag('projeler proje görevi -> kademeli uyarı', (o: bildirim.KademeOkuyucusu) => { bildirim.kademeKaynagiKaydet('projeler.gorev', o); }, projeler.projeGoreviKademeKayitlari),
    bag('projeler proje bitişi -> kademeli uyarı', (o: bildirim.KademeOkuyucusu) => { bildirim.kademeKaynagiKaydet('projeler.proje-bitis', o); }, projeler.projeBitisKademeKayitlari),
    bag('kalibrasyon vadesi -> kademeli uyarı', (o: bildirim.KademeOkuyucusu) => { bildirim.kademeKaynagiKaydet('kalibrasyon.vade', o); }, typeof kalibrasyonAletleri === 'function' ? kalibrasyonVadeleri : undefined),
    bag('arkon bakım vadesi -> kademeli uyarı', (o: bildirim.KademeOkuyucusu) => { bildirim.kademeKaynagiKaydet('arkon.bakim-vade', o); }, typeof arkon.periyodikBakimlar === 'function' ? bakimVadeleri : undefined),
    bag('satış siparişi termini -> kademeli uyarı', (o: bildirim.KademeOkuyucusu) => { bildirim.kademeKaynagiKaydet('siparisler.termin', o); }, typeof siparisTakvimi === 'function' ? siparisTerminleri : undefined),
    bag('satış siparişi onayı -> kademeli uyarı', (o: bildirim.KademeOkuyucusu) => { bildirim.kademeKaynagiKaydet('siparisler.onay', o); }, typeof onayBekleyenSiparisler === 'function' ? siparisOnaylari : undefined),
    bag('kalite DÖF termini -> kademeli uyarı', (o: bildirim.KademeOkuyucusu) => { bildirim.kademeKaynagiKaydet('kalite-merkezi.dof', o); }, typeof kaliteMerkezi.acikDofler === 'function' ? dofTerminleri : undefined),
    bag('kalite hatalı parça kararı -> kademeli uyarı', (o: bildirim.KademeOkuyucusu) => { bildirim.kademeKaynagiKaydet('kalite-merkezi.hatali-parca', o); }, typeof kaliteMerkezi.kararBekleyenNcrler === 'function' ? hataliParcaKararlari : undefined),
    bag('satış siparişi termin riski -> kademeli uyarı', (o: bildirim.KademeOkuyucusu) => { bildirim.kademeKaynagiKaydet('siparisler.plan-riski', o); }, typeof akis.siparisTerminRiskleri === 'function' ? siparisTerminRiskleriOku : undefined),
    // 3416-1 a: bekletilen emir neden başına ve aynı nedenle süren bekleme.
    ...(['uretim-emirleri.bekleme-malzeme', 'uretim-emirleri.bekleme-fason', 'uretim-emirleri.bekleme-takim', 'uretim-emirleri.bekleme-kalite',
      'uretim-emirleri.bekleme-muhendislik', 'uretim-emirleri.bekleme-teslim', 'uretim-emirleri.bekleme-suruyor'] as const).map((k) =>
      bag(`üretim emri bekletme ${k} -> kademeli uyarı`, (o: bildirim.KademeOkuyucusu) => { bildirim.kademeKaynagiKaydet(k, o); }, uretimEmirleri.bekletmeKademeOkuyucusu(k))),
    bag('projeler hazırlık görevi -> kademeli uyarı', (o: bildirim.KademeOkuyucusu) => { bildirim.kademeKaynagiKaydet('projeler.hazirlik', o); }, projeler.hazirlikKademeKayitlari),
    bag('sipariş onaylandı -> emir teslimi', siparisOnaylandiDinle, uretimEmirleri.emirTeslimleriniSiparisTermineKaydir),
    // 3427-4 a: onaylı siparişin yeni sürümünde termin değişmiş olabilir; proje bitişi ve başlamamış emir teslimi onaydaki gibi kayar.
    bag('sipariş yeni sürüm -> proje bitişi', siparisRevizeEdildiDinle, projeler.projeBitisiniSiparisTermineKaydir),
    bag('sipariş yeni sürüm -> emir teslimi', siparisRevizeEdildiDinle, uretimEmirleri.emirTeslimleriniSiparisTermineKaydir),
    // 3429-3 F3: satın alma talebine bağlı "Satın al" kalemi de emre bağlı kalem gibi kilitlidir (SIP-19).
    // 3429-3 F4: işe girmiş emirsiz sevk kalemi de aynı kilidi verir.
    bag('emre, talebe ya da sevk işine bağlı kalemler -> sipariş düzenleme', kalemEmirCozucusu,
      uretimEmirleri.emreBagliSiparisSatirlari && satisSatiriBagliKalemler && sevkiyat.sevkeBagliSiparisSatirlari && (async (db: Db, satirIdleri: readonly number[]) => new Set([
        ...await uretimEmirleri.emreBagliSiparisSatirlari(db, satirIdleri), ...await satisSatiriBagliKalemler(db, satirIdleri),
        ...await sevkiyat.sevkeBagliSiparisSatirlari(db, satirIdleri),
      ]))),
    bag('sipariş değişti -> sevkiyat sipariş kalemi', siparisDegistiDinle, sevkiyat.siparisDegistiYansit),
    bag('talebe bağlı kalemler -> sipariş iptali', bagliTalepCozucusu, satisSatiriAcikTalepleriKilitle),
    bag('sipariş "Satın al" kalemleri -> satın alma ön talebi', satisSiparisiKalemCozucusu, satinAlinacakKalemler),
    bag('sipariş akışı eksikleri -> sipariş kapatma', kapanisEksigiCozucusu, akis.siparisKapanisEksikleri),
    // 2319 (2311 S7, S10): saha olayı canlı planı bayat işaretler (plan değişmez); Arkon periyodik bakımı plan girdisine duruş olarak girer.
    bag('emir bitti -> plan bayat işareti', uretimEmirleri.emirBittiDinle, bayatEmirBittiYansit),
    bag('fason hareketi -> plan bayat işareti', uretimEmirleri.fasonHareketiDinle, bayatFasonHareketiYansit),
    bag('adım bitti -> plan bayat işareti', uretimEmirleri.adimBittiDinle, bayatAdimBittiYansit),
    bag('iş emirleri değişti -> plan bayat işareti', uretimEmirleri.isEmirleriDegistiDinle, bayatIsEmirleriDegistiYansit),
    bag('emir iptal -> plan bayat işareti', uretimEmirleri.emirIptalDinle, bayatEmirIptalYansit),
    bag('satın alma termini -> plan bayat işareti', satinAlmaTerminDinle, bayatSatinAlmaTerminiYansit),
    bag('periyodik bakım -> plan girdisi', planBakimCozucusu, arkon.periyodikBakimlar),
    bag('teklif denemesi -> siparişler (planlama motoru)', teklifDenemeCozucusu, teklifDene),
    // 2103-2 b: satıra bağlı emirlere siparişten açılan projelerin emirleri eklenir (iş emri olmayan emir proje okumasında yoktur).
    bag('bağlı emirler -> sipariş iptali', bagliEmirCozucusu, uretimEmirleri.siparisSatirlarininEmirleri && projeler.siparisinProjeleri && uretimEmirleri.dokunulmamisEmirIdleri && (async (
      db: Db, g: { siparisId: number; satirIdleri: readonly number[] },
    ) => {
      const idler = [...(await uretimEmirleri.siparisSatirlarininEmirleri(db, g.satirIdleri)).values()].flat();
      const durumlar = await uretimEmirleri.emirDurumlari(db, idler);
      const nolar = await uretimEmirleri.emirNolari(db, idler);
      const emirler = new Map(idler.flatMap((id) => { const durum = durumlar.get(id); return durum === undefined ? [] : [[id, { emirNo: nolar.get(id) ?? String(id), durum }] as const]; }));
      for (const p of await projeler.siparisinProjeleri(db, g.siparisId)) {
        for (const ie of await uretimEmirleri.projeninIsEmirleri(db, p.id)) {
          if (!emirler.has(ie.uretimEmriId)) emirler.set(ie.uretimEmriId, { emirNo: ie.emirNo, durum: ie.emirDurumu });
        }
      }
      // 3272-3 a: siparişten açılmış, dokunulmamış emir iptali kilitlemez; sipariş iptalinde o emir de iptal olur.
      const dokunulmamis = await uretimEmirleri.dokunulmamisEmirIdleri(db, [...emirler.keys()]);
      return [...emirler].flatMap(([id, e]) => (dokunulmamis.has(id) ? [] : [e]));
    })),
    // ADR 0018, 627 a: canlıya almada asıl planın son sözü ortak motordadır. Çözücü de plan modülündedir (ADR 0020); kayıt bağı kalkınca
    // plan servisi onu doğrudan çağırır (UYUM-BORCU P-B35).
    bag('plan motoru -> plan', planMotoruCozucusu, sunucuPlanCozucusu),
    bag('stok değer grupları -> satın alma kg stok değeri', stokMiktariCozucusu, stok.degerGrubuToplamlari),
    bag('stok tüketim serisi -> satın alma analizi', tuketimSerisiCozucusu, stok.tuketimSerisi),
    // 3437-3b-3b: alternatifli sipariş emrin bileşenini ikame etmeden önce emirde istenen karttan sarf ve ayırma olmadığını sorar.
    bag('stok emir kart kullanımı -> satın alma alternatif ikamesi', emirKartKullanimiCozucusu, async (db: Db, emirId: number, malzemeNo: number) => ({
      netSarf: (await stok.emirlerinNetSarfi(db, [emirId])).find((x) => x.malzemeId === malzemeNo)?.miktar ?? '0',
      rezerve: (await stok.emrinRezerveleri(db, emirId)).get(malzemeNo) ?? '0',
    })),
    bag('alım -> sevkiyat', alimDinle, sevkiyat.alimYansit),
    bag('kalite onay durumu -> satın alma siparişi', kaliteDurumuCozucusu, kaliteMerkezi.tedarikciOnayDurumlari),
    bag('kalite onaylı liste -> satın alma onaylı liste ve teklif rehberi', onayliListeCozucusu, kaliteMerkezi.onayliListe),
    bag('canlı plan -> dış operasyonlarda planlanan gidiş', planlananGidisCozucusu, canliPlan),
    bag('stok fason kutusu -> dış operasyondan mal kabul', fasonKonumuCozucusu, stok.firmaFasonKonumlari),
    bag('vardiya takvimi -> İK puantaj', ik.puantajTakvimCozucusu, vardiya.calismaTakvimleri),
    bag('vardiya aralıkları -> İK puantaj', ik.puantajAralikCozucusu, vardiya.basladigiGunTakvimleri),
    bag('vardiya tanımları -> İK kişi sayfası', ik.vardiyaTanimCozucusu, vardiya.vardiyaTanimlari),
    bag('vardiya matrisi -> İK kişi sayfası', ik.vardiyaMatrisCozucusu, vardiya.vardiyaMatrisi),
    bag('vardiya iş günleri -> İK izin sayımı', ik.isGunuCozucusu, vardiya.kisilerinIsGunleri),
    // Siparişler bulunmayan siparişte 404 atar; finans bunu "yok" (null) olarak alır.
    bag('sipariş özeti -> finans satış faturası', siparisOzetiCozucusu, siparisAyrintisi && (async (db: Db, id: number) => {
      try {
        const s = await siparisAyrintisi(db, id);
        return { durum: s.durum, firmaId: s.firmaId };
      } catch (h) {
        if (h instanceof UygulamaHatasi && h.durum === 404) return null;
        throw h;
      }
    })),
    bag('sevk işi özeti -> finans satış faturası', sevkIsiOzetiCozucusu, sevkiyat.sevkIsiOzeti),
    // 2642 b, 2646 a: siparişli faturanın genel gider oranı satın almanın satır yolundan (Mimar K1, çekme modeli).
    bag('fatura genel gider oranı -> finans genel gider önerisi', genelGiderOraniCozucusu, belgeGenelGiderOranlari),
    bag('sipariş sevkleri -> finans satış formu', satisSevkleriCozucusu, sevkiyat.siparisinSevkleri),
    // Satış formu firmanın onaylı ve kapanmış son 200 siparişini gösterir (iki durum ayrı sorgulanır, birlikte tarihe dizilir).
    bag('satış siparişleri -> finans satış formu', satisSiparisleriCozucusu, siparisListesi && (async (db: Db, firmaId: number) => {
      const satirlar = [];
      for (const durum of ['onayli', 'kapandi'] as const) {
        const sorgu = siparisListesiSorgusu.parse({ firmaId, durum, sayfaBoyu: 200, sirala: 'siparisTarihi', yon: 'azalan' });
        for (const s of (await siparisListesi(db, sorgu)).satirlar) {
          if (s.durum === 'onayli' || s.durum === 'kapandi') satirlar.push({ id: s.id, no: s.no, durum: s.durum, siparisTarihi: s.siparisTarihi, musteriSiparisNo: s.musteriSiparisNo });
        }
      }
      return satirlar.sort((a, b) => (a.siparisTarihi < b.siparisTarihi ? 1 : a.siparisTarihi > b.siparisTarihi ? -1 : b.id - a.id)).slice(0, 200);
    })),
    bag('açık zimmetler -> İK çıkış uyarısı', ik.acikZimmetCozucusu, idariIsler.kisilerinAcikZimmetleri),
    // Hazırlık durdurucuları (120-122 a, denetim #14): sahipler üretim emirlerini okur, durumları ters yönde bağlanır.
    bag('CNC kurulumu (iş emri) -> başlatma hazırlığı', uretimEmirleri.cncHazirlikCozucusu, cncKurulum.isEmriHazirlikDurumlari),
    bag('çizim revizyonu -> başlatma hazırlığı', uretimEmirleri.cizimHazirlikCozucusu, arkon.emirCizimDurumlari),
    bag('paket yayını -> hazırlık matrisi', uretimEmirleri.yayinHazirlikCozucusu, arkon.isEmriYayinDurumlari),
    // 3249-2 a: "Şablona da ekle" rota şablonuna yazar. 3494-3 a: ek madde emrin listesindedir, ayrı bağı yoktur.
    bag('emre gelen şablon -> adım durumu', uretimEmirleri.sablonOzetleyiciKaydet, emreGelenSablonOzetleri),
    bag('şablona da ekle -> rota şablonu', uretimEmirleri.sablonaEkleyiciKaydet, emreGelenSablonaAdimEkle),
    bag('rota revizyonu -> hazırlık uyarısı', uretimEmirleri.rotaHazirlikCozucusu, emirRotaHazirliklari),
    bag('aparat (rota adımı, stok) -> hazırlık uyarısı', uretimEmirleri.aparatHazirlikCozucusu, (db: Db, idler: readonly number[]) => isEmriAparatHazirliklari(db, idler, stok.malzemeStokDurumlari)),
    bag('açık tedarik (satın alma) -> adım durumu', uretimEmirleri.adimTedarikCozucusu, emirTedarikDurumlari),
    bag('ölçü aleti (rota adımı, kalibrasyon) -> hazırlık uyarısı', uretimEmirleri.olcuAletiHazirlikCozucusu, isEmriOlcuAletiHazirliklari),
    bag('girdi stoğu -> hazırlık uyarısı', uretimEmirleri.malzemeHazirlikCozucusu, stok.isEmriMalzemeHazirliklari),
    bag('takım ömrü -> hazırlık uyarısı', uretimEmirleri.takimHazirlikCozucusu, cncKurulum.isEmriTakimHazirliklari),
    bag('plandaki takım değişimi -> hazırlık uyarısı', uretimEmirleri.takimHazirlaCozucusu, (db: Db, idler: readonly number[]) => isEmriTakimHazirlaDurumlari(db, idler)),
    // Onaylı kapanışın dış maddeleri (1074 a): sahipler üretim emirlerini okur, çözücüleri ters yönde kaydedilir.
    bag('GKK özeti -> malzeme etiketi', gkkOzetiCozucusuKaydet, kaliteMerkezi.girisOzetleri),
    bag('ölçüm -> kapanış', uretimEmirleri.olcumKapanisCozucusu, kaliteMerkezi.kapanisOlcumDurumu),
    bag('NCR -> kapanış', uretimEmirleri.ncrKapanisCozucusu, kaliteMerkezi.kapanisNcrDurumu),
    bag('izlenebilirlik -> kapanış', uretimEmirleri.izlenebilirlikKapanisCozucusu, stok.kapanisIzlenebilirlikDurumu),
    bag('stok -> kapanış', uretimEmirleri.stokKapanisCozucusu, stok.kapanisStokDurumu),
    bag('sevkiyat -> kapanış', uretimEmirleri.sevkiyatKapanisCozucusu, sevkiyat.kapanisSevkiyatDurumu),
    // 2133-1 b ve 2133-4 a: firma ya da fabrika ayarı kaydedilince sevkiyat noktası açılır ya da eşitlenir.
    bag('firma değişti -> sevkiyat noktası', firmaDegistiDinle, sevkiyat.firmaDegistiYansit),
    bag('ayar değişti -> sevkiyat fabrika noktası', ayarDegistiDinle, sevkiyat.ayarDegistiYansit),
    // 2067 (3288-2): kayıt yazılınca klasörü aynı işlemde açılır ya da adı eşitlenir; klasör açılamazsa kayıt sürer (KK-8).
    bag('firma değişti -> ortak dosyalar müşteri klasörü', firmaDegistiDinle, (db: Db, o: { firmaId: number; kisiId: number }) => firmaEsitle(db, o.kisiId, o.firmaId)),
    bag('sipariş değişti -> ortak dosyalar sipariş klasörü', siparisDegistiDinle, (db: Db, o: { siparisId: number; kullanici: { id: number } }) => siparisEsitle(db, o.kullanici.id, o.siparisId)),
    bag('proje açıldı -> ortak dosyalar proje klasörü', projeler.projeAcildiDinle, (db: Db, o: { projeId: number; kisiId: number }) => projeEsitle(db, o.kisiId, o.projeId)),
    bag('proje değişti -> ortak dosyalar proje klasörü', projeler.projeDegistiDinle, (db: Db, o: { projeId: number; kisiId: number }) => projeEsitle(db, o.kisiId, o.projeId)),
    // 3315 madde 7: proje kartı kaydedilince Logo'nun reddettiği proje yeniden sıraya girer.
    bag('proje değişti -> Logo proje kartı', projeler.projeDegistiDinle, (db: Db, o: { projeId: number }) => logo.logoProjesiDegisti(db, o.projeId, new Date())),
    // 3468-1: aynı dosya uyarısı iki yönde; her kaynak yalnız kişinin gördüğü yeri verir.
    bag('ortak dosyalar kopyaları -> çizim merkezi aynı dosya uyarısı', cizimAyniDosyaKaynagiKaydet, ortakDosyalar.klasordekiYerler),
    bag('çizim kopyaları -> ortak dosyalar aynı dosya uyarısı', ortakDosyalar.ayniDosyaKaynagiKaydet, cizimdekiYerler),
    bag('mevcut kayıtlar -> ortak dosyalar toplu komut', ortakDosyalar.kayitKaynagiKaydet, mevcutKayitlar),
    bag('firma ve proje -> ortak dosyalar müşteri/proje seçimi', (f: () => ortakDosyalar.MusteriProjeKaynagi) => { ortakDosyalar.musteriProjeKaynagiKaydet(f()); }, ortakDosyalarMusteriProjeKaynagi),
    bag('ayar -> ortak dosyalar kalıcı silme dört göz', ortakDosyalar.silmeDortGozOkuyucuKaydet, (db: Db) => sistemAyariOku(db, 'ortak-dosyalar.silme-dort-goz')),
    bag('üretim emri dosyaları -> ortak dosyalar hazır liste', (f: () => ortakDosyalar.HazirSaglayici) => { ortakDosyalar.hazirSaglayiciKaydet('uretim-emri', f()); }, () => uretimEmriSaglayicisi()),
    bag('üretim kaydı dosyaları -> ortak dosyalar hazır liste', (f: () => ortakDosyalar.HazirSaglayici) => { ortakDosyalar.hazirSaglayiciKaydet('uretim-kaydi', f()); }, () => uretimEmriSaglayicisi(URETIM_EMRI_KAYNAKLARI, 'uretim-kaydi')),
    bag('plan dosyaları -> ortak dosyalar hazır liste', (f: () => ortakDosyalar.HazirSaglayici) => { ortakDosyalar.hazirSaglayiciKaydet('plan', f()); }, () => uretimEmriSaglayicisi(URETIM_EMRI_KAYNAKLARI, 'plan')),
    bag('satın alma siparişi dosyaları -> ortak dosyalar hazır liste', (f: () => ortakDosyalar.HazirSaglayici) => { ortakDosyalar.hazirSaglayiciKaydet('satin-alma-siparisi', f()); }, () => satinAlmaSaglayicisi()),
    // 2147: istasyona elle bildirim, o günkü istasyon atamasındaki kişilere (bildirim istasyonları ithal edemez: döngü).
    bag('makine OEE -> SmartES hesap karşılaştırması', smartesCoreOeeCozucusu, makineOeeleri),
    bag('istasyon kişileri -> bildirim yayını', bildirimIstasyonCozucusu, [aktifIstasyonlar, istasyondakiKisiler].every((f) => typeof f === 'function')
      ? async (db: Db) => {
        const sonuc: { id: number; ad: string; kisiIdleri: number[] }[] = [];
        for (const i of await aktifIstasyonlar(db)) sonuc.push({ id: i.id, ad: i.ad, kisiIdleri: (await istasyondakiKisiler(db, i.id)).map((k) => k.kisiId) });
        return sonuc;
      }
      : undefined),
    // 3397: bildirim e-postasının adresi İK'daki iş e-postası (İK bildirim'i ithal eder: döngü olmasın diye burada).
    bag('İK iş e-postası -> bildirim e-postası', bildirimEpostaAdresCozucusu, typeof ik.kisilerinIsEpostalari === 'function'
      ? (db: Db, kisiIdleri: readonly number[]) => ik.kisilerinIsEpostalari(db, kisiIdleri) : undefined),
    bag('sistem ayarları -> bildirim e-postası', bildirimEpostaAyarOkuyucusu, sistemAyariOku),
    bag('kurum logosu -> bildirim e-postası', bildirimEpostaLogoOkuyucusu, async (db) => (await kurumLogosuOku(db)).logo),
    // 2647 a, 2659: genel gider personel bileşenleri İK'dan; yalnız toplam, gerçek değerle (gizleme Finans'ta, 2652 a). Emilmeyen için
    // katılım üretim emirlerinden (İK onu ithal etmez).
    bag('İK dolaylı personel -> finans genel gider', dolayliPersonelCozucusu, typeof ik.dolayliPersonelToplamiYalnizHesapIcin === 'function'
      ? (db: Db, ay: string) => ik.dolayliPersonelToplamiYalnizHesapIcin(db, ay) : undefined),
    bag('İK emilmeyen doğrudan işçilik -> finans genel gider', emilmeyenDogrudanCozucusu,
      [ik.dogrudanEmilmeyenToplamiYalnizHesapIcin, uretimEmirleri.katilimSureleri].every((f) => typeof f === 'function')
        ? (db: Db, ay: string) => ik.dogrudanEmilmeyenToplamiYalnizHesapIcin(db, ay, uretimEmirleri.katilimSureleri) : undefined),
    bag('kart izleri -> malzemeler arşivi', kartIzleriCozucusu, kartIzleriTopla({
      'Değişiklik yönetimi': degisiklikKartIzleri, 'Finans': finansKartIzleri, 'İstasyonlar': istasyonKartIzleri, 'Markalama': markalamaKartIzleri,
      'Plan': planKartIzleri, 'Satın alma': satinAlmaKartIzleri, 'Rota': rotaKartIzleri, 'Siparişler': siparisKartIzleri,
      'CNC kurulum': cncKurulum.malzemeKartiIzleri, 'Kalite merkezi': kaliteMerkezi.malzemeKartiIzleri, 'Logo': logo.malzemeKartiIzleri,
      'Reçete-rota': receteRota.malzemeKartiIzleri, 'Sevkiyat': sevkiyat.malzemeKartiIzleri, 'Stok': stok.malzemeKartiIzleri,
      'Üretim emirleri': uretimEmirleri.malzemeKartiIzleri,
    })),
  ];
}

let kuruldu = false;

// Bir bağ eksikse hiçbiri kurulmaz ve hata atılır: yarım kablolu süreç olayı sessizce kaçırırdı; çağıran (sunucu, örnek veri,
// test ön yüklemesi) açılmaz.
export function kablola(baglar: readonly Bag[] = sunucununBaglari()): void {
  const eksikler = baglar.filter((b) => b.eksik).map((b) => b.ad);
  if (eksikler.length > 0) throw new Error(`Modüller arası bağ eksik: ${eksikler.join(', ')}`);
  if (kuruldu) return;
  kuruldu = true;
  for (const b of baglar) b.kur();
}
