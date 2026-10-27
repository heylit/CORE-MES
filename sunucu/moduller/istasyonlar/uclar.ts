import { uc } from '#cekirdek/uc.ts';
import {
  atamaGovdesi, atamaKaldirGovdesi, bosCevap, ekipGovdesi, ekipGuncellemeGovdesi, ekipKaydiSemasi, ekipUyeSorgusu, ekipUyeleriCevabi,
  ekiplerCevabi, iptalOnizlemeSorgusu, iptalOnizlemesiCevabi, idKisiParametresi, isMerkeziGovdesi, isMerkeziGuncellemeGovdesi, isMerkeziKaydiSemasi, isMerkezleriCevabi, istasyonGovdesi,
  istasyonGuncellemeGovdesi, istasyonKaydiSemasi, istasyonKisiSorgusu, istasyonKisileriCevabi, istasyonSecimiCevabi, istasyonlarCevabi, kimlikParametresi,
  kisiIsMerkezleriCevabi, kisiIsMerkezleriGovdesi, kisiParametresi, kisiSecenekleriCevabi, makineGovdesi, makineGuncellemeGovdesi,
  makineKaydiSemasi, makineKisiSorgusu, makineKisileriCevabi, makineSorgusu, makinelerCevabi, operasyonTipiGovdesi, operasyonTipiGuncellemeGovdesi, operasyonTipiKaydiSemasi,
  operasyonTipleriCevabi, panoOzetiCevabi, pasifSorgusu, kisiYetkinligiCevabi, makineDurumlariCevabi, makineDurumuGovdesi, planAyarlariCevabi, planAyariGovdesi,
  yetkinlikAyrintiGovdesi, yetkinlikGecmisiCevabi, yetkinlikGovdesi, yetkinlikParametresi, yetkinliklerCevabi, istasyonCokluEkleGovdesi, istasyonTopluTasiGovdesi, makineCokluEkleGovdesi, makineTopluDurumGovdesi,
  makineTopluTasiGovdesi, topluAktiflikGovdesi, yetkinlikTopluGovdesi, makineYetkinlikGovdesi, tezgahSiniriGovdesi,
} from '#paylasilan/sozlesme/istasyonlar.ts';
import { aramaUclari } from './arama/uclar.ts';
import * as servis from './servis.ts';
import { MAKINE_DURUMU_ISLEMLERI } from './kurallar.ts';

// Tanım listeleri tesis sayfasının verisidir; yazan rol de yazdığını okur (kişi kısıtları sayfası iş merkezlerini listeler).
const OKUMA = { biri: ['sayfa.istasyonlar', 'istasyonlar.yaz'] } as const;
// Reçete ve Rota yalnız gösterdiği iş merkezi, istasyon ve makine listesini okur (195 a); öteki tanım listeleri açılmaz.
const LISTE_OKUMA = { biri: ['sayfa.istasyonlar', 'istasyonlar.yaz', 'sayfa.recete-rota'] } as const;
// Fabrika Haritası makine durumunu çizer (195 a).
const DURUM_OKUMA = { biri: ['sayfa.istasyonlar', 'istasyonlar.yaz', 'sayfa.atolye'] } as const;
// Rota > Kaynaklar istasyonun verim ve operatör ayarını gösterir: sayfayı açan rol okur (kart #746, 757 a; 195 a'nın bu uç için yerine).
const PLAN_AYARI_OKUMA = { biri: [...OKUMA.biri, 'sayfa.rota'] } as const;
// Ana sayfa kartı yalnız sayı alır (#483); operatör terminalden, vardiya ve personel sayfası olan da görür.
// Duran makine bakımın işidir; Arkon bakım işlemiyle de okunur.
const MAKINE_DURUMU = { biri: MAKINE_DURUMU_ISLEMLERI } as const;
const PANO = { biri: ['sayfa.istasyonlar', 'istasyonlar.yaz', 'sayfa.terminal', 'sayfa.vardiya', 'sayfa.personel', 'arkon.bakim'] } as const;

