import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';

export interface DegisiklikSatiri {
  koleksiyon: string;
  kimlik: string;
  govde: Record<string, unknown> | null;
  surum: number;
}

// Yazanlar sırayla yazar: sürüm sırası işlenme sırasıyla aynı kalır, okuyan bir sürümü atlayıp sonrakini görmez. Okuma kilitlenmez.
export async function yazmaKilidi(db: Db): Promise<void> {
  await db.sorgu('LOCK TABLE kalite_merkezi_belge IN SHARE ROW EXCLUSIVE MODE');
}

export function degisiklikler(db: Db, sonra: number): Promise<DegisiklikSatiri[]> {
  return db.sorgu(
    'SELECT koleksiyon, kimlik, govde, surum FROM kalite_merkezi_belge WHERE surum > $1 ORDER BY surum',
    [sonra],
  );
}

export async function sonSurum(db: Db): Promise<number> {
  const satir = await db.tek<{ surum: number }>('SELECT coalesce(max(surum), 0)::int8 AS surum FROM kalite_merkezi_belge');
  return satir?.surum ?? 0;
}

// Kaydın şimdiki gövdesi; olmayan ya da silinmiş kayıtta null.
export async function kayitGovdesi(db: Db, koleksiyon: string, kimlik: string): Promise<Record<string, unknown> | null> {
  const satir = await db.tek<{ govde: Record<string, unknown> | null }>(
    'SELECT govde FROM kalite_merkezi_belge WHERE koleksiyon = $1 AND kimlik = $2',
    [koleksiyon, kimlik],
  );
  return satir?.govde ?? null;
}

export async function doluMu(db: Db, koleksiyon: string, kimlik: string): Promise<boolean> {
  const satir = await db.tek<{ dolu: boolean }>(
    'SELECT govde IS NOT NULL AS dolu FROM kalite_merkezi_belge WHERE koleksiyon = $1 AND kimlik = $2',
    [koleksiyon, kimlik],
  );
  return satir?.dolu ?? false;
}

// Koşulsuz yazma yalnız yedekten geri yüklemenindir; kullanıcı yazması beklenen sürümle yazar (yeniYaz, surumluYaz).
export async function yaz(db: Db, koleksiyon: string, kimlik: string, govde: Record<string, unknown>, kisiId: number): Promise<number> {
  const satir = await db.tek<{ surum: number }>(
    `INSERT INTO kalite_merkezi_belge (koleksiyon, kimlik, govde, degistiren_id) VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (koleksiyon, kimlik) DO UPDATE
       SET govde = EXCLUDED.govde, surum = nextval('kalite_merkezi_surum'), degistiren_id = EXCLUDED.degistiren_id, degisti = now()
     RETURNING surum`,
    [koleksiyon, kimlik, JSON.stringify(govde), kisiId],
  );
  if (satir === null) throw new Error(`Kalite Merkezi kaydı yazılamadı: ${koleksiyon}/${kimlik}`);
  return satir.surum;
}

// Kayıt yoksa ya da silinmişse yazar; dolu kayıt varsa satır döndürmez (başkası arada açtı).
export async function yeniYaz(db: Db, koleksiyon: string, kimlik: string, govde: Record<string, unknown>, kisiId: number): Promise<number | null> {
  const satir = await db.tek<{ surum: number }>(
    `INSERT INTO kalite_merkezi_belge (koleksiyon, kimlik, govde, degistiren_id) VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (koleksiyon, kimlik) DO UPDATE
       SET govde = EXCLUDED.govde, surum = nextval('kalite_merkezi_surum'), degistiren_id = EXCLUDED.degistiren_id, degisti = now()
       WHERE kalite_merkezi_belge.govde IS NULL
     RETURNING surum`,
    [koleksiyon, kimlik, JSON.stringify(govde), kisiId],
  );
  return satir?.surum ?? null;
}

// Dolu kaydın sürümü beklenen sürümse yazar; değilse satır döndürmez.
export async function surumluYaz(
  db: Db, koleksiyon: string, kimlik: string, govde: Record<string, unknown>, kisiId: number, beklenen: number,
): Promise<number | null> {
  const satir = await db.tek<{ surum: number }>(
    `UPDATE kalite_merkezi_belge SET govde = $3::jsonb, surum = nextval('kalite_merkezi_surum'), degistiren_id = $4, degisti = now()
      WHERE koleksiyon = $1 AND kimlik = $2 AND govde IS NOT NULL AND surum = $5
      RETURNING surum`,
    [koleksiyon, kimlik, JSON.stringify(govde), kisiId, beklenen],
  );
  return satir?.surum ?? null;
}

