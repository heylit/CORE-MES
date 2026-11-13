import { uc } from '#cekirdek/uc.ts';
import {
  atamaGovdesi, atamaKaldirGovdesi, bosCevap, ekipGovdesi, ekipGuncellemeGovdesi, ekipKaydiSemasi, ekipUyeSorgusu, ekipUyeleriCevabi,
  ekiplerCevabi, iptalOnizlemeSorgusu, iptalOnizlemesiCevabi, idKisiParametresi, isMerkeziGovdesi, isMerkeziGuncellemeGovdesi, isMerkeziKaydiSemasi, isMerkezleriCevabi, istasyonGovdesi,
  istasyonGuncellemeGovdesi, istasyonKaydiSemasi, istasyonKisiSorgusu, istasyonKisileriCevabi, istasyonSecimiCevabi, istasyonlarCevabi, kimlikParametresi,
  kisiIsMerkezleriCevabi, kisiIsMerkezleriGovdesi, kisiParametresi, kisiSecenekleriCevabi, makineGovdesi, makineGuncellemeGovdesi,
  makineKaydiSemasi, makineKisiSorgusu, makineKisileriCevabi, makineSorgusu, makinelerCevabi, operasyonTipiGovdesi, operasyonTipiGuncellemeGovdesi, operasyonTipiKaydiSemasi,
  operasyonTipleriCevabi, panoOzetiCevabi, pasifSorgusu, kisiYetkinligiCevabi, makineDurumlariCevabi, makineDurumuGovdesi, planAyarlariCevabi, planAyariGovdesi,
  yetkinlikAyrintiGovdesi, yetkinlikGecmisiCevabi, yetkinlikGovdesi, yetkinlikParametresi, yetkinliklerCevabi, istasyonCokluEkleGovdesi, istasyonTopluKaydetGovdesi, istasyonTopluTasiGovdesi, topluKaydetCevabi, makineCokluEkleGovdesi, makineTopluDurumGovdesi,
  ayarYetkinligiBelirleGovdesi, ayarYetkinligiParametresi, makineTopluTasiGovdesi, topluAktiflikGovdesi, yetkinlikTopluGovdesi, makineYetkinlikGovdesi, tezgahSiniriGovdesi,
  aparatKapasiteleriCevabi, aparatKapasitesi, tesisSablonuSonucu, aparatKapasitesiGovdesi, aparatKapasitesiGuncellemeGovdesi, aparatKapasitesiSilmeGovdesi,
} from '#paylasilan/sozlesme/istasyonlar.ts';
import { aramaUclari } from './arama/uclar.ts';
import * as servis from './servis.ts';
import { ISTASYON_KISI_SECEN_ISLEMLER, ISTASYON_YAZMA_ISLEMLERI } from '#paylasilan/islemler.ts';
import { MAKINE_DURUMU_ISLEMLERI } from './kurallar.ts';

