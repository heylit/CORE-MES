import { uc } from '#cekirdek/uc.ts';
import { ikinciMenuSayacSemasi } from '#paylasilan/ikinci-menu.ts';
import {
  demirbasCevabi, demirbasEkleGovdesi, demirbasGuncelleGovdesi, demirbaslarCevabi, iadeGovdesi, kisiyeBaglaGovdesi, zimmetCevabi, zimmetleGovdesi,
  zimmetlerCevabi,
  aracCevabi, aracEkleGovdesi, aracGoreviCevabi, aracGorevleriCevabi, aracGuncelleGovdesi, aracTalebiAcGovdesi, araclarCevabi, bitirGovdesi, bugunCevabi, durumGovdesi, firmaSecenekleriCevabi, firmaSecimSorgusu, idParametresi, kapatGovdesi, kisiSecenekleriCevabi,
  gorevKmGovdesi, gorevOnaylaGovdesi, kontrolCevabi, masrafCevabi, masrafEkleGovdesi, masrafIptalGovdesi, masraflarCevabi, kontrolEkleGovdesi, kontrolGuncelleGovdesi, kontrolKayitlariCevabi, kontrollerCevabi, reddetGovdesi, sonYerlerCevabi,
  talepAcGovdesi, talepCevabi, talepPanosuCevabi, taleplerimCevabi, taleplerimSorgusu, ustlenGovdesi, yapildiGovdesi, yemekBildirGovdesi, yemekGunuCevabi,
  yemekSorgusu,
} from '#paylasilan/sozlesme/idari-isler.ts';
import * as servis from './servis.ts';

