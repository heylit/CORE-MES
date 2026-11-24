import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { METRIK_ARALIGI_MS } from './kurallar.ts';
import { esikleriIsle, metrikleriSakla, surecEsikleri, surecMetrikleri } from './servis.ts';
import { varsayilanGunlukDizini } from '#cekirdek/gunluk-dosyasi.ts';
import { kapanmaTemizligi } from './kapanma.ts';
import { vtIstatistigiOku } from './sorgular.ts';
import { surecYuku } from './yuk.ts';

// Dakikalık metrik turu (kart 1660-1663): ölçer, dakikayı ve bitmiş saatin özetini yazar, süresi geçeni siler;
// eşik aşılınca bildirim ve olay günlüğü (1663).
export const isler = [
  isTanimi({
    ad: 'saglik-metrik',
    aralikMs: METRIK_ARALIGI_MS,
    calis: async (db) => {
      await metrikleriSakla(db, surecMetrikleri.tur(await vtIstatistigiOku(db)), new Date());
      await esikleriIsle(db, surecEsikleri, surecMetrikleri.dakikalar());
      // Yük ve davranış ekranının dakikalık farkı ve tampon boşaltma (3668 B).
      surecYuku.tur();
      // Kapanma kaydı ve arşiv dosyaları 90 gün (kart 3668).
      await kapanmaTemizligi(db, varsayilanGunlukDizini(), new Date());
    },
  }),
];
