import type { Db } from '#cekirdek/db.ts';
import type { Dilim } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { Bildirim, BildirimListeDurumu, BildirimOnemi, BildirimSinifi } from '#paylasilan/sozlesme/bildirim.ts';

const SECIM = `id, tur, onem, baslik, metin, yol, kaynak_modul AS "kaynakModul", tekrar_sayisi AS "tekrarSayisi",
  ${zamanMetni('olusturuldu')} AS olusturuldu, ${zamanMetni('okundu')} AS okundu, ${zamanMetni('arsivlendi')} AS arsivlendi,
  onay_istenir AS "onayIstenir", ${zamanMetni('onaylandi')} AS onaylandi, yayin_id AS "yayinId",
  sinif, ${zamanMetni('yapildi')} AS yapildi`;

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
  // Verilmezse bilgi (tablo varsayılanı).
  sinif?: BildirimSinifi;
}

// Okunmamış aynı tekil anahtar varsa yeni satır açılmaz: sayaç artar, metin ve zaman tazelenir (zilde yeniden üste çıkar).
// Dönen `yeni` yalnız yeni açılan satırda true: tekrar sayacı artan satır e-postayı ikinci kez göndermez (3397).
export async function bildirimYaz(db: Db, b: YeniBildirim): Promise<{ id: number; yeni: boolean }> {
  const r = await db.tek<{ id: number; yeni: boolean }>(
    `INSERT INTO bildirim_kaydi (kisi_id, tur, onem, baslik, metin, yol, kaynak_modul, tekil_anahtar, ortada, onay_istenir, sinif)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (kisi_id, tekil_anahtar) WHERE tekil_anahtar IS NOT NULL AND okundu IS NULL AND arsivlendi IS NULL
     DO UPDATE SET tekrar_sayisi = bildirim_kaydi.tekrar_sayisi + 1, baslik = EXCLUDED.baslik, metin = EXCLUDED.metin,
       yol = EXCLUDED.yol, onem = EXCLUDED.onem, ortada = EXCLUDED.ortada, onay_istenir = EXCLUDED.onay_istenir, sinif = EXCLUDED.sinif, olusturuldu = now()
     RETURNING id, (xmax = 0) AS yeni`,
    [b.kisiId, b.tur, b.onem, b.baslik, b.metin, b.yol, b.kaynakModul, b.tekilAnahtar, b.ortada ?? false, b.onayIstenir ?? false, b.sinif ?? 'bilgi'],
  );
  if (r === null) throw new Error('Bildirim yazılamadı.');
  return r;
}

