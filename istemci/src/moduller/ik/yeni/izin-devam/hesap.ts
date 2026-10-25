import { ikSabitleri, type IkMotoru } from '../motor.ts';
import type { Personel } from '../tipler.ts';

// Bu parcanin motora dokundugu tek yer: izin bakiyesi, gun sayimi, is gunu ve secenek listeleri. Motorun yuzu degisirse yalniz bu dosya degisir.

export interface IzinBakiyesi {
  hak: number; onceki: number; kullanilan: number; bekleyen: number; kalan: number; hizmetYili: number;
  // Sonraki hak edis tarihi (ISO) ve gunu; ayrilmis kiside null.
  sonraki: string | null; sonrakiGun: number;
}

const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Motor tarihleri yerel saatle kurar (bugunku ekranla ayni).
const gun = (t: string): Date => { const [y, m, d] = t.split('-').map(Number) as [number, number, number]; return new Date(y, m - 1, d); };
const bugunGece = (): Date => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

export function bakiye(m: IkMotoru, p: Personel): IzinBakiyesi {
  const b = m.leaveBalance(p, bugunGece());
  return { hak: b.hak, onceki: b.onceki, kullanilan: b.used, bekleyen: b.pending, kalan: b.kalan, hizmetYili: b.years, sonraki: b.next ? iso(b.next) : null, sonrakiGun: b.nextDays };
}

// Yillik ve mazeret izninde is gunu, digerlerinde takvim gunu (sunucunun onerisi gelene kadar gosterilen sayim).
export const gunSay = (m: IkMotoru, bas: string, bit: string, isGunuIle: boolean): number => Number(m.countDays(gun(bas), gun(bit), isGunuIle));

export const isGunuMu = (m: IkMotoru) => (t: string): boolean => Boolean(m.isWorkday(gun(t)));

// Izin formundaki "ise baslama tarihi": bitisten sonraki ilk is gunu.
export function sonrakiIsGunu(m: IkMotoru, t: string): string {
  const d = gun(t);
  // Takvimde is gunu hic yoksa (yanlis ayar) bir yil sonra durur.
  for (let i = 0; i < 366; i++) { d.setDate(d.getDate() + 1); if (m.isWorkday(d)) break; }
  return iso(d);
}

// Yillik fazla mesai siniri gecerli parametre doneminin ayaridir (bugunku ekranda S().yillikMesaiLimit).
export const mesaiSiniriAyari = (m: IkMotoru): unknown => (m.S() as Record<string, unknown> | null)?.['yillikMesaiLimit'];

export const aktifPersonel = (m: IkMotoru): readonly Personel[] => m.activeEmps();

export interface Listeler { izinTurleri: readonly string[]; izinDurumlari: readonly string[]; devamTurleri: readonly string[]; isGunuIzinleri: readonly string[] }
// Motor gelmeden secenek listesi yoktur; formlar "hazirlaniyor" der (null).
export function listeler(): Listeler | null {
  const s = ikSabitleri();
  return s ? { izinTurleri: s.LEAVE_TYPES, izinDurumlari: s.LEAVE_STATES, devamTurleri: s.ATT_TYPES, isGunuIzinleri: s.WORKDAY_LEAVES } : null;
}
