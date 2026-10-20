import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { guncellemeDosyasiniEsitle, yedekOrtaminiKur } from './yedek-dizini.ts';
import { geceYedegiTuru } from './yedek.ts';

// Gece yedeği (kart #1205): on dakikada bir bakılır, günün yedeği saat gelince bir kez alınır (sunucu o saatte kapalıysa açılınca).
// Her turda güncelleyicinin okuduğu klasör dosyası da veritabanıyla eşitlenir.
export const isler = [
  isTanimi({
    ad: 'ayarlar-gece-yedegi',
    aralikMs: 10 * 60_000,
    calis: async (db, gunluk) => {
      await guncellemeDosyasiniEsitle(db);
      return geceYedegiTuru(db, gunluk, await yedekOrtaminiKur(db), new Date());
    },
  }),
];
