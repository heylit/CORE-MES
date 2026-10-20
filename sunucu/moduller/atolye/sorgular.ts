import type { Db } from '#cekirdek/db.ts';
import type {
  AlanKaydi, AlanTuru, DuvarKaydi, GecisKaydi, GecisTuru, IstasyonYeriKaydi, MakineYeriKaydi, KalemAmbalaji, KapiKenari, KrokiKaydi, ModelAyari, ModelBirimi, ModelKaydi, ModelKaynakBicimi, RafKaydi,
  RaftaGosterim, RafTuru,
  SalonKaydi, YukariEkseni,
} from '#paylasilan/sozlesme/atolye.ts';

const ISO = (sutun: string) => `to_json(${sutun}) #>> '{}'`;

export interface SalonSatiri {
  id: number;
  kod: string;
  ad: string;
  genislik: string;
  derinlik: string;
  hucreBoyu: string;
  girisX: string | null;
  girisZ: string | null;
  surum: number;
  kaydedenKisiId: number;
  kaydedildi: string;
  fabrikaX: string;
  fabrikaZ: string;
  fabrikaDonus: string;
}

const SALON = `id, kod, ad, genislik, derinlik, hucre_boyu AS "hucreBoyu", giris_x AS "girisX", giris_z AS "girisZ", surum,
  kaydeden_kisi_id AS "kaydedenKisiId", ${ISO('kaydedildi')} AS kaydedildi,
  fabrika_x AS "fabrikaX", fabrika_z AS "fabrikaZ", fabrika_donus AS "fabrikaDonus"`;

export function salonlariListele(db: Db): Promise<SalonSatiri[]> {
  return db.sorgu<SalonSatiri>(`SELECT ${SALON} FROM atolye_salon ORDER BY kod`);
}

export function salonBul(db: Db, id: number): Promise<SalonSatiri | null> {
  return db.tek<SalonSatiri>(`SELECT ${SALON} FROM atolye_salon WHERE id = $1`, [id]);
}

// Kayıt salon satırını kilitler: aynı salona eşzamanlı iki kayıt sıraya girer, ikincisi yeni sürümü görüp 409 alır.
export function salonKilitle(db: Db, id: number): Promise<SalonSatiri | null> {
  return db.tek<SalonSatiri>(`SELECT ${SALON} FROM atolye_salon WHERE id = $1 FOR UPDATE`, [id]);
}

// Fabrika kaydı birden çok bölümü kilitler; kilit sırası kimlik sırasıdır (karşılıklı bekleme olmaz).
export function salonlariKilitle(db: Db, idler: readonly number[]): Promise<SalonSatiri[]> {
  return db.sorgu<SalonSatiri>(`SELECT ${SALON} FROM atolye_salon WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`, [idler]);
}

// Yeni bölüm fabrika planında var olanların sağına (5 m boşlukla) konur; sonra düzenleyicide taşınır.
export function salonEkle(db: Db, k: SalonKaydi, kisiId: number): Promise<SalonSatiri | null> {
  return db.tek<SalonSatiri>(
    `INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, kaydeden_kisi_id, fabrika_x)
     VALUES ($1, $2, $3, $4, $5, $6,
             (SELECT COALESCE(max(fabrika_x + greatest(genislik, derinlik)) + 5, 0) FROM atolye_salon))
     RETURNING ${SALON}`,
    [k.kod, k.ad, k.genislik, k.derinlik, k.hucreBoyu, kisiId],
  );
}

// Sürüm koşulu ön denetimi örter: kilitten sonra da eski sürümden yazan satır bulamaz.
export function salonGuncelle(
  db: Db,
  id: number,
  eskiSurum: number,
  k: SalonKaydi & { giris: { x: number; z: number } | null },
  kisiId: number,
  fabrika: { x: number; z: number; donus: number } | null = null,
): Promise<SalonSatiri | null> {
  return db.tek<SalonSatiri>(
    `UPDATE atolye_salon
        SET kod = $3, ad = $4, genislik = $5, derinlik = $6, hucre_boyu = $7, giris_x = $8, giris_z = $9,
            fabrika_x = COALESCE($11, fabrika_x), fabrika_z = COALESCE($12, fabrika_z), fabrika_donus = COALESCE($13, fabrika_donus),
            surum = surum + 1, kaydeden_kisi_id = $10, kaydedildi = now()
      WHERE id = $1 AND surum = $2
      RETURNING ${SALON}`,
    [id, eskiSurum, k.kod, k.ad, k.genislik, k.derinlik, k.hucreBoyu, k.giris?.x ?? null, k.giris?.z ?? null, kisiId,
      fabrika?.x ?? null, fabrika?.z ?? null, fabrika?.donus ?? null],
  );
}

export interface IstasyonYeriSatiri {
  istasyonId: number;
  salonId: number;
  x: string;
  z: string;
  donus: string;
  genislik: string;
  derinlik: string;
  modelId: number | null;
}

const YER = 'istasyon_id AS "istasyonId", salon_id AS "salonId", x, z, donus, genislik, derinlik, model_id AS "modelId"';

export function istasyonYerleri(db: Db, salonId: number | null): Promise<IstasyonYeriSatiri[]> {
  return db.sorgu<IstasyonYeriSatiri>(
    `SELECT ${YER} FROM atolye_istasyon_yeri WHERE ($1::int IS NULL OR salon_id = $1) ORDER BY istasyon_id`,
    [salonId],
  );
}

