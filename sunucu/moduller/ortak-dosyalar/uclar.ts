import { ikiliCevap, uc } from '#cekirdek/uc.ts';
import { ayniDosyaCevabi, ayniDosyaSorgusu } from '#paylasilan/sozlesme/dosya.ts';
import {
  ayarlarCevabi, hazirDosyalarCevabi, hazirKayitParametresi, hazirKayitlarCevabi, hazirListeParametresi, kayitParametresi, kaynakKlasoruCevabi, mevcutAcCevabi, mevcutAcGovdesi, mevcutCevabi, sablonGovdesi, topluGeriAlCevabi,
  topluIsParametresi,
} from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import {
  aramaSorgusu, dosyaListesiCevabi, dosyaParametresi, dosyaSemasi, dosyalarCevabi, gecmisCevabi, klasorAcGovdesi, klasorParametresi, klasorSemasi,
  klasorlerCevabi, surumParametresi, surumlerCevabi, surumluGovde, yetkiCevabi, yetkiGovdesi, yukleGovdesi,
} from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import {
  arsivCevabi, arsivSorgusu, kaliciSilGovdesi, musteriSecimSorgusu, projeSecimSorgusu, secimCevabi, silmeCevabi, sonEklenenlerSorgusu,
} from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { dortGozAcikMi, kaliciSil, silmeGeriCek, silmeIste, silmeOnayla, silmeReddet } from './kalici-silme.ts';
import { musteriSecimi, projeSecimi } from './musteri-proje.ts';
import {
  arsiv, arsivDegistir, gecmis, indir, klasorAc, klasorDosyalari, klasorler, sonEklenenler, surumler, yetkiOku, yetkiYazKomutu, yukle,
} from './servis.ts';
import { hazirKayit, hazirKayitlar } from './hazir-listeler.ts';
import { ayniDosyaYerleri } from './ayni-dosya.ts';
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
    yontem: 'GET', yol: '/ortak-dosyalar/son-eklenenler', yetki: SAYFA, sorgu: sonEklenenlerSorgusu, cevap: dosyaListesiCevabi,
    isle: ({ db, kullanici, sorgu }) => sonEklenenler(db, kullanici, sorgu),
  }),
  uc({
    yontem: 'GET', yol: '/ortak-dosyalar/arsiv', yetki: SAYFA, sorgu: arsivSorgusu, cevap: arsivCevabi,
    isle: async ({ db, kullanici, sorgu }) => ({ ...await arsiv(db, kullanici, sorgu.onayBekleyen), silmeDortGoz: await dortGozAcikMi(db) }),
  }),
  // Yükleme penceresinin müşteri ve proje seçicisi (3443 a, 1 ve 10). Firma ve proje adları sayfayı açan herkese listelenir:
  // seçim yükleyenin işidir ve klasör adları zaten bu adlardır (Risk bakışında; VARSAYIM).
  uc({
    yontem: 'GET', yol: '/ortak-dosyalar/secim/musteriler', yetki: SAYFA, sorgu: musteriSecimSorgusu, cevap: secimCevabi,
    isle: ({ db, sorgu }) => musteriSecimi(db, sorgu),
  }),
  uc({
    yontem: 'GET', yol: '/ortak-dosyalar/secim/projeler', yetki: SAYFA, sorgu: projeSecimSorgusu, cevap: secimCevabi,
    isle: ({ db, sorgu }) => projeSecimi(db, sorgu),
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
    // 3468-1: yüklemeden önce aynı içerikli dosyanın yerleri (görünen klasörler ve çizimler); uyarıdır, yüklemeyi engellemez.
    yontem: 'GET', yol: '/ortak-dosyalar/ayni-dosya', yetki: SAYFA, sorgu: ayniDosyaSorgusu, cevap: ayniDosyaCevabi,
    isle: async ({ db, kullanici, sorgu }) => ({ yerler: await ayniDosyaYerleri(db, kullanici, sorgu.ozet) }),
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
  // Kalıcı silme (3443 a, 4-6; ADR 0030 madde 6). Düzey (Yönetir) ve dört göz servis içinde; kişi dosyanın adını yazar.
  uc({
    yontem: 'POST', yol: '/ortak-dosyalar/klasorler/:klasorId/dosyalar/:dosyaId/kalici-sil', yetki: SAYFA, parametre: dosyaParametresi,
    govde: kaliciSilGovdesi, cevap: silmeCevabi,
    isle: ({ db, kullanici, parametre, govde, denetimEki }) => kaliciSil(db, kullanici, parametre.klasorId, parametre.dosyaId, govde, denetimEki),
  }),
  uc({
    yontem: 'POST', yol: '/ortak-dosyalar/klasorler/:klasorId/dosyalar/:dosyaId/silme-iste', yetki: SAYFA, parametre: dosyaParametresi,
    govde: surumluGovde, cevap: dosyaSemasi,
    isle: ({ db, kullanici, parametre, govde }) => silmeIste(db, kullanici, parametre.klasorId, parametre.dosyaId, govde.surum),
  }),
  uc({
    yontem: 'POST', yol: '/ortak-dosyalar/klasorler/:klasorId/dosyalar/:dosyaId/silme-onayla', yetki: SAYFA, parametre: dosyaParametresi,
    govde: kaliciSilGovdesi, cevap: silmeCevabi,
    isle: ({ db, kullanici, parametre, govde, denetimEki }) => silmeOnayla(db, kullanici, parametre.klasorId, parametre.dosyaId, govde, denetimEki),
  }),
  uc({
    yontem: 'POST', yol: '/ortak-dosyalar/klasorler/:klasorId/dosyalar/:dosyaId/silme-reddet', yetki: SAYFA, parametre: dosyaParametresi,
    govde: surumluGovde, cevap: dosyaSemasi,
    isle: ({ db, kullanici, parametre, govde }) => silmeReddet(db, kullanici, parametre.klasorId, parametre.dosyaId, govde.surum),
  }),
  uc({
    yontem: 'POST', yol: '/ortak-dosyalar/klasorler/:klasorId/dosyalar/:dosyaId/silme-geri-cek', yetki: SAYFA, parametre: dosyaParametresi,
    govde: surumluGovde, cevap: dosyaSemasi,
    isle: ({ db, kullanici, parametre, govde }) => silmeGeriCek(db, kullanici, parametre.klasorId, parametre.dosyaId, govde.surum),
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
  // Hazır listeler (kart 3390): sayfa işlemine ek olarak kaydın okuma işlemi sağlayıcıda, dosya grubu kaynağın okuma işlemiyle süzülür.
  uc({
    yontem: 'GET', yol: '/ortak-dosyalar/hazir/:liste', yetki: SAYFA, parametre: hazirListeParametresi, sorgu: aramaSorgusu, cevap: hazirKayitlarCevabi,
    isle: ({ db, kullanici, parametre, sorgu }) => hazirKayitlar(db, kullanici, parametre.liste, sorgu.ara),
  }),
  uc({
    yontem: 'GET', yol: '/ortak-dosyalar/hazir/:liste/:anahtar', yetki: SAYFA, parametre: hazirKayitParametresi, cevap: hazirDosyalarCevabi,
    isle: ({ db, kullanici, parametre }) => hazirKayit(db, kullanici, parametre.liste, parametre.anahtar),
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
