import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { kayitNoktasi, type Db } from '#cekirdek/db.ts';
import { UygulamaHatasi, bulunamadi, cakisma, dogrulama, gecersiz, onayGerekli, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kapsamDisiysaReddet, kapsamdaMi, kapsamSuzgeci, kisininKapsami } from '#cekirdek/kapsam.ts';
import type { Kapsam } from '#cekirdek/kapsam.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import { STOK_ISLEMLERI } from '#paylasilan/islemler/stok.ts';
import type {
  KaliteDurumu, FisAyrintiCevabi, FislerListesi, FisOzeti, MalzemeFisiAyrintiCevabi, KodCozCevabi, SepetCevabi, SepetEkleKomutu, SepetTeslimCevabi, SepetTeslimEtCevabi, SepetTeslimEtKomutu,
  StoktanDusKomutu, TeslimKomutu, MalzemeIstegi, MalzemeIstegiAcGirdisi, MalzemeIstegiCevabi, MalzemeIstegiDurumu, MalzemeIstekleriListesi, IstekAcGovdesi, IstekMalzemeleriCevabi, Teslim,
  TeslimCevabi, TeslimKutusuCevabi, TeslimYeri, YerdekiStokCevabi, OkutCozCevabi, IstekKabulGovdesi, IstekReddetGovdesi, MalzemeYerleriCevabi, OkutarakAlCevabi, OkutarakAlGovdesi, ItirazGovdesi,
  OkutYeri, KisiKoduCevabi, IstasyonSepetiCevabi, GelecekSepetCevabi, IstasyonSepetleriCevabi, SepettenCekGovdesi,
} from '#paylasilan/sozlesme/stok.ts';
import { malzemeIstegiAcGirdisi, type IstekTeslimGovdesi, type KartlaAlGovdesi, type RefakatKartSatiri } from '#paylasilan/sozlesme/stok.ts';
import { kodTuru, type KodTuru } from '#paylasilan/kod-sozlugu.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { sistemAyariOku } from '../../ayarlar/disari.ts';
import { aktifIstasyonlar, istasyonAdlari, istasyonGetir, istasyondakiKisiler, istasyonlar as tumIstasyonlar, kisininIzinliIsMerkezleri } from '../../istasyonlar/disari.ts';
import { bildirimGonder } from '../../bildirim/disari.ts';
import { basladigiGunTakvimi } from '../../vardiya/disari.ts';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { malzemeAra, malzemeKullanilabilirMi, malzemeNoKoddan, malzemeOzeti, malzemeOzetleri } from '../../malzemeler/disari.ts';
import { KOMUT_ISLEMI as URETIM_ISLEMI, acikIstasyon, adimliEmirAyrintisi, emirDilimi, uretimEmriOzeti, emirlerinAdimIstasyonlari } from '../../uretim-emirleri/disari.ts';
import {
  binde, bindenMetin, cikisOnerisi, partiEtiketi, stoklanirMi, partiSec, ISTEK_GECIS_KAYNAKLARI, istekGecisEngeli, buradakiIstasyon, istekAcilisDurumu, istekListeEngeli, serbestMiktarEngeli,
  istekKalani, istenenFazlaNotu, yoldaSureSonu, sonrakiIstasyon, type SepetAdimi, kisiKoduAyristir, kisiKoduEngeli, kisiKoduGovdesi, KISI_KODU_SURESI_SN, katalogEtiketiStokKodu, geriDusmeKodlari,
  istasyondanIstekEngeli, okutarakAlmaEngeli, itirazSonu, refakatEtiketi, refakatTeslimEngeli, refakatAnaEylemi, AYRILMIS_KONUM_TURLERI,
} from '../kurallar.ts';
import type { IstekGecisi } from '../kurallar.ts';
import * as sorgular from '../sorgular.ts';
import * as malzemeFisi from '../malzeme-fisi.ts';
import type { BakiyeHam, IstekHam, RefakatPartisiHam, TeslimHam } from '../sorgular.ts';
import { zeminDurumu, say, anaDepo } from './depo.ts';
import { kaynakPartisi, sevkCikisiniDenetle, eksiKaliteDenetle } from './hareket.ts';
import { STOKLANIR_TURLER } from './malzeme.ts';
import { belgeNo, korumali, adlar, emirNoDe, emirNoHaritasi, bakiyeSatiri, hareketleriCevir, aktifKonum, varsayilanKonum, bakiyeDegistir, siraliKilitle, hareket, teslimYaz, sktBugun } from './ortak.ts';
import { refakatPartileriCevir } from './refakat.ts';
import { sarfEmriDenetle, emreKartiSagla, teslimGonder, kartaBagliLotuReddet, teslimAlabilir, teslimiKapat, istegiYenidenDene, adimStatusu, rezerveyiAsmasin, rezerveDegistir } from './uretim.ts';

// ---- Sepet (DEP-54: kişiye özel) ------------------------------------------------------------------------------------------
const KULLANILABILIR = new Set(['raf_gozu', 'kabul', 'depo_zemini']);
const kullanilabilirToplam = (b: BakiyeHam[]): bigint => b.filter((x) => KULLANILABILIR.has(x.konumTur) && binde(x.miktar) > 0n).reduce((t, x) => t + binde(x.miktar), 0n);
export async function sepet(db: Db, kisiId: number): Promise<SepetCevabi> {
  const satirlar = await sorgular.sepetSatirlari(db, kisiId);
  const ozetler = await malzemeOzetleri(db, satirlar.map((x) => x.malzemeId));
  const kartIdler = [...new Set(satirlar.flatMap((x) => (x.refakatPartisiId === null ? [] : [x.refakatPartisiId])))];
  const kartlar = kartIdler.length === 0 ? [] : await sorgular.refakatPartileriBul(db, kartIdler);
  const nolar = await emirNoHaritasi(db, [...satirlar.map((x) => x.partiEmirId), ...kartlar.map((r) => r.uretimEmriId)]);
  const istKodlari = await istasyonKodlari(db, satirlar.map((x) => x.hedefIstasyonId));
  const cevap = [];
  for (const x of satirlar) {
    const mevcut = x.kaynakKonumId === null ? kullanilabilirToplam(await sorgular.serbestBakiyeler(db, x.malzemeId))
      : binde((await sorgular.bakiyeOku(db, x.malzemeId, x.kaynakKonumId, x.partiId))?.miktar ?? '0');
    const o = ozetler.get(x.malzemeId) ?? null;
    const r = x.refakatPartisiId === null ? undefined : kartlar.find((y) => y.id === x.refakatPartisiId);
    cevap.push({
      id: x.id, malzemeId: x.malzemeId, malzemeAd: o?.ad ?? null, malzemeKod: o?.kod ?? null, kaynakKonumId: x.kaynakKonumId, kaynakKonumKod: x.kaynakKonumKod,
      partiId: x.partiId, partiEtiketi: x.partiId === null ? null : partiEtiketi({ lotNo: x.lotNo, tedarikciPartiNo: x.tedarikciPartiNo, dokumNo: x.dokumNo, uretimEmriId: x.partiEmirId }, emirNoDe(nolar, x.partiEmirId)),
      miktar: bindenMetin(binde(x.miktar)), mevcut: bindenMetin(mevcut), eklenme: x.eklenme,
      refakat: r === undefined ? null : { id: r.id, etiket: refakatEtiketi(emirNoDe(nolar, r.uretimEmriId), r.uretimEmriId, r.sira) },
      hedef: x.hedefKonumId === null ? null
        : { konumId: x.hedefKonumId, kod: x.hedefIstasyonId === null ? (x.hedefKonumKod ?? '') : (istKodlari.get(x.hedefIstasyonId) ?? x.hedefKonumKod ?? ''), ad: x.hedefKonumAd, istasyonId: x.hedefIstasyonId },
    });
  }
  return { satirlar: cevap };
}
// Sepet hedefi önerisi (Soru 133): kartın emrine açık istek varsa isteyen istasyon, yoksa rotada kaynaktan sonraki istasyon; ikisi de yoksa elle seçilir.
async function sepetHedefOnerisi(db: Db, malzemeId: number, kaynakKonumId: number | null, r: RefakatPartisiHam): Promise<number | null> {
  const istek = (await sorgular.emrinAcikIstekleri(db, r.uretimEmriId)).find((i) => i.malzemeId === malzemeId && i.istasyonId !== null);
  if (istek?.istasyonId != null) return istek.istasyonId;
  const e = await adimliEmirAyrintisi(db, r.uretimEmriId).catch((h: unknown) => { if (h instanceof UygulamaHatasi) return null; throw h; });
  if (!e) return null;
  const rota: SepetAdimi[] = e.isEmirleri.map((i) => ({ sira: i.sira, opNo: i.opNo, istasyonId: i.istasyon?.id ?? null, statuId: null }));
  const buradaki = kaynakKonumId === null ? null : await sorgular.konumIstasyonu(db, kaynakKonumId);
  if (buradaki === null) return [...rota].sort((a, b) => a.sira - b.sira || a.opNo - b.opNo).find((a) => a.istasyonId !== null)?.istasyonId ?? null;
  const sonraki = sonrakiIstasyon(rota, buradaki, null);
  return 'yok' in sonraki ? null : sonraki.istasyonId;
}
export async function sepeteEkle(db: Db, kisiId: number, g: SepetEkleKomutu): Promise<SepetCevabi> {
  if (!(await malzemeOzeti(db, g.malzemeId))) throw dogrulama('Malzeme kartı bulunamadı.', 'malzemeId');
  let partiId: number | null = null;
  if (g.kaynakKonumId !== undefined) {
    await aktifKonum(db, g.kaynakKonumId, 'kaynakKonumId');
    partiId = (await kaynakPartisi(db, g.malzemeId, g.kaynakKonumId, g.partiId === undefined ? undefined : g.partiId)).partiId;
  } else if (g.partiId !== undefined && g.partiId !== null) throw dogrulama('Parti ancak kaynak gözle seçilir.', 'partiId');
  // Sepet satırı statü tutmaz (UYUM-BORCU): adım statüsündeki parça Teslim al ya da okutup Teslim et ile gider.
  if (g.statuId != null) throw dogrulama('Adım statüsündeki parça sepete eklenmez; okutup Teslim et ile gönderin.', 'statuId');
  let refakatPartisiId: number | null = null, hedefKonumId: number | null = null;
  if (g.refakatPartisiId != null) {
    const r = await sorgular.etkinRefakatPartisiBul(db, g.refakatPartisiId);
    if (!r) throw dogrulama('Refakat kartı bulunamadı.', 'refakatPartisiId');
    if (g.kaynakKonumId === undefined) throw dogrulama('Kartla sepete ekleme kartın bir satırından yapılır.', 'kaynakKonumId');
    const engel = refakatTeslimEngeli(r, { malzemeId: g.malzemeId, partiId, uretimEmriId: undefined });
    if (engel) throw dogrulama(engel, 'refakatPartisiId');
    refakatPartisiId = r.id;
    const oneri = g.hedef ? null : await sepetHedefOnerisi(db, g.malzemeId, g.kaynakKonumId, r);
    if (oneri !== null) hedefKonumId = await istasyonKonumuBul(db, oneri, 'hedef');
  }
  if (g.hedef) hedefKonumId = 'istasyonId' in g.hedef ? await istasyonKonumuBul(db, g.hedef.istasyonId, 'hedef') : (await aktifKonum(db, g.hedef.konumId, 'hedef')).id;
  if (hedefKonumId !== null && hedefKonumId === g.kaynakKonumId) hedefKonumId = null;
  // 3088: lotlu satırda aynı etiketin ikinci okutması lotu iki kez saymaz; partisiz satır art arda sayılarak toplanır (1919 a).
  const tavan = g.kaynakKonumId === undefined || partiId === null ? null
    : await sorgular.lotunGozdekiSerbesti(db, g.malzemeId, g.kaynakKonumId, partiId);
  await korumali(() => sorgular.sepeteEkle(db, { kisiId, malzemeId: g.malzemeId, kaynakKonumId: g.kaynakKonumId ?? null, partiId, miktar: bindenMetin(binde(g.miktar)), refakatPartisiId, hedefKonumId, tavan }));
  return sepet(db, kisiId);
}
// Herkese sepet (Soru 133): her satır kendi hedefine ayrı yoldaki teslim olur; bir satırın reddi ötekileri durdurmaz, satır sepette kalır ve nedeni döner.
export async function sepetGonder(db: Db, k: Kullanici, g: SepetTeslimEtKomutu): Promise<SepetTeslimEtCevabi> {
  const satirlar = await sorgular.sepetSatirlari(db, k.id, true);
  const teslimler: SepetTeslimEtCevabi['teslimler'] = [], kalanlar: SepetTeslimEtCevabi['kalanlar'] = [];
  for (const istenen of g.satirlar) {
    const satirId = Number(istenen.satirId);
    const x = satirlar.find((y) => y.id === satirId);
    if (!x) { kalanlar.push({ satirId, neden: 'Sepet satırı bulunamadı; sayfayı yenileyin.' }); continue; }
    const hedef: TeslimYeri | null = istenen.hedef ?? (x.hedefKonumId === null ? null : x.hedefIstasyonId === null ? { konumId: x.hedefKonumId } : { istasyonId: x.hedefIstasyonId });
    if (hedef === null) { kalanlar.push({ satirId, neden: 'Hedef seçilmedi.' }); continue; }
    if (x.kaynakKonumId === null) { kalanlar.push({ satirId, neden: 'Satırın alınacağı yer yok; malzemeyi yerinden sepete ekleyin.' }); continue; }
    const kaynakKonumId = x.kaynakKonumId;
    const miktar = istenen.miktar === undefined ? x.miktar : bindenMetin(binde(istenen.miktar));
    if (binde(miktar) <= 0n || binde(miktar) > binde(x.miktar)) { kalanlar.push({ satirId, neden: `Miktar sepetteki ${x.miktar} miktarını aşamaz.` }); continue; }
    const kalan = binde(x.miktar) - binde(miktar);
    const sonuc = await kayitNoktasi(db, async () => {
      const t = await teslimGonder(db, k, {
        malzemeId: x.malzemeId, miktar, partiId: x.partiId, statuId: null, kaynak: { konumId: kaynakKonumId }, hedef, aliciKodu: g.aliciKodu ?? null, not: 'Sepet',
        kaynakKimligi: `sepet:${g.kaynakKimligi}:${satirId}`, ...(x.refakatPartisiId === null ? {} : { refakatPartisiId: x.refakatPartisiId }),
      });
      if (kalan > 0n) await sorgular.sepetMiktari(db, satirId, k.id, bindenMetin(kalan));
      else await sorgular.sepettenSil(db, satirId, k.id);
      return t;
    });
    if (sonuc.tamam) teslimler.push({ satirId, teslimNo: sonuc.deger.teslim.no });
    else kalanlar.push({ satirId, neden: sonuc.hata.message });
  }
  return { teslimler, kalanlar };
}
export async function sepetSatiriDegistir(db: Db, kisiId: number, id: number, miktar: string): Promise<SepetCevabi> {
  if (!(await sorgular.sepetMiktari(db, id, kisiId, bindenMetin(binde(miktar))))) throw bulunamadi('Sepet satırı bulunamadı.');
  return sepet(db, kisiId);
}
export async function sepetSatiriSil(db: Db, kisiId: number, id: number): Promise<SepetCevabi> {
  if (!(await sorgular.sepettenSil(db, id, kisiId))) throw bulunamadi('Sepet satırı bulunamadı.');
  return sepet(db, kisiId);
}

