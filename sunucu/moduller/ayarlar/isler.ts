import { ayarOku } from '#cekirdek/ayar.ts';
import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { geceMedyaTuru } from './medya-yedek.ts';
import { tabanOrtamiOku, tabanTuru } from './taban-yedek.ts';
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
  // Haftalık taban yedek (2284-1 c): pg_basebackup saatler sürebilir, transaction dışında koşar; saatte bir bakılır, taban 7 günde
  // bir alınır.
  isTanimi({
    ad: 'ayarlar-taban-yedegi',
    aralikMs: 60 * 60_000,
    txDisi: () => tabanTuru(tabanOrtamiOku(), new Date(), { canli: ayarOku().ortam === 'canli' }),
  }),
];
