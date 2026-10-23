import { IK_BICIMI, IK_SABITLERI, MOTOR_ISLEVLERI, motorKur as ortakMotorKur, type IkBicimi, type IkSabitleri, type MotorKancasi } from '#paylasilan/ik-motor/arayuz.ts';
import type { Departman, IkAyarlar, Kayit, Personel } from './tipler.ts';

export type { IkBicimi, MotorKancasi };

// Hesap motoru (bordro tahmini, izin hak edişi, tazminat, netten brüte, ilan metni) ekranın tek ithal yeridir. 211 a: motor tek
// kaynaktır (paylasilan/ik-motor), sunucuyla aynı koddur; ekranda ikinci bir kopya yazılmaz. Tipler kayıt tipleriyle burada daralır.

// Tipi bilinenler (paylasilan/ik-motor/arayuz.ts), kayıt tipleriyle.
export interface Donem { id: string; ad: string; baslangic: string; not?: string; params: Record<string, unknown> }
export interface IzinBakiyesi {
  hak: number; devir: number; onceki: number; used: number; pending: number; kalan: number; next: Date | null; nextDays: number; years: number;
}
export interface BilinenYuz {
  fullName(e: Personel | null | undefined): string;
  payroll(personel: Personel, donem: string): (Record<string, unknown> & { paramAd?: string }) | null;
  employedInMonth(personel: Personel, yil: number, ay: number): boolean;
  periods(): Donem[];
  periodAt(tarih: string): Donem;
  periodStatus(donem: Donem): { k: 'past' | 'future' | 'active'; l: string; lock: string };
  settingsFor(donem: Donem): Record<string, unknown>;
  leaveBalance(personel: Personel, an: Date): IzinBakiyesi;
  activeEmps(): Personel[];
  sortedEmps(): Personel[];
  sortedDepts(): Departman[];
}

export { MOTOR_ISLEVLERI };
export type IkMotoru = BilinenYuz & { [Ad in (typeof MOTOR_ISLEVLERI)[number]]: (...a: readonly unknown[]) => unknown };

// Motorun sabit listeleri (paylasilan/ik-motor/sabitler.ts); seçenek listeleri buradan okunur, parça kendi kopyasını yazmaz.
export type { IkSabitleri };

export interface MotorKaynagi {
  motorKur: (kayitlar: readonly Kayit[], ayarlar: IkAyarlar | null, kanca?: MotorKancasi) => IkMotoru;
  sabitler: IkSabitleri;
  bicim: IkBicimi;
}

export const motorKaynagi: MotorKaynagi | null = {
  motorKur: (kayitlar, ayarlar, kanca) => ortakMotorKur(kayitlar, ayarlar, kanca) as unknown as IkMotoru,
  sabitler: IK_SABITLERI,
  bicim: IK_BICIMI,
};

// Kanca: bordro taslağı (`draft`) ve kilidi açılmış ay (`unlocked`); ekranda kesinleşmemiş girdilerle tahmin içindir.
export function motorKur(kayitlar: readonly Kayit[], ayarlar: IkAyarlar | null, kanca?: MotorKancasi, kaynak: MotorKaynagi | null = motorKaynagi): IkMotoru | null {
  return kaynak === null ? null : kaynak.motorKur(kayitlar, ayarlar, kanca);
}

export function ikSabitleri(kaynak: MotorKaynagi | null = motorKaynagi): IkSabitleri | null {
  return kaynak?.sabitler ?? null;
}

// T.C. kimlik ve IBAN doğrulaması, Türkçe sayı ayrıştırma: içe aktarma ve formlar motorun biçim yardımcılarını kullanır.
export function ikBicimi(kaynak: MotorKaynagi | null = motorKaynagi): IkBicimi | null {
  return kaynak?.bicim ?? null;
}

export const MOTOR_HAZIRLANIYOR = 'Hesap motoru hazırlanıyor';
