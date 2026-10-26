import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { satisSevkleriCozucusu, satisSiparisleriCozucusu, sevkIsiOzetiCozucusu, siparisOzetiCozucusu } from './moduller/finans/disari.ts';
import * as arkon from './moduller/arkon/disari.ts';
import * as cncKurulum from './moduller/cnc-kurulum/disari.ts';
import * as idariIsler from './moduller/idari-isler/disari.ts';
import * as ik from './moduller/ik/disari.ts';
import * as kaliteMerkezi from './moduller/kalite-merkezi/disari.ts';
import * as logo from './moduller/logo/disari.ts';
import { musteriSiniflari } from './moduller/musteri-tedarikci/disari.ts';
import { acilSiparisOnaylandi, canliMakineAyrimlari, malzemeMaliyetiCozucusu, musteriSinifiCozucusu, planMotoruCozucusu, sunucuPlanCozucusu, tahminiMaliyetCozucusu, teklifDene } from './moduller/plan/disari.ts';
import { isEmriTahminiMaliyetleri, uretimEmriMalzemeMaliyetleri } from './moduller/proje-maliyet/disari.ts';
import { alimDinle, kaliteDurumuCozucusu, stokMiktariCozucusu, stokYokCozucusu } from './moduller/satin-alma/disari.ts';
import * as receteRota from './moduller/recete-rota/disari.ts';
import { rotaRevizyonlariCozucusu } from './moduller/malzemeler/disari.ts';
import { durumRevizyonlari, emirBittiYansit as rotaEmirBittiYansit } from './moduller/rota/disari.ts';
import * as sevkiyat from './moduller/sevkiyat/disari.ts';
import { siparisAyrintisi, siparisListesi, siparisOnaylandiDinle, teklifDenemeCozucusu } from './moduller/siparisler/disari.ts';
import { siparisListesiSorgusu } from '#paylasilan/sozlesme/siparisler.ts';
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

export function sunucununBaglari(): Bag[] {
  return [
    bag('emir açıldı -> stok', uretimEmirleri.emirAcildiDinle, stok.emirAcildiYansit),
    bag('sağlam sayım -> stok', uretimEmirleri.saglamSayimDinle, stok.uretimSayimiYansitUyarili),
    bag('hurda sayım -> stok', uretimEmirleri.hurdaSayimDinle, stok.hurdaSayimiYansit),
    bag('sağlam sayım -> takım ömrü', uretimEmirleri.saglamSayimDinle, cncKurulum.takimSayimiYansit),
    bag('hurda sayım -> takım ömrü', uretimEmirleri.hurdaSayimDinle, cncKurulum.takimSayimiYansit),
    bag('kalite kararı -> stok', uretimEmirleri.kaliteKarariDinle, stok.kaliteKarariYansit),
    bag('emir bitti -> stok', uretimEmirleri.emirBittiDinle, stok.emirBittiYansit),
    bag('emir iptal -> stok', uretimEmirleri.emirIptalDinle, stok.emirIptalYansit),
    bag('emir birleşti -> stok', uretimEmirleri.emirBirlestiDinle, stok.emirBirlestiYansit),
    bag('fason hareketi -> stok', uretimEmirleri.fasonHareketiDinle, stok.fasonHareketiYansit),
    bag('fason sevki -> stok', sevkiyat.fasonSevkiDinle, stok.fasonSevkiYansit),
    bag('ürün sevki -> stok', sevkiyat.urunSevkiDinle, stok.urunSevkiYansit),
    bag('adım statüsü çözücüsü -> stok', stok.adimStatusuCozucusu, receteRota.adimStatusu),
    bag('adım çıktısı çözücüsü -> stok', stok.adimCiktisiCozucusu, receteRota.adimCiktisi),
    bag('statü listesi -> stok', stok.statuListesiCozucusu, receteRota.receteRotaStatuleri),
    bag('rota revizyonları -> malzemeler', rotaRevizyonlariCozucusu, durumRevizyonlari),
    bag('emir bitti -> sevkiyat', uretimEmirleri.emirBittiDinle, sevkiyat.emirBittiYansit),
    bag('logo durumu -> stok malzeme fişi', stok.malzemeFisiLogoCozucusu, logo.malzemeFisiLogoDurumlari),
    bag('emir bitti -> rota gerçekleşen süre önerisi', uretimEmirleri.emirBittiDinle, rotaEmirBittiYansit),
    bag('fason hareketi -> sevkiyat', uretimEmirleri.fasonHareketiDinle, sevkiyat.fasonHareketiYansit),
    bag('stok yok istekleri -> satın alma', stokYokCozucusu, stok.stokYokIstekleri),
    bag('iş emri tahmini maliyeti -> plan', tahminiMaliyetCozucusu, isEmriTahminiMaliyetleri),
    bag('plan makine ayrımı -> üretim emirleri', uretimEmirleri.planAyrimiCozucusu, canliMakineAyrimlari),
    bag('üretim emri malzeme maliyeti -> plan', malzemeMaliyetiCozucusu, uretimEmriMalzemeMaliyetleri),
    bag('müşteri sınıfı -> plan', musteriSinifiCozucusu, musteriSiniflari),
    bag('sipariş onaylandı -> plan acil sipariş', siparisOnaylandiDinle, acilSiparisOnaylandi),
    bag('teklif denemesi -> siparişler (planlama motoru)', teklifDenemeCozucusu, teklifDene),
    // ADR 0018, 627 a: canlıya almada asıl planın son sözü ortak motordadır. Çözücü de plan modülündedir (ADR 0020); kayıt bağı kalkınca
    // plan servisi onu doğrudan çağırır (UYUM-BORCU P-B35).
    bag('plan motoru -> plan', planMotoruCozucusu, sunucuPlanCozucusu),
    bag('stok değer grupları -> satın alma kg stok değeri', stokMiktariCozucusu, stok.degerGrubuToplamlari),
    bag('alım -> sevkiyat', alimDinle, sevkiyat.alimYansit),
    bag('kalite onay durumu -> satın alma siparişi', kaliteDurumuCozucusu, kaliteMerkezi.tedarikciOnayDurumlari),
    bag('vardiya takvimi -> İK puantaj', ik.puantajTakvimCozucusu, vardiya.calismaTakvimleri),
    bag('vardiya aralıkları -> İK puantaj', ik.puantajAralikCozucusu, vardiya.basladigiGunTakvimleri),
    bag('vardiya tanımları -> İK kişi sayfası', ik.vardiyaTanimCozucusu, vardiya.vardiyaTanimlari),
    bag('vardiya matrisi -> İK kişi sayfası', ik.vardiyaMatrisCozucusu, vardiya.vardiyaMatrisi),
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
    bag('kalibrasyon -> başlatma hazırlığı', uretimEmirleri.kalibrasyonHazirlikCozucusu, kaliteMerkezi.kalibrasyonHazirlikDurumlari),
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
