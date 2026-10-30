import { uc } from '#cekirdek/uc.ts';
import {
  istasyon360Cevabi, kaynakAramaCevabi, kaynakAramaSorgusu, kaynakParametresi, kisi360Cevabi, makine360Cevabi,
} from '#paylasilan/sozlesme/kaynak-izi.ts';
import { istasyon360, kaynakAra, kisi360, makine360 } from './servis.ts';

// Modül yalnız okur (1304 a): uçlar sayfa işlemiyle açılır, yazma ucu yoktur. Bölümler ayrıca sahibinin okuma işlemini ister (1322 a, servis).
const OKUMA = { biri: ['sayfa.kaynak-izi'] } as const;

export const uclar = [
  uc({ yontem: 'GET', yol: '/kaynak-izi/kaynaklar', yetki: OKUMA, sorgu: kaynakAramaSorgusu, cevap: kaynakAramaCevabi, isle: ({ db, sorgu }) => kaynakAra(db, sorgu.metin) }),
  uc({
    yontem: 'GET', yol: '/kaynak-izi/istasyonlar/:id', yetki: OKUMA, parametre: kaynakParametresi, cevap: istasyon360Cevabi,
    isle: ({ db, kullanici, parametre }) => istasyon360(db, kullanici, parametre.id),
  }),
  uc({
    yontem: 'GET', yol: '/kaynak-izi/makineler/:id', yetki: OKUMA, parametre: kaynakParametresi, cevap: makine360Cevabi,
    isle: ({ db, kullanici, parametre }) => makine360(db, kullanici, parametre.id),
  }),
  uc({
    yontem: 'GET', yol: '/kaynak-izi/kisiler/:id', yetki: OKUMA, parametre: kaynakParametresi, cevap: kisi360Cevabi,
    isle: ({ db, kullanici, parametre }) => kisi360(db, kullanici, parametre.id),
  }),
];
