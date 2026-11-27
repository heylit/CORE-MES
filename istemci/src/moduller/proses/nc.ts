import type { NcDurumu, NcKontrolu, ProsesNcProgrami, ProsesOperasyonu } from '#paylasilan/sozlesme/proses.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';

export const NC_DURUM: Record<NcDurumu, { metin: string; ton: RozetTonu }> = {
  taslak: { metin: 'Taslak', ton: 'uyari' },
  dogrulandi: { metin: 'Doğrulandı', ton: 'bilgi' },
  onayli: { metin: 'Onaylı', ton: 'tamam' },
  eski: { metin: 'Eski', ton: 'pasif' },
};

export const NC_KONTROL: Record<NcKontrolu, string> = { heidenhain: 'Heidenhain', iso: 'ISO' };

export const TUM_REVIZYONLAR = 'Tüm revizyonlar';

const sayi = (x: string): number => Number(x);
export const dk = (x: string | null): string =>
  (x === null ? '—' : `${sayi(x).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} dk`);

// CAM çevrimi ile rotanın birim süresi farkı: "+0,7 dk"; biri yoksa ya da eşitse null.
export function sureFarki(cam: string | null, rota: string | null): string | null {
  if (cam === null || rota === null) return null;
  const f = Math.round((sayi(cam) - sayi(rota)) * 10) / 10;
  if (f === 0) return null;
  return `${f > 0 ? '+' : '−'}${Math.abs(f).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} dk`;
}

export interface OperasyonGrubu { op: ProsesOperasyonu | null; opNo: number; programlar: ProsesNcProgrami[] }

// Liste operasyon sırasıyla: rotadaki fason olmayan her operasyon (programsız olan "program ekle" satırıyla) ve rotada artık olmayan
// operasyonun programları sonda. Programlar sunucunun sırasıyla (eski olanlar sonda) kalır.
export function operasyonGruplari(operasyonlar: readonly ProsesOperasyonu[], programlar: readonly ProsesNcProgrami[]): OperasyonGrubu[] {
  const gruplar: OperasyonGrubu[] = operasyonlar.filter((o) => !o.fason).map((op) => ({ op, opNo: op.opNo, programlar: programlar.filter((p) => p.opNo === op.opNo) }));
  const rotadaki = new Set(gruplar.map((g) => g.opNo));
  for (const opNo of [...new Set(programlar.map((p) => p.opNo))].filter((n) => !rotadaki.has(n)).sort((a, b) => a - b)) {
    gruplar.push({ op: null, opNo, programlar: programlar.filter((p) => p.opNo === opNo) });
  }
  return gruplar;
}