// Tanım listeleri tesis sayfasının verisidir; yazan da yazdığını okur (kişi kısıtları sayfası iş merkezlerini listeler).
const OKUMA = { biri: ['sayfa.istasyonlar', ...ISTASYON_YAZMA_ISLEMLERI] } as const;
// Reçete ve Rota yalnız gösterdiği iş merkezi, istasyon ve makine listesini okur (195 a); öteki tanım listeleri açılmaz.
const LISTE_OKUMA = { biri: [...OKUMA.biri, 'sayfa.recete-rota'] } as const;
// Fabrika Haritası makine durumunu çizer (195 a).
const DURUM_OKUMA = { biri: [...OKUMA.biri, 'sayfa.atolye'] } as const;
// Rota > Kaynaklar istasyonun verim ve operatör ayarını gösterir: sayfayı açan rol okur (kart #746, 757 a; 195 a'nın bu uç için yerine).
const PLAN_AYARI_OKUMA = { biri: [...OKUMA.biri, 'sayfa.rota'] } as const;
// Ana sayfa kartı yalnız sayı alır (#483); operatör terminalden, vardiya ve personel sayfası olan da görür.
// Duran makine bakımın işidir; Arkon bakım işlemiyle de okunur.
const MAKINE_DURUMU = { biri: MAKINE_DURUMU_ISLEMLERI } as const;
const PANO = { biri: [...OKUMA.biri, 'sayfa.terminal', 'sayfa.vardiya', 'sayfa.personel', 'arkon.bakim'] } as const;
// Bütün kişilerin adı döner: yalnız kişi seçen eylemlere açık.
const KISI_SECIMI = { biri: ISTASYON_KISI_SECEN_ISLEMLER } as const;
// Excel satırları üç kayıt türünü birlikte yazar; uç türlerden birini ister, satır türüne göre eksik eylemi servis reddeder.
const TOPLU_KAYDET = { biri: ['istasyonlar.is-merkezi-yaz', 'istasyonlar.istasyon-yaz', 'istasyonlar.makine-yaz'] } as const;

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
    yetki: 'istasyonlar.kisi-ata',
    sorgu: iptalOnizlemeSorgusu,
    cevap: iptalOnizlemesiCevabi,
    isle: async ({ db, sorgu }) => ({ satirlar: await servis.iptalOnizlemesi(db, sorgu.tur, sorgu) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/kisi-secenekleri',
    // Bütün kişilerin adı döner, bu yüzden yalnız atama yapabilene açık; atama listeleri yalnız atanmışların adını verir.
    yetki: KISI_SECIMI,
    cevap: kisiSecenekleriCevabi,
    isle: async ({ db }) => ({ kisiler: await servis.kisiSecenekleri(db) }),
  }),

  uc({
    yontem: 'POST',
    yol: '/is-merkezleri',
    yetki: 'istasyonlar.is-merkezi-yaz',
    govde: isMerkeziGovdesi,
    cevap: isMerkeziKaydiSemasi,
    isle: ({ db, govde }) => servis.isMerkeziEkle(db, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/is-merkezleri/:id/guncelle',
    yetki: 'istasyonlar.is-merkezi-yaz',
    parametre: kimlikParametresi,
    govde: isMerkeziGuncellemeGovdesi,
    cevap: isMerkeziKaydiSemasi,
    isle: ({ db, parametre, govde }) => servis.isMerkeziGuncelle(db, parametre.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/is-merkezleri/:id/sil',
    yetki: 'istasyonlar.is-merkezi-yaz',
    parametre: kimlikParametresi,
    cevap: bosCevap,
    isle: async ({ db, parametre }) => {
      await servis.isMerkeziSil(db, parametre.id);
      return undefined;
    },
  }),
  uc({
    yontem: 'POST',
    yol: '/tesis-sablonu/uygula',
    // 2166-1 a: eksik iş merkezi ve istasyonları açar; var olan kayda dokunmaz, ikinci çağrı bir şey açmaz.
    // Şablon iş merkezi ve istasyon da açar: servis o iki eylemi de ister.
    yetki: 'istasyonlar.tanim-yaz',
    cevap: tesisSablonuSonucu,
    isle: ({ db, kullanici }) => servis.tesisSablonunuUygula(db, kullanici),
  }),

  uc({
    yontem: 'POST',
    yol: '/istasyonlar',
    yetki: 'istasyonlar.istasyon-yaz',
    govde: istasyonGovdesi,
    cevap: istasyonKaydiSemasi,
    isle: ({ db, govde }) => servis.istasyonEkle(db, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/istasyonlar/:id/guncelle',
    yetki: 'istasyonlar.istasyon-yaz',
    parametre: kimlikParametresi,
    govde: istasyonGuncellemeGovdesi,
    cevap: istasyonKaydiSemasi,
    isle: ({ db, parametre, govde }) => servis.istasyonGuncelle(db, parametre.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/istasyonlar/:id/sil',
    yetki: 'istasyonlar.istasyon-yaz',
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
    yetki: 'istasyonlar.makine-yaz',
    govde: makineGovdesi,
    cevap: makineKaydiSemasi,
    isle: ({ db, govde }) => servis.makineEkle(db, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/makineler/:id/guncelle',
    yetki: 'istasyonlar.makine-yaz',
    parametre: kimlikParametresi,
    govde: makineGuncellemeGovdesi,
    cevap: makineKaydiSemasi,
    isle: ({ db, parametre, govde }) => servis.makineGuncelle(db, parametre.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/makineler/:id/sil',
    yetki: 'istasyonlar.makine-yaz',
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
    yetki: 'istasyonlar.tanim-yaz',
    govde: operasyonTipiGovdesi,
    cevap: operasyonTipiKaydiSemasi,
    isle: ({ db, govde }) => servis.operasyonTipiEkle(db, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/operasyon-tipleri/:id/guncelle',
    yetki: 'istasyonlar.tanim-yaz',
    parametre: kimlikParametresi,
    govde: operasyonTipiGuncellemeGovdesi,
    cevap: operasyonTipiKaydiSemasi,
    isle: ({ db, parametre, govde }) => servis.operasyonTipiGuncelle(db, parametre.id, govde),
  }),

  uc({
    yontem: 'POST',
    yol: '/istasyonlar/:id/kisiler/ata',
    yetki: 'istasyonlar.kisi-ata',
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
    yetki: 'istasyonlar.kisi-ata',
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
    yetki: 'istasyonlar.kisi-ata',
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
    yetki: 'istasyonlar.kisi-ata',
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
    yetki: 'istasyonlar.ekip-yaz',
    govde: ekipGovdesi,
    cevap: ekipKaydiSemasi,
    isle: ({ db, govde }) => servis.ekipEkle(db, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/ekipler/:id/guncelle',
    yetki: 'istasyonlar.ekip-yaz',
    parametre: kimlikParametresi,
    govde: ekipGuncellemeGovdesi,
    cevap: ekipKaydiSemasi,
    isle: ({ db, parametre, govde }) => servis.ekipGuncelle(db, parametre.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/ekipler/:id/uyeler/ata',
    yetki: 'istasyonlar.ekip-yaz',
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
    yetki: 'istasyonlar.ekip-yaz',
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
    yetki: { biri: ['istasyonlar.kisi-ata', 'arkon.amir'] },
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
    yetki: 'istasyonlar.istasyon-yaz',
    parametre: kimlikParametresi,
    govde: planAyariGovdesi,
    cevap: planAyarlariCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ ayarlar: await servis.planAyariYaz(db, kullanici, parametre.id, govde) }),
  }),
  // 2112 (2099-1 a): aparat plan kapasitesi. Okuma tanım listeleri gibi; Reçete ve Rota ile plan bağlamada (A8) ayrıca açılır.
  uc({
    yontem: 'GET',
    yol: '/istasyonlar/aparat-kapasiteleri',
    yetki: OKUMA,
    cevap: aparatKapasiteleriCevabi,
    isle: async ({ db }) => ({ kapasiteler: await servis.aparatKapasiteleri(db) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/istasyonlar/aparat-kapasiteleri',
    yetki: 'istasyonlar.aparat-yaz',
    govde: aparatKapasitesiGovdesi,
    cevap: aparatKapasitesi,
    isle: async ({ db, kullanici, govde }) => servis.aparatKapasitesiEkle(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/istasyonlar/aparat-kapasiteleri/:id/guncelle',
    yetki: 'istasyonlar.aparat-yaz',
    parametre: kimlikParametresi,
    govde: aparatKapasitesiGuncellemeGovdesi,
    cevap: aparatKapasitesi,
    isle: async ({ db, kullanici, parametre, govde }) => servis.aparatKapasitesiGuncelle(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/istasyonlar/aparat-kapasiteleri/:id/sil',
    yetki: 'istasyonlar.aparat-yaz',
    parametre: kimlikParametresi,
    govde: aparatKapasitesiSilmeGovdesi,
    cevap: bosCevap,
    isle: async ({ db, parametre, govde }) => {
      await servis.aparatKapasitesiSil(db, parametre.id, govde.surum);
      return undefined;
    },
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
    yetki: 'istasyonlar.yetkinlik-yaz',
    parametre: kisiParametresi,
    govde: yetkinlikGovdesi,
    cevap: kisiYetkinligiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.yetkinlikBelirle(db, kullanici.id, parametre.kisiId, govde.istasyonIdleri),
  }),
  // 565 a: matristen toplu aç ve kapat; tek kişi ucuyla aynı kural ve defter, tek transaction.
  uc({
    yontem: 'POST',
    yol: '/kisi-yetkinlikleri/toplu',
    yetki: 'istasyonlar.yetkinlik-yaz',
    govde: yetkinlikTopluGovdesi,
    cevap: yetkinliklerCevabi,
    isle: async ({ db, kullanici, govde }) => ({ yetkinlikler: await servis.yetkinlikleriTopluBelirle(db, kullanici.id, govde.degisiklikler, govde.makineler) }),
  }),
  // 563 c: kişinin bakabildiği makineler (yalnız yetkin olduğu istasyonun makineleri).
  uc({
    yontem: 'POST',
    yol: '/kisi-yetkinlikleri/:kisiId/makineler/belirle',
    yetki: 'istasyonlar.yetkinlik-yaz',
    parametre: kisiParametresi,
    govde: makineYetkinlikGovdesi,
    cevap: kisiYetkinligiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.makineYetkinlikBelirle(db, kullanici.id, parametre.kisiId, govde.makineIdleri),
  }),
  // 1303 a: kişinin ayar yapabildiği makineler; istasyon seçilirse bütün aktif makineleri.
  uc({
    yontem: 'POST',
    yol: '/kisi-yetkinlikleri/:kisiId/ayar/belirle',
    yetki: 'istasyonlar.yetkinlik-yaz',
    parametre: kisiParametresi,
    govde: ayarYetkinligiBelirleGovdesi,
    cevap: kisiYetkinligiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.ayarYetkinligiBelirle(db, kullanici.id, parametre.kisiId, govde),
  }),
  // 1303 a: ayar yetkinliğinin geçerlilik bitişi ve dayanağı; okunan sürümle, deftere yazılır.
  uc({
    yontem: 'POST',
    yol: '/kisi-yetkinlikleri/:kisiId/ayar/:makineId/ayrinti',
    yetki: 'istasyonlar.yetkinlik-yaz',
    parametre: ayarYetkinligiParametresi,
    govde: yetkinlikAyrintiGovdesi,
    cevap: kisiYetkinligiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.ayarYetkinligiAyrintisiYaz(db, kullanici, parametre.kisiId, parametre.makineId, govde),
  }),
  // 563 2 a: aynı anda en çok kaç tezgâh; boş sınırsız.
  uc({
    yontem: 'POST',
    yol: '/kisi-yetkinlikleri/:kisiId/tezgah-siniri',
    yetki: 'istasyonlar.yetkinlik-yaz',
    parametre: kisiParametresi,
    govde: tezgahSiniriGovdesi,
    cevap: kisiYetkinligiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.tezgahSiniriBelirle(db, kullanici.id, parametre.kisiId, govde.enCok),
  }),
  // Karar 146 a (IS29): geçerlilik bitişi ve dayanak; okunan sürümle, deftere yazılır.
  uc({
    yontem: 'POST',
    yol: '/kisi-yetkinlikleri/:kisiId/istasyonlar/:istasyonId/ayrinti',
    yetki: 'istasyonlar.yetkinlik-yaz',
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
    yetki: 'istasyonlar.makine-yaz',
    govde: makineTopluTasiGovdesi,
    cevap: makinelerCevabi,
    isle: async ({ db, govde }) => ({ makineler: await servis.makineleriTasi(db, govde) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/makineler/toplu-aktiflik',
    yetki: 'istasyonlar.makine-yaz',
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
    yetki: 'istasyonlar.makine-yaz',
    govde: makineCokluEkleGovdesi,
    cevap: makinelerCevabi,
    isle: async ({ db, govde }) => ({ makineler: await servis.makineleriEkle(db, govde) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/istasyonlar/toplu-tasi',
    yetki: 'istasyonlar.istasyon-yaz',
    govde: istasyonTopluTasiGovdesi,
    cevap: istasyonlarCevabi,
    isle: async ({ db, govde }) => ({ istasyonlar: await servis.istasyonlariTasi(db, govde) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/istasyonlar/toplu-aktiflik',
    yetki: 'istasyonlar.istasyon-yaz',
    govde: topluAktiflikGovdesi,
    cevap: istasyonlarCevabi,
    isle: async ({ db, govde }) => ({ istasyonlar: await servis.istasyonlariEtkinlestir(db, govde) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/istasyonlar/coklu-ekle',
    yetki: 'istasyonlar.istasyon-yaz',
    govde: istasyonCokluEkleGovdesi,
    cevap: istasyonlarCevabi,
    isle: async ({ db, govde }) => ({ istasyonlar: await servis.istasyonlariEkle(db, govde) }),
  }),
  // Toplu kaydet (2627): Excel'den toplu giriş. Tek transaction; dosya başına tek istek kimliği, yinelenen istek ilk cevabı alır.
  uc({
    yontem: 'POST',
    yol: '/istasyonlar/toplu-kaydet',
    yetki: TOPLU_KAYDET,
    tekrarKorumali: true,
    govde: istasyonTopluKaydetGovdesi,
    cevap: topluKaydetCevabi,
    isle: ({ db, kullanici, govde }) => servis.topluKaydet(db, kullanici, govde),
  }),
  ...aramaUclari,
];
