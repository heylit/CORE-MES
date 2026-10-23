import type { Db } from '#cekirdek/db.ts';
import type { Bagimlilik, GerceklesenKaynagi, GerceklesenTuru, MakineKullanimi, RevizyonDurumu, RevizyonOzeti } from '#paylasilan/sozlesme/rota.ts';

// Zaman ISO 8601 metni olarak döner (sözleşme: zaman).
const ISO = (sutun: string) => `to_json(${sutun}) #>> '{}'`;

const OZET = `r.id, r.harf, r.durum, r.surum, r.aciklama, ${ISO('r.acilma')} AS acilma, ${ISO('r.onaylama')} AS onaylama,
  ${ISO('r.yururluge_alma')} AS "yururlugeAlma"`;

export interface RevizyonSatiri extends RevizyonOzeti {
  malzemeId: number;
  kaynakRevizyonId: number | null;
  kaynakHarf: string | null;
  acanKisiId: number;
  gonderenKisiId: number | null;
  gonderme: string | null;
  onaylayanKisiId: number | null;
  dortGozsuzOnay: boolean;
  yururlugeAlanKisiId: number | null;
  iptalEdenKisiId: number | null;
  iptalEtme: string | null;
  duzenleyenKisiIdleri: number[];
}

const SATIR = `${OZET}, r.malzeme_id AS "malzemeId", r.kaynak_revizyon_id AS "kaynakRevizyonId", k.harf AS "kaynakHarf",
  r.acan_kisi_id AS "acanKisiId", r.gonderen_kisi_id AS "gonderenKisiId", ${ISO('r.gonderme')} AS gonderme,
  r.onaylayan_kisi_id AS "onaylayanKisiId", r.dort_gozsuz_onay AS "dortGozsuzOnay",
  r.yururluge_alan_kisi_id AS "yururlugeAlanKisiId", r.iptal_eden_kisi_id AS "iptalEdenKisiId", ${ISO('r.iptal_etme')} AS "iptalEtme",
  COALESCE((SELECT array_agg(d.kisi_id ORDER BY d.kisi_id) FROM rota_revizyonu_duzenleyen d WHERE d.revizyon_id = r.id), '{}')
    AS "duzenleyenKisiIdleri"`;

export function revizyonOku(db: Db, id: number): Promise<RevizyonSatiri | null> {
  return db.tek<RevizyonSatiri>(`SELECT ${SATIR} FROM rota_revizyonu r LEFT JOIN rota_revizyonu k ON k.id = r.kaynak_revizyon_id WHERE r.id = $1`, [id]);
}

// Komut revizyonu satır kilidiyle okur: aynı revizyona gelen iki komut sırayla işlenir.
export function revizyonlariOku(db: Db, idler: readonly number[]): Promise<RevizyonSatiri[]> {
  return db.sorgu<RevizyonSatiri>(`SELECT ${SATIR} FROM rota_revizyonu r LEFT JOIN rota_revizyonu k ON k.id = r.kaynak_revizyon_id WHERE r.id = ANY($1::int[])`, [idler]);
}

export function revizyonKilitle(db: Db, id: number): Promise<RevizyonSatiri | null> {
  return db.tek<RevizyonSatiri>(
    `SELECT ${SATIR} FROM rota_revizyonu r LEFT JOIN rota_revizyonu k ON k.id = r.kaynak_revizyon_id WHERE r.id = $1 FOR UPDATE OF r`,
    [id],
  );
}

export function urunRevizyonlari(db: Db, malzemeId: number): Promise<RevizyonOzeti[]> {
  return db.sorgu<RevizyonOzeti>(`SELECT ${OZET} FROM rota_revizyonu r WHERE r.malzeme_id = $1 ORDER BY r.id`, [malzemeId]);
}

// Reçete ve Rota'nın bağlı durumu (kart #1184): iptal edilmeyen bütün revizyonlar; içerik ayrıca okunur.
export interface DurumRevizyonSatiri extends RevizyonOzeti { malzemeId: number }
export function iptalsizRevizyonlar(db: Db, malzemeId: number | null = null): Promise<DurumRevizyonSatiri[]> {
  return db.sorgu<DurumRevizyonSatiri>(
    `SELECT ${OZET}, r.malzeme_id AS "malzemeId" FROM rota_revizyonu r WHERE r.durum <> 'iptal' AND ($1::int IS NULL OR r.malzeme_id = $1) ORDER BY r.malzeme_id, r.id`,
    [malzemeId],
  );
}

export interface RotaOzetSatiri {
  malzemeId: number;
  yururlukteId: number | null;
  yururlukteHarf: string | null;
  acikId: number | null;
  acikHarf: string | null;
  acikDurum: RevizyonDurumu | null;
  revizyonSayisi: number;
}