// ---- Teslim (DEP-40, DEP-41): bütün satırlar tek işlemde; bir satır karşılanamazsa hiçbiri yazılmaz -----------------------
interface Ayirma { satirId: number; malzemeId: number; konumId: number; partiId: number | null; partiSecimi: 'kisi' | 'tek_parti' | 'en_eski' | null; miktar: string; onayliEksi: boolean }
async function sepetiAyir(db: Db, kisiId: number, eksiOnay: boolean): Promise<{ satirIdler: number[]; ayirmalar: Ayirma[] }> {
  const satirlar = await sorgular.sepetSatirlari(db, kisiId, true);
  if (satirlar.length === 0) throw gecersiz('Sepet boş.');
  const ayirmalar: Ayirma[] = [], eksikler: { malzemeId: number; mevcut: string; istenen: string }[] = [];
  const kabul = await varsayilanKonum(db, 'KABUL');
  await siraliKilitle(db, ...satirlar.map((s) => ({ malzemeId: s.malzemeId, konumId: s.kaynakKonumId, partiId: s.partiId })));
  for (const s of satirlar) {
    if (s.kaynakKonumId !== null) {
      const b = await sorgular.bakiyeKilitle(db, s.malzemeId, s.kaynakKonumId, s.partiId);
      const mevcut = b?.miktar ?? '0', yeterli = binde(mevcut) >= binde(s.miktar);
      await eksiKaliteDenetle(db, { malzemeId: s.malzemeId, konumId: s.kaynakKonumId, partiId: s.partiId }, mevcut, s.miktar);
      if (!yeterli) eksikler.push({ malzemeId: s.malzemeId, mevcut: bindenMetin(binde(mevcut)), istenen: bindenMetin(binde(s.miktar)) });
      ayirmalar.push({ satirId: s.id, malzemeId: s.malzemeId, konumId: s.kaynakKonumId, partiId: s.partiId, partiSecimi: s.partiId === null ? null : 'kisi', miktar: bindenMetin(binde(s.miktar)), onayliEksi: !yeterli });
      continue;
    }
    const b = await sorgular.serbestBakiyeler(db, s.malzemeId);
    const o = cikisOnerisi(b.map((x) => ({ bakiyeId: x.id, konumId: x.konumId, konumKod: x.konumKod, konumTur: x.konumTur, partiId: x.partiId, partiEtiketi: null, miktar: x.miktar, ilkGiris: x.ilkGiris, sonKullanma: x.sonKullanma })), s.miktar, sktBugun());
    let kalan = binde(s.miktar);
    for (const x of o.oneriler) { ayirmalar.push({ satirId: s.id, malzemeId: s.malzemeId, konumId: x.konumId, partiId: x.partiId, partiSecimi: x.partiId === null ? null : 'en_eski', miktar: x.miktar, onayliEksi: false }); kalan -= binde(x.miktar); }
    if (kalan > 0n) {
      eksikler.push({ malzemeId: s.malzemeId, mevcut: o.mevcut, istenen: bindenMetin(binde(s.miktar)) });
      const son = o.oneriler[o.oneriler.length - 1];
      ayirmalar.push({ satirId: s.id, malzemeId: s.malzemeId, konumId: son?.konumId ?? kabul, partiId: son?.partiId ?? null, partiSecimi: son?.partiId ? 'en_eski' : null, miktar: bindenMetin(kalan), onayliEksi: true });
    }
  }
  if (eksikler.length > 0 && !eksiOnay) {
    const ad = await adlar(db, eksikler.map((e) => e.malzemeId));
    const ilk = eksikler[0]!;
    throw onayGerekli(`Yetersiz stok: ${eksikler.map((e) => `${ad.get(e.malzemeId) ?? `kart ${e.malzemeId}`} mevcut ${e.mevcut}, istenen ${e.istenen}`).join('; ')}. Yine de teslim etmek için onaylayın; bakiye eksiye düşer.`,
      { mevcut: ilk.mevcut, eksikler });
  }
  return { satirIdler: satirlar.map((x) => x.id), ayirmalar };
}
async function fisOzetiCevir(db: Db, f: sorgular.FisHam): Promise<FisOzeti> {
  const { kisiId, ...geri } = f;
  const nolar = await emirNoHaritasi(db, [f.uretimEmriId]);
  return { ...geri, emirNo: emirNoDe(nolar, f.uretimEmriId), kisiAd: (await kisiAdlari(db, [kisiId])).get(kisiId) ?? null };
}
// Taşı: satırın hedefi verilmişse o, verilmemişse ortak hedef; her hedef için ayrı fiş (fiş tek hedeflidir). Hepsi tek işlemde.
export async function teslimEt(db: Db, kisiId: number, g: TeslimKomutu): Promise<SepetTeslimCevabi> {
  const satirHedefi = new Map((g.satirHedefleri ?? []).map((x) => [Number(x.satirId), Number(x.hedefKonumId)]));
  for (const h of new Set([...satirHedefi.values(), ...(g.hedefKonumId === undefined ? [] : [Number(g.hedefKonumId)])])) await aktifKonum(db, h, 'hedefKonumId');
  const { satirIdler, ayirmalar } = await sepetiAyir(db, kisiId, g.eksiOnay === true);
  if ([...satirHedefi.keys()].some((id) => !satirIdler.includes(id))) throw dogrulama('Sepet satırı bulunamadı; sayfayı yenileyin.', 'satirHedefleri');
  const hedefi = (satirId: number): number | null => satirHedefi.get(satirId) ?? (g.hedefKonumId === undefined ? null : Number(g.hedefKonumId));
  if (satirIdler.some((id) => hedefi(id) === null)) throw dogrulama('Her satırın teslim yerini seçin.', 'hedefKonumId');
  await siraliKilitle(db, ...ayirmalar.flatMap((a) => [a, { ...a, konumId: hedefi(a.satirId)! }]));
  return korumali(async () => {
    const gruplar = new Map<number, number[]>();
    for (const a of ayirmalar) {
      const hedef = hedefi(a.satirId)!;
      const hareketler = gruplar.get(hedef) ?? [];
      gruplar.set(hedef, hareketler);
      if (a.konumId === hedef) continue;
      const b = await sorgular.bakiyeKilitle(db, a.malzemeId, a.konumId, a.partiId);
      hareketler.push(await sorgular.hareketYaz(db, hareket({ tur: 'transfer', malzemeId: a.malzemeId, miktar: a.miktar, kisiId, partiId: a.partiId, partiSecimi: a.partiSecimi, kaynakKonumId: a.konumId, hedefKonumId: hedef, onayliEksi: a.onayliEksi, aciklama: g.aciklama ?? null })));
      await bakiyeDegistir(db, { malzemeId: a.malzemeId, konumId: a.konumId, partiId: a.partiId, fark: -binde(a.miktar) });
      const ambalaj = b?.ambalajTur && b.ambalajOlcu !== 'ozel' ? { tur: b.ambalajTur, olcu: b.ambalajOlcu ?? '', uzunluk: null, genislik: null, yukseklik: null, adet: null } : null;
      await bakiyeDegistir(db, { malzemeId: a.malzemeId, konumId: hedef, partiId: a.partiId, fark: binde(a.miktar), ilkGiris: b?.ilkGiris ?? null, ambalaj });
    }
    const fisler: FisOzeti[] = [];
    for (const [hedef, hareketler] of gruplar) {
      const fisId = await sorgular.fisAc(db, { no: await belgeNo(db, 'stok.fis-no', 'stok_fis'), hedefKonumId: hedef, cikisNedeni: null, uretimEmriId: null, aciklama: g.aciklama ?? null, kisiId });
      if (hareketler.length) await sorgular.fisSatiriYaz(db, fisId, hareketler);
      fisler.push(await fisOzetiCevir(db, (await sorgular.fisBul(db, fisId))!));
    }
    await sorgular.sepetiBosalt(db, kisiId, satirIdler);
    return { fis: fisler[0]!, fisler };
  });
}
export async function stoktanDus(db: Db, kisiId: number, g: StoktanDusKomutu): Promise<{ fis: FisOzeti }> {
  const { satirIdler, ayirmalar } = await sepetiAyir(db, kisiId, g.eksiOnay === true);
  await sevkCikisiniDenetle(db, [...new Set(ayirmalar.map((a) => a.malzemeId))], g.cikisNedeni);
  const emir = g.uretimEmriId ?? null;
  await sarfEmriDenetle(db, kisiId, emir === null ? null : Number(emir));
  return korumali(async () => {
    const hareketler: number[] = [];
    for (const a of ayirmalar) {
      await rezerveyiAsmasin(db, a.malzemeId, null, emir === null ? null : Number(emir), binde(a.miktar));
      await rezerveDegistir(db, { malzemeId: a.malzemeId, statuId: null, uretimEmriId: emir === null ? null : Number(emir), fark: -binde(a.miktar) });
      hareketler.push(await sorgular.hareketYaz(db, hareket({ tur: 'cikis', malzemeId: a.malzemeId, miktar: a.miktar, kisiId, partiId: a.partiId, partiSecimi: a.partiSecimi, kaynakKonumId: a.konumId, onayliEksi: a.onayliEksi, cikisNedeni: g.cikisNedeni, uretimEmriId: emir, aciklama: g.aciklama ?? null })));
      await bakiyeDegistir(db, { malzemeId: a.malzemeId, konumId: a.konumId, partiId: a.partiId, fark: -binde(a.miktar) });
    }
    const fisId = await sorgular.fisAc(db, { no: await belgeNo(db, 'stok.fis-no', 'stok_fis'), hedefKonumId: null, cikisNedeni: g.cikisNedeni, uretimEmriId: emir, aciklama: g.aciklama ?? null, kisiId });
    await sorgular.fisSatiriYaz(db, fisId, hareketler);
    await sorgular.sepetiBosalt(db, kisiId, satirIdler);
    return { fis: await fisOzetiCevir(db, (await sorgular.fisBul(db, fisId))!) };
  });
}
export async function fisListesi(db: Db, s: FislerListesi): Promise<SayfaliListe<FisOzeti>> {
  const l = await sayfaliListe(s, { say: () => sorgular.fisSay(db), satirlar: (d) => sorgular.fisler(db, s, d) });
  const kisiler = await kisiAdlari(db, [...new Set(l.satirlar.map((f) => f.kisiId))]);
  return { ...l, satirlar: l.satirlar.map(({ kisiId, ...f }) => ({ ...f, kisiAd: kisiler.get(kisiId) ?? null })) };
}
export const malzemeFisiAyrintisiOku = (db: Db, id: number): Promise<MalzemeFisiAyrintiCevabi> =>
  malzemeFisi.malzemeFisiAyrintisi(db, id, (h) => hareketleriCevir(db, h));
export async function fisAyrintisi(db: Db, id: number): Promise<FisAyrintiCevabi> {
  const f = await sorgular.fisBul(db, id);
  if (!f) throw bulunamadi('Fiş bulunamadı.');
  return { fis: await fisOzetiCevir(db, f), hareketler: await hareketleriCevir(db, await sorgular.fisinHareketleri(db, id)) };
}

// ---- Kod çözümleme (DEP-55): önek ayrımı ortak kod sözlüğünden (#1070); kaydın varlığını stok doğrular, bilinmeyen kod uydurulmaz --
async function lotCoz(db: Db, lotNo: string): Promise<KodCozCevabi | null> {
  const p = await sorgular.lotNoylaParti(db, lotNo);
  if (!p) return null;
  const o = await malzemeOzeti(db, p.malzemeId);
  if (!o) return null;
  const b = await sorgular.lotBakiyeleri(db, p.id);
  const ad = new Map(o.ad === null ? [] : [[o.id, o.ad]]);
  const nolar = await emirNoHaritasi(db, [p.uretimEmriId, ...b.map((x) => x.uretimEmriId)]);
  return {
    tur: 'lot', parti: { id: p.id, lotNo: p.lotNo, etiket: partiEtiketi(p, emirNoDe(nolar, p.uretimEmriId)) ?? p.lotNo },
    ozet: { id: o.id, tur: o.tur, kod: o.kod, ad: o.ad, onayDurumu: o.onayDurumu, kullanilabilir: await malzemeKullanilabilirMi(db, o.id), birim: o.birim },
    toplam: bindenMetin(b.reduce((t, x) => t + binde(x.miktar), 0n)), bakiyeler: b.map((x) => bakiyeSatiri(x, ad, nolar)),
  };
}
// Refakat kartı: lotun çözümü ve kartın partisi.
async function refakatCoz(db: Db, id: number): Promise<KodCozCevabi | null> {
  const r = await sorgular.etkinRefakatPartisiBul(db, id);
  // Lot bekleyen (istisna) kartın lot satırı yok; kodu tanınmaz, kart Lot bekleyen kartlar listesinden açılır.
  const lot = r === null || r.lotNo === null ? null : await lotCoz(db, r.lotNo);
  if (!r || lot?.tur !== 'lot') return null;
  return { ...lot, refakat: (await refakatPartileriCevir(db, [r]))[0]! };
}
async function konumCoz(db: Db, kod: string): Promise<KodCozCevabi | null> {
  const k = await sorgular.konumKoduyla(db, kod);
  if (!k) return null;
  const b = await sorgular.konumBakiyeleri(db, k.id);
  const nolar = await emirNoHaritasi(db, b.map((x) => x.uretimEmriId));
  return { tur: 'konum', konum: k, bakiyeler: b.map((x) => bakiyeSatiri(x, new Map(), nolar)) };
}
async function malzemeCoz(db: Db, no: number): Promise<KodCozCevabi | null> {
  const o = await malzemeOzeti(db, no);
  if (!o) return null;
  const b = await sorgular.malzemeBakiyeleri(db, o.id);
  const ad = new Map(o.ad === null ? [] : [[o.id, o.ad]]);
  const nolar = await emirNoHaritasi(db, b.map((x) => x.uretimEmriId));
  return {
    tur: 'malzeme', ozet: { id: o.id, tur: o.tur, kod: o.kod, ad: o.ad, onayDurumu: o.onayDurumu, kullanilabilir: await malzemeKullanilabilirMi(db, o.id), birim: o.birim },
    toplam: bindenMetin(b.reduce((t, x) => t + binde(x.miktar), 0n)), bakiyeler: b.map((x) => bakiyeSatiri(x, ad, nolar)),
  };
}
// Üretim emri kodu stokta çözülmez (emre çıkış bağlamada); sözlüğün tanımadığı öneksiz konum kodu (A-01-01, KABUL), eski `LOC-`
// biçimi ve düz kart no stokun kendi geri düşmesiyle aranır.
export async function kodCoz(db: Db, ham: string): Promise<KodCozCevabi> {
  const bulunan = await sirayliCoz<KodCozCevabi>(db, ham, {
    onekli: async (t) => (t.tur === 'lot' ? lotCoz(db, t.deger) : t.tur === 'refakat-partisi' ? refakatCoz(db, Number(t.deger)) : t.tur === 'konum' ? konumCoz(db, t.deger) : t.tur === 'malzeme' ? malzemeCoz(db, Number(t.deger)) : null),
    konum: (kod) => konumCoz(db, kod),
    malzeme: (no) => malzemeCoz(db, no),
  });
  return bulunan ?? { tur: 'bilinmiyor', kod: ham.trim() };
}
// Çözüm sırası iki okuma ucunda (kodCoz, okutCoz) aynıdır ve yalnız burada yazılır: önekli kod kendi yolundan; önek tanınmaz ya da
// kayıt bulunmazsa öneksiz konum kodu, en son düz kart no ya da katalog etiketi. Cevabı her uç kendi yetkisine göre kurar.
interface CozumYollari<T> {
  onekli: (t: KodTuru) => Promise<T | null>;
  konum: (kod: string) => Promise<T | null>;
  malzeme: (no: number) => Promise<T | null>;
}
async function sirayliCoz<T>(db: Db, ham: string, y: CozumYollari<T>): Promise<T | null> {
  const bulunan = await y.onekli(kodTuru(ham));
  if (bulunan) return bulunan;
  const g = geriDusmeKodlari(ham);
  const konum = await y.konum(g.konumKodu);
  if (konum) return konum;
  const no = g.kartNo ?? await katalogEtiketiKartNo(db, ham);
  return no === null ? null : y.malzeme(no);
}
// DEP-64: katalog etiketi (MK:<stok kodu>); kart no'yu Malzemeler verir, stok onun tablosunu okumaz. Kart yoksa null.
async function katalogEtiketiKartNo(db: Db, ham: string): Promise<number | null> {
  const stokKodu = katalogEtiketiStokKodu(ham);
  return stokKodu === null ? null : malzemeNoKoddan(db, stokKodu);
}