export async function satirVarMi(db: Db, koleksiyon: string, kimlik: string): Promise<boolean> {
  const satir = await db.tek<{ var: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM kalite_merkezi_belge WHERE koleksiyon = $1 AND kimlik = $2) AS var',
    [koleksiyon, kimlik],
  );
  return satir?.var ?? false;
}

// Silinen kaydın satırı gövdesiz kalır; olmayan kayıt için satır açılmaz. Yalnız beklenen sürümdeki dolu kayıt silinir.
export async function sil(db: Db, koleksiyon: string, kimlik: string, kisiId: number, beklenen: number): Promise<number | null> {
  const satir = await db.tek<{ surum: number }>(
    `UPDATE kalite_merkezi_belge SET govde = NULL, surum = nextval('kalite_merkezi_surum'), degistiren_id = $3, degisti = now()
      WHERE koleksiyon = $1 AND kimlik = $2 AND govde IS NOT NULL AND surum = $4
      RETURNING surum`,
    [koleksiyon, kimlik, kisiId, beklenen],
  );
  return satir?.surum ?? null;
}

// Değişiklik izi dışında, verilen sürümden sonra yazılmamış dolu kayıtları siler (yedekten geri yüklemenin son adımı).
export async function izDisiniSil(db: Db, kisiId: number, enCokSurum: number): Promise<void> {
  await db.sorgu(
    `UPDATE kalite_merkezi_belge SET govde = NULL, surum = nextval('kalite_merkezi_surum'), degistiren_id = $1, degisti = now()
      WHERE koleksiyon <> 'iz' AND govde IS NOT NULL AND surum <= $2`,
    [kisiId, enCokSurum],
  );
}

// Örnek veri (kart #906): örnek kayıtların kimliği ORN- önekiyle başlar.
export async function ornekKaydiVarMi(db: Db): Promise<boolean> {
  const satir = await db.tek<{ var: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM kalite_merkezi_belge WHERE kimlik LIKE 'ORN-%' AND govde IS NOT NULL) AS var",
  );
  return satir?.var ?? false;
}

export async function acikKayitSayisi(db: Db, koleksiyon: string, kapaliDurum: string): Promise<number> {
  const satir = await db.tek<{ sayi: number }>(
    "SELECT count(*)::int AS sayi FROM kalite_merkezi_belge WHERE koleksiyon = $1 AND govde IS NOT NULL AND coalesce(govde->>'durum', '') <> $2",
    [koleksiyon, kapaliDurum],
  );
  return satir?.sayi ?? 0;
}

// Silinmiş kaydın gövdesi null olduğundan onayı da yoktur.
export function onayiOlanlar(db: Db, koleksiyon: string, onay: string): Promise<{ kimlik: string; kod: string | null; ad: string }[]> {
  return db.sorgu(
    `SELECT kimlik, nullif(btrim(govde->>'kod'), '') AS kod, btrim(coalesce(govde->>'ad', '')) AS ad
     FROM kalite_merkezi_belge WHERE koleksiyon = $1 AND govde->>'onay' = $2 ORDER BY kimlik`,
    [koleksiyon, onay],
  );
}

export async function karantinaYaz(db: Db, ncrKimlik: string, stokHareketiId: number, kisiId: number): Promise<void> {
  await db.sorgu('INSERT INTO kalite_merkezi_karantina (ncr_kimlik, stok_hareketi_id, kisi_id) VALUES ($1, $2, $3)', [ncrKimlik, stokHareketiId, kisiId]);
}

export async function ilkParcaKarariYaz(db: Db, uretimEmriId: number, karar: 'onay' | 'ret', adet: number, kisiId: number): Promise<void> {
  await db.sorgu('INSERT INTO kalite_merkezi_ilk_parca_karari (uretim_emri_id, karar, adet, kisi_id) VALUES ($1, $2, $3, $4)', [uretimEmriId, karar, adet, kisiId]);
}

// Emir başına son karar; aynı anda verilen iki kararda sonra yazılan kazanır.
export function ilkParcaSonKararlari(db: Db, uretimEmriIdler: readonly number[]): Promise<{ uretimEmriId: number; karar: 'onay' | 'ret'; zaman: string; kisiId: number | null }[]> {
  return db.sorgu(
    `SELECT DISTINCT ON (uretim_emri_id) uretim_emri_id AS "uretimEmriId", karar, to_json(zaman) #>> '{}' AS zaman, kisi_id AS "kisiId"
     FROM kalite_merkezi_ilk_parca_karari WHERE uretim_emri_id = ANY($1::int[]) ORDER BY uretim_emri_id, zaman DESC, id DESC`,
    [[...uretimEmriIdler]],
  );
}

