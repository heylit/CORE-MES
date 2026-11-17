import { uc } from '#cekirdek/uc.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import {
  bitisBaglaGovdesi, firmaSecenekleriCevabi, firmaSecenekleriSorgusu, gorevEkleGovdesi, gorevGuncelleGovdesi, gorevParametresi, hazirlikAtaCevabi, hazirlikAtaGovdesi, idParametresi, kademeGecmisiCevabi,
  kilometreTasiEkleGovdesi, kilometreTasiGuncelleGovdesi, kilometreTasiParametresi, kisiSecenekleriCevabi, projeGuncelleGovdesi,
  projeListesiCevabi, projeListesiSorgusu, projeOlusturGovdesi, projeSemasi, projeSiparisKalemleriCevabi, projeYonetimiCevabi, siparisParametresi, siparisProjeleriCevabi,
  siparisSecenekleriCevabi, siparisSecenekleriSorgusu, siparistenProjeGovdesi, statuAyariGovdesi, statuEkleGovdesi, statuGuncelleGovdesi,
  statuListesiCevabi, statuYazGovdesi, tabanYenileGovdesi,
  geriGonderGovdesi, gorevAyrintisiCevabi, gorevKomutuGovdesi, gorevlerimCevabi, rolSecenekleriCevabi, sablondanEkleGovdesi, sablonEkleGovdesi,
  sablonGuncelleGovdesi, sablonListesiCevabi, sablonSecenekleriCevabi,
} from '#paylasilan/sozlesme/projeler.ts';
import {
  bitisBagla, firmaSecenekleri, gorevDuzenle, gorevEkle, kilometreTasiDuzenle, kilometreTasiEkle, projeAc, projeAyrintisi, projeDuzenle, projeListesi,
  projeSiparisKalemleri, projeYonetimi, siparisProjeleri, siparisSecenekleri, siparistenProjeAc, sorumluSecenekleri, statuAyariDuzenle, statuDuzenle, statuEkle,
  statuListesi, statuYaz, tabanYenile,
  gorevAyrintisi, gorevBasla, gorevBitir, gorevGeriGonder, gorevIptal, gorevlerim, gorevOnayla, gorevUstlen, rolSecenekleri, sablondanEkle, sablonDuzenle,
  sablonEkle, sablonListesi, sablonSecenekleri,
} from './servis.ts';
import { hazirlikGoreviAta } from './hazirlik-gorevleri.ts';
import { kademeGecmisi } from './hazirlik-kademe.ts';

// Sayfası olan rol okur; `projeler.oku` sayfasız okuma için ayrı verilebilir (başka modülün ekranı proje seçerken).
const OKUMA = { biri: ['sayfa.projeler', 'projeler.oku'] } as const;
// Bütçe tutarı yalnız maliyet görene açılır (180); işlem uçta değil alan düzeyinde denetlenir.
const maliyetGorur = (k: Kullanici): boolean => islemVarMi(k, 'finans.maliyet-oku');
// 3269: görev işleyen ve kontrol eden yalnız kendisine düşen kaydı görür; kayıt düzeyi denetim serviste.
const GOREVLERIM = { biri: ['sayfa.proje-gorevlerim', 'projeler.gorev-isle', 'projeler.gorev-kontrol'] } as const;
const GOREV_OKUMA = { biri: ['sayfa.projeler', 'projeler.oku', 'projeler.gorev-isle', 'projeler.gorev-kontrol'] } as const;
const ATAMA_SECICI = { biri: ['projeler.gorev-yaz', 'projeler.sablon-yaz', 'projeler.hazirlik-dagit', 'uretim-emirleri.hazirlik-ayar'] } as const;
const gorevKomutu = (
  yol: string, yetki: 'projeler.gorev-isle' | 'projeler.gorev-kontrol',
  is: typeof gorevUstlen,
) => uc({
  yontem: 'POST', yol, yetki, parametre: gorevParametresi, govde: gorevKomutuGovdesi, cevap: gorevAyrintisiCevabi,
  isle: ({ db, kullanici, parametre, govde }) => is(db, kullanici, parametre.gorevId, govde),
});

