import { uc } from '#cekirdek/uc.ts';
import { ikinciMenuSayacSemasi } from '#paylasilan/ikinci-menu.ts';
import {
  alarmKapatGovdesi, alarmListeCevabi, alarmListeSorgusu, alarmOnaylaGovdesi, alarmSemasi, girisListeCevabi, girisListeSorgusu,
  guvenlikKimligi, kilitAcCevabi, kilitListeCevabi, kilitListeSorgusu, korumaCevabi, kurallarCevabi, oturumKapatCevabi, oturumlarCevabi,
  ozetCevabi, retListeCevabi, retListeSorgusu, sunucuDurumuCevabi,
} from '#paylasilan/sozlesme/guvenlik.ts';
import * as servis from './servis.ts';

// Okuma guvenlik.oku, alarm onayı ve kapanışı, oturum kapatma ve kilit açma guvenlik.yonet ister (G-19). İkisi de yalnız bayraklı
// yöneticidedir. Tarama uç değildir (isler.ts).
export const uclar = [
  uc({
    yontem: 'GET', yol: '/guvenlik/menu-sayaclari', yetki: 'oturum', cevap: ikinciMenuSayacSemasi,
    isle: ({ db, kullanici }) => servis.menuSayaclari(db, kullanici.islemler),
  }),
  uc({ yontem: 'GET', yol: '/guvenlik/ozet', yetki: 'guvenlik.oku', cevap: ozetCevabi, isle: ({ db }) => servis.ozet(db) }),
  uc({
    yontem: 'GET', yol: '/guvenlik-alarmlari', yetki: 'guvenlik.oku', sorgu: alarmListeSorgusu, cevap: alarmListeCevabi,
    isle: ({ db, sorgu }) => servis.alarmListesi(db, sorgu),
  }),
  uc({
    yontem: 'GET', yol: '/guvenlik-alarmlari/:id', yetki: 'guvenlik.oku', parametre: guvenlikKimligi, cevap: alarmSemasi,
    isle: ({ db, parametre }) => servis.alarmAyrintisi(db, parametre.id),
  }),
  uc({
    yontem: 'POST', yol: '/guvenlik-alarmlari/:id/onayla', yetki: 'guvenlik.yonet', parametre: guvenlikKimligi,
    govde: alarmOnaylaGovdesi, cevap: alarmSemasi,
    isle: ({ db, kullanici, parametre, govde }) => servis.alarmOnayla(db, kullanici.id, parametre.id, govde),
  }),
  uc({
    yontem: 'POST', yol: '/guvenlik-alarmlari/:id/kapat', yetki: 'guvenlik.yonet', parametre: guvenlikKimligi,
    govde: alarmKapatGovdesi, cevap: alarmSemasi,
    isle: ({ db, kullanici, parametre, govde }) => servis.alarmKapat(db, kullanici.id, parametre.id, govde),
  }),
  uc({
    yontem: 'GET', yol: '/guvenlik/girisler', yetki: 'guvenlik.oku', sorgu: girisListeSorgusu, cevap: girisListeCevabi,
    isle: ({ db, sorgu }) => servis.girisler(db, sorgu),
  }),
  uc({
    yontem: 'GET', yol: '/guvenlik/oturumlar', yetki: 'guvenlik.oku', cevap: oturumlarCevabi,
    isle: ({ db, istek }) => servis.oturumlar(db, istek),
  }),
  uc({
    yontem: 'POST', yol: '/guvenlik/oturumlar/:id/kapat', yetki: 'guvenlik.yonet', parametre: guvenlikKimligi, cevap: oturumKapatCevabi,
    isle: ({ db, parametre, istek }) => servis.oturumKapat(db, parametre.id, istek),
  }),
  // Reddedilen istekler (1363 a, 1370 a): yetkisiz, oturumsuz ve var olmayan adrese gelen istekler; en yeni önce.
  uc({
    yontem: 'GET', yol: '/guvenlik/reddedilen-istekler', yetki: 'guvenlik.oku', sorgu: retListeSorgusu, cevap: retListeCevabi,
    isle: ({ db, sorgu }) => servis.reddedilenIstekler(db, sorgu),
  }),
  // Hesap kilitleri: oturum ucu rol yönetenindir (kisiler.rol-yonet); Güvenlik Merkezi kendi işlemiyle okur ve açar.
  uc({
    yontem: 'GET', yol: '/guvenlik/kilitler', yetki: 'guvenlik.oku', sorgu: kilitListeSorgusu, cevap: kilitListeCevabi,
    isle: ({ db, sorgu }) => servis.kilitler(db, sorgu),
  }),
  // Açma durum komutudur: yinelenen istek açacak kilit bulamaz, 404 alır.
  uc({
    yontem: 'POST', yol: '/guvenlik/kilitler/:id/ac', yetki: 'guvenlik.yonet', parametre: guvenlikKimligi, cevap: kilitAcCevabi,
    isle: ({ db, kullanici, parametre }) => servis.kilitAc(db, kullanici.id, parametre.id),
  }),
  uc({ yontem: 'GET', yol: '/guvenlik/koruma', yetki: 'guvenlik.oku', cevap: korumaCevabi, isle: ({ db }) => servis.koruma(db) }),
  // Sunucu günlüğü, olay günlüğü, yedek, disk ve sertifika; son hatalar günlük dosyasından (1061 a).
  uc({ yontem: 'GET', yol: '/guvenlik/sunucu-durumu', yetki: 'guvenlik.oku', cevap: sunucuDurumuCevabi, isle: ({ db }) => servis.sunucuDurumu(db) }),
  uc({ yontem: 'GET', yol: '/guvenlik/kurallar', yetki: 'guvenlik.oku', cevap: kurallarCevabi, isle: ({ db }) => servis.kurallar(db) }),
];
