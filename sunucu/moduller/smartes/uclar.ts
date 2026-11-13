import { cakisma } from '#cekirdek/hata.ts';
import { uc } from '#cekirdek/uc.ts';
import { ikinciMenuSayacSemasi } from '#paylasilan/ikinci-menu.ts';
import {
  alarmlarCevabi, canliMakineAyrintisiCevabi, canliMakineParametresi, canliMakinelerCevabi, durumCevabi, duruslarCevabi, eslemeAtaGovdesi, eslemeCevabi,
  eslemeKaldirGovdesi, eslemelerCevabi, eslemeSorgusu, gidenCevabi, isEmriDurumlariCevabi, makineBulgulariCevabi, sayfaSorgusu, smartesHazirlikCevabi,
  smartesKontrolCevabi, gelenAdEsleGovdesi, gelenAdKaldirGovdesi, gelenAdlarCevabi, gelenAdOnerileriOnaylaGovdesi, gelenAdSorgusu, listeOkuCevabi,
  onerileriOnaylaCevabi, onerileriOnaylaGovdesi, ambarHareketleriCevabi, fireHareketleriCevabi, gelenlerCevabi, hamKayitCevabi, hamKayitParametresi,
  kaliteOlcumleriCevabi,
} from '#paylasilan/sozlesme/smartes.ts';
import { ortamIstemcisi, ortamOzeti } from './baglanti.ts';
import * as servis from './servis.ts';

