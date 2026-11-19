import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, eskiSurum, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { TerminOnerisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { siparisinSatirOzetleri, siparisSatiriOzetleri } from '../siparisler/disari.ts';
import type { SiparisSatiriOzeti } from '../siparisler/disari.ts';
import { isEmirleriDegistiBildir } from './emir-olaylari.ts';
import { EMIR_YOK, TERMIN_ONERISI_YOK, teslimIhlali, terminKarariAnahtari, terminOnerisiVarMi } from './kurallar.ts';
import * as s from './sorgular.ts';

// 3429-3 G: sipariş kaleminin termini emrin tesliminden farklıysa öneri. Kendiliğinden değişiklik yok: bağlı ve başlamamış emrin
// kayması (3244 b, 3254 a) olduğu gibi kalır, öneri kalan farkı (başlamış ya da elle teslimli emir) planlayıcıya gösterir.
async function oneriler(db: Db, satirlar: readonly SiparisSatiriOzeti[]): Promise<TerminOnerisi[]> {
  const satir = new Map(satirlar.map((x) => [x.id, x]));
  const emirler = satirlar.length === 0 ? [] : await s.satirlarinEmirleri(db, [...satir.keys()]);
  const kararlar = new Map<number, Set<string>>();
  for (const k of emirler.length === 0 ? [] : await s.terminKararlari(db, emirler.map((e) => e.id))) {
    kararlar.set(k.emirId, (kararlar.get(k.emirId) ?? new Set()).add(terminKarariAnahtari(k.termin, k.eskiTeslim)));
  }
  return emirler.flatMap((e) => {
    const k = satir.get(e.siparisSatiriId);
    if (k === undefined || !terminOnerisiVarMi(e, k.termin, kararlar.get(e.id) ?? new Set())) return [];
    return [{ emirId: e.id, emirNo: e.emirNo, siparisSatiriId: e.siparisSatiriId, kalemSira: k.sira, teslim: e.teslim, termin: k.termin, baslamis: e.baslamis, surum: e.surum }];
  });
}

export async function emrinTerminOnerisi(db: Db, emirId: number): Promise<TerminOnerisi | null> {
  const e = await s.ustEmirBul(db, emirId);
  if (e === null) throw bulunamadi(EMIR_YOK);
  if (e.siparisSatiriId === null) return null;
  const satir = (await siparisSatiriOzetleri(db, [e.siparisSatiriId])).get(e.siparisSatiriId);
  return (await oneriler(db, satir === undefined ? [] : [satir])).find((o) => o.emirId === emirId) ?? null;
}

export async function siparisinTerminOnerileri(db: Db, siparisId: number): Promise<TerminOnerisi[]> {
  return oneriler(db, await siparisinSatirOzetleri(db, siparisId));
}

// Uygula: teslim termine yazılır (başlamamış emirde bağ da kurulur); Yoksay: yalnız karar. Gövdedeki termin ekranın gördüğüdür:
// termin o arada değiştiyse ya da bu termin ve teslim için karar verilmişse 409. Karar kişi, zaman ve eski teslimle kayda girer.
export async function terminKarariVer(
  db: Db, kullanici: Kullanici, emirId: number, g: { surum: number; termin: string }, karar: 'uygula' | 'yoksay',
): Promise<void> {
  if (!islemVarMi(kullanici, 'uretim-emirleri.duzenle')) throw yetkiYok();
  const e = await s.ustEmirBul(db, emirId, true);
  if (e === null || e.malzemeNo === null) throw bulunamadi(EMIR_YOK);
  if (e.surum !== g.surum) throw eskiSurum();
  const oneri = await emrinTerminOnerisi(db, emirId);
  if (oneri === null || oneri.termin !== g.termin) throw cakisma(TERMIN_ONERISI_YOK);
  if (karar === 'uygula') {
    const ihlal = teslimIhlali(e.baslangic, g.termin);
    if (ihlal !== null) throw dogrulama(ihlal, 'termin');
    if ((await s.teslimYaz(db, emirId, e.surum, g.termin)) === null) throw eskiSurum();
  }
  await s.terminKarariYaz(db, { emirId, termin: g.termin, karar, eskiTeslim: e.teslim, kisiId: kullanici.id });
  if (karar === 'uygula') await isEmirleriDegistiBildir(db, { uretimEmriId: emirId, kisiId: kullanici.id });
}
