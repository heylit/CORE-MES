import type { Db } from '#cekirdek/db.ts';
import type { Dilim } from '#cekirdek/liste.ts';
import type { EmirDurumu, EmirKaydi, KayitOlayi, SayimTuru } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { malzemeKartiIzParametreleri, type MalzemeKartiAnahtari, type MalzemeKartiIzi } from '#paylasilan/malzeme-karti-izi.ts';
import { ARAMA, ISO, KAPALI, KARAR_SATIRI, NULLU_ISO, TERMINAL_IS_EMRI } from '../ortak/sorgular.ts';

// Paralel adım (639): yazan komut adımı biliyorsa satır o adıma bağlanır; bilmiyorsa (eski çağrı) terminal iş emrine.
const ADIM_IS_EMRI = (emir: string, adim: string) => `COALESCE(${adim}::int, ${TERMINAL_IS_EMRI(emir)})`;

export interface EmirSatiri {
  id: number;
  emirNo: string;
  parcaNo: string;
  parcaAd: string;
  adet: number;
  // İş emirli emirde sıradaki iş emrinin istasyonudur; kaynak atanmamışsa ya da iş emri fasonsa boştur.
  istasyonId: number | null;
  // Yalnız iş emirli emirde dolu.
  malzemeNo: number | null;
  durum: EmirDurumu;
  acanId: number;
  acilma: string;
  baslama: string | null;
  bitis: string | null;
  iptal: string | null;
  saglamAdet: number | null;
  surum: number;
}

export interface KayitSatiri {
  id: number;
  emirId: number;
  kisiId: number;
  istasyonId: number;
  olay: KayitOlayi;
  saglamAdet: number | null;
  adet: number | null;
  durusNedeniId: number | null;
  hurdaNedeniId: number | null;
  // Yalnız kalite kararında dolu olabilir; sütundan önceki karar satırında bilinmez (null).
  kararVerenId: number | null;
  zaman: string;
}

const EMIR = `e.id, e.emir_no AS "emirNo", e.parca_no AS "parcaNo", e.parca_ad AS "parcaAd", e.adet,
  e.istasyon_id AS "istasyonId", e.durum, e.acan_id AS "acanId", ${ISO('e.acilma')} AS acilma,
  ${NULLU_ISO('e.baslama')} AS baslama, ${NULLU_ISO('e.bitis')} AS bitis, ${NULLU_ISO('e.iptal')} AS iptal,
  e.saglam_adet AS "saglamAdet", e.malzeme_no AS "malzemeNo", e.surum`;

// Birleşmiş partilerin hedef emri (kart #262); birleşmemiş emir listede yoktur.
export function birlesmeHedefleri(db: Db, emirIdleri: readonly number[]): Promise<{ id: number; hedefId: number; hedefNo: string }[]> {
  return db.sorgu(
    `SELECT e.id, h.id AS "hedefId", h.emir_no AS "hedefNo"
       FROM uretim_emri e JOIN uretim_emri h ON h.id = e.birlestigi_emir_id WHERE e.id = ANY($1::int[])`,
    [[...emirIdleri]],
  );
}

// Durum verilirse yalnız o durum; verilmezse `hepsi` değilse yalnız açık emirler.
export function emirleriGetir(db: Db, durum: EmirDurumu | null, yalnizIstasyonlu: boolean, hepsi = false): Promise<EmirSatiri[]> {
  return db.sorgu<EmirSatiri>(
    `SELECT ${EMIR} FROM uretim_emri e WHERE ($1::text IS NULL OR e.durum = $1) AND (NOT $2::boolean OR e.istasyon_id IS NOT NULL)
        AND ($1::text IS NOT NULL OR $3::boolean OR NOT ${KAPALI}) ORDER BY e.id DESC`,
    [durum, yalnizIstasyonlu, hepsi],
  );
}