// ---- Malzeme isteği: üretim (Arkon) açar, depo hazırlar ve teslim eder ------------------------------------------------------
// İsteği üretim yapan kişi açar (emri başlatan işlem); istasyon kişinin iş merkezi kapsamında olmalıdır. Aynı kaynak kimliği
// ikinci kez istek açmaz, ilk kaydı döner (çağıranın tekrar denemesi ve eşzamanlı iki çağrı tek istek bırakır).
export async function malzemeIstegiAc(db: Db, k: Kullanici, girdi: MalzemeIstegiAcGirdisi): Promise<{ id: number; no: string; durum: MalzemeIstegiDurumu }> {
  if (!islemVarMi(k, URETIM_ISLEMI)) throw yetkiYok();
  const c = malzemeIstegiAcGirdisi.safeParse(girdi);
  if (!c.success) throw dogrulama(c.error.issues[0]!.message, c.error.issues[0]!.path.join('.') || undefined);
  const g = c.data;
  const kapsam = await kisininKapsami(db, k.id, kisininIzinliIsMerkezleri);
  const onceki = (await sorgular.istekleriKaynaktan(db, [g.kaynakKimligi]))[0];
  if (onceki) {
    kapsamDisiysaReddet(kapsam, onceki.istasyonId === null ? null : (await istasyonGetir(db, onceki.istasyonId))?.isMerkeziId ?? null);
    return { id: onceki.id, no: onceki.no, durum: onceki.durum };
  }
  const o = await malzemeOzeti(db, g.malzemeId);
  if (!o) throw dogrulama('Malzeme kartı bulunamadı.', 'malzemeId');
  if (!stoklanirMi(o.tur)) throw dogrulama(`${o.ad ?? o.kod}: hizmet stoklanmaz; istek malzeme kartıyla açılır.`, 'malzemeId');
  if (!(await malzemeKullanilabilirMi(db, g.malzemeId))) throw gecersiz(`${o.ad ?? o.kod}: kart kullanılabilir değil.`);
  const istasyon = await istasyonGetir(db, g.istasyonId);
  if (!istasyon || !istasyon.aktif) throw dogrulama('İstasyon bulunamadı ya da pasif.', 'istasyonId');
  kapsamDisiysaReddet(kapsam, istasyon.isMerkeziId);
  if (g.uretimEmriId !== null) await istenebilirEmir(db, g.uretimEmriId);
  const durum = istekAcilisDurumu(await depodakiMiktar(db, g.malzemeId), g.miktar);
  const id = await sorgular.istekAc(db, { no: await belgeNo(db, 'stok.malzeme-istegi-no', 'stok_malzeme_istegi'), kaynakKimligi: g.kaynakKimligi, malzemeId: g.malzemeId, miktar: g.miktar, istasyonId: g.istasyonId, uretimEmriId: g.uretimEmriId, aciklama: g.not ?? null, kisiId: k.id, durum });
  const i = id === null ? (await sorgular.istekleriKaynaktan(db, [g.kaynakKimligi]))[0]! : (await sorgular.istekBul(db, id))!;
  return { id: i.id, no: i.no, durum: i.durum };
}
export async function malzemeIstekleriniOku(db: Db, kaynakKimlikleri: string[]): Promise<Map<string, { id: number; no: string; durum: MalzemeIstegiDurumu; miktar: string; karsilanan: string | null; guncelleme: string }>> {
  if (kaynakKimlikleri.length === 0) return new Map();
  const satirlar = await sorgular.istekleriKaynaktan(db, [...new Set(kaynakKimlikleri)]);
  return new Map(satirlar.map((i) => [i.kaynakKimligi, { id: i.id, no: i.no, durum: i.durum, miktar: i.miktar, karsilanan: i.karsilanan, guncelleme: i.guncelleme }]));
}
export async function stokYokIstekleri(db: Db, sinir: number): Promise<{ id: number; no: string; malzemeId: number; miktar: string; birim: string | null; uretimEmriId: number | null; istasyonId: number | null; acilma: string; guncelleme: string }[]> {
  const satirlar = await sorgular.stokYokIstekleri(db, Math.min(Math.max(1, Math.trunc(sinir)), 500));
  const ozetler = await malzemeOzetleri(db, satirlar.map((i) => i.malzemeId));
  return satirlar.map(({ acilis, ...i }) => ({ ...i, birim: ozetler.get(i.malzemeId)?.birim ?? null, acilma: acilis }));
}
async function istekleriAdlandir(db: Db, satirlar: IstekHam[]): Promise<MalzemeIstegi[]> {
  const ad = await adlar(db, satirlar.map((i) => i.malzemeId));
  const yolda = new Map((await sorgular.yoldaTeslimleri(db, satirlar.map((i) => i.id))).map((t) => [t.istekId, { id: t.id, no: t.no }]));
  const istasyonlar = await istasyonAdlari(db, [...new Set(satirlar.flatMap((i) => [i.istasyonId, i.kaynakIstasyonId].filter((x): x is number => x !== null)))]);
  const kisiler = await kisiAdlari(db, [...new Set(satirlar.flatMap((i) => (i.kapatanKisiId === null ? [i.kisiId] : [i.kisiId, i.kapatanKisiId])))]);
  return satirlar.map(({ kisiId, kapatanKisiId, toplamaDurumu, toplamaId, toplamaNo, ...i }) => ({
    ...i, malzemeAd: ad.get(i.malzemeId) ?? null, istasyonAd: i.istasyonId === null ? null : istasyonlar.get(i.istasyonId) ?? null,
    kaynakIstasyonAd: i.kaynakIstasyonId === null ? null : istasyonlar.get(i.kaynakIstasyonId) ?? null,
    kisiAd: kisiler.get(kisiId) ?? null, kapatanKisiAd: kapatanKisiId === null ? null : kisiler.get(kapatanKisiId) ?? null,
    ...(toplamaDurumu === 'topluyor' ? { toplamaId, toplamaNo } : { toplamaId: null, toplamaNo: null }),
    yoldaTeslim: yolda.get(i.id) ?? null,
  }));
}
export async function malzemeIstekleriListesi(db: Db, kisiId: number, s: MalzemeIstekleriListesi): Promise<SayfaliListe<MalzemeIstegi>> {
  const istasyonlar = await istasyonKapsamiIdleri(db, await kapsamOku(db, kisiId));
  const l = await sayfaliListe(s, { say: () => sorgular.istekSay(db, s.durum, istasyonlar), satirlar: (d) => sorgular.istekler(db, s.durum, s, d, istasyonlar) });
  return { ...l, satirlar: await istekleriAdlandir(db, l.satirlar) };
}
export async function malzemeIstegiGor(db: Db, kisiId: number, id: number): Promise<MalzemeIstegiCevabi> {
  await istasyonKapsaminiDenetle(db, kisiId, (await sorgular.istekBul(db, id))?.istasyonId ?? null);
  return malzemeIstegiOku(db, id);
}
export async function malzemeIstegiOku(db: Db, id: number): Promise<MalzemeIstegiCevabi> {
  const i = await sorgular.istekBul(db, id);
  if (!i) throw bulunamadi('Malzeme isteği bulunamadı.');
  return { istek: (await istekleriAdlandir(db, [i]))[0]! };
}
export const ISTASYON_ISTEGI = 'Bu istek bir istasyondan istendi; o istasyon karşılar ya da reddeder.';
// Hazırlama istek açık kalır; teslim ve iptal kapatır. Teslim stok hareketi yazmaz: malzeme sepetle ya da çıkışla düşülür.
export async function malzemeIstegiGecir(db: Db, kisiId: number, id: number, gecis: IstekGecisi, g: { surum: number; karsilanan?: string }): Promise<MalzemeIstegiCevabi> {
  const i = await sorgular.istekBul(db, id, true);
  if (i) {
    await istasyonKapsaminiDenetle(db, kisiId, i.istasyonId);
    // Teslim alınınca kapanış (teslimiKapat) bu işlevden geçmez; buradaki geçişler depo işidir.
    if (i.kaynakIstasyonId !== null) throw cakisma(ISTASYON_ISTEGI);
    const engel = istekGecisEngeli(i.durum, gecis);
    if (engel) throw cakisma(engel);
    // Listedeki istek iptal edilmez: liste onu yine toplar ve taşır (kart #1410).
    const liste = gecis === 'iptal' ? istekListeEngeli(i) : null;
    if (liste) throw cakisma(liste);
  }
  const durum = ({ hazirla: 'hazirlaniyor', teslim: 'teslim', iptal: 'iptal' } as const)[gecis];
  await surumluGuncelle({
    guncelle: () => sorgular.istekGecir(db, id, g.surum, { kaynaklar: ISTEK_GECIS_KAYNAKLARI[gecis], durum, karsilanan: gecis === 'teslim' ? g.karsilanan! : null, kapatanKisiId: gecis === 'hazirla' ? null : kisiId }),
    varMi: () => sorgular.istekVarMi(db, id),
    bulunamadiIletisi: 'Malzeme isteği bulunamadı.',
  });
  if (i && gecis === 'teslim') await kalaniAc(db, i, g.karsilanan!);
  return malzemeIstegiOku(db, id);
}
// Kısmi karşılanan isteğin kalanı aynı kişiye, istasyona ve emre yeni istekle açılır; kimliği kapanan isteğe bağlıdır, ikinci kez açılmaz.
export const kalanKimligi = (i: IstekHam): string => `${i.kaynakKimligi.slice(0, 100)}~k${i.id}`;
export async function kalaniAc(db: Db, i: IstekHam, karsilanan: string): Promise<void> {
  const miktar = istekKalani(i.miktar, karsilanan);
  if (miktar === null) return;
  await sorgular.istekAc(db, {
    no: await belgeNo(db, 'stok.malzeme-istegi-no', 'stok_malzeme_istegi'), kaynakKimligi: kalanKimligi(i), malzemeId: i.malzemeId, miktar, istasyonId: i.istasyonId,
    uretimEmriId: i.uretimEmriId, aciklama: `${i.no} kalanı`, kisiId: i.kisiId, kaynakIstasyonId: i.kaynakIstasyonId,
    durum: i.kaynakIstasyonId !== null ? 'acik' : istekAcilisDurumu(await depodakiMiktar(db, i.malzemeId), miktar),
  });
}

// ---- Malzeme · Teslim: bütün sayfalardan istek ve iki adımlı teslim (kart #1208) ------------------------------------------------
// Depo isteği teslim eder. İstasyonsuz istekte malzeme kişinin istasyonuna taşınır (kart #1289, "İstasyonuna aktar"): istasyon
// verilmezse kişinin bulunduğu istasyon (STK-T7); o da bilinmiyorsa depo seçer. İstasyonlu istek teslim kaydıyla taşınır, burada yalnız kapanır.
export async function istekTeslimEt(db: Db, k: Kullanici, id: number, g: IstekTeslimGovdesi): Promise<MalzemeIstegiCevabi> {
  const i = await sorgular.istekBul(db, id, true);
  if (i) await istasyonKapsaminiDenetle(db, k.id, i.istasyonId);
  if (i?.kaynakIstasyonId != null) throw cakisma(ISTASYON_ISTEGI);
  const listede = i ? istekListeEngeli(i) : null;
  if (listede) throw cakisma(listede);
  if (i && i.istasyonId === null) {
    const engel = istekGecisEngeli(i.durum, 'teslim');
    if (engel) throw cakisma(engel);
    if (g.kaynakKonumId === undefined) throw dogrulama('Malzemenin verildiği konumu seçin.', 'kaynakKonumId');
    const kaynak = await aktifKonum(db, Number(g.kaynakKonumId), 'kaynakKonumId');
    if (kaynak.tur === 'istasyon') throw dogrulama('İstasyondan kişiye teslim, teslim et ile yapılır.', 'kaynakKonumId');
    let istasyonId = g.istasyonId === undefined || g.istasyonId === null ? null : Number(g.istasyonId);
    if (istasyonId === null) {
      const kapsamdakiler = await kapsamdakiIstasyonlar(db, await kapsamOku(db, i.kisiId));
      istasyonId = buradakiIstasyon(await acikIstasyon(db, i.kisiId), kapsamdakiler.map((x) => x.id));
    }
    if (istasyonId === null) throw dogrulama('Kişinin bulunduğu istasyon bilinmiyor; istasyonu seçin.', 'istasyonId');
    const hedef = await istasyonKonumuBul(db, istasyonId, 'istasyonId');
    const statuId = g.statuId === undefined || g.statuId === null ? null : Number(g.statuId);
    let partiId: number | null;
    if (g.partiId !== undefined) partiId = g.partiId === null ? null : Number(g.partiId);
    else {
      const p = partiSec(await sorgular.konumdakiPartiler(db, i.malzemeId, kaynak.id, statuId), undefined);
      if (p.tur === 'secim-gerekli') throw dogrulama('Bu konumda birden çok parti var; partiyi seçin.', 'partiId', { partiler: p.partiler });
      partiId = p.partiId;
    }
    const miktar = bindenMetin(binde(g.karsilanan));
    await korumali(async () => {
      await siraliKilitle(db, { malzemeId: i.malzemeId, konumId: kaynak.id, partiId, statuId }, { malzemeId: i.malzemeId, konumId: hedef, partiId, statuId });
      const b = await sorgular.bakiyeKilitle(db, i.malzemeId, kaynak.id, partiId, statuId);
      if (binde(b?.miktar ?? '0') < binde(miktar)) throw dogrulama(`Konumda yeterli stok yok (mevcut ${bindenMetin(binde(b?.miktar ?? '0'))}).`, 'karsilanan');
      if (i.uretimEmriId !== null) await rezerveyiAsmasin(db, i.malzemeId, statuId, i.uretimEmriId, binde(miktar));
      await emreKartiSagla(db, k.id, { uretimEmriId: i.uretimEmriId, partiId, malzemeId: i.malzemeId });
      await sorgular.hareketYaz(db, hareket({
        tur: 'transfer', malzemeId: i.malzemeId, miktar, kisiId: k.id, partiId, partiSecimi: partiId === null ? null : 'kisi', kaynakKonumId: kaynak.id, hedefKonumId: hedef,
        onayliEksi: false, uretimEmriId: i.uretimEmriId, kaynakStatuId: statuId, hedefStatuId: statuId,
        aciklama: [`İstek ${i.no}`, istenenFazlaNotu(i.miktar, miktar)].filter((x) => x !== null).join(' · '),
      }));
      await bakiyeDegistir(db, { malzemeId: i.malzemeId, konumId: kaynak.id, partiId, statuId, fark: -binde(miktar) });
      await bakiyeDegistir(db, { malzemeId: i.malzemeId, konumId: hedef, partiId, statuId, fark: binde(miktar), ilkGiris: b?.ilkGiris ?? null });
    });
  }
  return malzemeIstegiGecir(db, k.id, id, 'teslim', g);
}

