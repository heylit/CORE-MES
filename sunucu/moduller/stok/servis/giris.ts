import { type Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, gecersiz } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import type { DenetimSecimi } from '#cekirdek/uc.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type {
  AcikSiparisSatirlariCevabi, KaliteDurumu, HareketCevabi, MalKabulAyrintiCevabi, MalKabulCevabi, MalKabulDuzeltKomutu, MalKabulKomutu, MalKabullerListesi, MalKabulOzeti, UretimGirisiKomutu,
} from '#paylasilan/sozlesme/stok.ts';
import { belgeAcVeBagla, kaydaBagla } from '../../belge-merkezi/disari.ts';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { gkkGerekenKartlar, malzemeKullanilabilirMi, malzemeOzeti, malzemeOzetleri, sktTakipliKartlar } from '../../malzemeler/disari.ts';
import { siparisSatirlari, siparisSatirlarininEmri, teslimGeriAl, teslimIsle } from '../../satin-alma/disari.ts';
import { depoKabulunuGeriAl } from '../../sevkiyat/disari.ts';
import { projeAdlari } from '../../projeler/disari.ts';
import { uretimEmriOzeti, emirDugumleri, emirlerinProjeleri, isEmriOzetleri, kapanisSonuclari } from '../../uretim-emirleri/disari.ts';
import {
  binde, bindenMetin, duzeltmeEngeli, partiDenetimi, partiEtiketi, partiGereksinimi, stoklanirMi, siparisBagiEngeli, siparisMalzemeEngeli, malKabulSatirTuru, fasonDonusKonumuEngeli,
  karantinaYokIletisi, gkkGirisKonumuEngeli, malKabulKonumuEngeli, girisKontroluDuzeltmeEngeli, uretimGirisiEngeli, uretimGirisiDurumEngeli, uretimGirisiHedefi,
  uretimGirisiKartEngeli, uretimGirisiKesirEngeli, sktGirisEngeli, revizyonUyusmuyor,
} from '../kurallar.ts';
import type { MalzemeTuru } from '../kurallar.ts';
import * as sorgular from '../sorgular.ts';
import { fasonIsindenDonus, sevkKalemiKabulu } from './dis-akis.ts';
import { kaynakPartisi, dusumDenetle, kaliteDegistir, partiKaliteDurumuYap, karantinadanBirak, tersCevir } from './hareket.ts';
import { belgeNo, partiBulVeyaAc, yururluktekiRevizyonlar, korumali, adlar, emirNoDe, emirNoHaritasi, aktifKonum, varsayilanKonum, bakiyeDegistir, siraliKilitle, hareket } from './ortak.ts';
import { karantinaEksigiNedeni } from './depo.ts';
import { partiBelgeleri } from './pano.ts';
import { emirVarDenetle, bekleyenlereDagit } from './uretim.ts';
import { baslangicAyrintisi } from './baslangic.ts';

