import { uc } from '#cekirdek/uc.ts';
import { tezgahAyrintisiCevabi, tezgahBaglantisiDurumCevabi, tezgahParametresi, tezgahTakimTablosuCevabi, tezgahTuruCevabi, tezgahTuruGovdesi } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import { tezgahEslemeCevabi, tezgahEslemeGovdesi } from '#paylasilan/sozlesme/tezgah-deneme.ts';
import { ortamIstemcisi } from './baglanti.ts';
import * as deneme from './deneme-servis.ts';
import { lsv2Bellegi, turBellegi } from './isler.ts';
import * as servis from './servis.ts';

// Deneme ekranı okunan değerleri yalnız gösterir; tek yazma tezgâh türü seçimidir (çizim ayarı). Sayfa işlemi hiçbir role verilmez (yalnız yönetici).
export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/tezgah-baglantisi/durum',
    yetki: { biri: ['sayfa.tezgah-baglantisi'] },
    cevap: tezgahBaglantisiDurumCevabi,
    isle: ({ db }) => servis.durum(db, ortamIstemcisi, turBellegi, new Date(), { bellek: lsv2Bellegi }),
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
    yontem: 'GET',
    yol: '/tezgah-baglantisi/tezgahlar/:cihazAdi/takim-tablosu',
    yetki: { biri: ['sayfa.tezgah-baglantisi'] },
    parametre: tezgahParametresi,
    cevap: tezgahTakimTablosuCevabi,
    isle: ({ db, parametre }) => servis.takimTablosu(db, parametre.cihazAdi),
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
  // Deneme sayfası (kart 3811): eşleme ve makine başına deneme ayarları; yalnız bu modülün tablosuna yazar.
  uc({
    yontem: 'GET',
    yol: '/tezgah-baglantisi/deneme/esleme',
    yetki: { biri: ['sayfa.tezgah-baglantisi'] },
    cevap: tezgahEslemeCevabi,
    isle: ({ db }) => deneme.esleme(db),
  }),
  uc({
    yontem: 'POST',
    yol: '/tezgah-baglantisi/deneme/esleme/:cihazAdi/kaydet',
    yetki: { biri: ['sayfa.tezgah-baglantisi'] },
    parametre: tezgahParametresi,
    govde: tezgahEslemeGovdesi,
    cevap: tezgahEslemeCevabi,
    isle: ({ db, kullanici, parametre, govde }) => deneme.eslemeKaydet(db, kullanici, parametre.cihazAdi, govde),
  }),
];
