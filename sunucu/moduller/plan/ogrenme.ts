import type { Db } from '#cekirdek/db.ts';
import { revizyonGetir, yururluktekiRevizyonIdleri } from '../rota/disari.ts';
import { bitenIsEmirleri, emirMalzemeleri, isEmriPlanBilgileri } from '../uretim-emirleri/disari.ts';
import { OGRENME_SINIRI, ogrenilenSureler, ogrenmeSatirlari, type OgrenilenSure, type OgrenmeSatiri, type SureOrnegi } from './ogrenme-kurallar.ts';
import { planSapmalari } from './sapma.ts';

// 1714 (1684 b): son pencerede biten adımların gerçek / planlı süre oranı (plan sapması), motorun anahtarıyla. Motorun ürünü emrin
// malzemesidir; adımı ürünün yürürlükteki rotasındaki sırasıdır (girdi.betik rrCevir: k = sıra), çünkü motor yürürlükteki rotayla dizer
// (983 b). Yürürlükteki rotada artık olmayan adım ve çok katmanlı emrin alt düğüm adımı öğrenilmez. Okumalar sunucunun içindendir; sonuç
// kimseye ham dönmez, motorun tamponuna ve plan sağlığına gider.
export async function sureOrnekleri(db: Db, simdi: number = Date.now()): Promise<SureOrnegi[]> {
  const bas = new Date(simdi - OGRENME_SINIRI.pencereGun * 86_400_000).toISOString();
  const biten = await bitenIsEmirleri(db, bas, new Date(simdi).toISOString());
  if (biten.length === 0) return [];
  const ids = biten.map((b) => b.isEmriId);
  const sapmalar = await planSapmalari(db, { isEmriIdleri: ids, simdi });
  const bilgiler = await isEmriPlanBilgileri(db, ids);
  const emirler = await emirMalzemeleri(db, biten.map((b) => b.uretimEmriId));
  // Alt emir (çok katmanlı emrin düğümü) kendi malzemesiyle değil üst emrin planıyla dizilir; öğrenilmez.
  const malzeme = new Map([...emirler].map(([id, e]) => [id, e.ustEmirId !== null ? null : e.malzemeNo]));
  const malzemeler = [...new Set([...malzeme.values()].filter((m): m is number => m !== null))];
  const revizyon = await yururluktekiRevizyonIdleri(db, malzemeler);
  const sira = new Map<number, Map<number, number>>();
  for (const [m, r] of revizyon) {
    const rev = await revizyonGetir(db, r);
    if (rev !== null) sira.set(m, new Map(rev.adimlar.map((a) => [a.opNo, a.sira])));
  }
  return biten.flatMap((b) => {
    const oran = sapmalar.get(b.isEmriId)?.sureOrani ?? null, bilgi = bilgiler.get(b.isEmriId), m = malzeme.get(b.uretimEmriId) ?? null;
    const s = m === null || bilgi === undefined ? undefined : sira.get(m)?.get(bilgi.opNo);
    return oran === null || s === undefined ? [] : [{ urun: String(m), adim: String(s), opNo: bilgi!.opNo, oran, bitis: Date.parse(b.bitis) }];
  });
}

export async function sureOgrenmesi(db: Db, simdi: number = Date.now()): Promise<Record<string, OgrenilenSure>> {
  return Object.fromEntries(ogrenilenSureler(await sureOrnekleri(db, simdi), simdi));
}

// Plan sağlığının gölge görünümü: motorun göreceği bütün öğrenilenler sayılır, en çok `enCok` satır gösterilir.
export async function ogrenmeOzeti(db: Db, enCok: number, simdi: number = Date.now()): Promise<{ ogrenilenAdim: number; satirlar: OgrenmeSatiri[] }> {
  const ornekler = await sureOrnekleri(db, simdi);
  const sureler = ogrenilenSureler(ornekler, simdi);
  return { ogrenilenAdim: sureler.size, satirlar: ogrenmeSatirlari(ornekler, sureler, enCok) };
}
