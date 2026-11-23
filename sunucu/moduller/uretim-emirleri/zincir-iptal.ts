import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, eskiSurum, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { IptalOnizlemeCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { emirlerinAcikHazirlikSayisi } from '../projeler/disari.ts';
import { acikTalepler } from './adim-durumu.ts';
import { emirIptalBildir } from './emir-olaylari.ts';
import { EMIR_YOK, ZINCIR_LISTE_DEGISTI, acikEmirIhlali, zincirIptalIhlali, zincirListesiAyni } from './kurallar.ts';
import type { ZincirDugumu } from './kurallar.ts';
import * as s from './sorgular.ts';
import type { UstEmirSatiri } from './sorgular.ts';

// 3576: alt emirleriyle tek seferde iptal. Yetki yalnız `uretim-emirleri.iptal` (plan.canliya-al zinciri iptal edemez; plan zincir iptal yapmaz).
// Zincir `disari.ts`'e açılmaz: sipariş iptali ve plan alt emirli emri bugünkü gibi reddeder.
const YETKI = 'uretim-emirleri.iptal' as const;

// Kökün açık alt ağacı (torunlar dahil), kimlik sırasıyla: kapanmış emir ve onun kapanmış altı ağaca girmez.
async function acikAltlar(db: Db, kokId: number): Promise<number[]> {
  return (await s.altPartilerGetir(db, [kokId])).filter((a) => acikEmirIhlali(a.durum, false) === null).map((a) => a.id).sort((a, b) => a - b);
}

function dugum(e: UstEmirSatiri, baslamis: ReadonlySet<number>): ZincirDugumu {
  return { id: e.id, emirNo: e.emirNo, durum: e.durum, arsiv: e.arsiv, baslamis: baslamis.has(e.id) };
}

async function baslamisEmirler(db: Db, idler: readonly number[]): Promise<Set<number>> {
  return new Set((await s.isEmirleriGetir(db, idler)).filter((i) => i.durum !== 'bekliyor').map((i) => i.uretimEmriId));
}

// Pencerenin okuması: kilitsiz; komutla aynı kuraldan engel metni. Alt emri yoksa liste boştur (pencere bugünkü gibidir).
export async function iptalOnizleme(db: Db, id: number): Promise<IptalOnizlemeCevabi> {
  const kok = await s.ustEmirBul(db, id);
  if (kok === null || kok.malzemeNo === null) throw bulunamadi(EMIR_YOK);
  const altIdleri = await acikAltlar(db, id);
  const emirler = new Map((await s.ustEmirlerBul(db, [id, ...altIdleri])).map((e) => [e.id, e]));
  const isEmirleri = await s.isEmirleriGetir(db, [id, ...altIdleri]);
  const baslamis = await baslamisEmirler(db, [id, ...altIdleri]);
  const altlar = altIdleri.flatMap((a) => { const e = emirler.get(a); return e === undefined ? [] : [e]; });
  const ihlal = zincirIptalIhlali(dugum(kok, baslamis), altlar.map((e) => dugum(e, baslamis)));
  const ilkOp = (emirId: number): number | null => isEmirleri.filter((i) => i.uretimEmriId === emirId).sort((x, y) => x.sira - y.sira)[0]?.opNo ?? null;
  return {
    surum: kok.surum,
    altEmirler: altlar.map((e) => ({
      id: e.id, emirNo: e.emirNo, ustEmirNo: e.ustEmirId === null || e.ustEmirId === id ? null : emirler.get(e.ustEmirId)?.emirNo ?? null,
      tur: (e.bolunmeSira ?? 1) > 1 || e.birlesmeOpNo !== null ? 'kol' : 'parti',
      baslangicOpNo: ilkOp(e.id), birlesmeOpNo: e.birlesmeOpNo, adet: e.adet,
      durum: e.durum === 'taslak' || e.durum === 'planli' ? e.durum : 'basladi', baslamis: baslamis.has(e.id),
    })),
    hazirlikGorevi: await emirlerinAcikHazirlikSayisi(db, [id, ...altIdleri]),
    satinAlmaTalepleri: await acikTalepler(db, [id, ...altIdleri], isEmirleri.map((i) => i.id)),
    engel: ihlal,
  };
}

// Tek işlem (uç): kök ve açık alt ağaç kilitlenir (kök, sonra kimlik sırasıyla), ağaç yeniden okunur; araya alt emir girdiyse ya da pencerenin
// gördüğünden farklıysa 409 ve hiçbiri iptal olmaz. Önce yapraklar, sonra kök iptal yazılır; her biri iptal olayını yayar (stok rezerve ve depo
// istekleri, plan bayat işareti, hazırlık görevleri). Dinleyici hatası bütün iptali geri alır.
export async function altlariylaIptal(db: Db, kullanici: Kullanici, id: number, g: { surum: number; altEmirIdleri: readonly number[] }): Promise<void> {
  if (!islemVarMi(kullanici, YETKI)) throw yetkiYok();
  const once = await acikAltlar(db, id);
  const kok = await s.ustEmirBul(db, id, true);
  if (kok === null || kok.malzemeNo === null) throw bulunamadi(EMIR_YOK);
  if (kok.surum !== g.surum) throw eskiSurum();
  const kilitli = new Map<number, UstEmirSatiri>([[id, kok]]);
  for (const a of once) {
    const e = await s.ustEmirBul(db, a, true);
    if (e !== null) kilitli.set(a, e);
  }
  const simdi = await acikAltlar(db, id);
  if (!zincirListesiAyni(g.altEmirIdleri, simdi) || simdi.some((a) => !kilitli.has(a))) throw cakisma(ZINCIR_LISTE_DEGISTI);
  const baslamis = await baslamisEmirler(db, [id, ...simdi]);
  const altlar = simdi.flatMap((a) => { const e = kilitli.get(a); return e === undefined ? [] : [e]; });
  const ihlal = zincirIptalIhlali(dugum(kok, baslamis), altlar.map((e) => dugum(e, baslamis)));
  if (ihlal !== null) throw cakisma(ihlal);
  for (const e of [...[...altlar].reverse(), kok]) {
    if ((await s.ustIptalYaz(db, e.id, e.surum)) === null) throw eskiSurum();
    await emirIptalBildir(db, { uretimEmriId: e.id, kisiId: kullanici.id });
  }
}
