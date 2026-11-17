import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { kademeleriIlerlet } from './hazirlik-kademe.ts';

// 3396 a: hazırlık görevlerinin kademeleri 15 dakikada bir ilerler; defter (görev, kademe) tekil olduğundan tekrar gitmez.
export const isler = [
  isTanimi({ ad: 'projeler-hazirlik-kademe', aralikMs: 15 * 60_000, calis: async (db) => { await kademeleriIlerlet(db); } }),
];
