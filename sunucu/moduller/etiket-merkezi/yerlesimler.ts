import { YERLESIM_ADLARI, type Sablon, type SablonOgesi, type Yerlesim } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { kodUstSiniri } from './kod-yaz.ts';

// KURGU 3.8: şerit dışındaki yerleşimler. Şerit hazır şablonun kendisidir; burada her tasarım için dört yerleşim daha üretilir.
// Kod içeriği hepsinde aynıdır (kodHazirla); yalnız kodun boyu ve yeri ile basılı yazı değişir. Sığmayan ya da sunulmayan yerleşim
// listeye girmez; yazıdan satır düşen yerleşim bunu `uyari`da söyler ("Satır düşer"), kod alanı düşmesi yerleşime bağlı değildir.
// Yazı alt sınırları: bilgi yazısı 1,8 mm, başlık 3 mm, ana alan 2,5 mm (testle denetlenir).

type Satir = readonly [baslik: string, alan: string];
interface Ozet {
  // Kodun yanında basılan tür adı ve piktogram; ana: etiketi tanıtan tek büyük değer (alan).
  ad: string; simge: string; ana: string; satirlar: readonly Satir[];
  yerlesimler: readonly Exclude<Yerlesim, 'serit'>[];
}

// Refakat kartı 100x150 (işlem tablosu ve imza alanları kart içindir) şeritte kalır. Sevk kolisinde yalnız kod yok (müşteri yazı bekler);
// büyük kod yalnız 50x25, 100x50 ve 100x75'te; tam bilgi 100x50 ve üstünde.
const OZETLER: Readonly<Record<string, Ozet>> = {
  'konum-50x25': { ad: 'KONUM', simge: 'siyah:konum', ana: 'kod', satirlar: [['AD', 'ad'], ['YER', 'yer']], yerlesimler: ['buyuk', 'baslik', 'yalniz'] },
  'konum-100x50': { ad: 'KONUM', simge: 'siyah:konum', ana: 'kod', satirlar: [['AD', 'ad'], ['YER', 'yer']], yerlesimler: ['tam', 'buyuk', 'baslik', 'yalniz'] },
  'raf-50x25': { ad: 'RAF', simge: 'siyah:raf', ana: 'kod', satirlar: [['YER', 'yer'], ['AD', 'ad']], yerlesimler: ['buyuk', 'baslik', 'yalniz'] },
  'raf-100x50': { ad: 'RAF', simge: 'siyah:raf', ana: 'kod', satirlar: [['YER', 'yer'], ['AD', 'ad']], yerlesimler: ['tam', 'buyuk', 'baslik', 'yalniz'] },
  'raf-100x100': { ad: 'RAF', simge: 'siyah:raf', ana: 'kod', satirlar: [['YER', 'yer'], ['AD', 'ad']], yerlesimler: ['tam', 'baslik', 'yalniz'] },
  'malzeme-50x25': { ad: 'MALZEME', simge: 'siyah:malzeme', ana: 'kod', satirlar: [['KART', 'kart'], ['AD', 'ad']], yerlesimler: ['buyuk', 'baslik', 'yalniz'] },
  'istasyon-100x50': { ad: 'TESLİM YERİ', simge: 'siyah:tezgah', ana: 'kod', satirlar: [['AD', 'ad']], yerlesimler: ['tam', 'buyuk', 'baslik', 'yalniz'] },
  'lot-100x50': {
    ad: 'LOT', simge: 'siyah:lot', ana: 'lotNo', yerlesimler: ['tam', 'buyuk', 'baslik', 'yalniz'],
    satirlar: [['MALZEME', 'malzeme'], ['PARTİ · DÖKÜM · SERTİFİKA', 'parti'], ['GİRİŞ', 'giris']],
  },
  'malzeme-etiketi-100x50': {
    ad: 'LOT', simge: 'siyah:lot', ana: 'lotNo', yerlesimler: ['tam', 'buyuk', 'baslik', 'yalniz'],
    satirlar: [['DURUM', 'durumBant'], ['MALZEME', 'malzeme'], ['MİKTAR · KONUM', 'bakiye'], ['SERTİFİKA', 'sertifika'], ['TEDARİKÇİ', 'tedarikci'], ['GİRİŞ', 'girisSatiri']],
  },
  'malzeme-durum-100x50': {
    ad: 'LOT', simge: 'siyah:lot', ana: 'lotNo', yerlesimler: ['tam', 'buyuk', 'baslik', 'yalniz'],
    satirlar: [['DURUM', 'durumBant'], ['MALZEME', 'malzeme'], ['MİKTAR · KONUM', 'bakiye'], ['SERTİFİKA', 'sertifika'], ['TEDARİKÇİ', 'tedarikci'], ['GİRİŞ', 'girisSatiri']],
  },
  'kalite-durum-100x50': {
    ad: 'KALİTE · LOT', simge: 'siyah:kalite', ana: 'durum', yerlesimler: ['tam', 'buyuk', 'baslik', 'yalniz'],
    satirlar: [['LOT NO', 'lotNo'], ['MALZEME', 'malzeme'], ['MİKTAR · KONUM', 'miktar']],
  },
  'hatali-parca-100x50': {
    ad: 'HATALI PARÇA', simge: 'siyah:hatali', ana: 'durum', yerlesimler: ['tam', 'buyuk', 'baslik', 'yalniz'],
    satirlar: [['EMİR', 'emirNo'], ['PARÇA', 'parca'], ['İŞLEM', 'islem'], ['ADET · NEDEN', 'adetNeden']],
  },
  'sevk-koli-100x75': {
    ad: 'SEVK KOLİSİ', simge: 'siyah:koli', ana: 'musteri', yerlesimler: ['tam', 'buyuk', 'baslik'],
    satirlar: [['PARÇA', 'parca'], ['KOLİ', 'koli'], ['ADET', 'adet'], ['EMİR', 'emirNo'], ['SEVK · BELGE', 'sevk']],
  },
};

