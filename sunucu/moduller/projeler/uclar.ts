import { uc } from '#cekirdek/uc.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import {
  firmaSecenekleriCevabi, firmaSecenekleriSorgusu, idParametresi, projeGuncelleGovdesi, projeListesiCevabi, projeListesiSorgusu,
  projeOlusturGovdesi, projeSemasi, siparisParametresi, siparisProjeleriCevabi, siparisSecenekleriCevabi, siparisSecenekleriSorgusu,
  siparistenProjeGovdesi,
} from '#paylasilan/sozlesme/projeler.ts';
import {
  firmaSecenekleri, projeAc, projeAyrintisi, projeDuzenle, projeListesi, siparisProjeleri, siparisSecenekleri, siparistenProjeAc,
} from './servis.ts';

// Sayfası olan rol okur; `projeler.oku` sayfasız okuma için ayrı verilebilir (başka modülün ekranı proje seçerken).
const OKUMA = { biri: ['sayfa.projeler', 'projeler.oku'] } as const;
// Bütçe tutarı yalnız maliyet görene açılır (180); işlem uçta değil alan düzeyinde denetlenir.
const maliyetGorur = (k: Kullanici): boolean => islemVarMi(k, 'finans.maliyet-oku');

export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/projeler',
    yetki: OKUMA,
    sorgu: projeListesiSorgusu,
    cevap: projeListesiCevabi,
    isle: ({ db, kullanici, sorgu }) => projeListesi(db, sorgu, maliyetGorur(kullanici)),
  }),
  // Firma seçici yalnız proje yazan kişiye açılır; firma listesi finanstan, bu modülün işlemiyle okunur.
  uc({
    yontem: 'GET',
    yol: '/projeler/firma-secenekleri',
    yetki: 'projeler.yaz',
    sorgu: firmaSecenekleriSorgusu,
    cevap: firmaSecenekleriCevabi,
    isle: async ({ db, sorgu }) => ({ firmalar: await firmaSecenekleri(db, sorgu.ara) }),
  }),
  // Sipariş seçici de proje yazana açılır (224): siparişi açan sayfası olmasa da onaylı siparişten proje açar (176 a).
  uc({
    yontem: 'GET',
    yol: '/projeler/siparis-secenekleri',
    yetki: 'projeler.yaz',
    sorgu: siparisSecenekleriSorgusu,
    cevap: siparisSecenekleriCevabi,
    isle: async ({ db, sorgu }) => ({ siparisler: await siparisSecenekleri(db, sorgu.ara) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/projeler/siparis/:siparisId',
    yetki: OKUMA,
    parametre: siparisParametresi,
    cevap: siparisProjeleriCevabi,
    isle: async ({ db, kullanici, parametre }) => ({ projeler: await siparisProjeleri(db, parametre.siparisId, maliyetGorur(kullanici)) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/projeler/:id',
    yetki: OKUMA,
    parametre: idParametresi,
    cevap: projeSemasi,
    isle: ({ db, kullanici, parametre }) => projeAyrintisi(db, parametre.id, maliyetGorur(kullanici)),
  }),
  uc({
    yontem: 'POST',
    yol: '/projeler',
    yetki: 'projeler.yaz',
    govde: projeOlusturGovdesi,
    cevap: projeSemasi,
    isle: ({ db, kullanici, govde }) => projeAc(db, kullanici.id, govde, maliyetGorur(kullanici)),
  }),
  // Sipariş okuması bu ucun işlemiyle yapılır: proje yazan, siparişi açan sayfaya sahip olmasa da siparişten proje açar (176 a).
  uc({
    yontem: 'POST',
    yol: '/projeler/siparisten/:siparisId/ac',
    yetki: 'projeler.yaz',
    parametre: siparisParametresi,
    govde: siparistenProjeGovdesi,
    cevap: projeSemasi,
    isle: ({ db, kullanici, parametre, govde }) => siparistenProjeAc(db, kullanici.id, parametre.siparisId, govde, maliyetGorur(kullanici)),
  }),
  uc({
    yontem: 'POST',
    yol: '/projeler/:id/guncelle',
    yetki: 'projeler.yaz',
    parametre: idParametresi,
    govde: projeGuncelleGovdesi,
    cevap: projeSemasi,
    isle: ({ db, kullanici, parametre, govde }) => projeDuzenle(db, kullanici.id, parametre.id, govde, maliyetGorur(kullanici)),
  }),
];
