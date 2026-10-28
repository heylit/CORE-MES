import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { SaklananTur } from './kurallar.ts';

export interface DosyaSatiri {
  ozet: string;
  boyut: number;
  tur: SaklananTur;
  ilk_yukleyen_id: number;
  depo: 'vt' | 'disk';
}

export interface BagSatiri {
  ozet: string;
  ad: string;
  boyut: number;
  tur: SaklananTur;
  belge_turu: string | null;
  ekleyen_id: number;
  zaman: string;
  depo: 'vt' | 'disk';
}

const BAG_ALANLARI = `b.ozet, b.ad, d.boyut, d.tur, b.belge_turu, b.ekleyen_id, ${zamanMetni('b.zaman')} AS zaman, d.depo`;

// Kişi içeriği kendisi gönderip özetini doğrulattı mı?
export async function yukleyenMi(db: Db, ozet: string, kisiId: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM dosya_yukleyeni WHERE ozet = $1 AND kisi_id = $2', [ozet, kisiId])) !== null;
}

export async function kendiYukledikleri(db: Db, ozetler: readonly string[], kisiId: number): Promise<string[]> {
  const satirlar = await db.sorgu<{ ozet: string }>('SELECT ozet FROM dosya_yukleyeni WHERE ozet = ANY($1) AND kisi_id = $2', [ozetler, kisiId]);
  return satirlar.map((s) => s.ozet);
}

