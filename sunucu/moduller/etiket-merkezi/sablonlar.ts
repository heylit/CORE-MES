import { KOD_ONEKI } from '#paylasilan/kod-sozlugu.ts';
import type { Sablon, SablonTuru } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { REFAKAT_ADIM_SAYISI, SATIR_BASI, refakatAdimlari, type AlanDegerleri } from './kurallar.ts';

// Hazır şablonlar kodda durur: kullanıcı şablonu gelince bunlar kopyalanıp değiştirilecek. Ölçüler mm.
// Piktogram alanı "<karo>:<piktogram>" (paylasilan/etiket-piktogramlari.ts).
// Alan "=" ile başlarsa sabit metindir. Konum kodu 20 karaktere kadar kesilmeden sığar (stok_konum_kod_bicimi, EM-13). Raf etiketi Fabrika Haritası rafından (#116). Bugünkü baskılarla aynı içerik: konum ve malzeme (stok/Etiketler.tsx),
// lot (stok/LotEtiketi.tsx), refakat kartı (stok/RefakatKarti.tsx).

export const ALANLAR: Record<SablonTuru, { anahtar: string; ad: string }[]> = {
  konum: [{ anahtar: 'qr', ad: 'QR (LOC)' }, { anahtar: 'kod', ad: 'Konum kodu' }, { anahtar: 'ad', ad: 'Konum adı' }, { anahtar: 'yer', ad: 'Salon ve kutu türü' }],
  raf: [{ anahtar: 'qr', ad: 'QR (RAF)' }, { anahtar: 'kod', ad: 'Raf kodu' }, { anahtar: 'ad', ad: 'Raf adı' }, { anahtar: 'yer', ad: 'Bölüm, bölme ve kat' }],
  malzeme: [{ anahtar: 'qr', ad: 'QR (MLZ)' }, { anahtar: 'ad', ad: 'Malzeme adı' }, { anahtar: 'kod', ad: 'Stok kodu' }, { anahtar: 'kart', ad: 'Kart no' }],
  lot: [
    { anahtar: 'qr', ad: 'QR (LOT)' }, { anahtar: 'lotNo', ad: 'Lot no' }, { anahtar: 'malzeme', ad: 'Malzeme' }, { anahtar: 'kart', ad: 'Kart ve tür' },
    { anahtar: 'parti', ad: 'Parti, döküm, sertifika' }, { anahtar: 'giris', ad: 'Giriş, miktar, belge' },
    { anahtar: 'durumBant', ad: 'Durum (Mal kabul, Serbest, Hatalı, Şartlı kabul, Red)' }, { anahtar: 'durumAlt', ad: 'Durum açıklaması' }, { anahtar: 'bantSimge', ad: 'Durum piktogramı' },
    { anahtar: 'bakiye', ad: 'Bu etiketin miktarı ve konumu' }, { anahtar: 'basimZamani', ad: 'Basım zamanı' }, { anahtar: 'tur', ad: 'Malzeme türü' },
    { anahtar: 'olcu', ad: 'Ölçü' }, { anahtar: 'kalite', ad: 'Kalite' }, { anahtar: 'temper', ad: 'Durum (ısıl işlem / temper)' }, { anahtar: 'islem', ad: 'İşlem' },
    { anahtar: 'tedarikci', ad: 'Tedarikçi' }, { anahtar: 'sertifika', ad: 'Sertifika, döküm, parti' }, { anahtar: 'girisSatiri', ad: 'Giriş, miktar, mal kabul' }, { anahtar: 'gkk', ad: 'GKK no ve sonucu' },
  ],
  refakat: [
    { anahtar: 'qr', ad: 'QR (UE ya da RP)' }, { anahtar: 'emirNo', ad: 'Emir no' }, { anahtar: 'urunAd', ad: 'Ürün adı' }, { anahtar: 'urunKod', ad: 'Parça no' }, { anahtar: 'revizyon', ad: 'Revizyon kodu (Rev …)' },
    { anahtar: 'adetTermin', ad: 'Adet ve termin' }, { anahtar: 'parti', ad: 'Parti' }, { anahtar: 'basim', ad: 'Basım tarihi' },
    { anahtar: 'adimlar', ad: 'İşlem sırası' }, { anahtar: 'rota', ad: 'Rota (adım başına satır)' }, { anahtar: 'lot', ad: 'Lot, parti, döküm, sertifika' },
    { anahtar: 'adet', ad: 'Adet' }, { anahtar: 'termin', ad: 'Termin' }, { anahtar: 'adim1Ad', ad: 'İşlem satırları (no, ad, yer, piktogram)' },
    { anahtar: 'lotNo', ad: 'Lot no' }, { anahtar: 'lotEk', ad: 'Döküm, sertifika, tedarikçi partisi' }, { anahtar: 'kopya', ad: 'Kopya sırası (n/N)' },
  ],
  istasyon: [{ anahtar: 'qr', ad: 'QR (LOC)' }, { anahtar: 'kod', ad: 'İstasyon kodu' }, { anahtar: 'ad', ad: 'İstasyon adı' }],
  'kalite-durum': [
    { anahtar: 'qr', ad: 'QR (LOT)' }, { anahtar: 'durum', ad: 'Kalite durumu' }, { anahtar: 'lotNo', ad: 'Lot no' }, { anahtar: 'malzeme', ad: 'Malzeme adı ve kodu' },
    { anahtar: 'miktar', ad: 'Miktar, birim ve konum' }, { anahtar: 'kararSimge', ad: 'Karar piktogramı' },
    { anahtar: 'kart', ad: 'Kart ve tür' }, { anahtar: 'parti', ad: 'Parti, döküm, sertifika' }, { anahtar: 'giris', ad: 'Giriş, miktar, belge' },
    { anahtar: 'durumBant', ad: 'Durum (Mal kabul, Serbest, Hatalı, Şartlı kabul, Red)' }, { anahtar: 'durumAlt', ad: 'Durum açıklaması' }, { anahtar: 'bantSimge', ad: 'Durum piktogramı' },
    { anahtar: 'bakiye', ad: 'Bu etiketin miktarı ve konumu' }, { anahtar: 'basimZamani', ad: 'Basım zamanı' }, { anahtar: 'tur', ad: 'Malzeme türü' },
    { anahtar: 'olcu', ad: 'Ölçü' }, { anahtar: 'kalite', ad: 'Kalite' }, { anahtar: 'temper', ad: 'Durum (ısıl işlem / temper)' }, { anahtar: 'islem', ad: 'İşlem' },
    { anahtar: 'tedarikci', ad: 'Tedarikçi' }, { anahtar: 'sertifika', ad: 'Sertifika, döküm, parti' }, { anahtar: 'girisSatiri', ad: 'Giriş, miktar, mal kabul' }, { anahtar: 'gkk', ad: 'GKK no ve sonucu' },
  ],
  'hatali-parca': [
    { anahtar: 'qr', ad: 'QR (UE, parçanın emri)' }, { anahtar: 'durum', ad: 'Durum (karar)' }, { anahtar: 'emirNo', ad: 'Emir no' }, { anahtar: 'parca', ad: 'Parça no ve adı' },
    { anahtar: 'islem', ad: 'İşlem no ve adı' }, { anahtar: 'adetNeden', ad: 'Adet ve hurda nedeni' }, { anahtar: 'ayiran', ad: 'Ayıran ve zaman' },
    { anahtar: 'karar', ad: 'Karar veren, zaman, NCR no, not' }, { anahtar: 'kararSimge', ad: 'Karar piktogramı' },
  ],
  'sevk-koli': [
    { anahtar: 'qr', ad: 'QR (UE, kalemin emri)' }, { anahtar: 'musteri', ad: 'Müşteri' }, { anahtar: 'parca', ad: 'Parça no ve adı' },
    { anahtar: 'adet', ad: 'Koli içi adet' }, { anahtar: 'koli', ad: 'Koli sırası (n/N)' }, { anahtar: 'koliSira', ad: 'Koli sırası, kısa' }, { anahtar: 'adetSayi', ad: 'Koli içi adet, sayı' }, { anahtar: 'adetBaslik', ad: 'Adet başlığı (koli içi ya da kalem toplamı)' }, { anahtar: 'emirNo', ad: 'Emir no' }, { anahtar: 'sevk', ad: 'Sevk tarihi ve belge no' },
  ],
  deneme: [{ anahtar: 'qr', ad: 'QR' }, { anahtar: 'yazici', ad: 'Dil ve çözünürlük' }],
};

