import { uc } from '#cekirdek/uc.ts';
import {
  durusNedeniGuncelleGovdesi, durusNedeniOlusturGovdesi, durusNedeniSemasi, durusNedenleriCevabi,
  hurdaNedeniGuncelleGovdesi, hurdaNedeniOlusturGovdesi, hurdaNedeniSemasi, hurdaNedenleriCevabi,
  nedenParametresi, nedenSorgusu,
} from '#paylasilan/sozlesme/durus-nedenleri.ts';
import {
  durusNedeniGuncelle, durusNedeniOlustur, durusNedenleriCevabi as durusListesi,
  hurdaNedeniGuncelle, hurdaNedeniOlustur, hurdaNedenleriCevabi as hurdaListesi,
} from './servis.ts';

// Nedenleri kendi sayfası ve terminal (duruş ve hurda seçimi) okur. Arkon ve üretim emirleri `disari.ts` ile okur; o yol uçtan geçmez.
const OKUMA = { biri: ['sayfa.durus-nedenleri', 'sayfa.terminal'] } as const;

export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/durus-nedenleri',
    yetki: OKUMA,
    sorgu: nedenSorgusu,
    cevap: durusNedenleriCevabi,
    isle: ({ db, sorgu }) => durusListesi(db, sorgu.yalnizAktif),
  }),
  uc({
    yontem: 'POST',
    yol: '/durus-nedenleri',
    yetki: 'durus-nedenleri.yaz',
    govde: durusNedeniOlusturGovdesi,
    cevap: durusNedeniSemasi,
    isle: ({ db, govde }) => durusNedeniOlustur(db, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/durus-nedenleri/:id/guncelle',
    yetki: 'durus-nedenleri.yaz',
    parametre: nedenParametresi,
    govde: durusNedeniGuncelleGovdesi,
    cevap: durusNedeniSemasi,
    isle: ({ db, parametre, govde }) => durusNedeniGuncelle(db, parametre.id, govde),
  }),
  uc({
    yontem: 'GET',
    yol: '/hurda-nedenleri',
    yetki: OKUMA,
    sorgu: nedenSorgusu,
    cevap: hurdaNedenleriCevabi,
    isle: ({ db, sorgu }) => hurdaListesi(db, sorgu.yalnizAktif),
  }),
  uc({
    yontem: 'POST',
    yol: '/hurda-nedenleri',
    yetki: 'durus-nedenleri.yaz',
    govde: hurdaNedeniOlusturGovdesi,
    cevap: hurdaNedeniSemasi,
    isle: ({ db, govde }) => hurdaNedeniOlustur(db, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/hurda-nedenleri/:id/guncelle',
    yetki: 'durus-nedenleri.yaz',
    parametre: nedenParametresi,
    govde: hurdaNedeniGuncelleGovdesi,
    cevap: hurdaNedeniSemasi,
    isle: ({ db, parametre, govde }) => hurdaNedeniGuncelle(db, parametre.id, govde),
  }),
];
