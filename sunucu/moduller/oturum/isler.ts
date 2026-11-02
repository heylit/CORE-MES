import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { eskiNabizlariTemizle, eskiOturumCihaziniTemizle } from './servis.ts';

// 398 a: oturum kapandıktan 30 gün sonra adres ve tarayıcı boşalır. Saatte bir yeter: süre gün ölçeğindedir.
export const isler = [
  isTanimi({
    ad: 'oturum-cihaz-temizligi',
    aralikMs: 60 * 60 * 1000,
    calis: async (db) => {
      await eskiOturumCihaziniTemizle(db);
    },
  }),
  // 1619 a: cihaz nabzı 30 gün. Saatte bir yeter: süre gün ölçeğindedir.
  isTanimi({
    ad: 'oturum-nabiz-temizligi',
    aralikMs: 60 * 60 * 1000,
    calis: async (db) => {
      await eskiNabizlariTemizle(db);
    },
  }),
];
