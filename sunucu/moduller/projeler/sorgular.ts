import type { Db } from '#cekirdek/db.ts';
import { siralamaSql } from '#cekirdek/liste.ts';
import type { Dilim, SiralamaIstegi, SiralamaTanimi } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { ProjeDurumu } from '#paylasilan/sozlesme/projeler.ts';

export interface ProjeSatiri {
  id: number;
  kod: string;
  ad: string;
  durum: ProjeDurumu;
  firma_id: number | null;
  siparis_id: number | null;
  butce_tutari: string | null;
  butce_para_birimi: string | null;
  baslangic: string | null;
  bitis: string | null;
  aciklama: string | null;
  olusturma: string;
  guncelleme: string | null;
  surum: number;
}

const SECIM = `SELECT p.id, p.kod, p.ad, p.durum, p.firma_id, p.siparis_id, p.butce_tutari, p.butce_para_birimi, p.baslangic, p.bitis, p.aciklama,
                      ${zamanMetni('p.olusturma')} AS olusturma, ${zamanMetni('p.guncelleme')} AS guncelleme, p.surum
                 FROM projeler_proje p`;

export type ProjeSiralamasi = 'kod' | 'ad' | 'baslangic';
export const SIRALAMA: SiralamaTanimi<ProjeSiralamasi> = {
  sutunlar: { kod: 'p.kod', ad: 'p.ad', baslangic: 'p.baslangic' },
  ikincil: 'p.id',
  varsayilan: { sutun: 'p.kod', yon: 'artan' },
};

export interface ProjeSuzgeci {
  kalip: string | null;
  durum: ProjeDurumu | null;
  // 890 c: güncel (son) statüsü bu olan projeler.
  statuId: number | null;
}

const KOSUL = `WHERE ($1::text IS NULL OR p.kod ILIKE $1 OR p.ad ILIKE $1) AND ($2::text IS NULL OR p.durum = $2)
                 AND ($3::int IS NULL OR $3 = (SELECT k.statu_id FROM projeler_statu_kaydi k WHERE k.proje_id = p.id ORDER BY k.id DESC LIMIT 1))`;
const kosulParametreleri = (s: ProjeSuzgeci): unknown[] => [s.kalip, s.durum, s.statuId];

export async function projeSay(db: Db, s: ProjeSuzgeci): Promise<number> {
  const satir = await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam FROM projeler_proje p ${KOSUL}`, kosulParametreleri(s));
  return satir?.toplam ?? 0;
}

export function projeSatirlari(db: Db, s: ProjeSuzgeci, siralama: SiralamaIstegi<ProjeSiralamasi>, dilim: Dilim): Promise<ProjeSatiri[]> {
  return db.sorgu<ProjeSatiri>(
    `${SECIM} ${KOSUL} ORDER BY ${siralamaSql(SIRALAMA, siralama)} LIMIT $4 OFFSET $5`,
    [...kosulParametreleri(s), dilim.sinir, dilim.atla],
  );
}

export function projeGetir(db: Db, id: number): Promise<ProjeSatiri | null> {
  return db.tek<ProjeSatiri>(`${SECIM} WHERE p.id = $1`, [id]);
}

export function projeKodlaGetir(db: Db, kod: string): Promise<ProjeSatiri | null> {
  return db.tek<ProjeSatiri>(`${SECIM} WHERE p.kod = $1`, [kod]);
}

export function projeSecenekleri(db: Db, s: { yalnizAktif: boolean; firmaId: number | null }): Promise<ProjeSatiri[]> {
  return db.sorgu<ProjeSatiri>(
    `${SECIM} WHERE (NOT $1::boolean OR p.durum = 'aktif') AND ($2::int IS NULL OR p.firma_id = $2) ORDER BY p.kod, p.id`,
    [s.yalnizAktif, s.firmaId],
  );
}

export function projeAdlari(db: Db, idler: number[]): Promise<{ id: number; ad: string }[]> {
  return db.sorgu<{ id: number; ad: string }>('SELECT id, ad FROM projeler_proje WHERE id = ANY($1::int[])', [idler]);
}

export function siparisProjeleri(db: Db, siparisId: number): Promise<ProjeSatiri[]> {
  return db.sorgu<ProjeSatiri>(`${SECIM} WHERE p.siparis_id = $1 ORDER BY p.id`, [siparisId]);
}

export interface KilitliProje { firma_id: number | null; siparis_id: number | null; butce_tutari: string | null; butce_para_birimi: string | null }
export async function projeFirmasi(db: Db, id: number): Promise<KilitliProje | null> {
  return db.tek<KilitliProje>('SELECT firma_id, siparis_id, butce_tutari, butce_para_birimi FROM projeler_proje WHERE id = $1 FOR UPDATE', [id]);
}

export interface ProjeAlanlari {
  ad: string;
  firmaId: number | null;
  baslangic: string | null;
  bitis: string | null;
  aciklama: string | null;
  butceTutari: string | null;
  butceParaBirimi: string | null;
}

export async function projeEkle(db: Db, kod: string, a: ProjeAlanlari, kisiId: number, siparisId: number | null = null): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO projeler_proje (kod, ad, firma_id, baslangic, bitis, aciklama, olusturan_id, siparis_id, butce_tutari, butce_para_birimi)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [kod, a.ad, a.firmaId, a.baslangic, a.bitis, a.aciklama, kisiId, siparisId, a.butceTutari, a.butceParaBirimi],
  );
  if (satir === null) throw new Error('Proje eklenemedi');
  return satir.id;
}

// Sürüm tutmazsa satır dönmez; çağıran surumluGuncelle ile 404/409 ayırır.
export function projeGuncelle(
  db: Db, id: number, a: ProjeAlanlari & { durum: ProjeDurumu }, surum: number, kisiId: number,
): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE projeler_proje
        SET ad = $2, firma_id = $3, baslangic = $4, bitis = $5, aciklama = $6, durum = $7,
            butce_tutari = $10, butce_para_birimi = $11, guncelleyen_id = $8, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $9 RETURNING id`,
    [id, a.ad, a.firmaId, a.baslangic, a.bitis, a.aciklama, a.durum, kisiId, surum, a.butceTutari, a.butceParaBirimi],
  );
}

