import { uc } from '#cekirdek/uc.ts';
import {
  aletAyrintiCevabi, aletGuncelleGovdesi, aletOlusturGovdesi, idParametresi, kalibrasyonGovdesi, kullanimDisiGovdesi,
  listeCevabi, listeSorgusu, ozetCevabi, silmeCevabi, turGuncelleGovdesi, turListesiCevabi, turOlusturGovdesi,
} from '#paylasilan/sozlesme/kalibrasyon.ts';
import {
  aletAyrintisi, aletDuzenle, aletOlustur, aletOzeti, aletiSil, aletleriListele, kalibrasyonKaydet, kullanimDisiBirak, turDuzenle,
  turOlustur, turleriListele,
} from './servis.ts';

// Sayfası olan rol okur; `kalibrasyon.oku` sayfasız okuma için ayrı verilebilir (ADR 0007 madde 5).
const OKUMA = { biri: ['sayfa.kalibrasyon', 'kalibrasyon.oku'] } as const;

export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/olcu-aletleri',
    yetki: OKUMA,
    sorgu: listeSorgusu,
    cevap: listeCevabi,
    isle: ({ db, sorgu }) => aletleriListele(db, sorgu.ara),
  }),
  uc({
    yontem: 'GET',
    yol: '/olcu-aletleri/ozet',
    yetki: OKUMA,
    cevap: ozetCevabi,
    isle: ({ db }) => aletOzeti(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/olcu-aletleri/:id',
    yetki: OKUMA,
    parametre: idParametresi,
    cevap: aletAyrintiCevabi,
    isle: ({ db, parametre }) => aletAyrintisi(db, parametre.id),
  }),
  uc({
    yontem: 'POST',
    yol: '/olcu-aletleri',
    yetki: 'kalibrasyon.yaz',
    govde: aletOlusturGovdesi,
    cevap: aletAyrintiCevabi,
    isle: ({ db, kullanici, govde }) => aletOlustur(db, kullanici.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/olcu-aletleri/:id/guncelle',
    yetki: 'kalibrasyon.yaz',
    parametre: idParametresi,
    govde: aletGuncelleGovdesi,
    cevap: aletAyrintiCevabi,
    isle: ({ db, parametre, govde }) => aletDuzenle(db, parametre.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/olcu-aletleri/:id/sil',
    yetki: 'kalibrasyon.yaz',
    parametre: idParametresi,
    cevap: silmeCevabi,
    isle: async ({ db, parametre }) => {
      await aletiSil(db, parametre.id);
      return undefined;
    },
  }),
  uc({
    yontem: 'POST',
    yol: '/olcu-aletleri/:id/kalibrasyon-kaydet',
    yetki: 'kalibrasyon.yaz',
    // Defter yalnız ekleme alır, kayıt geri alınamaz: cevabı yitirilip yeniden gönderilen istek ikinci kayıt yazmamalı.
    tekrarKorumali: true,
    parametre: idParametresi,
    govde: kalibrasyonGovdesi,
    cevap: aletAyrintiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => kalibrasyonKaydet(db, kullanici.id, parametre.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/olcu-aletleri/:id/kullanim-disi',
    yetki: 'kalibrasyon.yaz',
    parametre: idParametresi,
    govde: kullanimDisiGovdesi,
    cevap: aletAyrintiCevabi,
    isle: ({ db, parametre, govde }) => kullanimDisiBirak(db, parametre.id, govde.neden),
  }),
  uc({
    yontem: 'GET',
    yol: '/olcu-aleti-turleri',
    yetki: OKUMA,
    cevap: turListesiCevabi,
    isle: async ({ db }) => ({ turler: await turleriListele(db) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/olcu-aleti-turleri',
    yetki: 'kalibrasyon.yaz',
    govde: turOlusturGovdesi,
    cevap: turListesiCevabi,
    isle: async ({ db, govde }) => ({ turler: await turOlustur(db, govde.ad) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/olcu-aleti-turleri/:id/guncelle',
    yetki: 'kalibrasyon.yaz',
    parametre: idParametresi,
    govde: turGuncelleGovdesi,
    cevap: turListesiCevabi,
    isle: async ({ db, parametre, govde }) => ({ turler: await turDuzenle(db, parametre.id, govde.ad, govde.aktif, govde.surum) }),
  }),
];