// Başka salonda yerleşik olanlar: bir istasyonun tek yeri vardır.
export function baskaSalondakiYerler(db: Db, salonId: number, istasyonIdleri: readonly number[]): Promise<{ istasyonId: number; salonKod: string }[]> {
  return db.sorgu<{ istasyonId: number; salonKod: string }>(
    `SELECT y.istasyon_id AS "istasyonId", s.kod AS "salonKod"
       FROM atolye_istasyon_yeri y JOIN atolye_salon s ON s.id = y.salon_id
      WHERE y.salon_id <> $1 AND y.istasyon_id = ANY($2::int[])`,
    [salonId, istasyonIdleri],
  );
}

// Bölümde kalmayacak istasyon yerleri silinir (fabrika kaydında önce bütün bölümlerde: istasyon başka bölüme geçebilir).
export async function istasyonYerleriniBirak(db: Db, salonId: number, kalanlar: readonly number[]): Promise<void> {
  await db.sorgu('DELETE FROM atolye_istasyon_yeri WHERE salon_id = $1 AND NOT (istasyon_id = ANY($2::int[]))', [salonId, kalanlar]);
}

// Yazılan satır sayısı döner: başka salonda yerleşik istasyon (eşzamanlı kayıt) yazılmaz, sayı eksik kalır.
export async function istasyonYerleriniYaz(db: Db, salonId: number, yerler: readonly IstasyonYeriKaydi[]): Promise<number> {
  await istasyonYerleriniBirak(db, salonId, yerler.map((y) => y.istasyonId));
  if (yerler.length === 0) return 0;
  const yazilan = await db.sorgu<{ istasyonId: number }>(
    `INSERT INTO atolye_istasyon_yeri (istasyon_id, salon_id, x, z, donus, genislik, derinlik, model_id)
     SELECT u.istasyon_id, $1, u.x, u.z, u.donus, u.genislik, u.derinlik, u.model_id
       FROM unnest($2::int[], $3::numeric[], $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[], $8::int[])
         AS u (istasyon_id, x, z, donus, genislik, derinlik, model_id)
     ON CONFLICT (istasyon_id) DO UPDATE
       SET x = EXCLUDED.x, z = EXCLUDED.z, donus = EXCLUDED.donus, genislik = EXCLUDED.genislik, derinlik = EXCLUDED.derinlik,
           model_id = EXCLUDED.model_id
     WHERE atolye_istasyon_yeri.salon_id = EXCLUDED.salon_id
     RETURNING istasyon_id AS "istasyonId"`,
    [
      salonId,
      yerler.map((y) => y.istasyonId), yerler.map((y) => y.x), yerler.map((y) => y.z),
      yerler.map((y) => y.donus), yerler.map((y) => y.genislik), yerler.map((y) => y.derinlik), yerler.map((y) => y.modelId),
    ],
  );
  return yazilan.length;
}

export interface MakineYeriSatiri {
  makineId: number;
  salonId: number;
  x: string;
  z: string;
  donus: string;
  genislik: string;
  derinlik: string;
  modelId: number | null;
}

const MAKINE_YERI = 'makine_id AS "makineId", salon_id AS "salonId", x, z, donus, genislik, derinlik, model_id AS "modelId"';

export function makineYerleri(db: Db, salonId: number | null): Promise<MakineYeriSatiri[]> {
  return db.sorgu<MakineYeriSatiri>(
    `SELECT ${MAKINE_YERI} FROM atolye_makine_yeri WHERE ($1::int IS NULL OR salon_id = $1) ORDER BY makine_id`,
    [salonId],
  );
}

// Bölümde kalmayacak makine yerleri silinir (fabrika kaydında önce bütün bölümlerde: makine başka bölüme geçebilir).
export async function makineYerleriniBirak(db: Db, salonId: number, kalanlar: readonly number[]): Promise<void> {
  await db.sorgu('DELETE FROM atolye_makine_yeri WHERE salon_id = $1 AND NOT (makine_id = ANY($2::int[]))', [salonId, kalanlar]);
}

// Yazılan satır sayısı döner: başka salonda yerleşik makine (eşzamanlı kayıt) yazılmaz, sayı eksik kalır.
export async function makineYerleriniYaz(db: Db, salonId: number, yerler: readonly MakineYeriKaydi[]): Promise<number> {
  await makineYerleriniBirak(db, salonId, yerler.map((y) => y.makineId));
  if (yerler.length === 0) return 0;
  const yazilan = await db.sorgu<{ makineId: number }>(
    `INSERT INTO atolye_makine_yeri (makine_id, salon_id, x, z, donus, genislik, derinlik, model_id)
     SELECT u.makine_id, $1, u.x, u.z, u.donus, u.genislik, u.derinlik, u.model_id
       FROM unnest($2::int[], $3::numeric[], $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[], $8::int[])
         AS u (makine_id, x, z, donus, genislik, derinlik, model_id)
     ON CONFLICT (makine_id) DO UPDATE
       SET x = EXCLUDED.x, z = EXCLUDED.z, donus = EXCLUDED.donus, genislik = EXCLUDED.genislik, derinlik = EXCLUDED.derinlik,
           model_id = EXCLUDED.model_id
     WHERE atolye_makine_yeri.salon_id = EXCLUDED.salon_id
     RETURNING makine_id AS "makineId"`,
    [
      salonId,
      yerler.map((y) => y.makineId), yerler.map((y) => y.x), yerler.map((y) => y.z),
      yerler.map((y) => y.donus), yerler.map((y) => y.genislik), yerler.map((y) => y.derinlik), yerler.map((y) => y.modelId),
    ],
  );
  return yazilan.length;
}

