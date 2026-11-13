import type { AyarEkrani } from '../../ortak/rota/ayar-ekranlari.ts';
import { Ayarlar } from './Ayarlar.tsx';

// Stok > Sistem > Ayarlar ekranı Sistem Ayarları'nda da açılır; işlem menü maddesiyle aynı.
export const ayarEkranlari: AyarEkrani[] = [{ anahtar: 'stok', baslik: 'Stok', simge: 'tool', sira: 30, islem: 'stok.harita-yaz', veya: ['stok.raf-yaz', 'stok.konum-yaz', 'stok.malzeme-ayari'], ekran: Ayarlar }];
