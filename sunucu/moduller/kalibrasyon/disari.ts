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
export type { AletKaydi, AletKimligi } from './servis.ts';
