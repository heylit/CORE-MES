import type { Db } from '#cekirdek/db.ts';
import type { KatilimKapanisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { ISO, NULLU_ISO, TARIH, TERMINAL_IS_EMRI } from '../ortak/sorgular.ts';

export interface ArsivSatiri {
  eskiDurum: string;
  istasyonId: number;
  baslama: string | null;
  bitis: string | null;
  saglamAdet: number | null;
}

export function arsivSatiri(db: Db, emirId: number): Promise<ArsivSatiri | null> {
  return db.tek<ArsivSatiri>(
    `SELECT eski_durum AS "eskiDurum", istasyon_id AS "istasyonId", ${NULLU_ISO('baslama')} AS baslama, ${NULLU_ISO('bitis')} AS bitis,
            saglam_adet AS "saglamAdet"
       FROM uretim_emirleri_arsiv WHERE emir_id = $1`,
    [emirId],
  );
}

export interface OzetSatiri {
  planlanacak: number;
  acik: number;
  kuyrugum: number;
  bugunSaglam: number | null;
  planda: number;
  uretimde: number;
  duraklatilmis: number;
  buHaftaBiten: number;
}

// Emir sayıları iş emirli listeyle aynı kümedir (arşivde olmayan, malzemeli). Kuyruk: kişiye atanmış, bitmemiş iş emirleri
// (açık emirde). Bugün: veritabanı oturumu tesis saat dilimindedir (#cekirdek/db.ts), current_date tesis günüdür.
export async function ozetGetir(db: Db, kisiId: number): Promise<OzetSatiri> {
  const satir = await db.tek<OzetSatiri>(
    `SELECT
       (SELECT count(*)::int FROM uretim_emri e WHERE NOT e.arsiv AND e.malzeme_no IS NOT NULL AND e.durum = 'taslak') AS planlanacak,
       (SELECT count(*)::int FROM uretim_emri e WHERE NOT e.arsiv AND e.malzeme_no IS NOT NULL AND e.durum IN ('planli', 'basladi')) AS acik,
       (SELECT count(*)::int FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id
         WHERE i.kisi_id = $1 AND i.durum <> 'tamam' AND NOT e.arsiv AND e.durum IN ('planli', 'basladi')) AS kuyrugum,
       (SELECT sum(s.adet)::int FROM uretim_sayimi s
         WHERE s.kisi_id = $1 AND s.tur = 'saglam' AND s.zaman >= current_date::timestamptz AND s.zaman < (current_date + 1)::timestamptz) AS "bugunSaglam",
       count(*) FILTER (WHERE a.durum = 'planli' AND NOT a.baslamis)::int AS planda,
       count(*) FILTER (WHERE (a.durum = 'basladi' AND a.calisma = 'calisiyor') OR (a.durum = 'planli' AND a.baslamis))::int AS uretimde,
       count(*) FILTER (WHERE a.durum = 'basladi' AND a.calisma <> 'calisiyor')::int AS duraklatilmis,
       count(*) FILTER (WHERE a.durum = 'bitti' AND a.bitis >= date_trunc('week', current_date)::timestamptz)::int AS "buHaftaBiten"
       FROM (SELECT e.durum, e.calisma, e.bitis,
                    EXISTS (SELECT 1 FROM uretim_emirleri_is_emri i WHERE i.uretim_emri_id = e.id AND i.durum <> 'bekliyor') AS baslamis
               FROM uretim_emri e WHERE NOT e.arsiv AND e.malzeme_no IS NOT NULL) a`,
    [kisiId],
  );
  if (satir === null) throw new Error('Özet okunamadı.');
  return satir;
}

// Gün sınırı veritabanı oturumunun dilimindedir (tesis saati); düzeltme satırları da sayılır, gün toplamı nettir.
export function gunlukUretimGetir(db: Db, gun: number): Promise<{ gun: string; saglam: number; hurda: number }[]> {
  return db.sorgu(
    `SELECT ${TARIH('s.zaman')} AS gun,
            COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'saglam'), 0)::int AS saglam,
            COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'hurda'), 0)::int AS hurda
       FROM uretim_sayimi s WHERE s.zaman >= (current_date - ($1::int - 1))::timestamptz
      GROUP BY 1 ORDER BY 1`,
    [gun],
  );
}

// Durdurma, aynı emrin aynı adımındaki zamanca sonraki olayına (devam) ya da bitirme kaydına kadar sürer; ikisi de yoksa şimdiye
// kadar. Paralel adımda (639) öteki adımın olayı bu adımın duruşunu kesmez.
// Sıra kimlikle değil zamanla bulunur: sonradan eklenmiş geçmiş tarihli satır öncekini kısaltamaz.
export function durusSureleriGetir(db: Db, gun: number): Promise<{ nedenId: number; adet: number; dakika: string }[]> {
  return db.sorgu(
    `SELECT d.durus_nedeni_id AS "nedenId", count(*)::int AS adet,
            round(sum(extract(epoch FROM (d.son - d.zaman)) / 60)::numeric, 2)::text AS dakika
       FROM (SELECT o.durus_nedeni_id, o.zaman,
                    LEAST(
                      COALESCE((SELECT min(n.zaman) FROM uretim_olayi n WHERE n.emir_id = o.emir_id AND n.is_emri_id IS NOT DISTINCT FROM o.is_emri_id
                                     AND (n.zaman, n.id) > (o.zaman, o.id) AND n.olay <> 'ayar'), 'infinity'),
                      COALESCE((SELECT min(k.zaman) FROM uretim_kaydi k WHERE k.emir_id = o.emir_id AND k.is_emri_id IS NOT DISTINCT FROM o.is_emri_id
                                     AND k.olay = 'bitir' AND k.zaman >= o.zaman), 'infinity'),
                      clock_timestamp()) AS son
               FROM uretim_olayi o
              WHERE o.olay = 'durdur' AND o.zaman >= (current_date - ($1::int - 1))::timestamptz) d
      GROUP BY d.durus_nedeni_id`,
    [gun],
  );
}

/* ---------------- Saat (pano) okumaları ---------------- */

// Bitmiş emrin istasyonu bitişte boşalır (emir artık sırada değil); istasyon emrin son bitirme kaydından alınır. Fasonla biten
// emrin terminal kaydı yoktur, istasyonu da yoktur.
export function bitenEmirler(
  db: Db, istasyonIdleri: readonly number[], baslangic: string, bitis: string,
): Promise<{ id: number; emirNo: string; istasyonId: number; bitis: string }[]> {
  return db.sorgu(
    `SELECT e.id, e.emir_no AS "emirNo", k.istasyon_id AS "istasyonId", ${ISO('e.bitis')} AS bitis
       FROM uretim_emri e
       JOIN LATERAL (SELECT istasyon_id FROM uretim_kaydi k WHERE k.emir_id = e.id AND k.olay = 'bitir' ORDER BY k.zaman DESC, k.id DESC LIMIT 1) k ON true
      WHERE e.durum = 'bitti' AND e.bitis >= $2::timestamptz AND e.bitis < $3::timestamptz AND k.istasyon_id = ANY($1::int[])
      ORDER BY e.bitis, e.id`,
    [[...istasyonIdleri], baslangic, bitis],
  );
}

// Yalnız duruş (durdur) sayılır; duraklatma operatörün iş arasıdır, makine kaybı değildir. Duruşun sonu durusSureleriGetir'deki
// gibidir; süre pencereyle kesişen kısmıdır (saniye).
export function istasyonDurusSureleri(
  db: Db, istasyonIdleri: readonly number[], baslangic: string, bitis: string,
): Promise<{ istasyonId: number; saniye: number }[]> {
  return db.sorgu(
    `SELECT d.istasyon_id AS "istasyonId",
            round(sum(extract(epoch FROM (LEAST(d.son, $3::timestamptz) - GREATEST(d.zaman, $2::timestamptz)))))::int AS saniye
       FROM (SELECT o.istasyon_id, o.zaman,
                    LEAST(
                      COALESCE((SELECT min(n.zaman) FROM uretim_olayi n WHERE n.emir_id = o.emir_id AND n.is_emri_id IS NOT DISTINCT FROM o.is_emri_id
                                     AND (n.zaman, n.id) > (o.zaman, o.id) AND n.olay <> 'ayar'), 'infinity'),
                      COALESCE((SELECT min(k.zaman) FROM uretim_kaydi k WHERE k.emir_id = o.emir_id AND k.is_emri_id IS NOT DISTINCT FROM o.is_emri_id
                                     AND k.olay = 'bitir' AND k.zaman >= o.zaman), 'infinity'),
                      clock_timestamp()) AS son
               FROM uretim_olayi o
              WHERE o.olay = 'durdur' AND o.istasyon_id = ANY($1::int[]) AND o.zaman < $3::timestamptz) d
      WHERE d.son > $2::timestamptz
      GROUP BY d.istasyon_id`,
    [[...istasyonIdleri], baslangic, bitis],
  );
}

// Emrin sıradaki işinin çalışmaya son geçişi: son başlatma ya da duraklatma/duruş sonrası son devam. Emir şu an duruyor olsa da
// döner; çalışıp çalışmadığı son olaydan okunur.
export function calismayaGecisAnlari(db: Db, emirIdleri: readonly number[]): Promise<{ emirId: number; an: string }[]> {
  return db.sorgu(
    `SELECT g.emir_id AS "emirId", ${ISO('max(g.zaman)')} AS an
       FROM (SELECT k.emir_id, k.zaman FROM uretim_kaydi k
              WHERE k.emir_id = ANY($1::int[]) AND k.olay = 'baslat' AND k.is_emri_id IS NOT DISTINCT FROM ${TERMINAL_IS_EMRI('k.emir_id')}
             UNION ALL
             SELECT o.emir_id, o.zaman FROM uretim_olayi o
              WHERE o.emir_id = ANY($1::int[]) AND o.olay = 'devam' AND o.is_emri_id IS NOT DISTINCT FROM ${TERMINAL_IS_EMRI('o.emir_id')}) g
      GROUP BY g.emir_id`,
    [[...emirIdleri]],
  );
}

// Örnek veri "yüklü mü" sorusu: ürünün arşiv dahil emir sayısı.
export async function malzemeninEmirSayisi(db: Db, malzemeNo: number): Promise<number> {
  return (await db.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri WHERE malzeme_no = $1', [malzemeNo]))?.n ?? 0;
}

export interface KullanimSatiri {
  id: number;
  emirId: number;
  emirNo: string;
  isEmriId: number | null;
  istasyonId: number;
  // null: makinesiz işin tuttuğu istasyon yeri.
  makineId: number | null;
  kisiId: number;
  baslama: string;
}

const KULLANIM = `k.id, k.emir_id AS "emirId", e.emir_no AS "emirNo", k.is_emri_id AS "isEmriId", k.istasyon_id AS "istasyonId",
  k.makine_id AS "makineId", k.kisi_id AS "kisiId", ${ISO('k.baslama')} AS baslama`;

// Yerin açık kullanımları: makineler verilirse o makineler, verilmezse istasyonun makinesiz yeri. `kilit` verilirse satırlar
// kilitlenir (devralma aynı satırı iki kez kapatmasın).
export function acikKullanimlar(db: Db, istasyonId: number, makineIdleri: readonly number[], kilit = false): Promise<KullanimSatiri[]> {
  const makineli = makineIdleri.length > 0;
  return db.sorgu<KullanimSatiri>(
    `SELECT ${KULLANIM} FROM uretim_emirleri_makine_kullanimi k JOIN uretim_emri e ON e.id = k.emir_id
      WHERE ${makineli ? 'k.makine_id = ANY($1::int[])' : 'k.istasyon_id = $1 AND k.makine_id IS NULL AND NOT k.havuz'} AND k.bitis IS NULL
      ORDER BY k.makine_id${kilit ? ' FOR UPDATE OF k' : ''}`,
    [makineli ? [...makineIdleri] : istasyonId],
  );
}

// Çalışan iş emirlerinin açık kullanımdaki makineleri, açılış sırasıyla (plan çalışan işi fiili makinede gösterir, 393 d).
export function acikMakineleriGetir(db: Db, isEmriIdleri: readonly number[]): Promise<{ isEmriId: number; makineId: number }[]> {
  if (isEmriIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu<{ isEmriId: number; makineId: number }>(
    `SELECT is_emri_id AS "isEmriId", makine_id AS "makineId" FROM uretim_emirleri_makine_kullanimi
      WHERE is_emri_id = ANY($1::int[]) AND makine_id IS NOT NULL AND bitis IS NULL ORDER BY baslama, id`,
    [[...isEmriIdleri]],
  );
}

export function kullanimBul(db: Db, id: number): Promise<KullanimSatiri | null> {
  return db.tek<KullanimSatiri>(
    `SELECT ${KULLANIM} FROM uretim_emirleri_makine_kullanimi k JOIN uretim_emri e ON e.id = k.emir_id
      WHERE k.id = $1 AND k.bitis IS NULL FOR UPDATE OF k`,
    [id],
  );
}

export async function emrinAcikKullanimSayisi(db: Db, emirId: number, isEmriId: number | null = null): Promise<number> {
  const satir = await db.tek<{ n: number }>(
    'SELECT count(*)::int AS n FROM uretim_emirleri_makine_kullanimi WHERE emir_id = $1 AND bitis IS NULL AND ($2::int IS NULL OR is_emri_id = $2)',
    [emirId, isEmriId],
  );
  return satir?.n ?? 0;
}

// havuz: insanlı istasyondaki makinesiz kullanım istasyonu kilitlemez (1891); dizin yalnız havuz olmayan makinesiz yeri tekil tutar.
export function kullanimAc(
  db: Db, emirId: number, isEmriId: number | null, istasyonId: number, makineId: number | null, kisiId: number, an: string, havuz = false,
): Promise<unknown> {
  return db.sorgu(
    `INSERT INTO uretim_emirleri_makine_kullanimi (emir_id, is_emri_id, istasyon_id, makine_id, kisi_id, baslama, havuz)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7)`,
    [emirId, isEmriId, istasyonId, makineId, kisiId, an, havuz],
  );
}

// Adım verilirse yalnız o adımın kullanımları kapanır: emrin öteki adımı kendi makinesinde sürer (639, 642). Adımsız eski satır her
// kapanışta kapanır (eski kural).
export function emrinKullanimlariniKapat(db: Db, emirId: number, kapatanId: number, an: string, isEmriId: number | null = null): Promise<unknown> {
  return db.sorgu(
    `UPDATE uretim_emirleri_makine_kullanimi SET bitis = GREATEST($3::timestamptz, baslama), kapatan_id = $2
      WHERE emir_id = $1 AND bitis IS NULL AND ($4::int IS NULL OR is_emri_id = $4 OR is_emri_id IS NULL)`,
    [emirId, kapatanId, an, isEmriId],
  );
}

export function kullanimKapat(db: Db, id: number, kapatanId: number, an: string): Promise<unknown> {
  return db.sorgu(
    `UPDATE uretim_emirleri_makine_kullanimi SET bitis = GREATEST($3::timestamptz, baslama), kapatan_id = $2 WHERE id = $1 AND bitis IS NULL`,
    [id, kapatanId, an],
  );
}

// Devamda iş, son kapanan makinelerinde sürer: aynı anda kapanan (son duraklatma ya da durdurmanın kapattığı) satırlar.
export async function sonKapananMakineler(db: Db, emirId: number, isEmriId: number | null): Promise<number[]> {
  const satirlar = await db.sorgu<{ makineId: number }>(
    `SELECT k.makine_id AS "makineId" FROM uretim_emirleri_makine_kullanimi k
      WHERE k.emir_id = $1 AND k.is_emri_id IS NOT DISTINCT FROM $2 AND k.makine_id IS NOT NULL AND k.bitis = (
        SELECT max(bitis) FROM uretim_emirleri_makine_kullanimi WHERE emir_id = $1 AND is_emri_id IS NOT DISTINCT FROM $2)
      ORDER BY k.makine_id`,
    [emirId, isEmriId],
  );
  return satirlar.map((s) => s.makineId);
}

export interface KatilimSatiri {
  id: number;
  kisiId: number;
  isEmriId: number | null;
  giris: string;
  cikis: string | null;
  kapanis: KatilimKapanisi | null;
}

const KATILIM = `k.id, k.kisi_id AS "kisiId", k.is_emri_id AS "isEmriId", ${ISO('k.giris')} AS giris, ${NULLU_ISO('k.cikis')} AS cikis, k.kapanis`;

export function katilimlarGetir(db: Db, emirId: number): Promise<KatilimSatiri[]> {
  return db.sorgu<KatilimSatiri>(`SELECT ${KATILIM} FROM uretim_emirleri_katilim k WHERE k.emir_id = $1 ORDER BY k.giris, k.id`, [emirId]);
}

// Kişinin bu emirdeki (adım verilirse o adımdaki) son aralığı (açık ya da kapalı), kilitli.
export function sonKatilim(db: Db, emirId: number, kisiId: number, isEmriId: number | null = null): Promise<KatilimSatiri | null> {
  return db.tek<KatilimSatiri>(
    `SELECT ${KATILIM} FROM uretim_emirleri_katilim k WHERE k.emir_id = $1 AND k.kisi_id = $2 AND ($3::int IS NULL OR k.is_emri_id = $3)
      ORDER BY k.giris DESC, k.id DESC LIMIT 1 FOR UPDATE`,
    [emirId, kisiId, isEmriId],
  );
}

export function katilimAc(db: Db, emirId: number, isEmriId: number | null, kisiId: number, istasyonId: number, an: string): Promise<unknown> {
  return db.sorgu(
    `INSERT INTO uretim_emirleri_katilim (emir_id, is_emri_id, kisi_id, istasyon_id, giris) VALUES ($1, $2, $3, $4, $5::timestamptz)`,
    [emirId, isEmriId, kisiId, istasyonId, an],
  );
}

// Kişinin emrin çalışan adımında (iş emirsiz emirde emrin kendisinde) başlatma ya da katılma aralığı var mı; aralık kapanmış olabilir.
export async function adimaKatildiMi(db: Db, emirId: number, kisiId: number, isEmriId: number | null = null): Promise<boolean> {
  const satir = await db.tek<{ var: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM uretim_emirleri_katilim k
        WHERE k.emir_id = $1 AND k.kisi_id = $2
          AND (k.is_emri_id IN (SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 AND durum = 'calisiyor' AND ($3::int IS NULL OR id = $3))
               OR (k.is_emri_id IS NULL AND NOT EXISTS (SELECT 1 FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1)))
     ) AS var`,
    [emirId, kisiId, isEmriId],
  );
  return satir?.var === true;
}

export function katilimKapat(db: Db, id: number, kapanis: KatilimKapanisi, an: string): Promise<unknown> {
  return db.sorgu(
    'UPDATE uretim_emirleri_katilim SET cikis = GREATEST($3::timestamptz, giris), kapanis = $2 WHERE id = $1 AND cikis IS NULL', [id, kapanis, an],
  );
}

// Duraklatılmış aralık kişi ayrılınca ayrılmış sayılır; yeni aralık açılmaz.
export function katilimAyrildi(db: Db, id: number): Promise<unknown> {
  return db.sorgu("UPDATE uretim_emirleri_katilim SET kapanis = 'ayril' WHERE id = $1 AND kapanis = 'duraklat'", [id]);
}

export function emrinKatilimlariniKapat(db: Db, emirId: number, an: string, isEmriId: number | null = null): Promise<unknown> {
  return db.sorgu(
    `UPDATE uretim_emirleri_katilim SET cikis = GREATEST($2::timestamptz, giris), kapanis = 'emir'
      WHERE emir_id = $1 AND cikis IS NULL AND ($3::int IS NULL OR is_emri_id = $3 OR is_emri_id IS NULL)`,
    [emirId, an, isEmriId],
  );
}
