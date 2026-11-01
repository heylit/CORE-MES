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
  const a = await db.tek<{
    toplam: number; aktif: number; bosta: number; bos_tx: number; kilit: number; gorunmeyen: number; en_uzun_tx_sn: number | null;
  }>(
    `SELECT count(*)::int AS toplam,
            count(*) FILTER (WHERE state = 'active')::int AS aktif,
            count(*) FILTER (WHERE state = 'idle')::int AS bosta,
            count(*) FILTER (WHERE state LIKE 'idle in transaction%')::int AS bos_tx,
            count(*) FILTER (WHERE wait_event_type = 'Lock')::int AS kilit,
            count(*) FILTER (WHERE state IS NULL)::int AS gorunmeyen,
            extract(epoch FROM max(now() - xact_start) FILTER (WHERE pid <> pg_backend_pid()))::float8 AS en_uzun_tx_sn
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
