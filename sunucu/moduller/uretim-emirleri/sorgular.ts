import type { Db } from '#cekirdek/db.ts';
import type { Dilim } from '#cekirdek/liste.ts';
import type { EmirDurumu, EmirKaydi, EmirTuru, KatilimKapanisi, KayitOlayi, SayimTuru, SonOlayTuru } from '#paylasilan/sozlesme/uretim-emirleri.ts';

// Zaman ISO 8601 metni olarak döner (sözleşme: zaman).
const ISO = (sutun: string) => `to_json(${sutun}) #>> '{}'`;
const NULLU_ISO = (sutun: string) => `CASE WHEN ${sutun} IS NULL THEN NULL ELSE ${ISO(sutun)} END`;
const TARIH = (sutun: string) => `to_char(${sutun}, 'YYYY-MM-DD')`;

// Terminalin işlediği iş emri: çalışan, yoksa sıradaki bekleyen, hepsi bittiyse son biten. İş emirsiz emirde boştur;
// sayaç, olay ve kontrol listesi bu iş emri kapsamında okunur ve yazılır (iş emirsiz emirde kapsam boş iş emridir).
const TERMINAL_IS_EMRI = (emir: string) => `(SELECT ie.id FROM uretim_emirleri_is_emri ie WHERE ie.uretim_emri_id = ${emir}
  ORDER BY CASE ie.durum WHEN 'calisiyor' THEN 0 WHEN 'bekliyor' THEN 1 ELSE 2 END, CASE WHEN ie.durum = 'tamam' THEN -ie.sira ELSE ie.sira END
  LIMIT 1)`;
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

// Bitmiş ve iptal emir kapalıdır; listeler varsayılan olarak yalnız açıkları döner (kart #1323).
const KAPALI = "e.durum IN ('bitti', 'iptal')";
// Arama metni LIKE kalıbı olarak değil düz metin olarak aranır (% ve _ joker sayılmaz).
const ARAMA = (p: string) => `($${p}::text IS NULL OR strpos(lower(e.emir_no || ' ' || e.parca_no || ' ' || e.parca_ad), lower($${p}::text)) > 0)`;

