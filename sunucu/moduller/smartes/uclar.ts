import { uc } from '#cekirdek/uc.ts';
import { ikinciMenuSayacSemasi } from '#paylasilan/ikinci-menu.ts';
import {
  alarmlarCevabi, durumCevabi, duruslarCevabi, eslemeAtaGovdesi, eslemeCevabi, eslemeKaldirGovdesi, eslemelerCevabi, eslemeSorgusu, gidenCevabi,
  isEmriDurumlariCevabi, sayfaSorgusu, smartesHazirlikCevabi, smartesKontrolCevabi,
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
    yol: '/smartes/giden',
    yetki: { biri: ['sayfa.smartes'] },
    sorgu: sayfaSorgusu,
    cevap: gidenCevabi,
    isle: ({ db, sorgu }) => servis.giden(db, sorgu),
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
