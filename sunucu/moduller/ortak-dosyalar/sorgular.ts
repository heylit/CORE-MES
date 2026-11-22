import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { GecmisOlayi, VerilenDuzey } from '#paylasilan/sozlesme/ortak-dosyalar.ts';

export interface KlasorSatiri {
  id: number;
  ustId: number | null;
  ad: string;
  ozelYetki: boolean;
  surum: number;
  dosyaSayisi: number;
  kaynakTur: string | null;
  kaynakId: number | null;
  arsiv: boolean;
}

// Ağacın tamamı tek sorguda: yetki her istekte bütün zincirden çözülür (klasör sayısı yüzlerle sınırlı, VARSAYIM).
export function klasorleriOku(db: Db): Promise<KlasorSatiri[]> {
  return db.sorgu<KlasorSatiri>(
    `SELECT k.id, k.ust_id AS "ustId", k.ad, k.ozel_yetki AS "ozelYetki", k.surum, k.kaynak_tur AS "kaynakTur", k.kaynak_id AS "kaynakId", k.arsiv,
            (SELECT count(*)::int FROM ortak_dosyalar_dosya d WHERE d.klasor_id = k.id AND NOT d.arsiv) AS "dosyaSayisi"
       FROM ortak_dosyalar_klasor k ORDER BY k.id`,
  );
}

export function yetkileriOku(db: Db): Promise<{ klasorId: number; rolId: number; duzey: VerilenDuzey }[]> {
  return db.sorgu('SELECT klasor_id AS "klasorId", rol_id AS "rolId", duzey FROM ortak_dosyalar_yetki ORDER BY klasor_id, rol_id');
}

export function klasorKilitle(db: Db, id: number): Promise<{ id: number } | null> {
  return db.tek('SELECT id FROM ortak_dosyalar_klasor WHERE id = $1 FOR UPDATE', [id]);
}

export async function klasorEkle(
  db: Db,
  k: {
    ustId: number | null; ad: string; adAnahtari: string; ozelYetki: boolean; kisiId: number;
    kaynakTur?: string | null; kaynakId?: number | null; topluIs?: string | null;
  },
): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO ortak_dosyalar_klasor (ust_id, ad, ad_anahtari, ozel_yetki, olusturan_kisi_id, kaynak_tur, kaynak_id, toplu_is)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [k.ustId, k.ad, k.adAnahtari, k.ozelYetki, k.kisiId, k.kaynakTur ?? null, k.kaynakId ?? null, k.topluIs ?? null],
  );
  if (satir === null) throw new Error('Klasör eklenemedi.');
  return satir.id;
}

export function yetkiYaz(db: Db, id: number, surum: number, ozelYetki: boolean, kisiId: number): Promise<{ id: number } | null> {
  return db.tek(
    `UPDATE ortak_dosyalar_klasor SET ozel_yetki = $3, yetki_degistiren_kisi_id = $4, yetki_degisme_zamani = now(), surum = surum + 1
      WHERE id = $1 AND surum = $2 RETURNING id`,
    [id, surum, ozelYetki, kisiId],
  );
}

export async function klasorVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM ortak_dosyalar_klasor WHERE id = $1', [id])) !== null;
}

export async function yetkiSatirlariniYaz(db: Db, klasorId: number, satirlar: readonly { rolId: number; duzey: VerilenDuzey }[]): Promise<void> {
  await db.sorgu('DELETE FROM ortak_dosyalar_yetki WHERE klasor_id = $1', [klasorId]);
  if (satirlar.length === 0) return;
  await db.sorgu(
    `INSERT INTO ortak_dosyalar_yetki (klasor_id, rol_id, duzey)
     SELECT $1, r, d FROM unnest($2::int[], $3::text[]) AS t(r, d)`,
    [klasorId, satirlar.map((s) => s.rolId), satirlar.map((s) => s.duzey)],
  );
}

export interface DosyaSatiri {
  id: number;
  klasorId: number;
  ad: string;
  arsiv: boolean;
  surum: number;
  surumSirasi: number;
  surumId: number;
  ozet: string;
  boyut: number;
  yukleyenId: number;
  zaman: string;
  firmaId: number | null;
  projeId: number | null;
}

