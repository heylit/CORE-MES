import { kalibrasyonKuraliBetigi } from '../kalibrasyon/disari.ts';

// Prototip dış kütüphane yüklemez. Gömülen tek ek betik Kalibrasyon modülünün vade ve durum kuralıdır (tek kural); prototipin
// "Kalibrasyon" sekmesi cihaz durumunu onunla hesaplar.
export const ekBetikler = async (): Promise<string> => `<script>${kalibrasyonKuraliBetigi()}</script>`;
