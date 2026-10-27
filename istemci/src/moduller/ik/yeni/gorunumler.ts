import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { IkMotoru } from './motor.ts';
import type { IkEkranRolu } from './rol.ts';
import type { Personel } from './tipler.ts';
import type { IkDeposu } from './veri.ts';
import type { IkYetkisi } from './yetki.ts';

export type IkKoku = '/ik' | '/ik-islemlerim';

// Görünüm anahtarları çerçevedekilerle aynıdır; adres parçası ikinci menüdeki yoldur (paylasilan/sayfalar/ik.ts).
export const IK_GORUNUMLERI = [
  'pano', 'gorev', 'personel', 'calisan', 'org', 'izin', 'devam', 'bordro', 'performans', 'egitim', 'isealim', 'aday', 'pozisyon',
  'rapor', 'plan', 'hesap', 'log', 'ayarlar',
] as const;
export const ISLEMLERIM_GORUNUMLERI = ['benim', 'izinlerim', 'bordrolarim', 'mesailerim', 'onay', 'ekip', 'uye', 'ekiptakvim'] as const;
export type IkGorunum = (typeof IK_GORUNUMLERI)[number] | (typeof ISLEMLERIM_GORUNUMLERI)[number];

export interface IkEkranOzellikleri {
  depo: IkDeposu;
  yetki: IkYetkisi;
  rol: IkEkranRolu;
  // Ekranın "ben"i: kişinin personel kaydı.
  ben: Personel | null;
  // Ayrıntı sayfasının kaydı (calisan, aday, pozisyon, uye).
  kimlik: string | null;
  git: (gorunum: IkGorunum, kimlik?: string) => void;
  motor: IkMotoru | null;
}
export type IkEkrani = ComponentType<IkEkranOzellikleri>;

// Her parça kendi klasörünün index.tsx'inden adlı bileşen verir (PARCA-SOZLESMESI.md); parça yalnız gerektiğinde yüklenir.
function parca<M extends Record<string, unknown>>(yukle: () => Promise<M>, ad: keyof M & string): LazyExoticComponent<IkEkrani> {
  return lazy(async () => ({ default: (await yukle())[ad] as IkEkrani }));
}
const personel = () => import('./personel/index.tsx');
const izinDevam = () => import('./izin-devam/index.tsx');
const bordro = () => import('./bordro/index.tsx');
const isealim = () => import('./isealim/index.tsx');
const analiz = () => import('./analiz/index.tsx');
const islemlerim = () => import('./islemlerim/index.tsx');

// adres: kökten sonraki parça ('' kök görünümdür). Ayrıntı görünümleri menüde yoktur; üst maddesi `ust`tür.
export interface GorunumTanimi { kok: IkKoku; adres: string; ekran: LazyExoticComponent<IkEkrani>; ust?: IkGorunum }

export const GORUNUMLER: Readonly<Record<IkGorunum, GorunumTanimi>> = {
  pano: { kok: '/ik', adres: '', ekran: parca(analiz, 'Pano') },
  gorev: { kok: '/ik', adres: 'yapilacaklar', ekran: parca(analiz, 'Yapilacaklar') },
  personel: { kok: '/ik', adres: 'personel', ekran: parca(personel, 'Personel') },
  calisan: { kok: '/ik', adres: 'calisan', ekran: parca(personel, 'Calisan'), ust: 'personel' },
  org: { kok: '/ik', adres: 'organizasyon', ekran: parca(personel, 'Organizasyon') },
  izin: { kok: '/ik', adres: 'izinler', ekran: parca(izinDevam, 'Izinler') },
  devam: { kok: '/ik', adres: 'devam', ekran: parca(izinDevam, 'DevamVeMesai') },
  bordro: { kok: '/ik', adres: 'bordro', ekran: parca(bordro, 'Bordro') },
  performans: { kok: '/ik', adres: 'performans', ekran: parca(isealim, 'Performans') },
  egitim: { kok: '/ik', adres: 'egitim', ekran: parca(isealim, 'Egitim') },
  isealim: { kok: '/ik', adres: 'ise-alim', ekran: parca(isealim, 'IseAlim') },
  aday: { kok: '/ik', adres: 'aday', ekran: parca(isealim, 'Aday'), ust: 'isealim' },
  pozisyon: { kok: '/ik', adres: 'pozisyon', ekran: parca(isealim, 'Pozisyon'), ust: 'isealim' },
  rapor: { kok: '/ik', adres: 'raporlar', ekran: parca(analiz, 'Raporlar') },
  plan: { kok: '/ik', adres: 'maliyet-plani', ekran: parca(bordro, 'MaliyetPlani') },
  hesap: { kok: '/ik', adres: 'hesaplamalar', ekran: parca(bordro, 'Hesaplamalar') },
  log: { kok: '/ik', adres: 'gunluk', ekran: parca(analiz, 'Gunluk') },
  ayarlar: { kok: '/ik', adres: 'ayarlar', ekran: parca(bordro, 'Ayarlar') },
  benim: { kok: '/ik-islemlerim', adres: '', ekran: parca(islemlerim, 'BenimSayfam') },
  izinlerim: { kok: '/ik-islemlerim', adres: 'izinlerim', ekran: parca(islemlerim, 'Izinlerim') },
  bordrolarim: { kok: '/ik-islemlerim', adres: 'bordrolarim', ekran: parca(islemlerim, 'Bordrolarim') },
  mesailerim: { kok: '/ik-islemlerim', adres: 'mesailerim', ekran: parca(islemlerim, 'Mesailerim') },
  onay: { kok: '/ik-islemlerim', adres: 'onaylar', ekran: parca(islemlerim, 'Onaylar') },
  ekip: { kok: '/ik-islemlerim', adres: 'ekip', ekran: parca(islemlerim, 'Ekip') },
  uye: { kok: '/ik-islemlerim', adres: 'uye', ekran: parca(islemlerim, 'EkipUyesi'), ust: 'ekip' },
  ekiptakvim: { kok: '/ik-islemlerim', adres: 'ekip-takvimi', ekran: parca(islemlerim, 'EkipTakvimi') },
};

export const YENI = 'yeni';

export function gorunumAdresi(gorunum: IkGorunum, kimlik?: string): string {
  const t = GORUNUMLER[gorunum];
  const parcalar = [t.kok, YENI, t.adres, kimlik === undefined ? '' : encodeURIComponent(kimlik)].filter((p) => p !== '');
  return parcalar.join('/');
}

// Adresteki parçadan görünüm; bilinmeyen adres kökün ilk görünümüne düşer.
export function adrestenGorunum(kok: IkKoku, adres: string | undefined): IkGorunum | null {
  const aranan = adres ?? '';
  const bulunan = (Object.keys(GORUNUMLER) as IkGorunum[]).find((g) => GORUNUMLER[g].kok === kok && GORUNUMLER[g].adres === aranan);
  return bulunan ?? null;
}
