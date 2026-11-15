import { ikiliCevap, uc } from '#cekirdek/uc.ts';
import {
  ayarlarCevabi, kayitParametresi, kaynakKlasoruCevabi, mevcutAcCevabi, mevcutAcGovdesi, mevcutCevabi, sablonGovdesi, topluGeriAlCevabi,
  topluIsParametresi,
} from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import {
  aramaSorgusu, dosyaListesiCevabi, dosyaParametresi, dosyaSemasi, dosyalarCevabi, gecmisCevabi, klasorAcGovdesi, klasorParametresi, klasorSemasi,
  klasorlerCevabi, surumParametresi, surumlerCevabi, surumluGovde, yetkiCevabi, yetkiGovdesi, yukleGovdesi,
} from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import {
  arsiv, arsivDegistir, gecmis, indir, klasorAc, klasorDosyalari, klasorler, sonEklenenler, surumler, yetkiOku, yetkiYazKomutu, yukle,
} from './servis.ts';
import { ayarlar, kaynakKlasoruBul, kokAc, mevcutAc, mevcutSayim, sablonKaydet, topluArsiv, yenidenDene } from './kayit-klasorleri.ts';

// İşlem sayfayı açar; klasör düzeyi (ADR 0030) her uçta servis içinde, oturumdaki kişinin rollerinden çözülür. Yetki sekmesi ayrı
// işlemdir ve yalnız yönetici rolündedir. Yollar klasör kimliğini taşır: denetim kaydı klasöre göre okunabilsin (UYUM-BORCU).
// Yazma komutları da sayfa işlemini ister: yazma hakkı işlem değil klasör düzeyidir (ADR 0030, 2-3; iki işlem).
const SAYFA = { biri: ['sayfa.ortak-dosyalar'] } as const;
const YETKI_VER = 'ortak-dosyalar.yetki-ver';

