import type { Db } from '#cekirdek/db.ts';
import type { Dilim } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { AnomaliOlayTuru, ArkonDeposu, ArkonKayitTuru } from '#paylasilan/sozlesme/arkon.ts';
import type { IletiAraligi, KayitSutunlari, KonumKimlikleri } from './kurallar.ts';

export interface BelgeSatiri {
  kimlik: string;
  surum: number;
  govde: unknown;
}

const BELGE = 'kimlik, surum::float8 AS surum, govde';

export function belgeler(db: Db, depo: ArkonDeposu): Promise<BelgeSatiri[]> {
  return db.sorgu<BelgeSatiri>(`SELECT ${BELGE} FROM arkon_belge WHERE depo = $1 ORDER BY kimlik`, [depo]);
}

// Emrin paketleri: emir paketi (`tmi-ue-<id>`) ve iş emri ya da parça paketleri (gövdedeki `tmi.emirId`).
export function emirPaketleri(db: Db, emirIdler: readonly number[]): Promise<{ emir_id: number; govde: unknown; degisti: string }[]> {
  return db.sorgu(
    `SELECT COALESCE(CASE WHEN kimlik ~ '^tmi-ue-[0-9]+$' THEN substring(kimlik from 8)::int END, (govde->'tmi'->>'emirId')::int) AS emir_id,
            govde, ${zamanMetni('degisti')} AS degisti
       FROM arkon_belge
      WHERE depo = 'pkgs' AND (kimlik = ANY($1::text[]) OR (jsonb_typeof(govde->'tmi'->'emirId') = 'number' AND govde->'tmi'->>'emirId' = ANY($2::text[])))`,
    [emirIdler.map((id) => `tmi-ue-${id}`), emirIdler.map(String)],
  );
}

export function belge(db: Db, depo: ArkonDeposu, kimlik: string): Promise<BelgeSatiri | null> {
  return db.tek<BelgeSatiri>(`SELECT ${BELGE} FROM arkon_belge WHERE depo = $1 AND kimlik = $2`, [depo, kimlik]);
}

// Yazmadan önce satır kilitlenir: aynı belgeye eşzamanlı ikinci yazım ilkinin sürümünü görerek karar verir.
export async function surumKilitle(db: Db, depo: ArkonDeposu, kimlik: string): Promise<number | null> {
  const satir = await db.tek<{ surum: number }>(
    'SELECT surum::float8 AS surum FROM arkon_belge WHERE depo = $1 AND kimlik = $2 FOR UPDATE',
    [depo, kimlik],
  );
  return satir?.surum ?? null;
}

// İlk yazımda iki istek aynı anda satır ekleyebilir: ikincisi birincil anahtara takılır, çakışma olarak döner.
export async function belgeYaz(
  db: Db, depo: ArkonDeposu, kimlik: string, govde: unknown, surum: number, kisiId: number,
): Promise<boolean> {
  const sonuc = await db.sorgu(
    `INSERT INTO arkon_belge (depo, kimlik, govde, surum, degistiren_id) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (depo, kimlik) DO UPDATE SET govde = EXCLUDED.govde, surum = EXCLUDED.surum,
       degistiren_id = EXCLUDED.degistiren_id, degisti = now()
     RETURNING kimlik`,
    [depo, kimlik, JSON.stringify(govde), surum, kisiId],
  );
  return sonuc.length > 0;
}

export async function belgeSil(db: Db, depo: ArkonDeposu, kimlik: string): Promise<void> {
  await db.sorgu('DELETE FROM arkon_belge WHERE depo = $1 AND kimlik = $2', [depo, kimlik]);
}

export async function kayitEkle(
  db: Db, tur: ArkonKayitTuru, s: KayitSutunlari, govde: unknown, kisiId: number, kimlikler: KonumKimlikleri,
): Promise<number | null> {
  const sonuc = await db.sorgu<{ id: number }>(
    `INSERT INTO arkon_kayit (tur, cid, zaman, makine, is_merkezi, emir_no, paket_id, madde_id, govde, kisi_id, istasyon_id, is_merkezi_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (tur, cid) DO NOTHING RETURNING id`,
    [tur, s.cid, s.zaman, s.makine, s.isMerkezi, s.emirNo, s.paketId, s.maddeId, JSON.stringify(govde), kisiId, kimlikler.istasyonId, kimlikler.isMerkeziId],
  );
  return sonuc[0]?.id ?? null;
}

// Kayıt başına tek yansıma (UNIQUE kayit_id); yinelenen kayıt yansıtılmaz. Yansıma satırı Arkon kaydıyla aynı işlemde yazılır.
export async function yansimaYaz(
  db: Db, kayitId: number, emirId: number | null, kisiId: number, sonuc: 'bekliyor' | 'yazildi' | 'reddedildi' | 'eslenemedi', neden: string | null,
): Promise<void> {
  await db.sorgu(
    `INSERT INTO arkon_tmi_yansima (kayit_id, emir_id, kisi_id, sonuc, neden) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (kayit_id) DO NOTHING`,
    [kayitId, emirId, kisiId, sonuc, neden],
  );
}

// Emir başına işleme kilidi (işlem sonuna kadar), bekletmeden yoklanır: başka işleyici tutuyorsa false.
export async function emirKilidiniDene(db: Db, emirId: number): Promise<boolean> {
  return (await db.tek<{ alindi: boolean }>('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS alindi', [`arkon-yansima-emir-${emirId}`]))?.alindi === true;
}

export async function kisaBekle(db: Db): Promise<void> {
  await db.sorgu('SELECT pg_sleep(0.05)');
}

export interface BekleyenYansima {
  id: number;
  kayit_id: number;
  cid: string;
  makine: string | null;
  is_merkezi: string | null;
  emir_no: string | null;
  tur: ArkonKayitTuru;
  govde: Record<string, unknown>;
  kisi_id: number;
  // Arkon kaydının zamanı (ISO); TMI satırları bununla yazılır.
  zaman: string;
  son_hata: string | null;
  // Yeniden deneme aralığı dolduysa (ya da hiç denenmediyse) true. Aralık denemeyle uzar: 5 sn x 2^deneme, en çok 1 saat.
  uygun: boolean;
}

