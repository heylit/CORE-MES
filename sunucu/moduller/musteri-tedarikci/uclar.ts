import { uc } from '#cekirdek/uc.ts';
import {
  adresEkleGovdesi, adresGuncelleGovdesi, adresKaldirGovdesi, adresParametresi, firmaAyrintiCevabi, firmaCevabi, firmaEkleGovdesi,
  firmaGuncelleGovdesi, firmaListeSorgusu, firmaListesiCevabi, firmaSecimCevabi, firmaSecimSorgusu, kimlikParametresi,
} from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import * as servis from './servis.ts';

// Firma uçları finans rakamı döndürmez (FNS-48). Aktiflik geçişi finansın ucundadır (/finans/firmalar/:id/pasif, aktif):
// pasife almayı finansın açık kayıtları engeller ve akışı üstteki modül başlatır (ADR 0006).
export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/musteri-tedarikci/firmalar',
    yetki: 'musteri-tedarikci.oku',
    sorgu: firmaListeSorgusu,
    cevap: firmaListesiCevabi,
    isle: ({ db, sorgu }) => servis.firmalariListele(db, sorgu),
  }),
  uc({
    yontem: 'GET',
    yol: '/musteri-tedarikci/firmalar/secim',
    yetki: 'musteri-tedarikci.oku',
    sorgu: firmaSecimSorgusu,
    cevap: firmaSecimCevabi,
    isle: async ({ db, sorgu }) => ({ firmalar: await servis.firmaSecimi(db, sorgu) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/musteri-tedarikci/firmalar/:id',
    yetki: 'musteri-tedarikci.oku',
    parametre: kimlikParametresi,
    cevap: firmaAyrintiCevabi,
    isle: ({ db, parametre }) => servis.firmaAyrintisi(db, parametre.id),
  }),
  uc({
    yontem: 'POST',
    yol: '/musteri-tedarikci/firmalar/ekle',
    yetki: 'musteri-tedarikci.yaz',
    tekrarKorumali: true,
    govde: firmaEkleGovdesi,
    cevap: firmaCevabi,
    isle: async ({ db, kullanici, govde }) => ({ firma: await servis.firmaEkle(db, kullanici, govde) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/musteri-tedarikci/firmalar/:id/guncelle',
    yetki: 'musteri-tedarikci.yaz',
    parametre: kimlikParametresi,
    govde: firmaGuncelleGovdesi,
    cevap: firmaCevabi,
    isle: async ({ db, kullanici, parametre, govde, denetimEki }) => ({ firma: await servis.firmaGuncelle(db, kullanici, parametre.id, govde, denetimEki) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/musteri-tedarikci/firmalar/:id/adresler/ekle',
    yetki: 'musteri-tedarikci.yaz',
    tekrarKorumali: true,
    parametre: kimlikParametresi,
    govde: adresEkleGovdesi,
    cevap: firmaAyrintiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.adresEkle(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/musteri-tedarikci/firmalar/:id/adresler/:adresId/guncelle',
    yetki: 'musteri-tedarikci.yaz',
    parametre: adresParametresi,
    govde: adresGuncelleGovdesi,
    cevap: firmaAyrintiCevabi,
    isle: ({ db, kullanici, parametre, govde, denetimEki }) => servis.adresGuncelle(db, kullanici, parametre.id, parametre.adresId, govde, denetimEki),
  }),
  uc({
    yontem: 'POST',
    yol: '/musteri-tedarikci/firmalar/:id/adresler/:adresId/kaldir',
    yetki: 'musteri-tedarikci.yaz',
    parametre: adresParametresi,
    govde: adresKaldirGovdesi,
    cevap: firmaAyrintiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.adresKaldir(db, kullanici, parametre.id, parametre.adresId, govde.surum),
  }),
];
