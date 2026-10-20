import { uc } from '#cekirdek/uc.ts';
import type { Uc } from '#cekirdek/uc.ts';
import { ikinciMenuSayacSemasi } from '#paylasilan/ikinci-menu.ts';
import {
  IK_ALAN_ADLARI, ikAyarCevabi, ikAyarKaydetGovdesi, ikBenCevabi, ikBordroGordumGovdesi, ikDonemParametresi, ikIletisimGovdesi, ikIptalGovdesi, ikKararGovdesi,
  ikKaydetGovdesi, ikIzinGunuCevabi, ikKisiVardiyasiCevabi, ikKisiVardiyasiSorgusu, ikIzinGunuSorgusu, ikKesinlestirGovdesi, ikKimlikParametresi, ikOnayGovdesi, ikOzetiCevabi, ikPuantajCevabi, ikPuantajSorgusu, ikPuantajYazCevabi, ikPuantajYazGovdesi,
  ikTopluCevabi, ikTopluGovde, ikVeriCevabi, ikYazCevabi,
} from '#paylasilan/sozlesme/ik.ts';
import { IK_ALANLARI } from './kurallar.ts';
import * as servis from './servis.ts';

// Okuma tek uçtan, kişiye göre süzülerek (IK-21). Yazma alan başına üç uç; her biri alanın kendi işlemini ister (IK-0).
const alanUclari: Uc[] = IK_ALAN_ADLARI.flatMap((alan) => {
  const { islem } = IK_ALANLARI[alan];
  return [
    uc({
      yontem: 'POST', yol: `/ik/${alan}/:kimlik/kaydet`, yetki: islem, parametre: ikKimlikParametresi, govde: ikKaydetGovdesi, cevap: ikYazCevabi,
      isle: ({ db, kullanici, parametre, govde }) => servis.kaydet(db, kullanici, alan, parametre.kimlik, govde.govde, govde.surum),
    }),
    uc({
      yontem: 'POST', yol: `/ik/${alan}/:kimlik/iptal`, yetki: islem, parametre: ikKimlikParametresi, govde: ikIptalGovdesi, cevap: ikYazCevabi,
      isle: ({ db, kullanici, parametre, govde }) => servis.iptalEt(db, kullanici, alan, parametre.kimlik, govde.surum),
    }),
    uc({
      yontem: 'POST', yol: `/ik/${alan}/toplu-kaydet`, yetki: islem, govde: ikTopluGovde, cevap: ikTopluCevabi,
      isle: ({ db, kullanici, govde }) => servis.topluKaydet(db, kullanici, alan, govde.kayitlar),
    }),
  ];
});