// Emrin bekleyenleri Arkon kayıt sırasıyla: sıra bozulmadan işlenir.
export const BEKLEYEN_YANSIMALAR_SQL = `SELECT y.id::float8 AS id, y.kayit_id::float8 AS kayit_id, k.cid, k.makine, k.is_merkezi, k.emir_no, k.tur, k.govde, y.kisi_id, ${zamanMetni('k.zaman')} AS zaman, y.son_hata,
            (y.son_deneme IS NULL OR y.son_deneme < now() - make_interval(secs => least(3600::float8, 5 * power(2, least(y.deneme, 10))))) AS uygun
       FROM arkon_tmi_yansima y JOIN arkon_kayit k ON k.id = y.kayit_id
      WHERE y.sonuc = 'bekliyor' AND y.emir_id = $1
      ORDER BY y.kayit_id`;

export function bekleyenYansimalar(db: Db, emirId: number): Promise<BekleyenYansima[]> {
  return db.sorgu<BekleyenYansima>(BEKLEYEN_YANSIMALAR_SQL, [emirId]);
}

// Bekleyeni olan emirlerden yalnız ÖNDEKİ bekleyeni denemeye hazır (aralığı dolmuş) olanlar, en eski bekleyene göre: aralık bekleyen emirler sırayı doldurmaz.
export const BEKLEYEN_EMIRLER_SQL = `SELECT emir_id FROM (
    SELECT DISTINCT ON (emir_id) emir_id, kayit_id,
           (son_deneme IS NULL OR son_deneme < now() - make_interval(secs => least(3600::float8, 5 * power(2, least(deneme, 10))))) AS uygun
      FROM arkon_tmi_yansima WHERE sonuc = 'bekliyor' ORDER BY emir_id, kayit_id
  ) bas WHERE uygun ORDER BY kayit_id LIMIT $1`;

export async function bekleyenEmirler(db: Db, sinir: number): Promise<number[]> {
  const satirlar = await db.sorgu<{ emir_id: number }>(BEKLEYEN_EMIRLER_SQL, [sinir]);
  return satirlar.map((s) => s.emir_id);
}

export async function yansimaSonuclandir(db: Db, id: number, sonuc: 'yazildi' | 'reddedildi' | 'eslenemedi', neden: string | null): Promise<void> {
  await db.sorgu('UPDATE arkon_tmi_yansima SET sonuc = $2, neden = $3, son_deneme = now() WHERE id = $1 AND sonuc = \'bekliyor\'', [id, sonuc, neden]);
}