// Var olan dosyayı ikinci kez yükleyen de yükleyen olur; bağsız dosyanın 7 günlük sayımı yeniden başlar (yeni yükleyen bağlayacak).
export async function yukleyenEkle(db: Db, ozet: string, kisiId: number): Promise<void> {
  await db.sorgu('INSERT INTO dosya_yukleyeni (ozet, kisi_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [ozet, kisiId]);
  await db.sorgu('UPDATE dosya SET bagsiz_zaman = now() WHERE ozet = $1 AND bagsiz_zaman IS NOT NULL', [ozet]);
}

// Kişinin yükleyip henüz hiçbir kayda bağlanmamış dosyaları (bagsiz_zaman doluysa bağı yoktur).
export async function kisiBagsizBayti(db: Db, kisiId: number): Promise<number> {
  const satir = await db.tek<{ bayt: number }>(
    `SELECT coalesce(sum(d.boyut), 0)::float8 AS bayt FROM dosya d JOIN dosya_yukleyeni y USING (ozet)
      WHERE y.kisi_id = $1 AND d.bagsiz_zaman IS NOT NULL`,
    [kisiId],
  );
  return satir?.bayt ?? 0;
}

export function dosyaBul(db: Db, ozet: string): Promise<DosyaSatiri | null> {
  return db.tek('SELECT ozet, boyut, tur, ilk_yukleyen_id, depo FROM dosya WHERE ozet = $1', [ozet]);
}

// Kişi başına işlem kilidi: eşzamanlı ilk parçalar kişi sınırını aşmaz. Özet kilidi yalnız tamamlamada alınır (önce kişi, sonra özet).
export async function kisiKilitle(db: Db, kisiId: number): Promise<void> {
  await db.sorgu('SELECT pg_advisory_xact_lock(hashtext($1))', [`dosya-yukleme-kisi-${kisiId}`]);
}

export async function ozetKilitle(db: Db, ozet: string): Promise<void> {
  await db.sorgu('SELECT pg_advisory_xact_lock(hashtext($1))', [`dosya-yukleme-ozet-${ozet}`]);
}

// Aynı parça yeniden gelirse (bağlantı kopup tekrar gönderildi) yenisi geçerlidir.
export async function parcaYaz(db: Db, ozet: string, kisiId: number, sira: number, toplam: number, icerik: Buffer): Promise<void> {
  await db.sorgu(
    `INSERT INTO dosya_yuklemesi (ozet, yukleyen_id, sira, toplam, icerik) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (ozet, yukleyen_id, sira) DO UPDATE SET toplam = EXCLUDED.toplam, icerik = EXCLUDED.icerik, zaman = now()`,
    [ozet, kisiId, sira, toplam, icerik],
  );
}

export async function serit(db: Db, ozet: string, kisiId: number): Promise<{ adet: number; bayt: number; toplamlar: number }> {
  const satir = await db.tek<{ adet: number; bayt: number; toplamlar: number }>(
    `SELECT count(*)::int AS adet, coalesce(sum(length(icerik)), 0)::float8 AS bayt, count(DISTINCT toplam)::int AS toplamlar
       FROM dosya_yuklemesi WHERE ozet = $1 AND yukleyen_id = $2`,
    [ozet, kisiId],
  );
  return satir ?? { adet: 0, bayt: 0, toplamlar: 0 };
}

export async function parcaBoyutu(db: Db, ozet: string, kisiId: number, sira: number): Promise<number> {
  const satir = await db.tek<{ boyut: number }>(
    'SELECT length(icerik)::float8 AS boyut FROM dosya_yuklemesi WHERE ozet = $1 AND yukleyen_id = $2 AND sira = $3', [ozet, kisiId, sira]);
  return satir?.boyut ?? 0;
}

export async function seritParcasi(db: Db, ozet: string, kisiId: number, sira: number): Promise<Buffer | null> {
  const satir = await db.tek<{ icerik: Buffer }>(
    'SELECT icerik FROM dosya_yuklemesi WHERE ozet = $1 AND yukleyen_id = $2 AND sira = $3', [ozet, kisiId, sira]);
  return satir?.icerik ?? null;
}

export async function kisiAcikYuklemeleri(db: Db, kisiId: number): Promise<{ adet: number; bayt: number }> {
  const satir = await db.tek<{ adet: number; bayt: number }>(
    `SELECT count(DISTINCT ozet)::int AS adet, coalesce(sum(length(icerik)), 0)::float8 AS bayt
       FROM dosya_yuklemesi WHERE yukleyen_id = $1`,
    [kisiId],
  );
  return satir ?? { adet: 0, bayt: 0 };
}

// Kişinin (verilen özet dışındaki) en eski açık yüklemesi.
export async function enEskiAcikYukleme(db: Db, kisiId: number, haricOzet: string): Promise<string | null> {
  const satir = await db.tek<{ ozet: string }>(
    'SELECT ozet FROM dosya_yuklemesi WHERE yukleyen_id = $1 AND ozet <> $2 GROUP BY ozet ORDER BY min(zaman), ozet LIMIT 1',
    [kisiId, haricOzet],
  );
  return satir?.ozet ?? null;
}

// Depo geneli: tamamlanmış dosyalar ve açık yüklemelerin parçaları.
export async function depoBayti(db: Db): Promise<number> {
  const satir = await db.tek<{ bayt: number }>(
    `SELECT (SELECT coalesce(sum(boyut), 0) FROM dosya)::float8
          + (SELECT coalesce(sum(length(icerik)), 0) FROM dosya_yuklemesi)::float8 AS bayt`,
  );
  return satir?.bayt ?? 0;
}

// Yalnız verilen kişinin şeridini siler.
export async function yuklemeyiAt(db: Db, ozet: string, kisiId: number): Promise<void> {
  await db.sorgu('DELETE FROM dosya_yuklemesi WHERE ozet = $1 AND yukleyen_id = $2', [ozet, kisiId]);
}

// Şerit parçaları dosya içeriğine olduğu gibi geçer: 200 MB'lık dosya uygulama belleğinden geçmez. Kopyalanan parça sayısı
// döner: özet denetiminden sonra şerit eksilmişse çağıran işlemi geri alır.
export async function dosyaEkle(db: Db, ozet: string, kisiId: number, boyut: number, tur: SaklananTur): Promise<number> {
  await db.sorgu('INSERT INTO dosya (ozet, boyut, tur, ilk_yukleyen_id) VALUES ($1, $2, $3, $4)', [ozet, boyut, tur, kisiId]);
  await db.sorgu('INSERT INTO dosya_yukleyeni (ozet, kisi_id) VALUES ($1, $2)', [ozet, kisiId]);
  const satir = await db.tek<{ adet: number }>(
    `WITH e AS (
       INSERT INTO dosya_icerigi (ozet, sira, icerik)
       SELECT ozet, sira, icerik FROM dosya_yuklemesi WHERE ozet = $1 AND yukleyen_id = $2
       RETURNING 1
     ) SELECT count(*)::int AS adet FROM e`,
    [ozet, kisiId],
  );
  return satir?.adet ?? 0;
}

// Şerit bütün olarak bayatlar: son parçası eski olan şerit. Tek tek parça silinse süren uzun bir yüklemenin ilk parçaları düşerdi.
export async function bayatSeritleriSil(db: Db, gun: number, sinir: number): Promise<number> {
  const satir = await db.tek<{ n: number }>(
    `WITH silinen AS (
       DELETE FROM dosya_yuklemesi y USING (
         SELECT ozet, yukleyen_id FROM dosya_yuklemesi GROUP BY ozet, yukleyen_id
         HAVING max(zaman) < now() - make_interval(days => $1) ORDER BY max(zaman) LIMIT $2
       ) b
       WHERE y.ozet = b.ozet AND y.yukleyen_id = b.yukleyen_id
       RETURNING y.ozet, y.yukleyen_id
     ) SELECT count(DISTINCT (ozet, yukleyen_id))::int AS n FROM silinen`,
    [gun, sinir],
  );
  return satir?.n ?? 0;
}

// Bağı kalmamış ve süresi dolmuş dosyalar. Bağlama aynı satırı önce günceller (bagsiz_zaman boşalır): silme kilidi bekleyip
// koşulu yeniden değerlendirir, bağlanmış dosyayı silmez; yabancı anahtar da bağı olan dosyanın silinmesini reddeder.
// Künyesi silinen diskteki dosya bekleme listesine girer (1005 a); dosyanın kendisi bekleme süresi dolunca silinir.
export async function sahipsizleriSil(db: Db, gun: number, sinir: number): Promise<number> {
  const satir = await db.tek<{ adet: number }>(
    `WITH silinen AS (
       DELETE FROM dosya WHERE ozet IN (
         SELECT d.ozet FROM dosya d
          WHERE d.bagsiz_zaman < now() - make_interval(days => $1)
            AND NOT EXISTS (SELECT 1 FROM dosya_bagi b WHERE b.ozet = d.ozet)
          ORDER BY d.bagsiz_zaman LIMIT $2
       ) AND bagsiz_zaman < now() - make_interval(days => $1)
       RETURNING ozet, depo
     ), bekleyen AS (
       INSERT INTO dosya_disk_silinecek (ozet) SELECT ozet FROM silinen WHERE depo = 'disk'
       ON CONFLICT (ozet) DO UPDATE SET zaman = now()
     )
     SELECT count(*)::int AS adet FROM silinen`,
    [gun, sinir],
  );
  return satir?.adet ?? 0;
}

// İçerik diske yazıldıktan sonra künye diske döner ve veritabanındaki parçalar silinir.
export async function diskeAlindi(db: Db, ozet: string): Promise<void> {
  await db.sorgu("UPDATE dosya SET depo = 'disk' WHERE ozet = $1", [ozet]);
  await db.sorgu('DELETE FROM dosya_icerigi WHERE ozet = $1', [ozet]);
}

// Aynı içerik yeniden diske bağlanıyor: bekleme satırı kalkar. Temizlik o satırı kilitlediyse beklenir; dosyayı sildiyse
// çağıran dosyayı yeniden yazar (önce bu, sonra dosya).
export async function diskBeklemesiniKaldir(db: Db, ozet: string): Promise<void> {
  await db.sorgu('DELETE FROM dosya_disk_silinecek WHERE ozet = $1', [ozet]);
}

// Bekleme süresi dolmuş ve yeniden diske bağlanmamış dosyalar; satır kilitlenir ki aynı anda bağlanan beklesin.
export async function diskSilinecekler(db: Db, gun: number, sinir: number): Promise<string[]> {
  return (await db.sorgu<{ ozet: string }>(
    `SELECT s.ozet FROM dosya_disk_silinecek s
      WHERE s.zaman < now() - make_interval(days => $1)
        AND NOT EXISTS (SELECT 1 FROM dosya d WHERE d.ozet = s.ozet AND d.depo = 'disk')
      ORDER BY s.zaman LIMIT $2 FOR UPDATE SKIP LOCKED`,
    [gun, sinir],
  )).map((x) => x.ozet);
}

// Yedekten geri yüklemede "künyesi olup dosyası olmayan" sayımı için (yedek aynası okur).
export async function diskKunyeOzetleri(db: Db): Promise<string[]> {
  return (await db.sorgu<{ ozet: string }>("SELECT ozet FROM dosya WHERE depo = 'disk' ORDER BY ozet")).map((x) => x.ozet);
}

export function icerikParcasi(db: Db, ozet: string, sira: number): Promise<{ icerik: Buffer } | null> {
  return db.tek('SELECT icerik FROM dosya_icerigi WHERE ozet = $1 AND sira = $2', [ozet, sira]);
}

// Yükleyenin kendi, henüz bağlanmamış dosyası.
export function kendiBagsizDosyasi(db: Db, ozet: string, kisiId: number): Promise<DosyaSatiri | null> {
  return db.tek(
    `SELECT d.ozet, d.boyut, d.tur, d.ilk_yukleyen_id, d.depo FROM dosya d JOIN dosya_yukleyeni y ON y.ozet = d.ozet AND y.kisi_id = $2
      WHERE d.ozet = $1 AND NOT EXISTS (SELECT 1 FROM dosya_bagi b WHERE b.ozet = d.ozet)`,
    [ozet, kisiId],
  );
}

// Bağlanacak dosyanın satırını kilitler ve bağsız sayımını durdurur; dosya yoksa null.
export function bagIcinAyir(db: Db, ozet: string): Promise<DosyaSatiri | null> {
  return db.tek(
    'UPDATE dosya SET bagsiz_zaman = NULL WHERE ozet = $1 RETURNING ozet, boyut, tur, ilk_yukleyen_id, depo',
    [ozet],
  );
}

export async function bagYaz(
  db: Db, b: { ozet: string; modul: string; kayit: string; ad: string; belgeTuru: string | null; ekleyenId: number },
): Promise<void> {
  await db.sorgu(
    `INSERT INTO dosya_bagi (ozet, modul, kayit, ad, belge_turu, ekleyen_id) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (ozet, modul, kayit) DO UPDATE SET ad = EXCLUDED.ad, belge_turu = EXCLUDED.belge_turu`,
    [b.ozet, b.modul, b.kayit, b.ad, b.belgeTuru, b.ekleyenId],
  );
}

export function bag(db: Db, modul: string, kayit: string, ozet: string): Promise<BagSatiri | null> {
  return db.tek(
    `SELECT ${BAG_ALANLARI} FROM dosya_bagi b JOIN dosya d USING (ozet) WHERE b.modul = $1 AND b.kayit = $2 AND b.ozet = $3`,
    [modul, kayit, ozet],
  );
}

export function baglar(db: Db, modul: string, kayit: string): Promise<BagSatiri[]> {
  return db.sorgu(
    `SELECT ${BAG_ALANLARI} FROM dosya_bagi b JOIN dosya d USING (ozet) WHERE b.modul = $1 AND b.kayit = $2 ORDER BY b.zaman, b.ozet`,
    [modul, kayit],
  );
}

// Kaldırılan bağlar döner; bağı kalmayan dosyanın 7 günlük sayımı başlar. Dosya satırları önce kilitlenir: aynı dosyanın iki bağı
// aynı anda kaldırılırsa ikinci işlem birincinin silmesini görür. Kilitsiz ikisi de öbür bağı var sayar, sayım hiç başlamaz.
export async function bagSil(db: Db, modul: string, kayit: string, ozet: string | null): Promise<BagSatiri[]> {
  await db.sorgu(
    `SELECT d.ozet FROM dosya d
      WHERE d.ozet IN (SELECT ozet FROM dosya_bagi WHERE modul = $1 AND kayit = $2 AND ($3::text IS NULL OR ozet = $3))
      ORDER BY d.ozet FOR UPDATE OF d`,
    [modul, kayit, ozet],
  );
  const silinen = await db.sorgu<BagSatiri>(
    `WITH s AS (
       DELETE FROM dosya_bagi WHERE modul = $1 AND kayit = $2 AND ($3::text IS NULL OR ozet = $3)
       RETURNING ozet, ad, belge_turu, ekleyen_id, zaman
     )
     SELECT s.ozet, s.ad, d.boyut, d.tur, s.belge_turu, s.ekleyen_id, ${zamanMetni('s.zaman')} AS zaman
       FROM s JOIN dosya d USING (ozet) ORDER BY s.zaman, s.ozet`,
    [modul, kayit, ozet],
  );
  if (silinen.length > 0) {
    await db.sorgu(
      `UPDATE dosya d SET bagsiz_zaman = now()
        WHERE d.ozet = ANY($1) AND NOT EXISTS (SELECT 1 FROM dosya_bagi b WHERE b.ozet = d.ozet)`,
      [silinen.map((s) => s.ozet)],
    );
  }
  return silinen;
}

// Modülün kendi yükleme şeridinde tamamlanıp özeti doğrulanan içerik (kart #732): parçalar en çok DOSYA_PARCASI boyunda yazılır.
export async function icerikliDosyaEkle(db: Db, ozet: string, kisiId: number, tur: SaklananTur, parcalar: readonly Buffer[]): Promise<void> {
  const boyut = parcalar.reduce((t, p) => t + p.length, 0);
  await db.sorgu('INSERT INTO dosya (ozet, boyut, tur, ilk_yukleyen_id) VALUES ($1, $2, $3, $4)', [ozet, boyut, tur, kisiId]);
  await db.sorgu('INSERT INTO dosya_yukleyeni (ozet, kisi_id) VALUES ($1, $2)', [ozet, kisiId]);
  for (let sira = 0; sira < parcalar.length; sira += 1) {
    await db.sorgu('INSERT INTO dosya_icerigi (ozet, sira, icerik) VALUES ($1, $2, $3)', [ozet, sira, parcalar[sira]]);
  }
}

// Dosya başka bir modülün kaydına bağlı mı (kaynaktan bağlamanın ön koşulu).
export async function baskaModuldeBagli(db: Db, ozet: string, modul: string): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM dosya_bagi WHERE ozet = $1 AND modul <> $2 LIMIT 1', [ozet, modul])) !== null;
}

export async function kayittaBagliOlanlar(db: Db, modul: string, kayit: string, ozetler: readonly string[]): Promise<string[]> {
  const satirlar = await db.sorgu<{ ozet: string }>(
    'SELECT ozet FROM dosya_bagi WHERE modul = $1 AND kayit = $2 AND ozet = ANY($3)', [modul, kayit, ozetler]);
  return satirlar.map((x) => x.ozet);
}
