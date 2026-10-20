// Başka modüller (finans, satın alma, stok, sevkiyat, projeler, rota, üretim emirleri, Logo, portal) firmayı buradan alır.
// Fonksiyonlar çağıranın db'sini kullanır, transaction açmaz ve yetki denetlemez (denetim çağıran modülün ucundadır).
export {
  firmaAdlari, firmaAra, firmaDurumuDegistir, firmaKonumlari, firmaNoKoddan, firmaOzeti, firmaOzetleri, firmaVarMi, musteriSiniflari, tumFirmalar,
} from './servis.ts';
export type { FirmaKonumu, FirmaOzeti } from './servis.ts';
export type { FirmaDurumu } from './kurallar.ts';
export { ORNEK_FIRMA_ANAHTARLARI, ornekFirmaNo } from './ornek-veri.ts';
export type { OrnekFirmaAnahtari } from './ornek-veri.ts';
