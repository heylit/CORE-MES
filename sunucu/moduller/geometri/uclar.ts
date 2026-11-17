import { ikiliCevap, uc } from '#cekirdek/uc.ts';
import {
  geometriAnalizCevabi, geometriGuncelRevizyonCevabi, geometriHamCevabi, geometriHamSorgusu, geometriModelListeCevabi, geometriModelListeSorgusu, geometriMontajCevabi, geometriOzellikCevabi, geometriSaglikCevabi,
  geometriSureCevabi, geometriSureSorgusu, geometriKalibrasyonCevabi, disaridaBirakGovdesi, geometriSureKatsayilariCevabi,
  sureKatsayisiAnahtarGovdesi, sureKatsayisiYazGovdesi, sureTasarimiCevabi, sureTasarimiGovdesi,
  geometriYuzeyCevabi, geometriYuzeyKaydetGovdesi, revizyonParametresi,
  yenidenHesaplaCevabi, yenidenHesaplaGovdesi, agirlikOzetiCevabi, malzemeParametresi,
} from '#paylasilan/sozlesme/geometri.ts';
import type { AgirlikOzetiCevabi } from '#paylasilan/sozlesme/geometri.ts';
import { analizOku, guncelRevizyon, hamOnerisiRotayla, kalibrasyonaGeriAl, kalibrasyondanCikar, kalibrasyonOku, malzemeGeometrisi, modelDosyasi, modelListesi, montajOku, ozellikOku, saglikOku, sureKatsayilariOku, sureKatsayisiYaz, sureKatsayisiYerlesigeDon, sureTahminiOku, sureTasarimiYaz, yenidenHesapla, yuzeyKaydet, yuzeyOku } from './servis.ts';
import type { MalzemeGeometrisi } from './servis.ts';

// 1710: kartın ağırlık özeti; alan seçimidir, hesap ekranındadır.
const agirlikOzeti = (g: MalzemeGeometrisi | null): AgirlikOzetiCevabi => {
  if (g === null) return { model: null, modelSayisi: 0, hacimMm3: null, neden: 'model-yok', kalite: null };
  const model = { belgeAdi: g.belgeAdi, harf: g.harf, revKodu: g.revKodu, kapak: g.kapak };
  const modelSayisi = g.modelSayisi;
  const a = g.analiz.analiz;
  const o = g.ham.oneriler[0];
  const kalite = o === undefined ? null : { ad: o.kalite, aile: o.aile, kaliteKodu: o.kaliteKodu, yogunluk: o.yogunluk };
  if (a === null) return { model, modelSayisi, hacimMm3: null, neden: 'analiz-yok', kalite };
  return { model, modelSayisi, hacimMm3: a.hacimMm3, neden: a.hacimMm3 === null ? 'hacim-yok' : null, kalite };
};

