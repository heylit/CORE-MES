import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { GeometriDosyaTuru, GeometriIsDurumu } from '#paylasilan/sozlesme/geometri.ts';
import type { GeometriOzellik } from '#paylasilan/sozlesme/geometri.ts';
import type { EslesenYuz, MontajDugumu, Olcum, Ozellik, SaglikOlcumu, Yuz, YuzeyIsaretGirdisi, YuzTuru } from './kurallar.ts';

export interface IsSatiri {
  id: number;
  revizyonId: number;
  belgeId: number;
  ozet: string;
  dosyaTuru: GeometriDosyaTuru;
  durum: GeometriIsDurumu;
  denemeSayisi: number;
  hataMetni: string | null;
  olusturma: string;
  baslama: string | null;
  bitis: string | null;
  surum: number;
}

const IS_SECIMI = `id, revizyon_id AS "revizyonId", belge_id AS "belgeId", ozet, dosya_turu AS "dosyaTuru", durum,
  deneme_sayisi AS "denemeSayisi", hata_metni AS "hataMetni", ${zamanMetni('olusturma')} AS olusturma,
  ${zamanMetni('baslama')} AS baslama, ${zamanMetni('bitis')} AS bitis, surum`;

export function isler(db: Db, revizyonIdler: readonly number[]): Promise<IsSatiri[]> {
  if (revizyonIdler.length === 0) return Promise.resolve([]);
  return db.sorgu<IsSatiri>(`SELECT ${IS_SECIMI} FROM geometri_is WHERE revizyon_id = ANY($1::int[])`, [revizyonIdler]);
}

export function is(db: Db, revizyonId: number): Promise<IsSatiri | null> {
  return db.tek<IsSatiri>(`SELECT ${IS_SECIMI} FROM geometri_is WHERE revizyon_id = $1`, [revizyonId]);
}

// Tarama: yeni revizyonlar kuyruğa girer; aynı revizyonun özeti değişmez (yayındaki dosya sabittir), var olan satıra dokunulmaz.
export async function kuyrugaEkle(db: Db, satirlar: readonly { revizyonId: number; belgeId: number; ozet: string; dosyaTuru: GeometriDosyaTuru }[]): Promise<number> {
  if (satirlar.length === 0) return 0;
  const r = await db.sorgu<{ id: number }>(
    `INSERT INTO geometri_is (revizyon_id, belge_id, ozet, dosya_turu)
     SELECT * FROM unnest($1::int[], $2::int[], $3::text[], $4::text[])
     ON CONFLICT (revizyon_id) DO NOTHING RETURNING id`,
    [satirlar.map((s) => s.revizyonId), satirlar.map((s) => s.belgeId), satirlar.map((s) => s.ozet), satirlar.map((s) => s.dosyaTuru)],
  );
  return r.length;
}

// Sunucu ya da süreç iş ortasında kapandıysa 'calisiyor' kalır; zamanlayıcının kilidi tek turu garanti ettiği için turun başında
// kalan her 'calisiyor' öksüzdür ve geçici hata gibi ele alınır.
export function oksuzIsler(db: Db): Promise<IsSatiri[]> {
  return db.sorgu<IsSatiri>(`SELECT ${IS_SECIMI} FROM geometri_is WHERE durum = 'calisiyor' FOR UPDATE`);
}

// Aynı turda geçici hatayla kuyruğa dönen iş yeniden alınmaz (haric): yineleme sonraki turdadır.
export function siradakiIsiAl(db: Db, haric: readonly number[]): Promise<IsSatiri | null> {
  return db.tek<IsSatiri>(
    `UPDATE geometri_is SET durum = 'calisiyor', baslama = now(), bitis = NULL, deneme_sayisi = deneme_sayisi + 1, surum = surum + 1
      WHERE id = (SELECT id FROM geometri_is WHERE durum = 'bekliyor' AND id <> ALL($1::int[])
                   ORDER BY olusturma, id LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING ${IS_SECIMI}`,
    [haric],
  );
}