export const uclar = [
  // 3396 a: hazırlık görevinin kademe geçmişi (ortak kademeli uyarı defterinden, 3405).
  uc({
    yontem: 'GET',
    yol: '/projeler/gorevler/:gorevId/kademeler',
    yetki: 'projeler.oku',
    parametre: gorevParametresi,
    cevap: kademeGecmisiCevabi,
    isle: ({ db, parametre }) => kademeGecmisi(db, parametre.gorevId),
  }),
  // 3396 a: hazırlık görevinin yapanını değiştirmek dağıtma işlemidir (Proje > Hazırlık yan paneli).
  uc({
    yontem: 'POST',
    yol: '/projeler/gorevler/:gorevId/hazirlik-ata',
    yetki: 'projeler.hazirlik-dagit',
    parametre: gorevParametresi,
    govde: hazirlikAtaGovdesi,
    cevap: hazirlikAtaCevabi,
    isle: ({ db, kullanici, parametre, govde }) => hazirlikGoreviAta(db, kullanici, parametre.gorevId, govde),
  }),
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
  // Görev sorumlusu seçicisi yalnız görev ya da şablon yazana açılır.
  uc({
    yontem: 'GET',
    yol: '/projeler/sorumlu-secenekleri',
    yetki: ATAMA_SECICI,
    cevap: kisiSecenekleriCevabi,
    isle: async ({ db }) => ({ kisiler: await sorumluSecenekleri(db) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/projeler/rol-secenekleri',
    yetki: ATAMA_SECICI,
    cevap: rolSecenekleriCevabi,
    isle: async ({ db }) => ({ roller: await rolSecenekleri(db) }),
  }),
  // 3269: Proje görevlerim; satırlar kişinin kendisine, rolüne ya da kontrolüne düşen görevlerdir.
  uc({
    yontem: 'GET',
    yol: '/projeler/gorevlerim/liste',
    yetki: GOREVLERIM,
    cevap: gorevlerimCevabi,
    isle: ({ db, kullanici }) => gorevlerim(db, kullanici),
  }),
  uc({
    yontem: 'GET',
    yol: '/projeler/gorevler/:gorevId/ayrinti',
    yetki: GOREV_OKUMA,
    parametre: gorevParametresi,
    cevap: gorevAyrintisiCevabi,
    isle: ({ db, kullanici, parametre }) => gorevAyrintisi(db, kullanici, parametre.gorevId),
  }),
  gorevKomutu('/projeler/gorevler/:gorevId/ustlen', 'projeler.gorev-isle', gorevUstlen),
  gorevKomutu('/projeler/gorevler/:gorevId/basla', 'projeler.gorev-isle', gorevBasla),
  gorevKomutu('/projeler/gorevler/:gorevId/bitir', 'projeler.gorev-isle', gorevBitir),
  gorevKomutu('/projeler/gorevler/:gorevId/onayla', 'projeler.gorev-kontrol', gorevOnayla),
  uc({
    yontem: 'POST',
    yol: '/projeler/gorevler/:gorevId/geri-gonder',
    yetki: 'projeler.gorev-kontrol',
    parametre: gorevParametresi,
    govde: geriGonderGovdesi,
    cevap: gorevAyrintisiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => gorevGeriGonder(db, kullanici, parametre.gorevId, govde),
  }),
  // 3303-1 c: görev silinmez; görev yazan iptal eder.
  uc({
    yontem: 'POST',
    yol: '/projeler/gorevler/:gorevId/iptal',
    yetki: 'projeler.gorev-yaz',
    parametre: gorevParametresi,
    govde: gorevKomutuGovdesi,
    cevap: gorevAyrintisiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => gorevIptal(db, kullanici, parametre.gorevId, govde),
  }),
  // 3269: görev şablonları; yazan şablon ekranını da okur. Proje açan ve görev yazan seçici için etkin şablonları görür.
  uc({
    yontem: 'GET',
    yol: '/projeler/sablonlar/liste',
    yetki: 'projeler.sablon-yaz',
    cevap: sablonListesiCevabi,
    isle: ({ db }) => sablonListesi(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/projeler/sablon-secenekleri',
    yetki: { biri: ['projeler.yaz', 'projeler.gorev-yaz', 'projeler.hazirlik-dagit'] },
    cevap: sablonSecenekleriCevabi,
    isle: ({ db }) => sablonSecenekleri(db),
  }),
  uc({
    yontem: 'POST',
    yol: '/projeler/sablonlar',
    yetki: 'projeler.sablon-yaz',
    govde: sablonEkleGovdesi,
    cevap: sablonListesiCevabi,
    tekrarKorumali: true,
    isle: ({ db, kullanici, govde }) => sablonEkle(db, kullanici.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/projeler/sablonlar/:id/guncelle',
    yetki: 'projeler.sablon-yaz',
    parametre: idParametresi,
    govde: sablonGuncelleGovdesi,
    cevap: sablonListesiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => sablonDuzenle(db, kullanici.id, parametre.id, govde),
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
  // 3244 b: projenin siparişinden gelen kalemler; sipariş okuması proje okuma yetkisiyle yapılır, fiyat taşınmaz.
  uc({
    yontem: 'GET',
    yol: '/projeler/:id/siparis-kalemleri',
    yetki: OKUMA,
    parametre: idParametresi,
    cevap: projeSiparisKalemleriCevabi,
    isle: ({ db, parametre }) => projeSiparisKalemleri(db, parametre.id),
  }),
  // PRJ-18 (3244 b): bitiş siparişin terminine yeniden bağlanır; yazma işlemi proje düzenlemeyle aynıdır.
  uc({
    yontem: 'POST',
    yol: '/projeler/:id/bitis-bagla',
    yetki: 'projeler.yaz',
    parametre: idParametresi,
    govde: bitisBaglaGovdesi,
    cevap: projeSemasi,
    isle: ({ db, kullanici, parametre, govde }) => bitisBagla(db, kullanici.id, parametre.id, govde, maliyetGorur(kullanici)),
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
  // 3269: seçilen şablonun görevleri açık projeye eklenir (şablonsuz açılan proje sonradan şablon alır).
  uc({
    yontem: 'POST',
    yol: '/projeler/:id/sablondan-ekle',
    yetki: 'projeler.gorev-yaz',
    parametre: idParametresi,
    govde: sablondanEkleGovdesi,
    cevap: projeYonetimiCevabi,
    tekrarKorumali: true,
    isle: ({ db, kullanici, parametre, govde }) => sablondanEkle(db, kullanici.id, parametre.id, govde.sablonId),
  }),
];