export function rotaOzetleri(db: Db): Promise<RotaOzetSatiri[]> {
  return db.sorgu<RotaOzetSatiri>(
    `SELECT r.malzeme_id AS "malzemeId",
            max(r.id) FILTER (WHERE r.durum = 'yururlukte') AS "yururlukteId",
            max(r.harf) FILTER (WHERE r.durum = 'yururlukte') AS "yururlukteHarf",
            max(r.id) FILTER (WHERE r.durum IN ('taslak', 'onay_bekliyor')) AS "acikId",
            max(r.harf) FILTER (WHERE r.durum IN ('taslak', 'onay_bekliyor')) AS "acikHarf",
            max(r.durum) FILTER (WHERE r.durum IN ('taslak', 'onay_bekliyor')) AS "acikDurum",
            count(*)::int AS "revizyonSayisi"
       FROM rota_revizyonu r
      GROUP BY r.malzeme_id
      ORDER BY r.malzeme_id`,
  );
}

// rotaOzetleri ile aynı gruplama: açık revizyon ve durumu ürün başına onunla aynı seçilir, ürün listesi taşınmaz.
// Revizyonun malzemesi yabancı anahtarla katalogda vardır; listedeki ürün eşlemesi satır düşürmez.
export async function revizyonSayilari(db: Db): Promise<{ acikRevizyon: number; onayBekleyen: number }> {
  const satir = await db.tek<{ acikRevizyon: number; onayBekleyen: number }>(
    `SELECT count(*) FILTER (WHERE g.acik_durum IS NOT NULL)::int AS "acikRevizyon",
            count(*) FILTER (WHERE g.acik_durum = 'onay_bekliyor')::int AS "onayBekleyen"
       FROM (SELECT max(r.durum) FILTER (WHERE r.durum IN ('taslak', 'onay_bekliyor')) AS acik_durum
               FROM rota_revizyonu r
              GROUP BY r.malzeme_id) g`,
  );
  if (satir === null) throw new Error('Toplama sorgusu satır döndürmedi.');
  return satir;
}

export async function rotasiOlanMalzemeler(db: Db): Promise<number[]> {
  return (await db.sorgu<{ id: number }>('SELECT DISTINCT malzeme_id AS id FROM rota_revizyonu')).map((s) => s.id);
}

export async function harfler(db: Db, malzemeId: number): Promise<string[]> {
  return (await db.sorgu<{ harf: string }>('SELECT harf FROM rota_revizyonu WHERE malzeme_id = $1', [malzemeId])).map((s) => s.harf);
}

export function acikRevizyon(db: Db, malzemeId: number): Promise<{ id: number; durum: RevizyonDurumu } | null> {
  return db.tek("SELECT id, durum FROM rota_revizyonu WHERE malzeme_id = $1 AND durum IN ('taslak', 'onay_bekliyor')", [malzemeId]);
}

export async function acikRevizyonVarMi(db: Db, malzemeId: number): Promise<boolean> {
  return (await db.tek<{ var: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM rota_revizyonu WHERE malzeme_id = $1 AND durum IN ('taslak', 'onay_bekliyor')) AS var",
    [malzemeId],
  ))?.var === true;
}

// Emir listesi "Rev N" ve "rota değişti": emrin kaynak revizyonunun harfi ve ürünün yürürlükteki revizyonu.
export function revizyonKunyeleri(db: Db, idler: readonly number[]): Promise<{ id: number; harf: string; malzemeId: number; yururlukteId: number | null }[]> {
  return db.sorgu(
    `SELECT r.id, r.harf, r.malzeme_id AS "malzemeId",
       (SELECT y.id FROM rota_revizyonu y WHERE y.malzeme_id = r.malzeme_id AND y.durum = 'yururlukte') AS "yururlukteId"
     FROM rota_revizyonu r WHERE r.id = ANY($1::int[]) ORDER BY r.id`,
    [idler],
  );
}

/* ---------------- şablonlar (#698) ---------------- */

export interface SablonSatiri { id: number; ad: string; varsayilan: boolean; surum: number }
export interface SablonAdimSatiri { sablonId: number; sira: number; operasyonTipiId: number; ad: string }

export function sablonlar(db: Db): Promise<SablonSatiri[]> {
  return db.sorgu<SablonSatiri>('SELECT id, ad, varsayilan, surum FROM rota_sablonu ORDER BY varsayilan DESC, ad, id');
}

export function sablonAdimlari(db: Db, idler: readonly number[]): Promise<SablonAdimSatiri[]> {
  return db.sorgu<SablonAdimSatiri>(
    `SELECT sablon_id AS "sablonId", sira, operasyon_tipi_id AS "operasyonTipiId", ad FROM rota_sablon_adimi
      WHERE sablon_id = ANY($1::int[]) ORDER BY sablon_id, sira`,
    [idler],
  );
}

export async function varsayilanSablonId(db: Db): Promise<number | null> {
  return (await db.tek<{ id: number }>('SELECT id FROM rota_sablonu WHERE varsayilan'))?.id ?? null;
}

export function sablonKilitle(db: Db, id: number): Promise<SablonSatiri | null> {
  return db.tek<SablonSatiri>('SELECT id, ad, varsayilan, surum FROM rota_sablonu WHERE id = $1 FOR UPDATE', [id]);
}

