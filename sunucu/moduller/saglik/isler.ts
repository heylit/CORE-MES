import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { METRIK_ARALIGI_MS } from './kurallar.ts';
import { surecMetrikleri } from './servis.ts';
import { vtIstatistigiOku } from './sorgular.ts';

// Dakikalık metrik turu (kart 1660): sayaçlar süreçtedir, veritabanına bu kartta yazılmaz (kalıcılık 1662).
export const isler = [
  isTanimi({
    ad: 'saglik-metrik',
    aralikMs: METRIK_ARALIGI_MS,
    calis: async (db) => {
      surecMetrikleri.tur(await vtIstatistigiOku(db));
    },
  }),
];
