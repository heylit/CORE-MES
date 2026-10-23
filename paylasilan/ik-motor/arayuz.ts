import * as bicim from './bicim.ts';
import { createEngine, createMemoryDb } from './motor.ts';
import * as sabitler from './sabitler.ts';

// Motorun ekran ve sunucuda kullanılan yüzü, tipleriyle (211 a: tek kaynak). Motor tablo ya da saat dışında bir şeye bakmaz.
// Tipler sunucunun kural tipleriyle (sunucu/moduller/ik/kurallar.ts) yapıca aynıdır; paylasilan sunucuyu ithal edemez.
export type Govde = Record<string, unknown>;
export interface Donem { id: string; ad?: string; baslangic: string; params?: unknown }
export interface BordroSonucu {
  gun: number; brut: number; toplam: number; net: number; gv: number; dv: number; sgk: number; iss: number; maliyet: number;
  matrah: number; aMat: number; inp?: unknown; locked?: unknown; [alan: string]: unknown;
}

// Parametre dönemine ait ayar anahtarları (motorun listesi).
export const DONEM_ANAHTARLARI: readonly string[] = sabitler.PERIOD_KEYS as string[];

export interface BordroGirdisi { brut: number; gun?: number | undefined; ek: number; mesaiSaat: number; tatilSaat: number; kesinti: number }

export interface IzinBakiyesi {
  hak: number; devir: number; onceki: number; used: number; pending: number; kalan: number; next: Date | null; nextDays: number; years: number;
}

// Tipi bilinen işlevler.
export interface BilinenYuz {
  payroll(personel: Govde, donem: string): (BordroSonucu & { paramAd?: string }) | null;
  employedInMonth(personel: Govde, yil: number, ay: number): boolean;
  periods(): (Donem & { ad: string; params: Record<string, unknown> })[];
  periodAt(tarih: string): Donem & { ad: string };
  periodStatus(donem: Donem): { k: 'past' | 'future' | 'active'; l: string; lock: string };
  // Dönemin geçerli ayarları (genel ayar + dönem parametreleri; kayıtlı ayar yoksa motorun varsayılanları).
  settingsFor(donem: Donem): Record<string, unknown>;
  // Yıllık izin hak edişi ve kullanımı (gün); işe giriş yoksa hak 0.
  leaveBalance(personel: Govde, an: Date): IzinBakiyesi;
  fullName(e: Govde | null | undefined): string;
  activeEmps(): Govde[];
  sortedEmps(): Govde[];
  sortedDepts(): Govde[];
}

// Motorun öteki işlevleri; tam tipleri motor tiplenince gelir. O zamana kadar sonuç `unknown`dur, kullanan daraltır.
export const MOTOR_ISLEVLERI = [
  'pickParams', 'periodEnd', 'S', 'withPeriod', 'salaryHist', 'salaryAt', 'curBrut', 'nextRaise', 'empName', 'deptName', 'isActive',
  'docList', 'criteria', 'holidays', 'isHoliday', 'isWorkday', 'countDays', 'annualBase', 'ageMin', 'brackets', 'taxOn', 'calcMonth',
  'attHours', 'autoDaysInfo', 'engelliIndirim', 'payInputs', 'missingDocs', 'fiiliGun', 'benefitCfg', 'benefitCalc', 'benefitMonthly',
  'settingsList', 'tesvikById', 'tesvikOf', 'primMonths', 'primAmount', 'primDefaultOn', 'empPrims', 'primFor', 'primMonthlyKidem',
  'primDesc', 'P', 'noticeWeeks', 'sgkIsverenEtkin', 'exitCodeOf', 'noticeRule', 'severance', 'severanceCore', 'brutNetMonths',
  'netToBrut', 'channels', 'newJobCode', 'trackLink', 'autoPerks', 'postingParts', 'postingText', 'postingShort', 'postingHTML', 'postingChecks',
] as const;
export type IkMotoru = BilinenYuz & { [Ad in (typeof MOTOR_ISLEVLERI)[number]]: (...a: readonly unknown[]) => unknown };

// Motorun beklediği yerel gün başı; geçersiz metinde null.
export const motorGunu = (tarih: string): Date | null => bicim.pd(tarih) as Date | null;
export const gunMetni = (gun: Date): string => bicim.ymd(gun) as string;

export interface MotorKancasi {
  // Bu ay için verilen girdiler (kesinleştirmede istemcinin girdileri; ekranda bordro taslağı).
  draft?: (donem: string, personel: string) => BordroGirdisi | null;
  // Bu ayın kayıtlı sonucu yok sayılır, yeniden hesaplanır.
  unlocked?: (donem: string) => boolean;
}

export function motorKur(kayitlar: readonly Govde[], ayarlar: Govde | null, kanca: MotorKancasi = {}): IkMotoru {
  // Motor tipsizdir (motor.ts); girdiler burada tiplidir.
  const db = createMemoryDb({ records: [...kayitlar] as never[], settings: (ayarlar ?? {}) as never });
  return createEngine(db, kanca as never) as unknown as IkMotoru;
}

// Sabit listeler (izin türleri, aşamalar, çıkış kodları...) ve biçim yardımcıları; ekran seçenekleri buradan okur.
type Liste = readonly string[];
type Ciftler = readonly (readonly [string, string])[];
export interface IkSabitleri {
  QSETS: readonly Govde[]; DEFAULT_DOCS: Liste; DEFAULT_SETTINGS: Govde;
  LEAVE_TYPES: Liste; WORKDAY_LEAVES: Liste; LEAVE_STATES: Liste; ATT_TYPES: Liste; EXIT_CODES: Liste; KIDEM_CODES: Liste;
  STAGES: Liste; TRAIN_TYPES: Liste; INTV_TYPES: Liste; INTV_STATES: Liste; RECS: Liste; REC_CLS: Readonly<Record<string, string>>;
  REJECT_REASONS: Liste; DAYS_FULL: Liste; YEMEK_YONTEM: Liste; YOL_YONTEM: Liste; HESAP_OPTS: Liste;
  SIKLIK: Ciftler; PRIM_TUR: Ciftler; ATAMA: Ciftler; TESVIK_TUR: Ciftler; COLLARS: Liste; LEVELS: Liste; BLUE_KW: Liste;
  ASSET_TYPES: Liste; PERIOD_KEYS: Liste;
  inferCollar(pozisyon: string): string; inferLevel(pozisyon: string): string;
  collarOf(e: Govde): string; levelOf(e: Govde): string;
}
export const IK_SABITLERI = sabitler as unknown as IkSabitleri;

export interface IkBicimi {
  validTCKN(v: string): boolean; validIBAN(v: string): boolean; fmtIBAN(v: string): string;
  num(v: unknown): number; pd(v: string): Date | null; ymd(d: Date): string; today(): Date;
  fmtMoney(v: unknown, tam?: boolean): string; fmtNum(v: unknown): string; fmtDate(v: unknown): string; fmtDateShort(v: unknown): string;
  lines(v: unknown): string[];
  // Puanlanmamış değerlendirmede 0.
  perfAvg(degerlendirme: Govde): number; perfLabel(ortalama: number): readonly [string, string];
}
export const IK_BICIMI = bicim as unknown as IkBicimi;
