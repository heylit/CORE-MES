import type { Db } from '#cekirdek/db.ts';
import type { Dilim } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { Bildirim, BildirimListeDurumu, BildirimOnemi } from '#paylasilan/sozlesme/bildirim.ts';

const SECIM = `id, tur, onem, baslik, metin, yol, kaynak_modul AS "kaynakModul", tekrar_sayisi AS "tekrarSayisi",
  ${zamanMetni('olusturuldu')} AS olusturuldu, ${zamanMetni('okundu')} AS okundu, ${zamanMetni('arsivlendi')} AS arsivlendi,
  onay_istenir AS "onayIstenir", ${zamanMetni('onaylandi')} AS onaylandi, yayin_id AS "yayinId"`;

// Kişinin satırı; yayın künyesi servis katmanında eklenir (yazanın adı kisiler modülündedir).
export type BildirimSatiri = Omit<Bildirim, 'yayin'> & { yayinId: number | null };

export interface YeniBildirim {
  kisiId: number;
  tur: string;
  onem: BildirimOnemi;
  baslik: string;
  metin: string | null;
  yol: string | null;
  kaynakModul: string;
  tekilAnahtar: string | null;
  // Ekran ortasında çıkar ve onay ister (2147-3 a, Y4); otomatikte türün gösterimi.
  ortada?: boolean;
  onayIstenir?: boolean;
}

// Okunmamış aynı tekil anahtar varsa yeni satır açılmaz: sayaç artar, metin ve zaman tazelenir (zilde yeniden üste çıkar).
export async function bildirimYaz(db: Db, b: YeniBildirim): Promise<void> {
  await db.sorgu(
    `INSERT INTO bildirim_kaydi (kisi_id, tur, onem, baslik, metin, yol, kaynak_modul, tekil_anahtar, ortada, onay_istenir)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (kisi_id, tekil_anahtar) WHERE tekil_anahtar IS NOT NULL AND okundu IS NULL AND arsivlendi IS NULL
     DO UPDATE SET tekrar_sayisi = bildirim_kaydi.tekrar_sayisi + 1, baslik = EXCLUDED.baslik, metin = EXCLUDED.metin,
       yol = EXCLUDED.yol, onem = EXCLUDED.onem, ortada = EXCLUDED.ortada, onay_istenir = EXCLUDED.onay_istenir, olusturuldu = now()`,
    [b.kisiId, b.tur, b.onem, b.baslik, b.metin, b.yol, b.kaynakModul, b.tekilAnahtar, b.ortada ?? false, b.onayIstenir ?? false],
  );
}

const DURUM_KOSULU: Record<BildirimListeDurumu, string> = {
  gelen: 'arsivlendi IS NULL',
  okunmamis: 'arsivlendi IS NULL AND okundu IS NULL',
  'onay-bekleyen': 'arsivlendi IS NULL AND onay_istenir AND onaylandi IS NULL',
  onemli: "arsivlendi IS NULL AND onem <> 'bilgi'",
  duyuru: "arsivlendi IS NULL AND yayin_id IN (SELECT id FROM bildirim_yayini WHERE tur = 'duyuru')",
  bilgi: "arsivlendi IS NULL AND onem = 'bilgi'",
  arsiv: 'arsivlendi IS NOT NULL',
};

export async function kisininBildirimSayisi(db: Db, kisiId: number, durum: BildirimListeDurumu): Promise<number> {
  const r = await db.tek<{ toplam: number }>(
    `SELECT count(*)::int AS toplam FROM bildirim_kaydi WHERE kisi_id = $1 AND ${DURUM_KOSULU[durum]}`,
    [kisiId],
  );
  return r?.toplam ?? 0;
}