// Biten ya da iptal edilen emre istek açılmaz (kart #1413): kapanınca açık istekleri de iptal olur.
async function istenebilirEmir(db: Db, uretimEmriId: number): Promise<void> {
  const e = await uretimEmriOzeti(db, uretimEmriId);
  if (e === null) throw dogrulama('Üretim emri bulunamadı.', 'uretimEmriId');
  if (e.durum === 'bitti' || e.durum === 'iptal') throw dogrulama(`Emir ${e.emirNo} ${e.durum === 'bitti' ? 'bitti' : 'iptal edildi'}; malzeme istenmez.`, 'uretimEmriId');
}
// Depo konumlarındaki (raf, kabul, zemin) serbest ve statülü toplam; istek açılış durumunun ölçüsüdür (STK-T1).
export async function depodakiMiktar(db: Db, malzemeId: number): Promise<string> {
  return bindenMetin((await sorgular.istekStoklari(db, [malzemeId])).reduce((t, r) => t + binde(r.miktar), 0n));
}
export const kapsamOku = (db: Db, kisiId: number): Promise<Kapsam> => kisininKapsami(db, kisiId, kisininIzinliIsMerkezleri);
// Liste süzgeci için kapsamdaki bütün istasyonlar (pasifler dahil); sınırsız kapsamda null (süzülmez). İstasyonu olmayan kayıt süzgeçte ayrıca geçer.
export async function istasyonKapsamiIdleri(db: Db, kapsam: Kapsam): Promise<number[] | null> {
  if (kapsamSuzgeci(kapsam) === null) return null;
  return (await tumIstasyonlar(db, { pasiflerDahil: true })).filter((i) => kapsamdaMi(kapsam, i.isMerkeziId)).map((i) => i.id);
}
// Tekil kayıt ve komut: istasyonlu kaydın iş merkezi kişinin kapsamında olmalıdır; istasyonsuz kayıt geçer.
export async function istasyonKapsaminiDenetle(db: Db, kisiId: number, istasyonId: number | null): Promise<void> {
  if (istasyonId === null) return;
  kapsamDisiysaReddet(await kapsamOku(db, kisiId), (await istasyonGetir(db, istasyonId))?.isMerkeziId ?? null);
}
// Kapsamdaki aktif istasyonlar; sınırsız kapsamda null (hepsi).
export async function kapsamdakiIstasyonlar(db: Db, kapsam: Kapsam): Promise<{ id: number; kod: string; ad: string; isMerkeziId: number | null }[]> {
  return (await aktifIstasyonlar(db)).filter((i) => kapsamdaMi(kapsam, i.isMerkeziId)).map((i) => ({ id: i.id, kod: i.kod, ad: i.ad, isMerkeziId: i.isMerkeziId }));
}
// İstasyonun stok konumu ilk kullanımda ana depoda açılır; adı istasyonun adıdır (harita ve istasyonlar aynı kaydı gösterir).
export async function istasyonKonumuBul(db: Db, istasyonId: number, alan: string): Promise<number> {
  const varOlan = await sorgular.istasyonKonumu(db, istasyonId);
  if (varOlan !== null) return varOlan;
  const ist = await istasyonGetir(db, istasyonId);
  if (!ist || !ist.aktif) throw dogrulama('İstasyon bulunamadı ya da pasif.', alan);
  const id = await sorgular.istasyonKonumuAc(db, { depoId: await anaDepo(db), kod: `IST-${istasyonId}`, ad: ist.ad.slice(0, 60), istasyonId });
  return id ?? (await sorgular.istasyonKonumu(db, istasyonId))!;
}
// Yer, istasyon ya da stok konumudur. Kaynak istasyonsa kişinin kapsamında olmalıdır; kaynak depo konumuysa depo işlemi gerekir.
export async function yerCoz(db: Db, k: Kullanici, yer: TeslimYeri, alan: string, kaynakMi: boolean, kapsam: Kapsam): Promise<number> {
  if ('istasyonId' in yer) {
    const istasyonId = Number(yer.istasyonId);
    if (kaynakMi) {
      const ist = await istasyonGetir(db, istasyonId);
      if (!ist || !ist.aktif) throw dogrulama('İstasyon bulunamadı ya da pasif.', alan);
      kapsamDisiysaReddet(kapsam, ist.isMerkeziId);
    }
    return istasyonKonumuBul(db, istasyonId, alan);
  }
  const konumId = Number(yer.konumId);
  const konum = await aktifKonum(db, konumId, alan);
  // Okutulan istasyon etiketi konum kodu taşır: istasyon olarak çözülür, kapsam denetimi aynı yoldan geçer.
  if (konum.tur === 'istasyon') {
    const istasyonId = await sorgular.konumIstasyonu(db, konumId);
    if (istasyonId === null) throw dogrulama('İstasyon bulunamadı ya da pasif.', alan);
    return yerCoz(db, k, { istasyonId }, alan, kaynakMi, kapsam);
  }
  // Serbest ara alan fabrikadaki ortak bekleme yeridir: oradan almak depo işlemi istemez.
  if (kaynakMi && konum.tur !== 'ara_alan' && !islemVarMi(k, 'stok.transfer')) throw yetkiYok();
  return konumId;
}
// İstasyon konumunun saklı kodu (IST-<id>) yalnız konum tekilliği içindir; ekranda istasyonun kendi kodu görünür.
export async function istasyonKodlari(db: Db, istasyonIdler: readonly (number | null)[]): Promise<Map<number, string>> {
  if (!istasyonIdler.some((i) => i !== null)) return new Map();
  return new Map((await tumIstasyonlar(db, { pasiflerDahil: true })).map((i) => [i.id, i.kod]));
}
export async function toplamaHedefiGoster(db: Db, toplamaId: number) {
  const h = await sorgular.toplamaHedefi(db, toplamaId);
  if (h === null || h.istasyonId === null) return h;
  return { ...h, kod: (await istasyonKodlari(db, [h.istasyonId])).get(h.istasyonId) ?? h.kod };
}
async function teslimleriAdlandir(db: Db, satirlar: TeslimHam[]): Promise<Teslim[]> {
  const ad = await adlar(db, satirlar.map((t) => t.malzemeId));
  const sureDk = satirlar.some((t) => t.durum === 'yolda') ? await sistemAyariOku(db, 'stok.yolda-suresi-dk') : null;
  const uclar = new Map((await sorgular.teslimUclari(db, [...new Set(satirlar.flatMap((t) => [t.kaynakKonumId, t.hedefKonumId]))])).map((u) => [u.konumId, u]));
  const kisiler = await kisiAdlari(db, [...new Set(satirlar.flatMap((t) => [t.gonderenKisiId, t.kapatanKisiId, t.aliciKisiId, t.itirazKisiId].filter((x): x is number => x !== null)))]);
  const istKodlari = await istasyonKodlari(db, [...uclar.values()].map((u) => u.istasyonId));
  const uc = (id: number) => { const u = uclar.get(id); return { konumId: id, kod: (u?.istasyonId == null ? undefined : istKodlari.get(u.istasyonId)) ?? u?.kod ?? '', ad: u?.ad ?? null, istasyonId: u?.istasyonId ?? null }; };
  return satirlar.map((t) => ({
    id: t.id, no: t.no, malzemeId: t.malzemeId, malzemeAd: ad.get(t.malzemeId) ?? null, miktar: t.miktar, partiId: t.partiId, statuId: t.statuId, kaliteDurumu: t.kaliteDurumu,
    kaynak: uc(t.kaynakKonumId), hedef: uc(t.hedefKonumId), uretimEmriId: t.uretimEmriId, istekId: t.istekId, aciklama: t.aciklama, durum: t.durum,
    alinan: t.alinan, redNedeni: t.redNedeni, gonderenAd: kisiler.get(t.gonderenKisiId) ?? null,
    kapatanAd: t.kapatanKisiId === null ? null : kisiler.get(t.kapatanKisiId) ?? null, aliciAd: t.aliciKisiId === null ? null : kisiler.get(t.aliciKisiId) ?? null, gonderim: t.gonderim, kapanis: t.kapanis, surum: t.surum,
    okutarak: t.okutarak, itirazSonu: t.itirazSonu, sureSonu: t.durum === 'yolda' ? yoldaSureSonu(t.gonderim, sureDk) : null,
    itiraz: t.itirazNedeni === null || t.itirazZamani === null ? null
      : { neden: t.itirazNedeni, kisiAd: t.itirazKisiId === null ? null : kisiler.get(t.itirazKisiId) ?? null, zaman: t.itirazZamani, iadeTeslimId: t.iadeTeslimId },
  }));
}
export async function teslimOku(db: Db, id: number): Promise<TeslimCevabi> {
  const t = await sorgular.teslimBul(db, id);
  if (!t) throw bulunamadi('Teslim bulunamadı.');
  return { teslim: (await teslimleriAdlandir(db, [t]))[0]! };
}
// Stoklanan, kullanılabilir kart; hizmet istenmez (satın alma talebiyle alınır).
export async function istenebilirKart(db: Db, malzemeId: number) {
  const o = await malzemeOzeti(db, malzemeId);
  if (!o) throw dogrulama('Malzeme kartı bulunamadı.', 'malzemeId');
  if (!stoklanirMi(o.tur)) throw dogrulama(`${o.ad ?? o.kod}: hizmet stoktan istenmez; satın alma talebiyle alınır.`, 'malzemeId');
  if (!(await malzemeKullanilabilirMi(db, malzemeId))) throw gecersiz(`${o.ad ?? o.kod}: kart kullanılabilir değil.`);
  return o;
}

// Bütün sayfalardan istek: kaynak kimliği kişiye bağlanır (başkasının ya da Arkon'un kimliğiyle çakışmaz). İstasyonsuz istek
// isteyen kişiye teslim edilir; istasyon verilirse kişinin kapsamında olmalıdır.
export async function genelIstekAc(db: Db, k: Kullanici, g: IstekAcGovdesi): Promise<MalzemeIstegiCevabi> {
  const kaynakKimligi = `kisi:${k.id}:${g.kaynakKimligi}`.slice(0, 120);
  const onceki = (await sorgular.istekleriKaynaktan(db, [kaynakKimligi]))[0];
  if (onceki) return malzemeIstegiOku(db, onceki.id);
  const malzemeId = Number(g.malzemeId);
  await istenebilirKart(db, malzemeId);
  const istasyonId = g.istasyonId === null ? null : Number(g.istasyonId);
  if (istasyonId !== null) {
    const ist = await istasyonGetir(db, istasyonId);
    if (!ist || !ist.aktif) throw dogrulama('İstasyon bulunamadı ya da pasif.', 'istasyonId');
    kapsamDisiysaReddet(await kapsamOku(db, k.id), ist.isMerkeziId);
  }
  const uretimEmriId = g.uretimEmriId === undefined || g.uretimEmriId === null ? null : Number(g.uretimEmriId);
  if (uretimEmriId !== null) await istenebilirEmir(db, uretimEmriId);
  // Soru 96 a: istasyondan istenen istek depo stoğuna bakmaz, açık açılır; o istasyonun yetkilisi karşılar. Kaynak istasyon kapsam dışı olabilir.
  const kaynakIstasyonId = g.kaynakIstasyonId === undefined || g.kaynakIstasyonId === null ? null : Number(g.kaynakIstasyonId);
  if (kaynakIstasyonId !== null) {
    const kaynak = await istasyonGetir(db, kaynakIstasyonId);
    if (!kaynak || !kaynak.aktif) throw dogrulama('Kaynak istasyon bulunamadı ya da pasif.', 'kaynakIstasyonId');
    const engel = istasyondanIstekEngeli(kaynakIstasyonId, istasyonId);
    if (engel) throw dogrulama(engel, istasyonId === null ? 'istasyonId' : 'kaynakIstasyonId');
  }
  const durum = kaynakIstasyonId !== null ? 'acik' : istekAcilisDurumu(await depodakiMiktar(db, malzemeId), g.miktar);
  const id = await sorgular.istekAc(db, {
    no: await belgeNo(db, 'stok.malzeme-istegi-no', 'stok_malzeme_istegi'), kaynakKimligi, malzemeId, miktar: g.miktar, istasyonId, uretimEmriId,
    aciklama: g.not ?? null, kisiId: k.id, durum, kaynakIstasyonId,
  });
  return malzemeIstegiOku(db, id ?? (await sorgular.istekleriKaynaktan(db, [kaynakKimligi]))[0]!.id);
}

