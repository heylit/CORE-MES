import type { Order, Pkg, PlanItem, Reason, Result, SampleRequest, ScrapReason } from '@shared/model';
import React from 'react';
import htm from 'htm';

/* ── ölçüm: window.__arkonPerf ── */
export const PERF = window.__arkonPerf = window.__arkonPerf || [];
export const perf = (l, t0) => { const ms = Math.round(performance.now() - t0); PERF.push([l, ms]); return ms; };
export const T0 = performance.now();
export const { useState, useEffect, useRef, useMemo, useCallback, Fragment } = React;
export const html = htm.bind(React.createElement);
export const pad = n => (n < 10 ? '0' : '') + n;
export const dur = s => { s = Math.max(0, Math.floor(s)); return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60); };
export const IN_APP = (() => { try { return window.self !== window.top || !!window.ArkonAndroid; } catch (e) { return true; } })();
/** sayfa bağlantısı: masaüstü dosyada yeni sekme, gömülü/uygulama içinde aynı pencere */
export const pl = (h, same?) => true ? { href: '#' + h, onClick: e => { e.preventDefault(); location.hash = h; } } : { href: location.href.split('#')[0] + (h ? '#' + h : ''), target: '_blank', rel: 'noopener' };
export const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/* ── icons ── */
export const P = {
  chev: 'M9 6l6 6-6 6', chevd: 'M6 9l6 6 6-6', chevu: 'M6 15l6-6 6 6',
  play: 'M7 4.5v15l12-7.5z', pause: 'M7 4h3.5v16H7zM13.5 4H17v16h-3.5z', stop: 'M5.5 5.5h13v13h-13z', check: 'M4.5 12.5l5 5L19.5 7',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5', alert: 'M12 3l10 18H2zM12 10v5m0 3v.01', clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  wrench: 'M14.5 5.5a4 4 0 0 0 5 5L12 18l-3 3-3-3 3-3 7.5-7.5a4 4 0 0 1-2-2z', ruler: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  zin: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM21 21l-5.2-5.2M10.5 7.5v6M7.5 10.5h6', zout: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM21 21l-5.2-5.2M7.5 10.5h6',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', back: 'M9 5h11v14H9l-6-7zM12 9.5l5 5m0-5l-5 5',
  box: 'M3 7.5L12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9', cpu: 'M7 7h10v10H7zM9.5 3v4m5-4v4m-5 10v4m5-4v4M3 9.5h4m-4 5h4m10-5h4m-4 5h4',
  hex: 'M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z', msel: 'M4 8V4h4M12 4h2M18 4h2v4M4 12v2M4 18v2h4M13 13l8 3-3.5 1.5L16 21z', lab: 'M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7 15h10',
  menu: 'M4 7h16M4 12h16M4 17h16', gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z', cart: 'M3 4h2.2l2.3 10.5h10.8L20.5 7H6.4M9.5 19.5h.01M17 19.5h.01', handin: 'M12 3v11m0 0l-4.5-4.5M12 14l4.5-4.5M4 15v4.5h16V15', handout: 'M12 14V3m0 0L7.5 7.5M12 3l4.5 4.5M4 15v4.5h16V15',
  x: 'M6 6l12 12M18 6L6 18', trash: 'M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13', list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  expand: 'M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7', grid: 'M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16', bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  truck: 'M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  coffee: 'M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 11h2a2 2 0 0 1 0 4h-2M8 3v3m4-3v3', search: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM21 21l-5.2-5.2', filter: 'M3 5h18l-7 8.5V19l-4 2v-7.5z',
  chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6', gauge: 'M4.5 17a8.5 8.5 0 1 1 15 0M12 13l4-5', next: 'M5 5l9 7-9 7zM18 5v14',
  rotate: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6', tool: 'M4 20l7-7M13.5 4.5l6 6-3 3-6-6zM10 11l3 3', bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z', upload: 'M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v5h16v-5', download: 'M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M4 15v5h16v-5',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01', brush: 'M18.5 3.5l2 2-9 9-2-2zM9.5 12.5L7 15a3 3 0 0 0-3 3c0 1.2-.6 2-2 2.5 3 .8 7 .3 8-3l1.5-2.5', qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2M14 18h2v2M18 18h2v2', thermo: 'M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0zM12 9v7', drop: 'M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z',
  scan: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 9.5h8M8 12.5h8M8 15.5h5', lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 1v4M12 19v4M1 12h4M19 12h4', eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  dash: 'M3 12h3M10 12h4M18 12h3M3 6h18M3 18h18', edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4', cube: 'M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5zM12 12l8.5-4.75M12 12v9.5M12 12L3.5 7.25', user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0', layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5'
};
export const FILLED = { play: 1, pause: 1, stop: 1, bolt: 1, next: 1 };
export const I = ({ n, s = 24, w = 2 }) => html`<svg width=${s} height=${s} viewBox="0 0 24 24" aria-hidden="true" fill=${FILLED[n] ? 'currentColor' : 'none'} stroke=${FILLED[n] ? 'none' : 'currentColor'} strokeWidth=${w} strokeLinecap="round" strokeLinejoin="round"><path d=${P[n]} /></svg>`;

