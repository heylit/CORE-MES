import type { IkEkrani } from '../gorunumler.ts';
import { Gunluk as GunlukEkrani } from './Gunluk.tsx';
import { Pano as PanoEkrani } from './Pano.tsx';
import { Raporlar as RaporlarEkrani } from './Raporlar.tsx';
import { Yapilacaklar as YapilacaklarEkrani } from './Yapilacaklar.tsx';

// P5 bu klasörü sahiplenir (PARCA-SOZLESMESI.md); adlar gorunumler.ts'te sabittir.
export const Pano: IkEkrani = PanoEkrani;
export const Yapilacaklar: IkEkrani = YapilacaklarEkrani;
export const Raporlar: IkEkrani = RaporlarEkrani;
export const Gunluk: IkEkrani = GunlukEkrani;
// Kılavuz paneli iskelette henüz yerleşmedi (DEVIR: iskelet isteği); hazır bileşen buradan alınır.
export { YardimGorunumu } from './YardimGorunumu.tsx';
