import type { Db } from '#cekirdek/db.ts';
import type { Dilim } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { Bildirim, BildirimListeDurumu, BildirimOnemi } from '#paylasilan/sozlesme/bildirim.ts';

const SECIM = `id, tur, onem, baslik, metin, yol, kaynak_modul AS "kaynakModul", tekrar_sayisi AS "tekrarSayisi",
  ${zamanMetni('olusturuldu')} AS olusturuldu, ${zamanMetni('okundu')} AS okundu, ${zamanMetni('arsivlendi')} AS arsivlendi`;

export interface YeniBildirim {
  kisiId: number;
  tur: string;
  onem: BildirimOnemi;
  baslik: string;
  metin: string | null;
  yol: string | null;
  kaynakModul: string;
  tekilAnahtar: string | null;
}

// Okunmamış aynı tekil anahtar varsa yeni satır açılmaz: sayaç artar, metin ve zaman tazelenir (zilde yeniden üste çıkar).
export async function bildirimYaz(db: Db, b: YeniBildirim): Promise<void> {
  await db.sorgu(
    `INSERT INTO bildirim_kaydi (kisi_id, tur, onem, baslik, metin, yol, kaynak_modul, tekil_anahtar)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (kisi_id, tekil_anahtar) WHERE tekil_anahtar IS NOT NULL AND okundu IS NULL AND arsivlendi IS NULL
     DO UPDATE SET tekrar_sayisi = bildirim_kaydi.tekrar_sayisi + 1, baslik = EXCLUDED.baslik, metin = EXCLUDED.metin,
       yol = EXCLUDED.yol, onem = EXCLUDED.onem, olusturuldu = now()`,
    [b.kisiId, b.tur, b.onem, b.baslik, b.metin, b.yol, b.kaynakModul, b.tekilAnahtar],
  );
}

const DURUM_KOSULU: Record<BildirimListeDurumu, string> = {
  gelen: 'arsivlendi IS NULL',
  okunmamis: 'arsivlendi IS NULL AND okundu IS NULL',
  onemli: "arsivlendi IS NULL AND onem <> 'bilgi'",
  arsiv: 'arsivlendi IS NOT NULL',
};

export async function kisininBildirimSayisi(db: Db, kisiId: number, durum: BildirimListeDurumu): Promise<number> {
  const r = await db.tek<{ toplam: number }>(
    `SELECT count(*)::int AS toplam FROM bildirim_kaydi WHERE kisi_id = $1 AND ${DURUM_KOSULU[durum]}`,
    [kisiId],
  );
  return r?.toplam ?? 0;
}

export function kisininBildirimleri(db: Db, kisiId: number, durum: BildirimListeDurumu, dilim: Dilim): Promise<Bildirim[]> {
  const sira = durum === 'arsiv' ? 'arsivlendi DESC, id DESC' : 'olusturuldu DESC, id DESC';
  return db.sorgu<Bildirim>(
    `SELECT ${SECIM} FROM bildirim_kaydi WHERE kisi_id = $1 AND ${DURUM_KOSULU[durum]} ORDER BY ${sira} LIMIT $2 OFFSET $3`,
    [kisiId, dilim.sinir, dilim.atla],
  );
}

export async function kisininSayaci(db: Db, kisiId: number): Promise<{ okunmamis: number; acilVar: boolean }> {
  const r = await db.tek<{ okunmamis: number; acilVar: boolean }>(
    `SELECT count(*)::int AS okunmamis, coalesce(bool_or(onem = 'acil'), false) AS "acilVar"
       FROM bildirim_kaydi WHERE kisi_id = $1 AND okundu IS NULL AND arsivlendi IS NULL`,
    [kisiId],
  );
  return r ?? { okunmamis: 0, acilVar: false };
}

