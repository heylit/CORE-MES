import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { aracGovdesi, isDurumuGovdesi, isGovdesi, noktaGovdesi } from '#paylasilan/sozlesme/sevkiyat.ts';
import { ornekFirmaNo } from '../musteri-tedarikci/disari.ts';
import type { OrnekFirmaAnahtari } from '../musteri-tedarikci/disari.ts';
import * as servis from './servis.ts';

// Adlar ORNEK önekiyle başlar (yüklü mü denetimi araca bakar); konumlar Ankara içinde uydurmadır.
const ARAC_ADI = 'ORNEK Kamyonet';
const NOKTALAR: readonly { firma: OrnekFirmaAnahtari; ad: string; enlem: number; boylam: number; adres: string }[] = [
  { firma: 'musteriA', ad: 'ORNEK Musteri A deposu', enlem: 39.9087, boylam: 32.8597, adres: 'Ornek Mah. 1. Sok. No: 1, Cankaya/Ankara' },
  { firma: 'musteriB', ad: 'ORNEK Musteri B deposu', enlem: 39.9682, boylam: 32.7801, adres: 'Ornek Mah. 2. Sok. No: 2, Yenimahalle/Ankara' },
];

export const ornekVeri = ornekVeriTanimi({
  modul: 'sevkiyat',
  // Sevk edilen Mil'in emri üretim emirleri örnek verisinde biter; sevk o hikâyenin devamıdır.
  gerekir: ['finans', 'uretim-emirleri'],
  yukluMu: async (db) => (await servis.araclariListele(db)).some((a) => a.ad.startsWith('ORNEK ')),
  yukle: async (db, b) => {
    await servis.aracEkle(db, aracGovdesi.parse({
      ad: ARAC_ADI, tur: 'kamyonet', plaka: null, kapasiteKilogram: 1500, kapasitePalet: 4, musaitBaslangic: '08:00', musaitBitis: '18:00',
      kilometreMaliyeti: null, saatMaliyeti: null, gunlukMaliyet: null,
    }));
    const noktalar: number[] = [];
    for (const n of NOKTALAR) {
      const firmaId = await ornekFirmaNo(db, n.firma);
      if (firmaId === null) throw new Error(`Sevkiyat örnek verisi örnek firmayı bulamadı: ${n.firma} (finans örnek verisi önce yüklenir).`);
      noktalar.push((await servis.noktaEkle(db, noktaGovdesi.parse({
        ad: n.ad, tur: 'musteri', enlem: n.enlem, boylam: n.boylam, adres: n.adres, durakSuresiDakika: 20, firmaId,
      }))).id);
    }
    // Plan onayı harita paketi ister; örnek veri pakete dayanmaz: biten Mil'in teslimatı havuzdan elle kapatılır.
    const is = await servis.isEkle(db, isGovdesi.parse({
      tarih: b.gun, tur: 'teslimat', alisNoktasiId: null, birakisNoktasiId: noktalar[0], agirlikKilogram: 160, paletSayisi: 1,
      durakSuresiDakika: null, alisEnErken: null, alisEnGec: null, birakisEnErken: null, birakisEnGec: null,
      belgeNo: 'ORN-IRS-0001', aciklama: 'Ornek Mil sevkiyati, 20 adet', sabitAracId: null,
    }));
    await servis.isDurumuDegistir(db, is.id, isDurumuGovdesi.parse({ durum: 'tamamlandi', tarih: b.gun, not: 'Ornek teslim' }));
  },
});
