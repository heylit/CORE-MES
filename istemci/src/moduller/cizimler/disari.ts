// Başka modül ekranlarının ithal edebildiği tek dosya. Dosya önce yüklenir (özet döner), belge `POST /cizimler` ile açılır.
export { DosyaHatasi, dosyaYukle } from './dosya-aktarimi.ts';
// Malzeme küçük resmi (kart #688): listeler `useKucukResimler` ile tek istekte okur, `KucukResimKutusu` çizer; malzeme kartı
// `ResimPaneli`ni gömer. Kartın açılışında seçilen dosyalar kart ilk kaydedilince `malzemeBelgesiYukle` ile gönderilir.
export { KucukResimKutusu, kucukResimAdresi, useKucukResimler, type KucukResimBoyu } from './KucukResim.tsx';
// Revizyonun önizleme karesi (küçük resim) elde olan dosyadan üretilir; CNC eşleştirmesi modeli yayına alınca çağırır (780 a).
export { onizlemeGonder } from './onizleme-akisi.ts';
export { ResimPaneli, malzemeBelgesiYukle, useMalzemeResimYetkisi, type MalzemeBelgesiGirdisi } from './ResimPaneli.tsx';
// Markalama yer seçiminde aynı model okuyucuyu kullanır (kart 806): STEP, IGES, STL ve glTF tek yoldan sahneye girer.
export { birak, modelOku, type ModelBicimi } from './goruntu/model.ts';