// Yalnız kişinin kendi satırı: başkasının kimliği "bulunamadı"dan ayırt edilmez.
export function okunduIsaretle(db: Db, kisiId: number, id: number): Promise<Bildirim | null> {
  return db.tek<Bildirim>(
    `UPDATE bildirim_kaydi SET okundu = coalesce(okundu, now()) WHERE id = $1 AND kisi_id = $2 RETURNING ${SECIM}`,
    [id, kisiId],
  );
}

export async function tumunuOkunduIsaretle(db: Db, kisiId: number): Promise<number> {
  const r = await db.sorgu<{ id: number }>(
    'UPDATE bildirim_kaydi SET okundu = now() WHERE kisi_id = $1 AND okundu IS NULL AND arsivlendi IS NULL RETURNING id',
    [kisiId],
  );
  return r.length;
}

// Arşive kaldırılan okunmuş da sayılır (açılmadan kaldırılan haber zilde kalmasın).
export function arsivle(db: Db, kisiId: number, id: number): Promise<Bildirim | null> {
  return db.tek<Bildirim>(
    `UPDATE bildirim_kaydi SET okundu = coalesce(okundu, now()), arsivlendi = coalesce(arsivlendi, now())
      WHERE id = $1 AND kisi_id = $2 RETURNING ${SECIM}`,
    [id, kisiId],
  );
}

export interface TercihSatiri { tur: string; mesaj: boolean; eposta: boolean }

export function kisininTercihleri(db: Db, kisiId: number): Promise<TercihSatiri[]> {
  return db.sorgu<TercihSatiri>('SELECT tur, mesaj, eposta FROM bildirim_tercihi WHERE kisi_id = $1', [kisiId]);
}

export async function tercihYaz(db: Db, kisiId: number, t: TercihSatiri): Promise<void> {
  await db.sorgu(
    `INSERT INTO bildirim_tercihi (kisi_id, tur, mesaj, eposta) VALUES ($1, $2, $3, $4)
     ON CONFLICT (kisi_id, tur) DO UPDATE SET mesaj = EXCLUDED.mesaj, eposta = EXCLUDED.eposta, guncellendi = now()`,
    [kisiId, t.tur, t.mesaj, t.eposta],
  );
}

export interface CagriEkibiSatiri { ekip: string; rolIdleri: number[]; surum: number; degistirenKisiId: number | null; degistirildi: string }

export function cagriEkipleri(db: Db): Promise<CagriEkibiSatiri[]> {
  return db.sorgu<CagriEkibiSatiri>(
    `SELECT e.ekip, COALESCE(array_agg(a.rol_id ORDER BY a.rol_id) FILTER (WHERE a.rol_id IS NOT NULL), '{}') AS "rolIdleri",
            e.surum, e.degistiren_kisi_id AS "degistirenKisiId", ${zamanMetni('e.degistirildi')} AS degistirildi
       FROM bildirim_cagri_ekibi e LEFT JOIN bildirim_cagri_alicisi a ON a.ekip = e.ekip
      GROUP BY e.ekip ORDER BY e.ekip`,
  );
}

export async function cagriEkibiRolleri(db: Db, ekip: string): Promise<number[]> {
  const satirlar = await db.sorgu<{ rolId: number }>('SELECT rol_id AS "rolId" FROM bildirim_cagri_alicisi WHERE ekip = $1 ORDER BY rol_id', [ekip]);
  return satirlar.map((s) => s.rolId);
}

// Sürüm tutmazsa (ya da ekip satırı yoksa) false: alıcılar değişmez. Rol listesi tek transaction'da yeniden yazılır.
export async function cagriEkibiYaz(db: Db, ekip: string, rolIdleri: readonly number[], surum: number, kisiId: number): Promise<boolean> {
  const satir = await db.tek(
    `UPDATE bildirim_cagri_ekibi SET surum = surum + 1, degistiren_kisi_id = $3, degistirildi = now()
      WHERE ekip = $1 AND surum = $2 RETURNING 1`,
    [ekip, surum, kisiId],
  );
  if (satir === null) return false;
  await db.sorgu('DELETE FROM bildirim_cagri_alicisi WHERE ekip = $1', [ekip]);
  await db.sorgu('INSERT INTO bildirim_cagri_alicisi (ekip, rol_id) SELECT $1, unnest($2::int[])', [ekip, rolIdleri]);
  return true;
}

