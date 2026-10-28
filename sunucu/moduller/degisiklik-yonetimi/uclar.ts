import { uc } from '#cekirdek/uc.ts';
import { DEGISIKLIK_YONETIMI_ISLEMLERI } from '#paylasilan/islemler/degisiklik-yonetimi.ts';
import {
  ccbGovdesi, emirCevabi, emirListeCevabi, emirlerSorgusu, faiOnayGovdesi, geriGonderGovdesi, gorevlerimCevabi, idParametresi,
  izlenebilirlikCevabi, izlenebilirlikSorgusu, kalemKaydetGovdesi, kapatGovdesi, kararGovdesi, konfigurasyonCevabi, malzemeParametresi,
  musteriOnayiGovdesi, olayListeCevabi, olaylarSorgusu, parcaAdaylariCevabi, parcaAdaylariSorgusu, raporCevabi, raporSorgusu, seriListeCevabi, serilerSorgusu, siniflandirGovdesi,
  sonUrunlerCevabi, surumGovdesi, talepAcGovdesi, talepCevabi, talepListeCevabi, taleplerSorgusu, yayinlaGovdesi,
} from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import {
  ccbKarari, emirAc, emirCevabi as emirOku, emirleriListele, etkiAnalizi, faiOnayla, geriGonder, gorevlerim, izlenebilirlik, kalemKaydet, kapat,
  kararVer, konfigurasyon, musteriOnayi, olaylar, parcaAdaylari, raporlar, seriler, siniflandir, sonUrunler, talepAc, talepCevabi as talepOku,
  talepleriListele, taslakAc, topluKarar, yayinaGonder, yayinla,
} from './servis.ts';

// Okuma modülün işlemlerinden biriyle açılır (S0 uç listesi); her adım kendi işlemini ister (1122 a). Aşama 1'de işlemler yalnız yöneticide.
const [ilk, ...diger] = DEGISIKLIK_YONETIMI_ISLEMLERI;
const OKUMA = { biri: [ilk, ...diger] } as const;
const KOK = '/degisiklik-yonetimi';

