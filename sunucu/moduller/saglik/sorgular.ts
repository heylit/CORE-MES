import type { Db } from '#cekirdek/db.ts';

export async function veritabaniYokla(db: Db): Promise<void> {
  await db.tek('SELECT 1 AS ok');
}

// Kayıt tablosu yoksa ya da boşsa hiç göç uygulanmamıştır: bilinmiyor, null.
export async function sonGocAdi(db: Db): Promise<string | null> {
  const tablo = await db.tek<{ tablo: string | null }>("SELECT to_regclass('goc_kaydi')::text AS tablo");
  if (!tablo || tablo.tablo === null) return null;
  const satir = await db.tek<{ ad: string }>('SELECT ad FROM goc_kaydi ORDER BY ad DESC LIMIT 1');
  return satir?.ad ?? null;
}

// Bu veritabanına açık bütün bağlantılar (uygulama, göç, yönetim aracı); havuzun dolup dolmadığını gösterir.
export async function vtBaglantiSay(db: Db): Promise<number | null> {
  const satir = await db.tek<{ sayi: number }>('SELECT count(*)::int AS sayi FROM pg_stat_activity WHERE datname = current_database()');
  return satir?.sayi ?? null;
}

// Dakikalık veritabanı ölçüsü (kart 1661). Yalnız süper kullanıcı istemeyen kaynaklar: pg_stat_database ve pg_stat_activity
// görünümleri, pg_database_size ve pg_database.datfrozenxid. Sayaçlar açılıştan beri artar; fark kurallar.ts'tedir.
// Başka rolün bağlantısında durum ve zaman pg_read_all_stats olmadan boş gelir: o satırlar "görünmeyen" sayılır, uydurulmaz.
export interface VtIstatistigi {
  boyutBayt: number;
  xidYasi: number | null;
  islem: number;
  geriAlma: number;
  deadlock: number;
  blokIsabet: number;
  blokOkuma: number;
  geciciBayt: number;
  baglanti: { toplam: number; aktif: number; bosta: number; bosTx: number; kilitBekleyen: number; gorunmeyen: number };
  enUzunTxSn: number | null;
}

export async function vtIstatistigiOku(db: Db): Promise<VtIstatistigi | null> {
  const d = await db.tek<{
    boyut: number; xid_yasi: number | null; islem: number; geri_alma: number; deadlock: number; isabet: number; okuma: number; gecici: number;
  }>(
    `SELECT pg_database_size(current_database())::float8 AS boyut,
            (SELECT age(datfrozenxid) FROM pg_database WHERE datname = current_database())::int AS xid_yasi,
            xact_commit::float8 AS islem, xact_rollback::float8 AS geri_alma, deadlocks::float8 AS deadlock,
            blks_hit::float8 AS isabet, blks_read::float8 AS okuma, temp_bytes::float8 AS gecici
       FROM pg_stat_database WHERE datname = current_database()`,
  );
  if (d === null) return null;
  // now() okuyan transaction'ın başlangıcıdır; ondan sonra başlayan işlem eksi süre verirdi. Duvar saati her açık işlemden sonradır.
  const a = await db.tek<{
    toplam: number; aktif: number; bosta: number; bos_tx: number; kilit: number; gorunmeyen: number; en_uzun_tx_sn: number | null;
  }>(
    `SELECT count(*)::int AS toplam,
            count(*) FILTER (WHERE state = 'active')::int AS aktif,
            count(*) FILTER (WHERE state = 'idle')::int AS bosta,
            count(*) FILTER (WHERE state LIKE 'idle in transaction%')::int AS bos_tx,
            count(*) FILTER (WHERE wait_event_type = 'Lock')::int AS kilit,
            count(*) FILTER (WHERE state IS NULL)::int AS gorunmeyen,
            extract(epoch FROM max(clock_timestamp() - xact_start) FILTER (WHERE pid <> pg_backend_pid()))::float8 AS en_uzun_tx_sn
       FROM pg_stat_activity
      WHERE datname = current_database() AND backend_type = 'client backend'`,
  );
  return {
    boyutBayt: d.boyut, xidYasi: d.xid_yasi, islem: d.islem, geriAlma: d.geri_alma, deadlock: d.deadlock,
    blokIsabet: d.isabet, blokOkuma: d.okuma, geciciBayt: d.gecici,
    baglanti: {
      toplam: a?.toplam ?? 0, aktif: a?.aktif ?? 0, bosta: a?.bosta ?? 0, bosTx: a?.bos_tx ?? 0, kilitBekleyen: a?.kilit ?? 0, gorunmeyen: a?.gorunmeyen ?? 0,
    },
    enUzunTxSn: a?.en_uzun_tx_sn ?? null,
  };
}

