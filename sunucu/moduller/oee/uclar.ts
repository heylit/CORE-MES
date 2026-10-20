import { uc } from '#cekirdek/uc.ts';
import { oeeCevabi, oeeSorgusu } from '#paylasilan/sozlesme/oee.ts';
import { oee } from './servis.ts';

export const uclar = [
  // Makine, istasyon ve iş merkezi OEE'si (kart #1330); tutarlar yalnız finans.maliyet-oku olana dolu.
  uc({
    yontem: 'GET',
    yol: '/oee',
    yetki: 'oee.oku',
    sorgu: oeeSorgusu,
    cevap: oeeCevabi,
    isle: ({ db, kullanici, sorgu }) => oee(db, kullanici, sorgu),
  }),
];