// Bu istekte TMI'nin reddettiği kayıtlar ve TMI'ye yazılamayan sayımlar (denetim #24): ret iletisi TMI kuralının kendi metnidir
// (operatöre olduğu gibi gösterilir). Beklenen eşlenemezleri çağıran ayıklar (`kurallar.ts gizliYansimaTuru`).
export function reddedilenYansimalar(
  db: Db, kayitIdleri: readonly number[],
): Promise<{ cid: string; neden: string; tur: string; sonuc: 'reddedildi' | 'eslenemedi'; emirId: number | null }[]> {
  if (kayitIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu(
    `SELECT k.cid, y.neden, k.tur, y.sonuc, y.emir_id AS "emirId" FROM arkon_tmi_yansima y JOIN arkon_kayit k ON k.id = y.kayit_id
      WHERE y.kayit_id = ANY($1::bigint[]) AND (y.sonuc = 'reddedildi' OR (y.sonuc = 'eslenemedi' AND k.tur = 'counts')) AND y.neden IS NOT NULL
      ORDER BY k.id`, [[...kayitIdleri]]);
}

// Reddedilmiş başlatmanın devralmayla yazıldığı kayıt: satır çözülmüştür (yalnız kişinin kendi kaydı ve yalnız reddedilmiş satır). Satır sayısını döner.
export async function yansimaDevralindi(db: Db, cid: string, kisiId: number, emirId: number): Promise<number> {
  const satirlar = await db.sorgu<{ id: number }>(
    `UPDATE arkon_tmi_yansima y SET sonuc = 'yazildi', neden = NULL, son_deneme = now()
       FROM arkon_kayit k
      WHERE k.id = y.kayit_id AND k.tur = 'events' AND k.cid = $1 AND y.kisi_id = $2 AND y.emir_id = $3 AND y.sonuc = 'reddedildi' RETURNING y.id`, [cid, kisiId, emirId]);
  return satirlar.length;
}

// Geçici hata: satır bekliyor kalır; deneme sayısı ve son hata saklanır.
export async function yansimaGecici(db: Db, id: number, hata: string): Promise<void> {
  await db.sorgu('UPDATE arkon_tmi_yansima SET deneme = deneme + 1, son_hata = $2, son_deneme = now() WHERE id = $1', [id, hata]);
}

// Geri alınan işlemenin nedeni emrin bekleyen satırlarına yazılır; deneme sayılmaz ve sayım ertelemesi işareti korunur.
export async function bekleyenlereNedenYaz(db: Db, emirId: number, ozet: string, ertelemeIsareti: string): Promise<void> {
  await db.sorgu(
    "UPDATE arkon_tmi_yansima SET son_hata = $2 WHERE emir_id = $1 AND sonuc = 'bekliyor' AND son_hata IS DISTINCT FROM $3",
    [emirId, ozet, ertelemeIsareti],
  );
}

export interface KayitSuzgeci {
  makine: string | null;
  isMerkezi: string | null;
  baslangic: Date | null;
  bitis: Date | null;
  emirNo: string | null;
  paketId: string | null;
  madde: number | null;
  sinir: number;
  // Kapsam dışı iş merkezlerinin kodları (boş: süzgeç yok). Satırın iş merkezi, istasyon (makine sütunu) ya da makine (mc) kodu burada ise satır dönmez.
  yasak: { merkez: readonly string[]; istasyon: readonly string[]; makine: readonly string[] };
  // Kısıtlı kişide: satır bu kodlardan en az birini taşımalı (null: kısıt yok).
  izinli: { merkez: readonly string[]; istasyon: readonly string[]; makine: readonly string[] } | null;
}

// Süzgeç verilmeyen alan koşul koymaz. Sıra eskiden yeniye; sınır en yenileri bırakır.
export const KAYITLAR_SQL = `SELECT govde, zaman FROM (
       SELECT id, govde, zaman FROM arkon_kayit
        WHERE tur = $1
          AND ($2::text IS NULL OR makine = $2) AND ($3::text IS NULL OR is_merkezi = $3)
          AND ($4::timestamptz IS NULL OR zaman >= $4) AND ($5::timestamptz IS NULL OR zaman < $5)
          AND ($6::text IS NULL OR emir_no = $6) AND ($7::text IS NULL OR paket_id = $7)
          AND ($8::int IS NULL OR madde_id = $8)
          AND NOT coalesce(is_merkezi = ANY($10::text[]), false) AND NOT coalesce(makine = ANY($11::text[]), false)
          AND NOT coalesce(govde->>'mc' = ANY($12::text[]), false)
          AND ($13::boolean IS NOT TRUE OR coalesce(is_merkezi = ANY($14::text[]), false) OR coalesce(makine = ANY($15::text[]), false)
               OR coalesce(govde->>'mc' = ANY($16::text[]), false))
        ORDER BY zaman DESC, id DESC LIMIT $9
     ) son ORDER BY zaman, id`;

export function kayitlar(db: Db, tur: ArkonKayitTuru, f: KayitSuzgeci): Promise<{ govde: Record<string, unknown>; zaman: Date }[]> {
  return db.sorgu(
    KAYITLAR_SQL,
    [tur, f.makine, f.isMerkezi, f.baslangic, f.bitis, f.emirNo, f.paketId, f.madde, f.sinir, f.yasak.merkez, f.yasak.istasyon, f.yasak.makine,
      f.izinli !== null, f.izinli?.merkez ?? [], f.izinli?.istasyon ?? [], f.izinli?.makine ?? []],
  );
}

// Tek paketin konum alanları (gövdenin tamamı okunmaz): sonuç, numune ve malzeme kayıtlarının kapsamı bundan çözülür.
export function paketKonumu(db: Db, kimlik: string): Promise<{ machine: string | null; mc: string | null } | null> {
  return db.tek("SELECT govde->>'machine' AS machine, govde->>'mc' AS mc FROM arkon_belge WHERE depo = 'pkgs' AND kimlik = $1", [kimlik]);
}

export function paketKonumlari(db: Db): Promise<{ kimlik: string; machine: string | null; mc: string | null }[]> {
  return db.sorgu("SELECT kimlik, govde->>'machine' AS machine, govde->>'mc' AS mc FROM arkon_belge WHERE depo = 'pkgs'");
}

export function paketKonumlariKimlikle(db: Db, kimlikler: readonly string[]): Promise<{ kimlik: string; machine: string | null; mc: string | null }[]> {
  return db.sorgu("SELECT kimlik, govde->>'machine' AS machine, govde->>'mc' AS mc FROM arkon_belge WHERE depo = 'pkgs' AND kimlik = ANY($1)", [kimlikler]);
}

export const PAKET_KONUMLARI_NO_SQL = "SELECT govde->>'machine' AS machine, govde->>'mc' AS mc FROM arkon_belge WHERE depo = 'pkgs' AND govde->>'no' = $1";

export function paketKonumlariNoIle(db: Db, no: string): Promise<{ machine: string | null; mc: string | null }[]> {
  return db.sorgu(PAKET_KONUMLARI_NO_SQL, [no]);
}

// Arkon büyük ikili veriyi belgede her derinlikte { "$blob": özet } diye anar (arkon/web/src/data/store.ts `toWire`).
export function dosyayiAnanBelgeler(db: Db, ozet: string): Promise<{ depo: ArkonDeposu; kimlik: string }[]> {
  return db.sorgu(
    `SELECT depo, kimlik FROM arkon_belge WHERE jsonb_path_exists(govde, '$.** ? (@."$blob" == $ozet)', jsonb_build_object('ozet', $1::text))`,
    [ozet]);
}

// Aynı parça yeniden gelirse (bağlantı kopup tekrar gönderildi) yenisi geçerlidir; şerit (özet, kişi) servis katmanında kişi kilidiyle korunur.
export async function parcaYaz(db: Db, ozet: string, sira: number, toplam: number, icerik: Buffer, yukleyenId: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO arkon_dosya_parcasi (ozet, sira, toplam, icerik, yukleyen_id) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (ozet, yukleyen_id, sira) DO UPDATE SET toplam = EXCLUDED.toplam, icerik = EXCLUDED.icerik`,
    [ozet, sira, toplam, icerik, yukleyenId],
  );
}

export async function seritParcaSayisi(db: Db, ozet: string, kisiId: number): Promise<number> {
  return (await db.tek<{ n: number }>('SELECT count(*)::int AS n FROM arkon_dosya_parcasi WHERE ozet = $1 AND yukleyen_id = $2', [ozet, kisiId]))?.n ?? 0;
}

// Kişi başına işlem kilidi: eşzamanlı ilk parçalar kişi sınırını aşmaz. Özet kilidi yalnız tamamlamada alınır (önce kişi, sonra depo, sonra özet).
export async function kisiKilitle(db: Db, kisiId: number): Promise<void> {
  await db.sorgu('SELECT pg_advisory_xact_lock(hashtext($1))', [`arkon-yukleme-kisi-${kisiId}`]);
}

// Depo geneli kilit: farklı kişilerin eşzamanlı yüklemeleri depo toplam sınırını birlikte aşmasın. Sıra: kişi, depo, özet.
export async function depoKilitle(db: Db): Promise<void> {
  await db.sorgu('SELECT pg_advisory_xact_lock(hashtext($1))', ['arkon-yukleme-depo']);
}

export async function ozetKilitle(db: Db, ozet: string): Promise<void> {
  await db.sorgu('SELECT pg_advisory_xact_lock(hashtext($1))', [`arkon-yukleme-ozet-${ozet}`]);
}

export async function kisiAcikYuklemeleri(db: Db, kisiId: number): Promise<{ adet: number; bayt: number }> {
  const satir = await db.tek<{ adet: number; bayt: number }>(
    `SELECT count(DISTINCT ozet)::int AS adet, coalesce(sum(length(icerik)), 0)::float8 AS bayt
       FROM arkon_dosya_parcasi WHERE yukleyen_id = $1`,
    [kisiId],
  );
  return satir ?? { adet: 0, bayt: 0 };
}

// Arkon şeridindeki açık yüklemelerin parçaları; tamamlanan dosyalar ortak depodadır (depo sınırı ikisinin toplamıdır).
export async function acikParcaBayti(db: Db): Promise<number> {
  const satir = await db.tek<{ bayt: number }>('SELECT coalesce(sum(length(icerik)), 0)::float8 AS bayt FROM arkon_dosya_parcasi');
  return satir?.bayt ?? 0;
}

export async function parcaBoyutu(db: Db, ozet: string, sira: number, kisiId: number): Promise<number> {
  const satir = await db.tek<{ boyut: number }>(
    'SELECT length(icerik)::float8 AS boyut FROM arkon_dosya_parcasi WHERE ozet = $1 AND sira = $2 AND yukleyen_id = $3', [ozet, sira, kisiId]);
  return satir?.boyut ?? 0;
}

// Yalnız verilen kişinin şeridini siler.
export async function yuklemeyiAt(db: Db, ozet: string, kisiId: number): Promise<void> {
  await db.sorgu('DELETE FROM arkon_dosya_parcasi WHERE ozet = $1 AND yukleyen_id = $2', [ozet, kisiId]);
}

export function parcalar(db: Db, ozet: string, kisiId: number): Promise<{ sira: number; toplam: number; icerik: Buffer }[]> {
  return db.sorgu('SELECT sira, toplam, icerik FROM arkon_dosya_parcasi WHERE ozet = $1 AND yukleyen_id = $2 ORDER BY sira', [ozet, kisiId]);
}

// Yarım kalmış yüklemeler bir gün sonra atılır.
export async function eskiParcalariSil(db: Db): Promise<void> {
  await db.sorgu("DELETE FROM arkon_dosya_parcasi WHERE zaman < now() - interval '1 day'");
}

export async function iletiEkle(db: Db, kaynak: string, govde: unknown): Promise<void> {
  await db.sorgu('INSERT INTO arkon_ileti (kaynak, govde) VALUES ($1, $2)', [kaynak, JSON.stringify(govde)]);
}

// Budama ileti eklerken yapılmaz: kayıt işleminin ortasındaki DELETE eşzamanlı kayıtları aynı satırlarda birbirine bekletiyordu (yük testi).
export async function eskiIletileriSil(db: Db): Promise<void> {
  await db.sorgu("DELETE FROM arkon_ileti WHERE zaman < now() - interval '15 minutes'");
}

// İleti aralığı: kalan en küçük ve en büyük kimlik (boşsa null) ve sayacın son değeri (hiç ileti yoksa 0). Budama eski satırları siler.
export async function iletiAraligi(db: Db): Promise<IletiAraligi> {
  const satir = await db.tek<IletiAraligi>(
    `SELECT min(id)::float8 AS taban, max(id)::float8 AS tavan,
            coalesce(pg_sequence_last_value(pg_get_serial_sequence('arkon_ileti', 'id')::regclass), 0)::float8 AS sayac
       FROM arkon_ileti`,
  );
  return satir ?? { taban: null, tavan: null, sayac: 0 };
}

export const AZAMI_ILETI = 500;

export function iletiler(
  db: Db, son: number, tavan: number, kaynak: string | null,
): Promise<{ id: number; govde: Record<string, unknown> }[]> {
  return db.sorgu(
    `SELECT id::float8 AS id, govde FROM arkon_ileti
      WHERE id > $1 AND id <= $2 AND ($3::text IS NULL OR kaynak <> $3)
      ORDER BY id LIMIT ${AZAMI_ILETI}`,
    [son, tavan, kaynak],
  );
}

// Geçici olmayan hata: deneme sayılır; sınıra ulaşan satır "hatali" olur (yeniden denenmez). Sonucu döner.
export async function yansimaGeciciOlmayan(db: Db, id: number, ozet: string, sinir: number): Promise<string> {
  const satir = await db.tek<{ sonuc: string }>(
    `UPDATE arkon_tmi_yansima SET deneme = deneme + 1, son_hata = $2, son_deneme = now(),
            sonuc = CASE WHEN deneme + 1 >= $3 THEN 'hatali' ELSE sonuc END,
            neden = CASE WHEN deneme + 1 >= $3 THEN $2 ELSE neden END
      WHERE id = $1 RETURNING sonuc`,
    [id, ozet, sinir],
  );
  return satir?.sonuc ?? 'bekliyor';
}

// TMI'ye yazılamayan kayıtlar (#243): yazılan dışındaki yansımalar, en yeni önce.
// Konum süzgeci kayıt listesindekiyle aynıdır (kayitlar): yasak kodu taşıyan satır dönmez; kısıtlı kişide satır izinli kodlardan birini taşımalıdır.
const KONUM_KOSULU = `NOT coalesce(k.is_merkezi = ANY($2::text[]), false) AND NOT coalesce(k.makine = ANY($3::text[]), false)
    AND NOT coalesce(k.govde->>'mc' = ANY($4::text[]), false)
    AND ($5::boolean IS NOT TRUE OR coalesce(k.is_merkezi = ANY($6::text[]), false) OR coalesce(k.makine = ANY($7::text[]), false)
         OR coalesce(k.govde->>'mc' = ANY($8::text[]), false))`;
// Gizli tür (#199 3. tur, TA2): kurallar dizisi (kod, sonuç, önek) parametredir; tür ifadesi her satır için ilk eşleşen kodu verir.
const GIZLI_TUR = `(SELECT g.kod FROM unnest($9::text[], $10::text[], $11::text[]) WITH ORDINALITY AS g(kod, sonuc, onek, sira)
    WHERE y.sonuc = g.sonuc AND (g.onek IS NULL OR starts_with(coalesce(y.neden, ''), g.onek)) ORDER BY g.sira LIMIT 1)`;
const YANSIMA_KAYNAGI = `FROM arkon_tmi_yansima y JOIN arkon_kayit k ON k.id = y.kayit_id
  WHERE y.sonuc <> 'yazildi' AND ($1::text IS NULL OR y.sonuc = $1) AND ${KONUM_KOSULU}`;
const YANSIMA_SUZGECI = `${YANSIMA_KAYNAGI} AND ($12::boolean OR ${GIZLI_TUR} IS NULL)`;

export interface KonumKodlari { merkez: readonly string[]; istasyon: readonly string[]; makine: readonly string[] }
export interface GizliKural { kod: string; sonuc: string; onek: string | null }
export interface YansimaSuzgeci { sonuc: string | null; yasak: KonumKodlari; izinli: KonumKodlari | null; gizli: readonly GizliKural[]; gizlileriGoster: boolean }

const yansimaParametreleri = (s: YansimaSuzgeci): unknown[] => [
  s.sonuc, s.yasak.merkez, s.yasak.istasyon, s.yasak.makine, s.izinli !== null, s.izinli?.merkez ?? [], s.izinli?.istasyon ?? [], s.izinli?.makine ?? [],
  s.gizli.map((g) => g.kod), s.gizli.map((g) => g.sonuc), s.gizli.map((g) => g.onek), s.gizlileriGoster,
];

export interface YansimaListeSatiri {
  id: number; sonuc: string; neden: string | null; son_hata: string | null; deneme: number; zaman: string; son_deneme: string | null;
  emir_id: number | null; tur: string; cid: string; kayit_zamani: string; paket_id: string | null; emir_no: string | null; gizli_tur: string | null;
}

export const YANSIMA_SAYIM_SQL = `SELECT count(*)::int AS toplam ${YANSIMA_SUZGECI}`;
export const yansimaSayimParametreleri = yansimaParametreleri;

export async function yansimaSay(db: Db, suzgec: YansimaSuzgeci): Promise<number> {
  return (await db.tek<{ toplam: number }>(YANSIMA_SAYIM_SQL, yansimaParametreleri(suzgec)))?.toplam ?? 0;
}

// Gizli tür başına satır sayısı; gösterme seçiminden bağımsızdır (durum süzgeci ve veri kapsamı uygulanır).
export async function gizliYansimaSayilari(db: Db, suzgec: YansimaSuzgeci): Promise<Map<string, number>> {
  const satirlar = await db.sorgu<{ kod: string; adet: number }>(
    `SELECT t.kod, count(*)::int AS adet FROM (SELECT ${GIZLI_TUR} AS kod ${YANSIMA_KAYNAGI}) t WHERE t.kod IS NOT NULL GROUP BY t.kod`,
    yansimaParametreleri(suzgec).slice(0, 11),
  );
  return new Map(satirlar.map((s) => [s.kod, s.adet]));
}

export function yansimalar(db: Db, suzgec: YansimaSuzgeci, dilim: Dilim): Promise<YansimaListeSatiri[]> {
  return db.sorgu<YansimaListeSatiri>(
    `SELECT y.id::float8 AS id, y.sonuc, y.neden, y.son_hata, y.deneme, ${zamanMetni('y.zaman')} AS zaman, ${zamanMetni('y.son_deneme')} AS son_deneme,
            y.emir_id, k.tur, k.cid, ${zamanMetni('k.zaman')} AS kayit_zamani, k.paket_id, k.emir_no, ${GIZLI_TUR} AS gizli_tur
     ${YANSIMA_SUZGECI} ORDER BY y.id DESC LIMIT $13 OFFSET $14`,
    [...yansimaParametreleri(suzgec), dilim.sinir, dilim.atla],
  );
}

export interface YenidenDenenecek { id: number; sonuc: string; emir_id: number | null; kayit_id: number; tur: string }

// Yeniden kuyruğa alınacak satırı işlem sonuna kadar kilitler (eşzamanlı ikinci istek bekler, sonra güncel sonucu görür). Konum süzgeci listedekiyle
// aynıdır: kişinin listede göremediği satır dönmez.
export function yansimaKilitle(db: Db, id: number, yasak: KonumKodlari, izinli: KonumKodlari | null): Promise<YenidenDenenecek | null> {
  return db.tek<YenidenDenenecek>(
    `SELECT y.id::float8 AS id, y.sonuc, y.emir_id, y.kayit_id::float8 AS kayit_id, k.tur
       FROM arkon_tmi_yansima y JOIN arkon_kayit k ON k.id = y.kayit_id
      WHERE y.id = $1 AND ${KONUM_KOSULU} FOR UPDATE OF y`,
    [id, ...yansimaParametreleri({ sonuc: null, yasak, izinli, gizli: [], gizlileriGoster: true }).slice(1, 8)],
  );
}

// Aynı emrin bu kayıttan sonraki durum kayıtlarından biri TMI'ye yazıldı mı.
export async function sonrakiDurumYazildi(db: Db, emirId: number, kayitId: number): Promise<boolean> {
  return (await db.tek<{ var: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM arkon_tmi_yansima y JOIN arkon_kayit k ON k.id = y.kayit_id
                     WHERE y.emir_id = $1 AND y.kayit_id > $2 AND y.sonuc = 'yazildi' AND k.tur = 'events') AS var`,
    [emirId, kayitId],
  ))?.var === true;
}

