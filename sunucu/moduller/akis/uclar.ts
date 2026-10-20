import { uc } from '#cekirdek/uc.ts';
import { emirAkisiCevabi, emirListesiCevabi, emirParametresi } from '#paylasilan/sozlesme/akis.ts';
import { emirAkisiOku, emirListesi } from './servis.ts';

// Modül yalnız okur: iki uç da sayfa işlemiyle açılır, yazma ucu yoktur.
const OKUMA = { biri: ['sayfa.akis'] } as const;

export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/akis/emirler',
    yetki: OKUMA,
    cevap: emirListesiCevabi,
    isle: ({ db }) => emirListesi(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/akis/emirler/:id',
    yetki: OKUMA,
    parametre: emirParametresi,
    cevap: emirAkisiCevabi,
    isle: ({ db, parametre }) => emirAkisiOku(db, parametre.id),
  }),
];