export interface RafSatiri {
  id: number;
  salonId: number;
  kod: string;
  ad: string;
  tur: RafTuru;
  bolmeSayisi: number;
  katSayisi: number;
  gozSayisi: number;
  bolmeGenisligi: string;
  derinlik: string;
  yukseklik: string;
  x: string;
  z: string;
  donus: string;
  aktif: boolean;
  genislik: string;
  katYukseklikleri: string[] | null;
  gozGenisligi: string | null;
  gozDerinligi: string | null;
}

const RAF = `r.id, r.salon_id AS "salonId", r.kod, r.ad, r.tur, r.bolme_sayisi AS "bolmeSayisi", r.kat_sayisi AS "katSayisi",
  r.goz_sayisi AS "gozSayisi", r.bolme_genisligi AS "bolmeGenisligi", r.derinlik, r.yukseklik, r.x, r.z, r.donus, r.aktif,
  (r.bolme_sayisi * r.bolme_genisligi)::numeric(6, 2) AS genislik,
  r.kat_yukseklikleri::text[] AS "katYukseklikleri", r.goz_genisligi AS "gozGenisligi", r.goz_derinligi AS "gozDerinligi"`;

export function raflar(db: Db, salonId: number | null): Promise<RafSatiri[]> {
  return db.sorgu<RafSatiri>(`SELECT ${RAF} FROM atolye_raf r WHERE ($1::int IS NULL OR r.salon_id = $1) ORDER BY r.kod`, [salonId]);
}

export function rafBul(db: Db, id: number): Promise<RafSatiri | null> {
  return db.tek<RafSatiri>(`SELECT ${RAF} FROM atolye_raf r WHERE r.id = $1`, [id]);
}

export function rafKoduylaBul(db: Db, kod: string): Promise<RafSatiri | null> {
  return db.tek<RafSatiri>(`SELECT ${RAF} FROM atolye_raf r WHERE r.kod = $1`, [kod]);
}

const rafDegerleri = (r: RafKaydi) => [
  r.kod, r.ad, r.tur, r.bolmeSayisi, r.katSayisi, r.gozSayisi, r.bolmeGenisligi, r.derinlik, r.yukseklik, r.x, r.z, r.donus, r.aktif,
  r.katYukseklikleri, r.gozGenisligi, r.gozDerinligi,
];

// Başka salonun raflarında kullanılan kodlar: raf kodu bütün salonlarda tektir (ATL-09).
export async function baskaSalondakiRafKodlari(db: Db, salonId: number, kodlar: readonly string[]): Promise<string[]> {
  return (await db.sorgu<{ kod: string }>(
    'SELECT kod FROM atolye_raf WHERE salon_id <> $1 AND kod = ANY($2::text[]) ORDER BY kod',
    [salonId, kodlar],
  )).map((r) => r.kod);
}