// ---- Mal kabul (DEP-10, DEP-20, DEP-38, DEP-39) ---------------------------------------------------------------------------------
// Denetim eki komutta bir kez yazılır: satırların sertifika bağları burada toplanır, komut sonunda tek ek olur.
type DenetimDefteri = DenetimSecimi[];
async function malKabulSatirlariniYaz(
  db: Db, malKabulId: number, tur: string, satirlar: MalKabulKomutu['satirlar'], k: Kullanici, eksiOnay: boolean, denetim: DenetimDefteri,
): Promise<number[]> {
  const kisiId = k.id;
  const kabul = await varsayilanKonum(db, 'KABUL');
  const idler: number[] = [];
  for (const [i, s] of satirlar.entries()) {
    // Düzeltmede sıfır miktarlı satır o kalemin hiç gelmediğidir: yazılmaz (yalnız düzeltme gövdesi sıfıra izin verir).
    if (binde(s.miktar) === 0n) continue;
    const alan = `satirlar.${i}`;
    const malzemeId = Number(s.malzemeId);
    const o = await malzemeOzeti(db, malzemeId);
    if (!o) throw dogrulama('Malzeme kartı bulunamadı.', `${alan}.malzemeId`);
    if (!(await malzemeKullanilabilirMi(db, malzemeId))) throw gecersiz(`${o.ad ?? o.kod}: kart kullanılabilir değil; mal kabul yapılamaz.`);
    const siparisSatirId = s.siparisSatirId === undefined ? null : Number(s.siparisSatirId);
    const bagEngeli = siparisBagiEngeli(tur, siparisSatirId);
    if (bagEngeli) throw dogrulama(bagEngeli, `${alan}.siparisSatirId`);
    const [ss] = siparisSatirId === null ? [] : await siparisSatirlari(db, [siparisSatirId]);
    const siparisKarti = ss?.malzemeNo == null ? null : await malzemeOzeti(db, ss.malzemeNo);
    const satirTuru = malKabulSatirTuru({
      malzemeTuru: o.tur, siparisMalzemeTuru: siparisKarti?.tur ?? null, siparisVar: siparisSatirId !== null, fasonVar: s.fason !== undefined || s.fasonIsi !== undefined,
      konumVar: s.konumId !== undefined, partiVar: s.partiId !== undefined || !!(s.parti && (s.parti.tedarikciPartiNo || s.parti.dokumNo || s.parti.sertifikaNo)),
    });
    if ('hata' in satirTuru) throw dogrulama(`${o.ad ?? o.kod}: ${satirTuru.hata}`, `${alan}.${satirTuru.alan}`);
    // Fasonda satırın kartı dönen malzemedir; sipariş hizmet kartınadır (KD-009 karşılaştırması stok ve saf hizmet satırında).
    if (satirTuru.tur !== 'fason' && ss) {
      const malzemeEngeli = siparisMalzemeEngeli(malzemeId, ss.malzemeNo);
      if (malzemeEngeli) throw dogrulama(malzemeEngeli, `${alan}.siparisSatirId`);
    }
    const miktar = bindenMetin(binde(s.miktar));
    if (satirTuru.tur === 'hizmet') {
      if (s.sertifika) throw dogrulama(SERTIFIKA_PARTISIZ, `${alan}.sertifika`);
      const satirId = await korumali(() => sorgular.malKabulSatiriYaz(db, { malKabulId, sira: i + 1, malzemeId, miktar, partiId: null, konumId: null, hareketId: null, siparisSatirId, fasonCikisHareketId: null }));
      await teslimIsle(db, k, { siparisSatirId: siparisSatirId!, miktar, malKabulSatirId: satirId });
      await sevkKalemiKabulu(db, kisiId, s, alan, satirId);
      continue;
    }
    if (s.fasonIsi !== undefined) {
      if (s.fason !== undefined) throw dogrulama('Fason işinden dönüşte giden kart ayrıca seçilmez; giden, işin parçasıdır.', `${alan}.fason`);
      if (s.partiId !== undefined || s.parti || s.ambalaj || s.sertifika) throw dogrulama('Fason işinden dönen parça emrin parçasıdır; parti, ambalaj ve sertifika girilmez.', `${alan}.parti`);
      const konumId = s.konumId === undefined ? await sorgular.ilkKarantinaKonumu(db) : Number(s.konumId);
      if (konumId === null) throw dogrulama(karantinaYokIletisi(await karantinaEksigiNedeni(db), 'fason'), `${alan}.konumId`);
      const konum = await aktifKonum(db, konumId, `${alan}.konumId`);
      const karantina = fasonDonusKonumuEngeli(konum.tur);
      if (karantina) throw dogrulama(karantina, `${alan}.konumId`);
      const giren = await korumali(() => fasonIsindenDonus(db, kisiId, { isEmriId: Number(s.fasonIsi!.isEmriId), malzemeId, adet: binde(s.miktar), konumId, alan }));
      const satirId = await korumali(() => sorgular.malKabulSatiriYaz(db, { malKabulId, sira: i + 1, malzemeId, miktar: bindenMetin(giren.miktar), partiId: null, konumId, hareketId: giren.hareketId, siparisSatirId, fasonCikisHareketId: null }));
      idler.push(giren.hareketId);
      if (siparisSatirId !== null) await teslimIsle(db, k, { siparisSatirId, miktar: bindenMetin(giren.miktar), malKabulSatirId: satirId });
      await sevkKalemiKabulu(db, kisiId, s, alan, satirId);
      continue;
    }
    const fason = satirTuru.tur === 'fason' ? await fasonGideni(db, s.fason!, miktar, `${alan}.fason`) : null;
    const partiId = s.partiId === undefined ? undefined : Number(s.partiId);
    const hata = partiDenetimi(o.tur as MalzemeTuru, 'mal_kabul', { parti: s.parti ?? null, partiId });
    if (hata) throw dogrulama(hata, `${alan}.parti`);
    // 1246 (1247 d, 1251): kartı GKK isteyen satın alma lotu karantinaya karar bekliyor girer; kararı giriş kontrolü verir.
    const gkk = tur === 'satin_alma' && satirTuru.tur === 'stok' && (await gkkGerekenKartlar(db, [malzemeId])).has(malzemeId);
    const konumId = s.konumId !== undefined ? Number(s.konumId) : gkk ? await sorgular.ilkKarantinaKonumu(db) : kabul;
    if (konumId === null) throw dogrulama(karantinaYokIletisi(await karantinaEksigiNedeni(db), 'gkk'), `${alan}.konumId`);
    const konum = await aktifKonum(db, konumId, `${alan}.konumId`);
    const gkkEngeli = gkk ? gkkGirisKonumuEngeli(konum.tur) : malKabulKonumuEngeli(konum.tur);
    if (gkkEngeli) throw dogrulama(gkkEngeli, `${alan}.konumId`);
    const kalite: KaliteDurumu = gkk ? 'karar_bekliyor' : 'serbest';
    let parti: number | null = partiId ?? null;
    // 2099-3 b: SKT takipli kartın satırı tarihle gelir ve lot açar (tarih lota yazılır).
    const sonKullanma = s.sonKullanma ?? null;
    const sktTakipli = satirTuru.tur !== 'fason' && (await sktTakipliKartlar(db, [malzemeId])).has(malzemeId);
    const sktEngeli = sktGirisEngeli({ takipli: sktTakipli, sonKullanma, lotunki: parti === null ? null : await sorgular.partiSonKullanma(db, parti) });
    if (sktEngeli) throw dogrulama(`${o.ad ?? o.kod}: ${sktEngeli}`, `${alan}.sonKullanma`);
    // Lotlu türde numarasız satır da parti açar (#1018); sarfta parti yalnız numara girilince açılır.
    const lotlu = partiGereksinimi(o.tur as MalzemeTuru, 'mal_kabul') === 'lot';
    if (parti === null && (lotlu || sonKullanma !== null || (s.parti && (s.parti.tedarikciPartiNo || s.parti.dokumNo)))) {
      const p = s.parti;
      parti = await korumali(() => partiBulVeyaAc(db, { malzemeId, tedarikciPartiNo: p?.tedarikciPartiNo ?? null, dokumNo: p?.dokumNo ?? null, sertifikaNo: p?.sertifikaNo ?? null, uretimEmriId: null, kisiId }, ss?.parcaRevizyonu ?? null));
    }
    if (s.sertifika && parti === null) throw dogrulama(SERTIFIKA_PARTISIZ, `${alan}.sertifika`);
    if (sonKullanma !== null && parti === null) throw dogrulama('Son kullanma tarihi lota yazılır; bu satır lot açmıyor.', `${alan}.sonKullanma`);
    if (sonKullanma !== null && parti !== null) {
      // Aynı tedarikçi parti no'suyla var olan lota eklenen satırın tarihi lotunkiyle aynı olmalı.
      const lotunki = await sorgular.partiSonKullanma(db, parti);
      const ayni = sktGirisEngeli({ takipli: sktTakipli, sonKullanma, lotunki });
      if (ayni) throw dogrulama(`${o.ad ?? o.kod}: ${ayni}`, `${alan}.sonKullanma`);
      if (lotunki === null) await sorgular.partiSonKullanmaYaz(db, { partiId: parti, sonKullanma, kisiId });
    }
    // Kalite kararı partiye verilir; GKK kartı lotsuz türde olamaz (malzemeler kuralı), bu yalnız savunmadır.
    if (gkk && parti === null) throw dogrulama('Giriş kalite kontrolü isteyen satır lotla girer.', `${alan}.parti`);
    const a = s.ambalaj ?? null;
    const yazilan = await korumali(async () => {
      const id = await sorgular.hareketYaz(db, hareket({
        tur: 'giris', malzemeId, miktar, kisiId, partiId: parti, partiSecimi: parti === null ? null : 'giris', hedefKonumId: konumId, girisKaynagi: 'mal_kabul',
        hedefKaliteDurumu: gkk ? kalite : null,
      }));
      await bakiyeDegistir(db, {
        malzemeId, konumId, partiId: parti, kaliteDurumu: kalite, fark: binde(miktar),
        ambalaj: a ? { tur: a.tur, olcu: a.olcu, uzunluk: a.ozelOlcu?.uzunlukCm ?? null, genislik: a.ozelOlcu?.genislikCm ?? null, yukseklik: a.ozelOlcu?.yukseklikCm ?? null, adet: a.adet ?? null } : null,
      });
      const fasonCikisHareketId = fason ? await fasonCikisiYaz(db, kisiId, fason, eksiOnay) : null;
      const satirId = await sorgular.malKabulSatiriYaz(db, { malKabulId, sira: i + 1, malzemeId, miktar, partiId: parti, konumId, hareketId: id, siparisSatirId, fasonCikisHareketId });
      return { id, satirId, fasonCikisHareketId };
    });
    if (s.sertifika && parti !== null) {
      const ad = `Sertifika ${s.parti?.sertifikaNo ?? s.parti?.dokumNo ?? s.parti?.tedarikciPartiNo ?? `P-${parti}`} (${o.kod})`;
      const belgeId = await belgeAcVeBagla(db, k, { ad, tur: 'sertifika', ozet: s.sertifika.ozet, dosyaAdi: s.sertifika.dosyaAdi }, 'stok', parti, (x) => { denetim.push(...x); });
      // Satın alma sertifikayı sipariş satırından da görür (kullanıcı isteği 13.10, #1026).
      if (siparisSatirId !== null) await kaydaBagla(db, k, belgeId, 'satin-alma', siparisSatirId);
    }
    // SH1 a: teslim satın almaya aynı işlemde yazılır; kalanı aşan miktar reddedilmez, satın almada fazla teslim görünür.
    if (siparisSatirId !== null) await teslimIsle(db, k, { siparisSatirId, miktar, malKabulSatirId: yazilan.satirId });
    await sevkKalemiKabulu(db, kisiId, s, alan, yazilan.satirId);
    idler.push(yazilan.id, ...(yazilan.fasonCikisHareketId === null ? [] : [yazilan.fasonCikisHareketId]));
  }
  return idler;
}
// Fasona giden yarı mamul: fason konumunda durur (oraya taşımayla gider); dönüşte o konumdan düşülür.
interface FasonGideni { malzemeId: number; konumId: number; partiId: number | null; secim: string | null; miktar: string }
async function fasonGideni(db: Db, f: NonNullable<MalKabulKomutu['satirlar'][number]['fason']>, donenMiktar: string, alan: string): Promise<FasonGideni> {
  const malzemeId = Number(f.malzemeId);
  const o = await malzemeOzeti(db, malzemeId);
  if (!o) throw dogrulama('Giden malzemenin kartı bulunamadı.', `${alan}.malzemeId`);
  if (!stoklanirMi(o.tur)) throw dogrulama(`${o.ad ?? o.kod}: hizmet stoklanmaz; giden malzeme fason konumundaki karttır.`, `${alan}.malzemeId`);
  const konumId = Number(f.konumId);
  const konum = await sorgular.konumBul(db, konumId);
  if (!konum || !konum.aktif) throw dogrulama('Fason konumu bulunamadı.', `${alan}.konumId`);
  if (konum.tur !== 'fason') throw dogrulama('Giden malzeme yalnız fason konumundan düşülür.', `${alan}.konumId`);
  const p = await kaynakPartisi(db, malzemeId, konumId, f.partiId === undefined ? undefined : f.partiId === null ? null : Number(f.partiId), `${alan}.partiId`);
  return { malzemeId, konumId, partiId: p.partiId, secim: p.secim, miktar: f.miktar === undefined ? donenMiktar : bindenMetin(binde(f.miktar)) };
}
async function fasonCikisiYaz(db: Db, kisiId: number, f: FasonGideni, eksiOnay: boolean): Promise<number> {
  const b = await sorgular.bakiyeKilitle(db, f.malzemeId, f.konumId, f.partiId);
  const onayliEksi = dusumDenetle(b?.miktar ?? '0', f.miktar, eksiOnay);
  const id = await sorgular.hareketYaz(db, hareket({
    tur: 'cikis', malzemeId: f.malzemeId, miktar: f.miktar, kisiId, partiId: f.partiId, partiSecimi: f.secim, kaynakKonumId: f.konumId, onayliEksi,
    cikisNedeni: 'diger', aciklama: 'Fason dönüşü',
  }));
  await bakiyeDegistir(db, { malzemeId: f.malzemeId, konumId: f.konumId, partiId: f.partiId, fark: -binde(f.miktar) });
  return id;
}
async function malKabulOzetiCevir(db: Db, b: sorgular.MalKabulHam): Promise<MalKabulOzeti> {
  const kisi = await kisiAdlari(db, [b.kisiId]);
  const { kisiId, ...geri } = b;
  return { ...geri, kisiAd: kisi.get(kisiId) ?? null };
}
const SERTIFIKA_PARTISIZ = 'Sertifika dosyası partiye bağlanır; satıra parti bilgisi girin.';
function denetimiYaz(denetim: DenetimDefteri, denetimEki: (s: readonly DenetimSecimi[]) => void): void {
  if (denetim.length > 0) denetimEki(denetim);
}
export async function malKabulYap(db: Db, k: Kullanici, g: MalKabulKomutu, denetimEki: (s: readonly DenetimSecimi[]) => void): Promise<MalKabulCevabi> {
  const id = await sorgular.malKabulAc(db, { no: await belgeNo(db, 'stok.mal-kabul-no', 'stok_mal_kabul'), tur: g.tur, irsaliyeNo: g.irsaliyeNo ?? null, duzeltilenId: null, kisiId: k.id });
  const denetim: DenetimDefteri = [];
  const hareketIdler = await malKabulSatirlariniYaz(db, id, g.tur, g.satirlar, k, g.eksiOnay === true, denetim);
  // Gelen serbest malzeme bekleyen emirlere sırayla ayrılır (fason dönüşü emrin kendi parçasıdır, ayrılmaz); talepte seçilen emir öne geçer.
  const serbest = g.satirlar.filter((x) => x.fason === undefined && x.fasonIsi === undefined);
  const satirEmri = await siparisSatirlarininEmri(db, serbest.flatMap((x) => (x.siparisSatirId === undefined ? [] : [Number(x.siparisSatirId)])));
  const onde = new Map<number, Set<number>>();
  for (const x of serbest) {
    const emirId = x.siparisSatirId === undefined ? undefined : satirEmri.get(Number(x.siparisSatirId));
    if (emirId !== undefined) onde.set(Number(x.malzemeId), (onde.get(Number(x.malzemeId)) ?? new Set()).add(emirId));
  }
  await bekleyenlereDagit(db, k.id, serbest.map((x) => Number(x.malzemeId)), onde);
  denetimiYaz(denetim, denetimEki);
  return { belge: await malKabulOzetiCevir(db, (await sorgular.malKabulBul(db, id))!), hareketIdler };
}
// Düzeltme (DEP-53): eski belgenin her satırı aynı işlemde ters çevrilir, siparişe bağlı satırın teslimi geri alınır, doğru
// satırlarla yeni belge açılır. Satırsız düzeltme belgeyi tamamen iptal eder: yeni belge satırsız kalır, iptalin kaydıdır.
export async function malKabulDuzelt(db: Db, k: Kullanici, id: number, g: MalKabulDuzeltKomutu, denetimEki: (s: readonly DenetimSecimi[]) => void): Promise<MalKabulCevabi> {
  const kisiId = k.id;
  const eski = await sorgular.malKabulBul(db, id, true);
  if (!eski) throw bulunamadi('Mal kabul belgesi bulunamadı.');
  const engel = duzeltmeEngeli({ duzeltildi: eski.duzeltenId !== null });
  if (engel) throw cakisma(engel);
  // 3129: başlangıç stoğu satır satır düzeltilmez; bütün belge kendi geri alma ucundan, hareket görmemişse geri alınır.
  if (eski.tur === 'baslangic') throw cakisma('Başlangıç stoğu belgesi düzeltilmez; belge ayrıntısından bütün olarak geri alın.');
  const hareketIdler: number[] = [];
  const satirlar = await sorgular.malKabulSatirlari(db, id);
  // Fason işinden dönen satırın stoğu emir adımıyla yazılmıştır (statü çevirme, sarf, çıktı); tek hareketle geri alınamaz.
  if (satirlar.some((s) => s.emirAdimi)) {
    throw cakisma('Bu belgede fason işinden dönen parça var; düzeltme onu geri alamaz. Farkı Stok Merkezi\'nde hareketle düzeltin.');
  }
  const gkkSatirlari = satirlar.filter((s) => s.gkk).map((s) => s.id);
  const gkkEngeli = girisKontroluDuzeltmeEngeli(gkkSatirlari.length === 0 ? [] : await sorgular.girisKontroluSatirlari(db, gkkSatirlari));
  if (gkkEngeli) throw cakisma(gkkEngeli);
  for (const s of satirlar) {
    if (s.hareketId !== null) hareketIdler.push(await tersCevir(db, kisiId, s.hareketId, g.eksiOnay === true, `Düzeltme: ${eski.no}`, true));
    if (s.fasonCikisHareketId !== null) hareketIdler.push(await tersCevir(db, kisiId, s.fasonCikisHareketId, g.eksiOnay === true, `Düzeltme: ${eski.no}`, true));
    if (s.siparisSatirId !== null) await teslimGeriAl(db, k, { malKabulSatirId: s.id });
  }
  // B-4 (1405 a): satırın kabul ettiği sevkiyat kalemi kabulü geri alır; kalem depoda yeniden bekler, yeni satır ona yeniden bağlanabilir.
  await depoKabulunuGeriAl(db, kisiId, satirlar.map((s) => s.id));
  const yeni = await korumali(async () => sorgular.malKabulAc(db, { no: await belgeNo(db, 'stok.mal-kabul-no', 'stok_mal_kabul'), tur: eski.tur, irsaliyeNo: eski.irsaliyeNo, duzeltilenId: id, kisiId }));
  const denetim: DenetimDefteri = [];
  hareketIdler.push(...(await malKabulSatirlariniYaz(db, yeni, eski.tur, g.satirlar, k, g.eksiOnay === true, denetim)));
  denetimiYaz(denetim, denetimEki);
  return { belge: await malKabulOzetiCevir(db, (await sorgular.malKabulBul(db, yeni))!), hareketIdler };
}
// Depocu tek kutudan malzeme, tedarikçi, emir ve projeyle arar. Emir talebin ya da kalemin kaynak talebinin emridir, fason
// satırında iş emrinin emri. Satır sayısından bağımsız sabit sayıda toplu okuma (N+1 yok).
export async function acikSiparisSatirlari(db: Db): Promise<AcikSiparisSatirlariCevabi> {
  const l = await siparisSatirlari(db);
  const kartlar = await malzemeOzetleri(db, [...new Set(l.flatMap((x) => (x.malzemeNo === null ? [] : [x.malzemeNo])))]);
  const kalemEmri = await siparisSatirlarininEmri(db, l.map((x) => x.id));
  const isEmirleri = await isEmriOzetleri(db, l.flatMap((x) => (x.isEmriId === null || kalemEmri.has(x.id) ? [] : [x.isEmriId])));
  const emri = (x: (typeof l)[number]): number | null => kalemEmri.get(x.id) ?? (x.isEmriId === null ? null : isEmirleri.get(x.isEmriId)?.uretimEmriId ?? null);
  const emirler = l.map(emri);
  const nolar = await emirNoHaritasi(db, emirler);
  const projesi = await emirlerinProjeleri(db, emirler.filter((e): e is number => e !== null));
  const projeAdi = await projeAdlari(db, [...new Set(projesi.values())]);
  // 2881: revizyonun kartı fasonda uygulanacak parçadır (satın almanın revizyonMalzemeNo'su); eşleşme malzemeNo ile kalır.
  const yururlukte = await yururluktekiRevizyonlar(db, l.flatMap((x) => (x.revizyonMalzemeNo === null || x.parcaRevizyonu === null ? [] : [x.revizyonMalzemeNo])));
  return { satirlar: l.map((x, i) => {
    const emirId = emirler[i] ?? null;
    const projeId = emirId === null ? null : projesi.get(emirId) ?? null;
    // Siparişte revizyon yoksa karşılaştırılacak bir şey yoktur; yürürlükteki de yazılmaz.
    const yur = x.revizyonMalzemeNo === null || x.parcaRevizyonu === null ? null : yururlukte.get(x.revizyonMalzemeNo) ?? null;
    return {
      id: x.id, siparisNo: x.siparisNo, talepNo: x.talepNo, tedarikciAdi: x.tedarikciAdi, malzemeId: x.malzemeNo,
      malzemeTur: (x.malzemeNo === null ? null : (kartlar.get(x.malzemeNo)?.tur as MalzemeTuru | undefined)) ?? null, kalemAdi: x.kalemAdi,
      miktar: x.miktar, kalanMiktar: x.kalanMiktar, birim: x.birim, beklenenTeslim: x.beklenenTeslim,
      uretimEmriId: emirId, emirNo: emirNoDe(nolar, emirId), projeId, projeAdi: projeId === null ? null : projeAdi.get(projeId) ?? null,
      isEmriId: x.isEmriId, parcaRevizyonu: x.parcaRevizyonu, yururlukRevizyonu: yur,
      revizyonUyusmuyor: revizyonUyusmuyor(x.parcaRevizyonu, yur),
    };
  }) };
}
export async function malKabulListesi(db: Db, s: MalKabullerListesi): Promise<SayfaliListe<MalKabulOzeti>> {
  const suzgec = { asil: s.asil === '1', tur: s.tur, logoDurumu: s.logoDurumu, baslangic: s.baslangic, bitis: s.bitis, metin: s.metin };
  const l = await sayfaliListe(s, { say: () => sorgular.malKabulSay(db, suzgec), satirlar: (d) => sorgular.malKabuller(db, suzgec, s, d) });
  const kisiler = await kisiAdlari(db, [...new Set(l.satirlar.map((b) => b.kisiId))]);
  return { ...l, satirlar: l.satirlar.map(({ kisiId, ...b }) => ({ ...b, kisiAd: kisiler.get(kisiId) ?? null })) };
}
export async function malKabulAyrintisi(db: Db, id: number): Promise<MalKabulAyrintiCevabi> {
  const b = await sorgular.malKabulBul(db, id);
  if (!b) throw bulunamadi('Mal kabul belgesi bulunamadı.');
  const s = await sorgular.malKabulSatirlari(db, id);
  const ad = await adlar(db, [...s.map((x) => x.malzemeId), ...s.flatMap((x) => (x.fasonMalzemeId === null ? [] : [x.fasonMalzemeId]))]);
  const fasonSiparisleri = s.flatMap((x) => (x.fasonCikisHareketId === null || x.siparisSatirId === null ? [] : [x.siparisSatirId]));
  const hizmetKarti = new Map((fasonSiparisleri.length === 0 ? [] : await siparisSatirlari(db, fasonSiparisleri)).map((x) => [x.id, x.malzemeNo]));
  const belgeler = await partiBelgeleri(db, s.flatMap((x) => (x.partiId === null ? [] : [x.partiId])));
  const nolar = await emirNoHaritasi(db, s.map((x) => x.partiEmirId));
  return {
    belge: await malKabulOzetiCevir(db, b),
    baslangic: b.tur === 'baslangic' ? await baslangicAyrintisi(db, id) : null,
    satirlar: s.map((x) => ({
      sira: x.sira, malzemeId: x.malzemeId, malzemeAd: ad.get(x.malzemeId) ?? null, sayilanMiktar: x.sayilanMiktar, konumKod: x.konumKod, hareketId: x.hareketId, siparisSatirId: x.siparisSatirId,
      fason: x.fasonCikisHareketId === null || x.fasonMalzemeId === null ? null
        : { malzemeId: x.fasonMalzemeId, malzemeAd: ad.get(x.fasonMalzemeId) ?? null, miktar: x.fasonMiktar!, konumId: x.fasonKonumId!, konumKod: x.fasonKonumKod!, hareketId: x.fasonCikisHareketId,
          hizmetMalzemeId: x.siparisSatirId === null ? null : hizmetKarti.get(x.siparisSatirId) ?? null },
      partiId: x.partiId,
      partiEtiketi: x.partiId === null ? null : partiEtiketi({ lotNo: x.lotNo, tedarikciPartiNo: x.tedarikciPartiNo, dokumNo: x.dokumNo, uretimEmriId: x.partiEmirId }, emirNoDe(nolar, x.partiEmirId)),
      partiBelgeleri: x.partiId === null ? [] : belgeler.get(x.partiId) ?? [],
      logoDurumu: x.logoDurumu, logoIrsaliyeSatirNo: x.logoIrsaliyeSatirNo, logoIrsaliyeMiktari: x.logoIrsaliyeMiktari, gkk: x.gkk,
    })),
  };
}

