import type { AyarEkrani } from '../../ortak/rota/ayar-ekranlari.ts';
import { KartOkuyucular } from './KartOkuyucular.tsx';

// Kart okuyucu kaydı Sistem Ayarları > Bağlantılar'dadır (341 a); "Kart okuyucudan PDKS kaydı" ayarı ekranın başında açılır.
export const ayarEkranlari: AyarEkrani[] = [
  { anahtar: 'kart-okuyucu', baslik: 'Kart okuyucu', simge: 'cpu', sira: 70, islem: 'nizamiye.pdks-aktar', ekran: KartOkuyucular, bolum: 'baglanti' },
];
