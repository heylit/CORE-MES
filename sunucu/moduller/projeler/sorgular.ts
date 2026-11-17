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
  bitis_bagli: boolean;
  aciklama: string | null;
  olusturma: string;
  guncelleme: string | null;
  surum: number;
}

const SECIM = `SELECT p.id, p.kod, p.ad, p.durum, p.firma_id, p.siparis_id, p.butce_tutari, p.butce_para_birimi, p.baslangic, p.bitis, p.bitis_bagli,
                      p.aciklama, ${zamanMetni('p.olusturma')} AS olusturma, ${zamanMetni('p.guncelleme')} AS guncelleme, p.surum
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

export interface KilitliProje {
  firma_id: number | null; siparis_id: number | null; butce_tutari: string | null; butce_para_birimi: string | null; durum: string;
}
export async function projeFirmasi(db: Db, id: number): Promise<KilitliProje | null> {
  return db.tek<KilitliProje>(
    'SELECT firma_id, siparis_id, butce_tutari, butce_para_birimi, durum FROM projeler_proje WHERE id = $1 FOR UPDATE', [id],
  );
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

export async function projeEkle(
  db: Db, kod: string, a: ProjeAlanlari, kisiId: number, siparisId: number | null = null, bitisBagli = false,
): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO projeler_proje (kod, ad, firma_id, baslangic, bitis, aciklama, olusturan_id, siparis_id, butce_tutari, butce_para_birimi, bitis_bagli)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [kod, a.ad, a.firmaId, a.baslangic, a.bitis, a.aciklama, kisiId, siparisId, a.butceTutari, a.butceParaBirimi, bitisBagli],
  );
  if (satir === null) throw new Error('Proje eklenemedi');
  return satir.id;
}

// Sürüm tutmazsa satır dönmez; çağıran surumluGuncelle ile 404/409 ayırır. 3244 b: bitiş elle değişirse sipariş termini bağı kopar.
export function projeGuncelle(
  db: Db, id: number, a: ProjeAlanlari & { durum: ProjeDurumu }, surum: number, kisiId: number,
): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE projeler_proje
        SET ad = $2, firma_id = $3, baslangic = $4, bitis = $5, aciklama = $6, durum = $7,
            bitis_bagli = bitis_bagli AND bitis IS NOT DISTINCT FROM $5::date,
            butce_tutari = $10, butce_para_birimi = $11, guncelleyen_id = $8, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $9 RETURNING id`,
    [id, a.ad, a.firmaId, a.baslangic, a.bitis, a.aciklama, a.durum, kisiId, surum, a.butceTutari, a.butceParaBirimi],
  );
}

