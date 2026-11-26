import { uc } from '#cekirdek/uc.ts';
import { teslimCevabi } from '#paylasilan/sozlesme/stok.ts';
import {
  acikTeslimlerCevabi, cikisGovdesi, emirParametresi, emirTakimListesiSemasi, emirTakimiGovdesi, girisCevabi, girisGovdesi, kutuphaneBagGovdesi, kutuphaneCevabi,
  rafGozleriCevabi, rafGozuSorgusu, topluGirisCevabi, topluGirisGovdesi,
  aparatCevabi as aparatCevapSemasi, emirAparatCevabi as emirAparatCevapSemasi, iadeGovdesi, kartParametresi, ozellikGovdesi, seceneklerCevabi, takimSorgusu, takimhaneOzetiSemasi, takimlarCevabi,
} from '#paylasilan/sozlesme/takimhane.ts';
import { z } from 'zod';
import * as ap from './aparat.ts';
import * as s from './servis.ts';

// Okuma kendi sayfasının işlemidir. Bakiye Stok'ta kalır: çıkış, iade ve başlangıç stoğu Stok'un işlemleriyle yapılır (yeni işlem yok, 3613 Risk).
const OKUMA = { biri: ['sayfa.takimhane'] } as const;
const tamam = z.object({ tamam: z.literal(true) });

export const uclar = [
  uc({ yontem: 'GET', yol: '/takimhane/ozet', yetki: OKUMA, cevap: takimhaneOzetiSemasi, isle: ({ db }) => s.ozet(db) }),
  uc({
    yontem: 'GET', yol: '/takimhane/takimlar', yetki: OKUMA, sorgu: takimSorgusu, cevap: takimlarCevabi,
    isle: async ({ db, sorgu }) => ({ takimlar: await s.takimlar(db, sorgu.q ?? null) }),
  }),
  uc({
    yontem: 'POST', tekrarKorumali: true, yol: '/takimhane/takimlar/:kart/ozellik', yetki: 'stok.malzeme-ayari', parametre: kartParametresi, govde: ozellikGovdesi, cevap: tamam,
    isle: ({ db, parametre, govde }) => s.ozellikYaz(db, parametre.kart, govde),
  }),
  uc({ yontem: 'GET', yol: '/takimhane/secenekler', yetki: 'takimhane.cikis-iade', cevap: seceneklerCevabi, isle: ({ db }) => s.secenekler(db) }),
  uc({
    yontem: 'GET', yol: '/takimhane/teslimdekiler', yetki: OKUMA, cevap: acikTeslimlerCevabi,
    isle: async ({ db }) => ({ teslimler: await s.teslimdekiler(db) }),
  }),
  uc({
    yontem: 'POST', tekrarKorumali: true, kilitlenmedeYinele: true, yol: '/takimhane/cikis', yetki: 'takimhane.cikis-iade', govde: cikisGovdesi, cevap: teslimCevabi,
    isle: ({ db, kullanici, govde }) => s.cikis(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', tekrarKorumali: true, kilitlenmedeYinele: true, yol: '/takimhane/iade', yetki: 'takimhane.cikis-iade', govde: iadeGovdesi, cevap: teslimCevabi,
    isle: ({ db, kullanici, govde }) => s.iade(db, kullanici, govde),
  }),
  uc({
    yontem: 'GET', yol: '/takimhane/emirler/:id/takimlar', yetki: OKUMA, parametre: emirParametresi, cevap: emirTakimListesiSemasi,
    isle: ({ db, parametre }) => s.emirTakimListesi(db, parametre.id),
  }),
  uc({
    yontem: 'POST', tekrarKorumali: true, yol: '/takimhane/emirler/:id/takimlar', yetki: 'takimhane.cikis-iade', parametre: emirParametresi, govde: emirTakimiGovdesi, cevap: emirTakimListesiSemasi,
    isle: ({ db, parametre, govde }) => s.emirTakimListesiYaz(db, parametre.id, govde),
  }),
  // Aparat (3651): ayırma yazılmaz, plan penceresinden türetilir; yazan uç yoktur (çıkış ve iade yukarıdaki uçlardır).
  uc({ yontem: 'GET', yol: '/takimhane/aparat', yetki: OKUMA, cevap: aparatCevapSemasi, isle: ({ db }) => ap.aparatCevabi(db) }),
  uc({
    yontem: 'GET', yol: '/takimhane/emirler/:id/aparat', yetki: OKUMA, parametre: emirParametresi, cevap: emirAparatCevapSemasi,
    isle: ({ db, parametre }) => ap.emirAparatCevabi(db, parametre.id),
  }),
  // 3762: tek kütüphane (CNC), raf gözü seçimi, gözüne göre açılış ya da kör sayım. Açılış stok.giris, sayım stok.sayim ister: uç ikisinden
  // birini, servis gözün türüne göre doğrusunu denetler (yeni işlem yok).
  uc({ yontem: 'GET', yol: '/takimhane/kutuphane', yetki: OKUMA, cevap: kutuphaneCevabi, isle: ({ db }) => s.kutuphane(db) }),
  uc({
    yontem: 'GET', yol: '/takimhane/raf-gozleri', yetki: { biri: ['stok.giris', 'stok.sayim', 'takimhane.cikis-iade'] }, sorgu: rafGozuSorgusu, cevap: rafGozleriCevabi,
    isle: ({ db, sorgu }) => s.rafGozleri(db, sorgu.q ?? null, sorgu.kart ?? null),
  }),
  uc({
    yontem: 'POST', tekrarKorumali: true, kilitlenmedeYinele: true, yol: '/takimhane/giris', yetki: { biri: ['stok.giris', 'stok.sayim'] }, govde: girisGovdesi, cevap: girisCevabi,
    isle: ({ db, kullanici, govde }) => s.giris(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/takimhane/toplu/denetle', yetki: { biri: ['stok.giris', 'stok.sayim'] }, govde: topluGirisGovdesi.pick({ satirlar: true }), cevap: topluGirisCevabi,
    isle: ({ db, govde }) => s.topluDenetle(db, govde),
  }),
  uc({
    yontem: 'POST', tekrarKorumali: true, kilitlenmedeYinele: true, yol: '/takimhane/toplu', yetki: 'stok.giris', govde: topluGirisGovdesi, cevap: topluGirisCevabi,
    isle: ({ db, kullanici, govde }) => s.topluYaz(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', tekrarKorumali: true, yol: '/takimhane/takimlar/:kart/kutuphane', yetki: 'malzemeler.yaz', parametre: kartParametresi, govde: kutuphaneBagGovdesi, cevap: tamam,
    isle: ({ db, kullanici, parametre, govde }) => s.kutuphaneyeBagla(db, kullanici, parametre.kart, govde.kimlik),
  }),
];