export const uclar: Uc[] = [
  uc({ yontem: 'GET', yol: '/ik/ben', yetki: 'oturum', cevap: ikBenCevabi, isle: ({ db, kullanici }) => servis.benGetir(db, kullanici) }),
  uc({ yontem: 'GET', yol: '/ik/veri', yetki: 'oturum', cevap: ikVeriCevabi, isle: ({ db, kullanici }) => servis.veriGetir(db, kullanici) }),
  uc({ yontem: 'GET', yol: '/ik/ozet', yetki: 'ik.oku', cevap: ikOzetiCevabi, isle: ({ db, kullanici }) => servis.panoOzeti(db, kullanici) }),
  uc({ yontem: 'GET', yol: '/ik/menu-sayaclari', yetki: 'oturum', cevap: ikinciMenuSayacSemasi, isle: ({ db, kullanici }) => servis.menuSayaclari(db, kullanici) }),
  ...alanUclari,
  // Çalışanın kendi izin talebi (IK-9) ve onaycının kararı (IK-7, IK-8).
  uc({
    yontem: 'POST', yol: '/ik/izinler/:kimlik/talep', yetki: 'ik.izin-talep', parametre: ikKimlikParametresi, govde: ikKaydetGovdesi, cevap: ikYazCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.kaydet(db, kullanici, 'izinler', parametre.kimlik, govde.govde, govde.surum, 'talep'),
  }),
  uc({
    yontem: 'POST', yol: '/ik/izinler/:kimlik/karar', yetki: 'ik.izin-onay', parametre: ikKimlikParametresi, govde: ikKararGovdesi, cevap: ikYazCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.izinKarar(db, kullanici, parametre.kimlik, govde.durum, govde.surum),
  }),
  // Kadro talebini onaylamak (pozisyonu açmak) onay işlemidir; onaycının pozisyon yazma işlemi olmayabilir (IK-10).
  uc({
    yontem: 'POST', yol: '/ik/pozisyonlar/:kimlik/onayla', yetki: 'ik.pozisyon-onay', parametre: ikKimlikParametresi, govde: ikOnayGovdesi, cevap: ikYazCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.pozisyonOnayla(db, kullanici, parametre.kimlik, govde.surum),
  }),
  // Kişinin kendi kaydı: işlem istemez, kural kaydın kendisine ait olmasını ister (IK-14).
  uc({
    yontem: 'POST', yol: '/ik/personel/:kimlik/iletisim', yetki: 'oturum', parametre: ikKimlikParametresi, govde: ikIletisimGovdesi, cevap: ikYazCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.iletisimGuncelle(db, kullanici, parametre.kimlik, govde.alanlar, govde.surum),
  }),
  // Ağ kopup yeniden gönderilen kesinleştirme kilidi yeniden denemez: aynı istek kimliği ilk cevabı alır (borç 170).
  uc({
    yontem: 'POST', yol: '/ik/bordro/:donem/kesinlestir', tekrarKorumali: true, yetki: 'ik.bordro-kesinlestir', parametre: ikDonemParametresi, govde: ikKesinlestirGovdesi, cevap: ikTopluCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.bordroKesinlestir(db, kullanici, parametre.donem, govde.girdiler),
  }),
  // Çalışanın kendi kesinleşmiş bordrosunu onaylaması (IK-40..IK-46); kural kaydın kişinin kendisine ait olmasını ister.
  uc({
    yontem: 'POST', yol: '/ik/bordrolar/:kimlik/gordum', yetki: 'ik.bordro-gordum', parametre: ikKimlikParametresi, govde: ikBordroGordumGovdesi, cevap: ikYazCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.bordroGordum(db, kullanici, parametre.kimlik, govde.surum),
  }),
  // Puantaj (kart #1571): kişi sayfası ve toplu matris aynı uçtan okur; okuma kişiye göre süzülür (IK-67), yazma devam yetkisiyle (IK-0).
  // Soru 74: izin ekranının gün önerisi; görünürlük puantajla aynıdır (İK kapsamı, çalışan kendisi).
  uc({
    yontem: 'GET', yol: '/ik/izin-gunu', yetki: 'oturum', sorgu: ikIzinGunuSorgusu, cevap: ikIzinGunuCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.izinGunuGetir(db, kullanici, sorgu.personel, sorgu.baslangic, sorgu.bitis),
  }),
  // Soru 75: kişi sayfasının salt okunur Vardiya bölümü; görünürlük puantajla aynıdır. Vardiya yazma Vardiya ekranında kalır.
  uc({
    yontem: 'GET', yol: '/ik/kisi-vardiyasi', yetki: 'oturum', sorgu: ikKisiVardiyasiSorgusu, cevap: ikKisiVardiyasiCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.kisiVardiyasiGetir(db, kullanici, sorgu.personel),
  }),
  uc({
    yontem: 'GET', yol: '/ik/puantaj', yetki: 'oturum', sorgu: ikPuantajSorgusu, cevap: ikPuantajCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.puantajGetir(db, kullanici, sorgu.ay, sorgu.personel),
  }),
  uc({
    yontem: 'POST', yol: '/ik/puantaj/yaz', yetki: 'ik.devam-yaz', govde: ikPuantajYazGovdesi, cevap: ikPuantajYazCevabi,
    isle: ({ db, kullanici, govde }) => servis.puantajYaz(db, kullanici, govde.gunler),
  }),
  uc({
    yontem: 'POST', yol: '/ik/ayarlar/kaydet', yetki: 'ik.ayar-yaz', govde: ikAyarKaydetGovdesi, cevap: ikAyarCevabi,
    isle: ({ db, kullanici, govde }) => servis.ayarKaydet(db, kullanici, govde.govde, govde.surum),
  }),
];
