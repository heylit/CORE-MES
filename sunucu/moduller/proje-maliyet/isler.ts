import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { bitenleriDondur } from './servis.ts';

// 236 a: biten iş emirlerinin maliyeti on dakikada bir deftere yazılır; ekranı açmak kayıt oluşturmaz.
export const isler = [
  isTanimi({ ad: 'proje-maliyet-defteri', aralikMs: 600_000, calis: async (db) => { await bitenleriDondur(db); } }),
];