export async function sablonEkle(db: Db, ad: string): Promise<number> {
  return (await db.tek<{ id: number }>('INSERT INTO rota_sablonu (ad) VALUES ($1) RETURNING id', [ad]))!.id;
}

export async function sablonAdiYaz(db: Db, id: number, ad: string, surum: number): Promise<boolean> {
  return (await db.tek('UPDATE rota_sablonu SET ad = $2, surum = surum + 1 WHERE id = $1 AND surum = $3 RETURNING id', [id, ad, surum])) !== null;
}

export async function sablonAdimlariniYaz(db: Db, id: number, adimlar: readonly { operasyonTipiId: number; ad: string }[]): Promise<void> {
  await db.sorgu('DELETE FROM rota_sablon_adimi WHERE sablon_id = $1', [id]);
  if (adimlar.length === 0) return;
  await db.sorgu(
    `INSERT INTO rota_sablon_adimi (sablon_id, sira, operasyon_tipi_id, ad)
     SELECT $1, s.sira, s.tip, s.ad FROM unnest($2::int[], $3::text[]) WITH ORDINALITY AS s (tip, ad, sira)`,
    [id, adimlar.map((a) => a.operasyonTipiId), adimlar.map((a) => a.ad)],
  );
}

// Önce eskisi kalkar: tek varsayılan dizini ikisini aynı anda görmez.
export async function varsayilanYap(db: Db, id: number): Promise<void> {
  await db.sorgu('UPDATE rota_sablonu SET varsayilan = false, surum = surum + 1 WHERE varsayilan AND id <> $1', [id]);
  await db.sorgu('UPDATE rota_sablonu SET varsayilan = true, surum = surum + 1 WHERE id = $1 AND NOT varsayilan', [id]);
}

export async function sablonSil(db: Db, id: number): Promise<void> {
  await db.sorgu('DELETE FROM rota_sablon_adimi WHERE sablon_id = $1', [id]);
  await db.sorgu('DELETE FROM rota_sablonu WHERE id = $1', [id]);
}

export async function yururluktekiRevizyonId(db: Db, malzemeId: number): Promise<number | null> {
  return (await db.tek<{ id: number }>("SELECT id FROM rota_revizyonu WHERE malzeme_id = $1 AND durum = 'yururlukte'", [malzemeId]))?.id ?? null;
}

// Ürün başına yürürlükteki revizyon, tek sorguda; yürürlükte revizyonu olmayan ürün eşlemde yoktur.
export async function yururluktekiRevizyonIdleri(db: Db, malzemeIdleri: readonly number[]): Promise<Map<number, number>> {
  if (malzemeIdleri.length === 0) return new Map();
  const satirlar = await db.sorgu<{ m: number; id: number }>(
    "SELECT malzeme_id::int AS m, id::int AS id FROM rota_revizyonu WHERE durum = 'yururlukte' AND malzeme_id = ANY($1::bigint[])", [malzemeIdleri]);
  return new Map(satirlar.map((s) => [s.m, s.id]));
}

// Verilen ürünlerden yürürlükte rotası olanlar ve o rotaların mamul olmayan dahil bütün bileşenleri.
export function yururluktekiBilesenler(db: Db, malzemeIdleri: readonly number[]): Promise<{ urunId: number; revizyonId: number; bilesenId: number | null }[]> {
  return db.sorgu(
    `SELECT r.malzeme_id AS "urunId", r.id AS "revizyonId", b.malzeme_id AS "bilesenId"
       FROM rota_revizyonu r
       LEFT JOIN rota_adimi a ON a.revizyon_id = r.id
       LEFT JOIN rota_bileseni b ON b.adim_id = a.id
      WHERE r.durum = 'yururlukte' AND r.malzeme_id = ANY($1::bigint[])`,
    [malzemeIdleri],
  );
}

export async function revizyonEkle(
  db: Db, g: { malzemeId: number; malzemeTuru: 'mamul' | 'yarimamul'; harf: string; acanKisiId: number; kaynakRevizyonId: number | null },
): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    'INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id, kaynak_revizyon_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [g.malzemeId, g.malzemeTuru, g.harf, g.acanKisiId, g.kaynakRevizyonId],
  );
  return satir!.id;
}

/* ---------------- içerik ---------------- */

// Kaynak: makine, kişi ya da istasyon (sütunlardan biri doludur); hepsi boşsa null. Adımda dördüncü kaynak fason firmadır.
export interface Kaynak { tur: 'makine' | 'kisi' | 'istasyon'; id: number }
export interface AdimKaynagi { tur: 'makine' | 'kisi' | 'istasyon' | 'fason'; id: number }
interface KaynakSutunlari { makineId: number | null; kisiId: number | null; istasyonId: number | null }
const kaynakCoz = (r: KaynakSutunlari): Kaynak | null =>
  r.makineId !== null ? { tur: 'makine', id: r.makineId } : r.kisiId !== null ? { tur: 'kisi', id: r.kisiId }
    : r.istasyonId !== null ? { tur: 'istasyon', id: r.istasyonId } : null;
