import { uc } from '#cekirdek/uc.ts';
import { prosesParcaCevabi, prosesParcaSorgusu } from '#paylasilan/sozlesme/proses.ts';
import { parcaDosyasi } from './servis.ts';

export const uclar = [
  // Parça proses dosyası (3290): çizimden ilk parçaya halkaların durumu ve rotanın operasyonları; yalnız okuma.
  uc({
    yontem: 'GET',
    yol: '/proses/parca',
    yetki: 'proses.oku',
    sorgu: prosesParcaSorgusu,
    cevap: prosesParcaCevabi,
    isle: ({ db, sorgu }) => parcaDosyasi(db, sorgu.malzemeNo),
  }),
];
