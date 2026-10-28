import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { geceMedyaTuru } from './medya-yedek.ts';
import { guncellemeDosyasiniEsitle, yedekOrtaminiKur } from './yedek-dizini.ts';
import { geceYedegiTuru } from './yedek.ts';

// Gece yedeği (kart #1205): on dakikada bir bakılır, günün yedeği saat gelince bir kez alınır (sunucu o saatte kapalıysa açılınca).
// Her turda güncelleyicinin okuduğu klasör dosyası da veritabanıyla eşitlenir. Talimat medyasının aynası veritabanı yedeğinden
// sonra koşar (önce veritabanı): dump'taki her künyenin dosyası aynaya girer.
export const isler = [
  isTanimi({
    ad: 'ayarlar-gece-yedegi',
    aralikMs: 10 * 60_000,
    calis: async (db, gunluk) => {
      await guncellemeDosyasiniEsitle(db);
      const ortam = await yedekOrtaminiKur(db);
      const vt = await geceYedegiTuru(db, gunluk, ortam, new Date());
      if (vt !== undefined) return vt;
      return geceMedyaTuru(db, gunluk, ortam, new Date());
    },
  }),
];