const adimKaynagiCoz = (r: KaynakSutunlari & { fasonFirmaId: number | null }): AdimKaynagi | null =>
  kaynakCoz(r) ?? (r.fasonFirmaId !== null ? { tur: 'fason', id: r.fasonFirmaId } : null);
const makineSutunu = (k: AdimKaynagi | null) => (k?.tur === 'makine' ? k.id : null);
const kisiSutunu = (k: AdimKaynagi | null) => (k?.tur === 'kisi' ? k.id : null);
const istasyonSutunu = (k: AdimKaynagi | null) => (k?.tur === 'istasyon' ? k.id : null);
const fasonSutunu = (k: AdimKaynagi | null) => (k?.tur === 'fason' ? k.id : null);

export interface AdimSatiri {
  id: number;
  opNo: number;
  sira: number;
  operasyonTipiId: number;
  ad: string;
  kaynak: AdimKaynagi | null;
  ayarSuresiDk: string | null;
  birimSureDk: string | null;
  islemSuresiDk: string | null;
  degisimSuresiDk: string | null;
  terminGun: number | null;
  bagimlilik: Bagimlilik;
  devirAdedi: number | null;
  firePayiYuzde: string;
  makineKullanimi: MakineKullanimi;
  enKucukParca: number | null;
  yenidenAyar: boolean;
}

export interface AdaySatiri {
  adimId: number; kaynak: Kaynak; ayarSuresiDk: string | null; birimSureDk: string | null; islemSuresiDk: string | null; degisimSuresiDk: string | null;
}
export interface BilesenSatiri { adimId: number; malzemeId: number; miktar: string; fireYuzde: string }
export interface YanUrunSatiri { adimId: number; malzemeId: number; miktar: string }

export interface Icerik {
  adimlar: AdimSatiri[];
  adaylar: AdaySatiri[];
  bilesenler: BilesenSatiri[];
  yanUrunler: YanUrunSatiri[];
}

export async function icerikOku(db: Db, revizyonId: number): Promise<Icerik> {
  return (await iceriklerOku(db, [revizyonId])).get(revizyonId) ?? { adimlar: [], adaylar: [], bilesenler: [], yanUrunler: [] };
}

// Birden çok revizyonun içeriği, revizyon sayısından bağımsız dört sorguyla; içeriği olmayan revizyon haritada yer almaz.
export async function iceriklerOku(db: Db, revizyonIdleri: readonly number[]): Promise<Map<number, Icerik>> {
  const adimHam = await db.sorgu<Omit<AdimSatiri, 'kaynak'> & KaynakSutunlari & { fasonFirmaId: number | null; revizyonId: number }>(
    `SELECT revizyon_id AS "revizyonId", id, op_no AS "opNo", sira, operasyon_tipi_id AS "operasyonTipiId", ad, makine_id AS "makineId", kisi_id AS "kisiId",
            istasyon_id AS "istasyonId", fason_firma_id AS "fasonFirmaId", ayar_suresi_dk AS "ayarSuresiDk", birim_sure_dk AS "birimSureDk", termin_gun AS "terminGun",
            islem_suresi_dk AS "islemSuresiDk", degisim_suresi_dk AS "degisimSuresiDk",
            bagimlilik, devir_adedi AS "devirAdedi",
            fire_payi_yuzde AS "firePayiYuzde", makine_kullanimi AS "makineKullanimi", en_kucuk_parca AS "enKucukParca",
            yeniden_ayar AS "yenidenAyar"
       FROM rota_adimi WHERE revizyon_id = ANY($1::int[]) ORDER BY revizyon_id, sira`,
    [revizyonIdleri],
  );
  const sonuc = new Map<number, Icerik>();
  const adimRevizyonu = new Map<number, Icerik>();
  for (const { revizyonId, makineId, kisiId, istasyonId, fasonFirmaId, ...a } of adimHam) {
    let icerik = sonuc.get(revizyonId);
    if (!icerik) sonuc.set(revizyonId, icerik = { adimlar: [], adaylar: [], bilesenler: [], yanUrunler: [] });
    icerik.adimlar.push({ ...a, kaynak: adimKaynagiCoz({ makineId, kisiId, istasyonId, fasonFirmaId }) });
    adimRevizyonu.set(a.id, icerik);
  }
  const kimlikler = [...adimRevizyonu.keys()];
  const adaylar = (await db.sorgu<Omit<AdaySatiri, 'kaynak'> & KaynakSutunlari>(
    `SELECT adim_id AS "adimId", makine_id AS "makineId", kisi_id AS "kisiId", istasyon_id AS "istasyonId", ayar_suresi_dk AS "ayarSuresiDk", birim_sure_dk AS "birimSureDk",
            islem_suresi_dk AS "islemSuresiDk", degisim_suresi_dk AS "degisimSuresiDk"
       FROM rota_aday_kaynagi WHERE adim_id = ANY($1::int[]) ORDER BY adim_id, id`,
    [kimlikler],
  )).map(({ makineId, kisiId, istasyonId, ...x }) => ({ ...x, kaynak: kaynakCoz({ makineId, kisiId, istasyonId })! }));
  const bilesenler = await db.sorgu<BilesenSatiri>(
    `SELECT adim_id AS "adimId", malzeme_id AS "malzemeId", miktar, fire_yuzde AS "fireYuzde"
       FROM rota_bileseni WHERE adim_id = ANY($1::int[]) ORDER BY adim_id, id`,
    [kimlikler],
  );
  const yanUrunler = await db.sorgu<YanUrunSatiri>(
    `SELECT adim_id AS "adimId", malzeme_id AS "malzemeId", miktar FROM rota_yan_urunu WHERE adim_id = ANY($1::int[]) ORDER BY adim_id, id`,
    [kimlikler],
  );
  for (const x of adaylar) adimRevizyonu.get(x.adimId)!.adaylar.push(x);
  for (const x of bilesenler) adimRevizyonu.get(x.adimId)!.bilesenler.push(x);
  for (const x of yanUrunler) adimRevizyonu.get(x.adimId)!.yanUrunler.push(x);
  return sonuc;
}