const SATIR = 1.2;
const BILGI_YAZI = 1.8;
const yuvarla = (v: number): number => Math.round(v * 100) / 100;
const metin = (x: number, y: number, genislik: number, yukseklik: number, yaziMm: number, alan: string, kalin = false, kosul?: string): SablonOgesi =>
  ({ tur: 'metin', x: yuvarla(x), y: yuvarla(y), genislik: yuvarla(genislik), yukseklik: yuvarla(yukseklik), yaziMm, kalin, alan, ...(kosul === undefined ? {} : { kosul }) });
const kod = (x: number, y: number, boyut: number): SablonOgesi => ({ tur: 'kod', x: yuvarla(x), y: yuvarla(y), boyut: yuvarla(boyut), alan: 'qr' });
const simge = (x: number, y: number, boyut: number, alan: string): SablonOgesi => ({ tur: 'simge', x: yuvarla(x), y: yuvarla(y), boyut, alan });

// Bilgi yazısı: kodun neyi taşıdığı (KURGU 3.7). 50x25'te iki satır (tür, basım); büyüğünde alan anahtarları da. Satır başı yüksekliği 2,16 mm.
const bilgiAlani = (kucuk: boolean): string => (kucuk ? 'kodBilgiKisa' : 'kodBilgi');
const bilgiYuksekligi = (kucuk: boolean): number => (kucuk ? 3 : 4) * BILGI_YAZI * SATIR;

function yalniz(t: Sablon): Sablon['ogeler'] {
  const kenar = Math.min(t.genislik - 2, t.yukseklik - 1.5);
  return [kod((t.genislik - kenar) / 2, (t.yukseklik - kenar) / 2, kenar)];
}

function baslik(t: Sablon, o: Ozet): Sablon['ogeler'] {
  const kucuk = t.genislik <= 50;
  const kenar = Math.round(0.72 * t.yukseklik * 2) / 2;
  const ky = (t.yukseklik - kenar) / 2;
  const x = 1.5 + kenar + 2.5;
  const g = t.genislik - x - 1.5;
  const bilgi = bilgiYuksekligi(kucuk);
  const baslikH = kucuk ? 4.6 : 8;
  return [
    kod(1.5, ky, kenar),
    metin(x, ky, g, baslikH, Math.min(kucuk ? 3.6 : 6.4, Math.floor((g / (o.ad.length * 0.92)) * 10) / 10), 'kodBaslik', true),
    metin(x, t.yukseklik - ky - bilgi, g, bilgi, BILGI_YAZI, bilgiAlani(kucuk)),
  ];
}

