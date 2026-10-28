// Güvenlik Merkezi koruma durumu yedeği sağlık uyarısıyla aynı kaynaktan ve aynı eşikle okur.
export { yedekUyarisi, type YedekBilgisi } from './kurallar.ts';
export { surecYedegi } from './servis.ts';
// Güvenlik Merkezi sunucu durumu kartı diski aynı ölçüm ve aynı "az yer" eşiğiyle gösterir.
export { diskDurumu } from './kurallar.ts';
export { diskOku, type DiskOlcusu } from './servis.ts';