// 3244 b: bitiş siparişin terminine yeniden bağlanır; sürüm tutmazsa satır dönmez.
export function projeBitisBagla(db: Db, id: number, termin: string, surum: number, kisiId: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE projeler_proje SET bitis = $2, bitis_bagli = true, guncelleyen_id = $4, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $3 RETURNING id`,
    [id, termin, surum, kisiId],
  );
}

// 3244 b, 3254 a: siparişin termini değişip yeniden onaylanınca bağlı ve aktif projelerin bitişi yeni termine kayar. Başlangıcı yeni
// terminden sonra olan proje değişmez (PRJ-04). Değişen projeler döner.
export function bagliBitisleriKaydir(db: Db, siparisId: number, termin: string, kisiId: number): Promise<{ id: number }[]> {
  return db.sorgu<{ id: number }>(
    `UPDATE projeler_proje SET bitis = $2::date, guncelleyen_id = $3, guncelleme = now(), surum = surum + 1
      WHERE siparis_id = $1 AND bitis_bagli AND durum = 'aktif' AND bitis IS DISTINCT FROM $2::date
        AND (baslangic IS NULL OR baslangic <= $2::date)
      RETURNING id`,
    [siparisId, termin, kisiId],
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
  asama: string | null; yapan_rol_id: number | null; kontrol_kisi_id: number | null; kontrol_rol_id: number | null;
  yedek_kontrol_kisi_id: number | null; yedek_kontrol_rol_id: number | null; onaylandi: boolean;
}
const GOREV_SUTUNLARI = [
  'id', 'proje_id', 'kilometre_tasi_id', 'ad', 'aciklama', 'sorumlu_kisi_id', 'plan_baslangic', 'plan_bitis', 'gercek_baslangic', 'gercek_bitis',
  'ilerleme', 'durum', 'onceki_gorev_id', 'surum', 'asama', 'yapan_rol_id', 'kontrol_kisi_id', 'kontrol_rol_id', 'yedek_kontrol_kisi_id',
  'yedek_kontrol_rol_id', 'onaylandi',
] as const;
const GOREV_ALANLARI = GOREV_SUTUNLARI.join(', ');
const GOREV_SECIMI = `SELECT ${GOREV_ALANLARI} FROM projeler_gorev`;

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
  oncekiGorevId: number | null; asama: string | null; yapanRolId: number | null; kontrolKisiId: number | null; kontrolRolId: number | null;
  yedekKontrolKisiId: number | null; yedekKontrolRolId: number | null;
}

export async function gorevEkle(db: Db, projeId: number, g: GorevAlanlari, kisiId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO projeler_gorev (proje_id, kilometre_tasi_id, ad, aciklama, sorumlu_kisi_id, plan_baslangic, plan_bitis, onceki_gorev_id, olusturan_id,
                                 asama, yapan_rol_id, kontrol_kisi_id, kontrol_rol_id, yedek_kontrol_kisi_id, yedek_kontrol_rol_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
    [projeId, g.kilometreTasiId, g.ad, g.aciklama, g.sorumluKisiId, g.planBaslangic, g.planBitis, g.oncekiGorevId, kisiId,
      g.asama, g.yapanRolId, g.kontrolKisiId, g.kontrolRolId, g.yedekKontrolKisiId, g.yedekKontrolRolId],
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
            gercek_baslangic = $9, gercek_bitis = $10, ilerleme = $11, durum = $12, guncelleyen_id = $13, guncelleme = now(), surum = surum + 1,
            asama = $15, yapan_rol_id = $16, kontrol_kisi_id = $17, kontrol_rol_id = $18, yedek_kontrol_kisi_id = $19, yedek_kontrol_rol_id = $20,
            onaylandi = onaylandi AND $12 = 'bitti'
      WHERE id = $1 AND surum = $14 RETURNING id`,
    [id, g.kilometreTasiId, g.ad, g.aciklama, g.sorumluKisiId, g.planBaslangic, g.planBitis, g.oncekiGorevId,
      g.gercekBaslangic, g.gercekBitis, g.ilerleme, g.durum, kisiId, surum,
      g.asama, g.yapanRolId, g.kontrolKisiId, g.kontrolRolId, g.yedekKontrolKisiId, g.yedekKontrolRolId],
  );
}

export async function oncekiEslemesi(db: Db, projeId: number): Promise<Map<number, number | null>> {
  const s = await db.sorgu<{ id: number; onceki: number | null }>(
    'SELECT id, onceki_gorev_id AS onceki FROM projeler_gorev WHERE proje_id = $1', [projeId],
  );
  return new Map(s.map((x) => [x.id, x.onceki]));
}

// --- 3269: görev akışı ---

// Akış yazmaları sürüm koşulludur; tarih sunucunun günüdür. Bitmeyen görev gerçek bitiş taşımaz.
export function gorevUstlen(db: Db, id: number, kisiId: number, surum: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE projeler_gorev SET sorumlu_kisi_id = $2, yapan_rol_id = NULL, guncelleyen_id = $2, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $3 AND sorumlu_kisi_id IS NULL RETURNING id`,
    [id, kisiId, surum],
  );
}

export function gorevBasla(db: Db, id: number, kisiId: number, surum: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE projeler_gorev SET durum = 'suruyor', gercek_baslangic = COALESCE(gercek_baslangic, current_date),
            guncelleyen_id = $2, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $3 RETURNING id`,
    [id, kisiId, surum],
  );
}