export async function isBitir(db: Db, id: number, durum: GeometriIsDurumu, hataMetni: string | null): Promise<void> {
  await db.sorgu(
    `UPDATE geometri_is SET durum = $2, hata_metni = $3, bitis = CASE WHEN $2 = 'bekliyor' THEN NULL ELSE now() END, surum = surum + 1
      WHERE id = $1`,
    [id, durum, hataMetni],
  );
}

// Kullanıcının yeniden hesaplatması: deneme sayacı sıfırlanır, sürüm koşullu.
export function yenidenKuyruga(db: Db, revizyonId: number, surum: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE geometri_is SET durum = 'bekliyor', deneme_sayisi = 0, hata_metni = NULL, baslama = NULL, bitis = NULL,
            olusturma = now(), surum = surum + 1
      WHERE revizyon_id = $1 AND surum = $2 RETURNING id`,
    [revizyonId, surum],
  );
}

export async function analizYaz(
  db: Db, s: { revizyonId: number; belgeId: number; ozet: string; motor: string; olcum: Olcum; sureMs: number },
): Promise<void> {
  const o = s.olcum;
  await db.sorgu(
    `INSERT INTO geometri_analiz (revizyon_id, belge_id, ozet, motor, kutu_x_mm, kutu_y_mm, kutu_z_mm, obb_a_mm, obb_b_mm, obb_c_mm, cap_mm, obb_yon,
       hacim_mm3, alan_mm2, govde_sayisi, kapali, ucgen_sayisi, hesap_suresi_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $18, $11::numeric[], $12, $13, $14, $15, $16, $17)
     ON CONFLICT (revizyon_id) DO UPDATE SET belge_id = EXCLUDED.belge_id, ozet = EXCLUDED.ozet, motor = EXCLUDED.motor,
       kutu_x_mm = EXCLUDED.kutu_x_mm, kutu_y_mm = EXCLUDED.kutu_y_mm, kutu_z_mm = EXCLUDED.kutu_z_mm, obb_a_mm = EXCLUDED.obb_a_mm,
       obb_b_mm = EXCLUDED.obb_b_mm, obb_c_mm = EXCLUDED.obb_c_mm, cap_mm = EXCLUDED.cap_mm, obb_yon = EXCLUDED.obb_yon, hacim_mm3 = EXCLUDED.hacim_mm3,
       alan_mm2 = EXCLUDED.alan_mm2, govde_sayisi = EXCLUDED.govde_sayisi, kapali = EXCLUDED.kapali, ucgen_sayisi = EXCLUDED.ucgen_sayisi,
       hesap_suresi_ms = EXCLUDED.hesap_suresi_ms, hesap_zamani = now()`,
    [s.revizyonId, s.belgeId, s.ozet, s.motor, o.kutu.x, o.kutu.y, o.kutu.z, o.obb.a, o.obb.b, o.obb.c, o.obb.yon.flat(),
      o.hacimMm3, o.alanMm2, o.govdeSayisi, o.kapali, o.ucgenSayisi, s.sureMs, o.obb.cap],
  );
}

// Yüzler analizle aynı işlemde yenilenir: önce revizyonun eski satırları silinir. null (okunamadı ya da sınırı aştı) satırsız bırakır.
export async function yuzlerYaz(db: Db, revizyonId: number, motor: string, yuzler: readonly Yuz[] | null): Promise<void> {
  await db.sorgu('DELETE FROM geometri_yuz WHERE revizyon_id = $1', [revizyonId]);
  if (yuzler === null || yuzler.length === 0) return;
  const uc = (d: readonly number[] | null): string | null => (d === null ? null : `{${d.join(',')}}`);
  await db.sorgu(
    `INSERT INTO geometri_yuz (revizyon_id, sira, tur, ters, alan_mm2, yaricap_mm, ikinci_yaricap_mm, yari_aci_derece, eksen, konum, motor)
     SELECT $1, u.sira, u.tur, u.ters, u.alan, u.yaricap, u.ikinci, u.aci, u.eksen::numeric[], u.konum::numeric[], $2
       FROM unnest($3::int[], $4::text[], $5::bool[], $6::numeric[], $7::numeric[], $8::numeric[], $9::numeric[], $10::text[], $11::text[])
         AS u(sira, tur, ters, alan, yaricap, ikinci, aci, eksen, konum)`,
    [revizyonId, motor, yuzler.map((_, i) => i + 1), yuzler.map((y) => y.tur), yuzler.map((y) => y.ters), yuzler.map((y) => y.alanMm2),
      yuzler.map((y) => y.yaricapMm), yuzler.map((y) => y.ikinciYaricapMm), yuzler.map((y) => y.yariAciDerece),
      yuzler.map((y) => uc(y.eksen)), yuzler.map((y) => uc(y.konum))],
  );
}

// Özellikler yüzlerle aynı işlemde yenilenir; null (yüzler okunamadı) satırsız bırakır. ust 0 tabanlı yerdir, sıra 1'den.
export async function ozelliklerYaz(db: Db, revizyonId: number, motor: string, ozellikler: readonly Ozellik[] | null): Promise<void> {
  await db.sorgu('DELETE FROM geometri_ozellik WHERE revizyon_id = $1', [revizyonId]);
  if (ozellikler === null || ozellikler.length === 0) return;
  const uc = (d: readonly number[] | null): string | null => (d === null ? null : `{${d.join(',')}}`);
  const o = ozellikler;
  await db.sorgu(
    `INSERT INTO geometri_ozellik (revizyon_id, sira, tur, ust_sira, cap_mm, yaricap_mm, derinlik_mm, aci_derece, genislik_mm, boy_mm, gecis, dip, ic,
       eksen, konum, yuzler, motor)
     SELECT $1, u.sira, u.tur, u.ust, u.cap, u.yaricap, u.derinlik, u.aci, u.genislik, u.boy, u.gecis, u.dip, u.ic,
            u.eksen::numeric[], u.konum::numeric[], u.yuzler::int[], $2
       FROM unnest($3::int[], $4::text[], $5::int[], $6::numeric[], $7::numeric[], $8::numeric[], $9::numeric[], $10::numeric[], $11::numeric[],
                   $12::bool[], $13::text[], $14::bool[], $15::text[], $16::text[], $17::text[])
         AS u(sira, tur, ust, cap, yaricap, derinlik, aci, genislik, boy, gecis, dip, ic, eksen, konum, yuzler)`,
    [revizyonId, motor, o.map((_, i) => i + 1), o.map((x) => x.tur), o.map((x) => (x.ust === null ? null : x.ust + 1)), o.map((x) => x.capMm),
      o.map((x) => x.yaricapMm), o.map((x) => x.derinlikMm), o.map((x) => x.aciDerece), o.map((x) => x.genislikMm), o.map((x) => x.boyMm),
      o.map((x) => x.gecis), o.map((x) => x.dip), o.map((x) => x.ic), o.map((x) => uc(x.eksen)), o.map((x) => uc(x.konum)), o.map((x) => uc(x.yuzler))],
  );
}

export interface OzellikSatiri extends GeometriOzellik { motor: string }

export function ozellikler(db: Db, revizyonId: number): Promise<OzellikSatiri[]> {
  return db.sorgu<OzellikSatiri>(
    `SELECT sira, tur, ust_sira AS ust, cap_mm::float8 AS "capMm", yaricap_mm::float8 AS "yaricapMm", derinlik_mm::float8 AS "derinlikMm",
            aci_derece::float8 AS "aciDerece", genislik_mm::float8 AS "genislikMm", boy_mm::float8 AS "boyMm", gecis, dip, ic,
            eksen::float8[] AS eksen, konum::float8[] AS konum, yuzler, motor
       FROM geometri_ozellik WHERE revizyon_id = $1 ORDER BY sira`,
    [revizyonId],
  );
}

export interface YuzOzetiSatiri { motor: string; tur: YuzTuru; sayi: number }

export function yuzOzeti(db: Db, revizyonId: number): Promise<YuzOzetiSatiri[]> {
  return db.sorgu<YuzOzetiSatiri>(
    'SELECT motor, tur, count(*)::int AS sayi FROM geometri_yuz WHERE revizyon_id = $1 GROUP BY motor, tur ORDER BY tur',
    [revizyonId],
  );
}

export interface AnalizSatiri {
  revizyonId: number;
  ozet: string;
  motor: string;
  kutuX: number; kutuY: number; kutuZ: number;
  obbA: number; obbB: number; obbC: number; capMm: number;
  obbYon: number[];
  hacimMm3: number | null;
  alanMm2: number;
  govdeSayisi: number;
  kapali: boolean;
  ucgenSayisi: number;
  hesapSuresiMs: number;
  hesapZamani: string;
}

export function analiz(db: Db, revizyonId: number): Promise<AnalizSatiri | null> {
  return db.tek<AnalizSatiri>(
    `SELECT revizyon_id AS "revizyonId", ozet, motor, kutu_x_mm::float8 AS "kutuX", kutu_y_mm::float8 AS "kutuY", kutu_z_mm::float8 AS "kutuZ",
            obb_a_mm::float8 AS "obbA", obb_b_mm::float8 AS "obbB", obb_c_mm::float8 AS "obbC", cap_mm::float8 AS "capMm", obb_yon::float8[] AS "obbYon",
            hacim_mm3::float8 AS "hacimMm3", alan_mm2::float8 AS "alanMm2", govde_sayisi AS "govdeSayisi", kapali, ucgen_sayisi AS "ucgenSayisi",
            hesap_suresi_ms AS "hesapSuresiMs", ${zamanMetni('hesap_zamani')} AS "hesapZamani"
       FROM geometri_analiz WHERE revizyon_id = $1`,
    [revizyonId],
  );
}

// Montaj ağacı (kart 2109) analizle aynı işlemde yenilenir; null (kök yok, parça yok ya da düğüm sınırı aşıldı) satırsız bırakır.
export async function montajYaz(db: Db, revizyonId: number, motor: string, dugumler: readonly MontajDugumu[] | null): Promise<void> {
  await db.sorgu('DELETE FROM geometri_montaj WHERE revizyon_id = $1', [revizyonId]);
  if (dugumler === null || dugumler.length === 0) return;
  const uc = (d: readonly number[] | null): string | null => (d === null ? null : `{${d.join(',')}}`);
  const d = dugumler;
  await db.sorgu(
    `INSERT INTO geometri_montaj (revizyon_id, sira, ust_sira, tur, ad, kutu_en, kutu_ust, obb_a_mm, obb_b_mm, obb_c_mm, hacim_mm3, alan_mm2, kapali, motor)
     SELECT $1, u.sira, u.ust, u.tur, u.ad, u.kutu_en::numeric[], u.kutu_ust::numeric[], u.a, u.b, u.c, u.hacim, u.alan, u.kapali, $2
       FROM unnest($3::int[], $4::int[], $5::text[], $6::text[], $7::text[], $8::text[], $9::numeric[], $10::numeric[], $11::numeric[],
                   $12::numeric[], $13::numeric[], $14::bool[])
         AS u(sira, ust, tur, ad, kutu_en, kutu_ust, a, b, c, hacim, alan, kapali)`,
    [revizyonId, motor, d.map((x) => x.sira), d.map((x) => x.ust), d.map((x) => x.tur), d.map((x) => x.ad), d.map((x) => uc(x.kutuEn)),
      d.map((x) => uc(x.kutuUst)), d.map((x) => x.obb?.a ?? null), d.map((x) => x.obb?.b ?? null), d.map((x) => x.obb?.c ?? null),
      d.map((x) => x.hacimMm3), d.map((x) => x.alanMm2), d.map((x) => x.kapali)],
  );
}

interface MontajSatiri {
  sira: number; ust: number | null; tur: MontajDugumu['tur']; ad: string | null;
  kutuEn: [number, number, number] | null; kutuUst: [number, number, number] | null;
  obbA: number | null; obbB: number | null; obbC: number | null;
  hacimMm3: number | null; alanMm2: number | null; kapali: boolean | null; motor: string;
}

export async function montaj(db: Db, revizyonId: number): Promise<{ motor: string; dugumler: MontajDugumu[] } | null> {
  const satirlar = await db.sorgu<MontajSatiri>(
    `SELECT sira, ust_sira AS ust, tur, ad, kutu_en::float8[] AS "kutuEn", kutu_ust::float8[] AS "kutuUst", obb_a_mm::float8 AS "obbA",
            obb_b_mm::float8 AS "obbB", obb_c_mm::float8 AS "obbC", hacim_mm3::float8 AS "hacimMm3", alan_mm2::float8 AS "alanMm2", kapali, motor
       FROM geometri_montaj WHERE revizyon_id = $1 ORDER BY sira`,
    [revizyonId],
  );
  if (satirlar.length === 0) return null;
  return {
    motor: satirlar[0]!.motor,
    dugumler: satirlar.map(({ obbA, obbB, obbC, motor: _m, ...x }) => ({
      ...x, obb: obbA === null || obbB === null || obbC === null ? null : { a: obbA, b: obbB, c: obbC },
    })),
  };
}

// Sağlık ölçümü (kart 2143) analizle aynı işlemde yenilenir; null (B-rep okunamadı) satırsız bırakır.
export async function saglikYaz(db: Db, revizyonId: number, motor: string, o: SaglikOlcumu | null): Promise<void> {
  await db.sorgu('DELETE FROM geometri_saglik WHERE revizyon_id = $1', [revizyonId]);
  if (o === null) return;
  await db.sorgu(
    `INSERT INTO geometri_saglik (revizyon_id, acik_kenar_sayisi, acik_sinir_sayisi, gecersiz_yuz_sayisi, sekil_gecerli, en_buyuk_tolerans_mm,
       kucuk_kenar_sayisi, dosya_birimi, motor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [revizyonId, o.acikKenarSayisi, o.acikSinirSayisi, o.gecersizYuzSayisi, o.sekilGecerli, o.enBuyukToleransMm, o.kucukKenarSayisi, o.dosyaBirimi, motor],
  );
}

