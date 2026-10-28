import type { Db } from '#cekirdek/db.ts';
import { siralamaSql } from '#cekirdek/liste.ts';
import type { Dilim, SiralamaIstegi, SiralamaTanimi } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { PlanliDurusKapsami, PlanliDurusTekrari } from '#paylasilan/sozlesme/vardiya.ts';
import type { DurusTekrari, MatrisSatiri } from './kurallar.ts';

export interface VardiyaSatiri { id: number; ad: string; baslangic: string; bitis: string; aktif: boolean; surum: number }
export interface MolaSatiri { vardiyaId: number; baslangic: string; bitis: string }
export interface TakvimGunuSatiri { tarih: string; tur: 'tatil' | 'kapali'; ad: string | null }
export interface VardiyaYazimi { ad: string; baslangic: string; bitis: string; aktif: boolean }

const SAAT = (s: string) => `to_char(${s}, 'HH24:MI')`;
const VARDIYA_SUTUNLARI = `id, ad, ${SAAT('baslangic')} AS baslangic, ${SAAT('bitis')} AS bitis, aktif, surum`;

export const vardiyalar = (db: Db): Promise<VardiyaSatiri[]> =>
  db.sorgu<VardiyaSatiri>(`SELECT ${VARDIYA_SUTUNLARI} FROM vardiya ORDER BY baslangic, id`);

export const molalar = (db: Db): Promise<MolaSatiri[]> =>
  db.sorgu<MolaSatiri>(`SELECT vardiya_id AS "vardiyaId", ${SAAT('baslangic')} AS baslangic, ${SAAT('bitis')} AS bitis
    FROM vardiya_molasi ORDER BY vardiya_id, baslangic, id`);

export const matris = (db: Db): Promise<MatrisSatiri[]> =>
  db.sorgu<MatrisSatiri>('SELECT is_merkezi_id AS "isMerkeziId", gun, vardiya_id AS "vardiyaId" FROM vardiya_matrisi ORDER BY is_merkezi_id, gun, vardiya_id');

export const gunler = (db: Db): Promise<TakvimGunuSatiri[]> =>
  db.sorgu<TakvimGunuSatiri>('SELECT tarih, tur, ad FROM vardiya_takvim_gunu ORDER BY tarih');

export const kisiVardiyalari = (db: Db): Promise<{ kisiId: number; vardiyaId: number }[]> =>
  db.sorgu('SELECT kisi_id AS "kisiId", vardiya_id AS "vardiyaId" FROM vardiya_kisi ORDER BY kisi_id');

export async function kisininVardiyasi(db: Db, kisiId: number): Promise<number | null> {
  return (await db.tek<{ vardiyaId: number }>('SELECT vardiya_id AS "vardiyaId" FROM vardiya_kisi WHERE kisi_id = $1', [kisiId]))?.vardiyaId ?? null;
}

export async function vardiyaEkle(db: Db, v: VardiyaYazimi): Promise<number> {
  const satir = await db.tek<{ id: number }>('INSERT INTO vardiya (ad, baslangic, bitis, aktif) VALUES ($1, $2, $3, $4) RETURNING id',
    [v.ad, v.baslangic, v.bitis, v.aktif]);
  return satir!.id;
}

// Sürüm koşullu yazma: satır dönmezse kayıt yoktur ya da sürümü ilerlemiştir (ayrımı servis yapar).
export async function vardiyaGuncelle(db: Db, id: number, v: VardiyaYazimi & { surum: number }): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>('UPDATE vardiya SET ad = $2, baslangic = $3, bitis = $4, aktif = $5, surum = surum + 1 WHERE id = $1 AND surum = $6 RETURNING id',
    [id, v.ad, v.baslangic, v.bitis, v.aktif, v.surum]);
}

export async function vardiyaVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM vardiya WHERE id = $1', [id])) !== null;
}

