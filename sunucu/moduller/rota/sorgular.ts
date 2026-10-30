import type { Db } from '#cekirdek/db.ts';
import type {
  Bagimlilik, GerceklesenKaynagi, GerceklesenTuru, IlkParcaSecimi, MakineKullanimi, ParametreDegeri, ParametreDegerleri, ParametreTuru, RevizyonDurumu, RevizyonOzeti, SartnameKapsami,
} from '#paylasilan/sozlesme/rota.ts';

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

// Kart kullanıma girince açılacak kopya istekleri (#500); kart başına en çok bir istek, sonuncusu geçerlidir.
export function kopyaIstekleri(db: Db): Promise<{ hedefId: number; kaynakId: number; isteyenKisiId: number }[]> {
  return db.sorgu(
    'SELECT hedef_malzeme_id AS "hedefId", kaynak_malzeme_id AS "kaynakId", isteyen_kisi_id AS "isteyenKisiId" FROM rota_kopya_istegi ORDER BY olusturma, hedef_malzeme_id',
  );
}

export async function kopyaIstegiYaz(db: Db, hedefId: number, kaynakId: number, kisiId: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO rota_kopya_istegi (hedef_malzeme_id, kaynak_malzeme_id, isteyen_kisi_id) VALUES ($1, $2, $3)
     ON CONFLICT (hedef_malzeme_id) DO UPDATE SET kaynak_malzeme_id = EXCLUDED.kaynak_malzeme_id, isteyen_kisi_id = EXCLUDED.isteyen_kisi_id, olusturma = now()`,
    [hedefId, kaynakId, kisiId],
  );
}

export async function kopyaIstegiSil(db: Db, hedefId: number): Promise<void> {
  await db.sorgu('DELETE FROM rota_kopya_istegi WHERE hedef_malzeme_id = $1', [hedefId]);
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
  ilkParca: IlkParcaSecimi;
  // Çok dallı rota (1248 a): satırı olmayan adım ana hattadır (dal null) ve birleştirme yapmaz.
  dal: string | null;
  birlesen: string[];
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
            yeniden_ayar AS "yenidenAyar", ilk_parca AS "ilkParca", d.dal, coalesce(d.birlesen, '{}') AS birlesen
       FROM rota_adimi LEFT JOIN rota_adim_dali d ON d.adim_id = rota_adimi.id
      WHERE revizyon_id = ANY($1::int[]) ORDER BY revizyon_id, sira`,
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

// Adımların ilk parça seçimi revizyon ve OP numarası başına (744 a): Arkon'un kapısı emrin rota revizyonundan okur.
export function adimIlkParcaSecimleri(db: Db, revizyonIdleri: readonly number[]): Promise<{ revizyonId: number; opNo: number; ilkParca: IlkParcaSecimi }[]> {
  return db.sorgu(
    'SELECT revizyon_id AS "revizyonId", op_no AS "opNo", ilk_parca AS "ilkParca" FROM rota_adimi WHERE revizyon_id = ANY($1::int[])',
    [[...revizyonIdleri]],
  );
}

// Taslağın içeriği bütün olarak yeniden yazılır; önce bağlı satırlar, sonra adımlar silinir (tetikleyici taslağı denetler).
export async function icerikSil(db: Db, revizyonId: number): Promise<void> {
  const adim = 'SELECT id FROM rota_adimi WHERE revizyon_id = $1';
  await db.sorgu(`DELETE FROM rota_aday_kaynagi WHERE adim_id IN (${adim})`, [revizyonId]);
  await db.sorgu(`DELETE FROM rota_bileseni WHERE adim_id IN (${adim})`, [revizyonId]);
  await db.sorgu(`DELETE FROM rota_yan_urunu WHERE adim_id IN (${adim})`, [revizyonId]);
  await db.sorgu(`DELETE FROM rota_adim_dali WHERE adim_id IN (${adim})`, [revizyonId]);
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
  ilkParca: IlkParcaSecimi;
  adaylar: readonly {
    kaynak: Kaynak; ayarSuresiDk: number | string | null; birimSureDk: number | string | null; islemSuresiDk: number | string | null;
    degisimSuresiDk: number | string | null;
  }[];
  bilesenler: readonly { malzemeId: number; miktar: number | string; fireYuzde: number | string }[];
  yanUrunler: readonly { malzemeId: number; miktar: number | string }[];
  dal: string | null;
  birlesen: readonly string[];
}

export async function adimYaz(db: Db, revizyonId: number, malzemeId: number, a: AdimYazimi): Promise<void> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO rota_adimi (revizyon_id, malzeme_id, op_no, sira, operasyon_tipi_id, ad, makine_id, kisi_id, fason_firma_id, ayar_suresi_dk,
                             birim_sure_dk, termin_gun, bagimlilik, devir_adedi, fire_payi_yuzde, makine_kullanimi, en_kucuk_parca, yeniden_ayar,
                             islem_suresi_dk, degisim_suresi_dk, istasyon_id, ilk_parca)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22) RETURNING id`,
    [revizyonId, malzemeId, a.opNo, a.sira, a.operasyonTipiId, a.ad, makineSutunu(a.kaynak), kisiSutunu(a.kaynak), fasonSutunu(a.kaynak),
      a.ayarSuresiDk, a.birimSureDk, a.terminGun, a.bagimlilik, a.devirAdedi, a.firePayiYuzde, a.makineKullanimi, a.enKucukParca, a.yenidenAyar,
      a.islemSuresiDk, a.degisimSuresiDk, istasyonSutunu(a.kaynak), a.ilkParca],
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
  if (a.dal !== null || a.birlesen.length > 0) {
    await db.sorgu('INSERT INTO rota_adim_dali (adim_id, dal, birlesen) VALUES ($1, $2, $3::text[])', [adimId, a.dal, [...a.birlesen]]);
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

export interface TalimatSatiri { id: number; surum: number; metin: string; yazanKisiId: number; yazma: string }

export function talimatlar(db: Db, malzemeId: number, opNo: number): Promise<TalimatSatiri[]> {
  return db.sorgu<TalimatSatiri>(
    `SELECT id, surum, metin, yazan_kisi_id AS "yazanKisiId", ${ISO('yazma')} AS yazma
       FROM rota_talimati WHERE malzeme_id = $1 AND op_no = $2 ORDER BY surum DESC`,
    [malzemeId, opNo],
  );
}

export function gecerliTalimatlar(db: Db, malzemeId: number): Promise<{ id: number; opNo: number; surum: number; metin: string }[]> {
  return db.sorgu(
    `SELECT DISTINCT ON (op_no) id, op_no AS "opNo", surum, metin FROM rota_talimati WHERE malzeme_id = $1 ORDER BY op_no, surum DESC`,
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

export async function talimatEkle(db: Db, malzemeId: number, opNo: number, surum: number, metin: string, kisiId: number): Promise<number> {
  return (await db.tek<{ id: number }>(
    'INSERT INTO rota_talimati (malzeme_id, op_no, surum, metin, yazan_kisi_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [malzemeId, opNo, surum, metin, kisiId],
  ))!.id;
}

export interface TalimatAdimiSatiri { sahipId: number; sira: number; baslik: string; metin: string | null; kontrolTuru: string; kontrolAyari: Record<string, unknown>; zorunlu: boolean }
export interface MedyaYazisi { ozet: string; ad: string; tur: 'resim' | 'video'; boyut: number }
export interface TalimatAdimiYazisi {
  baslik: string; metin: string | null; kontrolTuru: string; kontrolAyari: Record<string, unknown>; zorunlu: boolean; medya: readonly MedyaYazisi[];
}
export interface MedyaSatiri extends MedyaYazisi { sahipId: number; adimSira: number }

const ADIM_SUTUNLARI = `sira, baslik, metin, kontrol_turu AS "kontrolTuru", kontrol_ayari AS "kontrolAyari", zorunlu`;

export function talimatAdimlari(db: Db, talimatIdleri: readonly number[]): Promise<TalimatAdimiSatiri[]> {
  return db.sorgu<TalimatAdimiSatiri>(
    `SELECT talimat_id AS "sahipId", ${ADIM_SUTUNLARI} FROM rota_talimat_adimi WHERE talimat_id = ANY($1::int[]) ORDER BY talimat_id, sira`,
    [[...talimatIdleri]],
  );
}

// Adımlar ve medyaları tek komutla yazılır; sıralar 1'den başlar.
async function adimlariEkle(
  db: Db, t: { adim: string; medya: string; sahip: string }, sahipId: number, adimlar: readonly TalimatAdimiYazisi[],
): Promise<void> {
  if (adimlar.length === 0) return;
  const { adim: tablo, sahip: sahipSutunu } = t;
  await db.sorgu(
    `INSERT INTO ${tablo} (${sahipSutunu}, sira, baslik, metin, kontrol_turu, kontrol_ayari, zorunlu)
     SELECT $1, x.sira, x.baslik, x.metin, x.kontrol_turu, x.kontrol_ayari, x.zorunlu
       FROM jsonb_to_recordset($2::jsonb) AS x (sira int, baslik text, metin text, kontrol_turu text, kontrol_ayari jsonb, zorunlu boolean)`,
    [sahipId, JSON.stringify(adimlar.map((a, i) => ({
      sira: i + 1, baslik: a.baslik, metin: a.metin, kontrol_turu: a.kontrolTuru, kontrol_ayari: a.kontrolAyari, zorunlu: a.zorunlu,
    })))],
  );
  const medya = adimlar.flatMap((a, i) => a.medya.map((m, j) => ({ adim_sira: i + 1, sira: j + 1, ozet: m.ozet, tur: m.tur, ad: m.ad, boyut: m.boyut })));
  if (medya.length === 0) return;
  await db.sorgu(
    `INSERT INTO ${t.medya} (${sahipSutunu}, adim_sira, sira, ozet, tur, ad, boyut)
     SELECT $1, x.adim_sira, x.sira, x.ozet, x.tur, x.ad, x.boyut
       FROM jsonb_to_recordset($2::jsonb) AS x (adim_sira int, sira int, ozet text, tur text, ad text, boyut bigint)`,
    [sahipId, JSON.stringify(medya)],
  );
}

const TALIMAT_TABLOLARI = { adim: 'rota_talimat_adimi', medya: 'rota_talimat_adim_medyasi', sahip: 'talimat_id' };
const SABLON_TABLOLARI = { adim: 'rota_talimat_sablon_adimi', medya: 'rota_talimat_sablon_adim_medyasi', sahip: 'sablon_id' };

const MEDYA_SUTUNLARI = `adim_sira AS "adimSira", ozet, tur, ad, boyut::float8 AS boyut`;

export function talimatMedyalari(db: Db, talimatIdleri: readonly number[]): Promise<MedyaSatiri[]> {
  return db.sorgu<MedyaSatiri>(
    `SELECT talimat_id AS "sahipId", ${MEDYA_SUTUNLARI} FROM rota_talimat_adim_medyasi WHERE talimat_id = ANY($1::int[]) ORDER BY talimat_id, adim_sira, sira`,
    [[...talimatIdleri]],
  );
}

export function sablonMedyalari(db: Db, sablonId: number): Promise<MedyaSatiri[]> {
  return db.sorgu<MedyaSatiri>(
    `SELECT sablon_id AS "sahipId", ${MEDYA_SUTUNLARI} FROM rota_talimat_sablon_adim_medyasi WHERE sablon_id = $1 ORDER BY adim_sira, sira`, [sablonId],
  );
}

// Ürün başına sınır için ürünün bütün talimat sürümlerindeki ve taslaklarındaki farklı dosyalar.
export function urunMedyalari(db: Db, malzemeId: number): Promise<{ ozet: string; boyut: number }[]> {
  return db.sorgu(
    `SELECT m.ozet, m.boyut::float8 AS boyut FROM rota_talimat_adim_medyasi m JOIN rota_talimati t ON t.id = m.talimat_id WHERE t.malzeme_id = $1
     UNION SELECT m.ozet, m.boyut::float8 FROM rota_talimat_taslak_adim_medyasi m JOIN rota_talimat_taslagi t ON t.id = m.taslak_id WHERE t.malzeme_id = $1`,
    [malzemeId],
  );
}

// Rotada hâlâ kullanılan özetler: kalanların dosya bağı kaldırılır.
export async function kullanilanMedyalar(db: Db, ozetler: readonly string[]): Promise<string[]> {
  return (await db.sorgu<{ ozet: string }>(
    `SELECT ozet FROM rota_talimat_adim_medyasi WHERE ozet = ANY($1::text[])
     UNION SELECT ozet FROM rota_talimat_sablon_adim_medyasi WHERE ozet = ANY($1::text[])
     UNION SELECT ozet FROM rota_talimat_taslak_adim_medyasi WHERE ozet = ANY($1::text[])`,
    [[...ozetler]],
  )).map((x) => x.ozet);
}

export const talimatAdimlariniEkle = (db: Db, talimatId: number, adimlar: readonly TalimatAdimiYazisi[]): Promise<void> =>
  adimlariEkle(db, TALIMAT_TABLOLARI, talimatId, adimlar);

/* ---------------- talimat taslağı (1194 b) ---------------- */

export interface TalimatTaslagiSatiri { id: number; tabanSurum: number | null; surum: number; yazanKisiId: number; yazma: string }
const TASLAK_TABLOLARI = { adim: 'rota_talimat_taslak_adimi', medya: 'rota_talimat_taslak_adim_medyasi', sahip: 'taslak_id' };

export function talimatTaslagi(db: Db, malzemeId: number, opNo: number, kilitle = false): Promise<TalimatTaslagiSatiri | null> {
  return db.tek<TalimatTaslagiSatiri>(
    `SELECT id, taban_surum AS "tabanSurum", surum, yazan_kisi_id AS "yazanKisiId", ${ISO('yazma')} AS yazma
       FROM rota_talimat_taslagi WHERE malzeme_id = $1 AND op_no = $2${kilitle ? ' FOR UPDATE' : ''}`,
    [malzemeId, opNo],
  );
}

// Taslak kaydı adımlarıyla bütün olarak yazılır: varsa adımları silinir (medya adımla birlikte), sürümü artar.
export async function talimatTaslagiYaz(
  db: Db, g: { malzemeId: number; opNo: number; tabanSurum: number | null; kisiId: number; adimlar: readonly TalimatAdimiYazisi[] }, mevcut: TalimatTaslagiSatiri | null,
): Promise<void> {
  let id: number;
  if (mevcut) {
    id = mevcut.id;
    await db.sorgu('DELETE FROM rota_talimat_taslak_adimi WHERE taslak_id = $1', [id]);
    await db.sorgu('UPDATE rota_talimat_taslagi SET taban_surum = $2, surum = surum + 1, yazan_kisi_id = $3, yazma = now() WHERE id = $1', [id, g.tabanSurum, g.kisiId]);
  } else {
    id = (await db.tek<{ id: number }>(
      'INSERT INTO rota_talimat_taslagi (malzeme_id, op_no, taban_surum, yazan_kisi_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [g.malzemeId, g.opNo, g.tabanSurum, g.kisiId],
    ))!.id;
  }
  await adimlariEkle(db, TASLAK_TABLOLARI, id, g.adimlar);
}

export async function talimatTaslagiSil(db: Db, id: number): Promise<void> {
  await db.sorgu('DELETE FROM rota_talimat_taslagi WHERE id = $1', [id]);
}

export function taslakAdimlari(db: Db, taslakId: number): Promise<TalimatAdimiSatiri[]> {
  return db.sorgu<TalimatAdimiSatiri>(
    `SELECT taslak_id AS "sahipId", ${ADIM_SUTUNLARI} FROM rota_talimat_taslak_adimi WHERE taslak_id = $1 ORDER BY sira`, [taslakId],
  );
}

export function taslakMedyalari(db: Db, taslakId: number): Promise<MedyaSatiri[]> {
  return db.sorgu<MedyaSatiri>(
    `SELECT taslak_id AS "sahipId", ${MEDYA_SUTUNLARI} FROM rota_talimat_taslak_adim_medyasi WHERE taslak_id = $1 ORDER BY adim_sira, sira`, [taslakId],
  );
}

export async function talimatSurumuKimligi(db: Db, malzemeId: number, opNo: number, surum: number): Promise<{ id: number; metin: string } | null> {
  return db.tek<{ id: number; metin: string }>('SELECT id, metin FROM rota_talimati WHERE malzeme_id = $1 AND op_no = $2 AND surum = $3', [malzemeId, opNo, surum]);
}

/* ---------------- talimat şablonu (989 a) ---------------- */

export interface TalimatSablonSatiri {
  id: number; kod: string; ad: string; sartnameId: number | null; sartnameKodu: string | null; sartnameAdi: string | null; aktif: boolean; surum: number; adimSayisi: number;
  kontrolSayisi: number; resimSayisi: number; videoSayisi: number;
}

export function talimatSablonlari(db: Db, idler: readonly number[] | null = null): Promise<TalimatSablonSatiri[]> {
  return db.sorgu<TalimatSablonSatiri>(
    `SELECT t.id, t.kod, t.ad, t.sartname_id AS "sartnameId", s.kod AS "sartnameKodu", s.ad AS "sartnameAdi", t.aktif, t.surum,
            (SELECT count(*)::int FROM rota_talimat_sablon_adimi a WHERE a.sablon_id = t.id) AS "adimSayisi",
            (SELECT count(*)::int FROM rota_talimat_sablon_adimi a WHERE a.sablon_id = t.id AND a.kontrol_turu <> 'yok') AS "kontrolSayisi",
            (SELECT count(*)::int FROM rota_talimat_sablon_adim_medyasi m WHERE m.sablon_id = t.id AND m.tur = 'resim') AS "resimSayisi",
            (SELECT count(*)::int FROM rota_talimat_sablon_adim_medyasi m WHERE m.sablon_id = t.id AND m.tur = 'video') AS "videoSayisi"
       FROM rota_talimat_sablonu t LEFT JOIN rota_islem_sartnamesi s ON s.id = t.sartname_id
      WHERE $1::int[] IS NULL OR t.id = ANY($1::int[])
      ORDER BY t.kod`,
    [idler === null ? null : [...idler]],
  );
}

export async function talimatSablonKilitle(db: Db, id: number): Promise<{ surum: number } | null> {
  return db.tek<{ surum: number }>('SELECT surum FROM rota_talimat_sablonu WHERE id = $1 FOR UPDATE', [id]);
}

export async function talimatSablonEkle(db: Db, g: { kod: string; ad: string; sartnameId: number | null }): Promise<number> {
  return (await db.tek<{ id: number }>(
    'INSERT INTO rota_talimat_sablonu (kod, ad, sartname_id) VALUES ($1, $2, $3) RETURNING id', [g.kod, g.ad, g.sartnameId],
  ))!.id;
}

export async function talimatSablonGuncelle(db: Db, id: number, g: { ad: string; sartnameId: number | null }): Promise<void> {
  await db.sorgu('UPDATE rota_talimat_sablonu SET ad = $2, sartname_id = $3, surum = surum + 1 WHERE id = $1', [id, g.ad, g.sartnameId]);
}

export async function talimatSablonDurumu(db: Db, id: number, aktif: boolean): Promise<void> {
  await db.sorgu('UPDATE rota_talimat_sablonu SET aktif = $2, surum = surum + 1 WHERE id = $1', [id, aktif]);
}

export function talimatSablonAdimlari(db: Db, sablonId: number): Promise<TalimatAdimiSatiri[]> {
  return db.sorgu<TalimatAdimiSatiri>(
    `SELECT sablon_id AS "sahipId", ${ADIM_SUTUNLARI} FROM rota_talimat_sablon_adimi WHERE sablon_id = $1 ORDER BY sira`, [sablonId],
  );
}

// Şablon emre ya da talimata bağlanmaz (kopyalanır); adımlar kaydette bütün olarak yeniden yazılır.
export async function talimatSablonAdimlariniYaz(db: Db, sablonId: number, adimlar: readonly TalimatAdimiYazisi[]): Promise<void> {
  await db.sorgu('DELETE FROM rota_talimat_sablon_adimi WHERE sablon_id = $1', [sablonId]);
  await adimlariEkle(db, SABLON_TABLOLARI, sablonId, adimlar);
}

export const sartnameVarMi = async (db: Db, id: number): Promise<boolean> =>
  (await db.tek('SELECT 1 FROM rota_islem_sartnamesi WHERE id = $1', [id])) !== null;

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

export function adimGirenSayilari(db: Db, revizyonIdleri: readonly number[]): Promise<{
  revizyonId: number; opNo: number; bagimlilik: Bagimlilik; girenSayisi: number; dal: string | null; birlesen: string[];
}[]> {
  return db.sorgu(
    `SELECT a.revizyon_id AS "revizyonId", a.op_no AS "opNo", a.bagimlilik,
            (SELECT count(*) FROM rota_bileseni b WHERE b.adim_id = a.id)::int AS "girenSayisi", d.dal, coalesce(d.birlesen, '{}') AS birlesen
       FROM rota_adimi a LEFT JOIN rota_adim_dali d ON d.adim_id = a.id
      WHERE a.revizyon_id = ANY($1::int[]) ORDER BY a.revizyon_id, a.sira`,
    [revizyonIdleri],
  );
}

/* ---------------- işlem şartnamesi (971 a) ---------------- */

export interface KategoriSatiri { id: number; kod: string; ad: string; sira: number }
export const kategoriler = (db: Db): Promise<KategoriSatiri[]> =>
  db.sorgu<KategoriSatiri>('SELECT id, kod, ad, sira FROM rota_islem_kategorisi ORDER BY sira, id');

export interface StandartSatiri { id: number; numara: string; kisaAciklama: string }
const STANDART = 'id, numara, kisa_aciklama AS "kisaAciklama"';
export const standartlar = (db: Db): Promise<StandartSatiri[]> =>
  db.sorgu<StandartSatiri>(`SELECT ${STANDART} FROM rota_standart_atfi ORDER BY numara`);
export const standartlariOku = (db: Db, idler: readonly number[]): Promise<StandartSatiri[]> =>
  db.sorgu<StandartSatiri>(`SELECT ${STANDART} FROM rota_standart_atfi WHERE id = ANY($1::int[])`, [[...idler]]);
export async function standartEkle(db: Db, numara: string, kisaAciklama: string): Promise<StandartSatiri> {
  return (await db.tek<StandartSatiri>(`INSERT INTO rota_standart_atfi (numara, kisa_aciklama) VALUES ($1, $2) RETURNING ${STANDART}`, [numara, kisaAciklama]))!;
}

export interface SartnameSatiri {
  id: number; kod: string; ad: string; kategoriId: number; kapsam: SartnameKapsami; kaynak: 'varsayilan' | 'firma' | 'musteri';
  musteriFirmaId: number | null; musteriBelgeNo: string | null; aktif: boolean; surum: number;
  yururlukteSurumId: number | null; yururlukteSurumNo: number | null; taslakSurumId: number | null; taslakSurumNo: number | null; kullanim: number;
}
const SARTNAME = `s.id, s.kod, s.ad, s.kategori_id AS "kategoriId", s.kapsam, s.kaynak, s.musteri_firma_id AS "musteriFirmaId",
  s.musteri_belge_no AS "musteriBelgeNo", s.aktif, s.surum,
  y.id AS "yururlukteSurumId", y.surum_no AS "yururlukteSurumNo", t.id AS "taslakSurumId", t.surum_no AS "taslakSurumNo",
  (SELECT count(*) FROM rota_adim_sartnamesi a JOIN rota_revizyonu r ON r.id = a.revizyon_id
    WHERE a.sartname_id = s.id AND r.durum IN ('onay_bekliyor', 'onayli', 'yururlukte'))::int AS kullanim`;
const SARTNAME_KAYNAGI = `rota_islem_sartnamesi s
  LEFT JOIN rota_islem_sartnamesi_surumu y ON y.sartname_id = s.id AND y.durum = 'yururlukte'
  LEFT JOIN rota_islem_sartnamesi_surumu t ON t.sartname_id = s.id AND t.durum = 'taslak'`;

// idler null: bütün kütüphane.
export const sartnameleriOku = (db: Db, idler: readonly number[] | null): Promise<SartnameSatiri[]> =>
  db.sorgu<SartnameSatiri>(
    `SELECT ${SARTNAME} FROM ${SARTNAME_KAYNAGI} WHERE $1::int[] IS NULL OR s.id = ANY($1::int[]) ORDER BY s.kod`,
    [idler === null ? null : [...idler]],
  );

// Komut şartnameyi satır kilidiyle alır: aynı şartnameye gelen iki komut (yayın, taslak kaydı) sırayla işlenir.
export async function sartnameKilitle(db: Db, id: number): Promise<SartnameSatiri | null> {
  if ((await db.tek('SELECT id FROM rota_islem_sartnamesi WHERE id = $1 FOR UPDATE', [id])) === null) return null;
  return (await sartnameleriOku(db, [id]))[0] ?? null;
}

export const kategoriVarMi = async (db: Db, id: number): Promise<boolean> =>
  (await db.tek('SELECT 1 FROM rota_islem_kategorisi WHERE id = $1', [id])) !== null;

export async function sartnameEkle(db: Db, g: {
  kod: string; kategoriId: number; ad: string; kapsam: SartnameKapsami; kaynak: 'firma' | 'musteri'; musteriFirmaId: number | null; musteriBelgeNo: string | null;
}): Promise<number> {
  return (await db.tek<{ id: number }>(
    `INSERT INTO rota_islem_sartnamesi (kod, kategori_id, ad, kapsam, kaynak, musteri_firma_id, musteri_belge_no)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [g.kod, g.kategoriId, g.ad, g.kapsam, g.kaynak, g.musteriFirmaId, g.musteriBelgeNo],
  ))!.id;
}

