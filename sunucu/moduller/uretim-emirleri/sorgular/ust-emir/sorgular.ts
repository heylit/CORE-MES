import type { Db } from '#cekirdek/db.ts';
import type { Dilim } from '#cekirdek/liste.ts';
import type { EmirDurumu, EmirTuru } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { TalimatAsamasi } from '#paylasilan/sozlesme/talimat-asamasi.ts';
import { ARAMA, ISO, KAPALI, NULLU_ISO, TARIH } from '../ortak/sorgular.ts';
import type { BitenSuzgeci } from '../emir/sorgular.ts';

/* ---------------- iş emirli üretim emri (kart #262) ---------------- */

export interface UstEmirSatiri {
  id: number;
  emirNo: string;
  parcaNo: string;
  parcaAd: string;
  adet: number;
  istasyonId: number | null;
  malzemeNo: number | null;
  kaynakRotaRevizyonId: number | null;
  oncelik: number;
  baslangic: string | null;
  teslim: string | null;
  durum: EmirDurumu;
  arsiv: boolean;
  aciklama: string | null;
  acilma: string;
  baslama: string | null;
  bitis: string | null;
  saglamAdet: number | null;
  ustEmirId: number | null;
  bolunmeSira: number | null;
  birlestigiEmirId: number | null;
  birlesmeOpNo: number | null;
  emirTuru: EmirTuru;
  projeId: number | null;
  siparisSatiriId: number | null;
  // 3244 b: teslim kalemin terminine bağlı mı; emir hangi kalem partisinden açıldı (partisiz emirde null).
  teslimBagli: boolean;
  siparisPartiId: number | null;
  surum: number;
}

const UST = `e.id, e.emir_no AS "emirNo", e.parca_no AS "parcaNo", e.parca_ad AS "parcaAd", e.adet, e.istasyon_id AS "istasyonId",
  e.malzeme_no AS "malzemeNo", e.kaynak_rota_revizyonu_id AS "kaynakRotaRevizyonId", e.oncelik::int AS oncelik,
  ${TARIH('e.baslangic')} AS baslangic, ${TARIH('e.teslim')} AS teslim, e.durum, e.arsiv, e.aciklama, ${ISO('e.acilma')} AS acilma,
  ${NULLU_ISO('e.baslama')} AS baslama, ${NULLU_ISO('e.bitis')} AS bitis, e.saglam_adet AS "saglamAdet",
  e.ust_emir_id AS "ustEmirId", e.bolunme_sira AS "bolunmeSira", e.birlestigi_emir_id AS "birlestigiEmirId",
  e.birlesme_op_no AS "birlesmeOpNo", e.emir_turu AS "emirTuru", e.proje_id AS "projeId", e.siparis_satiri_id AS "siparisSatiriId",
  e.teslim_bagli AS "teslimBagli", e.siparis_parti_id AS "siparisPartiId", e.surum`;

// Liste iş emirli emirleri ya da arşivi verir; bugünkü adımsız (istasyonlu) emir bu listede yoktur.
// Arşiv ve proje listesi bütün durumları verir; ana liste `hepsi` değilse yalnız açık emirleri (kart #1323).
export function ustEmirler(db: Db, arsiv: boolean, projeId: number | null = null, hepsi = true): Promise<UstEmirSatiri[]> {
  if (projeId !== null) return db.sorgu(`SELECT ${UST} FROM uretim_emri e WHERE NOT e.arsiv AND e.malzeme_no IS NOT NULL AND e.proje_id = $1 ORDER BY e.id DESC`, [projeId]);
  return db.sorgu<UstEmirSatiri>(
    `SELECT ${UST} FROM uretim_emri e WHERE ${arsiv ? 'e.arsiv' : `NOT e.arsiv AND e.malzeme_no IS NOT NULL${hepsi ? '' : ` AND NOT ${KAPALI}`}`} ORDER BY e.id DESC`,
  );
}

// Listeyle (ustEmirler, arşiv dışı) aynı emirler, durum, başlamış iş emri ve gecikmeye göre gruplu; kapsam süzgeci yok, biten de sayılır.
export function adimliOzetGruplari(db: Db, bugun: string): Promise<{ durum: EmirDurumu; baslamis: boolean; gecikmis: boolean; sayi: number }[]> {
  return db.sorgu(
    `SELECT e.durum,
            EXISTS (SELECT 1 FROM uretim_emirleri_is_emri i WHERE i.uretim_emri_id = e.id AND i.durum <> 'bekliyor') AS baslamis,
            COALESCE(e.teslim < $1::date, false) AS gecikmis,
            count(*)::int AS sayi
       FROM uretim_emri e
      WHERE NOT e.arsiv AND e.malzeme_no IS NOT NULL
      GROUP BY 1, 2, 3`,
    [bugun],
  );
}

