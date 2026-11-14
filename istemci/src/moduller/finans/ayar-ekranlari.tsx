import { lazy, Suspense } from 'react';
import { DurumKutusu } from '../../ortak/arayuz/index.ts';
import type { AyarEkrani } from '../../ortak/rota/ayar-ekranlari.ts';

// Ayar ekranları bütün modüllerden ilk açılışta taranır; finans ekranı doğrudan ithal edilseydi finansın tamamı ana pakete girerdi.
const Bolum = lazy(async () => ({ default: (await import('./yeni/FinansYeni.tsx')).FinansAyarlariBolumu }));

// Bekleme bölümün içinde çizilir: Sistem Ayarları'nın kendisi yerinde kalır.
function FinansAyarlari() {
  return <Suspense fallback={<DurumKutusu durum="yukleniyor" />}><Bolum /></Suspense>;
}

// Finans ayarları kendi sayfasındaki (/finans/ayarlar) Ayarlar bölümüdür; burada aynı bileşen, aynı uçlarla açılır.
export const ayarEkranlari: AyarEkrani[] = [
  { anahtar: 'finans', baslik: 'Finans ve Muhasebe', simge: 'lira', sira: 50, islem: 'finans.ayar', veya: ['finans.hesap-yonet', 'finans.oran-yaz', 'finans.sabit-kiymet', 'finans.duzenli-odeme'], ekran: FinansAyarlari },
];
