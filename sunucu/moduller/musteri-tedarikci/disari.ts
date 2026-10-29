import type { Db } from '#cekirdek/db.ts';
import type { KayitAramaKaynagi } from '#paylasilan/kayit-aramasi.ts';
import { firmaKayitKaynagi } from './servis.ts';

// Başka modüller (finans, satın alma, stok, sevkiyat, projeler, rota, üretim emirleri, Logo, portal) firmayı buradan alır.
// Fonksiyonlar çağıranın db'sini kullanır, transaction açmaz ve yetki denetlemez (denetim çağıran modülün ucundadır).
export {
  firmaAdlari, firmaAra, firmaDurumuDegistir, firmaKonumlari, firmaNoKoddan, firmaOzeti, firmaOzetleri, firmaVarMi, musteriSiniflari, tumFirmalar,
} from './servis.ts';
export type { FirmaKonumu, FirmaOzeti } from './servis.ts';
export type { FirmaDurumu } from './kurallar.ts';
export { ORNEK_FIRMA_ANAHTARLARI, ornekFirmaNo } from './ornek-veri.ts';
export type { OrnekFirmaAnahtari } from './ornek-veri.ts';

// Ctrl K genel araması (sözleşme 1233): çekirdek bu adı bulur ve yetkiyi kaynağı çağırmadan önce denetler.
export const kayitAramaKaynaklari: readonly KayitAramaKaynagi<Db>[] = [firmaKayitKaynagi];
