import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { KmKategoriDurumu, KmKategoriTuru, KmOnayTuru } from '#paylasilan/sozlesme/kalite-merkezi-kategori-onayi.ts';

export interface KararSatiri {
  firmaId: number; kategoriTuru: KmKategoriTuru; kategoriKodu: string; durum: KmKategoriDurumu; aciklama: string | null; kisiId: number; zaman: string; surum: number;
}

const SECIM = `firma_id AS "firmaId", kategori_turu AS "kategoriTuru", kategori_kodu AS "kategoriKodu", durum, aciklama, kisi_id AS "kisiId",
  ${zamanMetni('zaman')} AS zaman, surum`;

export function kararlar(db: Db, firmaIdler: readonly number[]): Promise<KararSatiri[]> {
  return db.sorgu(
    `SELECT ${SECIM} FROM kalite_merkezi_kategori_onayi WHERE firma_id = ANY($1::int[]) ORDER BY firma_id, kategori_turu, kategori_kodu`,
    [[...firmaIdler]],
  );
}

// Aynı anahtarda eşzamanlı iki yeni karardan biri yazar; öteki satır döndürmez ve 409 alır.
export function kararEkle(db: Db, k: Omit<KararSatiri, 'zaman' | 'surum'>): Promise<{ surum: number } | null> {
  return db.tek(
    `INSERT INTO kalite_merkezi_kategori_onayi (firma_id, kategori_turu, kategori_kodu, durum, aciklama, kisi_id) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (firma_id, kategori_turu, kategori_kodu) DO NOTHING RETURNING surum`,
    [k.firmaId, k.kategoriTuru, k.kategoriKodu, k.durum, k.aciklama, k.kisiId],
  );
}

// Değiştirme önce satırı kilitler: sürüm denetimi ile yazma arasına başkası giremez, önceki durum geçmişe doğru yazılır.
export function kararKilitle(db: Db, firmaId: number, tur: string, kod: string): Promise<{ durum: KmKategoriDurumu; surum: number } | null> {
  return db.tek(
    'SELECT durum, surum FROM kalite_merkezi_kategori_onayi WHERE firma_id = $1 AND kategori_turu = $2 AND kategori_kodu = $3 FOR UPDATE',
    [firmaId, tur, kod],
  );
}

export function kararGuncelle(db: Db, k: Omit<KararSatiri, 'zaman' | 'surum'>): Promise<{ surum: number } | null> {
  return db.tek(
    `UPDATE kalite_merkezi_kategori_onayi SET durum = $4, aciklama = $5, kisi_id = $6, zaman = clock_timestamp(), surum = surum + 1
     WHERE firma_id = $1 AND kategori_turu = $2 AND kategori_kodu = $3 RETURNING surum`,
    [k.firmaId, k.kategoriTuru, k.kategoriKodu, k.durum, k.aciklama, k.kisiId],
  );
}

