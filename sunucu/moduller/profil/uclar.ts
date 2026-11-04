import { uc } from '#cekirdek/uc.ts';
import {
  geriBildirimGonderCevabi, geriBildirimGonderGovdesi, geriBildirimListeCevabi, geriBildirimListeSorgusu, profilCevabi, temaCevabi, temaSecGovdesi,
} from '#paylasilan/sozlesme/profil.ts';
import { geriBildirimGonder, geriBildirimListesi, profilOku, temaOku, temaSec } from './servis.ts';

// Profil ve şikayet/istek/öneri kutusu her çalışanındır: okuma ve gönderme yalnız oturum ister, kişi her zaman oturumdan
// gelir (başka kişinin kaydı seçilemez). Başkalarının yazdıklarını okumak ayrı işlemdir.
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
  // Görünüm teması kişinin kendi tercihidir (2072 a): okuma ve seçme yalnız oturum ister, kişi oturumdan gelir.
  uc({ yontem: 'GET', yol: '/profil/tema', yetki: 'oturum', cevap: temaCevabi, isle: ({ db, kullanici }) => temaOku(db, kullanici) }),
  uc({
    yontem: 'POST', yol: '/profil/tema-sec', yetki: 'oturum', tekrarKorumali: true,
    govde: temaSecGovdesi, cevap: temaCevabi,
    isle: ({ db, kullanici, govde }) => temaSec(db, kullanici, govde),
  }),
];