// Son sürüm yanal birleşimle; boyut bigint'tir, 200 MB tek dosya sınırı sayıya sığar.
const DOSYA_SECIMI = `SELECT d.id, d.klasor_id AS "klasorId", d.ad, d.arsiv, d.surum, s.sira AS "surumSirasi", s.id AS "surumId", s.ozet,
         s.boyut::int8::float8 AS boyut, s.yukleyen_kisi_id AS "yukleyenId", ${zamanMetni('s.zaman')} AS zaman,
         d.firma_id AS "firmaId", d.proje_id AS "projeId"
    FROM ortak_dosyalar_dosya d
    JOIN LATERAL (SELECT * FROM ortak_dosyalar_surum s WHERE s.dosya_id = d.id ORDER BY s.sira DESC LIMIT 1) s ON true`;

export function klasorDosyalari(db: Db, klasorId: number, ara: string | null): Promise<DosyaSatiri[]> {
  return db.sorgu<DosyaSatiri>(
    `${DOSYA_SECIMI} WHERE d.klasor_id = $1 AND NOT d.arsiv AND ($2::text IS NULL OR strpos(d.ad_anahtari, $2) > 0) ORDER BY d.ad_anahtari, d.id`,
    [klasorId, ara],
  );
}

// Görünür klasörlerdeki son yüklenen sürümler (Son eklenenler).
export function sonDosyalar(
  db: Db, klasorIdleri: readonly number[], ara: string | null, sinir: number, suzgec: { firmaId: number | null; projeId: number | null },
): Promise<DosyaSatiri[]> {
  return db.sorgu<DosyaSatiri>(
    `${DOSYA_SECIMI} WHERE d.klasor_id = ANY($1::int[]) AND NOT d.arsiv AND ($2::text IS NULL OR strpos(d.ad_anahtari, $2) > 0)
        AND ($4::int IS NULL OR d.firma_id = $4) AND ($5::int IS NULL OR d.proje_id = $5)
      ORDER BY s.zaman DESC, d.id DESC LIMIT $3`,
    [[...klasorIdleri], ara, sinir, suzgec.firmaId, suzgec.projeId],
  );
}

export function arsivDosyalari(db: Db, klasorIdleri: readonly number[], onayBekleyen: boolean): Promise<DosyaSatiri[]> {
  return db.sorgu<DosyaSatiri>(
    `${DOSYA_SECIMI} WHERE d.klasor_id = ANY($1::int[]) AND d.arsiv
        AND (NOT $2::boolean OR EXISTS (SELECT 1 FROM ortak_dosyalar_silme i WHERE i.dosya_id = d.id AND i.durum = 'acik'))
      ORDER BY d.arsiv_zamani DESC, d.id DESC`,
    [[...klasorIdleri], onayBekleyen],
  );
}

export async function arsivSayisi(db: Db, klasorIdleri: readonly number[]): Promise<number> {
  const s = await db.tek<{ n: number }>('SELECT count(*)::int AS n FROM ortak_dosyalar_dosya WHERE arsiv AND klasor_id = ANY($1::int[])', [[...klasorIdleri]]);
  return s?.n ?? 0;
}

export function dosyaOku(db: Db, klasorId: number, dosyaId: number): Promise<DosyaSatiri | null> {
  return db.tek<DosyaSatiri>(`${DOSYA_SECIMI} WHERE d.id = $1 AND d.klasor_id = $2`, [dosyaId, klasorId]);
}

// Aynı adlı etkin dosya; yeni sürüm eklenirken satır kilitlenir (aynı anda iki yükleme aynı sırayı almasın).
export function etkinDosyaKilitle(db: Db, klasorId: number, adAnahtari: string): Promise<{ id: number } | null> {
  return db.tek('SELECT id FROM ortak_dosyalar_dosya WHERE klasor_id = $1 AND ad_anahtari = $2 AND NOT arsiv FOR UPDATE', [klasorId, adAnahtari]);
}

export async function dosyaEkle(
  db: Db, d: { klasorId: number; ad: string; adAnahtari: string; firmaId: number | null; projeId: number | null },
): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    'INSERT INTO ortak_dosyalar_dosya (klasor_id, ad, ad_anahtari, firma_id, proje_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [d.klasorId, d.ad, d.adAnahtari, d.firmaId, d.projeId],
  );
  if (satir === null) throw new Error('Dosya eklenemedi.');
  return satir.id;
}