export async function sartnameSurumArtir(db: Db, id: number, ek = '', degerler: readonly unknown[] = []): Promise<number> {
  return (await db.tek<{ surum: number }>(
    `UPDATE rota_islem_sartnamesi SET surum = surum + 1${ek ? `, ${ek}` : ''} WHERE id = $1 RETURNING surum`, [id, ...degerler],
  ))!.surum;
}

export interface SurumSatiri {
  id: number; sartnameId: number; surumNo: number; durum: 'taslak' | 'yururlukte' | 'eski'; istenenBelgeler: string[];
  terminalNotu: string | null; degisiklikNotu: string | null; acanKisiId: number | null; acilma: string; yayinlayanKisiId: number | null; yayin: string | null;
}
const SURUM = `v.id, v.sartname_id AS "sartnameId", v.surum_no AS "surumNo", v.durum, v.istenen_belgeler AS "istenenBelgeler",
  v.terminal_notu AS "terminalNotu", v.degisiklik_notu AS "degisiklikNotu", v.acan_kisi_id AS "acanKisiId", ${ISO('v.acilma')} AS acilma,
  v.yayinlayan_kisi_id AS "yayinlayanKisiId", ${ISO('v.yayin')} AS yayin`;
export const sartnameSurumleri = (db: Db, sartnameId: number): Promise<SurumSatiri[]> =>
  db.sorgu<SurumSatiri>(`SELECT ${SURUM} FROM rota_islem_sartnamesi_surumu v WHERE v.sartname_id = $1 ORDER BY v.surum_no DESC`, [sartnameId]);
