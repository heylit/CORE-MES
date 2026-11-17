import { isBekliyor, isTanimi } from '#cekirdek/zamanlayici.ts';
import { epostaTuru } from './eposta.ts';
import { kademeleriIlerlet } from './kademe.ts';
import { ortamPushAyari, pushTuru } from './push.ts';
import { zamaniGelenleriDagit } from './yayin.ts';

// İleri tarihli elle bildirim (2147): zamanı gelen yayın dakikada bir alıcılara yazılır; geri çekilen ya da bitişi geçen gitmez.
// Web Push (ADR 0031): sinyal transaction dışında atılır; kapalıyken istek yoktur, iş beklemede görünür.
export const isler = [
  // Kademeli uyarı (3405 a): 15 dakikada bir bütün kaynaklar; defter tekil olduğundan iki sunucu aynı kademeyi iki kez göndermez.
  isTanimi({ ad: 'bildirim-kademe', aralikMs: 15 * 60_000, calis: async (db) => { await kademeleriIlerlet(db); } }),
  isTanimi({ ad: 'bildirim-yayin-dagit', aralikMs: 60_000, calis: async (db) => { await zamaniGelenleriDagit(db); } }),
  isTanimi({
    ad: 'bildirim-push-gonder', aralikMs: 15_000,
    txDisi: async (vt, gunluk) => {
      const ayar = ortamPushAyari();
      if (ayar === null) return isBekliyor('Web Push kapalı (TMIV2_PUSH_ACIK)');
      await pushTuru(vt, ayar, gunluk);
    },
  }),
  // E-posta (ADR 0015, 3397): ileti transaction dışında gönderilir; ortam değişkeni ya da ayar kapalıyken iş beklemede görünür.
  isTanimi({
    ad: 'bildirim-eposta-gonder', aralikMs: 60_000,
    txDisi: async (vt, gunluk) => {
      const r = await epostaTuru(vt, gunluk);
      if ('durum' in r) return r;
    },
  }),
];
