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

// 236 a: tedarikçi kayıtlarının firma bağı ve onayı. Firma kimliği yalnız pozitif tam sayıysa okunur (sunucu yazarken denetler).
export function tedarikciKayitlari(db: Db, koleksiyon: string): Promise<{ firmaId: number | null; kod: string | null; ad: string; onay: string | null }[]> {
  return db.sorgu(
    `SELECT CASE WHEN jsonb_typeof(govde->'firmaId') = 'number' AND (govde->>'firmaId') ~ '^[1-9][0-9]{0,9}$' AND (govde->>'firmaId')::bigint <= 2147483647
                 THEN (govde->>'firmaId')::int END AS "firmaId",
            nullif(btrim(govde->>'kod'), '') AS kod, btrim(coalesce(govde->>'ad', '')) AS ad, govde->>'onay' AS onay
     FROM kalite_merkezi_belge WHERE koleksiyon = $1 AND govde IS NOT NULL ORDER BY kimlik`,
    [koleksiyon],
  );
}

export async function karantinaYaz(db: Db, ncrKimlik: string, stokHareketiId: number, kisiId: number): Promise<void> {
  await db.sorgu('INSERT INTO kalite_merkezi_karantina (ncr_kimlik, stok_hareketi_id, kisi_id) VALUES ($1, $2, $3)', [ncrKimlik, stokHareketiId, kisiId]);
}

// isEmriId: kararın ait olduğu adım (744 a); iş emirsiz emirde boş.
export async function ilkParcaKarariYaz(db: Db, uretimEmriId: number, karar: 'onay' | 'ret', adet: number, kisiId: number, isEmriId: number | null): Promise<void> {
  await db.sorgu(
    'INSERT INTO kalite_merkezi_ilk_parca_karari (uretim_emri_id, karar, adet, kisi_id, is_emri_id) VALUES ($1, $2, $3, $4, $5)',
    [uretimEmriId, karar, adet, kisiId, isEmriId],
  );
}

