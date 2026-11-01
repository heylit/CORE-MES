import { ikiliCevap, uc } from '#cekirdek/uc.ts';
import {
  geometriAnalizCevabi, geometriHamCevabi, geometriHamSorgusu, geometriModelListeCevabi, geometriModelListeSorgusu, revizyonParametresi,
  yenidenHesaplaCevabi, yenidenHesaplaGovdesi, agirlikOzetiCevabi, malzemeParametresi,
} from '#paylasilan/sozlesme/geometri.ts';
import type { AgirlikOzetiCevabi } from '#paylasilan/sozlesme/geometri.ts';
import { analizOku, hamOnerisi, malzemeGeometrisi, modelDosyasi, modelListesi, yenidenHesapla } from './servis.ts';
import type { MalzemeGeometrisi } from './servis.ts';

// 1710: kartın ağırlık özeti; alan seçimidir, hesap ekranındadır.
const agirlikOzeti = (g: MalzemeGeometrisi | null): AgirlikOzetiCevabi => {
  if (g === null) return { model: null, hacimMm3: null, neden: 'model-yok', kalite: null };
  const model = { belgeAdi: g.belgeAdi, harf: g.harf };
  const a = g.analiz.analiz;
  const o = g.ham.oneriler[0];
  const kalite = o === undefined ? null : { ad: o.kalite, aile: o.aile, kaliteKodu: o.kaliteKodu, yogunluk: o.yogunluk };
  if (a === null) return { model, hacimMm3: null, neden: 'analiz-yok', kalite };
  return { model, hacimMm3: a.hacimMm3, neden: a.hacimMm3 === null ? 'hacim-yok' : null, kalite };
};

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
    isle: ({ db, parametre, sorgu }) => hamOnerisi(db, parametre.revizyonId, sorgu),
  }),
  // 1704 a: kart yazan da okur (net ağırlığı forma yalnız düğmeyle yazar); geometri okuyan da.
  uc({
    yontem: 'GET', yol: '/geometri/malzemeler/:malzemeNo/agirlik-ozeti', yetki: { biri: ['malzemeler.yaz', 'geometri.oku'] },
    parametre: malzemeParametresi, cevap: agirlikOzetiCevabi,
    isle: async ({ db, parametre }) => agirlikOzeti(await malzemeGeometrisi(db, parametre.malzemeNo)),
  }),
  uc({
    yontem: 'POST', yol: '/geometri/analizler/:revizyonId/yeniden-hesapla', yetki: 'geometri.hesapla', tekrarKorumali: true,
    parametre: revizyonParametresi, govde: yenidenHesaplaGovdesi, cevap: yenidenHesaplaCevabi,
    isle: ({ db, parametre, govde }) => yenidenHesapla(db, parametre.revizyonId, govde.surum),
  }),
];
