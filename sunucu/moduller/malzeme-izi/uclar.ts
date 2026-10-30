import { uc } from '#cekirdek/uc.ts';
import { malzeme360Cevabi, malzemeAramaCevabi, malzemeAramaSorgusu, malzemeParametresi } from '#paylasilan/sozlesme/malzeme-izi.ts';
import { malzeme360, malzemeleriAra } from './servis.ts';

// Modül yalnız okur (1277 a): uçlar sayfa işlemiyle açılır, yazma ucu yoktur. Fiyat ayrıca finans.oku ister (servis).
const OKUMA = { biri: ['sayfa.malzeme-izi'] } as const;

export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/malzeme-izi/malzemeler',
    yetki: OKUMA,
    sorgu: malzemeAramaSorgusu,
    cevap: malzemeAramaCevabi,
    isle: ({ db, sorgu }) => malzemeleriAra(db, sorgu),
  }),
  uc({
    yontem: 'GET',
    yol: '/malzeme-izi/malzemeler/:id',
    yetki: OKUMA,
    parametre: malzemeParametresi,
    cevap: malzeme360Cevabi,
    isle: ({ db, parametre, kullanici }) => malzeme360(db, parametre.id, kullanici.islemler),
  }),
];
