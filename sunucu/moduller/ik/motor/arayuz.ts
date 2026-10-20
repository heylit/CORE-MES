import type { BordroSonucu, Donem, Govde } from '../kurallar.ts';
import { pd, ymd } from './bicim.ts';
import { createEngine, createMemoryDb } from './motor.ts';
import { PERIOD_KEYS } from './sabitler.ts';

// Parametre dönemine ait ayar anahtarları (ekrandaki motorun listesi).
export const DONEM_ANAHTARLARI: readonly string[] = PERIOD_KEYS as string[];

// Motorun sunucuda kullanılan yüzü, tipleriyle. Motor ekrandakinin aynısıdır (motor.ts); tablo ya da saat dışında bir şeye bakmaz.
export interface BordroGirdisi { brut: number; gun?: number | undefined; ek: number; mesaiSaat: number; tatilSaat: number; kesinti: number }

export interface IkMotoru {
  payroll(personel: Govde, donem: string): (BordroSonucu & { paramAd?: string }) | null;
  employedInMonth(personel: Govde, yil: number, ay: number): boolean;
  periods(): (Donem & { ad: string; params: Record<string, unknown> })[];
  periodAt(tarih: string): Donem & { ad: string };
  periodStatus(donem: Donem): { k: 'past' | 'future' | 'active'; l: string; lock: string };
  // Dönemin geçerli ayarları (genel ayar + dönem parametreleri; kayıtlı ayar yoksa ekrandaki varsayılanlar).
  settingsFor(donem: Donem): Record<string, unknown>;
  // Yıllık izin hak edişi ve kullanımı (gün); işe giriş yoksa hak 0.
  leaveBalance(personel: Govde, an: Date): IzinBakiyesi;
}

export interface IzinBakiyesi {
  hak: number; devir: number; onceki: number; used: number; pending: number; kalan: number; next: Date | null; nextDays: number; years: number;
}

// Motorun beklediği yerel gün başı; geçersiz metinde null.
export const motorGunu = (tarih: string): Date | null => pd(tarih) as Date | null;
export const gunMetni = (gun: Date): string => ymd(gun) as string;

export interface MotorKancasi {
  // Bu ay için verilen girdiler (kesinleştirmede istemcinin girdileri).
  draft?: (donem: string, personel: string) => BordroGirdisi | null;
  // Bu ayın kayıtlı sonucu yok sayılır, yeniden hesaplanır.
  unlocked?: (donem: string) => boolean;
}

export function motorKur(kayitlar: readonly Govde[], ayarlar: Govde | null, kanca: MotorKancasi = {}): IkMotoru {
  // Motor tipsizdir (motor.ts); girdiler burada tiplidir.
  const db = createMemoryDb({ records: [...kayitlar] as never[], settings: (ayarlar ?? {}) as never });
  return createEngine(db, kanca as never) as unknown as IkMotoru;
}
