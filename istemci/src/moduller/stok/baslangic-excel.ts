// Başlangıç stoğu dosyası (3129, 3134 a): kendi Excel'i de okunur (ortak şablon okuyucusu yalnız damgalı dosyayı açar), şablon ve
// düzeltilmiş dosya yazılır. exceljs depodaki pakettir, yalnız bu sayfada yüklenir. Dosya sunucuya gitmez (3144 a); özeti tarayıcıda hesaplanır.
import type * as ExcelJsModulu from 'exceljs';
import { sha256Yazilim } from '../../ortak/veri/ozet.ts';
import { DosyaReddi, dosyaDenetle, dosyaIndir } from '../../ortak/excel/kitap.ts';
import { TOPLU_EN_COK, basligiSadele, damga, metinYaz, type Hucre } from '../../ortak/excel/kurallar.ts';
import { hucreMetni } from '../../ortak/excel/esleme.ts';
import { BASLANGIC_ALANLARI, BASLANGIC_ALAN_ANAHTARLARI, type BaslangicSatiri, type HamSatir } from './baslangic.ts';

type ExcelJs = typeof ExcelJsModulu;
let yukleniyor: Promise<ExcelJs> | null = null;
const exceljs = (): Promise<ExcelJs> => {
  yukleniyor ??= import('exceljs').then((m) => ((m as { default?: ExcelJs }).default ?? m)).catch((e: unknown) => { yukleniyor = null; throw e; });
  return yukleniyor;
};

export const BASLANGIC_DAMGASI = damga({ ad: 'baslangic-stogu' });
const SAYFA = 'Başlangıç stoğu';
const KILAVUZ = 'Nasıl kullanılır';
const EN_COK_SUTUN = 60;
const YAZI = { name: 'Arial', size: 10 } as const;
// Dosyanın içindeki renkler (Excel'in kendi biçimi; ekran tasarım değişkenleri buraya ulaşmaz).
const ZORUNLU_ZEMIN = 'FFFCE8C3';
const BASLIK_ZEMIN = 'FFE6ECEE';

export interface OkunanDosya {
  ad: string;
  ozet: string;
  // Damgalı şablon: sütunlar başlıklarıyla kendiliğinden eşlenir, eşleme adımı atlanır.
  sablon: boolean;
  basliklar: string[];
  satirlar: HamSatir[];
}

