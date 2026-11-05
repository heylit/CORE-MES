import {
  PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, PDFStream, StandardFontEmbedder, StandardFonts, decodePDFRawStream,
} from 'pdf-lib';
import type { PDFContext, PDFObject, PDFPage } from 'pdf-lib';
import type { AyiklamaSonucu, Alan, DisNesne, Kaynaklar, Matris, Sayac, YaziTipi } from './ayiklama.ts';
import { AyiklamaHatasi, ayikla } from './ayiklama.ts';

// Sayfanın içerik akışından temizlenen alandaki yazı, resim ve çizimi çıkarır (kart 2123b, karar 2123-5 c).
// Sayfa yerinde değiştirilir; paylaşılan kaynak sözlükleri ve formlar kopyalanarak değiştirilir, öbür sayfalar etkilenmez.
// Silinen nesneler yalnız sayfadan koparılır; dosyadan gitmeleri için belge copyPages ile yeni belgeye kurulmalıdır (pdf-yaz.ts).

const ad = (s: string) => PDFName.of(s);
const adMetni = (n: PDFName): string => n.decodeText();

function akisBaytlari(s: PDFObject | undefined): Uint8Array {
  if (s instanceof PDFRawStream) {
    try {
      return decodePDFRawStream(s).decode();
    } catch {
      throw new AyiklamaHatasi('Sayfa içeriği çözülemedi (desteklenmeyen sıkıştırma).');
    }
  }
  if (s instanceof PDFStream && 'getUnencodedContents' in s) return (s as PDFStream & { getUnencodedContents(): Uint8Array }).getUnencodedContents();
  throw new AyiklamaHatasi('Sayfa içeriği okunamadı.');
}

function sayilar(a: PDFArray | undefined): number[] | null {
  if (!a) return null;
  const s: number[] = [];
  for (let i = 0; i < a.size(); i++) {
    const n = a.lookup(i);
    if (!(n instanceof PDFNumber)) return null;
    s.push(n.asNumber());
  }
  return s;
}

const STANDART = new Set<string>(Object.values(StandardFonts));
const STANDART_ESI: Record<string, string> = {
  Arial: 'Helvetica', 'Arial,Bold': 'Helvetica-Bold', 'Arial,Italic': 'Helvetica-Oblique', 'Arial,BoldItalic': 'Helvetica-BoldOblique',
  TimesNewRoman: 'Times-Roman', 'TimesNewRoman,Bold': 'Times-Bold', 'TimesNewRoman,Italic': 'Times-Italic',
  'TimesNewRoman,BoldItalic': 'Times-BoldItalic', CourierNew: 'Courier', 'CourierNew,Bold': 'Courier-Bold',
};

// Genişlik tablosu olmayan standart yazı tipi: kod, yazı tipinin kendi kodlamasıyla (ya da Differences ile) harf adına çevrilir.
function standartGenislik(taban: string, farklar: Map<number, string>): ((kod: number) => number | null) | null {
  const adi = STANDART_ESI[taban] ?? taban;
  if (!STANDART.has(adi)) return null;
  const g = StandardFontEmbedder.for(adi as Parameters<typeof StandardFontEmbedder.for>[0]);
  const kodHarf = new Map<number, string>();
  for (const cp of g.encoding.supportedCodePoints) {
    const k = g.encoding.encodeUnicodeCodePoint(cp);
    if (!kodHarf.has(k.code)) kodHarf.set(k.code, k.name);
  }
  return (kod) => {
    const harf = farklar.get(kod) ?? kodHarf.get(kod);
    const w = harf ? g.font.getWidthOfGlyph(harf) : undefined;
    return typeof w === 'number' ? w / 1000 : null;
  };
}

function farklar(yt: PDFDict): Map<number, string> {
  const m = new Map<number, string>();
  const kodlama = yt.lookup(ad('Encoding'));
  const dizi = kodlama instanceof PDFDict ? kodlama.lookupMaybe(ad('Differences'), PDFArray) : undefined;
  if (!dizi) return m;
  let kod = 0;
  for (let i = 0; i < dizi.size(); i++) {
    const o = dizi.lookup(i);
    if (o instanceof PDFNumber) kod = o.asNumber();
    else if (o instanceof PDFName) m.set(kod++, adMetni(o));
  }
  return m;
}