// Seçici: katalogdaki onaylı stoklanan kartlar, depo konumlarındaki serbest miktar ve statü kırılımıyla. Stoğu olmayan kart da listelenir.
export async function istekMalzemeleri(db: Db, ara: string | undefined): Promise<IstekMalzemeleriCevabi> {
  // Yalnız onaylı (aktif) kart: onaysız kart istenemez, seçicide de sunulmaz.
  const kartlar = (await malzemeAra(db, { metin: ara ?? '', turler: STOKLANIR_TURLER, yalnizAktif: true, sayfa: 1, sayfaBoyu: 30 })).satirlar;
  const stok = await sorgular.istekStoklari(db, kartlar.map((m) => m.id));
  return {
    malzemeler: kartlar.map((m) => {
      const satirlar = stok.filter((r) => r.malzemeId === m.id);
      return {
        id: m.id, kod: m.kod, ad: m.ad, birim: m.birim,
        kullanilabilir: satirlar.find((r) => r.statuId === null)?.miktar ?? '0',
        statuler: satirlar.flatMap((r) => (r.statuId === null ? [] : [{ statuId: r.statuId, miktar: r.miktar }])),
      };
    }),
  };
}

async function teslimHaritasi(db: Db): Promise<TeslimKutusuCevabi['harita']> {
  const depoId = await anaDepo(db);
  const y = await sorgular.yerlesim(db, depoId);
  if (!y) return null;
  return {
    bina: { x0: say(y.bina_x0), x1: say(y.bina_x1), z0: say(y.bina_z0), z1: say(y.bina_z1) }, kareBoyu: say(y.kare_boyu),
  };
}
async function teslimZemini(db: Db, konumIdleri: ReadonlySet<number>): Promise<TeslimKutusuCevabi['zemin']> {
  const { z, konumKaresi } = await zeminDurumu(db);
  if (z.bolumler.length === 0) return null;
  return {
    bolumler: z.bolumler.map(({ salonId, kod, sutunlar, satirlar }) => ({ salonId, kod, sutunlar, satirlar })),
    istasyonlar: z.bolumler.flatMap((b) => b.nesneler.flatMap((n) => (n.tur === 'istasyon' ? [{ istasyonId: n.id, salonId: b.salonId, hucre: n.hucre }] : []))),
    konumlar: [...konumKaresi].flatMap(([konumId, y]) => (konumIdleri.has(konumId) ? [{ konumId, salonId: y.salonId, hucre: y.hucre }] : [])),
  };
}
// Kendi gönderdiğim gelen sayılmaz; başka kişiye yazılan teslim (STK-T8) o kişinindir.
// Soru 133: kişiye teslim istasyona teslimdir; alıcı adı yalnız bilgi, istasyondaki herkes görür (kapsamı çağıran süzer).
export const banaGelen = (t: TeslimHam, kisiId: number): boolean => t.gonderenKisiId !== kisiId;
export async function teslimKutusu(db: Db, k: Kullanici): Promise<TeslimKutusuCevabi> {
  const kapsam = await kapsamOku(db, k.id);
  const istasyonlar = await kapsamdakiIstasyonlar(db, kapsam);
  // Kapsamı sınırsız kişi bütün istasyonlara geleni görür (iş merkezi olmayan istasyon dahil).
  const sinirsiz = kapsamSuzgeci(kapsam) === null;
  const gelen = await sorgular.yoldakiGelenler(db, sinirsiz ? null : istasyonlar.map((i) => i.id), islemVarMi(k, 'stok.transfer'));
  const depoKonumlari = await sorgular.teslimDepoKonumlari(db);
  const araAlanlar = await sorgular.teslimAraAlanlari(db);
  return {
    gelenler: await teslimleriAdlandir(db, gelen.filter((t) => banaGelen(t, k.id))),
    gonderdiklerim: await teslimleriAdlandir(db, await sorgular.gonderdiklerim(db, k.id)),
    isteklerim: await istekleriAdlandir(db, await sorgular.isteklerim(db, k.id)),
    bendenIstenenler: await istekleriAdlandir(db, await sorgular.istasyondanIstenenler(db, sinirsiz ? null : istasyonlar.map((i) => i.id))),
    okutarakAlinanlar: await teslimleriAdlandir(db, await sorgular.okutarakAlinanlar(db, sinirsiz ? null : istasyonlar.map((i) => i.id), k.id)),
    istasyonlar: istasyonlar.map(({ id, kod, ad }) => ({ id, kod, ad })),
    hedefIstasyonlar: (await aktifIstasyonlar(db)).map((i) => ({ id: i.id, kod: i.kod, ad: i.ad })),
    depoKonumlari,
    araAlanlar,
    buradakiIstasyonId: buradakiIstasyon(await acikIstasyon(db, k.id), istasyonlar.map((i) => i.id)),
    harita: await teslimHaritasi(db),
    zemin: await teslimZemini(db, new Set([...depoKonumlari, ...araAlanlar].map((x) => x.id))),
  };
}
// Yoldaki teslim kaynağında ayrılmıştır (kart #1410): konumdaki satırlar serbest miktarla verilir, yoldaki ayrıca yazılır.
async function konumdakiSerbest(db: Db, konumId: number): Promise<(BakiyeHam & { yolda: string })[]> {
  const yolda = await sorgular.konumdakiYoldaAyrilanlar(db, konumId);
  return (await sorgular.konumBakiyeleri(db, konumId)).flatMap((x) => {
    const y = binde(yolda.find((t) => t.malzemeId === x.malzemeId && t.partiId === x.partiId && t.statuId === x.statuId && t.kaliteDurumu === x.kaliteDurumu)?.miktar ?? '0');
    const serbest = binde(x.miktar) - y;
    return binde(x.miktar) > 0n ? [{ ...x, miktar: ucHane(serbest > 0n ? serbest : 0n), yolda: ucHane(y) }] : [];
  });
}
// Bakiye numeric(14,3) metni gibi üç haneli yazılır: serbest ve yolda bakiye satırıyla aynı biçimde döner.
function ucHane(b: bigint): string {
  const [tam, kesir = ''] = bindenMetin(b).split('.');
  return `${tam}.${kesir.padEnd(3, '0')}`;
}
// Kaynak satırı kilitlenir: eşzamanlı iki gönderim aynı serbest miktarı ikisi birden ayıramaz.
export async function serbestDenetle(
  db: Db, malzemeId: number, konumId: number, partiId: number | null, statuId: number | null, miktar: string, eylem: string, kalite: KaliteDurumu = 'serbest',
): Promise<void> {
  const b = await sorgular.bakiyeKilitle(db, malzemeId, konumId, partiId, statuId, kalite);
  const engel = serbestMiktarEngeli(b?.miktar ?? '0', await sorgular.yoldaAyrilan(db, malzemeId, konumId, partiId, statuId, kalite), miktar, eylem);
  if (engel) throw dogrulama(engel, 'miktar');
}
// Gönderilecek yerdeki stok: istasyon kişinin kapsamında olmalı, depo konumu depo işlemi ister (gönderimle aynı kural).
export async function yerdekiStok(db: Db, k: Kullanici, yer: TeslimYeri): Promise<YerdekiStokCevabi> {
  let konumId: number | null;
  if ('istasyonId' in yer) {
    const ist = await istasyonGetir(db, Number(yer.istasyonId));
    if (!ist) throw bulunamadi('İstasyon bulunamadı.');
    kapsamDisiysaReddet(await kapsamOku(db, k.id), ist.isMerkeziId);
    konumId = await sorgular.istasyonKonumu(db, ist.id);
  } else {
    konumId = Number(yer.konumId);
    if ((await sorgular.konumBul(db, konumId))?.tur !== 'ara_alan' && !islemVarMi(k, 'stok.transfer')) throw yetkiYok();
  }
  if (konumId === null) return { satirlar: [] };
  const b = await konumdakiSerbest(db, konumId);
  const kartlar = await malzemeOzetleri(db, [...new Set(b.map((x) => x.malzemeId))]);
  const nolar = await emirNoHaritasi(db, b.map((x) => x.uretimEmriId));
  return {
    satirlar: b.filter((x) => binde(x.miktar) > 0n).map((x) => {
      const m = kartlar.get(x.malzemeId);
      return { malzemeId: x.malzemeId, kod: m?.kod ?? null, ad: m?.ad ?? null, partiId: x.partiId, partiEtiketi: partiEtiketi(x.partiId === null ? null : x, emirNoDe(nolar, x.uretimEmriId)), statuId: x.statuId,
        kaliteDurumu: x.kaliteDurumu, miktar: x.miktar };
    }),
  };
}
// Kişi kodu anahtarı süreç başına üretilir ve hiçbir yere yazılmaz: kod kısa ömürlüdür, sunucu yeniden başlayınca ekran yeni kodu alır.
const KISI_KODU_ANAHTARI = randomBytes(32);
const kisiKoduImzasi = (govde: string): string => createHmac('sha256', KISI_KODU_ANAHTARI).update(govde).digest('hex').slice(0, 32);
export function kisiKodu(k: Kullanici, simdiMs = Date.now()): KisiKoduCevabi {
  const sonSn = Math.floor(simdiMs / 1000) + KISI_KODU_SURESI_SN;
  const govde = kisiKoduGovdesi(k.id, sonSn);
  return { kod: `${govde}-${kisiKoduImzasi(govde)}`, gecerlilikSonu: new Date(sonSn * 1000).toISOString() };
}
// Kişi kodu değilse null; kişi koduysa imza ve süre doğrulanır, kişinin bulunduğu istasyon (STK-T7) bulunur.
export async function kisiKoduCoz(db: Db, ham: string, alan = 'kod'): Promise<{ kisiId: number; ad: string | null; istasyon: { id: number; kod: string; ad: string } } | null> {
  const p = kisiKoduAyristir(ham);
  if (!p) return null;
  const beklenen = Buffer.from(kisiKoduImzasi(p.govde)), gelen = Buffer.from(p.imza);
  const engel = kisiKoduEngeli(p.sonSn, Math.floor(Date.now() / 1000), gelen.length === beklenen.length && timingSafeEqual(gelen, beklenen));
  if (engel) throw dogrulama(engel, alan);
  const ad = (await kisiAdlari(db, [p.kisiId])).get(p.kisiId) ?? null;
  const istasyonlar = await kapsamdakiIstasyonlar(db, await kapsamOku(db, p.kisiId));
  const buradaki = buradakiIstasyon(await acikIstasyon(db, p.kisiId), istasyonlar.map((i) => i.id));
  const ist = istasyonlar.find((i) => i.id === buradaki);
  if (!ist) throw dogrulama(`${ad ?? 'Kişi'} şu an bir istasyonda görünmüyor; teslim yerinin etiketini okutun.`, alan);
  return { kisiId: p.kisiId, ad, istasyon: { id: ist.id, kod: ist.kod, ad: ist.ad } };
}
// QR Okut paneli (karar 91 a): alınabilir yer teslim gönderimiyle aynı kuraldır (yerCoz): kapsamdaki istasyon, serbest ara alan; depo
// işlemi olana her konum. Pasif ya da bilinmeyen kod "bilinmiyor" döner.
export async function okutCoz(db: Db, k: Kullanici, ham: string): Promise<OkutCozCevabi> {
  const kisi = await kisiKoduCoz(db, ham);
  if (kisi) return { tur: 'kisi', kod: ham.trim(), kisi: { id: kisi.kisiId, ad: kisi.ad }, istasyon: kisi.istasyon };
  const kapsam = await kapsamOku(db, k.id);
  const istasyonlar = new Set((await kapsamdakiIstasyonlar(db, kapsam)).map((i) => i.id));
  const depocu = islemVarMi(k, 'stok.transfer');
  const yerOku = async (konumIdler: number[]): Promise<Map<number, OkutYeri>> => {
    const uclar = await sorgular.teslimUclari(db, [...new Set(konumIdler)]);
    const kodlar = await istasyonKodlari(db, uclar.map((u) => u.istasyonId));
    return new Map(uclar.filter((u) => u.aktif).map((u) => [u.konumId, {
      konumId: u.konumId, kod: (u.istasyonId === null ? undefined : kodlar.get(u.istasyonId)) ?? u.kod, ad: u.ad, tur: u.tur, istasyonId: u.istasyonId,
    }]));
  };
  const alinir = (y: OkutYeri): boolean => (y.tur === 'istasyon' ? y.istasyonId !== null && istasyonlar.has(y.istasyonId) : depocu || y.tur === 'ara_alan');
  const yerCevabi = async (kod: string): Promise<OkutCozCevabi | null> => {
    const satir = await sorgular.konumKoduyla(db, kod);
    const yer = satir === null ? undefined : (await yerOku([satir.id])).get(satir.id);
    if (yer === undefined) return null;
    if (!alinir(yer)) return { tur: 'yer', yer, satirlar: null };
    return { tur: 'yer', yer, satirlar: (await yerdekiStok(db, k, yer.istasyonId === null ? { konumId: yer.konumId } : { istasyonId: yer.istasyonId })).satirlar };
  };
  // Serbest miktar okutulan bakiyelerden tek seferde çıkar: yerler ve yoldaki ayrılanlar topluca okunur, yer başına sorgu atılmaz.
  const malzemeCevabi = async (malzemeId: number, parti: { id: number; etiket: string; uretimEmriId: number | null } | null, bakiyeler: BakiyeHam[]): Promise<OkutCozCevabi | null> => {
    const o = await malzemeOzeti(db, malzemeId);
    if (!o) return null;
    const dolu = bakiyeler.filter((b) => b.malzemeId === malzemeId && (parti === null || b.partiId === parti.id) && binde(b.miktar) > 0n);
    const yerHaritasi = await yerOku(dolu.map((b) => b.konumId));
    const alinanlar = dolu.filter((b) => { const y = yerHaritasi.get(b.konumId); return y !== undefined && alinir(y); });
    const yolda = await sorgular.konumlardakiYoldaAyrilanlar(db, malzemeId, [...new Set(alinanlar.map((b) => b.konumId))]);
    const nolar = await emirNoHaritasi(db, alinanlar.map((b) => b.uretimEmriId));
    const yerler: Extract<OkutCozCevabi, { tur: 'malzeme' }>['yerler'] = [];
    for (const konumId of new Set(alinanlar.map((b) => b.konumId))) {
      const yer = yerHaritasi.get(konumId)!;
      for (const x of alinanlar.filter((b) => b.konumId === konumId)) {
        const y = binde(yolda.find((t) => t.konumId === konumId && t.partiId === x.partiId && t.statuId === x.statuId && t.kaliteDurumu === x.kaliteDurumu)?.miktar ?? '0');
        const serbest = binde(x.miktar) - y;
        if (serbest <= 0n) continue;
        yerler.push({ ...yer, partiId: x.partiId, partiEtiketi: partiEtiketi(x.partiId === null ? null : x, emirNoDe(nolar, x.uretimEmriId)), statuId: x.statuId, kaliteDurumu: x.kaliteDurumu, miktar: ucHane(serbest) });
      }
    }
    return { tur: 'malzeme', malzeme: { id: o.id, kod: o.kod, ad: o.ad, birim: o.birim, tur: o.tur }, parti, yerler, digerIstasyonlar: await digerIstasyonlar(malzemeId, parti) };
  };
  // Soru 93 a: kapsam dışı istasyonlardaki serbest miktar yalnız gösterilir; teslim akışına girmez (Malzeme iste ile alınır).
  const digerIstasyonlar = async (malzemeId: number, parti: { id: number } | null) =>
    (await malzemeninIstasyonlari(db, malzemeId, parti?.id)).filter((x) => !istasyonlar.has(x.istasyonId))
      .map(({ istasyonId, kod, ad, miktar }) => ({ istasyonId, kod, ad, miktar }));
  const onekli = async (t: KodTuru): Promise<OkutCozCevabi | null> => {
    let bulunan: OkutCozCevabi | null = null;
    if (t.tur === 'konum') bulunan = await yerCevabi(t.deger);
    else if (t.tur === 'malzeme') bulunan = await malzemeCevabi(Number(t.deger), null, await sorgular.malzemeBakiyeleri(db, Number(t.deger)));
    else if (t.tur === 'lot') {
      const p = await sorgular.lotNoylaParti(db, t.deger);
      const nolar = p === null ? new Map() : await emirNoHaritasi(db, [p.uretimEmriId]);
      if (p) await kartaBagliLotuReddet(db, k, p.id);
      if (p) bulunan = await malzemeCevabi(p.malzemeId, { id: p.id, etiket: partiEtiketi(p, emirNoDe(nolar, p.uretimEmriId)) ?? p.lotNo, uretimEmriId: p.uretimEmriId }, await sorgular.lotBakiyeleri(db, p.id));
    } else if (t.tur === 'refakat-partisi') {
      // Refakat kartı (kart #123): veren için lotun alabileceği yerleri, alan için kendisine o kartla yoldaki teslimleri taşır (Soru 118 a).
      // Lot bekleyen (istisna) kartın lotu yok: okutma ekranı onu Dal 8'de gösterir; burada kod tanınmaz.
      // Soru 128: kartın satırları her okutana gelir; istisna kartı (lotsuz) da okutulur, alınacak yeri yoktur.
      const r = await sorgular.etkinRefakatPartisiBul(db, Number(t.deger));
      const lotId = r?.partiId ?? null;
      const refakat = r === null ? undefined : (await refakatPartileriCevir(db, [r]))[0];
      const m = !r || !refakat ? null : lotId === null
        ? await malzemeCevabi(r.malzemeId, null, [])
        : await malzemeCevabi(r.malzemeId, { id: lotId, etiket: refakat.etiket, uretimEmriId: null }, await sorgular.lotBakiyeleri(db, lotId));
      if (r && refakat && m?.tur === 'malzeme') {
        const gelenler: TeslimHam[] = [];
        if (lotId !== null) for (const x of await sorgular.refakatYoldakiTeslimleri(db, r.uretimEmriId, lotId)) if (banaGelen(x, k.id) && await teslimAlabilir(db, k, x)) gelenler.push(x);
        const kartSatirlari = await refakatKartSatirlari(db, r.id);
        const anaEylem = refakatAnaEylemi({ gelenSayisi: gelenler.length, kartAcik: refakat.durum === 'acik', satirIstasyonlari: kartSatirlari.map((x) => x.istasyonId), kapsamdakiIstasyonlar: istasyonlar });
        bulunan = { ...m, ...(lotId === null ? { parti: null, digerIstasyonlar: [] } : {}), refakat, gelenler: await teslimleriAdlandir(db, gelenler), kartSatirlari, anaEylem };
      }
    } else if (t.tur === 'raf') {
      const raf = await sorgular.rafKoduyla(db, t.deger);
      if (raf) {
        const gozler = await sorgular.rafinGozleri(db, raf.id);
        const yerler = await yerOku(gozler.map((g) => g.konumId));
        const icerikli: Extract<OkutCozCevabi, { tur: 'raf' }>['gozler'] = [];
        for (const y of gozler.flatMap((g) => yerler.get(g.konumId) ?? [])) {
          icerikli.push({ ...y, satirlar: alinir(y) ? (await yerdekiStok(db, k, { konumId: y.konumId })).satirlar : null });
        }
        bulunan = { tur: 'raf', raf, gozler: icerikli };
      }
    } else if (t.tur === 'uretim-emri' && t.bicim === 'kimlik') {
      return { tur: 'eski-kart', kod: ham.trim(), uretimEmriId: Number(t.deger) };
    }
    return bulunan;
  };
  // 1338 a, 1342 a: okutulan yerde başkasının sepetindeki miktar etiket olarak gelir; stok ayrılmaz.
  const sepetler = async (c: OkutCozCevabi): Promise<OkutCozCevabi> => {
    const konumlar = c.tur === 'yer' ? [c.yer.konumId] : c.tur === 'malzeme' ? c.yerler.map((y) => y.konumId) : c.tur === 'raf' ? c.gozler.map((g) => g.konumId) : [];
    const satirlar = await sorgular.baskaSepetlerdekiler(db, [...new Set(konumlar)], k.id);
    if (satirlar.length === 0) return c;
    const adlar = await kisiAdlari(db, [...new Set(satirlar.map((x) => x.kisiId))]);
    const baskaSepetler = satirlar.filter((x) => c.tur !== 'malzeme' || x.malzemeId === c.malzeme.id)
      .map(({ kisiId, ...x }) => ({ ...x, kisiAd: adlar.get(kisiId) ?? null }));
    return baskaSepetler.length === 0 ? c : { ...c, baskaSepetler } as OkutCozCevabi;
  };
  const stokluCevap = async (c: OkutCozCevabi): Promise<OkutCozCevabi> =>
    sepetler((c.tur === 'malzeme' || c.tur === 'yer') && stokOkurMu(k) ? { ...c, stok: await kodCoz(db, ham) } : c);
  const c = await sirayliCoz(db, ham, { onekli, konum: yerCevabi, malzeme: async (no) => malzemeCevabi(no, null, await sorgular.malzemeBakiyeleri(db, no)) });
  if (c === null) return { tur: 'bilinmiyor', kod: ham.trim() };
  return c.tur === 'eski-kart' ? c : stokluCevap(c);
}
// Stok okuması (sayfa ya da herhangi bir stok işlemi): okutma cevabına gözler ve toplam eklenir; panel ayrıca istek atmaz.
const stokOkurMu = (k: Kullanici): boolean => islemVarMi(k, 'sayfa.stok') || STOK_ISLEMLERI.some((i) => islemVarMi(k, i));
// İstasyon sepeti (kart #1353): istasyonun stoğu kapsamdaki herkese açıktır. Getiren, satıra son giren hareketin kişisidir (teslim,
// üretim sayımı ya da statü dönüşümü). Sonraki istasyon emrin iş emirlerinden okunur; adımın statüsünü Reçete ve Rota çözer.
export async function istasyonSepeti(db: Db, k: Kullanici, istasyonId: number): Promise<IstasyonSepetiCevabi> {
  const ist = await istasyonGetir(db, istasyonId);
  if (!ist) throw bulunamadi('İstasyon bulunamadı.');
  kapsamDisiysaReddet(await kapsamOku(db, k.id), ist.isMerkeziId);
  return sepetiOku(db, ist);
}
// 1868: bir okumada birden çok sepet (iki sepet, gelecek sepet) aynı emir dilimini ve emir adımlarını paylaşır; emir başına ayrıntı
// okunmaz. Yalnız tek okumanın içinde yaşar (yazımdan sonra yeniden kurulur).
interface SepetBellegi { dilim: Promise<Awaited<ReturnType<typeof emirDilimi>>> | null; adimlar: Map<number, Awaited<ReturnType<typeof emirlerinAdimIstasyonlari>> extends Map<number, infer A> ? A | null : never> }
const sepetBellegi = (): SepetBellegi => ({ dilim: null, adimlar: new Map() });
async function bellektenEmirAdimlari(db: Db, idler: readonly number[], b: SepetBellegi): Promise<void> {
  const eksik = [...new Set(idler)].filter((id) => !b.adimlar.has(id));
  if (eksik.length === 0) return;
  const okunan = await emirlerinAdimIstasyonlari(db, eksik);
  for (const id of eksik) b.adimlar.set(id, okunan.get(id) ?? null);
}
async function sepetiOku(db: Db, ist: { id: number; kod: string; ad: string }, bellek: SepetBellegi = sepetBellegi()): Promise<IstasyonSepetiCevabi> {
  const konumId = await sorgular.istasyonKonumu(db, ist.id);
  const istasyon = { id: ist.id, kod: ist.kod, ad: ist.ad };
  const emirler = await istasyonEmirleri(db, ist.id, bellek);
  if (konumId === null) return { istasyon, emirler, satirlar: [] };
  const b = await konumdakiSerbest(db, konumId);
  const kartlar = await malzemeOzetleri(db, [...new Set(b.map((x) => x.malzemeId))]);
  const girisler = await sorgular.konumaSonGirisler(db, konumId);
  const giris = (x: BakiyeHam) => girisler.find((g) => g.malzemeId === x.malzemeId && g.partiId === x.partiId && g.statuId === x.statuId);
  const kisiler = await kisiAdlari(db, [...new Set(girisler.map((g) => g.kisiId))]);
  const adimlar = new Map<number, SepetAdimi[]>();
  const adlar = new Map<number, { kod: string | null; ad: string }>();
  const nolar = await emirNoHaritasi(db, b.map((x) => x.uretimEmriId));
  const sepettekiEmirler = [...new Set(b.flatMap((x) => (x.uretimEmriId === null ? [] : [x.uretimEmriId])))];
  await bellektenEmirAdimlari(db, sepettekiEmirler, bellek);
  for (const emirId of sepettekiEmirler) {
    const e = bellek.adimlar.get(emirId) ?? null;
    if (e === null) continue;
    const malzemeNo = e.urunId;
    for (const i of e.adimlar) if (i.istasyon) adlar.set(i.istasyon.id, i.istasyon);
    const rota: SepetAdimi[] = [];
    for (const i of e.adimlar) {
      rota.push({ sira: i.sira, opNo: i.opNo, istasyonId: i.istasyon?.id ?? null, statuId: adimStatusu === null ? null : await adimStatusu(db, { malzemeNo, opNo: i.opNo, uretimEmriId: emirId }) });
    }
    adimlar.set(emirId, rota);
  }
  return {
    istasyon, emirler,
    satirlar: b.map((x) => {
      const m = kartlar.get(x.malzemeId);
      const g = giris(x);
      const rota = x.uretimEmriId === null ? undefined : adimlar.get(x.uretimEmriId);
      const s = rota === undefined ? { yok: 'rota-disi' as const } : sonrakiIstasyon(rota, ist.id, x.statuId);
      const ad = 'yok' in s ? undefined : adlar.get(s.istasyonId);
      return {
        malzemeId: x.malzemeId, kod: m?.kod ?? null, ad: m?.ad ?? null, partiId: x.partiId, partiEtiketi: partiEtiketi(x.partiId === null ? null : x, emirNoDe(nolar, x.uretimEmriId)), statuId: x.statuId,
        miktar: x.miktar, yolda: x.yolda, uretimEmriId: x.uretimEmriId, getiren: g === undefined ? null : kisiler.get(g.kisiId) ?? null, gelis: g?.zaman ?? null, koken: g?.koken ?? null,
        sonraki: 'yok' in s ? null : { istasyonId: s.istasyonId, kod: ad?.kod ?? null, ad: ad?.ad ?? `#${s.istasyonId}`, opNo: s.opNo },
        sonrakiYok: 'yok' in s ? s.yok : null,
      };
    }),
  };
}
async function istasyonEmirleri(db: Db, istasyonId: number, bellek?: SepetBellegi): Promise<{ id: number; emirNo: string }[]> {
  if (bellek && bellek.dilim === null) bellek.dilim = emirDilimi(db);
  return (await (bellek?.dilim ?? emirDilimi(db)))
    .filter((e) => e.durum !== 'bitti' && e.durum !== 'iptal' && e.durum !== 'taslak' && e.isEmirleri.some((i) => i.istasyonId === istasyonId && i.durum !== 'tamam'))
    .map((e) => ({ id: e.id, emirNo: e.emirNo }));
}
// Teslim edilmeyen parça (kart #1289): kullanacak istasyon, emirlerinin rotasındaki öteki istasyonların sepetinde sonraki adımı
// kendisi olan satırları görür. Kaynak istasyon çekenin kapsamında olmak zorunda değildir; parça zaten ona gidecektir.
export async function gelecekSepet(db: Db, k: Kullanici, istasyonId: number, bellek: SepetBellegi = sepetBellegi()): Promise<GelecekSepetCevabi> {
  const ist = await istasyonGetir(db, istasyonId);
  if (!ist) throw bulunamadi('İstasyon bulunamadı.');
  kapsamDisiysaReddet(await kapsamOku(db, k.id), ist.isMerkeziId);
  const kaynaklar = new Set<number>();
  const emirler = await istasyonEmirleri(db, ist.id, bellek);
  await bellektenEmirAdimlari(db, emirler.map((e) => e.id), bellek);
  for (const e of emirler) {
    for (const i of bellek.adimlar.get(e.id)?.adimlar ?? []) if (i.istasyon && i.istasyon.id !== ist.id) kaynaklar.add(i.istasyon.id);
  }
  const satirlar: GelecekSepetCevabi['satirlar'] = [];
  const istasyonlar = kaynaklar.size === 0 ? new Map<number, { id: number; kod: string; ad: string }>() : new Map((await tumIstasyonlar(db, { pasiflerDahil: true })).map((i) => [i.id, i]));
  for (const kaynakId of kaynaklar) {
    const kaynak = istasyonlar.get(kaynakId);
    if (!kaynak) continue;
    const sepet = await sepetiOku(db, kaynak, bellek);
    for (const x of sepet.satirlar) if (x.sonraki?.istasyonId === ist.id && binde(x.miktar) > 0n) satirlar.push({ ...x, kaynak: sepet.istasyon });
  }
  return { satirlar };
}
// İki sepet (745): emre süzülmüş gelecek sepet ve yoldaki teslimler gelendir, istasyonun kendi sepeti çıkandır. Düğmeler var olan
// uçlardır (sepetten çek, teslim al, teslim gönder); bu okuma yeni işlem açmaz.
export async function istasyonSepetleri(db: Db, k: Kullanici, istasyonId: number, uretimEmriId: number): Promise<IstasyonSepetleriCevabi> {
  const ist = await istasyonGetir(db, istasyonId);
  if (!ist) throw bulunamadi('İstasyon bulunamadı.');
  kapsamDisiysaReddet(await kapsamOku(db, k.id), ist.isMerkeziId);
  const bellek = sepetBellegi();
  const bekleyen = (await gelecekSepet(db, k, istasyonId, bellek)).satirlar.filter((x) => x.uretimEmriId === uretimEmriId);
  const yolda = (await sorgular.yoldakiGelenler(db, [istasyonId], false)).filter((t) => t.uretimEmriId === uretimEmriId);
  const sepet = await sepetiOku(db, ist, bellek);
  return { istasyon: sepet.istasyon, gelen: { bekleyen, yolda: await teslimleriAdlandir(db, yolda) }, cikan: sepet.satirlar.filter((x) => x.uretimEmriId === uretimEmriId) };
}
// Teslim al ile çekme: çeken hem gönderen hem alan olur; teslim açılır ve aynı anda kapanır (kayıt ve hareket teslim etle aynıdır).
export async function sepettenCek(db: Db, k: Kullanici, g: SepettenCekGovdesi): Promise<TeslimCevabi> {
  const kaynakKimligi = `cek:${k.id}:${g.kaynakKimligi}`.slice(0, 120);
  const onceki = await sorgular.teslimKaynaktan(db, kaynakKimligi);
  if (onceki) return teslimOku(db, onceki.id);
  const istasyonId = Number(g.istasyonId);
  const kaynakIstasyonId = Number(g.kaynakIstasyonId);
  const partiId = g.partiId === null ? null : Number(g.partiId);
  const statuId = g.statuId === null ? null : Number(g.statuId);
  const x = (await gelecekSepet(db, k, istasyonId)).satirlar.find((s) => s.kaynak.id === kaynakIstasyonId && s.malzemeId === Number(g.malzemeId)
    && s.partiId === partiId && s.statuId === statuId);
  if (!x) throw dogrulama('Bu parça önceki istasyonun sepetinde yok ya da sonraki adımı bu istasyon değil.', 'malzemeId');
  if (binde(g.miktar) > binde(x.miktar)) throw dogrulama(`Sepette ${bindenMetin(binde(x.miktar))} var; fazlası çekilemez.`, 'miktar');
  const kaynak = await istasyonKonumuBul(db, kaynakIstasyonId, 'kaynakIstasyonId');
  const hedef = await istasyonKonumuBul(db, istasyonId, 'istasyonId');
  const miktar = bindenMetin(binde(g.miktar));
  const id = await korumali(async () => {
    await serbestDenetle(db, x.malzemeId, kaynak, partiId, statuId, miktar, 'çekilemez');
    if (x.uretimEmriId !== null) await rezerveyiAsmasin(db, x.malzemeId, statuId, x.uretimEmriId, binde(miktar));
    return teslimYaz(db, {
      no: await belgeNo(db, 'stok.teslim-no', 'stok_teslim'), kaynakKimligi, malzemeId: x.malzemeId, miktar, partiId, statuId, kaliteDurumu: 'serbest', kaynakKonumId: kaynak, hedefKonumId: hedef,
      uretimEmriId: x.uretimEmriId, istekId: null, aciklama: `Önceki istasyonun sepetinden çekildi · ${x.kaynak.ad}`.slice(0, 200), gonderenKisiId: k.id,
    });
  });
  if (id === null) return teslimOku(db, (await sorgular.teslimKaynaktan(db, kaynakKimligi))!.id);
  const t = (await sorgular.teslimBul(db, id, true))!;
  await teslimiKapat(db, k.id, t, miktar, t.surum, 'miktar');
  return teslimOku(db, id);
}

