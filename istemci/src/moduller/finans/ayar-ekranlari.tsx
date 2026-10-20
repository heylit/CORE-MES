import type { AyarEkrani } from '../../ortak/rota/ayar-ekranlari.ts';
import { FinansCercevesi } from './FinansCercevesi.tsx';

// Finans ayarları kendi sayfasında (/finans/ayarlar) olduğu gibi çerçevede açılır; aynı ekran, aynı uçlar.
function FinansAyarlari() {
  return <FinansCercevesi sabitGorunum="ayarlar" />;
}

export const ayarEkranlari: AyarEkrani[] = [
  { anahtar: 'finans', baslik: 'Finans ve Muhasebe', simge: 'lira', sira: 50, islem: 'finans.yonet', ekran: FinansAyarlari },
];