// Durum verilirse yalnız o durum; verilmezse `hepsi` değilse yalnız açık emirler.
export function emirleriGetir(db: Db, durum: EmirDurumu | null, yalnizIstasyonlu: boolean, hepsi = false): Promise<EmirSatiri[]> {
  return db.sorgu<EmirSatiri>(
    `SELECT ${EMIR} FROM uretim_emri e WHERE ($1::text IS NULL OR e.durum = $1) AND (NOT $2::boolean OR e.istasyon_id IS NOT NULL)
        AND ($1::text IS NOT NULL OR $3::boolean OR NOT ${KAPALI}) ORDER BY e.id DESC`,
    [durum, yalnizIstasyonlu, hepsi],
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
}

// Satırın bağlandığı iş emri döner (sağlam sayım stoka bu iş emriyle yansır); iş emirsiz eski emirde null.
export async function sayimEkle(db: Db, y: SayimYazisi): Promise<{ isEmriId: number | null }> {
  const satir = await db.tek<{ isEmriId: number | null }>(
    `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, hurda_nedeni_id, duzeltme, zaman, is_emri_id, refakat_partisi_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, ${ADIM_IS_EMRI('$1', '$10')}, $9) RETURNING is_emri_id AS "isEmriId"`,
    [y.emirId, y.kisiId, y.istasyonId, y.tur, y.adet, y.hurdaNedeniId, y.duzeltme, y.an, y.refakatPartisiId, y.isEmriId ?? null],
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

// Karar bekleyen adet iş emri, istasyon ve refakat partisi başına: sayım o anki terminal iş emrine yazılmıştır, sonuç satırı da aynı iş
// emrine ve aynı partiye gider.
export interface KararGrubu { isEmriId: number | null; istasyonId: number; kisiId: number; refakatPartisiId: number | null }
export interface KararBekleyenSatir extends KararGrubu { zaman: string; adet: number }

// Grubun henüz karara bağlanmamış satırları, yazılış sırasıyla: her karar grubu sıfırlar, bu yüzden bekleyen, grubun kümülatif
// toplamının son sıfır olduğu satırdan sonrakilerdir (düzeltmeler dahil). Toplamı sıfır olan grup gelmez. İş emri verilince yalnız o
// adımın satırları gelir (744 a: ilk parça kararı adım başınadır).
export function kararBekleyenSatirlari(db: Db, emirId: number, isEmriId: number | null = null): Promise<KararBekleyenSatir[]> {
  return db.sorgu<KararBekleyenSatir>(
    `WITH s AS (
       SELECT id, is_emri_id, istasyon_id, kisi_id, refakat_partisi_id, zaman, adet,
              sum(adet) OVER (PARTITION BY is_emri_id, istasyon_id, kisi_id, refakat_partisi_id ORDER BY id) AS kumulatif
         FROM uretim_sayimi WHERE emir_id = $1 AND tur = 'karar_bekliyor' AND ($2::int IS NULL OR is_emri_id = $2)),
     g AS (
       SELECT is_emri_id, istasyon_id, kisi_id, refakat_partisi_id, COALESCE(max(id) FILTER (WHERE kumulatif = 0), 0) AS sifir
         FROM s GROUP BY is_emri_id, istasyon_id, kisi_id, refakat_partisi_id)
     SELECT s.is_emri_id AS "isEmriId", s.istasyon_id AS "istasyonId", s.kisi_id AS "kisiId", s.refakat_partisi_id AS "refakatPartisiId",
            ${ISO('s.zaman')} AS zaman, s.adet
       FROM s JOIN g ON g.is_emri_id IS NOT DISTINCT FROM s.is_emri_id AND g.istasyon_id = s.istasyon_id AND g.kisi_id = s.kisi_id
                    AND g.refakat_partisi_id IS NOT DISTINCT FROM s.refakat_partisi_id
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
    `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, duzeltme, zaman, is_emri_id, refakat_partisi_id, karar_veren_kisi_id, karar_zamani)
     VALUES ($1, $2, $3, 'karar_bekliyor', -$6::int, true, $5::timestamptz, $4, $8, $9, $10::timestamptz),
            ($1, $2, $3, $7, $6, true, $5::timestamptz, $4, $8, $9, $10::timestamptz)`,
    [emirId, g.kisiId, g.istasyonId, g.isEmriId, uretimAni, adet, tur, g.refakatPartisiId, kararVerenId, kararAni],
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

// Üç defter tek listede: kimlik tablo kimliğinin üç katı artı kaynak payıdır (0 kayıt, 1 olay, 2 sayım),
// bu yüzden çakışmaz. Aynı anı taşıyan satırlarda başlatma önce, bitirme sonra gelir.
// Kalite kararı sağlama ya da redde geçen satırdır ve karar anında görünür; kişi sayandır, kararı veren ayrı gelir. Karar veren sütunundan önce
// yazılmış karar satırı, aynı anda aynı adedi karar bekleyenden düşen eşinden tanınır; kararı veren bilinmez.
const KARAR_SATIRI = `(s.tur = 'red' OR (s.tur = 'saglam' AND s.duzeltme AND (s.karar_veren_kisi_id IS NOT NULL OR EXISTS (
  SELECT 1 FROM uretim_sayimi k WHERE k.emir_id = s.emir_id AND k.zaman = s.zaman AND k.tur = 'karar_bekliyor'
     AND k.duzeltme AND k.adet = -s.adet AND k.is_emri_id IS NOT DISTINCT FROM s.is_emri_id))))`;

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

export interface AdimSatiri {
  id: number;
  sira: number;
  ad: string;
  aciklama: string | null;
  tamam: boolean;
  tamamlayanId: number | null;
  tamamlanma: string | null;
}

export async function adimEkle(
  db: Db, emirId: number, sira: number, ad: string, aciklama: string | null, isEmriId: number | null = null,
): Promise<void> {
  await db.sorgu(
    'INSERT INTO emir_adimi (emir_id, sira, ad, aciklama, is_emri_id) VALUES ($1, $2, $3, $4, $5)', [emirId, sira, ad, aciklama, isEmriId],
  );
}

// Güncel durum son olaydan türer; geri alınmış adımda tamamlayan ve zaman yoktur.
export function adimlariGetir(db: Db, emirId: number): Promise<AdimSatiri[]> {
  return db.sorgu<AdimSatiri>(
    `SELECT a.id, a.sira, a.ad, a.aciklama, COALESCE(o.olay = 'tamamla', false) AS tamam,
            CASE WHEN o.olay = 'tamamla' THEN o.kisi_id END AS "tamamlayanId",
            CASE WHEN o.olay = 'tamamla' THEN ${ISO('o.zaman')} END AS tamamlanma
       FROM emir_adimi a
       LEFT JOIN LATERAL (SELECT olay, kisi_id, zaman FROM emir_adimi_olayi WHERE adim_id = a.id ORDER BY id DESC LIMIT 1) o ON true
      WHERE a.emir_id = $1 AND a.is_emri_id IS NOT DISTINCT FROM ${TERMINAL_IS_EMRI('$1')} ORDER BY a.sira`,
    [emirId],
  );
}

export async function adimEmirdeVarMi(db: Db, emirId: number, adimId: number): Promise<boolean> {
  return (await db.tek(
    `SELECT 1 AS var FROM emir_adimi WHERE id = $1 AND emir_id = $2 AND is_emri_id IS NOT DISTINCT FROM ${TERMINAL_IS_EMRI('$2')}`, [adimId, emirId],
  )) !== null;
}

export function adimOlayiEkle(db: Db, adimId: number, kisiId: number, olay: 'tamamla' | 'geri-al', an: string): Promise<unknown> {
  return db.sorgu('INSERT INTO emir_adimi_olayi (adim_id, kisi_id, olay, zaman) VALUES ($1, $2, $3, $4::timestamptz)', [adimId, kisiId, olay, an]);
}

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
  surum: number;
}

const UST = `e.id, e.emir_no AS "emirNo", e.parca_no AS "parcaNo", e.parca_ad AS "parcaAd", e.adet, e.istasyon_id AS "istasyonId",
  e.malzeme_no AS "malzemeNo", e.kaynak_rota_revizyonu_id AS "kaynakRotaRevizyonId", e.oncelik::int AS oncelik,
  ${TARIH('e.baslangic')} AS baslangic, ${TARIH('e.teslim')} AS teslim, e.durum, e.arsiv, e.aciklama, ${ISO('e.acilma')} AS acilma,
  ${NULLU_ISO('e.baslama')} AS baslama, ${NULLU_ISO('e.bitis')} AS bitis, e.saglam_adet AS "saglamAdet",
  e.ust_emir_id AS "ustEmirId", e.bolunme_sira AS "bolunmeSira", e.birlestigi_emir_id AS "birlestigiEmirId",
  e.birlesme_op_no AS "birlesmeOpNo", e.emir_turu AS "emirTuru", e.proje_id AS "projeId", e.siparis_satiri_id AS "siparisSatiriId", e.surum`;

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
}

export async function ustEmirEkle(db: Db, e: UstEmirYazisi, acanId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, malzeme_no, kaynak_rota_revizyonu_id, oncelik, baslangic, teslim,
       aciklama, durum, ust_emir_id, bolunme_sira, birlesme_op_no, emir_turu, emir_no, proje_id, siparis_satiri_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::date, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING id`,
    [e.parcaNo, e.parcaAd, e.adet, e.istasyonId, acanId, e.malzemeNo, e.kaynakRotaRevizyonId, e.oncelik, e.baslangic, e.teslim, e.aciklama, e.durum,
      e.ustEmirId ?? null, e.bolunmeSira ?? null, e.birlesmeOpNo ?? null, e.emirTuru, e.emirNo ?? null, e.projeId ?? null,
      e.siparisSatiriId ?? null],
  );
  if (satir === null) throw new Error('Üretim emri eklenemedi.');
  return satir.id;
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

export function kontrolListesiGetir(db: Db, isEmriIdleri: readonly number[]): Promise<{ isEmriId: number; sira: number; ad: string; aciklama: string | null }[]> {
  return db.sorgu(
    `SELECT is_emri_id AS "isEmriId", sira, ad, aciklama FROM emir_adimi WHERE is_emri_id = ANY($1::int[]) ORDER BY is_emri_id, sira`,
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
    'UPDATE uretim_emri SET oncelik = $2, baslangic = $3::date, teslim = $4::date, surum = surum + 1 WHERE id = $1',
    [id, g.oncelik, g.baslangic, g.teslim],
  );
}

export function oncelikYaz(db: Db, id: number, surum: number, oncelik: number): Promise<{ id: number } | null> {
  return db.tek('UPDATE uretim_emri SET oncelik = $3, surum = surum + 1 WHERE id = $1 AND surum = $2 RETURNING id', [id, surum, oncelik]);
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

export interface IsEmriSatiri {
  id: number;
  uretimEmriId: number;
  sira: number;
  opNo: number;
  operasyonTipiId: number;
  ad: string;
  makineId: number | null;
  kisiId: number | null;
  fasonFirmaId: number | null;
  istasyonId: number | null;
  ayarSuresiDk: string | null;
  birimSureDk: string | null;
  terminGun: number | null;
  bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz';
  devirAdedi: number | null;
  firePayiYuzde: string;
  makineKullanimi: 'tek' | 'paralel';
  enKucukParca: number | null;
  yenidenAyar: boolean;
  talimatSurumu: number | null;
  tur: 'rota' | 'rework' | 'tamir' | 'ek';
  ekAciklama: string | null;
  durum: 'bekliyor' | 'calisiyor' | 'tamam';
  baslama: string | null;
  bitis: string | null;
  saglamAdet: number | null;
  surum: number;
}

const IS_EMRI = `i.id, i.uretim_emri_id AS "uretimEmriId", i.sira, i.op_no AS "opNo", i.operasyon_tipi_id AS "operasyonTipiId", i.ad,
  i.makine_id AS "makineId", i.kisi_id AS "kisiId", i.fason_firma_id AS "fasonFirmaId", i.istasyon_id AS "istasyonId",
  i.ayar_suresi_dk::text AS "ayarSuresiDk", i.birim_sure_dk::text AS "birimSureDk", i.termin_gun AS "terminGun", i.bagimlilik,
  i.devir_adedi AS "devirAdedi", i.fire_payi_yuzde::text AS "firePayiYuzde", i.makine_kullanimi AS "makineKullanimi",
  i.en_kucuk_parca AS "enKucukParca", i.yeniden_ayar AS "yenidenAyar", i.talimat_surumu AS "talimatSurumu", i.tur, i.ek_aciklama AS "ekAciklama", i.durum,
  ${NULLU_ISO('i.baslama')} AS baslama, ${NULLU_ISO('i.bitis')} AS bitis, i.saglam_adet AS "saglamAdet", i.surum`;

export function isEmirleriGetir(db: Db, emirIdleri: readonly number[]): Promise<IsEmriSatiri[]> {
  return db.sorgu<IsEmriSatiri>(
    `SELECT ${IS_EMRI} FROM uretim_emirleri_is_emri i WHERE i.uretim_emri_id = ANY($1::int[]) ORDER BY i.uretim_emri_id, i.sira`,
    [[...emirIdleri]],
  );
}

export function isEmriBul(db: Db, id: number, kilit = false): Promise<IsEmriSatiri | null> {
  return db.tek<IsEmriSatiri>(`SELECT ${IS_EMRI} FROM uretim_emirleri_is_emri i WHERE i.id = $1${kilit ? ' FOR UPDATE' : ''}`, [id]);
}

// Makine ayrımı denetimi için (393 d): iş emirlerinin emri, emir no'su, op no'su ve durumu.
export function isEmriAyrimBilgileri(db: Db, idler: readonly number[]): Promise<{ id: number; uretimEmriId: number; emirNo: string; opNo: number; durum: 'bekliyor' | 'calisiyor' | 'tamam' }[]> {
  return db.sorgu(
    `SELECT i.id, i.uretim_emri_id AS "uretimEmriId", e.emir_no AS "emirNo", i.op_no AS "opNo", i.durum
       FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id WHERE i.id = ANY($1::int[])`,
    [[...idler]],
  );
}

// Plan için: verilen iş emirlerinden var olanların emir no'su, op no'su, durumu ve fasonda olup olmadığı (silinen iş emri listede yoktur).
export function isEmriVarliklari(db: Db, idler: readonly number[]): Promise<{ id: number; emirNo: string; opNo: number; durum: string; fason: boolean }[]> {
  return db.sorgu(
    `SELECT i.id, e.emir_no AS "emirNo", i.op_no AS "opNo", i.durum, i.fason_firma_id IS NOT NULL AS fason
       FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id WHERE i.id = ANY($1::int[])`,
    [[...idler]],
  );
}

// CNC kurulum için: açık (planlı ya da başlamış) emirlerin bitmemiş iş emirleri; istasyon süzgecini çağıran yapar.
export interface AcikIsEmri {
  id: number;
  uretimEmriId: number;
  emirNo: string;
  parcaNo: string;
  parcaAd: string;
  adet: number;
  opNo: number;
  ad: string;
  durum: 'bekliyor' | 'calisiyor';
  istasyonId: number | null;
}

const ACIK_IS_EMRI = `SELECT i.id, e.id AS "uretimEmriId", e.emir_no AS "emirNo", e.parca_no AS "parcaNo", e.parca_ad AS "parcaAd", e.adet,
         i.op_no AS "opNo", i.ad, i.durum, i.istasyon_id AS "istasyonId"
    FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id
   WHERE NOT e.arsiv AND e.durum IN ('planli', 'basladi') AND i.durum IN ('bekliyor', 'calisiyor')`;

export function acikIsEmirleri(db: Db): Promise<AcikIsEmri[]> {
  return db.sorgu<AcikIsEmri>(`${ACIK_IS_EMRI} ORDER BY e.id, i.sira`);
}

export function acikIsEmri(db: Db, isEmriId: number): Promise<AcikIsEmri | null> {
  return db.tek<AcikIsEmri>(`${ACIK_IS_EMRI} AND i.id = $1`, [isEmriId]);
}

// Plan için: açık (planlı ya da başlamış), arşivde olmayan emirlerin bitmemiş, fason olmayan iş emirleri.
export interface PlanEmriBilgisi {
  id: number;
  emirNo: string;
  malzemeNo: number | null;
  adet: number;
  teslim: string | null;
  oncelik: number;
  acilma: string;
  baslangic: string | null;
  kaynakRotaRevizyonId: number | null;
  ustEmirId: number | null;
  bolunmeSira: number | null;
  birlesmeOpNo: number | null;
  emirTuru: EmirTuru;
  durum: EmirDurumu;
  baslamis: boolean;
  siparisSatiriId: number | null;
}

export function planlanacakIsEmirleriGetir(db: Db, taslakDahil: boolean): Promise<(IsEmriSatiri & { emir: PlanEmriBilgisi })[]> {
  return db.sorgu(
    `SELECT ${IS_EMRI}, json_build_object(
              'id', e.id, 'emirNo', e.emir_no, 'malzemeNo', e.malzeme_no, 'adet', e.adet, 'teslim', ${TARIH('e.teslim')},
              'oncelik', e.oncelik, 'acilma', ${ISO('e.acilma')}, 'baslangic', ${TARIH('e.baslangic')}, 'kaynakRotaRevizyonId', e.kaynak_rota_revizyonu_id, 'ustEmirId', e.ust_emir_id,
              'bolunmeSira', e.bolunme_sira, 'birlesmeOpNo', e.birlesme_op_no, 'emirTuru', e.emir_turu, 'durum', e.durum, 'siparisSatiriId', e.siparis_satiri_id,
              'baslamis', EXISTS (SELECT 1 FROM uretim_emirleri_is_emri b WHERE b.uretim_emri_id = e.id AND b.durum <> 'bekliyor')) AS emir
       FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id
      WHERE NOT e.arsiv AND e.malzeme_no IS NOT NULL AND (e.durum IN ('planli', 'basladi') OR ($1 AND e.durum = 'taslak'))
        AND i.durum <> 'tamam' AND i.fason_firma_id IS NULL
      ORDER BY e.id, i.sira`,
    [taslakDahil],
  );
}

export interface IsEmriYazisi {
  sira: number;
  opNo: number;
  operasyonTipiId: number;
  ad: string;
  makineId: number | null;
  kisiId: number | null;
  fasonFirmaId: number | null;
  istasyonId: number | null;
  ayarSuresiDk: string | null;
  birimSureDk: string | null;
  terminGun: number | null;
  bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz';
  devirAdedi: number | null;
  firePayiYuzde: string;
  makineKullanimi: 'tek' | 'paralel';
  enKucukParca: number | null;
  yenidenAyar: boolean;
  talimatSurumu: number | null;
  // Yalnız eklemede: verilmezse rota adımıdır. Güncelleme türü değiştirmez.
  tur?: 'rota' | 'rework' | 'tamir' | 'ek';
  ekAciklama?: string | null;
}

const IS_EMRI_DEGERLERI = (y: IsEmriYazisi) => [
  y.sira, y.opNo, y.operasyonTipiId, y.ad, y.makineId, y.kisiId, y.fasonFirmaId, y.istasyonId, y.ayarSuresiDk, y.birimSureDk, y.terminGun,
  y.bagimlilik, y.devirAdedi, y.firePayiYuzde, y.makineKullanimi, y.enKucukParca, y.yenidenAyar, y.talimatSurumu,
];

export async function isEmriEkle(db: Db, emirId: number, y: IsEmriYazisi): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, makine_id, kisi_id, fason_firma_id, istasyon_id,
       ayar_suresi_dk, birim_sure_dk, termin_gun, bagimlilik, devir_adedi, fire_payi_yuzde, makine_kullanimi, en_kucuk_parca, yeniden_ayar,
       talimat_surumu, tur, ek_aciklama)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) RETURNING id`,
    [emirId, ...IS_EMRI_DEGERLERI(y), y.tur ?? 'rota', y.ekAciklama ?? null],
  );
  if (satir === null) throw new Error('İş emri eklenemedi.');
  return satir.id;
}

export async function isaretliListeVar(db: Db, isEmriId: number): Promise<boolean> {
  const satir = await db.tek<{ var: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM emir_adimi a JOIN emir_adimi_olayi o ON o.adim_id = a.id WHERE a.is_emri_id = $1) AS var`, [isEmriId],
  );
  return satir?.var === true;
}

