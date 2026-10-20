// Başka modüller (üretim emirleri: emir numarasındaki proje no) projeyi buradan alır. Fonksiyonlar çağıranın db'sini
// kullanır, transaction açmaz, yetki denetlemez (denetim çağıran modülün ucundadır).
export {
  projeAdlari, projeKoduIleBul, projeNo, projeOzeti as projeGetir, projeSecenekleri, siparisinProjeleri,
  siparistenProjeAcDisari as siparistenProjeAc,
} from './servis.ts';
export type { ProjeAyrintiOzeti, ProjeOzeti } from './servis.ts';
export type { SiparistenProjeVerisi } from '#paylasilan/sozlesme/projeler.ts';