// Okuma uçları SmartES sayfasını görene açıktır; eşleme yazmak `smartes.esleme-yaz` ister (Aşama 1: yalnız yönetici).
export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/smartes/menu-sayaclari',
    yetki: 'oturum',
    cevap: ikinciMenuSayacSemasi,
    // Sayfayı göremeyene sayı verilmez: kabuk eksik anahtarda sayı göstermez.
    isle: async ({ db, kullanici }) => (kullanici.islemler.includes('sayfa.smartes') ? servis.menuSayaclari(db) : {}),
  }),
  uc({
    yontem: 'GET',
    yol: '/smartes/durum',
    yetki: { biri: ['sayfa.smartes'] },
    cevap: durumCevabi,
    isle: ({ db }) => servis.durum(db, ortamIstemcisi),
  }),
  uc({
    yontem: 'GET',
    yol: '/smartes/eslemeler',
    yetki: { biri: ['sayfa.smartes'] },
    sorgu: eslemeSorgusu,
    cevap: eslemelerCevabi,
    isle: ({ db, sorgu }) => servis.eslemeleriGetir(db, sorgu.tur),
  }),
  uc({
    yontem: 'POST',
    yol: '/smartes/eslemeler/ata',
    yetki: 'smartes.esleme-yaz',
    govde: eslemeAtaGovdesi,
    cevap: eslemeCevabi,
    isle: ({ db, kullanici, govde }) => servis.eslemeAta(db, kullanici.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/smartes/eslemeler/kaldir',
    yetki: 'smartes.esleme-yaz',
    govde: eslemeKaldirGovdesi,
    cevap: eslemeCevabi,
    isle: ({ db, govde }) => servis.eslemeKaldir(db, govde),
  }),
  // Öneri kişi onaylamadan yazılmaz: tek "Kabul" de toplu onay da bu uçtan geçer.
  uc({
    yontem: 'POST',
    yol: '/smartes/eslemeler/onerileri-onayla',
    yetki: 'smartes.esleme-yaz',
    govde: onerileriOnaylaGovdesi,
    cevap: onerileriOnaylaCevabi,
    isle: ({ db, kullanici, govde }) => servis.onerileriOnayla(db, kullanici.id, govde),
  }),
  // SmartES'in tanım listelerini yeniden okur ("Şimdi oku"). SmartES'e yalnız okuma gider; istek sürerken transaction açık kalmasın diye
  // transaction dışında koşar (yalnız GET koşabilir) ve yalnız bu modülün liste tablolarına yazar.
  uc({
    yontem: 'GET',
    yol: '/smartes/listeler/oku',
    yetki: 'smartes.esleme-yaz',
    txDisi: true,
    cevap: listeOkuCevabi,
    isle: async ({ db }) => {
      const r = await servis.listeTuru({ tx: (is) => is(db) }, { istemci: ortamIstemcisi, saat: () => new Date() }, { zorla: true });
      if (r.tur !== 'islendi') throw cakisma(servis.BEKLEME_NEDENLERI[r.tur]);
      return { okunan: r.okunan, hatali: r.hatali };
    },
  }),
  uc({
    yontem: 'GET',
    yol: '/smartes/gelen-adlar',
    yetki: { biri: ['sayfa.smartes'] },
    sorgu: gelenAdSorgusu,
    cevap: gelenAdlarCevabi,
    isle: ({ db, sorgu }) => servis.gelenAdlar(db, sorgu.tur),
  }),
  uc({
    yontem: 'POST',
    yol: '/smartes/gelen-adlar/esle',
    yetki: 'smartes.esleme-yaz',
    govde: gelenAdEsleGovdesi,
    cevap: gelenAdlarCevabi,
    isle: ({ db, kullanici, govde }) => servis.gelenAdEsle(db, kullanici.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/smartes/gelen-adlar/kaldir',
    yetki: 'smartes.esleme-yaz',
    govde: gelenAdKaldirGovdesi,
    cevap: gelenAdlarCevabi,
    isle: ({ db, govde }) => servis.gelenAdKaldir(db, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/smartes/gelen-adlar/onerileri-onayla',
    yetki: 'smartes.esleme-yaz',
    govde: gelenAdOnerileriOnaylaGovdesi,
    cevap: onerileriOnaylaCevabi,
    isle: ({ db, kullanici, govde }) => servis.gelenAdOnerileriniOnayla(db, kullanici.id, govde),
  }),
  uc({
    yontem: 'GET',
    yol: '/smartes/is-emri-durumlari',
    yetki: { biri: ['sayfa.smartes'] },
    sorgu: sayfaSorgusu,
    cevap: isEmriDurumlariCevabi,
    isle: ({ db, sorgu }) => servis.isEmriDurumlari(db, sorgu),
  }),
  uc({
    yontem: 'GET',
    yol: '/smartes/duruslar',
    yetki: { biri: ['sayfa.smartes'] },
    sorgu: sayfaSorgusu,
    cevap: duruslarCevabi,
    isle: ({ db, sorgu }) => servis.duruslar(db, sorgu),
  }),
  uc({
    yontem: 'GET',
    yol: '/smartes/alarmlar',
    yetki: { biri: ['sayfa.smartes'] },
    sorgu: sayfaSorgusu,
    cevap: alarmlarCevabi,
    isle: ({ db, sorgu }) => servis.alarmlar(db, sorgu),
  }),
  uc({
    yontem: 'GET',
    yol: '/smartes/fire',
    yetki: { biri: ['sayfa.smartes'] },
    sorgu: sayfaSorgusu,
    cevap: fireHareketleriCevabi,
    isle: ({ db, sorgu }) => servis.fireHareketleri(db, sorgu),
  }),
  uc({
    yontem: 'GET',
    yol: '/smartes/ambar',
    yetki: { biri: ['sayfa.smartes'] },
    sorgu: sayfaSorgusu,
    cevap: ambarHareketleriCevabi,
    isle: ({ db, sorgu }) => servis.ambarHareketleri(db, sorgu),
  }),
  uc({
    yontem: 'GET',
    yol: '/smartes/kalite',
    yetki: { biri: ['sayfa.smartes'] },
    sorgu: sayfaSorgusu,
    cevap: kaliteOlcumleriCevabi,
    isle: ({ db, sorgu }) => servis.kaliteOlcumleri(db, sorgu),
  }),
  uc({
    yontem: 'GET',
    yol: '/smartes/gelenler',
    yetki: { biri: ['sayfa.smartes'] },
    cevap: gelenlerCevabi,
    isle: ({ db }) => servis.gelenler(db, ortamIstemcisi),
  }),
  uc({
    yontem: 'GET',
    yol: '/smartes/ham/:tur/:id',
    yetki: { biri: ['sayfa.smartes'] },
    parametre: hamKayitParametresi,
    cevap: hamKayitCevabi,
    isle: ({ db, parametre }) => servis.hamKayit(db, parametre.tur, parametre.id),
  }),
  uc({
    yontem: 'GET',
    yol: '/smartes/giden',
    yetki: { biri: ['sayfa.smartes'] },
    sorgu: sayfaSorgusu,
    cevap: gidenCevabi,
    isle: ({ db, sorgu }) => servis.giden(db, sorgu),
  }),
  // Canlı makine panosu: yalnız saklanan son okumayı verir; SmartES'e istek atmaz.
  // 3192: makine verisiyle çalışanın girdiği karşılaştırılır; yalnız okur, bir şey düzeltmez.
  uc({
    yontem: 'GET',
    yol: '/smartes/makine-bulgulari',
    yetki: { biri: ['sayfa.smartes'] },
    cevap: makineBulgulariCevabi,
    isle: ({ db }) => servis.makineBulgulari(db, ortamIstemcisi),
  }),
  uc({
    yontem: 'GET',
    yol: '/smartes/makineler',
    yetki: { biri: ['sayfa.smartes'] },
    cevap: canliMakinelerCevabi,
    isle: ({ db }) => servis.canliMakineler(db, ortamIstemcisi),
  }),
  uc({
    yontem: 'GET',
    yol: '/smartes/makineler/:kod',
    yetki: { biri: ['sayfa.smartes'] },
    parametre: canliMakineParametresi,
    cevap: canliMakineAyrintisiCevabi,
    isle: ({ db, parametre }) => servis.canliMakineAyrintisi(db, parametre.kod),
  }),
  // Hazırlık ve canlı kontrol yalnız sistem ayrıntısını görene (yönetici): adres ve ayar durumu gösterilir.
  uc({
    yontem: 'GET',
    yol: '/smartes/hazirlik',
    yetki: 'saglik.ayrinti-oku',
    cevap: smartesHazirlikCevabi,
    isle: ({ db }) => servis.hazirlik(db, ortamIstemcisi, ortamOzeti),
  }),
  // SmartES'e yalnız okuma gider. Transaction dışında koşar: liste yeniden denemelerle dakikayı aşabilir, okuma transaction'ı açık kalmasın.
  uc({
    yontem: 'GET',
    yol: '/smartes/hazirlik/kontrol',
    yetki: 'saglik.ayrinti-oku',
    txDisi: true,
    cevap: smartesKontrolCevabi,
    isle: () => servis.kontrol(ortamIstemcisi),
  }),
];
