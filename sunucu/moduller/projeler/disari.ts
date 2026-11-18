// Başka modüller (üretim emirleri: emir numarasındaki proje no) projeyi buradan alır. Fonksiyonlar çağıranın db'sini
// kullanır, transaction açmaz, yetki denetlemez (denetim çağıran modülün ucundadır).
export {
  projeAdlari, projeKoduIleBul, projeNo, projeOzeti as projeGetir, projeSecenekleri, siparisinProjeleri, siparisTerminiYansit as projeBitisiniSiparisTermineKaydir,
  siparistenProjeAcDisari as siparistenProjeAc,
} from './servis.ts';
export type { ProjeAyrintiOzeti, ProjeOzeti } from './servis.ts';
export { projeAcildiDinle, projeDegistiDinle } from './proje-olaylari.ts';
export type { ProjeOlayi, ProjeOlayiDinleyicisi } from './proje-olaylari.ts';
export type { SiparistenProjeVerisi } from '#paylasilan/sozlesme/projeler.ts';
export { hazirlikGorevleri, hazirlikGorevleriAc, hazirlikSablonlari, projeninHazirlikGorevleri } from './hazirlik-gorevleri.ts';
export type { HazirlikGorevi, HazirlikGorevleriAcVerisi, HazirlikHedefi, HazirlikMaddeBilgisi, HazirlikPlani } from './hazirlik-gorevleri.ts';
// 3405: kademeli uyarı kaynakları (hazırlık görevi ve proje görevi); bağ kablolamadadır.
export { hazirlikKademeKayitlari, kapaliEmirCozucusuKaydet, projeGoreviKademeKayitlari } from './hazirlik-kademe.ts';
export type { KapaliEmirCozucusu } from './hazirlik-kademe.ts';