type Ek = { ters?: boolean; kosul?: string };
const qr = (x: number, y: number, boyut: number) => ({ tur: 'qr' as const, x, y, boyut, alan: 'qr' });
const metin = (x: number, y: number, genislik: number, yukseklik: number, yaziMm: number, alan: string, kalin = false, ek: Ek = {}) =>
  ({ tur: 'metin' as const, x, y, genislik, yukseklik, yaziMm, kalin, alan, ...ek });
const kutu = (x: number, y: number, genislik: number, yukseklik: number, kalinlik = 0.3, kosul?: string) =>
  ({ tur: 'kutu' as const, x, y, genislik, yukseklik, kalinlik, ...(kosul === undefined ? {} : { kosul }) });
const simge = (x: number, y: number, boyut: number, alan: string, kosul?: string) =>
  ({ tur: 'simge' as const, x, y, boyut, alan, ...(kosul === undefined ? {} : { kosul }) });
// Alan başlığı: 1,9 mm büyük harf; değeri olmayan satırın başlığı basılmaz.
const baslik = (x: number, y: number, genislik: number, metni: string, kosul?: string) => metin(x, y, genislik, 2.2, 1.9, `=${metni}`, false, kosul === undefined ? {} : { kosul });

// Kart 2168 (2168-1 a, 2168-2 b, 2168-3 a): sağ üstte siyah karo ve türün piktogramı; karonun solunda tür adı ve küçük alt başlık;
// altında tek büyük değer ve başlıklı satırlar. QR bugünkü boyutundadır.
const buyukUst = (piktogram: string, ad: string, alt: string) => [
  qr(2, 2, 46), simge(79, 2, 19, `=siyah:${piktogram}`), metin(50, 2.5, 28, 6.6, 6, `=${ad}`, true), metin(50, 9.8, 28, 2.6, 2, alt), kutu(50, 13.6, 27, 0.5, 0.5),
];
const kucukUst = (piktogram: string, ad: string, alt: string) => [
  qr(0.5, 1, 23), simge(39.5, 1, 9.5, `=siyah:${piktogram}`), metin(24.5, 1.4, 14.5, 3.8, 3.2, `=${ad}`, true), metin(24.5, 5.6, 14.5, 2.2, 1.7, alt),
];
// Durum etiketleri: karar en üstte ve büyük, sağ üst karo kararın piktogramı; red etiketin tamamı kalın çerçeve alır.
const durumUst = (piktogram: string, ad: string) => [
  simge(77, 2, 21, 'kararSimge'), metin(3, 2.4, 72, 8.6, 8, 'durum', true), kutu(3, 11.4, 72, 0.6, 0.6),
  simge(39, 13.2, 4.2, `=yok:${piktogram}`), metin(44.6, 13.8, 30, 2.6, 2.1, `=${ad}`), qr(3, 13.2, 34), kutu(0, 0, 100, 50, 2.4, 'redCerceve'),
];
// Refakat kartında işlem satırı (EM-27, 2907): no, ad, yer ve işaret (fason ya da çıkış); satır altında ince çizgi. İmza kutusu yok
// (2907-1 a), elle kayıt kutusu da yok (2932: kullanıcı kaldırdı). Satır aralığı 7 mm: on satır işlem başlığından alt çizgiye yayılır.
const refakatAdimi = (i: number) => {
  const y = 65 + (i - 1) * 7;
  const ad = `adim${i}Ad`;
  return [
    metin(4, y, 9, 3.6, 3.2, `adim${i}No`, true), metin(14, y, 37, 3.6, 3.2, ad, true), metin(52, y + 0.4, 36, 3, 2.4, `adim${i}Yer`),
    simge(90.5, y - 0.3, 4.4, `adim${i}Isaret`), kutu(4, y + 5.2, 92, 0.2, 0.2, ad),
  ];
};
const DENEME_SIMGELERI = ['konum', 'raf', 'malzeme', 'lot', 'refakat', 'tezgah', 'kalite', 'hatali', 'koli', 'kumpas'];