export async function rafEkle(db: Db, salonId: number, r: RafKaydi): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO atolye_raf (salon_id, kod, ad, tur, bolme_sayisi, kat_sayisi, goz_sayisi, bolme_genisligi, derinlik, yukseklik, x, z, donus, aktif,
                             kat_yukseklikleri, goz_genisligi, goz_derinligi)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::numeric[], $16, $17) RETURNING id`,
    [salonId, ...rafDegerleri(r)],
  );
  if (!satir) throw new Error('Raf eklenemedi');
  return satir.id;
}

export async function rafGuncelle(db: Db, salonId: number, id: number, r: RafKaydi): Promise<boolean> {
  const satir = await db.tek<{ id: number }>(
    `UPDATE atolye_raf
        SET kod = $3, ad = $4, tur = $5, bolme_sayisi = $6, kat_sayisi = $7, goz_sayisi = $8, bolme_genisligi = $9,
            derinlik = $10, yukseklik = $11, x = $12, z = $13, donus = $14, aktif = $15,
            kat_yukseklikleri = $16::numeric[], goz_genisligi = $17, goz_derinligi = $18
      WHERE id = $1 AND salon_id = $2 RETURNING id`,
    [id, salonId, ...rafDegerleri(r)],
  );
  return satir !== null;
}

// Raf başka bölüme geçer (gözleri ve göz kalemleri rafla gider).
export async function rafBolumDegistir(db: Db, id: number, salonId: number): Promise<void> {
  await db.sorgu('UPDATE atolye_raf SET salon_id = $2 WHERE id = $1 AND salon_id <> $2', [id, salonId]);
}

// Göz satırları rafın ölçüsünü izler: dışarıda kalan silinir (bağlı kayıt varsa yabancı anahtar durdurur), eksik eklenir.
export async function gozleriEsitle(db: Db, rafId: number): Promise<void> {
  await db.sorgu(
    `DELETE FROM atolye_goz g USING atolye_raf r
      WHERE g.raf_id = r.id AND r.id = $1 AND (g.bolme > r.bolme_sayisi OR g.kat > r.kat_sayisi OR g.goz > r.goz_sayisi)`,
    [rafId],
  );
  await db.sorgu(
    `INSERT INTO atolye_goz (raf_id, bolme, kat, goz)
     SELECT r.id, b, k, g FROM atolye_raf r,
            generate_series(1, r.bolme_sayisi) b, generate_series(1, r.kat_sayisi) k, generate_series(1, r.goz_sayisi) g
      WHERE r.id = $1
     ON CONFLICT ON CONSTRAINT atolye_goz_tek DO NOTHING`,
    [rafId],
  );
}

export interface GozSatiri {
  id: number;
  rafId: number;
  bolme: number;
  kat: number;
  goz: number;
}

const GOZ = 'g.id, g.raf_id AS "rafId", g.bolme, g.kat, g.goz';

export function gozSayfasi(db: Db, rafId: number, sinir: number, atla: number, bolme: number | null = null): Promise<GozSatiri[]> {
  return db.sorgu<GozSatiri>(
    `SELECT ${GOZ} FROM atolye_goz g WHERE g.raf_id = $1 AND ($4::int IS NULL OR g.bolme = $4) ORDER BY g.bolme, g.kat, g.goz LIMIT $2 OFFSET $3`,
    [rafId, sinir, atla, bolme],
  );
}

export async function gozSayisi(db: Db, rafId: number, bolme: number | null = null): Promise<number> {
  const satir = await db.tek<{ sayi: number }>('SELECT count(*)::int AS sayi FROM atolye_goz WHERE raf_id = $1 AND ($2::int IS NULL OR bolme = $2)', [rafId, bolme]);
  return satir?.sayi ?? 0;
}

// Adres aramasında eşleşen gözler; verilmeyen parça (kat, göz) serbesttir.
export function gozAra(
  db: Db,
  rafId: number,
  p: { bolme: number; kat: number | null; goz: number | null },
  sinir: number,
): Promise<GozSatiri[]> {
  return db.sorgu<GozSatiri>(
    `SELECT ${GOZ} FROM atolye_goz g
      WHERE g.raf_id = $1 AND g.bolme = $2 AND ($3::int IS NULL OR g.kat = $3) AND ($4::int IS NULL OR g.goz = $4)
      ORDER BY g.bolme, g.kat, g.goz LIMIT $5`,
    [rafId, p.bolme, p.kat, p.goz, sinir],
  );
}

// Başka modüle verilen göz kaydı (disari.ts): rafı ve bölümüyle; adres raf kodundan üretilir.
export interface DisGozSatiri {
  id: number;
  rafId: number;
  salonId: number;
  salonKodu: string;
  rafKodu: string;
  rafAktif: boolean;
  bolme: number;
  kat: number;
  goz: number;
}

const DIS_GOZ = `SELECT g.id, g.raf_id AS "rafId", r.salon_id AS "salonId", s.kod AS "salonKodu", r.kod AS "rafKodu", r.aktif AS "rafAktif",
         g.bolme, g.kat, g.goz
    FROM atolye_goz g JOIN atolye_raf r ON r.id = g.raf_id JOIN atolye_salon s ON s.id = r.salon_id`;

export function disGozler(db: Db, salonId: number | null): Promise<DisGozSatiri[]> {
  return db.sorgu<DisGozSatiri>(`${DIS_GOZ} WHERE ($1::int IS NULL OR r.salon_id = $1) ORDER BY r.kod, g.bolme, g.kat, g.goz`, [salonId]);
}

export function disGoz(db: Db, id: number): Promise<DisGozSatiri | null> {
  return db.tek<DisGozSatiri>(`${DIS_GOZ} WHERE g.id = $1`, [id]);
}

export function disGozAdresle(db: Db, rafKodu: string, bolme: number, kat: number, goz: number): Promise<DisGozSatiri | null> {
  return db.tek<DisGozSatiri>(`${DIS_GOZ} WHERE r.kod = $1 AND g.bolme = $2 AND g.kat = $3 AND g.goz = $4`, [rafKodu, bolme, kat, goz]);
}

export interface AlanSatiri {
  id: number;
  salonId: number;
  tur: AlanTuru;
  ad: string;
  x: string;
  z: string;
  donus: string;
  genislik: string;
  derinlik: string;
  kapiKenari: KapiKenari | null;
  kapiOfseti: string | null;
  kapiGenisligi: string | null;
}

const ALAN = `id, salon_id AS "salonId", tur, ad, x, z, donus, genislik, derinlik,
  kapi_kenari AS "kapiKenari", kapi_ofseti AS "kapiOfseti", kapi_genisligi AS "kapiGenisligi"`;

export function alanlar(db: Db, salonId: number | null): Promise<AlanSatiri[]> {
  return db.sorgu<AlanSatiri>(`SELECT ${ALAN} FROM atolye_alan WHERE ($1::int IS NULL OR salon_id = $1) ORDER BY id`, [salonId]);
}

// Alan kimliği korunur (stok konumu alana bağlıdır): kimliği olan güncellenir (başka bölümden geleni taşınır), kimliksiz
// ya da bulunamayan eklenir, listede olmayan silinir. `korunan`: aynı fabrika kaydında başka bölümün listesindeki alanlar.
export async function alanlariYaz(db: Db, salonId: number, liste: readonly AlanKaydi[], korunan: readonly number[] = []): Promise<void> {
  const idler = liste.flatMap((a) => (a.id === null ? [] : [a.id]));
  await db.sorgu('DELETE FROM atolye_alan WHERE salon_id = $1 AND id <> ALL($2::int[])', [salonId, [...idler, ...korunan]]);
  if (liste.length === 0) return;
  const sutunlar = (l: readonly AlanKaydi[]) => [
    l.map((a) => a.tur), l.map((a) => a.ad), l.map((a) => a.x), l.map((a) => a.z), l.map((a) => a.donus),
    l.map((a) => a.genislik), l.map((a) => a.derinlik),
    l.map((a) => a.kapi?.kenar ?? null), l.map((a) => a.kapi?.ofset ?? null), l.map((a) => a.kapi?.genislik ?? null),
  ];
  const kimlikli = liste.filter((a) => a.id !== null);
  const guncellenen = new Set(kimlikli.length === 0 ? [] : (await db.sorgu<{ id: number }>(
    `UPDATE atolye_alan h
        SET salon_id = $1, tur = u.tur, ad = u.ad, x = u.x, z = u.z, donus = u.donus, genislik = u.genislik, derinlik = u.derinlik,
            kapi_kenari = u.kapi_kenari, kapi_ofseti = u.kapi_ofseti, kapi_genisligi = u.kapi_genisligi
       FROM unnest($2::text[], $3::text[], $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[], $8::numeric[],
                   $9::text[], $10::numeric[], $11::numeric[], $12::int[])
         AS u (tur, ad, x, z, donus, genislik, derinlik, kapi_kenari, kapi_ofseti, kapi_genisligi, id)
      WHERE h.id = u.id
     RETURNING h.id`,
    [salonId, ...sutunlar(kimlikli), kimlikli.map((a) => a.id)],
  )).map((r) => r.id));
  const yeni = liste.filter((a) => a.id === null || !guncellenen.has(a.id));
  if (yeni.length === 0) return;
  await db.sorgu(
    `INSERT INTO atolye_alan (salon_id, tur, ad, x, z, donus, genislik, derinlik, kapi_kenari, kapi_ofseti, kapi_genisligi)
     SELECT $1, u.tur, u.ad, u.x, u.z, u.donus, u.genislik, u.derinlik, u.kapi_kenari, u.kapi_ofseti, u.kapi_genisligi
       FROM unnest($2::text[], $3::text[], $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[], $8::numeric[],
                   $9::text[], $10::numeric[], $11::numeric[], $12::int[])
         AS u (tur, ad, x, z, donus, genislik, derinlik, kapi_kenari, kapi_ofseti, kapi_genisligi, sira)
      ORDER BY u.sira`,
    [salonId, ...sutunlar(yeni), yeni.map((_, i) => i)],
  );
}

export interface DuvarSatiri {
  id: number;
  basX: string;
  basZ: string;
  sonX: string;
  sonZ: string;
  kalinlik: string;
  cam: boolean;
}

export function duvarlar(db: Db, salonId: number): Promise<DuvarSatiri[]> {
  return db.sorgu<DuvarSatiri>(
    `SELECT id, bas_x AS "basX", bas_z AS "basZ", son_x AS "sonX", son_z AS "sonZ", kalinlik, cam
       FROM atolye_duvar WHERE salon_id = $1 ORDER BY id`,
    [salonId],
  );
}

// Duvarlara başka kayıt bağlanmaz: kayıtta salonunkiler silinip yeniden yazılır.
export async function duvarlariYaz(db: Db, salonId: number, liste: readonly DuvarKaydi[]): Promise<void> {
  await db.sorgu('DELETE FROM atolye_duvar WHERE salon_id = $1', [salonId]);
  if (liste.length === 0) return;
  await db.sorgu(
    `INSERT INTO atolye_duvar (salon_id, bas_x, bas_z, son_x, son_z, kalinlik, cam)
     SELECT $1, u.bas_x, u.bas_z, u.son_x, u.son_z, u.kalinlik, u.cam
       FROM unnest($2::numeric[], $3::numeric[], $4::numeric[], $5::numeric[], $6::numeric[], $7::boolean[], $8::int[])
         AS u (bas_x, bas_z, son_x, son_z, kalinlik, cam, sira)
      ORDER BY u.sira`,
    [
      salonId,
      liste.map((d) => d.basX), liste.map((d) => d.basZ), liste.map((d) => d.sonX), liste.map((d) => d.sonZ),
      liste.map((d) => d.kalinlik), liste.map((d) => d.cam), liste.map((_, i) => i),
    ],
  );
}

export interface GecisSatiri {
  id: number;
  salonId: number;
  tur: GecisTuru;
  kenar: KapiKenari;
  ofset: string;
  genislik: string;
}

export function gecisler(db: Db, salonId: number): Promise<GecisSatiri[]> {
  return db.sorgu<GecisSatiri>(
    `SELECT id, salon_id AS "salonId", tur, kenar, ofset, genislik FROM atolye_gecis WHERE salon_id = $1 ORDER BY id`,
    [salonId],
  );
}

// Geçişe başka kayıt bağlanmaz: kayıtta salonunkiler silinip yeniden yazılır.
export async function gecisleriYaz(db: Db, salonId: number, liste: readonly GecisKaydi[]): Promise<void> {
  await db.sorgu('DELETE FROM atolye_gecis WHERE salon_id = $1', [salonId]);
  if (liste.length === 0) return;
  await db.sorgu(
    `INSERT INTO atolye_gecis (salon_id, tur, kenar, ofset, genislik)
     SELECT $1, u.tur, u.kenar, u.ofset, u.genislik
       FROM unnest($2::text[], $3::text[], $4::numeric[], $5::numeric[], $6::int[]) AS u (tur, kenar, ofset, genislik, sira)
      ORDER BY u.sira`,
    [salonId, liste.map((g) => g.tur), liste.map((g) => g.kenar), liste.map((g) => g.ofset), liste.map((g) => g.genislik), liste.map((_, i) => i)],
  );
}

// ---------- 3B model ----------

export interface ModelSatiri {
  id: number;
  ad: string;
  kaynakBicim: ModelKaynakBicimi;
  boyutBayt: number;
  parcaSayisi: number;
  ozet: string;
  ucgenSayisi: number;
  birim: ModelBirimi;
  yukari: YukariEkseni;
  donus: string;
  sigdir: boolean;
  tamam: boolean;
  surum: number;
  kaydedenKisiId: number;
  kaydedildi: string;
  kullanim: number;
  kalemKodlari: string[];
}

const MODEL = `m.id, m.ad, m.kaynak_bicim AS "kaynakBicim", m.boyut_bayt AS "boyutBayt", m.parca_sayisi AS "parcaSayisi", m.ozet,
  m.ucgen_sayisi AS "ucgenSayisi", m.birim, m.yukari_eksen AS yukari, m.donus, m.sigdir, m.tamam, m.surum,
  m.kaydeden_kisi_id AS "kaydedenKisiId", ${ISO('m.kaydedildi')} AS kaydedildi,
  (SELECT count(*)::int FROM atolye_istasyon_yeri y WHERE y.model_id = m.id)
    + (SELECT count(*)::int FROM atolye_makine_yeri y WHERE y.model_id = m.id) AS kullanim,
  ARRAY(SELECT k.kod FROM atolye_kalem_gorunumu k WHERE k.model_id = m.id ORDER BY k.kod_anahtari) AS "kalemKodlari"`;

export function modelleriListele(db: Db): Promise<ModelSatiri[]> {
  return db.sorgu<ModelSatiri>(`SELECT ${MODEL} FROM atolye_model m ORDER BY m.ad, m.id`);
}

export function modelBul(db: Db, id: number): Promise<ModelSatiri | null> {
  return db.tek<ModelSatiri>(`SELECT ${MODEL} FROM atolye_model m WHERE m.id = $1`, [id]);
}

export function modelKilitle(db: Db, id: number): Promise<ModelSatiri | null> {
  return db.tek<ModelSatiri>(`SELECT ${MODEL} FROM atolye_model m WHERE m.id = $1 FOR UPDATE OF m`, [id]);
}

export function modelleriBul(db: Db, idler: readonly number[]): Promise<ModelSatiri[]> {
  return db.sorgu<ModelSatiri>(`SELECT ${MODEL} FROM atolye_model m WHERE m.id = ANY($1::int[])`, [idler]);
}

export async function modelEkle(db: Db, k: ModelKaydi, parcaSayisi: number, kisiId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO atolye_model (ad, kaynak_bicim, boyut_bayt, parca_sayisi, ozet, ucgen_sayisi, birim, yukari_eksen, donus, sigdir, kaydeden_kisi_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [k.ad, k.kaynakBicim, k.boyutBayt, parcaSayisi, k.ozet, k.ucgenSayisi, k.birim, k.yukari, k.donus, k.sigdir, kisiId],
  );
  if (!satir) throw new Error('Model eklenemedi');
  return satir.id;
}

// Aynı parça yeniden gönderilirse (kopan bağlantı) üzerine yazılır.
export async function modelParcaYaz(db: Db, modelId: number, sira: number, veri: Uint8Array): Promise<number> {
  await db.sorgu(
    `INSERT INTO atolye_model_parca (model_id, sira, veri) VALUES ($1, $2, $3)
     ON CONFLICT (model_id, sira) DO UPDATE SET veri = EXCLUDED.veri`,
    [modelId, sira, Buffer.from(veri)],
  );
  const say = await db.tek<{ adet: number }>('SELECT count(*)::int AS adet FROM atolye_model_parca WHERE model_id = $1', [modelId]);
  return say?.adet ?? 0;
}

export interface ParcaDurumu {
  adet: number;
  toplam: number;
  bas: string | null;
}

// Tamamlamadan önce: gelen parça sayısı, toplam boyut ve ilk 12 baytın (GLB başlığı) base64'ü.
export async function modelParcaDurumu(db: Db, modelId: number): Promise<ParcaDurumu> {
  const d = await db.tek<ParcaDurumu>(
    `SELECT count(*)::int AS adet, COALESCE(sum(octet_length(veri)), 0)::int AS toplam,
            (SELECT encode(substring(veri FROM 1 FOR 12), 'base64') FROM atolye_model_parca WHERE model_id = $1 AND sira = 0) AS bas
       FROM atolye_model_parca WHERE model_id = $1`,
    [modelId],
  );
  return d ?? { adet: 0, toplam: 0, bas: null };
}

export function modelOzetiHesapla(db: Db, modelId: number): Promise<{ ozet: string | null } | null> {
  return db.tek<{ ozet: string | null }>(
    `SELECT encode(sha256(string_agg(veri, ''::bytea ORDER BY sira)), 'hex') AS ozet FROM atolye_model_parca WHERE model_id = $1`,
    [modelId],
  );
}

export async function modelTamamla(db: Db, modelId: number): Promise<void> {
  await db.sorgu('UPDATE atolye_model SET tamam = true, surum = surum + 1 WHERE id = $1', [modelId]);
}

export function modelAyarla(db: Db, id: number, eskiSurum: number, k: ModelAyari, kisiId: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE atolye_model SET ad = $3, birim = $4, yukari_eksen = $5, donus = $6, sigdir = $7, surum = surum + 1,
            kaydeden_kisi_id = $8, kaydedildi = now()
      WHERE id = $1 AND surum = $2 RETURNING id`,
    [id, eskiSurum, k.ad, k.birim, k.yukari, k.donus, k.sigdir, kisiId],
  );
}

