import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { kapananEmirlerinGorevleri } from './hazirlik-kademe.ts';

// 3396 a: emri kapanan hazırlık görevi 15 dakikada bir iptal olur. Kademeler ortak kademeli uyarı motorundadır (3405, bildirim).
export const isler = [
  isTanimi({ ad: 'projeler-hazirlik-kapanis', aralikMs: 15 * 60_000, calis: async (db) => { await kapananEmirlerinGorevleri(db); } }),
];