const hucreDegeri = (v: unknown): Hucre => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v !== 'object') return v as Hucre;
  const o = v as { richText?: { text?: string }[]; result?: unknown; text?: unknown };
  if (Array.isArray(o.richText)) return o.richText.map((p) => p.text ?? '').join('');
  // Formül çalıştırılmaz: yalnız dosyada kayıtlı sonucu alınır.
  if ('formula' in o || 'sharedFormula' in o) return 'result' in o ? hucreDegeri(o.result) : null;
  if ('text' in o) return hucreDegeri(o.text);
  return null;
};
const bos = (h: Hucre): boolean => hucreMetni(h) === '';
const metinOku = (h: Hucre): Hucre => (typeof h === 'string' && /^'[=+\-@\t\r]/.test(h) ? h.slice(1) : h);

const baytlar = (dosya: Blob): Promise<ArrayBuffer> => (typeof dosya.arrayBuffer === 'function' ? dosya.arrayBuffer() : new Promise((tamam, ret) => {
  const r = new FileReader();
  r.onload = () => { tamam(r.result as ArrayBuffer); };
  r.onerror = () => { ret(r.error ?? new Error('Dosya okunamadı.')); };
  r.readAsArrayBuffer(dosya);
}));

// İlk dolu satır başlıktır; ondan sonraki boş olmayan satırlar okunur. Satır numarası Excel'deki numaradır (düzeltme ve hata onunla eşlenir).
export async function baslangicDosyasiOku(dosya: File): Promise<OkunanDosya> {
  const b = new Uint8Array(await baytlar(dosya));
  dosyaDenetle(dosya.name, b);
  const E = await exceljs();
  const wb = new E.Workbook();
  try {
    await wb.xlsx.load(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  } catch {
    throw new DosyaReddi('Dosya okunamadı. .xlsx olarak kaydedilmiş bir Excel dosyası seçin.');
  }
  const sablon = wb.subject === BASLANGIC_DAMGASI;
  const ws = (sablon ? wb.getWorksheet(SAYFA) : undefined) ?? wb.worksheets.find((w) => w.name !== KILAVUZ && w.state !== 'hidden');
  if (!ws) throw new DosyaReddi('Dosyada sayfa yok.');
  const ham: HamSatir[] = [];
  ws.eachRow({ includeEmpty: false }, (row, no) => {
    const h: Hucre[] = [];
    for (let c = 1; c <= EN_COK_SUTUN; c += 1) h.push(metinOku(hucreDegeri(row.getCell(c).value)));
    if (!h.every(bos)) ham.push({ no, hucreler: h });
  });
  const baslik = ham.shift();
  if (!baslik) throw new DosyaReddi('Dosya boş.');
  let son = baslik.hucreler.length;
  while (son > 0 && bos(baslik.hucreler[son - 1] ?? null) && ham.every((s) => bos(s.hucreler[son - 1] ?? null))) son -= 1;
  if (ham.length === 0) throw new DosyaReddi('Dosyada başlıktan sonra satır yok.');
  if (ham.length > TOPLU_EN_COK) throw new DosyaReddi(`En çok ${String(TOPLU_EN_COK)} satır; dosyayı bölün.`);
  return {
    ad: dosya.name, ozet: sha256Yazilim(b), sablon,
    basliklar: baslik.hucreler.slice(0, son).map((h, i) => basligiSadele(hucreMetni(h)) || `Sütun ${String(i + 1)}`),
    satirlar: ham.map((s) => ({ no: s.no, hucreler: s.hucreler.slice(0, son) })),
  };
}

const kilavuz = [
  'Başlangıç stoğu: fabrikada bugün duran malzeme tek seferde stoğa girer.',
  '',
  'Her satır bir gözdeki bir malzemedir. Malzeme kodu, miktar ve konum (raf-göz) kodu zorunludur (* işaretli, sarı başlık).',
  'Lot no boşsa sistem verir. Son kullanma tarihi takipli kartta zorunludur; gg.aa.yyyy yazın. Ondalık virgülle ya da noktayla yazılır.',
  'Müşterinin getirdiği malzeme bu dosyaya girmez; ayrı rafta, stoğa girmeden durur.',
  'Bütün satırlar serbest girer. Hatalı satır kalmışken hiçbir satır yazılmaz; tabloda düzeltin ya da hariç tutun.',
  'Sayfa adını ve başlıkları değiştirmeyin; değiştirirseniz sütunları yüklerken eşleştirirsiniz.',
];

async function kitapYaz(ekSutunlar: readonly string[], satirlar: readonly (readonly string[])[]): Promise<ArrayBuffer> {
  const E = await exceljs();
  const wb = new E.Workbook();
  wb.subject = BASLANGIC_DAMGASI;
  wb.title = SAYFA;
  wb.creator = 'CORE MES';
  const k = wb.addWorksheet(KILAVUZ);
  k.getColumn(1).width = 110;
  kilavuz.forEach((m, i) => { const c = k.getCell(i + 1, 1); c.value = m; c.font = i === 0 ? { ...YAZI, bold: true, size: 12 } : YAZI; c.alignment = { wrapText: true }; });
  const ws = wb.addWorksheet(SAYFA, { views: [{ state: 'frozen', ySplit: 1 }] });
  const basliklar = [...BASLANGIC_ALANLARI.map((a) => ({ ad: a.zorunlu ? `${a.baslik} *` : a.baslik, zorunlu: a.zorunlu === true })), ...ekSutunlar.map((ad) => ({ ad, zorunlu: false }))];
  basliklar.forEach((b, i) => {
    const h = ws.getCell(1, i + 1);
    h.value = b.ad;
    h.font = { ...YAZI, bold: true };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: b.zorunlu ? ZORUNLU_ZEMIN : BASLIK_ZEMIN } };
    ws.getColumn(i + 1).width = Math.max(14, b.ad.length + 4);
  });
  // Hücreler metin yazılır (Risk K9): "=" ile başlayan değer formül olmaz, kod ve lot sayıya dönmez.
  for (const s of satirlar) ws.addRow(s.map((x) => (x === '' ? null : metinYaz(x))));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: basliklar.length } };
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export async function baslangicSablonuIndir(): Promise<void> {
  dosyaIndir('baslangic-stogu-sablonu.xlsx', await kitapYaz([], []));
}

// Eşlenmiş ve düzeltilmiş satırlar damgalı şablonla iner; sonda Durum ve Hata. Yeniden yüklenince eşleme adımı atlanır.
export async function duzeltilmisDosyaIndir(ad: string, satirlar: readonly BaslangicSatiri[], durum: (s: BaslangicSatiri) => { durum: string; hata: string }): Promise<void> {
  const govde = satirlar.map((s) => {
    const d = durum(s);
    return [...BASLANGIC_ALAN_ANAHTARLARI.map((a) => (a === 'malzemeKodu' && s.malzeme ? s.malzeme.kod : a === 'konumKodu' && s.konum ? s.konum.kod : s.deger[a])), d.durum, d.hata];
  });
  dosyaIndir(`${ad.replace(/\.xlsx$/i, '')}-duzeltilmis.xlsx`, await kitapYaz(['Durum', 'Hata'], govde));
}
