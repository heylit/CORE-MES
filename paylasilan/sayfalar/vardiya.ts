import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const VARDIYA_SAYFALARI = [
  { yol: '/vardiya', islem: 'sayfa.vardiya', baslik: 'Vardiya', simge: 'clock', grup: 'Planlama', sira: 30 },
] as const satisfies readonly SayfaTanimi[];

// Bütün bölümler sayfayı gören herkese açıktır; yazma ayrıca `vardiya.yaz` (planlı duruşta `vardiya.durus-yaz`) ister.
export const VARDIYA_IKINCI_MENU = {
  kok: '/vardiya',
  baslik: 'Vardiya',
  simge: 'clock',
  gruplar: [
    { maddeler: [
      { anahtar: 'duzen', baslik: 'Vardiyalar ve tatiller', yol: '/vardiya', simge: 'clock', islem: 'sayfa.vardiya' },
      { anahtar: 'personel', baslik: 'Vardiya başına personel', yol: '/vardiya/personel', simge: 'user', islem: 'sayfa.vardiya', okur: ['/vardiya-personeli', '/vardiya-takvimi'] },
      { anahtar: 'takvim', baslik: 'Çalışma takvimi', yol: '/vardiya/takvim', simge: 'gantt', islem: 'sayfa.vardiya' },
      { anahtar: 'fazla-mesai', baslik: 'Fazla mesai', yol: '/vardiya/fazla-mesai', simge: 'plus', islem: 'sayfa.vardiya', okur: ['/fazla-mesai', '/istasyonlar/secim'] },
      { anahtar: 'duruslar', baslik: 'Planlı duruşlar', yol: '/vardiya/planli-duruslar', simge: 'pause', islem: 'sayfa.vardiya', okur: ['/planli-duruslar', '/vardiya-takvimi', '/istasyonlar/secim'] },
      { anahtar: 'mesai', baslik: 'Günlük mesai', yol: '/vardiya/mesai', simge: 'coffee', islem: 'sayfa.mesai', okur: ['/gunluk-mesai', '/vardiya-takvimi'] },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