export async function modelSil(db: Db, id: number): Promise<boolean> {
  return (await db.sorgu<{ id: number }>('DELETE FROM atolye_model WHERE id = $1 RETURNING id', [id])).length === 1;
}

// PostgreSQL base64'ü 76 karakterde satıra böler; satır sonları atılır.
export function modelParca(db: Db, modelId: number, sira: number): Promise<{ veri: string } | null> {
  return db.tek<{ veri: string }>(
    `SELECT translate(encode(p.veri, 'base64'), E'\\n', '') AS veri
       FROM atolye_model_parca p JOIN atolye_model m ON m.id = p.model_id
      WHERE p.model_id = $1 AND p.sira = $2 AND m.tamam`,
    [modelId, sira],
  );
}

// ---------- kalem görünümü ----------

export interface KalemGorunumuSatiri {
  kod: string;
  modelId: number | null;
  ambalaj: KalemAmbalaji;
  rafta: RaftaGosterim;
}

export function kalemGorunumleri(db: Db): Promise<KalemGorunumuSatiri[]> {
  return db.sorgu<KalemGorunumuSatiri>(
    'SELECT kod, model_id AS "modelId", ambalaj, rafta FROM atolye_kalem_gorunumu ORDER BY kod_anahtari',
  );
}

export async function kalemGorunumuYaz(db: Db, anahtar: string, k: KalemGorunumuSatiri, kisiId: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO atolye_kalem_gorunumu (kod_anahtari, kod, model_id, ambalaj, rafta, kaydeden_kisi_id) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (kod_anahtari) DO UPDATE
       SET kod = EXCLUDED.kod, model_id = EXCLUDED.model_id, ambalaj = EXCLUDED.ambalaj, rafta = EXCLUDED.rafta,
           kaydeden_kisi_id = EXCLUDED.kaydeden_kisi_id, kaydedildi = now()`,
    [anahtar, k.kod, k.modelId, k.ambalaj, k.rafta, kisiId],
  );
}

export async function kalemGorunumuSil(db: Db, anahtar: string): Promise<void> {
  await db.sorgu('DELETE FROM atolye_kalem_gorunumu WHERE kod_anahtari = $1', [anahtar]);
}

// ---------- göz kalemi ----------

export interface GozKalemiSatiri {
  id: number;
  gozId: number;
  rafId: number;
  rafKodu: string;
  rafAdi: string;
  salonId: number;
  salonKodu: string;
  salonAdi: string;
  bolme: number;
  kat: number;
  goz: number;
  kod: string;
  ad: string;
  doluluk: number;
  kaydedenKisiId: number;
  kaydedildi: string;
}

const GOZ_KALEMI = `k.id, k.goz_id AS "gozId", r.id AS "rafId", r.kod AS "rafKodu", r.ad AS "rafAdi", s.id AS "salonId",
  s.kod AS "salonKodu", s.ad AS "salonAdi", g.bolme, g.kat, g.goz, k.kod, k.ad, k.doluluk,
  k.kaydeden_kisi_id AS "kaydedenKisiId", ${ISO('k.kaydedildi')} AS kaydedildi`;
const GOZ_KALEMI_KAYNAK = `atolye_goz_kalemi k JOIN atolye_goz g ON g.id = k.goz_id JOIN atolye_raf r ON r.id = g.raf_id
  JOIN atolye_salon s ON s.id = r.salon_id`;

export function gozKalemleri(db: Db, salonId: number | null): Promise<GozKalemiSatiri[]> {
  return db.sorgu<GozKalemiSatiri>(
    `SELECT ${GOZ_KALEMI} FROM ${GOZ_KALEMI_KAYNAK} WHERE $1::int IS NULL OR s.id = $1 ORDER BY r.kod, g.bolme, g.kat, g.goz, k.kod_anahtari`,
    [salonId],
  );
}

export function gozKalemiBul(db: Db, id: number): Promise<GozKalemiSatiri | null> {
  return db.tek<GozKalemiSatiri>(`SELECT ${GOZ_KALEMI} FROM ${GOZ_KALEMI_KAYNAK} WHERE k.id = $1`, [id]);
}

// Göz kilitlenir: aynı göze eşzamanlı atama doluluğu birlikte aşmasın.
export function gozKilitle(db: Db, gozId: number): Promise<{ id: number; rafAktif: boolean } | null> {
  return db.tek<{ id: number; rafAktif: boolean }>(
    'SELECT g.id, r.aktif AS "rafAktif" FROM atolye_goz g JOIN atolye_raf r ON r.id = g.raf_id WHERE g.id = $1 FOR UPDATE OF g',
    [gozId],
  );
}

export function gozunKalemleri(db: Db, gozId: number): Promise<{ kodAnahtari: string; doluluk: number }[]> {
  return db.sorgu<{ kodAnahtari: string; doluluk: number }>(
    'SELECT kod_anahtari AS "kodAnahtari", doluluk FROM atolye_goz_kalemi WHERE goz_id = $1',
    [gozId],
  );
}

export async function gozKalemiYaz(db: Db, anahtar: string, k: { gozId: number; kod: string; ad: string; doluluk: number }, kisiId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO atolye_goz_kalemi (goz_id, kod_anahtari, kod, ad, doluluk, kaydeden_kisi_id) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT ON CONSTRAINT atolye_goz_kalemi_tek DO UPDATE
       SET kod = EXCLUDED.kod, ad = EXCLUDED.ad, doluluk = EXCLUDED.doluluk, kaydeden_kisi_id = EXCLUDED.kaydeden_kisi_id, kaydedildi = now()
     RETURNING id`,
    [k.gozId, anahtar, k.kod, k.ad, k.doluluk, kisiId],
  );
  if (!satir) throw new Error('Göz kalemi yazılamadı');
  return satir.id;
}

