import { uc } from '#cekirdek/uc.ts';
import { teslimCevabi } from '#paylasilan/sozlesme/stok.ts';
import {
  acikTeslimlerCevabi, aktarimOnizlemeCevabi, aktarimOnizlemeGovdesi, cikisGovdesi, emirParametresi, emirTakimListesiSemasi, emirTakimiGovdesi,
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
  // Yalnız ön izleme: hiçbir şey yazılmaz. Başlangıç stoğu yazımı sonraki iştir (gerçek veri yalnız canlıda girer, V7).
  uc({
    yontem: 'POST', yol: '/takimhane/baslangic/onizleme', yetki: 'stok.giris', govde: aktarimOnizlemeGovdesi, cevap: aktarimOnizlemeCevabi,
    isle: ({ govde }) => s.aktarimOnizleme(govde.satirlar),
  }),
];