const BITEN_UST = `FROM uretim_emri e WHERE NOT e.arsiv AND e.malzeme_no IS NOT NULL AND ${KAPALI} AND ($1::text IS NULL OR e.durum = $1) AND ${ARAMA('2')}`;

export async function bitenUstEmirSay(db: Db, s: BitenSuzgeci): Promise<number> {
  return (await db.tek<{ n: number }>(`SELECT count(*)::int AS n ${BITEN_UST}`, [s.durum, s.ara]))?.n ?? 0;
}

export function bitenUstEmirler(db: Db, s: BitenSuzgeci, d: Dilim): Promise<UstEmirSatiri[]> {
  return db.sorgu<UstEmirSatiri>(`SELECT ${UST} ${BITEN_UST} ORDER BY e.id DESC LIMIT $3 OFFSET $4`, [s.durum, s.ara, d.sinir, d.atla]);
}

export function ustEmirBul(db: Db, id: number, kilit = false): Promise<UstEmirSatiri | null> {
  return db.tek<UstEmirSatiri>(`SELECT ${UST} FROM uretim_emri e WHERE e.id = $1${kilit ? ' FOR UPDATE' : ''}`, [id]);
}

export function ustEmirlerBul(db: Db, idler: readonly number[]): Promise<UstEmirSatiri[]> {
  return db.sorgu<UstEmirSatiri>(`SELECT ${UST} FROM uretim_emri e WHERE e.id = ANY($1::int[]) ORDER BY e.id`, [[...idler]]);
}

export interface UstEmirYazisi {
  parcaNo: string;
  parcaAd: string;
  adet: number;
  istasyonId: number | null;
  malzemeNo: number;
  // Rotasız emirde null (B13).
  kaynakRotaRevizyonId: number | null;
  oncelik: number;
  baslangic: string | null;
  teslim: string | null;
  aciklama: string | null;
  durum: 'taslak' | 'planli';
  // Yalnız bölünen alt partide dolu.
  ustEmirId?: number;
  bolunmeSira?: number;
  birlesmeOpNo?: number | null;
  emirTuru: EmirTuru;
  // Boşsa tablo eski biçimi (UE-) yazar.
  emirNo?: string | null;
  projeId?: number | null;
  siparisSatiriId?: number | null;
  patlatmaId?: number | null;
  teslimBagli?: boolean;
  siparisPartiId?: number | null;
}