// ---- Giriş kontrolü (1246; 1251 a, 1252, 1253 a) -------------------------------------------------------------------------------------
// Kalite Merkezi'nin listesi için GKK satırları: kimlik verilmezse karantinada karar bekleyeni olanlar. Yetkiyi çağıran korur.
export interface GirisKontroluSatiri {
  malKabulSatirId: number; malKabulNo: string; zaman: string; malzemeId: number; partiId: number; partiEtiketi: string | null; sertifikaVar: boolean;
  siparisSatirId: number | null; miktar: string; bekleyen: string;
}
export async function girisKontroluSatirlari(db: Db, idler: readonly number[] | null): Promise<GirisKontroluSatiri[]> {
  if (idler !== null && idler.length === 0) return [];
  const l = await sorgular.girisKontroluSatirlari(db, idler === null ? null : [...new Set(idler)]);
  const belgeler = await partiBelgeleri(db, l.map((x) => x.partiId));
  return l.map((x) => ({
    malKabulSatirId: x.id, malKabulNo: x.malKabulNo, zaman: x.zaman, malzemeId: x.malzemeId, partiId: x.partiId,
    partiEtiketi: partiEtiketi({ lotNo: x.lotNo, tedarikciPartiNo: x.tedarikciPartiNo, dokumNo: x.dokumNo, uretimEmriId: null }, null),
    sertifikaVar: (belgeler.get(x.partiId) ?? []).length > 0, siparisSatirId: x.siparisSatirId,
    miktar: bindenMetin(binde(x.miktar)), bekleyen: bindenMetin(binde(x.bekleyen)),
  }));
}
// Kabul edilen giriş kontrolü lotunun gideceği konum: mal kabul alanı.
export const malKabulKonumu = (db: Db): Promise<number> => varsayilanKonum(db, 'KABUL');

