import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import type { IzSatiri } from '../../tipler.ts';

// "Geçmiş" ekranı (bugünkü sayfa b-kabuk.betik EKRANLAR gecmis, 03-katman.betik sIz): bölümleri ve değişiklik izinin süzgeci.
export const GECMIS_BOLUMLERI = [['senaryolar', 'Senaryolar', 'flag'], ['iz', 'Değişiklik izi', 'book']] as const satisfies readonly (readonly [string, string, SimgeAdi])[];
export type GecmisBolumu = (typeof GECMIS_BOLUMLERI)[number][0];
export const ILK_GECMIS: GecmisBolumu = 'senaryolar';
export const gecmisBolumuOku = (v: unknown): GecmisBolumu | null => GECMIS_BOLUMLERI.find((x) => x[0] === v)?.[0] ?? null;

// Ekranda en çok 200 satır; kişi süzgeci izdeki kişilerden, ilk görünme sırasıyla.
export const IZ_GOSTERIM = 200;
export const izKisileri = (iz: readonly IzSatiri[]): string[] => [...new Set(iz.map((x) => x.kim))];
export const izSuz = (iz: readonly IzSatiri[], kim: string | null): IzSatiri[] => iz.filter((x) => !kim || x.kim === kim).slice(0, IZ_GOSTERIM);
export const izZamani = (t: number): string =>
  new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