export async function projeVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM projeler_proje WHERE id = $1', [id])) !== null;
}

// --- Proje yönetimi (890 c) ---

export interface StatuSatiri { id: number; ad: string; ton: string; sira: number; etkin: boolean; surum: number }
const STATU_SECIMI = 'SELECT id, ad, ton, sira, etkin, surum FROM projeler_statu';

export function statuler(db: Db, yalnizEtkin: boolean): Promise<StatuSatiri[]> {
  return db.sorgu<StatuSatiri>(`${STATU_SECIMI} WHERE (NOT $1::boolean OR etkin) ORDER BY sira, id`, [yalnizEtkin]);
}

export function statuGetir(db: Db, id: number): Promise<StatuSatiri | null> {
  return db.tek<StatuSatiri>(`${STATU_SECIMI} WHERE id = $1`, [id]);
}

export async function statuEkle(db: Db, g: { ad: string; ton: string; sira: number }, kisiId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    'INSERT INTO projeler_statu (ad, ton, sira, olusturan_id) VALUES ($1, $2, $3, $4) RETURNING id', [g.ad, g.ton, g.sira, kisiId],
  );
  if (satir === null) throw new Error('Statü eklenemedi');
  return satir.id;
}

export function statuGuncelle(
  db: Db, id: number, g: { ad: string; ton: string; sira: number; etkin: boolean }, surum: number, kisiId: number,
): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE projeler_statu SET ad = $2, ton = $3, sira = $4, etkin = $5, guncelleyen_id = $6, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $7 RETURNING id`,
    [id, g.ad, g.ton, g.sira, g.etkin, kisiId, surum],
  );
}

export async function statuVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM projeler_statu WHERE id = $1', [id])) !== null;
}

export async function ayarOku(db: Db): Promise<{ serbestStatu: boolean; surum: number }> {
  const s = await db.tek<{ serbestStatu: boolean; surum: number }>('SELECT serbest_statu AS "serbestStatu", surum FROM projeler_ayar');
  if (s === null) throw new Error('Projeler ayarı yok');
  return s;
}

export function ayarGuncelle(db: Db, serbestStatu: boolean, surum: number, kisiId: number): Promise<{ surum: number } | null> {
  return db.tek<{ surum: number }>(
    `UPDATE projeler_ayar SET serbest_statu = $1, guncelleyen_id = $2, guncelleme = now(), surum = surum + 1
      WHERE surum = $3 RETURNING surum`,
    [serbestStatu, kisiId, surum],
  );
}

export interface StatuKaydiSatiri {
  id: string; proje_id: number; statu_id: number | null; ad: string; ton: string | null; serbest_metin: string | null; notu: string | null;
  kisi_id: number; an: string;
}
const KAYIT_SECIMI = `SELECT k.id::text, k.proje_id, k.statu_id, coalesce(s.ad, k.serbest_metin) AS ad, s.ton, k.serbest_metin, k.notu, k.kisi_id,
                             ${zamanMetni('k.an')} AS an
                        FROM projeler_statu_kaydi k LEFT JOIN projeler_statu s ON s.id = k.statu_id`;

export function statuGecmisi(db: Db, projeId: number): Promise<StatuKaydiSatiri[]> {
  return db.sorgu<StatuKaydiSatiri>(`${KAYIT_SECIMI} WHERE k.proje_id = $1 ORDER BY k.id DESC`, [projeId]);
}

// Projelerin son statü kaydı, tek sorgu; kaydı olmayan proje sonuçta yoktur.
export function sonStatuler(db: Db, projeIdleri: readonly number[]): Promise<StatuKaydiSatiri[]> {
  return db.sorgu<StatuKaydiSatiri>(
    `${KAYIT_SECIMI} WHERE k.id IN (SELECT max(id) FROM projeler_statu_kaydi WHERE proje_id = ANY($1::int[]) GROUP BY proje_id)`,
    [projeIdleri],
  );
}

export async function statuKaydiEkle(
  db: Db, projeId: number, g: { statuId: number | null; metin: string | null; not: string | null }, kisiId: number,
): Promise<void> {
  await db.sorgu(
    'INSERT INTO projeler_statu_kaydi (proje_id, statu_id, serbest_metin, notu, kisi_id) VALUES ($1, $2, $3, $4, $5)',
    [projeId, g.statuId, g.metin, g.not, kisiId],
  );
}

// Yönetim yazmaları projeyi paylaşımlı kilitler: aynı anda kapatılan projeye görev yazılmaz.
export function projeDurumuKilitli(db: Db, id: number): Promise<{ durum: ProjeDurumu } | null> {
  return db.tek<{ durum: ProjeDurumu }>('SELECT durum FROM projeler_proje WHERE id = $1 FOR SHARE', [id]);
}

export interface KilometreTasiSatiri {
  id: number; proje_id: number; ad: string; sira: number; taban_tarih: string; gercek_tarih: string | null; etkin: boolean; surum: number;
}
const TAS_SECIMI = 'SELECT id, proje_id, ad, sira, taban_tarih, gercek_tarih, etkin, surum FROM projeler_kilometre_tasi';

export function kilometreTaslari(db: Db, projeId: number): Promise<KilometreTasiSatiri[]> {
  return db.sorgu<KilometreTasiSatiri>(`${TAS_SECIMI} WHERE proje_id = $1 ORDER BY sira, id`, [projeId]);
}

export function kilometreTasiKilitli(db: Db, id: number): Promise<KilometreTasiSatiri | null> {
  return db.tek<KilometreTasiSatiri>(`${TAS_SECIMI} WHERE id = $1 FOR UPDATE`, [id]);
}

export async function kilometreTasiVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM projeler_kilometre_tasi WHERE id = $1', [id])) !== null;
}

export async function kilometreTasiEkle(
  db: Db, projeId: number, g: { ad: string; sira: number; tabanTarih: string }, kisiId: number,
): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    'INSERT INTO projeler_kilometre_tasi (proje_id, ad, sira, taban_tarih, olusturan_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [projeId, g.ad, g.sira, g.tabanTarih, kisiId],
  );
  if (satir === null) throw new Error('Kilometre taşı eklenemedi');
  return satir.id;
}

export function kilometreTasiGuncelle(
  db: Db, id: number, g: { ad: string; sira: number; gercekTarih: string | null; etkin: boolean }, surum: number, kisiId: number,
): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE projeler_kilometre_tasi SET ad = $2, sira = $3, gercek_tarih = $4, etkin = $5, guncelleyen_id = $6, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $7 RETURNING id`,
    [id, g.ad, g.sira, g.gercekTarih, g.etkin, kisiId, surum],
  );
}

