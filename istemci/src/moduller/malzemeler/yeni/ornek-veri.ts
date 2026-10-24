import type { KatalogAyarlariCevabi, KatalogKartlariCevabi, KatalogSablonlariCevabi } from '#paylasilan/sozlesme/malzemeler.ts';

// Uydurma örnek veri: gerçek firma, parça ya da kişi yoktur.
export const ORNEK_AYAR: KatalogAyarlariCevabi = {
  surumler: { malzeme: 3, operasyonlar: null, genel: 2 },
  malzeme: { surum: 1, favoriler: ['metal|islah|C45'] },
  operasyonlar: null,
  operasyonTipleri: [
    { kod: 'TOR', ad: 'Tornalama', grup: 'TALAS', grupAdi: 'Talaşlı imalat', aktif: true },
    { kod: 'FAS', ad: 'Fason ısıl işlem', grup: 'FAS', grupAdi: 'Fason', aktif: true },
  ],
  genel: { kodYapisi: 'standart', acUzunluk: 40 },
  dortGoz: false,
  rol: 'yonetici',
  ayarYazabilir: true,
};

export const ornekKayit = (id: string, kod: string, ad: string, tur = 'hammadde'): Record<string, unknown> => ({
  id, tur, g: {}, bom: [], ops: [], fam: 'metal', cls: 'islah', grade: 'C45', custom: { ad: '', kod: '', std: '', eq: '', p: {} }, stds: [], form: 'cubuk',
  dims: { d: 50, l: 1000 }, tol: '', opts: {}, ov: {}, extra: [], com: { kod, ad, std: '', ted: '', birim: 'ADET', sertifika: [], not: '' },
  kodManual: false, adManual: false, onay: { durum: 'aktif' },
});

export const ORNEK_KARTLAR: KatalogKartlariCevabi = {
  satirlar: [
    { kimlik: 'mornek1', no: 1, kayit: ornekKayit('mornek1', 'HM-MET-C45-0001', 'Örnek çubuk C45 Ø50'), surum: 4 },
    { kimlik: 'mornek2', no: 2, kayit: ornekKayit('mornek2', 'SF-GEN-00001', 'Örnek sarf', 'sarf'), surum: 1 },
    { kimlik: 'mornek3', no: 3, kayit: null, surum: 2 },
  ],
  toplam: 3, sayfa: 1, sayfaBoyu: 200, an: '2026-10-23T10:00:00.000Z',
};

export const ORNEK_SABLONLAR: KatalogSablonlariCevabi = {
  sablonlar: [{ id: 'sornek1', ad: 'Örnek şablon', tur: 'hammadde' }],
  surumler: { sornek1: 5 },
  kaldirabilir: ['sornek1'],
};