// Büyük kod: kod etiket yüksekliğinin ~%78'i; yanında tür adı, ana değer ve sığdığı kadar satır; sığmayan satır düşer ve uyarıya yazılır.
function buyuk(t: Sablon, o: Ozet): { ogeler: Sablon['ogeler']; dusen: string[] } {
  const kucuk = t.genislik <= 50;
  const kenar = Math.round(0.78 * t.yukseklik * 2) / 2;
  const ky = (t.yukseklik - kenar) / 2;
  const x = 1.5 + kenar + 2.5;
  const g = t.genislik - x - 1.5;
  const bilgi = bilgiYuksekligi(kucuk);
  const bilgiY = t.yukseklik - 1 - bilgi;
  const adH = kucuk ? 2.4 : 3.2;
  const anaH = kucuk ? 4.6 : 7.4;
  const ogeler: SablonOgesi[] = [kod(1.5, ky, kenar), metin(x, 1, g, adH, kucuk ? 1.9 : 2.5, `=${o.ad}`, true)];
  let y = 1 + adH + 0.4;
  ogeler.push(metin(x, y, g, anaH, kucuk ? 4 : 6.8, o.ana, true));
  y += anaH + 0.6;
  const dusen: string[] = [];
  const satirH = 2.2 + 3.2 + 0.4;
  for (const [b, alan] of o.satirlar.slice(0, 3)) {
    if (y + satirH > bilgiY - 0.3) { dusen.push(b); continue; }
    ogeler.push(metin(x, y, g, 2.2, BILGI_YAZI, `=${b}`, false, alan), metin(x, y + 2.2, g, 3.2, 2.6, alan, true));
    y += satirH;
  }
  dusen.push(...o.satirlar.slice(3).map(([b]) => b));
  ogeler.push(metin(x, bilgiY, g, bilgi, BILGI_YAZI, bilgiAlani(kucuk)));
  return { ogeler, dusen };
}

// Tam bilgi: kod sağ üstte, 0,375 mm modülün sığdığı en küçük kenarda; yanında tür adı, ana değer ve BÜTÜN satırlar. Hepsi sığmazsa yerleşim sunulmaz.
function tam(t: Sablon, o: Ozet): Sablon['ogeler'] | null {
  const kenar = (kodUstSiniri(t.genislik, t.yukseklik) + 4) * 0.375;
  const kx = t.genislik - 1.5 - kenar;
  const g = kx - 3 - 1.5;
  const bilgi = bilgiYuksekligi(false);
  const ogeler: SablonOgesi[] = [
    kod(kx, 1.5, kenar),
    metin(kx, 1.5 + kenar + 2.6, kenar, bilgi, BILGI_YAZI, bilgiAlani(false)),
    simge(1.5, 1.5, 9, `=${o.simge}`), metin(12.5, 2, g - 11, 3.8, 3.4, `=${o.ad}`, true),
  ];
  let y = 12;
  ogeler.push(metin(1.5, y, g, 6.4, 5.8, o.ana, true));
  y += 7.2;
  for (const [b, alan] of o.satirlar) {
    ogeler.push(metin(1.5, y, g, 2.2, BILGI_YAZI, `=${b}`, false, alan), metin(1.5, y + 2.2, g, 3.2, 2.6, alan, true));
    y += 2.2 + 3.2 + 0.4;
  }
  if (y > t.yukseklik - 0.8 || 1.5 + kenar + 2.6 + bilgi > t.yukseklik - 0.8) return null;
  return ogeler;
}

export function yerlesimleriUret(tabanlar: readonly Sablon[]): Sablon[] {
  const sonuc: Sablon[] = [];
  for (const t of tabanlar) {
    const o = OZETLER[t.anahtar];
    if (o === undefined) continue;
    for (const yerlesim of o.yerlesimler) {
      let ogeler: Sablon['ogeler'] | null;
      let dusen: string[] = [];
      if (yerlesim === 'yalniz') ogeler = yalniz(t);
      else if (yerlesim === 'baslik') ogeler = baslik(t, o);
      else if (yerlesim === 'buyuk') ({ ogeler, dusen } = buyuk(t, o));
      else ogeler = tam(t, o);
      if (ogeler === null) continue;
      sonuc.push({
        anahtar: `${t.anahtar}-${yerlesim}`, ad: `${t.ad} · ${YERLESIM_ADLARI[yerlesim]}`, tur: t.tur, genislik: t.genislik, yukseklik: t.yukseklik, ogeler,
        yerlesim, taban: t.anahtar, ...(dusen.length === 0 ? {} : { uyari: `Satır düşer: ${dusen.join(', ')}` }),
      });
    }
  }
  return sonuc;
}
