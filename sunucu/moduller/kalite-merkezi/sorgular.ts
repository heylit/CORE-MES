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
  sayfa: number | null; x: number | null; y: number | null; yaziKutusu: number[] | null; surum: number;
}
const BALON_SUTUNLARI = `b.id, b.resim_id AS "resimId", r.malzeme_no AS "malzemeNo", b.no, b.nominal, b.tolerans, b.alt::text AS alt, b.ust::text AS ust,
  b.alet, b.siklik, b.kritik, b.yontem, b.olcu_aleti_gerekir AS "olcuAletiGerekir", b.tur, b.sayfa, b.x, b.y, b.yazi_kutusu AS "yaziKutusu", b.surum`;

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
