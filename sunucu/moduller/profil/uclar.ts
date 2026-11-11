import { uc } from '#cekirdek/uc.ts';
import {
  geriBildirimAyrintiCevabi, geriBildirimGonderCevabi, geriBildirimGonderGovdesi, geriBildirimIdParametresi, geriBildirimKategoriEkleGovdesi,
  geriBildirimKategoriGuncelleGovdesi, geriBildirimListeCevabi, geriBildirimListeSorgusu, geriBildirimNotGovdesi, geriBildirimOzetiCevabi,
  geriBildirimSecenekleriCevabi, geriBildirimTakipGovdesi, geriBildirimYanitlaGovdesi, menuSecGovdesi, menuTercihiCevabi, miniPanoCevabi, miniPanoSecGovdesi, profilCevabi, temaCevabi, temaSecGovdesi,
} from '#paylasilan/sozlesme/profil.ts';
import {
  geriBildirimAyrinti, geriBildirimGonder, geriBildirimKategoriEkle, geriBildirimKategoriGuncelle, geriBildirimListesi, geriBildirimNotEkle,
  geriBildirimOzeti, geriBildirimSecenekleri, geriBildirimTakipDegistir, geriBildirimYanitla, menuTercihiOku, menuTercihiSec, miniPanoOku, miniPanoSec, profilOku, temaOku, temaSec,
} from './servis.ts';

// Profil ve şikayet/istek/öneri kutusu her çalışanındır: okuma ve gönderme yalnız oturum ister, kişi her zaman oturumdan
// gelir (başka kişinin kaydı seçilemez). Başkalarının yazdıklarını okumak ayrı işlemdir.
// Geri Bildirim Merkezi (kart 2192): okuma profil.geri-bildirim-oku; yanıt, iç not ve takip profil.geri-bildirim-yanitla;
// kategori yazma profil.geri-bildirim-kategori-yaz. Her yazma ayrı uçtur; takip ve kategori okunan sürümle yazılır.
export const uclar = [
  uc({ yontem: 'GET', yol: '/profil', yetki: 'oturum', cevap: profilCevabi, isle: ({ db, kullanici }) => profilOku(db, kullanici, new Date()) }),
  uc({
    yontem: 'POST', yol: '/profil/geri-bildirim-gonder', yetki: 'oturum', tekrarKorumali: true,
    govde: geriBildirimGonderGovdesi, cevap: geriBildirimGonderCevabi,
    isle: ({ db, kullanici, govde }) => geriBildirimGonder(db, kullanici, govde),
  }),
  uc({
    yontem: 'GET', yol: '/profil/geri-bildirimler', yetki: 'profil.geri-bildirim-oku',
    sorgu: geriBildirimListeSorgusu, cevap: geriBildirimListeCevabi,
    isle: ({ db, sorgu }) => geriBildirimListesi(db, sorgu),
  }),
  uc({
    yontem: 'GET', yol: '/profil/geri-bildirimler/:id', yetki: 'profil.geri-bildirim-oku',
    parametre: geriBildirimIdParametresi, cevap: geriBildirimAyrintiCevabi,
    isle: ({ db, parametre }) => geriBildirimAyrinti(db, parametre.id),
  }),
  uc({
    yontem: 'POST', yol: '/profil/geri-bildirimler/:id/yanitla', yetki: 'profil.geri-bildirim-yanitla', tekrarKorumali: true,
    parametre: geriBildirimIdParametresi, govde: geriBildirimYanitlaGovdesi, cevap: geriBildirimAyrintiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => geriBildirimYanitla(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST', yol: '/profil/geri-bildirimler/:id/not-ekle', yetki: 'profil.geri-bildirim-yanitla', tekrarKorumali: true,
    parametre: geriBildirimIdParametresi, govde: geriBildirimNotGovdesi, cevap: geriBildirimAyrintiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => geriBildirimNotEkle(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST', yol: '/profil/geri-bildirimler/:id/takip-degistir', yetki: 'profil.geri-bildirim-yanitla',
    parametre: geriBildirimIdParametresi, govde: geriBildirimTakipGovdesi, cevap: geriBildirimAyrintiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => geriBildirimTakipDegistir(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'GET', yol: '/profil/geri-bildirim-secenekleri', yetki: 'profil.geri-bildirim-oku', cevap: geriBildirimSecenekleriCevabi,
    isle: ({ db }) => geriBildirimSecenekleri(db),
  }),
  uc({
    yontem: 'GET', yol: '/profil/geri-bildirim-ozeti', yetki: 'profil.geri-bildirim-oku', cevap: geriBildirimOzetiCevabi,
    isle: ({ db }) => geriBildirimOzeti(db, new Date()),
  }),
  uc({
    yontem: 'POST', yol: '/profil/geri-bildirim-kategorileri', yetki: 'profil.geri-bildirim-kategori-yaz', tekrarKorumali: true,
    govde: geriBildirimKategoriEkleGovdesi, cevap: geriBildirimSecenekleriCevabi,
    isle: ({ db, govde }) => geriBildirimKategoriEkle(db, govde),
  }),
  uc({
    yontem: 'POST', yol: '/profil/geri-bildirim-kategorileri/:id/guncelle', yetki: 'profil.geri-bildirim-kategori-yaz',
    parametre: geriBildirimIdParametresi, govde: geriBildirimKategoriGuncelleGovdesi, cevap: geriBildirimSecenekleriCevabi,
    isle: ({ db, parametre, govde }) => geriBildirimKategoriGuncelle(db, parametre.id, govde),
  }),
  // Görünüm teması kişinin kendi tercihidir (2072 a): okuma ve seçme yalnız oturum ister, kişi oturumdan gelir.
  uc({ yontem: 'GET', yol: '/profil/tema', yetki: 'oturum', cevap: temaCevabi, isle: ({ db, kullanici }) => temaOku(db, kullanici) }),
  uc({
    yontem: 'POST', yol: '/profil/tema-sec', yetki: 'oturum', tekrarKorumali: true,
    govde: temaSecGovdesi, cevap: temaCevabi,
    isle: ({ db, kullanici, govde }) => temaSec(db, kullanici, govde),
  }),
  // Mini pano seçimi kişinin kendi tercihidir (2425-3 a): okuma ve seçme yalnız oturum ister, kişi oturumdan gelir.
  uc({ yontem: 'GET', yol: '/profil/mini-pano', yetki: 'oturum', cevap: miniPanoCevabi, isle: ({ db, kullanici }) => miniPanoOku(db, kullanici) }),
  uc({
    yontem: 'POST', yol: '/profil/mini-pano-sec', yetki: 'oturum', tekrarKorumali: true,
    govde: miniPanoSecGovdesi, cevap: miniPanoCevabi,
    isle: ({ db, kullanici, govde }) => miniPanoSec(db, kullanici, govde),
  }),
  // Sık kullanılanlar kişinin kendi menüsüdür (2951): yetki vermez, yalnız oturum ister; kişi oturumdan gelir.
  uc({ yontem: 'GET', yol: '/profil/menu', yetki: 'oturum', cevap: menuTercihiCevabi, isle: ({ db, kullanici }) => menuTercihiOku(db, kullanici) }),
  uc({
    yontem: 'POST', yol: '/profil/menu-sec', yetki: 'oturum', tekrarKorumali: true,
    govde: menuSecGovdesi, cevap: menuTercihiCevabi,
    isle: ({ db, kullanici, govde }) => menuTercihiSec(db, kullanici, govde),
  }),
];
