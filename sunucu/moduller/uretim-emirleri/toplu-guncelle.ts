import type { Db } from '#cekirdek/db.ts';
import { satirdaReddet } from '#cekirdek/toplu.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { EmirTopluGuncelleCevabi, EmirTopluGuncelleGirdisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import * as isEmri from './is-emri-servis.ts';

// Excel ile var olan emirleri güncelleme (2627 2/2 c, kart 2704 a kapsamı): her satır sayfadaki tek kayıt komutlarından geçer (plana al,
// öncelik); kural ve kayıt (öncelik değişim defteri) onlarındır. Sürüm satırın ilk komutunda denetlenir; emir o komutta kilitlenir ve
// işlem bitene kadar kilitli kalır, ikinci komut kendi artırdığı sürümü yeniden istemez. Uç tek transaction'dır: biri reddedilirse hiçbiri kalmaz.
// Emirler kimlik sırasıyla kilitlenir: aynı emirlere dokunan eşzamanlı iki toplu güncelleme birbirini çapraz beklemez (Veri notu).
export async function emirleriTopluGuncelle(db: Db, kullanici: Kullanici, g: EmirTopluGuncelleGirdisi): Promise<EmirTopluGuncelleCevabi> {
  const sirali = [...g.satirlar.entries()].sort(([, a], [, b]) => a.id - b.id);
  for (const [sira, x] of sirali) {
    await satirdaReddet(sira, x.satir, async () => {
      if (x.planaAl === true) await isEmri.planaAl(db, kullanici, x.id, x.surum);
      if (x.oncelik !== undefined) await isEmri.oncelikDegistir(db, kullanici, x.id, x.oncelik, x.planaAl === true ? null : x.surum);
    });
  }
  return { eklenen: 0, guncellenen: g.satirlar.length };
}