export const uclar = [
  uc({
    yontem: 'GET', yol: '/ortak-dosyalar/klasorler', yetki: SAYFA, cevap: klasorlerCevabi,
    isle: ({ db, kullanici }) => klasorler(db, kullanici),
  }),
  uc({
    yontem: 'GET', yol: '/ortak-dosyalar/klasorler/:klasorId/dosyalar', yetki: SAYFA, parametre: klasorParametresi, sorgu: aramaSorgusu,
    cevap: dosyalarCevabi,
    isle: ({ db, kullanici, parametre, sorgu }) => klasorDosyalari(db, kullanici, parametre.klasorId, sorgu.ara),
  }),
  uc({
    yontem: 'GET', yol: '/ortak-dosyalar/klasorler/:klasorId/gecmis', yetki: SAYFA, parametre: klasorParametresi, cevap: gecmisCevabi,
    isle: ({ db, kullanici, parametre }) => gecmis(db, kullanici, parametre.klasorId),
  }),
  uc({
    yontem: 'GET', yol: '/ortak-dosyalar/son-eklenenler', yetki: SAYFA, sorgu: aramaSorgusu, cevap: dosyaListesiCevabi,
    isle: ({ db, kullanici, sorgu }) => sonEklenenler(db, kullanici, sorgu.ara),
  }),
  uc({
    yontem: 'GET', yol: '/ortak-dosyalar/arsiv', yetki: SAYFA, cevap: dosyaListesiCevabi,
    isle: ({ db, kullanici }) => arsiv(db, kullanici),
  }),
  uc({
    yontem: 'GET', yol: '/ortak-dosyalar/klasorler/:klasorId/dosyalar/:dosyaId/surumler', yetki: SAYFA, parametre: dosyaParametresi,
    cevap: surumlerCevabi,
    isle: ({ db, kullanici, parametre }) => surumler(db, kullanici, parametre.klasorId, parametre.dosyaId),
  }),
  uc({
    yontem: 'GET', yol: '/ortak-dosyalar/klasorler/:klasorId/dosyalar/:dosyaId/surumler/:sira/dosya', yetki: SAYFA, parametre: surumParametresi,
    cevap: ikiliCevap,
    isle: ({ db, kullanici, parametre }) => indir(db, kullanici, parametre.klasorId, parametre.dosyaId, parametre.sira),
  }),
  uc({
    yontem: 'POST', yol: '/ortak-dosyalar/klasorler', yetki: SAYFA,
    // Klasör açar: cevabı yitirilip yinelenen istek ikinci klasör açmamalı.
    tekrarKorumali: true,
    govde: klasorAcGovdesi, cevap: klasorSemasi,
    isle: ({ db, kullanici, govde }) => klasorAc(db, kullanici, govde.ustId, govde.ad),
  }),
  uc({
    yontem: 'POST', yol: '/ortak-dosyalar/klasorler/:klasorId/yukle', yetki: SAYFA,
    // Sürüm ekler: yinelenen istek ikinci sürüm açmamalı.
    tekrarKorumali: true,
    parametre: klasorParametresi, govde: yukleGovdesi, cevap: dosyaSemasi,
    isle: ({ db, kullanici, parametre, govde, denetimEki }) => yukle(db, kullanici, parametre.klasorId, govde, denetimEki),
  }),
  uc({
    yontem: 'POST', yol: '/ortak-dosyalar/klasorler/:klasorId/dosyalar/:dosyaId/arsivle', yetki: SAYFA, parametre: dosyaParametresi,
    govde: surumluGovde, cevap: dosyaSemasi,
    isle: ({ db, kullanici, parametre, govde }) => arsivDegistir(db, kullanici, parametre.klasorId, parametre.dosyaId, govde.surum, true),
  }),
  uc({
    yontem: 'POST', yol: '/ortak-dosyalar/klasorler/:klasorId/dosyalar/:dosyaId/arsivden-cikar', yetki: SAYFA, parametre: dosyaParametresi,
    govde: surumluGovde, cevap: dosyaSemasi,
    isle: ({ db, kullanici, parametre, govde }) => arsivDegistir(db, kullanici, parametre.klasorId, parametre.dosyaId, govde.surum, false),
  }),
  uc({
    yontem: 'GET', yol: '/ortak-dosyalar/klasorler/:klasorId/yetki', yetki: YETKI_VER, parametre: klasorParametresi, cevap: yetkiCevabi,
    isle: ({ db, kullanici, parametre }) => yetkiOku(db, kullanici, parametre.klasorId),
  }),
  uc({
    yontem: 'POST', yol: '/ortak-dosyalar/klasorler/:klasorId/yetki', yetki: YETKI_VER, parametre: klasorParametresi, govde: yetkiGovdesi,
    cevap: yetkiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => yetkiYazKomutu(db, kullanici, parametre.klasorId, govde),
  }),
  // Kayda bağlı klasörler (kart 3288). Kayıt ekranındaki "Klasör" bağlantısı; klasör yoksa ya da görünmüyorsa null.
  uc({
    yontem: 'GET', yol: '/ortak-dosyalar/kayit/:tur/:id', yetki: SAYFA, parametre: kayitParametresi, cevap: kaynakKlasoruCevabi,
    isle: ({ db, kullanici, parametre }) => kaynakKlasoruBul(db, kullanici, parametre.tur, parametre.id),
  }),
  // Ayarlar yalnız yetki işlemiyle (Risk K4 a: yeni işlem açılmaz).
  uc({
    yontem: 'GET', yol: '/ortak-dosyalar/ayarlar', yetki: YETKI_VER, cevap: ayarlarCevabi,
    isle: ({ db }) => ayarlar(db),
  }),
  uc({
    yontem: 'POST', yol: '/ortak-dosyalar/ayarlar/kok-ac', yetki: YETKI_VER, tekrarKorumali: true, cevap: ayarlarCevabi,
    isle: ({ db, kullanici }) => kokAc(db, kullanici),
  }),
  uc({
    yontem: 'POST', yol: '/ortak-dosyalar/ayarlar/sablon', yetki: YETKI_VER, govde: sablonGovdesi, cevap: ayarlarCevabi,
    isle: ({ db, govde }) => sablonKaydet(db, govde),
  }),
  uc({
    yontem: 'POST', yol: '/ortak-dosyalar/ayarlar/acilamayan/:tur/:id/yeniden-dene', yetki: YETKI_VER, parametre: kayitParametresi, cevap: ayarlarCevabi,
    isle: ({ db, kullanici, parametre }) => yenidenDene(db, kullanici, parametre.tur, parametre.id),
  }),
  uc({
    yontem: 'GET', yol: '/ortak-dosyalar/ayarlar/mevcut', yetki: YETKI_VER, cevap: mevcutCevabi,
    isle: ({ db }) => mevcutSayim(db),
  }),
  uc({
    yontem: 'POST', yol: '/ortak-dosyalar/ayarlar/mevcut/ac', yetki: YETKI_VER, tekrarKorumali: true, govde: mevcutAcGovdesi, cevap: mevcutAcCevabi,
    isle: ({ db, kullanici, govde }) => mevcutAc(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/ortak-dosyalar/ayarlar/toplu/:topluIs/arsivle', yetki: YETKI_VER, parametre: topluIsParametresi, cevap: topluGeriAlCevabi,
    isle: ({ db, kullanici, parametre }) => topluArsiv(db, kullanici, parametre.topluIs, true),
  }),
  uc({
    yontem: 'POST', yol: '/ortak-dosyalar/ayarlar/toplu/:topluIs/arsivden-cikar', yetki: YETKI_VER, parametre: topluIsParametresi, cevap: topluGeriAlCevabi,
    isle: ({ db, kullanici, parametre }) => topluArsiv(db, kullanici, parametre.topluIs, false),
  }),
];
