import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import { bildirimKapat } from '../bildirim/disari.ts';
import { adimBittiBildir, emirBittiBildir } from './emir-olaylari.ts';
import { kaynaktaMuayeneKaynagi } from './is-olayi-bildirimi.ts';
import { fasonBaglami, gkkFasonuBul, kolSonuysaKatil, muayeneBelgeKapisi, muayeneBelgeleri, muayeneKarariniYaz, siradakiIstasyonuYaz, ustuOnceKilitle } from './is-emri-servis.ts';
import { EMIR_YOK, IS_EMRI_YOK, MUAYENE_ADET_YOK, MUAYENE_GONDERILEN_ASIMI, OTOMATIK_MUAYENE, fasonMu, muayeneOnayAdetIhlali, otomatikGkkMi, otomatikMuayeneMi, siradakiIsEmri } from './kurallar.ts';
import * as s from './sorgular.ts';
import type { IsEmriSatiri } from './sorgular.ts';

// 3809: otomatik kontrol adımları (fason arkasındaki GKK ve kaynağında muayene) terminalden değil Kalite Merkezi'nin kararıyla yürür.
// Adım istasyonsuz olabilir: sayım satırı yazılmaz (sayım istasyon ister), sağlam adım bitince yazılır. Parçanın stoğu
// stok modülünün kararıyla değişir; burada stoğa yansıyan olay yayınlanmaz.

// Adım biter (bitince: adımın kendi kuralı, emrin ilerlemesinden önce): emrin sıradaki adımına geçilir, sıradaki yoksa kol üstüne katılır ya da emir biter.
async function kontrolAdiminiBitir(
  db: Db, kisiId: number, emirId: number, adim: IsEmriSatiri, saglam: number, an: string, bitince?: () => Promise<void>,
): Promise<void> {
  await s.isEmriBitir(db, adim.id, saglam, an);
  if (bitince !== undefined) await bitince();
  await adimBittiBildir(db, { isEmriId: adim.id, uretimEmriId: emirId, kisiId });
  const guncel = await s.isEmirleriGetir(db, [emirId]);
  if (siradakiIsEmri(guncel) !== null) {
    await siradakiIstasyonuYaz(db, emirId);
    return;
  }
  const e = await s.ustEmirBul(db, emirId);
  if (e === null) throw bulunamadi(EMIR_YOK);
  if (await kolSonuysaKatil(db, e, kisiId)) return;
  const son = [...guncel].sort((a, b) => b.sira - a.sira)[0];
  const saglamAdet = son?.id === adim.id ? saglam : (son?.saglamAdet ?? 0);
  if (e.durum === 'basladi') await s.bitisiYaz(db, emirId, saglamAdet, an);
  else await s.fasonlaBitir(db, emirId, saglamAdet, an);
  await emirBittiBildir(db, { uretimEmriId: emirId, saglamAdet, kisiId });
}

// Fason GKK kararı (stok yazdıktan sonra, aynı işlemde): ilk karar adımı başlatır. Fason adımı tamamsa ve karar bekleyen kalmadıysa adım
// biter; sağlamı adımın bütün serbest ve şartlı kararıdır (stok defterinden). Fason adımının arkasında otomatik GKK adımı yoksa (3809 öncesi emir) yazılacak bir şey yoktur.
export async function fasonGkkKarariniIsle(
  db: Db, kisiId: number, fasonIsEmriId: number, g: { saglamToplam: number; bekleyen: number },
): Promise<{ adimId: number | null; kapandi: boolean }> {
  const fason = await s.isEmriBul(db, fasonIsEmriId);
  if (fason === null) throw bulunamadi(IS_EMRI_YOK);
  const emirId = fason.uretimEmriId;
  await ustuOnceKilitle(db, emirId);
  if ((await s.ustEmirBul(db, emirId, true)) === null) throw bulunamadi(EMIR_YOK);
  const hepsi = await s.isEmirleriGetir(db, [emirId]);
  let adim: IsEmriSatiri | undefined;
  for (const a of hepsi.filter((i) => otomatikGkkMi(i) && i.durum !== 'tamam')) {
    if ((await gkkFasonuBul(db, hepsi, a))?.id === fasonIsEmriId) { adim = a; break; }
  }
  if (adim === undefined) return { adimId: null, kapandi: false };
  const an = await s.anAl(db);
  if (adim.durum === 'bekliyor') await s.isEmriBaslat(db, adim.id, an);
  const guncelFason = hepsi.find((i) => i.id === fasonIsEmriId);
  if (g.bekleyen > 0 || guncelFason?.durum !== 'tamam') return { adimId: adim.id, kapandi: false };
  await kontrolAdiminiBitir(db, kisiId, emirId, adim, g.saglamToplam, an);
  return { adimId: adim.id, kapandi: true };
}

