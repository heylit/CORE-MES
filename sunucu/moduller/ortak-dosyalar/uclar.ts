import { ikiliCevap, uc } from '#cekirdek/uc.ts';
import {
  aramaSorgusu, dosyaListesiCevabi, dosyaParametresi, dosyaSemasi, dosyalarCevabi, gecmisCevabi, klasorAcGovdesi, klasorParametresi, klasorSemasi,
  klasorlerCevabi, surumParametresi, surumlerCevabi, surumluGovde, yetkiCevabi, yetkiGovdesi, yukleGovdesi,
} from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import {
  arsiv, arsivDegistir, gecmis, indir, klasorAc, klasorDosyalari, klasorler, sonEklenenler, surumler, yetkiOku, yetkiYazKomutu, yukle,
} from './servis.ts';

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
];