export async function gozKalemiSil(db: Db, id: number): Promise<boolean> {
  return (await db.sorgu<{ id: number }>('DELETE FROM atolye_goz_kalemi WHERE id = $1 RETURNING id', [id])).length === 1;
}

// ---------- kroki (ATL-30) ----------

// Kapsam: bölüm kimliği ya da null (fabrika krokisi).
export type KrokiKapsami = number | null;

export interface KrokiSatiri {
  id: number;
  salonId: number | null;
  ad: string;
  boyutBayt: number;
  parcaSayisi: number;
  ozet: string;
  sayfa: number;
  olcek: string | null;
  donus: string | null;
  x: string | null;
  z: string | null;
  tamam: boolean;
  surum: number;
  kaydedenKisiId: number;
  kaydedildi: string;
}

const KROKI = `k.id, k.salon_id AS "salonId", k.ad, k.boyut_bayt AS "boyutBayt", k.parca_sayisi AS "parcaSayisi", k.ozet, k.sayfa,
  k.olcek::text AS olcek, k.hiza_donus::text AS donus, k.hiza_x::text AS x, k.hiza_z::text AS z, k.tamam, k.surum,
  k.kaydeden_kisi_id AS "kaydedenKisiId", ${ISO('k.kaydedildi')} AS kaydedildi`;

