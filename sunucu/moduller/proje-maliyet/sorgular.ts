import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { DefterSatiri, MaliyetKaydi } from './kurallar.ts';

export async function defterOku(db: Db, projeId: number): Promise<Map<number, DefterSatiri>> {
  const satirlar = await db.sorgu<DefterSatiri>(
    `SELECT is_emri_id AS "isEmriId", plan, gercek FROM proje_maliyet_defteri WHERE proje_id = $1`,
    [projeId],
  );
  return new Map(satirlar.map((s) => [s.isEmriId, s]));
}

export async function defterdekiIsEmirleri(db: Db): Promise<Set<number>> {
  const satirlar = await db.sorgu<{ isEmriId: number }>('SELECT is_emri_id AS "isEmriId" FROM proje_maliyet_defteri');
  return new Set(satirlar.map((s) => s.isEmriId));
}

// Yalnız ekleme; aynı iş emri ikinci kez yazılmaz (eşzamanlı iki yazımda ikincisi sessizce geçer). Dönen sayı yazılan satırdır.
// Sunucu işi yazınca kişi yoktur (236 a): donduran boş kalır.
export async function defterYaz(db: Db, projeId: number, kisiId: number | null, kayitlar: readonly MaliyetKaydi[]): Promise<number> {
  let yazilan = 0;
  for (const k of kayitlar) {
    if (k.isEmri === null || k.isEmri.bitisZamani === null) continue;
    const satir = await db.tek<{ id: string }>(
      `INSERT INTO proje_maliyet_defteri (proje_id, is_emri_id, plan, gercek, ucretler, adet, saglam, bitis, donduran_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT ON CONSTRAINT proje_maliyet_defteri_is_emri_tekil DO NOTHING
       RETURNING id::text`,
      [projeId, k.isEmri.isEmriId, JSON.stringify(k.plan), JSON.stringify(k.gercek), JSON.stringify(k.ucretler), k.adet, k.saglam, k.isEmri.bitisZamani, kisiId],
    );
    if (satir !== null) yazilan += 1;
  }
  return yazilan;
}

// --- Taban fotoğrafı ve masraf bağı ---
export interface TabanSatiri {
  sira: number; plan: string | null; kalemler: Record<string, number | null>; eksikKalemler: string[]; isEmriSayisi: number;
  gerekce: string | null; kisiId: number; an: string;
}
// Yeni sıradan eskiye; ilk satır güncel tabandır.
export const tabanlar = (db: Db, projeId: number) => db.sorgu<TabanSatiri>(
  `SELECT sira, plan::text, kalemler, eksik_kalemler AS "eksikKalemler", is_emri_sayisi AS "isEmriSayisi", gerekce, kisi_id AS "kisiId",
          ${zamanMetni('an')} AS an
     FROM proje_maliyet_taban WHERE proje_id = $1 ORDER BY sira DESC`, [projeId]);

export async function tabanEkle(db: Db, projeId: number, t: {
  sira: number; plan: number | null; kalemler: Record<string, number | null>; eksikKalemler: readonly string[]; isEmriSayisi: number; gerekce: string | null;
}, kisiId: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO proje_maliyet_taban (proje_id, sira, plan, kalemler, eksik_kalemler, is_emri_sayisi, gerekce, kisi_id)
     VALUES ($1, $2, round($3::numeric, 2), $4, $5, $6, $7, $8)`,
    [projeId, t.sira, t.plan, JSON.stringify(t.kalemler), JSON.stringify(t.eksikKalemler), t.isEmriSayisi, t.gerekce, kisiId],
  );
}

export interface MasrafBagi { id: number; projeId: number; belgeId: number; gorevId: number | null; kisiId: number; an: string }
const MASRAF = `id, proje_id AS "projeId", finans_belge_id AS "belgeId", gorev_id AS "gorevId", kisi_id AS "kisiId", ${zamanMetni('an')} AS an`;
export const masrafBaglari = (db: Db, projeId: number) => db.sorgu<MasrafBagi>(
  `SELECT ${MASRAF} FROM proje_maliyet_masraf WHERE proje_id = $1 ORDER BY id`, [projeId]);
export const masrafBagiGetir = (db: Db, id: number) => db.tek<MasrafBagi>(`SELECT ${MASRAF} FROM proje_maliyet_masraf WHERE id = $1`, [id]);
export const masrafBagla = (db: Db, projeId: number, belgeId: number, gorevId: number | null, kisiId: number) => db.sorgu(
  'INSERT INTO proje_maliyet_masraf (proje_id, finans_belge_id, gorev_id, kisi_id) VALUES ($1, $2, $3, $4)', [projeId, belgeId, gorevId, kisiId]);
export async function masrafBagiKaldir(db: Db, id: number): Promise<boolean> {
  return (await db.tek<{ id: number }>('DELETE FROM proje_maliyet_masraf WHERE id = $1 RETURNING id', [id])) !== null;
}
export async function bagliBelgeler(db: Db, belgeIdler: readonly number[]): Promise<Set<number>> {
  if (belgeIdler.length === 0) return new Set();
  const satirlar = await db.sorgu<{ id: number }>('SELECT finans_belge_id AS id FROM proje_maliyet_masraf WHERE finans_belge_id = ANY($1::int[])', [belgeIdler]);
  return new Set(satirlar.map((s) => s.id));
}