// Okuma geometri.oku ister (sayfa yalnız menü görünürlüğüdür). Yeniden hesaplatma ayrı işlemdir; uç yalnız kuyruğa yazar,
// hesabı ayrı süreç yapar (1427 a).
export const uclar = [
  uc({
    yontem: 'GET', yol: '/geometri/modeller', yetki: 'geometri.oku',
    sorgu: geometriModelListeSorgusu, cevap: geometriModelListeCevabi,
    isle: ({ db, kullanici, sorgu }) => modelListesi(db, kullanici, sorgu),
  }),
  uc({
    yontem: 'GET', yol: '/geometri/modeller/:revizyonId/dosya', yetki: 'geometri.oku',
    parametre: revizyonParametresi, cevap: ikiliCevap,
    isle: ({ db, parametre }) => modelDosyasi(db, parametre.revizyonId),
  }),
  uc({
    yontem: 'GET', yol: '/geometri/modeller/:revizyonId/guncel', yetki: 'geometri.oku',
    parametre: revizyonParametresi, cevap: geometriGuncelRevizyonCevabi,
    isle: ({ db, parametre }) => guncelRevizyon(db, parametre.revizyonId),
  }),
  uc({
    yontem: 'GET', yol: '/geometri/analizler/:revizyonId', yetki: 'geometri.oku',
    parametre: revizyonParametresi, cevap: geometriAnalizCevabi,
    isle: ({ db, parametre }) => analizOku(db, parametre.revizyonId),
  }),
  // 2044: tanınan delik, kademe, havşa, pah ve radyüs (yalnız öneri).
  uc({
    yontem: 'GET', yol: '/geometri/ozellikler/:revizyonId', yetki: 'geometri.oku',
    parametre: revizyonParametresi, cevap: geometriOzellikCevabi,
    isle: ({ db, parametre }) => ozellikOku(db, parametre.revizyonId),
  }),
  // 2109: montaj ağacı ve bileşen listesi (yalnız öneri). Ekranı yok; 2098 H3 ve montajdan reçete bunu okur.
  uc({
    yontem: 'GET', yol: '/geometri/montaj/:revizyonId', yetki: 'geometri.oku',
    parametre: revizyonParametresi, cevap: geometriMontajCevabi,
    isle: ({ db, parametre }) => montajOku(db, parametre.revizyonId),
  }),
  // 2143: dosya sağlık raporu (açık kenar, geçersiz yüz, tolerans, kısa kenar, birim); yalnız uyarı.
  uc({
    yontem: 'GET', yol: '/geometri/saglik/:revizyonId', yetki: 'geometri.oku',
    parametre: revizyonParametresi, cevap: geometriSaglikCevabi,
    isle: ({ db, parametre }) => saglikOku(db, parametre.revizyonId),
  }),
  // 2144: boya, kaplama ve maske yüzey işaretleri; işlem listesi rotadan, alanlar B-rep yüzlerinden (yalnız öneri).
  uc({
    yontem: 'GET', yol: '/geometri/yuzey/:revizyonId', yetki: 'geometri.oku',
    parametre: revizyonParametresi, cevap: geometriYuzeyCevabi,
    isle: ({ db, parametre }) => yuzeyOku(db, parametre.revizyonId),
  }),
  uc({
    yontem: 'GET', yol: '/geometri/ham-onerisi/:revizyonId', yetki: 'geometri.oku',
    parametre: revizyonParametresi, sorgu: geometriHamSorgusu, cevap: geometriHamCevabi,
    isle: ({ db, parametre, sorgu }) => hamOnerisiRotayla(db, parametre.revizyonId, sorgu),
  }),
  // 3278: talaştan kaba süre aralığı (kalibresiz, yalnız ekranda; 1195 c rotaya yazmaz).
  uc({
    yontem: 'GET', yol: '/geometri/sure-tahmini/:revizyonId', yetki: 'geometri.oku',
    parametre: revizyonParametresi, sorgu: geometriSureSorgusu, cevap: geometriSureCevabi,
    isle: ({ db, parametre, sorgu }) => sureTahminiOku(db, parametre.revizyonId, sorgu),
  }),
  // 3321-3: süre kalibrasyonu (okumada hesaplanır); parçayı dışarıda bırakma ve geri alma geometri.kalibrasyon ister (S2 a).
  uc({
    yontem: 'GET', yol: '/geometri/kalibrasyon', yetki: 'geometri.oku', cevap: geometriKalibrasyonCevabi,
    isle: ({ db }) => kalibrasyonOku(db),
  }),
  uc({
    yontem: 'POST', yol: '/geometri/kalibrasyon/:malzemeNo/disarida-birak', yetki: 'geometri.kalibrasyon', tekrarKorumali: true,
    parametre: malzemeParametresi, govde: disaridaBirakGovdesi, cevap: geometriKalibrasyonCevabi,
    isle: ({ db, kullanici, parametre, govde }) => kalibrasyondanCikar(db, kullanici, parametre.malzemeNo, govde.neden),
  }),
  uc({
    yontem: 'POST', yol: '/geometri/kalibrasyon/:malzemeNo/geri-al', yetki: 'geometri.kalibrasyon', tekrarKorumali: true,
    parametre: malzemeParametresi, cevap: geometriKalibrasyonCevabi,
    isle: ({ db, parametre }) => kalibrasyonaGeriAl(db, parametre.malzemeNo),
  }),
  // 3363: başlangıç katsayıları (okuma geometri.oku); elle değiştirme, yerleşiğe dönme ve parçanın yüzey/tolerans seçimi
  // geometri.kalibrasyon (S1 önerisi a).
  uc({
    yontem: 'GET', yol: '/geometri/sure-katsayilari', yetki: 'geometri.oku', cevap: geometriSureKatsayilariCevabi,
    isle: ({ db }) => sureKatsayilariOku(db),
  }),
  uc({
    yontem: 'POST', yol: '/geometri/sure-katsayilari/yaz', yetki: 'geometri.kalibrasyon', tekrarKorumali: true,
    govde: sureKatsayisiYazGovdesi, cevap: geometriSureKatsayilariCevabi,
    isle: ({ db, kullanici, govde }) => sureKatsayisiYaz(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/geometri/sure-katsayilari/yerlesige-don', yetki: 'geometri.kalibrasyon', tekrarKorumali: true,
    govde: sureKatsayisiAnahtarGovdesi, cevap: geometriSureKatsayilariCevabi,
    isle: ({ db, govde }) => sureKatsayisiYerlesigeDon(db, govde.anahtarlar),
  }),
  uc({
    yontem: 'POST', yol: '/geometri/sure-tahmini/:revizyonId/tasarim', yetki: 'geometri.kalibrasyon', tekrarKorumali: true,
    parametre: revizyonParametresi, govde: sureTasarimiGovdesi, cevap: sureTasarimiCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      await sureTasarimiYaz(db, kullanici, parametre.revizyonId, govde);
      return { revizyonId: parametre.revizyonId, ...govde };
    },
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
  uc({
    yontem: 'POST', yol: '/geometri/yuzey/:revizyonId/kaydet', yetki: 'geometri.yuzey-yaz', tekrarKorumali: true,
    parametre: revizyonParametresi, govde: geometriYuzeyKaydetGovdesi, cevap: geometriYuzeyCevabi,
    isle: ({ db, kullanici, parametre, govde }) => yuzeyKaydet(db, kullanici, parametre.revizyonId, govde),
  }),
];