// Kaydın emir alanı uygulamada elle yazılır; kırpılarak eşlenir.
export function emirMuayeneleri(db: Db, emirNolari: readonly string[]): Promise<{ emirNo: string; govde: Record<string, unknown> }[]> {
  return db.sorgu(
    `SELECT btrim(govde->>'emir') AS "emirNo", govde FROM kalite_merkezi_belge
     WHERE koleksiyon = 'insp' AND govde IS NOT NULL AND btrim(govde->>'emir') = ANY($1::text[]) ORDER BY surum`,
    [[...emirNolari]],
  );
}

export function kayitGovdeleri(db: Db, koleksiyon: string, kimlikler: readonly string[]): Promise<{ kimlik: string; govde: Record<string, unknown> }[]> {
  return db.sorgu(
    'SELECT kimlik, govde FROM kalite_merkezi_belge WHERE koleksiyon = $1 AND govde IS NOT NULL AND kimlik = ANY($2::text[])',
    [koleksiyon, [...kimlikler]],
  );
}

// Koleksiyonun dolu kayıtları (silinmişlerin gövdesi null'dır, gelmez).
export function koleksiyonKayitlari(db: Db, koleksiyon: string): Promise<{ kimlik: string; govde: Record<string, unknown> }[]> {
  return db.sorgu(
    'SELECT kimlik, govde FROM kalite_merkezi_belge WHERE koleksiyon = $1 AND govde IS NOT NULL ORDER BY kimlik',
    [koleksiyon],
  );
}

// Karantina defterinin bütün satırları, yazan NCR'nin bugünkü gövdesiyle (silinmiş NCR'de null).
export async function karantinaDefteri(db: Db): Promise<{ hareketId: number; ncrKimlik: string; govde: Record<string, unknown> | null }[]> {
  const satirlar = await db.sorgu<{ hareketId: number; ncrKimlik: string; govde: Record<string, unknown> | null }>(
    `SELECT k.stok_hareketi_id AS "hareketId", k.ncr_kimlik AS "ncrKimlik", b.govde FROM kalite_merkezi_karantina k
       LEFT JOIN kalite_merkezi_belge b ON b.koleksiyon = 'ncr' AND b.kimlik = k.ncr_kimlik`,
  );
  return satirlar.map((s) => ({ hareketId: Number(s.hareketId), ncrKimlik: s.ncrKimlik, govde: s.govde }));
}

// Verilen NCR dışındaki açık (silinmemiş, kapanmamış) NCR'lerin lot ve emir anahtarları; ikisi de boş olan alınmaz.
export function acikNcrAnahtarlari(db: Db, haricNcr: string, kapali: string): Promise<{ lotNo: string | null; emirNo: string | null }[]> {
  return db.sorgu(
    `SELECT nullif(btrim(govde->>'lot'), '') AS "lotNo", nullif(btrim(govde->>'emir'), '') AS "emirNo" FROM kalite_merkezi_belge
      WHERE koleksiyon = 'ncr' AND kimlik <> $1 AND govde IS NOT NULL AND btrim(coalesce(govde->>'durum', '')) <> $2
        AND (nullif(btrim(govde->>'lot'), '') IS NOT NULL OR nullif(btrim(govde->>'emir'), '') IS NOT NULL)`,
    [haricNcr, kapali],
  );
}

export interface GecmisSatiri {
  surum: number;
  govde: Record<string, unknown>;
  yazanId: number;
  yazildi: string;
  degistirenId: number | null;
  degisti: string;
}

// Kaydın önceki hâlleri, yeniden eskiye (sürüm sayacı genel ve artandır). Geçmiş yalnız eklenir; burada yalnız okunur.
export function kayitGecmisi(db: Db, koleksiyon: string, kimlik: string, sinir: number): Promise<GecmisSatiri[]> {
  return db.sorgu(
    `SELECT surum::int8 AS surum, govde, yazan_id AS "yazanId", ${zamanMetni('yazildi')} AS yazildi,
            degistiren_id AS "degistirenId", ${zamanMetni('degisti')} AS degisti
       FROM kalite_merkezi_belge_gecmisi WHERE koleksiyon = $1 AND kimlik = $2 ORDER BY surum DESC, id DESC LIMIT $3`,
    [koleksiyon, kimlik, sinir],
  );
}