// "hatali" satırı yeni gibi kuyruğa alır (deneme sayacı sıfırlanır); başka sonuçtaki satıra dokunmaz.
export async function yansimaYenidenKuyruga(db: Db, id: number): Promise<boolean> {
  const satir = await db.tek<{ id: number }>(
    `UPDATE arkon_tmi_yansima SET sonuc = 'bekliyor', deneme = 0, son_hata = NULL, neden = NULL, son_deneme = NULL
      WHERE id = $1 AND sonuc = 'hatali' RETURNING id::float8 AS id`, [id]);
  return satir !== null;
}

export function yansimaSonucu(db: Db, id: number): Promise<{ sonuc: string; neden: string | null; son_hata: string | null } | null> {
  return db.tek('SELECT sonuc, neden, son_hata FROM arkon_tmi_yansima WHERE id = $1', [id]);
}

// Çağrıyı açan kişi: aynı çağrı kimlikli "open" aşamalı çağrı kaydının kişisi (kişi sunucuda oturumdan yazılır). Son 30 gün: tür ve zaman dizini kullanılır.
export async function cagriAcan(db: Db, cagri: string): Promise<number | null> {
  const satir = await db.tek<{ kisi_id: number }>(
    `SELECT kisi_id FROM arkon_kayit WHERE tur = 'calls' AND zaman > now() - interval '30 days'
        AND govde->>'callId' = $1 AND govde->>'phase' = 'open' ORDER BY id LIMIT 1`, [cagri]);
  return satir?.kisi_id ?? null;
}