export function krokiBul(db: Db, kapsam: KrokiKapsami): Promise<KrokiSatiri | null> {
  return db.tek<KrokiSatiri>(`SELECT ${KROKI} FROM atolye_kroki k WHERE k.salon_id IS NOT DISTINCT FROM $1`, [kapsam]);
}

export function krokiKilitle(db: Db, kapsam: KrokiKapsami): Promise<KrokiSatiri | null> {
  return db.tek<KrokiSatiri>(`SELECT ${KROKI} FROM atolye_kroki k WHERE k.salon_id IS NOT DISTINCT FROM $1 FOR UPDATE OF k`, [kapsam]);
}

export async function krokiSil(db: Db, kapsam: KrokiKapsami): Promise<boolean> {
  return (await db.sorgu<{ id: number }>('DELETE FROM atolye_kroki WHERE salon_id IS NOT DISTINCT FROM $1 RETURNING id', [kapsam])).length === 1;
}

export async function krokiEkle(db: Db, kapsam: KrokiKapsami, k: KrokiKaydi, parcaSayisi: number, kisiId: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO atolye_kroki (salon_id, ad, boyut_bayt, parca_sayisi, ozet, sayfa, kaydeden_kisi_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [kapsam, k.ad, k.boyutBayt, parcaSayisi, k.ozet, k.sayfa, kisiId],
  );
}