// Son `gun` günde kapanan (biten ya da iptal) emirler, en yeni üstte. Sınır sunucu saatine göredir; kapanış anı
// olmayan kapalı emir gelmez. Fabrika Haritası açık emirleri ayrıca okur; bütün geçmiş her yoklamada taşınmaz (karar 1613 a).
export function yeniKapananEmirleriGetir(db: Db, gun: number, yalnizIstasyonlu: boolean): Promise<EmirSatiri[]> {
  return db.sorgu<EmirSatiri>(
    `SELECT ${EMIR} FROM uretim_emri e WHERE ${KAPALI} AND (NOT $2::boolean OR e.istasyon_id IS NOT NULL)
        AND COALESCE(e.bitis, e.iptal) >= now() - make_interval(days => $1::int) ORDER BY e.id DESC`,
    [gun, yalnizIstasyonlu],
  );
}

export interface BitenSuzgeci {
  durum: EmirDurumu | null;
  ara: string | null;
}

const BITEN_IZLEME = `FROM uretim_emri e WHERE ${KAPALI} AND ($1::text IS NULL OR e.durum = $1) AND (NOT $2::boolean OR e.istasyon_id IS NOT NULL) AND ${ARAMA('3')}`;

export async function bitenEmirSay(db: Db, s: BitenSuzgeci, yalnizIstasyonlu: boolean): Promise<number> {
  return (await db.tek<{ n: number }>(`SELECT count(*)::int AS n ${BITEN_IZLEME}`, [s.durum, yalnizIstasyonlu, s.ara]))?.n ?? 0;
}

export function bitenEmirleriGetir(db: Db, s: BitenSuzgeci, yalnizIstasyonlu: boolean, d: Dilim): Promise<EmirSatiri[]> {
  return db.sorgu<EmirSatiri>(
    `SELECT ${EMIR} ${BITEN_IZLEME} ORDER BY e.id DESC LIMIT $4 OFFSET $5`, [s.durum, yalnizIstasyonlu, s.ara, d.sinir, d.atla],
  );
}

export function emirBul(db: Db, id: number): Promise<EmirSatiri | null> {
  return db.tek<EmirSatiri>(`SELECT ${EMIR} FROM uretim_emri e WHERE e.id = $1`, [id]);
}

// Geçiş yarışlarında ikinci istek kilidi bekler, sonra güncel durumu görür.
export function emirKilitle(db: Db, id: number): Promise<EmirSatiri | null> {
  return db.tek<EmirSatiri>(`SELECT ${EMIR} FROM uretim_emri e WHERE e.id = $1 FOR UPDATE`, [id]);
}

export async function emirEkle(db: Db, g: Omit<EmirKaydi, 'projeId'> & { projeId?: number }, acanId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, proje_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [g.parcaNo, g.parcaAd, g.adet, g.istasyonId, acanId, g.projeId ?? null],
  );
  if (satir === null) throw new Error('Üretim emri eklenemedi.');
  return satir.id;
}

export function baslamayiYaz(db: Db, id: number, an: string): Promise<unknown> {
  // İş emirli emirde önceki iş emrinden kalan çalışma hâli sıfırlanır: başlayan iş olaysızdır, yani çalışıyordur.
  // Emrin başlaması ilk adımın başlamasıdır: sonraki adımın başlatılması onu ezmez (bulgu 15.2).
  return db.sorgu(
    `UPDATE uretim_emri SET durum = 'basladi', calisma = 'calisiyor', surum = surum + 1,
            baslama = COALESCE((SELECT min(baslama) FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1), $2::timestamptz)
      WHERE id = $1`,
    [id, an],
  );
}

export function bitisiYaz(db: Db, id: number, saglamAdet: number, an: string): Promise<unknown> {
  return db.sorgu(
    `UPDATE uretim_emri SET durum = 'bitti', bitis = $3::timestamptz, saglam_adet = $2, surum = surum + 1 WHERE id = $1`,
    [id, saglamAdet, an],
  );
}