export const surumleriOku = (db: Db, idler: readonly number[]): Promise<SurumSatiri[]> =>
  db.sorgu<SurumSatiri>(`SELECT ${SURUM} FROM rota_islem_sartnamesi_surumu v WHERE v.id = ANY($1::int[])`, [[...idler]]);

export interface ParametreSatiri {
  surumId: number; sira: number; anahtar: string; ad: string; tur: ParametreTuru; birim: string | null; secenekler: string[] | null;
  varsayilan: ParametreDegeri; ipucu: string | null; zorunlu: boolean; adimdaDegisir: boolean;
}
export const surumParametreleri = (db: Db, surumIdleri: readonly number[]): Promise<ParametreSatiri[]> =>
  db.sorgu<ParametreSatiri>(
    `SELECT surum_id AS "surumId", sira, anahtar, ad, tur, birim, secenekler, varsayilan, ipucu, zorunlu, adimda_degisir AS "adimdaDegisir"
       FROM rota_islem_sartnamesi_parametresi WHERE surum_id = ANY($1::int[]) ORDER BY surum_id, sira`,
    [[...surumIdleri]],
  );

export interface AtifSatiri { surumId: number; sira: number; standartId: number; numara: string; kisaAciklama: string; rol: string; not: string | null }
export const surumAtiflari = (db: Db, surumIdleri: readonly number[]): Promise<AtifSatiri[]> =>
  db.sorgu<AtifSatiri>(
    `SELECT a.surum_id AS "surumId", a.sira, a.standart_id AS "standartId", t.numara, t.kisa_aciklama AS "kisaAciklama", a.rol, a."not"
       FROM rota_islem_sartnamesi_atfi a JOIN rota_standart_atfi t ON t.id = a.standart_id
      WHERE a.surum_id = ANY($1::int[]) ORDER BY a.surum_id, a.sira`,
    [[...surumIdleri]],
  );

