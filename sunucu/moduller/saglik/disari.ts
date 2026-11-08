// Güvenlik Merkezi koruma durumu yedeği sağlık uyarısıyla aynı kaynaktan ve aynı eşikle okur.
export { yedekUyarisi, type YedekBilgisi } from './kurallar.ts';
export { surecYedegi } from './servis.ts';
// Güvenlik Merkezi sunucu durumu kartı diski aynı ölçüm ve aynı "az yer" eşiğiyle gösterir.
export { diskDurumu } from './kurallar.ts';
export { diskOku, type DiskOlcusu } from './servis.ts';
// Geri yükleme denemesinin kayıt dosyası ve satır biçimi (1670): araç yazar, sağlık okur.
export { DENEME_KAYDI_DOSYASI, denemeSatiri } from './kurallar.ts';
// Güvenlik Merkezi ayar denetimi geri yükleme denemesini aynı eşik ve metinle sınıflar (2164).
export { denemeUyarisi } from './kurallar.ts';
// Şifreli dış kopya kaydının dosya adı ve satır biçimi (2290, 2282b): araç yazar, sağlık okur.
export { DIS_KOPYA_KAYDI_DOSYASI, disKopyaSatiri } from './kurallar.ts';
export type { DisKopyaKaydi } from '#paylasilan/sozlesme/saglik.ts';