export function iptaliYaz(db: Db, id: number): Promise<unknown> {
  return db.sorgu(`UPDATE uretim_emri SET durum = 'iptal', iptal = now(), surum = surum + 1 WHERE id = $1`, [id]);
}

// Sunucu saati kilitten sonra bir kez alınır: aynı komutun bütün yazıları aynı anı taşır ve defter sırası
// kilidi alma sırasıyla uyuşur (işlem başlangıç saati beklemeden önceki andır).
export async function anAl(db: Db): Promise<string> {
  const satir = await db.tek<{ an: string }>(`SELECT ${ISO('clock_timestamp()')} AS an`);
  if (satir === null) throw new Error('Saat okunamadı.');
  return satir.an;
}

// Emrin bugüne kadarki en geç zaman damgası (kayıt, olay, sayım, makine, katılım, iş emri); çevrimdışı kayıt bundan önceye yazılmaz.
export async function emrinSonAni(db: Db, emirId: number): Promise<string | null> {
  const satir = await db.tek<{ an: string | null }>(
    `SELECT ${NULLU_ISO('GREATEST(e.baslama, e.bitis, k.an, o.an, s.an, m.an, m.bitis, c.an, c.cikis, i.an, i.bitis)')} AS an
       FROM uretim_emri e,
            LATERAL (SELECT max(zaman) AS an FROM uretim_kaydi WHERE emir_id = e.id) k,
            LATERAL (SELECT max(zaman) AS an FROM uretim_olayi WHERE emir_id = e.id) o,
            LATERAL (SELECT max(zaman) AS an FROM uretim_sayimi WHERE emir_id = e.id) s,
            LATERAL (SELECT max(baslama) AS an, max(bitis) AS bitis FROM uretim_emirleri_makine_kullanimi WHERE emir_id = e.id) m,
            LATERAL (SELECT max(giris) AS an, max(cikis) AS cikis FROM uretim_emirleri_katilim WHERE emir_id = e.id) c,
            LATERAL (SELECT max(baslama) AS an, max(bitis) AS bitis FROM uretim_emirleri_is_emri WHERE uretim_emri_id = e.id) i
      WHERE e.id = $1`,
    [emirId],
  );
  return satir?.an ?? null;
}

// Emrin terminalden başlatma kaydı var mı (hazırlık olayı emir başına bir kez verilir).
export async function baslatmaKaydiVarMi(db: Db, emirId: number): Promise<boolean> {
  return (await db.tek<{ var: boolean }>("SELECT EXISTS (SELECT 1 FROM uretim_kaydi WHERE emir_id = $1 AND olay = 'baslat') AS var", [emirId]))!.var;
}

export function kayitEkle(
  db: Db, emirId: number, kisiId: number, istasyonId: number, olay: 'baslat' | 'bitir', saglamAdet: number | null,
  an: string, isEmriId: number | null = null,
): Promise<unknown> {
  return db.sorgu(
    `INSERT INTO uretim_kaydi (emir_id, kisi_id, istasyon_id, olay, saglam_adet, zaman, is_emri_id)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz, ${ADIM_IS_EMRI('$1', '$7')})`,
    [emirId, kisiId, istasyonId, olay, saglamAdet, an, isEmriId],
  );
}

export interface SayimYazisi {
  emirId: number;
  kisiId: number;
  istasyonId: number;
  tur: SayimTuru;
  adet: number;
  hurdaNedeniId: number | null;
  duzeltme: boolean;
  an: string;
  refakatPartisiId: number | null;
  // Verilmezse terminal iş emri (paralel adımdan önceki çağrılar).
  isEmriId?: number | null;
  // 2009 b: sayımın makinesi; verilmezse null (makinesiz iş ya da makinesi seçilemeyen sayım).
  makineId?: number | null;
  // 3173: SmartES kaynaklı sayım, SmartES onay kaydının kimliğiyle; verilmezse kaynak boş kalır (terminal ve elle ayrımı henüz yazılmıyor).
  kaynakKimligi?: number | null;
}