export const uclar = [
  uc({ yontem: 'GET', yol: `${KOK}/gorevlerim`, yetki: OKUMA, cevap: gorevlerimCevabi, isle: ({ db, kullanici }) => gorevlerim(db, kullanici) }),
  uc({
    yontem: 'GET', yol: `${KOK}/talepler`, yetki: OKUMA, sorgu: taleplerSorgusu, cevap: talepListeCevabi,
    isle: ({ db, sorgu }) => talepleriListele(db, sorgu),
  }),
  uc({
    yontem: 'GET', yol: `${KOK}/talepler/:id`, yetki: OKUMA, parametre: idParametresi, cevap: talepCevabi,
    isle: ({ db, parametre }) => talepOku(db, parametre.id),
  }),
  uc({
    yontem: 'GET', yol: `${KOK}/parca-adaylari`, yetki: 'degisiklik-yonetimi.talep-ac', sorgu: parcaAdaylariSorgusu, cevap: parcaAdaylariCevabi,
    isle: ({ db, sorgu }) => parcaAdaylari(db, sorgu.ara),
  }),
  uc({
    // Sürümsüz yeni kayıt açar: yinelenen istek ikinci talep açmasın.
    yontem: 'POST', yol: `${KOK}/talepler/ac`, yetki: 'degisiklik-yonetimi.talep-ac', tekrarKorumali: true, govde: talepAcGovdesi, cevap: talepCevabi,
    isle: ({ db, kullanici, govde }) => talepAc(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: `${KOK}/talepler/:id/siniflandir`, yetki: 'degisiklik-yonetimi.siniflandir', parametre: idParametresi, govde: siniflandirGovdesi,
    cevap: talepCevabi, isle: ({ db, kullanici, parametre, govde }) => siniflandir(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST', yol: `${KOK}/talepler/:id/etki-analizi`, yetki: 'degisiklik-yonetimi.siniflandir', parametre: idParametresi, govde: surumGovdesi,
    cevap: talepCevabi, isle: ({ db, kullanici, parametre, govde }) => etkiAnalizi(db, kullanici, parametre.id, govde.surum),
  }),
  uc({
    yontem: 'POST', yol: `${KOK}/talepler/:id/ccb`, yetki: 'degisiklik-yonetimi.ccb-karar', parametre: idParametresi, govde: ccbGovdesi,
    cevap: talepCevabi, isle: ({ db, kullanici, parametre, govde }) => ccbKarari(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST', yol: `${KOK}/talepler/:id/musteri-onayi`, yetki: 'degisiklik-yonetimi.musteri-onayi', parametre: idParametresi,
    govde: musteriOnayiGovdesi, cevap: talepCevabi, isle: ({ db, kullanici, parametre, govde }) => musteriOnayi(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST', yol: `${KOK}/talepler/:id/emir-ac`, yetki: 'degisiklik-yonetimi.emir-ac', parametre: idParametresi, govde: surumGovdesi,
    cevap: emirCevabi, isle: ({ db, kullanici, parametre, govde }) => emirAc(db, kullanici, parametre.id, govde.surum),
  }),
  uc({
    yontem: 'GET', yol: `${KOK}/emirler`, yetki: OKUMA, sorgu: emirlerSorgusu, cevap: emirListeCevabi,
    isle: ({ db, sorgu }) => emirleriListele(db, sorgu),
  }),
  uc({
    yontem: 'GET', yol: `${KOK}/emirler/:id`, yetki: OKUMA, parametre: idParametresi, cevap: emirCevabi,
    isle: ({ db, parametre }) => emirOku(db, parametre.id),
  }),
  uc({
    yontem: 'POST', yol: `${KOK}/emirler/:id/taslak-ac`, yetki: 'degisiklik-yonetimi.revizyon-hazirla', parametre: idParametresi, govde: surumGovdesi,
    cevap: emirCevabi, isle: ({ db, kullanici, parametre, govde }) => taslakAc(db, kullanici, parametre.id, govde.surum),
  }),
  uc({
    yontem: 'POST', yol: `${KOK}/emirler/:id/kalem-kaydet`, yetki: 'degisiklik-yonetimi.revizyon-hazirla', parametre: idParametresi,
    govde: kalemKaydetGovdesi, cevap: emirCevabi, isle: ({ db, kullanici, parametre, govde }) => kalemKaydet(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST', yol: `${KOK}/emirler/:id/yayina-gonder`, yetki: 'degisiklik-yonetimi.revizyon-hazirla', parametre: idParametresi, govde: surumGovdesi,
    cevap: emirCevabi, isle: ({ db, kullanici, parametre, govde }) => yayinaGonder(db, kullanici, parametre.id, govde.surum),
  }),
  uc({
    // S0 varsayım 2: yayın onayından geri gönderme yayınlayanındır.
    yontem: 'POST', yol: `${KOK}/emirler/:id/geri-gonder`, yetki: 'degisiklik-yonetimi.yayinla', parametre: idParametresi, govde: geriGonderGovdesi,
    cevap: emirCevabi, isle: ({ db, kullanici, parametre, govde }) => geriGonder(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST', yol: `${KOK}/emirler/:id/yayinla`, yetki: 'degisiklik-yonetimi.yayinla', parametre: idParametresi, govde: yayinlaGovdesi,
    cevap: emirCevabi, isle: ({ db, kullanici, parametre, govde }) => yayinla(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST', yol: `${KOK}/emirler/:id/karar`, yetki: 'degisiklik-yonetimi.karar-ver', parametre: idParametresi, govde: kararGovdesi,
    cevap: emirCevabi, isle: ({ db, kullanici, parametre, govde }) => kararVer(db, kullanici, parametre.id, govde, 'degisiklik-yonetimi.karar-ver'),
  }),
  uc({
    yontem: 'POST', yol: `${KOK}/emirler/:id/toplu-karar`, yetki: 'degisiklik-yonetimi.karar-ver', parametre: idParametresi, govde: surumGovdesi,
    cevap: emirCevabi, isle: ({ db, kullanici, parametre, govde }) => topluKarar(db, kullanici, parametre.id, govde.surum),
  }),
  uc({
    yontem: 'POST', yol: `${KOK}/emirler/:id/mrb-karar`, yetki: 'degisiklik-yonetimi.mrb-karar', parametre: idParametresi, govde: kararGovdesi,
    cevap: emirCevabi, isle: ({ db, kullanici, parametre, govde }) => kararVer(db, kullanici, parametre.id, govde, 'degisiklik-yonetimi.mrb-karar'),
  }),
  uc({
    yontem: 'POST', yol: `${KOK}/emirler/:id/fai-onayla`, yetki: 'degisiklik-yonetimi.fai-onayla', parametre: idParametresi, govde: faiOnayGovdesi,
    cevap: emirCevabi, isle: ({ db, kullanici, parametre, govde }) => faiOnayla(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST', yol: `${KOK}/emirler/:id/kapat`, yetki: 'degisiklik-yonetimi.kapat', parametre: idParametresi, govde: kapatGovdesi,
    cevap: emirCevabi, isle: ({ db, kullanici, parametre, govde }) => kapat(db, kullanici, parametre.id, govde),
  }),
  uc({ yontem: 'GET', yol: `${KOK}/son-urunler`, yetki: OKUMA, cevap: sonUrunlerCevabi, isle: ({ db }) => sonUrunler(db) }),
  uc({
    yontem: 'GET', yol: `${KOK}/konfigurasyon/:malzemeId`, yetki: OKUMA, parametre: malzemeParametresi, cevap: konfigurasyonCevabi,
    isle: ({ db, parametre }) => konfigurasyon(db, parametre.malzemeId),
  }),
  uc({
    yontem: 'GET', yol: `${KOK}/seriler`, yetki: OKUMA, sorgu: serilerSorgusu, cevap: seriListeCevabi, isle: ({ sorgu }) => seriler(sorgu),
  }),
  uc({
    yontem: 'GET', yol: `${KOK}/izlenebilirlik`, yetki: OKUMA, sorgu: izlenebilirlikSorgusu, cevap: izlenebilirlikCevabi,
    isle: ({ db, sorgu }) => izlenebilirlik(db, sorgu),
  }),
  uc({ yontem: 'GET', yol: `${KOK}/raporlar`, yetki: OKUMA, sorgu: raporSorgusu, cevap: raporCevabi, isle: ({ db, sorgu }) => raporlar(db, sorgu) }),
  uc({ yontem: 'GET', yol: `${KOK}/olaylar`, yetki: OKUMA, sorgu: olaylarSorgusu, cevap: olayListeCevabi, isle: ({ db, sorgu }) => olaylar(db, sorgu) }),
];
