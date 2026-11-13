import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { ayarDegistiDinle } from './moduller/ayarlar/disari.ts';
import { dolayliPersonelCozucusu, emilmeyenDogrudanCozucusu, genelGiderOraniCozucusu, projeMasrafiCozucusu, satisSevkleriCozucusu, satisSiparisleriCozucusu, sevkIsiOzetiCozucusu, siparisOzetiCozucusu, stokCikisiCozucusu } from './moduller/finans/disari.ts';
import * as arkon from './moduller/arkon/disari.ts';
import * as atolye from './moduller/atolye/disari.ts';
import * as cncKurulum from './moduller/cnc-kurulum/disari.ts';
import { gkkOzetiCozucusuKaydet } from './moduller/etiket-merkezi/disari.ts';
import { malzemeKartiIzleri as degisiklikKartIzleri, yururluktekiParcaRevizyonlari } from './moduller/degisiklik-yonetimi/disari.ts';
import { malzemeKartiIzleri as finansKartIzleri } from './moduller/finans/disari.ts';
import { aktifIstasyonlar, istasyondakiKisiler, malzemeKartiIzleri as istasyonKartIzleri } from './moduller/istasyonlar/disari.ts';
import { istasyonAcildiDinle, istasyonSilinecekDinle } from './moduller/istasyonlar/disari.ts';
import { istasyonCozucusuKaydet as bildirimIstasyonCozucusu } from './moduller/bildirim/disari.ts';
import { malzemeKartiIzleri as markalamaKartIzleri } from './moduller/markalama/disari.ts';
import * as idariIsler from './moduller/idari-isler/disari.ts';
import * as ik from './moduller/ik/disari.ts';
import * as kaliteMerkezi from './moduller/kalite-merkezi/disari.ts';
import * as logo from './moduller/logo/disari.ts';
import * as projeler from './moduller/projeler/disari.ts';
import { acilSiparisOnaylandi, bakimCozucusu as planBakimCozucusu, bayatAdimBittiYansit, bayatEmirBittiYansit, bayatEmirIptalYansit, bayatFasonHareketiYansit, bayatIsEmirleriDegistiYansit, canliMakineAyrimlari, canliPaylar, canliPlan, malzemeKartiIzleri as planKartIzleri, malzemeMaliyetiCozucusu, planMotoruCozucusu, sunucuPlanCozucusu, tahminiMaliyetCozucusu, teklifDene } from './moduller/plan/disari.ts';
import { isEmriTahminiMaliyetleri, projedeSayilanBelgeler, uretimEmriMalzemeMaliyetleri } from './moduller/proje-maliyet/disari.ts';
import { alimDinle, belgeGenelGiderOranlari, emirTedarikDurumlari, kaliteDurumuCozucusu, malzemeKartiIzleri as satinAlmaKartIzleri, parcaRevizyonuCozucusu as siparisParcaRevizyonuCozucusu, fasonKonumuCozucusu, planlananGidisCozucusu, stokMiktariCozucusu, stokYokCozucusu, tuketimSerisiCozucusu } from './moduller/satin-alma/disari.ts';
import * as receteRota from './moduller/recete-rota/disari.ts';
import {
  logoAcilisCozucusu, logoAynaOzetiCozucusu, logoBirimSetiCozucusu, logoEslemeYaziciCozucusu, logoKartAynasiCozucusu, logoKodCozucusu, logoTmiKodCozucusu, rotaRevizyonlariCozucusu, kartIzleriCozucusu,
} from './moduller/malzemeler/disari.ts';
import { firmaDegistiDinle, logoCariCozuculeriKaydet } from './moduller/musteri-tedarikci/disari.ts';
import { araHalCozucusuKaydet as rotaAraHalCozucusu, durumRevizyonlari, emirBittiYansit as rotaEmirBittiYansit, adimBittiYansit as rotaAdimBittiYansit, emirRotaHazirliklari, isEmriAparatHazirliklari, isEmriKopyalandiYansit, isEmriOlcuAletiHazirliklari, malzemeKartiIzleri as rotaKartIzleri, yuzeyIslemiAdimlari } from './moduller/rota/disari.ts';
import { yuzeyAdimlariCozucusu } from './moduller/geometri/disari.ts';
import * as sevkiyat from './moduller/sevkiyat/disari.ts';
import { bagliEmirCozucusu, malzemeKartiIzleri as siparisKartIzleri, siparisAyrintisi, siparisListesi, siparisOnaylandiDinle, teklifDenemeCozucusu } from './moduller/siparisler/disari.ts';
import { siparisListesiSorgusu } from '#paylasilan/sozlesme/siparisler.ts';
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
export function bag<T>(ad: string, kur: ((karsilik: T) => unknown) | undefined, karsilik: T | undefined): Bag {
  return {
    ad,
    eksik: typeof kur !== 'function' || typeof karsilik !== 'function',
    kur: () => { kur!(karsilik!); },
  };
}

