import type { Db } from '#cekirdek/db.ts';
import type { KayitAramaKaynagi } from '#paylasilan/kayit-aramasi.ts';
import { firmaKayitKaynagi } from './servis.ts';

// Başka modüller (finans, satın alma, stok, sevkiyat, projeler, rota, üretim emirleri, Logo, portal) firmayı buradan alır.
// Fonksiyonlar çağıranın db'sini kullanır, transaction açmaz ve yetki denetlemez (denetim çağıran modülün ucundadır).
export {
  fasonFirmalari, firmaAdlari, firmaAra, firmaDurumuDegistir, firmaKonumlari, firmaNoKoddan, firmaOzeti, firmaOzetleri, firmaVarMi, musteriSiniflari, tumFirmalar,
} from './servis.ts';
export type { FirmaKonumu, FirmaOzeti } from './servis.ts';
// 2133-1 b: firma ya da adresi yazılınca sevkiyat noktasını açar ya da günceller; bağ sunucu/kablolama.ts'te.
export { firmaDegistiDinle } from './firma-olaylari.ts';
export type { FirmaDegistiDinleyicisi, FirmaDegistiOlayi } from './firma-olaylari.ts';
// Tedarikçi karnesi (1259 c): satın alma ve Kalite Merkezi olayı kendi transaction'ında iter; teklif kıyası karneyi okur.
export { karneOlayiYaz, karneOzetleri } from './servis.ts';
// Kart 1474: geri alınan teslimin olayı kalkar; plan ve malzeme planlaması tedarikçi gecikmesini buradan okur.
export { karneOlayiKaldir, teslimGecikmeleri } from './servis.ts';
export type { TeslimGecikmesi } from './servis.ts';
export type { GecikmeOzeti } from './kurallar.ts';
export type { FirmaDurumu } from './kurallar.ts';
export { ORNEK_FIRMA_ANAHTARLARI, ornekFirmaNo } from './ornek-veri.ts';
export type { OrnekFirmaAnahtari } from './ornek-veri.ts';

// Ctrl K genel araması (sözleşme 1233): çekirdek bu adı bulur ve yetkiyi kaynağı çağırmadan önce denetler.
export const kayitAramaKaynaklari: readonly KayitAramaKaynagi<Db>[] = [firmaKayitKaynagi];
// 2118: Logo cari araması ve tek cari okuması ters yöndedir (logo bu modülü ithal eder); sunucu/kablolama.ts bağlar.
export { logoCariCozuculeriKaydet } from './servis.ts';
export type { LogoCariAramaCozucusu, LogoCariOkumaCozucusu, LogoCariSonucu } from './servis.ts';
export type { LogoCariBilgisi } from './kurallar.ts';
