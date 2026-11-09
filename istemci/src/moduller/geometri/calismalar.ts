import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';

// 3D Atölyesi'nin çalışmaları (2396): her biri ikinci menüde ayrı madde, hepsi aynı sayfada (model listesi, 3B görüntü, çalışmanın kartı).
// Sıra atölyedeki bakış sırasıdır: önce ölçü, sonra stok, işlenecek özellik, yüzey işlemi, montaj. Menü maddeleri
// (paylasilan/sayfalar/geometri.ts) bu listeyle aynı kalır; test denetler.
export const KOK = '/geometri';
export const CALISMA_ADLARI = ['analiz', 'ham', 'ozellikler', 'yuzey', 'montaj'] as const;
export type CalismaAdi = (typeof CALISMA_ADLARI)[number];

export interface Calisma { ad: CalismaAdi; baslik: string; simge: SimgeAdi; alt: string }

export const CALISMALAR: Readonly<Record<CalismaAdi, Calisma>> = {
  analiz: { ad: 'analiz', baslik: 'Analiz', simge: 'ruler', alt: 'Modelin ölçüsü, hacmi ve alanı; önizlemede dış kutu ve döndürülmüş kutu' },
  ham: { ad: 'ham', baslik: 'Ham önerisi', simge: 'box', alt: 'Stoktaki hammaddeden en az talaşlı ham; önizlemede seçilen ham' },
  ozellikler: { ad: 'ozellikler', baslik: 'Özellikler', simge: 'target', alt: 'Tanınan delik, havşa, kademe, pah ve radyüs; önizlemede delikler' },
  yuzey: { ad: 'yuzey', baslik: 'Boya ve maske', simge: 'edit', alt: 'Rotadaki boya ve kaplama adımlarının yüzeyleri; önizlemede boyalı yüzler' },
  montaj: { ad: 'montaj', baslik: 'Montaj', simge: 'layers', alt: 'Montaj ağacı ve bileşenler; önizlemede seçilen parçalar' },
};

// Analiz kök adrestedir: eski `/geometri?rev=` bağlantıları aynı çalışmayı açar.
export const calismaYolu = (ad: CalismaAdi): string => (ad === 'analiz' ? KOK : `${KOK}/${ad}`);

// Adresteki çalışma; kökte Analiz, tanınmayan adda null (ekran köke yönlendirir).
export function calismaOku(parca: string | undefined): CalismaAdi | null {
  if (parca === undefined || parca === '') return 'analiz';
  return (CALISMA_ADLARI as readonly string[]).includes(parca) && parca !== 'analiz' ? (parca as CalismaAdi) : null;
}