// 744 a: adım başına son karar; iş emirsiz eski karar hiçbir adıma sayılmaz (756 a).
export function adimIlkParcaSonKararlari(db: Db, isEmriIdler: readonly number[]): Promise<{ isEmriId: number; karar: 'onay' | 'ret'; zaman: string; kisiId: number | null }[]> {
  return db.sorgu(
    `SELECT DISTINCT ON (is_emri_id) is_emri_id AS "isEmriId", karar, to_json(zaman) #>> '{}' AS zaman, kisi_id AS "kisiId"
     FROM kalite_merkezi_ilk_parca_karari WHERE is_emri_id = ANY($1::int[]) ORDER BY is_emri_id, zaman DESC, id DESC`,
    [[...isEmriIdler]],
  );
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

export function koleksiyonlarinKayitlari(db: Db, koleksiyonlar: readonly string[]): Promise<{ koleksiyon: string; kimlik: string; govde: Record<string, unknown> }[]> {
  return db.sorgu(
    'SELECT koleksiyon, kimlik, govde FROM kalite_merkezi_belge WHERE koleksiyon = ANY($1::text[]) AND govde IS NOT NULL ORDER BY koleksiyon, kimlik',
    [koleksiyonlar],
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

// Koleksiyonda bu numarayı taşıyan dolu kayıt var mı (ortak sayaç dolu numarayı atlar).
export async function noVarMi(db: Db, koleksiyon: string, no: string): Promise<boolean> {
  const satir = await db.tek<{ var: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM kalite_merkezi_belge WHERE koleksiyon = $1 AND govde IS NOT NULL AND btrim(govde->>'no') = $2) AS var`,
    [koleksiyon, no],
  );
  return satir?.var ?? false;
}

// Verilen kimliklerin dolu kayıtları; silinmiş ya da olmayan kimlik dönmez.
export function doluKayitlar(db: Db, koleksiyon: string, kimlikler: readonly string[]): Promise<{ kimlik: string; govde: Record<string, unknown> }[]> {
  return db.sorgu(
    'SELECT kimlik, govde FROM kalite_merkezi_belge WHERE koleksiyon = $1 AND kimlik = ANY($2::text[]) AND govde IS NOT NULL',
    [koleksiyon, [...kimlikler]],
  );
}

/* ---------------- stüdyo: resim, balon, numune planı, numune, ölçüm (595 1 b, 597 a, 600 a) ---------------- */

export interface ResimSatiri {
  id: number; malzemeNo: number; tur: 'resim' | 'model'; merkezBelgeId: number; ozet: string; ad: string; revizyon: string | null;
  aktif: boolean; surum: number; eklendi: string;
}
const RESIM_SUTUNLARI = `id, malzeme_no AS "malzemeNo", tur, merkez_belge_id AS "merkezBelgeId", ozet, ad, revizyon, aktif, surum,
  ${zamanMetni('eklendi')} AS eklendi`;

export function parcaResimleri(db: Db, malzemeNo: number): Promise<ResimSatiri[]> {
  return db.sorgu(`SELECT ${RESIM_SUTUNLARI} FROM kalite_merkezi_resim WHERE malzeme_no = $1 AND aktif ORDER BY id`, [malzemeNo]);
}

export function resim(db: Db, id: number): Promise<ResimSatiri | null> {
  return db.tek(`SELECT ${RESIM_SUTUNLARI} FROM kalite_merkezi_resim WHERE id = $1`, [id]);
}

// Aynı parçaya aynı belgenin aynı dosyası bir kez alınır: varsa var olan satır döner (yeniden almak yinelenen satır açmaz).
export async function resimEkle(
  db: Db, g: { malzemeNo: number; tur: 'resim' | 'model'; merkezBelgeId: number; ozet: string; ad: string; revizyon: string | null; kisiId: number },
): Promise<number> {
  const yeni = await db.tek<{ id: number }>(
    `INSERT INTO kalite_merkezi_resim (malzeme_no, tur, merkez_belge_id, ozet, ad, revizyon, ekleyen_id, guncelleyen_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     ON CONFLICT ON CONSTRAINT kalite_merkezi_resim_tekil DO NOTHING RETURNING id`,
    [g.malzemeNo, g.tur, g.merkezBelgeId, g.ozet, g.ad, g.revizyon, g.kisiId],
  );
  if (yeni) return yeni.id;
  const var_ = await db.tek<{ id: number }>(
    'SELECT id FROM kalite_merkezi_resim WHERE malzeme_no = $1 AND merkez_belge_id = $2 AND ozet = $3', [g.malzemeNo, g.merkezBelgeId, g.ozet],
  );
  return var_!.id;
}

export interface BalonSatiri {
  id: number; resimId: number; malzemeNo: number; no: number; nominal: string; tolerans: string | null; alt: string | null; ust: string | null;
  alet: string | null; siklik: string | null; kritik: boolean; yontem: 'cmm' | 'elle' | null; olcuAletiGerekir: boolean; tur: string | null;
  sayfa: number | null; x: number | null; y: number | null; yaziKutusu: number[] | null; yer: [number, number] | null; yerKipi: 'yakin' | 'serit' | null;
  surum: number;
}
const BALON_SUTUNLARI = `b.id, b.resim_id AS "resimId", r.malzeme_no AS "malzemeNo", b.no, b.nominal, b.tolerans, b.alt::text AS alt, b.ust::text AS ust,
  b.alet, b.siklik, b.kritik, b.yontem, b.olcu_aleti_gerekir AS "olcuAletiGerekir", b.tur, b.sayfa, b.x, b.y, b.yazi_kutusu AS "yaziKutusu",
  CASE WHEN b.yer_x IS NULL THEN NULL ELSE ARRAY[b.yer_x, b.yer_y] END AS yer, b.yer_kipi AS "yerKipi", b.surum`;

export function resimBalonlari(db: Db, resimIdler: readonly number[]): Promise<BalonSatiri[]> {
  return db.sorgu(
    `SELECT ${BALON_SUTUNLARI} FROM kalite_merkezi_balon b JOIN kalite_merkezi_resim r ON r.id = b.resim_id
      WHERE b.resim_id = ANY($1::int[]) AND b.aktif ORDER BY b.resim_id, b.no`,
    [resimIdler],
  );
}

// Yalnız etkin resmin etkin balonu: kaldırılan balona ölçüm ve numune girilmez.
export function etkinBalonlar(db: Db, idler: readonly number[]): Promise<BalonSatiri[]> {
  return db.sorgu(
    `SELECT ${BALON_SUTUNLARI} FROM kalite_merkezi_balon b JOIN kalite_merkezi_resim r ON r.id = b.resim_id
      WHERE b.id = ANY($1::int[]) AND b.aktif AND r.aktif ORDER BY b.id`,
    [idler],
  );
}

// Resmi, modeli ya da numune planı olan her parça; kaldırılmış resim ve balon sayılmaz, kuralı boş plan plan sayılmaz.
export function studyoOzetleri(db: Db): Promise<{ malzemeNo: number; resim: number; model: number; balon: number; numunePlani: number }[]> {
  return db.sorgu(
    `WITH r AS (SELECT id, malzeme_no, tur FROM kalite_merkezi_resim WHERE aktif),
          n AS (SELECT malzeme_no FROM kalite_merkezi_numune_plani WHERE jsonb_array_length(kurallar) > 0)
     SELECT p.malzeme_no AS "malzemeNo",
       (SELECT count(*)::int FROM r WHERE r.malzeme_no = p.malzeme_no AND r.tur = 'resim') AS resim,
       (SELECT count(*)::int FROM r WHERE r.malzeme_no = p.malzeme_no AND r.tur = 'model') AS model,
       (SELECT count(*)::int FROM kalite_merkezi_balon b JOIN r ON r.id = b.resim_id WHERE r.malzeme_no = p.malzeme_no AND b.aktif) AS balon,
       (SELECT count(*)::int FROM n WHERE n.malzeme_no = p.malzeme_no) AS "numunePlani"
     FROM (SELECT malzeme_no FROM r UNION SELECT malzeme_no FROM n) p ORDER BY p.malzeme_no`,
  );
}

export function numunePlanlari(db: Db, malzemeNo: number): Promise<{ opNo: number; kurallar: unknown; surum: number }[]> {
  return db.sorgu(
    'SELECT op_no AS "opNo", kurallar, surum FROM kalite_merkezi_numune_plani WHERE malzeme_no = $1 ORDER BY op_no', [malzemeNo],
  );
}

export interface NumuneSatiri {
  id: number; uretimEmriId: number; opNo: number; balonlar: number[]; kritik: boolean; neden: string; parcaSayisi: number | null;
  isteyenId: number; istendi: string; karar: 'onay' | 'ret' | 'sapma' | null; kararNotu: string | null; kararVerenId: number | null; kararZamani: string | null;
}
const NUMUNE_SECIMI = `SELECT n.id::int AS id, n.uretim_emri_id AS "uretimEmriId", n.op_no AS "opNo", n.balonlar, n.kritik, n.neden,
    n.parca_sayisi AS "parcaSayisi", n.isteyen_id AS "isteyenId", ${zamanMetni('n.istendi')} AS istendi,
    k.karar, k."not" AS "kararNotu", k.kisi_id AS "kararVerenId", ${zamanMetni('k.zaman')} AS "kararZamani"
  FROM kalite_merkezi_numune n LEFT JOIN kalite_merkezi_numune_karari k ON k.numune_id = n.id`;

export function numune(db: Db, id: number): Promise<NumuneSatiri | null> {
  return db.tek(`${NUMUNE_SECIMI} WHERE n.id = $1`, [id]);
}

// Kararsız numuneler eskiden yeniye; emir verilirse yalnız o emrin (kararlılar dahil) son numuneleri, yeniden eskiye.
export function acikNumuneler(db: Db, sinir: number): Promise<NumuneSatiri[]> {
  return db.sorgu(`${NUMUNE_SECIMI} WHERE k.numune_id IS NULL ORDER BY n.istendi, n.id LIMIT $1`, [sinir]);
}
export function emirNumuneleri(db: Db, uretimEmriId: number, sinir: number): Promise<NumuneSatiri[]> {
  return db.sorgu(`${NUMUNE_SECIMI} WHERE n.uretim_emri_id = $1 ORDER BY n.istendi DESC, n.id DESC LIMIT $2`, [uretimEmriId, sinir]);
}

export async function numuneEkle(
  db: Db, g: { uretimEmriId: number; opNo: number; balonlar: readonly number[]; kritik: boolean; neden: string; parcaSayisi: number | null; kisiId: number },
): Promise<number> {
  const r = await db.tek<{ id: number }>(
    `INSERT INTO kalite_merkezi_numune (uretim_emri_id, op_no, balonlar, kritik, neden, parca_sayisi, isteyen_id)
     VALUES ($1, $2, $3::int[], $4, $5, $6, $7) RETURNING id::int AS id`,
    [g.uretimEmriId, g.opNo, g.balonlar, g.kritik, g.neden, g.parcaSayisi, g.kisiId],
  );
  return r!.id;
}

// Numune satırı kilitlenir: aynı numuneye eşzamanlı iki karar ya da kararla yarışan ölçüm sırayla işlenir.
export async function numuneKilitle(db: Db, id: number): Promise<boolean> {
  return (await db.tek<{ id: number }>('SELECT id::int AS id FROM kalite_merkezi_numune WHERE id = $1 FOR UPDATE', [id])) !== null;
}

// Kararı olan numunede false döner (tek karar); kısıt yarışı da yakalar.
export async function numuneKarariYaz(db: Db, g: { numuneId: number; karar: 'onay' | 'ret' | 'sapma'; not: string | null; kisiId: number }): Promise<boolean> {
  const r = await db.tek<{ numuneId: number }>(
    `INSERT INTO kalite_merkezi_numune_karari (numune_id, karar, "not", kisi_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (numune_id) DO NOTHING RETURNING numune_id::int AS "numuneId"`,
    [g.numuneId, g.karar, g.not, g.kisiId],
  );
  return r !== null;
}

export interface OlcumSatiri {
  id: number; balonId: number; uretimEmriId: number; numuneId: number | null; deger: string | null; nitel: 'gecer' | 'gecmez' | null; uygun: boolean;
  kaynak: 'operator' | 'kalite' | 'cmm'; parcaSayisi: number | null; kisiId: number; zaman: string;
}
const OLCUM_SECIMI = `SELECT id::int AS id, balon_id AS "balonId", uretim_emri_id AS "uretimEmriId", numune_id::int AS "numuneId", deger::text AS deger, nitel, uygun,
    kaynak, parca_sayisi AS "parcaSayisi", kisi_id AS "kisiId", ${zamanMetni('zaman')} AS zaman FROM kalite_merkezi_olcum`;

export async function olcumleriEkle(
  db: Db, satirlar: readonly { balonId: number; uretimEmriId: number; numuneId: number | null; deger: string | null; nitel: string | null; uygun: boolean; kaynak: string; parcaSayisi: number | null; kisiId: number }[],
): Promise<number[]> {
  const idler: number[] = [];
  for (const s of satirlar) {
    const r = await db.tek<{ id: number }>(
      `INSERT INTO kalite_merkezi_olcum (balon_id, uretim_emri_id, numune_id, deger, nitel, uygun, kaynak, parca_sayisi, kisi_id)
       VALUES ($1, $2, $3, $4::numeric, $5, $6, $7, $8, $9) RETURNING id::int AS id`,
      [s.balonId, s.uretimEmriId, s.numuneId, s.deger, s.nitel, s.uygun, s.kaynak, s.parcaSayisi, s.kisiId],
    );
    idler.push(r!.id);
  }
  return idler;
}

export function numuneOlcumleri(db: Db, numuneIdler: readonly number[]): Promise<OlcumSatiri[]> {
  return db.sorgu(`${OLCUM_SECIMI} WHERE numune_id = ANY($1::bigint[]) ORDER BY zaman, id`, [numuneIdler]);
}
export function emirOlcumleri(db: Db, uretimEmriId: number, sinir: number): Promise<OlcumSatiri[]> {
  return db.sorgu(`${OLCUM_SECIMI} WHERE uretim_emri_id = $1 ORDER BY zaman DESC, id DESC LIMIT $2`, [uretimEmriId, sinir]);
}

/* ---------------- stüdyo yazma: resim alma ve kaldırma, kontrol planı, numune planı (603 a) ---------------- */

// Sürüm eşitse resmi kilitler ve sürümünü artırır; değilse (başkası değiştirdi ya da resim yok) false.
export async function resimSurumuArtir(db: Db, id: number, surum: number, kisiId: number): Promise<boolean> {
  const r = await db.tek<{ id: number }>(
    `UPDATE kalite_merkezi_resim SET surum = surum + 1, guncelleyen_id = $3, guncellendi = now()
      WHERE id = $1 AND surum = $2 RETURNING id`,
    [id, surum, kisiId],
  );
  return r !== null;
}

export async function resimKaldir(db: Db, id: number, surum: number, kisiId: number): Promise<boolean> {
  const r = await db.tek<{ id: number }>(
    `UPDATE kalite_merkezi_resim SET aktif = false, surum = surum + 1, guncelleyen_id = $3, guncellendi = now()
      WHERE id = $1 AND surum = $2 AND aktif RETURNING id`,
    [id, surum, kisiId],
  );
  return r !== null;
}

// Kaldırılmış aynı resim yeniden alınınca etkinleşir (balonları önceki haliyle geri gelir).
export async function resimEtkinlestir(db: Db, id: number, kisiId: number): Promise<void> {
  await db.sorgu(
    `UPDATE kalite_merkezi_resim SET aktif = true, surum = surum + 1, guncelleyen_id = $2, guncellendi = now() WHERE id = $1 AND NOT aktif`,
    [id, kisiId],
  );
}

// Kararı verilmemiş numunelerde istenen balonlar (resmin balonlarından).
export async function acikNumuneBalonlari(db: Db, resimId: number): Promise<number[]> {
  const r = await db.sorgu<{ id: number }>(
    `SELECT DISTINCT b.id FROM kalite_merkezi_balon b
       JOIN kalite_merkezi_numune n ON b.id = ANY(n.balonlar)
       LEFT JOIN kalite_merkezi_numune_karari k ON k.numune_id = n.id
      WHERE b.resim_id = $1 AND b.aktif AND k.numune_id IS NULL`,
    [resimId],
  );
  return r.map((x) => x.id);
}

export interface BalonYazimi {
  no: number; nominal: string; tolerans: string | null; alt: string | null; ust: string | null; alet: string | null; siklik: string | null;
  kritik: boolean; yontem: 'cmm' | 'elle' | null; olcuAletiGerekir: boolean; tur: string | null; sayfa: number | null; x: number | null; y: number | null;
  yaziKutusu: number[] | null; yer: readonly [number, number] | null; yerKipi: 'yakin' | 'serit' | null;
}
const balonDegerleri = (b: BalonYazimi) => [
  b.no, b.nominal, b.tolerans, b.alt, b.ust, b.alet, b.siklik, b.kritik, b.yontem, b.olcuAletiGerekir, b.tur, b.sayfa, b.x, b.y, b.yaziKutusu,
  b.yer?.[0] ?? null, b.yer?.[1] ?? null, b.yerKipi,
];

export async function balonlariKaldir(db: Db, idler: readonly number[], kisiId: number): Promise<void> {
  if (idler.length === 0) return;
  await db.sorgu(
    `UPDATE kalite_merkezi_balon SET aktif = false, surum = surum + 1, guncelleyen_id = $2, guncellendi = now() WHERE id = ANY($1::int[]) AND aktif`,
    [idler, kisiId],
  );
}

// Yalnız değişen balonun sürümü artar.
export async function balonGuncelle(db: Db, id: number, b: BalonYazimi, kisiId: number): Promise<void> {
  await db.sorgu(
    `UPDATE kalite_merkezi_balon SET no = $2, nominal = $3, tolerans = $4, alt = $5::numeric, ust = $6::numeric, alet = $7, siklik = $8, kritik = $9,
        yontem = $10, olcu_aleti_gerekir = $11, tur = $12, sayfa = $13, x = $14, y = $15, yazi_kutusu = $16::double precision[],
        yer_x = $17::double precision, yer_y = $18::double precision, yer_kipi = $19, surum = surum + 1, guncelleyen_id = $20, guncellendi = now()
      WHERE id = $1 AND aktif AND (no, nominal, tolerans, alt, ust, alet, siklik, kritik, yontem, olcu_aleti_gerekir, tur, sayfa, x, y, yazi_kutusu,
          yer_x, yer_y, yer_kipi)
        IS DISTINCT FROM ($2, $3, $4, $5::numeric, $6::numeric, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::double precision[],
          $17::double precision, $18::double precision, $19)`,
    [id, ...balonDegerleri(b), kisiId],
  );
}

export async function balonEkle(db: Db, resimId: number, b: BalonYazimi, kisiId: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO kalite_merkezi_balon (resim_id, no, nominal, tolerans, alt, ust, alet, siklik, kritik, yontem, olcu_aleti_gerekir, tur, sayfa, x, y,
        yazi_kutusu, yer_x, yer_y, yer_kipi, guncelleyen_id)
     VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::double precision[], $17::double precision,
        $18::double precision, $19, $20)`,
    [resimId, ...balonDegerleri(b), kisiId],
  );
}

// Yalnız balonun yeri değişir (913 a); sürüm tutmazsa (başkası değiştirdi) satır döner.
export async function balonYeriYaz(
  db: Db, id: number, surum: number, yer: readonly [number, number] | null, yerKipi: 'yakin' | 'serit' | null, kisiId: number,
): Promise<boolean> {
  const r = await db.sorgu<{ id: number }>(
    `UPDATE kalite_merkezi_balon SET yer_x = $3::double precision, yer_y = $4::double precision, yer_kipi = $5, surum = surum + 1,
        guncelleyen_id = $6, guncellendi = now()
      WHERE id = $1 AND surum = $2 AND aktif RETURNING id`,
    [id, surum, yer?.[0] ?? null, yer?.[1] ?? null, yerKipi, kisiId],
  );
  return r.length === 1;
}

// Parçanın etkin resimlerindeki etkin balon numaraları (numune kuralı bunlara bakar).
export async function parcaBalonNolari(db: Db, malzemeNo: number): Promise<number[]> {
  const r = await db.sorgu<{ no: number }>(
    `SELECT DISTINCT b.no FROM kalite_merkezi_balon b JOIN kalite_merkezi_resim r ON r.id = b.resim_id
      WHERE r.malzeme_no = $1 AND r.aktif AND b.aktif`,
    [malzemeNo],
  );
  return r.map((x) => x.no);
}

// Yeni plan sürümsüz eklenir (aynı anda iki yeni plandan biri çakışır); var olan plan yalnız aynı sürümle güncellenir.
export async function numunePlaniYaz(
  db: Db, g: { malzemeNo: number; opNo: number; kurallar: unknown; surum: number | null; kisiId: number },
): Promise<{ opNo: number; kurallar: unknown; surum: number } | null> {
  const metin = JSON.stringify(g.kurallar);
  if (g.surum === null) {
    return db.tek(
      `INSERT INTO kalite_merkezi_numune_plani (malzeme_no, op_no, kurallar, guncelleyen_id) VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (malzeme_no, op_no) DO NOTHING RETURNING op_no AS "opNo", kurallar, surum`,
      [g.malzemeNo, g.opNo, metin, g.kisiId],
    );
  }
  return db.tek(
    `UPDATE kalite_merkezi_numune_plani SET kurallar = $3::jsonb, surum = surum + 1, guncelleyen_id = $5, guncellendi = now()
      WHERE malzeme_no = $1 AND op_no = $2 AND surum = $4 RETURNING op_no AS "opNo", kurallar, surum`,
    [g.malzemeNo, g.opNo, metin, g.surum, g.kisiId],
  );
}

/* ---------------- kapanış maddeleri (1074 a) ---------------- */

// Emir başına numune ve ölçüm sayaçları; numunesi ve ölçümü olmayan emir dönmez.
export function emirOlcumSayaclari(
  db: Db, uretimEmriIdleri: readonly number[],
): Promise<{ uretimEmriId: number; numune: number; kararsiz: number; ret: number; olcum: number; uygunsuzOlcum: number }[]> {
  return db.sorgu(
    `WITH n AS (SELECT n.uretim_emri_id, count(*)::int AS numune, count(*) FILTER (WHERE k.numune_id IS NULL)::int AS kararsiz,
                       count(*) FILTER (WHERE k.karar = 'ret')::int AS ret
                  FROM kalite_merkezi_numune n LEFT JOIN kalite_merkezi_numune_karari k ON k.numune_id = n.id
                 WHERE n.uretim_emri_id = ANY($1::int[]) GROUP BY n.uretim_emri_id),
          o AS (SELECT uretim_emri_id, count(*)::int AS olcum, count(*) FILTER (WHERE NOT uygun)::int AS uygunsuz
                  FROM kalite_merkezi_olcum WHERE uretim_emri_id = ANY($1::int[]) GROUP BY uretim_emri_id)
     SELECT coalesce(n.uretim_emri_id, o.uretim_emri_id) AS "uretimEmriId", coalesce(n.numune, 0) AS numune, coalesce(n.kararsiz, 0) AS kararsiz,
            coalesce(n.ret, 0) AS ret, coalesce(o.olcum, 0) AS olcum, coalesce(o.uygunsuz, 0) AS "uygunsuzOlcum"
       FROM n FULL JOIN o ON o.uretim_emri_id = n.uretim_emri_id`,
    [uretimEmriIdleri],
  );
}

// Kuralı boş olmayan numune planı olan parçalar (boş plan plan sayılmaz).
export async function numunePlaniOlanParcalar(db: Db, malzemeNolar: readonly number[]): Promise<Set<number>> {
  const satirlar = await db.sorgu<{ malzemeNo: number }>(
    `SELECT DISTINCT malzeme_no AS "malzemeNo" FROM kalite_merkezi_numune_plani
      WHERE malzeme_no = ANY($1::int[]) AND jsonb_array_length(kurallar) > 0`,
    [malzemeNolar],
  );
  return new Set(satirlar.map((s) => s.malzemeNo));
}

// Emre kaynak bağıyla ya da emir alanındaki numarayla bağlı, silinmemiş NCR'ler; ayrıca kaynak bağı olmayan ve tanımı emir numarasıyla
// başlayan eski hatalı parça NCR'leri (eskiEmirNo dolu).
export function emreBagliNcrler(
  db: Db, uretimEmriIdleri: readonly number[], emirNolari: readonly string[], hatali: { kaynak: string; onek: string },
): Promise<{ kimlik: string; no: string; durum: string; kaynakEmirId: number | null; emirNo: string | null; eskiEmirNo: string | null }[]> {
  return db.sorgu(
    `WITH b AS (
       SELECT kimlik, govde, jsonb_typeof(govde->'kaynakEmirId') = 'number' AND (govde->>'kaynakEmirId')::numeric = ANY($1::numeric[]) AS bagli,
              CASE WHEN govde->'kaynakEmirId' IS NULL AND govde->>'kaynak' = $3 AND left(govde->>'tanim', length($4)) = $4
                   THEN split_part(substr(govde->>'tanim', length($4) + 1), ' OP ', 1) END AS eski
         FROM kalite_merkezi_belge WHERE koleksiyon = 'ncr' AND govde IS NOT NULL)
     SELECT kimlik, coalesce(nullif(btrim(govde->>'no'), ''), kimlik) AS no, coalesce(govde->>'durum', '') AS durum,
            CASE WHEN bagli THEN (govde->>'kaynakEmirId')::numeric::int END AS "kaynakEmirId",
            nullif(btrim(govde->>'emir'), '') AS "emirNo", CASE WHEN eski = ANY($2::text[]) THEN eski END AS "eskiEmirNo"
       FROM b WHERE bagli OR btrim(govde->>'emir') = ANY($2::text[]) OR eski = ANY($2::text[])`,
    [uretimEmriIdleri, emirNolari, hatali.kaynak, hatali.onek],
  );
}