// Yeni taslak sürüm; kaynak verilirse onun içeriği (belgeler, notlar, alanlar, atıflar) kopyalanır, değişiklik notu boş başlar.
export async function surumEkle(db: Db, sartnameId: number, surumNo: number, kisiId: number | null, kaynakSurumId: number | null): Promise<number> {
  const id = (await db.tek<{ id: number }>(
    `INSERT INTO rota_islem_sartnamesi_surumu (sartname_id, surum_no, durum, istenen_belgeler, terminal_notu, acan_kisi_id)
     SELECT $1, $2, 'taslak', COALESCE(k.istenen_belgeler, '{}'), k.terminal_notu, $3
       FROM (SELECT 1) bir LEFT JOIN rota_islem_sartnamesi_surumu k ON k.id = $4 RETURNING id`,
    [sartnameId, surumNo, kisiId, kaynakSurumId],
  ))!.id;
  if (kaynakSurumId !== null) {
    await db.sorgu(
      `INSERT INTO rota_islem_sartnamesi_parametresi (surum_id, sira, anahtar, ad, tur, birim, secenekler, varsayilan, ipucu, zorunlu, adimda_degisir)
       SELECT $1, sira, anahtar, ad, tur, birim, secenekler, varsayilan, ipucu, zorunlu, adimda_degisir FROM rota_islem_sartnamesi_parametresi WHERE surum_id = $2`,
      [id, kaynakSurumId],
    );
    await db.sorgu(
      `INSERT INTO rota_islem_sartnamesi_atfi (surum_id, sira, standart_id, rol, "not")
       SELECT $1, sira, standart_id, rol, "not" FROM rota_islem_sartnamesi_atfi WHERE surum_id = $2`,
      [id, kaynakSurumId],
    );
  }
  return id;
}