export function kisininBildirimleri(db: Db, kisiId: number, durum: BildirimListeDurumu, dilim: Dilim): Promise<BildirimSatiri[]> {
  const sira = durum === 'arsiv' ? 'arsivlendi DESC, id DESC' : 'olusturuldu DESC, id DESC';
  return db.sorgu<BildirimSatiri>(
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
export function okunduIsaretle(db: Db, kisiId: number, id: number): Promise<BildirimSatiri | null> {
  return db.tek<BildirimSatiri>(
    `UPDATE bildirim_kaydi SET okundu = coalesce(okundu, now()) WHERE id = $1 AND kisi_id = $2 RETURNING ${SECIM}`,
    [id, kisiId],
  );
}

// Kaynak kaydın kararı verilince o kayda bağlı açık bildirim bütün alıcılarda okunur; okunmuş ve arşivdeki satıra dokunulmaz.
export async function kaynaktanOkunduIsaretle(db: Db, tekilAnahtar: string): Promise<number> {
  const r = await db.sorgu<{ id: number }>(
    `UPDATE bildirim_kaydi SET okundu = now()
     WHERE tekil_anahtar = $1 AND okundu IS NULL AND arsivlendi IS NULL RETURNING id`,
    [tekilAnahtar],
  );
  return r.length;
}

export async function tumunuOkunduIsaretle(db: Db, kisiId: number): Promise<number> {
  const r = await db.sorgu<{ id: number }>(
    'UPDATE bildirim_kaydi SET okundu = now() WHERE kisi_id = $1 AND okundu IS NULL AND arsivlendi IS NULL RETURNING id',
    [kisiId],
  );
  return r.length;
}

// Arşive kaldırılan okunmuş da sayılır (açılmadan kaldırılan haber zilde kalmasın).
export function arsivle(db: Db, kisiId: number, id: number): Promise<BildirimSatiri | null> {
  return db.tek<BildirimSatiri>(
    `UPDATE bildirim_kaydi SET okundu = coalesce(okundu, now()), arsivlendi = coalesce(arsivlendi, now())
      WHERE id = $1 AND kisi_id = $2 AND NOT (onay_istenir AND onaylandi IS NULL) RETURNING ${SECIM}`,
    [id, kisiId],
  );
}

// Kişinin satırı onay bekliyor mu (arşiv reddinin iletisi için); başkasının satırı null.
export function onayBekliyorMu(db: Db, kisiId: number, id: number): Promise<{ bekliyor: boolean } | null> {
  return db.tek(
    'SELECT (onay_istenir AND onaylandi IS NULL) AS bekliyor FROM bildirim_kaydi WHERE id = $1 AND kisi_id = $2', [id, kisiId],
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

/* ---------------- otomatik gösterim (2147 Y4) ---------------- */

export interface TurGosterimiSatiri {
  tur: string; ortada: boolean; onayIstenir: boolean; surum: number; degistirenKisiId: number | null; degistirildi: string;
}

export function turGosterimleri(db: Db): Promise<TurGosterimiSatiri[]> {
  return db.sorgu<TurGosterimiSatiri>(
    `SELECT tur, ortada, onay_istenir AS "onayIstenir", surum, degistiren_kisi_id AS "degistirenKisiId", ${zamanMetni('degistirildi')} AS degistirildi
       FROM bildirim_tur_gosterimi ORDER BY tur`,
  );
}

export function turGosterimi(db: Db, tur: string): Promise<{ ortada: boolean; onayIstenir: boolean } | null> {
  return db.tek('SELECT ortada, onay_istenir AS "onayIstenir" FROM bildirim_tur_gosterimi WHERE tur = $1', [tur]);
}

// Sürüm tutmazsa false. Sürümsüz yazım yalnız ayarlanmamış türü açar; varsayılana dönen değer satırı siler.
export async function turGosterimiYaz(
  db: Db, tur: string, g: { ortada: boolean; onayIstenir: boolean; surum: number | null; varsayilan: boolean }, kisiId: number,
): Promise<boolean> {
  if (g.surum === null) {
    if (g.varsayilan) return (await db.tek('SELECT 1 FROM bildirim_tur_gosterimi WHERE tur = $1', [tur])) === null;
    return (await db.tek(
      `INSERT INTO bildirim_tur_gosterimi (tur, ortada, onay_istenir, degistiren_kisi_id) VALUES ($1, $2, $3, $4)
       ON CONFLICT (tur) DO NOTHING RETURNING 1`,
      [tur, g.ortada, g.onayIstenir, kisiId],
    )) !== null;
  }
  if (g.varsayilan) return (await db.tek('DELETE FROM bildirim_tur_gosterimi WHERE tur = $1 AND surum = $2 RETURNING 1', [tur, g.surum])) !== null;
  return (await db.tek(
    `UPDATE bildirim_tur_gosterimi SET ortada = $3, onay_istenir = $4, surum = surum + 1, degistiren_kisi_id = $5, degistirildi = now()
      WHERE tur = $1 AND surum = $2 RETURNING 1`,
    [tur, g.surum, g.ortada, g.onayIstenir, kisiId],
  )) !== null;
}

/* ---------------- elle bildirim (2147) ---------------- */

export async function simdi(db: Db): Promise<string> {
  const r = await db.tek<{ an: string }>(`SELECT ${zamanMetni('now()')} AS an`);
  if (r === null) throw new Error('Veritabanı saati okunamadı.');
  return r.an;
}

export interface YeniYayin {
  yazanKisiId: number; tur: string; simge: string; baslik: string; metin: string | null; gorsel: { ozet: string; ad: string } | null;
  hedefTuru: string; hedefIdleri: readonly number[]; ortada: boolean; onayIstenir: boolean; yayinZamani: string | null; bitis: string | null;
}

// Yayın zamanı boşsa veritabanı saatidir; geçmiş zaman da şimdiye çekilir (kural BIL-12).
export async function yayinYaz(db: Db, y: YeniYayin): Promise<number> {
  const r = await db.tek<{ id: number }>(
    `INSERT INTO bildirim_yayini (yazan_kisi_id, tur, simge, baslik, metin, gorsel_ozet, gorsel_ad, hedef_turu, ortada, onay_istenir, yayin_zamani, bitis)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, greatest(now(), coalesce($11::timestamptz, now())), $12) RETURNING id`,
    [y.yazanKisiId, y.tur, y.simge, y.baslik, y.metin, y.gorsel?.ozet ?? null, y.gorsel?.ad ?? null, y.hedefTuru, y.ortada, y.onayIstenir,
      y.yayinZamani, y.bitis],
  );
  if (r === null) throw new Error('Yayın yazılamadı.');
  await db.sorgu('INSERT INTO bildirim_yayin_hedefi (yayin_id, hedef_id) SELECT $1, unnest($2::int[])', [r.id, y.hedefIdleri]);
  return r.id;
}

export interface YayinSatiri {
  id: number; yazanKisiId: number; tur: string; simge: string; baslik: string; metin: string | null; gorselOzet: string | null;
  hedefTuru: string; hedefIdleri: number[]; ortada: boolean; onayIstenir: boolean; yayinZamani: string; bitis: string | null;
  dagitildi: string | null; aliciSayisi: number | null; okuyanSayisi: number | null; onaylayanSayisi: number | null;
  olusturuldu: string; geriCekildi: string | null; geriCekenKisiId: number | null;
}

const YAYIN_SECIM = `y.id, y.yazan_kisi_id AS "yazanKisiId", y.tur, y.simge, y.baslik, y.metin, y.gorsel_ozet AS "gorselOzet",
  y.hedef_turu AS "hedefTuru",
  COALESCE((SELECT array_agg(h.hedef_id ORDER BY h.hedef_id) FROM bildirim_yayin_hedefi h WHERE h.yayin_id = y.id), '{}') AS "hedefIdleri",
  y.ortada, y.onay_istenir AS "onayIstenir", ${zamanMetni('y.yayin_zamani')} AS "yayinZamani", ${zamanMetni('y.bitis')} AS bitis,
  ${zamanMetni('y.dagitildi')} AS dagitildi, y.alici_sayisi AS "aliciSayisi",
  CASE WHEN y.dagitildi IS NULL THEN NULL
       ELSE (SELECT count(*)::int FROM bildirim_kaydi k WHERE k.yayin_id = y.id AND k.okundu IS NOT NULL) END AS "okuyanSayisi",
  CASE WHEN y.dagitildi IS NULL OR NOT y.onay_istenir THEN NULL
       ELSE (SELECT count(*)::int FROM bildirim_kaydi k WHERE k.yayin_id = y.id AND k.onaylandi IS NOT NULL) END AS "onaylayanSayisi",
  ${zamanMetni('y.olusturuldu')} AS olusturuldu, ${zamanMetni('y.geri_cekildi')} AS "geriCekildi", y.geri_ceken_kisi_id AS "geriCekenKisiId"`;

export function yayinBul(db: Db, id: number): Promise<YayinSatiri | null> {
  return db.tek<YayinSatiri>(`SELECT ${YAYIN_SECIM} FROM bildirim_yayini y WHERE y.id = $1`, [id]);
}

// yazanKisiId null ise bütün yayınlar (rapor işlemi), değilse yalnız o kişinin yazdıkları.
export async function yayinSayisi(db: Db, yazanKisiId: number | null): Promise<number> {
  const r = await db.tek<{ toplam: number }>(
    'SELECT count(*)::int AS toplam FROM bildirim_yayini WHERE $1::int IS NULL OR yazan_kisi_id = $1', [yazanKisiId],
  );
  return r?.toplam ?? 0;
}

export function yayinlar(db: Db, yazanKisiId: number | null, dilim: Dilim): Promise<YayinSatiri[]> {
  return db.sorgu<YayinSatiri>(
    `SELECT ${YAYIN_SECIM} FROM bildirim_yayini y WHERE $1::int IS NULL OR y.yazan_kisi_id = $1
      ORDER BY y.olusturuldu DESC, y.id DESC LIMIT $2 OFFSET $3`,
    [yazanKisiId, dilim.sinir, dilim.atla],
  );
}

// Dağıtım bir kez olur: satır kilitlenir, dağıtılmış ya da geri çekilmiş yayın atlanır (false).
export async function dagitimaKilitle(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM bildirim_yayini WHERE id = $1 AND dagitildi IS NULL AND geri_cekildi IS NULL FOR UPDATE', [id])) !== null;
}

export async function yayinAlicilariYaz(
  db: Db, y: { id: number; onem: BildirimOnemi; baslik: string; metin: string | null; ortada: boolean; onayIstenir: boolean }, tur: string,
  kisiIdleri: readonly number[],
): Promise<void> {
  await db.sorgu(
    `INSERT INTO bildirim_kaydi (kisi_id, tur, onem, baslik, metin, yol, kaynak_modul, tekil_anahtar, yayin_id, ortada, onay_istenir)
     SELECT k, $2, $3, $4, $5, NULL, 'bildirim', NULL, $1, $6, $7 FROM unnest($8::int[]) AS k`,
    [y.id, tur, y.onem, y.baslik, y.metin, y.ortada, y.onayIstenir, kisiIdleri],
  );
  await db.sorgu('UPDATE bildirim_yayini SET dagitildi = now(), alici_sayisi = $2 WHERE id = $1', [y.id, kisiIdleri.length]);
}

// Zamanı gelmiş, dağıtılmamış ve geri çekilmemiş yayınlar; aynı anda koşan ikinci tur kilitli satırı atlar.
export async function zamaniGelenYayinlar(db: Db, sinir: number): Promise<number[]> {
  const r = await db.sorgu<{ id: number }>(
    `SELECT id FROM bildirim_yayini WHERE dagitildi IS NULL AND geri_cekildi IS NULL AND yayin_zamani <= now()
      ORDER BY yayin_zamani, id LIMIT $1 FOR UPDATE SKIP LOCKED`,
    [sinir],
  );
  return r.map((x) => x.id);
}

export async function geriCek(db: Db, id: number, kisiId: number): Promise<boolean> {
  return (await db.tek(
    'UPDATE bildirim_yayini SET geri_cekildi = now(), geri_ceken_kisi_id = $2 WHERE id = $1 AND geri_cekildi IS NULL RETURNING 1', [id, kisiId],
  )) !== null;
}

export interface YayinAlicisiSatiri { kisiId: number; okundu: string | null; onaylandi: string | null }
export function yayinAlicilari(db: Db, yayinId: number): Promise<YayinAlicisiSatiri[]> {
  return db.sorgu<YayinAlicisiSatiri>(
    `SELECT kisi_id AS "kisiId", ${zamanMetni('okundu')} AS okundu, ${zamanMetni('onaylandi')} AS onaylandi
       FROM bildirim_kaydi WHERE yayin_id = $1 ORDER BY kisi_id`,
    [yayinId],
  );
}

export async function yayinAlicisiMi(db: Db, yayinId: number, kisiId: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM bildirim_kaydi WHERE yayin_id = $1 AND kisi_id = $2', [yayinId, kisiId])) !== null;
}

export interface OrtadakiSatir {
  id: number; onem: BildirimOnemi; yayinTuru: string | null; simge: string | null; baslik: string; metin: string | null; yol: `/${string}` | null;
  kaynakModul: string; yazanKisiId: number | null; yayinId: number | null; gorselVar: boolean; onayIstenir: boolean; olusturuldu: string;
}

// Ekran ortası (BIL-15): onay isteyen onaylanana, onaysız olan okunana dek; arşivdeki, geri çekilen ve bitişi geçen yayın gelmez.
export function ortadakiler(db: Db, kisiId: number, sinir: number): Promise<OrtadakiSatir[]> {
  return db.sorgu<OrtadakiSatir>(
    `SELECT k.id, k.onem, y.tur AS "yayinTuru", y.simge, k.baslik, k.metin, k.yol, k.kaynak_modul AS "kaynakModul",
            y.yazan_kisi_id AS "yazanKisiId", k.yayin_id AS "yayinId", (y.gorsel_ozet IS NOT NULL) AS "gorselVar",
            k.onay_istenir AS "onayIstenir", ${zamanMetni('k.olusturuldu')} AS olusturuldu
       FROM bildirim_kaydi k LEFT JOIN bildirim_yayini y ON y.id = k.yayin_id
      WHERE k.kisi_id = $1 AND k.ortada AND k.arsivlendi IS NULL
        AND (CASE WHEN k.onay_istenir THEN k.onaylandi IS NULL ELSE k.okundu IS NULL END)
        AND (y.id IS NULL OR (y.geri_cekildi IS NULL AND (y.bitis IS NULL OR y.bitis > now())))
      ORDER BY k.id LIMIT $2`,
    [kisiId, sinir],
  );
}

// Yalnız kişinin onay isteyen satırı; ilk onay zamanı korunur.
export function onayla(db: Db, kisiId: number, id: number): Promise<{ id: number; okundu: string; onaylandi: string } | null> {
  return db.tek(
    `UPDATE bildirim_kaydi SET okundu = coalesce(okundu, now()), onaylandi = coalesce(onaylandi, now())
      WHERE id = $1 AND kisi_id = $2 AND onay_istenir
      RETURNING id, ${zamanMetni('okundu')} AS okundu, ${zamanMetni('onaylandi')} AS onaylandi`,
    [id, kisiId],
  );
}

export async function kisininSatiriVarMi(db: Db, kisiId: number, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM bildirim_kaydi WHERE id = $1 AND kisi_id = $2', [id, kisiId])) !== null;
}

export interface YayinKunyesiSatiri {
  id: number; tur: string; simge: string; yazanKisiId: number; gorselVar: boolean; geriCekildi: string | null;
}

// Merkez listesindeki elle bildirimlerin künyesi; kişinin satırı zaten süzülmüştür, burada yalnız yayının kendisi okunur.
export function yayinKunyeleri(db: Db, idler: readonly number[]): Promise<YayinKunyesiSatiri[]> {
  if (idler.length === 0) return Promise.resolve([]);
  return db.sorgu<YayinKunyesiSatiri>(
    `SELECT id, tur, simge, yazan_kisi_id AS "yazanKisiId", (gorsel_ozet IS NOT NULL) AS "gorselVar",
            ${zamanMetni('geri_cekildi')} AS "geriCekildi"
       FROM bildirim_yayini WHERE id = ANY($1::int[])`,
    [[...new Set(idler)]],
  );
}
