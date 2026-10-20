// @ts-nocheck
// Ekrandaki (çerçevedeki uygulama) hesap motorunun aynısıdır: bordro, izin, tazminat ve parametre dönemi hesapları
// sunucuda da aynı sonucu versin diye tek kaynaktan kopyalanır (kaynak: ik-modulu src/core). Tipler arayuz.ts'tedir;
// bu dosyada tip denetimi kapalıdır (UYUM-BORCU.md).
/**
 * İK Modülü – biçimlendirme, tarih ve doğrulama yardımcıları.
 * Saf fonksiyonlar; tarayıcıda ve Node.js'te çalışır.
 */
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const lower = s => String(s ?? '').toLocaleLowerCase('tr');
// Sunucuda bugün tesisin günüdür (sunucunun saat dilimi karışmaz); motor tarihleri yerel gece yarısı Date olarak taşır.
function today(){ return pd(tesisGunu(new Date())); }
function pd(s){ if(!s || typeof s !== 'string') return null; const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(!m) return null; return new Date(+m[1], +m[2]-1, +m[3]); }
function ymd(d){ return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function addMonths(d, n){ const x = new Date(d); const day = x.getDate(); x.setDate(1); x.setMonth(x.getMonth()+n); const last = new Date(x.getFullYear(), x.getMonth()+1, 0).getDate(); x.setDate(Math.min(day, last)); return x; }
function addYears(d, n){ return addMonths(d, 12*n); }
function diffDays(a, b){ return Math.round((b - a) / 864e5); }
function fullYears(a, b){ let y = b.getFullYear() - a.getFullYear(); if(b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) y--; return y; }
function durationParts(a, b){
  if(!a || !b || b < a) return {y:0, m:0, d:0};
  let y = fullYears(a, b); let c = addYears(a, y); let m = 0;
  while(addMonths(c, 1) <= b){ c = addMonths(c, 1); m++; }
  return {y, m, d: diffDays(c, b)};
}
function durationText(a, b){
  const p = durationParts(a, b); const out = [];
  if(p.y) out.push(p.y + ' yıl'); if(p.m) out.push(p.m + ' ay'); if(!p.y && !p.m) out.push(p.d + ' gün');
  return out.join(' ');
}
const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const DAYS_SHORT = ['Pz','Pt','Sa','Ça','Pe','Cu','Ct'];
function fmtDate(s){ const d = typeof s === 'string' ? pd(s) : s; if(!d) return '—'; return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
function fmtDateShort(s){ const d = typeof s === 'string' ? pd(s) : s; if(!d) return '—'; return pad(d.getDate()) + '.' + pad(d.getMonth()+1) + '.' + d.getFullYear(); }
const _money = new Intl.NumberFormat('tr-TR', {style:'currency', currency:'TRY', maximumFractionDigits:2, minimumFractionDigits:2});
const _money0 = new Intl.NumberFormat('tr-TR', {style:'currency', currency:'TRY', maximumFractionDigits:0});
const _n = new Intl.NumberFormat('tr-TR', {maximumFractionDigits:2});
const fmtMoney = (v, whole) => (v === '' || v == null || isNaN(v)) ? '—' : (whole ? _money0 : _money).format(v);
const fmtNum = v => _n.format(v || 0);
function relDay(d){ const n = diffDays(today(), d); if(n === 0) return 'Bugün'; if(n === 1) return 'Yarın'; if(n === -1) return 'Dün'; return n > 0 ? n + ' gün sonra' : (-n) + ' gün önce'; }
function validTCKN(t){
  if(!/^[1-9]\d{10}$/.test(t)) return false; const d = t.split('').map(Number);
  const d10 = ((d[0]+d[2]+d[4]+d[6]+d[8])*7 - (d[1]+d[3]+d[5]+d[7])) % 10;
  const d10n = (d10 + 10) % 10; if(d10n !== d[9]) return false;
  return d.slice(0,10).reduce((a,b)=>a+b,0) % 10 === d[10];
}
function mod97(str){ let r = 0; for(const ch of str){ r = (r*10 + (+ch)) % 97; } return r; }
function ibanNumeric(s){ return s.replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55)); }
function validIBAN(raw){ const s = raw.replace(/\s+/g,'').toUpperCase(); if(!/^TR\d{24}$/.test(s)) return false; return mod97(ibanNumeric(s.slice(4) + s.slice(0,4))) === 1; }
function fmtIBAN(raw){ return String(raw||'').replace(/\s+/g,'').toUpperCase().replace(/(.{4})/g,'$1 ').trim(); }
const lines = s => String(s||'').split('\n').map(x => x.trim()).filter(Boolean);
const deep = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
function nextOccurrence(dateStr, from){ const d = pd(dateStr); if(!d) return null; let x = new Date(from.getFullYear(), d.getMonth(), d.getDate()); if(x < from) x = new Date(from.getFullYear()+1, d.getMonth(), d.getDate()); return x; }
function perfAvg(p){ const v = Object.values(p.skorlar || {}).map(num).filter(x => x > 0); return v.length ? v.reduce((a,b)=>a+b,0) / v.length : 0; }
function perfLabel(a){ if(!a) return ['Puanlanmadı','']; if(a >= 4.5) return ['Beklentinin çok üzerinde','ok']; if(a >= 3.5) return ['Beklentinin üzerinde','ok']; if(a >= 2.5) return ['Beklentiyi karşılıyor','info']; if(a >= 1.5) return ['Gelişime açık','warn']; return ['Beklentinin altında','bad']; }

export { esc, uid, pad, num, lower, today, pd, ymd, addDays, addMonths, addYears, diffDays, fullYears, durationParts, durationText, MONTHS, DAYS_SHORT, fmtDate, fmtDateShort, _money, _money0, _n, fmtMoney, fmtNum, relDay, validTCKN, mod97, ibanNumeric, validIBAN, fmtIBAN, lines, deep, nextOccurrence, perfAvg, perfLabel };