export async function surumEkle(db: Db, s: { dosyaId: number; ozet: string; boyut: number; kisiId: number }): Promise<{ id: number; sira: number }> {
  const satir = await db.tek<{ id: number; sira: number }>(
    `INSERT INTO ortak_dosyalar_surum (dosya_id, sira, ozet, boyut, yukleyen_kisi_id)
     SELECT $1, COALESCE(max(sira), 0) + 1, $2, $3, $4 FROM ortak_dosyalar_surum WHERE dosya_id = $1
     RETURNING id, sira`,
    [s.dosyaId, s.ozet, s.boyut, s.kisiId],
  );
  if (satir === null) throw new Error('Sürüm eklenemedi.');
  return satir;
}

export function dosyaSurumunuArtir(db: Db, dosyaId: number): Promise<unknown> {
  return db.sorgu('UPDATE ortak_dosyalar_dosya SET surum = surum + 1 WHERE id = $1', [dosyaId]);
}

export function arsivYaz(db: Db, dosyaId: number, surum: number, arsiv: boolean, kisiId: number): Promise<{ id: number } | null> {
  return db.tek(
    arsiv
      ? `UPDATE ortak_dosyalar_dosya SET arsiv = true, arsiv_kisi_id = $3, arsiv_zamani = now(), surum = surum + 1
          WHERE id = $1 AND surum = $2 AND NOT arsiv RETURNING id`
      : `UPDATE ortak_dosyalar_dosya SET arsiv = false, geri_alan_kisi_id = $3, geri_alma_zamani = now(), surum = surum + 1
          WHERE id = $1 AND surum = $2 AND arsiv RETURNING id`,
    [dosyaId, surum, kisiId],
  );
}

export function surumleriOku(db: Db, dosyaId: number): Promise<{ id: number; sira: number; ozet: string; boyut: number; yukleyenId: number; zaman: string }[]> {
  return db.sorgu(
    `SELECT id, sira, ozet, boyut::int8::float8 AS boyut, yukleyen_kisi_id AS "yukleyenId", ${zamanMetni('zaman')} AS zaman
       FROM ortak_dosyalar_surum WHERE dosya_id = $1 ORDER BY sira DESC`,
    [dosyaId],
  );
}

export function surumOku(db: Db, dosyaId: number, sira: number): Promise<{ id: number; ozet: string } | null> {
  return db.tek('SELECT id, ozet FROM ortak_dosyalar_surum WHERE dosya_id = $1 AND sira = $2', [dosyaId, sira]);
}

export interface GecmisHam {
  olay: GecmisOlayi;
  kisiId: number | null;
  zaman: string;
  dosyaAdi: string | null;
  surumSirasi: number | null;
}

// Geçmiş, modülün kendi kayıtlarındaki kişi ve zamandan kurulur (ayrı tarihçe tablosu yok, ADR 0008). Arşiv ve yetkide yalnız son
// olay görünür; indirme ve önceki değişiklikler denetim kaydındadır, Geçmiş'e Aşama 2'de gelir (UYUM-BORCU).
export function gecmisOku(db: Db, klasorId: number, sinir: number): Promise<GecmisHam[]> {
  return db.sorgu<GecmisHam>(
    `SELECT o.olay, o."kisiId", ${zamanMetni('o.z')} AS zaman, o."dosyaAdi", o."surumSirasi" FROM (
       SELECT 'klasor-acildi' AS olay, olusturan_kisi_id AS "kisiId", olusturma_zamani AS z, NULL::text AS "dosyaAdi", NULL::int AS "surumSirasi"
         FROM ortak_dosyalar_klasor WHERE id = $1
       UNION ALL
       SELECT 'yetki-degisti', yetki_degistiren_kisi_id, yetki_degisme_zamani, NULL, NULL
         FROM ortak_dosyalar_klasor WHERE id = $1 AND yetki_degisme_zamani IS NOT NULL
       UNION ALL
       SELECT CASE WHEN s.sira = 1 THEN 'yuklendi' ELSE 'yeni-surum' END, s.yukleyen_kisi_id, s.zaman, d.ad, s.sira
         FROM ortak_dosyalar_surum s JOIN ortak_dosyalar_dosya d ON d.id = s.dosya_id WHERE d.klasor_id = $1
       UNION ALL
       SELECT 'arsivlendi', arsiv_kisi_id, arsiv_zamani, ad, NULL FROM ortak_dosyalar_dosya WHERE klasor_id = $1 AND arsiv_zamani IS NOT NULL
       UNION ALL
       SELECT 'geri-alindi', geri_alan_kisi_id, geri_alma_zamani, ad, NULL FROM ortak_dosyalar_dosya WHERE klasor_id = $1 AND geri_alma_zamani IS NOT NULL
       UNION ALL
       -- Kalıcı silme defteri (3443): dosya silinse de satırı kalır; dört gözde istek ve sonucu ayrı olaydır.
       SELECT 'silme-istendi', isteyen_kisi_id, istek_zamani, dosya_adi, NULL FROM ortak_dosyalar_silme WHERE klasor_id = $1 AND dort_goz
       UNION ALL
       SELECT CASE durum WHEN 'silindi' THEN 'silindi' WHEN 'reddedildi' THEN 'silme-reddedildi' WHEN 'geri-cekildi' THEN 'silme-geri-cekildi'
                ELSE 'silme-dustu' END, sonuclayan_kisi_id, sonuc_zamani, dosya_adi, NULL
         FROM ortak_dosyalar_silme WHERE klasor_id = $1 AND durum <> 'acik'
     ) o ORDER BY o.z DESC LIMIT $2`,
    [klasorId, sinir],
  );
}

