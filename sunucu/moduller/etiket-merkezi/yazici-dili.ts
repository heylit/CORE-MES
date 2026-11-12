import { SATIR_ARALIGI, type OnizlemeOgesi, type YaziciDili } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { HARF_ORANI, noktaya, qrDikdortgenleri, qrModulNoktasi } from './kurallar.ts';
import { noktaDikdortgenleri, simgeNoktalari } from './piktogram.ts';

// Yerleşimi yazıcı diline çeviren saf fonksiyonlar. Komutlar Zebra ZPL II ve Argox PPLB kılavuzlarındaki temel komutlardır;
// atölyedeki yazıcıda denenmeden "doğrulanmadı" sayılır (Yazıcı denemesi şablonu bunun içindir).

export interface CiktiGirdisi { genislik: number; yukseklik: number; ogeler: OnizlemeOgesi[]; dpi: number; adet: number }

// EM-5: ZPL'de ^ ve ~ komut başlatır; alan ^FH ile onaltılık kaçışla yazılır, kaçış karakteri de kaçırılır.
export const zplKacir = (metin: string): string => metin.replace(/[_^~]/g, (h) => `_${h.charCodeAt(0).toString(16).toUpperCase()}`);

// EM-6: PPLB'de metin çift tırnak içindedir; tırnak ve ters bölü kaçırılır.
export const pplbKacir = (metin: string): string => metin.replace(/[\\"]/g, (h) => `\\${h}`);

export function zpl(g: CiktiGirdisi): string {
  const n = (mm: number) => noktaya(mm, g.dpi);
  const satirlar = ['^XA', '^CI28', `^PW${n(g.genislik)}`, `^LL${n(g.yukseklik)}`, '^LH0,0'];
  for (const o of g.ogeler) {
    if (o.tur === 'kutu') {
      const t = Math.max(1, n(o.kalinlik));
      satirlar.push(`^FO${n(o.x)},${n(o.y)}^GB${Math.max(t, n(o.genislik))},${Math.max(t, n(o.yukseklik))},${t}^FS`);
    } else if (o.tur === 'qr') {
      const modul = qrModulNoktasi(n(o.boyut), o.kareler.length);
      for (const d of qrDikdortgenleri(o.kareler, n(o.x), n(o.y), modul)) {
        satirlar.push(`^FO${d.x},${d.y}^GB${d.genislik},${d.yukseklik},${Math.min(d.genislik, d.yukseklik)}^FS`);
      }
    } else if (o.tur === 'simge') {
      for (const d of noktaDikdortgenleri(simgeNoktalari(o.ad, o.karo, n(o.boyut)), n(o.x), n(o.y))) {
        satirlar.push(`^FO${d.x},${d.y}^GB${d.genislik},${d.yukseklik},${Math.min(d.genislik, d.yukseklik)}^FS`);
      }
    } else {
      const h = Math.max(1, n(o.yaziMm));
      o.satirlar.forEach((s, i) => {
        const y = n(o.y + i * o.yaziMm * SATIR_ARALIGI);
        // ^FR alanı alttaki baskıya göre tersler (siyah zeminde beyaz yazı); kılavuzdan, cihazda doğrulanmadı.
        const alan = `${o.ters ? '^FR' : ''}^A0N,${h},${h}^FH_^FD${zplKacir(s)}^FS`;
        satirlar.push(`^FO${n(o.x)},${y}${alan}`);
        // Yerleşik yazı tipinde kalın yok: bir nokta kaydırılmış ikinci baskı. Ters yazıda ikinci baskı ilkini geri tersler; atlanır.
        if (o.kalin && !o.ters) satirlar.push(`^FO${n(o.x) + 1},${y}${alan}`);
      });
    }
  }
  satirlar.push(`^PQ${g.adet}`, '^XZ');
  return `${satirlar.join('\n')}\n`;
}

// PPLB yerleşik yazı tipleri (genişlik x yükseklik, nokta) ve çarpanları; değerler kılavuzdan, cihazda doğrulanmadı.
const PPLB_YAZI: Record<number, { no: number; g: number; y: number }[]> = {
  203: [{ no: 1, g: 8, y: 12 }, { no: 2, g: 10, y: 16 }, { no: 3, g: 12, y: 20 }, { no: 4, g: 14, y: 24 }, { no: 5, g: 32, y: 48 }],
  300: [{ no: 1, g: 12, y: 20 }, { no: 2, g: 16, y: 28 }, { no: 3, g: 20, y: 36 }, { no: 4, g: 24, y: 44 }, { no: 5, g: 48, y: 80 }],
};

// İstenen yüksekliği aşmayan ve satır bölmede varsayılan harf genişliğine sığan en büyük yazı tipi ve çarpan.
export function pplbYaziSecimi(yukseklikNokta: number, dpi: number): { no: number; carpan: number } {
  let secim = { no: 1, carpan: 1, boy: 0 };
  for (const yazi of PPLB_YAZI[dpi] ?? PPLB_YAZI[203] ?? []) {
    for (let carpan = 1; carpan <= 6; carpan++) {
      const boy = yazi.y * carpan;
      if (boy <= yukseklikNokta && yazi.g * carpan <= yukseklikNokta * HARF_ORANI && boy > secim.boy) secim = { no: yazi.no, carpan, boy };
    }
  }
  return { no: secim.no, carpan: secim.carpan };
}

// Etiketler arası boşluk (aralık) varsayılan 3 mm; rulo farklıysa yazıcı tanımında değişecek.
export const PPLB_ARALIK_MM = 3;

export function pplb(g: CiktiGirdisi): string {
  const n = (mm: number) => noktaya(mm, g.dpi);
  const satirlar = ['', 'N', `q${n(g.genislik)}`, `Q${n(g.yukseklik)},${n(PPLB_ARALIK_MM)}`];
  for (const o of g.ogeler) {
    if (o.tur === 'kutu') {
      const t = Math.max(1, n(o.kalinlik));
      satirlar.push(`X${n(o.x)},${n(o.y)},${t},${n(o.x + o.genislik)},${n(o.y + o.yukseklik)}`);
    } else if (o.tur === 'qr') {
      const modul = qrModulNoktasi(n(o.boyut), o.kareler.length);
      for (const d of qrDikdortgenleri(o.kareler, n(o.x), n(o.y), modul)) satirlar.push(`LO${d.x},${d.y},${d.genislik},${d.yukseklik}`);
    } else if (o.tur === 'simge') {
      for (const d of noktaDikdortgenleri(simgeNoktalari(o.ad, o.karo, n(o.boyut)), n(o.x), n(o.y))) satirlar.push(`LO${d.x},${d.y},${d.genislik},${d.yukseklik}`);
    } else {
      const { no, carpan } = pplbYaziSecimi(n(o.yaziMm), g.dpi);
      // R: ters yazı (kılavuzdan, cihazda doğrulanmadı); ters yazıda kalın için ikinci baskı yapılmaz.
      const kip = o.ters ? 'R' : 'N';
      o.satirlar.forEach((s, i) => {
        const y = n(o.y + i * o.yaziMm * SATIR_ARALIGI);
        satirlar.push(`A${n(o.x)},${y},0,${no},${carpan},${carpan},${kip},"${pplbKacir(s)}"`);
        if (o.kalin && !o.ters) satirlar.push(`A${n(o.x) + 1},${y},0,${no},${carpan},${carpan},N,"${pplbKacir(s)}"`);
      });
    }
  }
  satirlar.push(`P${g.adet}`);
  return `${satirlar.join('\n')}\n`;
}

export const KOMUT_URETICILERI: Record<YaziciDili, (g: CiktiGirdisi) => string> = { zpl, pplb };

// 3074 a: yazıcı denemesinin ek etiketleri. Kılavuzdan yazılan ve cihazda doğrulanmamış üç şey tek baskıda görülür: Türkçe harfin
// hangi kod sayfasıyla doğru çıktığı, yerleşik yazı tiplerinin gerçek harf adımı (5 mm'lik cetvele karşı) ve siyah zeminde ters
// yazının hangi yolla okunduğu. Komut değerleri (I8 kod sayfası harfleri, LE) EPL2/PPLB kılavuzundandır, doğrulanmadı.
export const DENEME_TURKCE = 'ÇĞİÖŞÜ çğıöşü';
const CP857: Record<string, number> = { Ç: 0x80, ü: 0x81, ç: 0x87, ı: 0x8d, ö: 0x94, İ: 0x98, Ö: 0x99, Ü: 0x9a, Ş: 0x9e, ş: 0x9f, Ğ: 0xa6, ğ: 0xa7 };
const CP1254: Record<string, number> = { Ç: 0xc7, Ğ: 0xd0, Ö: 0xd6, Ü: 0xdc, İ: 0xdd, Ş: 0xde, ç: 0xe7, ğ: 0xf0, ö: 0xf6, ü: 0xfc, ı: 0xfd, ş: 0xfe };
export const DENEME_KOD_SAYFALARI = [{ ad: '857', komut: 'I8,6,001', tablo: CP857 }, { ad: '1254', komut: 'I8,E,001', tablo: CP1254 }] as const;
// Komut dizesinde her karakter bir bayttır (komutBaytlari, I8 satırı olan komut).
export const kodSayfasinda = (metin: string, tablo: Readonly<Record<string, number>>): string =>
  [...metin].map((h) => String.fromCharCode(tablo[h] ?? (h.charCodeAt(0) < 0x80 ? h.charCodeAt(0) : 0x3f))).join('');
// Denemeden sonra yazıcı kılavuzdaki varsayılan kod sayfasına (437) döner; bugünkü etiketler UTF-8 gider, bundan etkilenmez.
const VARSAYILAN_KOD_SAYFASI = 'I8,0,001';

export function pplbDenemesi(g: { genislik: number; yukseklik: number; dpi: number }): string {
  const n = (mm: number) => noktaya(mm, g.dpi);
  const bas = ['', 'N', `q${n(g.genislik)}`, `Q${n(g.yukseklik)},${n(PPLB_ARALIK_MM)}`];
  const x = n(2);
  const etiketler: string[][] = [];
  for (const s of DENEME_KOD_SAYFALARI) {
    etiketler.push([...bas, s.komut, `A${x},${n(2)},0,2,1,1,N,"KOD SAYFASI ${s.ad} (${s.komut})"`,
      `A${x},${n(6)},0,4,1,1,N,"${kodSayfasinda(DENEME_TURKCE, s.tablo)}"`, `A${x},${n(11)},0,2,1,1,N,"Dogru cikan satiri bildirin"`, 'P1']);
  }
  // Cetvel: 40 mm, 5 mm'de bir çentik; altında yazı 1-5 ile on rakam (beklenen adım: kılavuz tablosu).
  const cetvel = [`LO${x},${n(2)},${n(40)},1`, ...Array.from({ length: 9 }, (_, i) => `LO${x + n(i * 5)},${n(2)},1,${n(i % 2 === 0 ? 2 : 1)}`)];
  let y = n(5);
  const rakamlar = (PPLB_YAZI[g.dpi] ?? PPLB_YAZI[203] ?? []).map((f) => {
    const satir = `A${x},${y},0,${f.no},1,1,N,"0123456789"`;
    y += f.y + n(0.8);
    return satir;
  });
  etiketler.push([...bas, ...cetvel, ...rakamlar, 'P1']);
  // Ters yazı: solda bugünkü yol (dolu kutu üstüne R), sağda düz yazı ve üstüne LE (XOR) kutusu.
  const k = { y: n(6), en: n(Math.min(40, g.genislik / 2 - 4)), boy: n(6) };
  const sag = x + k.en + n(4);
  etiketler.push([...bas, `A${x},${n(2)},0,2,1,1,N,"R"`, `A${sag},${n(2)},0,2,1,1,N,"LE"`,
    `X${x},${k.y},${k.boy},${x + k.en},${k.y + k.boy}`, `A${x + n(1)},${k.y + n(1)},0,3,1,1,R,"TERS 1"`,
    `A${sag + n(1)},${k.y + n(1)},0,3,1,1,N,"TERS 2"`, `LE${sag},${k.y},${k.en},${k.boy}`, 'P1']);
  return `${etiketler.map((e) => e.join('\n')).join('\n')}\n${VARSAYILAN_KOD_SAYFASI}\n`;
}

// ZPL'de Türkçe ^CI28 ile gider ve ters yazı ana deneme etiketindedir; ek etiket yalnız ^A0 harf adımı cetvelidir.
export function zplDenemesi(g: { genislik: number; yukseklik: number; dpi: number }): string {
  const n = (mm: number) => noktaya(mm, g.dpi);
  const x = n(2);
  const satirlar = ['^XA', '^CI28', `^PW${n(g.genislik)}`, `^LL${n(g.yukseklik)}`, '^LH0,0', `^FO${x},${n(2)}^GB${n(40)},1,1^FS`,
    ...Array.from({ length: 9 }, (_, i) => `^FO${x + n(i * 5)},${n(2)}^GB1,${n(i % 2 === 0 ? 2 : 1)},1^FS`)];
  let y = n(5);
  for (const boy of [2, 3, 4, 6]) {
    const h = n(boy);
    satirlar.push(`^FO${x},${y}^A0N,${h},${h}^FD0123456789 (${boy} mm)^FS`);
    y += h + n(0.8);
  }
  satirlar.push('^PQ1', '^XZ');
  return `${satirlar.join('\n')}\n`;
}
