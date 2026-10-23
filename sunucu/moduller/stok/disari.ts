import type { Db } from '#cekirdek/db.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { hareketlerSorgusu } from '#paylasilan/sozlesme/stok.ts';
import type { Hareket, KaliteDurumu, MalzemeIstegiAcGirdisi, MalzemeIstegiDurumu } from '#paylasilan/sozlesme/stok.ts';
import { stokDurumu, type StokDurumu } from './kurallar.ts';
import * as servis from './servis.ts';
import * as sorgular from './sorgular.ts';

// Malzeme başına stok: toplam, kullanılabilir (raf, kabul, depo zemini) ve üretim çıkış alanında bekleyen. Miktarlar numeric metin.
// Stoğu olmayan malzeme haritada yoktur (sıfır uydurulmaz).
export async function stokMiktarlari(db: Db, malzemeIdler: number[]): Promise<Map<number, { toplam: string; kullanilabilir: string; uretimde: string }>> {
  if (malzemeIdler.length === 0) return new Map();
  const satirlar = await sorgular.stokMiktarlari(db, [...new Set(malzemeIdler)]);
  return new Map(satirlar.map(({ malzemeId, ...m }) => [malzemeId, m]));
}

// Stok değeri kırılımı (228 a): malzeme ve değer grubu başına bakiye toplamı (numeric metin). Gruplar kullanilabilir (raf, kabul,
// zemin; statüsüz; serbest ya da şartlı, stokMiktarlari.kullanilabilir ile aynı), kalite (karantina, red, karar bekliyor), hurda, fason,
// yolda (sevkiyat dahil) ve diger (üretimde, ara alan, statülü yarı ürün). Fiyatı çağıran uygular; yetki denetlemez.
export type { DegerGrubu } from './kurallar.ts';
export const degerGrubuToplamlari = (db: Db) => sorgular.degerGrubuMalzemeToplamlari(db);
// Kalite Merkezi (229 a): lot numarası ya da üretim emriyle parti kimlikleri; ve partinin bütün bakiyesini hedef kaliteye geçiren karar
// (yoldaki teslime ayrılan miktar hariç; değişen satırlar döner). Çağıranın transaction'ında yürür; yetkiyi çağıran korur.
export const partileriBul = (db: Db, a: { lotNo?: string; uretimEmriId?: number }) => sorgular.partileriBul(db, a);
// Satır verilirse (320 a) yalnız o bakiyeler çevrilir; `karantinadanBirak` sonucunun `hedefKonumId`, `statuId`, `kaliteDurumu`, `miktar` alanları verilir.
export const partiKaliteDurumuYap = (db: Db, kisiId: number, g: Parameters<typeof servis.partiKaliteDurumuYap>[2]) =>
  servis.partiKaliteDurumuYap(db, kisiId, g);
// Denetim #15: karantinadaki partiyi serbest bırakma yalnız Kalite Merkezi'nin kararıyla; yetkiyi çağıran korur.
// 320 a: partilerin red bakiyeleri (karantinada ve yerinde), yoldaki ayrılan düşülmüş; önce karantina konumları. Salt okur.
export const partilerinRedBakiyeleri = (db: Db, partiIdler: readonly number[]) => servis.partilerinRedBakiyeleri(db, partiIdler);
export const karantinadanBirak = (db: Db, kisiId: number, g: Parameters<typeof servis.karantinadanBirak>[2]) => servis.karantinadanBirak(db, kisiId, g);
// Kalite Merkezi'nin serbest bırakma seçimi için konumlar ve karantina defterindeki hareketten partiye geçiş.
export const karantinaDisiKonumlar = (db: Db) => sorgular.karantinaDisiKonumlar(db);
export const hareketPartileri = (db: Db, hareketIdler: readonly number[]): Promise<Map<number, number>> => sorgular.hareketPartileri(db, hareketIdler);
// NCR'nin kapsamadığı red (ör. ilk parça reddi) olan parti NCR kapanışında serbest kalmasın diye: parti -> şu anki redi oluşturan giriş hareketleri.
export const partilerinRedGirisleri = (db: Db, partiIdler: readonly number[]): Promise<Map<number, number[]>> => sorgular.partilerinRedGirisleri(db, partiIdler);
// Etiket Merkezi: partinin ya da mal kabul belgesinin lot etiketleri (LotEtiketleriCevabi.etiketler biçimi); olmayan kayıt boş dizi.
export type { LotEtiketi } from '#paylasilan/sozlesme/stok.ts';
export const lotEtiketleri = (db: Db, a: { partiId: number } | { malKabulId: number }) => servis.lotEtiketleri(db, a);
// İstasyonun stok konumu (kimlik ve basılı kod); konumu açılmamış istasyon haritada yoktur. Boş dizide sorgu atılmaz.
export async function istasyonKonumlari(db: Db, istasyonIdler: readonly number[]): Promise<Map<number, { konumId: number; kod: string }>> {
  if (istasyonIdler.length === 0) return new Map();
  return new Map((await sorgular.istasyonKonumlari(db, istasyonIdler)).map((r) => [r.istasyonId, { konumId: r.konumId, kod: r.kod }]));
}
// Üretim emrine sarf olarak çıkan partiler (net: geri alınan düşülür). Parti izi emirden partiye okunur (DEP-25).
export const emrinPartileri = (db: Db, uretimEmriId: number) => sorgular.emrinPartileri(db, uretimEmriId);
// Proje maliyeti: emirlere verilmiş net sarf, emir ve malzeme başına (geri alınan düşülür) ve ilk sarf zamanı (ISO; sarf çıkışı yoksa null). Yetki denetlemez.
// 335: Logo'ya gidecek emir başına sarf ve üretimden giriş fişinin satırları (malzeme, stok kodu, birim, net miktar; düzeltme düşülmüş).
// Sarf, emre bağlı üretime sarf ve fire çıkışıdır (elle yollar dahil); hurda, sarfın içindeki fire payıdır (girdi biriminde). Salt okur.
export type { EmirFisSatiri } from './servis.ts';
export const emirMalzemeFisleri = (db: Db, emirIdler: readonly number[]) => servis.emirMalzemeFisleri(db, emirIdler);
export const emirlerinNetSarfi = (db: Db, emirIdler: readonly number[]) => sorgular.emirlerinNetSarfi(db, emirIdler);

