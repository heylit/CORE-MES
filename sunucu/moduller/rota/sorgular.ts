import type { Db } from '#cekirdek/db.ts';
import { islemKilidiAl } from '#cekirdek/kilit.ts';
import type {
  Bagimlilik, EkipmanAsamasi, EkipmanTuru, GerceklesenKaynagi, GerceklesenTuru, IlkParcaSecimi, MakineKullanimi, ParametreDegeri, ParametreDegerleri, ParametreTuru, RevizyonDurumu, RevizyonOzeti, SartnameKapsami, TalimatAsamasi,
} from '#paylasilan/sozlesme/rota.ts';
import { MALZEME_KARTI_IZ_YOLU, malzemeKartiIzParametreleri, type MalzemeKartiAnahtari, type MalzemeKartiIzi } from '#paylasilan/malzeme-karti-izi.ts';

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
  geriGondermeNedeni: string | null;
}

const SATIR = `${OZET}, r.malzeme_id AS "malzemeId", r.kaynak_revizyon_id AS "kaynakRevizyonId", k.harf AS "kaynakHarf",
  r.acan_kisi_id AS "acanKisiId", r.gonderen_kisi_id AS "gonderenKisiId", ${ISO('r.gonderme')} AS gonderme,
  r.onaylayan_kisi_id AS "onaylayanKisiId", r.dort_gozsuz_onay AS "dortGozsuzOnay",
  r.yururluge_alan_kisi_id AS "yururlugeAlanKisiId", r.iptal_eden_kisi_id AS "iptalEdenKisiId", ${ISO('r.iptal_etme')} AS "iptalEtme",
  r.geri_gonderme_nedeni AS "geriGondermeNedeni",
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
export interface DurumRevizyonSatiri extends RevizyonOzeti { malzemeId: number; geriGondermeNedeni: string | null }
export function iptalsizRevizyonlar(db: Db, malzemeId: number | null = null): Promise<DurumRevizyonSatiri[]> {
  return db.sorgu<DurumRevizyonSatiri>(
    `SELECT ${OZET}, r.malzeme_id AS "malzemeId", r.geri_gonderme_nedeni AS "geriGondermeNedeni" FROM rota_revizyonu r WHERE r.durum <> 'iptal' AND ($1::int IS NULL OR r.malzeme_id = $1) ORDER BY r.malzeme_id, r.id`,
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
// 2681 (2682 a): firması seçilmemiş fason adımın id'si null'dır (sütun fason_firmasiz). Fason olup olmadığı yalnız `fasonMu`'dan okunur.
export type AdimKaynagi = { tur: 'makine' | 'kisi' | 'istasyon' | 'fason'; id: number } | { tur: 'fason'; id: null };
interface KaynakSutunlari { makineId: number | null; kisiId: number | null; istasyonId: number | null }
const kaynakCoz = (r: KaynakSutunlari): Kaynak | null =>
  r.makineId !== null ? { tur: 'makine', id: r.makineId } : r.kisiId !== null ? { tur: 'kisi', id: r.kisiId }
    : r.istasyonId !== null ? { tur: 'istasyon', id: r.istasyonId } : null;
const adimKaynagiCoz = (r: KaynakSutunlari & { fasonFirmaId: number | null; fasonFirmasiz: boolean }): AdimKaynagi | null =>
  kaynakCoz(r) ?? (r.fasonFirmaId !== null ? { tur: 'fason', id: r.fasonFirmaId } : r.fasonFirmasiz ? { tur: 'fason', id: null } : null);
const makineSutunu = (k: AdimKaynagi | null) => (k?.tur === 'makine' ? k.id : null);
const kisiSutunu = (k: AdimKaynagi | null) => (k?.tur === 'kisi' ? k.id : null);
const istasyonSutunu = (k: AdimKaynagi | null) => (k?.tur === 'istasyon' ? k.id : null);
const fasonSutunu = (k: AdimKaynagi | null) => (k?.tur === 'fason' ? k.id : null);
const firmasizSutunu = (k: AdimKaynagi | null) => k?.tur === 'fason' && k.id === null;

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
  // Hazırlık süresi (ayarSuresiDk) hazırlık ile ayarın toplamıdır; ayar süresi yalnız ayar işaretliyken vardır (1310 a).
  hazirlikDk: string | null;
  ayar: boolean;
  ayarDk: string | null;
  // Çok dallı rota (1248 a): satırı olmayan adım ana hattadır (dal null) ve birleştirme yapmaz.
  dal: string | null;
  birlesen: string[];
  // Dal çarpanı (1257 a): bir mamul için bu adımda işlenen adet; boş 1'dir.
  adetCarpani: number | null;
}

export interface AdaySatiri {
  adimId: number; kaynak: Kaynak; ayarSuresiDk: string | null; birimSureDk: string | null; islemSuresiDk: string | null; degisimSuresiDk: string | null;
}
export interface BilesenSatiri { adimId: number; malzemeId: number; miktar: string; fireYuzde: string }
export interface YanUrunSatiri { adimId: number; malzemeId: number; miktar: string }
// Adım ekipmanı (2893-4 a): aparatta malzemeId, ölçü aletinde aletTuruId doludur.
// 3199: adet ve aşama planın ikincil kaynak isteğidir; ölçü aletinde 1 ve 'ayar_isleme' kalır (plan okumaz).
export interface EkipmanYazimi {
  tur: EkipmanTuru; malzemeId: number | null; aletTuruId: number | null; aciklama: string | null; adet: number; asama: EkipmanAsamasi;
}
export interface EkipmanSatiri extends EkipmanYazimi { adimId: number }

export interface Icerik {
  adimlar: AdimSatiri[];
  adaylar: AdaySatiri[];
  bilesenler: BilesenSatiri[];
  yanUrunler: YanUrunSatiri[];
  // Okuma her zaman doldurur; boş içerik yazan yerler alanı vermeyebilir.
  ekipman?: EkipmanSatiri[];
}

export async function icerikOku(db: Db, revizyonId: number): Promise<Icerik> {
  return (await iceriklerOku(db, [revizyonId])).get(revizyonId) ?? { adimlar: [], adaylar: [], bilesenler: [], yanUrunler: [] };
}

// Birden çok revizyonun içeriği, revizyon sayısından bağımsız dört sorguyla; içeriği olmayan revizyon haritada yer almaz.
export async function iceriklerOku(db: Db, revizyonIdleri: readonly number[]): Promise<Map<number, Icerik>> {
  const adimHam = await db.sorgu<Omit<AdimSatiri, 'kaynak'> & KaynakSutunlari & { fasonFirmaId: number | null; fasonFirmasiz: boolean; revizyonId: number }>(
    `SELECT revizyon_id AS "revizyonId", id, op_no AS "opNo", sira, operasyon_tipi_id AS "operasyonTipiId", ad, makine_id AS "makineId", kisi_id AS "kisiId",
            istasyon_id AS "istasyonId", fason_firma_id AS "fasonFirmaId", fason_firmasiz AS "fasonFirmasiz", ayar_suresi_dk AS "ayarSuresiDk", birim_sure_dk AS "birimSureDk", termin_gun AS "terminGun",
            islem_suresi_dk AS "islemSuresiDk", degisim_suresi_dk AS "degisimSuresiDk",
            bagimlilik, devir_adedi AS "devirAdedi",
            fire_payi_yuzde AS "firePayiYuzde", makine_kullanimi AS "makineKullanimi", en_kucuk_parca AS "enKucukParca",
            yeniden_ayar AS "yenidenAyar", ilk_parca AS "ilkParca", hazirlik_dk AS "hazirlikDk", ayar, ayar_dk AS "ayarDk",
            d.dal, coalesce(d.birlesen, '{}') AS birlesen, d.adet_carpani AS "adetCarpani"
       FROM rota_adimi LEFT JOIN rota_adim_dali d ON d.adim_id = rota_adimi.id
      WHERE revizyon_id = ANY($1::int[]) ORDER BY revizyon_id, sira`,
    [revizyonIdleri],
  );
  const sonuc = new Map<number, Icerik>();
  const adimRevizyonu = new Map<number, Icerik>();
  for (const { revizyonId, makineId, kisiId, istasyonId, fasonFirmaId, fasonFirmasiz, ...a } of adimHam) {
    let icerik = sonuc.get(revizyonId);
    if (!icerik) sonuc.set(revizyonId, icerik = { adimlar: [], adaylar: [], bilesenler: [], yanUrunler: [], ekipman: [] });
    icerik.adimlar.push({ ...a, kaynak: adimKaynagiCoz({ makineId, kisiId, istasyonId, fasonFirmaId, fasonFirmasiz }) });
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
  const ekipman = await db.sorgu<EkipmanSatiri>(
    `SELECT adim_id AS "adimId", tur, malzeme_id AS "malzemeId", alet_turu_id AS "aletTuruId", aciklama, adet, asama
       FROM rota_adim_ekipmani WHERE adim_id = ANY($1::int[]) ORDER BY adim_id, sira`,
    [kimlikler],
  );
  for (const x of yanUrunler) adimRevizyonu.get(x.adimId)!.yanUrunler.push(x);
  for (const x of ekipman) adimRevizyonu.get(x.adimId)!.ekipman!.push(x);
  return sonuc;
}

export function aparatKullanimi(db: Db): Promise<{ malzemeId: number; adim: number }[]> {
  return db.sorgu<{ malzemeId: number; adim: number }>(
    `SELECT e.malzeme_id AS "malzemeId", count(DISTINCT e.adim_id)::int AS adim
       FROM rota_adim_ekipmani e
       JOIN rota_adimi a ON a.id = e.adim_id
       JOIN rota_revizyonu r ON r.id = a.revizyon_id
      WHERE e.tur = 'aparat' AND r.durum IN ('yururlukte', 'taslak', 'onay_bekliyor')
      GROUP BY e.malzeme_id
      ORDER BY e.malzeme_id`,
  );
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
  await db.sorgu(`DELETE FROM rota_adim_ekipmani WHERE adim_id IN (${adim})`, [revizyonId]);
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
  hazirlikDk: number | string | null;
  ayar: boolean;
  ayarDk: number | string | null;
  adaylar: readonly {
    kaynak: Kaynak; ayarSuresiDk: number | string | null; birimSureDk: number | string | null; islemSuresiDk: number | string | null;
    degisimSuresiDk: number | string | null;
  }[];
  bilesenler: readonly { malzemeId: number; miktar: number | string; fireYuzde: number | string }[];
  yanUrunler: readonly { malzemeId: number; miktar: number | string }[];
  dal: string | null;
  birlesen: readonly string[];
  adetCarpani: number | null;
  ekipman?: readonly EkipmanYazimi[];
}

export async function adimYaz(db: Db, revizyonId: number, malzemeId: number, a: AdimYazimi): Promise<void> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO rota_adimi (revizyon_id, malzeme_id, op_no, sira, operasyon_tipi_id, ad, makine_id, kisi_id, fason_firma_id, ayar_suresi_dk,
                             birim_sure_dk, termin_gun, bagimlilik, devir_adedi, fire_payi_yuzde, makine_kullanimi, en_kucuk_parca, yeniden_ayar,
                             islem_suresi_dk, degisim_suresi_dk, istasyon_id, ilk_parca, hazirlik_dk, ayar, ayar_dk, fason_firmasiz)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26) RETURNING id`,
    [revizyonId, malzemeId, a.opNo, a.sira, a.operasyonTipiId, a.ad, makineSutunu(a.kaynak), kisiSutunu(a.kaynak), fasonSutunu(a.kaynak),
      a.ayarSuresiDk, a.birimSureDk, a.terminGun, a.bagimlilik, a.devirAdedi, a.firePayiYuzde, a.makineKullanimi, a.enKucukParca, a.yenidenAyar,
      a.islemSuresiDk, a.degisimSuresiDk, istasyonSutunu(a.kaynak), a.ilkParca, a.hazirlikDk, a.ayar, a.ayarDk, firmasizSutunu(a.kaynak)],
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
    await db.sorgu('INSERT INTO rota_adim_dali (adim_id, dal, birlesen, adet_carpani) VALUES ($1, $2, $3::text[], $4)', [adimId, a.dal, [...a.birlesen], a.adetCarpani]);
  }
  await ekipmanEkle(db, adimId, a.ekipman ?? []);
}

