import type { Db } from '#cekirdek/db.ts';
import type { EmirDurumu } from '#paylasilan/sozlesme/uretim-emirleri.ts';

// Siparişe bağlı üretim emirleri (iptal reddi): satırına bağlı olanlar (2103 a) ve siparişten açılan projenin emirleri (2103-2 b).
// Üretim emirleri ve projeler bu modülü ithal eder; bu modül onları ithal etseydi modüller döngüye girerdi (ADR 0006). Karşılık kablolama.ts'te kaydedilir. Çözücü iptalle aynı işlemde, çağıranın db'siyle okur.
export interface BagliEmir {
  emirNo: string;
  durum: EmirDurumu;
}

export type BagliEmirCozucusu = (db: Db, g: { siparisId: number; satirIdleri: readonly number[] }) => Promise<BagliEmir[]>;

let cozucu: BagliEmirCozucusu | null = null;
export function bagliEmirCozucusuKaydet(c: BagliEmirCozucusu | null): void { cozucu = c; }

// Kayıtsızken iptal sessizce geçmez: sunucu, örnek veri ve test ön yüklemesi kablolar; kablolanmamış süreç kuralı atlamamalı.
export async function bagliEmirler(db: Db, g: { siparisId: number; satirIdleri: readonly number[] }): Promise<BagliEmir[]> {
  if (cozucu === null) throw new Error('Sipariş iptali için bağlı emir çözücüsü kayıtlı değil (kablolama.ts).');
  return cozucu(db, g);
}

// SIP-19 (3254 a): emre bağlı kalemler (üretim emri satıra bağlı; satır emrin yabancı anahtarıyla korunur). Karşılık kablolama.ts'te
// kaydedilir. Yazma yolu kayıtsız çözücüyle geçmez; okuma yolu (ayrıntıdaki "emre bağlı" işareti) kayıtsızsa bağsız sayar.
export type KalemEmirCozucusu = (db: Db, satirIdleri: readonly number[]) => Promise<ReadonlySet<number>>;

let kalemCozucusu: KalemEmirCozucusu | null = null;
export function kalemEmirCozucusuKaydet(c: KalemEmirCozucusu | null): void { kalemCozucusu = c; }

export async function emreBagliKalemler(db: Db, satirIdleri: readonly number[]): Promise<ReadonlySet<number>> {
  if (kalemCozucusu === null) throw new Error('Onayı geri alınmış sipariş için emre bağlı kalem çözücüsü kayıtlı değil (kablolama.ts).');
  return satirIdleri.length === 0 ? new Set() : kalemCozucusu(db, satirIdleri);
}

export async function emreBagliKalemlerOku(db: Db, satirIdleri: readonly number[]): Promise<ReadonlySet<number>> {
  return kalemCozucusu === null || satirIdleri.length === 0 ? new Set() : kalemCozucusu(db, satirIdleri);
}
