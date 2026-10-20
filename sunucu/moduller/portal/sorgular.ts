import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { DepoBelgesi, Veri } from './kurallar.ts';

// Müşteri ve Tedarikçi Portalı belge deposunun SQL'i. Sürüm tek sayaçtan gelir; silme de sayacı ilerletir (değişiklik damgası).

const BELGE_SUTUNLARI = 'yol, kimlik, veri, surum';

export async function koleksiyonBelgeleri(db: Db, ust: string): Promise<DepoBelgesi[]> {
  return db.sorgu<DepoBelgesi>(`SELECT ${BELGE_SUTUNLARI} FROM portal_belge WHERE ust = $1 ORDER BY kimlik`, [ust]);
}

export async function belgeGetir(db: Db, yol: string): Promise<DepoBelgesi | null> {
  return db.tek<DepoBelgesi>(`SELECT ${BELGE_SUTUNLARI} FROM portal_belge WHERE yol = $1`, [yol]);
}

export interface KilitliBelge extends DepoBelgesi { kilitSahibi: string | null; kilitBitis: number | null }

// Yazmadan önce satırı kilitler: aynı belgeye eşzamanlı birleştirme ve sürüm denetimi sırayla koşar.
export async function belgeKilitle(db: Db, yol: string): Promise<KilitliBelge | null> {
  return db.tek<KilitliBelge>(
    `SELECT ${BELGE_SUTUNLARI}, kilit_sahibi AS "kilitSahibi",
            (extract(epoch FROM kilit_bitis) * 1000)::bigint AS "kilitBitis"
       FROM portal_belge WHERE yol = $1 FOR UPDATE`,
    [yol],
  );
}

export async function belgeYaz(db: Db, g: { yol: string; ust: string; kimlik: string; veri: Veri; kisiId: number }): Promise<DepoBelgesi> {
  const satir = await db.tek<DepoBelgesi>(
    `INSERT INTO portal_belge (yol, ust, kimlik, veri, surum, olusturan_kisi_id, guncelleyen_kisi_id)
     VALUES ($1, $2, $3, $4::jsonb, nextval('portal_surum'), $5, $5)
     ON CONFLICT (yol) DO UPDATE
       SET veri = EXCLUDED.veri, surum = EXCLUDED.surum, guncelleyen_kisi_id = $5, guncellendi = now()
     RETURNING ${BELGE_SUTUNLARI}`,
    [g.yol, g.ust, g.kimlik, JSON.stringify(g.veri), g.kisiId],
  );
  if (satir === null) throw new Error('Belge yazılamadı.');
  return satir;
}

export async function belgeSil(db: Db, yol: string): Promise<boolean> {
  const silinen = await db.sorgu<{ yol: string }>('DELETE FROM portal_belge WHERE yol = $1 RETURNING yol', [yol]);
  if (silinen.length > 0) await db.tek('SELECT nextval(\'portal_surum\')');
  return silinen.length > 0;
}

export async function kilitYaz(db: Db, yol: string, sahip: string, sureMs: number): Promise<{ surum: number; bitis: string }> {
  const satir = await db.tek<{ surum: number; bitis: string }>(
    `UPDATE portal_belge
        SET kilit_sahibi = $2, kilit_bitis = now() + ($3::int * interval '1 millisecond')
      WHERE yol = $1
      RETURNING surum, ${zamanMetni('kilit_bitis')} AS bitis`,
    [yol, sahip, sureMs],
  );
  if (satir === null) throw new Error('Kilit yazılamadı.');
  return satir;
}

export async function kilitBitisi(db: Db, yol: string): Promise<string | null> {
  return (await db.tek<{ bitis: string | null }>(`SELECT ${zamanMetni('kilit_bitis')} AS bitis FROM portal_belge WHERE yol = $1`, [yol]))?.bitis ?? null;
}

export async function simdiMs(db: Db): Promise<number> {
  return (await db.tek<{ an: number }>('SELECT (extract(epoch FROM now()) * 1000)::bigint AS an'))?.an ?? 0;
}