export interface SaglikSatiri extends SaglikOlcumu { motor: string; hesapZamani: string }

export function saglik(db: Db, revizyonId: number): Promise<SaglikSatiri | null> {
  return db.tek<SaglikSatiri>(
    `SELECT acik_kenar_sayisi AS "acikKenarSayisi", acik_sinir_sayisi AS "acikSinirSayisi", gecersiz_yuz_sayisi AS "gecersizYuzSayisi",
            sekil_gecerli AS "sekilGecerli", en_buyuk_tolerans_mm::float8 AS "enBuyukToleransMm", kucuk_kenar_sayisi AS "kucukKenarSayisi",
            dosya_birimi AS "dosyaBirimi", motor, ${zamanMetni('hesap_zamani')} AS "hesapZamani"
       FROM geometri_saglik WHERE revizyon_id = $1`,
    [revizyonId],
  );
}

// ---------------- Yüzey işaretleri (kart 2144) ----------------

// Yüzey işaretlemenin yüzleri: tür, yön, alan ve eşleştirme için yarıçap, eksen, konum.
export function yuzler(db: Db, revizyonId: number): Promise<EslesenYuz[]> {
  return db.sorgu<EslesenYuz>(
    `SELECT sira, tur, ters, alan_mm2::float8 AS "alanMm2", yaricap_mm::float8 AS "yaricapMm", eksen::float8[] AS eksen, konum::float8[] AS konum
       FROM geometri_yuz WHERE revizyon_id = $1 ORDER BY sira`,
    [revizyonId],
  );
}