// Sürüm, bağın kaydı (sürüm kimliği) için önce açılır; boyut bağ kurulunca, aynı komutta yazılır.
export function surumBoyutuYaz(db: Db, surumId: number, boyut: number): Promise<unknown> {
  return db.sorgu('UPDATE ortak_dosyalar_surum SET boyut = $2 WHERE id = $1', [surumId, boyut]);
}

// Kayda bağlı klasörler (kart 3288).

export function kaynakKlasoru(db: Db, tur: string, id: number | null): Promise<{ id: number; ad: string; arsiv: boolean } | null> {
  return db.tek(
    'SELECT id, ad, arsiv FROM ortak_dosyalar_klasor WHERE kaynak_tur = $1 AND COALESCE(kaynak_id, 0) = COALESCE($2::int, 0)',
    [tur, id],
  );
}

// Üst düzeyde aynı adlı kişi klasörü (kök açılırken; Risk K1).
export function kokAdiDolu(db: Db, adAnahtari: string): Promise<{ id: number } | null> {
  return db.tek('SELECT id FROM ortak_dosyalar_klasor WHERE ust_id IS NULL AND ad_anahtari = $1', [adAnahtari]);
}

export function sistemAdiYaz(db: Db, id: number, ad: string, adAnahtari: string): Promise<unknown> {
  return db.sorgu(
    'UPDATE ortak_dosyalar_klasor SET ad = $2, ad_anahtari = $3, surum = surum + 1 WHERE id = $1 AND (ad <> $2 OR ad_anahtari <> $3)',
    [id, ad, adAnahtari],
  );
}

// Arşivden çıkarmada son arşivin kişisi ve zamanı iz olarak kalır.
export function klasorArsivYaz(db: Db, idler: readonly number[], arsiv: boolean, kisiId: number): Promise<{ id: number }[]> {
  if (!arsiv) {
    return db.sorgu('UPDATE ortak_dosyalar_klasor SET arsiv = false, surum = surum + 1 WHERE id = ANY($1::int[]) AND arsiv RETURNING id', [[...idler]]);
  }
  return db.sorgu(
    `UPDATE ortak_dosyalar_klasor SET arsiv = true, arsiv_kisi_id = $2, arsiv_zamani = now(), surum = surum + 1
      WHERE id = ANY($1::int[]) AND NOT arsiv RETURNING id`,
    [[...idler], kisiId],
  );
}

export function sablonOku(db: Db): Promise<{ hedef: 'siparis' | 'proje'; ad: string }[]> {
  return db.sorgu('SELECT hedef, ad FROM ortak_dosyalar_sablon ORDER BY hedef, sira');
}

export async function sablonYaz(db: Db, hedef: 'siparis' | 'proje', adlar: readonly { ad: string; adAnahtari: string }[]): Promise<void> {
  await db.sorgu('DELETE FROM ortak_dosyalar_sablon WHERE hedef = $1', [hedef]);
  if (adlar.length === 0) return;
  await db.sorgu(
    `INSERT INTO ortak_dosyalar_sablon (hedef, sira, ad, ad_anahtari)
     SELECT $1, t.sira, t.ad, t.anahtar FROM unnest($2::text[], $3::text[]) WITH ORDINALITY AS t(ad, anahtar, sira)`,
    [hedef, adlar.map((a) => a.ad), adlar.map((a) => a.adAnahtari)],
  );
}