export async function molalariYaz(db: Db, vardiyaId: number, liste: readonly { baslangic: string; bitis: string }[]): Promise<void> {
  await db.sorgu('DELETE FROM vardiya_molasi WHERE vardiya_id = $1', [vardiyaId]);
  if (liste.length) {
    await db.sorgu('INSERT INTO vardiya_molasi (vardiya_id, baslangic, bitis) SELECT $1, b, s FROM unnest($2::time[], $3::time[]) AS m (b, s)',
      [vardiyaId, liste.map((m) => m.baslangic), liste.map((m) => m.bitis)]);
  }
}

export async function matrisYaz(db: Db, isMerkeziId: number, gun: number, vardiyaId: number, acik: boolean): Promise<void> {
  if (acik) {
    await db.sorgu('INSERT INTO vardiya_matrisi (is_merkezi_id, gun, vardiya_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [isMerkeziId, gun, vardiyaId]);
  } else {
    await db.sorgu('DELETE FROM vardiya_matrisi WHERE is_merkezi_id = $1 AND gun = $2 AND vardiya_id = $3', [isMerkeziId, gun, vardiyaId]);
  }
}

// Hedeflerin bütün satırları silinir, verilen satırlar yazılır (haftayı uygula).
export async function matrisiYenidenYaz(db: Db, hedefler: readonly number[], satirlar: readonly MatrisSatiri[]): Promise<void> {
  await db.sorgu('DELETE FROM vardiya_matrisi WHERE is_merkezi_id = ANY($1::int[])', [hedefler]);
  if (satirlar.length) {
    await db.sorgu('INSERT INTO vardiya_matrisi (is_merkezi_id, gun, vardiya_id) SELECT * FROM unnest($1::int[], $2::smallint[], $3::int[])',
      [satirlar.map((s) => s.isMerkeziId), satirlar.map((s) => s.gun), satirlar.map((s) => s.vardiyaId)]);
  }
}

// Haftayı uygulayan komut aynı anda gelen matris yazısıyla karışmasın: matrisin tamamı tek kilitle yazılır.
export async function matrisiKilitle(db: Db): Promise<void> {
  await db.sorgu('LOCK TABLE vardiya_matrisi IN SHARE ROW EXCLUSIVE MODE');
}

export async function gunYaz(db: Db, g: TakvimGunuSatiri): Promise<void> {
  await db.sorgu('INSERT INTO vardiya_takvim_gunu (tarih, tur, ad) VALUES ($1, $2, $3) ON CONFLICT (tarih) DO UPDATE SET tur = EXCLUDED.tur, ad = EXCLUDED.ad',
    [g.tarih, g.tur, g.ad]);
}

export async function gunSil(db: Db, tarih: string): Promise<boolean> {
  return (await db.sorgu('DELETE FROM vardiya_takvim_gunu WHERE tarih = $1 RETURNING tarih', [tarih])).length > 0;
}

// Tarihi `enErken` ya da sonrası olan günler silinir; `enErken` null ise hepsi.
export async function gunleriSil(db: Db, enErken: string | null): Promise<number> {
  return (await db.sorgu('DELETE FROM vardiya_takvim_gunu WHERE $1::date IS NULL OR tarih >= $1::date RETURNING tarih', [enErken])).length;
}

export async function kisiVardiyasiYaz(db: Db, kisiId: number, vardiyaId: number | null): Promise<void> {
  if (vardiyaId === null) {
    await db.sorgu('DELETE FROM vardiya_kisi WHERE kisi_id = $1', [kisiId]);
  } else {
    await db.sorgu('INSERT INTO vardiya_kisi (kisi_id, vardiya_id) VALUES ($1, $2) ON CONFLICT (kisi_id) DO UPDATE SET vardiya_id = EXCLUDED.vardiya_id',
      [kisiId, vardiyaId]);
  }
}

// Toplu kişi vardiyası tek sorguda: null hepsinin vardiyasını kaldırır.
export async function kisiVardiyalariYaz(db: Db, kisiIdleri: readonly number[], vardiyaId: number | null): Promise<void> {
  if (vardiyaId === null) {
    await db.sorgu('DELETE FROM vardiya_kisi WHERE kisi_id = ANY($1::int[])', [kisiIdleri]);
  } else {
    await db.sorgu(`INSERT INTO vardiya_kisi (kisi_id, vardiya_id) SELECT k, $2 FROM unnest($1::int[]) AS x (k)
      ON CONFLICT (kisi_id) DO UPDATE SET vardiya_id = EXCLUDED.vardiya_id`, [kisiIdleri, vardiyaId]);
  }
}

export async function bugun(db: Db): Promise<string> {
  return (await db.tek<{ g: string }>("SELECT to_char(current_date, 'YYYY-MM-DD') AS g"))!.g;
}

// Dakika ekseni (tarihin 00:00'ından) veritabanı oturumunun saat diliminde ana çevrilir; yaz ve kış saati geçişi dahil.
export async function anlaraCevir(db: Db, tarih: string, dakikalar: readonly number[]): Promise<string[]> {
  if (dakikalar.length === 0) return [];
  const satirlar = await db.sorgu<{ an: string }>(
    `SELECT ${zamanMetni("(($1::date + make_interval(mins => d))::timestamp AT TIME ZONE current_setting('TimeZone'))")} AS an
       FROM unnest($2::int[]) WITH ORDINALITY AS x (d, sira) ORDER BY sira`,
    [tarih, dakikalar],
  );
  return satirlar.map((s) => s.an);
}

// Planlı duruş (kart #519).
export interface PlanliDurusSatiri {
  id: number; baslik: string; durusNedeniId: number | null; kapsam: PlanliDurusKapsami; isMerkeziId: number | null; istasyonId: number | null;
  baslangic: string; bitis: string; tekrar: PlanliDurusTekrari; gunler: number[]; tekrarBitis: string | null; aciklama: string | null;
  aktif: boolean; surum: number; yazanId: number; yazildi: string; kaynakKimligi: string | null;
}
export interface PlanliDurusYazimi {
  baslik: string; durusNedeniId: number | null; kapsam: PlanliDurusKapsami; isMerkeziId: number | null; istasyonId: number | null;
  baslangic: string; bitis: string; tekrar: PlanliDurusTekrari; gunler: readonly number[]; tekrarBitis: string | null; aciklama: string | null; aktif: boolean;
}

const DURUS_SUTUNLARI = `d.id, d.baslik, d.durus_nedeni_id AS "durusNedeniId", d.kapsam, d.is_merkezi_id AS "isMerkeziId", d.istasyon_id AS "istasyonId",
  ${zamanMetni('d.baslangic')} AS baslangic, ${zamanMetni('d.bitis')} AS bitis, d.tekrar, d.gunler::int[] AS gunler,
  ${zamanMetni('d.tekrar_bitis')} AS "tekrarBitis", d.aciklama, d.aktif, d.surum, d.yazan_id AS "yazanId", ${zamanMetni('d.yazildi')} AS yazildi,
  d.kaynak_kimligi AS "kaynakKimligi"`;
const DURUS_SUZGECI = 'FROM vardiya_planli_durus d WHERE ($1::boolean IS NOT TRUE OR d.aktif)';

export const DURUS_SIRALAMASI: SiralamaTanimi<'baslangic' | 'baslik'> = {
  sutunlar: { baslangic: 'd.baslangic', baslik: 'd.baslik' },
  ikincil: 'd.id',
  varsayilan: { sutun: 'd.baslangic', yon: 'azalan' },
};

export async function planliDurusSay(db: Db, yalnizAktif: boolean): Promise<number> {
  return Number((await db.tek<{ toplam: string }>(`SELECT count(*) AS toplam ${DURUS_SUZGECI}`, [yalnizAktif]))!.toplam);
}

export const planliDurusSatirlari = (db: Db, yalnizAktif: boolean, siralama: SiralamaIstegi<'baslangic' | 'baslik'>, dilim: Dilim): Promise<PlanliDurusSatiri[]> =>
  db.sorgu<PlanliDurusSatiri>(`SELECT ${DURUS_SUTUNLARI} ${DURUS_SUZGECI} ORDER BY ${siralamaSql(DURUS_SIRALAMASI, siralama)} LIMIT $2 OFFSET $3`,
    [yalnizAktif, dilim.sinir, dilim.atla]);

// Arkon planlı duruş takvimi bütün kayıtları (pasifler dahil) okur.
export const planliDuruslarinHepsi = (db: Db): Promise<PlanliDurusSatiri[]> =>
  db.sorgu<PlanliDurusSatiri>(`SELECT ${DURUS_SUTUNLARI} FROM vardiya_planli_durus d ORDER BY d.baslangic, d.id`);

export const planliDurus = (db: Db, id: number): Promise<PlanliDurusSatiri | null> =>
  db.tek<PlanliDurusSatiri>(`SELECT ${DURUS_SUTUNLARI} FROM vardiya_planli_durus d WHERE d.id = $1`, [id]);

export const planliDurusKilitle = (db: Db, id: number): Promise<PlanliDurusSatiri | null> =>
  db.tek<PlanliDurusSatiri>(`SELECT ${DURUS_SUTUNLARI} FROM vardiya_planli_durus d WHERE d.id = $1 FOR UPDATE`, [id]);

export const kaynakKimligiyleKilitle = (db: Db, kaynakKimligi: string): Promise<PlanliDurusSatiri | null> =>
  db.tek<PlanliDurusSatiri>(`SELECT ${DURUS_SUTUNLARI} FROM vardiya_planli_durus d WHERE d.kaynak_kimligi = $1 FOR UPDATE`, [kaynakKimligi]);

const DURUS_DEGERLERI = (d: PlanliDurusYazimi) => [
  d.baslik, d.durusNedeniId, d.kapsam, d.isMerkeziId, d.istasyonId, d.baslangic, d.bitis, d.tekrar, d.gunler, d.tekrarBitis, d.aciklama, d.aktif,
];

export async function planliDurusEkle(db: Db, d: PlanliDurusYazimi, yazanId: number, kaynakKimligi: string | null): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO vardiya_planli_durus
       (baslik, durus_nedeni_id, kapsam, is_merkezi_id, istasyon_id, baslangic, bitis, tekrar, gunler, tekrar_bitis, aciklama, aktif, yazan_id, kaynak_kimligi)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::smallint[], $10, $11, $12, $13, $14) RETURNING id`,
    [...DURUS_DEGERLERI(d), yazanId, kaynakKimligi],
  );
  return satir!.id;
}

// Sürüm koşullu yazma: satır dönmezse kayıt yoktur ya da sürümü ilerlemiştir (ayrımı servis yapar). Yazan ve zaman her yazmada yenilenir.
export async function planliDurusGuncelle(db: Db, id: number, d: PlanliDurusYazimi, surum: number, yazanId: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE vardiya_planli_durus SET baslik = $2, durus_nedeni_id = $3, kapsam = $4, is_merkezi_id = $5, istasyon_id = $6, baslangic = $7, bitis = $8,
       tekrar = $9, gunler = $10::smallint[], tekrar_bitis = $11, aciklama = $12, aktif = $13, yazan_id = $15, yazildi = now(), surum = surum + 1
     WHERE id = $1 AND surum = $14 RETURNING id`,
    [id, ...DURUS_DEGERLERI(d), surum, yazanId],
  );
}

