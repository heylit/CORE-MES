import type { IkMotoru } from '../motor.ts';
import type { Departman, Personel, Pozisyon } from '../tipler.ts';
import { satirlar, type Ton } from './kurallar.ts';

// Motorun P4'ün kullandığı yüzü, tipli. Motor işlevlerinin tipi motorla gelene kadar (M0b) sonuçlar burada daraltılır.

export interface IlanKanali { id: string; ad: string; url: string; kod: string }
export type IlanBicimi = 'metin' | 'kisa' | 'html';

export interface IseAlimMotoru {
  aktifler(): Personel[];
  siraliPersonel(): Personel[];
  departmanlar(): Departman[];
  adi(id: string | undefined): string;
  ayar(ad: string): unknown;
  performansKriterleri(): string[];
  mulakatKriterleri(): string[];
  kanallar(): IlanKanali[];
  yeniIlanKodu(): string;
  ilanMetni(j: Pozisyon, k: IlanKanali | null, bicim: IlanBicimi): string;
  ilanKontrolleri(j: Pozisyon): { ton: Ton; metin: string }[];
  izlemeli(adres: string, j: Pozisyon, k: IlanKanali | null): string;
}

const metin = (v: unknown): string => (typeof v === 'string' ? v : '');
const dizi = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const TONLAR: readonly Ton[] = ['ok', 'info', 'warn', 'bad'];

export function iseAlimMotoru(m: IkMotoru): IseAlimMotoru {
  const ayarlar = (): Record<string, unknown> => {
    const s = m.S();
    return s !== null && typeof s === 'object' ? (s as Record<string, unknown>) : {};
  };
  return {
    aktifler: () => m.activeEmps(),
    siraliPersonel: () => m.sortedEmps(),
    departmanlar: () => m.sortedDepts(),
    adi: (id) => metin(m.empName(id)) || '—',
    ayar: (ad) => ayarlar()[ad],
    performansKriterleri: () => dizi(m.criteria()).map(metin).filter(Boolean),
    mulakatKriterleri: () => satirlar(ayarlar()['mulakatKriterler']),
    kanallar: () => dizi(m.channels()).flatMap((k) => {
      if (k === null || typeof k !== 'object') return [];
      const o = k as Record<string, unknown>;
      return [{ id: metin(o['id']), ad: metin(o['ad']), url: metin(o['url']), kod: metin(o['kod']) }];
    }),
    yeniIlanKodu: () => metin(m.newJobCode()),
    ilanMetni: (j, k, bicim) => metin(bicim === 'kisa' ? m.postingShort(j, k) : bicim === 'html' ? m.postingHTML(j, k) : m.postingText(j, k)),
    ilanKontrolleri: (j) => dizi(m.postingChecks(j)).flatMap((c) => {
      const [t, s] = dizi(c);
      return TONLAR.includes(t as Ton) && typeof s === 'string' ? [{ ton: t as Ton, metin: s }] : [];
    }),
    izlemeli: (adres, j, k) => metin(m.trackLink(adres, j, k)) || adres,
  };
}
