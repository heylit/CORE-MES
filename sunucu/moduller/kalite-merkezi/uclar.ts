import { ikiliCevap, uc } from '#cekirdek/uc.ts';
import type { Uc } from '#cekirdek/uc.ts';
import {
  kmBelgeParametresi, kmDegisiklikCevabi, kmDegisiklikSorgusu, kmDosyaBaglaGovdesi, kmDosyaCevabi, kmDosyaParametresi,
  kmEmirKaynaklariCevabi, kmEslesmeSayimiCevabi, kmParcaKaynaklariCevabi, kmParcaKaynaklariSorgusu,
  kmGeriYukleCevabi, kmGeriYukleGovdesi, kmGecmisCevabi, kmIlkParcaBekleyenCevabi, kmIlkParcaCevabi, kmIlkParcaGovdesi, kmIlkParcaParametresi, kmKarantinaKonumlariCevabi, kmKarantinaPartileriCevabi, kmKimlikCevabi, kmOlcuAletleriCevabi, kmOnayGeriAlGovdesi, kmOnaylaCevabi, kmOnaylaGovdesi, kmOzetCevabi, kmSilGovdesi, kmSurumCevabi, kmTamamCevabi, kmTedarikciFirmalariCevabi, kmYazGovdesi,
} from '#paylasilan/sozlesme/kalite-merkezi.ts';
import * as servis from './servis.ts';
import {
  kmBalonlarGovdesi, kmMerkezBelgeleriCevabi, kmMerkezBelgeSorgusu, kmNumuneCevabi, kmNumuneIsteGovdesi, kmNumuneKarariGovdesi, kmNumunePlaniCevabi, kmNumunePlaniGovdesi, kmNumunelerCevabi,
  kmOlcumGovdesi, kmOlcumlerCevabi, kmResimCevabi, kmResimEkleGovdesi, kmStudyoEmirParametresi, kmStudyoNumuneParametresi, kmStudyoParcaCevabi,
  kmStudyoParcaParametresi, kmStudyoPlanParametresi, kmStudyoResimParametresi, kmSurumGovdesi,
} from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import * as studyo from './studyo.ts';

