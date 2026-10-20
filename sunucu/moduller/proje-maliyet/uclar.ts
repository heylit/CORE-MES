import { uc } from '#cekirdek/uc.ts';
import { projeMaliyetCevabi, projeMaliyetParametresi } from '#paylasilan/sozlesme/proje-maliyet.ts';
import { projeMaliyeti } from './servis.ts';

export const uclar = [
  // Projeler'in Maliyet sekmesi (197 a). Maliyet finans.maliyet-oku ister; tutar, katkı ve kâr ayrıca siparisler.fiyat-oku (servis).
  uc({
    yontem: 'GET',
    yol: '/proje-maliyet/:projeId',
    yetki: 'finans.maliyet-oku',
    parametre: projeMaliyetParametresi,
    cevap: projeMaliyetCevabi,
    isle: ({ db, kullanici, parametre }) => projeMaliyeti(db, kullanici, parametre.projeId),
  }),
];
