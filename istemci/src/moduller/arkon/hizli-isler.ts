import type { HizliIs } from '../../ortak/rota/hizli-isler.ts';

export const hizliIsler: readonly HizliIs[] = [
  { anahtar: 'arkon-is-baslat', sira: 5, baslik: 'İşe başlıyorum', aciklama: 'Üretim Terminali: işi başlatın, sayın, bitirin.', simge: 'play', yol: '/uretim-terminali', islem: 'sayfa.uretim-terminali' },
  { anahtar: 'arkon-plan', sira: 10, baslik: 'Emirleri istasyonlara göndereceğim', aciklama: 'Plan kuyruğu: emirleri sıraya koyup istasyona verin.', simge: 'gantt', yol: '/arkon/planlama', islem: 'arkon.planlama', veya: ['arkon.hazirlik', 'arkon.amir', 'arkon.yonetici'] },
  { anahtar: 'arkon-hazirlik', sira: 20, baslik: 'Hazırlık bekleyen işler', aciklama: 'Üretim Terminali Hazırlık: çizim, takım ve program hazırlığı.', simge: 'layers', yol: '/arkon/hazirlik', islem: 'arkon.hazirlik', veya: ['arkon.planlama', 'arkon.yonetici'] },
  { anahtar: 'arkon-kalite', sira: 30, baslik: 'Kalite kontrolü yapacağım', aciklama: 'Kontrol planı ve ölçüm kaydı.', simge: 'target', yol: '/arkon/kalite', islem: 'arkon.kalite', veya: ['arkon.planlama', 'arkon.hazirlik', 'arkon.amir', 'arkon.yonetici'] },
  { anahtar: 'arkon-bakim', sira: 40, baslik: 'Makine arızalandı ya da bakım zamanı', aciklama: 'Bakım: arıza ve bakım kaydı.', simge: 'wrench', yol: '/arkon/bakim', islem: 'arkon.bakim', veya: ['arkon.amir', 'arkon.yonetici'] },
];
