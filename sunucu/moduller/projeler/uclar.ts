import { uc } from '#cekirdek/uc.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import {
  firmaSecenekleriCevabi, firmaSecenekleriSorgusu, gorevEkleGovdesi, gorevGuncelleGovdesi, gorevParametresi, idParametresi,
  kilometreTasiEkleGovdesi, kilometreTasiGuncelleGovdesi, kilometreTasiParametresi, kisiSecenekleriCevabi, projeGuncelleGovdesi,
  projeListesiCevabi, projeListesiSorgusu, projeOlusturGovdesi, projeSemasi, projeYonetimiCevabi, siparisParametresi, siparisProjeleriCevabi,
  siparisSecenekleriCevabi, siparisSecenekleriSorgusu, siparistenProjeGovdesi, statuAyariGovdesi, statuEkleGovdesi, statuGuncelleGovdesi,
  statuListesiCevabi, statuYazGovdesi, tabanYenileGovdesi,
} from '#paylasilan/sozlesme/projeler.ts';
import {
  firmaSecenekleri, gorevDuzenle, gorevEkle, kilometreTasiDuzenle, kilometreTasiEkle, projeAc, projeAyrintisi, projeDuzenle, projeListesi,
  projeYonetimi, siparisProjeleri, siparisSecenekleri, siparistenProjeAc, sorumluSecenekleri, statuAyariDuzenle, statuDuzenle, statuEkle,
  statuListesi, statuYaz, tabanYenile,
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
  // 890 c: statü listesi okunur (liste süzgeci, pencere); değiştirmek yalnız `projeler.statu-ayar`.
  uc({
    yontem: 'GET',
    yol: '/projeler/statuler',
    yetki: OKUMA,
    cevap: statuListesiCevabi,
    isle: ({ db }) => statuListesi(db),
  }),
  uc({
    yontem: 'POST',
    yol: '/projeler/statuler',
    yetki: 'projeler.statu-ayar',
    govde: statuEkleGovdesi,
    cevap: statuListesiCevabi,
    tekrarKorumali: true,
    isle: ({ db, kullanici, govde }) => statuEkle(db, kullanici.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/projeler/statuler/:id/guncelle',
    yetki: 'projeler.statu-ayar',
    parametre: idParametresi,
    govde: statuGuncelleGovdesi,
    cevap: statuListesiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => statuDuzenle(db, kullanici.id, parametre.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/projeler/statu-ayari/guncelle',
    yetki: 'projeler.statu-ayar',
    govde: statuAyariGovdesi,
    cevap: statuListesiCevabi,
    isle: ({ db, kullanici, govde }) => statuAyariDuzenle(db, kullanici.id, govde),
  }),
  // Görev sorumlusu seçicisi yalnız görev yazana açılır.
  uc({
    yontem: 'GET',
    yol: '/projeler/sorumlu-secenekleri',
    yetki: 'projeler.gorev-yaz',
    cevap: kisiSecenekleriCevabi,
    isle: async ({ db }) => ({ kisiler: await sorumluSecenekleri(db) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/projeler/kilometre-taslari/:tasId/guncelle',
    yetki: 'projeler.gorev-yaz',
    parametre: kilometreTasiParametresi,
    govde: kilometreTasiGuncelleGovdesi,
    cevap: projeYonetimiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => kilometreTasiDuzenle(db, kullanici.id, parametre.tasId, govde),
  }),
  // PRJ-13: taban tarih yalnız bu komutla, gerekçeyle değişir; eski değer geçmişte kalır.
  uc({
    yontem: 'POST',
    yol: '/projeler/kilometre-taslari/:tasId/taban-yenile',
    yetki: 'projeler.gorev-yaz',
    parametre: kilometreTasiParametresi,
    govde: tabanYenileGovdesi,
    cevap: projeYonetimiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => tabanYenile(db, kullanici.id, parametre.tasId, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/projeler/gorevler/:gorevId/guncelle',
    yetki: 'projeler.gorev-yaz',
    parametre: gorevParametresi,
    govde: gorevGuncelleGovdesi,
    cevap: projeYonetimiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => gorevDuzenle(db, kullanici.id, parametre.gorevId, govde),
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
  uc({
    yontem: 'GET',
    yol: '/projeler/:id/yonetim',
    yetki: OKUMA,
    parametre: idParametresi,
    cevap: projeYonetimiCevabi,
    isle: ({ db, parametre }) => projeYonetimi(db, parametre.id),
  }),
  // PRJ-11: statü kaydı yalnız eklenir; kişi ve zaman sunucudan.
  uc({
    yontem: 'POST',
    yol: '/projeler/:id/statu',
    yetki: 'projeler.statu-yaz',
    parametre: idParametresi,
    govde: statuYazGovdesi,
    cevap: projeYonetimiCevabi,
    tekrarKorumali: true,
    isle: ({ db, kullanici, parametre, govde }) => statuYaz(db, kullanici.id, parametre.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/projeler/:id/kilometre-taslari',
    yetki: 'projeler.gorev-yaz',
    parametre: idParametresi,
    govde: kilometreTasiEkleGovdesi,
    cevap: projeYonetimiCevabi,
    tekrarKorumali: true,
    isle: ({ db, kullanici, parametre, govde }) => kilometreTasiEkle(db, kullanici.id, parametre.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/projeler/:id/gorevler',
    yetki: 'projeler.gorev-yaz',
    parametre: idParametresi,
    govde: gorevEkleGovdesi,
    cevap: projeYonetimiCevabi,
    tekrarKorumali: true,
    isle: ({ db, kullanici, parametre, govde }) => gorevEkle(db, kullanici.id, parametre.id, govde),
  }),
];
