import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const SEVKIYAT_SAYFALARI = [
  { yol: '/sevkiyat', islem: 'sayfa.sevkiyat', baslik: 'Sevkiyat', simge: 'route', grup: 'Planlama', sira: 50 },
] as const satisfies readonly SayfaTanimi[];

// Bölümlerin hepsi sayfayı gören herkese açıktır; yazma uçta ayrıca sevkiyat işlemlerini ister. Tüm işler plan gününü de gösterir (946 a).
export const SEVKIYAT_IKINCI_MENU = {
  kok: '/sevkiyat',
  baslik: 'Sevkiyat',
  simge: 'route',
  gruplar: [
    { maddeler: [
      { anahtar: 'gunluk', baslik: 'Günlük sevkiyat', yol: '/sevkiyat', simge: 'list', islem: 'sayfa.sevkiyat' },
      { anahtar: 'tum-isler', baslik: 'Tüm işler', yol: '/sevkiyat/tum-isler', simge: 'layers', islem: 'sayfa.sevkiyat' },
      { anahtar: 'tek-rota', baslik: 'Rota hesapla', yol: '/sevkiyat/tek-rota', simge: 'target', islem: 'sayfa.sevkiyat' },
    ] },
    { baslik: 'Tanımlar', maddeler: [
      { anahtar: 'noktalar', baslik: 'Noktalar', yol: '/sevkiyat/noktalar', simge: 'flag', islem: 'sayfa.sevkiyat' },
      { anahtar: 'araclar', baslik: 'Araçlar', yol: '/sevkiyat/araclar', simge: 'truck', islem: 'sayfa.sevkiyat' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
