import { uc } from '#cekirdek/uc.ts';
import {
  emirAkisiCevabi, emirListesiCevabi, emirParametresi, kartAkisiCevabi, kartOzetleriCevabi, kartOzetleriSorgusu, kartParametresi,
} from '#paylasilan/sozlesme/akis.ts';
import { emirAkisiOku, emirListesi, kartAkisiOku, kartOzetleri } from './servis.ts';

// Modül yalnız okur: uçlar sayfa işlemiyle açılır, yazma ucu yoktur.
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
  // Refakat kartları listesindeki rota, son an ve lead (kart #708); en çok KART_OZETI_SINIRI kart.
  uc({
    yontem: 'GET',
    yol: '/akis/refakat-kartlari',
    yetki: OKUMA,
    sorgu: kartOzetleriSorgusu,
    cevap: kartOzetleriCevabi,
    isle: ({ db, sorgu }) => kartOzetleri(db, sorgu.idler),
  }),
  // Refakat kartının akışı (kart #708): Stok'taki Refakat kartları sayfası okur; yetki Akış Süresi sayfasınınkidir.
  uc({
    yontem: 'GET',
    yol: '/akis/refakat-kartlari/:id',
    yetki: OKUMA,
    parametre: kartParametresi,
    cevap: kartAkisiCevabi,
    isle: ({ db, parametre }) => kartAkisiOku(db, parametre.id),
  }),
];
