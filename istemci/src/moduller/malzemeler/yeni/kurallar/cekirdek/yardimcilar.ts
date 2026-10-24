import { UNITS } from './durum.ts';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s: unknown): string { return (String(s ?? '').replace(/[&<>"']/g, c => ESC[c] ?? c)); }
export function clone<T>(o: T): T { return (JSON.parse(JSON.stringify(o)) as T); }
export function isNum(v: unknown): v is number { return (typeof v === 'number' && isFinite(v)); }
export function parseNum(s: unknown): number | '' { s = String(s).trim().replace(/\s/g, '').replace(',', '.'); if (s === '' || s === '-')
    return ''; const n = Number(s); return isFinite(n) ? n : ''; }
export function fmt<T>(v: T, md?: number): string | Exclude<NonNullable<T>, number> { return (isNum(v) ? v.toLocaleString('tr-TR', { maximumFractionDigits: md ?? (Math.abs(v) < 1 ? 4 : Math.abs(v) < 100 ? 2 : 1) }) : (v ?? '') as string | Exclude<NonNullable<T>, number>); }
export function fmtD(v: number): string { return (v.toLocaleString('tr-TR', { maximumFractionDigits: 3, useGrouping: false })); }
export function r4(v: number): number { return (Math.round(v * 1e4) / 1e4); }
export function IMP(): boolean { return (UNITS === 'imp'); }
export function kgFmt(kg: unknown): string { return (!isNum(kg) ? '—' : IMP() ? (kg * 2.20462 < 1 ? fmt(r4(kg * 35.274), 2) + ' oz' : fmt(kg * 2.20462, kg * 2.20462 < 100 ? 3 : 1) + ' lb') : kg < 1 ? fmt(r4(kg * 1000), 1) + ' g' : fmt(kg, kg < 100 ? 3 : 1) + ' kg'); }
export function perMFmt(v: number): string { return (IMP() ? fmt(v * 0.671969, 3) + ' lb/ft' : fmt(v, 3) + ' kg/m'); }
export function perM2Fmt(v: number): string { return (IMP() ? fmt(v * 0.204816, 3) + ' lb/ft²' : fmt(v, 3) + ' kg/m²'); }
export function tlc(s: unknown): string { return (String(s).toLocaleLowerCase('tr')); }
export function cleanKod(s: unknown): string { return (String(s).toLocaleUpperCase('tr').replace(/[^A-Z0-9ÇĞİÖŞÜ.]/g, '')); }
