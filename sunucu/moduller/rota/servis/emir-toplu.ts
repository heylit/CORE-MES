import type { Db } from '#cekirdek/db.ts';
import { cakisma, gecersiz } from '#cekirdek/hata.ts';
import { satirdaReddet } from '#cekirdek/toplu.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { EmreKopyalaTopluCevabi, EmreKopyalaTopluGirdisi } from '#paylasilan/sozlesme/rota.ts';
import * as s from '../sorgular.ts';
import { emreKopyala } from './okuma.ts';

// Excel ile toplu emir (2627, 1/2 b): her satır sayfanın "Yeni üretim emri" formunun gittiği emre-kopyala ile, aynı kuralla açılır
// (ürün kullanımda, yürürlükte rota, proje ve tür kuralı üretim emirlerinde). Uç tek transaction'dır; bir satır reddedilirse hiçbir emir kalmaz.
export async function emreKopyalaToplu(db: Db, kullanici: Kullanici, g: EmreKopyalaTopluGirdisi): Promise<EmreKopyalaTopluCevabi> {
  for (const [sira, { satir, urunId, ...govde }] of g.satirlar.entries()) {
    await satirdaReddet(sira, satir, async () => {
      // Satırın emir türünün rotası (3247 a): türe bağlı rota yoksa Standart. Türe bağlı rotası yürürlükte olmayan satır Standart'a
      // sessizce düşmez; formsuz yolda kullanıcı seçim yapamadığı için reddedilir.
      const rota = await s.turunRotasi(db, urunId, govde.emirTuru ?? null);
      if (rota !== null && !rota.standart && rota.revizyonId === null) throw cakisma(`Bu emir türünün rotası (${rota.ad}) yürürlükte değil.`);
      if (rota?.revizyonId == null) throw gecersiz('Ürünün yürürlükte rotası yok; emir yalnız yürürlükteki rotadan açılır.');
      await emreKopyala(db, kullanici, rota.revizyonId, govde);
    });
  }
  return { eklenen: g.satirlar.length, guncellenen: 0 };
}
