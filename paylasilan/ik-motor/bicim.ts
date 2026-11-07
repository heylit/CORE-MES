// İK hesap motorunun tek kaynağıdır (211 a): bordro, izin, tazminat ve parametre dönemi hesaplarını ekran (tahmin) ve sunucu
// (kesinleştirme) aynı koddan yapar (kaynak: ik-modulu src/core). Ekranın kullandığı tipli yüz arayuz.ts'tedir.
/**
 * İK Modülü – biçimlendirme, tarih ve doğrulama yardımcıları.
 * Saf fonksiyonlar; tarayıcıda ve Node.js'te çalışır.
 */
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';

const KACIS: Readonly<Record<string, string>> = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, c => KACIS[c]!);
const uid = (p: string): string => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = (n: unknown): string => String(n).padStart(2, '0');
const num = (v: unknown): number => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const lower = (s: unknown): string => String(s ?? '').toLocaleLowerCase('tr');
// Sunucuda bugün tesisin günüdür (sunucunun saat dilimi karışmaz); motor tarihleri yerel gece yarısı Date olarak taşır.
function today(): Date { return pd(tesisGunu(new Date())) as Date; }
function pd(s: unknown): Date | null { if(!s || typeof s !== 'string') return null; const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(!m) return null; return new Date(+m[1]!, +m[2]!-1, +m[3]!); }
function ymd(d: Date): string { return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function addMonths(d: Date, n: number): Date { const x = new Date(d); const day = x.getDate(); x.setDate(1); x.setMonth(x.getMonth()+n); const last = new Date(x.getFullYear(), x.getMonth()+1, 0).getDate(); x.setDate(Math.min(day, last)); return x; }
function addYears(d: Date, n: number): Date { return addMonths(d, 12*n); }
function diffDays(a: Date, b: Date): number { return Math.round((+b - +a) / 864e5); }
function fullYears(a: Date, b: Date): number { let y = b.getFullYear() - a.getFullYear(); if(b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) y--; return y; }
interface Sure { y: number; m: number; d: number }
function durationParts(a: Date | null | undefined, b: Date | null | undefined): Sure {
  if(!a || !b || b < a) return {y:0, m:0, d:0};
  let y = fullYears(a, b); let c = addYears(a, y); let m = 0;
  while(addMonths(c, 1) <= b){ c = addMonths(c, 1); m++; }
  return {y, m, d: diffDays(c, b)};
}
function durationText(a: Date | null | undefined, b: Date | null | undefined): string {
  const p = durationParts(a, b); const out: string[] = [];
  if(p.y) out.push(p.y + ' yıl'); if(p.m) out.push(p.m + ' ay'); if(!p.y && !p.m) out.push(p.d + ' gün');
  return out.join(' ');
}
const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const DAYS_SHORT = ['Pz','Pt','Sa','Ça','Pe','Cu','Ct'];
function fmtDate(s: string | Date | null | undefined): string { const d = typeof s === 'string' ? pd(s) : s; if(!d) return '—'; return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
function fmtDateShort(s: string | Date | null | undefined): string { const d = typeof s === 'string' ? pd(s) : s; if(!d) return '—'; return pad(d.getDate()) + '.' + pad(d.getMonth()+1) + '.' + d.getFullYear(); }
const _money = new Intl.NumberFormat('tr-TR', {style:'currency', currency:'TRY', maximumFractionDigits:2, minimumFractionDigits:2});
const _money0 = new Intl.NumberFormat('tr-TR', {style:'currency', currency:'TRY', maximumFractionDigits:0});
const _n = new Intl.NumberFormat('tr-TR', {maximumFractionDigits:2});
const fmtMoney = (v: unknown, whole?: unknown): string => (v === '' || v == null || isNaN(v as number)) ? '—' : (whole ? _money0 : _money).format(v as number);
const fmtNum = (v: unknown): string => _n.format((v || 0) as number);
function relDay(d: Date): string { const n = diffDays(today(), d); if(n === 0) return 'Bugün'; if(n === 1) return 'Yarın'; if(n === -1) return 'Dün'; return n > 0 ? n + ' gün sonra' : (-n) + ' gün önce'; }
function validTCKN(t: string): boolean {
  if(!/^[1-9]\d{10}$/.test(t)) return false; const d = t.split('').map(Number) as [number, number, number, number, number, number, number, number, number, number, number];
  const d10 = ((d[0]+d[2]+d[4]+d[6]+d[8])*7 - (d[1]+d[3]+d[5]+d[7])) % 10;
  const d10n = (d10 + 10) % 10; if(d10n !== d[9]) return false;
  return d.slice(0,10).reduce((a,b)=>a+b,0) % 10 === d[10];
}
function mod97(str: string): number { let r = 0; for(const ch of str){ r = (r*10 + (+ch)) % 97; } return r; }
function ibanNumeric(s: string): string { return s.replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55)); }
function validIBAN(raw: string): boolean { const s = raw.replace(/\s+/g,'').toUpperCase(); if(!/^TR\d{24}$/.test(s)) return false; return mod97(ibanNumeric(s.slice(4) + s.slice(0,4))) === 1; }
function fmtIBAN(raw: unknown): string { return String(raw||'').replace(/\s+/g,'').toUpperCase().replace(/(.{4})/g,'$1 ').trim(); }
const lines = (s: unknown): string[] => String(s||'').split('\n').map(x => x.trim()).filter(Boolean);
// JSON kopyası: tarih metne döner, işlev ve undefined alan düşer.
const deep = <T>(o: T): T => o === undefined ? o : JSON.parse(JSON.stringify(o)) as T;
function nextOccurrence(dateStr: unknown, from: Date): Date | null { const d = pd(dateStr); if(!d) return null; let x = new Date(from.getFullYear(), d.getMonth(), d.getDate()); if(x < from) x = new Date(from.getFullYear()+1, d.getMonth(), d.getDate()); return x; }
function perfAvg(p: { skorlar?: Record<string, unknown> }): number { const v = Object.values(p.skorlar || {}).map(num).filter(x => x > 0); return v.length ? v.reduce((a,b)=>a+b,0) / v.length : 0; }
function perfLabel(a: number): [string, string] { if(!a) return ['Puanlanmadı','']; if(a >= 4.5) return ['Beklentinin çok üzerinde','ok']; if(a >= 3.5) return ['Beklentinin üzerinde','ok']; if(a >= 2.5) return ['Beklentiyi karşılıyor','info']; if(a >= 1.5) return ['Gelişime açık','warn']; return ['Beklentinin altında','bad']; }

export { esc, uid, pad, num, lower, today, pd, ymd, addDays, addMonths, addYears, diffDays, fullYears, durationParts, durationText, MONTHS, DAYS_SHORT, fmtDate, fmtDateShort, _money, _money0, _n, fmtMoney, fmtNum, relDay, validTCKN, mod97, ibanNumeric, validIBAN, fmtIBAN, lines, deep, nextOccurrence, perfAvg, perfLabel };
