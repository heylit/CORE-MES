import type { Oge, TalepKalemi } from './okuma.ts';

// Uydurma ORN- teklif; sayfa öğeleri pdf.js metin katmanı biçiminde (x, y taban çizgisi, h yükseklik).
export const H = 10;
export const oge = (x: number, y: number, s: string): Oge => ({ s, x, y, w: s.length * 5, h: H });
export const satir = (y: number, hucre: [number, string][]): Oge[] => hucre.map(([x, s]) => oge(x, y, s));
export const SAYFA: Oge[] = [
  ...satir(20, [[20, 'ORN-Ege Metal San. Tic.'], [400, 'FİYAT TEKLİFİ']]),
  ...satir(34, [[20, 'Vergi No: 0000000001'], [400, 'Teklif No: ORN-TK-2026-118']]),
  ...satir(48, [[400, 'Tarih: 17.11.2026']]),
  ...satir(70, [[20, 'Geçerlilik: 01.12.2026'], [240, 'Para birimi: EUR']]),
  ...satir(84, [[20, 'Ödeme: 60 gün vadeli']]),
  ...satir(110, [[20, '#'], [40, 'Malzeme'], [220, 'Miktar'], [270, 'Birim'], [310, 'B.Fiyat'], [370, 'Termin'], [430, 'Tutar']]),
  ...satir(126, [[20, '1'], [40, 'AL 6061-T6 Ø50 çubuk 3 m'], [222, '120'], [270, 'KG'], [312, '4,85'], [370, '14 gün'], [430, '582,00']]),
  ...satir(142, [[20, '2'], [40, 'C45 +C Ø30 mm'], [222, '80'], [270, 'KG'], [312, '1,92'], [370, '14 gün'], [430, '153,60']]),
  ...satir(158, [[20, '3'], [40, 'POM-C Ø80 (siyah)'], [222, '14,2'], [270, 'KG'], [312, '7,40'], [370, '21 gün'], [430, '105,08']]),
  ...satir(174, [[20, '4'], [40, '42CrMo4 ıslah Ø 60'], [222, '45'], [270, 'KG'], [312, '2,1O'], [370, '4 hafta'], [430, '94,50']]),
  ...satir(190, [[20, '5'], [40, 'Nakliye (Kocaeli teslim)'], [222, '1'], [270, 'SET'], [312, '45,00'], [430, '45,00']]),
  ...satir(214, [[300, 'Genel toplam (KDV hariç):'], [430, '1.016,18']]),
  ...satir(240, [[20, 'Fiyatlarımıza %3 iskonto uygulanmıştır.']]),
];
export const KALEMLER: TalepKalemi[] = [
  { id: 'k1', ad: 'ORN-6061 T6 Ø50 çekme çubuk', kod: null, miktar: 120, birim: 'kg', karsilik: null },
  { id: 'k2', ad: 'ORN-C45 Ø30 soğuk çekilmiş', kod: null, miktar: 80, birim: 'kg', karsilik: null },
  { id: 'k3', ad: 'ORN-POM-C Ø80 çubuk', kod: null, miktar: 6, birim: 'm', karsilik: '≈ 14,2 kg' },
  { id: 'k4', ad: 'ORN-42CrMo4 +QT Ø60', kod: null, miktar: 45, birim: 'kg', karsilik: null },
  { id: 'k5', ad: 'ORN-5083 H111 levha 10 mm', kod: null, miktar: 60, birim: 'kg', karsilik: null },
];