// Akış süresi için emrin stok hareketleri (kart #1338): emrin kendi hareketleri, emrin partisinin hareketleri (statü çevirme,
// sevk çıkışı) ve emrin teslimlerinin hareketleri; zamana göre, tekrarsız. Okuma yetkisini çağıran korur.
export type { AkisHareketi } from './sorgular.ts';
export const emrinAkisHareketleri = (db: Db, uretimEmriId: number): Promise<sorgular.AkisHareketi[]> => sorgular.emrinAkisHareketleri(db, uretimEmriId);
// Partinin lot numarası ve ilk mal kabul zamanı (mal kabulle girmediyse null). Olmayan parti haritada yoktur.
export async function partiGirisZamanlari(db: Db, partiIdler: number[]): Promise<Map<number, { lotNo: string; malKabulZamani: string | null }>> {
  if (partiIdler.length === 0) return new Map();
  return new Map((await sorgular.partiGirisZamanlari(db, [...new Set(partiIdler)])).map(({ partiId, ...p }) => [partiId, p]));
}

// Malzemenin son tedarikçi partileri ve partiye bağlı sertifika belgeleri (Satın Alma > Malzemeler); parti yoksa boş dizi.
// Tarih partinin ilk kaydıdır. Belge Çizimler'de tutulur; dosyası Çizimler'in okuma ucundan verilir.
export const sonPartiler = (db: Db, malzemeId: number, sinir = 10) => servis.sonPartiler(db, malzemeId, Math.min(Math.max(1, sinir), 50));

// Kalıp: kisiAdlari. Boş dizide sorgu atılmaz; olmayan kimlik haritada yoktur; pasif konum da koduyla döner.
export async function konumAdlari(db: Db, idler: number[]): Promise<Map<number, string>> {
  if (idler.length === 0) return new Map();
  return new Map((await sorgular.konumKodlari(db, [...new Set(idler)])).map((k) => [k.id, k.kod]));
}

// Kartın toplamı, serbest (statüsüz) miktarı, kritik seviyesi (ilk sistemdeki "minimum") ve serbest miktara göre durumu: eksi, kritik,
// yeterli ya da seviye tanımsız. Statülü miktar üretimdeki yarı parçadır; kullanılabilir stok değildir.
// Bakiyesi ve ayarı olmayan kart haritada yoktur (sıfır uydurulmaz).
export async function malzemeStokDurumlari(db: Db, malzemeIdler: number[]): Promise<Map<number, { toplam: string; serbest: string; kritikSeviye: string | null; durum: StokDurumu }>> {
  if (malzemeIdler.length === 0) return new Map();
  const satirlar = await sorgular.malzemeToplamlari(db, [...new Set(malzemeIdler)]);
  return new Map(satirlar.map((x) => [x.malzemeId, { toplam: x.toplam, serbest: x.serbest, kritikSeviye: x.kritikSeviye, durum: stokDurumu(x.serbest, x.kritikSeviye) }]));
}
// Toplamı kritik seviyesinde ya da altında olan kart sayısı (stok paneliyle aynı sayı).
export const dusukStokSayisi = (db: Db): Promise<number> => sorgular.dusukStokSayisi(db);