export function gorevBitir(db: Db, id: number, durum: 'kontrolde' | 'bitti', kisiId: number, surum: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE projeler_gorev SET durum = $2, gercek_baslangic = LEAST(COALESCE(gercek_baslangic, current_date), current_date),
            gercek_bitis = CASE WHEN $2 = 'bitti' THEN current_date ELSE NULL END, ilerleme = CASE WHEN $2 = 'bitti' THEN 100 ELSE ilerleme END,
            guncelleyen_id = $3, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $4 RETURNING id`,
    [id, durum, kisiId, surum],
  );
}

export function gorevOnayla(db: Db, id: number, kisiId: number, surum: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE projeler_gorev SET durum = 'bitti', onaylandi = true, gercek_baslangic = LEAST(COALESCE(gercek_baslangic, current_date), current_date),
            gercek_bitis = current_date, ilerleme = 100, guncelleyen_id = $2, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $3 RETURNING id`,
    [id, kisiId, surum],
  );
}

export function gorevIptal(db: Db, id: number, kisiId: number, surum: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE projeler_gorev SET durum = 'iptal', guncelleyen_id = $2, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $3 RETURNING id`,
    [id, kisiId, surum],
  );
}

// 3396 Risk K-A: emri kapanan (biten, iptal edilen ya da silinen) açık hazırlık görevi sistemce iptal olur; kişi yazılmaz.
// Emre bağlı açık hazırlık görevleri; kontroldekiler dahil (emri kapanınca onlar da iptal olur, kontrol bildirimi kapanır).
export function emreBagliAcikHazirliklar(db: Db): Promise<{ id: number; hazirlik_emri_id: number }[]> {
  return db.sorgu(
    `SELECT id, hazirlik_emri_id FROM projeler_gorev
      WHERE hazirlik_maddesi IS NOT NULL AND hazirlik_emri_id IS NOT NULL AND durum IN ('yapilacak', 'suruyor', 'bekliyor', 'kontrolde') ORDER BY id`,
  );
}
export function hazirlikGoreviniKapat(db: Db, id: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE projeler_gorev SET durum = 'iptal', guncelleyen_id = NULL, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND hazirlik_maddesi IS NOT NULL AND durum IN ('yapilacak', 'suruyor', 'bekliyor', 'kontrolde') RETURNING id`,
    [id],
  );
}