export async function planliDurusSil(db: Db, id: number, surum: number): Promise<boolean> {
  return (await db.sorgu('DELETE FROM vardiya_planli_durus WHERE id = $1 AND surum = $2 RETURNING id', [id, surum])).length > 0;
}

export async function planliDurusVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM vardiya_planli_durus WHERE id = $1', [id])) !== null;
}

export interface TakvimDurusu {
  kapsam: PlanliDurusKapsami; isMerkeziId: number | null; istasyonId: number | null;
  // Dakika ekseni (`tarih`in 00:00'ı, tesis duvar saati): başlangıç, süre ve tekrarın son başlangıcı.
  basDk: number; sureDk: number; sonDk: number | null; tekrar: DurusTekrari; gunler: number[];
}

// Aralığa (ilk günden bir gün önce ile son günden bir gün sonrası) değebilecek aktif duruşlar, dakika ekseninde.
export const takvimDuruslari = (db: Db, tarih: string, gunSayisi: number): Promise<TakvimDurusu[]> =>
  db.sorgu<TakvimDurusu>(
    `WITH yerel AS (
       SELECT d.*, d.baslangic AT TIME ZONE current_setting('TimeZone') AS yb, d.bitis AT TIME ZONE current_setting('TimeZone') AS ys,
              d.tekrar_bitis AT TIME ZONE current_setting('TimeZone') AS yt
         FROM vardiya_planli_durus d
        WHERE d.aktif
          AND d.baslangic < (($1::date + $2::int + 1)::timestamp AT TIME ZONE current_setting('TimeZone'))
          AND (CASE WHEN d.tekrar = 'yok' THEN d.bitis ELSE COALESCE(d.tekrar_bitis + interval '1 day', 'infinity'::timestamptz) END)
              > (($1::date - 1)::timestamp AT TIME ZONE current_setting('TimeZone')))
     SELECT kapsam, is_merkezi_id AS "isMerkeziId", istasyon_id AS "istasyonId",
            floor(extract(epoch FROM yb - $1::date::timestamp) / 60)::int AS "basDk",
            ceil(extract(epoch FROM ys - yb) / 60)::int AS "sureDk",
            CASE WHEN yt IS NULL THEN NULL ELSE floor(extract(epoch FROM yt - $1::date::timestamp) / 60)::int END AS "sonDk",
            tekrar, gunler::int[] AS gunler
       FROM yerel ORDER BY id`,
    [tarih, gunSayisi],
  );