// Sayaç hiç ilerlememişse 0.
export async function damga(db: Db): Promise<number> {
  return (await db.tek<{ damga: number }>(
    'SELECT CASE WHEN is_called THEN last_value ELSE 0 END AS damga FROM portal_surum',
  ))?.damga ?? 0;
}

export async function varOlanYollar(db: Db, yollar: readonly string[]): Promise<string[]> {
  if (yollar.length === 0) return [];
  return (await db.sorgu<{ yol: string }>('SELECT yol FROM portal_belge WHERE yol = ANY($1::text[])', [yollar])).map((s) => s.yol);
}

export async function ekEkle(db: Db, g: { ad: string; tur: string; icerik: Buffer; kisiId: number }): Promise<{ id: string; ad: string; tur: string; boyut: number }> {
  const satir = await db.tek<{ id: string; ad: string; tur: string; boyut: number }>(
    `INSERT INTO portal_ek (id, ad, tur, boyut, icerik, yukleyen_kisi_id)
     VALUES (replace(gen_random_uuid()::text, '-', ''), $1, $2, $3, $4, $5)
     RETURNING id, ad, tur, boyut`,
    [g.ad, g.tur, g.icerik.length, g.icerik, g.kisiId],
  );
  if (satir === null) throw new Error('Ek yazılamadı.');
  return satir;
}

export async function ekGetir(db: Db, id: string): Promise<{ id: string; ad: string; tur: string; boyut: number; icerik: Buffer } | null> {
  return db.tek('SELECT id, ad, tur, boyut, icerik FROM portal_ek WHERE id = $1', [id]);
}

export async function onekliBelgeVarMi(db: Db, ust: string, onek: string): Promise<boolean> {
  return (await db.tek<{ var: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM portal_belge WHERE ust = $1 AND starts_with(kimlik, $2)) AS var', [ust, onek],
  ))?.var ?? false;
}

// ---- Logo gönderim sırası (kart #941).

export interface LogoSirasi { id: number; belgeYol: string; teklifSurumu: number | null }
export interface LogoSiparisSirasi { id: number; belgeYol: string; teklifKayitNo: string; teklifRefleri: Record<string, unknown> }

// Aynı iş ikinci kez eklenmez; var olanın kimliği döner.
export async function logoSirasinaEkle(db: Db, g: { tur: 'teklif' | 'siparis'; belgeYol: string; teklifSurumu: number | null; teklifId: number | null }): Promise<number> {
  const yeni = await db.tek<{ id: number }>(
    `INSERT INTO portal_logo_gonderim (tur, belge_yol, teklif_surumu, teklif_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT ON CONSTRAINT portal_logo_gonderim_tek DO NOTHING RETURNING id`,
    [g.tur, g.belgeYol, g.teklifSurumu, g.teklifId],
  );
  if (yeni !== null) return yeni.id;
  const var_ = await db.tek<{ id: number }>(
    'SELECT id FROM portal_logo_gonderim WHERE tur = $1 AND belge_yol = $2 AND teklif_surumu IS NOT DISTINCT FROM $3', [g.tur, g.belgeYol, g.teklifSurumu],
  );
  if (var_ === null) throw new Error('Logo sırası yazılamadı.');
  return var_.id;
}

// Bekleyen satır hatalıların önüne geçer: kalıcı reddedilen satırlar sınırı doldurup yeni teklifi bekletmez.
export async function logoyaGidecekTeklifSiralari(db: Db, sinir: number): Promise<LogoSirasi[]> {
  return db.sorgu<LogoSirasi>(
    `SELECT id, belge_yol AS "belgeYol", teklif_surumu AS "teklifSurumu" FROM portal_logo_gonderim
      WHERE tur = 'teklif' AND durum <> 'gonderildi' ORDER BY durum = 'hata', id LIMIT $1`,
    [sinir],
  );
}

