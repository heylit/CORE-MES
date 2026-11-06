import { isBekliyor, isTanimi } from '#cekirdek/zamanlayici.ts';
import { ortamPushAyari, pushTuru } from './push.ts';
import { zamaniGelenleriDagit } from './yayin.ts';

// İleri tarihli elle bildirim (2147): zamanı gelen yayın dakikada bir alıcılara yazılır; geri çekilen ya da bitişi geçen gitmez.
// Web Push (ADR 0031): sinyal transaction dışında atılır; kapalıyken istek yoktur, iş beklemede görünür.
export const isler = [
  isTanimi({ ad: 'bildirim-yayin-dagit', aralikMs: 60_000, calis: async (db) => { await zamaniGelenleriDagit(db); } }),
  isTanimi({
    ad: 'bildirim-push-gonder', aralikMs: 15_000,
    txDisi: async (vt, gunluk) => {
      const ayar = ortamPushAyari();
      if (ayar === null) return isBekliyor('Web Push kapalı (TMIV2_PUSH_ACIK)');
      await pushTuru(vt, ayar, gunluk);
    },
  }),
];
