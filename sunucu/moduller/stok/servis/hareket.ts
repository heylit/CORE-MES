import { type Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, gecersiz, onayGerekli, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { KaliteDurumu, CikisKomutu, HareketCevabi, SayimCevabi, SayimFarklariCevabi, SayimKomutu, TasimaKomutu, StatuDegistirKomutu, TopluGeriAlKomutu } from '#paylasilan/sozlesme/stok.ts';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { malzemeOzeti, malzemeOzetleri } from '../../malzemeler/disari.ts';
import { siparisFaturalari } from '../../finans/disari.ts';
import { sevkIsiOzeti } from '../../sevkiyat/disari.ts';
import {
  binde, bindenMetin, dusumKarari, geriAlmaEngeli, partiEtiketi, statuDegisimiEngeli, stoklanirMi, partiSec, sayimFarki, sayimKarariEngeli, sayimOnayaGiderMi, tersYon, serbestMiktarEngeli,
  cikisKaliteKarari, kaliteDegisimiEngeli, kaliteKarariHareketiMi, karantinaEngeli, gozTamSayildiMi, eksiKaliteEngeli, statuKartEngeli, sevkTeslimIsi, faturaliSevkEngeli, sevkCikisEngeli,
} from '../kurallar.ts';
import * as sorgular from '../sorgular.ts';
import { cikisOnerisiOku } from './malzeme.ts';
import { korumali, adlar, emirNoDe, emirNoHaritasi, aktifKonum, bakiyeDegistir, siraliKilitle, hareket } from './ortak.ts';
import { kalanKimligi } from './teslim.ts';
import { sarfEmriDenetle, statuler, rezerveyiAsmasin, rezerveDegistir } from './uretim.ts';

// ---- Düşüm: çıkış ve taşıma (DEP-02…DEP-06, DEP-09, DEP-23) ---------------------------------------------------------------------
export async function kaynakPartisi(db: Db, malzemeId: number, konumId: number, istenen: number | null | undefined, alan = 'partiId', kalite: KaliteDurumu = 'serbest') {
  const s = partiSec(await sorgular.gozdekiPartiler(db, malzemeId, konumId, kalite), istenen);
  if (s.tur === 'secim-gerekli') throw dogrulama('Bu gözde birden çok parti var; partiyi seçin.', alan, { partiler: s.partiler });
  return s;
}
// Denetim #35: yoldaki teslime ayrılan miktar elle çıkış ve taşımayla düşülmez (eksi onayı da bunu açmaz); teslim alınınca kaynaktan düşer.
async function yoldakiniYemesin(db: Db, bakiye: string, a: { malzemeId: number; konumId: number; partiId: number | null; kalite: KaliteDurumu }, miktar: string): Promise<void> {
  const yolda = await sorgular.yoldaAyrilan(db, a.malzemeId, a.konumId, a.partiId, null, a.kalite);
  if (binde(yolda) <= 0n) return;
  const engel = serbestMiktarEngeli(bakiye, yolda, miktar, 'yoldaki teslime ayrılmış');
  if (engel) throw dogrulama(engel, 'miktar');
}
// Soru 98 a: mamul ve yarı mamulün sevki sevkiyat işinden düşer; elle sevk çıkışı ikinci kez düşürürdü.
export async function sevkCikisiniDenetle(db: Db, malzemeIdler: readonly number[], cikisNedeni: string): Promise<void> {
  if (cikisNedeni !== 'sevk') return;
  for (const [id, o] of await malzemeOzetleri(db, [...malzemeIdler])) {
    const engel = sevkCikisEngeli(o.tur, cikisNedeni);
    if (engel) throw gecersiz(`${o.ad ?? o.kod ?? `#${id}`}: ${engel}`);
  }
}
// 16.1: eksik varken gözdeki red ya da karar bekleyen parça eksi onayıyla da serbest yazılmaz.
export async function eksiKaliteDenetle(db: Db, a: { malzemeId: number; konumId: number; partiId: number | null }, mevcut: string, miktar: string): Promise<void> {
  if (binde(mevcut) >= binde(miktar)) return;
  const engel = eksiKaliteEngeli(await sorgular.gozdekiKullanilamazKalite(db, a.malzemeId, a.konumId, a.partiId));
  if (engel) throw gecersiz(engel);
}
export function dusumDenetle(mevcut: string, miktar: string, eksiOnay: boolean): boolean {
  const k = dusumKarari(mevcut, miktar, eksiOnay);
  if (k.tur === 'onay-gerekli') throw onayGerekli(`Yetersiz stok. Mevcut: ${k.mevcut}. Yine de yazmak için onaylayın; bakiye eksiye düşer.`, { mevcut: k.mevcut });
  return k.onayliEksi;
}
export async function cikisYap(db: Db, kisiId: number, g: CikisKomutu): Promise<HareketCevabi> {
  const malzemeId = Number(g.malzemeId);
  const konumId = Number(g.konumId);
  // Kalite engeli tür engelinden önce: karar bekleyen parça her türde aynı nedenle durur.
  const kalite = g.kaliteDurumu ?? 'serbest';
  const karar = cikisKaliteKarari(kalite, g.cikisNedeni);
  if (karar !== null && 'engel' in karar) throw gecersiz(karar.engel);
  await sevkCikisiniDenetle(db, [malzemeId], g.cikisNedeni);
  const konum = await aktifKonum(db, konumId, 'konumId');
  const karantina = karantinaEngeli(konum.tur, { cikisNedeni: g.cikisNedeni });
  if (karantina) throw gecersiz(karantina);
  await sarfEmriDenetle(db, kisiId, g.uretimEmriId === undefined || g.uretimEmriId === null ? null : Number(g.uretimEmriId));
  const p = await kaynakPartisi(db, malzemeId, konumId, g.partiId === undefined ? undefined : g.partiId === null ? null : Number(g.partiId), 'partiId', kalite);
  const miktar = bindenMetin(binde(g.miktar));
  return korumali(async () => {
    const b = await sorgular.bakiyeKilitle(db, malzemeId, konumId, p.partiId, null, kalite);
    await yoldakiniYemesin(db, b?.miktar ?? '0', { malzemeId, konumId, partiId: p.partiId, kalite }, miktar);
    if (kalite === 'serbest') await eksiKaliteDenetle(db, { malzemeId, konumId, partiId: p.partiId }, b?.miktar ?? '0', miktar);
    const onayliEksi = dusumDenetle(b?.miktar ?? '0', miktar, g.eksiOnay === true);
    const emir = g.uretimEmriId === undefined || g.uretimEmriId === null ? null : Number(g.uretimEmriId);
    // Karar bekleyen ve red parça rezerveye girmez (135): ayrılanı ne yer ne düşürür.
    if (kalite === 'serbest') await rezerveyiAsmasin(db, malzemeId, null, emir, binde(miktar));
    const not = karar?.not ?? null;
    const id = await sorgular.hareketYaz(db, hareket({
      tur: 'cikis', malzemeId, miktar, kisiId, partiId: p.partiId, partiSecimi: p.secim, kaynakKonumId: konumId, onayliEksi, kaynakKaliteDurumu: kalite,
      cikisNedeni: g.cikisNedeni, uretimEmriId: emir, aciklama: not === null ? g.aciklama ?? null : [not, g.aciklama].filter(Boolean).join(' · ').slice(0, 200),
    }));
    await bakiyeDegistir(db, { malzemeId, konumId, partiId: p.partiId, kaliteDurumu: kalite, fark: -binde(miktar) });
    if (kalite === 'serbest') await rezerveDegistir(db, { malzemeId, statuId: null, uretimEmriId: emir, fark: -binde(miktar) });
    return { hareketIdler: [id], onayliEksi, ...(karar === null ? {} : { uyari: karar.uyari }) };
  });
}
// CNC takım stoğu (153 a, 164 b): kurulumda değişen takım ya da kullanılan uç seti kartın serbest bakiyesinden, ilk giren önce
// (çıkış önerisiyle) düşer. Yetmezse hiç düşülmez, eksiye inilmez; mevcut miktar döner. Yetkiyi çağıran korur.
export type CncTakimCikisiSonucu = { yeterli: true; hareketIdler: number[] } | { yeterli: false; mevcut: string };
export async function cncTakimCikisi(db: Db, kisiId: number, g: { malzemeId: number; miktar: string; aciklama: string }): Promise<CncTakimCikisiSonucu> {
  const oneri = await cikisOnerisiOku(db, g.malzemeId, g.miktar);
  if (!oneri.yeterli) return { yeterli: false, mevcut: oneri.mevcut };
  const hareketIdler: number[] = [];
  for (const o of oneri.oneriler) {
    const c = await cikisYap(db, kisiId, { malzemeId: g.malzemeId, konumId: o.konumId, partiId: o.partiId, miktar: o.miktar, cikisNedeni: 'diger', aciklama: g.aciklama.slice(0, 200) });
    hareketIdler.push(...c.hareketIdler);
  }
  return { yeterli: true, hareketIdler };
}
export async function tasimaYap(db: Db, kisiId: number, g: TasimaKomutu): Promise<HareketCevabi> {
  const malzemeId = Number(g.malzemeId);
  const kaynak = Number(g.kaynakKonumId);
  const hedef = Number(g.hedefKonumId);
  if (kaynak === hedef) throw dogrulama('Kaynak ve hedef konum aynı.', 'hedefKonumId');
  const kaynakKonum = await aktifKonum(db, kaynak, 'kaynakKonumId');
  const hedefKonum = await aktifKonum(db, hedef, 'hedefKonumId');
  const karantina = karantinaEngeli(kaynakKonum.tur, { hedefTuru: hedefKonum.tur });
  if (karantina) throw gecersiz(karantina);
  const p = await kaynakPartisi(db, malzemeId, kaynak, g.partiId === undefined ? undefined : g.partiId === null ? null : Number(g.partiId));
  const miktar = bindenMetin(binde(g.miktar));
  return korumali(async () => {
    await siraliKilitle(db, { malzemeId, konumId: kaynak, partiId: p.partiId }, { malzemeId, konumId: hedef, partiId: p.partiId });
    const b = await sorgular.bakiyeKilitle(db, malzemeId, kaynak, p.partiId);
    await yoldakiniYemesin(db, b?.miktar ?? '0', { malzemeId, konumId: kaynak, partiId: p.partiId, kalite: 'serbest' }, miktar);
    await eksiKaliteDenetle(db, { malzemeId, konumId: kaynak, partiId: p.partiId }, b?.miktar ?? '0', miktar);
    const onayliEksi = dusumDenetle(b?.miktar ?? '0', miktar, g.eksiOnay === true);
    const id = await sorgular.hareketYaz(db, hareket({ tur: 'transfer', malzemeId, miktar, kisiId, partiId: p.partiId, partiSecimi: p.secim, kaynakKonumId: kaynak, hedefKonumId: hedef, onayliEksi, aciklama: g.aciklama ?? null }));
    await bakiyeDegistir(db, { malzemeId, konumId: kaynak, partiId: p.partiId, fark: -binde(miktar) });
    const ambalaj = b?.ambalajTur ? { tur: b.ambalajTur, olcu: b.ambalajOlcu ?? '', uzunluk: null, genislik: null, yukseklik: null, adet: null } : null;
    await bakiyeDegistir(db, { malzemeId, konumId: hedef, partiId: p.partiId, fark: binde(miktar), ilkGiris: b?.ilkGiris ?? null, ambalaj: ambalaj?.olcu === 'ozel' ? null : ambalaj });
    return { hareketIdler: [id], onayliEksi };
  });
}

// ---- Statü değişimi (#1108, STK-S1) ------------------------------------------------------------------------------------------
// Aynı konumda transfer hareketi; yeni statü satırı değişim anıyla açılır (bekleme süresi statüye girişten, STK-S4). Statü kimliği
// Reçete ve Rota'nın tanımıdır; yoksa yabancı anahtar reddeder.
export async function statuDegistir(db: Db, kisiId: number, g: StatuDegistirKomutu): Promise<HareketCevabi> {
  const malzemeId = Number(g.malzemeId), konumId = Number(g.konumId), partiId = g.partiId === null ? null : Number(g.partiId);
  const kaynakStatuId = g.kaynakStatuId === null ? null : Number(g.kaynakStatuId), hedefStatuId = g.hedefStatuId === null ? null : Number(g.hedefStatuId);
  await aktifKonum(db, konumId, 'konumId');
  if (hedefStatuId !== null) {
    const statuKarti = (await statuler(db)).statuler.find((x) => x.id === hedefStatuId)?.malzemeNo;
    const kartEngeli = statuKartEngeli(statuKarti, (await malzemeOzeti(db, malzemeId))?.kod ?? null);
    if (kartEngeli) throw dogrulama(kartEngeli, 'hedefStatuId');
  }
  const miktar = bindenMetin(binde(g.miktar));
  return korumali(async () => {
    await siraliKilitle(db, { malzemeId, konumId, partiId, statuId: kaynakStatuId }, { malzemeId, konumId, partiId, statuId: hedefStatuId });
    const b = await sorgular.bakiyeKilitle(db, malzemeId, konumId, partiId, kaynakStatuId);
    const engel = statuDegisimiEngeli(kaynakStatuId, hedefStatuId, b?.miktar ?? '0', miktar);
    if (engel) throw dogrulama(engel, kaynakStatuId === hedefStatuId ? 'hedefStatuId' : 'miktar');
    await rezerveyiAsmasin(db, malzemeId, kaynakStatuId, null, binde(miktar));
    const id = await sorgular.hareketYaz(db, hareket({
      tur: 'transfer', malzemeId, miktar, kisiId, partiId, partiSecimi: partiId === null ? null : 'kisi', kaynakKonumId: konumId, hedefKonumId: konumId,
      kaynakStatuId, hedefStatuId, aciklama: g.aciklama ?? null,
    }));
    await bakiyeDegistir(db, { malzemeId, konumId, partiId, statuId: kaynakStatuId, fark: -binde(miktar) });
    await bakiyeDegistir(db, { malzemeId, konumId, partiId, statuId: hedefStatuId, fark: binde(miktar), ilkGiris: new Date().toISOString() });
    return { hareketIdler: [id], onayliEksi: false };
  });
}

// ---- Kalite durumu (134 a) ---------------------------------------------------------------------------------------------------
// Aynı konumda transfer hareketi (statüdeki gibi); parça yerinde kalır, statüsü ve ilk girişi değişmez. Kararın sahibi kalite ve
// Arkon'dur; stok yalnız hareketi yazar. Yolda teslime ayrılan miktar değişmez.
export interface KaliteDegisimi {
  malzemeId: number; konumId: number; partiId: number | null; statuId: number | null; kaynak: KaliteDurumu; hedef: KaliteDurumu; miktar: bigint;
  uretimEmriId: number | null; aciklama: string;
}
export async function kaliteDegistir(db: Db, kisiId: number, d: KaliteDegisimi): Promise<number> {
  const anahtar = { malzemeId: d.malzemeId, konumId: d.konumId, partiId: d.partiId, statuId: d.statuId };
  const miktar = bindenMetin(d.miktar);
  await siraliKilitle(db, { ...anahtar, kaliteDurumu: d.kaynak }, { ...anahtar, kaliteDurumu: d.hedef });
  const b = await sorgular.bakiyeKilitle(db, d.malzemeId, d.konumId, d.partiId, d.statuId, d.kaynak);
  const yolda = binde(await sorgular.yoldaAyrilan(db, d.malzemeId, d.konumId, d.partiId, d.statuId, d.kaynak));
  const engel = kaliteDegisimiEngeli(d.kaynak, d.hedef, bindenMetin(binde(b?.miktar ?? '0') - yolda), miktar);
  if (engel) throw dogrulama(engel, 'miktar');
  const id = await sorgular.hareketYaz(db, hareket({
    tur: 'transfer', malzemeId: d.malzemeId, miktar, kisiId, partiId: d.partiId, partiSecimi: d.partiId === null ? null : 'kisi', kaynakKonumId: d.konumId, hedefKonumId: d.konumId,
    kaynakStatuId: d.statuId, hedefStatuId: d.statuId, kaynakKaliteDurumu: d.kaynak, hedefKaliteDurumu: d.hedef, uretimEmriId: d.uretimEmriId, aciklama: d.aciklama,
  }));
  await bakiyeDegistir(db, { ...anahtar, kaliteDurumu: d.kaynak, fark: -d.miktar });
  await bakiyeDegistir(db, { ...anahtar, kaliteDurumu: d.hedef, fark: d.miktar, ilkGiris: b?.ilkGiris ?? null });
  return id;
}

// Kalite Merkezi'nin parti kararı (229 a): partinin bütün konum ve statülerdeki bakiyesi hedef kaliteye geçer; yoldaki teslime ayrılan
// miktar dokunulmaz kalır. Satır verilirse (320 a, NCR kısmi serbest bırakma) yalnız o bakiyeler o miktarla çevrilir; bulunmayan, sıfır ya da
// kullanılabilir miktarı aşan satırda hiçbir şey yazılmaz. Değişen satır yoksa boş dizi. Yetkiyi çağıran korur.
export async function partiKaliteDurumuYap(db: Db, kisiId: number, g: {
  partiId: number; hedef: KaliteDurumu; aciklama: string; uretimEmriId?: number | null;
  satirlar?: { konumId: number; statuId: number | null; kaliteDurumu: KaliteDurumu; miktar: string }[];
  // KM-11 a (kart 1848): satır verilmezse bakiyeler sırayla en çok bu toplama kadar değişir; yoksa bütün bakiye.
  enCok?: string;
}): Promise<{ konumId: number; statuId: number | null; kaynak: KaliteDurumu; miktar: string; hareketId: number }[]> {
  const sonuc: { konumId: number; statuId: number | null; kaynak: KaliteDurumu; miktar: string; hareketId: number }[] = [];
  const bakiyeler = await sorgular.partininBakiyeleri(db, g.partiId, g.hedef);
  const ayni = (a: { konumId: number; statuId: number | null; kaliteDurumu: KaliteDurumu }, b: typeof a) =>
    a.konumId === b.konumId && a.statuId === b.statuId && a.kaliteDurumu === b.kaliteDurumu;
  const istenen = g.satirlar?.map((x) => {
    const miktar = binde(x.miktar);
    if (miktar <= 0n) throw gecersiz('Kalitesi değişecek miktar sıfırdan büyük olmalı.');
    const b = bakiyeler.find((s) => ayni(s, x));
    if (!b) throw gecersiz('Partinin bu konum ve kalitede bakiyesi yok.');
    if (g.satirlar!.filter((y) => ayni(y, x)).length > 1) throw gecersiz('Aynı bakiye için tek satır verilir.');
    return { s: b, miktar };
  });
  const satirlar = istenen?.map((x) => x.s) ?? bakiyeler;
  await siraliKilitle(db, ...satirlar.flatMap((s) => [s, { ...s, kaliteDurumu: g.hedef }].map((x) => ({ ...x, partiId: g.partiId }))));
  const plan: { s: (typeof bakiyeler)[number]; miktar: bigint }[] = [];
  if (g.enCok !== undefined && istenen) throw gecersiz('Satır ve en çok miktar birlikte verilmez.');
  let kalan = g.enCok === undefined ? null : binde(g.enCok);
  if (kalan !== null && kalan <= 0n) throw gecersiz('Kalitesi değişecek miktar sıfırdan büyük olmalı.');
  for (const [i, s] of satirlar.entries()) {
    const b = await sorgular.bakiyeKilitle(db, s.malzemeId, s.konumId, g.partiId, s.statuId, s.kaliteDurumu);
    const eldeki = binde(b?.miktar ?? '0') - binde(await sorgular.yoldaAyrilan(db, s.malzemeId, s.konumId, g.partiId, s.statuId, s.kaliteDurumu));
    let miktar = istenen ? istenen[i]!.miktar : eldeki;
    if (istenen && miktar > eldeki) throw gecersiz('Kalitesi değişecek miktar bakiyenin kullanılabilir miktarını aşıyor.');
    if (kalan !== null) { if (miktar > kalan) miktar = kalan; kalan -= miktar; }
    if (miktar > 0n) plan.push({ s, miktar });
  }
  for (const { s, miktar } of plan) {
    const hareketId = await kaliteDegistir(db, kisiId, {
      malzemeId: s.malzemeId, konumId: s.konumId, partiId: g.partiId, statuId: s.statuId, kaynak: s.kaliteDurumu, hedef: g.hedef, miktar,
      uretimEmriId: g.uretimEmriId ?? null, aciklama: g.aciklama,
    });
    sonuc.push({ konumId: s.konumId, statuId: s.statuId, kaynak: s.kaliteDurumu, miktar: bindenMetin(miktar), hareketId });
  }
  return sonuc;
}

// KM-11 a (kart 1848): partilerin malzeme kartı numarası; olmayan parti haritada yok.
export async function partilerinMalzemeleri(db: Db, partiIdler: readonly number[]): Promise<Map<number, number>> {
  const sonuc = new Map<number, number>();
  for (const id of new Set(partiIdler)) {
    const p = await sorgular.partiKaynagi(db, id);
    if (p !== null) sonuc.set(id, p.malzemeId);
  }
  return sonuc;
}

// 320 a: NCR partiyi yerinde red yapar (taşımaz); Kalite Merkezi serbest bırakacağı adedi karantinadaki ve yerinde duran red bakiyeden seçer.
// Her istenen parti anahtar olarak döner; red bakiyesi yoksa boş dizi.
export async function partilerinRedBakiyeleri(db: Db, partiIdler: readonly number[]):
  Promise<Map<number, { konumId: number; statuId: number | null; kaliteDurumu: 'red'; kullanilabilir: string; karantinaKonumuMu: boolean }[]>> {
  const sonuc = new Map<number, { konumId: number; statuId: number | null; kaliteDurumu: 'red'; kullanilabilir: string; karantinaKonumuMu: boolean }[]>(
    [...new Set(partiIdler)].map((id) => [id, []]));
  if (sonuc.size === 0) return sonuc;
  for (const r of await sorgular.partilerinRedBakiyeleri(db, [...sonuc.keys()])) {
    sonuc.get(r.partiId)!.push({ konumId: r.konumId, statuId: r.statuId, kaliteDurumu: 'red', kullanilabilir: bindenMetin(binde(r.kullanilabilir)), karantinaKonumuMu: r.karantina });
  }
  return sonuc;
}

// Denetim #15: karantinadan serbest bırakma yalnız Kalite Merkezi kararıyla (stok/disari); depo karantinadaki parçayı yalnız imha eder.
// Partinin karantina konumlarındaki bakiyesi statü ve kalitesi korunarak hedefe geçer (kaliteyi Kalite Merkezi ayrıca yazar); yoldaki
// teslime ayrılan dokunulmaz. Hedef verilmezse her karantina satırı partinin o karantinaya geldiği konuma döner (MRB kapanışında
// kullanıcıya ek adım yok); biri bilinmiyorsa hiçbir şey yazılmadan reddedilir. Bırakılacak bakiye yoksa boş dizi. Yetkiyi çağıran korur.
export async function karantinadanBirak(db: Db, kisiId: number, g: { partiId: number; hedefKonumId?: number | null; aciklama: string; miktar?: string; kaliteDurumu?: KaliteDurumu }):
  Promise<{ konumId: number; hedefKonumId: number; statuId: number | null; kaliteDurumu: KaliteDurumu; miktar: string; hareketId: number }[]> {
  const sonuc: { konumId: number; hedefKonumId: number; statuId: number | null; kaliteDurumu: KaliteDurumu; miktar: string; hareketId: number }[] = [];
  const istenen = g.miktar === undefined ? null : binde(g.miktar);
  if (istenen !== null && istenen <= 0n) throw gecersiz('Serbest bırakılacak miktar sıfırdan büyük olmalı.');
  const satirlar: (Awaited<ReturnType<typeof sorgular.partininKarantinaBakiyeleri>>[number] & { hedefKonumId: number })[] = [];
  for (const s of await sorgular.partininKarantinaBakiyeleri(db, g.partiId)) {
    // 320 a: kalite verilirse aynı karantinadaki başka kalitedeki bakiye ne taşınır ne aşım hesabına girer.
    if (g.kaliteDurumu !== undefined && s.kaliteDurumu !== g.kaliteDurumu) continue;
    const hedefKonumId = g.hedefKonumId ?? await sorgular.karantinaOncesiKonumu(db, g.partiId, s.konumId);
    if (hedefKonumId === null) throw gecersiz('Partinin karantinadan önceki konumu bilinmiyor; serbest bırakılacak konumu seçin.');
    satirlar.push({ ...s, hedefKonumId });
  }
  for (const id of new Set(satirlar.map((s) => s.hedefKonumId).concat(g.hedefKonumId ?? []))) {
    const hedef = await aktifKonum(db, id, 'hedefKonumId');
    if (hedef.tur === 'karantina') throw gecersiz('Serbest bırakılan parça karantina dışında bir konuma gider.');
  }
  await siraliKilitle(db, ...satirlar.flatMap((s) => [s, { ...s, konumId: s.hedefKonumId }].map((x) => ({ ...x, partiId: g.partiId }))));
  const kullanilabilir: { s: (typeof satirlar)[number]; b: Awaited<ReturnType<typeof sorgular.bakiyeKilitle>>; miktar: bigint }[] = [];
  for (const s of satirlar) {
    const b = await sorgular.bakiyeKilitle(db, s.malzemeId, s.konumId, g.partiId, s.statuId, s.kaliteDurumu);
    kullanilabilir.push({ s, b, miktar: binde(b?.miktar ?? '0') - binde(await sorgular.yoldaAyrilan(db, s.malzemeId, s.konumId, g.partiId, s.statuId, s.kaliteDurumu)) });
  }
  // Miktar verilmezse partinin bütün karantina bakiyesi gider; verilirse bakiyeler sırayla tüketilir, kalan karantinada kalır.
  let kalan = istenen;
  if (kalan !== null && kalan > kullanilabilir.reduce((t, x) => t + (x.miktar > 0n ? x.miktar : 0n), 0n)) {
    throw gecersiz('Serbest bırakılacak miktar karantinadaki kullanılabilir miktarı aşıyor.');
  }
  for (const { s, b, miktar: eldeki } of kullanilabilir) {
    if (kalan !== null && kalan <= 0n) break;
    const miktar = kalan !== null && kalan < eldeki ? kalan : eldeki;
    if (miktar <= 0n) continue;
    if (kalan !== null) kalan -= miktar;
    const anahtar = { malzemeId: s.malzemeId, partiId: g.partiId, statuId: s.statuId, kaliteDurumu: s.kaliteDurumu };
    const hareketId = await sorgular.hareketYaz(db, hareket({
      tur: 'transfer', malzemeId: s.malzemeId, miktar: bindenMetin(miktar), kisiId, partiId: g.partiId, partiSecimi: 'kisi', kaynakKonumId: s.konumId, hedefKonumId: s.hedefKonumId,
      kaynakStatuId: s.statuId, hedefStatuId: s.statuId, kaynakKaliteDurumu: s.kaliteDurumu, hedefKaliteDurumu: s.kaliteDurumu, aciklama: g.aciklama,
    }));
    await bakiyeDegistir(db, { ...anahtar, konumId: s.konumId, fark: -miktar });
    await bakiyeDegistir(db, { ...anahtar, konumId: s.hedefKonumId, fark: miktar, ilkGiris: b?.ilkGiris ?? null });
    sonuc.push({ konumId: s.konumId, hedefKonumId: s.hedefKonumId, statuId: s.statuId, kaliteDurumu: s.kaliteDurumu, miktar: bindenMetin(miktar), hareketId });
  }
  return sonuc;
}

// 335: emir başına sarf ve üretimden giriş fişinin satırları; sarf hurdanın fire çıkışını da içerir, hurda ayrıca verilir. Her istenen emir
// anahtardır (hareketsiz emir boş fiş). Kart ya da stok birimi yoksa null (uydurulmaz). Salt okur.
export interface EmirFisSatiri { malzemeId: number; stokKodu: string | null; birim: string | null; miktar: string }
export async function emirMalzemeFisleri(db: Db, emirIdler: readonly number[]): Promise<Map<number, { sarf: EmirFisSatiri[]; giris: EmirFisSatiri[]; hurda: EmirFisSatiri[] }>> {
  const sonuc = new Map(emirIdler.map((id) => [id, { sarf: [] as EmirFisSatiri[], giris: [] as EmirFisSatiri[], hurda: [] as EmirFisSatiri[] }]));
  if (emirIdler.length === 0) return sonuc;
  const satirlar = await sorgular.emirlerinFisHareketleri(db, emirIdler);
  const kartlar = await malzemeOzetleri(db, satirlar.map((x) => x.malzemeId));
  for (const x of satirlar) {
    const f = sonuc.get(x.emirId);
    const kart = kartlar.get(x.malzemeId);
    if (!f) continue;
    const satir = (miktar: string): EmirFisSatiri => ({ malzemeId: x.malzemeId, stokKodu: kart?.kod ?? null, birim: kart?.birim ?? null, miktar: bindenMetin(binde(miktar)) });
    if (binde(x.miktar) !== 0n) f[x.fis].push(satir(x.miktar));
    if (binde(x.hurda) !== 0n) f.hurda.push(satir(x.hurda));
  }
  return sonuc;
}

// ---- Sayım (DEP-16) ------------------------------------------------------------------------------------------------------------
// Kör sayım (1279 a, 1691 teyit): beklenen verilmezse sistem miktarı kilit altında okunur. Fark deponun eşiğini aşarsa stoğa yazılmaz,
// onaya gider (stok_sayim_farki); aynı gözde bekleyen fark varsa yeni sayım reddedilir. Eşik içi fark eskisi gibi hemen yazılır.
export async function sayimYap(db: Db, kisiId: number, g: SayimKomutu): Promise<SayimCevabi> {
  const konumId = Number(g.konumId);
  await aktifKonum(db, konumId, 'konumId');
  const esik = await sorgular.konumunSayimEsigi(db, konumId);
  const hareketIdler: number[] = [];
  let onayaGiden = 0;
  await korumali(async () => {
    await siraliKilitle(db, ...g.satirlar.map((s) => ({ malzemeId: Number(s.malzemeId), konumId, partiId: s.partiId === null ? null : Number(s.partiId) })));
    for (const s of g.satirlar) {
      const malzemeId = Number(s.malzemeId);
      const partiId = s.partiId === null ? null : Number(s.partiId);
      const b = await sorgular.bakiyeKilitle(db, malzemeId, konumId, partiId);
      const sistem = b?.miktar ?? '0';
      if (s.beklenenMiktar !== undefined && binde(sistem) !== binde(s.beklenenMiktar)) {
        throw cakisma('Sayım sırasında bu gözün stoğu değişti; gözü yeniden açıp sayın.', { malzemeId, partiId, guncel: sistem });
      }
      const f = sayimFarki(sistem, s.sayilanMiktar);
      if (f.tur === 'yok') continue;
      if (sayimOnayaGiderMi(sistem, s.sayilanMiktar, esik)) {
        // Onayda yazılamayacak fark beklemeye alınmaz: hizmet kartı bakiye açmaz (KD-013).
        if (b === null) {
          const o = await malzemeOzeti(db, malzemeId);
          if (o && !stoklanirMi(o.tur)) throw dogrulama(`${o.ad ?? o.kod}: hizmet stoklanmaz; hizmetten çıkan malzeme kendi kartıyla girer.`, 'malzemeId');
        }
        const id = await sorgular.sayimFarkiEkle(db, { konumId, malzemeId, partiId, sistemMiktar: bindenMetin(binde(sistem)), sayilanMiktar: bindenMetin(binde(s.sayilanMiktar)), sayanKisiId: kisiId });
        if (id === null) throw cakisma('Bu gözde bu malzemenin onay bekleyen sayım farkı var; önce o karara bağlanır.', { malzemeId, partiId });
        onayaGiden += 1;
        continue;
      }
      const yon = f.tur === 'sayim_fazla' ? { hedefKonumId: konumId } : { kaynakKonumId: konumId };
      hareketIdler.push(await sorgular.hareketYaz(db, hareket({ tur: f.tur, malzemeId, miktar: f.miktar, kisiId, partiId, partiSecimi: partiId === null ? null : 'kisi', ...yon })));
      await bakiyeDegistir(db, { malzemeId, konumId, partiId, fark: f.tur === 'sayim_fazla' ? binde(f.miktar) : -binde(f.miktar) });
    }
    const sayilanlar = g.satirlar.map((s) => ({ malzemeId: Number(s.malzemeId), partiId: s.partiId === null ? null : Number(s.partiId) }));
    if (gozTamSayildiMi(await sorgular.konumBakiyeleri(db, konumId), sayilanlar)) await sorgular.konumSayildi(db, konumId);
  });
  return { hareketIdler, farkSayisi: hareketIdler.length, onayaGiden };
}

// ---- Sayım farkı onayı (1279 a, 1691 teyit) ------------------------------------------------------------------------------
export async function sayimFarklari(db: Db): Promise<SayimFarklariCevabi> {
  const l = await sorgular.sayimFarklari(db);
  const ad = await adlar(db, l.map((f) => f.malzemeId));
  const kisiler = await kisiAdlari(db, [...new Set(l.flatMap((f) => (f.kararKisiId === null ? [f.sayanKisiId] : [f.sayanKisiId, f.kararKisiId])))]);
  const nolar = await emirNoHaritasi(db, l.map((f) => f.partiEmirId));
  return {
    farklar: l.map((f) => ({
      id: f.id, konumId: f.konumId, konumKod: f.konumKod, depoId: f.depoId, malzemeId: f.malzemeId, malzemeAd: ad.get(f.malzemeId) ?? null, partiId: f.partiId,
      partiEtiketi: f.partiId === null ? null : partiEtiketi({ lotNo: f.lotNo, tedarikciPartiNo: f.tedarikciPartiNo, dokumNo: f.dokumNo, uretimEmriId: f.partiEmirId }, emirNoDe(nolar, f.partiEmirId)),
      sistemMiktar: f.sistemMiktar, sayilanMiktar: f.sayilanMiktar, fark: bindenMetin(binde(f.sayilanMiktar) - binde(f.sistemMiktar)), guncelMiktar: f.guncelMiktar,
      sayanKisiId: f.sayanKisiId, sayanAd: kisiler.get(f.sayanKisiId) ?? null, sayimZamani: f.sayimZamani, durum: f.durum,
      kararAd: f.kararKisiId === null ? null : kisiler.get(f.kararKisiId) ?? null, kararZamani: f.kararZamani, kararNotu: f.kararNotu, hareketId: f.hareketId, surum: f.surum,
    })),
    esikler: await sorgular.sayimEsikleri(db),
  };
}
async function bekleyenSayimFarki(db: Db, kisiId: number, id: number): Promise<sorgular.SayimFarkiHam> {
  const f = await sorgular.sayimFarkiBul(db, id, true);
  if (!f) throw bulunamadi('Sayım farkı bulunamadı.');
  const engel = sayimKarariEngeli(f, kisiId);
  if (engel !== null) throw f.sayanKisiId === kisiId && f.durum === 'bekliyor' ? yetkiYok(engel) : cakisma(engel);
  return f;
}
// Onayda sayımdaki fark (sayılan - sistem) hareketle yazılır; sayım ile onay arasındaki hareketler korunur. Hareketin kişisi
// onaylayandır; sayanı fark kaydı taşır.
export async function sayimFarkiOnayla(db: Db, kisiId: number, id: number, g: { surum: number; not?: string | null | undefined }): Promise<SayimFarklariCevabi> {
  await korumali(async () => {
    const f = await bekleyenSayimFarki(db, kisiId, id);
    await aktifKonum(db, f.konumId, 'id');
    const fark = binde(f.sayilanMiktar) - binde(f.sistemMiktar);
    await sorgular.bakiyeKilitle(db, f.malzemeId, f.konumId, f.partiId);
    const yon = fark > 0n ? { tur: 'sayim_fazla' as const, hedefKonumId: f.konumId } : { tur: 'sayim_eksik' as const, kaynakKonumId: f.konumId };
    const hareketId = await sorgular.hareketYaz(db, hareket({
      ...yon, malzemeId: f.malzemeId, miktar: bindenMetin(fark < 0n ? -fark : fark), kisiId, partiId: f.partiId, partiSecimi: f.partiId === null ? null : 'kisi',
      aciklama: `Sayım farkı #${f.id} onayı`,
    }));
    await bakiyeDegistir(db, { malzemeId: f.malzemeId, konumId: f.konumId, partiId: f.partiId, fark });
    await surumluGuncelle({
      guncelle: () => sorgular.sayimFarkiKarar(db, id, g.surum, { durum: 'onaylandi', kisiId, not: g.not ?? null, hareketId }),
      varMi: () => sorgular.sayimFarkiVarMi(db, id), bulunamadiIletisi: 'Sayım farkı bulunamadı.',
    });
  });
  return sayimFarklari(db);
}
export async function sayimFarkiReddet(db: Db, kisiId: number, id: number, g: { surum: number; neden: string }): Promise<SayimFarklariCevabi> {
  await bekleyenSayimFarki(db, kisiId, id);
  await surumluGuncelle({
    guncelle: () => sorgular.sayimFarkiKarar(db, id, g.surum, { durum: 'reddedildi', kisiId, not: g.neden, hareketId: null }),
    varMi: () => sorgular.sayimFarkiVarMi(db, id), bulunamadiIletisi: 'Sayım farkı bulunamadı.',
  });
  return sayimFarklari(db);
}
export async function sayimEsigiDegistir(db: Db, depoId: number, g: { surum: number; esikYuzde: string }): Promise<SayimFarklariCevabi> {
  await surumluGuncelle({
    guncelle: () => sorgular.sayimEsigiYaz(db, depoId, g.surum, g.esikYuzde),
    varMi: () => sorgular.depoVarMi(db, depoId), bulunamadiIletisi: 'Depo bulunamadı.',
  });
  return sayimFarklari(db);
}

// ---- Geri alma (DEP-17, DEP-18, DEP-19, DEP-53) --------------------------------------------------------------------------------
// Soru 186 a: ürün sevkinin teslim çıkışı, iş faturalıyken ne elle ne sevkiyatın teslim geri almasıyla çevrilir. Fatura siparişe ve
// işe bağlıdır (Finans); işin siparişi sevkiyattan okunur.
async function faturaliSevkDenetle(db: Db, h: { tur: string; cikisNedeni: string | null; aciklama: string | null }): Promise<void> {
  const isId = sevkTeslimIsi(h);
  if (isId === null) return;
  const siparisId = (await sevkIsiOzeti(db, isId))?.siparisId ?? null;
  if (siparisId === null) return;
  const engel = faturaliSevkEngeli(isId, (await siparisFaturalari(db, [siparisId])).get(siparisId) ?? []);
  if (engel) throw cakisma(engel);
}
// 1387 a: elle eksiye düşüm onayı ayrı işlemdir (stok.eksi-onayla, yalnız müdür). Terminalin ve akışların kendi eksisi bu onayı istemez;
// onlar uçtan değil, çağıranın işleminden yazar.
export function eksiOnayiDenetle(k: Kullanici, g: { eksiOnay?: boolean | undefined }): void {
  if (g.eksiOnay === true && !islemVarMi(k, 'stok.eksi-onayla')) throw yetkiYok('Stoğu eksiye düşürme onayı yetkiniz yok; müdür onaylar.');
}
// elle: Stok Merkezi'nin geri alması; akışın yazdığı hareketi almaz (1388 a). Akışların ve belge düzeltmesinin kendi geri alması elle değildir.
export async function tersCevir(db: Db, kisiId: number, hareketId: number, eksiOnay: boolean, aciklama: string | null, malKabulDuzeltmesi = false, elle = false): Promise<number> {
  const h = await sorgular.hareketBul(db, hareketId);
  if (!h) throw bulunamadi('Hareket bulunamadı.');
  const engel = geriAlmaEngeli({
    tur: h.tur, geriAlindi: h.geriAlindi, malKabulSatiriMi: h.malKabulSatiriMi && !malKabulDuzeltmesi, disCagriMi: kaliteKarariHareketiMi(h), elleAkis: elle ? h.akis : null,
  });
  if (engel) throw cakisma(engel);
  await faturaliSevkDenetle(db, h);
  const y = tersYon(h.kaynakKonumId, h.hedefKonumId);
  return korumali(async () => {
    let onayliEksi = false;
    // Statü ve kalite de ters döner: hareketin hedefinden kaynağına (boş kalite serbesttir).
    const ks = h.hedefStatuId, hs = h.kaynakStatuId;
    const kq = h.hedefKaliteDurumu ?? 'serbest', hq = h.kaynakKaliteDurumu ?? 'serbest';
    await siraliKilitle(db, { malzemeId: h.malzemeId, konumId: y.kaynak, partiId: h.partiId, statuId: ks, kaliteDurumu: kq },
      { malzemeId: h.malzemeId, konumId: y.hedef, partiId: h.partiId, statuId: hs, kaliteDurumu: hq });
    if (y.kaynak !== null) {
      const b = await sorgular.bakiyeKilitle(db, h.malzemeId, y.kaynak, h.partiId, ks, kq);
      onayliEksi = dusumDenetle(b?.miktar ?? '0', h.miktar, eksiOnay);
    }
    const id = await sorgular.hareketYaz(db, hareket({
      tur: 'geri_alma', malzemeId: h.malzemeId, miktar: h.miktar, kisiId, partiId: h.partiId, partiSecimi: h.partiId === null ? null : 'kisi',
      kaynakKonumId: y.kaynak, hedefKonumId: y.hedef, onayliEksi, uretimEmriId: h.uretimEmriId, geriAlinanId: h.id, aciklama,
      kaynakStatuId: y.kaynak === null ? null : ks, hedefStatuId: y.hedef === null ? null : hs,
      kaynakKaliteDurumu: y.kaynak === null ? null : h.hedefKaliteDurumu, hedefKaliteDurumu: y.hedef === null ? null : h.kaynakKaliteDurumu,
    }));
    if (y.kaynak !== null) await bakiyeDegistir(db, { malzemeId: h.malzemeId, konumId: y.kaynak, partiId: h.partiId, statuId: ks, kaliteDurumu: kq, fark: -binde(h.miktar) });
    if (y.hedef !== null) await bakiyeDegistir(db, { malzemeId: h.malzemeId, konumId: y.hedef, partiId: h.partiId, statuId: hs, kaliteDurumu: hq, fark: binde(h.miktar) });
    // Teslimin hareketi geri alındıysa teslim iptal olur ve kapattığı istek yeniden açılır: sayım ve istek teslim edilmiş saymasın.
    // Kısmi teslimde açılan kalan isteği, açıksa, iptal olur: istek yeniden bütün miktarla açıktır.
    const t = await sorgular.teslimGeriAlindi(db, h.id, kisiId);
    const istek = t?.istekId == null ? null : await sorgular.istekBul(db, t.istekId, true);
    if (istek?.durum === 'teslim') {
      await sorgular.istekGecir(db, istek.id, istek.surum, { kaynaklar: ['teslim'], durum: 'acik', karsilanan: null, kapatanKisiId: null });
      for (const x of await sorgular.istekleriKaynaktan(db, [kalanKimligi(istek)])) {
        await sorgular.istekGecir(db, x.id, x.surum, { kaynaklar: ['acik', 'stok_yok'], durum: 'iptal', karsilanan: null, kapatanKisiId: kisiId });
      }
    }
    return id;
  });
}
export async function geriAl(db: Db, kisiId: number, hareketId: number, g: { eksiOnay?: boolean | undefined; aciklama?: string | null | undefined }): Promise<HareketCevabi> {
  const id = await tersCevir(db, kisiId, hareketId, g.eksiOnay === true, g.aciklama ?? null, false, true);
  const h = await sorgular.hareketBul(db, id);
  return { hareketIdler: [id], onayliEksi: h?.onayliEksi ?? false };
}
// Toplu geri alma (ilk sistemdeki "İşlemi geri al"): uç tek işlemdedir; biri reddedilirse hiçbiri yazılmaz. Yeniden eskiye geri
// alınır: önce yapılan hareket sonra geri alınırsa (taşıma, ardından o konumdan çıkış) ara bakiye eksiye düşmez.
export async function topluGeriAl(db: Db, kisiId: number, g: TopluGeriAlKomutu): Promise<HareketCevabi> {
  const idler = g.hareketIdler;
  if (new Set(idler).size !== idler.length) throw dogrulama('Aynı hareket iki kez seçilmiş.', 'hareketIdler');
  const yazilan: number[] = [];
  const hareketler: NonNullable<Awaited<ReturnType<typeof sorgular.hareketBul>>>[] = [];
  for (const id of idler) { const h = await sorgular.hareketBul(db, id); if (h) hareketler.push(h); }
  await siraliKilitle(db, ...hareketler.flatMap((h) => [
    { malzemeId: h.malzemeId, konumId: h.kaynakKonumId, partiId: h.partiId, statuId: h.kaynakStatuId },
    { malzemeId: h.malzemeId, konumId: h.hedefKonumId, partiId: h.partiId, statuId: h.hedefStatuId },
  ]));
  for (const id of [...idler].sort((a, b) => b - a)) yazilan.push(await tersCevir(db, kisiId, id, g.eksiOnay === true, g.aciklama ?? null, false, true));
  // İşlem tek bağlantıdadır: sorgular sırayla gider (pg aynı istemcide eşzamanlı sorguyu reddedecek).
  let onayliEksi = false;
  for (const id of yazilan) if ((await sorgular.hareketBul(db, id))?.onayliEksi === true) { onayliEksi = true; break; }
  return { hareketIdler: yazilan, onayliEksi };
}