const DURUM_KOSULU: Record<BildirimListeDurumu, string> = {
  gelen: 'arsivlendi IS NULL',
  okunmamis: 'arsivlendi IS NULL AND okundu IS NULL',
  'onay-bekleyen': 'arsivlendi IS NULL AND onay_istenir AND onaylandi IS NULL',
  onemli: "arsivlendi IS NULL AND onem <> 'bilgi'",
  duyuru: "arsivlendi IS NULL AND yayin_id IN (SELECT id FROM bildirim_yayini WHERE tur = 'duyuru')",
  bilgi: "arsivlendi IS NULL AND onem = 'bilgi'",
  gorev: "arsivlendi IS NULL AND sinif = 'gorev' AND yapildi IS NULL",
  hatirlatma: "arsivlendi IS NULL AND sinif = 'hatirlatma' AND yapildi IS NULL",
  yapildi: 'arsivlendi IS NULL AND yapildi IS NOT NULL',
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

// Kaynak kaydın kararı verilince o kayda bağlı açık bildirim bütün alıcılarda okunur; görev ve hatırlatma ayrıca yapıldı olur
// (okunmuş ama yapılmamış görev de). Bitmiş ve arşivdeki satıra dokunulmaz.
// Kural satırları (3478-3) ana anahtarın sonuna `#kural-<id>` ekler; karar verilince onlar da kapanır.
export async function kaynaktanOkunduIsaretle(db: Db, tekilAnahtar: string): Promise<number> {
  const r = await db.sorgu<{ id: number }>(
    `UPDATE bildirim_kaydi SET okundu = coalesce(okundu, now()),
            yapildi = CASE WHEN sinif = 'bilgi' THEN NULL ELSE coalesce(yapildi, now()) END
     WHERE (tekil_anahtar = $1 OR left(tekil_anahtar, length($1) + 7) = $1 || '#kural-') AND arsivlendi IS NULL AND (okundu IS NULL OR (sinif <> 'bilgi' AND yapildi IS NULL)) RETURNING id`,
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

// Web Push (ADR 0031). Uç nokta tekildir: aynı cihaz başka kişiyle oturum açıp abone olursa abonelik o kişiye geçer.
export async function pushAboneligiYaz(db: Db, kisiId: number, ucNokta: string): Promise<void> {
  await db.sorgu(
    `INSERT INTO bildirim_push_abonelik (kisi_id, uc_nokta) VALUES ($1, $2)
     ON CONFLICT (uc_nokta) DO UPDATE SET kisi_id = EXCLUDED.kisi_id, olusturuldu = now(), son_gonderim = NULL`,
    [kisiId, ucNokta],
  );
}

// Yalnız kişinin kendi aboneliği silinir; başkasının adresi silinmez (false).
export async function pushAboneligiSil(db: Db, kisiId: number, ucNokta: string): Promise<boolean> {
  return (await db.tek('DELETE FROM bildirim_push_abonelik WHERE kisi_id = $1 AND uc_nokta = $2 RETURNING 1', [kisiId, ucNokta])) !== null;
}

export async function pushCihazSayisi(db: Db, kisiId: number): Promise<number> {
  const r = await db.tek<{ n: number }>('SELECT count(*)::int AS n FROM bildirim_push_abonelik WHERE kisi_id = $1', [kisiId]);
  return r?.n ?? 0;
}

// Yalnız aboneliği olan kişiler kuyruğa girer; zaten bekleyenin zamanı değişmez.
export async function pushKuyrugaIsaretle(db: Db, kisiIdleri: readonly number[]): Promise<void> {
  if (kisiIdleri.length === 0) return;
  await db.sorgu(
    `INSERT INTO bildirim_push_kuyruk (kisi_id, bekleyen)
     SELECT DISTINCT kisi_id, now() FROM bildirim_push_abonelik WHERE kisi_id = ANY($1::int[])
     ON CONFLICT (kisi_id) DO UPDATE SET bekleyen = coalesce(bildirim_push_kuyruk.bekleyen, EXCLUDED.bekleyen)`,
    [kisiIdleri],
  );
}

// Sırası gelen (bekleyen dolu, son gönderimden en az aralık geçmiş) kişileri alır ve işaretler; kişinin bütün cihazları döner.
// SKIP LOCKED: iki tur aynı kişiyi almaz.
export function pushSirasiAl(db: Db, enSikSn: number): Promise<{ id: number; kisiId: number; ucNokta: string }[]> {
  return db.sorgu(
    `WITH alinan AS (
       UPDATE bildirim_push_kuyruk k SET bekleyen = NULL, son_gonderim = now()
       WHERE k.kisi_id IN (
         SELECT kisi_id FROM bildirim_push_kuyruk
         WHERE bekleyen IS NOT NULL AND (son_gonderim IS NULL OR son_gonderim <= now() - make_interval(secs => $1))
         ORDER BY bekleyen LIMIT 200 FOR UPDATE SKIP LOCKED)
       RETURNING k.kisi_id)
     SELECT a.id::int AS id, a.kisi_id AS "kisiId", a.uc_nokta AS "ucNokta"
     FROM bildirim_push_abonelik a JOIN alinan USING (kisi_id) ORDER BY a.kisi_id, a.id`,
    [enSikSn],
  );
}

export async function pushAbonelikleriSil(db: Db, idler: readonly number[]): Promise<void> {
  if (idler.length === 0) return;
  await db.sorgu('DELETE FROM bildirim_push_abonelik WHERE id = ANY($1::bigint[])', [idler]);
}

export async function pushBasariIsle(db: Db, idler: readonly number[]): Promise<void> {
  if (idler.length === 0) return;
  await db.sorgu('UPDATE bildirim_push_abonelik SET son_gonderim = now() WHERE id = ANY($1::bigint[])', [idler]);
}

export function pushTurAyarlari(db: Db): Promise<{ tur: string; acik: boolean }[]> {
  return db.sorgu('SELECT tur, acik FROM bildirim_push_turu ORDER BY tur');
}

export async function pushTurAcikMi(db: Db, tur: string): Promise<boolean | null> {
  const r = await db.tek<{ acik: boolean }>('SELECT acik FROM bildirim_push_turu WHERE tur = $1', [tur]);
  return r?.acik ?? null;
}

// Varsayılana dönen değer satırı siler; tablo yalnız yöneticinin farklı seçtiği türleri tutar.
export async function pushTurYaz(db: Db, tur: string, acik: boolean, varsayilan: boolean, kisiId: number): Promise<void> {
  if (acik === varsayilan) {
    await db.sorgu('DELETE FROM bildirim_push_turu WHERE tur = $1', [tur]);
    return;
  }
  await db.sorgu(
    `INSERT INTO bildirim_push_turu (tur, acik, degistiren_kisi_id) VALUES ($1, $2, $3)
     ON CONFLICT (tur) DO UPDATE SET acik = EXCLUDED.acik, degistiren_kisi_id = EXCLUDED.degistiren_kisi_id, degisti = now()`,
    [tur, acik, kisiId],
  );
}

/* ---------------- e-posta kanalı (ADR 0015, 3397) ---------------- */

export interface TetikleyiciSatiri {
  tur: string; eposta: boolean; zaman: 'hemen' | 'ozet'; tekrarGun: number | null; tekrarEnCok: number | null; yukseltGun: number | null;
  yukseltRolIdleri: number[]; yukseltKisiIdleri: number[]; sablonId: number | null; surum: number;
}
const TETIKLEYICI_SECIM = `t.tur, t.eposta, t.sablon_id AS "sablonId", t.zaman, t.tekrar_gun AS "tekrarGun", t.tekrar_en_cok AS "tekrarEnCok", t.yukselt_gun AS "yukseltGun",
  COALESCE((SELECT array_agg(r.rol_id ORDER BY r.rol_id) FROM bildirim_eposta_yukselt_rolu r WHERE r.tur = t.tur), '{}') AS "yukseltRolIdleri",
  COALESCE((SELECT array_agg(k.kisi_id ORDER BY k.kisi_id) FROM bildirim_eposta_yukselt_kisisi k WHERE k.tur = t.tur), '{}') AS "yukseltKisiIdleri",
  t.surum`;

export function epostaTetikleyicileri(db: Db): Promise<TetikleyiciSatiri[]> {
  return db.sorgu<TetikleyiciSatiri>(`SELECT ${TETIKLEYICI_SECIM} FROM bildirim_eposta_tetikleyici t ORDER BY t.tur`);
}
export function epostaTetikleyicisi(db: Db, tur: string): Promise<TetikleyiciSatiri | null> {
  return db.tek<TetikleyiciSatiri>(`SELECT ${TETIKLEYICI_SECIM} FROM bildirim_eposta_tetikleyici t WHERE t.tur = $1`, [tur]);
}

// Sürüm tutmazsa false. Sürümsüz yazım yalnız hiç ayarlanmamış türü açar.
export async function epostaTetikleyiciYaz(
  db: Db, tur: string, a: Omit<TetikleyiciSatiri, 'tur' | 'surum'>, surum: number | null, kisiId: number,
): Promise<boolean> {
  const degerler = [tur, a.eposta, a.zaman, a.tekrarGun, a.tekrarEnCok, a.yukseltGun, kisiId, a.sablonId];
  const yazildi = surum === null
    ? await db.tek(
      `INSERT INTO bildirim_eposta_tetikleyici (tur, eposta, zaman, tekrar_gun, tekrar_en_cok, yukselt_gun, degistiren_kisi_id, sablon_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (tur) DO NOTHING RETURNING 1`, degerler,
    )
    : await db.tek(
      `UPDATE bildirim_eposta_tetikleyici SET eposta = $2, zaman = $3, tekrar_gun = $4, tekrar_en_cok = $5, yukselt_gun = $6,
              degistiren_kisi_id = $7, sablon_id = $8, degistirildi = now(), surum = surum + 1
        WHERE tur = $1 AND surum = $9 RETURNING 1`, [...degerler, surum],
    );
  if (yazildi === null) return false;
  await db.sorgu('DELETE FROM bildirim_eposta_yukselt_rolu WHERE tur = $1', [tur]);
  await db.sorgu('DELETE FROM bildirim_eposta_yukselt_kisisi WHERE tur = $1', [tur]);
  await db.sorgu('INSERT INTO bildirim_eposta_yukselt_rolu (tur, rol_id) SELECT $1, unnest($2::int[])', [tur, a.yukseltRolIdleri]);
  await db.sorgu('INSERT INTO bildirim_eposta_yukselt_kisisi (tur, kisi_id) SELECT $1, unnest($2::int[])', [tur, a.yukseltKisiIdleri]);
  return true;
}

// Boş sütun kod varsayılanı demektir (3435-2 a göçü eski satırları değiştirmedi).
export interface SablonIcerikSatiri {
  simge: string; konuKalibi: string; baslikKalibi: string | null; govde: string; tabloAlanlari: string[]; dugmeYazisi: string | null;
  onayDugmesi: boolean | null; altBilgi: string | null; serit: string | null; logo: boolean | null;
}
export interface SablonSatiri extends SablonIcerikSatiri { konu: string; surum: number; degistirildi: string }
export interface SablonYazimi {
  simge: string; konuKalibi: string; baslikKalibi: string | null; govde: string; tabloAlanlari: readonly string[]; dugmeYazisi: string | null;
  onayDugmesi: boolean; altBilgi: string | null; serit: string; logo: boolean;
}
const ICERIK_SECIM = `simge, konu_kalibi AS "konuKalibi", baslik_kalibi AS "baslikKalibi", govde, tablo_alanlari AS "tabloAlanlari",
  dugme_yazisi AS "dugmeYazisi", onay_dugmesi AS "onayDugmesi", alt_bilgi AS "altBilgi", serit, logo`;
const SABLON_SECIM = `konu, ${ICERIK_SECIM}, surum, ${zamanMetni('degistirildi')} AS degistirildi`;
const icerikDegerleri = (s: SablonYazimi): unknown[] => [s.simge, s.konuKalibi, s.baslikKalibi, s.govde, s.tabloAlanlari, s.dugmeYazisi, s.onayDugmesi, s.altBilgi, s.serit, s.logo];
export function epostaSablonlari(db: Db): Promise<SablonSatiri[]> {
  return db.sorgu<SablonSatiri>(`SELECT ${SABLON_SECIM} FROM bildirim_eposta_sablonu ORDER BY konu`);
}
export function epostaSablonu(db: Db, konu: string): Promise<SablonSatiri | null> {
  return db.tek<SablonSatiri>(`SELECT ${SABLON_SECIM} FROM bildirim_eposta_sablonu WHERE konu = $1`, [konu]);
}
// Sürüm tutmazsa false. `varsayilan` satırı siler (kod varsayılanı geçer).
export async function epostaSablonuYaz(db: Db, konu: string, s: SablonYazimi, surum: number | null, varsayilan: boolean, kisiId: number): Promise<boolean> {
  if (surum === null) {
    if (varsayilan) return (await db.tek('SELECT 1 FROM bildirim_eposta_sablonu WHERE konu = $1', [konu])) === null;
    return (await db.tek(
      `INSERT INTO bildirim_eposta_sablonu (konu, simge, konu_kalibi, baslik_kalibi, govde, tablo_alanlari, dugme_yazisi, onay_dugmesi, alt_bilgi, serit, logo, degistiren_kisi_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (konu) DO NOTHING RETURNING 1`,
      [konu, ...icerikDegerleri(s), kisiId],
    )) !== null;
  }
  if (varsayilan) return (await db.tek('DELETE FROM bildirim_eposta_sablonu WHERE konu = $1 AND surum = $2 RETURNING 1', [konu, surum])) !== null;
  return (await db.tek(
    `UPDATE bildirim_eposta_sablonu SET simge = $3, konu_kalibi = $4, baslik_kalibi = $5, govde = $6, tablo_alanlari = $7, dugme_yazisi = $8,
            onay_dugmesi = $9, alt_bilgi = $10, serit = $11, logo = $12, degistiren_kisi_id = $13, degistirildi = now(), surum = surum + 1
      WHERE konu = $1 AND surum = $2 RETURNING 1`,
    [konu, surum, ...icerikDegerleri(s), kisiId],
  )) !== null;
}

export interface OzelSablonSatiri extends SablonIcerikSatiri { id: number; ad: string; onayDugmesi: boolean; serit: string; logo: boolean; surum: number; degistirildi: string }
const OZEL_SECIM = `id, ad, ${ICERIK_SECIM}, surum, ${zamanMetni('degistirildi')} AS degistirildi`;
export function ozelSablonlar(db: Db): Promise<OzelSablonSatiri[]> {
  return db.sorgu<OzelSablonSatiri>(`SELECT ${OZEL_SECIM} FROM bildirim_eposta_ozel_sablon ORDER BY lower(ad), id`);
}
export function ozelSablon(db: Db, id: number): Promise<OzelSablonSatiri | null> {
  return db.tek<OzelSablonSatiri>(`SELECT ${OZEL_SECIM} FROM bildirim_eposta_ozel_sablon WHERE id = $1`, [id]);
}
// Aynı adda (büyük-küçük harf ve baştaki/sondaki boşluk farkı sayılmaz) başka şablon var mı.
export async function ozelSablonAdiVar(db: Db, ad: string, haricId: number | null): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM bildirim_eposta_ozel_sablon WHERE lower(btrim(ad)) = lower(btrim($1)) AND id IS DISTINCT FROM $2', [ad, haricId])) !== null;
}
// Ad çakışırsa null (tekil dizin; eşzamanlı ekleme de buraya düşer).
export async function ozelSablonEkle(db: Db, ad: string, s: SablonYazimi, kisiId: number): Promise<number | null> {
  const r = await db.tek<{ id: number }>(
    `INSERT INTO bildirim_eposta_ozel_sablon (ad, simge, konu_kalibi, baslik_kalibi, govde, tablo_alanlari, dugme_yazisi, onay_dugmesi, alt_bilgi, serit, logo, degistiren_kisi_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT DO NOTHING RETURNING id`,
    [ad, ...icerikDegerleri(s), kisiId],
  );
  return r?.id ?? null;
}
export async function ozelSablonDegistir(db: Db, id: number, ad: string, s: SablonYazimi, surum: number, kisiId: number): Promise<boolean> {
  return (await db.tek(
    `UPDATE bildirim_eposta_ozel_sablon SET ad = $3, simge = $4, konu_kalibi = $5, baslik_kalibi = $6, govde = $7, tablo_alanlari = $8,
            dugme_yazisi = $9, onay_dugmesi = $10, alt_bilgi = $11, serit = $12, logo = $13, degistiren_kisi_id = $14, degistirildi = now(), surum = surum + 1
      WHERE id = $1 AND surum = $2 RETURNING 1`,
    [id, surum, ad, ...icerikDegerleri(s), kisiId],
  )) !== null;
}
// Silinen şablonu kullanan olaylar konularının şablonuna döner (yabancı anahtar ON DELETE SET NULL).
export async function ozelSablonSil(db: Db, id: number, surum: number): Promise<boolean> {
  return (await db.tek('DELETE FROM bildirim_eposta_ozel_sablon WHERE id = $1 AND surum = $2 RETURNING 1', [id, surum])) !== null;
}

export type YeniEposta = {
  kisiId: number | null; bildirimId: number | null; tur: string; onem: string; baslik: string; kayitNo: string | null; yol: string | null;
  gecikmeGunu: number | null; istasyon: string | null; kademe: 0 | 1; ozet: boolean; zamani: string | null;
} & ToplantiAlanlari;
// 3448 (ADR 0015 md 6 eki): yalnız toplantı türlerinde dolu; öteki türlerde hepsi null.
export interface ToplantiAlanlari { kayitBasligi: string | null; zamanAraligi: string | null; yer: string | null; duzenleyen: string | null }
export async function epostaKuyrugaYaz(db: Db, satirlar: readonly YeniEposta[]): Promise<void> {
  if (satirlar.length === 0) return;
  await db.sorgu(
    `INSERT INTO bildirim_eposta_kuyrugu (kisi_id, bildirim_id, tur, onem, baslik, kayit_no, yol, gecikme_gunu, istasyon, kademe, ozet, zamani,
                                          kayit_basligi, zaman_araligi, yer, duzenleyen)
     SELECT k.kisi_id, k.bildirim_id, k.tur, k.onem, k.baslik, k.kayit_no, k.yol, k.gecikme_gunu, k.istasyon, k.kademe, k.ozet, COALESCE(k.zamani, now()),
            k.kayit_basligi, k.zaman_araligi, k.yer, k.duzenleyen
       FROM jsonb_to_recordset($1::jsonb) AS k(kisi_id int, bildirim_id int, tur text, onem text, baslik text, kayit_no text, yol text,
            gecikme_gunu int, istasyon text, kademe int, ozet boolean, zamani timestamptz, kayit_basligi text, zaman_araligi text, yer text, duzenleyen text)`,
    [JSON.stringify(satirlar.map((s) => ({
      kisi_id: s.kisiId, bildirim_id: s.bildirimId, tur: s.tur, onem: s.onem, baslik: s.baslik, kayit_no: s.kayitNo, yol: s.yol,
      gecikme_gunu: s.gecikmeGunu, istasyon: s.istasyon, kademe: s.kademe, ozet: s.ozet, zamani: s.zamani,
      kayit_basligi: s.kayitBasligi, zaman_araligi: s.zamanAraligi, yer: s.yer, duzenleyen: s.duzenleyen,
    })))],
  );
}

export type KuyrukSatiri = ToplantiAlanlari & {
  id: number; kisiId: number | null; bildirimId: number | null; tur: string; onem: 'bilgi' | 'uyari' | 'acil'; baslik: string;
  kayitNo: string | null; yol: string | null; gecikmeGunu: number | null; istasyon: string | null; olayZamani: string;
  kademe: number; tekrarNo: number; ozet: boolean; deneme: number;
  // Kaynak bildirimin durumu; kaynaksız satırda null.
  kaynak: { sinif: BildirimSinifi; okundu: string | null; arsivlendi: string | null; yapildi: string | null } | null;
};
// Zamanı gelen satırlar kilitlenir ve 10 dakika ileri itilir: gönderim transaction dışında sürerken başka tur aynı satırı almaz,
// süreç düşerse satır 10 dakika sonra yeniden denenir.
// `bekleme`: true kademe beklemelerini (kişisiz), false kişi satırlarını alır.
export function epostaSiradakiler(db: Db, ozet: boolean, sinir: number, bekleme: boolean): Promise<KuyrukSatiri[]> {
  return db.sorgu<KuyrukSatiri>(
    `WITH secilen AS (
       SELECT id FROM bildirim_eposta_kuyrugu WHERE ozet = $1 AND (kisi_id IS NULL) = $3 AND zamani <= now()
        ORDER BY zamani, id LIMIT $2 FOR UPDATE SKIP LOCKED
     ), itilen AS (
       UPDATE bildirim_eposta_kuyrugu q SET zamani = now() + interval '10 minutes' FROM secilen WHERE q.id = secilen.id RETURNING q.*
     )
     SELECT q.id, q.kisi_id AS "kisiId", q.bildirim_id AS "bildirimId", q.tur, q.onem, q.baslik, q.kayit_no AS "kayitNo", q.yol,
            q.gecikme_gunu AS "gecikmeGunu", q.istasyon, ${zamanMetni('q.olay_zamani')} AS "olayZamani", q.kademe, q.tekrar_no AS "tekrarNo",
            q.ozet, q.deneme, q.kayit_basligi AS "kayitBasligi", q.zaman_araligi AS "zamanAraligi", q.yer, q.duzenleyen,
            CASE WHEN b.id IS NULL THEN NULL ELSE json_build_object('sinif', b.sinif, 'okundu', ${zamanMetni('b.okundu')},
              'arsivlendi', ${zamanMetni('b.arsivlendi')}, 'yapildi', ${zamanMetni('b.yapildi')}) END AS kaynak
       FROM itilen q LEFT JOIN bildirim_kaydi b ON b.id = q.bildirim_id
      ORDER BY q.kisi_id NULLS FIRST, q.id`,
    [ozet, sinir, bekleme],
  );
}

export async function epostaKuyruktanSil(db: Db, idler: readonly number[]): Promise<void> {
  if (idler.length > 0) await db.sorgu('DELETE FROM bildirim_eposta_kuyrugu WHERE id = ANY($1::int[])', [idler]);
}
export async function epostaErtele(db: Db, id: number, zamani: string, deneme: number, ozet: boolean): Promise<void> {
  await db.sorgu('UPDATE bildirim_eposta_kuyrugu SET zamani = $2, deneme = $3, ozet = $4 WHERE id = $1', [id, zamani, deneme, ozet]);
}
export async function epostaTekrarla(db: Db, id: number, zamani: string): Promise<void> {
  await db.sorgu('UPDATE bildirim_eposta_kuyrugu SET zamani = $2, deneme = 0, tekrar_no = tekrar_no + 1 WHERE id = $1', [id, zamani]);
}

export interface YeniDefterSatiri { kisiId: number | null; tur: string; baslik: string; kayitNo: string | null; sonuc: string; neden: string | null }
export async function epostaDefterineYaz(db: Db, satirlar: readonly YeniDefterSatiri[]): Promise<void> {
  if (satirlar.length === 0) return;
  await db.sorgu(
    `INSERT INTO bildirim_eposta_defteri (kisi_id, tur, baslik, kayit_no, sonuc, neden)
     SELECT k.kisi_id, k.tur, k.baslik, k.kayit_no, k.sonuc, k.neden
       FROM jsonb_to_recordset($1::jsonb) AS k(kisi_id int, tur text, baslik text, kayit_no text, sonuc text, neden text)`,
    [JSON.stringify(satirlar.map((s) => ({ kisi_id: s.kisiId, tur: s.tur, baslik: s.baslik, kayit_no: s.kayitNo, sonuc: s.sonuc, neden: s.neden })))],
  );
}

export interface DefterSatiri { id: number; zaman: string; kisiId: number | null; tur: string; baslik: string; kayitNo: string | null; sonuc: string; neden: string | null }
export async function epostaDefterSayisi(db: Db, sonuc: string | null): Promise<number> {
  const r = await db.tek<{ toplam: number }>('SELECT count(*)::int AS toplam FROM bildirim_eposta_defteri WHERE $1::text IS NULL OR sonuc = $1', [sonuc]);
  return r?.toplam ?? 0;
}
export function epostaDefteri(db: Db, sonuc: string | null, dilim: Dilim): Promise<DefterSatiri[]> {
  return db.sorgu<DefterSatiri>(
    `SELECT id, ${zamanMetni('zaman')} AS zaman, kisi_id AS "kisiId", tur, baslik, kayit_no AS "kayitNo", sonuc, neden
       FROM bildirim_eposta_defteri WHERE $1::text IS NULL OR sonuc = $1 ORDER BY zaman DESC, id DESC LIMIT $2 OFFSET $3`,
    [sonuc, dilim.sinir, dilim.atla],
  );
}

// Kişiye bugün (tesis günü başından beri) giden e-posta sayısı; günlük sınır için.
export async function epostaBugunGidenler(db: Db, kisiIdleri: readonly number[], gunBasi: string): Promise<Map<number, number>> {
  if (kisiIdleri.length === 0) return new Map();
  const r = await db.sorgu<{ kisiId: number; sayi: number }>(
    `SELECT kisi_id AS "kisiId", count(*)::int AS sayi FROM bildirim_eposta_defteri
      WHERE sonuc = 'gonderildi' AND kisi_id = ANY($1::int[]) AND zaman >= $2 GROUP BY kisi_id`, [kisiIdleri, gunBasi],
  );
  return new Map(r.map((x) => [x.kisiId, x.sayi]));
}

export async function epostaSayaclari(db: Db): Promise<{ kuyrukta: number; son24Gonderilen: number; son24Hata: number; sonGonderim: string | null }> {
  const r = await db.tek<{ kuyrukta: number; son24Gonderilen: number; son24Hata: number; sonGonderim: string | null }>(
    `SELECT (SELECT count(*)::int FROM bildirim_eposta_kuyrugu WHERE kisi_id IS NOT NULL) AS kuyrukta,
            (SELECT count(*)::int FROM bildirim_eposta_defteri WHERE sonuc = 'gonderildi' AND zaman > now() - interval '24 hours') AS "son24Gonderilen",
            (SELECT count(*)::int FROM bildirim_eposta_defteri WHERE sonuc = 'gonderilemedi' AND zaman > now() - interval '24 hours') AS "son24Hata",
            (SELECT ${zamanMetni('max(zaman)')} FROM bildirim_eposta_defteri WHERE sonuc = 'gonderildi') AS "sonGonderim"`,
  );
  return r ?? { kuyrukta: 0, son24Gonderilen: 0, son24Hata: 0, sonGonderim: null };
}
