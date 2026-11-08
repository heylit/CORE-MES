// Başka modül ekranlarının ithal edebildiği tek dosya. Sistem ve Güvenlik sayfası (2231) sağlığı buradan okur ve çizer.
export { useSaglikAyrintisi, useSistemSagligi } from './saglik-sorgusu.ts';
export { saglikGeneli, saglikKararlari, type SaglikGeneli, type SaglikKarari, type SaglikTonu } from './saglik-ozeti.ts';
export { girisYorumu, type Yorum } from './gidisat-yorum.ts';
export { SaglikKutulari } from './SaglikKutulari.tsx';
export { Gidisat } from './Gidisat.tsx';
export { CizgiGrafik } from './CizgiGrafik.tsx';
export { TeknikAyrintilar } from './SistemDurumu.tsx';
export type { Nokta } from './performans.ts';