export interface YuzeyBasligi { revizyonId: number; surum: number; guncelleyenKisiId: number; guncelleme: string }

export function yuzeyBasligi(db: Db, revizyonId: number, kilitle = false): Promise<YuzeyBasligi | null> {
  return db.tek<YuzeyBasligi>(
    `SELECT revizyon_id AS "revizyonId", surum, guncelleyen_kisi_id AS "guncelleyenKisiId", ${zamanMetni('guncelleme')} AS guncelleme
       FROM geometri_yuzey_isaret WHERE revizyon_id = $1${kilitle ? ' FOR UPDATE' : ''}`,
    [revizyonId],
  );
}

interface YuzeyIslemSatiri { yuzSira: number; islem: 'maske' | 'rota'; opNo: number | null; sartnameId: number | null; oneri: boolean }

export async function yuzeyIsaretleri(db: Db, revizyonId: number): Promise<YuzeyIsaretGirdisi[]> {
  const satirlar = await db.sorgu<YuzeyIslemSatiri>(
    `SELECT yuz_sira AS "yuzSira", islem, op_no AS "opNo", sartname_id AS "sartnameId", oneri
       FROM geometri_yuzey_islem WHERE revizyon_id = $1 ORDER BY yuz_sira`,
    [revizyonId],
  );
  return satirlar.map((x) => ({
    yuzSira: x.yuzSira, oneri: x.oneri,
    islem: x.islem === 'rota' && x.opNo !== null && x.sartnameId !== null ? { tur: 'rota', opNo: x.opNo, sartnameId: x.sartnameId } : { tur: 'maske' },
  }));
}

