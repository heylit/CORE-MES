import { KOD_ONEKI } from '#paylasilan/kod-sozlugu.ts';
import type { Sablon, SablonTuru } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { SATIR_BASI, type AlanDegerleri } from './kurallar.ts';

// Hazır şablonlar kodda durur: kullanıcı şablonu gelince bunlar kopyalanıp değiştirilecek. Ölçüler mm.
// Alan "=" ile başlarsa sabit metindir. Konum kodu 20 karaktere kadar kesilmeden sığar (stok_konum_kod_bicimi, EM-13). Raf etiketi Fabrika Haritası rafından (#116). Bugünkü baskılarla aynı içerik: konum ve malzeme (stok/Etiketler.tsx),
// lot (stok/LotEtiketi.tsx), refakat kartı (stok/RefakatKarti.tsx).

export const ALANLAR: Record<SablonTuru, { anahtar: string; ad: string }[]> = {
  konum: [{ anahtar: 'qr', ad: 'QR (LOC)' }, { anahtar: 'kod', ad: 'Konum kodu' }, { anahtar: 'ad', ad: 'Konum adı' }, { anahtar: 'yer', ad: 'Salon ve kutu türü' }],
  raf: [{ anahtar: 'qr', ad: 'QR (RAF)' }, { anahtar: 'kod', ad: 'Raf kodu' }, { anahtar: 'ad', ad: 'Raf adı' }, { anahtar: 'yer', ad: 'Bölüm, bölme ve kat' }],
  malzeme: [{ anahtar: 'qr', ad: 'QR (MLZ)' }, { anahtar: 'ad', ad: 'Malzeme adı' }, { anahtar: 'kod', ad: 'Stok kodu' }, { anahtar: 'kart', ad: 'Kart no' }],
  lot: [
    { anahtar: 'qr', ad: 'QR (LOT)' }, { anahtar: 'lotNo', ad: 'Lot no' }, { anahtar: 'malzeme', ad: 'Malzeme' }, { anahtar: 'kart', ad: 'Kart ve tür' },
    { anahtar: 'parti', ad: 'Parti, döküm, sertifika' }, { anahtar: 'giris', ad: 'Giriş, miktar, belge' },
  ],
  refakat: [
    { anahtar: 'qr', ad: 'QR (UE ya da RP)' }, { anahtar: 'emirNo', ad: 'Emir no' }, { anahtar: 'urunAd', ad: 'Ürün adı' }, { anahtar: 'urunKod', ad: 'Parça no' },
    { anahtar: 'adetTermin', ad: 'Adet ve termin' }, { anahtar: 'parti', ad: 'Parti' }, { anahtar: 'basim', ad: 'Basım tarihi' },
    { anahtar: 'adimlar', ad: 'İşlem sırası' }, { anahtar: 'rota', ad: 'Rota (adım başına satır)' }, { anahtar: 'lot', ad: 'Lot, parti, döküm, sertifika' },
  ],
  istasyon: [{ anahtar: 'qr', ad: 'QR (LOC)' }, { anahtar: 'kod', ad: 'İstasyon kodu' }, { anahtar: 'ad', ad: 'İstasyon adı' }],
  'kalite-durum': [
    { anahtar: 'qr', ad: 'QR (LOT)' }, { anahtar: 'durum', ad: 'Kalite durumu' }, { anahtar: 'lotNo', ad: 'Lot no' }, { anahtar: 'malzeme', ad: 'Malzeme adı ve kodu' },
    { anahtar: 'miktar', ad: 'Miktar, birim ve konum' },
  ],
  'hatali-parca': [
    { anahtar: 'qr', ad: 'QR (UE, parçanın emri)' }, { anahtar: 'durum', ad: 'Durum (karar)' }, { anahtar: 'emirNo', ad: 'Emir no' }, { anahtar: 'parca', ad: 'Parça no ve adı' },
    { anahtar: 'islem', ad: 'İşlem no ve adı' }, { anahtar: 'adetNeden', ad: 'Adet ve hurda nedeni' }, { anahtar: 'ayiran', ad: 'Ayıran ve zaman' },
    { anahtar: 'karar', ad: 'Karar veren, zaman, NCR no, not' },
  ],
  deneme: [{ anahtar: 'qr', ad: 'QR' }, { anahtar: 'yazici', ad: 'Dil ve çözünürlük' }],
};

const qr = (x: number, y: number, boyut: number) => ({ tur: 'qr' as const, x, y, boyut, alan: 'qr' });
const metin = (x: number, y: number, genislik: number, yukseklik: number, yaziMm: number, alan: string, kalin = false) =>
  ({ tur: 'metin' as const, x, y, genislik, yukseklik, yaziMm, kalin, alan });
const kutu = (x: number, y: number, genislik: number, yukseklik: number, kalinlik = 0.3) => ({ tur: 'kutu' as const, x, y, genislik, yukseklik, kalinlik });

