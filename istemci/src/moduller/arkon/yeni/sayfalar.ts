import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { IkinciMenuMaddesi } from '#paylasilan/sayfa-tanimi.ts';
import { IKINCI_MENULER } from '#paylasilan/sayfalar.ts';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';

// Yeni Arkon ekranının sayfaları. Anahtar adres parçasıdır (/arkon/yeni/<anahtar>) ve eski Arkon'un adres işaretiyle aynıdır
// (operatör ekranınınki boştu, burada `operator`). Başlık, simge ve TMI işlemi ikinci menüden (paylasilan/sayfalar/arkon.ts) okunur;
// menüde olmayan sayfalar (Operatör, Kuyruk, Önizleme) kendi tanımını taşır. Her sayfanın ekranı bir parçanın klasöründedir.

export const KOK = '/arkon/yeni';

export type ArkonSayfasi =
  | 'operator' | 'onizle' | 'pano' | 'planlama' | 'kuyruk' | 'hazirlik' | 'anomali' | 'kalite' | 'cizim' | 'bakim' | 'raporlar' | 'ayarlar';

export interface ArkonEkranOzellikleri {
  sayfa: ArkonSayfasi;
  // Adresin ikinci parçası: önizlemede istasyon kodu, ayrıntı sayfalarında kayıt.
  kimlik: string | null;
}

type Ekran = LazyExoticComponent<ComponentType<ArkonEkranOzellikleri>>;
const parca = <M extends Record<string, unknown>>(yukle: () => Promise<M>, ad: keyof M & string): Ekran =>
  lazy(async () => ({ default: (await yukle())[ad] as ComponentType<ArkonEkranOzellikleri> }));

const operator = () => import('./operator/index.tsx');
const hazirlik = () => import('./hazirlik/index.tsx');
const pano = () => import('./pano/index.tsx');
const kalite = () => import('./kalite/index.tsx');
const cizim = () => import('./cizim/index.tsx');
const ayarlar = () => import('./ayarlar/index.tsx');

export interface SayfaTanimi {
  ekran: Ekran;
  // Sekmede görünmeyen sayfa (önizleme): seçili sekme bu olur.
  ust?: ArkonSayfasi;
  // Menüde olmayan sayfanın başlığı, simgesi ve TMI işlemi.
  baslik?: string;
  simge?: SimgeAdi;
  islem?: string;
}

export const SAYFALAR = {
  operator: { ekran: parca(operator, 'Operator'), baslik: 'Operatör', simge: 'gauge', islem: 'sayfa.uretim-terminali' },
  onizle: { ekran: parca(operator, 'Onizleme'), ust: 'hazirlik' },
  pano: { ekran: parca(pano, 'Pano') },
  planlama: { ekran: parca(pano, 'PlanKuyrugu') },
  kuyruk: { ekran: parca(pano, 'Kuyruk'), baslik: 'Kuyruk', simge: 'layers', islem: 'sayfa.kuyruk' },
  hazirlik: { ekran: parca(hazirlik, 'Hazirlik') },
  anomali: { ekran: parca(pano, 'Anomali') },
  kalite: { ekran: parca(kalite, 'Kalite') },
  cizim: { ekran: parca(cizim, 'Cizim') },
  bakim: { ekran: parca(kalite, 'Bakim') },
  raporlar: { ekran: parca(kalite, 'Raporlar') },
  ayarlar: { ekran: parca(ayarlar, 'Ayarlar') },
} as const satisfies Record<ArkonSayfasi, SayfaTanimi>;
export const sayfaMi = (s: string | undefined): s is ArkonSayfasi => s !== undefined && Object.hasOwn(SAYFALAR, s);

// TMI'nin kendi ekranı olan madde: sekmesi o adrese gider (çerçevede de açılmıyordu).
export const SAYFA_DISI: Readonly<Record<string, string>> = { 'tmi-yansimalari': '/arkon/tmi-yansimalari' };

export interface SekmeMaddesi { anahtar: string; baslik: string; simge: SimgeAdi; islem: string; veya?: readonly string[] }

// Sekme sırası: önce Operatör, sonra ikinci menünün sırası, Kuyruk Plan Kuyruğu'nun yanında.
export function sekmeMaddeleri(): SekmeMaddesi[] {
  const menu = IKINCI_MENULER.find((m) => m.kok === '/arkon');
  const maddeler: SekmeMaddesi[] = (menu?.gruplar.flatMap((g): readonly IkinciMenuMaddesi[] => g.maddeler) ?? [])
    .map((m) => ({ anahtar: m.anahtar, baslik: m.baslik, simge: m.simge as SimgeAdi, islem: m.islem, ...(m.veya ? { veya: m.veya } : {}) }));
  const ek = (a: 'operator' | 'kuyruk'): SekmeMaddesi => {
    const t = SAYFALAR[a];
    return { anahtar: a, baslik: t.baslik, simge: t.simge, islem: t.islem };
  };
  const sira = maddeler.findIndex((m) => m.anahtar === 'planlama');
  maddeler.splice(sira < 0 ? maddeler.length : sira + 1, 0, ek('kuyruk'));
  return [ek('operator'), ...maddeler];
}

export const sayfaAdresi = (sayfa: string, kimlik?: string | null): string =>
  `${KOK}/${encodeURIComponent(sayfa)}${kimlik ? `/${encodeURIComponent(kimlik)}` : ''}`;