async function ekipmanEkle(db: Db, adimId: number, ekipman: readonly EkipmanYazimi[]): Promise<void> {
  if (ekipman.length === 0) return;
  await db.sorgu(
    `INSERT INTO rota_adim_ekipmani (adim_id, sira, tur, malzeme_id, alet_turu_id, aciklama, adet, asama)
     SELECT $1, * FROM unnest($2::int[], $3::text[], $4::int[], $5::int[], $6::text[], $7::int[], $8::text[])`,
    [adimId, ekipman.map((_, i) => i + 1), ekipman.map((x) => x.tur), ekipman.map((x) => x.malzemeId), ekipman.map((x) => x.aletTuruId), ekipman.map((x) => x.aciklama), ekipman.map((x) => x.adet), ekipman.map((x) => x.asama)],
  );
}

// Adımın listesi bütün olarak yeniden yazılır (tetikleyici taslağı denetler).
export async function adimEkipmaniniYaz(db: Db, adimId: number, ekipman: readonly EkipmanYazimi[]): Promise<void> {
  await db.sorgu('DELETE FROM rota_adim_ekipmani WHERE adim_id = $1', [adimId]);
  await ekipmanEkle(db, adimId, ekipman);
}

// İş emrinin ekipman kopyası (2893-4 a): emir açılırken rota adımından, bölünen kolda kaynak iş emrinden; liste bir kez yazılır.
export async function isEmriEkipmaniYaz(db: Db, isEmriId: number, ekipman: readonly EkipmanYazimi[]): Promise<void> {
  if (ekipman.length === 0) return;
  await db.sorgu(
    `INSERT INTO rota_is_emri_ekipmani (is_emri_id, sira, tur, malzeme_id, alet_turu_id, aciklama, adet, asama)
     SELECT $1, * FROM unnest($2::int[], $3::text[], $4::int[], $5::int[], $6::text[], $7::int[], $8::text[]) ON CONFLICT (is_emri_id, sira) DO NOTHING`,
    [isEmriId, ekipman.map((_, i) => i + 1), ekipman.map((x) => x.tur), ekipman.map((x) => x.malzemeId), ekipman.map((x) => x.aletTuruId), ekipman.map((x) => x.aciklama), ekipman.map((x) => x.adet), ekipman.map((x) => x.asama)],
  );
}

