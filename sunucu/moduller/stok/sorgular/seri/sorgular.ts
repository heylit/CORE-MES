import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';

// ---- Seri liste (1915) ------------------------------------------------------------------------------------------
export interface SeriListeHam { id: number; kaynak: 'okutma' | 'hafiza'; acilis: string; degisim: string; kapanis: string | null; satirSayisi: number; acikSatir: number }
export interface SeriSatirHam { id: number; sira: number; kod: string; adet: string | null; okutma: string; islendi: string | null }
const SERI_LISTE_SECIMI = `SELECT l.id, l.kaynak, ${zamanMetni('l.acilis')} AS acilis, ${zamanMetni('l.degisim')} AS degisim, ${zamanMetni('l.kapanis')} AS kapanis,
  (SELECT count(*)::int FROM stok_seri_okutma o WHERE o.liste_id = l.id) AS "satirSayisi",
  (SELECT count(*)::int FROM stok_seri_okutma o WHERE o.liste_id = l.id AND o.islendi IS NULL) AS "acikSatir"
  FROM stok_seri_liste l`;
export const seriAcikListeler = (db: Db, kisiId: number): Promise<SeriListeHam[]> =>
  db.sorgu(`${SERI_LISTE_SECIMI} WHERE l.kisi_id = $1 AND l.kapanis IS NULL ORDER BY l.id DESC`, [kisiId]);
export const seriListe = (db: Db, id: number, kisiId: number): Promise<SeriListeHam | null> =>
  db.tek(`${SERI_LISTE_SECIMI} WHERE l.id = $1 AND l.kisi_id = $2`, [id, kisiId]);
// Ekleme ve değişiklik listeyi kilitler: aynı listeye iki cihazdan gelen okutmalar sırayı bozmaz.
export const seriListeKilitle = (db: Db, id: number, kisiId: number): Promise<{ id: number; kapanis: string | null } | null> =>
  db.tek(`SELECT id, ${zamanMetni('kapanis')} AS kapanis FROM stok_seri_liste WHERE id = $1 AND kisi_id = $2 FOR UPDATE`, [id, kisiId]);
export const seriListeAc = async (db: Db, kisiId: number, kaynak: 'okutma' | 'hafiza'): Promise<number> =>
  (await db.tek<{ id: number }>('INSERT INTO stok_seri_liste (kisi_id, kaynak) VALUES ($1, $2) RETURNING id', [kisiId, kaynak]))!.id;
export const seriSatirlari = (db: Db, listeId: number): Promise<SeriSatirHam[]> =>
  db.sorgu(`SELECT id, sira, kod, adet, ${zamanMetni('okutma')} AS okutma, ${zamanMetni('islendi')} AS islendi FROM stok_seri_okutma WHERE liste_id = $1 ORDER BY sira`, [listeId]);
export const seriSatirEkle = (db: Db, listeId: number, sira: number, kod: string, adet: string | null): Promise<unknown> =>
  db.sorgu('INSERT INTO stok_seri_okutma (liste_id, sira, kod, adet) VALUES ($1, $2, $3, $4)', [listeId, sira, kod, adet]);
export const seriAdetYaz = (db: Db, listeId: number, satirId: number, adet: string): Promise<{ id: number } | null> =>
  db.tek('UPDATE stok_seri_okutma SET adet = $3 WHERE id = $2 AND liste_id = $1 AND islendi IS NULL RETURNING id', [listeId, satirId, adet]);
export const seriSatirSil = (db: Db, listeId: number, satirId: number): Promise<{ id: number } | null> =>
  db.tek('DELETE FROM stok_seri_okutma WHERE id = $2 AND liste_id = $1 AND islendi IS NULL RETURNING id', [listeId, satirId]);
export const seriIslendi = (db: Db, listeId: number, satirIdler: number[]): Promise<unknown[]> =>
  db.sorgu('UPDATE stok_seri_okutma SET islendi = now() WHERE liste_id = $1 AND id = ANY($2::bigint[]) AND islendi IS NULL RETURNING id', [listeId, satirIdler]);
export const seriDegisti = (db: Db, listeId: number): Promise<unknown> => db.sorgu('UPDATE stok_seri_liste SET degisim = now() WHERE id = $1', [listeId]);
export const seriListeKapat = (db: Db, listeId: number): Promise<unknown> => db.sorgu('UPDATE stok_seri_liste SET kapanis = now(), degisim = now() WHERE id = $1 AND kapanis IS NULL', [listeId]);