// Kaynağında muayene onayı (Kalite Merkezi): zorunlu belgeler yüklenmiş olmalı; sağlam ve red firmaya gönderilenin içindedir. Adım
// biter ve 3708 kuralı yürür: sonraki adım fasonsa aktarım yazılır, değilse dönüş mal kabulde muayenenin sağlamıyla sınırlanır.
export async function kaynaktaMuayeneOnayla(
  db: Db, kullanici: Kullanici, muayeneIsEmriId: number, g: { saglam: number; red: number },
): Promise<{ uretimEmriId: number; fasonIsEmriId: number }> {
  if (!islemVarMi(kullanici, 'kalite-merkezi.onayla')) throw yetkiYok();
  const ilk = await s.isEmriBul(db, muayeneIsEmriId);
  if (ilk === null) throw bulunamadi(IS_EMRI_YOK);
  const emirId = ilk.uretimEmriId;
  await ustuOnceKilitle(db, emirId);
  const hepsi = await s.isEmirleriGetir(db, [emirId]);
  const adim = hepsi.find((i) => i.id === muayeneIsEmriId);
  if (adim === undefined || !otomatikMuayeneMi(adim)) throw cakisma('Bu adım kaynağında muayene adımı değil.');
  if (adim.durum === 'tamam') throw cakisma('Bu muayene onaylanmış.');
  const fason = hepsi.filter((i) => i.sira < adim.sira && fasonMu(i)).sort((a, b) => b.sira - a.sira)[0];
  if (fason === undefined) throw cakisma('Muayenenin fason adımı bulunamadı.');
  const { durum } = await fasonBaglami(db, emirId, fason.id);
  const ihlal = muayeneOnayAdetIhlali(durum.gonderilen, g.saglam, g.red);
  if (ihlal !== null) throw ihlal === MUAYENE_ADET_YOK || ihlal === MUAYENE_GONDERILEN_ASIMI ? dogrulama(ihlal, 'saglam') : cakisma(ihlal);
  await muayeneBelgeKapisi(db, adim);
  const an = await s.anAl(db);
  if (adim.durum === 'bekliyor') await s.isEmriBaslat(db, adim.id, an);
  await kontrolAdiminiBitir(db, kullanici.id, emirId, adim, g.saglam, an, () => muayeneKarariniYaz(db, kullanici.id, emirId, adim, g.saglam, g.red));
  await bildirimKapat(db, { tur: 'uretim-emirleri.kaynakta-muayene-bekliyor', kaynakKimlik: kaynaktaMuayeneKaynagi(adim.id) });
  return { uretimEmriId: emirId, fasonIsEmriId: fason.id };
}

