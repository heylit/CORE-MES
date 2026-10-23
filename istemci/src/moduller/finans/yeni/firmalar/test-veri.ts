import type { Firma } from '#paylasilan/sozlesme/musteri-tedarikci.ts';

// Firma kartı testlerinin uydurma kartı (musteri-tedarikci ayrıntı cevabı biçiminde).
export const ornekFirma = (o: Partial<Firma> = {}): Firma => ({
  id: 1, kod: 'M1', ad: 'Deneme Musteri', tur: 'musteri', fason: false, ulkeKodu: 'TR', vergiNo: null, vergiDairesi: null, paraBirimi: 'TRY', vadeGunu: 30,
  adres: null, ilce: null, il: null, postaKodu: null, enlem: null, boylam: null, telefon: null, ePosta: null, aktif: true, logoCariKodu: null,
  logoKayitNo: null, logoGonderimDurumu: null, musteriSinifi: null, olusturma: '2026-09-01T09:00:00.000Z', guncelleme: null, surum: 3, ...o,
});