// 2118: cari okuması uçta transaction dışında koşar (köprü 60 sn bekleyebilir); logonun ayar okuması aynı bağlantıyı kullanır.
const cariAra = (db: Db, metin: string) => logo.logodaCariAra({ tx: (f) => f(db) }, metin);
const cariOku = (db: Db, kod: string) => logo.logodanCariOku({ tx: (f) => f(db) }, kod);

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
    bag('bölüm açıldı -> stok deposu', atolye.bolumAcildiDinle, stok.bolumAcildiYansit),
    bag('istasyon açıldı -> stok konumu', istasyonAcildiDinle, stok.istasyonAcildiYansit),
    bag('istasyon silinecek -> kullanılmamış stok konumu', istasyonSilinecekDinle, stok.istasyonSilinecekYansit),
    bag('adım çıktısı çözücüsü -> stok', stok.adimCiktisiCozucusu, receteRota.adimCiktisi),
    bag('ara hal çözücüsü -> rota önizlemesi', rotaAraHalCozucusu, receteRota.adimAraHalleri),
    bag('statü listesi -> stok', stok.statuListesiCozucusu, receteRota.receteRotaStatuleri),
    bag('parça revizyonu -> stok partisi', stok.parcaRevizyonuCozucusu, yururluktekiParcaRevizyonlari),
    bag('parça revizyonu -> sipariş satırı', siparisParcaRevizyonuCozucusu, yururluktekiParcaRevizyonlari),
    bag('rota revizyonları -> malzemeler', rotaRevizyonlariCozucusu, durumRevizyonlari),
    bag('rota yüzey adımları -> geometri yüzey işaretleri', yuzeyAdimlariCozucusu, yuzeyIslemiAdimlari),
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
    // 2319 (2311 S7, S10): saha olayı canlı planı bayat işaretler (plan değişmez); Arkon periyodik bakımı plan girdisine duruş olarak girer.
    bag('emir bitti -> plan bayat işareti', uretimEmirleri.emirBittiDinle, bayatEmirBittiYansit),
    bag('fason hareketi -> plan bayat işareti', uretimEmirleri.fasonHareketiDinle, bayatFasonHareketiYansit),
    bag('adım bitti -> plan bayat işareti', uretimEmirleri.adimBittiDinle, bayatAdimBittiYansit),
    bag('iş emirleri değişti -> plan bayat işareti', uretimEmirleri.isEmirleriDegistiDinle, bayatIsEmirleriDegistiYansit),
    bag('emir iptal -> plan bayat işareti', uretimEmirleri.emirIptalDinle, bayatEmirIptalYansit),
    bag('periyodik bakım -> plan girdisi', planBakimCozucusu, arkon.periyodikBakimlar),
    bag('teklif denemesi -> siparişler (planlama motoru)', teklifDenemeCozucusu, teklifDene),
    // 2103-2 b: satıra bağlı emirlere siparişten açılan projelerin emirleri eklenir (iş emri olmayan emir proje okumasında yoktur).
    bag('bağlı emirler -> sipariş iptali', bagliEmirCozucusu, uretimEmirleri.siparisSatirlarininEmirleri && projeler.siparisinProjeleri && (async (
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
      return [...emirler.values()];
    })),
    // ADR 0018, 627 a: canlıya almada asıl planın son sözü ortak motordadır. Çözücü de plan modülündedir (ADR 0020); kayıt bağı kalkınca
    // plan servisi onu doğrudan çağırır (UYUM-BORCU P-B35).
    bag('plan motoru -> plan', planMotoruCozucusu, sunucuPlanCozucusu),
    bag('stok değer grupları -> satın alma kg stok değeri', stokMiktariCozucusu, stok.degerGrubuToplamlari),
    bag('stok tüketim serisi -> satın alma analizi', tuketimSerisiCozucusu, stok.tuketimSerisi),
    bag('alım -> sevkiyat', alimDinle, sevkiyat.alimYansit),
    bag('kalite onay durumu -> satın alma siparişi', kaliteDurumuCozucusu, kaliteMerkezi.tedarikciOnayDurumlari),
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
    bag('ek hazırlık maddesi -> hazırlık matrisi', uretimEmirleri.ekMaddeHazirlikCozucusu, arkon.isEmriEkMaddeDurumlari),
    bag('rota revizyonu -> hazırlık uyarısı', uretimEmirleri.rotaHazirlikCozucusu, emirRotaHazirliklari),
    bag('aparat (rota adımı, stok) -> hazırlık uyarısı', uretimEmirleri.aparatHazirlikCozucusu, (db: Db, idler: readonly number[]) => isEmriAparatHazirliklari(db, idler, stok.malzemeStokDurumlari)),
    bag('açık tedarik (satın alma) -> adım durumu', uretimEmirleri.adimTedarikCozucusu, emirTedarikDurumlari),
    bag('ölçü aleti (rota adımı, kalibrasyon) -> hazırlık uyarısı', uretimEmirleri.olcuAletiHazirlikCozucusu, isEmriOlcuAletiHazirliklari),
    bag('girdi stoğu -> hazırlık uyarısı', uretimEmirleri.malzemeHazirlikCozucusu, stok.isEmriMalzemeHazirliklari),
    bag('takım ömrü -> hazırlık uyarısı', uretimEmirleri.takimHazirlikCozucusu, cncKurulum.isEmriTakimHazirliklari),
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
    // 2147: istasyona elle bildirim, o günkü istasyon atamasındaki kişilere (bildirim istasyonları ithal edemez: döngü).
    bag('istasyon kişileri -> bildirim yayını', bildirimIstasyonCozucusu, [aktifIstasyonlar, istasyondakiKisiler].every((f) => typeof f === 'function')
      ? async (db: Db) => {
        const sonuc: { id: number; ad: string; kisiIdleri: number[] }[] = [];
        for (const i of await aktifIstasyonlar(db)) sonuc.push({ id: i.id, ad: i.ad, kisiIdleri: (await istasyondakiKisiler(db, i.id)).map((k) => k.kisiId) });
        return sonuc;
      }
      : undefined),
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