export async function gecmisYaz(db: Db, k: Omit<KararSatiri, 'zaman' | 'surum'>, oncekiDurum: KmKategoriDurumu | null): Promise<void> {
  await db.sorgu(
    `INSERT INTO kalite_merkezi_kategori_onayi_gecmisi (firma_id, kategori_turu, kategori_kodu, onceki_durum, durum, aciklama, kisi_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [k.firmaId, k.kategoriTuru, k.kategoriKodu, oncekiDurum, k.durum, k.aciklama, k.kisiId],
  );
}

// 2466-2 a: firma geneli tedarikçi kayıtları ve son değiştiği an (askının tarihi). Firma kimliği okuması kalite-merkezi/sorgular.ts
// tedarikciKayitlari ile aynıdır.
export function tedarikciKayitlari(db: Db): Promise<{ firmaId: number | null; kod: string | null; ad: string; onay: string | null; degisti: string }[]> {
  return db.sorgu(
    `SELECT CASE WHEN jsonb_typeof(govde->'firmaId') = 'number' AND (govde->>'firmaId') ~ '^[1-9][0-9]{0,9}$' AND (govde->>'firmaId')::bigint <= 2147483647
                 THEN (govde->>'firmaId')::int END AS "firmaId",
            nullif(btrim(govde->>'kod'), '') AS kod, btrim(coalesce(govde->>'ad', '')) AS ad, govde->>'onay' AS onay, ${zamanMetni('degisti')} AS degisti
     FROM kalite_merkezi_belge WHERE koleksiyon = 'sup' AND govde IS NOT NULL ORDER BY kimlik`,
  );
}

// 3279 a: onaylı listenin firma geneli kayıt alanları. Tarih yalnız YYYY-AA-GG biçimindeyse, sertifikalar yalnız metin dizisiyse okunur;
// öteki biçim null ya da boş dizi döner (uydurulmaz). Firma kimliği okuması tedarikciKayitlari ile aynıdır.
export interface ListeKaydi {
  firmaId: number | null; kod: string | null; ad: string; onay: string | null; kritik: string | null; serts: string[]; sertBitis: string | null; sonDenetim: string | null;
}
const TARIH = (alan: string): string =>
  `CASE WHEN jsonb_typeof(govde->'${alan}') = 'string' AND (govde->>'${alan}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN govde->>'${alan}' END`;
export function listeKayitlari(db: Db): Promise<ListeKaydi[]> {
  return db.sorgu(
    `SELECT CASE WHEN jsonb_typeof(govde->'firmaId') = 'number' AND (govde->>'firmaId') ~ '^[1-9][0-9]{0,9}$' AND (govde->>'firmaId')::bigint <= 2147483647
                 THEN (govde->>'firmaId')::int END AS "firmaId",
            nullif(btrim(govde->>'kod'), '') AS kod, btrim(coalesce(govde->>'ad', '')) AS ad, govde->>'onay' AS onay,
            CASE WHEN jsonb_typeof(govde->'kritik') = 'string' THEN govde->>'kritik' END AS kritik,
            CASE WHEN jsonb_typeof(govde->'serts') = 'array'
                 THEN ARRAY(SELECT btrim(x) FROM jsonb_array_elements(govde->'serts') AS e(v), LATERAL (SELECT e.v #>> '{}' AS x) y
                            WHERE jsonb_typeof(e.v) = 'string' AND btrim(x) <> '') ELSE ARRAY[]::text[] END AS serts,
            ${TARIH('sertBitis')} AS "sertBitis", ${TARIH('sonDenetim')} AS "sonDenetim"
     FROM kalite_merkezi_belge WHERE koleksiyon = 'sup' AND govde IS NOT NULL ORDER BY kimlik`,
  );
}

// 3279 a: kategori kararı olan firmalar (kayıtları olmasa da listede görünürler).
export async function kararliFirmalar(db: Db): Promise<number[]> {
  return (await db.sorgu<{ firmaId: number }>('SELECT DISTINCT firma_id AS "firmaId" FROM kalite_merkezi_kategori_onayi ORDER BY 1')).map((r) => r.firmaId);
}

// 3279-2 a: şirket dışı onaylar. Kapsam satırları dizi olarak gelir ("tür|kod"); bitiş metin (YYYY-AA-GG).
export interface DigerOnaySatiri {
  id: number; firmaId: number; tur: KmOnayTuru; musteriFirmaId: number | null; ad: string | null; kapsamTumu: boolean; kapsam: string[];
  durum: KmKategoriDurumu; aciklama: string | null; bitis: string | null; belgeKimligi: string | null; kisiId: number; zaman: string; surum: number;
}
export function digerOnaylar(db: Db, firmaIdler: readonly number[] | null): Promise<DigerOnaySatiri[]> {
  return db.sorgu(
    `SELECT o.id, o.firma_id AS "firmaId", o.tur, o.musteri_firma_id AS "musteriFirmaId", o.ad, o.kapsam_tumu AS "kapsamTumu",
            ARRAY(SELECT k.kategori_turu || '|' || k.kategori_kodu FROM kalite_merkezi_tedarikci_onayi_kapsami k WHERE k.onay_id = o.id
                  ORDER BY k.kategori_turu, k.kategori_kodu) AS kapsam,
            o.durum, o.aciklama, to_char(o.bitis, 'YYYY-MM-DD') AS bitis, o.belge_kimligi AS "belgeKimligi", o.kisi_id AS "kisiId",
            ${zamanMetni('o.zaman')} AS zaman, o.surum
     FROM kalite_merkezi_tedarikci_onayi o WHERE $1::int[] IS NULL OR o.firma_id = ANY($1::int[]) ORDER BY o.firma_id, o.id`,
    [firmaIdler === null ? null : [...firmaIdler]],
  );
}

export interface DigerOnayYazimi {
  firmaId: number; tur: KmOnayTuru; musteriFirmaId: number | null; ad: string | null; kapsamTumu: boolean; durum: KmKategoriDurumu;
  aciklama: string | null; bitis: string | null; belgeKimligi: string | null; kisiId: number;
}
export function digerOnayEkle(db: Db, o: DigerOnayYazimi): Promise<{ id: number; surum: number } | null> {
  return db.tek(
    `INSERT INTO kalite_merkezi_tedarikci_onayi (firma_id, tur, musteri_firma_id, ad, kapsam_tumu, durum, aciklama, bitis, belge_kimligi, kisi_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, surum`,
    [o.firmaId, o.tur, o.musteriFirmaId, o.ad, o.kapsamTumu, o.durum, o.aciklama, o.bitis, o.belgeKimligi, o.kisiId],
  );
}

// Değiştirme satırı kilitler: sürüm denetimi ile yazma arasına başkası giremez; firma ve tür değişmez.
export function digerOnayKilitle(db: Db, id: number): Promise<{ firmaId: number; tur: KmOnayTuru; durum: KmKategoriDurumu; surum: number } | null> {
  return db.tek('SELECT firma_id AS "firmaId", tur, durum, surum FROM kalite_merkezi_tedarikci_onayi WHERE id = $1 FOR UPDATE', [id]);
}

export function digerOnayGuncelle(db: Db, id: number, o: DigerOnayYazimi): Promise<{ id: number; surum: number } | null> {
  return db.tek(
    `UPDATE kalite_merkezi_tedarikci_onayi SET musteri_firma_id = $2, ad = $3, kapsam_tumu = $4, durum = $5, aciklama = $6, bitis = $7, belge_kimligi = $8,
       kisi_id = $9, zaman = clock_timestamp(), surum = surum + 1
     WHERE id = $1 RETURNING id, surum`,
    [id, o.musteriFirmaId, o.ad, o.kapsamTumu, o.durum, o.aciklama, o.bitis, o.belgeKimligi, o.kisiId],
  );
}

// Kapsam alt tablosu her yazmada yeniden kurulur (ana satırın sürümü yazmayla artar).
export async function kapsamYaz(db: Db, onayId: number, kapsam: readonly { kategoriTuru: string; kategoriKodu: string }[]): Promise<void> {
  await db.sorgu('DELETE FROM kalite_merkezi_tedarikci_onayi_kapsami WHERE onay_id = $1', [onayId]);
  if (kapsam.length === 0) return;
  await db.sorgu(
    `INSERT INTO kalite_merkezi_tedarikci_onayi_kapsami (onay_id, kategori_turu, kategori_kodu)
     SELECT $1, t, k FROM unnest($2::text[], $3::text[]) AS u(t, k)`,
    [onayId, kapsam.map((x) => x.kategoriTuru), kapsam.map((x) => x.kategoriKodu)],
  );
}

export async function digerOnayGecmisiYaz(db: Db, onayId: number, oncekiDurum: KmKategoriDurumu | null, o: DigerOnayYazimi, kapsam: readonly string[]): Promise<void> {
  await db.sorgu(
    `INSERT INTO kalite_merkezi_tedarikci_onayi_gecmisi (onay_id, onceki_durum, durum, aciklama, bitis, kapsam_tumu, kapsam, kisi_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [onayId, oncekiDurum, o.durum, o.aciklama, o.bitis, o.kapsamTumu, [...kapsam], o.kisiId],
  );
}

// Belge Kalite Merkezi'nin belge deposundadır (koleksiyon 'belge'); onay yalnız kimliğiyle bağlanır.
// 3279-2 a: belge bu firmanın tedarikçi kaydına bağlı olmalı (belge.bagli = sup kaydı, kaydın firmaId'si bu firma). Ad ile eşlenen kaydın
// belgesi firma kimliği taşımadığından kabul edilmez.
export async function firmaBelgesiMi(db: Db, kimlik: string, firmaId: number): Promise<boolean> {
  return (await db.tek<{ v: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM kalite_merkezi_belge b
       JOIN kalite_merkezi_belge s ON s.koleksiyon = 'sup' AND s.kimlik = b.govde->'bagli'->>'id' AND s.govde IS NOT NULL
      WHERE b.koleksiyon = 'belge' AND b.kimlik = $1 AND b.govde IS NOT NULL AND b.govde->'bagli'->>'col' = 'sup'
        AND s.govde->'firmaId' = to_jsonb($2::int)) AS v`,
    [kimlik, firmaId],
  ))?.v ?? false;
}

export async function digerOnayliFirmalar(db: Db): Promise<number[]> {
  return (await db.sorgu<{ firmaId: number }>('SELECT DISTINCT firma_id AS "firmaId" FROM kalite_merkezi_tedarikci_onayi ORDER BY 1')).map((r) => r.firmaId);
}