// 3124 a (EM-41): malzeme etiketi. Üst bant durum (büyük), durum piktogramı, sağda bu etiketin miktarı ve konumu, basım zamanı ve tür;
// hatalı ve red bütün etiket kalın çerçeve. Gövde: QR (LOT), lot no, malzeme ve başlıklı satırlar. Lot ve kalite durumu kayıtları için
// aynı tasarım iki türde durur (defter türü değişmez); her iki türde ilk sıradadır, Etiket bas ve Basılacaklar varsayılanı odur.
const malzemeUstBandi = [
  simge(3, 2.6, 9, 'bantSimge'), metin(13.6, 2.4, 51, 7, 6.4, 'durumBant', true), metin(13.6, 9.0, 51, 2.4, 1.9, 'durumAlt'),
  metin(66, 2.4, 31, 2.8, 2.3, 'bakiye', true), metin(66, 5.6, 31, 2.4, 1.9, 'basimZamani'), metin(66, 8.6, 31, 2.4, 1.9, 'tur', true),
  kutu(3, 12, 94, 0.5, 0.5, 'durumBant'), kutu(0, 0, 100, 50, 2.2, 'cerceve'),
];
const malzemeSatiri = (y: number, ad: string, alan: string, x = 33, genislik = 64, bas = 13.4) => [
  metin(x, y + 0.45, bas, 2.2, 1.7, `=${ad}`, false, { kosul: alan }), metin(x + bas, y, genislik - bas, 3, 2.5, alan, true),
];
const MALZEME_SATIR = 3.5, MALZEME_Y = 23.4;
const malzemeOgeleri = [
  ...malzemeUstBandi, qr(3, 13.4, 28), metin(33, 13.4, 64, 5.6, 5, 'lotNo', true), metin(33, 19.4, 64, 3.2, 2.9, 'malzeme', true),
  ...malzemeSatiri(MALZEME_Y, 'ÖLÇÜ', 'olcu'),
  ...malzemeSatiri(MALZEME_Y + MALZEME_SATIR, 'KALİTE', 'kalite', 33, 38), ...malzemeSatiri(MALZEME_Y + MALZEME_SATIR, 'DURUM', 'temper', 72, 25, 9),
  ...malzemeSatiri(MALZEME_Y + 2 * MALZEME_SATIR, 'İŞLEM', 'islem'),
  ...malzemeSatiri(MALZEME_Y + 3 * MALZEME_SATIR, 'TEDARİKÇİ', 'tedarikci'),
  ...malzemeSatiri(MALZEME_Y + 4 * MALZEME_SATIR, 'SERTİFİKA', 'sertifika'),
  ...malzemeSatiri(MALZEME_Y + 5 * MALZEME_SATIR, 'GİRİŞ', 'girisSatiri'),
  ...malzemeSatiri(MALZEME_Y + 6 * MALZEME_SATIR, 'GKK', 'gkk'),
];