// Talebi her personel kendi adına açar ve yalnız kendi taleplerini görür (talep-ac); bütün talepleri idari işler ve müdür okur (oku);
// üstlenme, bırakma, kapatma ve red idari işlerindir (talep-yonet). Periyodik kontrolleri oku okur, kontrol-yaz yazar; yemek sayısını
// oku okur, yemek-yaz bildirir; araç kartını oku okur, filo-yaz yazar. Araç görev talebini her çalışan kendi adına açar, görür ve geri
// çeker (arac-talebi-ac); bütün görevleri oku okur; onay, red, çıkış ve dönüş km'si filo-yaz'dır. Araç masrafını ve tutarını oku okur,
// filo-yaz yazar ve iptal eder. Demirbaşı ve zimmet geçmişini oku okur; demirbaş kaydı, zimmetleme, iade ve kişiye bağlama zimmet-yaz'dır.
export const uclar = [
  uc({
    yontem: 'GET', yol: '/idari-isler/menu-sayaclari', yetki: 'oturum', cevap: ikinciMenuSayacSemasi,
    isle: ({ db, kullanici }) => servis.menuSayaclari(db, kullanici),
  }),
  uc({
    yontem: 'GET', yol: '/idari-isler/bugun', yetki: 'idari-isler.oku', cevap: bugunCevabi,
    isle: ({ db, kullanici }) => servis.bugun(db, kullanici),
  }),
  uc({
    yontem: 'GET', yol: '/idari-isler/talepler/pano', yetki: 'idari-isler.oku', cevap: talepPanosuCevabi,
    isle: ({ db }) => servis.pano(db),
  }),
  uc({
    yontem: 'GET', yol: '/idari-isler/taleplerim', yetki: 'idari-isler.talep-ac', sorgu: taleplerimSorgusu, cevap: taleplerimCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.taleplerim(db, kullanici, sorgu),
  }),
  uc({
    yontem: 'GET', yol: '/idari-isler/taleplerim/son-yerler', yetki: 'idari-isler.talep-ac', cevap: sonYerlerCevabi,
    isle: async ({ db, kullanici }) => ({ yerler: await servis.sonYerler(db, kullanici) }),
  }),
  uc({
    yontem: 'GET', yol: '/idari-isler/kisi-secenekleri', yetki: { biri: ['idari-isler.talep-yonet', 'idari-isler.zimmet-yaz'] }, cevap: kisiSecenekleriCevabi,
    isle: ({ db }) => servis.atanabilirKisiler(db),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/talepler/ac', yetki: 'idari-isler.talep-ac', tekrarKorumali: true, govde: talepAcGovdesi, cevap: talepCevabi,
    isle: async ({ db, kullanici, govde }) => ({ talep: await servis.talepAc(db, kullanici, govde) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/talepler/:id/geri-cek', yetki: 'idari-isler.talep-ac', parametre: idParametresi, govde: durumGovdesi, cevap: talepCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ talep: await servis.geriCek(db, kullanici, parametre.id, govde.surum) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/talepler/:id/ustlen', yetki: 'idari-isler.talep-yonet', parametre: idParametresi, govde: ustlenGovdesi, cevap: talepCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ talep: await servis.ustlen(db, kullanici, parametre.id, govde.surum, govde.kisiId) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/talepler/:id/birak', yetki: 'idari-isler.talep-yonet', parametre: idParametresi, govde: durumGovdesi, cevap: talepCevabi,
    isle: async ({ db, parametre, govde }) => ({ talep: await servis.birak(db, parametre.id, govde.surum) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/talepler/:id/kapat', yetki: 'idari-isler.talep-yonet', parametre: idParametresi, govde: kapatGovdesi, cevap: talepCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({
      talep: await servis.kapat(db, kullanici, parametre.id, govde.surum, govde.sonucNotu, 'kapat'),
    }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/talepler/:id/reddet', yetki: 'idari-isler.talep-yonet', parametre: idParametresi, govde: reddetGovdesi, cevap: talepCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ talep: await servis.kapat(db, kullanici, parametre.id, govde.surum, govde.neden, 'reddet') }),
  }),
  uc({
    yontem: 'GET', yol: '/idari-isler/kontroller', yetki: 'idari-isler.oku', cevap: kontrollerCevabi,
    isle: async ({ db }) => ({ kontroller: await servis.kontroller(db) }),
  }),
  uc({
    yontem: 'GET', yol: '/idari-isler/kontroller/:id/kayitlar', yetki: 'idari-isler.oku', parametre: idParametresi, cevap: kontrolKayitlariCevabi,
    isle: async ({ db, parametre }) => ({ kayitlar: await servis.kontrolKayitlari(db, parametre.id) }),
  }),
  uc({
    yontem: 'GET', yol: '/idari-isler/firma-secenekleri', yetki: 'idari-isler.kontrol-yaz', sorgu: firmaSecimSorgusu, cevap: firmaSecenekleriCevabi,
    isle: ({ db, sorgu }) => servis.firmaSecenekleri(db, sorgu.ara),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/kontroller/ekle', yetki: 'idari-isler.kontrol-yaz', tekrarKorumali: true, govde: kontrolEkleGovdesi, cevap: kontrolCevabi,
    isle: async ({ db, kullanici, govde }) => ({ kontrol: await servis.kontrolEkle(db, kullanici, govde) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/kontroller/:id/guncelle', yetki: 'idari-isler.kontrol-yaz', parametre: idParametresi, govde: kontrolGuncelleGovdesi,
    cevap: kontrolCevabi,
    isle: async ({ db, parametre, govde }) => ({ kontrol: await servis.kontrolGuncelle(db, parametre.id, govde) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/kontroller/:id/yapildi', yetki: 'idari-isler.kontrol-yaz', parametre: idParametresi, govde: yapildiGovdesi,
    cevap: kontrolCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ kontrol: await servis.yapildi(db, kullanici, parametre.id, govde) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/kontroller/:id/bitir', yetki: 'idari-isler.kontrol-yaz', parametre: idParametresi, govde: bitirGovdesi, cevap: kontrolCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ kontrol: await servis.bitir(db, kullanici, parametre.id, govde.surum, govde.neden) }),
  }),
  uc({
    yontem: 'GET', yol: '/idari-isler/yemek', yetki: 'idari-isler.oku', sorgu: yemekSorgusu, cevap: yemekGunuCevabi,
    isle: ({ db, sorgu }) => servis.yemekGunu(db, sorgu.tarih ?? null),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/yemek/bildir', yetki: 'idari-isler.yemek-yaz', tekrarKorumali: true, govde: yemekBildirGovdesi, cevap: yemekGunuCevabi,
    isle: ({ db, kullanici, govde }) => servis.yemekBildir(db, kullanici, govde),
  }),
  uc({
    yontem: 'GET', yol: '/idari-isler/araclar', yetki: 'idari-isler.oku', cevap: araclarCevabi,
    isle: async ({ db }) => ({ araclar: await servis.araclar(db) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/araclar/ekle', yetki: 'idari-isler.filo-yaz', tekrarKorumali: true, govde: aracEkleGovdesi, cevap: aracCevabi,
    isle: async ({ db, kullanici, govde }) => ({ arac: await servis.aracEkle(db, kullanici, govde) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/araclar/:id/guncelle', yetki: 'idari-isler.filo-yaz', parametre: idParametresi, govde: aracGuncelleGovdesi,
    cevap: aracCevabi,
    isle: async ({ db, parametre, govde }) => ({ arac: await servis.aracGuncelle(db, parametre.id, govde) }),
  }),
  uc({
    yontem: 'GET', yol: '/idari-isler/arac-gorevleri', yetki: 'idari-isler.oku', cevap: aracGorevleriCevabi,
    isle: async ({ db }) => ({ gorevler: await servis.aracGorevleri(db) }),
  }),
  uc({
    yontem: 'GET', yol: '/idari-isler/arac-taleplerim', yetki: 'idari-isler.arac-talebi-ac', cevap: aracGorevleriCevabi,
    isle: async ({ db, kullanici }) => ({ gorevler: await servis.aracTaleplerim(db, kullanici) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/arac-gorevleri/ac', yetki: 'idari-isler.arac-talebi-ac', tekrarKorumali: true, govde: aracTalebiAcGovdesi,
    cevap: aracGoreviCevabi,
    isle: async ({ db, kullanici, govde }) => ({ gorev: await servis.aracTalebiAc(db, kullanici, govde) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/arac-gorevleri/:id/geri-cek', yetki: 'idari-isler.arac-talebi-ac', parametre: idParametresi, govde: durumGovdesi,
    cevap: aracGoreviCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ gorev: await servis.gorevGeriCek(db, kullanici, parametre.id, govde.surum) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/arac-gorevleri/:id/onayla', yetki: 'idari-isler.filo-yaz', parametre: idParametresi, govde: gorevOnaylaGovdesi,
    cevap: aracGoreviCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ gorev: await servis.gorevOnayla(db, kullanici, parametre.id, govde.surum, govde.aracId) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/arac-gorevleri/:id/reddet', yetki: 'idari-isler.filo-yaz', parametre: idParametresi, govde: reddetGovdesi,
    cevap: aracGoreviCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ gorev: await servis.gorevReddet(db, kullanici, parametre.id, govde.surum, govde.neden) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/arac-gorevleri/:id/cikis', yetki: 'idari-isler.filo-yaz', parametre: idParametresi, govde: gorevKmGovdesi,
    cevap: aracGoreviCevabi,
    isle: async ({ db, parametre, govde }) => ({ gorev: await servis.gorevCikis(db, parametre.id, govde.surum, govde.km) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/arac-gorevleri/:id/donus', yetki: 'idari-isler.filo-yaz', parametre: idParametresi, govde: gorevKmGovdesi,
    cevap: aracGoreviCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ gorev: await servis.gorevDonus(db, kullanici, parametre.id, govde.surum, govde.km) }),
  }),
  uc({
    yontem: 'GET', yol: '/idari-isler/araclar/:id/masraflar', yetki: 'idari-isler.oku', parametre: idParametresi, cevap: masraflarCevabi,
    isle: ({ db, parametre }) => servis.aracMasraflari(db, parametre.id),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/araclar/:id/masraf-ekle', yetki: 'idari-isler.filo-yaz', tekrarKorumali: true, parametre: idParametresi,
    govde: masrafEkleGovdesi, cevap: masrafCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ masraf: await servis.masrafEkle(db, kullanici, parametre.id, govde) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/masraflar/:id/iptal', yetki: 'idari-isler.filo-yaz', parametre: idParametresi, govde: masrafIptalGovdesi,
    cevap: masrafCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ masraf: await servis.masrafIptal(db, kullanici, parametre.id, govde.surum, govde.neden) }),
  }),
  uc({
    yontem: 'GET', yol: '/idari-isler/demirbaslar', yetki: 'idari-isler.oku', cevap: demirbaslarCevabi,
    isle: async ({ db }) => ({ demirbaslar: await servis.demirbaslar(db) }),
  }),
  uc({
    yontem: 'GET', yol: '/idari-isler/demirbaslar/:id/zimmetler', yetki: 'idari-isler.oku', parametre: idParametresi, cevap: zimmetlerCevabi,
    isle: async ({ db, parametre }) => ({ zimmetler: await servis.demirbasZimmetleri(db, parametre.id) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/demirbaslar/ekle', yetki: 'idari-isler.zimmet-yaz', tekrarKorumali: true, govde: demirbasEkleGovdesi,
    cevap: demirbasCevabi,
    isle: async ({ db, kullanici, govde }) => ({ demirbas: await servis.demirbasEkle(db, kullanici, govde) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/demirbaslar/:id/guncelle', yetki: 'idari-isler.zimmet-yaz', parametre: idParametresi,
    govde: demirbasGuncelleGovdesi, cevap: demirbasCevabi,
    isle: async ({ db, parametre, govde }) => ({ demirbas: await servis.demirbasGuncelle(db, parametre.id, govde) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/demirbaslar/:id/zimmetle', yetki: 'idari-isler.zimmet-yaz', parametre: idParametresi, govde: zimmetleGovdesi,
    cevap: demirbasCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ demirbas: await servis.zimmetle(db, kullanici, parametre.id, govde) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/zimmetler/:id/iade', yetki: 'idari-isler.zimmet-yaz', parametre: idParametresi, govde: iadeGovdesi,
    cevap: zimmetCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ zimmet: await servis.zimmetIade(db, kullanici, parametre.id, govde) }),
  }),
  uc({
    yontem: 'POST', yol: '/idari-isler/zimmetler/:id/kisiye-bagla', yetki: 'idari-isler.zimmet-yaz', parametre: idParametresi,
    govde: kisiyeBaglaGovdesi, cevap: zimmetCevabi,
    isle: async ({ db, parametre, govde }) => ({ zimmet: await servis.zimmetKisiyeBagla(db, parametre.id, govde.surum, govde.kisiId) }),
  }),
];