// Yalnız bekleyen iş emri güncellenir; adayları ve bileşenleri yeniden yazılır (çağıran ekler).
export async function bekleyenIsEmriniGuncelle(db: Db, id: number, y: IsEmriYazisi): Promise<void> {
  await db.sorgu(
    `UPDATE uretim_emirleri_is_emri SET sira = $2, op_no = $3, operasyon_tipi_id = $4, ad = $5, makine_id = $6, kisi_id = $7,
            fason_firma_id = $8, istasyon_id = $9, ayar_suresi_dk = $10, birim_sure_dk = $11, termin_gun = $12, bagimlilik = $13,
            devir_adedi = $14, fire_payi_yuzde = $15, makine_kullanimi = $16, en_kucuk_parca = $17, yeniden_ayar = $18, talimat_surumu = $19,
            surum = surum + 1
      WHERE id = $1 AND durum = 'bekliyor'`,
    [id, ...IS_EMRI_DEGERLERI(y)],
  );
  await db.sorgu('DELETE FROM uretim_emirleri_is_emri_adayi WHERE is_emri_id = $1', [id]);
  await db.sorgu('DELETE FROM uretim_emirleri_is_emri_bileseni WHERE is_emri_id = $1', [id]);
  await db.sorgu('DELETE FROM emir_adimi WHERE is_emri_id = $1', [id]);
}

// Bekleyen iş emrinin işaretlenmemiş listesi onunla birlikte silinir; tetikleyici işaretliyi ve başlamışınkini reddeder.
export async function bekleyenIsEmriniSil(db: Db, id: number): Promise<void> {
  await db.sorgu('DELETE FROM emir_adimi WHERE is_emri_id = $1', [id]);
  await db.sorgu(`DELETE FROM uretim_emirleri_is_emri WHERE id = $1 AND durum = 'bekliyor'`, [id]);
}

export function isEmriEkAciklamasiYaz(db: Db, id: number, aciklama: string | null): Promise<unknown> {
  return db.sorgu(`UPDATE uretim_emirleri_is_emri SET ek_aciklama = $2 WHERE id = $1 AND durum = 'bekliyor'`, [id, aciklama]);
}

export function isEmriSirasiYaz(db: Db, id: number, sira: number): Promise<unknown> {
  return db.sorgu('UPDATE uretim_emirleri_is_emri SET sira = $2 WHERE id = $1', [id, sira]);
}

export function adayEkle(
  db: Db, isEmriId: number, a: { makineId: number | null; kisiId: number | null; ayarSuresiDk: string | null; birimSureDk: string | null },
): Promise<unknown> {
  return db.sorgu(
    'INSERT INTO uretim_emirleri_is_emri_adayi (is_emri_id, makine_id, kisi_id, ayar_suresi_dk, birim_sure_dk) VALUES ($1, $2, $3, $4, $5)',
    [isEmriId, a.makineId, a.kisiId, a.ayarSuresiDk, a.birimSureDk],
  );
}

export function bilesenEkle(db: Db, isEmriId: number, b: { malzemeNo: number; miktar: string; fireYuzde: string }): Promise<unknown> {
  return db.sorgu(
    'INSERT INTO uretim_emirleri_is_emri_bileseni (is_emri_id, malzeme_no, miktar, fire_yuzde) VALUES ($1, $2, $3, $4)',
    [isEmriId, b.malzemeNo, b.miktar, b.fireYuzde],
  );
}

export interface AdaySatiri {
  isEmriId: number;
  makineId: number | null;
  kisiId: number | null;
  ayarSuresiDk: string | null;
  birimSureDk: string | null;
}

export function adaylariGetir(db: Db, isEmriIdleri: readonly number[]): Promise<AdaySatiri[]> {
  return db.sorgu<AdaySatiri>(
    `SELECT is_emri_id AS "isEmriId", makine_id AS "makineId", kisi_id AS "kisiId", ayar_suresi_dk::text AS "ayarSuresiDk",
            birim_sure_dk::text AS "birimSureDk"
       FROM uretim_emirleri_is_emri_adayi WHERE is_emri_id = ANY($1::int[]) ORDER BY is_emri_id, id`,
    [[...isEmriIdleri]],
  );
}

export function bilesenleriGetir(db: Db, isEmriIdleri: readonly number[]): Promise<{ isEmriId: number; malzemeNo: number; miktar: string; fireYuzde: string }[]> {
  return db.sorgu(
    `SELECT is_emri_id AS "isEmriId", malzeme_no AS "malzemeNo", miktar::text AS miktar, fire_yuzde::text AS "fireYuzde"
       FROM uretim_emirleri_is_emri_bileseni WHERE is_emri_id = ANY($1::int[]) ORDER BY is_emri_id, malzeme_no`,
    [[...isEmriIdleri]],
  );
}

// Kaynak bir makine ya da kişidir (null: atanmamış); istasyon kaynaktan türer. Yalnız bekleyen ve fason olmayan iş emri.
export function isEmriKaynagiYaz(
  db: Db, id: number, k: { makineId: number | null; kisiId: number | null; istasyonId: number | null }, surum: number | null,
): Promise<{ id: number } | null> {
  return db.tek(
    `UPDATE uretim_emirleri_is_emri SET makine_id = $2, kisi_id = $3, istasyon_id = $4, surum = surum + 1
      WHERE id = $1 AND durum = 'bekliyor' AND fason_firma_id IS NULL AND ($5::int IS NULL OR surum = $5) RETURNING id`,
    [id, k.makineId, k.kisiId, k.istasyonId, surum],
  );
}

// Üretim yeri değişimi: kaynak, istasyon, süreler ve termin birlikte yazılır (fason süresiz ve istasyonsuzdur). Yalnız bekleyen ve fasona
// gönderimi olmayan iş emri; sürüm ekranın okuduğudur.
export interface UretimYeriYazisi {
  makineId: number | null; kisiId: number | null; fasonFirmaId: number | null; istasyonId: number | null;
  ayarSuresiDk: string | null; birimSureDk: string | null; terminGun: number | null;
}

export function uretimYeriYaz(db: Db, id: number, y: UretimYeriYazisi): Promise<{ id: number } | null> {
  return db.tek(
    `UPDATE uretim_emirleri_is_emri i SET makine_id = $2, kisi_id = $3, fason_firma_id = $4, istasyon_id = $5, ayar_suresi_dk = $6,
            birim_sure_dk = $7, termin_gun = $8, surum = surum + 1
      WHERE i.id = $1 AND i.durum = 'bekliyor' AND NOT EXISTS (SELECT 1 FROM uretim_emirleri_fason_hareketi f WHERE f.is_emri_id = i.id)
      RETURNING i.id`,
    [id, y.makineId, y.kisiId, y.fasonFirmaId, y.istasyonId, y.ayarSuresiDk, y.birimSureDk, y.terminGun],
  );
}

export interface UretimYeriDegisimiSatiri {
  id: number; isEmriId: number;
  eskiMakineId: number | null; eskiKisiId: number | null; eskiFasonFirmaId: number | null; eskiIstasyonId: number | null;
  eskiAyarSuresiDk: string | null; eskiBirimSureDk: string | null; eskiTerminGun: number | null;
  yeniFasonFirmaId: number | null; yeniTerminGun: number | null; kisiId: number; zaman: string;
}

const URETIM_YERI = `d.id, d.is_emri_id AS "isEmriId", d.eski_makine_id AS "eskiMakineId", d.eski_kisi_id AS "eskiKisiId",
  d.eski_fason_firma_id AS "eskiFasonFirmaId", d.eski_istasyon_id AS "eskiIstasyonId", d.eski_ayar_suresi_dk::text AS "eskiAyarSuresiDk",
  d.eski_birim_sure_dk::text AS "eskiBirimSureDk", d.eski_termin_gun AS "eskiTerminGun", d.yeni_fason_firma_id AS "yeniFasonFirmaId",
  d.yeni_termin_gun AS "yeniTerminGun", d.kisi_id AS "kisiId", ${ISO('d.zaman')} AS zaman`;

// İş emri başına değişimler, eskiden yeniye.
export function uretimYeriDegisimleriGetir(db: Db, isEmriIdleri: readonly number[]): Promise<UretimYeriDegisimiSatiri[]> {
  return db.sorgu<UretimYeriDegisimiSatiri>(
    `SELECT ${URETIM_YERI} FROM uretim_emirleri_uretim_yeri_degisimi d WHERE d.is_emri_id = ANY($1::int[]) ORDER BY d.is_emri_id, d.id`,
    [[...isEmriIdleri]],
  );
}

export async function uretimYeriDegisimiEkle(
  db: Db, isEmriId: number, eski: UretimYeriYazisi, yeni: { fasonFirmaId: number | null; terminGun: number | null }, kisiId: number, an: string,
): Promise<void> {
  await db.sorgu(
    `INSERT INTO uretim_emirleri_uretim_yeri_degisimi (is_emri_id, eski_makine_id, eski_kisi_id, eski_fason_firma_id, eski_istasyon_id,
       eski_ayar_suresi_dk, eski_birim_sure_dk, eski_termin_gun, yeni_fason_firma_id, yeni_termin_gun, kisi_id, zaman)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz)`,
    [isEmriId, eski.makineId, eski.kisiId, eski.fasonFirmaId, eski.istasyonId, eski.ayarSuresiDk, eski.birimSureDk, eski.terminGun,
      yeni.fasonFirmaId, yeni.terminGun, kisiId, an],
  );
}

export function isEmriBaslat(db: Db, id: number, an: string): Promise<unknown> {
  return db.sorgu(
    `UPDATE uretim_emirleri_is_emri SET durum = 'calisiyor', baslama = $2::timestamptz, surum = surum + 1 WHERE id = $1 AND durum = 'bekliyor'`,
    [id, an],
  );
}

export function isEmriBitir(db: Db, id: number, saglamAdet: number, an: string): Promise<unknown> {
  return db.sorgu(
    `UPDATE uretim_emirleri_is_emri SET durum = 'tamam', bitis = $3::timestamptz, saglam_adet = $2, surum = surum + 1
      WHERE id = $1 AND durum = 'calisiyor'`,
    [id, saglamAdet, an],
  );
}

export interface FasonHareketiSatiri {
  id: number;
  isEmriId: number;
  yon: 'gidis' | 'donus';
  adet: number;
  hurdaAdet: number | null;
  kisiId: number;
  zaman: string;
}

const FASON = `f.id, f.is_emri_id AS "isEmriId", f.yon, f.adet, f.hurda_adet AS "hurdaAdet", f.kisi_id AS "kisiId", ${ISO('f.zaman')} AS zaman`;

export function fasonHareketleriGetir(db: Db, isEmriIdleri: readonly number[]): Promise<FasonHareketiSatiri[]> {
  return db.sorgu<FasonHareketiSatiri>(
    `SELECT ${FASON} FROM uretim_emirleri_fason_hareketi f WHERE f.is_emri_id = ANY($1::int[]) ORDER BY f.is_emri_id, f.id`,
    [[...isEmriIdleri]],
  );
}

