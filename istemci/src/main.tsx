import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ortak/tasarim/tokens.css';
import './ortak/tasarim/fonts.css';
import './ortak/tasarim/temel.css';
import { App } from './App.tsx';
import { HataSiniri } from './ortak/arayuz/HataSiniri.tsx';
import { servisCalisaniKaydet } from './ortak/pwa/kayit.ts';

const kok = document.getElementById('kok');
if (!kok) throw new Error('#kok bulunamadı');
// Kabuğun kendisi düşerse beyaz sayfa yerine hata ve Yeniden dene görünür; ekran hataları kabuğun içinde kalır (App.tsx).
createRoot(kok).render(
  <StrictMode>
    <HataSiniri mesaj="Uygulama açılırken bir hata oluştu"><App /></HataSiniri>
  </StrictMode>,
);
// Kayıt ilk çizimi geciktirmesin diye sayfa yüklendikten sonra yapılır.
window.addEventListener('load', () => { servisCalisaniKaydet(); });
