// 2477: rapor Excel'i. Kitaplık depodaki exceljs'tir (package.json 4.4.0) ve yalnız Excel düğmesine basılınca yüklenir; dış adrese gidilmez.
// Her bölüm bir sayfadır; sayı sayı, tarih tarih olarak yazılır (Excel'de süzülür ve toplanır).
import type * as ExcelJsModulu from 'exceljs';
import type { Rapor } from './sablonlar.ts';

type ExcelJs = typeof ExcelJsModulu;
let yukleniyor: Promise<ExcelJs> | null = null;
function exceljsYukle(): Promise<ExcelJs> {
  yukleniyor ??= import('exceljs').then((m) => ((m as { default?: ExcelJs }).default ?? m)).catch((e: unknown) => { yukleniyor = null; throw e; });
  return yukleniyor;
}

const BICIM = { tl: '#,##0', yuzde: '0.0', sayi: '#,##0.##', tarih: 'dd.mm.yyyy' } as const;
// Excel sayfa adı en çok 31 karakterdir ve []:*?/\ içeremez.
export const sayfaAdi = (ad: string, kullanilan: ReadonlySet<string>): string => {
  const kok = ad.replace(/[[\]:*?/\\]/g, ' ').slice(0, 28).trim() || 'Sayfa';
  let a = kok, n = 2;
  while (kullanilan.has(a)) a = `${kok} ${String(n++)}`;
  return a;
};

export async function raporExceli(r: Rapor): Promise<ArrayBuffer> {
  const E = await exceljsYukle();
  const wb = new E.Workbook();
  const adlar = new Set<string>();
  for (const b of r.bolumler) {
    const ad = sayfaAdi(b.baslik, adlar);
    adlar.add(ad);
    const ws = wb.addWorksheet(ad);
    ws.addRow([r.baslik]).font = { bold: true };
    ws.addRow([r.altBaslik]);
    ws.addRow([]);
    ws.addRow(b.sutunlar.map((s) => s.ad)).font = { bold: true };
    for (const satir of b.satirlar) {
      ws.addRow(satir.map((h, i) => (b.sutunlar[i]?.tur === 'tarih' && typeof h === 'string' ? new Date(`${h}T00:00:00Z`) : h)));
    }
    b.sutunlar.forEach((s, i) => {
      const k = ws.getColumn(i + 1);
      k.width = Math.min(48, Math.max(12, s.ad.length + 2, ...b.satirlar.map((x) => String(x[i] ?? '').length + 2)));
      if (s.tur !== 'metin') k.numFmt = BICIM[s.tur];
    });
    if (b.not) { ws.addRow([]); ws.addRow([b.not]); }
  }
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export function indir(dosyaAdi: string, veri: ArrayBuffer): void {
  const url = URL.createObjectURL(new Blob([veri], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${dosyaAdi}.xlsx`;
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); }, 0);
}