export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/is-merkezleri',
    yetki: LISTE_OKUMA,
    sorgu: pasifSorgusu,
    cevap: isMerkezleriCevabi,
    isle: async ({ db, sorgu }) => ({ isMerkezleri: await servis.isMerkezleri(db, sorgu.pasifler) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/istasyonlar',
    yetki: LISTE_OKUMA,
    sorgu: pasifSorgusu,
    cevap: istasyonlarCevabi,
    isle: async ({ db, sorgu }) => ({ istasyonlar: await servis.istasyonKayitlari(db, sorgu.pasifler) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/istasyonlar/secim',
    // Seçim her ekranda gerekir (terminal, emir açma); kişinin kısıtını servis uygular.
    yetki: 'oturum',
    cevap: istasyonSecimiCevabi,
    isle: async ({ db, kullanici }) => ({ gruplar: await servis.istasyonSecimi(db, kullanici) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/makineler',
    yetki: LISTE_OKUMA,
    sorgu: makineSorgusu,
    cevap: makinelerCevabi,
    isle: async ({ db, sorgu }) => ({
      makineler: await servis.makineler(db, { pasiflerDahil: sorgu.pasifler, istasyonId: sorgu.istasyonId ?? null }),
    }),
  }),
  uc({
    yontem: 'GET',
    yol: '/operasyon-tipleri',
    yetki: OKUMA,
    sorgu: pasifSorgusu,
    cevap: operasyonTipleriCevabi,
    isle: async ({ db, sorgu }) => ({ operasyonTipleri: await servis.operasyonTipiKayitlari(db, sorgu.pasifler) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/kisi-is-merkezleri/:kisiId',
    // Kişi kendi kısıtını okur; başkasınınkini yalnız tesisi yöneten ya da amir. Ayrımı servis yapar.
    yetki: 'oturum',
    parametre: kisiParametresi,
    cevap: kisiIsMerkezleriCevabi,
    isle: async ({ db, kullanici, parametre }) => ({
      isMerkeziIdleri: await servis.kisiIsMerkezleri(db, kullanici, parametre.kisiId),
    }),
  }),
  uc({
    yontem: 'GET',
    yol: '/istasyon-kisileri',
    yetki: OKUMA,
    sorgu: istasyonKisiSorgusu,
    cevap: istasyonKisileriCevabi,
    isle: async ({ db, sorgu }) => ({
      kisiler: (await servis.atamalar(db, 'istasyon', { hedefId: sorgu.istasyonId ?? null, kisiId: null, tarih: sorgu.tarih }))
        .map(({ hedefId, ...a }) => ({ istasyonId: hedefId, ...a })),
    }),
  }),
  uc({
    yontem: 'GET',
    yol: '/makine-kisileri',
    yetki: OKUMA,
    sorgu: makineKisiSorgusu,
    cevap: makineKisileriCevabi,
    isle: async ({ db, sorgu }) => ({
      kisiler: (await servis.atamalar(db, 'makine', { hedefId: sorgu.makineId ?? null, kisiId: null, tarih: sorgu.tarih }))
        .map(({ hedefId, ...a }) => ({ makineId: hedefId, ...a })),
    }),
  }),
  uc({
    yontem: 'GET',
    yol: '/ekipler',
    yetki: OKUMA,
    sorgu: pasifSorgusu,
    cevap: ekiplerCevabi,
    isle: async ({ db, sorgu }) => ({ ekipler: await servis.ekipler(db, sorgu.pasifler) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/ekip-uyeleri',
    yetki: OKUMA,
    sorgu: ekipUyeSorgusu,
    cevap: ekipUyeleriCevabi,
    isle: async ({ db, sorgu }) => ({
      kisiler: (await servis.atamalar(db, 'ekip', { hedefId: sorgu.ekipId ?? null, kisiId: null, tarih: sorgu.tarih }))
        .map(({ hedefId, ...a }) => ({ ekipId: hedefId, ...a })),
    }),
  }),
  uc({
    yontem: 'GET',
    yol: '/atama-iptalleri',
    // Çıkarma onayından önce gösterilir; yalnız çıkarabilen okur.
    yetki: 'istasyonlar.yaz',
    sorgu: iptalOnizlemeSorgusu,
    cevap: iptalOnizlemesiCevabi,
    isle: async ({ db, sorgu }) => ({ satirlar: await servis.iptalOnizlemesi(db, sorgu.tur, sorgu) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/kisi-secenekleri',
    // Bütün kişilerin adı döner, bu yüzden yalnız atama yapabilene açık; atama listeleri yalnız atanmışların adını verir.
    yetki: 'istasyonlar.yaz',
    cevap: kisiSecenekleriCevabi,
    isle: async ({ db }) => ({ kisiler: await servis.kisiSecenekleri(db) }),
  }),

  uc({
    yontem: 'POST',
    yol: '/is-merkezleri',
    yetki: 'istasyonlar.yaz',
    govde: isMerkeziGovdesi,
    cevap: isMerkeziKaydiSemasi,
    isle: ({ db, govde }) => servis.isMerkeziEkle(db, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/is-merkezleri/:id/guncelle',
    yetki: 'istasyonlar.yaz',
    parametre: kimlikParametresi,
    govde: isMerkeziGuncellemeGovdesi,
    cevap: isMerkeziKaydiSemasi,
    isle: ({ db, parametre, govde }) => servis.isMerkeziGuncelle(db, parametre.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/is-merkezleri/:id/sil',
    yetki: 'istasyonlar.yaz',
    parametre: kimlikParametresi,
    cevap: bosCevap,
    isle: async ({ db, parametre }) => {
      await servis.isMerkeziSil(db, parametre.id);
      return undefined;
    },
  }),

  uc({
    yontem: 'POST',
    yol: '/istasyonlar',
    yetki: 'istasyonlar.yaz',
    govde: istasyonGovdesi,
    cevap: istasyonKaydiSemasi,
    isle: ({ db, govde }) => servis.istasyonEkle(db, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/istasyonlar/:id/guncelle',
    yetki: 'istasyonlar.yaz',
    parametre: kimlikParametresi,
    govde: istasyonGuncellemeGovdesi,
    cevap: istasyonKaydiSemasi,
    isle: ({ db, parametre, govde }) => servis.istasyonGuncelle(db, parametre.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/istasyonlar/:id/sil',
    yetki: 'istasyonlar.yaz',
    parametre: kimlikParametresi,
    cevap: bosCevap,
    isle: async ({ db, parametre }) => {
      await servis.istasyonSil(db, parametre.id);
      return undefined;
    },
  }),

  uc({
    yontem: 'POST',
    yol: '/makineler',
    yetki: 'istasyonlar.yaz',
    govde: makineGovdesi,
    cevap: makineKaydiSemasi,
    isle: ({ db, govde }) => servis.makineEkle(db, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/makineler/:id/guncelle',
    yetki: 'istasyonlar.yaz',
    parametre: kimlikParametresi,
    govde: makineGuncellemeGovdesi,
    cevap: makineKaydiSemasi,
    isle: ({ db, parametre, govde }) => servis.makineGuncelle(db, parametre.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/makineler/:id/sil',
    yetki: 'istasyonlar.yaz',
    parametre: kimlikParametresi,
    cevap: bosCevap,
    isle: async ({ db, parametre }) => {
      await servis.makineSil(db, parametre.id);
      return undefined;
    },
  }),

  // Silme ucu yok: tip kullanımdan pasife alınarak çıkar (kullanıcı kararı, 3. tur).
  uc({
    yontem: 'POST',
    yol: '/operasyon-tipleri',
    yetki: 'istasyonlar.yaz',
    govde: operasyonTipiGovdesi,
    cevap: operasyonTipiKaydiSemasi,
    isle: ({ db, govde }) => servis.operasyonTipiEkle(db, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/operasyon-tipleri/:id/guncelle',
    yetki: 'istasyonlar.yaz',
    parametre: kimlikParametresi,
    govde: operasyonTipiGuncellemeGovdesi,
    cevap: operasyonTipiKaydiSemasi,
    isle: ({ db, parametre, govde }) => servis.operasyonTipiGuncelle(db, parametre.id, govde),
  }),

  uc({
    yontem: 'POST',
    yol: '/istasyonlar/:id/kisiler/ata',
    yetki: 'istasyonlar.yaz',
    parametre: kimlikParametresi,
    govde: atamaGovdesi,
    cevap: istasyonKisileriCevabi,
    isle: async ({ db, parametre, govde }) => ({
      kisiler: (await servis.atamaYap(db, 'istasyon', parametre.id, govde)).map(({ hedefId, ...a }) => ({ istasyonId: hedefId, ...a })),
    }),
  }),
  uc({
    yontem: 'POST',
    yol: '/istasyonlar/:id/kisiler/:kisiId/cikar',
    yetki: 'istasyonlar.yaz',
    parametre: idKisiParametresi,
    govde: atamaKaldirGovdesi,
    cevap: istasyonKisileriCevabi,
    isle: async ({ db, parametre, govde }) => ({
      kisiler: (await servis.atamaKaldir(db, 'istasyon', parametre.id, parametre.kisiId, govde.baslangic))
        .map(({ hedefId, ...a }) => ({ istasyonId: hedefId, ...a })),
    }),
  }),
  uc({
    yontem: 'POST',
    yol: '/makineler/:id/kisiler/ata',
    yetki: 'istasyonlar.yaz',
    parametre: kimlikParametresi,
    govde: atamaGovdesi,
    cevap: makineKisileriCevabi,
    isle: async ({ db, parametre, govde }) => ({
      kisiler: (await servis.atamaYap(db, 'makine', parametre.id, govde)).map(({ hedefId, ...a }) => ({ makineId: hedefId, ...a })),
    }),
  }),
  uc({
    yontem: 'POST',
    yol: '/makineler/:id/kisiler/:kisiId/cikar',
    yetki: 'istasyonlar.yaz',
    parametre: idKisiParametresi,
    govde: atamaKaldirGovdesi,
    cevap: makineKisileriCevabi,
    isle: async ({ db, parametre, govde }) => ({
      kisiler: (await servis.atamaKaldir(db, 'makine', parametre.id, parametre.kisiId, govde.baslangic))
        .map(({ hedefId, ...a }) => ({ makineId: hedefId, ...a })),
    }),
  }),
  uc({
    yontem: 'POST',
    yol: '/ekipler',
    yetki: 'istasyonlar.yaz',
    govde: ekipGovdesi,
    cevap: ekipKaydiSemasi,
    isle: ({ db, govde }) => servis.ekipEkle(db, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/ekipler/:id/guncelle',
    yetki: 'istasyonlar.yaz',
    parametre: kimlikParametresi,
    govde: ekipGuncellemeGovdesi,
    cevap: ekipKaydiSemasi,
    isle: ({ db, parametre, govde }) => servis.ekipGuncelle(db, parametre.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/ekipler/:id/uyeler/ata',
    yetki: 'istasyonlar.yaz',
    parametre: kimlikParametresi,
    govde: atamaGovdesi,
    cevap: ekipUyeleriCevabi,
    isle: async ({ db, parametre, govde }) => ({
      kisiler: (await servis.atamaYap(db, 'ekip', parametre.id, govde)).map(({ hedefId, ...a }) => ({ ekipId: hedefId, ...a })),
    }),
  }),
  uc({
    yontem: 'POST',
    yol: '/ekipler/:id/uyeler/:kisiId/cikar',
    yetki: 'istasyonlar.yaz',
    parametre: idKisiParametresi,
    govde: atamaKaldirGovdesi,
    cevap: ekipUyeleriCevabi,
    isle: async ({ db, parametre, govde }) => ({
      kisiler: (await servis.atamaKaldir(db, 'ekip', parametre.id, parametre.kisiId, govde.baslangic))
        .map(({ hedefId, ...a }) => ({ ekipId: hedefId, ...a })),
    }),
  }),
  uc({
    yontem: 'POST',
    yol: '/kisi-is-merkezleri/:kisiId/belirle',
    // Amir de başkasının sınırını değiştirir (karar 252 a); kendi sınırını servis reddeder.
    yetki: { biri: ['istasyonlar.yaz', 'arkon.amir'] },
    parametre: kisiParametresi,
    govde: kisiIsMerkezleriGovdesi,
    cevap: kisiIsMerkezleriCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({
      isMerkeziIdleri: await servis.kisiIsMerkezleriBelirle(db, kullanici, parametre.kisiId, govde.isMerkeziIdleri),
    }),
  }),
  uc({
    yontem: 'GET',
    yol: '/istasyon-plan-ayarlari',
    yetki: PLAN_AYARI_OKUMA,
    cevap: planAyarlariCevabi,
    isle: async ({ db }) => ({ ayarlar: await servis.planAyarlari(db) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/istasyonlar/:id/plan-ayari',
    yetki: 'istasyonlar.yaz',
    parametre: kimlikParametresi,
    govde: planAyariGovdesi,
    cevap: planAyarlariCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ ayarlar: await servis.planAyariYaz(db, kullanici, parametre.id, govde) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/makine-durumlari',
    yetki: DURUM_OKUMA,
    cevap: makineDurumlariCevabi,
    isle: async ({ db }) => ({ durumlar: await servis.makineDurumlari(db) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/istasyonlar/pano-ozeti',
    yetki: PANO,
    cevap: panoOzetiCevabi,
    isle: async ({ db }) => servis.panoOzeti(db),
  }),
  uc({
    yontem: 'POST',
    yol: '/makineler/:id/durum',
    yetki: MAKINE_DURUMU,
    parametre: kimlikParametresi,
    govde: makineDurumuGovdesi,
    cevap: makineDurumlariCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ durumlar: await servis.makineDurumuYaz(db, kullanici, parametre.id, govde) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/kisi-yetkinlikleri',
    yetki: OKUMA,
    cevap: yetkinliklerCevabi,
    isle: async ({ db }) => ({ yetkinlikler: await servis.yetkinlikler(db) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/kisi-yetkinlikleri/:kisiId/belirle',
    yetki: 'istasyonlar.yaz',
    parametre: kisiParametresi,
    govde: yetkinlikGovdesi,
    cevap: kisiYetkinligiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.yetkinlikBelirle(db, kullanici.id, parametre.kisiId, govde.istasyonIdleri),
  }),
  // 565 a: matristen toplu aç ve kapat; tek kişi ucuyla aynı kural ve defter, tek transaction.
  uc({
    yontem: 'POST',
    yol: '/kisi-yetkinlikleri/toplu',
    yetki: 'istasyonlar.yaz',
    govde: yetkinlikTopluGovdesi,
    cevap: yetkinliklerCevabi,
    isle: async ({ db, kullanici, govde }) => ({ yetkinlikler: await servis.yetkinlikleriTopluBelirle(db, kullanici.id, govde.degisiklikler, govde.makineler) }),
  }),
  // 563 c: kişinin bakabildiği makineler (yalnız yetkin olduğu istasyonun makineleri).
  uc({
    yontem: 'POST',
    yol: '/kisi-yetkinlikleri/:kisiId/makineler/belirle',
    yetki: 'istasyonlar.yaz',
    parametre: kisiParametresi,
    govde: makineYetkinlikGovdesi,
    cevap: kisiYetkinligiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.makineYetkinlikBelirle(db, kullanici.id, parametre.kisiId, govde.makineIdleri),
  }),
  // 563 2 a: aynı anda en çok kaç tezgâh; boş sınırsız.
  uc({
    yontem: 'POST',
    yol: '/kisi-yetkinlikleri/:kisiId/tezgah-siniri',
    yetki: 'istasyonlar.yaz',
    parametre: kisiParametresi,
    govde: tezgahSiniriGovdesi,
    cevap: kisiYetkinligiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.tezgahSiniriBelirle(db, kullanici.id, parametre.kisiId, govde.enCok),
  }),
  // Karar 146 a (IS29): geçerlilik bitişi ve dayanak; okunan sürümle, deftere yazılır.
  uc({
    yontem: 'POST',
    yol: '/kisi-yetkinlikleri/:kisiId/istasyonlar/:istasyonId/ayrinti',
    yetki: 'istasyonlar.yaz',
    parametre: yetkinlikParametresi,
    govde: yetkinlikAyrintiGovdesi,
    cevap: kisiYetkinligiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.yetkinlikAyrintisiYaz(db, kullanici, parametre.kisiId, parametre.istasyonId, govde),
  }),
  uc({
    yontem: 'GET',
    yol: '/kisi-yetkinlikleri/:kisiId/gecmis',
    yetki: OKUMA,
    parametre: kisiParametresi,
    cevap: yetkinlikGecmisiCevabi,
    isle: ({ db, parametre }) => servis.yetkinlikGecmisi(db, parametre.kisiId),
  }),
  // Toplu işlem ve çoklu ekle (kart #1296, IS27): tek transaction, hepsi ya da hiçbiri; işlem tek kayıt uçlarınınkiyle aynıdır.
  uc({
    yontem: 'POST',
    yol: '/makineler/toplu-tasi',
    yetki: 'istasyonlar.yaz',
    govde: makineTopluTasiGovdesi,
    cevap: makinelerCevabi,
    isle: async ({ db, govde }) => ({ makineler: await servis.makineleriTasi(db, govde) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/makineler/toplu-aktiflik',
    yetki: 'istasyonlar.yaz',
    govde: topluAktiflikGovdesi,
    cevap: makinelerCevabi,
    isle: async ({ db, govde }) => ({ makineler: await servis.makineleriEtkinlestir(db, govde) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/makineler/toplu-durum',
    yetki: MAKINE_DURUMU,
    govde: makineTopluDurumGovdesi,
    cevap: makineDurumlariCevabi,
    isle: async ({ db, kullanici, govde }) => ({ durumlar: await servis.makineDurumlariniYaz(db, kullanici, govde) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/makineler/coklu-ekle',
    yetki: 'istasyonlar.yaz',
    govde: makineCokluEkleGovdesi,
    cevap: makinelerCevabi,
    isle: async ({ db, govde }) => ({ makineler: await servis.makineleriEkle(db, govde) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/istasyonlar/toplu-tasi',
    yetki: 'istasyonlar.yaz',
    govde: istasyonTopluTasiGovdesi,
    cevap: istasyonlarCevabi,
    isle: async ({ db, govde }) => ({ istasyonlar: await servis.istasyonlariTasi(db, govde) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/istasyonlar/toplu-aktiflik',
    yetki: 'istasyonlar.yaz',
    govde: topluAktiflikGovdesi,
    cevap: istasyonlarCevabi,
    isle: async ({ db, govde }) => ({ istasyonlar: await servis.istasyonlariEtkinlestir(db, govde) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/istasyonlar/coklu-ekle',
    yetki: 'istasyonlar.yaz',
    govde: istasyonCokluEkleGovdesi,
    cevap: istasyonlarCevabi,
    isle: async ({ db, govde }) => ({ istasyonlar: await servis.istasyonlariEkle(db, govde) }),
  }),
  ...aramaUclari,
];