// Satırın bağlandığı iş emri döner (sağlam sayım stoka bu iş emriyle yansır); iş emirsiz eski emirde null.
export async function sayimEkle(db: Db, y: SayimYazisi): Promise<{ isEmriId: number | null }> {
  const satir = await db.tek<{ isEmriId: number | null }>(
    `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, hurda_nedeni_id, duzeltme, zaman, is_emri_id, refakat_partisi_id, makine_id, kaynak, kaynak_kimligi)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, ${ADIM_IS_EMRI('$1', '$10')}, $9, $11, CASE WHEN $12::bigint IS NULL THEN NULL ELSE 'smartes' END, $12)
     RETURNING is_emri_id AS "isEmriId"`,
    [y.emirId, y.kisiId, y.istasyonId, y.tur, y.adet, y.hurdaNedeniId, y.duzeltme, y.an, y.refakatPartisiId, y.isEmriId ?? null, y.makineId ?? null, y.kaynakKimligi ?? null],
  );
  return { isEmriId: satir?.isEmriId ?? null };
}

// 327 a: emirde hiç sağlam satırı yoksa ilk parça onaylanmamıştır; ret sonrası sayılan da yeniden karar bekler (136 a).
// 744 a: iş emri verilince bakılan o adımın sağlamıdır (ilk parça adım başınadır); verilmezse emrin.
export async function ilkParcaOnaysiz(db: Db, emirId: number, isEmriId: number | null = null): Promise<boolean> {
  const satir = await db.tek<{ yok: boolean }>(
    `SELECT NOT EXISTS (SELECT 1 FROM uretim_sayimi WHERE emir_id = $1 AND tur = 'saglam' AND ($2::int IS NULL OR is_emri_id = $2)) AS yok`, [emirId, isEmriId],
  );
  return satir?.yok ?? false;
}

// Karar bekleyen adet iş emri, istasyon, refakat partisi ve makine başına: sayım o anki terminal iş emrine yazılmıştır, sonuç satırı da aynı iş
// emrine, aynı partiye ve aynı makineye gider (2009 b: reddedilen parça makine payında sayılmasın).
export interface KararGrubu { isEmriId: number | null; istasyonId: number; kisiId: number; refakatPartisiId: number | null; makineId: number | null }
export interface KararBekleyenSatir extends KararGrubu { zaman: string; adet: number }

// Grubun henüz karara bağlanmamış satırları, yazılış sırasıyla: her karar grubu sıfırlar, bu yüzden bekleyen, grubun kümülatif
// toplamının son sıfır olduğu satırdan sonrakilerdir (düzeltmeler dahil). Toplamı sıfır olan grup gelmez. İş emri verilince yalnız o
// adımın satırları gelir (744 a: ilk parça kararı adım başınadır).
export function kararBekleyenSatirlari(db: Db, emirId: number, isEmriId: number | null = null): Promise<KararBekleyenSatir[]> {
  return db.sorgu<KararBekleyenSatir>(
    `WITH s AS (
       SELECT id, is_emri_id, istasyon_id, kisi_id, refakat_partisi_id, makine_id, zaman, adet,
              sum(adet) OVER (PARTITION BY is_emri_id, istasyon_id, kisi_id, refakat_partisi_id, makine_id ORDER BY id) AS kumulatif
         FROM uretim_sayimi WHERE emir_id = $1 AND tur = 'karar_bekliyor' AND ($2::int IS NULL OR is_emri_id = $2)),
     g AS (
       SELECT is_emri_id, istasyon_id, kisi_id, refakat_partisi_id, makine_id, COALESCE(max(id) FILTER (WHERE kumulatif = 0), 0) AS sifir
         FROM s GROUP BY is_emri_id, istasyon_id, kisi_id, refakat_partisi_id, makine_id)
     SELECT s.is_emri_id AS "isEmriId", s.istasyon_id AS "istasyonId", s.kisi_id AS "kisiId", s.refakat_partisi_id AS "refakatPartisiId",
            s.makine_id AS "makineId", ${ISO('s.zaman')} AS zaman, s.adet
       FROM s JOIN g ON g.is_emri_id IS NOT DISTINCT FROM s.is_emri_id AND g.istasyon_id = s.istasyon_id AND g.kisi_id = s.kisi_id
                    AND g.refakat_partisi_id IS NOT DISTINCT FROM s.refakat_partisi_id AND g.makine_id IS NOT DISTINCT FROM s.makine_id
      WHERE s.id > g.sifir
      ORDER BY s.id`,
    [emirId, isEmriId],
  );
}