export const HAZIR_SABLONLAR: readonly Sablon[] = [
  { anahtar: 'konum-50x25', ad: 'Yer 50x25', tur: 'konum', genislik: 50, yukseklik: 25, ogeler: [
    ...kucukUst('konum', 'KONUM', '=LOC'), metin(24.5, 10.8, 24.5, 9.8, 4, 'kod', true), metin(24.5, 21, 24.5, 3.6, 2.2, 'yer'),
  ] },
  { anahtar: 'konum-100x50', ad: 'Yer 100x50', tur: 'konum', genislik: 100, yukseklik: 50, ogeler: [
    ...buyukUst('konum', 'KONUM', '=STOK KONUMU'), metin(50, 21.5, 48, 17, 7, 'kod', true),
    baslik(50, 39, 48, 'AD', 'ad'), metin(50, 41.4, 48, 3.6, 3.2, 'ad', true), metin(50, 45.4, 48, 3.2, 2.6, 'yer'),
  ] },
  { anahtar: 'raf-100x50', ad: 'Raf 100x50', tur: 'raf', genislik: 100, yukseklik: 50, ogeler: [
    ...buyukUst('raf', 'RAF', '=FABRİKA HARİTASI'), metin(50, 21.5, 48, 17, 9, 'kod', true),
    baslik(50, 39, 48, 'AD', 'ad'), metin(50, 41.4, 48, 3.6, 3.2, 'ad', true), metin(50, 45.4, 48, 3.2, 2.6, 'yer'),
  ] },
  { anahtar: 'raf-50x25', ad: 'Raf 50x25', tur: 'raf', genislik: 50, yukseklik: 25, ogeler: [
    ...kucukUst('raf', 'RAF', '=RAF'), metin(24.5, 10.8, 24.5, 6.6, 5.5, 'kod', true), metin(24.5, 18.4, 24.5, 6, 2.2, 'yer'),
  ] },
  { anahtar: 'malzeme-50x25', ad: 'Malzeme 50x25', tur: 'malzeme', genislik: 50, yukseklik: 25, ogeler: [
    ...kucukUst('malzeme', 'MALZEME', 'kart'), metin(24.5, 11.2, 24.5, 5, 4.2, 'kod', true), kutu(24.5, 16.6, 24.5, 0.3), metin(24.5, 17.4, 24.5, 7, 2.5, 'ad', true),
  ] },
  { anahtar: 'malzeme-etiketi-100x50', ad: 'Malzeme etiketi 100x50', tur: 'lot', genislik: 100, yukseklik: 50, ogeler: malzemeOgeleri },
  { anahtar: 'lot-100x50', ad: 'Lot 100x50', tur: 'lot', genislik: 100, yukseklik: 50, ogeler: [
    ...buyukUst('lot', 'LOT', 'kart'), metin(50, 21.8, 48, 8, 7, 'lotNo', true),
    baslik(50, 30.4, 48, 'MALZEME', 'malzeme'), metin(50, 32.6, 48, 3.4, 2.8, 'malzeme', true),
    baslik(50, 37, 48, 'PARTİ · DÖKÜM · SERTİFİKA', 'parti'), metin(50, 39.2, 48, 3, 2.6, 'parti'),
    baslik(50, 43, 48, 'GİRİŞ', 'giris'), metin(50, 45.2, 48, 3, 2.6, 'giris'),
  ] },
  // Kart #707: QR'ın çevresinde motorun iki modülüne ek en az üç mm boş alan kalır (sessiz bölge dört modülü geçer).
  // 2907 (2912 a): QR sol üstte büyük (kodu altında, EM-34); kart no en büyük yazı; adet ve termin yan yana; lot siyah bantta; işlem
  // sırası adım başına tek satır, on satır; elle kayıt kutusu yok (2932).
  { anahtar: 'refakat-100x150', ad: 'Refakat kartı 100x150', tur: 'refakat', genislik: 100, yukseklik: 150, ogeler: [
    // Sağ üst karo bütün hazır şablonlardadır (2168-1 a); burada küçüktür, yer kart no ve QR'ındır.
    qr(3.5, 3.5, 37.5), simge(87, 2.5, 10.5, '=siyah:refakat'), metin(45, 3.4, 40, 3.6, 3, '=REFAKAT KARTI', true), metin(45, 7.6, 40, 2.4, 1.9, '=HER İŞLEMDE OKUTUN'),
    // 2929 a: kopya sırası başlığın altında; tek kopyada değer yoktur, yazı basılmaz.
    // 2907 D4: revizyon kodu kopya sırasının sağında, aynı satırda; parça no satırı tam genişlikte kalır (uzun parça no kısalmasın).
    metin(45, 10.6, 18, 2.6, 2.2, 'kopya', true), metin(64, 10.6, 22, 2.6, 2.2, 'revizyon', true),
    metin(45, 14, 52, 8.6, 7.4, 'emirNo', true), metin(45, 23.4, 52, 4.2, 3.6, 'urunAd', true), metin(45, 28, 52, 3.2, 2.6, 'urunKod'),
    kutu(45, 32, 52, 12.5, 0.4), kutu(71, 32, 0.4, 12.5, 0.4),
    baslik(47, 33.2, 22, 'EMİR ADEDİ'), metin(47, 35.6, 22, 7.2, 6.6, 'adet', true), baslik(73, 33.2, 22, 'TERMİN'), metin(73, 36.8, 22, 4.6, 4, 'termin', true),
    kutu(0, 47, 100, 11, 11, 'lotNo'), metin(4, 48.2, 38, 2.2, 1.9, '=LOT', false, { ters: true, kosul: 'lotNo' }), metin(4, 50.6, 38, 6, 5, 'lotNo', true, { ters: true }),
    metin(45, 49.2, 52, 7.4, 2.3, 'lotEk', false, { ters: true }),
    baslik(4, 61, 60, 'İŞLEM SIRASI', 'adim1Ad'),
    ...Array.from({ length: REFAKAT_ADIM_SAYISI }, (_, i) => refakatAdimi(i + 1)).flat(),
    kutu(1.5, 137.4, 97, 0.3), metin(4, 138.8, 58, 3, 2.4, 'parti'), metin(64, 138.8, 32, 3, 2.4, 'basim'),
  ] },
  // 2922 a: istasyon etiketi yer etiketinin bir boyudur; QR aynı konum kodudur (LOC), üstte "Teslim yeri" yazar. Anahtar ve tür
  // adları değişmez: basılı etiketler ve cihaz varsayılanları geçerli kalır. Üst yazı tek sözcüktür: 28 mm kutuda boşluklu metin küçülmez.
  { anahtar: 'istasyon-100x50', ad: 'Yer 100x50 · Teslim yeri', tur: 'istasyon', genislik: 100, yukseklik: 50, ogeler: [
    ...buyukUst('tezgah', 'TESLİM', '=TESLİM YERİ · İSTASYON'), metin(50, 21.5, 48, 17, 7, 'kod', true), baslik(50, 39, 48, 'AD', 'ad'), metin(50, 41.4, 48, 7, 4, 'ad', true),
  ] },
  // Lot etiketiyle aynı rulo (100x50); QR bugünkü boyutunda (2168-2 b).
  { anahtar: 'malzeme-durum-100x50', ad: 'Malzeme etiketi 100x50', tur: 'kalite-durum', genislik: 100, yukseklik: 50, ogeler: malzemeOgeleri },
  { anahtar: 'kalite-durum-100x50', ad: 'Kalite durumu 100x50', tur: 'kalite-durum', genislik: 100, yukseklik: 50, ogeler: [
    ...durumUst('kalite', 'KALİTE · LOT'), baslik(39, 19.4, 36, 'LOT NO'), metin(39, 21.6, 36, 6.4, 5.6, 'lotNo', true),
    baslik(39, 29.4, 59, 'MALZEME', 'malzeme'), metin(39, 31.6, 59, 6.8, 2.8, 'malzeme', true), baslik(39, 39, 59, 'MİKTAR · KONUM', 'miktar'), metin(39, 41.2, 59, 6.4, 2.8, 'miktar'),
  ] },
  // Müşteri ve koli sırası uzaktan okunur; koli içi adet çerçevede, koli sırası siyah kutuda.
  { anahtar: 'sevk-koli-100x75', ad: 'Sevk kolisi 100x75', tur: 'sevk-koli', genislik: 100, yukseklik: 75, ogeler: [
    qr(2, 2, 44), simge(77, 2, 21, '=siyah:koli'), metin(49, 2.4, 27, 5.6, 4, '=SEVK KOLİSİ', true), baslik(49, 8.6, 27, 'MÜŞTERİ', 'musteri'),
    metin(49, 10.8, 27, 8.8, 3.6, 'musteri', true), kutu(49, 20.4, 26, 0.5, 0.5), baslik(49, 24.6, 49, 'PARÇA', 'parca'), metin(49, 26.8, 49, 8.4, 3.4, 'parca', true),
    kutu(49, 36.5, 23, 20, 0.6), metin(51, 38, 20, 2.2, 1.9, 'adetBaslik', false, { kosul: 'adetSayi' }), metin(51, 40.6, 20, 9, 8, 'adetSayi', true), metin(51, 51.6, 20, 3, 2.4, '=adet', false, { kosul: 'adetSayi' }),
    kutu(74.5, 36.5, 23.5, 20, 20), metin(76.5, 38, 20, 2.2, 1.9, '=KOLİ', false, { ters: true }), metin(76.5, 41, 20, 10, 9, 'koliSira', true, { ters: true }),
    kutu(2, 48, 44, 0.5), baslik(3, 50, 43, 'EMİR', 'emirNo'), metin(3, 52.2, 43, 4, 3.4, 'emirNo', true),
    baslik(3, 57.6, 43, 'SEVK · BELGE', 'sevk'), metin(3, 59.8, 43, 3.4, 2.8, 'sevk'),
    simge(49, 60, 9, '=yok:yukari'), metin(60, 62.4, 38, 3.4, 2.8, '=Bu yüz yukarı', true),
  ] },
  { anahtar: 'hatali-parca-100x50', ad: 'Hatalı parça 100x50', tur: 'hatali-parca', genislik: 100, yukseklik: 50, ogeler: [
    ...durumUst('hatali', 'HATALI PARÇA'), baslik(39, 20.6, 36, 'EMİR', 'emirNo'), metin(39, 23.4, 59, 4.6, 3.8, 'emirNo', true),
    baslik(39, 28.6, 59, 'PARÇA · İŞLEM', 'parca'), metin(39, 30.8, 59, 3, 2.4, 'parca', true), metin(39, 33.8, 59, 2.8, 2.2, 'islem'),
    metin(39, 36.6, 59, 2.8, 2.2, 'adetNeden', true), metin(39, 39.6, 59, 2.6, 2, 'ayiran'), metin(39, 42.2, 59, 5, 2, 'karar'),
  ] },
  // Yazıcı denemesi: Türkçe harf, ters yazı ve piktogramlar; yazıcının bunları basabildiği burada görülür.
  { anahtar: 'deneme-100x50', ad: 'Yazıcı denemesi 100x50', tur: 'deneme', genislik: 100, yukseklik: 50, ogeler: [
    kutu(0.5, 0.5, 99, 49, 0.4), qr(3, 3, 28), simge(78, 3, 19, '=siyah:yazici'), metin(34, 3.4, 42, 5.4, 4.2, '=YAZICI DENEMESİ', true),
    metin(34, 9.4, 42, 3.6, 3, '=ÇĞİÖŞÜ çğıöşü', true), metin(34, 13.6, 42, 2.6, 2, '=Yazı 2 mm: 0123456789'),
    kutu(34, 17.2, 42, 4.6, 4.6), metin(35.4, 17.9, 40, 3.2, 2.6, '=TERS YAZI', true, { ters: true }), metin(34, 23, 42, 7, 2.6, 'yazici'),
    ...DENEME_SIMGELERI.map((p, i) => simge(3 + i * 9.5, 33.4, 8.4, `=siyah:${p}`)), metin(3, 44, 94, 3, 2.2, '=Piktogram 8,4 mm · karo 19 mm'),
  ] },
  { anahtar: 'deneme-50x25', ad: 'Yazıcı denemesi 50x25', tur: 'deneme', genislik: 50, yukseklik: 25, ogeler: [
    kutu(0.5, 0.5, 49, 24, 0.4), qr(1.5, 1.5, 21), simge(40, 1.5, 8.5, '=siyah:yazici'), metin(24, 2, 15, 3.6, 3, '=ÇĞİÖŞÜ', true), metin(24, 6, 15, 3, 2.4, '=çğıöşü'),
    simge(24, 10.6, 5, '=siyah:lot'), simge(30, 10.6, 5, '=beyaz:onay'), simge(36, 10.6, 5, '=cizgili:bekliyor'), simge(42, 10.6, 5, '=siyah:red'),
    metin(24, 16.6, 25, 7, 2.2, 'yazici'),
  ] },
];