// Sipariş ancak teklifi Logo'da açıldıktan sonra gider.
export async function logoyaGidecekSiparisSiralari(db: Db, sinir: number): Promise<LogoSiparisSirasi[]> {
  return db.sorgu<LogoSiparisSirasi>(
    `SELECT s.id, s.belge_yol AS "belgeYol", t.logo_kayit_no AS "teklifKayitNo", t.satir_refleri AS "teklifRefleri"
       FROM portal_logo_gonderim s JOIN portal_logo_gonderim t ON t.id = s.teklif_id
      WHERE s.tur = 'siparis' AND s.durum <> 'gonderildi' AND t.durum = 'gonderildi' ORDER BY s.durum = 'hata', s.id LIMIT $1`,
    [sinir],
  );
}

// Başka bir Logo kaydıyla gönderilmiş satır yeniden yazılmaz.
export async function logoBasarisiYaz(db: Db, tur: 'teklif' | 'siparis', id: number, kayitNo: string, refler: Record<string, string>): Promise<boolean> {
  return (await db.sorgu<{ id: number }>(
    `UPDATE portal_logo_gonderim
        SET durum = 'gonderildi', logo_kayit_no = $3, satir_refleri = $4::jsonb, hata = NULL, gonderildi = now()
      WHERE id = $1 AND tur = $2 AND (logo_kayit_no IS NULL OR logo_kayit_no = $3)
      RETURNING id`,
    [id, tur, kayitNo, JSON.stringify(refler)],
  )).length > 0;
}

export async function logoHatasiYaz(db: Db, tur: 'teklif' | 'siparis', id: number, hata: string): Promise<void> {
  await db.sorgu(
    `UPDATE portal_logo_gonderim SET durum = 'hata', hata = left($3, 2000)
      WHERE id = $1 AND tur = $2 AND durum <> 'gonderildi' AND hata IS DISTINCT FROM left($3, 2000)`,
    [id, tur, hata],
  );
}

export async function talepNoVarMi(db: Db, no: string): Promise<boolean> {
  return (await db.tek<{ var: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM portal_belge WHERE ust = 'requests' AND veri->>'no' = $1) AS var`, [no],
  ))?.var ?? false;
}

// ---- Siparişler bağı (soru 148): Portal talebinin Siparişler'deki teklifi.

export async function siparisBagiYaz(db: Db, belgeYol: string, teklifId: number): Promise<void> {
  await db.sorgu('INSERT INTO portal_siparis_bagi (belge_yol, teklif_id) VALUES ($1, $2)', [belgeYol, teklifId]);
}

export async function siparisBagi(db: Db, belgeYol: string): Promise<{ teklifId: number; siparisId: number | null } | null> {
  return db.tek<{ teklifId: number; siparisId: number | null }>(
    'SELECT teklif_id AS "teklifId", siparis_id AS "siparisId" FROM portal_siparis_bagi WHERE belge_yol = $1', [belgeYol],
  );
}

export async function siparisBaglari(db: Db, belgeYollari: readonly string[]): Promise<Map<string, number>> {
  if (belgeYollari.length === 0) return new Map();
  const satirlar = await db.sorgu<{ yol: string; teklifId: number }>(
    'SELECT belge_yol AS yol, teklif_id AS "teklifId" FROM portal_siparis_bagi WHERE belge_yol = ANY($1::text[])', [belgeYollari],
  );
  return new Map(satirlar.map((s) => [s.yol, s.teklifId]));
}

export async function siparisBagla(db: Db, belgeYol: string, siparisId: number, siparisYol: string): Promise<void> {
  await db.sorgu('UPDATE portal_siparis_bagi SET siparis_id = $2, siparis_yol = $3 WHERE belge_yol = $1', [belgeYol, siparisId, siparisYol]);
}

export async function talepYolu(db: Db, no: string): Promise<string | null> {
  return (await db.tek<{ yol: string }>("SELECT yol FROM portal_belge WHERE ust = 'requests' AND veri->>'no' = $1 ORDER BY yol LIMIT 1", [no]))?.yol ?? null;
}