export function acilamayanYaz(
  db: Db, a: { tur: string; id: number; neden: string; zincir: unknown; kisiId: number },
): Promise<unknown> {
  return db.sorgu(
    `INSERT INTO ortak_dosyalar_acilamayan (kaynak_tur, kaynak_id, neden, zincir, kisi_id) VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (kaynak_tur, kaynak_id) DO UPDATE SET neden = EXCLUDED.neden, zincir = EXCLUDED.zincir, kisi_id = EXCLUDED.kisi_id, zaman = now()`,
    [a.tur, a.id, a.neden.slice(0, 500), JSON.stringify(a.zincir), a.kisiId],
  );
}

export function acilamayanSil(db: Db, tur: string, id: number): Promise<unknown> {
  return db.sorgu('DELETE FROM ortak_dosyalar_acilamayan WHERE kaynak_tur = $1 AND kaynak_id = $2', [tur, id]);
}

export function acilamayanOku(db: Db, tur: string, id: number): Promise<{ zincir: unknown } | null> {
  return db.tek('SELECT zincir FROM ortak_dosyalar_acilamayan WHERE kaynak_tur = $1 AND kaynak_id = $2 FOR UPDATE', [tur, id]);
}

export function acilamayanlar(db: Db): Promise<{ tur: 'firma' | 'siparis' | 'proje'; id: number; neden: string; zincir: unknown; zaman: string }[]> {
  return db.sorgu(
    `SELECT kaynak_tur AS tur, kaynak_id AS id, neden, zincir, ${zamanMetni('zaman')} AS zaman FROM ortak_dosyalar_acilamayan ORDER BY zaman DESC LIMIT 200`,
  );
}

// Klasörü olan kayıtların kimlikleri (toplu komutun klasörsüz sayımı için).
export function kaynakliKimlikler(db: Db): Promise<{ tur: string; id: number }[]> {
  return db.sorgu(`SELECT kaynak_tur AS tur, kaynak_id AS id FROM ortak_dosyalar_klasor WHERE kaynak_tur IN ('firma', 'siparis', 'proje')`);
}

export function topluIsler(db: Db): Promise<{ id: string; klasorSayisi: number; arsivde: number; zaman: string }[]> {
  return db.sorgu(
    `SELECT toplu_is AS id, count(*)::int AS "klasorSayisi", count(*) FILTER (WHERE arsiv)::int AS arsivde, ${zamanMetni('min(olusturma_zamani)')} AS zaman
       FROM ortak_dosyalar_klasor WHERE toplu_is IS NOT NULL GROUP BY toplu_is ORDER BY min(olusturma_zamani) DESC LIMIT 50`,
  );
}

// Toplu işin klasörleri; alt ağacında (şablon klasörleri dahil) dosya bulunanlar `dolu` işaretlidir: geri almada atlanır.
export function topluIsKlasorleri(db: Db, topluIs: string): Promise<{ id: number; dolu: boolean }[]> {
  return db.sorgu(
    `WITH RECURSIVE agac AS (
       SELECT id AS kok, id FROM ortak_dosyalar_klasor WHERE toplu_is = $1
       UNION ALL
       SELECT a.kok, k.id FROM ortak_dosyalar_klasor k JOIN agac a ON k.ust_id = a.id
     )
     SELECT a.kok AS id, bool_or(EXISTS (SELECT 1 FROM ortak_dosyalar_dosya d WHERE d.klasor_id = a.id)) AS dolu
       FROM agac a GROUP BY a.kok ORDER BY a.kok`,
    [topluIs],
  );
}

// Kalıcı silme (kart 3443).

// Silinecek ya da istenecek dosya satırı kilitlenir: aynı anda iki komut aynı dosyayı sonuçlamaz (Risk K3, S3).
export function dosyaKilitle(db: Db, klasorId: number, dosyaId: number): Promise<{ id: number; ad: string; arsiv: boolean; surum: number } | null> {
  return db.tek('SELECT id, ad, arsiv, surum FROM ortak_dosyalar_dosya WHERE id = $1 AND klasor_id = $2 FOR UPDATE', [dosyaId, klasorId]);
}

export interface SilmeIstegi { id: number; dosyaId: number; isteyenId: number; zaman: string; dosyaSurumu: number }

export function acikIstekKilitle(db: Db, dosyaId: number): Promise<SilmeIstegi | null> {
  return db.tek(
    `SELECT id, dosya_id AS "dosyaId", isteyen_kisi_id AS "isteyenId", ${zamanMetni('istek_zamani')} AS zaman, dosya_surumu AS "dosyaSurumu"
       FROM ortak_dosyalar_silme WHERE dosya_id = $1 AND durum = 'acik' FOR UPDATE`,
    [dosyaId],
  );
}