export function gorevGeriGonder(db: Db, id: number, kisiId: number, surum: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE projeler_gorev SET durum = 'suruyor', guncelleyen_id = $2, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $3 RETURNING id`,
    [id, kisiId, surum],
  );
}

export async function gorevOlayiEkle(db: Db, gorevId: number, olay: string, kisiId: number, gerekce: string | null): Promise<void> {
  await db.sorgu('INSERT INTO projeler_gorev_olayi (gorev_id, olay, kisi_id, gerekce) VALUES ($1, $2, $3, $4)', [gorevId, olay, kisiId, gerekce]);
}

export interface GorevOlayiSatiri { olay: string; kisi_id: number; gerekce: string | null; an: string }
export function gorevOlaylari(db: Db, gorevId: number): Promise<GorevOlayiSatiri[]> {
  return db.sorgu<GorevOlayiSatiri>(
    `SELECT olay, kisi_id, gerekce, ${zamanMetni('an')} AS an FROM projeler_gorev_olayi WHERE gorev_id = $1 ORDER BY id DESC`, [gorevId],
  );
}

// Görevi son bitiren kişi ve bu "bitti"den beri geçen tam gün: kontrol kuralı (yapan kontrol edemez, yedek süresi) bunu kullanır.
export async function sonBitirenler(db: Db, gorevIdleri: readonly number[]): Promise<Map<number, { kisiId: number; gun: number }>> {
  if (gorevIdleri.length === 0) return new Map();
  const s = await db.sorgu<{ gorev_id: number; kisi_id: number; gun: number }>(
    `SELECT DISTINCT ON (gorev_id) gorev_id, kisi_id, floor(extract(epoch FROM now() - an) / 86400)::int AS gun
       FROM projeler_gorev_olayi WHERE olay = 'bitti' AND gorev_id = ANY($1::int[]) ORDER BY gorev_id, id DESC`,
    [gorevIdleri],
  );
  return new Map(s.map((x) => [x.gorev_id, { kisiId: x.kisi_id, gun: x.gun }]));
}

export function gorevGetir(db: Db, id: number): Promise<GorevSatiri | null> {
  return db.tek<GorevSatiri>(`${GOREV_SECIMI} WHERE id = $1`, [id]);
}

// Proje görevlerim adayları: aktif projede kişiye ya da rolüne açık, kontrolü kişiye ya da rolüne düşen ve kişinin bitirip
// kontrolde bekleyen görevler. Kesin seçim kurallar.ts gorevlerimTuru'ndadır.
export type GorevlerimSatiri = GorevSatiri & { proje_kod: string; proje_ad: string };
export function gorevlerimAdaylari(db: Db, kisiId: number, rolIdleri: readonly number[]): Promise<GorevlerimSatiri[]> {
  return db.sorgu<GorevlerimSatiri>(
    `SELECT ${GOREV_SUTUNLARI.map((a) => `g.${a}`).join(', ')}, p.kod AS proje_kod, p.ad AS proje_ad
       FROM projeler_gorev g JOIN projeler_proje p ON p.id = g.proje_id
      WHERE p.durum = 'aktif' AND g.durum NOT IN ('bitti', 'iptal')
        AND (g.sorumlu_kisi_id = $1 OR g.yapan_rol_id = ANY($2::int[])
             OR (g.durum = 'kontrolde' AND (g.kontrol_kisi_id = $1 OR g.kontrol_rol_id = ANY($2::int[])
                                            OR g.yedek_kontrol_kisi_id = $1 OR g.yedek_kontrol_rol_id = ANY($2::int[])
                                            OR EXISTS (SELECT 1 FROM projeler_gorev_olayi o WHERE o.gorev_id = g.id AND o.olay = 'bitti' AND o.kisi_id = $1))))
      ORDER BY g.plan_bitis, g.id
      LIMIT 500`,
    [kisiId, rolIdleri],
  );
}

export async function gorevOncekiYaz(db: Db, id: number, oncekiId: number): Promise<void> {
  await db.sorgu('UPDATE projeler_gorev SET onceki_gorev_id = $2 WHERE id = $1', [id, oncekiId]);
}

// --- 3269: görev şablonu ---

export interface SablonSatiri { id: number; ad: string; varsayilan: boolean; etkin: boolean; guncelleme: string | null; surum: number }
const SABLON_SECIMI = `SELECT id, ad, varsayilan, etkin, ${zamanMetni('COALESCE(guncelleme, olusturma)')} AS guncelleme, surum FROM projeler_gorev_sablonu`;
export function sablonlar(db: Db, yalnizEtkin: boolean): Promise<SablonSatiri[]> {
  return db.sorgu<SablonSatiri>(`${SABLON_SECIMI} WHERE etkin OR NOT $1 ORDER BY varsayilan DESC, lower(ad), id`, [yalnizEtkin]);
}
export function sablonGetir(db: Db, id: number): Promise<SablonSatiri | null> {
  return db.tek<SablonSatiri>(`${SABLON_SECIMI} WHERE id = $1`, [id]);
}
export function varsayilanSablon(db: Db): Promise<SablonSatiri | null> {
  return db.tek<SablonSatiri>(`${SABLON_SECIMI} WHERE varsayilan`);
}
export async function sablonVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM projeler_gorev_sablonu WHERE id = $1', [id])) !== null;
}

export interface SablonKalemiSatiri {
  id: number; sablon_id: number; sira: number; ad: string; aciklama: string | null; asama: string | null; dayanak: 'baslangic' | 'termin'; gun: number;
  sure_gun: number; yapan_rol_id: number | null; yapan_kisi_id: number | null; kontrol_rol_id: number | null; kontrol_kisi_id: number | null;
  yedek_kontrol_rol_id: number | null; yedek_kontrol_kisi_id: number | null; onceki_kalem_id: number | null; hazirlik_maddesi: string | null;
  kontrol_kosulu: 'her-zaman' | 'yeni-revize';
}
export function sablonKalemleri(db: Db, sablonIdleri: readonly number[]): Promise<SablonKalemiSatiri[]> {
  if (sablonIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu<SablonKalemiSatiri>(
    `SELECT id, sablon_id, sira, ad, aciklama, asama, dayanak, gun, sure_gun, yapan_rol_id, yapan_kisi_id, kontrol_rol_id, kontrol_kisi_id,
            yedek_kontrol_rol_id, yedek_kontrol_kisi_id, onceki_kalem_id, hazirlik_maddesi, kontrol_kosulu
       FROM projeler_gorev_sablon_kalemi WHERE sablon_id = ANY($1::int[]) ORDER BY sablon_id, sira, id`,
    [sablonIdleri],
  );
}

export async function sablonEkle(db: Db, g: { ad: string; varsayilan: boolean; etkin: boolean }, kisiId: number): Promise<number> {
  const s = await db.tek<{ id: number }>(
    'INSERT INTO projeler_gorev_sablonu (ad, varsayilan, etkin, olusturan_id) VALUES ($1, $2, $3, $4) RETURNING id', [g.ad, g.varsayilan, g.etkin, kisiId],
  );
  if (s === null) throw new Error('Şablon eklenemedi');
  return s.id;
}
export function sablonGuncelle(
  db: Db, id: number, g: { ad: string; varsayilan: boolean; etkin: boolean }, surum: number, kisiId: number,
): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE projeler_gorev_sablonu SET ad = $2, varsayilan = $3, etkin = $4, guncelleyen_id = $5, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $6 RETURNING id`,
    [id, g.ad, g.varsayilan, g.etkin, kisiId, surum],
  );
}
// Yeni varsayılan seçilince eskisi kendiliğinden bırakılır (tek varsayılan dizini). Sürümü artar: düzenleyen eski formla yazamaz.
export async function varsayilaniBirak(db: Db, haricId: number | null, kisiId: number): Promise<void> {
  await db.sorgu(
    `UPDATE projeler_gorev_sablonu SET varsayilan = false, guncelleyen_id = $2, guncelleme = now(), surum = surum + 1
      WHERE varsayilan AND id IS DISTINCT FROM $1`,
    [haricId, kisiId],
  );
}
export async function sablonKalemleriniSil(db: Db, sablonId: number): Promise<void> {
  await db.sorgu('DELETE FROM projeler_gorev_sablon_kalemi WHERE sablon_id = $1', [sablonId]);
}
export interface KalemAlanlari {
  ad: string; aciklama: string | null; asama: string | null; dayanak: string; gun: number; sureGun: number; yapanRolId: number | null;
  yapanKisiId: number | null; kontrolRolId: number | null; kontrolKisiId: number | null; yedekKontrolRolId: number | null;
  yedekKontrolKisiId: number | null; hazirlikMaddesi: string | null; kontrolKosulu: string;
}
export async function sablonKalemiEkle(db: Db, sablonId: number, sira: number, k: KalemAlanlari, oncekiId: number | null): Promise<number> {
  const s = await db.tek<{ id: number }>(
    `INSERT INTO projeler_gorev_sablon_kalemi (sablon_id, sira, ad, aciklama, asama, dayanak, gun, sure_gun, yapan_rol_id, yapan_kisi_id, kontrol_rol_id,
                                               kontrol_kisi_id, yedek_kontrol_rol_id, yedek_kontrol_kisi_id, onceki_kalem_id, hazirlik_maddesi, kontrol_kosulu)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
    [sablonId, sira, k.ad, k.aciklama, k.asama, k.dayanak, k.gun, k.sureGun, k.yapanRolId, k.yapanKisiId, k.kontrolRolId, k.kontrolKisiId,
      k.yedekKontrolRolId, k.yedekKontrolKisiId, oncekiId, k.hazirlikMaddesi, k.kontrolKosulu],
  );
  if (s === null) throw new Error('Şablon kalemi eklenemedi');
  return s.id;
}

export async function projeSablonuEkle(
  db: Db, projeId: number, sablonId: number, sablonSurum: number, kalemler: readonly unknown[], kisiId: number,
): Promise<void> {
  await db.sorgu(
    'INSERT INTO projeler_proje_sablonu (proje_id, sablon_id, sablon_surum, kalemler, kisi_id) VALUES ($1, $2, $3, $4::jsonb, $5)',
    [projeId, sablonId, sablonSurum, JSON.stringify(kalemler), kisiId],
  );
}

export async function bugun(db: Db): Promise<string> {
  const s = await db.tek<{ bugun: string }>('SELECT current_date::text AS bugun');
  if (s === null) throw new Error('Tarih okunamadı');
  return s.bugun;
}

// --- Hazırlık görevi (3396 a) ---

export interface HazirlikGoreviAlanlari extends GorevAlanlari { hazirlikMaddesi: string; emriId: number; isEmriId: number | null }
// Aynı emir, iş emri ve madde için iptal edilmemiş görev varsa eklenmez (tekil dizin): null döner.
export async function hazirlikGoreviEkle(db: Db, projeId: number, g: HazirlikGoreviAlanlari, kisiId: number): Promise<number | null> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO projeler_gorev (proje_id, kilometre_tasi_id, ad, aciklama, sorumlu_kisi_id, plan_baslangic, plan_bitis, onceki_gorev_id, olusturan_id,
                                 asama, yapan_rol_id, kontrol_kisi_id, kontrol_rol_id, yedek_kontrol_kisi_id, yedek_kontrol_rol_id,
                                 hazirlik_maddesi, hazirlik_emri_id, hazirlik_is_emri_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     ON CONFLICT (hazirlik_emri_id, (COALESCE(hazirlik_is_emri_id, 0)), hazirlik_maddesi)
       WHERE hazirlik_maddesi IS NOT NULL AND durum <> 'iptal' DO NOTHING
     RETURNING id`,
    [projeId, g.kilometreTasiId, g.ad, g.aciklama, g.sorumluKisiId, g.planBaslangic, g.planBitis, g.oncekiGorevId, kisiId,
      g.asama, g.yapanRolId, g.kontrolKisiId, g.kontrolRolId, g.yedekKontrolKisiId, g.yedekKontrolRolId, g.hazirlikMaddesi, g.emriId, g.isEmriId],
  );
  return satir?.id ?? null;
}

