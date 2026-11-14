import type { AyarEkrani } from '../../ortak/rota/ayar-ekranlari.ts';
import { TeklifFormuAyari } from './TeklifFormuAyari.tsx';

// 3245 d: teklif formu şablonları Sistem Ayarları > Formlar'da düzenlenir; yazma ucu ayarlar.yaz ister.
export const ayarEkranlari: AyarEkrani[] = [
  { anahtar: 'teklif-formu', baslik: 'Teklif formu', simge: 'file', sira: 10, islem: 'ayarlar.yaz', bolum: 'form', ekran: TeklifFormuAyari },
];