export async function ustEmirEkle(db: Db, e: UstEmirYazisi, acanId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, malzeme_no, kaynak_rota_revizyonu_id, oncelik, baslangic, teslim,
       aciklama, durum, ust_emir_id, bolunme_sira, birlesme_op_no, emir_turu, emir_no, proje_id, siparis_satiri_id, patlatma_id,
       teslim_bagli, siparis_parti_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::date, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22) RETURNING id`,
    [e.parcaNo, e.parcaAd, e.adet, e.istasyonId, acanId, e.malzemeNo, e.kaynakRotaRevizyonId, e.oncelik, e.baslangic, e.teslim, e.aciklama, e.durum,
      e.ustEmirId ?? null, e.bolunmeSira ?? null, e.birlesmeOpNo ?? null, e.emirTuru, e.emirNo ?? null, e.projeId ?? null,
      e.siparisSatiriId ?? null, e.patlatmaId ?? null, e.teslimBagli ?? false, e.siparisPartiId ?? null],
  );
  if (satir === null) throw new Error('Üretim emri eklenemedi.');
  return satir.id;
}

// 1476-C: çok katmanlı emrin iş emirlerinin düğümü (rotadaki malzeme ve op numarası, kök başına adet); tek katmanlı emirde satır yok.
// dugumSonu: alt düğümün son adımı (düğüm içinde ardılı yok; çıktısı tüketen üst adıma gider); kökte her zaman false.
export interface DugumSatiri {
  isEmriId: number; uretimEmriId: number; opNo: number; dugum: string; malzemeNo: number; kaynakOpNo: number; birimCarpani: string; dugumSonu: boolean;
}
export function dugumleriGetir(db: Db, emirIdleri: readonly number[]): Promise<DugumSatiri[]> {
  return db.sorgu<DugumSatiri>(
    `SELECT i.id AS "isEmriId", i.uretim_emri_id AS "uretimEmriId", i.op_no AS "opNo", i.dugum, i.dugum_malzeme_id AS "malzemeNo", i.kaynak_op_no AS "kaynakOpNo",
            i.birim_carpani::text AS "birimCarpani",
            i.dugum <> '0' AND NOT EXISTS (SELECT 1 FROM uretim_emirleri_is_emri_onculu o JOIN uretim_emirleri_is_emri a ON a.id = o.is_emri_id
                                            WHERE o.oncul_is_emri_id = i.id AND a.dugum = i.dugum) AS "dugumSonu"
       FROM uretim_emirleri_is_emri i WHERE i.uretim_emri_id = ANY($1::int[]) AND i.dugum IS NOT NULL ORDER BY i.uretim_emri_id, i.sira`,
    [[...emirIdleri]],
  );
}

// 1476: emrin açıldığı patlamış rota; tek katmanlı emirde null.
export async function emrinPatlatmasi(db: Db, emirId: number): Promise<number | null> {
  return (await db.tek<{ p: number | null }>('SELECT patlatma_id AS p FROM uretim_emri WHERE id = $1', [emirId]))?.p ?? null;
}

export async function emirNoVarMi(db: Db, emirNo: string): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM uretim_emri WHERE emir_no = $1', [emirNo])) !== null;
}

// Emir numarasından kimlik; bulunamayan numara haritada yok, boş dizide sorgu yok.
export async function emirIdleri(db: Db, emirNolari: readonly string[]): Promise<Map<string, number>> {
  const tekil = [...new Set(emirNolari)];
  if (tekil.length === 0) return new Map();
  const satirlar = await db.sorgu<{ id: number; emirNo: string }>('SELECT id, emir_no AS "emirNo" FROM uretim_emri WHERE emir_no = ANY($1::text[])', [tekil]);
  return new Map(satirlar.map((x) => [x.emirNo, x.id]));
}

export async function kolSayisi(db: Db, ustEmirId: number): Promise<number> {
  return (await db.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri WHERE ust_emir_id = $1', [ustEmirId]))?.n ?? 0;
}

// Sürüm denetimli yazmalar satır döndürmezse kayıt yoktur ya da sürüm ilerlemiştir (surumluGuncelle ayırır).
export function planaAlYaz(db: Db, id: number, surum: number): Promise<{ id: number } | null> {
  return db.tek(`UPDATE uretim_emri SET durum = 'planli', surum = surum + 1 WHERE id = $1 AND surum = $2 RETURNING id`, [id, surum]);
}

// Bölme ve birleştirme emrin adedini değiştirir; sürüm denetimlidir.
export function adetYaz(db: Db, id: number, adet: number, surum: number): Promise<{ id: number } | null> {
  return db.tek('UPDATE uretim_emri SET adet = $2, surum = surum + 1 WHERE id = $1 AND surum = $3 RETURNING id', [id, adet, surum]);
}

export interface AltPartiSatiri {
  id: number;
  ustEmirId: number;
  bolunmeSira: number;
  adet: number;
  durum: EmirDurumu;
  birlesmeOpNo: number | null;
}

// Verilen emirlerin bütün alt partileri (torunlar dahil); bölme ağacı derinlik sınırsızdır.
export function altPartilerGetir(db: Db, idler: readonly number[]): Promise<AltPartiSatiri[]> {
  return db.sorgu<AltPartiSatiri>(
    `WITH RECURSIVE agac AS (
       SELECT id, ust_emir_id, bolunme_sira, adet, durum, birlesme_op_no FROM uretim_emri WHERE ust_emir_id = ANY($1::int[])
       UNION ALL
       SELECT e.id, e.ust_emir_id, e.bolunme_sira, e.adet, e.durum, e.birlesme_op_no FROM uretim_emri e JOIN agac a ON e.ust_emir_id = a.id
     )
     SELECT id, ust_emir_id AS "ustEmirId", bolunme_sira AS "bolunmeSira", adet, durum, birlesme_op_no AS "birlesmeOpNo" FROM agac ORDER BY id`,
    [[...idler]],
  );
}

export function kontrolListesiGetir(
  db: Db, isEmriIdleri: readonly number[],
): Promise<{ isEmriId: number; sira: number; ad: string; aciklama: string | null; asama: TalimatAsamasi }[]> {
  return db.sorgu(
    `SELECT is_emri_id AS "isEmriId", sira, ad, aciklama, asama FROM emir_adimi WHERE is_emri_id = ANY($1::int[]) ORDER BY is_emri_id, sira`,
    [[...isEmriIdleri]],
  );
}

export function ustIptalYaz(db: Db, id: number, surum: number): Promise<{ id: number } | null> {
  return db.tek(`UPDATE uretim_emri SET durum = 'iptal', iptal = now(), surum = surum + 1 WHERE id = $1 AND surum = $2 RETURNING id`, [id, surum]);
}

// Birleşme adımının op numarası kaynakta kalır: hedef o adıma gelen sağlamı buradan sayar (UE-PB7).
export function birlesenPartiyiKapat(db: Db, id: number, hedefId: number, surum: number, birlesmeOpNo: number): Promise<{ id: number } | null> {
  return db.tek(
    `UPDATE uretim_emri SET durum = 'iptal', iptal = now(), birlestigi_emir_id = $2, birlesme_op_no = $4, surum = surum + 1
      WHERE id = $1 AND surum = $3 RETURNING id`,
    [id, hedefId, surum, birlesmeOpNo],
  );
}

// Planlı birleşmeli kolun son adımı bitince kol kendiliğinden katılır (UE-PB6c): başlamış satır iptal kısıtına uysun diye
// başlama ve istasyon da boşalır (iş emirleri kendi zamanlarını tutar). Komut emri zaten kilitlemiştir.
export function kolKatildi(db: Db, id: number, hedefId: number): Promise<unknown> {
  return db.sorgu(
    `UPDATE uretim_emri SET durum = 'iptal', iptal = now(), baslama = NULL, istasyon_id = NULL, birlestigi_emir_id = $2, surum = surum + 1
      WHERE id = $1`,
    [id, hedefId],
  );
}

export function adetEkle(db: Db, id: number, ek: number): Promise<unknown> {
  return db.sorgu('UPDATE uretim_emri SET adet = adet + $2, surum = surum + 1 WHERE id = $1', [id, ek]);
}

export function birlesmePlaniYaz(db: Db, id: number, opNo: number | null, surum: number): Promise<{ id: number } | null> {
  return db.tek('UPDATE uretim_emri SET birlesme_op_no = $2, surum = surum + 1 WHERE id = $1 AND surum = $3 RETURNING id', [id, opNo, surum]);
}

// Adımın durumu emrin görünen durumunu değiştirir (ör. ilk fason gidişi emri "başladı" gösterir); eski sürümü tutan ekran bunu
// sürüm çakışması olarak görsün diye emrin sürümü de artar.
export function emirSurumunuArtir(db: Db, id: number): Promise<unknown> {
  return db.sorgu('UPDATE uretim_emri SET surum = surum + 1 WHERE id = $1', [id]);
}

export function surumArtir(db: Db, id: number, surum: number): Promise<{ id: number } | null> {
  return db.tek('UPDATE uretim_emri SET surum = surum + 1 WHERE id = $1 AND surum = $2 RETURNING id', [id, surum]);
}

export interface BirlesenKolSatiri {
  id: number;
  ustEmirId: number | null;
  bolunmeSira: number | null;
  birlesmeOpNo: number | null;
  adet: number;
  // Kolun son biten iş emrinin sağlamı; kol hiç adım bitirmediyse null (parçalar olduğu gibi katıldı).
  cikis: number | null;
}

// Bu emre katılmış kollar: elde kalan hesabı katıldıkları adıma gelen sağlamı sayar.
export function birlesenKollarGetir(db: Db, hedefId: number): Promise<BirlesenKolSatiri[]> {
  return db.sorgu<BirlesenKolSatiri>(
    `SELECT e.id, e.ust_emir_id AS "ustEmirId", e.bolunme_sira AS "bolunmeSira", e.birlesme_op_no AS "birlesmeOpNo", e.adet,
            (SELECT i.saglam_adet FROM uretim_emirleri_is_emri i WHERE i.uretim_emri_id = e.id AND i.durum = 'tamam' ORDER BY i.sira DESC LIMIT 1) AS cikis
       FROM uretim_emri e WHERE e.birlestigi_emir_id = $1 ORDER BY e.id`,
    [hedefId],
  );
}

export async function ustEmirVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM uretim_emri WHERE id = $1', [id])) !== null;
}

export function planBilgisiYaz(
  db: Db, id: number, g: { oncelik: number; baslangic: string | null; teslim: string | null },
): Promise<unknown> {
  return db.sorgu(
    // 3244 b: teslim gerçekten değişirse kalem termini bağı kopar.
    `UPDATE uretim_emri SET oncelik = $2, baslangic = $3::date, teslim = $4::date,
            teslim_bagli = teslim_bagli AND teslim IS NOT DISTINCT FROM $4::date, surum = surum + 1 WHERE id = $1`,
    [id, g.oncelik, g.baslangic, g.teslim],
  );
}

// 3244 b: teslim kalemin güncel terminine yeniden bağlanır; sürüm tutmazsa satır dönmez.
export function teslimBagla(db: Db, id: number, surum: number, teslim: string): Promise<{ id: number } | null> {
  return db.tek('UPDATE uretim_emri SET teslim = $3::date, teslim_bagli = true, surum = surum + 1 WHERE id = $1 AND surum = $2 RETURNING id', [id, surum, teslim]);
}

// 3244 b, 3254 a: satırın termini değişip sipariş yeniden onaylanınca bağlı, başlamamış (taslak ya da planlı, hiçbir adımı başlamamış),
// arşivsiz emirlerin teslimi yeni termine kayar; başlangıcı yeni terminden sonra olan emir değişmez. Değişen emirler döner.
export function bagliTeslimleriKaydir(db: Db, satirId: number, termin: string): Promise<{ id: number }[]> {
  return db.sorgu<{ id: number }>(
    `UPDATE uretim_emri e SET teslim = $2::date, surum = e.surum + 1
      WHERE e.siparis_satiri_id = $1 AND e.teslim_bagli AND NOT e.arsiv AND e.durum IN ('taslak', 'planli')
        AND e.teslim IS DISTINCT FROM $2::date AND (e.baslangic IS NULL OR e.baslangic <= $2::date)
        AND NOT EXISTS (SELECT 1 FROM uretim_emirleri_is_emri i WHERE i.uretim_emri_id = e.id AND i.durum <> 'bekliyor')
      RETURNING e.id`,
    [satirId, termin],
  );
}

export function oncelikYaz(db: Db, id: number, surum: number, oncelik: number): Promise<{ id: number } | null> {
  return db.tek('UPDATE uretim_emri SET oncelik = $3, surum = surum + 1 WHERE id = $1 AND surum = $2 RETURNING id', [id, surum, oncelik]);
}

export function emirTuruYaz(db: Db, id: number, surum: number, emirTuru: EmirTuru): Promise<{ id: number } | null> {
  return db.tek('UPDATE uretim_emri SET emir_turu = $3, surum = surum + 1 WHERE id = $1 AND surum = $2 RETURNING id', [id, surum, emirTuru]);
}

export async function turDegisimiEkle(db: Db, emirId: number, eski: EmirTuru, yeni: EmirTuru, kisiId: number, an: string): Promise<void> {
  await db.sorgu(
    `INSERT INTO uretim_emirleri_tur_degisimi (uretim_emri_id, eski_tur, yeni_tur, kisi_id, zaman) VALUES ($1, $2, $3, $4, $5::timestamptz)`,
    [emirId, eski, yeni, kisiId, an],
  );
}

export async function oncelikDegisimiEkle(db: Db, emirId: number, eski: number, yeni: number, kisiId: number, an: string): Promise<void> {
  await db.sorgu(
    `INSERT INTO uretim_emirleri_oncelik_degisimi (uretim_emri_id, eski_oncelik, yeni_oncelik, kisi_id, zaman)
     VALUES ($1, $2, $3, $4, $5::timestamptz)`,
    [emirId, eski, yeni, kisiId, an],
  );
}

// Emrin satırdaki istasyonu yalnız planlıyken sıradaki iş emrini izler; başlamış emrin istasyonu çalışan iş emrinindir.
export function emirIstasyonuYaz(db: Db, id: number, istasyonId: number | null): Promise<unknown> {
  return db.sorgu(`UPDATE uretim_emri SET istasyon_id = $2, surum = surum + 1 WHERE id = $1 AND durum IN ('taslak', 'planli')`, [id, istasyonId]);
}

export function emirKaynakRevizyonuYaz(db: Db, id: number, revizyonId: number): Promise<unknown> {
  return db.sorgu('UPDATE uretim_emri SET kaynak_rota_revizyonu_id = $2, surum = surum + 1 WHERE id = $1', [id, revizyonId]);
}

// Biten iş emrinden sonra iş emri kalırsa emir, sıradakinin istasyonunda yeniden planlı olur (ilk sistemdeki gibi).
export function sonrakiIsEmrineGec(db: Db, id: number, istasyonId: number | null): Promise<unknown> {
  return db.sorgu(
    `UPDATE uretim_emri SET durum = 'planli', baslama = NULL, istasyon_id = $2, surum = surum + 1 WHERE id = $1 AND durum = 'basladi'`,
    [id, istasyonId],
  );
}

// Son iş emri fasonsa emir terminalde başlamadan biter: başlama ilk iş emrinin başlamasıdır.
export function fasonlaBitir(db: Db, id: number, saglamAdet: number, an: string): Promise<unknown> {
  return db.sorgu(
    `UPDATE uretim_emri SET durum = 'bitti', istasyon_id = NULL, saglam_adet = $2, bitis = $3::timestamptz, surum = surum + 1,
            baslama = (SELECT min(baslama) FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1)
      WHERE id = $1 AND durum = 'planli'`,
    [id, saglamAdet, an],
  );
}

export function emirDurumlariGetir(db: Db, idler: readonly number[]): Promise<{ id: number; durum: EmirDurumu }[]> {
  return db.sorgu(`SELECT id, durum FROM uretim_emri WHERE id = ANY($1::int[])`, [[...idler]]);
}

export function siparisSatiriEmirleriGetir(db: Db, satirIdleri: readonly number[]): Promise<{ satirId: number; emirIdleri: number[] }[]> {
  return db.sorgu(
    `SELECT siparis_satiri_id AS "satirId", array_agg(id ORDER BY id) AS "emirIdleri"
       FROM uretim_emri WHERE siparis_satiri_id = ANY($1::int[]) GROUP BY siparis_satiri_id`, [[...satirIdleri]]);
}

export function emirNolariGetir(db: Db, idler: readonly number[]): Promise<{ id: number; emirNo: string }[]> {
  return db.sorgu(`SELECT id, emir_no AS "emirNo" FROM uretim_emri WHERE id = ANY($1::int[])`, [[...idler]]);
}

// Değişiklik etkisi (1644): malzemenin bitmemiş emirleri. Başladı: emir ya da bir iş emri başladı. Fasonda: bir fason iş emrinde
// gidenden dönmeyen (sağlam + hurda) adet var.
export interface EtkilenenEmirSatiri {
  id: number; emirNo: string; malzemeNo: number; durum: 'taslak' | 'planli' | 'basladi'; baslangic: string | null; basladi: boolean; fasonda: boolean;
}
export function malzemelerinAcikEmirleriGetir(db: Db, malzemeNolari: readonly number[]): Promise<EtkilenenEmirSatiri[]> {
  return db.sorgu(
    `SELECT e.id, e.emir_no AS "emirNo", e.malzeme_no AS "malzemeNo", e.durum, ${TARIH('e.baslangic')} AS baslangic,
            (e.baslama IS NOT NULL OR EXISTS (
              SELECT 1 FROM uretim_emirleri_is_emri i WHERE i.uretim_emri_id = e.id AND i.baslama IS NOT NULL)) AS basladi,
            EXISTS (
              SELECT 1 FROM uretim_emirleri_is_emri i JOIN uretim_emirleri_fason_hareketi f ON f.is_emri_id = i.id
               WHERE i.uretim_emri_id = e.id
               GROUP BY i.id
              HAVING sum(f.adet) FILTER (WHERE f.yon = 'gidis') > coalesce(sum(f.adet + f.hurda_adet) FILTER (WHERE f.yon = 'donus'), 0)) AS fasonda
       FROM uretim_emri e
      WHERE e.malzeme_no = ANY($1::int[]) AND e.durum IN ('taslak', 'planli', 'basladi')
      ORDER BY e.id`,
    [[...malzemeNolari]],
  );
}

// Planlama kaynağının emir dilimi (2216-1 a): açık emirler, son `gun` günde kapananlar ve çağıranın verdiği kimlikler. Kapanış anı biten
// emirde bitiş, iptalde iptal anıdır. Bütün kapalı tarihçe her okumada gitmesin diye süzgeç sorgudadır.
export function dilimUstEmirleri(db: Db, gun: number, dahil: readonly number[]): Promise<UstEmirSatiri[]> {
  return db.sorgu<UstEmirSatiri>(
    `SELECT ${UST} FROM uretim_emri e
      WHERE NOT e.arsiv AND e.malzeme_no IS NOT NULL
        AND (NOT ${KAPALI} OR COALESCE(e.bitis, e.iptal) >= now() - make_interval(days => $1) OR e.id = ANY($2::int[]))
      ORDER BY e.id DESC`,
    [gun, [...dahil]],
  );
}
