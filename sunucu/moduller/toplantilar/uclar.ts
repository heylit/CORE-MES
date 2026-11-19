import { uc } from '#cekirdek/uc.ts';
import {
  aksiyonDurumGovdesi, aksiyonEkleGovdesi, aksiyonGorevGovdesi, aksiyonParametresi, kararEkleGovdesi, konuAramaCevabi, konuAramaSorgusu,
  toplantiAcGovdesi, toplantiDegistirGovdesi, toplantiIptalGovdesi, toplantiListeSorgusu, toplantiListesiCevabi, toplantiParametresi,
  toplantiSemasi, toplantiYapildiGovdesi,
} from '#paylasilan/sozlesme/toplantilar.ts';
import {
  aksiyonDurumuYaz, aksiyonuGorevYap, aksiyonYaz, kararYaz, konuAra, toplantiAc, toplantiAyrintisi, toplantiDegistir, toplantiIptalEt,
  toplantiListesi, toplantiYapildiIsaretle,
} from './servis.ts';

// Okuma (3448-2 a): her oturum kendi toplantısını (düzenlediği ya da katıldığı) görür; `toplantilar.oku` hepsini. Süzme serviste.
// Yazma `toplantilar.yaz`: açma, değiştirme, iptal, yapıldı, karar, aksiyon ve göreve çevirme.
export const uclar = [
  uc({
    yontem: 'GET', yol: '/toplantilar', yetki: 'oturum', sahiplik: 'kendi', sorgu: toplantiListeSorgusu, cevap: toplantiListesiCevabi,
    isle: ({ db, kullanici, sorgu }) => toplantiListesi(db, kullanici, sorgu.kapsam),
  }),
  uc({
    yontem: 'GET', yol: '/toplantilar/konu-ara', yetki: 'toplantilar.yaz', sorgu: konuAramaSorgusu, cevap: konuAramaCevabi,
    isle: ({ db, sorgu }) => konuAra(db, sorgu.tur, sorgu.q),
  }),
  uc({
    yontem: 'GET', yol: '/toplantilar/:id', yetki: 'oturum', sahiplik: 'kendi', parametre: toplantiParametresi, cevap: toplantiSemasi,
    isle: ({ db, kullanici, parametre }) => toplantiAyrintisi(db, kullanici, parametre.id),
  }),
  uc({
    yontem: 'POST', yol: '/toplantilar', yetki: 'toplantilar.yaz', tekrarKorumali: true, govde: toplantiAcGovdesi, cevap: toplantiSemasi,
    isle: ({ db, kullanici, govde }) => toplantiAc(db, kullanici, govde),
  }),
  uc({
    yontem: 'PUT', yol: '/toplantilar/:id', yetki: 'toplantilar.yaz', parametre: toplantiParametresi, govde: toplantiDegistirGovdesi, cevap: toplantiSemasi,
    isle: ({ db, kullanici, parametre, govde }) => toplantiDegistir(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST', yol: '/toplantilar/:id/iptal', yetki: 'toplantilar.yaz', parametre: toplantiParametresi, govde: toplantiIptalGovdesi, cevap: toplantiSemasi,
    isle: ({ db, kullanici, parametre, govde }) => toplantiIptalEt(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST', yol: '/toplantilar/:id/yapildi', yetki: 'toplantilar.yaz', parametre: toplantiParametresi, govde: toplantiYapildiGovdesi, cevap: toplantiSemasi,
    isle: ({ db, kullanici, parametre, govde }) => toplantiYapildiIsaretle(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST', yol: '/toplantilar/:id/kararlar', yetki: 'toplantilar.yaz', tekrarKorumali: true, parametre: toplantiParametresi, govde: kararEkleGovdesi,
    cevap: toplantiSemasi, isle: ({ db, kullanici, parametre, govde }) => kararYaz(db, kullanici, parametre.id, govde.metin),
  }),
  uc({
    yontem: 'POST', yol: '/toplantilar/:id/aksiyonlar', yetki: 'toplantilar.yaz', tekrarKorumali: true, parametre: toplantiParametresi, govde: aksiyonEkleGovdesi,
    cevap: toplantiSemasi, isle: ({ db, kullanici, parametre, govde }) => aksiyonYaz(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST', yol: '/toplantilar/:id/aksiyonlar/:aksiyonId/durum', yetki: 'toplantilar.yaz', parametre: aksiyonParametresi, govde: aksiyonDurumGovdesi,
    cevap: toplantiSemasi, isle: ({ db, kullanici, parametre, govde }) => aksiyonDurumuYaz(db, kullanici, parametre.id, parametre.aksiyonId, govde),
  }),
  uc({
    yontem: 'POST', yol: '/toplantilar/:id/aksiyonlar/:aksiyonId/gorev', yetki: 'toplantilar.yaz', parametre: aksiyonParametresi, govde: aksiyonGorevGovdesi,
    cevap: toplantiSemasi, isle: ({ db, kullanici, parametre, govde }) => aksiyonuGorevYap(db, kullanici, parametre.id, parametre.aksiyonId, govde),
  }),
];
