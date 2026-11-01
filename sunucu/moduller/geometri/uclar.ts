import { ikiliCevap, uc } from '#cekirdek/uc.ts';
import {
  geometriAnalizCevabi, geometriHamCevabi, geometriHamSorgusu, geometriModelListeCevabi, geometriModelListeSorgusu, revizyonParametresi,
  yenidenHesaplaCevabi, yenidenHesaplaGovdesi,
} from '#paylasilan/sozlesme/geometri.ts';
import { analizOku, hamOnerisi, modelDosyasi, modelListesi, yenidenHesapla } from './servis.ts';

// Okuma geometri.oku ister (sayfa yalnız menü görünürlüğüdür). Yeniden hesaplatma ayrı işlemdir; uç yalnız kuyruğa yazar,
// hesabı ayrı süreç yapar (1427 a).
export const uclar = [
  uc({
    yontem: 'GET', yol: '/geometri/modeller', yetki: 'geometri.oku',
    sorgu: geometriModelListeSorgusu, cevap: geometriModelListeCevabi,
    isle: ({ db, sorgu }) => modelListesi(db, sorgu),
  }),
  uc({
    yontem: 'GET', yol: '/geometri/modeller/:revizyonId/dosya', yetki: 'geometri.oku',
    parametre: revizyonParametresi, cevap: ikiliCevap,
    isle: ({ db, parametre }) => modelDosyasi(db, parametre.revizyonId),
  }),
  uc({
    yontem: 'GET', yol: '/geometri/analizler/:revizyonId', yetki: 'geometri.oku',
    parametre: revizyonParametresi, cevap: geometriAnalizCevabi,
    isle: ({ db, parametre }) => analizOku(db, parametre.revizyonId),
  }),
  uc({
    yontem: 'GET', yol: '/geometri/ham-onerisi/:revizyonId', yetki: 'geometri.oku',
    parametre: revizyonParametresi, sorgu: geometriHamSorgusu, cevap: geometriHamCevabi,
    isle: ({ db, parametre, sorgu }) => hamOnerisi(db, parametre.revizyonId, sorgu.payMm),
  }),
  uc({
    yontem: 'POST', yol: '/geometri/analizler/:revizyonId/yeniden-hesapla', yetki: 'geometri.hesapla', tekrarKorumali: true,
    parametre: revizyonParametresi, govde: yenidenHesaplaGovdesi, cevap: yenidenHesaplaCevabi,
    isle: ({ db, parametre, govde }) => yenidenHesapla(db, parametre.revizyonId, govde.surum),
  }),
];