// Metrik tabloları (kart 1662). Satırı yalnız dakikalık iş yazar; jsonb biçimi sözleşmedeki dakika ve kurallar.ts'teki saat özetidir.
export async function metrikDakikasiYaz(db: Db, an: string, veri: unknown): Promise<void> {
  await db.sorgu('INSERT INTO saglik_metrik_dakika (an, veri) VALUES ($1, $2) ON CONFLICT (an) DO NOTHING', [an, JSON.stringify(veri)]);
}

export async function metrikSaatiYaz(db: Db, saat: string, veri: unknown): Promise<void> {
  await db.sorgu('INSERT INTO saglik_metrik_saat (saat, veri) VALUES ($1, $2) ON CONFLICT (saat) DO NOTHING', [saat, JSON.stringify(veri)]);
}

// Özeti yazılmış son saatten sonraki ilk dakika; hiç özet yoksa en eski dakika.
export async function ozetlenmemisIlkDakika(db: Db): Promise<Date | null> {
  const s = await db.tek<{ an: Date | null }>(
    `SELECT min(an) AS an FROM saglik_metrik_dakika
      WHERE an >= coalesce((SELECT max(saat) FROM saglik_metrik_saat) + interval '1 hour', '-infinity'::timestamptz)`,
  );
  return s?.an ?? null;
}

// [baslangic, bitis) aralığının dakikaları, zamana göre.
export async function metrikDakikalariOku<T>(db: Db, baslangic: Date, bitis: Date): Promise<T[]> {
  const satirlar = await db.sorgu<{ veri: T }>(
    'SELECT veri FROM saglik_metrik_dakika WHERE an >= $1 AND an < $2 ORDER BY an', [baslangic, bitis],
  );
  return satirlar.map((s) => s.veri);
}

// Saklama süresi geçen satırlar; yalnız bu iki tabloya dokunur.
export async function suresiGecenMetrikleriSil(db: Db, simdi: Date, dakikaGun: number, saatAy: number): Promise<{ dakika: number; saat: number }> {
  const d = await db.sorgu<{ an: Date }>(
    "DELETE FROM saglik_metrik_dakika WHERE an < $1::timestamptz - make_interval(days => $2::int) RETURNING an", [simdi, dakikaGun],
  );
  const s = await db.sorgu<{ saat: Date }>(
    "DELETE FROM saglik_metrik_saat WHERE saat < $1::timestamptz - make_interval(months => $2::int) RETURNING saat", [simdi, saatAy],
  );
  return { dakika: d.length, saat: s.length };
}

// [baslangic, şimdi] aralığının saatlik özetleri, zamana göre. 13 ayda en çok ~9.500 satır.
export async function metrikSaatleriOku<T>(db: Db, baslangic: Date): Promise<T[]> {
  const satirlar = await db.sorgu<{ veri: T }>('SELECT veri FROM saglik_metrik_saat WHERE saat >= $1 ORDER BY saat', [baslangic]);
  return satirlar.map((s) => s.veri);
}

// Veritabanı büyümesi (kart 1761): en büyük tablolar, ölü satır ve son autovacuum. Kaynak pg_stat_user_tables ve boyut
// fonksiyonları; süper kullanıcı ya da pg_monitor istemez. Satır sayıları istatistik tahminidir (ANALYZE ile güncellenir).
// Yalnız arama yolundaki şemalar: testler kendi şemasında koşar, canlı `public`'tedir.
export interface TabloOlcusu {
  ad: string;
  toplamBayt: number;
  dizinBayt: number;
  canliSatir: number;
  oluSatir: number;
  sonAutovacuum: Date | null;
  sonAutoanalyze: Date | null;
}

export const EN_BUYUK_TABLO_SAYISI = 10;

export async function enBuyukTablolariOku(db: Db, enCok: number = EN_BUYUK_TABLO_SAYISI): Promise<TabloOlcusu[]> {
  const satirlar = await db.sorgu<{
    ad: string; toplam: number; dizin: number; canli: number; olu: number; son_autovacuum: Date | null; son_autoanalyze: Date | null;
  }>(
    `SELECT relname AS ad, pg_total_relation_size(relid)::float8 AS toplam, pg_indexes_size(relid)::float8 AS dizin,
            n_live_tup::float8 AS canli, n_dead_tup::float8 AS olu, last_autovacuum AS son_autovacuum, last_autoanalyze AS son_autoanalyze
       FROM pg_stat_user_tables
      WHERE schemaname = ANY (current_schemas(false))
      ORDER BY pg_total_relation_size(relid) DESC, relname
      LIMIT $1`,
    [enCok],
  );
  return satirlar.map((s) => ({
    ad: s.ad, toplamBayt: s.toplam, dizinBayt: s.dizin, canliSatir: s.canli, oluSatir: s.olu,
    sonAutovacuum: s.son_autovacuum, sonAutoanalyze: s.son_autoanalyze,
  }));
}
