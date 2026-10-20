import { SATIR_ARALIGI, type OnizlemeOgesi, type YaziciDili } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { HARF_ORANI, noktaya, qrDikdortgenleri, qrModulNoktasi } from './kurallar.ts';

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
    } else {
      const h = Math.max(1, n(o.yaziMm));
      o.satirlar.forEach((s, i) => {
        const y = n(o.y + i * o.yaziMm * SATIR_ARALIGI);
        const alan = `^A0N,${h},${h}^FH_^FD${zplKacir(s)}^FS`;
        satirlar.push(`^FO${n(o.x)},${y}${alan}`);
        // Yerleşik yazı tipinde kalın yok: bir nokta kaydırılmış ikinci baskı.
        if (o.kalin) satirlar.push(`^FO${n(o.x) + 1},${y}${alan}`);
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
    } else {
      const { no, carpan } = pplbYaziSecimi(n(o.yaziMm), g.dpi);
      o.satirlar.forEach((s, i) => {
        const y = n(o.y + i * o.yaziMm * SATIR_ARALIGI);
        satirlar.push(`A${n(o.x)},${y},0,${no},${carpan},${carpan},N,"${pplbKacir(s)}"`);
        if (o.kalin) satirlar.push(`A${n(o.x) + 1},${y},0,${no},${carpan},${carpan},N,"${pplbKacir(s)}"`);
      });
    }
  }
  satirlar.push(`P${g.adet}`);
  return `${satirlar.join('\n')}\n`;
}

export const KOMUT_URETICILERI: Record<YaziciDili, (g: CiktiGirdisi) => string> = { zpl, pplb };
