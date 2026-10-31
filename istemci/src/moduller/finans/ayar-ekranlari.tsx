import type { AyarEkrani } from '../../ortak/rota/ayar-ekranlari.ts';
import { FinansAyarlariBolumu } from './yeni/FinansYeni.tsx';

// Finans ayarları kendi sayfasındaki (/finans/ayarlar) Ayarlar bölümüdür; burada aynı bileşen, aynı uçlarla açılır.
export const ayarEkranlari: AyarEkrani[] = [
  { anahtar: 'finans', baslik: 'Finans ve Muhasebe', simge: 'lira', sira: 50, islem: 'finans.yonet', ekran: FinansAyarlariBolumu },
];
