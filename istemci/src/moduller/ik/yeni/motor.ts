import { IK_BICIMI, IK_SABITLERI, MOTOR_ISLEVLERI, motorKur as ortakMotorKur, type IkBicimi, type IkSabitleri, type MotorKancasi } from '#paylasilan/ik-motor/arayuz.ts';
import type { Departman, IkAyarlar, Kayit, Personel } from './tipler.ts';

export type { IkBicimi, MotorKancasi };

// Hesap motoru (bordro tahmini, izin hak edişi, tazminat, netten brüte, ilan metni) ekranın tek ithal yeridir. 211 a: motor tek
// kaynaktır (paylasilan/ik-motor), sunucuyla aynı koddur; ekranda ikinci bir kopya yazılmaz. Tipler kayıt tipleriyle burada daralır.

// Tipi bilinenler (paylasilan/ik-motor/arayuz.ts), kayıt tipleriyle.
export interface Donem { id: string; ad: string; baslangic: string; not?: string; params: Record<string, unknown> }
export interface IzinBakiyesi {
  hak: number; devir: number; onceki: number; used: number; pending: number; kalan: number; next: Date | null; nextDays: number; years: number;
  // Hizmet yılı başına hak ediş: k. yıl, yıl dönümü, gün, yaş notu (yaş sınırıyla yükseltildiyse).
  rows: { k: number; ann: Date; d: number; note: string }[];
}
// Ayarlardaki prim ve teşvik satırları (motorun varsayılanları paylasilan/ik-motor/sabitler.ts).
export interface Prim {
  id: string; ad: string; tur: 'oran' | 'maas' | 'sabit'; deger: number; siklik: 'her' | 'ceyrek' | 'yarim' | 'yillik' | 'ozel';
  aylar: string; atama: 'yok' | 'herkes' | 'beyaz' | 'mavi'; kidem: boolean;
}
export interface Tesvik { id: string; ad: string; tur: 'yok' | 'puan' | 'asgari'; deger: number }
export type YanHak = 'yemek' | 'yol';
export interface YanHakAyari { yontem: string | undefined; hesap: string | undefined; deger: number; kisisel: boolean }
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
  // a..b (ikisi dahil) gün sayısı; isGunuIle verilirse yalnız iş günleri (pazar, ayarda kapalıysa cumartesi ve tatiller hariç).
  countDays(a: Date | null, b: Date | null, isGunuIle?: boolean): number;
  isWorkday(gun: Date): boolean;
  isHoliday(gun: Date): boolean;
  // Bugünün parametre dönemindeki geçerli ayarlar (genel ayar + dönem).
  S(): Record<string, unknown>;
  settingsList(k: 'primler'): Prim[];
  settingsList(k: 'tesvikler'): Tesvik[];
  tesvikById(id: string | undefined): Tesvik | null;
  // Kişinin teşviki; yoksa ayardaki varsayılan teşvik.
  tesvikOf(e: Personel | null | undefined): Tesvik | null;
  primDefaultOn(p: Prim, e: Personel): boolean;
  primDesc(p: Prim): string;
  // Kişide açık primler; v kişiye özel değer (yoksa undefined, primin değeri geçer).
  empPrims(e: Personel | null | undefined): { p: Prim; v: unknown }[];
  primMonthlyKidem(e: Personel): number;
  curBrut(e: Personel): number;
  benefitCfg(e: Personel | null | undefined, tur: YanHak): YanHakAyari;
  benefitMonthly(e: Personel): number;
  docList(): string[];
  missingDocs(e: Personel): string[];
}

export { MOTOR_ISLEVLERI };
type Digerleri = { [Ad in (typeof MOTOR_ISLEVLERI)[number]]: (...a: readonly unknown[]) => unknown };
export type IkMotoru = BilinenYuz & Omit<Digerleri, keyof BilinenYuz>;

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