// Geçmiş satırı önce yazılır; tetikleyici taban değişikliğini ancak aynı transaction'daki bu satırla kabul eder.
export async function tabanYenile(
  db: Db, id: number, eski: string, yeni: string, gerekce: string, surum: number, kisiId: number,
): Promise<{ id: number } | null> {
  await db.sorgu(
    'INSERT INTO projeler_kilometre_tasi_taban (kilometre_tasi_id, eski_tarih, yeni_tarih, gerekce, kisi_id) VALUES ($1, $2, $3, $4, $5)',
    [id, eski, yeni, gerekce, kisiId],
  );
  return db.tek<{ id: number }>(
    `UPDATE projeler_kilometre_tasi SET taban_tarih = $2, guncelleyen_id = $3, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $4 RETURNING id`,
    [id, yeni, kisiId, surum],
  );
}

export interface TabanKaydiSatiri { kilometre_tasi_id: number; eski_tarih: string; yeni_tarih: string; gerekce: string; kisi_id: number; an: string }
export function tabanGecmisi(db: Db, tasIdleri: readonly number[]): Promise<TabanKaydiSatiri[]> {
  return db.sorgu<TabanKaydiSatiri>(
    `SELECT kilometre_tasi_id, eski_tarih, yeni_tarih, gerekce, kisi_id, ${zamanMetni('an')} AS an
       FROM projeler_kilometre_tasi_taban WHERE kilometre_tasi_id = ANY($1::int[]) ORDER BY id`,
    [tasIdleri],
  );
}

