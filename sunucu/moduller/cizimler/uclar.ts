import { ikiliCevap, uc } from '#cekirdek/uc.ts';
import { ikinciMenuSayacSemasi } from '#paylasilan/ikinci-menu.ts';
import {
  bagGovdesi, belgeAyrintisi, belgeGuncelleGovdesi, belgeListesiCevabi, belgeListesiSorgusu, belgeOlusturGovdesi, idParametresi,
  malzemeSecimiCevabi, malzemeSecimiSorgusu, onizlemeGovdesi, onizlemeKareParametresi, revizyonEkleGovdesi, revizyonParametresi, surumGovdesi,
} from '#paylasilan/sozlesme/cizimler.ts';
import * as servis from './servis.ts';

// Sayfası olan rol okur; `cizimler.oku` sayfasız okuma için ayrı verilebilir (başka ekranda belge gösteren rol).
const OKUMA = { biri: ['sayfa.cizimler', 'cizimler.oku'] } as const;
const OKUYAN_ISLEMLER: readonly string[] = OKUMA.biri;

export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/cizimler/menu-sayaclari',
    yetki: 'oturum',
    cevap: ikinciMenuSayacSemasi,
    // Okuyamayan kişiye sayı verilmez: kabuk eksik anahtarda sayı göstermez.
    isle: async ({ db, kullanici }) => (kullanici.islemler.some((i) => OKUYAN_ISLEMLER.includes(i)) ? servis.menuSayaclari(db) : {}),
  }),
  uc({
    yontem: 'GET',
    yol: '/cizimler',
    yetki: OKUMA,
    sorgu: belgeListesiSorgusu,
    cevap: belgeListesiCevabi,
    isle: ({ db, sorgu }) => servis.belgeListesi(db, sorgu),
  }),
  uc({
    yontem: 'GET',
    yol: '/cizimler/malzeme-secimi',
    // Bağ kuran rol malzeme sayfasını görmeyebilir: seçici yalnız bağ kurma işlemiyle açılır.
    yetki: 'cizimler.yaz',
    sorgu: malzemeSecimiSorgusu,
    cevap: malzemeSecimiCevabi,
    isle: async ({ db, sorgu }) => ({ malzemeler: await servis.malzemeSecimi(db, sorgu.ara) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/cizimler/:id',
    yetki: OKUMA,
    parametre: idParametresi,
    cevap: belgeAyrintisi,
    isle: ({ db, parametre }) => servis.belgeAyrintisi(db, parametre.id),
  }),
  uc({
    yontem: 'GET',
    yol: '/cizimler/:id/revizyonlar/:revizyonId/dosya',
    yetki: OKUMA,
    parametre: revizyonParametresi,
    cevap: ikiliCevap,
    isle: ({ db, parametre }) => servis.revizyonDosyasi(db, parametre.id, parametre.revizyonId),
  }),
  uc({
    yontem: 'GET',
    yol: '/cizimler/:id/revizyonlar/:revizyonId/onizleme/:kare',
    yetki: OKUMA,
    parametre: onizlemeKareParametresi,
    cevap: ikiliCevap,
    isle: ({ db, parametre }) => servis.onizlemeKaresi(db, parametre.id, parametre.revizyonId, parametre.kare),
  }),
  uc({
    yontem: 'POST',
    yol: '/cizimler',
    yetki: 'cizimler.yaz',
    // Belge açar: cevabı yitirilip yeniden gönderilen istek ikinci belge açmamalı.
    tekrarKorumali: true,
    govde: belgeOlusturGovdesi,
    cevap: belgeAyrintisi,
    isle: ({ db, kullanici, govde, denetimEki }) => servis.belgeOlustur(db, kullanici, govde, denetimEki),
  }),
  uc({
    yontem: 'POST',
    yol: '/cizimler/:id/guncelle',
    yetki: 'cizimler.yaz',
    parametre: idParametresi,
    govde: belgeGuncelleGovdesi,
    cevap: belgeAyrintisi,
    isle: ({ db, parametre, govde }) => servis.belgeGuncelle(db, parametre.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/cizimler/:id/arsivle',
    yetki: 'cizimler.yaz',
    parametre: idParametresi,
    govde: surumGovdesi,
    cevap: belgeAyrintisi,
    isle: ({ db, parametre, govde }) => servis.belgeArsivi(db, parametre.id, govde.surum, false),
  }),
  uc({
    yontem: 'POST',
    yol: '/cizimler/:id/arsivden-cikar',
    yetki: 'cizimler.yaz',
    parametre: idParametresi,
    govde: surumGovdesi,
    cevap: belgeAyrintisi,
    isle: ({ db, parametre, govde }) => servis.belgeArsivi(db, parametre.id, govde.surum, true),
  }),
  uc({
    yontem: 'POST',
    yol: '/cizimler/:id/revizyon-ekle',
    yetki: 'cizimler.yaz',
    parametre: idParametresi,
    govde: revizyonEkleGovdesi,
    cevap: belgeAyrintisi,
    isle: ({ db, kullanici, parametre, govde, denetimEki }) => servis.revizyonEkle(db, kullanici, parametre.id, govde, denetimEki),
  }),
  uc({
    yontem: 'POST',
    yol: '/cizimler/:id/revizyonlar/:revizyonId/yayinla',
    yetki: 'cizimler.yayinla',
    parametre: revizyonParametresi,
    govde: surumGovdesi,
    cevap: belgeAyrintisi,
    isle: ({ db, kullanici, parametre, govde }) => servis.revizyonYayinla(db, kullanici, parametre.id, parametre.revizyonId, govde.surum),
  }),
  uc({
    yontem: 'POST',
    yol: '/cizimler/:id/revizyonlar/:revizyonId/onizleme',
    yetki: 'cizimler.yayinla',
    parametre: revizyonParametresi,
    govde: onizlemeGovdesi,
    cevap: belgeAyrintisi,
    isle: ({ db, kullanici, parametre, govde, denetimEki }) => servis.onizlemeYaz(db, kullanici, parametre.id, parametre.revizyonId, govde, denetimEki),
  }),
  uc({
    yontem: 'POST',
    yol: '/cizimler/:id/revizyonlar/:revizyonId/sil',
    yetki: 'cizimler.yaz',
    parametre: revizyonParametresi,
    govde: surumGovdesi,
    cevap: belgeAyrintisi,
    isle: ({ db, parametre, govde, denetimEki }) => servis.revizyonSil(db, parametre.id, parametre.revizyonId, govde.surum, denetimEki),
  }),
  uc({
    yontem: 'POST',
    yol: '/cizimler/:id/bag-ekle',
    yetki: 'cizimler.yaz',
    parametre: idParametresi,
    govde: bagGovdesi,
    cevap: belgeAyrintisi,
    isle: ({ db, kullanici, parametre, govde }) => servis.bagEkle(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/cizimler/:id/bag-kaldir',
    yetki: 'cizimler.yaz',
    parametre: idParametresi,
    govde: bagGovdesi,
    cevap: belgeAyrintisi,
    isle: ({ db, parametre, govde }) => servis.bagKaldir(db, parametre.id, govde),
  }),
];