export const enBuyukSurumNo = async (db: Db, sartnameId: number): Promise<number> =>
  (await db.tek<{ no: number }>('SELECT COALESCE(max(surum_no), 0)::int AS no FROM rota_islem_sartnamesi_surumu WHERE sartname_id = $1', [sartnameId]))!.no;

// Taslağın içeriği bütün olarak yeniden yazılır (tetikleyici taslağı denetler).
export async function taslakIcerikYaz(db: Db, surumId: number, g: {
  parametreler: readonly Omit<ParametreSatiri, 'surumId' | 'sira'>[]; atiflar: readonly { standartId: number; rol: string; not: string | null }[];
  istenenBelgeler: readonly string[]; terminalNotu: string | null; degisiklikNotu: string | null;
}): Promise<void> {
  await db.sorgu('DELETE FROM rota_islem_sartnamesi_parametresi WHERE surum_id = $1', [surumId]);
  await db.sorgu('DELETE FROM rota_islem_sartnamesi_atfi WHERE surum_id = $1', [surumId]);
  await db.sorgu(
    'UPDATE rota_islem_sartnamesi_surumu SET istenen_belgeler = $2, terminal_notu = $3, degisiklik_notu = $4 WHERE id = $1',
    [surumId, [...g.istenenBelgeler], g.terminalNotu, g.degisiklikNotu],
  );
  for (const [i, p] of g.parametreler.entries()) {
    await db.sorgu(
      `INSERT INTO rota_islem_sartnamesi_parametresi (surum_id, sira, anahtar, ad, tur, birim, secenekler, varsayilan, ipucu, zorunlu, adimda_degisir)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)`,
      [surumId, i + 1, p.anahtar, p.ad, p.tur, p.birim, p.secenekler === null ? null : [...p.secenekler],
        p.varsayilan === null ? null : JSON.stringify(p.varsayilan), p.ipucu, p.zorunlu, p.adimdaDegisir],
    );
  }
  for (const [i, a] of g.atiflar.entries()) {
    await db.sorgu('INSERT INTO rota_islem_sartnamesi_atfi (surum_id, sira, standart_id, rol, "not") VALUES ($1, $2, $3, $4, $5)', [surumId, i + 1, a.standartId, a.rol, a.not]);
  }
}

