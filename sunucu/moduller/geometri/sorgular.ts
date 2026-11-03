import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { GeometriDosyaTuru, GeometriIsDurumu } from '#paylasilan/sozlesme/geometri.ts';
import type { GeometriOzellik } from '#paylasilan/sozlesme/geometri.ts';
import type { Olcum, Ozellik, Yuz, YuzTuru } from './kurallar.ts';

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