// Projeye uygulanmış şablonların donmuş kalemleri (uygulama sırasıyla).
export async function uygulananKalemler(db: Db, projeId: number): Promise<unknown[]> {
  const satirlar = await db.sorgu<{ kalemler: unknown[] }>('SELECT kalemler FROM projeler_proje_sablonu WHERE proje_id = $1 ORDER BY id', [projeId]);
  return satirlar.flatMap((s) => s.kalemler);
}
export async function sablonUygulandiMi(db: Db, projeId: number, sablonId: number): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM projeler_proje_sablonu WHERE proje_id = $1 AND sablon_id = $2', [projeId, sablonId])) !== null;
}

export interface HazirlikGoreviSatiri {
  id: number; proje_id: number; ad: string; durum: string; hazirlik_maddesi: string; hazirlik_emri_id: number; hazirlik_is_emri_id: number | null;
  sorumlu_kisi_id: number | null; yapan_rol_id: number | null; kontrol_kisi_id: number | null; kontrol_rol_id: number | null;
  plan_bitis: string; ilerleme: number; onaylandi: boolean; surum: number; gecikme_gun: number | null; kademe: number | null;
}
export function hazirlikGorevleri(db: Db, emirIdleri: readonly number[]): Promise<HazirlikGoreviSatiri[]> {
  if (emirIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu<HazirlikGoreviSatiri>(
    `SELECT id, proje_id, ad, durum, hazirlik_maddesi, hazirlik_emri_id, hazirlik_is_emri_id, sorumlu_kisi_id, yapan_rol_id, kontrol_kisi_id, kontrol_rol_id,
            plan_bitis::text AS plan_bitis, ilerleme, onaylandi, surum,
            CASE WHEN durum <> 'bitti' AND plan_bitis < current_date THEN current_date - plan_bitis END AS gecikme_gun,
            (SELECT max(k.kademe)::int FROM projeler_hazirlik_kademe k WHERE k.gorev_id = projeler_gorev.id) AS kademe
       FROM projeler_gorev WHERE hazirlik_emri_id = ANY($1::int[]) AND durum <> 'iptal' ORDER BY hazirlik_emri_id, hazirlik_is_emri_id NULLS FIRST, id`,
    [emirIdleri],
  );
}
export async function hazirlikGoreviVarMi(db: Db, emriId: number, isEmriId: number | null, madde: string): Promise<boolean> {
  return (await db.tek(
    `SELECT 1 AS var FROM projeler_gorev
      WHERE hazirlik_emri_id = $1 AND COALESCE(hazirlik_is_emri_id, 0) = COALESCE($2::int, 0) AND hazirlik_maddesi = $3 AND durum <> 'iptal'`,
    [emriId, isEmriId, madde],
  )) !== null;
}
export function projeninHazirlikGorevleri(db: Db, projeId: number): Promise<HazirlikGoreviSatiri[]> {
  return db.sorgu<HazirlikGoreviSatiri>(
    `SELECT id, proje_id, ad, durum, hazirlik_maddesi, hazirlik_emri_id, hazirlik_is_emri_id, sorumlu_kisi_id, yapan_rol_id, kontrol_kisi_id, kontrol_rol_id,
            plan_bitis::text AS plan_bitis, ilerleme, onaylandi, surum,
            CASE WHEN durum <> 'bitti' AND plan_bitis < current_date THEN current_date - plan_bitis END AS gecikme_gun,
            (SELECT max(k.kademe)::int FROM projeler_hazirlik_kademe k WHERE k.gorev_id = projeler_gorev.id) AS kademe
       FROM projeler_gorev WHERE proje_id = $1 AND hazirlik_maddesi IS NOT NULL AND durum <> 'iptal'
      ORDER BY hazirlik_emri_id, hazirlik_is_emri_id NULLS FIRST, id`,
    [projeId],
  );
}
// Yalnız bitmemiş hazırlık görevi yeniden atanır; üstlenen kişi rol atanınca bırakılır.
export function hazirlikGoreviAta(
  db: Db, id: number, g: { sorumluKisiId: number | null; yapanRolId: number | null }, surum: number, kisiId: number,
): Promise<{ id: number; proje_id: number; surum: number } | null> {
  return db.tek(
    `UPDATE projeler_gorev SET sorumlu_kisi_id = $2, yapan_rol_id = $3, guncelleyen_id = $4, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $5 AND hazirlik_maddesi IS NOT NULL AND durum IN ('yapilacak', 'suruyor', 'bekliyor')
      RETURNING id, proje_id, surum`,
    [id, g.sorumluKisiId, g.yapanRolId, kisiId, surum],
  );
}
export function hazirlikGoreviDurumu(db: Db, id: number): Promise<{ proje_id: number; durum: string; hazirlik_maddesi: string | null } | null> {
  return db.tek('SELECT proje_id, durum, hazirlik_maddesi FROM projeler_gorev WHERE id = $1', [id]);
}

// --- Hazırlık kademesi (3396 a) ---

export interface KademeAyariSatiri {
  hatirlat_gun: number; yonetici_gun: number; devret_gun: number; yonetici_rol_id: number | null; surum: number;
  degistiren_id: number | null; degisti: string | null;
}
export async function kademeAyari(db: Db): Promise<KademeAyariSatiri> {
  const s = await db.tek<KademeAyariSatiri>(
    `SELECT hatirlat_gun, yonetici_gun, devret_gun, yonetici_rol_id, surum, degistiren_id, ${zamanMetni('degisti')} AS degisti
       FROM projeler_hazirlik_kademe_ayari WHERE id = 1`,
  );
  if (s === null) throw new Error('Kademe ayarı satırı yok');
  return s;
}
export function kademeAyariYaz(
  db: Db, g: { hatirlatGun: number; yoneticiGun: number; devretGun: number; yoneticiRolId: number | null }, surum: number, kisiId: number,
): Promise<{ surum: number } | null> {
  return db.tek(
    `UPDATE projeler_hazirlik_kademe_ayari
        SET hatirlat_gun = $1, yonetici_gun = $2, devret_gun = $3, yonetici_rol_id = $4, degistiren_id = $5, degisti = now(), surum = surum + 1
      WHERE id = 1 AND surum = $6 RETURNING surum`,
    [g.hatirlatGun, g.yoneticiGun, g.devretGun, g.yoneticiRolId, kisiId, surum],
  );
}

// Açık (bitmemiş, kontrole düşmemiş) hazırlık görevleri, aktif projede; yazılmış kademeleriyle.
export interface TakipGorevi {
  id: number; proje_id: number; ad: string; plan_bitis: string; sorumlu_kisi_id: number | null; yapan_rol_id: number | null;
  kontrol_kisi_id: number | null; kontrol_rol_id: number | null; yedek_kontrol_kisi_id: number | null; yedek_kontrol_rol_id: number | null;
  hazirlik_emri_id: number | null; kademeler: number[];
}
export function takipGorevleri(db: Db): Promise<TakipGorevi[]> {
  return db.sorgu<TakipGorevi>(
    `SELECT g.id, g.proje_id, g.ad, g.plan_bitis::text AS plan_bitis, g.sorumlu_kisi_id, g.yapan_rol_id, g.kontrol_kisi_id, g.kontrol_rol_id,
            g.yedek_kontrol_kisi_id, g.yedek_kontrol_rol_id, g.hazirlik_emri_id,
            COALESCE((SELECT array_agg(k.kademe::int ORDER BY k.kademe) FROM projeler_hazirlik_kademe k WHERE k.gorev_id = g.id), '{}') AS kademeler
       FROM projeler_gorev g JOIN projeler_proje p ON p.id = g.proje_id
      WHERE g.hazirlik_maddesi IS NOT NULL AND g.durum IN ('yapilacak', 'suruyor', 'bekliyor') AND p.durum = 'aktif'
      ORDER BY g.id`,
  );
}
export async function kademeYaz(db: Db, gorevId: number, kademe: number, bildirildi: boolean, aliciSayisi: number): Promise<boolean> {
  return (await db.tek(
    `INSERT INTO projeler_hazirlik_kademe (gorev_id, kademe, bildirildi, alici_sayisi) VALUES ($1, $2, $3, $4)
     ON CONFLICT (gorev_id, kademe) DO NOTHING RETURNING kademe`,
    [gorevId, kademe, bildirildi, aliciSayisi],
  )) !== null;
}
export function gorevKademeleri(db: Db, gorevId: number): Promise<{ kademe: number; an: string; bildirildi: boolean; alici_sayisi: number }[]> {
  return db.sorgu(`SELECT kademe, ${zamanMetni('an')} AS an, bildirildi, alici_sayisi FROM projeler_hazirlik_kademe WHERE gorev_id = $1 ORDER BY kademe`, [gorevId]);
}
// Günlük özet gün başına bir kez: satır yazılabildiyse bu çalışma gönderir.
export async function ozetYaz(db: Db, gun: string, sayi: number): Promise<boolean> {
  return (await db.tek('INSERT INTO projeler_hazirlik_ozet (gun, gorev_sayisi) VALUES ($1, $2) ON CONFLICT (gun) DO NOTHING RETURNING gun', [gun, sayi])) !== null;
}
export async function tesisSaati(db: Db): Promise<number> {
  const s = await db.tek<{ saat: number }>('SELECT extract(hour FROM now())::int AS saat');
  return s?.saat ?? 0;
}
// Kişinin geciken hazırlık görevleri (kendisi yapan, ya da üstlenilmemiş ve rolüne atanmış): kırmızı şerit.
export function gecikenHazirliklarim(db: Db, kisiId: number, rolIdleri: readonly number[]): Promise<{ id: number; ad: string; plan_bitis: string; gecikme_gun: number; kademe: number | null }[]> {
  return db.sorgu(
    `SELECT g.id, g.ad, g.plan_bitis::text AS plan_bitis, current_date - g.plan_bitis AS gecikme_gun,
            (SELECT max(k.kademe)::int FROM projeler_hazirlik_kademe k WHERE k.gorev_id = g.id) AS kademe
       FROM projeler_gorev g JOIN projeler_proje p ON p.id = g.proje_id
      WHERE g.hazirlik_maddesi IS NOT NULL AND g.durum IN ('yapilacak', 'suruyor', 'bekliyor') AND p.durum = 'aktif' AND g.plan_bitis < current_date
        AND (g.sorumlu_kisi_id = $1 OR (g.sorumlu_kisi_id IS NULL AND g.yapan_rol_id = ANY($2::int[])))
      ORDER BY g.plan_bitis, g.id`,
    [kisiId, [...rolIdleri]],
  );
}
export async function enYuksekKademeler(db: Db, gorevIdleri: readonly number[]): Promise<Map<number, number>> {
  if (gorevIdleri.length === 0) return new Map();
  const satirlar = await db.sorgu<{ gorev_id: number; kademe: number }>(
    'SELECT gorev_id, max(kademe)::int AS kademe FROM projeler_hazirlik_kademe WHERE gorev_id = ANY($1::int[]) GROUP BY gorev_id', [[...gorevIdleri]],
  );
  return new Map(satirlar.map((x) => [x.gorev_id, x.kademe]));
}