export async function taslakSil(db: Db, surumId: number): Promise<void> {
  await db.sorgu('DELETE FROM rota_islem_sartnamesi_parametresi WHERE surum_id = $1', [surumId]);
  await db.sorgu('DELETE FROM rota_islem_sartnamesi_atfi WHERE surum_id = $1', [surumId]);
  await db.sorgu("DELETE FROM rota_islem_sartnamesi_surumu WHERE id = $1 AND durum = 'taslak'", [surumId]);
}

// Yürürlükteki sürüm eskiye, taslak yürürlüğe geçer; tek yürürlükte dizini ikisinin sırasını gerektirir.
export async function surumuYayinla(db: Db, sartnameId: number, surumId: number, kisiId: number): Promise<void> {
  await db.sorgu("UPDATE rota_islem_sartnamesi_surumu SET durum = 'eski' WHERE sartname_id = $1 AND durum = 'yururlukte'", [sartnameId]);
  await db.sorgu("UPDATE rota_islem_sartnamesi_surumu SET durum = 'yururlukte', yayinlayan_kisi_id = $2, yayin = now() WHERE id = $1 AND durum = 'taslak'", [surumId, kisiId]);
}

export interface AdimSartnameSatiri { revizyonId: number; opNo: number; sira: number; sartnameId: number; degerler: ParametreDegerleri }
export const adimSartnameleri = (db: Db, revizyonIdleri: readonly number[]): Promise<AdimSartnameSatiri[]> =>
  db.sorgu<AdimSartnameSatiri>(
    `SELECT revizyon_id AS "revizyonId", op_no AS "opNo", sira, sartname_id AS "sartnameId", degerler
       FROM rota_adim_sartnamesi WHERE revizyon_id = ANY($1::int[]) ORDER BY revizyon_id, op_no, sira`,
    [[...revizyonIdleri]],
  );

