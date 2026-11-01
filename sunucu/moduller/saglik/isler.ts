import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { METRIK_ARALIGI_MS } from './kurallar.ts';
import { esikleriIsle, metrikleriSakla, surecEsikleri, surecMetrikleri } from './servis.ts';
import { vtIstatistigiOku } from './sorgular.ts';

// Dakikalık metrik turu (kart 1660-1663): ölçer, dakikayı ve bitmiş saatin özetini yazar, süresi geçeni siler;
// eşik aşılınca bildirim ve olay günlüğü (1663).
export const isler = [
  isTanimi({
    ad: 'saglik-metrik',
    aralikMs: METRIK_ARALIGI_MS,
    calis: async (db) => {
      await metrikleriSakla(db, surecMetrikleri.tur(await vtIstatistigiOku(db)), new Date());
      await esikleriIsle(db, surecEsikleri, surecMetrikleri.dakikalar());
    },
  }),
];
