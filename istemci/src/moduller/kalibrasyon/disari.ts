// Başka modül ekranlarının ithal edebildiği tek dosya.
import { kalibrasyonDurumu } from '#paylasilan/sozlesme/kalibrasyon-kurali.ts';

// Kalite Merkezi ve Denetim Hazırlığı çerçeveleri kalibrasyon durumunu bu modülün kuralıyla hesaplar. Çerçevenin betiği
// eşzamanlı çağırdığı için kural köprüden sorulmaz; işlevin kendisi çerçeveye gömülür (`window.TMI_KALIBRASYON.durum`).
export function kalibrasyonKuraliBetigi(): string {
  return `window.TMI_KALIBRASYON=Object.freeze({durum:${String(kalibrasyonDurumu)}});`;
}