export async function adimSartnameleriYaz(
  db: Db, revizyonId: number, opNo: number, sartnameler: readonly { sartnameId: number; degerler: ParametreDegerleri }[],
): Promise<void> {
  await db.sorgu('DELETE FROM rota_adim_sartnamesi WHERE revizyon_id = $1 AND op_no = $2', [revizyonId, opNo]);
  for (const [i, x] of sartnameler.entries()) {
    await db.sorgu(
      'INSERT INTO rota_adim_sartnamesi (revizyon_id, op_no, sira, sartname_id, degerler) VALUES ($1, $2, $3, $4, $5::jsonb)',
      [revizyonId, opNo, i + 1, x.sartnameId, JSON.stringify(x.degerler)],
    );
  }
}

// Taslak yeniden yazılınca çıkarılan adımın şartname bağı da gider (yabancı anahtar işlem sonunda denetlenir).
export async function sahipsizAdimSartnameleriniSil(db: Db, revizyonId: number): Promise<void> {
  await db.sorgu(
    `DELETE FROM rota_adim_sartnamesi x WHERE x.revizyon_id = $1
       AND NOT EXISTS (SELECT 1 FROM rota_adimi a WHERE a.revizyon_id = x.revizyon_id AND a.op_no = x.op_no)`,
    [revizyonId],
  );
}

