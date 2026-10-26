// Başka modül ekranlarının ithal edebildiği tek dosya. Dosya önce yüklenir (özet döner), belge `POST /cizimler` ile açılır.
export { DosyaHatasi, dosyaYukle } from './dosya-aktarimi.ts';
// Malzeme küçük resmi (kart #688): listeler `useKucukResimler` ile tek istekte okur, `KucukResimKutusu` çizer; malzeme kartı
// `ResimPaneli`ni gömer. Kartın açılışında seçilen dosyalar kart ilk kaydedilince `malzemeBelgesiYukle` ile gönderilir.
export { KucukResimKutusu, kucukResimAdresi, useKucukResimler, type KucukResimBoyu } from './KucukResim.tsx';
export { ResimPaneli, malzemeBelgesiYukle, useMalzemeResimYetkisi, type MalzemeBelgesiGirdisi } from './ResimPaneli.tsx';