// Taslağın içeriği bütün olarak yeniden yazılır; önce bağlı satırlar, sonra adımlar silinir (tetikleyici taslağı denetler).
export async function icerikSil(db: Db, revizyonId: number): Promise<void> {
  const adim = 'SELECT id FROM rota_adimi WHERE revizyon_id = $1';
  await db.sorgu(`DELETE FROM rota_aday_kaynagi WHERE adim_id IN (${adim})`, [revizyonId]);
  await db.sorgu(`DELETE FROM rota_bileseni WHERE adim_id IN (${adim})`, [revizyonId]);
  await db.sorgu(`DELETE FROM rota_yan_urunu WHERE adim_id IN (${adim})`, [revizyonId]);
  await db.sorgu('DELETE FROM rota_adimi WHERE revizyon_id = $1', [revizyonId]);
}

export interface AdimYazimi {
  opNo: number;
  sira: number;
  operasyonTipiId: number;
  ad: string;
  kaynak: AdimKaynagi | null;
  ayarSuresiDk: number | string | null;
  birimSureDk: number | string | null;
  islemSuresiDk: number | string | null;
  degisimSuresiDk: number | string | null;
  terminGun: number | null;
  bagimlilik: Bagimlilik;
  devirAdedi: number | null;
  firePayiYuzde: number | string;
  makineKullanimi: MakineKullanimi;
  enKucukParca: number | null;
  yenidenAyar: boolean;
  adaylar: readonly {
    kaynak: Kaynak; ayarSuresiDk: number | string | null; birimSureDk: number | string | null; islemSuresiDk: number | string | null;
    degisimSuresiDk: number | string | null;
  }[];
  bilesenler: readonly { malzemeId: number; miktar: number | string; fireYuzde: number | string }[];
  yanUrunler: readonly { malzemeId: number; miktar: number | string }[];
}

