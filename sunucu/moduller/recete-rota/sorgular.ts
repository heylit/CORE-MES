import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { Kayit, Statu, StatuKarti, StatuTanimi, StatuTanimiKaydetGovdesi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { AdimBagiSatiri, JsondanSatirlar } from './kurallar.ts';

// Reçete ve Rota kayıt deposunun SQL'i. Sürüm tek sayaçtan gelir.

const SUTUNLAR = 'anahtar, bicim, deger, surum';

export async function kayitlar(db: Db): Promise<Kayit[]> {
  return db.sorgu<Kayit>(`SELECT ${SUTUNLAR} FROM recete_rota_kayit ORDER BY anahtar`);
}

export async function kayitGetir(db: Db, anahtar: string): Promise<Kayit | null> {
  return db.tek<Kayit>(`SELECT ${SUTUNLAR} FROM recete_rota_kayit WHERE anahtar = $1`, [anahtar]);
}

// Yazmadan önce satırı kilitler: aynı kayda eşzamanlı iki yazma sürüm denetiminden sırayla geçer. Kayıt yoksa ilk yazmayı
// birincil anahtar ayırır (eşzamanlı ikinci INSERT çakışma hatası verir).
export async function surumKilitle(db: Db, anahtar: string): Promise<number | null> {
  return (await db.tek<{ surum: number }>('SELECT surum FROM recete_rota_kayit WHERE anahtar = $1 FOR UPDATE', [anahtar]))?.surum ?? null;
}

export async function kayitEkle(db: Db, g: { anahtar: string; bicim: string; deger: unknown; kisiId: number }): Promise<Kayit | null> {
  return db.tek<Kayit>(
    `INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id)
     VALUES ($1, $2, $3::jsonb, nextval('recete_rota_surum'), $4)
     ON CONFLICT (anahtar) DO NOTHING
     RETURNING ${SUTUNLAR}`,
    [g.anahtar, g.bicim, JSON.stringify(g.deger), g.kisiId],
  );
}

export async function kayitGuncelle(db: Db, g: { anahtar: string; bicim: string; deger: unknown; kisiId: number }): Promise<Kayit | null> {
  return db.tek<Kayit>(
    `UPDATE recete_rota_kayit
        SET bicim = $2, deger = $3::jsonb, surum = nextval('recete_rota_surum'), guncelleyen_kisi_id = $4, guncellendi = now()
      WHERE anahtar = $1
      RETURNING ${SUTUNLAR}`,
    [g.anahtar, g.bicim, JSON.stringify(g.deger), g.kisiId],
  );
}

// Statü tanımı (kart #1107): kaynak adım (malzeme + OP) ve rota revizyonu başına tek satır, tek toplu sorgu. Aynı adımın yeniden kaydı çift açmaz; ad, malzeme no ve tür
// değiştiyse tazelenir, renk ilk açılışta kalır (satır değişmediyse yazılmaz).
export async function statuEsitle(db: Db, liste: readonly { malzemeNo: string; ad: string; kaynakAdim: string; renk: string; tur: string; rotaRevizyonuId: number | null }[]): Promise<void> {
  if (liste.length === 0) return;
  // Eski kimlikli satır (`o<opNo>`, malzemesiz) aynı malzemenin yeni kimliğine (`<malzeme>-o<opNo>`) taşınır: satır ve ona bağlı stok korunur.
  await db.sorgu(
    `UPDATE recete_rota_statu s SET kaynak_adim = y.kaynak_adim
       FROM unnest($1::text[], $2::text[]) AS y(malzeme_no, kaynak_adim)
      WHERE s.malzeme_no = y.malzeme_no AND y.kaynak_adim ~ '^[0-9]+-o[0-9]+$' AND s.kaynak_adim = regexp_replace(y.kaynak_adim, '^[0-9]+-', '')
        AND NOT EXISTS (SELECT 1 FROM recete_rota_statu x WHERE x.kaynak_adim = y.kaynak_adim)`,
    [liste.map((s) => s.malzemeNo), liste.map((s) => s.kaynakAdim)],
  );
  await db.sorgu(
    `INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur, rota_revizyonu_id)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[])
     ON CONFLICT (kaynak_adim, (coalesce(rota_revizyonu_id, 0))) DO UPDATE SET malzeme_no = EXCLUDED.malzeme_no, ad = EXCLUDED.ad, tur = EXCLUDED.tur
       WHERE (recete_rota_statu.malzeme_no, recete_rota_statu.ad, recete_rota_statu.tur) IS DISTINCT FROM (EXCLUDED.malzeme_no, EXCLUDED.ad, EXCLUDED.tur)`,
    [liste.map((s) => s.malzemeNo), liste.map((s) => s.ad), liste.map((s) => s.kaynakAdim), liste.map((s) => s.renk), liste.map((s) => s.tur), liste.map((s) => s.rotaRevizyonuId)],
  );
}

export async function statuler(db: Db): Promise<(Omit<Statu, 'urunKodu' | 'revizyon'> & { rotaRevizyonuId: number | null })[]> {
  return db.sorgu(
    `SELECT id, malzeme_no AS "malzemeNo", ad, kaynak_adim AS "kaynakAdim", renk, tur, rota_revizyonu_id AS "rotaRevizyonuId", ${zamanMetni('zaman')} AS zaman
       FROM recete_rota_statu ORDER BY id`,
  );
}

export async function statuKimligi(db: Db, kaynakAdim: string, rotaRevizyonuId: number | null): Promise<number | null> {
  return (await db.tek<{ id: number }>('SELECT id FROM recete_rota_statu WHERE kaynak_adim = $1 AND rota_revizyonu_id IS NOT DISTINCT FROM $2::int', [kaynakAdim, rotaRevizyonuId]))?.id ?? null;
}

export async function kayitSil(db: Db, anahtar: string): Promise<boolean> {
  return (await db.sorgu<{ anahtar: string }>('DELETE FROM recete_rota_kayit WHERE anahtar = $1 RETURNING anahtar', [anahtar])).length > 0;
}


// Taşıma tabloları (geçiş planı adım 3): ana durum kaydı her yazıldığında JSON'dan çıkan satırlar tablolara eşitlenir. Belge bütün
// hâli taşır: belgede olmayan satır silinir, değişen satırın sürümü artar, değişmeyene dokunulmaz. Kartı katalogda olmayan ya da belgede
// tanımlı olmayan statüye bağlanan değer yazılmaz (yabancı anahtar); göçteki kopya aynı süzgeci uygular. Bağ revizyonundadır; göçte
// revizyonsuz kalan eski satıra (revizyonu olmayan ürün) eşitleme dokunmaz.
export async function tasimaTablolariniEsitle(db: Db, s: JsondanSatirlar, kisiId: number): Promise<void> {
  // Statü tanımında tablo tek kaynaktır (komutla değişir): belgeden yalnız tabloda olmayan eklenir (eski ekranın ya da ilk açılışın varsayılan
  // statüleri); belgedeki farklı değer ya da belgeden kalkan statü tabloyu değiştirmez.
  await db.sorgu(
    `INSERT INTO recete_rota_statu_tanimi (kimlik, kod, ad, tur, renk, sira, guncelleyen_kisi_id)
     SELECT y.k, y.kod, y.ad, y.tur, y.renk, (SELECT coalesce(max(sira), -1) FROM recete_rota_statu_tanimi) + y.n, $6
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[]) WITH ORDINALITY AS y(k, kod, ad, tur, renk, n)
     ON CONFLICT (kimlik) DO NOTHING`,
    [s.statuTanimlari.map((x) => x.kimlik), s.statuTanimlari.map((x) => x.kod), s.statuTanimlari.map((x) => x.ad), s.statuTanimlari.map((x) => x.tur),
      s.statuTanimlari.map((x) => x.renk), kisiId],
  );
  const statuler = (await db.sorgu<{ kimlik: string }>('SELECT kimlik FROM recete_rota_statu_tanimi')).map((x) => x.kimlik);
  await db.sorgu(
    `WITH y AS (
       SELECT y.r, y.m, y.o, CASE WHEN EXISTS (SELECT 1 FROM malzeme_katalog_karti k WHERE k.no = y.c) THEN y.c END AS c,
              CASE WHEN y.s = ANY($5::text[]) THEN y.s END AS s
         FROM unnest($1::int[], $2::int[], $3::int[], $4::text[], $7::int[]) AS y(m, o, c, s, r)
        WHERE EXISTS (SELECT 1 FROM malzeme_katalog_karti k WHERE k.no = y.m)),
     istenen AS (SELECT * FROM y WHERE c IS NOT NULL OR s IS NOT NULL),
     sil AS (DELETE FROM recete_rota_adim_bagi b
              WHERE b.rota_revizyonu_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM istenen i WHERE i.r = b.rota_revizyonu_id AND i.o = b.op_no))
     INSERT INTO recete_rota_adim_bagi AS t (rota_revizyonu_id, malzeme_id, op_no, cikti_malzeme_id, cikti_statu, guncelleyen_kisi_id)
     SELECT r, m, o, c, s, $6 FROM istenen
     ON CONFLICT (rota_revizyonu_id, op_no) DO UPDATE SET cikti_malzeme_id = EXCLUDED.cikti_malzeme_id, cikti_statu = EXCLUDED.cikti_statu,
       surum = t.surum + 1, guncelleyen_kisi_id = EXCLUDED.guncelleyen_kisi_id, guncellendi = now()
       WHERE (t.cikti_malzeme_id, t.cikti_statu) IS DISTINCT FROM (EXCLUDED.cikti_malzeme_id, EXCLUDED.cikti_statu)`,
    [s.adimBaglari.map((x) => x.malzemeId), s.adimBaglari.map((x) => x.opNo), s.adimBaglari.map((x) => x.ciktiMalzemeId),
      s.adimBaglari.map((x) => x.ciktiStatu), statuler, kisiId, s.adimBaglari.map((x) => x.revizyonId)],
  );
  await db.sorgu(
    `WITH istenen AS (
       SELECT y.* FROM unnest($1::int[], $2::int[], $3::int[], $4::text[], $5::int[], $8::int[]) AS y(m, o, g, s, go, r)
        WHERE EXISTS (SELECT 1 FROM malzeme_katalog_karti k WHERE k.no = y.m) AND EXISTS (SELECT 1 FROM malzeme_katalog_karti k WHERE k.no = y.g)
          AND (y.s IS NULL OR y.s = ANY($6::text[]))),
     sil AS (DELETE FROM recete_rota_giren_statusu x
              WHERE x.rota_revizyonu_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM istenen i WHERE i.r = x.rota_revizyonu_id AND i.o = x.op_no AND i.g = x.giren_malzeme_id))
     INSERT INTO recete_rota_giren_statusu AS t (rota_revizyonu_id, malzeme_id, op_no, giren_malzeme_id, statu, giren_op_no, guncelleyen_kisi_id)
     SELECT r, m, o, g, s, go, $7 FROM istenen
     ON CONFLICT (rota_revizyonu_id, op_no, giren_malzeme_id) DO UPDATE SET statu = EXCLUDED.statu, giren_op_no = EXCLUDED.giren_op_no,
       guncelleyen_kisi_id = EXCLUDED.guncelleyen_kisi_id, guncellendi = now()
       WHERE (t.statu, t.giren_op_no) IS DISTINCT FROM (EXCLUDED.statu, EXCLUDED.giren_op_no)`,
    [s.girenStatuleri.map((x) => x.malzemeId), s.girenStatuleri.map((x) => x.opNo), s.girenStatuleri.map((x) => x.girenMalzemeId),
      s.girenStatuleri.map((x) => x.statu), s.girenStatuleri.map((x) => x.girenOpNo), statuler, kisiId, s.girenStatuleri.map((x) => x.revizyonId)],
  );
  // Statülü kartta da tablo tek kaynaktır (komutla açılır ve kaldırılır): belgeden yalnız tabloda olmayan eklenir, belgeden kalkan silinmez.
  await db.sorgu(
    `WITH istenen AS (
       SELECT y.* FROM unnest($1::int[], $2::text[]) AS y(m, s)
        WHERE EXISTS (SELECT 1 FROM malzeme_katalog_karti k WHERE k.no = y.m) AND y.s = ANY($3::text[]))
     INSERT INTO recete_rota_statu_karti (malzeme_id, statu, guncelleyen_kisi_id)
     SELECT m, s, $4 FROM istenen ON CONFLICT DO NOTHING`,
    [s.statuKartlari.map((x) => x.malzemeId), s.statuKartlari.map((x) => x.statu), statuler, kisiId],
  );
}

const STATU_TANIMI = 'kimlik AS id, kod AS code, ad AS name, tur AS kind, renk AS color, surum';

export async function statuTanimlari(db: Db): Promise<StatuTanimi[]> {
  return db.sorgu<StatuTanimi>(`SELECT ${STATU_TANIMI} FROM recete_rota_statu_tanimi ORDER BY sira, kimlik`);
}

export async function statuTanimiSurumu(db: Db, kimlik: string): Promise<number | null> {
  return (await db.tek<{ surum: number }>('SELECT surum FROM recete_rota_statu_tanimi WHERE kimlik = $1 FOR UPDATE', [kimlik]))?.surum ?? null;
}

// Yeni statü listenin sonuna girer.
export async function statuTanimiEkle(db: Db, kimlik: string, g: StatuTanimiKaydetGovdesi, kisiId: number): Promise<boolean> {
  const r = await db.sorgu(
    `INSERT INTO recete_rota_statu_tanimi (kimlik, kod, ad, tur, renk, sira, guncelleyen_kisi_id)
     VALUES ($1, $2, $3, $4, $5, (SELECT coalesce(max(sira), -1) + 1 FROM recete_rota_statu_tanimi), $6)
     ON CONFLICT (kimlik) DO NOTHING RETURNING kimlik`,
    [kimlik, g.code, g.name, g.kind, g.color, kisiId]);
  return r.length > 0;
}

export async function statuTanimiGuncelle(db: Db, kimlik: string, g: StatuTanimiKaydetGovdesi, kisiId: number): Promise<void> {
  await db.sorgu(
    `UPDATE recete_rota_statu_tanimi SET kod = $2, ad = $3, tur = $4, renk = $5, surum = surum + 1, guncelleyen_kisi_id = $6, guncellendi = now()
      WHERE kimlik = $1 AND (kod, ad, tur, renk) IS DISTINCT FROM ($2, $3, $4, $5)`,
    [kimlik, g.code, g.name, g.kind, g.color, kisiId]);
}

export async function statuKartlari(db: Db): Promise<StatuKarti[]> {
  return db.sorgu<StatuKarti>('SELECT malzeme_id::text AS "itemId", statu AS status FROM recete_rota_statu_karti ORDER BY malzeme_id, statu');
}

export async function statuKartiEkle(db: Db, malzemeId: number, statu: string, kisiId: number): Promise<void> {
  await db.sorgu('INSERT INTO recete_rota_statu_karti (malzeme_id, statu, guncelleyen_kisi_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [malzemeId, statu, kisiId]);
}

export async function statuKartiSil(db: Db, malzemeId: number, statu: string): Promise<void> {
  await db.sorgu('DELETE FROM recete_rota_statu_karti WHERE malzeme_id = $1 AND statu = $2', [malzemeId, statu]);
}

// Silinen statü bağlardan da kalkar (ekranın silmesiyle aynı): adımın statü bağı boşalır, giren statüsü ve statülü kart silinir.
export async function statuTanimiSil(db: Db, kimlik: string): Promise<void> {
  await db.sorgu('DELETE FROM recete_rota_giren_statusu WHERE statu = $1', [kimlik]);
  await db.sorgu('DELETE FROM recete_rota_statu_karti WHERE statu = $1', [kimlik]);
  await db.sorgu('DELETE FROM recete_rota_adim_bagi WHERE cikti_statu = $1 AND cikti_malzeme_id IS NULL', [kimlik]);
  await db.sorgu('UPDATE recete_rota_adim_bagi SET cikti_statu = NULL, surum = surum + 1, guncellendi = now() WHERE cikti_statu = $1', [kimlik]);
  await db.sorgu('DELETE FROM recete_rota_statu_tanimi WHERE kimlik = $1', [kimlik]);
}

// Adım bağları (sayımın okuduğu "çıkan" kalem ve statü bağı); malzeme verilirse yalnız o ürünün.
// Revizyon verilirse yalnız o revizyonun bağı.
export async function adimBaglari(db: Db, revizyonId: number | null): Promise<AdimBagiSatiri[]> {
  return db.sorgu<AdimBagiSatiri>(
    `SELECT rota_revizyonu_id AS "revizyonId", malzeme_id AS "malzemeId", op_no AS "opNo", cikti_malzeme_id AS "ciktiMalzemeId", cikti_statu AS "ciktiStatu"
       FROM recete_rota_adim_bagi WHERE $1::int IS NULL OR rota_revizyonu_id = $1 ORDER BY malzeme_id, rota_revizyonu_id, op_no`,
    [revizyonId],
  );
}

// Verilen ürünlerin adım bağları (gölge karşılaştırma yalnız belgede değişen ürüne bakar).
export async function urunlerinAdimBaglari(db: Db, malzemeIdleri: readonly number[]): Promise<AdimBagiSatiri[]> {
  return db.sorgu<AdimBagiSatiri>(
    `SELECT rota_revizyonu_id AS "revizyonId", malzeme_id AS "malzemeId", op_no AS "opNo", cikti_malzeme_id AS "ciktiMalzemeId", cikti_statu AS "ciktiStatu"
       FROM recete_rota_adim_bagi WHERE malzeme_id = ANY($1::int[]) ORDER BY malzeme_id, rota_revizyonu_id, op_no`,
    [malzemeIdleri],
  );
}