// Kararın iki satırı aynı iş emrine ve sayan kişiye yazılır (terminal ya da kararı veren değil): üretim sayanın kalır (348 a).
// Sayım kişisi operatörde kalır (348 a); kararı veren ayrı sütunda, defter onu gösterir (504 a). Satırlar parçanın üretildiği ana,
// kararın anı karar_zamani'na yazılır (645 a).
export function kararSatirlariEkle(
  db: Db, emirId: number, g: KararGrubu, tur: 'saglam' | 'red', uretimAni: string, adet: number, kararAni: string, kararVerenId: number,
): Promise<unknown> {
  return db.sorgu(
    `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, duzeltme, zaman, is_emri_id, refakat_partisi_id, karar_veren_kisi_id, karar_zamani, makine_id)
     VALUES ($1, $2, $3, 'karar_bekliyor', -$6::int, true, $5::timestamptz, $4, $8, $9, $10::timestamptz, $11),
            ($1, $2, $3, $7, $6, true, $5::timestamptz, $4, $8, $9, $10::timestamptz, $11)`,
    [emirId, g.kisiId, g.istasyonId, g.isEmriId, uretimAni, adet, tur, g.refakatPartisiId, kararVerenId, kararAni, g.makineId],
  );
}

// Onay bitmiş iş emrinin ve terminal iş emri olan bitmiş emrin kapanış adedine eklenir: kapanış değeri sayaç toplamıyla tutarlı kalır.
export async function bitmisSaglamaEkle(db: Db, emirId: number, isEmriId: number | null, adet: number): Promise<void> {
  if (isEmriId !== null) {
    await db.sorgu(
      `UPDATE uretim_emirleri_is_emri SET saglam_adet = saglam_adet + $2, surum = surum + 1 WHERE id = $1 AND durum = 'tamam'`, [isEmriId, adet],
    );
  }
  await db.sorgu(
    `UPDATE uretim_emri SET saglam_adet = saglam_adet + $3, surum = surum + 1
      WHERE id = $1 AND durum = 'bitti' AND $2::int IS NOT DISTINCT FROM ${TERMINAL_IS_EMRI('$1')}`,
    [emirId, isEmriId, adet],
  );
}

// Emir düzeyinde (bütün iş emirleri): ilk parça kararı emrin bütün parçasına uygulanır.
export function kararSayaclariGetir(db: Db, emirIdleri: readonly number[]): Promise<{ emirId: number; kararBekliyor: number; red: number }[]> {
  return db.sorgu<{ emirId: number; kararBekliyor: number; red: number }>(
    `SELECT emir_id AS "emirId", COALESCE(sum(adet) FILTER (WHERE tur = 'karar_bekliyor'), 0)::int AS "kararBekliyor",
            COALESCE(sum(adet) FILTER (WHERE tur = 'red'), 0)::int AS red
       FROM uretim_sayimi WHERE emir_id = ANY($1::int[]) AND tur IN ('karar_bekliyor', 'red') GROUP BY emir_id`,
    [[...emirIdleri]],
  );
}