// 1252: giriş kontrolünün stok yansıması. Karantinadaki `kaynak` kalitesinden `miktar` kadarı: serbest ya da şartlıysa mal kabul alanına
// taşınır ve kalitesi çevrilir; redse karantinada red olur; iadeyse (yalnız red kaynaktan, 1253 a) tedarikçiye iade çıkışıdır. Miktar
// karantinadaki kullanılabilir bakiyeyi aşarsa hiçbir şey yazılmaz. Yazılan hareketler döner. Yetkiyi çağıran korur.
export type GirisKontroluSonucu = 'serbest' | 'sartli' | 'red' | 'iade';
export async function girisKontroluUygula(db: Db, kisiId: number, g: {
  malKabulSatirId: number; partiId: number; kaynak: 'karar_bekliyor' | 'red'; miktar: string; sonuc: GirisKontroluSonucu; aciklama: string;
}): Promise<number[]> {
  if (g.sonuc === 'iade') {
    if (g.kaynak !== 'red') throw gecersiz('Tedarikçiye iade yalnız red kararından sonra yazılır.');
    return tedarikciyeIade(db, kisiId, { partiId: g.partiId, miktar: g.miktar, aciklama: g.aciklama });
  }
  if (g.sonuc === 'red') {
    let kalan = binde(g.miktar);
    if (kalan <= 0n) throw gecersiz('Hatalı miktar sıfırdan büyük olmalı.');
    const idler: number[] = [];
    for (const x of (await sorgular.partininKarantinaBakiyeleri(db, g.partiId)).filter((b) => b.kaliteDurumu === g.kaynak)) {
      if (kalan <= 0n) break;
      const b = await sorgular.bakiyeKilitle(db, x.malzemeId, x.konumId, g.partiId, x.statuId, g.kaynak);
      const eldeki = binde(b?.miktar ?? '0') - binde(await sorgular.yoldaAyrilan(db, x.malzemeId, x.konumId, g.partiId, x.statuId, g.kaynak));
      const miktar = kalan < eldeki ? kalan : eldeki;
      if (miktar <= 0n) continue;
      kalan -= miktar;
      idler.push(await kaliteDegistir(db, kisiId, { ...x, partiId: g.partiId, kaynak: g.kaynak, hedef: 'red', miktar, uretimEmriId: null, aciklama: g.aciklama }));
    }
    if (kalan > 0n) throw gecersiz('Hatalı miktar karantinadaki bakiyeyi aşıyor.');
    return idler;
  }
  const tasinan = await karantinadanBirak(db, kisiId, { partiId: g.partiId, hedefKonumId: await malKabulKonumu(db), aciklama: g.aciklama, miktar: g.miktar, kaliteDurumu: g.kaynak });
  const satirlar = new Map<string, { konumId: number; statuId: number | null; kaliteDurumu: KaliteDurumu; miktar: bigint }>();
  for (const t of tasinan) {
    const k = `${t.hedefKonumId}:${t.statuId ?? ''}`;
    satirlar.set(k, { konumId: t.hedefKonumId, statuId: t.statuId, kaliteDurumu: t.kaliteDurumu, miktar: (satirlar.get(k)?.miktar ?? 0n) + binde(t.miktar) });
  }
  const cevrilen = await partiKaliteDurumuYap(db, kisiId, {
    partiId: g.partiId, hedef: g.sonuc, aciklama: g.aciklama, satirlar: [...satirlar.values()].map((x) => ({ ...x, miktar: bindenMetin(x.miktar) })),
  });
  // Serbest kalan lot mal kabuldeki gibi bekleyen emirlere ayrılır; siparişin talebinde seçilen emir öne geçer. Şartlı kabul ayrılmaz.
  if (g.sonuc === 'serbest') {
    const [s] = await sorgular.girisKontroluSatirlari(db, [g.malKabulSatirId]);
    if (s !== undefined) {
      const emir = s.siparisSatirId === null ? undefined : (await siparisSatirlarininEmri(db, [s.siparisSatirId])).get(s.siparisSatirId);
      await bekleyenlereDagit(db, kisiId, [s.malzemeId], emir === undefined ? new Map() : new Map([[s.malzemeId, new Set([emir])]]));
    }
  }
  return [...tasinan.map((t) => t.hareketId), ...cevrilen.map((c) => c.hareketId)];
}