// Üretimden (Arkon) malzeme isteği: çağıranın transaction'ında açılır. İşlemi (emri başlatan üretim işlemi) ve istasyon
// kapsamını stok denetler; ret UygulamaHatasi olarak çıkar. Aynı kaynak kimliğiyle ikinci çağrı ilk kaydı döner.
export const malzemeIstegiAc = (db: Db, kullanici: Kullanici, girdi: MalzemeIstegiAcGirdisi): Promise<{ id: number; no: string; durum: MalzemeIstegiDurumu }> =>
  servis.malzemeIstegiAc(db, kullanici, girdi);
// Kaynak kimliğine göre isteğin durumu ve karşılanan miktar (teslimden önce null). Bilinmeyen kimlik haritada yoktur.
// "Stok yok" çağırana açık görünür (kart #1208): istek depoda bekler; Arkon bu durumu bağlamada ayrıca gösterir.
export const malzemeIstekleri = async (db: Db, kaynakKimlikleri: string[]): Promise<Map<string, { id: number; no: string; durum: Exclude<MalzemeIstegiDurumu, 'stok_yok'>; miktar: string; karsilanan: string | null; guncelleme: string }>> =>
  new Map([...(await servis.malzemeIstekleriniOku(db, kaynakKimlikleri))].map(([k, i]) => [k, { ...i, durum: i.durum === 'stok_yok' ? 'acik' : i.durum }]));

// Stokta karşılanamayan (`stok_yok`) açık istekler, en eski önce (Satın Alma, kart #435); sınır 1-500. `malzemeIstekleri` bunları yine `acik` gösterir.
// Birim kartın birimidir (kart yoksa null); miktar numeric metin. Okuma yetkisini çağıran korur.
export const stokYokIstekleri = (db: Db, sinir = 100) => servis.stokYokIstekleri(db, sinir);

// En yeni stok hareketleri (en çok 200), yeniden eskiye; Reçete ve Rota bağlı durumu için (kart #1186). Okuma yetkisini çağıran korur.
export async function sonHareketler(db: Db, sinir = 100): Promise<Hareket[]> {
  const sayfaBoyu = Math.min(Math.max(1, Math.trunc(sinir)), 200);
  return (await servis.hareketListesi(db, hareketlerSorgusu.parse({ sayfa: 1, sayfaBoyu }))).satirlar;
}

