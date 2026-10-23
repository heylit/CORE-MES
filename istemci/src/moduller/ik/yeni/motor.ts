import type { Departman, IkAyarlar, Kayit, Personel } from './tipler.ts';

// Hesap motoru (bordro tahmini, izin hak edişi, tazminat, netten brüte, ilan metni) ekranın tek ithal yeridir. 211 a: motor tek
// kaynaktan, sunucuyla aynı kod olarak gelir; yeri karara bağlanınca yalnız `motorKaynagi` değişir. O gelene kadar motor yoktur
// (null) ve hesap gösteren yer "hazırlanıyor" der: ekranda ikinci bir kopya yazılmaz.

// Tipi sunucunun tipli yüzünden (sunucu/moduller/ik/motor/arayuz.ts) bilinenler.
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

// Motorun öteki işlevleri; tam tipleri motorla birlikte gelir (M0b). O zamana kadar sonuç `unknown`dur, kullanan daraltır.
export const MOTOR_ISLEVLERI = [
  'pickParams', 'periodEnd', 'S', 'withPeriod', 'salaryHist', 'salaryAt', 'curBrut', 'nextRaise', 'empName', 'deptName', 'isActive',
  'docList', 'criteria', 'holidays', 'isHoliday', 'isWorkday', 'countDays', 'annualBase', 'ageMin', 'brackets', 'taxOn', 'calcMonth',
  'attHours', 'autoDaysInfo', 'engelliIndirim', 'payInputs', 'missingDocs', 'fiiliGun', 'benefitCfg', 'benefitCalc', 'benefitMonthly',
  'settingsList', 'tesvikById', 'tesvikOf', 'primMonths', 'primAmount', 'primDefaultOn', 'empPrims', 'primFor', 'primMonthlyKidem',
  'primDesc', 'P', 'noticeWeeks', 'sgkIsverenEtkin', 'exitCodeOf', 'noticeRule', 'severance', 'severanceCore', 'brutNetMonths',
  'netToBrut', 'channels', 'newJobCode', 'trackLink', 'autoPerks', 'postingParts', 'postingText', 'postingShort', 'postingHTML', 'postingChecks',
] as const;
export type IkMotoru = BilinenYuz & { [Ad in (typeof MOTOR_ISLEVLERI)[number]]: (...a: readonly unknown[]) => unknown };

// Motorun sabit listeleri (motor/sabitler.ts); seçenek listeleri buradan okunur, parça kendi kopyasını yazmaz.
type Liste = readonly string[];
type Ciftler = readonly (readonly [string, string])[];
export interface IkSabitleri {
  QSETS: readonly Record<string, unknown>[]; DEFAULT_DOCS: Liste; DEFAULT_SETTINGS: Record<string, unknown>;
  LEAVE_TYPES: Liste; WORKDAY_LEAVES: Liste; LEAVE_STATES: Liste; ATT_TYPES: Liste; EXIT_CODES: Liste; KIDEM_CODES: Liste;
  STAGES: Liste; TRAIN_TYPES: Liste; INTV_TYPES: Liste; INTV_STATES: Liste; RECS: Liste; REC_CLS: Readonly<Record<string, string>>;
  REJECT_REASONS: Liste; DAYS_FULL: Liste; YEMEK_YONTEM: Liste; YOL_YONTEM: Liste; HESAP_OPTS: Liste;
  SIKLIK: Ciftler; PRIM_TUR: Ciftler; ATAMA: Ciftler; TESVIK_TUR: Ciftler; COLLARS: Liste; LEVELS: Liste; BLUE_KW: Liste;
  ASSET_TYPES: Liste; PERIOD_KEYS: Liste;
  inferCollar(pozisyon: string): string; inferLevel(pozisyon: string): string;
  collarOf(e: Personel): string; levelOf(e: Personel): string;
}

export interface MotorKaynagi {
  motorKur: (kayitlar: readonly Kayit[], ayarlar: IkAyarlar | null) => IkMotoru;
  sabitler: IkSabitleri;
}

// 211 a cevabıyla tek satır: `import { motorKur, sabitler } from '<yol>'` ve `export const motorKaynagi: MotorKaynagi | null = { motorKur, sabitler };`.
export const motorKaynagi: MotorKaynagi | null = null;

export function motorKur(kayitlar: readonly Kayit[], ayarlar: IkAyarlar | null, kaynak: MotorKaynagi | null = motorKaynagi): IkMotoru | null {
  return kaynak === null ? null : kaynak.motorKur(kayitlar, ayarlar);
}

export function ikSabitleri(kaynak: MotorKaynagi | null = motorKaynagi): IkSabitleri | null {
  return kaynak?.sabitler ?? null;
}

export const MOTOR_HAZIRLANIYOR = 'Hesap motoru hazırlanıyor';