// Aynı parça yeniden gönderilirse (kopan bağlantı) üzerine yazılır.
export async function krokiParcaYaz(db: Db, krokiId: number, sira: number, veri: Uint8Array): Promise<number> {
  await db.sorgu(
    `INSERT INTO atolye_kroki_parca (kroki_id, sira, veri) VALUES ($1, $2, $3)
     ON CONFLICT (kroki_id, sira) DO UPDATE SET veri = EXCLUDED.veri`,
    [krokiId, sira, Buffer.from(veri)],
  );
  const say = await db.tek<{ adet: number }>('SELECT count(*)::int AS adet FROM atolye_kroki_parca WHERE kroki_id = $1', [krokiId]);
  return say?.adet ?? 0;
}

// Tamamlamadan önce: gelen parça sayısı, toplam boyut, ilk 5 baytın (PDF imzası) base64'ü ve dosyanın özeti.
export async function krokiParcaDurumu(db: Db, krokiId: number): Promise<ParcaDurumu & { ozet: string | null }> {
  const d = await db.tek<ParcaDurumu & { ozet: string | null }>(
    `SELECT count(*)::int AS adet, COALESCE(sum(octet_length(veri)), 0)::int AS toplam,
            (SELECT encode(substring(veri FROM 1 FOR 5), 'base64') FROM atolye_kroki_parca WHERE kroki_id = $1 AND sira = 0) AS bas,
            encode(sha256(string_agg(veri, ''::bytea ORDER BY sira)), 'hex') AS ozet
       FROM atolye_kroki_parca WHERE kroki_id = $1`,
    [krokiId],
  );
  return d ?? { adet: 0, toplam: 0, bas: null, ozet: null };
}

export async function krokiTamamla(db: Db, krokiId: number): Promise<void> {
  await db.sorgu('UPDATE atolye_kroki SET tamam = true, surum = surum + 1 WHERE id = $1', [krokiId]);
}

export function krokiHizala(
  db: Db, krokiId: number, eskiSurum: number, h: { sayfa: number; olcek: number; donus: number; x: number; z: number }, kisiId: number,
): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE atolye_kroki SET sayfa = $3, olcek = $4, hiza_donus = $5, hiza_x = $6, hiza_z = $7, surum = surum + 1,
            kaydeden_kisi_id = $8, kaydedildi = now()
      WHERE id = $1 AND surum = $2 RETURNING id`,
    [krokiId, eskiSurum, h.sayfa, h.olcek, h.donus, h.x, h.z, kisiId],
  );
}

// PostgreSQL base64'ü 76 karakterde satıra böler; satır sonları atılır.
export function krokiParca(db: Db, kapsam: KrokiKapsami, sira: number): Promise<{ veri: string } | null> {
  return db.tek<{ veri: string }>(
    `SELECT translate(encode(p.veri, 'base64'), E'\\n', '') AS veri
       FROM atolye_kroki_parca p JOIN atolye_kroki k ON k.id = p.kroki_id
      WHERE k.salon_id IS NOT DISTINCT FROM $1 AND p.sira = $2 AND k.tamam`,
    [kapsam, sira],
  );
}