export async function isEmriEkipmaniniKopyala(db: Db, kaynakIsEmriId: number, hedefIsEmriId: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO rota_is_emri_ekipmani (is_emri_id, sira, tur, malzeme_id, alet_turu_id, aciklama, adet, asama)
     SELECT $2, sira, tur, malzeme_id, alet_turu_id, aciklama, adet, asama FROM rota_is_emri_ekipmani WHERE is_emri_id = $1 ON CONFLICT (is_emri_id, sira) DO NOTHING`,
    [kaynakIsEmriId, hedefIsEmriId],
  );
}

export interface IsEmriEkipmanSatiri extends EkipmanYazimi { isEmriId: number }
export function isEmriEkipmanlari(db: Db, isEmriIdleri: readonly number[]): Promise<IsEmriEkipmanSatiri[]> {
  return db.sorgu<IsEmriEkipmanSatiri>(
    `SELECT is_emri_id AS "isEmriId", tur, malzeme_id AS "malzemeId", alet_turu_id AS "aletTuruId", aciklama, adet, asama
       FROM rota_is_emri_ekipmani WHERE is_emri_id = ANY($1::int[]) ORDER BY is_emri_id, sira`,
    [[...isEmriIdleri]],
  );
}

/* ---------------- OP numarası ---------------- */

export async function kullanilmisOpNolari(db: Db, malzemeId: number): Promise<number[]> {
  return (await db.sorgu<{ opNo: number }>('SELECT op_no AS "opNo" FROM rota_op_numarasi WHERE malzeme_id = $1', [malzemeId])).map((s) => s.opNo);
}

export async function opNumaralari(db: Db, malzemeId: number): Promise<{ opNo: number; ilkRevizyonId: number; ilkRevizyonHarfi: string }[]> {
  return db.sorgu(
    `SELECT t.op_no AS "opNo", t.ilk_revizyon_id AS "ilkRevizyonId", r.harf AS "ilkRevizyonHarfi"
       FROM rota_op_numarasi t JOIN rota_revizyonu r ON r.id = t.ilk_revizyon_id
      WHERE t.malzeme_id = $1 ORDER BY t.op_no`,
    [malzemeId],
  );
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
  surumArtir(db, id, "durum = 'onay_bekliyor', gonderen_kisi_id = $2, gonderme = now(), geri_gonderme_nedeni = NULL", [kisiId]);

export const geriGonderYaz = (db: Db, id: number, neden: string): Promise<number> =>
  surumArtir(db, id, "durum = 'taslak', geri_gonderme_nedeni = $2", [neden]);

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

export interface TalimatAdimiSatiri { sahipId: number; sira: number; baslik: string; metin: string | null; kontrolTuru: string; kontrolAyari: Record<string, unknown>; zorunlu: boolean; asama: TalimatAsamasi; hedefSureDk: number | null }
export interface MedyaYazisi { ozet: string; ad: string; tur: 'resim' | 'video'; boyut: number }
export interface TalimatAdimiYazisi {
  baslik: string; metin: string | null; kontrolTuru: string; kontrolAyari: Record<string, unknown>; zorunlu: boolean; medya: readonly MedyaYazisi[];
  asama: TalimatAsamasi; hedefSureDk: number | null;
}
export interface MedyaSatiri extends MedyaYazisi { sahipId: number; adimSira: number }

const ADIM_SUTUNLARI = `sira, baslik, metin, kontrol_turu AS "kontrolTuru", kontrol_ayari AS "kontrolAyari", zorunlu, asama, hedef_sure_dk AS "hedefSureDk"`;

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
    `INSERT INTO ${tablo} (${sahipSutunu}, sira, baslik, metin, kontrol_turu, kontrol_ayari, zorunlu, asama, hedef_sure_dk)
     SELECT $1, x.sira, x.baslik, x.metin, x.kontrol_turu, x.kontrol_ayari, x.zorunlu, x.asama, x.hedef_sure_dk
       FROM jsonb_to_recordset($2::jsonb)
         AS x (sira int, baslik text, metin text, kontrol_turu text, kontrol_ayari jsonb, zorunlu boolean, asama text, hedef_sure_dk int)`,
    [sahipId, JSON.stringify(adimlar.map((a, i) => ({
      sira: i + 1, baslik: a.baslik, metin: a.metin, kontrol_turu: a.kontrolTuru, kontrol_ayari: a.kontrolAyari, zorunlu: a.zorunlu, asama: a.asama,
      hedef_sure_dk: a.hedefSureDk,
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
): Promise<number> {
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
  return id;
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

/* ---------------- talimatın şablon kökeni (2588 a) ---------------- */

export interface KokenSatiri { sahipId: number; sablonId: number; sablonKodu: string; sablonAdi: string; sablonSurum: number }
export interface KokenYazisi { sablonId: number; sablonSurum: number }

export function talimatKokenleri(db: Db, talimatIdleri: readonly number[]): Promise<KokenSatiri[]> {
  return db.sorgu<KokenSatiri>(
    `SELECT k.talimat_id AS "sahipId", k.sablon_id AS "sablonId", s.kod AS "sablonKodu", s.ad AS "sablonAdi", k.sablon_surum AS "sablonSurum"
       FROM rota_talimat_kokeni k JOIN rota_talimat_sablonu s ON s.id = k.sablon_id WHERE k.talimat_id = ANY($1::int[])`,
    [[...talimatIdleri]],
  );
}

export function taslakKokeni(db: Db, taslakId: number): Promise<KokenSatiri | null> {
  return db.tek<KokenSatiri>(
    `SELECT k.taslak_id AS "sahipId", k.sablon_id AS "sablonId", s.kod AS "sablonKodu", s.ad AS "sablonAdi", k.sablon_surum AS "sablonSurum"
       FROM rota_talimat_taslak_kokeni k JOIN rota_talimat_sablonu s ON s.id = k.sablon_id WHERE k.taslak_id = $1`,
    [taslakId],
  );
}

export async function talimatKokeniYaz(db: Db, talimatId: number, k: KokenYazisi): Promise<void> {
  await db.sorgu('INSERT INTO rota_talimat_kokeni (talimat_id, sablon_id, sablon_surum) VALUES ($1, $2, $3)', [talimatId, k.sablonId, k.sablonSurum]);
}

// Taslağın kökeni kayıtla değişebilir: null kökeni kaldırır.
export async function taslakKokeniYaz(db: Db, taslakId: number, k: KokenYazisi | null): Promise<void> {
  await db.sorgu('DELETE FROM rota_talimat_taslak_kokeni WHERE taslak_id = $1', [taslakId]);
  if (k) await db.sorgu('INSERT INTO rota_talimat_taslak_kokeni (taslak_id, sablon_id, sablon_surum) VALUES ($1, $2, $3)', [taslakId, k.sablonId, k.sablonSurum]);
}

export interface SablonKopyasiSatiri {
  malzemeId: number; opNo: number; talimatSurumu: number | null; taslak: boolean; sablonSurumu: number; gecerli: boolean;
}

// Şablondan kopyalanan talimat sürümleri ve taslaklar; gecerli: sürüm OP'nin son yayınıdır (taslakta false).
export function sablonKopyalari(db: Db, sablonId: number): Promise<SablonKopyasiSatiri[]> {
  return db.sorgu<SablonKopyasiSatiri>(
    `SELECT t.malzeme_id AS "malzemeId", t.op_no AS "opNo", t.surum AS "talimatSurumu", false AS taslak, k.sablon_surum AS "sablonSurumu",
            t.surum = (SELECT max(x.surum) FROM rota_talimati x WHERE x.malzeme_id = t.malzeme_id AND x.op_no = t.op_no) AS gecerli
       FROM rota_talimat_kokeni k JOIN rota_talimati t ON t.id = k.talimat_id WHERE k.sablon_id = $1
     UNION ALL
     SELECT t.malzeme_id, t.op_no, NULL, true, k.sablon_surum, false
       FROM rota_talimat_taslak_kokeni k JOIN rota_talimat_taslagi t ON t.id = k.taslak_id WHERE k.sablon_id = $1
     ORDER BY 1, 2, 4 DESC, 3 DESC`,
    [sablonId],
  );
}

/* ---------------- talimat şablonu (989 a) ---------------- */

export interface TalimatSablonSatiri {
  id: number; kod: string; ad: string; sartnameId: number | null; sartnameKodu: string | null; sartnameAdi: string | null; aktif: boolean; surum: number; adimSayisi: number;
  kontrolSayisi: number; resimSayisi: number; videoSayisi: number; operasyonTipiId: number | null; emreGelir: boolean;
}

export function talimatSablonlari(db: Db, idler: readonly number[] | null = null): Promise<TalimatSablonSatiri[]> {
  return db.sorgu<TalimatSablonSatiri>(
    `SELECT t.id, t.kod, t.ad, t.sartname_id AS "sartnameId", s.kod AS "sartnameKodu", s.ad AS "sartnameAdi", t.aktif, t.surum,
            t.operasyon_tipi_id AS "operasyonTipiId", t.emre_gelir AS "emreGelir",
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

export async function talimatSablonEkle(
  db: Db, g: { kod: string; ad: string; sartnameId: number | null; operasyonTipiId: number | null; emreGelir: boolean },
): Promise<number> {
  return (await db.tek<{ id: number }>(
    'INSERT INTO rota_talimat_sablonu (kod, ad, sartname_id, operasyon_tipi_id, emre_gelir) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [g.kod, g.ad, g.sartnameId, g.operasyonTipiId, g.emreGelir],
  ))!.id;
}

export async function talimatSablonGuncelle(
  db: Db, id: number, g: { ad: string; sartnameId: number | null; operasyonTipiId: number | null; emreGelir: boolean },
): Promise<void> {
  await db.sorgu(
    'UPDATE rota_talimat_sablonu SET ad = $2, sartname_id = $3, operasyon_tipi_id = $4, emre_gelir = $5, surum = surum + 1 WHERE id = $1',
    [id, g.ad, g.sartnameId, g.operasyonTipiId, g.emreGelir],
  );
}

// 3249 b: emre gelen aktif şablonların kimliği, operasyon tipine göre (tip başına en çok bir, kısmi tekil dizin).
export function emreGelenSablonlar(db: Db, operasyonTipiIdleri: readonly number[]): Promise<{ id: number; operasyonTipiId: number }[]> {
  return db.sorgu<{ id: number; operasyonTipiId: number }>(
    `SELECT id, operasyon_tipi_id AS "operasyonTipiId" FROM rota_talimat_sablonu
      WHERE emre_gelir AND aktif AND operasyon_tipi_id = ANY($1::int[])`,
    [[...operasyonTipiIdleri]],
  );
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
  await islemKilidiAl(db, `rota_gerceklesen_sure:${malzemeId}:${opNo}`);
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
  await islemKilidiAl(db, 'rota_is_emri_sartnamesi', isEmriId);
}

// Yalnız başlamamış iş emri yeniden sabitlenir (yürürlükteki rotayı emre uygulama); satır değişmez, silinip yeniden yazılır.
export async function isEmriSabitleriniSil(db: Db, isEmriIdleri: readonly number[]): Promise<void> {
  await db.sorgu('DELETE FROM rota_is_emri_sartnamesi WHERE is_emri_id = ANY($1::int[])', [[...isEmriIdleri]]);
}
// Rota yeniden uygulanınca bekleyen iş emrinin aparat/ölçü aleti kopyası silinip yeni revizyondan yazılır (kopya UPDATE almaz; silme serbest).
export async function isEmriEkipmaniniSil(db: Db, isEmriIdleri: readonly number[]): Promise<void> {
  await db.sorgu('DELETE FROM rota_is_emri_ekipmani WHERE is_emri_id = ANY($1::int[])', [[...isEmriIdleri]]);
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

/* ---------------- patlamış rota (1476) ---------------- */

export interface PatlatmaSatiri {
  sira: number; dugum: string; katman: number; malzemeId: number; revizyonId: number; rotaAdimiId: number; kaynakOpNo: number;
  birimCarpani: string; tuketenDugum: string | null; tuketenOpNo: number | null;
}
export interface PatlatmaBasligi { id: number; kokMalzemeId: number; kokRevizyonId: number; kisiId: number; zaman: string }

// Patlatma değişmez: aynı kök revizyon ve aynı özet varsa var olan kimlik döner, satırlar yeniden yazılmaz. Eşzamanlı iki yazımda
// ikincisi tekillik kısıtında bekler ve var olanı okur.
export async function patlatmaYaz(
  db: Db, g: { kokMalzemeId: number; kokRevizyonId: number; ozet: string; kisiId: number },
  satirlar: readonly (Omit<PatlatmaSatiri, 'birimCarpani'> & { birimCarpani: number })[],
): Promise<number> {
  const yeni = await db.tek<{ id: number }>(
    `INSERT INTO rota_patlatma (kok_malzeme_id, kok_rota_revizyonu_id, ozet, kisi_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (kok_rota_revizyonu_id, ozet) DO NOTHING RETURNING id`,
    [g.kokMalzemeId, g.kokRevizyonId, g.ozet, g.kisiId]);
  if (yeni === null) {
    const onceki = await db.tek<{ id: number }>('SELECT id FROM rota_patlatma WHERE kok_rota_revizyonu_id = $1 AND ozet = $2', [g.kokRevizyonId, g.ozet]);
    return onceki!.id;
  }
  await db.sorgu(
    `INSERT INTO rota_patlamis_rota (patlatma_id, sira, dugum, katman, malzeme_id, rota_revizyonu_id, rota_adimi_id, kaynak_op_no, birim_carpani, tuketen_dugum, tuketen_op_no)
     SELECT $1, x.sira, x.dugum, x.katman, x.malzeme_id, x.rota_revizyonu_id, x.rota_adimi_id, x.kaynak_op_no, x.birim_carpani, x.tuketen_dugum, x.tuketen_op_no
       FROM jsonb_to_recordset($2::jsonb) AS x(sira int, dugum text, katman int, malzeme_id int, rota_revizyonu_id int, rota_adimi_id int, kaynak_op_no int,
            birim_carpani numeric, tuketen_dugum text, tuketen_op_no int)`,
    [yeni.id, JSON.stringify(satirlar.map((x) => ({
      sira: x.sira, dugum: x.dugum, katman: x.katman, malzeme_id: x.malzemeId, rota_revizyonu_id: x.revizyonId, rota_adimi_id: x.rotaAdimiId,
      kaynak_op_no: x.kaynakOpNo, birim_carpani: x.birimCarpani, tuketen_dugum: x.tuketenDugum, tuketen_op_no: x.tuketenOpNo,
    })))]);
  return yeni.id;
}

export function patlatmaBasligiOku(db: Db, id: number): Promise<PatlatmaBasligi | null> {
  return db.tek<PatlatmaBasligi>(
    `SELECT id, kok_malzeme_id AS "kokMalzemeId", kok_rota_revizyonu_id AS "kokRevizyonId", kisi_id AS "kisiId", ${ISO('zaman')} AS zaman
       FROM rota_patlatma WHERE id = $1`, [id]);
}

export function patlatmaSatirlariOku(db: Db, id: number): Promise<PatlatmaSatiri[]> {
  return db.sorgu<PatlatmaSatiri>(
    `SELECT sira, dugum, katman, malzeme_id AS "malzemeId", rota_revizyonu_id AS "revizyonId", rota_adimi_id AS "rotaAdimiId",
            kaynak_op_no AS "kaynakOpNo", birim_carpani::text AS "birimCarpani", tuketen_dugum AS "tuketenDugum", tuketen_op_no AS "tuketenOpNo"
       FROM rota_patlamis_rota WHERE patlatma_id = $1 ORDER BY sira`, [id]);
}

// Arşivdeki silinmiş malzeme kartlarının bu modüldeki izi (2114c); malzemeler kablolamadan okur.
export async function malzemeKartiIzleri(db: Db, kartlar: readonly MalzemeKartiAnahtari[]): Promise<MalzemeKartiIzi[]> {
  if (kartlar.length === 0) return [];
  return db.sorgu<MalzemeKartiIzi>(
    `WITH k AS (SELECT * FROM unnest($1::int[], $2::text[], $3::text[]) AS k(no, kod, kimlik))
     SELECT k.no, 'Rota adımı' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN rota_adimi t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Rota bileşeni' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN rota_bileseni t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Gerçekleşen süre' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN rota_gerceklesen_sure t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Rota kopya isteği (hedef)' AS kayit, 'kesin' AS tur, count(*)::int AS adet, NULL::text AS ornek
       FROM k JOIN rota_kopya_istegi t ON t.hedef_malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Rota kopya isteği (kaynak)' AS kayit, 'kesin' AS tur, count(*)::int AS adet, NULL::text AS ornek
       FROM k JOIN rota_kopya_istegi t ON t.kaynak_malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Op numarası' AS kayit, 'kesin' AS tur, count(*)::int AS adet, NULL::text AS ornek
       FROM k JOIN rota_op_numarasi t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Patlamış rota' AS kayit, 'kesin' AS tur, count(*)::int AS adet, NULL::text AS ornek
       FROM k JOIN rota_patlamis_rota t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Rota patlatma' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN rota_patlatma t ON t.kok_malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Rota revizyonu' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN rota_revizyonu t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Talimat taslağı' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN rota_talimat_taslagi t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Talimat' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN rota_talimati t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Yan ürün' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN rota_yan_urunu t ON t.malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Adım şartnamesi' AS kayit, 'olasi' AS tur, count(*)::int AS adet, NULL::text AS ornek
       FROM k JOIN rota_adim_sartnamesi t ON jsonb_path_exists(t.degerler, $4::jsonpath, jsonb_build_object('no', k.no, 'kod', k.kod, 'kimlik', k.kimlik)) GROUP BY k.no
      UNION ALL
     SELECT k.no, 'İş emri şartnamesi' AS kayit, 'olasi' AS tur, count(*)::int AS adet, NULL::text AS ornek
       FROM k JOIN rota_is_emri_sartnamesi t ON jsonb_path_exists(t.degerler, $4::jsonpath, jsonb_build_object('no', k.no, 'kod', k.kod, 'kimlik', k.kimlik)) GROUP BY k.no`,
    [...malzemeKartiIzParametreleri(kartlar), MALZEME_KARTI_IZ_YOLU],
  );
}

// Birden çok (malzeme, adım) için geçerli talimat tek sorguda: her anahtarın en yüksek sürümü (talimatlar() ilk satırıyla aynı).
export function gecerliTalimatlarToplu(db: Db, malzemeIdleri: readonly number[], opNolari: readonly number[]): Promise<{ malzemeId: number; opNo: number; surum: number; metin: string }[]> {
  return db.sorgu(
    `SELECT DISTINCT ON (t.malzeme_id, t.op_no) t.malzeme_id AS "malzemeId", t.op_no AS "opNo", t.surum, t.metin
       FROM rota_talimati t JOIN unnest($1::int[], $2::int[]) AS k(malzeme_id, op_no) ON t.malzeme_id = k.malzeme_id AND t.op_no = k.op_no
      ORDER BY t.malzeme_id, t.op_no, t.surum DESC`,
    [[...malzemeIdleri], [...opNolari]],
  );
}

/* ---------------- talimatın 3B sahnesi (3209 a) ---------------- */

export interface SahneSatiri {
  talimatSurum: number; sahneSurum: number; modelRevizyonId: number; adimlar: unknown; yazanKisiId: number; yazma: string;
}
const SAHNE = `talimat_surum AS "talimatSurum", sahne_surum AS "sahneSurum", model_revizyon_id AS "modelRevizyonId", adimlar,
  yazan_kisi_id AS "yazanKisiId", ${ISO('yazma')} AS yazma`;

// Her talimat sürümünün en son sahnesi; talimat sürümüne göre azalan.
export function sonSahneler(db: Db, malzemeId: number, opNo: number): Promise<SahneSatiri[]> {
  return db.sorgu<SahneSatiri>(
    `SELECT DISTINCT ON (talimat_surum) ${SAHNE} FROM rota_talimat_sahnesi WHERE malzeme_id = $1 AND op_no = $2
      ORDER BY talimat_surum DESC, sahne_surum DESC`,
    [malzemeId, opNo],
  );
}

export function sonSahne(db: Db, malzemeId: number, opNo: number, talimatSurum: number): Promise<SahneSatiri | null> {
  return db.tek<SahneSatiri>(
    `SELECT ${SAHNE} FROM rota_talimat_sahnesi WHERE malzeme_id = $1 AND op_no = $2 AND talimat_surum = $3 ORDER BY sahne_surum DESC LIMIT 1`,
    [malzemeId, opNo, talimatSurum],
  );
}

// Eşzamanlı iki kayıt aynı sahne sürümünü yazamaz: tekil kısıt (rota_talimat_sahnesi_surum_tekil) ikinciyi reddeder.
export async function sahneEkle(db: Db, x: {
  malzemeId: number; opNo: number; talimatSurum: number; sahneSurum: number; modelRevizyonId: number; adimlar: unknown; kisiId: number;
}): Promise<void> {
  await db.sorgu(
    `INSERT INTO rota_talimat_sahnesi (malzeme_id, op_no, talimat_surum, sahne_surum, model_revizyon_id, adimlar, yazan_kisi_id)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [x.malzemeId, x.opNo, x.talimatSurum, x.sahneSurum, x.modelRevizyonId, JSON.stringify(x.adimlar), x.kisiId],
  );
}
