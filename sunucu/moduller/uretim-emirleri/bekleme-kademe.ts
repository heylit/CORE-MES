import type { Db } from '#cekirdek/db.ts';
import type { KademeKaynagi } from '#paylasilan/sozlesme/kademe-sabitleri.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { isGunuFarki } from '../bildirim/disari.ts';
import { resmiTatilGunleri } from '../ik/disari.ts';
import { type BeklemeKaydi, type SurenBekleme, beklemeKaydi, kaynagaGirerMi, surenBekleme } from './bekleme-kurallar.ts';
import * as sorgular from './sorgular.ts';

// 3416-1 a: beklemedeki açık emirlerin süren beklemesi ve başından bugüne iş günü (resmi tatil düşülür; motorla aynı sayım).
const gun = (an: string): string => tesisGunu(new Date(an));

export interface SurenBeklemeBilgisi { emirNo: string; bekleme: SurenBekleme; isGunu: number }
export async function surenBeklemeler(db: Db, emirIdleri: readonly number[] | null = null, simdi: Date = new Date()): Promise<Map<number, SurenBeklemeBilgisi>> {
  const sonuc = new Map<number, SurenBeklemeBilgisi>();
  if (emirIdleri !== null && emirIdleri.length === 0) return sonuc;
  const emirler = new Map<number, sorgular.AcikBekletmeOlayi[]>();
  for (const o of await sorgular.acikBekletmeOlaylari(db, emirIdleri)) emirler.set(o.uretimEmriId, [...(emirler.get(o.uretimEmriId) ?? []), o]);
  if (emirler.size === 0) return sonuc;
  const bugun = tesisGunu(simdi);
  const ilkGun = [...emirler.values()].map((l) => gun(l[0]?.zaman ?? simdi.toISOString())).sort()[0] ?? bugun;
  const tatiller = new Set((await resmiTatilGunleri(db, ilkGun, bugun)).map((t) => t.tarih));
  const fark = (bas: string, bit: string): number => isGunuFarki(bas, bit, tatiller);
  for (const [id, olaylar] of emirler) {
    const b = surenBekleme(olaylar, gun, fark);
    if (b === null) continue;
    sonuc.set(id, { emirNo: olaylar[0]?.emirNo ?? '', bekleme: b, isGunu: Math.max(0, fark(gun(b.baslangicAni), bugun)) });
  }
  return sonuc;
}

// Kademeli uyarı okuyucusu: kablolama kaynak başına bağlar.
export const bekletmeKademeOkuyucusu = (kaynak: KademeKaynagi) => async (db: Db): Promise<BeklemeKaydi[]> =>
  [...(await surenBeklemeler(db)).entries()]
    .filter(([, s]) => kaynagaGirerMi(kaynak, s.bekleme.neden))
    .map(([id, s]) => beklemeKaydi({ id, emirNo: s.emirNo }, s.bekleme, gun));
