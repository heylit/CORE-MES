// Başka istemci modülünün gömdüğü bildirim parçaları: Bildirim ve uyarı yönetimi ekranı (ayarlar) kademeli uyarı kaynaklarını
// aynı sayfada sekme olarak gösterir ve modül adlarını buradan alır (3435-3 a). 3478-1 a: kademe kaynakları olay listesinde tek satırdır;
// ayar penceresi ve merdiven buradan gömülür, önbellek anahtarı paylaşılır.
import { anahtarlar } from './anahtarlar.ts';

export const KADEME_AYAR_ANAHTARI = anahtarlar.kademeKaynaklari;
export { KademeAyarPenceresi, KademeliUyari, kademeGovdesi } from './Kademe.tsx';
export { MiniMerdiven } from './Merdiven.tsx';
export { modulAdi } from './gorunum.ts';
