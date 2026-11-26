import { uc } from '#cekirdek/uc.ts';
import { tezgahAyrintisiCevabi, tezgahBaglantisiDurumCevabi, tezgahParametresi, tezgahTuruCevabi, tezgahTuruGovdesi } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import { lsv2Makineleri, ortamIstemcisi } from './baglanti.ts';
import { lsv2Bellegi, turBellegi } from './isler.ts';
import * as servis from './servis.ts';

// Deneme ekranı okunan değerleri yalnız gösterir; tek yazma tezgâh türü seçimidir (çizim ayarı). Sayfa işlemi hiçbir role verilmez (yalnız yönetici).
export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/tezgah-baglantisi/durum',
    yetki: { biri: ['sayfa.tezgah-baglantisi'] },
    cevap: tezgahBaglantisiDurumCevabi,
    isle: ({ db }) => servis.durum(db, ortamIstemcisi, turBellegi, new Date(), { makineler: lsv2Makineleri, bellek: lsv2Bellegi }),
  }),
  uc({
    yontem: 'GET',
    yol: '/tezgah-baglantisi/tezgahlar/:cihazAdi',
    yetki: { biri: ['sayfa.tezgah-baglantisi'] },
    parametre: tezgahParametresi,
    cevap: tezgahAyrintisiCevabi,
    isle: ({ db, parametre }) => servis.ayrinti(db, parametre.cihazAdi, new Date(), turBellegi),
  }),
  uc({
    yontem: 'POST',
    yol: '/tezgah-baglantisi/tezgahlar/:cihazAdi/tur',
    yetki: { biri: ['sayfa.tezgah-baglantisi'] },
    parametre: tezgahParametresi,
    govde: tezgahTuruGovdesi,
    cevap: tezgahTuruCevabi,
    isle: ({ db, parametre, govde }) => servis.turAta(db, parametre.cihazAdi, govde.tur),
  }),
];
