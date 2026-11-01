import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import type { Gorunum } from './gorunum.ts';

// Görünüm kaydı: sıra, başlık ve bileşen prototipin üst çubuğundaki gibi. Görünümler ayrı parçalara iner (3B ağır).
// Parçalar bu dosyaya dokunmaz; bileşen adları sözleşmededir.
export interface GorunumKaydi {
  anahtar: Gorunum;
  baslik: string;
  simge: SimgeAdi;
  bilesen: LazyExoticComponent<ComponentType>;
}

const parca = <M extends Record<string, unknown>>(yukle: () => Promise<M>, ad: keyof M & string) =>
  lazy(async () => ({ default: (await yukle())[ad] as ComponentType }));

export const GORUNUM_KAYITLARI: readonly GorunumKaydi[] = [
  { anahtar: 'home', baslik: 'Ana Sayfa', simge: 'home', bilesen: parca(() => import('./ana/index.tsx'), 'AnaSayfa') },
  { anahtar: 'setup', baslik: 'Kurulum', simge: 'gear', bilesen: parca(() => import('./kurulum/index.tsx'), 'Kurulum') },
  { anahtar: 'prep', baslik: 'Hazırlık', simge: 'clipboard-check', bilesen: parca(() => import('./kurulum/index.tsx'), 'Hazirlik') },
  { anahtar: 'lib', baslik: 'Kütüphane', simge: 'layers', bilesen: parca(() => import('./kutuphane/index.tsx'), 'Kutuphane') },
  { anahtar: 'stock', baslik: 'Ham Malzeme', simge: 'cube', bilesen: parca(() => import('./ham/index.tsx'), 'HamMalzeme') },
  { anahtar: 'gcode', baslik: 'G-Kod Sim.', simge: 'play', bilesen: parca(() => import('./gkod/index.tsx'), 'GkodSim') },
  { anahtar: 'life', baslik: 'Takım Ömrü', simge: 'gauge', bilesen: parca(() => import('./omur/index.tsx'), 'TakimOmru') },
];
