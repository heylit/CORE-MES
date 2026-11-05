import { type Db } from '#cekirdek/db.ts';
import { cakisma, dogrulama, gecersiz } from '#cekirdek/hata.ts';
import { ACIK_EMIR_DURUMLARI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { KaliteDurumu, MalKabulKomutu, FasonIsleriCevabi } from '#paylasilan/sozlesme/stok.ts';
import { type DepoCikisCevabi, type DepoSevkCevabi } from '#paylasilan/sozlesme/stok.ts';
import { malzemeAdlari, malzemeOzeti } from '../../malzemeler/disari.ts';
import { firmaAdlari } from '../../musteri-tedarikci/disari.ts';
import { depoBekleyenleri, depoCikisiniGeriAl, depoCikisiYaz, depoKabuluYaz, depoKalemiAl } from '../../sevkiyat/disari.ts';
import type { DepoKalemi, FasonSevkiOlayi, UrunSevkiOlayi, UrunSevkSatiri } from '../../sevkiyat/disari.ts';
import { emirDurumlari, fasonDonusuKaydet, fasonHareketiOzeti, fasonIsEmirleri, isEmriOzeti, uretimEmriOzeti, emirNolari } from '../../uretim-emirleri/disari.ts';
import type { FasonHareketiOlayi } from '../../uretim-emirleri/disari.ts';
import { binde, bindenMetin, stoklanirMi, kaynaklardanAl, adetMiktari, sevkAdediBinde, sevkKaynaklariSec, urunSevkAdimlari, sevkAciklamasi } from '../kurallar.ts';
import type { SevkBakiyesi } from '../kurallar.ts';
import * as sorgular from '../sorgular.ts';
import { anaDepo } from './depo.ts';
import { kaliteDegistir, tersCevir } from './hareket.ts';
import { belgeNo, korumali, bakiyeDegistir, siraliKilitle, kilitliEksik, kilitliOlan, hareket, teslimYaz } from './ortak.ts';
import { istasyonKonumuBul } from './teslim.ts';
import { teslimiKapat, kartOnce, adimStatusu, adimCiktisi, adimBilgisi, adimTasinani, dalliTasima, adimPlaniKur, uretimAdiminiYaz, rezerveDegistir } from './uretim.ts';

// ---- Numune teslimi (karar 115 a, 125 a) -----------------------------------------------------------------------------------------
// Operatörün kaliteye gönderdiği numune, adımın bir adetlik parçasıdır: ara adımda taşınan malzeme adım statüsüyle, son adımda ya da
// çıktılı adımda çıktının kendisi. Parça istasyondan "Kalite numune" adlı kutuya teslim edilir; ara alan kutusunda bırakınca kapanır.
// Teslim numuneyi durdurmaz: kutu ya da parça yoksa stok yazılmaz, neden döner (stok sonradan düzeltilir, karar 110 b ile aynı yön).
// isEmriId null: rotasız emir; numune emrin ürünüdür (adımsız emrin sağlam sayımı gibi statüsüz).
// 564 1 b: numune kalite istasyonuna gönderiliyorsa (`hedefIstasyonId`) teslim yolda kalır, kalite "Teslim al" ile alır (Teslim et ile aynı yol);
// hedef yoksa eski davranış: "Kalite numune" kutusu.
export interface NumuneTeslimi { uretimEmriId: number; isEmriId: number | null; istasyonId: number; kisiId: number; adet: number; kaynakKimligi: string; hedefIstasyonId?: number | null }
export type NumuneTeslimSonucu = { teslim: { id: number; no: string } } | { atlandi: string };
const NUMUNE_KUTUSU = 'Kalite numune';
export async function adimParcasi(db: Db, uretimEmriId: number, isEmriId: number | null, adet: bigint): Promise<{ malzemeId: number; statuId: number | null; miktar: bigint } | null> {
  const emir = await uretimEmriOzeti(db, uretimEmriId);
  if (!emir || emir.malzemeNo === null) return null;
  const malzemeNo = emir.malzemeNo;
  const urun = await malzemeOzeti(db, malzemeNo);
  if (!urun || (urun.tur !== 'mamul' && urun.tur !== 'yarimamul')) return null;
  if (isEmriId === null) return { malzemeId: malzemeNo, statuId: null, miktar: adet };
  const bilgi = await adimBilgisi(db, isEmriId);
  if (bilgi === null) return null;
  const statuId = adimStatusu === null ? null : await adimStatusu(db, { malzemeNo, opNo: bilgi.opNo, uretimEmriId });
  const { tasinan, cikti } = await adimTasinani(db, malzemeNo, bilgi, uretimEmriId);
  // Taşınansız rotada son adımın ürünü adım statüsüyle girer (uretimSayimiYansit'in eski yolu); taşınanlıda statüsüz.
  if (bilgi.sonAdim) return { malzemeId: malzemeNo, statuId: tasinan === null ? statuId : null, miktar: adet };
  const ara = await cikti(bilgi.opNo);
  if (ara !== null) return { malzemeId: ara, statuId: null, miktar: adet };
  if (tasinan === null || !stoklanirMi((await malzemeOzeti(db, tasinan.malzemeNo))?.tur ?? '')) return null;
  return { malzemeId: tasinan.malzemeNo, statuId, miktar: adetMiktari(adet, tasinan.miktar, tasinan.bolen) };
}
// ---- Kalite kararı (131 b, 136 a) ----------------------------------------------------------------------------------------------
// İlk parça kararı adımın karar bekleyen parçasını her konumda serbest (onay) ya da red (ret) yapar; red parça uyarıyla akışta kalır (135).
// Adımın parçası numunedeki gibi bulunur; emrin partisi önce, sonra en eski giriş. Yoldaki teslime ayrılan değişmez, bulunan kadarı çevrilir.
export interface KaliteKarariYansimasi { uretimEmriId: number; isEmriId: number | null; kisiId: number; karar: 'onay' | 'ret'; adet: string; refakatPartisiId?: number | null }
export async function kaliteKarariYansit(db: Db, g: KaliteKarariYansimasi): Promise<void> {
  const parca = await adimParcasi(db, g.uretimEmriId, g.isEmriId, binde(g.adet));
  if (parca === null || parca.miktar <= 0n) return;
  const emir = await uretimEmriOzeti(db, g.uretimEmriId);
  const hedef: KaliteDurumu = g.karar === 'onay' ? 'serbest' : 'red';
  const aciklama = `Kalite kararı: ${g.karar === 'onay' ? 'onay' : 'ret'} · emir ${emir?.emirNo ?? String(g.uretimEmriId)}`;
  await korumali(async () => {
    // Karar, sayımın kartının partisine önce uygulanır; kart artık geçersizse de karar düşmez (sayım zaten yazılmıştı).
    const kart = g.refakatPartisiId == null ? undefined : { id: g.refakatPartisiId, partiler: await sorgular.refakatStokPartileri(db, await sorgular.refakatSoyu(db, g.refakatPartisiId)) };
    const kaynaklar = kartOnce(await sorgular.kaliteBakiyeleri(db, parca.malzemeId, parca.statuId, 'karar_bekliyor', g.uretimEmriId), kart);
    for (const a of kaynaklardanAl(kaynaklar, parca.miktar)) {
      await kaliteDegistir(db, g.kisiId, {
        malzemeId: parca.malzemeId, konumId: a.konumId, partiId: a.partiId, statuId: parca.statuId, kaynak: 'karar_bekliyor', hedef, miktar: a.miktar,
        uretimEmriId: g.uretimEmriId, aciklama,
      });
    }
  });
}
// 564 6 a: kalite istasyonunun lot kararı (Kalite Merkezi lot kaydıyla birlikte çağrılır). Ret, emrin istasyondaki serbest parçasını en çok
// `adet` kadar (yoldaki teslime ayrılan hariç) red kalitesine geçirir; kabul parçayı olduğu gibi bırakır (zaten serbesttir). Taşınan döner.
export interface IstasyonLotKarari { uretimEmriId: number; isEmriId: number | null; istasyonId: number; kisiId: number; karar: 'kabul' | 'ret'; adet: string; lotNo: string }
export async function istasyonLotKarari(db: Db, g: IstasyonLotKarari): Promise<string> {
  if (g.karar === 'kabul') return bindenMetin(0n);
  const parca = await adimParcasi(db, g.uretimEmriId, g.isEmriId, binde(g.adet));
  const konum = await sorgular.istasyonKonumu(db, g.istasyonId);
  if (parca === null || konum === null || parca.miktar <= 0n) return bindenMetin(0n);
  const emir = await uretimEmriOzeti(db, g.uretimEmriId);
  let kalan = parca.miktar;
  await korumali(async () => {
    for (const b of await sorgular.istasyondakiEmirBakiyeleri(db, konum, parca.malzemeId, g.uretimEmriId)) {
      if (kalan === 0n || b.kaliteDurumu !== 'serbest') continue;
      const serbest = binde(b.miktar) - binde(b.ayrilan);
      const miktar = serbest < kalan ? serbest : kalan;
      if (miktar <= 0n) continue;
      await kaliteDegistir(db, g.kisiId, {
        malzemeId: parca.malzemeId, konumId: konum, partiId: b.partiId, statuId: b.statuId, kaynak: 'serbest', hedef: 'red', miktar,
        uretimEmriId: g.uretimEmriId, aciklama: `Lot reddi ${g.lotNo} · emir ${emir?.emirNo ?? String(g.uretimEmriId)}`,
      });
      kalan -= miktar;
    }
  });
  return bindenMetin(parca.miktar - kalan);
}
async function numuneKutusu(db: Db): Promise<{ id: number; tur: string } | { atlandi: string }> {
  const ad = (x: string) => x.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');
  const kutular = (await sorgular.adiGecenKonumlar(db, 'numune')).filter((k) => ad(k.ad) === ad(NUMUNE_KUTUSU));
  if (kutular.length === 0) return { atlandi: `Fabrika Haritası'nda "${NUMUNE_KUTUSU}" kutusu yok; numunenin teslimi stoğa yazılmadı.` };
  if (kutular.length > 1) return { atlandi: `"${NUMUNE_KUTUSU}" adlı birden çok kutu var (${kutular.map((k) => k.kod).join(', ')}); numunenin teslimi stoğa yazılmadı.` };
  return kutular[0]!;
}
export async function numuneTeslimi(db: Db, g: NumuneTeslimi): Promise<NumuneTeslimSonucu> {
  const kaynakKimligi = `numune:${g.kaynakKimligi}`.slice(0, 120);
  const onceki = await sorgular.teslimKaynaktan(db, kaynakKimligi);
  if (onceki) return { teslim: { id: onceki.id, no: onceki.no } };
  if (g.hedefIstasyonId === g.istasyonId) return { atlandi: 'Numune kendi istasyonuna gönderilemez; numunenin teslimi stoğa yazılmadı.' };
  const kutu = g.hedefIstasyonId != null ? { id: await istasyonKonumuBul(db, g.hedefIstasyonId, 'hedefIstasyonId'), tur: 'istasyon' } : await numuneKutusu(db);
  if ('atlandi' in kutu) return kutu;
  const kaynak = await sorgular.istasyonKonumu(db, g.istasyonId);
  const parca = await adimParcasi(db, g.uretimEmriId, g.isEmriId, binde(String(g.adet)));
  if (kaynak === null || parca === null) return { atlandi: 'Bu adımın parçası stokta izlenmiyor; numunenin teslimi stoğa yazılmadı.' };
  const id = await korumali(async () => {
    const yer = (await sorgular.uretimGirdiKaynaklari(db, parca.malzemeId, parca.statuId, kaynak, g.uretimEmriId))
      .find((x) => x.konumId === kaynak && binde(x.serbest) >= parca.miktar);
    if (!yer) return null;
    const emir = await uretimEmriOzeti(db, g.uretimEmriId);
    return teslimYaz(db, {
      no: await belgeNo(db, 'stok.teslim-no', 'stok_teslim'), kaynakKimligi, malzemeId: parca.malzemeId, miktar: bindenMetin(parca.miktar), partiId: yer.partiId,
      statuId: parca.statuId, kaliteDurumu: 'serbest', kaynakKonumId: kaynak, hedefKonumId: kutu.id, uretimEmriId: g.uretimEmriId, isEmriId: g.isEmriId, istekId: null,
      aciklama: `Numune · emir ${emir?.emirNo ?? String(g.uretimEmriId)}`, gonderenKisiId: g.kisiId,
    });
  });
  const t = await sorgular.teslimKaynaktan(db, kaynakKimligi);
  if (t === null) return { atlandi: 'İstasyonda numunelik parça yok; numunenin teslimi stoğa yazılmadı.' };
  if (id !== null && kutu.tur === 'ara_alan') await teslimiKapat(db, g.kisiId, (await sorgular.teslimBul(db, t.id, true))!, t.miktar, t.surum, 'miktar');
  return { teslim: { id: t.id, no: t.no } };
}

// ---- Numune kararı (2131-3 a) ---------------------------------------------------------------------------------------------------
// Kaliteye giden numunenin kararı parçaya yansır: onay ve sapmada parça hatta döner (geldiği istasyona yolda teslim; hat "Teslim al" ile
// alır), retde bulunduğu yerde red kalitesine geçer (parça yerinde kalır, 135). Teslimi hâlâ yoldaysa: onayda teslim iptal olur, parça
// istasyondan hiç çıkmamış sayılır; retde kalite almış sayılır (karar ölçülmüş parçaya verilir). Karar numuneyi durdurmaz: teslimi olmayan,
// reddedilmiş ya da iptal edilmiş numunede ya da parça yerinde değilse stok yazılmaz, neden döner. Aynı numunenin ikinci yansıması
// ikinci dönüş ya da ikinci ret yazmaz: dönüş teslimi kaynak kimliğiyle tektir, ret teslimin notuyla işaretlenir.
export interface NumuneKarariYansimasi { kaynakKimligi: string; karar: 'onay' | 'ret' | 'sapma'; kisiId: number }
export type NumuneKarariSonucu = { donus: { id: number; no: string } } | { iptal: { id: number; no: string } } | { red: string } | { atlandi: string };
const NUMUNE_RED_NOTU = 'Numune reddedildi';
export async function numuneKarariYansit(db: Db, g: NumuneKarariYansimasi): Promise<NumuneKarariSonucu> {
  const kaynakKimligi = `numune:${g.kaynakKimligi}`.slice(0, 120);
  let t = await sorgular.teslimKaynaktan(db, kaynakKimligi);
  if (t === null) return { atlandi: 'Numunenin stok teslimi yok; karar stoğa yazılmadı.' };
  if (t.durum === 'red' || t.durum === 'iptal') return { atlandi: 'Numunenin teslimi kapanmış (reddedildi ya da iptal); karar stoğa yazılmadı.' };
  if (t.durum === 'yolda' && g.karar !== 'ret') {
    const kapanan = await sorgular.teslimKapat(db, t.id, t.surum, { durum: 'iptal', alinan: null, redNedeni: null, hareketId: null, kisiId: g.kisiId });
    if (kapanan === null) throw cakisma('Numunenin teslimi bu arada değişti; yeniden deneyin.');
    await sorgular.teslimeNotYaz(db, t.id, 'Numune onaylandı; parça istasyonda kaldı');
    return { iptal: { id: t.id, no: t.no } };
  }
  if (t.durum === 'yolda') {
    await teslimiKapat(db, g.kisiId, t, t.miktar, t.surum, 'miktar');
    t = (await sorgular.teslimBul(db, t.id))!;
  }
  const miktar = binde(t.alinan ?? t.miktar);
  const emir = t.uretimEmriId === null ? null : await uretimEmriOzeti(db, t.uretimEmriId);
  const emirNo = emir?.emirNo ?? (t.uretimEmriId === null ? '' : String(t.uretimEmriId));
  if (g.karar === 'ret') {
    if ((t.aciklama ?? '').startsWith(NUMUNE_RED_NOTU)) return { red: bindenMetin(0n) };
    const gecen = await korumali(async () => {
      const b = await sorgular.bakiyeKilitle(db, t.malzemeId, t.hedefKonumId, t.partiId, t.statuId, 'serbest');
      const yolda = binde(await sorgular.yoldaAyrilan(db, t.malzemeId, t.hedefKonumId, t.partiId, t.statuId, 'serbest'));
      const bos = binde(b?.miktar ?? '0') - yolda;
      const m = bos < miktar ? bos : miktar;
      if (m <= 0n) return 0n;
      await kaliteDegistir(db, g.kisiId, {
        malzemeId: t.malzemeId, konumId: t.hedefKonumId, partiId: t.partiId, statuId: t.statuId, kaynak: 'serbest', hedef: 'red', miktar: m,
        uretimEmriId: t.uretimEmriId, aciklama: `Numune reddi · teslim ${t.no}${emirNo === '' ? '' : ` · emir ${emirNo}`}`,
      });
      return m;
    });
    if (gecen === 0n) return { atlandi: 'Numunenin parçası teslim edildiği yerde serbest değil; ret stoğa yazılmadı.' };
    await sorgular.teslimeNotYaz(db, t.id, NUMUNE_RED_NOTU);
    return { red: bindenMetin(gecen) };
  }
  const donusKimligi = `numune-donus:${g.kaynakKimligi}`.slice(0, 120);
  const onceki = await sorgular.teslimKaynaktan(db, donusKimligi);
  if (onceki !== null) return { donus: { id: onceki.id, no: onceki.no } };
  const id = await korumali(async () => {
    const b = await sorgular.bakiyeKilitle(db, t.malzemeId, t.hedefKonumId, t.partiId, t.statuId, 'serbest');
    const yolda = binde(await sorgular.yoldaAyrilan(db, t.malzemeId, t.hedefKonumId, t.partiId, t.statuId, 'serbest'));
    if (binde(b?.miktar ?? '0') - yolda < miktar) return null;
    return teslimYaz(db, {
      no: await belgeNo(db, 'stok.teslim-no', 'stok_teslim'), kaynakKimligi: donusKimligi, malzemeId: t.malzemeId, miktar: bindenMetin(miktar), partiId: t.partiId,
      statuId: t.statuId, kaliteDurumu: 'serbest', kaynakKonumId: t.hedefKonumId, hedefKonumId: t.kaynakKonumId, uretimEmriId: t.uretimEmriId, istekId: null,
      aciklama: `Numune dönüşü · ${g.karar === 'sapma' ? 'sapma' : 'onay'}${emirNo === '' ? '' : ` · emir ${emirNo}`}`, gonderenKisiId: g.kisiId,
    });
  });
  const donus = await sorgular.teslimKaynaktan(db, donusKimligi);
  if (id === null && donus === null) return { atlandi: 'Numunenin parçası teslim edildiği yerde serbest değil; dönüş stoğa yazılmadı.' };
  return { donus: { id: donus!.id, no: donus!.no } };
}

// ---- Fasona gönderim (kart #1310, iki adım) ------------------------------------------------------------------------------------
// Gönderimde parça önceki adımın istasyonundan firmanın "Yolda" konumuna geçer; sevkiyat işi tamamlanınca firmanın fason konumuna.
// Sağlam dönüşü mal kabul alır (giden fason konumundan düşer); Dış operasyonlardaki dönüş yalnız hurdayı firmadan düşer. Kalan
// parça firmada görünür; fason işi kapanmış emrin firmada kalanı iş kutusunda "eksik" uyarısıdır.
async function firmaKonumuBul(db: Db, firmaId: number, tur: 'yolda' | 'fason'): Promise<number> {
  const varOlan = await sorgular.firmaKonumu(db, firmaId, tur);
  if (varOlan !== null) return varOlan;
  const firma = (await firmaAdlari(db, [firmaId])).get(firmaId) ?? `Firma ${String(firmaId)}`;
  const ad = (tur === 'yolda' ? `Yolda · ${firma}` : firma).slice(0, 60);
  const depoId = await anaDepo(db);
  const onek = `${tur === 'yolda' ? 'YLD' : 'FSN'}-${String(firmaId)}`;
  // Kod elle açılmış bir konumla çakışırsa sonraki ek denenir; eşzamanlı açılışta öteki işlemin konumu kullanılır.
  for (let ek = 0; ; ek += 1) {
    const id = await sorgular.firmaKonumuAc(db, { depoId, kod: ek === 0 ? onek : `${onek}-${String(ek)}`, ad, firmaId, tur });
    if (id !== null) return id;
    const acilan = await sorgular.firmaKonumu(db, firmaId, tur);
    if (acilan !== null) return acilan;
  }
}

// Emrin partisinden (statüsü korunarak) en eskiden başlayıp en çok `miktar` taşır; yolda teslime ayrılan dokunulmaz. Taşınan döner:
// konumda yeterli parça yoksa olan taşınır, gönderim reddedilmez (sayım eksik girilmiş olabilir).
async function emirParcasiniTasi(db: Db, kisiId: number, d: { malzemeId: number; uretimEmriId: number; kaynak: number; hedef: number; miktar: bigint; aciklama: string }): Promise<bigint> {
  let kalan = d.miktar;
  for (const b of await sorgular.istasyondakiEmirBakiyeleri(db, d.kaynak, d.malzemeId, d.uretimEmriId)) {
    if (kalan === 0n) break;
    const serbest = binde(b.miktar) - binde(b.ayrilan);
    const anahtar = { malzemeId: d.malzemeId, partiId: b.partiId, statuId: b.statuId, kaliteDurumu: b.kaliteDurumu };
    if (serbest <= 0n) continue;
    await siraliKilitle(db, { ...anahtar, konumId: d.kaynak }, { ...anahtar, konumId: d.hedef });
    const tasinan = await kilitliOlan(db, { ...anahtar, konumId: d.kaynak }, b.miktar, serbest < kalan ? serbest : kalan);
    if (tasinan <= 0n) continue;
    await sorgular.hareketYaz(db, hareket({
      tur: 'transfer', malzemeId: d.malzemeId, miktar: bindenMetin(tasinan), kisiId, partiId: b.partiId, partiSecimi: 'kisi', kaynakKonumId: d.kaynak, hedefKonumId: d.hedef,
      kaynakStatuId: b.statuId, hedefStatuId: b.statuId, kaynakKaliteDurumu: b.kaliteDurumu, hedefKaliteDurumu: b.kaliteDurumu, uretimEmriId: d.uretimEmriId, aciklama: d.aciklama,
    }));
    await bakiyeDegistir(db, { ...anahtar, konumId: d.kaynak, fark: -tasinan });
    await bakiyeDegistir(db, { ...anahtar, konumId: d.hedef, fark: tasinan, ilkGiris: new Date().toISOString() });
    kalan -= tasinan;
  }
  return d.miktar - kalan;
}

// Girdili emirde fasona giden yarı parça (kart #1289): önceki adımın çıktısı varsa o (emrin partisi), yoksa taşınan malzemenin önceki adım
// statüsündeki hâli (tedarikçi partisi). Taşınan yoksa (girdisiz rota) ya da fason ilk adımsa null: emrin ürünü gider.
// birim: bir adetin stok miktarı (taşınan girdinin reçete miktarı; çıktı için 1).
interface YariParca { malzemeId: number; statuId: number | null; emirPartisi: boolean; birim: string }
export async function fasonYariParcasi(db: Db, uretimEmriId: number, urunNo: number, isEmriId: number): Promise<YariParca | null> {
  const bilgi = await adimBilgisi(db, isEmriId);
  if (!bilgi) return null;
  // Dallı emirde (1348 a) yarı parça tek öncülden devralınan parçadır; dal başı ve birleştirme fasonunda emrin ürünü gider.
  const dalli = await dalliTasima(db, urunNo, bilgi, uretimEmriId);
  if (dalli !== null) {
    const p = dalli.kaynak.tur === 'oncul' ? dalli.gelenler[0] : undefined;
    if (p === undefined) return null;
    const ciktili = adimCiktisi !== null && (await adimCiktisi(db, { malzemeNo: urunNo, opNo: p.opNo, uretimEmriId })) !== null;
    // Birleştirmeden çıkan ürün statüdedir ama emrin partisiyle girer.
    const emirPartisi = ciktili || p.malzemeId === urunNo;
    return { malzemeId: p.malzemeId, statuId: p.statuId, emirPartisi, birim: p.miktar };
  }
  const onceki = bilgi.oncekiOpNolari.at(-1);
  if (onceki === undefined) return null;
  const cikti = async (opNo: number) => (adimCiktisi === null ? null : adimCiktisi(db, { malzemeNo: urunNo, opNo, uretimEmriId }));
  const oncekiCikti = await cikti(onceki);
  if (oncekiCikti !== null) return { malzemeId: oncekiCikti, statuId: null, emirPartisi: true, birim: '1' };
  let tasinan = bilgi.tasinan;
  for (const op of [...bilgi.oncekiOpNolari].reverse()) {
    const c = await cikti(op);
    if (c !== null) { tasinan = { malzemeNo: c, miktar: '1' }; break; }
  }
  if (tasinan === null) return null;
  const statuId = adimStatusu === null ? null : await adimStatusu(db, { malzemeNo: urunNo, opNo: onceki, uretimEmriId });
  return { malzemeId: tasinan.malzemeNo, statuId, emirPartisi: false, birim: tasinan.miktar };
}
// Yarı parçayı konumlardan sırayla, en eskiden en çok `miktar` taşır (statüsü korunur); olan kadar taşınır, taşınan döner. Kaynak serbest
// bakiyedir; hedef kalite verilirse parça hedefte o kaliteyle durur (fason dönüşü karar bekliyor).
async function yariParcayiTasi(
  db: Db, kisiId: number, p: YariParca, d: { uretimEmriId: number; kaynaklar: number[]; hedef: number; miktar: bigint; aciklama: string; hedefKalite?: KaliteDurumu },
): Promise<{ tasinan: bigint; sonHareketId: number | null }> {
  const hedefKalite = d.hedefKalite ?? 'serbest';
  let kalan = d.miktar;
  let sonHareketId: number | null = null;
  for (const kaynak of d.kaynaklar) {
    for (const b of await sorgular.konumdakiParcaBakiyeleri(db, kaynak, p.malzemeId, p.statuId, p.emirPartisi ? d.uretimEmriId : null)) {
      if (kalan === 0n) return { tasinan: d.miktar, sonHareketId };
      const serbest = binde(b.miktar) - binde(b.ayrilan);
      if (serbest <= 0n) continue;
      const anahtar = { malzemeId: p.malzemeId, partiId: b.partiId, statuId: p.statuId };
      await siraliKilitle(db, { ...anahtar, konumId: kaynak }, { ...anahtar, konumId: d.hedef, kaliteDurumu: hedefKalite });
      const tasinan = await kilitliOlan(db, { ...anahtar, konumId: kaynak }, b.miktar, serbest < kalan ? serbest : kalan);
      if (tasinan <= 0n) continue;
      sonHareketId = await sorgular.hareketYaz(db, hareket({
        tur: 'transfer', malzemeId: p.malzemeId, miktar: bindenMetin(tasinan), kisiId, partiId: b.partiId, partiSecimi: b.partiId === null ? null : 'kisi', kaynakKonumId: kaynak,
        hedefKonumId: d.hedef, kaynakStatuId: p.statuId, hedefStatuId: p.statuId, kaynakKaliteDurumu: 'serbest', hedefKaliteDurumu: hedefKalite, uretimEmriId: d.uretimEmriId,
        aciklama: d.aciklama,
      }));
      await bakiyeDegistir(db, { ...anahtar, konumId: kaynak, fark: -tasinan });
      await bakiyeDegistir(db, { ...anahtar, konumId: d.hedef, kaliteDurumu: hedefKalite, fark: tasinan, ilkGiris: new Date().toISOString() });
      kalan -= tasinan;
    }
  }
  return { tasinan: d.miktar - kalan, sonHareketId };
}
// Yarı parçanın hurdası firmadan fire çıkışıyla düşer; olmayan düşülmez.
async function yariParcayiDus(db: Db, kisiId: number, p: YariParca, d: { uretimEmriId: number; konumlar: number[]; miktar: bigint; aciklama: string }): Promise<void> {
  let kalan = d.miktar;
  for (const konumId of d.konumlar) {
    for (const b of await sorgular.konumdakiParcaBakiyeleri(db, konumId, p.malzemeId, p.statuId, p.emirPartisi ? d.uretimEmriId : null)) {
      if (kalan === 0n) return;
      const serbest = binde(b.miktar) - binde(b.ayrilan);
      if (serbest <= 0n) continue;
      const anahtar = { malzemeId: p.malzemeId, konumId, partiId: b.partiId, statuId: p.statuId };
      await siraliKilitle(db, anahtar);
      const dusulen = await kilitliOlan(db, anahtar, b.miktar, serbest < kalan ? serbest : kalan);
      if (dusulen <= 0n) continue;
      await sorgular.hareketYaz(db, hareket({
        tur: 'cikis', malzemeId: p.malzemeId, miktar: bindenMetin(dusulen), kisiId, partiId: b.partiId, partiSecimi: b.partiId === null ? null : 'kisi', kaynakKonumId: konumId,
        kaynakStatuId: p.statuId, cikisNedeni: 'fire', uretimEmriId: d.uretimEmriId, aciklama: d.aciklama,
      }));
      await bakiyeDegistir(db, { malzemeId: p.malzemeId, konumId, partiId: b.partiId, statuId: p.statuId, fark: -dusulen });
      await rezerveDegistir(db, { malzemeId: p.malzemeId, statuId: p.statuId, uretimEmriId: d.uretimEmriId, fark: -dusulen });
      kalan -= dusulen;
    }
  }
}

// Hurda firmadan (önce fason konumu, sonra yolda) fire çıkışıyla düşer; olmayan düşülmez, bakiye eksiye inmez.
async function emirParcasiniDus(db: Db, kisiId: number, d: { malzemeId: number; uretimEmriId: number; konumlar: number[]; miktar: bigint; aciklama: string }): Promise<void> {
  let kalan = d.miktar;
  for (const konumId of d.konumlar) {
    for (const b of await sorgular.istasyondakiEmirBakiyeleri(db, konumId, d.malzemeId, d.uretimEmriId)) {
      if (kalan === 0n) return;
      const serbest = binde(b.miktar) - binde(b.ayrilan);
      if (serbest <= 0n) continue;
      const anahtar = { malzemeId: d.malzemeId, konumId, partiId: b.partiId, statuId: b.statuId, kaliteDurumu: b.kaliteDurumu };
      await siraliKilitle(db, anahtar);
      const dusulen = await kilitliOlan(db, anahtar, b.miktar, serbest < kalan ? serbest : kalan);
      if (dusulen <= 0n) continue;
      await sorgular.hareketYaz(db, hareket({
        tur: 'cikis', malzemeId: d.malzemeId, miktar: bindenMetin(dusulen), kisiId, partiId: b.partiId, partiSecimi: 'kisi', kaynakKonumId: konumId,
        kaynakStatuId: b.statuId, kaynakKaliteDurumu: b.kaliteDurumu, cikisNedeni: 'fire', uretimEmriId: d.uretimEmriId, aciklama: d.aciklama,
      }));
      await bakiyeDegistir(db, { malzemeId: d.malzemeId, konumId, partiId: b.partiId, statuId: b.statuId, kaliteDurumu: b.kaliteDurumu, fark: -dusulen });
      await rezerveDegistir(db, { malzemeId: d.malzemeId, statuId: b.statuId, uretimEmriId: d.uretimEmriId, fark: -dusulen });
      kalan -= dusulen;
    }
  }
}

// Fason hareketinin emri stoğa ürün kartıyla girmişse (mamul, yarı mamul) kartı ve emir numarası; değilse null (stok izlemez).
async function fasonBaglami(db: Db, hareketId: number) {
  const h = await fasonHareketiOzeti(db, hareketId);
  if (!h) return null;
  const emir = await uretimEmriOzeti(db, h.uretimEmriId);
  if (!emir || emir.malzemeNo === null) return null;
  const o = await malzemeOzeti(db, emir.malzemeNo);
  if (!o || (o.tur !== 'mamul' && o.tur !== 'yarimamul')) return null;
  return { h, malzemeId: emir.malzemeNo, emirNo: emir.emirNo, yari: await fasonYariParcasi(db, h.uretimEmriId, emir.malzemeNo, h.isEmriId) };
}
const firmaKonumlari = async (db: Db, firmaId: number): Promise<number[]> => {
  const konumlar: number[] = [];
  for (const tur of ['fason', 'yolda'] as const) {
    const k = await sorgular.firmaKonumu(db, firmaId, tur);
    if (k !== null) konumlar.push(k);
  }
  return konumlar;
};

export async function fasonHareketiYansit(db: Db, olay: FasonHareketiOlayi): Promise<void> {
  const b = await fasonBaglami(db, olay.hareketId);
  if (!b) return;
  const { h, malzemeId } = b;
  const aciklama = `Fason ${h.yon === 'gidis' ? 'gönderimi' : 'dönüşü'} · emir ${b.emirNo}`;
  if (h.yon === 'gidis') {
    if (h.adet <= 0 || olay.oncekiIsEmriId === null) return;
    const onceki = await isEmriOzeti(db, olay.oncekiIsEmriId);
    const kaynak = onceki?.istasyonId == null ? null : await sorgular.istasyonKonumu(db, onceki.istasyonId);
    if (kaynak === null) return;
    const hedef = await firmaKonumuBul(db, h.firmaId, 'yolda');
    const yari = b.yari;
    await korumali(() => (yari
      ? yariParcayiTasi(db, olay.kisiId, yari, { uretimEmriId: h.uretimEmriId, kaynaklar: [kaynak], hedef, miktar: adetMiktari(BigInt(h.adet) * 1000n, yari.birim), aciklama }).then((x) => x.tasinan)
      : emirParcasiniTasi(db, olay.kisiId, { malzemeId, uretimEmriId: h.uretimEmriId, kaynak, hedef, miktar: BigInt(h.adet) * 1000n, aciklama })));
    return;
  }
  const konumlar = await firmaKonumlari(db, h.firmaId);
  if (h.hurdaAdet && h.hurdaAdet > 0) {
    const yari = b.yari;
    const adet = BigInt(h.hurdaAdet) * 1000n;
    const d = { uretimEmriId: h.uretimEmriId, konumlar, aciklama: `${aciklama} · hurda` };
    await korumali(() => (yari ? yariParcayiDus(db, olay.kisiId, yari, { ...d, miktar: adetMiktari(adet, yari.birim) }) : emirParcasiniDus(db, olay.kisiId, { malzemeId, ...d, miktar: adet })));
  }
}
// Fasondan dönüş yalnız mal kabulle girer (kullanıcı kararları, kart #1289 ve 15.10 B): satır fason işine bağlanır, dönüş kaydı üretim
// emrine buradan yazılır. 1205, 1207 c: mal kabul sağlam ve hurda ayırmaz; dönen adedin hepsi karantinaya karar bekliyor girer, kabul ve
// hatalı kararını GKK adımı verir (gelmeyen parça da orada hatalı sayılır). Parça firmadan (fason, sonra yolda) gelir ve fason adımının
// sayımı gibi yansır; rotadaki seçim belirler: adımın çıkanı varsa (YM, MM; son adımda ürün) o girer ve yarı parça emre sarf edilir, yoksa
// yarı parça adımın statüsüne çevrilir. Girdisiz rotada emrin ürünü olduğu gibi döner. Satırın kartı dönen karttır; firmada olandan
// fazlası gelmez, eksik firmada kalır. Dönen stok miktarı ve satırın hareketi döner.
export async function fasonIsindenDonus(
  db: Db, kisiId: number, d: { isEmriId: number; malzemeId: number; adet: bigint; konumId: number; alan: string },
): Promise<{ miktar: bigint; hareketId: number }> {
  const is = await isEmriOzeti(db, d.isEmriId);
  if (!is || is.kaynak?.tur !== 'fason') throw dogrulama('Fason işi bulunamadı.', `${d.alan}.fasonIsi`);
  if (d.adet <= 0n || d.adet % 1000n !== 0n) throw dogrulama('Fason işinden dönen sağlam adet sıfırdan büyük tam sayıdır.', `${d.alan}.miktar`);
  const plan = await fasonDonusPlani(db, is.uretimEmriId, d.isEmriId, d.adet);
  if (!plan) throw dogrulama('Fason işinin emri bulunamadı.', `${d.alan}.fasonIsi`);
  if (plan.donenKart !== d.malzemeId) {
    const kart = await malzemeOzeti(db, plan.donenKart);
    throw dogrulama(`Bu fason işinden ${kart?.kod ?? `kart ${String(plan.donenKart)}`} döner (rotadaki seçim).`, `${d.alan}.malzemeId`);
  }
  const aciklama = `Fason dönüşü · emir ${is.emirNo} · OP ${String(is.opNo)}`;
  const konumlar = await firmaKonumlari(db, is.kaynak.id);
  // Firmada olandan fazlası gelmez: dönen adet firmada kalan tam adede indirilir (kalan firmada eksik görünür).
  let firmada = 0n;
  for (const k of konumlar) {
    for (const b of await sorgular.konumdakiParcaBakiyeleri(db, k, plan.yari.malzemeId, plan.yari.statuId, plan.yari.emirPartisi ? is.uretimEmriId : null)) firmada += binde(b.miktar) - binde(b.ayrilan);
  }
  const birAdet = adetMiktari(1000n, plan.yari.birim);
  const olan = birAdet > 0n ? (firmada / birAdet) * 1000n : 0n;
  const adet = d.adet < olan ? d.adet : olan;
  if (adet <= 0n) throw dogrulama('Firmada bu işin parçası yok; gönderim Dış operasyonlardan yazılır.', `${d.alan}.fasonIsi`);
  await fasonDonusuKaydet(db, kisiId, is.uretimEmriId, d.isEmriId, Number(adet / 1000n), 0);
  const t = await yariParcayiTasi(db, kisiId, plan.yari, {
    uretimEmriId: is.uretimEmriId, kaynaklar: konumlar, hedef: d.konumId, miktar: adetMiktari(adet, plan.yari.birim), aciklama, hedefKalite: 'karar_bekliyor',
  });
  if (plan.uretim === null) {
    if (t.sonHareketId === null) throw dogrulama('Firmada bu işin parçası yok.', `${d.alan}.fasonIsi`);
    return { miktar: t.tasinan, hareketId: t.sonHareketId };
  }
  const p = adet === d.adet ? plan.uretim : (await fasonDonusPlani(db, is.uretimEmriId, d.isEmriId, adet))!.uretim!;
  const hareketId = await uretimAdiminiYaz(db, { uretimEmriId: is.uretimEmriId, kisiId, konumId: d.konumId, malzemeId: plan.urun, aciklama, kalite: 'karar_bekliyor' }, p);
  if (hareketId === null) throw dogrulama('Bu fason işinin adımı stoğa parça çıkarmıyor.', `${d.alan}.fasonIsi`);
  return { miktar: p.giris !== null ? p.giris.miktar : (p.cevirme?.miktar ?? adetMiktari(adet, plan.yari.birim)), hareketId };
}
// Fason adımının dönüş planı: yarı parça, adımın sayım planı ve dönen kart. Emrin ürünü gidiyorsa (girdisiz rota) plan yoktur, ürün döner.
async function fasonDonusPlani(db: Db, uretimEmriId: number, isEmriId: number, adet: bigint) {
  const emir = await uretimEmriOzeti(db, uretimEmriId);
  if (!emir || emir.malzemeNo === null) return null;
  const urun = emir.malzemeNo;
  const yari = await fasonYariParcasi(db, uretimEmriId, urun, isEmriId);
  const bilgi = await adimBilgisi(db, isEmriId);
  const uretim = yari && bilgi ? await adimPlaniKur(db, uretimEmriId, urun, adimStatusu === null ? null : await adimStatusu(db, { malzemeNo: urun, opNo: bilgi.opNo, uretimEmriId }), bilgi, adet) : null;
  if (!yari || !uretim) return { urun, yari: { malzemeId: urun, statuId: null, emirPartisi: true, birim: '1' } satisfies YariParca, uretim: null, donenKart: urun, statulu: false };
  const donenKart = uretim.giris !== null ? (uretim.giris.malzemeId ?? urun) : yari.malzemeId;
  return { urun, yari, uretim, donenKart, statulu: uretim.giris === null };
}
// Mal kabulün fason kutusu: firmanın açık emirlerindeki fason işleri, rotaya göre dönecek kartla (girdili emirde).
export async function fasonIsleri(db: Db, konumId: number): Promise<FasonIsleriCevabi> {
  const konum = await sorgular.konumBul(db, konumId);
  if (!konum || konum.tur !== 'fason') throw dogrulama('Fason kutusu bulunamadı.', 'konumId');
  const firmaId = await sorgular.konumFirmasi(db, konumId);
  if (firmaId === null) return { isler: [] };
  const isler = (await fasonIsEmirleri(db)).filter((x) => x.firmaId === firmaId && (x.gonderilen ?? 0) > 0);
  const durumlar = await emirDurumlari(db, isler.map((x) => x.uretimEmriId));
  const sonuc: FasonIsleriCevabi['isler'] = [];
  for (const x of isler) {
    if (!(ACIK_EMIR_DURUMLARI as readonly string[]).includes(durumlar.get(x.uretimEmriId) ?? '')) continue;
    const plan = await fasonDonusPlani(db, x.uretimEmriId, x.isEmriId, 1000n);
    if (!plan) continue;
    const kart = await malzemeOzeti(db, plan.donenKart);
    sonuc.push({
      isEmriId: x.isEmriId, emirNo: x.emirNo, opNo: x.opNo, adim: x.adim, gonderilen: x.gonderilen ?? 0, donen: x.donen ?? 0, hurda: x.hurda ?? 0,
      donenKart: { malzemeId: plan.donenKart, kod: kart?.kod ?? null, ad: kart?.ad ?? null, birim: kart?.birim ?? null }, statulu: plan.statulu,
    });
  }
  return { isler: sonuc };
}

// Sevkiyat teslimi: gönderilen adet firmanın Yolda konumundan fason konumuna geçer; teslim geri alınırsa geri döner.
export async function fasonSevkiYansit(db: Db, olay: FasonSevkiOlayi): Promise<void> {
  for (const hareketId of olay.fasonHareketIdleri) {
    if (olay.kisiId === null) throw new Error('Fason teslimi kişisiz yazılamaz');
    await fasonGidisiniTasi(db, olay.kisiId, hareketId, olay.teslim, olay.teslim ? 'Fason sevkiyatı teslim edildi' : 'Fason sevkiyatı teslimi geri alındı');
  }
}
async function fasonGidisiniTasi(db: Db, kisiId: number, hareketId: number, fasona: boolean, neden: string): Promise<void> {
  const b = await fasonBaglami(db, hareketId);
  if (!b || b.h.yon !== 'gidis' || b.h.adet <= 0) return;
  const yolda = await firmaKonumuBul(db, b.h.firmaId, 'yolda');
  const fason = await firmaKonumuBul(db, b.h.firmaId, 'fason');
  const [kaynak, hedef] = fasona ? [yolda, fason] : [fason, yolda];
  const aciklama = `${neden} · emir ${b.emirNo}`;
  const adet = BigInt(b.h.adet) * 1000n;
  const yari = b.yari;
  await korumali(() => (yari
    ? yariParcayiTasi(db, kisiId, yari, { uretimEmriId: b.h.uretimEmriId, kaynaklar: [kaynak], hedef, miktar: adetMiktari(adet, yari.birim), aciklama }).then((x) => x.tasinan)
    : emirParcasiniTasi(db, kisiId, { malzemeId: b.malzemeId, uretimEmriId: b.h.uretimEmriId, kaynak, hedef, miktar: adet, aciklama })));
}

// ---- Ürün sevki (235 a) ---------------------------------------------------------------------------------------------------------
// Sevkiyatta ürün işi durum değiştirince (E-12) emrin ürünü yola çıkışta müşteri firmasının Yolda konumuna geçer, teslimde Yolda'dan
// sevk çıkışıyla düşer; geri dönüşler bu hareketleri geri alır, parça geldiği konuma döner. Lot, statü ve kalite korunur. Firmasız
// noktada Yolda adımı yoktur: teslim parçayı bulunduğu konumdan düşer. Red parça çıkar, hareketin açıklaması bunu söyler (147 b).
// İş kimliği açıklamadadır: geri alma aynı işin hareketlerini bulur, aynı emrin başka işine dokunmaz.
const RED_EKI = ' · red parça';
// 1222 a: açık uygunsuzluğu (NCR) olan partiler Kalite Merkezi'nindir; stok onu ithal edemez, bağı sunucu/kablolama.ts kurar.
// Kayıt yokken hiçbir parti açık NCR'li sayılmaz.
export type AcikNcrPartiCozucusu = (db: Db, partiIdler: readonly number[]) => Promise<ReadonlySet<number>>;
let acikNcrPartiCozucu: AcikNcrPartiCozucusu | null = null;
export function acikNcrPartiCozucusuKaydet(cozucu: AcikNcrPartiCozucusu): void { acikNcrPartiCozucu = cozucu; }
const acikNcrPartileri = async (db: Db, bakiyeler: readonly SevkBakiyesi[]): Promise<ReadonlySet<number>> =>
  acikNcrPartiCozucu === null || bakiyeler.length === 0 ? new Set() : acikNcrPartiCozucu(db, [...new Set(bakiyeler.map((b) => b.partiId))]);
const ncrEngelMetni = (ncrEngelli: bigint): string => (ncrEngelli > 0n ? ` ${bindenMetin(ncrEngelli)} adet açık uygunsuzluk (NCR) kaydında; sevk edilemez.` : '');

// 1059 a: yetmeyen sevk reddedilmez; eksik son seçilen lota eklenir, o lot bulunduğu konumda eksiye düşer (sonraki giriş tamamlar).
// Kalite kararı bekleyen, karantinadaki ya da açık NCR'li parça varken, ya da emrin hiç parçası yokken (eksiye düşecek lot ve konum yok)
// reddedilir. Eksik red olmayan son lota yazılır: eksiye düşen miktar red parça sayılmasın.
function sevkEksiginiYukle(emirNo: string, istenen: bigint, r: ReturnType<typeof sevkKaynaklariSec>): void {
  if (r.eksik === 0n) return;
  const ileti = `Emir ${emirNo}: sevk için ${bindenMetin(istenen)} adet gerekli, stokta ${bindenMetin(istenen - r.eksik)} adet var.`;
  const kalite = r.engelli > 0n ? ` ${bindenMetin(r.engelli)} adet kalite kararı bekliyor ya da karantinada; sevk edilemez.` : '';
  if (r.engelli > 0n || r.ncrEngelli > 0n) throw cakisma(`${ileti}${kalite}${ncrEngelMetni(r.ncrEngelli)}`);
  const son = r.secim.findLast((b) => b.kaliteDurumu !== 'red') ?? r.secim.at(-1);
  if (son === undefined) throw cakisma(`${ileti} Eksiye düşecek lot yok.`);
  son.alinan += r.eksik;
}

// Taşınan ya da düşülen red parça ve eksiye düşen miktar döner: sevkiyat uyarıyı kullanıcıya gösterir.
async function sevkTasi(db: Db, kisiId: number, s: UrunSevkSatiri, malzemeId: number, emirNo: string, adim: 'yola' | 'teslim', hedef: number | null): Promise<{ red: bigint; eksi: bigint }> {
  const istenen = s.adet === null ? null : sevkAdediBinde(s.adet);
  if (istenen === null) throw gecersiz(`Emir ${emirNo}: sevk adedi bilinmiyor; stok yazılamaz.`);
  if (istenen <= 0n) return { red: 0n, eksi: 0n };
  const yolda = adim === 'teslim' && s.firmaId !== null ? await firmaKonumuBul(db, s.firmaId, 'yolda') : null;
  const bakiyeler = yolda === null
    ? await sorgular.emrinSevkBakiyeleri(db, malzemeId, s.uretimEmriId)
    : (await sorgular.istasyondakiEmirBakiyeleri(db, yolda, malzemeId, s.uretimEmriId)).map((b) => ({ ...b, konumId: yolda, konumTuru: 'yolda' as const }));
  const r = sevkKaynaklariSec(bakiyeler, istenen, await acikNcrPartileri(db, bakiyeler));
  sevkEksiginiYukle(emirNo, istenen, r);
  return sevkSeciminiYaz(db, kisiId, r.secim, { malzemeId, uretimEmriId: s.uretimEmriId, hedef, aciklama: sevkAciklamasi(s.isId, emirNo, adim) });
}
// Seçilen bakiyeler hedefe taşınır ya da (hedef yoksa) sevk çıkışıyla düşer; red parçanın açıklaması ekini taşır.
async function sevkSeciminiYaz(
  db: Db, kisiId: number, secim: readonly (SevkBakiyesi & { alinan: bigint })[], d: { malzemeId: number; uretimEmriId: number; hedef: number | null; aciklama: string },
): Promise<{ red: bigint; eksi: bigint; hareketIdler: number[] }> {
  const { malzemeId, hedef, aciklama } = d;
  let red = 0n, eksi = 0n;
  const hareketIdler: number[] = [];
  for (const b of secim) {
    if (b.kaliteDurumu === 'red') red += b.alinan;
    const anahtar = { malzemeId, partiId: b.partiId, statuId: b.statuId, kaliteDurumu: b.kaliteDurumu };
    await siraliKilitle(db, { ...anahtar, konumId: b.konumId }, { ...anahtar, konumId: hedef });
    const eksik = await kilitliEksik(db, { ...anahtar, konumId: b.konumId }, b.alinan);
    eksi += eksik;
    hareketIdler.push(await sorgular.hareketYaz(db, hareket({
      tur: hedef === null ? 'cikis' : 'transfer', malzemeId, miktar: bindenMetin(b.alinan), kisiId, partiId: b.partiId, partiSecimi: 'kisi',
      kaynakKonumId: b.konumId, hedefKonumId: hedef, kaynakStatuId: b.statuId, hedefStatuId: hedef === null ? null : b.statuId,
      kaynakKaliteDurumu: b.kaliteDurumu, hedefKaliteDurumu: hedef === null ? null : b.kaliteDurumu, onayliEksi: eksik > 0n, cikisNedeni: hedef === null ? 'sevk' : null,
      uretimEmriId: d.uretimEmriId, aciklama: b.kaliteDurumu === 'red' ? aciklama + RED_EKI : aciklama,
    })));
    await bakiyeDegistir(db, { ...anahtar, konumId: b.konumId, fark: -b.alinan });
    if (hedef !== null) await bakiyeDegistir(db, { ...anahtar, konumId: hedef, fark: b.alinan, ilkGiris: new Date().toISOString() });
  }
  return { red, eksi, hareketIdler };
}
async function sevkiGeriAl(db: Db, kisiId: number, s: UrunSevkSatiri, emirNo: string, adim: 'yola' | 'teslim'): Promise<void> {
  const aciklama = sevkAciklamasi(s.isId, emirNo, adim);
  const geri = `Ürün sevki geri alındı · iş ${String(s.isId)} · emir ${emirNo}`;
  for (const id of await sorgular.geriAlinmamisSevkHareketleri(db, s.uretimEmriId, aciklama, RED_EKI)) await tersCevir(db, kisiId, id, false, geri);
}

// Dönen: red parça uyarıları (147 b), Türkçe; sevkiyat komut cevabında gösterir. Uyarı yalnız ileri adımda (yola çıkış, teslim) verilir.
export async function urunSevkiYansit(db: Db, olay: UrunSevkiOlayi): Promise<string[]> {
  const adimlar = urunSevkAdimlari(olay.onceki, olay.yeni);
  const uyarilar: string[] = [];
  if (adimlar.length === 0) return uyarilar;
  if (olay.kisiId === null) throw gecersiz('Ürün sevki kişisiz yazılamaz.');
  const kisiId = olay.kisiId;
  for (const s of olay.satirlar) {
    const emir = await uretimEmriOzeti(db, s.uretimEmriId);
    if (!emir || emir.malzemeNo === null) continue;
    const malzemeId = emir.malzemeNo;
    const o = await malzemeOzeti(db, malzemeId);
    // Stoğa ürün kartıyla girmeyen emrin (mamul ve yarı mamul dışı, adımsız eski emir) ürününü stok izlemez.
    if (!o || (o.tur !== 'mamul' && o.tur !== 'yarimamul')) continue;
    const { red, eksi } = await korumali(async () => {
      const enCok = { red: 0n, eksi: 0n };
      for (const a of adimlar) {
        let r = { red: 0n, eksi: 0n };
        if (a === 'yola_cik') {
          if (s.firmaId !== null) r = await sevkTasi(db, kisiId, s, malzemeId, emir.emirNo, 'yola', await firmaKonumuBul(db, s.firmaId, 'yolda'));
        } else if (a === 'teslim') r = await sevkTasi(db, kisiId, s, malzemeId, emir.emirNo, 'teslim', null);
        else await sevkiGeriAl(db, kisiId, s, emir.emirNo, a === 'teslim_geri' ? 'teslim' : 'yola');
        if (r.red > enCok.red) enCok.red = r.red;
        if (r.eksi > enCok.eksi) enCok.eksi = r.eksi;
      }
      return enCok;
    });
    // Havuzdan doğrudan teslimde aynı parça iki adımda geçer: uyarı bir kez, büyük miktarla.
    if (red > 0n) uyarilar.push(`Emir ${emir.emirNo}: ${bindenMetin(red)} adet red parça sevk edildi.`);
    if (eksi > 0n) uyarilar.push(`Emir ${emir.emirNo}: ${bindenMetin(eksi)} adet stokta yoktu, eksiye düştü; sonraki giriş tamamlar.`);
  }
  return uyarilar;
}

// ---- Depo sevk (944, 962 a, 966 b) ----------------------------------------------------------------------------------------------
// Sevkiyatın tetiklediği kalemde stok depoda oynar: ürün sevk çıkışıyla düşer, fason gidişi parçayı firmanın fason konumuna geçirir,
// geliş mal kabulle girer (satır kalemi taşır). Elle kalemde stok oynamaz: malzemesi ve lotu belli değildir, gerekirse elle çıkış yazılır.
export type FasonGidisYazici = (db: Db, kisiId: number, g: { uretimEmriId: number; isEmriId: number; adet: number; sevkKalemiId: number }) => Promise<{ hareketId: number }>;
let fasonGidisYazici: FasonGidisYazici | null = null;
// Fason gidiş kaydı üretim emrinindir; bağ sunucu/kablolama.ts'de kurulur (bugün Dış operasyonlar yazar).
export function fasonGidisYaziciKaydet(y: FasonGidisYazici): void { fasonGidisYazici = y; }
const depoCikisAciklamasi = (kalemId: number, emirNo: string): string => `Depo çıkışı · kalem ${String(kalemId)} · emir ${emirNo}`;

export async function depoSevkListesi(db: Db): Promise<DepoSevkCevabi> {
  const kalemler = await depoBekleyenleri(db);
  const emirler = await emirNolari(db, [...new Set(kalemler.flatMap((k) => (k.uretimEmriId === null ? [] : [k.uretimEmriId])))]);
  const malzemeler = await malzemeAdlari(db, [...new Set(kalemler.flatMap((k) => (k.malzemeNo === null ? [] : [k.malzemeNo])))]);
  const firmalar = await firmaAdlari(db, [...new Set(kalemler.flatMap((k) => (k.firmaId === null ? [] : [k.firmaId])))]);
  const adimlar = new Map((kalemler.some((k) => k.isEmriId !== null) ? await fasonIsEmirleri(db) : []).map((f) => [f.isEmriId, f.opNo]));
  return {
    satirlar: kalemler.map((k) => ({
      kalemId: k.kalemId, is: k.is, kaynak: k.kaynak, uretimEmriId: k.uretimEmriId, emirNo: k.uretimEmriId === null ? null : emirler.get(k.uretimEmriId) ?? null,
      isEmriId: k.isEmriId, opNo: k.isEmriId === null ? null : adimlar.get(k.isEmriId) ?? null, malzemeId: k.malzemeNo,
      malzemeAd: k.malzemeNo === null ? null : malzemeler.get(k.malzemeNo) ?? null, adet: k.adet, kabulAdet: k.kabulAdet,
      firmaId: k.firmaId, firmaAd: k.firmaId === null ? null : firmalar.get(k.firmaId) ?? null, tasima: k.tasima, tetiklendi: k.tetiklendi, erken: k.erken,
      siparisSatirId: k.siparisSatiriId,
    })),
  };
}

export async function depoCikisiYap(db: Db, kisiId: number, kalemId: number): Promise<DepoCikisCevabi> {
  const k = await depoKalemiAl(db, kalemId, 'cikis');
  const sonuc: { hareketIdler: number[]; uyarilar: string[] } = { hareketIdler: [], uyarilar: [] };
  if (k.kaynak === 'urun') Object.assign(sonuc, await urunDepoCikisi(db, kisiId, k));
  else if (k.kaynak === 'fason') {
    let hareketId = k.fasonHareketId;
    if (hareketId === null) {
      if (fasonGidisYazici === null || k.uretimEmriId === null || k.isEmriId === null || k.adet === null) throw gecersiz('Fason gidişi bu kalemden yazılamıyor; Dış operasyonlardan gönderin.');
      hareketId = (await fasonGidisYazici(db, kisiId, { uretimEmriId: k.uretimEmriId, isEmriId: k.isEmriId, adet: Number(k.adet), sevkKalemiId: k.kalemId })).hareketId;
    }
    await fasonGidisiniTasi(db, kisiId, hareketId, true, 'Depo çıkışı, fasona');
  }
  await depoCikisiYaz(db, kisiId, kalemId);
  return { kalemId, hareketIdler: sonuc.hareketIdler, ...(sonuc.uyarilar.length ? { uyarilar: sonuc.uyarilar } : {}) };
}

// Erken çıkışta (945 a) eksik çıkışı durdurmaz: eldeki kadarı çıkar, eksik uyarıdır. Yola önceden taşınmış parça (göçten önce onaylanmış iş)
// firmanın Yolda konumundan önce alınır.
async function urunDepoCikisi(db: Db, kisiId: number, k: DepoKalemi): Promise<{ hareketIdler: number[]; uyarilar: string[] }> {
  const emir = k.uretimEmriId === null ? null : await uretimEmriOzeti(db, k.uretimEmriId);
  if (!emir || emir.malzemeNo === null) return { hareketIdler: [], uyarilar: [] };
  const malzemeId = emir.malzemeNo;
  const o = await malzemeOzeti(db, malzemeId);
  if (!o || (o.tur !== 'mamul' && o.tur !== 'yarimamul')) return { hareketIdler: [], uyarilar: [] };
  const yolda = k.firmaId === null ? null : await firmaKonumuBul(db, k.firmaId, 'yolda');
  const yoldakiler = yolda === null ? [] : (await sorgular.istasyondakiEmirBakiyeleri(db, yolda, malzemeId, emir.id)).map((b) => ({ ...b, konumId: yolda, konumTuru: 'yolda' as const }));
  const bakiyeler = [...yoldakiler, ...await sorgular.emrinSevkBakiyeleri(db, malzemeId, emir.id)];
  // Bitmemiş emrin erken çıkışında adet henüz yoktur: sevk edilebilir olanın hepsi çıkar.
  const ncr = await acikNcrPartileri(db, bakiyeler);
  const istenen = k.adet !== null ? sevkAdediBinde(k.adet) : k.erken ? sevkKaynaklariSec(bakiyeler, 1n << 62n, ncr).secim.reduce((t, b) => t + b.alinan, 0n) : null;
  if (istenen === null) throw gecersiz(`Emir ${emir.emirNo}: sevk adedi bilinmiyor; stok yazılamaz.`);
  if (istenen === 0n) throw cakisma(`Emir ${emir.emirNo}: sevk edilebilir parça yok.`);
  const r = sevkKaynaklariSec(bakiyeler, istenen, ncr);
  const { secim, eksik, engelli, ncrEngelli } = r;
  const uyarilar: string[] = [];
  if (eksik > 0n && k.erken) {
    const neden = (engelli > 0n ? ` ${bindenMetin(engelli)} adet kalite kararı bekliyor ya da karantinada; sevk edilemez.` : '') + ncrEngelMetni(ncrEngelli);
    uyarilar.push(`Emir ${emir.emirNo}: sevk için ${bindenMetin(istenen)} adet gerekli, stokta ${bindenMetin(istenen - eksik)} adet var.${neden} Erken çıkış: eldeki kadarı çıktı.`);
  } else sevkEksiginiYukle(emir.emirNo, istenen, r);
  const { red, eksi, hareketIdler } = await korumali(() => sevkSeciminiYaz(db, kisiId, secim, { malzemeId, uretimEmriId: emir.id, hedef: null, aciklama: depoCikisAciklamasi(k.kalemId, emir.emirNo) }));
  if (red > 0n) uyarilar.push(`Emir ${emir.emirNo}: ${bindenMetin(red)} adet red parça sevk edildi.`);
  if (eksi > 0n) uyarilar.push(`Emir ${emir.emirNo}: ${bindenMetin(eksi)} adet stokta yoktu, eksiye düştü; sonraki giriş tamamlar.`);
  return { hareketIdler, uyarilar };
}

// Depo çıkışının geri alınması (teslim geri almanın yerine): ürün hareketleri ters çevrilir, fason parçası Yolda'ya döner (gidiş kaydı
// emirde kalır; yeniden çıkışta fasona geçer). Kalem yeniden depoda bekler.
export async function depoCikisiniGeriAlYap(db: Db, kisiId: number, kalemId: number): Promise<DepoCikisCevabi> {
  const k = await depoCikisiniGeriAl(db, kalemId);
  const hareketIdler: number[] = [];
  if (k.kaynak === 'urun' && k.uretimEmriId !== null) {
    const emir = await uretimEmriOzeti(db, k.uretimEmriId);
    if (emir) {
      const geri = `Depo çıkışı geri alındı · kalem ${String(kalemId)} · emir ${emir.emirNo}`;
      for (const id of await sorgular.geriAlinmamisSevkHareketleri(db, emir.id, depoCikisAciklamasi(kalemId, emir.emirNo), RED_EKI)) hareketIdler.push(await tersCevir(db, kisiId, id, false, geri));
    }
  } else if (k.kaynak === 'fason' && k.fasonHareketId !== null) {
    await fasonGidisiniTasi(db, kisiId, k.fasonHareketId, false, 'Depo çıkışı geri alındı');
  }
  return { kalemId, hareketIdler };
}

// Mal kabul satırının sevkiyat kalemi (944, 957 a): yalnız geliş; fason dönüşünde aynı fason adımı, alımda aynı sipariş satırı.
export async function sevkKalemiKabulu(db: Db, kisiId: number, s: MalKabulKomutu['satirlar'][number], alan: string, malKabulSatirId: number): Promise<void> {
  if (s.sevkKalemiId === undefined) return;
  const k = await depoKalemiAl(db, Number(s.sevkKalemiId), 'kabul');
  if (k.kaynak === 'fason-donus' && (s.fasonIsi === undefined || Number(s.fasonIsi.isEmriId) !== k.isEmriId)) {
    throw dogrulama('Bu kalem bir fason dönüşüdür; satır aynı fason işine bağlanır.', `${alan}.sevkKalemiId`);
  }
  if (k.kaynak === 'alim' && k.siparisSatiriId !== null && (s.siparisSatirId === undefined || Number(s.siparisSatirId) !== k.siparisSatiriId)) {
    throw dogrulama('Bu kalem başka bir sipariş satırının alımıdır.', `${alan}.sevkKalemiId`);
  }
  await depoKabuluYaz(db, kisiId, k.kalemId, bindenMetin(binde(s.miktar)), malKabulSatirId);
}