// 744 a: karar bekleyen ve redde kalan adet iş emri (adım) başına; iş emirsiz eski satırda iş emri ve OP boştur.
export function adimKararSayaclariGetir(
  db: Db, emirIdleri: readonly number[],
): Promise<{ emirId: number; isEmriId: number | null; opNo: number | null; kararBekliyor: number; red: number }[]> {
  return db.sorgu(
    `SELECT s.emir_id AS "emirId", s.is_emri_id AS "isEmriId", i.op_no AS "opNo",
            COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'karar_bekliyor'), 0)::int AS "kararBekliyor",
            COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'red'), 0)::int AS red
       FROM uretim_sayimi s LEFT JOIN uretim_emirleri_is_emri i ON i.id = s.is_emri_id
      WHERE s.emir_id = ANY($1::int[]) AND s.tur IN ('karar_bekliyor', 'red')
      GROUP BY s.emir_id, s.is_emri_id, i.op_no ORDER BY s.emir_id, i.op_no NULLS FIRST`,
    [[...emirIdleri]],
  );
}

export function olayEkle(
  db: Db, emirId: number, kisiId: number, istasyonId: number, olay: 'duraklat' | 'durdur' | 'devam' | 'ayar',
  durusNedeniId: number | null, an: string, isEmriId: number | null = null,
): Promise<unknown> {
  return db.sorgu(
    `INSERT INTO uretim_olayi (emir_id, kisi_id, istasyon_id, olay, durus_nedeni_id, zaman, is_emri_id)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz, ${ADIM_IS_EMRI('$1', '$7')})`,
    [emirId, kisiId, istasyonId, olay, durusNedeniId, an, isEmriId],
  );
}

export interface SayacSatiri {
  emirId: number;
  saglam: number;
  hurda: number;
  kararBekliyor: number;
  red: number;
}

export interface OlaySatiri {
  emirId: number;
  olay: 'duraklat' | 'durdur' | 'devam';
  durusNedeniId: number | null;
  zaman: string;
}

export function sayaclariGetir(db: Db, emirIdleri: readonly number[]): Promise<SayacSatiri[]> {
  return db.sorgu<SayacSatiri>(
    `SELECT emir_id AS "emirId",
            COALESCE(sum(adet) FILTER (WHERE tur = 'saglam'), 0)::int AS saglam,
            COALESCE(sum(adet) FILTER (WHERE tur = 'hurda'), 0)::int AS hurda,
            COALESCE(sum(adet) FILTER (WHERE tur = 'karar_bekliyor'), 0)::int AS "kararBekliyor",
            COALESCE(sum(adet) FILTER (WHERE tur = 'red'), 0)::int AS red
       FROM uretim_sayimi s WHERE emir_id = ANY($1::int[]) AND is_emri_id IS NOT DISTINCT FROM ${TERMINAL_IS_EMRI('s.emir_id')}
      GROUP BY emir_id`,
    [[...emirIdleri]],
  );
}

// İş emri başına işlenen net adet (sağlam, hurda, karar bekleyen, red; düzeltme dahil) ve son sayım anı: karar satırları karar bekleyenden
// düşüp sağlam ya da redde yazıldığı için toplam değişmez. Liste boşken de koşar: plan okumasının sorgu sayısı sabit kalır.
export async function islenenAdetleriGetir(db: Db, isEmriIdleri: readonly number[]): Promise<Map<number, { adet: number; sonAn: string }>> {
  const satirlar = await db.sorgu<{ id: number; adet: number; sonAn: Date }>(
    `SELECT is_emri_id AS id, COALESCE(sum(adet), 0)::int AS adet, max(zaman) AS "sonAn" FROM uretim_sayimi
      WHERE is_emri_id = ANY($1::int[]) AND tur IN ('saglam', 'hurda', 'karar_bekliyor', 'red') GROUP BY is_emri_id`,
    [[...isEmriIdleri]],
  );
  return new Map(satirlar.map((r) => [r.id, { adet: r.adet, sonAn: new Date(r.sonAn).toISOString() }]));
}

