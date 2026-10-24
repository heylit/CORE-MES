// Arkon'un ekran biçimleri (temel.ts pad, dur, fmt; pano-planlama.ts hm, dmy, dmyhm, mins, minsL, toLocalInput, DAYS;
// ortak-ayarlar.ts initials). Veri yoksa YOK yazılır, sıfır uydurulmaz.
export const YOK = '—';
export const iki = (n: number): string => (n < 10 ? '0' : '') + n;
// Saniye -> SS:DD:ss; eksi süre sıfırdır.
export const sure = (sn: number): string => { const s = Math.max(0, Math.floor(sn)); return `${iki(Math.floor(s / 3600))}:${iki(Math.floor(s / 60) % 60)}:${iki(s % 60)}`; };
// Binlik ayraçlı tam sayı (1.250).
export const sayi = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const saat = (t: number): string => `${iki(new Date(t).getHours())}:${iki(new Date(t).getMinutes())}`;
export const gunAy = (t: number): string => new Date(t).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
export const gunAySaat = (t: number | null | undefined): string => (t ? `${gunAy(t)} ${saat(t)}` : YOK);
export const dakika = (ms: number | null | undefined): number => Math.round((ms || 0) / 60000);
export const dakikaMetni = (ms: number | null | undefined): string => { const m = dakika(ms); return m >= 60 ? `${Math.floor(m / 60)} sa ${m % 60} dk` : `${m} dk`; };
export const yerelGirdi = (t: number): string => { const d = new Date(t); return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}T${iki(d.getHours())}:${iki(d.getMinutes())}`; };
export const GUN_ADLARI = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const;
export const basHarfler = (ad: string | null | undefined): string =>
  String(ad || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toLocaleUpperCase('tr-TR');
