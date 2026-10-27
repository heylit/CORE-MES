import { uc } from '#cekirdek/uc.ts';
import {
  birimAyrintisiCevabi, birimSemasi, birimSorgusu, birimlerCevabi, dogrulaGovdesi, durumGovdesi, emirOzetiCevabi, emirParametresi,
  idParametresi, markalaGovdesi, onizlemeCevabi, onizlemeSorgusu, tanimEkleGovdesi, tanimKaydetGovdesi, tanimSemasi, tanimSorgusu,
  tanimEmirleriCevabi, tanimlarCevabi,
} from '#paylasilan/sozlesme/markalama.ts';
import {
  birimGetir, birimler, dogrula, durumDegistir, emirOzeti, markala, onizleme, tanimEkle, tanimEmirleri, tanimGetir, tanimKaydet,
  tanimlar,
} from './servis.ts';

// Okuma sayfayı görenedir; Aşama 2'de Arkon markalama paneli ve Kalite Merkezi `disari.ts` ile okur.
const OKUMA = { biri: ['sayfa.markalama'] } as const;

export const uclar = [
  uc({
    yontem: 'GET', yol: '/markalama/tanimlar', yetki: OKUMA, sorgu: tanimSorgusu, cevap: tanimlarCevabi,
    isle: ({ db, sorgu }) => tanimlar(db, sorgu.malzemeId ?? null),
  }),
  uc({
    yontem: 'GET', yol: '/markalama/tanimlar/:id', yetki: OKUMA, parametre: idParametresi, cevap: tanimSemasi,
    isle: ({ db, parametre }) => tanimGetir(db, parametre.id),
  }),
  uc({
    yontem: 'GET', yol: '/markalama/tanimlar/:id/onizleme', yetki: OKUMA, parametre: idParametresi, sorgu: onizlemeSorgusu,
    cevap: onizlemeCevabi,
    isle: ({ db, parametre, sorgu }) => onizleme(db, parametre.id, sorgu.emirId ?? null),
  }),
  uc({
    yontem: 'GET', yol: '/markalama/tanimlar/:id/emirler', yetki: OKUMA, parametre: idParametresi, cevap: tanimEmirleriCevabi,
    isle: ({ db, parametre }) => tanimEmirleri(db, parametre.id),
  }),
  uc({
    yontem: 'POST', yol: '/markalama/tanimlar/ekle', yetki: 'markalama.tanim-yaz', govde: tanimEkleGovdesi, cevap: tanimSemasi,
    isle: ({ db, kullanici, govde }) => tanimEkle(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/markalama/tanimlar/:id/kaydet', yetki: 'markalama.tanim-yaz', parametre: idParametresi,
    govde: tanimKaydetGovdesi, cevap: tanimSemasi,
    isle: ({ db, kullanici, parametre, govde }) => tanimKaydet(db, kullanici, parametre.id, govde),
  }),
  // Aynı dokunuşun yinelenmesi ikinci numara yakmasın: istek kimliğiyle tek kez uygulanır.
  uc({
    yontem: 'POST', yol: '/markalama/birimler/markala', yetki: 'markalama.seri-ver', tekrarKorumali: true, govde: markalaGovdesi,
    cevap: birimSemasi,
    isle: ({ db, kullanici, govde }) => markala(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/markalama/birimler/dogrula', yetki: 'markalama.seri-ver', govde: dogrulaGovdesi, cevap: birimSemasi,
    isle: ({ db, kullanici, govde }) => dogrula(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/markalama/birimler/:id/durum', yetki: 'markalama.durum-yaz', parametre: idParametresi,
    govde: durumGovdesi, cevap: birimSemasi,
    isle: ({ db, kullanici, parametre, govde }) => durumDegistir(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'GET', yol: '/markalama/birimler', yetki: OKUMA, sorgu: birimSorgusu, cevap: birimlerCevabi,
    isle: ({ db, sorgu }) => birimler(db, sorgu),
  }),
  uc({
    yontem: 'GET', yol: '/markalama/birimler/:id', yetki: OKUMA, parametre: idParametresi, cevap: birimAyrintisiCevabi,
    isle: ({ db, parametre }) => birimGetir(db, parametre.id),
  }),
  uc({
    yontem: 'GET', yol: '/markalama/emirler/:emirId/ozet', yetki: OKUMA, parametre: emirParametresi, cevap: emirOzetiCevabi,
    isle: ({ db, parametre }) => emirOzeti(db, parametre.emirId),
  }),
];
