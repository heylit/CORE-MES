import { uc } from '#cekirdek/uc.ts';
import {
  emirAkisiCevabi, emirListesiCevabi, emirListesiSorgusu, emirParametresi, kartAkisiCevabi, kartOzetleriCevabi, kartOzetleriSorgusu, kartParametresi,
  siparisAkisiCevabi, siparisAsamalariCevabi, siparisAsamalariSorgusu, siparisParametresi,
} from '#paylasilan/sozlesme/akis.ts';
import { emirAkisiOku, emirListesi, kartAkisiOku, kartOzetleri, siparisAkisiOku, siparisAsamalari } from './servis.ts';

// Modül yalnız okur: uçlar sayfa işlemiyle açılır, yazma ucu yoktur. Refakat kartı uçlarını kartın akışını gören dar işlem de açar
// (AKS-5 a, 1870): depo kartı görür, emir yolculuğunu görmez.
const OKUMA = { biri: ['sayfa.akis'] } as const;
const KART_OKUMA = { biri: ['sayfa.akis', 'akis.kart-oku'] } as const;
// 3429-1: siparişin akışı siparişi okuyanındır (Siparişler ayrıntısı ve listesi); fiyat taşımaz.
const SIPARIS_OKUMA = 'siparisler.oku';

export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/akis/emirler',
    yetki: OKUMA,
    sorgu: emirListesiSorgusu,
    cevap: emirListesiCevabi,
    isle: ({ db, sorgu }) => emirListesi(db, sorgu),
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
    yetki: KART_OKUMA,
    sorgu: kartOzetleriSorgusu,
    cevap: kartOzetleriCevabi,
    isle: ({ db, sorgu }) => kartOzetleri(db, sorgu.idler),
  }),
  // Refakat kartının akışı (kart #708): Stok'taki Refakat kartları sayfası okur.
  uc({
    yontem: 'GET',
    yol: '/akis/refakat-kartlari/:id',
    yetki: KART_OKUMA,
    parametre: kartParametresi,
    cevap: kartAkisiCevabi,
    isle: ({ db, parametre }) => kartAkisiOku(db, parametre.id),
  }),
  // 3429-1 (SPA-1..SPA-4): siparişin onaydan kapanışa akışı.
  uc({
    yontem: 'GET',
    yol: '/akis/siparisler/:id',
    yetki: SIPARIS_OKUMA,
    parametre: siparisParametresi,
    cevap: siparisAkisiCevabi,
    isle: ({ db, parametre }) => siparisAkisiOku(db, parametre.id),
  }),
  uc({
    yontem: 'GET',
    yol: '/akis/siparis-asamalari',
    yetki: SIPARIS_OKUMA,
    sorgu: siparisAsamalariSorgusu,
    cevap: siparisAsamalariCevabi,
    isle: ({ db, sorgu }) => siparisAsamalari(db, sorgu.idler),
  }),
];