// Uygulamanın yerel sunucu sözleşmesinin (sunucu.py: sync, doc, files, restore) TMI karşılığı. Okuma tek akıştan, yazma
// kayıt başına; kural sunucudadır (değişiklik izi yalnız eklenir), kaydın içeriği uygulamanındır.
export const uclar: Uc[] = [
  uc({
    yontem: 'GET',
    yol: '/kalite-merkezi/degisiklikler',
    yetki: 'kalite-merkezi.oku',
    sorgu: kmDegisiklikSorgusu,
    cevap: kmDegisiklikCevabi,
    isle: ({ db, sorgu }) => servis.degisiklikler(db, sorgu.sonra),
  }),
  uc({
    yontem: 'GET',
    yol: '/kalite-merkezi/olcu-aletleri',
    // 329 a: cihaz listesinin kaynağı Kalibrasyondur; uygulamanın okuma işlemiyle açılır, yazma ucu yoktur.
    yetki: 'kalite-merkezi.oku',
    cevap: kmOlcuAletleriCevabi,
    isle: ({ db }) => servis.olcuAletleri(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/kalite-merkezi/kimlik',
    yetki: 'kalite-merkezi.oku',
    cevap: kmKimlikCevabi,
    isle: ({ db, kullanici }) => servis.kimlik(db, kullanici),
  }),
  uc({
    yontem: 'GET',
    yol: '/kalite-merkezi/ozet',
    yetki: 'kalite-merkezi.oku',
    cevap: kmOzetCevabi,
    isle: ({ db }) => servis.ozet(db),
  }),
  uc({
    yontem: 'POST',
    yol: '/kalite-merkezi/kayitlar/:koleksiyon/:kimlik/yaz',
    yetki: 'kalite-merkezi.yaz',
    parametre: kmBelgeParametresi,
    govde: kmYazGovdesi,
    cevap: kmSurumCevabi,
    // Kaydın içeriği (fotoğraflar dahil) deftere kopyalanmaz; kayıt adresle, beklenen sürüm seçimle kalır (kullanıcı kararı 16.10.2026).
    denetim: 'govdesiz',
    denetimOzeti: (g) => ({ surum: g.surum }),
    isle: ({ db, kullanici, parametre, govde }) => servis.yaz(db, kullanici, parametre.koleksiyon, parametre.kimlik, govde.govde, govde.surum),
  }),
  uc({
    yontem: 'POST',
    yol: '/kalite-merkezi/kayitlar/:koleksiyon/:kimlik/onayla',
    yetki: 'kalite-merkezi.onayla',
    parametre: kmBelgeParametresi,
    govde: kmOnaylaGovdesi,
    cevap: kmOnaylaCevabi,
    // Onaylanan içerik deftere tam girer: neyin onaylandığı ve kapandığı izlenir (kayıt yazmanın gövdesiz kararı onay ucunu kapsamaz).
    isle: ({ db, kullanici, parametre, govde }) =>
      servis.onayla(db, kullanici, parametre.koleksiyon, parametre.kimlik, govde.govde, govde.surum, govde.karantinaHedefKonumId, govde.serbestMiktarlar),
  }),
  uc({
    yontem: 'GET',
    yol: '/kalite-merkezi/ncr/:kimlik/karantina-partileri',
    // Miktarı kapanışı yapan seçer (320 a); liste onay yetkisiyle açılır.
    yetki: 'kalite-merkezi.onayla',
    parametre: kmDosyaParametresi,
    cevap: kmKarantinaPartileriCevabi,
    isle: ({ db, parametre }) => servis.karantinaPartileri(db, parametre.kimlik),
  }),
  uc({
    yontem: 'GET',
    yol: '/kalite-merkezi/tedarikci-firmalari',
    // 236 a: tedarikçi kaydının firma seçicisi. Tedarikçi kaydını onay yetkisi olan yazar; liste de onunla açılır.
    yetki: 'kalite-merkezi.onayla',
    cevap: kmTedarikciFirmalariCevabi,
    isle: async ({ db }) => ({ firmalar: await servis.tedarikciFirmaSecenekleri(db) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/kalite-merkezi/emir-kaynaklari',
    // 592 B1 c: iş emri ve siparişler sahiplerinden okunur; kaydı gören herkes görür (eski kendi listesi gibi).
    yetki: 'kalite-merkezi.oku',
    cevap: kmEmirKaynaklariCevabi,
    isle: ({ db }) => servis.emirKaynaklari(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/kalite-merkezi/parca-kaynaklari',
    // 592 B2 a: parça numarası ve adı Malzemeler'den; kartın kalite alanlarını yazmayan da adı görür.
    yetki: 'kalite-merkezi.oku',
    sorgu: kmParcaKaynaklariSorgusu,
    cevap: kmParcaKaynaklariCevabi,
    isle: ({ db, sorgu }) => servis.parcaKaynaklari(db, sorgu),
  }),
  uc({
    yontem: 'GET',
    yol: '/kalite-merkezi/eslesme-sayimi',
    // 592 B3 c: eşleşmeyen eski kayıtların listesi silme kararına girdidir; onay yetkisiyle açılır.
    yetki: 'kalite-merkezi.onayla',
    cevap: kmEslesmeSayimiCevabi,
    isle: ({ db }) => servis.eslesmeSayimi(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/kalite-merkezi/karantina-konumlari',
    // Seçimi NCR'yi kapatan yapar; liste onay yetkisiyle açılır.
    yetki: 'kalite-merkezi.onayla',
    cevap: kmKarantinaKonumlariCevabi,
    isle: async ({ db }) => ({ konumlar: await servis.karantinaHedefKonumlari(db) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/kalite-merkezi/ilk-parca/bekleyenler',
    // Karar ucuyla aynı yetki: kararı verebilen kişi bekleyenleri görür (325 a).
    yetki: 'kalite-merkezi.onayla',
    cevap: kmIlkParcaBekleyenCevabi,
    isle: ({ db }) => servis.ilkParcaBekleyenListesi(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/kalite-merkezi/kayitlar/:koleksiyon/:kimlik/gecmis',
    yetki: 'kalite-merkezi.oku',
    parametre: kmBelgeParametresi,
    cevap: kmGecmisCevabi,
    isle: ({ db, parametre }) => servis.kayitGecmisi(db, parametre.koleksiyon, parametre.kimlik),
  }),
  uc({
    yontem: 'POST',
    yol: '/kalite-merkezi/ilk-parca/:uretimEmriId/karar',
    // İlk parça kararı kalite onayıdır (denetim #12): operatörün sayımı karar vermez, onay yetkisi olan verir.
    yetki: 'kalite-merkezi.onayla',
    // Her çağrı deftere karar satırı yazar: cevabı kaybolan kararın yinelemesi ikinci satır açmasın.
    tekrarKorumali: true,
    parametre: kmIlkParcaParametresi,
    govde: kmIlkParcaGovdesi,
    cevap: kmIlkParcaCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.ilkParcaKarari(db, kullanici.id, parametre.uretimEmriId, govde.karar, govde.isEmriId ?? null),
  }),
  uc({
    yontem: 'POST',
    yol: '/kalite-merkezi/formlar/:kimlik/onay-geri-al',
    yetki: 'kalite-merkezi.onayla',
    parametre: kmDosyaParametresi,
    govde: kmOnayGeriAlGovdesi,
    cevap: kmSurumCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.onayGeriAl(db, kullanici, parametre.kimlik, govde.surum),
  }),
  uc({
    yontem: 'POST',
    yol: '/kalite-merkezi/kayitlar/:koleksiyon/:kimlik/sil',
    yetki: 'kalite-merkezi.yaz',
    parametre: kmBelgeParametresi,
    govde: kmSilGovdesi,
    cevap: kmSurumCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.sil(db, kullanici, parametre.koleksiyon, parametre.kimlik, govde.surum),
  }),
  uc({
    yontem: 'POST',
    yol: '/kalite-merkezi/geri-yukle',
    yetki: 'kalite-merkezi.geri-yukle',
    govde: kmGeriYukleGovdesi,
    cevap: kmGeriYukleCevabi,
    denetim: 'govdesiz',
    denetimOzeti: (g) => ({ baslangic: g.baslangic, son: g.son, belge: g.belgeler.length }),
    isle: ({ db, kullanici, govde }) => servis.geriYukle(db, kullanici, govde.baslangic, govde.son, govde.belgeler),
  }),
  uc({
    yontem: 'POST',
    yol: '/kalite-merkezi/dosyalar/:kimlik/bagla',
    yetki: 'kalite-merkezi.yaz',
    parametre: kmDosyaParametresi,
    govde: kmDosyaBaglaGovdesi,
    cevap: kmDosyaCevabi,
    isle: ({ db, kullanici, parametre, govde, denetimEki }) =>
      servis.dosyaBagi(db, kullanici, parametre.kimlik, govde.ozet, govde.ad, denetimEki),
  }),
  uc({
    yontem: 'GET',
    yol: '/kalite-merkezi/dosyalar/:kimlik',
    yetki: 'kalite-merkezi.oku',
    parametre: kmDosyaParametresi,
    cevap: ikiliCevap,
    isle: ({ db, parametre }) => servis.dosyaOku(db, parametre.kimlik),
  }),
  uc({
    yontem: 'POST',
    yol: '/kalite-merkezi/dosyalar/:kimlik/sil',
    yetki: 'kalite-merkezi.yaz',
    parametre: kmDosyaParametresi,
    cevap: kmTamamCevabi,
    isle: ({ db, parametre, denetimEki }) => servis.dosyaSil(db, parametre.kimlik, denetimEki),
  }),
  // Stüdyo (595 1 b, 597 a, 600 a): resim, balon ve numune planı okunur; numune ve ölçüm Kalite Merkezi'nde yazılır. Resim alma,
  // kontrol planı ve numune planı kalite onayıdır (603 a: kalite-merkezi.onayla).
  uc({
    yontem: 'GET',
    yol: '/kalite-merkezi/studyo/parcalar/:malzemeNo',
    yetki: 'kalite-merkezi.oku',
    parametre: kmStudyoParcaParametresi,
    cevap: kmStudyoParcaCevabi,
    isle: ({ db, parametre }) => studyo.studyoParcasi(db, parametre.malzemeNo),
  }),
  uc({
    yontem: 'GET',
    yol: '/kalite-merkezi/studyo/resimler/:resimId/dosya',
    yetki: 'kalite-merkezi.oku',
    parametre: kmStudyoResimParametresi,
    cevap: ikiliCevap,
    isle: ({ db, parametre }) => studyo.resimDosyasi(db, parametre.resimId),
  }),
  uc({
    yontem: 'GET',
    yol: '/kalite-merkezi/studyo/numuneler',
    yetki: 'kalite-merkezi.oku',
    cevap: kmNumunelerCevabi,
    isle: async ({ db }) => ({ numuneler: await studyo.acikNumuneler(db) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/kalite-merkezi/studyo/numuneler/:numuneId',
    yetki: 'kalite-merkezi.oku',
    parametre: kmStudyoNumuneParametresi,
    cevap: kmNumuneCevabi,
    isle: async ({ db, parametre }) => ({ numune: await studyo.numuneOku(db, parametre.numuneId) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/kalite-merkezi/studyo/emirler/:uretimEmriId/numuneler',
    yetki: 'kalite-merkezi.oku',
    parametre: kmStudyoEmirParametresi,
    cevap: kmNumunelerCevabi,
    isle: async ({ db, parametre }) => ({ numuneler: await studyo.emirNumuneleri(db, parametre.uretimEmriId) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/kalite-merkezi/studyo/emirler/:uretimEmriId/olcumler',
    yetki: 'kalite-merkezi.oku',
    parametre: kmStudyoEmirParametresi,
    cevap: kmOlcumlerCevabi,
    isle: async ({ db, parametre }) => ({ olcumler: await studyo.emirOlcumleri(db, parametre.uretimEmriId) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/kalite-merkezi/studyo/merkez-belgeleri',
    // Seçici resim almanın parçasıdır: alma ile aynı yetki (603 a).
    yetki: 'kalite-merkezi.onayla',
    sorgu: kmMerkezBelgeSorgusu,
    cevap: kmMerkezBelgeleriCevabi,
    isle: async ({ db, sorgu }) => ({ belgeler: await studyo.merkezBelgeleri(db, sorgu.ara === undefined || sorgu.ara === '' ? null : sorgu.ara) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/kalite-merkezi/studyo/resimler/al',
    yetki: 'kalite-merkezi.onayla',
    tekrarKorumali: true,
    govde: kmResimEkleGovdesi,
    cevap: kmResimCevabi,
    isle: async ({ db, kullanici, govde }) => ({ resim: await studyo.resimMerkezdenEkle(db, kullanici.id, govde) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/kalite-merkezi/studyo/resimler/:resimId/kaldir',
    yetki: 'kalite-merkezi.onayla',
    tekrarKorumali: true,
    parametre: kmStudyoResimParametresi,
    govde: kmSurumGovdesi,
    cevap: kmResimCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ resim: await studyo.resimKaldir(db, kullanici.id, parametre.resimId, govde.surum) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/kalite-merkezi/studyo/resimler/:resimId/balonlar',
    yetki: 'kalite-merkezi.onayla',
    tekrarKorumali: true,
    parametre: kmStudyoResimParametresi,
    govde: kmBalonlarGovdesi,
    cevap: kmResimCevabi,
    isle: async ({ db, kullanici, parametre, govde }) =>
      ({ resim: await studyo.balonPlaniYaz(db, kullanici.id, parametre.resimId, govde.surum, govde.balonlar) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/kalite-merkezi/studyo/parcalar/:malzemeNo/numune-planlari/:opNo',
    yetki: 'kalite-merkezi.onayla',
    tekrarKorumali: true,
    parametre: kmStudyoPlanParametresi,
    govde: kmNumunePlaniGovdesi,
    cevap: kmNumunePlaniCevabi,
    isle: async ({ db, kullanici, parametre, govde }) =>
      ({ plan: await studyo.numunePlaniYaz(db, kullanici.id, parametre.malzemeNo, parametre.opNo, govde.surum, govde.kurallar) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/kalite-merkezi/studyo/numuneler/iste',
    yetki: 'kalite-merkezi.yaz',
    // Her çağrı yeni numune açar: cevabı kaybolan isteğin yinelemesi ikinci numune açmasın.
    tekrarKorumali: true,
    govde: kmNumuneIsteGovdesi,
    cevap: kmNumuneCevabi,
    isle: async ({ db, kullanici, govde }) => ({ numune: await studyo.numuneIste(db, kullanici.id, govde) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/kalite-merkezi/studyo/olcumler/yaz',
    yetki: 'kalite-merkezi.yaz',
    tekrarKorumali: true,
    govde: kmOlcumGovdesi,
    cevap: kmOlcumlerCevabi,
    isle: async ({ db, kullanici, govde }) => ({ olcumler: await studyo.olcumYaz(db, kullanici.id, 'kalite', govde) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/kalite-merkezi/studyo/numuneler/:numuneId/karar',
    // Numune kararı kalite onayıdır (600 a): ilk parça kararıyla aynı yetki.
    yetki: 'kalite-merkezi.onayla',
    tekrarKorumali: true,
    parametre: kmStudyoNumuneParametresi,
    govde: kmNumuneKarariGovdesi,
    cevap: kmNumuneCevabi,
    isle: async ({ db, kullanici, parametre, govde }) =>
      ({ numune: await studyo.numuneKarari(db, kullanici.id, parametre.numuneId, govde.karar, govde.not ?? null) }),
  }),
];