// Parçanın şimdiye dek sayılan sağlam adedi (düzeltmeler dahil). Aynı kimlikle (cid) yeniden gelen satır sayılmaz: tekrar gönderim kendini aşmasın.
// Tam sayı olmayan fark TMI'ye yansımaz (kurallar `sayimKomutu`), burada da sayılmaz.
// İlk parça kapısı da paketin sayımını bununla okur (servis.ts `ilkParcaKapisi`).
export const PARCA_SAGLAMI_SQL = `SELECT coalesce(sum((govde->>'delta')::int), 0)::int AS adet FROM arkon_kayit
     WHERE tur = 'counts' AND paket_id = $1 AND govde->>'kind' = 'good' AND govde->>'delta' ~ '^-?[0-9]{1,9}$' AND ($2::text IS NULL OR cid <> $2)`;

export async function parcaSaglami(db: Db, paketId: string, haricCid: string | null): Promise<number> {
  const satir = await db.tek<{ adet: number }>(PARCA_SAGLAMI_SQL, [paketId, haricCid]);
  return satir?.adet ?? 0;
}

// Bölünmüş işin öteki parçalarının son olay durumu (parça başına en son eklenen olay); hiç olayı olmayan parça listede yoktur.
export async function kardesParcaDurumlari(db: Db, onek: string, haric: string): Promise<{ paketId: string; durum: string | null }[]> {
  return db.sorgu<{ paketId: string; durum: string | null }>(
    `SELECT DISTINCT ON (paket_id) paket_id AS "paketId", govde->>'state' AS durum FROM arkon_kayit
     WHERE tur = 'events' AND paket_id LIKE $1 || '%' AND paket_id <> $2 ORDER BY paket_id, id DESC`,
    [onek, haric],
  );
}