export interface GorevSatiri {
  id: number; proje_id: number; kilometre_tasi_id: number | null; ad: string; aciklama: string | null; sorumlu_kisi_id: number | null;
  plan_baslangic: string; plan_bitis: string; gercek_baslangic: string | null; gercek_bitis: string | null; ilerleme: number; durum: string;
  onceki_gorev_id: number | null; surum: number;
}
const GOREV_SECIMI = `SELECT id, proje_id, kilometre_tasi_id, ad, aciklama, sorumlu_kisi_id, plan_baslangic, plan_bitis, gercek_baslangic, gercek_bitis,
                             ilerleme, durum, onceki_gorev_id, surum
                        FROM projeler_gorev`;

export function gorevler(db: Db, projeId: number): Promise<GorevSatiri[]> {
  return db.sorgu<GorevSatiri>(`${GOREV_SECIMI} WHERE proje_id = $1 ORDER BY plan_baslangic, id`, [projeId]);
}

export function gorevKilitli(db: Db, id: number): Promise<GorevSatiri | null> {
  return db.tek<GorevSatiri>(`${GOREV_SECIMI} WHERE id = $1 FOR UPDATE`, [id]);
}

export async function gorevVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM projeler_gorev WHERE id = $1', [id])) !== null;
}

// Projelerin görevleri ilerleme hesabı için (liste); tek sorgu.
export function projelerinGorevleri(
  db: Db, projeIdleri: readonly number[],
): Promise<{ proje_id: number; durum: string; ilerleme: number; plan_baslangic: string; plan_bitis: string }[]> {
  return db.sorgu(
    'SELECT proje_id, durum, ilerleme, plan_baslangic, plan_bitis FROM projeler_gorev WHERE proje_id = ANY($1::int[])', [projeIdleri],
  );
}

export interface GorevAlanlari {
  kilometreTasiId: number | null; ad: string; aciklama: string | null; sorumluKisiId: number | null; planBaslangic: string; planBitis: string;
  oncekiGorevId: number | null;
}

export async function gorevEkle(db: Db, projeId: number, g: GorevAlanlari, kisiId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO projeler_gorev (proje_id, kilometre_tasi_id, ad, aciklama, sorumlu_kisi_id, plan_baslangic, plan_bitis, onceki_gorev_id, olusturan_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [projeId, g.kilometreTasiId, g.ad, g.aciklama, g.sorumluKisiId, g.planBaslangic, g.planBitis, g.oncekiGorevId, kisiId],
  );
  if (satir === null) throw new Error('Görev eklenemedi');
  return satir.id;
}

export function gorevGuncelle(
  db: Db, id: number,
  g: GorevAlanlari & { gercekBaslangic: string | null; gercekBitis: string | null; ilerleme: number; durum: string },
  surum: number, kisiId: number,
): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE projeler_gorev
        SET kilometre_tasi_id = $2, ad = $3, aciklama = $4, sorumlu_kisi_id = $5, plan_baslangic = $6, plan_bitis = $7, onceki_gorev_id = $8,
            gercek_baslangic = $9, gercek_bitis = $10, ilerleme = $11, durum = $12, guncelleyen_id = $13, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $14 RETURNING id`,
    [id, g.kilometreTasiId, g.ad, g.aciklama, g.sorumluKisiId, g.planBaslangic, g.planBitis, g.oncekiGorevId,
      g.gercekBaslangic, g.gercekBitis, g.ilerleme, g.durum, kisiId, surum],
  );
}

export async function oncekiEslemesi(db: Db, projeId: number): Promise<Map<number, number | null>> {
  const s = await db.sorgu<{ id: number; onceki: number | null }>(
    'SELECT id, onceki_gorev_id AS onceki FROM projeler_gorev WHERE proje_id = $1', [projeId],
  );
  return new Map(s.map((x) => [x.id, x.onceki]));
}
