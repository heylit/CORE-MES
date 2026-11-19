// Akışın dışa açık okuması (3429-1, 3429-2): siparişin kapanış eksikleri (Siparişler'in kapatma kapısı) ve termin riskleri (kademeli uyarı); kablolama.ts bağlar. Yetki denetlemez.
export { siparisKapanisEksikleri, siparisTerminRiskleri } from './servis.ts';
export type { SiparisTerminRiski } from './servis.ts';