// Emrin bütün iş emirlerindeki net hurda (düzeltme dahil); sağlamdan farklı olarak her adımın kaybı emrin kaybıdır.
export function hurdaToplamlariGetir(db: Db, emirIdleri: readonly number[]): Promise<{ emirId: number; hurda: number }[]> {
  return db.sorgu<{ emirId: number; hurda: number }>(
    `SELECT emir_id AS "emirId", COALESCE(sum(adet), 0)::int AS hurda
       FROM uretim_sayimi WHERE emir_id = ANY($1::int[]) AND tur = 'hurda' GROUP BY emir_id`,
    [[...emirIdleri]],
  );
}

// Kartlı emirlerin net hurdası (335): kartsız emir satır vermez, hurdasız kartlı emir 0 verir.
export function kartliEmirHurdalari(db: Db, emirIdleri: readonly number[]): Promise<{ uretimEmriId: number; malzemeNo: number; hurda: number }[]> {
  return db.sorgu<{ uretimEmriId: number; malzemeNo: number; hurda: number }>(
    `SELECT e.id AS "uretimEmriId", e.malzeme_no AS "malzemeNo", COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'hurda'), 0)::int AS hurda
       FROM uretim_emri e LEFT JOIN uretim_sayimi s ON s.emir_id = e.id
      WHERE e.id = ANY($1::int[]) AND e.malzeme_no IS NOT NULL GROUP BY e.id ORDER BY e.id`,
    [[...emirIdleri]],
  );
}

// Hurda düzeltmesi son hurdanın nedeniyle yazılır (kart #1194): terminal düzeltmede neden sormaz.
export async function sonHurdaNedeni(db: Db, emirId: number, isEmriId: number | null = null): Promise<number | null> {
  const satir = await db.tek<{ id: number }>(
    `SELECT hurda_nedeni_id AS id FROM uretim_sayimi s
      WHERE emir_id = $1 AND tur = 'hurda' AND adet > 0 AND is_emri_id IS NOT DISTINCT FROM ${ADIM_IS_EMRI('s.emir_id', '$2')}
      ORDER BY id DESC LIMIT 1`,
    [emirId, isEmriId],
  );
  return satir?.id ?? null;
}

// Her emrin son olayı: çalışma durumu buradan türer (olay yoksa çalışıyor).
export function sonOlaylariGetir(db: Db, emirIdleri: readonly number[]): Promise<OlaySatiri[]> {
  return db.sorgu<OlaySatiri>(
    `SELECT DISTINCT ON (emir_id) emir_id AS "emirId", olay, durus_nedeni_id AS "durusNedeniId", ${ISO('zaman')} AS zaman
       FROM uretim_olayi o WHERE emir_id = ANY($1::int[]) AND olay <> 'ayar'
        AND is_emri_id IS NOT DISTINCT FROM ${TERMINAL_IS_EMRI('o.emir_id')}
      ORDER BY emir_id, id DESC`,
    [[...emirIdleri]],
  );
}