const MALZEME_ORNEGI = {
  durumBant: 'MAL KABUL', durumAlt: 'GKK bekliyor · kullanılamaz', bantSimge: 'cizgili:bekliyor', cerceve: null, bakiye: '120 kg · ORN-KRN-01', basimZamani: '18.10.2026 09:15',
  tur: 'HAMMADDE', olcu: 'Ø50×3000 mm', kalite: '42CrMo4', temper: 'Islah (+QT)', islem: 'Gerilim giderme', tedarikci: 'Örnek Çelik A.Ş.',
  sertifika: 'S-01 · Döküm D-01 · Parti P-01', girisSatiri: '18.10.2026 · 120 kg · MK-000045', gkk: 'Bekliyor',
};
// Önizleme ve deneme için uydurma örnek değerler; gerçek kayıt değildir.
export const ORNEK_DEGERLER: Record<SablonTuru, AlanDegerleri> = {
  konum: { qr: `${KOD_ONEKI.konum}:A01-02-3`, kod: 'A01-02-3', ad: 'Örnek raf gözü', yer: 'Salon 1 · Raf gözü' },
  raf: { qr: `${KOD_ONEKI.raf}:A12`, kod: 'A12', ad: 'Örnek palet rafı', yer: 'SALON1 · 6 bölme × 4 kat' },
  malzeme: { qr: `${KOD_ONEKI.malzeme}:1001`, ad: 'Örnek çelik mil Ø20', kod: 'ORN-0001', kart: 'Kart 1001' },
  lot: {
    qr: `${KOD_ONEKI.lot}:LT-000123`, lotNo: 'LT-000123', malzeme: 'Örnek çelik mil Ø20 · ORN-0001', kart: 'Kart 1001 · Hammadde',
    parti: 'Parti P-01 · Döküm D-01', giris: '18.10.2026 · 12 adet · MK-000045', ...MALZEME_ORNEGI,
  },
  refakat: {
    qr: `${KOD_ONEKI['uretim-emri']}:4512`, emirNo: 'UE-004512', urunAd: 'Örnek flanş', urunKod: 'Parça no: ORN-FL-01', revizyon: 'Rev C',
    adetTermin: 'Adet 40 · Termin 30.10.2026', parti: null, basim: 'Basım 18.10.2026',
    adimlar: '10 Torna (Örnek tezgâh) · 20 Kaplama (Örnek fason, fason) · 30 Son kontrol',
    rota: ['10 Torna (Örnek tezgâh)', '20 Kaplama (Örnek fason, fason)', '30 Son kontrol'].join(SATIR_BASI), lot: 'Lot LT-000123 · Döküm D-01 · Sertifika S-01',
    lotNo: 'LT-000123', lotEk: 'Döküm D-01 · Sertifika S-01',
    adet: '40', termin: '30.10.2026', kopya: 'Kopya 1/2',
    ...refakatAdimlari([{ opNo: 10, ad: 'Torna', yer: 'Örnek tezgâh', fason: false }, { opNo: 20, ad: 'Kaplama', yer: 'Örnek fason', fason: true }, { opNo: 30, ad: 'Son kontrol', yer: null, fason: false }]),
  },
  istasyon: { qr: `${KOD_ONEKI.konum}:IST-CNC-01`, kod: 'IST-CNC-01', ad: 'Örnek CNC tezgâhı' },
  'kalite-durum': {
    qr: `${KOD_ONEKI.lot}:LT-000123`, durum: 'KARAR BEKLİYOR', lotNo: 'LT-000123', malzeme: 'Örnek çubuk Ø40 · ORN-HM-01', miktar: '120 kg · Konum ORN-A01',
    kararSimge: 'cizgili:bekliyor', redCerceve: null, kart: 'Kart 1001 · Hammadde', parti: 'Parti P-01 · Döküm D-01', giris: '18.10.2026 · 120 kg · MK-000045',
    ...MALZEME_ORNEGI,
  },
  'sevk-koli': {
    qr: `${KOD_ONEKI['uretim-emri']}:4512`, musteri: 'Örnek Müşteri', parca: 'ORN-FL-01 · Örnek flanş', adet: 'Koli içi 50 adet', koli: 'Koli 1/4', koliSira: '1/4', adetSayi: '50', adetBaslik: 'KOLİ İÇİ',
    emirNo: 'UE-004512', sevk: '30.10.2026 · Belge ORN-1',
  },
  'hatali-parca': {
    qr: `${KOD_ONEKI['uretim-emri']}:4513`, durum: 'KARAR BEKLİYOR', emirNo: 'UE-004512 · kol UE-004513', parca: 'ORN-FL-01 · Örnek flanş', islem: 'OP 20 Örnek frezeleme',
    adetNeden: '2 adet · Örnek ölçü dışı', ayiran: 'Ayıran Örnek Operatör · 18.10.2026 10:42', karar: null,
    kararSimge: 'cizgili:bekliyor', redCerceve: null,
  },
  deneme: { qr: `${KOD_ONEKI.konum}:DENEME`, yazici: null },
};
