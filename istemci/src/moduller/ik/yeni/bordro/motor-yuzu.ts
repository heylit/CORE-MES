import type { Donem, IkMotoru, Tesvik } from '../motor.ts';
import type { Personel } from '../tipler.ts';

// P3'ün motora dokunduğu tek yer (211 a: motor tek kaynaktır, burada yalnız tipli kısa yollar vardır). Motorun yüzü değişirse
// yalnız bu dosya değişir.

export interface YanHakSonucu { tutar: number; gvIst: number; sgkIst: number; ayni: boolean; yontem: string; fg: number; hizmet?: boolean }
export interface PrimSatiri { ad: string; tutar: number }

// Motorun calcMonth sonucu (bordro satırı).
export interface AySonucu {
  aylik: number; gun: number; brut: number; ek: number; mesaiUcret: number; ucret: number; yemek: YanHakSonucu | null; yol: YanHakSonucu | null;
  yanTutar: number; toplam: number; sgkMatrah: number; sgk: number; iss: number; ind: number; matrah: number; cumOnce: number;
  gvHam: number; gvIst: number; gv: number; dvHam: number; dvIst: number; dv: number; bes: number; kesinti: number; net: number;
  ayni: number; banka: number; isvBrut: number; tesvik: (Tesvik & { kanunNo?: string }) | null; tInd: number; isvSgk: number; isvIss: number;
  maliyet: number; aMat: number; primDetay: PrimSatiri[] | null;
}

// Bordro tablosundaki girdiler; `_src` girdinin kaynağıdır (taslak, kayıtlı, kesinleşmiş, otomatik).
export interface BordroGirdileri {
  brut: number; gun?: number; ek: number; mesaiSaat: number; tatilSaat: number; kesinti: number; _src?: string; primDetay?: PrimSatiri[] | null;
}
export type BordroSonucu = AySonucu & { inp: BordroGirdileri; locked?: boolean; paramAd?: string };

export interface OtoGun { gun: number; why: string[]; rapor?: number; ucretsiz?: number; eksik?: number }

export interface TazminatGirdisi { giris: string; cikis: string; brut: number | string; yanHak: number | string; kod: string; izinGun: number | string; cum: number | string }
export interface TazminatSonucu {
  g: Date; c: Date; p: { y: number; m: number; d: number }; days: number; months: number; brut: number; yan: number; giy: number; tavan: number;
  esas: number; code: string; codeOk: boolean; yearOk: boolean; kYil: number; kAy: number; kGun: number; kBrut: number; kDv: number; kNet: number;
  weeks: number; nDays: number; daily: number; nBrut: number; nGv: number; nDv: number; nNet: number; rule: { due: string; text: string };
  cum: number; izinGun: number; izBrut: number; izSgk: number; izGv: number; izDv: number; izNet: number;
}

export type { Donem };

const sayi = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(String(v ?? '').replace(',', '.')) || 0);
const yerel = (t: string): Date => { const [y, m, d] = t.split('-').map(Number) as [number, number, number]; return new Date(y, m - 1, d); };
export const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const bugunGece = (): Date => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

export const bordroHesapla = (m: IkMotoru, p: Personel, ay: string): BordroSonucu | null => m.payroll(p, ay) as BordroSonucu | null;
export const ayIcindeCalisti = (m: IkMotoru, p: Personel, ay: string): boolean => {
  const [y, a] = ay.split('-').map(Number) as [number, number];
  return m.employedInMonth(p, y, a);
};
export const bordroluPersonel = (m: IkMotoru, ay: string): Personel[] => m.sortedEmps().filter((p) => ayIcindeCalisti(m, p, ay));
export const otoGun = (m: IkMotoru, p: Personel, ay: string): OtoGun => {
  const [y, a] = ay.split('-').map(Number) as [number, number];
  return m.autoDaysInfo(p, y, a) as OtoGun;
};
export const girdiler = (m: IkMotoru, p: Personel, y: number, a: number): BordroGirdileri | null => m.payInputs(p, y, a) as BordroGirdileri | null;

// Parametre dönemleri.
export const donemler = (m: IkMotoru): Donem[] => m.periods();
export const donemTarihte = (m: IkMotoru, tarih: string): Donem => m.periodAt(tarih) as Donem;
export const donemBitis = (m: IkMotoru, d: Donem): string | null => m.periodEnd(d) as string | null;
export const donemDurumu = (m: IkMotoru, d: Donem) => m.periodStatus(d);
export const donemAyari = (m: IkMotoru, d: Donem): Record<string, unknown> => m.settingsFor(d);
// Hesap seçilen dönemin parametreleriyle yapılır (motorun withPeriod bağlamı).
export const donemde = <T>(m: IkMotoru, tarih: string, is: () => T): T => m.withPeriod(tarih, is) as T;
// Geçerli bağlamdaki ayar değeri (sayı); motorun P işlevi.
export const ayarSayisi = (m: IkMotoru, anahtar: string): number => sayi(m.P(anahtar));
export const ayar = (m: IkMotoru, anahtar: string): unknown => m.S()[anahtar];

// Hesaplayıcılar.
export const ayHesabi = (m: IkMotoru, girdi: Partial<BordroGirdileri>, kumulatif: number, ay: number, asgariKumulatif?: number): AySonucu =>
  m.calcMonth(girdi, kumulatif, ay, asgariKumulatif) as AySonucu;
export const brutNetAylari = (m: IkMotoru, brut: number): AySonucu[] => m.brutNetMonths(brut) as AySonucu[];
export const netBrutAylari = (m: IkMotoru, net: number): AySonucu[] => m.netToBrut(net) as AySonucu[];
export const tazminat = (m: IkMotoru, g: TazminatGirdisi): TazminatSonucu | null => m.severance(g) as TazminatSonucu | null;
export const izinHakki = (m: IkMotoru, p: Personel, tarih: string) => m.leaveBalance(p, yerel(tarih));
export const kalanIzin = (m: IkMotoru, p: Personel, tarih: string): number => m.leaveBalance(p, yerel(tarih)).kalan;
export const vergiDilimleri = (m: IkMotoru): [number, number][] => m.brackets() as [number, number][];
export const ihbarHaftasi = (m: IkMotoru, ay: number): number => sayi(m.noticeWeeks(ay));
export const cikisKodu = (m: IkMotoru, kod: string | undefined): string => String(m.exitCodeOf(kod ?? ''));

// Kişinin ücreti.
export const ucretTarihte = (m: IkMotoru, p: Personel, tarih: string): number => sayi(m.salaryAt(p, tarih));
export const guncelBrut = (m: IkMotoru, p: Personel): number => m.curBrut(p);
export const yanHakAylik = (m: IkMotoru, p: Personel): number => m.benefitMonthly(p);
export const primKidemAylik = (m: IkMotoru, p: Personel): number => m.primMonthlyKidem(p);
export const tesvik = (m: IkMotoru, id: string): Tesvik | null => m.tesvikById(id);
export const tarihGun = yerel;
