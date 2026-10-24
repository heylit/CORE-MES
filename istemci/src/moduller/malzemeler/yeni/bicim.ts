import type { BirimSistemi } from './tipler.ts';

// Prototipin biçim yardımcıları (04-yardimcilar) aynı adla; birim sistemi genel durumdan değil bağımsız değişkenden gelir.
export const YOK = '—';

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Boş ya da yalnız eksi işareti '' döner (prototipteki gibi): alan boş kalır, sıfır uydurulmaz.
export function parseNum(s: unknown): number | '' {
  const m = String(s).trim().replace(/\s/g, '').replace(',', '.');
  if (m === '' || m === '-') return '';
  const n = Number(m);
  return Number.isFinite(n) ? n : '';
}

export function fmt(v: unknown, md?: number): string {
  if (!isNum(v)) return v === null || v === undefined ? '' : String(v);
  const mutlak = Math.abs(v);
  return v.toLocaleString('tr-TR', { maximumFractionDigits: md ?? (mutlak < 1 ? 4 : mutlak < 100 ? 2 : 1) });
}

export const fmtD = (v: number): string => v.toLocaleString('tr-TR', { maximumFractionDigits: 3, useGrouping: false });
export const r4 = (v: number): number => Math.round(v * 1e4) / 1e4;

export function kgFmt(kg: unknown, birim: BirimSistemi): string {
  if (!isNum(kg)) return YOK;
  if (birim === 'imp') {
    const lb = kg * 2.20462;
    return lb < 1 ? `${fmt(r4(kg * 35.274), 2)} oz` : `${fmt(lb, lb < 100 ? 3 : 1)} lb`;
  }
  return kg < 1 ? `${fmt(r4(kg * 1000), 1)} g` : `${fmt(kg, kg < 100 ? 3 : 1)} kg`;
}

export const perMFmt = (v: number, birim: BirimSistemi): string => (birim === 'imp' ? `${fmt(v * 0.671969, 3)} lb/ft` : `${fmt(v, 3)} kg/m`);
export const perM2Fmt = (v: number, birim: BirimSistemi): string => (birim === 'imp' ? `${fmt(v * 0.204816, 3)} lb/ft²` : `${fmt(v, 3)} kg/m²`);
export const tlc = (s: unknown): string => String(s).toLocaleLowerCase('tr');
export const cleanKod = (s: unknown): string => String(s).toLocaleUpperCase('tr').replace(/[^A-Z0-9ÇĞİÖŞÜ.]/g, '');

export const clone = <T>(o: T): T => structuredClone(o);

export function tarihMetni(t: number | null | undefined): string {
  return isNum(t) ? new Date(t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : YOK;
}