export async function adimYaz(db: Db, revizyonId: number, malzemeId: number, a: AdimYazimi): Promise<void> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO rota_adimi (revizyon_id, malzeme_id, op_no, sira, operasyon_tipi_id, ad, makine_id, kisi_id, fason_firma_id, ayar_suresi_dk,
                             birim_sure_dk, termin_gun, bagimlilik, devir_adedi, fire_payi_yuzde, makine_kullanimi, en_kucuk_parca, yeniden_ayar,
                             islem_suresi_dk, degisim_suresi_dk, istasyon_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) RETURNING id`,
    [revizyonId, malzemeId, a.opNo, a.sira, a.operasyonTipiId, a.ad, makineSutunu(a.kaynak), kisiSutunu(a.kaynak), fasonSutunu(a.kaynak),
      a.ayarSuresiDk, a.birimSureDk, a.terminGun, a.bagimlilik, a.devirAdedi, a.firePayiYuzde, a.makineKullanimi, a.enKucukParca, a.yenidenAyar,
      a.islemSuresiDk, a.degisimSuresiDk, istasyonSutunu(a.kaynak)],
  );
  const adimId = satir!.id;
  if (a.adaylar.length) {
    await db.sorgu(
      `INSERT INTO rota_aday_kaynagi (adim_id, makine_id, kisi_id, ayar_suresi_dk, birim_sure_dk, islem_suresi_dk, degisim_suresi_dk, istasyon_id)
       SELECT $1, * FROM unnest($2::int[], $3::int[], $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[], $8::int[])`,
      [adimId, a.adaylar.map((x) => makineSutunu(x.kaynak)), a.adaylar.map((x) => kisiSutunu(x.kaynak)), a.adaylar.map((x) => x.ayarSuresiDk),
        a.adaylar.map((x) => x.birimSureDk), a.adaylar.map((x) => x.islemSuresiDk), a.adaylar.map((x) => x.degisimSuresiDk),
        a.adaylar.map((x) => istasyonSutunu(x.kaynak))],
    );
  }
  if (a.bilesenler.length) {
    await db.sorgu(
      `INSERT INTO rota_bileseni (adim_id, malzeme_id, miktar, fire_yuzde)
       SELECT $1, * FROM unnest($2::int[], $3::numeric[], $4::numeric[])`,
      [adimId, a.bilesenler.map((x) => x.malzemeId), a.bilesenler.map((x) => x.miktar), a.bilesenler.map((x) => x.fireYuzde)],
    );
  }
  if (a.yanUrunler.length) {
    await db.sorgu(
      `INSERT INTO rota_yan_urunu (adim_id, malzeme_id, miktar) SELECT $1, * FROM unnest($2::int[], $3::numeric[])`,
      [adimId, a.yanUrunler.map((x) => x.malzemeId), a.yanUrunler.map((x) => x.miktar)],
    );
  }
}

/* ---------------- OP numarası ---------------- */

export async function kullanilmisOpNolari(db: Db, malzemeId: number): Promise<number[]> {
  return (await db.sorgu<{ opNo: number }>('SELECT op_no AS "opNo" FROM rota_op_numarasi WHERE malzeme_id = $1', [malzemeId])).map((s) => s.opNo);
}

// Ürüne aynı numara iki kez kaydolmaz; aynı ürünün başka revizyonundan gelen numara zaten kayıtlıdır.
export async function opNolariKaydet(db: Db, malzemeId: number, opNolari: readonly number[], revizyonId: number): Promise<void> {
  if (opNolari.length === 0) return;
  await db.sorgu(
    `INSERT INTO rota_op_numarasi (malzeme_id, op_no, ilk_revizyon_id) SELECT $1, n, $3 FROM unnest($2::int[]) AS n
     ON CONFLICT (malzeme_id, op_no) DO NOTHING`,
    [malzemeId, opNolari, revizyonId],
  );
}

// Numaranın ürünün herhangi bir revizyonunda (iptal dahil) adımı var mı.
export async function opNoAdimiVarMi(db: Db, malzemeId: number, opNo: number): Promise<boolean> {
  return (await db.tek<{ var: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM rota_adimi WHERE malzeme_id = $1 AND op_no = $2) AS var',
    [malzemeId, opNo],
  ))?.var === true;
}

/* ---------------- durum yazıları ---------------- */

export async function kaydetYaz(db: Db, id: number, aciklama: string | null, kisiId: number): Promise<number> {
  await db.sorgu(
    `INSERT INTO rota_revizyonu_duzenleyen (revizyon_id, kisi_id) VALUES ($1, $2) ON CONFLICT (revizyon_id, kisi_id) DO NOTHING`,
    [id, kisiId],
  );
  return surumArtir(db, id, 'aciklama = $2', [aciklama]);
}

// Taslağı içerik dışında değiştirmeden düzenleyen olarak işaretler ve sürümü artırır (ölçüm kabulü, 169 c).
export async function duzenlemeYaz(db: Db, id: number, kisiId: number): Promise<number> {
  await db.sorgu(
    `INSERT INTO rota_revizyonu_duzenleyen (revizyon_id, kisi_id) VALUES ($1, $2) ON CONFLICT (revizyon_id, kisi_id) DO NOTHING`,
    [id, kisiId],
  );
  return surumArtir(db, id, '', []);
}

async function surumArtir(db: Db, id: number, ek: string, degerler: readonly unknown[]): Promise<number> {
  const satir = await db.tek<{ surum: number }>(
    `UPDATE rota_revizyonu SET surum = surum + 1${ek ? `, ${ek}` : ''} WHERE id = $1 RETURNING surum`,
    [id, ...degerler],
  );
  return satir!.surum;
}

export const gonderYaz = (db: Db, id: number, kisiId: number): Promise<number> =>
  surumArtir(db, id, "durum = 'onay_bekliyor', gonderen_kisi_id = $2, gonderme = now()", [kisiId]);

export const geriGonderYaz = (db: Db, id: number): Promise<number> => surumArtir(db, id, "durum = 'taslak'", []);

export const iptalYaz = (db: Db, id: number, kisiId: number): Promise<number> =>
  surumArtir(db, id, "durum = 'iptal', iptal_eden_kisi_id = $2, iptal_etme = now()", [kisiId]);

export const onaylaYaz = (db: Db, id: number, kisiId: number, dortGozsuz: boolean): Promise<number> =>
  surumArtir(db, id, "durum = 'onayli', onaylayan_kisi_id = $2, onaylama = now(), dort_gozsuz_onay = $3", [kisiId, dortGozsuz]);

// Yürürlükteki revizyon önce onaylıya döner: ürün başına tek yürürlükte revizyon dizinle korunur.
export async function yururluktekiniOnayliYap(db: Db, malzemeId: number): Promise<void> {
  await db.sorgu("UPDATE rota_revizyonu SET durum = 'onayli', surum = surum + 1 WHERE malzeme_id = $1 AND durum = 'yururlukte'", [malzemeId]);
}

export const yururlugeAlYaz = (db: Db, id: number, kisiId: number): Promise<number> =>
  surumArtir(db, id, "durum = 'yururlukte', yururluge_alan_kisi_id = $2, yururluge_alma = now()", [kisiId]);

/* ---------------- talimat ---------------- */

export interface TalimatSatiri { surum: number; metin: string; yazanKisiId: number; yazma: string }

export function talimatlar(db: Db, malzemeId: number, opNo: number): Promise<TalimatSatiri[]> {
  return db.sorgu<TalimatSatiri>(
    `SELECT surum, metin, yazan_kisi_id AS "yazanKisiId", ${ISO('yazma')} AS yazma
       FROM rota_talimati WHERE malzeme_id = $1 AND op_no = $2 ORDER BY surum DESC`,
    [malzemeId, opNo],
  );
}

export function gecerliTalimatlar(db: Db, malzemeId: number): Promise<{ opNo: number; surum: number; metin: string }[]> {
  return db.sorgu(
    `SELECT DISTINCT ON (op_no) op_no AS "opNo", surum, metin FROM rota_talimati WHERE malzeme_id = $1 ORDER BY op_no, surum DESC`,
    [malzemeId],
  );
}

export function urunlerinGecerliTalimatlari(db: Db, malzemeIdleri: readonly number[]): Promise<{ malzemeId: number; opNo: number; surum: number }[]> {
  return db.sorgu(
    `SELECT DISTINCT ON (malzeme_id, op_no) malzeme_id AS "malzemeId", op_no AS "opNo", surum
       FROM rota_talimati WHERE malzeme_id = ANY($1::int[]) ORDER BY malzeme_id, op_no, surum DESC`,
    [malzemeIdleri],
  );
}

export async function talimatEkle(db: Db, malzemeId: number, opNo: number, surum: number, metin: string, kisiId: number): Promise<void> {
  await db.sorgu(
    'INSERT INTO rota_talimati (malzeme_id, op_no, surum, metin, yazan_kisi_id) VALUES ($1, $2, $3, $4, $5)',
    [malzemeId, opNo, surum, metin, kisiId],
  );
}

// Operasyon tipinin kullanımı: yürürlükteki ve açık (taslak, onay bekleyen) revizyonlardaki adım sayısı.
export function tipKullanimi(db: Db): Promise<{ tipId: number; adet: number }[]> {
  return db.sorgu(
    `SELECT a.operasyon_tipi_id AS "tipId", count(*)::int AS adet
       FROM rota_adimi a JOIN rota_revizyonu r ON r.id = a.revizyon_id
      WHERE r.durum IN ('yururlukte', 'taslak', 'onay_bekliyor')
      GROUP BY a.operasyon_tipi_id`,
  );
}

// Malzemelerin rotalardaki kullanımı: yürürlükteki ve açık revizyonlarda bileşen ya da yan ürün olarak.
export function malzemeKullanimi(db: Db, malzemeIdleri: readonly number[]): Promise<{
  malzemeId: number; urunId: number; revizyonId: number; harf: string; durum: string; opNo: number; adimAdi: string; rol: 'bilesen' | 'yan';
}[]> {
  return db.sorgu(
    `SELECT k.malzeme_id::int AS "malzemeId", r.malzeme_id::int AS "urunId", r.id AS "revizyonId", r.harf, r.durum, a.op_no AS "opNo", a.ad AS "adimAdi", k.rol
       FROM (SELECT adim_id, malzeme_id, 'bilesen' AS rol FROM rota_bileseni UNION ALL SELECT adim_id, malzeme_id, 'yan' FROM rota_yan_urunu) k
       JOIN rota_adimi a ON a.id = k.adim_id
       JOIN rota_revizyonu r ON r.id = a.revizyon_id
      WHERE k.malzeme_id = ANY($1::bigint[]) AND r.durum IN ('yururlukte', 'taslak', 'onay_bekliyor')
      ORDER BY k.malzeme_id, r.malzeme_id, r.id, a.sira`,
    [[...malzemeIdleri]],
  );
}

/* ---------------- gerçekleşen süre ---------------- */

export async function adimKunyesi(db: Db, adimId: number): Promise<{ revizyonId: number; malzemeId: number; opNo: number } | null> {
  return db.tek(
    'SELECT revizyon_id AS "revizyonId", malzeme_id AS "malzemeId", op_no AS "opNo" FROM rota_adimi WHERE id = $1',
    [adimId],
  );
}

// Aynı ürün ve OP için eşzamanlı iki yazma sırayla geçer: "son okunan satır" denetimi kilit altında yapılır.
export async function gerceklesenKilitle(db: Db, malzemeId: number, opNo: number): Promise<void> {
  await db.sorgu("SELECT pg_advisory_xact_lock(hashtextextended('rota_gerceklesen_sure:' || $1::text || ':' || $2::text, 0))", [malzemeId, opNo]);
}

export interface GerceklesenKaydi {
  id: number;
  opNo: number;
  tur: GerceklesenTuru;
  makineId: number | null;
  sureDk: string | null;
  kaynak: GerceklesenKaynagi;
  isEmriId: number | null;
  kisiId: number;
  zaman: string;
}

export function gerceklesenSureler(db: Db, malzemeId: number, opNolari: readonly number[]): Promise<GerceklesenKaydi[]> {
  return db.sorgu<GerceklesenKaydi>(
    `SELECT id, op_no AS "opNo", tur, makine_id AS "makineId", sure_dk AS "sureDk", kaynak, is_emri_id AS "isEmriId", kisi_id AS "kisiId", ${ISO('zaman')} AS zaman
       FROM rota_gerceklesen_sure WHERE malzeme_id = $1 AND op_no = ANY($2::int[]) ORDER BY op_no, tur, id`,
    [malzemeId, opNolari],
  );
}

export function urunlerinGerceklesenSureleri(db: Db, malzemeIdleri: readonly number[]): Promise<(GerceklesenKaydi & { malzemeId: number })[]> {
  return db.sorgu(
    `SELECT malzeme_id AS "malzemeId", id, op_no AS "opNo", tur, makine_id AS "makineId", sure_dk AS "sureDk", kaynak, is_emri_id AS "isEmriId", kisi_id AS "kisiId", ${ISO('zaman')} AS zaman
       FROM rota_gerceklesen_sure WHERE malzeme_id = ANY($1::int[]) ORDER BY malzeme_id, op_no, tur, id`,
    [malzemeIdleri],
  );
}

export async function sonGerceklesenId(db: Db, g: { malzemeId: number; opNo: number; tur: GerceklesenTuru; makineId: number | null }): Promise<number | null> {
  const satir = await db.tek<{ id: number }>(
    `SELECT id FROM rota_gerceklesen_sure WHERE malzeme_id = $1 AND op_no = $2 AND tur = $3 AND makine_id IS NOT DISTINCT FROM $4
      ORDER BY id DESC LIMIT 1`,
    [g.malzemeId, g.opNo, g.tur, g.makineId],
  );
  return satir?.id ?? null;
}

export async function gerceklesenEkle(db: Db, g: {
  malzemeId: number; opNo: number; tur: GerceklesenTuru; makineId: number | null; sureDk: number | string | null; kisiId: number;
  kaynak?: GerceklesenKaynagi; isEmriId?: number | null;
}): Promise<void> {
  await db.sorgu(
    `INSERT INTO rota_gerceklesen_sure (malzeme_id, op_no, tur, makine_id, sure_dk, kaynak, is_emri_id, kisi_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [g.malzemeId, g.opNo, g.tur, g.makineId, g.sureDk, g.kaynak ?? 'elle', g.isEmriId ?? null, g.kisiId],
  );
}