// Kalite Merkezi'nin Kaynağında muayene listesi: açık emirlerde onaylanmamış muayene adımları, fason adımı firmaya en az bir kez gitmişse.
export interface KaynaktaMuayeneGorevi {
  muayeneIsEmriId: number; fasonIsEmriId: number; uretimEmriId: number; emirNo: string; parcaNo: string; parcaAd: string; opNo: number;
  firmaId: number | null; gonderilen: number; ilkGidis: string; sureSaat: string | null; zorunlu: string[]; eksik: string[]; yuklenen: number;
}
export async function kaynaktaMuayeneGorevleri(db: Db): Promise<KaynaktaMuayeneGorevi[]> {
  const acik = await s.acikKontrolAdimlari(db, OTOMATIK_MUAYENE);
  if (acik.length === 0) return [];
  const emirIdleri = [...new Set(acik.map((a) => a.uretimEmriId))];
  const hepsi = await s.isEmirleriGetir(db, emirIdleri);
  const emirler = new Map((await s.ustEmirlerBul(db, emirIdleri)).map((e) => [e.id, e]));
  const fasonlar = new Map<number, IsEmriSatiri>();
  for (const a of acik) {
    const m = hepsi.find((i) => i.id === a.id);
    const f = m === undefined ? undefined : hepsi.filter((i) => i.uretimEmriId === a.uretimEmriId && i.sira < m.sira && fasonMu(i)).sort((x, y) => y.sira - x.sira)[0];
    if (f !== undefined) fasonlar.set(a.id, f);
  }
  const hareketler = await s.fasonHareketleriGetir(db, [...fasonlar.values()].map((f) => f.id));
  const sonuc: KaynaktaMuayeneGorevi[] = [];
  for (const a of acik) {
    const f = fasonlar.get(a.id);
    const e = emirler.get(a.uretimEmriId);
    const gidisler = f === undefined ? [] : hareketler.filter((h) => h.isEmriId === f.id && h.yon === 'gidis').sort((x, y) => x.zaman.localeCompare(y.zaman));
    if (f === undefined || e === undefined || gidisler.length === 0) continue;
    const b = await muayeneBelgeleri(db, a.uretimEmriId, a.id);
    sonuc.push({
      muayeneIsEmriId: a.id, fasonIsEmriId: f.id, uretimEmriId: a.uretimEmriId, emirNo: e.emirNo, parcaNo: e.parcaNo, parcaAd: e.parcaAd, opNo: f.opNo,
      firmaId: f.fasonFirmaId, gonderilen: gidisler.reduce((t, h) => t + h.adet, 0), ilkGidis: gidisler[0]!.zaman, sureSaat: f.muayeneSuresiSaat,
      zorunlu: b.zorunlu, eksik: b.eksik, yuklenen: b.belgeler.length,
    });
  }
  return sonuc;
}

// Fason GKK satırlarının (stok: emir ve OP) üretim bağlamı: fason iş emri, firma ve arkasındaki otomatik GKK adımı (yoksa null: 3809 öncesi emir).
export interface FasonGkkBaglami { fasonIsEmriId: number; emirNo: string; parcaNo: string; parcaAd: string; firmaId: number | null; gkkAdimId: number | null }
export async function fasonGkkBaglamlari(db: Db, ciftler: readonly { uretimEmriId: number; opNo: number }[]): Promise<Map<string, FasonGkkBaglami>> {
  const sonuc = new Map<string, FasonGkkBaglami>();
  const emirIdleri = [...new Set(ciftler.map((c) => c.uretimEmriId))];
  if (emirIdleri.length === 0) return sonuc;
  const hepsi = await s.isEmirleriGetir(db, emirIdleri);
  const emirler = new Map((await s.ustEmirlerBul(db, emirIdleri)).map((e) => [e.id, e]));
  for (const c of ciftler) {
    const emrin = hepsi.filter((i) => i.uretimEmriId === c.uretimEmriId);
    const fason = emrin.find((i) => i.opNo === c.opNo && fasonMu(i));
    const e = emirler.get(c.uretimEmriId);
    if (fason === undefined || e === undefined) continue;
    let gkkAdimId: number | null = null;
    for (const a of emrin.filter((i) => otomatikGkkMi(i) && i.sira > fason.sira)) {
      if ((await gkkFasonuBul(db, emrin, a))?.id === fason.id) { gkkAdimId = a.id; break; }
    }
    sonuc.set(fasonGkkAnahtari(c), { fasonIsEmriId: fason.id, emirNo: e.emirNo, parcaNo: e.parcaNo, parcaAd: e.parcaAd, firmaId: fason.fasonFirmaId, gkkAdimId });
  }
  return sonuc;
}
export const fasonGkkAnahtari = (c: { uretimEmriId: number; opNo: number }): string => `${String(c.uretimEmriId)}:${String(c.opNo)}`;