export const PAKET_ISTEKLERI_SQL = "SELECT govde FROM arkon_belge WHERE depo = 'requests' AND govde->>'pkgId' = $1";

export async function paketIstekleri(db: Db, paketId: string): Promise<unknown[]> {
  const satirlar = await db.sorgu<{ govde: unknown }>(PAKET_ISTEKLERI_SQL, [paketId]);
  return satirlar.map((s) => s.govde);
}

export interface SonOlaySatiri {
  id: number;
  tur: ArkonKayitTuru;
  zaman: Date;
  istasyon_kodu: string | null;
  istasyon_id: number | null;
  emir_no: string | null;
  kisi_id: number;
}

// Değişiklik günlüğü (audit) olay değildir. `sonraId` eklenme sırasıdır: çevrimdışı kuyruktan geç gelen satırın zamanı eskidir, kimliği yenidir.
// `isMerkezleri` kapsam süzgecidir (`kapsamSuzgeci`): null sınırsız; iş merkezi çözülemeyen kayıt kimsenin kapsamı dışında değildir.
export function sonOlaylar(
  db: Db, sonra: Date | null, sonraId: number | null, sinir: number, isMerkezleri: number[] | null = null,
): Promise<SonOlaySatiri[]> {
  return db.sorgu<SonOlaySatiri>(
    `SELECT id::float8 AS id, tur, zaman, makine AS istasyon_kodu, istasyon_id, emir_no, kisi_id FROM arkon_kayit
     WHERE tur IN ('events', 'counts', 'meas', 'calls') AND ($1::timestamptz IS NULL OR zaman > $1) AND ($2::bigint IS NULL OR id > $2)
       AND ($4::int[] IS NULL OR is_merkezi_id IS NULL OR is_merkezi_id = ANY($4::int[]))
     ORDER BY id DESC LIMIT $3`,
    [sonra, sonraId, sinir, isMerkezleri],
  );
}

/* ---------------- Üretim anomalisi gün kaydı (kart #1306) ---------------- */

export type AnomaliKirilimi = 'istasyon' | 'makine' | 'kisi' | 'is_emri';

export interface AnomaliGunuSatiri {
  tarih: string;
  durum: 'acik' | 'kesin';
}

export interface AnomaliKayitSatiri {
  tarih: string;
  kirilim: AnomaliKirilimi;
  kimlik: number;
  istasyonId: number | null;
  kaynakTur: 'makine' | 'kisi' | null;
  kaynakId: number | null;
  beklenen: number | null;
  uretilen: number | null;
  hurda: number | null;
  standartSn: number | null;
  calisilanSn: number | null;
  isaret: boolean | null;
}

export function anomaliGunleri(db: Db, bas: string, bit: string): Promise<AnomaliGunuSatiri[]> {
  return db.sorgu<AnomaliGunuSatiri>(
    'SELECT tarih::text AS tarih, durum FROM arkon_anomali_gunu WHERE tarih BETWEEN $1::date AND $2::date ORDER BY tarih', [bas, bit]);
}

export async function anomaliSatirlari(db: Db, bas: string, bit: string, kirilimlar: readonly AnomaliKirilimi[]): Promise<AnomaliKayitSatiri[]> {
  const satirlar = await db.sorgu<Omit<AnomaliKayitSatiri, 'beklenen'> & { beklenen: string | null }>(
    `SELECT tarih::text AS tarih, kirilim, kimlik, istasyon_id AS "istasyonId", kaynak_tur AS "kaynakTur", kaynak_id AS "kaynakId",
            beklenen::text AS beklenen, uretilen, hurda, standart_sn AS "standartSn", calisilan_sn AS "calisilanSn", isaret
       FROM arkon_anomali_satiri WHERE tarih BETWEEN $1::date AND $2::date AND kirilim = ANY($3::text[])
      ORDER BY tarih, kirilim, kimlik`,
    [bas, bit, [...kirilimlar]],
  );
  return satirlar.map((r) => ({ ...r, beklenen: r.beklenen === null ? null : Number(r.beklenen) }));
}

// Açık gün yazılır ya da yenilenir; kesinleşmiş gün bu yazmayla değişmez (koşul ve tetikleyici).
export async function anomaliGunuAc(
  db: Db, g: { tarih: string; hesaplama: string; girisYokDk: number | null; adetToleransYuzde: number | null },
): Promise<boolean> {
  const satir = await db.tek<{ tarih: string }>(
    `INSERT INTO arkon_anomali_gunu (tarih, durum, hesaplama, giris_yok_dk, adet_tolerans_yuzde) VALUES ($1::date, 'acik', $2::timestamptz, $3, $4)
     ON CONFLICT (tarih) DO UPDATE SET hesaplama = EXCLUDED.hesaplama, giris_yok_dk = EXCLUDED.giris_yok_dk, adet_tolerans_yuzde = EXCLUDED.adet_tolerans_yuzde
       WHERE arkon_anomali_gunu.durum = 'acik'
     RETURNING tarih::text AS tarih`,
    [g.tarih, g.hesaplama, g.girisYokDk, g.adetToleransYuzde],
  );
  return satir !== null;
}

