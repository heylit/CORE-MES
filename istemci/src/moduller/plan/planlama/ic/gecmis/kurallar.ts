import type { DefterOlayi } from '#paylasilan/sozlesme/planlama.ts';
import type { RozetTonu } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import type { IzSatiri } from '../../tipler.ts';

// Geçmişin iki bölümü (3308-2 a): Veri sayfasının bölüm şeridinde durur; onay ve taslak karşılaştırması Kokpit'tedir.
export const GECMIS_BOLUMLERI = [['defter', 'Değişiklik defteri', 'clipboard-check'], ['iz', 'Değişiklik izi', 'book']] as const satisfies readonly (readonly [string, string, SimgeAdi])[];
export type GecmisBolumu = (typeof GECMIS_BOLUMLERI)[number][0];
export const gecmisBolumuOku = (v: unknown): GecmisBolumu | null => GECMIS_BOLUMLERI.find((x) => x[0] === v)?.[0] ?? null;

// Değişiklik defterinin olay adı ve rozet tonu (2129-2 b).
export const DEFTER_OLAY_ADI: Record<DefterOlayi, [string, RozetTonu]> = {
  degisiklik: ['Değişiklik', 'bilgi'], kaynak: ['Başka sayfa', 'bilgi'], uygulandi: ['Uygulandı', 'tamam'], reddedildi: ['Reddedildi', 'uyari'], 'geri-alindi': ['Geri alındı', 'pasif'],
};

// Ekranda en çok 200 satır; kişi süzgeci izdeki kişilerden, ilk görünme sırasıyla.
export const IZ_GOSTERIM = 200;
export const izKisileri = (iz: readonly IzSatiri[]): string[] => [...new Set(iz.map((x) => x.kim))];
export const izSuz = (iz: readonly IzSatiri[], kim: string | null): IzSatiri[] => iz.filter((x) => !kim || x.kim === kim).slice(0, IZ_GOSTERIM);
export const izZamani = (t: number): string =>
  new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