export function acikIstekler(db: Db, dosyaIdleri: readonly number[]): Promise<SilmeIstegi[]> {
  if (dosyaIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu(
    `SELECT id, dosya_id AS "dosyaId", isteyen_kisi_id AS "isteyenId", ${zamanMetni('istek_zamani')} AS zaman, dosya_surumu AS "dosyaSurumu"
       FROM ortak_dosyalar_silme WHERE dosya_id = ANY($1::int[]) AND durum = 'acik'`,
    [[...dosyaIdleri]],
  );
}

export async function silmeIstegiAc(
  db: Db, i: { klasorId: number; dosyaId: number; dosyaAdi: string; dosyaSurumu: number; kisiId: number },
): Promise<void> {
  await db.sorgu(
    `INSERT INTO ortak_dosyalar_silme (klasor_id, dosya_id, dosya_adi, dosya_surumu, dort_goz, isteyen_kisi_id, durum)
     VALUES ($1, $2, $3, $4, true, $5, 'acik')`,
    [i.klasorId, i.dosyaId, i.dosyaAdi, i.dosyaSurumu, i.kisiId],
  );
}

// Dört göz kapalıyken doğrudan silmenin satırı: isteyen ve silen aynı kişidir.
export async function dogrudanSilmeYaz(
  db: Db, i: { klasorId: number; dosyaId: number; dosyaAdi: string; dosyaSurumu: number; surumSayisi: number; kisiId: number },
): Promise<void> {
  await db.sorgu(
    `INSERT INTO ortak_dosyalar_silme (klasor_id, dosya_id, dosya_adi, dosya_surumu, surum_sayisi, dort_goz, isteyen_kisi_id, durum, sonuclayan_kisi_id, sonuc_zamani)
     VALUES ($1, $2, $3, $4, $5, false, $6, 'silindi', $6, now())`,
    [i.klasorId, i.dosyaId, i.dosyaAdi, i.dosyaSurumu, i.surumSayisi, i.kisiId],
  );
}

export async function istekSonucla(
  db: Db, id: number, durum: 'silindi' | 'reddedildi' | 'geri-cekildi' | 'dustu', kisiId: number, surumSayisi: number | null,
): Promise<void> {
  await db.sorgu(
    `UPDATE ortak_dosyalar_silme SET durum = $2, sonuclayan_kisi_id = $3, sonuc_zamani = now(), surum_sayisi = $4 WHERE id = $1 AND durum = 'acik'`,
    [id, durum, kisiId, surumSayisi],
  );
}

// Sürümler önce silinir (dosyaya yabancı anahtarları var); bağlar dosya modülünün tutamağıyla önceden kaldırılır.
export async function dosyaVeSurumleriniSil(db: Db, dosyaId: number): Promise<void> {
  await db.sorgu('DELETE FROM ortak_dosyalar_surum WHERE dosya_id = $1', [dosyaId]);
  await db.sorgu('DELETE FROM ortak_dosyalar_dosya WHERE id = $1', [dosyaId]);
}

// 3468-1: özeti verilen içeriğin etkin dosyalardaki sürümleri (aynı dosya uyarısı). Arşivdeki dosya sayılmaz; görünürlük
// süzgeci servistedir (klasör yetkisi). `son`: sürüm dosyanın son sürümü mü.
export function ozetliSurumler(db: Db, ozet: string): Promise<{ dosyaId: number; klasorId: number; ad: string; sira: number; son: boolean }[]> {
  return db.sorgu(
    `SELECT d.id AS "dosyaId", d.klasor_id AS "klasorId", d.ad, s.sira,
            s.sira = (SELECT max(s2.sira) FROM ortak_dosyalar_surum s2 WHERE s2.dosya_id = d.id) AS son
       FROM ortak_dosyalar_surum s JOIN ortak_dosyalar_dosya d ON d.id = s.dosya_id
      WHERE s.ozet = $1 AND NOT d.arsiv
      ORDER BY d.id, s.sira LIMIT 50`,
    [ozet],
  );
}

// Başka modülün seçicisi (3571): dosya kimliğiyle, klasörü bilinmeden; son sürümüyle.
export function dosyaIdle(db: Db, dosyaId: number): Promise<DosyaSatiri | null> {
  return db.tek<DosyaSatiri>(`${DOSYA_SECIMI} WHERE d.id = $1`, [dosyaId]);
}
