import { ikiliCevap, uc } from '#cekirdek/uc.ts';
import type { Uc } from '#cekirdek/uc.ts';
import {
  kmBelgeParametresi, kmDegisiklikCevabi, kmDegisiklikSorgusu, kmDosyaBaglaGovdesi, kmDosyaCevabi, kmDosyaParametresi,
  kmGeriYukleCevabi, kmGeriYukleGovdesi, kmGecmisCevabi, kmIlkParcaBekleyenCevabi, kmIlkParcaCevabi, kmIlkParcaGovdesi, kmIlkParcaParametresi, kmKarantinaKonumlariCevabi, kmKarantinaPartileriCevabi, kmKimlikCevabi, kmOlcuAletleriCevabi, kmOnayGeriAlGovdesi, kmOnaylaCevabi, kmOnaylaGovdesi, kmOzetCevabi, kmSilGovdesi, kmSurumCevabi, kmTamamCevabi, kmYazGovdesi,
} from '#paylasilan/sozlesme/kalite-merkezi.ts';
import * as servis from './servis.ts';

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
    parametre: kmIlkParcaParametresi,
    govde: kmIlkParcaGovdesi,
    cevap: kmIlkParcaCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.ilkParcaKarari(db, kullanici.id, parametre.uretimEmriId, govde.karar),
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
];
