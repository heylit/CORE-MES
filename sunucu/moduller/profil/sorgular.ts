import type { Db } from '#cekirdek/db.ts';
import type { Dilim } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { GeriBildirimKonusu, GeriBildirimTuru } from '#paylasilan/sozlesme/profil.ts';

export interface GeriBildirimSatiri {
  id: number;
  kisiId: number;
  konu: GeriBildirimKonusu;
  tur: GeriBildirimTuru;
  metin: string;
  gonderildi: string;
}

const SECIM = `id, kisi_id AS "kisiId", konu, tur, metin, ${zamanMetni('gonderildi')} AS gonderildi`;

export async function geriBildirimEkle(db: Db, kisiId: number, g: { konu: GeriBildirimKonusu; tur: GeriBildirimTuru; metin: string }): Promise<GeriBildirimSatiri> {
  const r = await db.tek<GeriBildirimSatiri>(
    `INSERT INTO profil_geri_bildirim (kisi_id, konu, tur, metin) VALUES ($1, $2, $3, $4) RETURNING ${SECIM}`,
    [kisiId, g.konu, g.tur, g.metin],
  );
  if (r === null) throw new Error('Geri bildirim yazılamadı.');
  return r;
}

export function kisininGeriBildirimleri(db: Db, kisiId: number, sinir: number): Promise<GeriBildirimSatiri[]> {
  return db.sorgu<GeriBildirimSatiri>(
    `SELECT ${SECIM} FROM profil_geri_bildirim WHERE kisi_id = $1 ORDER BY gonderildi DESC, id DESC LIMIT $2`,
    [kisiId, sinir],
  );
}

export interface ListeSuzgeci { konu: GeriBildirimKonusu | null; tur: GeriBildirimTuru | null }

const SUZGEC = 'FROM profil_geri_bildirim WHERE ($1::text IS NULL OR konu = $1) AND ($2::text IS NULL OR tur = $2)';

export async function geriBildirimSay(db: Db, s: ListeSuzgeci): Promise<number> {
  const r = await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam ${SUZGEC}`, [s.konu, s.tur]);
  return r?.toplam ?? 0;
}

export function geriBildirimSatirlari(db: Db, s: ListeSuzgeci, dilim: Dilim): Promise<GeriBildirimSatiri[]> {
  return db.sorgu<GeriBildirimSatiri>(
    `SELECT ${SECIM} ${SUZGEC} ORDER BY gonderildi DESC, id DESC LIMIT $3 OFFSET $4`,
    [s.konu, s.tur, dilim.sinir, dilim.atla],
  );
}