// Fazla mesai planı (kart #1324).
export interface FazlaMesaiSatiri {
  id: number; tarih: string; baslangic: string; bitis: string; kapsam: 'is-merkezi' | 'istasyon'; isMerkeziId: number | null; istasyonId: number | null;
  kisiIdleri: number[]; aciklama: string | null; iptal: boolean; surum: number; yazanId: number; yazildi: string;
}
export interface FazlaMesaiYazimi {
  tarih: string; baslangic: string; bitis: string; kapsam: 'is-merkezi' | 'istasyon'; isMerkeziId: number | null; istasyonId: number | null; aciklama: string | null;
}

const FAZLA_MESAI_SUTUNLARI = `f.id, to_char(f.tarih, 'YYYY-MM-DD') AS tarih, ${SAAT('f.baslangic')} AS baslangic, ${SAAT('f.bitis')} AS bitis, f.kapsam,
  f.is_merkezi_id AS "isMerkeziId", f.istasyon_id AS "istasyonId",
  COALESCE((SELECT array_agg(k.kisi_id ORDER BY k.kisi_id) FROM vardiya_fazla_mesai_kisi k WHERE k.fazla_mesai_id = f.id), '{}')::int[] AS "kisiIdleri",
  f.aciklama, f.iptal, f.surum, f.yazan_id AS "yazanId", ${zamanMetni('f.yazildi')} AS yazildi`;

