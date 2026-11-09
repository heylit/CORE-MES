import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { KmKategoriDurumu, KmKategoriTuru } from '#paylasilan/sozlesme/kalite-merkezi-kategori-onayi.ts';

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