// 1253 a: kalitenin red kararı partinin karantinadaki red bakiyesini tedarikçiye iade çıkışıyla düşürür; yoldaki teslime ayrılan
// dokunulmaz. Miktar kullanılabilir red bakiyesini aşarsa hiçbir şey yazılmaz. Yetkiyi çağıran korur.
export async function tedarikciyeIade(db: Db, kisiId: number, g: { partiId: number; miktar: string; aciklama: string }): Promise<number[]> {
  let kalan = binde(g.miktar);
  if (kalan <= 0n) throw gecersiz('İade miktarı sıfırdan büyük olmalı.');
  const satirlar = (await sorgular.partininKarantinaBakiyeleri(db, g.partiId)).filter((x) => x.kaliteDurumu === 'red');
  await siraliKilitle(db, ...satirlar.map((x) => ({ ...x, partiId: g.partiId })));
  const plan: { s: (typeof satirlar)[number]; miktar: bigint }[] = [];
  for (const x of satirlar) {
    if (kalan <= 0n) break;
    const b = await sorgular.bakiyeKilitle(db, x.malzemeId, x.konumId, g.partiId, x.statuId, 'red');
    const eldeki = binde(b?.miktar ?? '0') - binde(await sorgular.yoldaAyrilan(db, x.malzemeId, x.konumId, g.partiId, x.statuId, 'red'));
    const miktar = kalan < eldeki ? kalan : eldeki;
    if (miktar <= 0n) continue;
    kalan -= miktar;
    plan.push({ s: x, miktar });
  }
  if (kalan > 0n) throw gecersiz('İade miktarı karantinadaki red bakiyesini aşıyor.');
  const idler: number[] = [];
  for (const { s: x, miktar } of plan) {
    idler.push(await sorgular.hareketYaz(db, hareket({
      tur: 'cikis', malzemeId: x.malzemeId, miktar: bindenMetin(miktar), kisiId, partiId: g.partiId, partiSecimi: 'kisi', kaynakKonumId: x.konumId,
      kaynakStatuId: x.statuId, kaynakKaliteDurumu: 'red', cikisNedeni: 'tedarikci_iade', aciklama: g.aciklama,
    })));
    await bakiyeDegistir(db, { malzemeId: x.malzemeId, konumId: x.konumId, partiId: g.partiId, statuId: x.statuId, kaliteDurumu: 'red', fark: -miktar });
  }
  return idler;
}