// Satın almanın dış operasyon listesi: bitmemiş fason iş emirleri ve hareket toplamları. Gün dönüşümü bağlantının saat dilimiyle
// (tesis, İstanbul) yapılır. Toplam yalnız o yönde hareket varsa doludur; plan tarihi emirde tutulmaz (null).
export function fasonIsEmirleri(db: Db): Promise<FasonIsEmri[]> {
  return db.sorgu<FasonIsEmri>(
    `SELECT i.id AS "isEmriId", e.id AS "uretimEmriId", e.emir_no AS "emirNo", e.parca_ad AS urun, i.op_no AS "opNo", i.ad AS adim, i.fason_firma_id AS "firmaId",
       e.adet, e.malzeme_no AS "malzemeNo", i.termin_gun AS "terminGun", to_char(e.teslim, 'YYYY-MM-DD') AS teslim,
       NULL::text AS "planlananGidis", ${NULLU_ISO('h.ilk_gidis')} AS "ilkGidis",
       CASE WHEN h.ilk_gidis IS NULL OR i.termin_gun IS NULL THEN NULL ELSE to_char(h.ilk_gidis::date + i.termin_gun, 'YYYY-MM-DD') END AS termin,
       ${NULLU_ISO('h.ilk_donus')} AS "ilkDonus", ${NULLU_ISO('h.son_donus')} AS "sonDonus", h.gonderilen, h.donen, h.hurda
     FROM uretim_emirleri_is_emri i
     JOIN uretim_emri e ON e.id = i.uretim_emri_id
     LEFT JOIN LATERAL (
       SELECT min(f.zaman) FILTER (WHERE f.yon = 'gidis') AS ilk_gidis, min(f.zaman) FILTER (WHERE f.yon = 'donus') AS ilk_donus,
         max(f.zaman) FILTER (WHERE f.yon = 'donus') AS son_donus, (sum(f.adet) FILTER (WHERE f.yon = 'gidis'))::int AS gonderilen,
         (sum(f.adet) FILTER (WHERE f.yon = 'donus'))::int AS donen, (sum(f.hurda_adet) FILTER (WHERE f.yon = 'donus'))::int AS hurda
       FROM uretim_emirleri_fason_hareketi f WHERE f.is_emri_id = i.id
     ) h ON true
     WHERE i.fason_firma_id IS NOT NULL AND i.durum <> 'tamam' AND e.durum NOT IN ('iptal', 'bitti') AND NOT e.arsiv
     ORDER BY e.id, i.sira`,
  );
}

export interface FasonIsEmri {
  isEmriId: number;
  // Fason gidiş, dönüş ve tamamlama uçları emir kimliğiyle çağrılır (/adimli-emirler/:id/is-emirleri/:isEmriId/...).
  uretimEmriId: number;
  emirNo: string;
  urun: string | null;
  opNo: number;
  adim: string | null;
  firmaId: number | null;
  // Satın almanın fason ön talebi (898 a): emrin adedi, parçanın kartı, adımın fason günü ve emrin teslim günü.
  adet: number;
  malzemeNo: number | null;
  terminGun: number | null;
  teslim: string | null;
  planlananGidis: string | null;
  ilkGidis: string | null;
  termin: string | null;
  ilkDonus: string | null;
  sonDonus: string | null;
  gonderilen: number | null;
  donen: number | null;
  hurda: number | null;
}

export function fasonHareketiBul(db: Db, id: number): Promise<FasonHareketiSatiri | null> {
  return db.tek<FasonHareketiSatiri>(`SELECT ${FASON} FROM uretim_emirleri_fason_hareketi f WHERE f.id = $1`, [id]);
}

