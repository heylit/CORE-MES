import type { Db } from '#cekirdek/db.ts';
import type { SiparisAnahtari } from '../servis.ts';
import { siparisKapanisi } from './kurallar.ts';
import { siparisKapanislari } from './sorgular.ts';

// 2481 (isteyen 2461-3.1): satın alma siparişinin ödeme kapanışı; anahtar "talepId:teklifId", istenen her sipariş haritadadır.
// Yalnız gün döner; tutar ve kalan çıkmaz (FNS-48). Yetki denetlemez, çağıranın ucu denetler; değer saklanmaz, her çağrıda hesaplanır.
export async function siparisOdemeKapanislari(db: Db, siparisler: readonly SiparisAnahtari[]): Promise<Map<string, { kapanis: string } | null>> {
  const anahtar = (x: { talepId: string; teklifId: string }): string => `${x.talepId}:${x.teklifId}`;
  if (siparisler.length === 0) return new Map();
  const satirlar = new Map((await siparisKapanislari(db, siparisler.map((x) => x.talepId), siparisler.map((x) => x.teklifId))).map((s) => [anahtar(s), s]));
  return new Map(siparisler.map((x) => [anahtar(x), siparisKapanisi(satirlar.get(anahtar(x)))]));
}
