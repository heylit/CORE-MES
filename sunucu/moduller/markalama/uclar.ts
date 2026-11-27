import { uc } from '#cekirdek/uc.ts';
import {
  birimAyrintisiCevabi, birimSemasi, birimSorgusu, birimlerCevabi, dogrulaGovdesi, durumGovdesi, emirAraCevabi, emirAraSorgusu, emirOzetiCevabi,
  emirOzetiSorgusu, emirParametresi, idParametresi, isTanimiCevabi, isTanimiSorgusu, malzemeParametresi, operasyonlarCevabi, markalaGovdesi, onizlemeCevabi, onizlemeSorgusu, tanimAktiflikGovdesi, tanimEkleGovdesi, tanimKaydetGovdesi, tanimSemasi, tanimSorgusu,
  tanimEmirleriCevabi, tanimlarCevabi,
} from '#paylasilan/sozlesme/markalama.ts';
import {
  birimGetir, birimler, dogrula, durumDegistir, emirAra, emirOperasyonlari, emirOzeti, isTanimi, malzemeOperasyonlari, markala, onizleme, tanimAktiflik, tanimEkle, tanimEmirleri, tanimGetir, tanimKaydet,
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
  uc({
    yontem: 'POST', yol: '/markalama/tanimlar/:id/aktiflik', yetki: 'markalama.tanim-yaz', parametre: idParametresi,
    govde: tanimAktiflikGovdesi, cevap: tanimSemasi,
    isle: ({ db, kullanici, parametre, govde }) => tanimAktiflik(db, kullanici, parametre.id, govde),
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
  // 3788: Tanımlar ve markalama terminali emirden başlar; okuma sayfayı görenedir (rota ve emir okuması bu modülden geçer).
  uc({
    yontem: 'GET', yol: '/markalama/emir-ara', yetki: OKUMA, sorgu: emirAraSorgusu, cevap: emirAraCevabi,
    isle: ({ db, sorgu }) => emirAra(db, sorgu.metin),
  }),
  uc({
    yontem: 'GET', yol: '/markalama/emirler/:emirId/operasyonlar', yetki: OKUMA, parametre: emirParametresi, cevap: operasyonlarCevabi,
    isle: ({ db, parametre }) => emirOperasyonlari(db, parametre.emirId),
  }),
  uc({
    yontem: 'GET', yol: '/markalama/emirler/:emirId/tanim', yetki: OKUMA, parametre: emirParametresi, sorgu: isTanimiSorgusu, cevap: isTanimiCevabi,
    isle: ({ db, parametre, sorgu }) => isTanimi(db, parametre.emirId, sorgu.opNo),
  }),
  uc({
    yontem: 'GET', yol: '/markalama/malzemeler/:malzemeId/operasyonlar', yetki: OKUMA, parametre: malzemeParametresi, cevap: operasyonlarCevabi,
    isle: ({ db, parametre }) => malzemeOperasyonlari(db, parametre.malzemeId),
  }),
  uc({
    yontem: 'GET', yol: '/markalama/emirler/:emirId/ozet', yetki: OKUMA, parametre: emirParametresi, sorgu: emirOzetiSorgusu,
    cevap: emirOzetiCevabi,
    isle: ({ db, parametre, sorgu }) => emirOzeti(db, parametre.emirId, sorgu.tanimId ?? null),
  }),
];
