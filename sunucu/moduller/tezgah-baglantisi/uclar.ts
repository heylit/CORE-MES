import { uc } from '#cekirdek/uc.ts';
import { tezgahAyrintisiCevabi, tezgahBaglantisiDurumCevabi, tezgahParametresi } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import { ortamIstemcisi } from './baglanti.ts';
import { turBellegi } from './isler.ts';
import * as servis from './servis.ts';

// Deneme ekranı yalnız okur; sayfa işlemi hiçbir role verilmez (yalnız yönetici).
export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/tezgah-baglantisi/durum',
    yetki: { biri: ['sayfa.tezgah-baglantisi'] },
    cevap: tezgahBaglantisiDurumCevabi,
    isle: ({ db }) => servis.durum(db, ortamIstemcisi, turBellegi, new Date()),
  }),
  uc({
    yontem: 'GET',
    yol: '/tezgah-baglantisi/tezgahlar/:cihazAdi',
    yetki: { biri: ['sayfa.tezgah-baglantisi'] },
    parametre: tezgahParametresi,
    cevap: tezgahAyrintisiCevabi,
    isle: ({ db, parametre }) => servis.ayrinti(db, parametre.cihazAdi, new Date(), turBellegi),
  }),
];