// Üretim sayımının stoğa yansıması (kart #1289). Sağlam sayım yazılınca aynı transaction'da çağrılır: artış parçayı istasyonun
// konumuna sokar (önceki adımdan gelen parça adımın statüsüne geçer), azalış teslim edilen sayının altına inemez (UygulamaHatasi,
// alan saglamAdet). Yetki denetlemez.
export type { AdimStatusuCozucusu, UretimSayimiYansimasi } from './servis.ts';
export const uretimGirdiUyarisi = (db: Db, g: Parameters<typeof servis.uretimGirdiUyarisi>[1]): Promise<string | null> => servis.uretimGirdiUyarisi(db, g);
export const uretimSayimiYansit = (db: Db, g: servis.UretimSayimiYansimasi): Promise<void> => servis.uretimSayimiYansit(db, g);
// İlk parça kararı (131 b): emrin karar bekleyen parçası serbest ya da red olur.
export const kaliteKarariYansit = (db: Db, g: servis.KaliteKarariYansimasi): Promise<void> => servis.kaliteKarariYansit(db, g);
// Hurda sayımının girdisi: hurdaya ayrılan parçanın HM'si istasyondaki emrin stoğundan fire çıkışıyla düşer; eksi fark geri alır. Yetki denetlemez.
export type { HurdaSayimiYansimasi } from './servis.ts';
export const hurdaSayimiYansit = (db: Db, g: servis.HurdaSayimiYansimasi): Promise<void> => servis.hurdaSayimiYansit(db, g);
// Emrin istasyondan teslim edilen miktarı (yoldaki ve alınan); istasyondan hiç teslim olmadıysa null.
// Arkon'dan operatörün gönderdiği numune (karar 115 a, 125 a): teslim kaydı; engel değildir, yazılamazsa neden döner.
export type { NumuneTeslimi, NumuneTeslimSonucu } from './servis.ts';
export const numuneTeslimi = (db: Db, g: servis.NumuneTeslimi): Promise<servis.NumuneTeslimSonucu> => servis.numuneTeslimi(db, g);
export const istasyondanTeslimEdilen = (db: Db, g: { uretimEmriId: number; istasyonId: number }): Promise<string | null> => servis.istasyondanTeslimEdilen(db, g);
// Reçete ve Rota başlangıçta adımın statüsünü çözen işlevi kaydeder (stok onu ithal edemez). Son ve statüsüz adımda null döner.
export const adimStatusuCozucusu = (cozucu: servis.AdimStatusuCozucusu): void => servis.adimStatusuCozucusuKaydet(cozucu);
// Reçete ve Rota adımın çıktı kartını (ara adımda parçanın dönüştüğü kart) çözen işlevi kaydeder; çıktısız adımda null döner.
export const adimCiktisiCozucusu = (cozucu: servis.AdimStatusuCozucusu): void => servis.adimCiktisiCozucusuKaydet(cozucu);
// Reçete ve Rota statü listesini veren işlevi kaydeder; stok bunu `GET /stok/statuler` ucundan stok okuyanlara sunar.
export const statuListesiCozucusu = (cozucu: servis.StatuListesiCozucusu): void => servis.statuListesiCozucusuKaydet(cozucu);
// Ters yöndeki haberlerin karşılığı: uretim-emirleri ve sevkiyat stoğu ithal edemez; bağı sunucu/kablolama.ts kurar. Olay komutla
// aynı işlemde gelir; stoğun reddi komutu da geri alır.
export { emirAcildiYansit, emirBirlestiYansit, emirBittiYansit, emirIptalYansit, fasonHareketiYansit, fasonSevkiYansit, urunSevkiYansit } from './servis.ts';
// Refakat partisi (kart #123): Arkon kart QR'ından (`RP:<id>`) emri ve partiyi okur. Yoksa null; yetki denetlemez, çağıran korur.
// Birleşmiş kolun kartı birleştiği kartı döndürür (kart #126).
export interface RefakatPartisiOzeti {
  id: number; uretimEmriId: number; etiket: string; qr: string; durum: 'acik' | 'iptal';
  // Depodan verilen lot (Etiket Merkezi kartın lot satırını basar, kart #127).
  lotNo: string; tedarikciPartiNo: string | null; dokumNo: string | null; sertifikaNo: string | null;
}
// Emrin kartları (Arkon kart listesi, kart #156): açık ve birleşmemiş kartlar sırayla; istisna kartı lotsuz gelir. istasyondaSatirVar,
// kartın malzemesi verilen istasyonda duruyor mu. sayilan ve sinir (Soru 132) hesaplanana kadar null; null'da sınır gösterilmez.
export interface RefakatKartiOzeti {
  id: number; etiket: string; qr: string; durum: 'acik' | 'iptal'; lotNo: string | null;
  malzemeKod: string | null; malzemeAd: string | null; birim: string | null; verilen: string;
  istasyondaSatirVar: boolean; sayilan: number | null; sinir: number | null;
}
export async function emrinRefakatKartlari(db: Db, uretimEmriId: number, istasyonId: number | null): Promise<RefakatKartiOzeti[]> {
  const { partiler } = await servis.emrinRefakatPartileri(db, uretimEmriId);
  const acik = partiler.filter((r) => r.durum === 'acik' && r.birlestigi === null);
  const burada = istasyonId === null ? new Set<number>() : await sorgular.istasyondaSatiriOlanKartlar(db, acik.map((r) => r.id), istasyonId);
  return acik.map((r) => ({
    id: r.id, etiket: r.etiket, qr: r.qr, durum: r.durum, lotNo: r.lotNo, malzemeKod: r.malzemeKod, malzemeAd: r.malzemeAd, birim: r.birim, verilen: r.verilen,
    istasyondaSatirVar: burada.has(r.id), sayilan: null, sinir: null,
  }));
}
// Lot bekleyen (istisna) kart da null döner: lotsuz kartla iş açılmaz ve lot satırı basılmaz (Soru 129; Etiket Merkezi isteği BASKA-MODUL-ISTEKLERI'nde).
export async function refakatPartisi(db: Db, id: number): Promise<RefakatPartisiOzeti | null> {
  const r = await sorgular.etkinRefakatPartisiBul(db, id);
  if (r === null) return null;
  const { refakat } = await servis.refakatPartisiOku(db, r.id);
  if (refakat.lotNo === null) return null;
  return {
    id: refakat.id, uretimEmriId: refakat.uretimEmriId, etiket: refakat.etiket, qr: refakat.qr, durum: refakat.durum,
    lotNo: refakat.lotNo, tedarikciPartiNo: refakat.tedarikciPartiNo, dokumNo: refakat.dokumNo, sertifikaNo: refakat.sertifikaNo,
  };
}
