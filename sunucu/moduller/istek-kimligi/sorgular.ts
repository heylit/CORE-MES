import type { Db } from '#cekirdek/db.ts';
import type { TekrarAnahtari, TekrarIstegi } from '#cekirdek/tekrar.ts';

// Aynı anahtarı eklemiş, henüz bitmemiş transaction varsa bu ifade onu bekler: o kalıcı olursa satır eklenmez,
// geri alınırsa eklenir. Eşzamanlı yinelemeyi sıraya sokan tek şey budur. Bekleme sınırlıdır; sınır yalnız bu ifade
// içindir, komutun geri kalanı oturumun kendi değeriyle koşar.
export async function anahtarEkle(db: Db, istek: TekrarIstegi, beklemeMs: number): Promise<boolean> {
  await db.sorgu("SELECT set_config('lock_timeout', $1, true)", [String(beklemeMs)]);
  const satir = await db.tek<{ kisi_id: number }>(
    `INSERT INTO istek_kimligi (kisi_id, istek_kimligi, uc, govde_ozeti) VALUES ($1, $2::uuid, $3, $4)
     ON CONFLICT (kisi_id, istek_kimligi) DO NOTHING
     RETURNING kisi_id`,
    [istek.kisiId, istek.istekKimligi, istek.uc, istek.govdeOzeti],
  );
  await db.sorgu('SET LOCAL lock_timeout TO DEFAULT');
  return satir !== null;
}

export interface AnahtarSatiri {
  govde_ozeti: string;
  durum_kodu: number | null;
  cevap: unknown;
}

export function anahtarBul(db: Db, anahtar: TekrarAnahtari): Promise<AnahtarSatiri | null> {
  return db.tek<AnahtarSatiri>(
    'SELECT govde_ozeti, durum_kodu, cevap FROM istek_kimligi WHERE kisi_id = $1 AND istek_kimligi = $2::uuid',
    [anahtar.kisiId, anahtar.istekKimligi],
  );
}

export async function sonucYaz(db: Db, anahtar: TekrarAnahtari, durumKodu: number, cevap: string | null): Promise<void> {
  await db.sorgu(
    'UPDATE istek_kimligi SET durum_kodu = $3, cevap = $4::jsonb WHERE kisi_id = $1 AND istek_kimligi = $2::uuid',
    [anahtar.kisiId, anahtar.istekKimligi, durumKodu, cevap],
  );
}

export async function anahtarSil(db: Db, anahtar: TekrarAnahtari): Promise<void> {
  await db.sorgu('DELETE FROM istek_kimligi WHERE kisi_id = $1 AND istek_kimligi = $2::uuid', [anahtar.kisiId, anahtar.istekKimligi]);
}

// Kilitli satır atlanır: aynı eski satırları silmeye kalkan eşzamanlı komutlar birbirini beklemez.
export async function eskileriSil(db: Db, saat: number, sinir: number): Promise<void> {
  await db.sorgu(
    `DELETE FROM istek_kimligi
      WHERE (kisi_id, istek_kimligi) IN (
        SELECT kisi_id, istek_kimligi FROM istek_kimligi
         WHERE olusma < now() - make_interval(hours => $1)
         ORDER BY olusma
         LIMIT $2
           FOR UPDATE SKIP LOCKED)`,
    [saat, sinir],
  );
}