export const HAZIR_SABLONLAR: readonly Sablon[] = [
  { anahtar: 'konum-50x25', ad: 'Konum 50x25', tur: 'konum', genislik: 50, yukseklik: 25, ogeler: [
    qr(1, 1, 23), metin(25, 2, 24, 10, 4, 'kod', true), metin(25, 14, 24, 9, 2.5, 'yer'),
  ] },
  { anahtar: 'konum-100x50', ad: 'Konum 100x50', tur: 'konum', genislik: 100, yukseklik: 50, ogeler: [
    qr(2, 2, 46), metin(50, 4, 48, 18, 7, 'kod', true), metin(50, 24, 48, 10, 4, 'ad'), metin(50, 36, 48, 12, 3.5, 'yer'),
  ] },
  { anahtar: 'raf-100x50', ad: 'Raf 100x50', tur: 'raf', genislik: 100, yukseklik: 50, ogeler: [
    qr(2, 2, 46), metin(50, 4, 48, 18, 9, 'kod', true), metin(50, 24, 48, 10, 4, 'ad'), metin(50, 36, 48, 12, 3.5, 'yer'),
  ] },
  { anahtar: 'raf-50x25', ad: 'Raf 50x25', tur: 'raf', genislik: 50, yukseklik: 25, ogeler: [
    qr(1, 1, 23), metin(25, 2, 24, 10, 5, 'kod', true), metin(25, 14, 24, 9, 2.5, 'yer'),
  ] },
  { anahtar: 'malzeme-50x25', ad: 'Malzeme 50x25', tur: 'malzeme', genislik: 50, yukseklik: 25, ogeler: [
    qr(1, 1, 23), metin(25, 2, 24, 10, 3, 'ad', true), metin(25, 13, 24, 5, 3.5, 'kod', true), metin(25, 19, 24, 4, 2.5, 'kart'),
  ] },
  { anahtar: 'lot-100x50', ad: 'Lot 100x50', tur: 'lot', genislik: 100, yukseklik: 50, ogeler: [
    qr(2, 4, 42), metin(46, 3, 52, 9, 7, 'lotNo', true), metin(46, 13, 52, 8, 3, 'malzeme'), metin(46, 22, 52, 4, 3, 'kart'),
    metin(46, 27, 52, 8, 3, 'parti'), metin(46, 36, 52, 8, 3, 'giris'),
  ] },
  // Kart #707, düzen B: rota yukarıdan aşağı, lottan mamul deposuna; QR sağ sütunda. QR'ın çevresinde motorun iki modülüne ek
  // en az üç mm boş alan bırakılır, sessiz bölge dört modülü geçer (ortak QR ayarı değişmeden).
  { anahtar: 'refakat-100x150', ad: 'Refakat kartı 100x150', tur: 'refakat', genislik: 100, yukseklik: 150, ogeler: [
    metin(4, 4, 92, 3.5, 2.6, '=REFAKAT KARTI', true), metin(4, 8, 92, 9, 7.5, 'emirNo', true), metin(4, 18, 92, 5.5, 4.2, 'urunAd', true),
    metin(4, 24, 92, 4, 2.8, 'urunKod'), metin(4, 28.5, 92, 4, 2.8, 'adetTermin'), kutu(4, 33.5, 92, 0.8, 0.8),
    kutu(4, 37, 4, 4, 0.5), metin(10, 36.5, 52, 10, 2.8, 'lot', true), kutu(5.6, 41, 0.8, 96, 0.8),
    metin(10, 48, 52, 87, 3.2, 'rota'),
    kutu(4, 137, 4, 4, 2), metin(10, 137.2, 54, 4, 2.8, '=Mamul deposu / sevk', true),
    qr(67, 37.5, 29), metin(67, 69.5, 29, 3, 2.2, '=Her işlemde okutun'),
    kutu(67, 124, 29, 22, 0.3), metin(68.5, 125.5, 26, 10, 2.4, 'parti'), metin(68.5, 137, 26, 7.5, 2.4, 'basim'),
  ] },
  { anahtar: 'istasyon-100x50', ad: 'İstasyon 100x50', tur: 'istasyon', genislik: 100, yukseklik: 50, ogeler: [
    qr(2, 2, 46), metin(50, 4, 48, 18, 7, 'kod', true), metin(50, 26, 48, 20, 5, 'ad'),
  ] },
  // Durum en üstte ve büyük: kasa uzaktan ayrılır. Lot etiketiyle aynı rulo (100x50).
  { anahtar: 'kalite-durum-100x50', ad: 'Kalite durumu 100x50', tur: 'kalite-durum', genislik: 100, yukseklik: 50, ogeler: [
    metin(2, 2, 96, 9, 8, 'durum', true), kutu(2, 12, 96, 0.5, 0.5), qr(2, 14, 34),
    metin(38, 14, 60, 7, 5, 'lotNo', true), metin(38, 23, 60, 9, 3.5, 'malzeme'), metin(38, 34, 60, 9, 3.5, 'miktar'),
  ] },
  // Durum en üstte ve büyük: parça uzaktan ayrılır. Lot etiketiyle aynı rulo (100x50).
  { anahtar: 'hatali-parca-100x50', ad: 'Hatalı parça 100x50', tur: 'hatali-parca', genislik: 100, yukseklik: 50, ogeler: [
    metin(2, 2, 96, 7, 6, 'durum', true), kutu(2, 9.5, 96, 0.5, 0.5), qr(2, 11, 36),
    metin(40, 11, 58, 5, 4, 'emirNo', true), metin(40, 17, 58, 5, 3, 'parca'), metin(40, 22.5, 58, 4, 3, 'islem'), metin(40, 27, 58, 4, 3, 'adetNeden'),
    metin(40, 31.5, 58, 6, 2.5, 'ayiran'), metin(40, 38, 58, 10, 2.5, 'karar'),
  ] },
  { anahtar: 'deneme-100x50', ad: 'Yazıcı denemesi 100x50', tur: 'deneme', genislik: 100, yukseklik: 50, ogeler: [
    kutu(0.5, 0.5, 99, 49, 0.4), qr(3, 3, 30), metin(36, 4, 62, 6, 5, '=ÇĞİÖŞÜ çğıöşü', true), metin(36, 12, 62, 5, 4, '=CGIOSU cgiosu (sade)'),
    metin(36, 19, 62, 5, 3, '=Yazı 3 mm: 0123456789'), metin(36, 25, 62, 4, 2, '=Yazı 2 mm: 0123456789 ABCDEF'), metin(3, 36, 94, 5, 3.5, 'yazici'),
    kutu(3, 43, 94, 0.3),
  ] },
  { anahtar: 'deneme-50x25', ad: 'Yazıcı denemesi 50x25', tur: 'deneme', genislik: 50, yukseklik: 25, ogeler: [
    kutu(0.5, 0.5, 49, 24, 0.4), qr(1.5, 1.5, 21), metin(24, 3, 25, 5, 4, '=ÇĞİÖŞÜ', true), metin(24, 10, 25, 4, 3, '=çğıöşü'), metin(24, 16, 25, 7, 2.5, 'yazici'),
  ] },
];