// Sıradaki işin (iş emirli emirde sıradaki iş emri) ayarı yazılmış mı.
export async function ayarVarMi(db: Db, emirId: number, isEmriId: number | null = null): Promise<boolean> {
  const satir = await db.tek<{ var: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM uretim_olayi o WHERE o.emir_id = $1 AND o.olay = 'ayar'
       AND o.is_emri_id IS NOT DISTINCT FROM ${ADIM_IS_EMRI('o.emir_id', '$2')}) AS var`,
    [emirId, isEmriId],
  );
  return satir?.var ?? false;
}

export interface SureOlaySatiri {
  olay: 'duraklat' | 'durdur' | 'devam' | 'ayar';
  zaman: string;
}

export function isEmriOlaylari(db: Db, isEmriId: number): Promise<SureOlaySatiri[]> {
  return db.sorgu<SureOlaySatiri>(
    `SELECT olay, ${ISO('zaman')} AS zaman FROM uretim_olayi WHERE is_emri_id = $1 ORDER BY zaman, id`, [isEmriId],
  );
}

export interface SureSayimSatiri {
  tur: 'saglam' | 'hurda';
  adet: number;
  duzeltme: boolean;
  zaman: string;
}

export function isEmriSayimlari(db: Db, isEmriId: number): Promise<SureSayimSatiri[]> {
  return db.sorgu<SureSayimSatiri>(
    `SELECT tur, adet, duzeltme, ${ISO('zaman')} AS zaman FROM uretim_sayimi WHERE is_emri_id = $1 AND tur IN ('saglam', 'hurda')
      ORDER BY zaman, id`, [isEmriId],
  );
}

export function kayitlariGetir(db: Db, emirId: number): Promise<KayitSatiri[]> {
  return db.sorgu<KayitSatiri>(
    `SELECT b.id, b."emirId", b."kisiId", b."istasyonId", b.olay, b."saglamAdet", b.adet, b."durusNedeniId", b."hurdaNedeniId",
            b."kararVerenId", ${ISO('b.an')} AS zaman FROM (
       SELECT k.id::bigint * 3 AS id, k.emir_id AS "emirId", k.kisi_id AS "kisiId", k.istasyon_id AS "istasyonId", k.olay,
              k.saglam_adet AS "saglamAdet", NULL::int AS adet, NULL::int AS "durusNedeniId", NULL::int AS "hurdaNedeniId",
              NULL::int AS "kararVerenId", k.zaman AS an, CASE k.olay WHEN 'baslat' THEN 0 ELSE 2 END AS sira
         FROM uretim_kaydi k WHERE k.emir_id = $1
       UNION ALL
       SELECT o.id::bigint * 3 + 1, o.emir_id, o.kisi_id, o.istasyon_id, o.olay, NULL, NULL, o.durus_nedeni_id, NULL, NULL, o.zaman, 1
         FROM uretim_olayi o WHERE o.emir_id = $1
       UNION ALL
       SELECT s.id::bigint * 3 + 2, s.emir_id, s.kisi_id, s.istasyon_id,
              CASE WHEN s.tur = 'hurda' THEN 'hurda' WHEN s.tur = 'red' THEN 'kalite_red' WHEN s.karar THEN 'kalite_onay' ELSE 'duzeltme' END,
              NULL, s.adet, NULL, s.hurda_nedeni_id, s.karar_veren_kisi_id, COALESCE(s.karar_zamani, s.zaman), 1
         FROM (SELECT s.*, ${KARAR_SATIRI} AS karar
                 FROM uretim_sayimi s WHERE s.emir_id = $1 AND (s.tur IN ('hurda', 'red') OR (s.tur = 'saglam' AND s.duzeltme))) s
     ) b ORDER BY b.an, b.sira, b.id`,
    [emirId],
  );
}

// Arşivdeki silinmiş malzeme kartlarının bu modüldeki izi (2114c); malzemeler kablolamadan okur.
export async function malzemeKartiIzleri(db: Db, kartlar: readonly MalzemeKartiAnahtari[]): Promise<MalzemeKartiIzi[]> {
  if (kartlar.length === 0) return [];
  return db.sorgu<MalzemeKartiIzi>(
    `WITH k AS (SELECT * FROM unnest($1::int[], $2::text[], $3::text[]) AS k(no, kod, kimlik))
     SELECT k.no, 'İş emri (düğüm)' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN uretim_emirleri_is_emri t ON t.dugum_malzeme_id = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'İş emri bileşeni' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN uretim_emirleri_is_emri_bileseni t ON t.malzeme_no = k.no GROUP BY k.no
      UNION ALL
     SELECT k.no, 'Üretim emri' AS kayit, 'kesin' AS tur, count(*)::int AS adet, min(t.id)::text AS ornek
       FROM k JOIN uretim_emri t ON t.malzeme_no = k.no GROUP BY k.no`,
    [...malzemeKartiIzParametreleri(kartlar)],
  );
}
