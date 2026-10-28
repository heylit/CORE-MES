import type { AyarEkrani } from '../../ortak/rota/ayar-ekranlari.ts';
import { LogoKarsiliklari } from './LogoGonderimi.tsx';
import { MalzemeAyarlariBolumu } from './yeni/MalzemelerYeni.tsx';

// Modülün iki ayarı: menünün "Malzeme ayarları" ekranı ve Logo karşılıkları. İkisi de kendi sayfasındaki bileşendir; değerler aynı
// uçlardan gelir, yazma yetkisi uçtadır (malzemeler.tanim-yaz).
function MalzemeAyarlari() {
  return (
    <>
      <MalzemeAyarlariBolumu />
      <LogoKarsiliklari />
    </>
  );
}

// İşlem menü maddelerininkidir: "Malzeme ayarları" ve "Logo gönderimi" `sayfa.malzemeler` ile görünür.
export const ayarEkranlari: AyarEkrani[] = [
  { anahtar: 'malzemeler', baslik: 'Malzemeler ve Hizmetler', simge: 'tag', sira: 300, islem: 'sayfa.malzemeler', ekran: MalzemeAyarlari },
];