// Aynı belgenin bu revizyondan önceki, işareti kaydedilmiş en son revizyonu (2140-4 a: öneri kaynağı). Belge kimliği kuyruğun kaydındandır.
export async function oncekiIsaretliRevizyon(db: Db, belgeId: number, revizyonId: number): Promise<number | null> {
  const r = await db.tek<{ revizyonId: number }>(
    `SELECT h.revizyon_id AS "revizyonId" FROM geometri_yuzey_isaret h JOIN geometri_is i ON i.revizyon_id = h.revizyon_id
      WHERE i.belge_id = $1 AND h.revizyon_id < $2 ORDER BY h.revizyon_id DESC LIMIT 1`,
    [belgeId, revizyonId],
  );
  return r?.revizyonId ?? null;
}

// Başlık sürüm koşuluyla yazılır (ilk kayıtta surum null); koşul tutmazsa null. İşaretler bütün olarak yenilenir.
export async function yuzeyYaz(
  db: Db, revizyonId: number, surum: number | null, kisiId: number, isaretler: readonly YuzeyIsaretGirdisi[],
): Promise<number | null> {
  const baslik = surum === null
    ? await db.tek<{ surum: number }>(
      `INSERT INTO geometri_yuzey_isaret (revizyon_id, guncelleyen_kisi_id) VALUES ($1, $2) ON CONFLICT (revizyon_id) DO NOTHING RETURNING surum`,
      [revizyonId, kisiId],
    )
    : await db.tek<{ surum: number }>(
      `UPDATE geometri_yuzey_isaret SET surum = surum + 1, guncelleyen_kisi_id = $3, guncelleme = now()
        WHERE revizyon_id = $1 AND surum = $2 RETURNING surum`,
      [revizyonId, surum, kisiId],
    );
  if (baslik === null) return null;
  await db.sorgu('DELETE FROM geometri_yuzey_islem WHERE revizyon_id = $1', [revizyonId]);
  if (isaretler.length > 0) {
    await db.sorgu(
      `INSERT INTO geometri_yuzey_islem (revizyon_id, yuz_sira, islem, op_no, sartname_id, oneri)
       SELECT $1, u.sira, u.islem, u.op_no, u.sartname_id, u.oneri FROM unnest($2::int[], $3::text[], $4::int[], $5::int[], $6::bool[])
         AS u(sira, islem, op_no, sartname_id, oneri)`,
      [revizyonId, isaretler.map((x) => x.yuzSira), isaretler.map((x) => x.islem.tur),
        isaretler.map((x) => (x.islem.tur === 'rota' ? x.islem.opNo : null)), isaretler.map((x) => (x.islem.tur === 'rota' ? x.islem.sartnameId : null)),
        isaretler.map((x) => x.oneri)],
    );
  }
  return baslik.surum;
}