export async function anomaliSatirlariYenile(db: Db, tarih: string, satirlar: readonly AnomaliKayitSatiri[]): Promise<void> {
  await db.sorgu('DELETE FROM arkon_anomali_satiri WHERE tarih = $1::date', [tarih]);
  if (satirlar.length === 0) return;
  await db.sorgu(
    `INSERT INTO arkon_anomali_satiri (tarih, kirilim, kimlik, istasyon_id, kaynak_tur, kaynak_id, beklenen, uretilen, hurda, standart_sn, calisilan_sn, isaret)
     SELECT $1::date, r.kirilim, r.kimlik, r."istasyonId", r."kaynakTur", r."kaynakId", r.beklenen, r.uretilen, r.hurda, r."standartSn", r."calisilanSn", r.isaret
       FROM jsonb_to_recordset($2::jsonb) AS r (kirilim text, kimlik int, "istasyonId" int, "kaynakTur" text, "kaynakId" int, beklenen numeric, uretilen int,
                                               hurda int, "standartSn" int, "calisilanSn" int, isaret boolean)`,
    [tarih, JSON.stringify(satirlar)],
  );
}

export async function anomaliGunuKesinlestir(db: Db, tarih: string): Promise<void> {
  await db.sorgu("UPDATE arkon_anomali_gunu SET durum = 'kesin', kapanis = now() WHERE tarih = $1::date AND durum = 'acik'", [tarih]);
}

/* ---------------- Üretim anomalisi zaman olayları (kart 764) ---------------- */

export interface AnomaliOlayiSatiri {
  id: number;
  tur: AnomaliOlayTuru;
  isEmriId: number;
  uretimEmriId: number | null;
  emirNo: string | null;
  opNo: number | null;
  istasyonId: number | null;
  kaynakTur: 'makine' | 'kisi' | null;
  kaynakId: number | null;
  kayitId: number | null;
  planSurumu: number | null;
  planAni: string | null;
  tabanAni: string | null;
  tabanDakika: number | null;
  gercekAni: string | null;
  dakika: number;
  kokOlayId: number | null;
  acilis: string;
  guncelleme: string;
  kapanis: string | null;
  bildirim: string | null;
}

const OLAY_SUTUNLARI = `id::float8 AS id, tur, is_emri_id AS "isEmriId", uretim_emri_id AS "uretimEmriId", emir_no AS "emirNo", op_no AS "opNo",
  istasyon_id AS "istasyonId", kaynak_tur AS "kaynakTur", kaynak_id AS "kaynakId", kayit_id::float8 AS "kayitId", plan_surumu AS "planSurumu",
  ${zamanMetni('plan_ani')} AS "planAni", ${zamanMetni('taban_ani')} AS "tabanAni", taban_dakika::float8 AS "tabanDakika", ${zamanMetni('gercek_ani')} AS "gercekAni",
  dakika::float8 AS dakika, kok_olay_id::float8 AS "kokOlayId", ${zamanMetni('acilis')} AS acilis, ${zamanMetni('guncelleme')} AS guncelleme,
  ${zamanMetni('kapanis')} AS kapanis, ${zamanMetni('bildirim')} AS bildirim`;

// Yenileme için: verilen iş emirlerinin bütün olayları ve iş emri listede olmasa da açık olan her olay.
export function anomaliOlaylariYenilenecek(db: Db, isEmriIdleri: readonly number[]): Promise<AnomaliOlayiSatiri[]> {
  return db.sorgu<AnomaliOlayiSatiri>(
    `SELECT ${OLAY_SUTUNLARI} FROM arkon_anomali_olayi WHERE is_emri_id = ANY($1::int[]) OR kapanis IS NULL ORDER BY id`, [[...isEmriIdleri]]);
}

// Sayfa için: açık olaylar ve verilen andan sonra açılan ya da kapanan olaylar, yeniden eskiye; sınırlı.
export function anomaliOlaylariGoster(db: Db, sonra: string, sinir: number): Promise<AnomaliOlayiSatiri[]> {
  return db.sorgu<AnomaliOlayiSatiri>(
    `SELECT ${OLAY_SUTUNLARI} FROM arkon_anomali_olayi
      WHERE kapanis IS NULL OR kapanis >= $1::timestamptz OR acilis >= $1::timestamptz
      ORDER BY (kapanis IS NULL) DESC, dakika DESC, id DESC LIMIT $2`, [sonra, sinir]);
}

export type YeniAnomaliOlayi = Omit<AnomaliOlayiSatiri, 'id' | 'guncelleme' | 'bildirim'>;