// Önizleme ve deneme için uydurma örnek değerler; gerçek kayıt değildir.
export const ORNEK_DEGERLER: Record<SablonTuru, AlanDegerleri> = {
  konum: { qr: `${KOD_ONEKI.konum}:A01-02-3`, kod: 'A01-02-3', ad: 'Örnek raf gözü', yer: 'Salon 1 · Raf gözü' },
  raf: { qr: `${KOD_ONEKI.raf}:A12`, kod: 'A12', ad: 'Örnek palet rafı', yer: 'SALON1 · 6 bölme × 4 kat' },
  malzeme: { qr: `${KOD_ONEKI.malzeme}:1001`, ad: 'Örnek çelik mil Ø20', kod: 'ORN-0001', kart: 'Kart 1001' },
  lot: {
    qr: `${KOD_ONEKI.lot}:LT-000123`, lotNo: 'LT-000123', malzeme: 'Örnek çelik mil Ø20 · ORN-0001', kart: 'Kart 1001 · Hammadde',
    parti: 'Parti P-01 · Döküm D-01', giris: '18.10.2026 · 12 adet · MK-000045',
  },
  refakat: {
    qr: `${KOD_ONEKI['uretim-emri']}:4512`, emirNo: 'UE-004512', urunAd: 'Örnek flanş', urunKod: 'Parça no: ORN-FL-01',
    adetTermin: 'Adet 40 · Termin 30.10.2026', parti: 'Parti: Ana emir', basim: 'Basım 18.10.2026',
    adimlar: '10 Torna (Örnek tezgâh) · 20 Kaplama (Örnek fason, fason) · 30 Son kontrol',
    rota: ['10 Torna (Örnek tezgâh)', '20 Kaplama (Örnek fason, fason)', '30 Son kontrol'].join(SATIR_BASI), lot: 'Lot LT-000123 · Döküm D-01 · Sertifika S-01',
  },
  istasyon: { qr: `${KOD_ONEKI.konum}:IST-CNC-01`, kod: 'IST-CNC-01', ad: 'Örnek CNC tezgâhı' },
  'kalite-durum': {
    qr: `${KOD_ONEKI.lot}:LT-000123`, durum: 'KARAR BEKLİYOR', lotNo: 'LT-000123', malzeme: 'Örnek çubuk Ø40 · ORN-HM-01', miktar: '120 kg · Konum ORN-A01',
  },
  'hatali-parca': {
    qr: `${KOD_ONEKI['uretim-emri']}:4513`, durum: 'KARAR BEKLİYOR', emirNo: 'UE-004512 · kol UE-004513', parca: 'ORN-FL-01 · Örnek flanş', islem: 'OP 20 Örnek frezeleme',
    adetNeden: '2 adet · Örnek ölçü dışı', ayiran: 'Ayıran Örnek Operatör · 18.10.2026 10:42', karar: null,
  },
  deneme: { qr: `${KOD_ONEKI.konum}:DENEME`, yazici: null },
};