export function yaziTipiOku(yt: PDFDict): YaziTipi {
  const tur = yt.lookupMaybe(ad('Subtype'), PDFName);
  const tabanAd = yt.lookupMaybe(ad('BaseFont'), PDFName);
  const taban = tabanAd ? adMetni(tabanAd).replace(/^[A-Z]{6}\+/, '') : '';
  if (tur && adMetni(tur) === 'Type0') {
    const kodlama = yt.lookup(ad('Encoding'));
    const kimlik = kodlama instanceof PDFName && adMetni(kodlama) === 'Identity-H';
    // Identity-H dışındaki CMap'lerde kod ile CID eşlenemez; dikey yazımda ilerleme yatay değildir. Genişlik bilinmez sayılır.
    if (!kimlik) return { ikiBayt: true, genislik: () => null };
    const cid = yt.lookupMaybe(ad('DescendantFonts'), PDFArray)?.lookup(0);
    if (!(cid instanceof PDFDict)) return { ikiBayt: true, genislik: () => null };
    const dw = cid.lookupMaybe(ad('DW'), PDFNumber)?.asNumber() ?? 1000;
    const tablo = new Map<number, number>();
    const w = cid.lookupMaybe(ad('W'), PDFArray);
    if (w) {
      let i = 0;
      while (i < w.size()) {
        const ilk = w.lookup(i);
        const ikinci = w.lookup(i + 1);
        if (!(ilk instanceof PDFNumber)) break;
        if (ikinci instanceof PDFArray) {
          const s = sayilar(ikinci) ?? [];
          s.forEach((x, j) => tablo.set(ilk.asNumber() + j, x));
          i += 2;
        } else if (ikinci instanceof PDFNumber) {
          const son = w.lookup(i + 2);
          if (!(son instanceof PDFNumber)) break;
          for (let k = ilk.asNumber(); k <= ikinci.asNumber(); k++) tablo.set(k, son.asNumber());
          i += 3;
        } else break;
      }
    }
    return { ikiBayt: true, genislik: (kod) => (tablo.get(kod) ?? dw) / 1000 };
  }
  const genislikler = sayilar(yt.lookupMaybe(ad('Widths'), PDFArray));
  const ilkKod = yt.lookupMaybe(ad('FirstChar'), PDFNumber)?.asNumber() ?? 0;
  const tanim = yt.lookupMaybe(ad('FontDescriptor'), PDFDict);
  const eksik = tanim?.lookupMaybe(ad('MissingWidth'), PDFNumber)?.asNumber();
  if (genislikler) {
    // Type3 genişlikleri harf uzayındadır; FontMatrix ile metin uzayına çevrilir.
    const olcek = tur && adMetni(tur) === 'Type3' ? (sayilar(yt.lookupMaybe(ad('FontMatrix'), PDFArray))?.[0] ?? 0.001) : 0.001;
    return {
      ikiBayt: false,
      genislik: (kod) => {
        const x = genislikler[kod - ilkKod];
        if (x !== undefined) return x * olcek;
        return eksik !== undefined ? eksik * olcek : null;
      },
    };
  }
  const std = standartGenislik(taban, farklar(yt));
  return { ikiBayt: false, genislik: std ?? (() => (eksik !== undefined ? eksik / 1000 : null)) };
}

let adSayaci = 0;

// Kaynak sözlüğü için ayiklama arayüzü. Form değişirse kaynak sözlüğünün kopyası açılır (yaz-üzerine-kopya);
// `sozluk()` değişmiş olanı ya da asılını verir.
function kaynakKur(context: PDFContext, asil: PDFDict | undefined) {
  let kopya: PDFDict | null = null;
  let xKopya: PDFDict | null = null;
  const yaziTipleri = new Map<string, YaziTipi | null>();
  const altSozluk = (d: PDFDict | undefined, n: string) => d?.lookupMaybe(ad(n), PDFDict);
  const xYaz = (): PDFDict => {
    if (!kopya) kopya = asil ? asil.clone(context) : context.obj({});
    if (!xKopya) {
      xKopya = altSozluk(asil, 'XObject')?.clone(context) ?? context.obj({});
      kopya.set(ad('XObject'), xKopya);
    }
    return xKopya;
  };
  const kaynaklar: Kaynaklar = {
    yaziTipi(n) {
      if (!yaziTipleri.has(n)) {
        const yt = altSozluk(asil, 'Font')?.lookupMaybe(ad(n), PDFDict);
        yaziTipleri.set(n, yt ? yaziTipiOku(yt) : null);
      }
      return yaziTipleri.get(n) ?? null;
    },
    disNesne(n): DisNesne | null {
      const deger = altSozluk(asil, 'XObject')?.get(ad(n));
      const akis = deger ? context.lookup(deger) : undefined;
      if (!(akis instanceof PDFStream)) return null;
      const tur = akis.dict.lookupMaybe(ad('Subtype'), PDFName);
      const turAdi = tur ? adMetni(tur) : '';
      if (turAdi === 'Image') return { tur: 'resim' };
      if (turAdi !== 'Form') return { tur: 'diger' };
      const m = sayilar(akis.dict.lookupMaybe(ad('Matrix'), PDFArray));
      const matris: Matris = m?.length === 6 ? (m as Matris) : [1, 0, 0, 1, 0, 0];
      const ic = kaynakKur(context, akis.dict.lookupMaybe(ad('Resources'), PDFDict));
      return {
        tur: 'form', matris, icerik: akisBaytlari(akis), kaynaklar: ic.kaynaklar,
        yaz: (sonuc: AyiklamaSonucu) => {
          const kaynakSozlugu = ic.sozluk(sonuc.kullanilanNesneler);
          const yeni = context.flateStream(sonuc.icerik);
          for (const [k, v] of akis.dict.entries()) {
            const a = adMetni(k);
            if (a !== 'Filter' && a !== 'DecodeParms' && a !== 'Length' && a !== 'Resources' && a !== 'Metadata' && a !== 'PieceInfo') yeni.dict.set(k, v);
          }
          if (kaynakSozlugu) yeni.dict.set(ad('Resources'), kaynakSozlugu);
          adSayaci += 1;
          const yeniAd = `TmiAyk${String(adSayaci)}`;
          xYaz().set(ad(yeniAd), context.register(yeni));
          return yeniAd;
        },
      };
    },
  };
  // Değişen içerikte artık kullanılmayan dış nesneler sözlükten çıkarılır; böylece silinen resim yeni belgeye kopyalanmaz.
  const sozluk = (kullanilan: ReadonlySet<string>): PDFDict | undefined => {
    const x = xYaz();
    for (const k of x.keys()) if (!kullanilan.has(adMetni(k))) x.delete(k);
    return kopya ?? asil;
  };
  return { kaynaklar, sozluk };
}

