import { uc } from '#cekirdek/uc.ts';
import {
  ncProgramEkleGovdesi, ncProgramKaydetGovdesi, ncProgramParametresi, ncProgramYazmaCevabi, prosesParcaCevabi, prosesParcaSorgusu,
} from '#paylasilan/sozlesme/proses.ts';
import { ncProgramEkle, ncProgramKaydet, parcaDosyasi } from './servis.ts';

export const uclar = [
  // Parça proses dosyası (3290): çizimden ilk parçaya halkaların durumu, rotanın operasyonları ve seçili teknik resim revizyonunun
  // NC programları (3800); yalnız okuma.
  uc({
    yontem: 'GET',
    yol: '/proses/parca',
    yetki: 'proses.oku',
    sorgu: prosesParcaSorgusu,
    cevap: prosesParcaCevabi,
    isle: ({ db, sorgu }) => parcaDosyasi(db, sorgu.malzemeNo, sorgu.rev ?? null),
  }),
  // NC/CAM program kaydı (3800 A): program, takım listesi ve aparatlar tek komutla yazılır.
  uc({
    yontem: 'POST',
    yol: '/proses/nc-programlari/ekle',
    yetki: 'proses.nc-yaz',
    tekrarKorumali: true,
    govde: ncProgramEkleGovdesi,
    cevap: ncProgramYazmaCevabi,
    isle: ({ db, kullanici, govde }) => ncProgramEkle(db, kullanici.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/proses/nc-programlari/:id/kaydet',
    yetki: 'proses.nc-yaz',
    tekrarKorumali: true,
    parametre: ncProgramParametresi,
    govde: ncProgramKaydetGovdesi,
    cevap: ncProgramYazmaCevabi,
    isle: ({ db, kullanici, parametre, govde }) => ncProgramKaydet(db, kullanici.id, parametre.id, govde),
  }),
];
