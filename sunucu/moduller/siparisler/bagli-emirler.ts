import type { Db } from '#cekirdek/db.ts';
import type { EmirDurumu } from '#paylasilan/sozlesme/uretim-emirleri.ts';

// Sipariş satırlarına bağlı üretim emirleri (2103 a, iptal reddi). Üretim emirleri bu modülü ithal eder; bu modül onu ithal etseydi
// modüller döngüye girerdi (ADR 0006). Karşılık kablolama.ts'te kaydedilir. Çözücü iptalle aynı işlemde, çağıranın db'siyle okur.
export interface BagliEmir {
  emirNo: string;
  durum: EmirDurumu;
}

export type BagliEmirCozucusu = (db: Db, satirIdleri: readonly number[]) => Promise<BagliEmir[]>;

let cozucu: BagliEmirCozucusu | null = null;
export function bagliEmirCozucusuKaydet(c: BagliEmirCozucusu | null): void { cozucu = c; }

// Kayıtsızken iptal sessizce geçmez: sunucu, örnek veri ve test ön yüklemesi kablolar; kablolanmamış süreç kuralı atlamamalı.
export async function bagliEmirler(db: Db, satirIdleri: readonly number[]): Promise<BagliEmir[]> {
  if (cozucu === null) throw new Error('Sipariş iptali için bağlı emir çözücüsü kayıtlı değil (kablolama.ts).');
  return satirIdleri.length === 0 ? [] : cozucu(db, satirIdleri);
}