const bosSayac = (): Sayac => ({ yazi: 0, resim: 0, cizim: 0, ortulenResim: 0 });

function notlariAyikla(sayfa: PDFPage, alanlar: readonly Alan[]): number {
  const notlar = sayfa.node.Annots();
  if (!notlar) return 0;
  const kalan: PDFObject[] = [];
  let silinen = 0;
  for (let i = 0; i < notlar.size(); i++) {
    const n = notlar.lookup(i);
    const r = n instanceof PDFDict ? sayilar(n.lookupMaybe(ad('Rect'), PDFArray)) : null;
    const degiyor = r?.length === 4 && alanlar.some((a) =>
      Math.min(r[0]!, r[2]!) <= a.x + a.en && Math.max(r[0]!, r[2]!) >= a.x && Math.min(r[1]!, r[3]!) <= a.y + a.boy && Math.max(r[1]!, r[3]!) >= a.y);
    if (degiyor) silinen++;
    else kalan.push(notlar.get(i));
  }
  if (silinen > 0) sayfa.node.set(ad('Annots'), sayfa.doc.context.obj(kalan));
  return silinen;
}

// Alanlar PDF kullanıcı uzayındadır (pdfKutusu); sayfa içeriğinin başlangıç dönüşümü birimdir.
export function sayfadanAyikla(sayfa: PDFPage, alanlar: readonly Alan[]): Sayac & { not: number } {
  if (alanlar.length === 0) return { ...bosSayac(), not: 0 };
  const context = sayfa.doc.context;
  const icerikNesnesi = sayfa.node.get(ad('Contents'));
  const icerik = icerikNesnesi ? context.lookup(icerikNesnesi) : undefined;
  const parcalar: Uint8Array[] = [];
  if (icerik instanceof PDFArray) for (let i = 0; i < icerik.size(); i++) parcalar.push(akisBaytlari(icerik.lookup(i)));
  else if (icerik) parcalar.push(akisBaytlari(icerik));
  // Akış parçaları arasında belirteç bölünmesin diye satır sonuyla birleştirilir (PDF 32000-1 7.8.2).
  const uzunluk = parcalar.reduce((t, p) => t + p.length + 1, 0);
  const tum = new Uint8Array(uzunluk);
  let k = 0;
  for (const p of parcalar) { tum.set(p, k); k += p.length; tum[k++] = 10; }

  const kok = kaynakKur(context, sayfa.node.Resources());
  const sonuc = ayikla(tum, kok.kaynaklar, alanlar);
  const not = notlariAyikla(sayfa, alanlar);
  if (sonuc.degisti) {
    sayfa.node.set(ad('Contents'), context.register(context.flateStream(sonuc.icerik)));
    const kaynak = kok.sozluk(sonuc.kullanilanNesneler);
    if (kaynak) sayfa.node.set(ad('Resources'), kaynak);
    // Küçük resim ve sayfa künyesi eski görünümü taşır.
    for (const n of ['Thumb', 'Metadata', 'PieceInfo']) sayfa.node.delete(ad(n));
  }
  return { ...sonuc.sayac, not };
}