// Tarihi aralıkta olan kayıtlar; iptalleri isteyen ekran, takvim yalnız iptal olmayanları okur.
export const fazlaMesailer = (db: Db, baslangic: string, bitis: string, iptallerDahil: boolean): Promise<FazlaMesaiSatiri[]> =>
  db.sorgu<FazlaMesaiSatiri>(`SELECT ${FAZLA_MESAI_SUTUNLARI} FROM vardiya_fazla_mesai f
    WHERE f.tarih BETWEEN $1::date AND $2::date AND ($3::boolean OR NOT f.iptal) ORDER BY f.tarih, f.baslangic, f.id`, [baslangic, bitis, iptallerDahil]);

export const fazlaMesai = (db: Db, id: number): Promise<FazlaMesaiSatiri | null> =>
  db.tek<FazlaMesaiSatiri>(`SELECT ${FAZLA_MESAI_SUTUNLARI} FROM vardiya_fazla_mesai f WHERE f.id = $1`, [id]);

export const fazlaMesaiKilitle = (db: Db, id: number): Promise<FazlaMesaiSatiri | null> =>
  db.tek<FazlaMesaiSatiri>(`SELECT ${FAZLA_MESAI_SUTUNLARI} FROM vardiya_fazla_mesai f WHERE f.id = $1 FOR UPDATE`, [id]);

