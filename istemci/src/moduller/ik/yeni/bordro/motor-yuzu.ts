import { motorKur, type Donem, type IkMotoru, type IzinBakiyesi, type MotorKancasi } from '../motor.ts';
import type { Bordro, Departman, IkAyarlar, Kayit, Personel } from '../tipler.ts';

// Motorun bordro, hesaplayıcı, maliyet planı ve ayar ekranlarında kullanılan yüzü, tipleriyle. Adlar ve sonuç alanları motorun
// kendisidir (ik-modulu core/engine.js); motor yalnız birkaç işlevi tipli verir (paylasilan/ik-motor/arayuz.ts), gerisi burada daraltılır. Ekran hesap yapmaz, yalnız okur.

export interface YanHak { tutar: number; gvIst: number; sgkIst: number; ayni: boolean; yontem?: string; fg?: number; hizmet?: boolean }
export interface Tesvik { id: string; ad: string; tur: string; deger?: number; kanunNo?: string }
export interface PrimKalemi { ad: string; tutar: number }

export interface BordroGirdisi {
  brut: number; gun?: number; ek: number; mesaiSaat: number; tatilSaat: number; kesinti: number;
  _src?: 'draft' | 'saved' | 'auto' | 'locked'; primDetay?: readonly PrimKalemi[] | null;
}

// Bir ayın hesabı (calcMonth).
export interface AySonucu {
  aylik: number; gun: number; brut: number; ek: number; mesaiUcret: number; ucret: number; yemek: YanHak | null; yol: YanHak | null;
  yanTutar: number; toplam: number; sgkMatrah: number; sgk: number; iss: number; ind: number; matrah: number; cumOnce: number;
  gvHam: number; gvIst: number; gv: number; dvHam: number; dvIst: number; dv: number; bes: number; kesinti: number; net: number;
  ayni: number; banka: number; isvBrut: number; tesvik: Tesvik | null; tInd: number; isvSgk: number; isvIss: number; maliyet: number;
  aMat: number; primDetay: readonly PrimKalemi[] | null;
}

// Kişinin o ayki bordrosu (payroll): kesinleşmişse saklanan değerler, değilse hesap.
export interface BordroSonucu extends AySonucu { inp: BordroGirdisi; locked?: boolean; paramAd?: string }

export interface GunBilgisi { gun: number; why: readonly string[]; rapor?: number; ucretsiz?: number; eksik?: number }

export interface TazminatGirdisi { giris: string; cikis: string; brut: unknown; yanHak: unknown; kod: string; izinGun: unknown; cum: unknown }
export interface Tazminat {
  g: Date; c: Date; p: { y: number; m: number; d: number }; days: number; months: number; brut: number; yan: number; giy: number;
  tavan: number; esas: number; code: string; codeOk: boolean; yearOk: boolean; kYil: number; kAy: number; kGun: number; kBrut: number;
  kDv: number; kNet: number; weeks: number; nDays: number; daily: number; nBrut: number; nGv: number; nDv: number; nNet: number;
  rule: { due: 'isci' | 'isveren' | 'yok' | ''; text: string }; cum: number; izinGun: number; izBrut: number; izSgk: number;
  izGv: number; izDv: number; izNet: number;
}

export interface IzinHakSatiri { k: number; ann: Date; d: number; note: string }
export type IzinBakiyesiAyrintili = IzinBakiyesi & { rows: readonly IzinHakSatiri[] };

export interface DonemDurumu { k: 'past' | 'future' | 'active'; l: string; lock: string }

// Plan ve hesaplayıcının kurduğu sanal personel: motor yalnız okuduğu alanlara bakar.
export type SanalPersonel = Pick<Personel, 'id' | 'kind' | 'ad' | 'soyad' | 'iseGiris' | 'brutMaas' | 'departmanId' | 'pozisyon' | 'dogumTarihi'>;

export interface BordroMotoru {
  periods(): Donem[];
  periodAt(tarih: string): Donem;
  periodEnd(d: Donem): string | null;
  periodStatus(d: Donem): DonemDurumu;
  settingsFor(d: Donem): Record<string, unknown>;
  withPeriod<T>(tarih: string, is: () => T): T;
  P(anahtar: string): number;
  S(): Record<string, unknown>;
  pickParams(kaynak: Record<string, unknown>): Record<string, unknown>;
  payroll(e: Personel, ay: string): BordroSonucu | null;
  payInputs(e: Personel | SanalPersonel, yil: number, ay: number): (BordroGirdisi & Record<string, unknown>) | null;
  autoDaysInfo(e: Personel, yil: number, ay: number): GunBilgisi;
  employedInMonth(e: Personel, yil: number, ay: number): boolean;
  calcMonth(girdi: Record<string, unknown>, kumulatif: number, ay: number, asgariKumulatif?: number): AySonucu;
  brutNetMonths(brut: number): AySonucu[];
  netToBrut(net: number): AySonucu[];
  severance(g: TazminatGirdisi): Tazminat | null;
  leaveBalance(e: Personel | SanalPersonel, an?: Date): IzinBakiyesiAyrintili;
  noticeWeeks(ay: number, gun?: number): number;
  brackets(): [number, number][];
  exitCodeOf(kod: string | undefined): string;
  tesvikById(id: unknown): Tesvik | null;
  benefitMonthly(e: Personel): number;
  primMonthlyKidem(e: Personel): number;
  salaryAt(e: Personel, tarih: string): number;
  salaryHist(e: Personel): { tarih: string; brut: number; neden?: string; not?: string }[];
  curBrut(e: Personel): number;
  fullName(e: Personel | SanalPersonel | null | undefined): string;
  deptName(id: string | undefined): string;
  sortedEmps(): Personel[];
  activeEmps(): Personel[];
  sortedDepts(): Departman[];
}

export const bordroMotoru = (m: IkMotoru): BordroMotoru => m as unknown as BordroMotoru;

export const bordroKimligi = (personel: string, ay: string): string => `pay_${personel}_${ay}`;

export type BordroTaslagi = Readonly<Record<string, BordroGirdisi>>;

// Ekrandaki düzenleme (taslak) ve düzeltme modu motora kanca olarak verilir (çerçevedeki draft ve unlocked): taslak girdi o ayın
// girdisi yerine geçer, kilidi açılan ayın kesinleşmiş sonucu yok sayılır. Hesap yine motorundur; ekran yalnız girdiyi seçer.
export function taslakKancasi(ay: string, taslak: BordroTaslagi, kilitAcik: boolean): MotorKancasi {
  return {
    draft: (donem, personel) => (donem === ay ? taslak[personel] ?? null : null),
    unlocked: (donem) => kilitAcik && donem === ay,
  };
}

export function taslakliMotor(kayitlar: readonly Kayit[], ayarlar: IkAyarlar | null, ay: string, taslak: BordroTaslagi, kilitAcik: boolean): BordroMotoru | null {
  const m = motorKur(kayitlar, ayarlar, taslakKancasi(ay, taslak, kilitAcik));
  return m ? bordroMotoru(m) : null;
}