export const ST = {
  queued: { l: 'Sırada', c: 'var(--idle)' }, setup: { l: 'Hazırlık', c: 'var(--hazard)' }, running: { l: 'Çalışıyor', c: 'var(--run)' },
  paused: { l: 'Duraklatıldı', c: 'var(--hold)' }, stopped: { l: 'Durduruldu', c: 'var(--stop)' }, done: { l: 'Tamamlandı', c: 'var(--done)' }
};
export const Chip = ({ s }) => html`<span className="chip" style=${{ '--c': ST[s].c }}><i></i>${ST[s].l}</span>`;

/* ── data ── */
export const ORDERS: Order[] = [
  { no: 'İE-2026-04817', part: 'FLN-120 Flanş', op: 'Op 30 · CNC Torna', due: '14:30', urgent: true, state: 'queued', target: 1500, good: 1184, scrap: 7, cycle: 38 },
  { no: 'İE-2026-04822', part: 'MIL-45 Tahrik mili', op: 'Op 20 · CNC Torna', due: '17:00', state: 'queued', target: 600, good: 0, scrap: 0, cycle: 52 },
  { no: 'İE-2026-04830', part: 'BRG-08 Yatak kapağı', op: 'Op 10 · CNC Torna', due: 'Yarın 09:00', state: 'queued', target: 2400, good: 0, scrap: 0, cycle: 21 },
  { no: 'İE-2026-04791', part: 'PIN-12 Pim', op: 'Op 30 · CNC Torna', due: '08:00', state: 'done', target: 5000, good: 5000, scrap: 12, cycle: 9 }
];
/* Duruş nedenleri: cat 'u' plansız (kullanılabilirlik kaybı) · 'p' planlı (OEE'de planlı süreden düşülür); team: bu nedenle durunca çağrılacak ekip, after: kaç dk sonra (0 = hemen) */
export const REASONS0: Reason[] = [
  { code: 'D-01', l: 'Malzeme bekleniyor', i: 'truck', cat: 'u', team: 'malzeme', after: 5 }, { code: 'D-02', l: 'Mekanik arıza', i: 'wrench', cat: 'u', team: 'bakim', after: 0 },
  { code: 'D-03', l: 'Elektrik / kontrol arızası', i: 'bolt', cat: 'u', team: 'bakim', after: 0 }, { code: 'D-04', l: 'Takım / kalıp değişimi', i: 'tool', cat: 'u' },
  { code: 'D-05', l: 'Kalite kontrol bekleniyor', i: 'search', cat: 'u', team: 'kalite', after: 10 }, { code: 'D-06', l: 'Program / CNC hatası', i: 'cpu', cat: 'u', team: 'amir', after: 15 },
  { code: 'D-11', l: 'Operatör yok', i: 'user', cat: 'u', team: 'amir', after: 10 },
  { code: 'D-07', l: 'Planlı bakım', i: 'gauge', cat: 'p' }, { code: 'D-08', l: 'Mola / yemek', i: 'coffee', cat: 'p' },
  { code: 'D-09', l: 'Toplantı / eğitim', i: 'user', cat: 'p' }, { code: 'D-10', l: 'İş emri yok (plan yok)', i: 'list', cat: 'p' }, { code: 'D-12', l: 'Deneme / numune üretimi', i: 'flag', cat: 'p' }
];
export let REASONS: Reason[] = REASONS0;
export const reasonColor = r => r.cat === 'p' ? 'var(--done)' : (r.team === 'bakim' ? 'var(--stop)' : 'var(--hold)');
REASONS0.forEach(r => { r.c = reasonColor(r); });
export const reasonOf = code => REASONS.find(r => r.code === code) || null;
export const isPlannedReason = code => { const r = reasonOf(code); return !!(r && r.cat === 'p'); };
/* Hurda nedenleri */
export const SCRAPS0: ScrapReason[] = [{ code: 'H-01', l: 'Ölçü dışı' }, { code: 'H-02', l: 'Yüzey hatası / çizik' }, { code: 'H-03', l: 'Malzeme hatası' }, { code: 'H-04', l: 'Hazırlık parçası' }, { code: 'H-05', l: 'Takım kırılması' }, { code: 'H-06', l: 'Çapak / şekil bozukluğu' }, { code: 'H-09', l: 'Diğer' }];
export let SCRAPS: ScrapReason[] = SCRAPS0;
export const scrapOf = code => SCRAPS.find(r => r.code === code) || null;
export const CALLS = [
  { k: 'bakim', l: 'Bakım', d: 'Mekanik / elektrik destek', i: 'wrench', c: 'var(--stop)', eta: 4 },
  { k: 'kalite', l: 'Kalite', d: 'Ölçüm onayı, ilk parça', i: 'search', c: 'var(--done)', eta: 6 },
  { k: 'malzeme', l: 'Malzeme', d: 'Ham madde, kasa, forklift', i: 'truck', c: 'var(--hold)', eta: 8 },
  { k: 'amir', l: 'Vardiya amiri', d: 'Karar ve onay', i: 'user', c: 'var(--hazard)', eta: 3 }
];
export const STEPS0 = [
  { id: 'a', t: 'Ayna ve pens kontrolü', d: 'Sıkma basıncı 32 bar', r: 1, on: 1 },
  { id: 'b', t: 'Takım ofsetlerini doğrula', d: 'T01, T04, T07 · Program O3012', r: 1, on: 1 },
  { id: 'c', t: 'İlk parça ölçümü', d: 'Teknik resimdeki 5 kontrol noktası', r: 1 },
  { id: 'd', t: 'Talaş konveyörünü boşalt', d: 'Her 250 parçada bir' },
  { id: 'e', t: 'Saatlik SPC numunesi', d: 'Ø40 H7 · 5 parça' }
];
export const BALLS = [
  { id: 1, x: 168, y: 120, l: 'Dış çap', nom: 'Ø120', tol: '±0.10', min: 119.9, max: 120.1, tool: 'Kumpas' },
  { id: 2, x: 395, y: 210, l: 'Merkez delik', nom: 'Ø40 H7', tol: '+0.025 / 0', min: 40.0, max: 40.025, tool: 'Tampon mastar' },
  { id: 3, x: 400, y: 470, l: 'Delik çemberi', nom: 'PCD Ø90', tol: '±0.05', min: 89.95, max: 90.05, tool: 'CMM' },
  { id: 4, x: 580, y: 78, l: 'Flanş kalınlığı', nom: '18', tol: '±0.05', min: 17.95, max: 18.05, tool: 'Mikrometre' },
  { id: 5, x: 650, y: 528, l: 'Toplam boy', nom: '42', tol: '±0.10', min: 41.9, max: 42.1, tool: 'Kumpas' }
];

export function alpha(c, a) { const m = c.match(/rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(/[ ,\/]+/).filter(Boolean); return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + a + ')'; } if (c[0] === '#' && c.length === 7) return 'rgba(' + parseInt(c.slice(1, 3), 16) + ',' + parseInt(c.slice(3, 5), 16) + ',' + parseInt(c.slice(5, 7), 16) + ',' + a + ')'; return c; }
export function useNow(ms = 1000) { const [n, s] = useState(Date.now()); useEffect(() => { const i = setInterval(() => s(Date.now()), ms); return () => clearInterval(i); }, [ms]); return n; }


/* başka modüllerden değiştirilen paylaşılan durum */
export function setREASONS(v: any) { REASONS = v; return v; }
export function setSCRAPS(v: any) { SCRAPS = v; return v; }