// ---- Malzeme iste: istasyondan istek (soru 96 a) ve okutarak alma (soru 96 b) ----------------------------------------------------
// İstasyonlardaki serbest miktar (yoldaki düşülür, kalitesi serbest), istasyon ve statü başına. Kapsam süzmez: soru 93 a ve 96 bunu
// malzeme isteyebilen herkese açtı; çağıran yalnız miktarı gösterir, gönderim yine kendi kuralından geçer.
async function malzemeninIstasyonlari(db: Db, malzemeId: number, partiId?: number): Promise<MalzemeYerleriCevabi['istasyonlar']> {
  const konumlar = [...new Set((await sorgular.malzemeBakiyeleri(db, malzemeId))
    .filter((b) => b.konumTur === 'istasyon' && binde(b.miktar) > 0n && (partiId === undefined || b.partiId === partiId)).map((b) => b.konumId))];
  const ist = new Map((await aktifIstasyonlar(db)).map((i) => [i.id, i]));
  const sonuc: MalzemeYerleriCevabi['istasyonlar'] = [];
  for (const u of await sorgular.teslimUclari(db, konumlar)) {
    const i = u.aktif && u.istasyonId !== null ? ist.get(u.istasyonId) : undefined;
    if (!i) continue;
    const toplam = new Map<number | null, bigint>();
    for (const x of await konumdakiSerbest(db, u.konumId)) {
      if (x.malzemeId === malzemeId && x.kaliteDurumu === 'serbest' && (partiId === undefined || x.partiId === partiId)) toplam.set(x.statuId, (toplam.get(x.statuId) ?? 0n) + binde(x.miktar));
    }
    for (const [statuId, m] of toplam) if (m > 0n) sonuc.push({ istasyonId: i.id, kod: i.kod, ad: i.ad, statuId, miktar: bindenMetin(m) });
  }
  return sonuc;
}
export async function malzemeYerleri(db: Db, malzemeId: number): Promise<MalzemeYerleriCevabi> {
  await istenebilirKart(db, malzemeId);
  return { depo: await depodakiMiktar(db, malzemeId), istasyonlar: await malzemeninIstasyonlari(db, malzemeId) };
}
// İstasyondan istenen istek o istasyonun kapsamındaki kişiye düşer; kabul eden teslimi istekle gönderir, isteyen istasyon teslimi alınca
// istek kapanır (iki imza korunur). İsteği açan kendi isteğini kabul edemez.
async function istasyonIstegiAl(db: Db, k: Kullanici, id: number): Promise<IstekHam & { kaynakIstasyonId: number }> {
  const i = await sorgular.istekBul(db, id, true);
  if (!i) throw bulunamadi('Malzeme isteği bulunamadı.');
  if (i.kaynakIstasyonId === null) throw cakisma('Bu istek depodan istendi; depo karşılar.');
  await istasyonKapsaminiDenetle(db, k.id, i.kaynakIstasyonId);
  if (i.kisiId === k.id) throw yetkiYok('Kendi isteğinizi kabul edemez ya da reddedemezsiniz.');
  return { ...i, kaynakIstasyonId: i.kaynakIstasyonId };
}
export async function istekKabulEt(db: Db, k: Kullanici, id: number, g: IstekKabulGovdesi): Promise<MalzemeIstegiCevabi> {
  const kaynakKimligi = `kabul:${k.id}:${g.kaynakKimligi}`.slice(0, 120);
  if (await sorgular.teslimKaynaktan(db, kaynakKimligi)) return malzemeIstegiOku(db, id);
  const i = await istasyonIstegiAl(db, k, id);
  if (i.istasyonId === null) throw cakisma('İsteğin teslim yeri yok.');
  await istenebilirKart(db, i.malzemeId);
  const kaynak = await istasyonKonumuBul(db, i.kaynakIstasyonId, 'kaynakIstasyonId');
  const hedef = await istasyonKonumuBul(db, i.istasyonId, 'istasyonId');
  const statuId = g.statuId === undefined || g.statuId === null ? null : Number(g.statuId);
  let partiId: number | null;
  if (g.partiId !== undefined) partiId = g.partiId === null ? null : Number(g.partiId);
  else {
    const p = partiSec(await sorgular.konumdakiPartiler(db, i.malzemeId, kaynak, statuId), undefined);
    if (p.tur === 'secim-gerekli') throw dogrulama('Bu istasyonda birden çok parti var; partiyi seçin.', 'partiId', { partiler: p.partiler });
    partiId = p.partiId;
  }
  // K2: başka emrin partisi bu isteğe gönderilmez.
  const partiEmri = partiId === null ? null : (await sorgular.partiBul(db, partiId))?.uretimEmriId ?? null;
  if (partiEmri !== null && partiEmri !== i.uretimEmriId) throw dogrulama('Bu parti başka bir emrin; isteğe gönderilmez.', 'partiId');
  const miktar = bindenMetin(binde(g.miktar));
  await surumluGuncelle({
    guncelle: () => sorgular.istekGecir(db, id, g.surum, { kaynaklar: ISTEK_GECIS_KAYNAKLARI.hazirla, durum: 'hazirlaniyor', karsilanan: null, kapatanKisiId: null }),
    varMi: () => sorgular.istekVarMi(db, id), bulunamadiIletisi: 'Malzeme isteği bulunamadı.',
  });
  await korumali(async () => {
    await serbestDenetle(db, i.malzemeId, kaynak, partiId, statuId, miktar, 'gönderilemez');
    if (i.uretimEmriId !== null) await rezerveyiAsmasin(db, i.malzemeId, statuId, i.uretimEmriId, binde(miktar));
    return teslimYaz(db, {
      no: await belgeNo(db, 'stok.teslim-no', 'stok_teslim'), kaynakKimligi, malzemeId: i.malzemeId, miktar, partiId, statuId, kaliteDurumu: 'serbest', kaynakKonumId: kaynak, hedefKonumId: hedef,
      uretimEmriId: i.uretimEmriId, istekId: i.id, aciklama: [`İstek ${i.no}`, istenenFazlaNotu(i.miktar, miktar)].filter((x) => x !== null).join(' · '), gonderenKisiId: k.id,
    });
  });
  return malzemeIstegiOku(db, id);
}
export async function istekReddet(db: Db, k: Kullanici, id: number, g: IstekReddetGovdesi): Promise<MalzemeIstegiCevabi> {
  await istasyonIstegiAl(db, k, id);
  await surumluGuncelle({
    guncelle: () => sorgular.istekReddet(db, id, g.surum, { neden: g.neden, kisiId: k.id }),
    varMi: () => sorgular.istekVarMi(db, id), bulunamadiIletisi: 'Malzeme isteği bulunamadı.',
  });
  return malzemeIstegiOku(db, id);
}
// Okutulan malzeme ya da lot (okutCoz ile aynı çözüm sırası); konum ve bilinmeyen kod malzeme değildir.
async function okutulanMalzeme(db: Db, ham: string): Promise<{ malzemeId: number; partiId: number | null } | null> {
  const t = kodTuru(ham);
  if (t.tur === 'lot') { const p = await sorgular.lotNoylaParti(db, t.deger); return p ? { malzemeId: p.malzemeId, partiId: p.id } : null; }
  if (t.tur === 'malzeme') return { malzemeId: Number(t.deger), partiId: null };
  if (t.tur === 'refakat-partisi') { const r = await sorgular.etkinRefakatPartisiBul(db, Number(t.deger)); return r ? { malzemeId: r.malzemeId, partiId: r.partiId } : null; }
  if (t.tur === 'konum') return null;
  const no = geriDusmeKodlari(ham).kartNo ?? await katalogEtiketiKartNo(db, ham);
  return no === null ? null : { malzemeId: no, partiId: null };
}
// Okutulan yer etiketi yalnız aktif istasyon konumu olabilir: okutarak alma istasyondan istasyona yapılır.
async function okutulanIstasyonYeri(db: Db, ham: string): Promise<{ konumId: number; istasyonId: number; kod: string; ad: string } | null> {
  const t = kodTuru(ham);
  const kod = t.tur === 'konum' ? t.deger : geriDusmeKodlari(ham).konumKodu;
  const satir = await sorgular.konumKoduyla(db, kod);
  const u = satir === null ? undefined : (await sorgular.teslimUclari(db, [satir.id]))[0];
  if (!u || !u.aktif || u.tur !== 'istasyon' || u.istasyonId === null) return null;
  const ist = await istasyonGetir(db, u.istasyonId);
  return ist && ist.aktif ? { konumId: u.konumId, istasyonId: ist.id, kod: ist.kod, ad: ist.ad } : null;
}
async function okutarakAlinacak(db: Db, kod: string, yerKodu: string) {
  const m = await okutulanMalzeme(db, kod);
  const o = m === null ? null : await malzemeOzeti(db, m.malzemeId);
  if (m === null || !o) throw dogrulama('Okutulan kod malzeme ya da lot değil.', 'kod');
  const yer = await okutulanIstasyonYeri(db, yerKodu);
  if (yer === null) throw dogrulama('Aldığınız yerin istasyon etiketini okutun.', 'yerKodu');
  return { m, o, yer };
}
export async function okutarakAlOnizle(db: Db, kod: string, yerKodu: string): Promise<OkutarakAlCevabi> {
  const { m, o, yer } = await okutarakAlinacak(db, kod, yerKodu);
  const serbest = (await konumdakiSerbest(db, yer.konumId))
    .filter((x) => x.malzemeId === m.malzemeId && x.kaliteDurumu === 'serbest' && (m.partiId === null || x.partiId === m.partiId) && binde(x.miktar) > 0n);
  const nolar = await emirNoHaritasi(db, serbest.map((x) => x.uretimEmriId));
  return {
    malzeme: { id: o.id, kod: o.kod, ad: o.ad, birim: o.birim }, yer,
    satirlar: serbest.map((x) => ({ partiId: x.partiId, partiEtiketi: partiEtiketi(x.partiId === null ? null : x, emirNoDe(nolar, x.uretimEmriId)), statuId: x.statuId, uretimEmriId: x.uretimEmriId, miktar: x.miktar })),
  };
}
// Bırakınca teslimde itiraz eden hedef taraftır: süre hedef istasyonun (hedef depo ise kaynağın) vardiyasıdır; ikisi de istasyon değilse tesis günü.
export async function birakmaItirazSuresi(db: Db, hedefKonumId: number, kaynakKonumId: number): Promise<string> {
  const uclar = await sorgular.teslimUclari(db, [hedefKonumId, kaynakKonumId]);
  const ist = uclar.find((u) => u.konumId === hedefKonumId)?.istasyonId ?? uclar.find((u) => u.konumId === kaynakKonumId)?.istasyonId ?? null;
  if (ist !== null) return itirazSuresi(db, ist);
  return new Date(tesisGunBasi(tesisGunu(Date.now() + 24 * 3600 * 1000))).toISOString();
}
// İtiraz süresi kaynak istasyonun o gün başlayan vardiyalarının bitişidir; takvim okunamazsa tesis gününün sonu.
async function itirazSuresi(db: Db, istasyonId: number): Promise<string> {
  const an = Date.now();
  const gun = tesisGunu(an);
  const yarin = new Date(tesisGunBasi(gun) + 36 * 3600 * 1000);
  const takvim = await basladigiGunTakvimi(db, { tur: 'istasyon', id: istasyonId }, gun).catch((h: unknown) => { if (h instanceof UygulamaHatasi) return null; throw h; });
  return itirazSonu(an, takvim?.bitis ?? null, tesisGunBasi(tesisGunu(yarin)));
}
// Soru 96 b: alan kişi malzemeyi ve aldığı yeri okutur; teslim kaynak onayı olmadan açılıp aynı anda alınır (T7 değişti). Telafi:
// 1 yalnız serbest ve kalitesi serbest stok, başka emrin partisi değil; 2 kaynak istasyona bildirim; 3 süre içinde itiraz; 4 kayıt işaretli.
export async function okutarakAl(db: Db, k: Kullanici, g: OkutarakAlGovdesi): Promise<TeslimCevabi> {
  const kaynakKimligi = `okut:${k.id}:${g.kaynakKimligi}`.slice(0, 120);
  const onceki = await sorgular.teslimKaynaktan(db, kaynakKimligi);
  if (onceki) return teslimOku(db, onceki.id);
  const { m, o, yer } = await okutarakAlinacak(db, g.kod, g.yerKodu);
  await istenebilirKart(db, m.malzemeId);
  const partiId = g.partiId === null ? null : Number(g.partiId);
  if (m.partiId !== null && m.partiId !== partiId) throw dogrulama('Okutulan lot ile seçilen parti aynı değil.', 'partiId');
  const hedefIstasyon = await istasyonGetir(db, Number(g.istasyonId));
  if (!hedefIstasyon || !hedefIstasyon.aktif) throw dogrulama('İstasyon bulunamadı ya da pasif.', 'istasyonId');
  kapsamDisiysaReddet(await kapsamOku(db, k.id), hedefIstasyon.isMerkeziId);
  const partiEmriId = partiId === null ? null : (await sorgular.partiBul(db, partiId))?.uretimEmriId ?? null;
  const uretimEmriId = g.uretimEmriId === undefined || g.uretimEmriId === null ? partiEmriId : Number(g.uretimEmriId);
  if (uretimEmriId !== null && uretimEmriId !== partiEmriId) await istenebilirEmir(db, uretimEmriId);
  const engel = okutarakAlmaEngeli({ kalite: 'serbest', partiEmriId, uretimEmriId, kaynakIstasyonId: yer.istasyonId, hedefIstasyonId: hedefIstasyon.id });
  if (engel) throw dogrulama(engel, 'kod');
  const hedef = await istasyonKonumuBul(db, hedefIstasyon.id, 'istasyonId');
  const statuId = g.statuId === null ? null : Number(g.statuId);
  const miktar = bindenMetin(binde(g.miktar));
  const sure = await itirazSuresi(db, yer.istasyonId);
  const id = await korumali(async () => {
    await serbestDenetle(db, m.malzemeId, yer.konumId, partiId, statuId, miktar, 'alınamaz');
    if (uretimEmriId !== null) await rezerveyiAsmasin(db, m.malzemeId, statuId, uretimEmriId, binde(miktar));
    return teslimYaz(db, {
      no: await belgeNo(db, 'stok.teslim-no', 'stok_teslim'), kaynakKimligi, malzemeId: m.malzemeId, miktar, partiId, statuId, kaliteDurumu: 'serbest', kaynakKonumId: yer.konumId, hedefKonumId: hedef,
      uretimEmriId, istekId: null, aciklama: 'Okutarak alındı, kaynak onayı yok', gonderenKisiId: k.id, itirazSonu: sure,
    });
  });
  if (id === null) return teslimOku(db, (await sorgular.teslimKaynaktan(db, kaynakKimligi))!.id);
  const t = (await sorgular.teslimBul(db, id, true))!;
  await teslimiKapat(db, k.id, t, miktar, t.surum, 'miktar');
  const alan = (await kisiAdlari(db, [k.id])).get(k.id) ?? null;
  await bildirimGonder(db, {
    tur: 'stok.okutarak-alindi', baslik: `${yer.ad}: ${o.ad ?? o.kod} okutarak alındı`.slice(0, 200),
    metin: `${miktar}${o.birim ? ` ${o.birim}` : ''} ${hedefIstasyon.ad} istasyonuna alındı${alan ? ` (${alan})` : ''}, ${t.no}. İtiraz: Okut > Teslim et.`,
    kisiler: (await istasyondakiKisiler(db, yer.istasyonId)).map((x) => x.kisiId), haric: k.id, kaynakKimlik: t.no,
  });
  return teslimOku(db, id);
}
// Kartın satırları (Soru 128). Alınabilir: kalitesi serbest, ayrılmış, yolda ve fason konumunda değil; yoldaki düşülür.
export async function refakatKartSatirlari(db: Db, kartId: number): Promise<RefakatKartSatiri[]> {
  const satirlar = await sorgular.kartSatirlari(db, kartId);
  const kartlar = await malzemeOzetleri(db, [...new Set(satirlar.map((x) => x.malzemeId))]);
  const kapali = new Set<string>([...AYRILMIS_KONUM_TURLERI, 'yolda', 'fason']);
  return satirlar.map((x) => {
    const m = kartlar.get(x.malzemeId);
    const kalan = binde(x.miktar) - binde(x.yolda);
    const alinabilir = x.kaliteDurumu === 'serbest' && !kapali.has(x.konumTur) && kalan > 0n ? kalan : 0n;
    return {
      konumId: x.konumId, konumKod: x.konumKod, konumAd: x.konumAd, konumTur: x.konumTur, istasyonId: x.istasyonId, malzemeId: x.malzemeId, malzemeKod: m?.kod ?? null, malzemeAd: m?.ad ?? null,
      birim: m?.birim ?? null, partiId: x.partiId, partiEtiketi: x.lotNo, statuId: x.statuId, kaliteDurumu: x.kaliteDurumu, miktar: x.miktar, yolda: x.yolda, alinabilir: bindenMetin(alinabilir),
    };
  });
}
// Serbest Al (Soru 133): kartı okutan, kartın satırından kendi istasyonuna alır. Okutarak almanın (96 b) telafileri aynıdır: yalnız serbest,
// kaynak istasyona bildirim, süre içinde itiraz; kaynak depo ise itiraz süresi alanın istasyonunun vardiyasıdır.
export async function kartlaAl(db: Db, k: Kullanici, id: number, g: KartlaAlGovdesi): Promise<TeslimCevabi> {
  const kaynakKimligi = `kart-al:${k.id}:${g.kaynakKimligi}`.slice(0, 120);
  const onceki = await sorgular.teslimKaynaktan(db, kaynakKimligi);
  if (onceki) return teslimOku(db, onceki.id);
  const r = await sorgular.etkinRefakatPartisiBul(db, id);
  if (!r) throw bulunamadi('Refakat kartı bulunamadı.');
  if (r.durum !== 'acik') throw cakisma('Refakat kartı iptal edilmiş.');
  const statuId = g.statuId === null ? null : Number(g.statuId);
  const partiId = Number(g.partiId);
  const satir = (await refakatKartSatirlari(db, r.id)).find((x) => x.konumId === Number(g.konumId) && x.partiId === partiId && x.statuId === statuId && x.kaliteDurumu === 'serbest');
  if (!satir) throw dogrulama('Kartın bu satırı yok ya da kalitesi serbest değil.', 'konumId');
  const miktar = bindenMetin(binde(g.miktar));
  if (binde(miktar) > binde(satir.alinabilir)) throw dogrulama(`Bu satırdan en çok ${bindenMetin(binde(satir.alinabilir))} alınır.`, 'miktar');
  const hedefIstasyon = await istasyonGetir(db, Number(g.istasyonId));
  if (!hedefIstasyon || !hedefIstasyon.aktif) throw dogrulama('İstasyon bulunamadı ya da pasif.', 'istasyonId');
  kapsamDisiysaReddet(await kapsamOku(db, k.id), hedefIstasyon.isMerkeziId);
  if (satir.istasyonId === hedefIstasyon.id) throw dogrulama('Malzeme zaten bu istasyonda.', 'istasyonId');
  const hedef = await istasyonKonumuBul(db, hedefIstasyon.id, 'istasyonId');
  const sure = await itirazSuresi(db, satir.istasyonId ?? hedefIstasyon.id);
  const tid = await korumali(async () => {
    await serbestDenetle(db, satir.malzemeId, satir.konumId, partiId, statuId, miktar, 'alınamaz');
    await rezerveyiAsmasin(db, satir.malzemeId, statuId, r.uretimEmriId, binde(miktar));
    return teslimYaz(db, {
      no: await belgeNo(db, 'stok.teslim-no', 'stok_teslim'), kaynakKimligi, malzemeId: satir.malzemeId, miktar, partiId, statuId, kaliteDurumu: 'serbest', kaynakKonumId: satir.konumId, hedefKonumId: hedef,
      uretimEmriId: r.uretimEmriId, istekId: null, aciklama: 'Kartla alındı (Serbest Al), kaynak onayı yok', gonderenKisiId: k.id, itirazSonu: sure,
    });
  });
  if (tid === null) return teslimOku(db, (await sorgular.teslimKaynaktan(db, kaynakKimligi))!.id);
  const t = (await sorgular.teslimBul(db, tid, true))!;
  await teslimiKapat(db, k.id, t, miktar, t.surum, 'miktar');
  if (satir.istasyonId !== null) {
    const alan = (await kisiAdlari(db, [k.id])).get(k.id) ?? null;
    await bildirimGonder(db, {
      tur: 'stok.okutarak-alindi', baslik: `${satir.konumAd ?? satir.konumKod}: ${satir.malzemeAd ?? satir.malzemeKod ?? 'malzeme'} kartla alındı`.slice(0, 200),
      metin: `${miktar}${satir.birim ? ` ${satir.birim}` : ''} ${hedefIstasyon.ad} istasyonuna alındı${alan ? ` (${alan})` : ''}, ${t.no}. İtiraz: Okut > Teslim et.`,
      kisiler: (await istasyondakiKisiler(db, satir.istasyonId)).map((x) => x.kisiId), haric: k.id, kaynakKimlik: t.no,
    });
  }
  return teslimOku(db, tid);
}
// Yolda süresi (Soru 133): süresi dolan teslim "Süre doldu" notuyla iptal olur; stok kaynakta kalır, ayırma kalkar (yolda düşülmez olur).
// İstek teslim alınana kadar açık kaldığından yeniden gönderilebilir. Gönderen ve hedef istasyon bildirim alır. Döner: iptal edilen sayısı.
export async function suresiDolanTeslimleriIptal(db: Db): Promise<number> {
  const dk = await sistemAyariOku(db, 'stok.yolda-suresi-dk');
  if (dk === null) return 0;
  let n = 0;
  for (const t of await sorgular.suresiDolanTeslimler(db, dk)) {
    const kapandi = await sorgular.teslimKapat(db, t.id, t.surum, { durum: 'iptal', alinan: null, redNedeni: null, hareketId: null, kisiId: t.gonderenKisiId });
    if (!kapandi) continue;
    await sorgular.teslimeNotYaz(db, t.id, 'Süre doldu');
    await istegiYenidenDene(db, t.gonderenKisiId, t.istekId);
    n++;
    const hedefIstasyonId = (await sorgular.teslimUclari(db, [t.hedefKonumId]))[0]?.istasyonId ?? null;
    const alicilar = hedefIstasyonId === null ? [] : (await istasyondakiKisiler(db, hedefIstasyonId)).map((x) => x.kisiId);
    await bildirimGonder(db, {
      tur: 'stok.teslim-suresi-doldu', baslik: `${t.no}: yolda süresi doldu`,
      metin: `${t.no} alınmadan süresi doldu ve iptal oldu; malzeme kaynakta kalır. Göndermek için yeniden Teslim et.`,
      kisiler: [...new Set([t.gonderenKisiId, ...alicilar])], kaynakKimlik: t.no,
    });
  }
  return n;
}
// Telafi 3: kaynak istasyonun kapsamındaki kişi süre içinde bir kez itiraz eder. İtiraz geri almaz: malzeme alanın istasyonunda serbestse
// alan kişiden kaynağa iade teslimi açılır (kaynak taraf teslim alır); kullanılmışsa yalnız itiraz kalır, alan kişi ve depo görür.
export async function teslimItiraz(db: Db, k: Kullanici, id: number, g: ItirazGovdesi): Promise<TeslimCevabi> {
  const t = await sorgular.teslimBul(db, id, true);
  if (!t) throw bulunamadi('Teslim bulunamadı.');
  if (!t.okutarak || t.durum !== 'teslim') throw cakisma('Yalnız onaysız teslime (okutarak alınan ya da bırakılan) itiraz edilir.');
  // Karşı taraf itiraz eder: okutarak almada kaynak, bırakınca teslimde hedef (Soru 133). İki uç da istasyon değilse depo işlemi gerekir.
  const uclar = await sorgular.teslimUclari(db, [t.kaynakKonumId, t.hedefKonumId]);
  const istasyonlari = [t.kaynakKonumId, t.hedefKonumId].map((kid) => uclar.find((u) => u.konumId === kid)?.istasyonId ?? null);
  const kapsam = await kapsamOku(db, k.id);
  let yetkili = false;
  for (const ist of istasyonlari) {
    if (ist === null) { yetkili ||= islemVarMi(k, 'stok.transfer'); continue; }
    const i = await istasyonGetir(db, ist);
    yetkili ||= kapsamdaMi(kapsam, i?.isMerkeziId ?? null);
  }
  if (!yetkili) throw yetkiYok('Bu teslimin iki ucunda da yetkiniz yok.');
  if (t.kapatanKisiId === k.id) throw yetkiYok('Kendi aldığınız malzemeye itiraz edemezsiniz.');
  if (t.itirazNedeni !== null) throw cakisma('Bu teslime itiraz edildi.');
  if (t.itirazSonu === null || Date.parse(t.itirazSonu) <= Date.now()) throw cakisma('İtiraz süresi bitti; depoya ya da amirinize bildirin.');
  await surumluGuncelle({
    guncelle: () => sorgular.itirazYaz(db, id, g.surum, { neden: g.neden, kisiId: k.id }),
    varMi: () => sorgular.teslimVarMi(db, id), bulunamadiIletisi: 'Teslim bulunamadı.',
  });
  const b = await sorgular.bakiyeKilitle(db, t.malzemeId, t.hedefKonumId, t.partiId, t.statuId, 'serbest');
  const serbest = binde(b?.miktar ?? '0') - binde(await sorgular.yoldaAyrilan(db, t.malzemeId, t.hedefKonumId, t.partiId, t.statuId, 'serbest'));
  const alinan = binde(t.alinan ?? t.miktar);
  const iade = serbest < alinan ? serbest : alinan;
  if (iade > 0n) {
    const iadeId = await teslimYaz(db, {
      no: await belgeNo(db, 'stok.teslim-no', 'stok_teslim'), kaynakKimligi: `itiraz:${t.id}`, malzemeId: t.malzemeId, miktar: bindenMetin(iade), partiId: t.partiId, statuId: t.statuId,
      kaliteDurumu: 'serbest', kaynakKonumId: t.hedefKonumId, hedefKonumId: t.kaynakKonumId, uretimEmriId: t.uretimEmriId, istekId: null,
      aciklama: `İtiraz iadesi · ${t.no}`, gonderenKisiId: t.kapatanKisiId ?? t.gonderenKisiId,
    });
    if (iadeId !== null) await sorgular.iadeBagla(db, t.id, iadeId);
  }
  return teslimOku(db, id);
}