// ---- Üretim girişi (DEP-47, DEP-48, DEP-52): kaynak hazır olana kadar elle --------------------------------------------------------
export async function uretimGirisi(db: Db, kisiId: number, g: UretimGirisiKomutu): Promise<HareketCevabi> {
  const malzemeId = Number(g.malzemeId);
  const o = await malzemeOzeti(db, malzemeId);
  if (!o) throw dogrulama('Malzeme kartı bulunamadı.', 'malzemeId');
  if (o.tur !== 'mamul' && o.tur !== 'yarimamul') throw dogrulama('Üretim girişi yalnız yarı mamul ve mamul için yapılır.', 'malzemeId');
  if (!(await malzemeKullanilabilirMi(db, malzemeId))) throw gecersiz(`${o.ad ?? o.kod}: kart kullanılabilir değil.`);
  const konumId = g.konumId === undefined ? await varsayilanKonum(db, 'URETIM') : Number(g.konumId);
  await aktifKonum(db, konumId, 'konumId');
  const emir = Number(g.uretimEmriId);
  await emirVarDenetle(db, emir);
  const miktar = bindenMetin(binde(g.miktar));
  // 21.4: emrin kendi ürünü sayım ve tamamlamayla da girer; elle giriş adedi aşmaz. Tamamlamayla aynı kilit: eşzamanlı iki giriş
  // sınırı birlikte aşamaz.
  const e = await uretimEmriOzeti(db, emir);
  if (e !== null && e.malzemeNo === malzemeId) await sorgular.emirTamamlamaKilidi(db, emir);
  const durumEngeli = e === null ? null : uretimGirisiDurumEngeli(e.durum, (await kapanisSonuclari(db, [emir])).get(emir) != null);
  if (durumEngeli) throw cakisma(durumEngeli);
  // Ürünü tanımlı olmayan emirde ağaç bilinmez; kart denetimi ürünlü emirde yapılır.
  if (e !== null && e.malzemeNo !== null) {
    const kartlar = new Set([e.malzemeNo, ...[...(await emirDugumleri(db, emir)).values()].flatMap((d) => (d.malzemeNo === null ? [] : [d.malzemeNo]))]);
    const kartEngeli = uretimGirisiKartEngeli(o.tur, malzemeId, kartlar);
    if (kartEngeli) throw dogrulama(kartEngeli, 'malzemeId');
  }
  const kesir = uretimGirisiKesirEngeli(miktar, o.birim?.toLocaleLowerCase('tr') === 'adet' || e?.malzemeNo === malzemeId);
  if (kesir) throw dogrulama(kesir, 'miktar');
  if (e !== null && e.malzemeNo === malzemeId) {
    const asim = uretimGirisiEngeli(uretimGirisiHedefi(e.durum, e.saglamAdet, e.adet), await sorgular.emirUretimGirisi(db, emir, malzemeId), miktar);
    if (asim) throw dogrulama(asim, 'miktar');
  }
  return korumali(async () => {
    const parti = await partiBulVeyaAc(db, { malzemeId, tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, uretimEmriId: emir, kisiId });
    const id = await sorgular.hareketYaz(db, hareket({ tur: 'giris', malzemeId, miktar, kisiId, partiId: parti, partiSecimi: 'giris', hedefKonumId: konumId, girisKaynagi: 'uretim', uretimEmriId: emir }));
    await bakiyeDegistir(db, { malzemeId, konumId, partiId: parti, fark: binde(miktar) });
    return { hareketIdler: [id], onayliEksi: false };
  });
}
