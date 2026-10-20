import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { TARAMA_ARALIGI_SN } from './kurallar.ts';
import { taramaYap } from './servis.ts';

// Tarama uçsuzdur (ön paket Durum A): zamanlayıcı her dakika koşar, uç denetimi ona uygulanmaz; izi tarama defteri ve durum
// satırıdır. Kilidi alamayan tur hiçbir şey yazmadan döner.
export const isler = [
  isTanimi({
    ad: 'guvenlik-taramasi',
    aralikMs: TARAMA_ARALIGI_SN * 1000,
    calis: async (db) => {
      await taramaYap(db);
    },
  }),
];
