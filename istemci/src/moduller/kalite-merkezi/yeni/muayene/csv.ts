import { csvIndir, type CsvDegeri } from '../../../../ortak/veri/csv.ts';
import type { KmKayit } from '../tipler.ts';

export type CsvSutunlari = readonly (readonly [string, string])[];

// Uygulamanın exportCsv'si: koleksiyonun bütün kayıtları (arşivli dahil, sıkılık yeniden başlatma kaydı hariç), uygulamadaki sütunlarla.
export function csvSatirlari(satirlar: readonly KmKayit[], sutunlar: CsvSutunlari): CsvDegeri[][] {
  return satirlar.filter((r) => r.tip !== 'reset').map((r) => sutunlar.map(([k]): CsvDegeri => {
    const v = r[k];
    if (Array.isArray(v)) return v.join(' | ');
    if (typeof v === 'number') return v;
    return v === null || v === undefined ? '' : String(v);
  }));
}

export function kayitCsvIndir(ad: string, satirlar: readonly KmKayit[], sutunlar: CsvSutunlari): void {
  csvIndir(ad, sutunlar.map(([, b]) => b), csvSatirlari(satirlar, sutunlar));
}
