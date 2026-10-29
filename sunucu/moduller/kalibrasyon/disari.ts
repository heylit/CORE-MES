// kayitAramaKaynaklari (1243): genel aramanın ölçü aleti kaynağı; okuma işlemini çekirdek denetler (paylasilan/kayit-aramasi.ts).
// takvimKayitlari (891): vadesi aralıktaki kullanımdaki aletler; yetki denetlemez, çağıran kalibrasyon.oku'yu denetler.
export {
  aktifTurler as aletTurleri,
  aletGetir,
  aletKimlikleri,
  aletNoIleGetir,
  aletlerVeKayitlari,
  gecerliAletVarMi,
  olcumAletiGecerliMi,
  takvimKayitlari,
  vadesiGecenAletSayisi,
} from './servis.ts';
export { kayitAramaKaynaklari } from './arama/servis.ts';
export type { AletKaydi, AletKimligi } from './servis.ts';
