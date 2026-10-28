// Plan (K3) kaynak takvimini `calismaTakvimleri` ile tek okumada alır; `gunYaz` stüdyonun "bir gün kapalı olursa" canlıya almasıdır
// (çağıranın transaction'ında; VR-03 ve VR-09 çağıran kişiye göre denetlenir).
// Arkon planlı duruş takvimi (kart #519) `planliDuruslarinHepsi` ile okur, `planliDurusYaz` ve `planliDurusSilArkon` ile yazar (çağıranın
// transaction'ında; `vardiya.durus-yaz`, kapsam ve kurallar çağıran kişiye göre denetlenir; Arkon belge sürümü kilitten sonra `guncelMi` ile).
export {
  calismaSuresi, calismaTakvimi, calismaTakvimleri, gunYaz, planliDuruslarinHepsi, planliDurusSilArkon, planliDurusYaz, takvimGunleri,
} from './servis.ts';
export type { ArkonDurusHedefi, ArkonDurusSonucu, PlanliDurusKaydi, TakvimAraligiGirdisi, TakvimKaynagi } from './servis.ts';
// Arkon (A7, #517) vardiya saatlerini ve molalarını buradan okur; Arkon'da vardiya yazılmaz. Haftanın hangi günü hangi vardiyanın
// çalıştığını (`vardiyaMatrisi`, takvim ekranının matrisi) ve tatil günlerini (`takvimGunleri`) de buradan okur.
export { vardiyaMatrisi, vardiyaTanimlari } from './servis.ts';
// Kişi -> vardiya (takvim ekranının `kisiVardiyalari` alanıyla aynı okuma). Satış teklifi denemesi (R&R) sunucuda takvim ekini bununla ve
// `vardiyaMatrisi` ile kurar. Vardiyası olmayan kişi listede yoktur. Yetki denetlemez: çağıran uç denetler.
export { kisiVardiyalari } from './sorgular.ts';
// Tek tanım (kullanıcı kararı "Tek tanım"): iş merkezi x vardiya kadrosu (kişiler ve atama payı, sent) ve iş merkezinin çalışan makine sayısı.
// İstasyonlar ve Vardiya ekranları, kapasite ve OEE kişi ve makine sayısını yalnız buradan alır.
export { calisirMakineSayilari, isMerkeziKisiPaylari, vardiyaKadrosu } from './servis.ts';
export type { KadroSatiri } from './kurallar.ts';
// Arkon gün kaydı (anomali, emek verimi) gece vardiyasını başladığı güne yazar: o gün başlayan vardiyaların aralıkları ve bitişi.
// Toplu sürüm (`basladigiGunTakvimleri`) kişi x gün okumasını tek hesap turunda yapar.
export { basladigiGunTakvimi, basladigiGunTakvimleri } from './servis.ts';
export type { BasladigiGun } from './servis.ts';
export type { Vardiya } from '#paylasilan/sozlesme/vardiya.ts';
export type { KaynakTakvimi } from '#paylasilan/sozlesme/vardiya.ts';
// Takvim (891): aralıkta başlayan tek seferlik planlı duruşlar; yetki denetlemez, çağıran denetler.
export { takvimKayitlari } from './servis.ts';