export async function fasonHareketiEkle(
  db: Db, g: { isEmriId: number; yon: 'gidis' | 'donus'; adet: number; hurdaAdet: number | null; kisiId: number; an: string },
): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO uretim_emirleri_fason_hareketi (is_emri_id, yon, adet, hurda_adet, kisi_id, zaman) VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
     RETURNING id`,
    [g.isEmriId, g.yon, g.adet, g.hurdaAdet, g.kisiId, g.an],
  );
  if (satir === null) throw new Error('Fason hareketi eklenemedi.');
  return satir.id;
}

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
      WHERE ${makineli ? 'k.makine_id = ANY($1::int[])' : 'k.istasyon_id = $1 AND k.makine_id IS NULL'} AND k.bitis IS NULL
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

export function kullanimAc(
  db: Db, emirId: number, isEmriId: number | null, istasyonId: number, makineId: number | null, kisiId: number, an: string,
): Promise<unknown> {
  return db.sorgu(
    `INSERT INTO uretim_emirleri_makine_kullanimi (emir_id, is_emri_id, istasyon_id, makine_id, kisi_id, baslama)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz)`,
    [emirId, isEmriId, istasyonId, makineId, kisiId, an],
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

export type SayimKirilimi = 'istasyon' | 'kisi' | 'makine' | 'is_emri';
// Sayım satırında makine yoktur: sayım, zamanında emrin açık kullanımı olan makineye yazılır (bitişteki sayım dahil, bitirme
// sayımı yeri kapatmadan aynı anda yazılır). Açık kullanım yoksa (duraklatılmış ya da durdurulmuş iş) en son kapanan kullanıma
// yazılır (denetim #26: duraklatıp girilen adet makinesiz kalıyordu). Eşleşme iş emri üzerindendir: aynı emrin iki işlemi iki makinede
// aynı anda açıksa sayım yalnız kendi işleminin makinesine düşer; iki taraftan biri iş emirsizse (eski satır) eşleşme emir üzerinden
// kalır. Aynı işlem aynı anda n makinede sürüyorsa sayım tam sayı olarak eşit paylaştırılır, artan küçük kimlikli makineden başlayarak
// birer verilir: her sayımın makine payları toplamı girilen adede eşittir (#26).
const MAKINE_SAYIMI = `(SELECT p.id, p.emir_id, p.is_emri_id, p.kisi_id, p.istasyon_id, p.zaman, p.tur, p.makine_id,
         trunc(p.adet::numeric / p.n)::int
           + CASE WHEN p.r <= abs(p.adet - trunc(p.adet::numeric / p.n)::int * p.n) THEN sign(p.adet)::int ELSE 0 END AS adet
    FROM (SELECT s.id, s.emir_id, s.is_emri_id, s.kisi_id, s.istasyon_id, s.zaman, s.tur, s.adet, m.makine_id,
                 count(*) OVER (PARTITION BY s.id) AS n, row_number() OVER (PARTITION BY s.id ORDER BY m.makine_id) AS r
            FROM uretim_sayimi s
            JOIN LATERAL (
              SELECT DISTINCT a.makine_id FROM (
                SELECT k.makine_id, e.etkin, max(e.etkin) OVER () AS en
                  FROM uretim_emirleri_makine_kullanimi k
                  CROSS JOIN LATERAL (SELECT CASE WHEN k.bitis IS NULL OR k.bitis >= s.zaman THEN 'infinity'::timestamptz ELSE k.bitis END AS etkin) e
                 WHERE k.emir_id = s.emir_id AND (k.is_emri_id = s.is_emri_id OR k.is_emri_id IS NULL OR s.is_emri_id IS NULL)
                   AND k.makine_id IS NOT NULL AND k.baslama <= s.zaman) a
               WHERE a.etkin = a.en) m ON true) p) s`;

const KIRILIM: Record<SayimKirilimi, { kimlik: string; kaynak: string }> = {
  istasyon: { kimlik: 's.istasyon_id', kaynak: 'uretim_sayimi s' },
  kisi: { kimlik: 's.kisi_id', kaynak: 'uretim_sayimi s' },
  is_emri: { kimlik: 's.is_emri_id', kaynak: 'uretim_sayimi s' },
  makine: { kimlik: 's.makine_id', kaynak: MAKINE_SAYIMI },
};

// Yarı açık aralık [baslangic, bitis); düzeltme satırları dahil net toplam.
export function aralikAdetleriGetir(
  db: Db, kirilim: SayimKirilimi, idler: readonly number[], baslangic: string, bitis: string,
): Promise<{ id: number; saglam: number; hurda: number }[]> {
  const { kimlik, kaynak } = KIRILIM[kirilim];
  return db.sorgu(
    `SELECT ${kimlik} AS id,
            COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'saglam'), 0)::int AS saglam,
            COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'hurda'), 0)::int AS hurda
       FROM ${kaynak}
      WHERE ${kimlik} = ANY($1::int[]) AND s.zaman >= $2::timestamptz AND s.zaman < $3::timestamptz
      GROUP BY ${kimlik}`,
    [[...idler], baslangic, bitis],
  );
}

// Ardışık sınırlarla kurulan [sinirlar[g], sinirlar[g + 1]) aralıkları (gün kırılımı) tek sorguda; her aralık aralikAdetleriGetir ile aynıdır.
// Dış sınırlar dizinin aralık taramasıdır.
const ARALIKLAR = `SELECT (o - 1)::int AS gun, b AS bas, lead(b) OVER (ORDER BY o) AS bit FROM unnest($2::timestamptz[]) WITH ORDINALITY AS t(b, o)`;

export function gunlukAralikAdetleriGetir(
  db: Db, kirilim: SayimKirilimi, idler: readonly number[], sinirlar: readonly string[],
): Promise<{ gun: number; id: number; saglam: number; hurda: number }[]> {
  const { kimlik, kaynak } = KIRILIM[kirilim];
  return db.sorgu(
    `WITH g AS (${ARALIKLAR})
     SELECT g.gun, ${kimlik} AS id,
            COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'saglam'), 0)::int AS saglam,
            COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'hurda'), 0)::int AS hurda
       FROM ${kaynak} JOIN g ON s.zaman >= g.bas AND s.zaman < g.bit
      WHERE ${kimlik} = ANY($1::int[]) AND s.zaman >= ($2::timestamptz[])[1] AND s.zaman < ($2::timestamptz[])[cardinality($2::timestamptz[])]
      GROUP BY g.gun, ${kimlik}`,
    [[...idler], [...sinirlar]],
  );
}

// Aralıkların [baslangic, bitis) ile kesişen süresi, kimlik başına saniye. Açık aralık transaction anına kadar sayılır;
// pencereyle kesişmeyen kimlik sonuçta yoktur.
function kesisenSureler(
  db: Db, tablo: string, sutun: string, bas: string, son: string, idler: readonly number[], baslangic: string, bitis: string,
): Promise<{ id: number; saniye: number }[]> {
  return db.sorgu(
    `SELECT t.${sutun} AS id,
            floor(sum(extract(epoch FROM LEAST(COALESCE(t.${son}, now()), $3::timestamptz) - GREATEST(t.${bas}, $2::timestamptz))))::int AS saniye
       FROM ${tablo} t
      WHERE t.${sutun} = ANY($1::int[]) AND t.${bas} < $3::timestamptz AND COALESCE(t.${son}, now()) > $2::timestamptz
      GROUP BY t.${sutun}`,
    [[...idler], baslangic, bitis],
  );
}

export const katilimSureleriGetir = (db: Db, kisiIdleri: readonly number[], baslangic: string, bitis: string) =>
  kesisenSureler(db, 'uretim_emirleri_katilim', 'kisi_id', 'giris', 'cikis', kisiIdleri, baslangic, bitis);

export const makineSureleriGetir = (db: Db, makineIdleri: readonly number[], baslangic: string, bitis: string) =>
  kesisenSureler(db, 'uretim_emirleri_makine_kullanimi', 'makine_id', 'baslama', 'bitis', makineIdleri, baslangic, bitis);

// Makine kullanımlarının [baslangic, bitis) ile kesişen parçaları, makine ve başlama sırasıyla. Açık kullanım transaction anına kadardır.
export function makineKullanimAraliklariGetir(
  db: Db, makineIdleri: readonly number[], baslangic: string, bitis: string,
): Promise<{ id: number; baslangic: string; bitis: string }[]> {
  return db.sorgu(
    `SELECT k.makine_id AS id, ${ISO('GREATEST(k.baslama, $2::timestamptz)')} AS baslangic,
            ${ISO('LEAST(COALESCE(k.bitis, now()), $3::timestamptz)')} AS bitis
       FROM uretim_emirleri_makine_kullanimi k
      WHERE k.makine_id = ANY($1::int[]) AND k.baslama < $3::timestamptz AND COALESCE(k.bitis, now()) > $2::timestamptz
      ORDER BY k.makine_id, k.baslama, k.id`,
    [[...makineIdleri], baslangic, bitis],
  );
}

export interface MakineSayimAniSatiri {
  id: number;
  zaman: string;
  saglam: number;
  hurda: number;
  red: number;
  standartSaniye: number;
  suresizSaglam: number;
}

// Makine kırılımlı sayım, makine ve an başına (aralikAdetleriGetir ve standartSureleriGetir ile aynı yere düşer); kalite reddi ayrı
// sütundur, karar bekleyen sayılmaz. Standart süre yuvarlanmaz: toplayan taraf toplamı yuvarlar.
export function makineSayimAnlariGetir(
  db: Db, makineIdleri: readonly number[], baslangic: string, bitis: string,
): Promise<MakineSayimAniSatiri[]> {
  return db.sorgu<MakineSayimAniSatiri>(
    `SELECT s.makine_id AS id, ${ISO('s.zaman')} AS zaman,
            COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'saglam'), 0)::int AS saglam,
            COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'hurda'), 0)::int AS hurda,
            COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'red'), 0)::int AS red,
            COALESCE(sum(s.adet * i.birim_sure_dk * 60) FILTER (WHERE s.tur = 'saglam' AND i.birim_sure_dk IS NOT NULL), 0)::float8 AS "standartSaniye",
            COALESCE(sum(s.adet) FILTER (WHERE s.tur = 'saglam' AND i.birim_sure_dk IS NULL), 0)::int AS "suresizSaglam"
       FROM ${MAKINE_SAYIMI} LEFT JOIN uretim_emirleri_is_emri i ON i.id = s.is_emri_id
      WHERE s.makine_id = ANY($1::int[]) AND s.tur IN ('saglam', 'hurda', 'red') AND s.zaman >= $2::timestamptz AND s.zaman < $3::timestamptz
      GROUP BY s.makine_id, s.zaman
      ORDER BY s.makine_id, s.zaman`,
    [[...makineIdleri], baslangic, bitis],
  );
}

export function sonGirisleriGetir(db: Db, kirilim: SayimKirilimi, idler: readonly number[]): Promise<{ id: number; zaman: string }[]> {
  const { kimlik, kaynak } = KIRILIM[kirilim];
  return db.sorgu(
    `SELECT ${kimlik} AS id, ${ISO('max(s.zaman)')} AS zaman FROM ${kaynak} WHERE ${kimlik} = ANY($1::int[]) GROUP BY ${kimlik}`,
    [[...idler]],
  );
}

export interface CalisanIsEmriSatiri {
  emirId: number;
  id: number;
  opNo: number;
  ad: string;
  makineId: number | null;
}

// Emir başına en çok bir iş emri çalışır (tek çalışan kuralı); yine de sıraca ilki alınır.
export function calisanIsEmirleriGetir(db: Db, emirIdleri: readonly number[]): Promise<CalisanIsEmriSatiri[]> {
  return db.sorgu<CalisanIsEmriSatiri>(
    `SELECT DISTINCT ON (i.uretim_emri_id) i.uretim_emri_id AS "emirId", i.id, i.op_no AS "opNo", i.ad, i.makine_id AS "makineId"
       FROM uretim_emirleri_is_emri i WHERE i.uretim_emri_id = ANY($1::int[]) AND i.durum = 'calisiyor'
      ORDER BY i.uretim_emri_id, i.sira`,
    [[...emirIdleri]],
  );
}

export interface SonOlaySatiri {
  id: string;
  olay: SonOlayTuru;
  emirId: number;
  emirNo: string;
  parcaNo: string;
  isEmriId: number | null;
  opNo: number | null;
  isEmriAd: string | null;
  makineId: number | null;
  istasyonId: number;
  kisiId: number;
  adet: number | null;
  durusNedeniId: number | null;
  // Yalnız kalite kararında dolu olabilir; sütundan önceki karar satırında bilinmez (null).
  kararVerenId: number | null;
  zaman: string;
}

// Üç defter bütün emirlerde tek akış; kimlik kaynak harfi ve satır kimliğidir; karar satırı karar anıyla süzülür ve sıralanır. Süzgeç her kolda ayrıdır ki zaman dizini
// kullanılabilsin. Aynı anda başlatma en eski, bitirme en yeni sayılır (emir defteriyle aynı sıra).
export function sonOlaylarGetir(db: Db, sonra: string | null, sayi: number): Promise<SonOlaySatiri[]> {
  return db.sorgu<SonOlaySatiri>(
    `SELECT b.id, b.olay, e.id AS "emirId", e.emir_no AS "emirNo", e.parca_no AS "parcaNo",
            i.id AS "isEmriId", i.op_no AS "opNo", i.ad AS "isEmriAd", i.makine_id AS "makineId",
            b.istasyon_id AS "istasyonId", b.kisi_id AS "kisiId", b.adet, b.durus_nedeni_id AS "durusNedeniId",
            b.karar_veren_kisi_id AS "kararVerenId", ${ISO('b.an')} AS zaman
       FROM (
         SELECT 'k' || k.id AS id, k.emir_id, k.is_emri_id, k.istasyon_id, k.kisi_id, k.olay, k.saglam_adet AS adet,
                NULL::int AS durus_nedeni_id, NULL::int AS karar_veren_kisi_id, k.zaman AS an, CASE k.olay WHEN 'baslat' THEN 0 ELSE 2 END AS sira,
                k.id AS satir
           FROM uretim_kaydi k WHERE $1::timestamptz IS NULL OR k.zaman > $1::timestamptz
         UNION ALL
         SELECT 'o' || o.id, o.emir_id, o.is_emri_id, o.istasyon_id, o.kisi_id, o.olay, NULL, o.durus_nedeni_id, NULL, o.zaman, 1, o.id
           FROM uretim_olayi o WHERE $1::timestamptz IS NULL OR o.zaman > $1::timestamptz
         UNION ALL
         SELECT 's' || s.id, s.emir_id, s.is_emri_id, s.istasyon_id, s.kisi_id,
                CASE WHEN s.tur = 'hurda' THEN 'hurda' WHEN s.tur = 'red' THEN 'kalite_red' WHEN ${KARAR_SATIRI} THEN 'kalite_onay'
                     WHEN s.duzeltme THEN 'duzeltme' ELSE 'saglam' END,
                s.adet, NULL, s.karar_veren_kisi_id, COALESCE(s.karar_zamani, s.zaman), 1, s.id
           FROM uretim_sayimi s WHERE s.tur IN ('saglam', 'hurda', 'red')
            AND ($1::timestamptz IS NULL OR s.zaman > $1::timestamptz OR s.karar_zamani > $1::timestamptz)
       ) b
       JOIN uretim_emri e ON e.id = b.emir_id
       LEFT JOIN uretim_emirleri_is_emri i ON i.id = b.is_emri_id
      ORDER BY b.an DESC, b.sira DESC, b.satir DESC
      LIMIT $2`,
    [sonra, sayi],
  );
}

// Kişinin şu an çalıştığı istasyon: açık makine kullanımı ya da açık katılımdan en son başlayanı; açık iş yoksa null.
export async function kisininAcikIstasyonu(db: Db, kisiId: number): Promise<number | null> {
  return (await db.tek<{ istasyonId: number }>(
    `SELECT istasyon_id AS "istasyonId" FROM (
       SELECT istasyon_id, baslama AS zaman FROM uretim_emirleri_makine_kullanimi WHERE kisi_id = $1 AND bitis IS NULL
       UNION ALL
       SELECT istasyon_id, giris AS zaman FROM uretim_emirleri_katilim WHERE kisi_id = $1 AND cikis IS NULL
     ) acik ORDER BY zaman DESC LIMIT 1`, [kisiId]))?.istasyonId ?? null;
}

/* ---------------- kişinin özeti (kart #1295, Operatör Özetim) ---------------- */

export interface KisiIsEmriSatiri {
  isEmriId: number | null;
  uretimEmriId: number;
  emirNo: string;
  malzemeNo: number | null;
  parcaNo: string;
  parcaAd: string;
  opNo: number | null;
  adimAdi: string | null;
  istasyonId: number | null;
  makineId: number | null;
  durum: 'bekliyor' | 'calisiyor' | 'tamam';
  saglam: number | null;
  hurda: number | null;
  saniye: number | null;
  birimSureDk: string | null;
  adet: number;
}

// Kişinin [baslangic, bitis) içinde sayımı ya da katılımı olan iş emirleri; en son çalışılan önce. İş emirsiz eski emirde
// durum emrinkinden eşlenir. Sayımı olmayan satırda adetler, katılımı olmayanda süre null'dır.
export function kisininIsEmirleriGetir(db: Db, kisiId: number, baslangic: string, bitis: string): Promise<KisiIsEmriSatiri[]> {
  return db.sorgu(
    `WITH say AS (
       SELECT s.emir_id, COALESCE(s.is_emri_id, 0) AS ie, sum(s.adet) FILTER (WHERE s.tur = 'saglam') AS saglam,
              sum(s.adet) FILTER (WHERE s.tur = 'hurda') AS hurda, max(s.zaman) AS son
         FROM uretim_sayimi s WHERE s.kisi_id = $1 AND s.zaman >= $2::timestamptz AND s.zaman < $3::timestamptz GROUP BY 1, 2
     ), kat AS (
       SELECT k.emir_id, COALESCE(k.is_emri_id, 0) AS ie,
              floor(sum(extract(epoch FROM LEAST(COALESCE(k.cikis, now()), $3::timestamptz) - GREATEST(k.giris, $2::timestamptz)))) AS saniye,
              max(LEAST(COALESCE(k.cikis, now()), $3::timestamptz)) AS son
         FROM uretim_emirleri_katilim k
        WHERE k.kisi_id = $1 AND k.giris < $3::timestamptz AND COALESCE(k.cikis, now()) > $2::timestamptz GROUP BY 1, 2
     ), bir AS (
       SELECT COALESCE(say.emir_id, kat.emir_id) AS emir_id, NULLIF(COALESCE(say.ie, kat.ie), 0) AS is_emri_id,
              say.saglam, say.hurda, kat.saniye, GREATEST(say.son, kat.son) AS son
         FROM say FULL JOIN kat ON kat.emir_id = say.emir_id AND kat.ie = say.ie
     )
     SELECT bir.is_emri_id AS "isEmriId", e.id AS "uretimEmriId", e.emir_no AS "emirNo", e.malzeme_no AS "malzemeNo",
            e.parca_no AS "parcaNo", e.parca_ad AS "parcaAd", i.op_no AS "opNo", i.ad AS "adimAdi",
            CASE WHEN i.id IS NULL THEN e.istasyon_id ELSE i.istasyon_id END AS "istasyonId", i.makine_id AS "makineId",
            COALESCE(i.durum, CASE e.durum WHEN 'basladi' THEN 'calisiyor' WHEN 'bitti' THEN 'tamam' ELSE 'bekliyor' END) AS durum,
            bir.saglam::int AS saglam, bir.hurda::int AS hurda, bir.saniye::int AS saniye, i.birim_sure_dk::text AS "birimSureDk", e.adet
       FROM bir JOIN uretim_emri e ON e.id = bir.emir_id LEFT JOIN uretim_emirleri_is_emri i ON i.id = bir.is_emri_id
      ORDER BY bir.son DESC, e.id, i.sira`,
    [kisiId, baslangic, bitis],
  );
}

// kisininIsEmirleriGetir'in gün kırılımlı hâli: [sinirlar[g], sinirlar[g + 1]) aralıklarının her biri tek tek okumayla aynı satırları
// aynı sırayla verir; satır hangi aralığa aitse gun onu söyler.
export function kisininGunlukIsEmirleriGetir(
  db: Db, kisiId: number, sinirlar: readonly string[],
): Promise<(KisiIsEmriSatiri & { gun: number })[]> {
  return db.sorgu(
    `WITH g AS (${ARALIKLAR}), say AS (
       SELECT g.gun, s.emir_id, COALESCE(s.is_emri_id, 0) AS ie, sum(s.adet) FILTER (WHERE s.tur = 'saglam') AS saglam,
              sum(s.adet) FILTER (WHERE s.tur = 'hurda') AS hurda, max(s.zaman) AS son
         FROM uretim_sayimi s JOIN g ON s.zaman >= g.bas AND s.zaman < g.bit
        WHERE s.kisi_id = $1 AND s.zaman >= ($2::timestamptz[])[1] AND s.zaman < ($2::timestamptz[])[cardinality($2::timestamptz[])]
        GROUP BY 1, 2, 3
     ), kat AS (
       SELECT g.gun, k.emir_id, COALESCE(k.is_emri_id, 0) AS ie,
              floor(sum(extract(epoch FROM LEAST(COALESCE(k.cikis, now()), g.bit) - GREATEST(k.giris, g.bas)))) AS saniye,
              max(LEAST(COALESCE(k.cikis, now()), g.bit)) AS son
         FROM uretim_emirleri_katilim k JOIN g ON k.giris < g.bit AND COALESCE(k.cikis, now()) > g.bas
        WHERE k.kisi_id = $1 AND k.giris < ($2::timestamptz[])[cardinality($2::timestamptz[])] AND COALESCE(k.cikis, now()) > ($2::timestamptz[])[1]
        GROUP BY 1, 2, 3
     ), bir AS (
       SELECT COALESCE(say.gun, kat.gun) AS gun, COALESCE(say.emir_id, kat.emir_id) AS emir_id, NULLIF(COALESCE(say.ie, kat.ie), 0) AS is_emri_id,
              say.saglam, say.hurda, kat.saniye, GREATEST(say.son, kat.son) AS son
         FROM say FULL JOIN kat ON kat.gun = say.gun AND kat.emir_id = say.emir_id AND kat.ie = say.ie
     )
     SELECT bir.gun, bir.is_emri_id AS "isEmriId", e.id AS "uretimEmriId", e.emir_no AS "emirNo", e.malzeme_no AS "malzemeNo",
            e.parca_no AS "parcaNo", e.parca_ad AS "parcaAd", i.op_no AS "opNo", i.ad AS "adimAdi",
            CASE WHEN i.id IS NULL THEN e.istasyon_id ELSE i.istasyon_id END AS "istasyonId", i.makine_id AS "makineId",
            COALESCE(i.durum, CASE e.durum WHEN 'basladi' THEN 'calisiyor' WHEN 'bitti' THEN 'tamam' ELSE 'bekliyor' END) AS durum,
            bir.saglam::int AS saglam, bir.hurda::int AS hurda, bir.saniye::int AS saniye, i.birim_sure_dk::text AS "birimSureDk", e.adet
       FROM bir JOIN uretim_emri e ON e.id = bir.emir_id LEFT JOIN uretim_emirleri_is_emri i ON i.id = bir.is_emri_id
      ORDER BY bir.gun, bir.son DESC, e.id, i.sira`,
    [kisiId, [...sinirlar]],
  );
}

// Net hurda (düzeltme dahil) neden başına; net sıfır olan neden yoktur.
export function kisininHurdalariGetir(db: Db, kisiId: number, baslangic: string, bitis: string): Promise<{ hurdaNedeniId: number; adet: number }[]> {
  return db.sorgu(
    `SELECT s.hurda_nedeni_id AS "hurdaNedeniId", sum(s.adet)::int AS adet
       FROM uretim_sayimi s
      WHERE s.kisi_id = $1 AND s.tur = 'hurda' AND s.hurda_nedeni_id IS NOT NULL AND s.zaman >= $2::timestamptz AND s.zaman < $3::timestamptz
      GROUP BY s.hurda_nedeni_id HAVING sum(s.adet) <> 0
      ORDER BY adet DESC, s.hurda_nedeni_id`,
    [kisiId, baslangic, bitis],
  );
}

// Kişi başına net sağlamın iş emri birim süresiyle standart süresi (saniye, yuvarlanmış) ve birim süresi olmayan iş emrindeki sağlam.
export function standartSureleriGetir(
  db: Db, kirilim: SayimKirilimi, idler: readonly number[], baslangic: string, bitis: string,
): Promise<{ id: number; standartSaniye: number; suresizSaglam: number }[]> {
  const { kimlik, kaynak } = KIRILIM[kirilim];
  return db.sorgu(
    `SELECT ${kimlik} AS id,
            round(COALESCE(sum(s.adet * i.birim_sure_dk * 60) FILTER (WHERE i.birim_sure_dk IS NOT NULL), 0))::int AS "standartSaniye",
            COALESCE(sum(s.adet) FILTER (WHERE i.birim_sure_dk IS NULL), 0)::int AS "suresizSaglam"
       FROM ${kaynak} LEFT JOIN uretim_emirleri_is_emri i ON i.id = s.is_emri_id
      WHERE ${kimlik} = ANY($1::int[]) AND s.tur = 'saglam' AND s.zaman >= $2::timestamptz AND s.zaman < $3::timestamptz
      GROUP BY ${kimlik}`,
    [[...idler], baslangic, bitis],
  );
}

export function isEmriPlanBilgileriGetir(db: Db, isEmriIdleri: readonly number[]): Promise<{
  id: number; uretimEmriId: number; opNo: number; adet: number; ayarSureDk: string | null; birimSureDk: string | null;
  makineId: number | null; kisiId: number | null; fasonFirmaId: number | null; istasyonId: number | null;
}[]> {
  return db.sorgu(
    `SELECT i.id, i.uretim_emri_id AS "uretimEmriId", i.op_no AS "opNo", e.adet, i.ayar_suresi_dk::text AS "ayarSureDk",
            i.birim_sure_dk::text AS "birimSureDk", i.makine_id AS "makineId", i.kisi_id AS "kisiId", i.fason_firma_id AS "fasonFirmaId", i.istasyon_id AS "istasyonId"
       FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id
      WHERE i.id = ANY($1::int[])`,
    [[...isEmriIdleri]],
  );
}

// Üretim anomalisi ve plan sapması (kart 764, 782): iş emrinin gerçek zamanları ve çalıştığı makineler. Ayar başı iş emrine bağlı ilk
// ayar olayıdır; iş emri bağı boş eski olay ve kullanım satırı sayılmaz (hangi adıma ait olduğu bilinmez).
export interface IsEmriZamanSatiri {
  isEmriId: number; uretimEmriId: number; opNo: number; durum: 'bekliyor' | 'calisiyor' | 'tamam'; ayarBasi: string | null; baslama: string | null;
  bitis: string | null; bagimlilik: 'bagimsiz' | 'bekleyen' | 'akisli'; devirAdedi: number | null; emirTeslim: string | null;
  makineler: { makineId: number | null; baslama: string; bitis: string | null }[];
}
export function isEmriZamanlariGetir(db: Db, isEmriIdleri: readonly number[]): Promise<IsEmriZamanSatiri[]> {
  return db.sorgu(
    `SELECT i.id AS "isEmriId", i.uretim_emri_id AS "uretimEmriId", i.op_no AS "opNo", i.durum,
            (SELECT ${ISO('min(o.zaman)')} FROM uretim_olayi o WHERE o.is_emri_id = i.id AND o.olay = 'ayar') AS "ayarBasi",
            ${ISO('i.baslama')} AS baslama, ${ISO('i.bitis')} AS bitis, i.bagimlilik, i.devir_adedi AS "devirAdedi", ${TARIH('e.teslim')} AS "emirTeslim",
            COALESCE((SELECT json_agg(json_build_object('makineId', k.makine_id, 'baslama', ${ISO('k.baslama')}, 'bitis', ${ISO('k.bitis')}) ORDER BY k.baslama, k.id)
                        FROM uretim_emirleri_makine_kullanimi k WHERE k.is_emri_id = i.id), '[]'::json) AS makineler
       FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id
      WHERE i.id = ANY($1::int[])
      ORDER BY i.id`,
    [[...isEmriIdleri]],
  );
}

// Akış süresi (kart #1338): emrin bütün zaman damgaları, yalnız okuma. Olaylar iki defterden (başlat/bitir ve duruş/ayar) zaman sırasıyla birleşir.
export interface AkisEmirSatiri {
  id: number; emirNo: string; malzemeNo: number | null; adet: number; durum: EmirDurumu;
  acilma: string; baslama: string | null; bitis: string | null; teslim: string | null;
}
export interface AkisIsEmriSatiri {
  id: number; opNo: number; sira: number; istasyonId: number | null; fasonFirmaId: number | null; terminGun: number | null;
  durum: 'bekliyor' | 'calisiyor' | 'tamam'; baslama: string | null; bitis: string | null; birimSureDk: string | null; ayarSuresiDk: string | null;
  // Akış, adım önündeki beklemeyi bağımlılığa göre ölçer: akışlıda girdi devir adedi kadar sağlam çıkınca hazırdır.
  bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz'; devirAdedi: number | null;
}
export interface AkisOlaySatiri {
  isEmriId: number | null; zaman: string; olay: 'baslat' | 'bitir' | 'duraklat' | 'durdur' | 'devam' | 'ayar';
  durusNedeniId: number | null; istasyonId: number | null; kisiId: number;
}
// Refakat kartıyla sayılmışsa kartı (kart #708: Akış Süresi kartın akışını kartla sayılanlardan ölçer); kartsız sayımda null.
export interface AkisSayimSatiri {
  isEmriId: number | null; zaman: string; tur: 'saglam' | 'hurda'; adet: number; duzeltme: boolean; refakatPartisiId: number | null; kisiId: number; hurdaNedeniId: number | null;
}
export interface AkisFasonSatiri { isEmriId: number; yon: 'gidis' | 'donus'; zaman: string; adet: number; hurdaAdet: number | null }

export function akisEmriGetir(db: Db, emirId: number): Promise<AkisEmirSatiri | null> {
  return db.tek<AkisEmirSatiri>(
    `SELECT e.id, e.emir_no AS "emirNo", e.malzeme_no AS "malzemeNo", e.adet, e.durum, ${ISO('e.acilma')} AS acilma,
            ${NULLU_ISO('e.baslama')} AS baslama, ${NULLU_ISO('e.bitis')} AS bitis, ${TARIH('e.teslim')} AS teslim
       FROM uretim_emri e WHERE e.id = $1`,
    [emirId],
  );
}

export function akisIsEmirleriGetir(db: Db, emirId: number): Promise<AkisIsEmriSatiri[]> {
  return db.sorgu<AkisIsEmriSatiri>(
    `SELECT i.id, i.op_no AS "opNo", i.sira, i.istasyon_id AS "istasyonId", i.fason_firma_id AS "fasonFirmaId", i.termin_gun AS "terminGun",
            i.durum, ${NULLU_ISO('i.baslama')} AS baslama, ${NULLU_ISO('i.bitis')} AS bitis,
            i.birim_sure_dk::text AS "birimSureDk", i.ayar_suresi_dk::text AS "ayarSuresiDk", i.bagimlilik, i.devir_adedi AS "devirAdedi"
       FROM uretim_emirleri_is_emri i WHERE i.uretim_emri_id = $1 ORDER BY i.sira`,
    [emirId],
  );
}

export function akisOlaylariGetir(db: Db, emirId: number): Promise<AkisOlaySatiri[]> {
  return db.sorgu<AkisOlaySatiri>(
    `SELECT "isEmriId", ${ISO('zaman')} AS zaman, olay, "durusNedeniId", "istasyonId", "kisiId" FROM (
       SELECT k.is_emri_id AS "isEmriId", k.zaman, k.olay, NULL::int AS "durusNedeniId", k.istasyon_id AS "istasyonId", k.kisi_id AS "kisiId", 0 AS defter, k.id
         FROM uretim_kaydi k WHERE k.emir_id = $1
       UNION ALL
       SELECT o.is_emri_id, o.zaman, o.olay, o.durus_nedeni_id, o.istasyon_id, o.kisi_id, 1, o.id FROM uretim_olayi o WHERE o.emir_id = $1
     ) t ORDER BY t.zaman, t.defter, t.id`,
    [emirId],
  );
}

export function akisSayimlariGetir(db: Db, emirId: number): Promise<AkisSayimSatiri[]> {
  return db.sorgu<AkisSayimSatiri>(
    `SELECT s.is_emri_id AS "isEmriId", ${ISO('s.zaman')} AS zaman, s.tur, s.adet, s.duzeltme, s.refakat_partisi_id AS "refakatPartisiId",
            s.kisi_id AS "kisiId", s.hurda_nedeni_id AS "hurdaNedeniId"
       FROM uretim_sayimi s WHERE s.emir_id = $1 AND s.tur IN ('saglam', 'hurda') ORDER BY s.zaman, s.id`,
    [emirId],
  );
}

export function akisFasonGetir(db: Db, emirId: number): Promise<AkisFasonSatiri[]> {
  return db.sorgu<AkisFasonSatiri>(
    `SELECT h.is_emri_id AS "isEmriId", h.yon, ${ISO('h.zaman')} AS zaman, h.adet, h.hurda_adet AS "hurdaAdet"
       FROM uretim_emirleri_fason_hareketi h JOIN uretim_emirleri_is_emri i ON i.id = h.is_emri_id
      WHERE i.uretim_emri_id = $1 ORDER BY h.zaman, h.id`,
    [emirId],
  );
}

// Sayımın stok yansıması (terminal üretim girişi): adımın yeri (önceki adımlar sırayla ve son adım), girdileri ve emrin taşıdığı malzeme. Taşınan malzeme
// statü kuralıyla aynıdır: ilk adımın ilk girdisi (bileşen kayıt sırası); alt partide kök emrin ilk adımı.
export interface AdimUretimSatiri { uretimEmriId: number; opNo: number; oncekiOpNolari: number[]; sonAdim: boolean }
export function adimUretimSatiriGetir(db: Db, isEmriId: number): Promise<AdimUretimSatiri | null> {
  return db.tek<AdimUretimSatiri>(
    `SELECT i.uretim_emri_id AS "uretimEmriId", i.op_no AS "opNo",
            ARRAY(SELECT o.op_no FROM uretim_emirleri_is_emri o WHERE o.uretim_emri_id = i.uretim_emri_id AND o.sira < i.sira ORDER BY o.sira) AS "oncekiOpNolari",
            NOT EXISTS (SELECT 1 FROM uretim_emirleri_is_emri s WHERE s.uretim_emri_id = i.uretim_emri_id AND s.sira > i.sira) AS "sonAdim"
       FROM uretim_emirleri_is_emri i WHERE i.id = $1`,
    [isEmriId],
  );
}
export function adimGirdileriGetir(db: Db, isEmriId: number): Promise<{ malzemeNo: number; miktar: string }[]> {
  return db.sorgu(
    'SELECT malzeme_no AS "malzemeNo", miktar::text AS miktar FROM uretim_emirleri_is_emri_bileseni WHERE is_emri_id = $1 ORDER BY id', [isEmriId],
  );
}
export function tasinanGirdiGetir(db: Db, uretimEmriId: number): Promise<{ malzemeNo: number; miktar: string } | null> {
  return db.tek(
    `WITH RECURSIVE kok AS (
       SELECT id, ust_emir_id FROM uretim_emri WHERE id = $1
       UNION ALL SELECT e.id, e.ust_emir_id FROM uretim_emri e JOIN kok ON e.id = kok.ust_emir_id
     )
     SELECT b.malzeme_no AS "malzemeNo", b.miktar::text AS miktar
       FROM kok JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = kok.id JOIN uretim_emirleri_is_emri_bileseni b ON b.is_emri_id = i.id
      WHERE kok.ust_emir_id IS NULL
      ORDER BY i.sira, b.id LIMIT 1`,
    [uretimEmriId],
  );
}

export interface BitenIsEmriSatiri {
  isEmriId: number;
  uretimEmriId: number;
  istasyonId: number | null;
  saglamAdet: number | null;
  bitis: string;
}

// Pencerede [baslangic, bitis) biten iş emirleri, bitiş sırasıyla; istasyon listesi verilirse yalnız onlardaki.
export function bitenIsEmirleriGetir(db: Db, baslangic: string, bitis: string, istasyonIdleri: readonly number[] | null): Promise<BitenIsEmriSatiri[]> {
  return db.sorgu(
    `SELECT i.id AS "isEmriId", i.uretim_emri_id AS "uretimEmriId", i.istasyon_id AS "istasyonId", i.saglam_adet AS "saglamAdet",
            ${ISO('i.bitis')} AS bitis
       FROM uretim_emirleri_is_emri i
      WHERE i.durum = 'tamam' AND i.bitis >= $1::timestamptz AND i.bitis < $2::timestamptz
        AND ($3::int[] IS NULL OR i.istasyon_id = ANY($3::int[]))
      ORDER BY i.bitis, i.id`,
    [baslangic, bitis, istasyonIdleri === null ? null : [...istasyonIdleri]],
  );
}

export interface FasonGecmisSatiri {
  isEmriId: number;
  malzemeNo: number | null;
  operasyonTipiId: number;
  firmaId: number;
  adet: number;
  ilkGidis: string;
  sonDonus: string;
  terminGun: number | null;
}

// Satın almanın fason süresi tahmini (CA-2): en az bir gidişi ve dönüşü olan fason iş emirleri; bitmiş ve arşivdeki dahil, iptal emir hariç.
export function fasonGecmisiGetir(db: Db, secim: { firmaId: number | null; malzemeNo: number | null; sonGun: number | null }): Promise<FasonGecmisSatiri[]> {
  return db.sorgu<FasonGecmisSatiri>(
    `SELECT i.id AS "isEmriId", e.malzeme_no AS "malzemeNo", i.operasyon_tipi_id AS "operasyonTipiId", i.fason_firma_id AS "firmaId",
       h.gonderilen AS adet, ${ISO('h.ilk_gidis')} AS "ilkGidis", ${ISO('h.son_donus')} AS "sonDonus", i.termin_gun AS "terminGun"
     FROM uretim_emirleri_is_emri i
     JOIN uretim_emri e ON e.id = i.uretim_emri_id
     JOIN LATERAL (
       SELECT min(f.zaman) FILTER (WHERE f.yon = 'gidis') AS ilk_gidis, max(f.zaman) FILTER (WHERE f.yon = 'donus') AS son_donus,
         (sum(f.adet) FILTER (WHERE f.yon = 'gidis'))::int AS gonderilen
       FROM uretim_emirleri_fason_hareketi f WHERE f.is_emri_id = i.id
     ) h ON h.ilk_gidis IS NOT NULL AND h.son_donus IS NOT NULL
     WHERE i.fason_firma_id IS NOT NULL AND e.durum <> 'iptal'
       AND ($1::int IS NULL OR i.fason_firma_id = $1) AND ($2::int IS NULL OR e.malzeme_no = $2)
       AND ($3::int IS NULL OR h.ilk_gidis >= now() - make_interval(days => $3))
     ORDER BY i.id`,
    [secim.firmaId, secim.malzemeNo, secim.sonGun],
  );
}

// Proje maliyeti (197 a): projenin emirlerinin iş emirleri, iptal edilmiş emir hariç (arşivdeki dahil: maliyeti projede kalır).
export interface ProjeIsEmriSatiri {
  isEmriId: number; uretimEmriId: number; emirNo: string; opNo: number; istasyonId: number | null;
  makineId: number | null; kisiId: number | null; fasonFirmaId: number | null; adet: number; saglam: number | null;
  birimSureDk: string | null; ayarSureDk: string | null; durum: 'bekliyor' | 'calisiyor' | 'tamam'; emirDurumu: EmirDurumu; bitis: string | null;
  siparisSatiriId: number | null;
}
export function projeninIsEmirleriGetir(db: Db, projeId: number): Promise<ProjeIsEmriSatiri[]> {
  return db.sorgu(
    `SELECT i.id AS "isEmriId", e.id AS "uretimEmriId", e.emir_no AS "emirNo", i.op_no AS "opNo", i.istasyon_id AS "istasyonId",
            i.makine_id AS "makineId", i.kisi_id AS "kisiId", i.fason_firma_id AS "fasonFirmaId", e.adet, i.saglam_adet AS saglam,
            i.birim_sure_dk::text AS "birimSureDk", i.ayar_suresi_dk::text AS "ayarSureDk", i.durum, e.durum AS "emirDurumu", ${NULLU_ISO('i.bitis')} AS bitis,
            e.siparis_satiri_id AS "siparisSatiriId"
       FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id
      WHERE e.proje_id = $1 AND e.durum <> 'iptal'
      ORDER BY e.id, i.sira`,
    [projeId],
  );
}

// Gerçekleşen süreler (saniye): işleme makine kullanımından, ayar iş emrinin son ayar olayından ilk kullanımına (kullanım yoksa şimdiye;
// ayar olayı yoksa null, sıfır uydurulmaz), katılım kişi başına; açık aralık şimdiye kadar sayılır.
export function isEmriSureleriGetir(db: Db, idler: readonly number[]): Promise<{ isEmriId: number; islemeSn: number; ayarSn: number | null; katilim: { kisiId: number; saniye: number }[] }[]> {
  return db.sorgu(
    `WITH ie AS (SELECT unnest($1::int[]) AS id),
          ku AS (SELECT k.is_emri_id AS id, sum(extract(epoch FROM COALESCE(k.bitis, clock_timestamp()) - k.baslama)) AS sn, min(k.baslama) AS ilk
                   FROM uretim_emirleri_makine_kullanimi k WHERE k.is_emri_id = ANY($1::int[]) GROUP BY k.is_emri_id),
          ay AS (SELECT o.is_emri_id AS id, max(o.zaman) AS bas FROM uretim_olayi o LEFT JOIN ku ON ku.id = o.is_emri_id
                  WHERE o.is_emri_id = ANY($1::int[]) AND o.olay = 'ayar' AND o.zaman <= COALESCE(ku.ilk, clock_timestamp()) GROUP BY o.is_emri_id),
          ka AS (SELECT is_emri_id AS id, kisi_id, sum(extract(epoch FROM COALESCE(cikis, clock_timestamp()) - giris)) AS sn
                   FROM uretim_emirleri_katilim WHERE is_emri_id = ANY($1::int[]) GROUP BY is_emri_id, kisi_id)
     SELECT ie.id AS "isEmriId", round(COALESCE(ku.sn, 0))::int AS "islemeSn",
            round(extract(epoch FROM COALESCE(ku.ilk, clock_timestamp()) - ay.bas))::int AS "ayarSn",
            COALESCE((SELECT json_agg(json_build_object('kisiId', ka.kisi_id, 'saniye', round(ka.sn)::int) ORDER BY ka.kisi_id) FROM ka WHERE ka.id = ie.id), '[]') AS katilim
       FROM ie JOIN uretim_emirleri_is_emri i ON i.id = ie.id
       LEFT JOIN ku ON ku.id = ie.id LEFT JOIN ay ON ay.id = ie.id`,
    [[...new Set(idler)]],
  );
}


// Hazırlık muafiyeti (264 a): yalnız ekleme; aynı madde aynı yerde bir kez (benzersiz dizin).
export interface MuafiyetSatiri { madde: 'cnc' | 'ozel-proses'; isEmriId: number | null; kisiId: number; gerekce: string; zaman: string }
export function muafiyetler(db: Db, uretimEmriId: number): Promise<MuafiyetSatiri[]> {
  return db.sorgu<MuafiyetSatiri>(
    `SELECT madde, is_emri_id AS "isEmriId", kisi_id AS "kisiId", gerekce, ${ISO('zaman')} AS zaman FROM uretim_emirleri_hazirlik_muafiyeti
      WHERE uretim_emri_id = $1 ORDER BY id`, [uretimEmriId],
  );
}
export function muafiyetEkle(db: Db, m: { uretimEmriId: number; isEmriId: number | null; madde: string; kisiId: number; gerekce: string }): Promise<unknown> {
  return db.sorgu(
    'INSERT INTO uretim_emirleri_hazirlik_muafiyeti (uretim_emri_id, is_emri_id, madde, kisi_id, gerekce) VALUES ($1, $2, $3, $4, $5)',
    [m.uretimEmriId, m.isEmriId, m.madde, m.kisiId, m.gerekce],
  );
}

// Kart başına adım sayımı (Soru 136 a): toplam, adımın tükettiği bütün parça (sağlam, karar bekleyen, red, hurda); sağlam, sonraki adıma geçen.
export function kartSayimlariGetir(db: Db, emirId: number, kartIdleri: readonly number[]): Promise<{ isEmriId: number; kartId: number; saglam: number; toplam: number }[]> {
  return db.sorgu(
    `SELECT is_emri_id AS "isEmriId", refakat_partisi_id AS "kartId",
            coalesce(sum(adet) FILTER (WHERE tur = 'saglam'), 0)::int AS saglam, sum(adet)::int AS toplam
       FROM uretim_sayimi WHERE emir_id = $1 AND refakat_partisi_id = ANY($2::int[]) AND is_emri_id IS NOT NULL
      GROUP BY is_emri_id, refakat_partisi_id`,
    [emirId, [...kartIdleri]],
  );
}

/* ---------------- paralel adım (kart 639) ---------------- */

export interface AdimSayaci { isEmriId: number; saglam: number; hurda: number; kararBekliyor: number; red: number }

// Adım başına net sayaç (düzeltme dahil); sayımı olmayan adım satır vermez.
export function adimSayaclariGetir(db: Db, isEmriIdleri: readonly number[]): Promise<AdimSayaci[]> {
  if (isEmriIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu<AdimSayaci>(
    `SELECT is_emri_id AS "isEmriId",
            COALESCE(sum(adet) FILTER (WHERE tur = 'saglam'), 0)::int AS saglam,
            COALESCE(sum(adet) FILTER (WHERE tur = 'hurda'), 0)::int AS hurda,
            COALESCE(sum(adet) FILTER (WHERE tur = 'karar_bekliyor'), 0)::int AS "kararBekliyor",
            COALESCE(sum(adet) FILTER (WHERE tur = 'red'), 0)::int AS red
       FROM uretim_sayimi WHERE is_emri_id = ANY($1::int[]) GROUP BY is_emri_id`,
    [[...isEmriIdleri]],
  );
}

// Adımın son olayı (ayar hariç): adımın çalışma hâli buradan türer. İş emirsiz eski emirde adım null'dır.
export function adimSonOlayi(db: Db, emirId: number, isEmriId: number | null): Promise<OlaySatiri | null> {
  return db.tek<OlaySatiri>(
    `SELECT emir_id AS "emirId", olay, durus_nedeni_id AS "durusNedeniId", ${ISO('zaman')} AS zaman
       FROM uretim_olayi WHERE emir_id = $1 AND is_emri_id IS NOT DISTINCT FROM $2::int AND olay <> 'ayar' ORDER BY id DESC LIMIT 1`,
    [emirId, isEmriId],
  );
}

// Emir başlamış kalırken istasyonu öncü adıma geçer (bir adım bitti, öteki sürüyor).
export function emirIstasyonunuYaz(db: Db, id: number, istasyonId: number): Promise<unknown> {
  return db.sorgu('UPDATE uretim_emri SET istasyon_id = $2, surum = surum + 1 WHERE id = $1', [id, istasyonId]);
}

export interface AdimDurumSatiri {
  id: number;
  emirId: number;
  sira: number;
  opNo: number;
  ad: string;
  istasyonId: number | null;
  makineId: number | null;
  fasonFirmaId: number | null;
  durum: 'bekliyor' | 'calisiyor' | 'tamam';
  bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz';
  devirAdedi: number | null;
  saglamAdet: number | null;
  saglam: number;
  hurda: number;
  kararBekliyor: number;
  sonOlay: 'duraklat' | 'durdur' | 'devam' | null;
  // Bölünmüş ya da kol emir: adıma giren parti hesabı ister, listede eksik gösterilmez.
  partili: boolean;
}

// Emirlerin bütün adımları, sayaçları ve son olaylarıyla tek sorguda (liste okuması sorgu sayısını adım sayısıyla büyütmez).
export function adimDurumlariGetir(db: Db, emirIdleri: readonly number[]): Promise<AdimDurumSatiri[]> {
  if (emirIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu<AdimDurumSatiri>(
    `SELECT i.id, i.uretim_emri_id AS "emirId", i.sira, i.op_no AS "opNo", i.ad, i.istasyon_id AS "istasyonId", i.makine_id AS "makineId",
            i.fason_firma_id AS "fasonFirmaId", i.durum, i.bagimlilik, i.devir_adedi AS "devirAdedi", i.saglam_adet AS "saglamAdet",
            COALESCE(s.saglam, 0)::int AS saglam, COALESCE(s.hurda, 0)::int AS hurda, COALESCE(s.kb, 0)::int AS "kararBekliyor",
            (SELECT o.olay FROM uretim_olayi o WHERE o.is_emri_id = i.id AND o.olay <> 'ayar' ORDER BY o.id DESC LIMIT 1) AS "sonOlay",
            (e.ust_emir_id IS NOT NULL OR EXISTS (SELECT 1 FROM uretim_emri a WHERE a.ust_emir_id = e.id)) AS partili
       FROM uretim_emirleri_is_emri i
       JOIN uretim_emri e ON e.id = i.uretim_emri_id
       LEFT JOIN LATERAL (
         SELECT sum(adet) FILTER (WHERE tur = 'saglam') AS saglam, sum(adet) FILTER (WHERE tur = 'hurda') AS hurda,
                sum(adet) FILTER (WHERE tur = 'karar_bekliyor') AS kb
           FROM uretim_sayimi WHERE is_emri_id = i.id) s ON true
      WHERE i.uretim_emri_id = ANY($1::int[])
      ORDER BY i.uretim_emri_id, i.sira`,
    [[...emirIdleri]],
  );
}

export interface AsimSatiri { sayimId: number; isEmriId: number; opNo: number; kisiId: number; adet: number; oncekiSaglam: number; zaman: string }

// 647 a: adımın sayımı önceki adımın o anki sağlamını aştığında yazılmıştır; aşan satır iki adımın sayımlarının zaman sırasıyla birleşik
// koşu toplamından okunur. Bu adımda sağlam ve karar bekleyen, önceki adımda sağlam sayılır (sonraki adıma geçen). Kalite kararı satırı
// (karar bekleyenden sağlama geçiş) toplamı değiştirmediği için aşan satır sayılmaz. Bağımsız ve ilk adımda aşım yoktur.
export function asimlarGetir(db: Db, emirId: number, isEmriId: number): Promise<AsimSatiri[]> {
  return db.sorgu<AsimSatiri>(
    `WITH adim AS (
       SELECT id, uretim_emri_id, sira, op_no FROM uretim_emirleri_is_emri WHERE id = $2 AND uretim_emri_id = $1 AND bagimlilik <> 'bagimsiz'),
     onceki AS (
       SELECT i.id FROM uretim_emirleri_is_emri i JOIN adim a ON i.uretim_emri_id = a.uretim_emri_id AND i.sira < a.sira ORDER BY i.sira DESC LIMIT 1),
     hareket AS (
       SELECT s.id, s.zaman, s.kisi_id, s.adet, s.karar_veren_kisi_id, s.is_emri_id = (SELECT id FROM adim) AS bu
         FROM uretim_sayimi s
        WHERE (s.is_emri_id = (SELECT id FROM adim) AND s.tur IN ('saglam', 'karar_bekliyor'))
           OR (s.is_emri_id = (SELECT id FROM onceki) AND s.tur = 'saglam')),
     kosu AS (
       SELECT h.*, sum(CASE WHEN h.bu THEN h.adet ELSE 0 END) OVER w AS bu_toplam, sum(CASE WHEN h.bu THEN 0 ELSE h.adet END) OVER w AS onceki_toplam
         FROM hareket h WINDOW w AS (ORDER BY h.zaman, h.id))
     SELECT k.id AS "sayimId", a.id AS "isEmriId", a.op_no AS "opNo", k.kisi_id AS "kisiId",
            LEAST(k.adet, k.bu_toplam - k.onceki_toplam)::int AS adet, k.onceki_toplam::int AS "oncekiSaglam", ${ISO('k.zaman')} AS zaman
       FROM kosu k CROSS JOIN adim a
      WHERE k.bu AND k.adet > 0 AND k.karar_veren_kisi_id IS NULL AND k.bu_toplam > k.onceki_toplam AND EXISTS (SELECT 1 FROM onceki)
      ORDER BY k.zaman, k.id`,
    [emirId, isEmriId],
  );
}