export async function fazlaMesaiEkle(db: Db, f: FazlaMesaiYazimi, yazanId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(`INSERT INTO vardiya_fazla_mesai (tarih, baslangic, bitis, kapsam, is_merkezi_id, istasyon_id, aciklama, yazan_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`, [f.tarih, f.baslangic, f.bitis, f.kapsam, f.isMerkeziId, f.istasyonId, f.aciklama, yazanId]);
  return satir!.id;
}

// Sürüm koşullu; yazan ve zaman son yazanındır.
export const fazlaMesaiGuncelle = (db: Db, id: number, f: FazlaMesaiYazimi, surum: number, yazanId: number): Promise<{ id: number } | null> =>
  db.tek<{ id: number }>(`UPDATE vardiya_fazla_mesai SET tarih = $2, baslangic = $3, bitis = $4, kapsam = $5, is_merkezi_id = $6, istasyon_id = $7, aciklama = $8,
    yazan_id = $9, yazildi = now(), surum = surum + 1 WHERE id = $1 AND surum = $10 AND NOT iptal RETURNING id`,
  [id, f.tarih, f.baslangic, f.bitis, f.kapsam, f.isMerkeziId, f.istasyonId, f.aciklama, yazanId, surum]);

export const fazlaMesaiIptalEt = (db: Db, id: number, surum: number, yazanId: number): Promise<{ id: number } | null> =>
  db.tek<{ id: number }>('UPDATE vardiya_fazla_mesai SET iptal = true, yazan_id = $3, yazildi = now(), surum = surum + 1 WHERE id = $1 AND surum = $2 AND NOT iptal RETURNING id',
    [id, surum, yazanId]);

export async function fazlaMesaiKisileriniYaz(db: Db, id: number, kisiIdleri: readonly number[]): Promise<void> {
  await db.sorgu('DELETE FROM vardiya_fazla_mesai_kisi WHERE fazla_mesai_id = $1', [id]);
  if (kisiIdleri.length) {
    await db.sorgu('INSERT INTO vardiya_fazla_mesai_kisi (fazla_mesai_id, kisi_id) SELECT $1, k FROM unnest($2::int[]) AS x (k)', [id, kisiIdleri]);
  }
}

// Takvim (891): aralıkta başlayan, etkin, tek seferlik planlı duruşlar; gün tesis günüdür (oturum tesis saat diliminde).
// Tekrarlı duruşlar (mola, haftalık bakım) her günü dolduracağı için takvime gelmez.
export interface TakvimDurusSatiri {
  id: number; baslik: string; kapsam: PlanliDurusKapsami; isMerkeziId: number | null; istasyonId: number | null;
  gun: string; gecti: boolean;
}
export const tekSeferlikDuruslar = (db: Db, baslangic: string, bitis: string): Promise<TakvimDurusSatiri[]> =>
  db.sorgu<TakvimDurusSatiri>(
    `SELECT d.id, d.baslik, d.kapsam, d.is_merkezi_id AS "isMerkeziId", d.istasyon_id AS "istasyonId",
            d.baslangic::date::text AS gun, d.bitis <= now() AS gecti
       FROM vardiya_planli_durus d
      WHERE d.aktif AND d.tekrar = 'yok' AND d.baslangic::date BETWEEN $1::date AND $2::date
      ORDER BY d.baslangic, d.id`,
    [baslangic, bitis],
  );