// Aynı ürünün revizyonundan açılan taslak bağları da alır: OP numaraları korunur, hedefte olmayan adımın bağı kopyalanmaz.
export async function adimSartnameleriniKopyala(db: Db, kaynakRevizyonId: number, hedefRevizyonId: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO rota_adim_sartnamesi (revizyon_id, op_no, sira, sartname_id, degerler)
     SELECT $2, x.op_no, x.sira, x.sartname_id, x.degerler FROM rota_adim_sartnamesi x
      WHERE x.revizyon_id = $1 AND EXISTS (SELECT 1 FROM rota_adimi a WHERE a.revizyon_id = $2 AND a.op_no = x.op_no)`,
    [kaynakRevizyonId, hedefRevizyonId],
  );
}

export async function isEmriSabitle(
  db: Db, isEmriId: number, sabitler: readonly { surumId: number; degerler: ParametreDegerleri }[], kisiId: number,
): Promise<void> {
  for (const [i, x] of sabitler.entries()) {
    await db.sorgu(
      'INSERT INTO rota_is_emri_sartnamesi (is_emri_id, sira, surum_id, degerler, sabitleyen_kisi_id) VALUES ($1, $2, $3, $4::jsonb, $5)',
      [isEmriId, i + 1, x.surumId, JSON.stringify(x.degerler), kisiId],
    );
  }
}

// Kopya iş emri kaynağın sabitlerini aynı sürüm ve değerlerle alır; sabitleyen kopyayı açan kişidir.
export async function isEmriSabitiniKopyala(db: Db, kaynakIsEmriId: number, yeniIsEmriId: number, kisiId: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO rota_is_emri_sartnamesi (is_emri_id, sira, surum_id, degerler, sabitleyen_kisi_id)
     SELECT $2, sira, surum_id, degerler, $3 FROM rota_is_emri_sartnamesi WHERE is_emri_id = $1 ORDER BY sira`,
    [kaynakIsEmriId, yeniIsEmriId, kisiId],
  );
}

// Ek adımın şartnamesi silinip yeniden yazılır; aynı iş emrine gelen iki komut bu kilitle sıraya girer (satırı olmayan iş emri de).
export async function isEmriSabitKilidi(db: Db, isEmriId: number): Promise<void> {
  await db.sorgu("SELECT pg_advisory_xact_lock(hashtext('rota_is_emri_sartnamesi'), $1)", [isEmriId]);
}

// Yalnız başlamamış iş emri yeniden sabitlenir (yürürlükteki rotayı emre uygulama); satır değişmez, silinip yeniden yazılır.
export async function isEmriSabitleriniSil(db: Db, isEmriIdleri: readonly number[]): Promise<void> {
  await db.sorgu('DELETE FROM rota_is_emri_sartnamesi WHERE is_emri_id = ANY($1::int[])', [[...isEmriIdleri]]);
}

export interface SabitSatiri {
  isEmriId: number; sira: number; surumId: number; sartnameId: number; kod: string; ad: string; degerler: ParametreDegerleri;
  sabitleyenKisiId: number; sabitlenme: string;
}
export const isEmriSabitleri = (db: Db, isEmriIdleri: readonly number[]): Promise<SabitSatiri[]> =>
  db.sorgu<SabitSatiri>(
    `SELECT x.is_emri_id AS "isEmriId", x.sira, x.surum_id AS "surumId", s.id AS "sartnameId", s.kod, s.ad, x.degerler,
            x.sabitleyen_kisi_id AS "sabitleyenKisiId", ${ISO('x.sabitlenme')} AS sabitlenme
       FROM rota_is_emri_sartnamesi x JOIN rota_islem_sartnamesi_surumu v ON v.id = x.surum_id JOIN rota_islem_sartnamesi s ON s.id = v.sartname_id
      WHERE x.is_emri_id = ANY($1::int[]) ORDER BY x.is_emri_id, x.sira`,
    [[...isEmriIdleri]],
  );