export interface TurAyariSatiri {
  tur: string; rolIdleri: number[]; kisiIdleri: number[]; surum: number; degistirenKisiId: number | null; degistirildi: string;
}

export function turAyarlari(db: Db): Promise<TurAyariSatiri[]> {
  return db.sorgu<TurAyariSatiri>(
    `SELECT a.tur,
            COALESCE((SELECT array_agg(r.rol_id ORDER BY r.rol_id) FROM bildirim_tur_rolu r WHERE r.tur = a.tur), '{}') AS "rolIdleri",
            COALESCE((SELECT array_agg(k.kisi_id ORDER BY k.kisi_id) FROM bildirim_tur_kisisi k WHERE k.tur = a.tur), '{}') AS "kisiIdleri",
            a.surum, a.degistiren_kisi_id AS "degistirenKisiId", ${zamanMetni('a.degistirildi')} AS degistirildi
       FROM bildirim_tur_ayari a ORDER BY a.tur`,
  );
}

export function turAyari(db: Db, tur: string): Promise<{ rolIdleri: number[]; kisiIdleri: number[] } | null> {
  return db.tek(
    `SELECT COALESCE((SELECT array_agg(r.rol_id ORDER BY r.rol_id) FROM bildirim_tur_rolu r WHERE r.tur = a.tur), '{}') AS "rolIdleri",
            COALESCE((SELECT array_agg(k.kisi_id ORDER BY k.kisi_id) FROM bildirim_tur_kisisi k WHERE k.tur = a.tur), '{}') AS "kisiIdleri"
       FROM bildirim_tur_ayari a WHERE a.tur = $1`,
    [tur],
  );
}

// Sürüm tutmazsa false: alıcılar değişmez. Sürümsüz yazım yalnız ayarlanmamış türü açar; tür bu arada açıldıysa eski sürümdür.
// İkisi de boşsa satır silinir (alıcılar da cascade ile): tür işlem kuralına döner.
export async function turAyariYaz(
  db: Db, tur: string, a: { rolIdleri: readonly number[]; kisiIdleri: readonly number[]; surum: number | null }, kisiId: number,
): Promise<boolean> {
  const bos = a.rolIdleri.length === 0 && a.kisiIdleri.length === 0;
  if (a.surum === null) {
    if (bos) return (await db.tek('SELECT 1 FROM bildirim_tur_ayari WHERE tur = $1', [tur])) === null;
    const acildi = await db.tek(
      'INSERT INTO bildirim_tur_ayari (tur, degistiren_kisi_id) VALUES ($1, $2) ON CONFLICT (tur) DO NOTHING RETURNING 1', [tur, kisiId],
    );
    if (acildi === null) return false;
  } else if (bos) {
    return (await db.tek('DELETE FROM bildirim_tur_ayari WHERE tur = $1 AND surum = $2 RETURNING 1', [tur, a.surum])) !== null;
  } else {
    const satir = await db.tek(
      `UPDATE bildirim_tur_ayari SET surum = surum + 1, degistiren_kisi_id = $3, degistirildi = now()
        WHERE tur = $1 AND surum = $2 RETURNING 1`,
      [tur, a.surum, kisiId],
    );
    if (satir === null) return false;
    await db.sorgu('DELETE FROM bildirim_tur_rolu WHERE tur = $1', [tur]);
    await db.sorgu('DELETE FROM bildirim_tur_kisisi WHERE tur = $1', [tur]);
  }
  await db.sorgu('INSERT INTO bildirim_tur_rolu (tur, rol_id) SELECT $1, unnest($2::int[])', [tur, a.rolIdleri]);
  await db.sorgu('INSERT INTO bildirim_tur_kisisi (tur, kisi_id) SELECT $1, unnest($2::int[])', [tur, a.kisiIdleri]);
  return true;
}
