import type { Db } from '#cekirdek/db.ts';
import type { Dilim } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { GeriBildirimKonusu, GeriBildirimTuru, TemaTercihi } from '#paylasilan/sozlesme/profil.ts';

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

export interface TemaSatiri { tema: TemaTercihi; surum: number }

export function temaOku(db: Db, kisiId: number): Promise<TemaSatiri | null> {
  return db.tek<TemaSatiri>('SELECT tema, surum FROM profil_tema_tercihi WHERE kisi_id = $1', [kisiId]);
}

// İlk seçim: aynı anda gelen ikinci ilk seçim satır açmaz, null döner (sürüm çakışması).
export function temaEkle(db: Db, kisiId: number, tema: TemaTercihi): Promise<TemaSatiri | null> {
  return db.tek<TemaSatiri>(
    'INSERT INTO profil_tema_tercihi (kisi_id, tema) VALUES ($1, $2) ON CONFLICT (kisi_id) DO NOTHING RETURNING tema, surum',
    [kisiId, tema],
  );
}

// Okunan sürüm tutmazsa satır değişmez, null döner.
export function temaGuncelle(db: Db, kisiId: number, tema: TemaTercihi, surum: number): Promise<TemaSatiri | null> {
  return db.tek<TemaSatiri>(
    `UPDATE profil_tema_tercihi SET tema = $2, surum = surum + 1, guncellendi = now()
      WHERE kisi_id = $1 AND surum = $3 RETURNING tema, surum`,
    [kisiId, tema, surum],
  );
}