export async function anomaliOlayiAc(db: Db, o: YeniAnomaliOlayi): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO arkon_anomali_olayi (tur, is_emri_id, uretim_emri_id, emir_no, op_no, istasyon_id, kaynak_tur, kaynak_id, kayit_id, plan_surumu,
       plan_ani, taban_ani, taban_dakika, gercek_ani, dakika, kok_olay_id, acilis, guncelleme, kapanis)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $12::timestamptz, $13, $14::timestamptz, $15, $16, $17::timestamptz, $17::timestamptz, $18::timestamptz)
     RETURNING id::float8 AS id`,
    [o.tur, o.isEmriId, o.uretimEmriId, o.emirNo, o.opNo, o.istasyonId, o.kaynakTur, o.kaynakId, o.kayitId, o.planSurumu,
      o.planAni, o.tabanAni, o.tabanDakika, o.gercekAni, o.dakika, o.kokOlayId, o.acilis, o.kapanis],
  );
  return satir!.id;
}

// Yalnız açık olay güncellenir: kapanan olay bir daha değişmez. Plan anı ve açılış donmuştur, burada yazılmaz.
export async function anomaliOlayiGuncelle(
  db: Db, id: number, g: { dakika: number; tabanDakika: number | null; gercekAni: string | null; kokOlayId: number | null; guncelleme: string; kapanis: string | null },
): Promise<void> {
  await db.sorgu(
    `UPDATE arkon_anomali_olayi SET dakika = $2, taban_dakika = $3, gercek_ani = $4::timestamptz, kok_olay_id = $5, guncelleme = $6::timestamptz,
       kapanis = $7::timestamptz
      WHERE id = $1 AND kapanis IS NULL`,
    [id, g.dakika, g.tabanDakika, g.gercekAni, g.kokOlayId, g.guncelleme, g.kapanis],
  );
}

// 784 a: henüz olayı olmayan toplu sağlam girişleri. Aynı iş emrinin 5 saniye içindeki toplu satırları (sağlam ve hurda) tek giriştir; önceki
// giriş bundan önceki son sayımdır (3 günle sınırlı; yoksa null). Paket kimliği iş emri ya da parçasınındır (tmi-ie-<id>[-p<no>]).
export interface TopluSayimSatiri { kayitId: number; zaman: string; isEmriId: number; emirNo: string | null; adet: number; onceki: string | null }
const IS_EMRI_PAKETI = "substring(k.paket_id from '^tmi-ie-([0-9]+)(-p[0-9]+)?$')";
const AYNI_IS_EMRI = (t: string) => `${t}.paket_id ~ ('^tmi-ie-' || ${IS_EMRI_PAKETI} || '(-p[0-9]+)?$')`;
const OLUMLU_DELTA = (t: string) => `jsonb_typeof(${t}.govde->'delta') = 'number' AND (${t}.govde->>'delta')::numeric > 0`;
export function topluSayimlar(db: Db, sonra: string): Promise<TopluSayimSatiri[]> {
  return db.sorgu<TopluSayimSatiri>(
    `SELECT k.id::float8 AS "kayitId", ${zamanMetni('k.zaman')} AS zaman, ${IS_EMRI_PAKETI}::int AS "isEmriId", k.emir_no AS "emirNo",
            (SELECT sum((e.govde->>'delta')::numeric)::float8 FROM arkon_kayit e
              WHERE e.tur = 'counts' AND e.zaman BETWEEN k.zaman - interval '5 seconds' AND k.zaman + interval '5 seconds'
                AND e.govde->>'toplu' = 'true' AND ${OLUMLU_DELTA('e')} AND ${AYNI_IS_EMRI('e')}) AS adet,
            (SELECT ${zamanMetni('max(o.zaman)')} FROM arkon_kayit o
              WHERE o.tur = 'counts' AND o.zaman >= k.zaman - interval '3 days' AND o.zaman < k.zaman - interval '5 seconds' AND ${AYNI_IS_EMRI('o')}) AS onceki
       FROM arkon_kayit k
      WHERE k.tur = 'counts' AND k.zaman >= $1::timestamptz AND k.govde->>'toplu' = 'true' AND k.govde->>'kind' = 'good' AND ${OLUMLU_DELTA('k')}
        AND ${IS_EMRI_PAKETI} IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM arkon_anomali_olayi a WHERE a.tur = 'toplu-tutarsiz' AND a.kayit_id = k.id)
      ORDER BY k.zaman, k.id`, [sonra]);
}

// İş emrinin terminal durum kayıtları (çalışıyor, duraklatıldı, durdu...) aralıkta, aralık başındaki durumu veren son kayıt dahil.
export function isEmriDurumKayitlari(db: Db, isEmriId: number, bas: string, bit: string): Promise<{ zaman: string; durum: string | null }[]> {
  const ayni = "paket_id ~ ('^tmi-ie-' || $1::text || '(-p[0-9]+)?$')";
  return db.sorgu(
    `(SELECT ${zamanMetni('zaman')} AS zaman, govde->>'state' AS durum, zaman AS z FROM arkon_kayit
       WHERE tur = 'events' AND ${ayni} AND zaman <= $2::timestamptz AND zaman >= $2::timestamptz - interval '3 days' ORDER BY zaman DESC LIMIT 1)
     UNION ALL
     (SELECT ${zamanMetni('zaman')}, govde->>'state', zaman FROM arkon_kayit WHERE tur = 'events' AND ${ayni} AND zaman > $2::timestamptz AND zaman < $3::timestamptz)
     ORDER BY z`, [isEmriId, bas, bit]);
}

// Üretim Hazırlık kuyruk sırası (kart 527). Tablo küçüktür (açık işler kadar): paket okuması bütün satırları tek sorguda alır.
export interface KuyrukSirasiSatiri {
  isEmriId: number; parcaNo: number; istasyonId: number; sira: number; kisi: string; zaman: string;
}
export function kuyrukSiralari(db: Db): Promise<KuyrukSirasiSatiri[]> {
  return db.sorgu<KuyrukSirasiSatiri>(
    `SELECT s.is_emri_id AS "isEmriId", s.parca_no AS "parcaNo", s.istasyon_id AS "istasyonId", s.sira, k.ad AS kisi, ${zamanMetni('s.zaman')} AS zaman
       FROM arkon_kuyruk_sirasi s JOIN kisi k ON k.id = s.kisi_id`,
  );
}

// Aynı istasyonun iki sıralaması sırayla yürür: ikincisi birincinin yazdığı sırayı görür ve eski ekranı reddeder.
export async function kuyrukKilitle(db: Db, istasyonId: number): Promise<void> {
  await db.sorgu("SELECT pg_advisory_xact_lock(hashtext('arkon_kuyruk_sirasi'), $1)", [istasyonId]);
}

// İstasyonun sırası baştan yazılır: listedeki işler 1'den numaralanır (başka istasyondaki eski satırları da buraya taşınır), listede olmayan
// satırları silinir.
export async function kuyrukSirasiYaz(
  db: Db, istasyonId: number, satirlar: readonly { isEmriId: number; parcaNo: number }[], surum: number, kisiId: number,
): Promise<void> {
  await db.sorgu(
    `DELETE FROM arkon_kuyruk_sirasi s
      WHERE s.istasyon_id = $1
        AND NOT EXISTS (SELECT 1 FROM unnest($2::int[], $3::int[]) AS y(is_emri_id, parca_no) WHERE y.is_emri_id = s.is_emri_id AND y.parca_no = s.parca_no)`,
    [istasyonId, satirlar.map((s) => s.isEmriId), satirlar.map((s) => s.parcaNo)],
  );
  await db.sorgu(
    `INSERT INTO arkon_kuyruk_sirasi (is_emri_id, parca_no, istasyon_id, sira, surum, kisi_id)
     SELECT y.is_emri_id, y.parca_no, $1, y.sira::int, $4, $5 FROM unnest($2::int[], $3::int[]) WITH ORDINALITY AS y(is_emri_id, parca_no, sira)
     ON CONFLICT (is_emri_id, parca_no) DO UPDATE
        SET istasyon_id = EXCLUDED.istasyon_id, sira = EXCLUDED.sira, surum = EXCLUDED.surum, kisi_id = EXCLUDED.kisi_id, zaman = now()`,
    [istasyonId, satirlar.map((s) => s.isEmriId), satirlar.map((s) => s.parcaNo), surum, kisiId],
  );
}

export function kuyrukSirasiSil(db: Db, istasyonId: number): Promise<{ isEmriId: number; parcaNo: number }[]> {
  return db.sorgu('DELETE FROM arkon_kuyruk_sirasi WHERE istasyon_id = $1 RETURNING is_emri_id AS "isEmriId", parca_no AS "parcaNo"', [istasyonId]);
}