export interface GerceklesenSatirKaydi { id: number; malzemeId: number; opNo: number; tur: GerceklesenTuru; makineId: number | null; sureDk: string | null; kaynak: GerceklesenKaynagi; isEmriId: number | null }

export function gerceklesenSatiri(db: Db, id: number): Promise<GerceklesenSatirKaydi | null> {
  return db.tek(
    `SELECT id, malzeme_id AS "malzemeId", op_no AS "opNo", tur, makine_id AS "makineId", sure_dk AS "sureDk", kaynak, is_emri_id AS "isEmriId"
       FROM rota_gerceklesen_sure WHERE id = $1`,
    [id],
  );
}

// Terminal ölçümü yazılmış iş emirleri: aynı iş emri ikinci kez öneri yazmaz.
export async function olculmusIsEmirleri(db: Db, isEmriIdleri: readonly number[]): Promise<Set<number>> {
  if (isEmriIdleri.length === 0) return new Set();
  const satirlar = await db.sorgu<{ isEmriId: number }>(
    `SELECT DISTINCT is_emri_id AS "isEmriId" FROM rota_gerceklesen_sure WHERE kaynak = 'terminal' AND is_emri_id = ANY($1::int[])`,
    [isEmriIdleri],
  );
  return new Set(satirlar.map((x) => x.isEmriId));
}

export function adimGirenSayilari(db: Db, revizyonIdleri: readonly number[]): Promise<{ revizyonId: number; opNo: number; bagimlilik: Bagimlilik; girenSayisi: number }[]> {
  return db.sorgu(
    `SELECT a.revizyon_id AS "revizyonId", a.op_no AS "opNo", a.bagimlilik,
            (SELECT count(*) FROM rota_bileseni b WHERE b.adim_id = a.id)::int AS "girenSayisi"
       FROM rota_adimi a WHERE a.revizyon_id = ANY($1::int[]) ORDER BY a.revizyon_id, a.sira`,
    [revizyonIdleri],
  );
}
