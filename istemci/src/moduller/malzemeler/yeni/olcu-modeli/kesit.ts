import { fmtD } from '../bicim.ts';

// 3215 c: hammaddenin biçim ve ölçüsünden ölçülü teknik kesit (Kesit A-A) ve kırık boy görünüşü. Saf: yalnız çizim verisi üretir,
// SVG'yi OlcuKesiti.tsx basar. Çizim sabit bir tuvalde (GENISLIK x YUKSEKLIK birim) ölçeklenir; ölçü yazıları gerçek mm değeridir.
export const GENISLIK = 640;
export const YUKSEKLIK = 260;

export interface Yol { d: string; tur: 'govde' | 'bos' | 'kirik'; delikli?: boolean }
export interface Ok { x1: number; y1: number; x2: number; y2: number }
export interface Yazi { x: number; y: number; metin: string; hiza: 'start' | 'middle' | 'end'; soluk?: boolean }
export interface Cizgi { x1: number; y1: number; x2: number; y2: number }
export interface KesitCizimi { yollar: Yol[]; oklar: Ok[]; yazilar: Yazi[]; eksenler: Cizgi[]; ozet: string }

type Olcu = Record<string, number>;

// Boy ekseni olan biçimler; boy görünüşü kırık çizilir.
const BOYLU = new Set(['cubuk', 'altigen', 'lama', 'boru', 'kutu', 'kosebent']);
const CX = 150, CY = 130, R = 85;

const say = (v: number | undefined): string => (v === undefined ? '' : fmtD(v));
const okluYazi = (o: Ok, metin: string, x: number, y: number, hiza: Yazi['hiza'] = 'middle'): { ok: Ok; yazi: Yazi } => ({ ok: o, yazi: { x, y, metin, hiza } });

function cember(cx: number, cy: number, r: number, ters = false): string {
  const s = ters ? 1 : 0;
  return `M${cx - r},${cy} a${r},${r} 0 1,${s} ${2 * r},0 a${r},${r} 0 1,${s} ${-2 * r},0`;
}

// Kesitin en büyük ölçüsü (mm); çizim ölçeği bundan.
export function kesitBoyu(form: string, o: Olcu): number | null {
  switch (form) {
    case 'cubuk': case 'tel': case 'kord': return o['d'] ?? null;
    case 'altigen': return o['s'] === undefined ? null : (o['s'] * 2) / Math.sqrt(3);
    case 'boru': return o['D'] ?? null;
    case 'lama': case 'kutu': case 'kosebent': return Math.max(o['a'] ?? 0, o['b'] ?? 0) || null;
    case 'levha': case 'rulo': return o['w'] ?? null;
    case 'kumas': return o['w'] ?? null;
    case 'blok': return Math.max(o['a'] ?? 0, o['h'] ?? 0) || null;
    case 'disk': return o['d'] ?? null;
    case 'oring': return o['d1'] === undefined || o['d2'] === undefined ? null : o['d1'] + 2 * o['d2'];
    default: return null;
  }
}

// Ölçüyle kesiti olmayan biçim (granül) ya da eksik ölçüde null döner; ekran çizim yerine bugünkü hata metnini gösterir.
export function kesitCizimi(form: string, o: Olcu): KesitCizimi | null {
  const S = kesitBoyu(form, o);
  if (S === null || !(S > 0)) return null;
  const yollar: Yol[] = [], oklar: Ok[] = [], yazilar: Yazi[] = [];
  const ekle = (x: { ok: Ok; yazi: Yazi }): void => { oklar.push(x.ok); if (x.yazi.metin) yazilar.push(x.yazi); };
  const k = (2 * R) / S;
  let ozet = '';
  if (form === 'cubuk' || form === 'tel' || form === 'kord') {
    const r = (o['d'] ?? 0) / 2 * k;
    yollar.push({ d: cember(CX, CY, r), tur: 'govde' });
    ekle(okluYazi({ x1: CX - r, y1: CY + r + 18, x2: CX + r, y2: CY + r + 18 }, `Ø${say(o['d'])}`, CX, CY + r + 36));
    ozet = `Ø${say(o['d'])}`;
  } else if (form === 'altigen') {
    const r = ((o['s'] ?? 0) / Math.sqrt(3)) * k, h = ((o['s'] ?? 0) / 2) * k;
    const p = Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i; return `${(CX + r * Math.cos(a)).toFixed(2)},${(CY + r * Math.sin(a)).toFixed(2)}`; });
    yollar.push({ d: `M${p.join(' L')} Z`, tur: 'govde' });
    ekle(okluYazi({ x1: CX + r + 16, y1: CY - h, x2: CX + r + 16, y2: CY + h }, `SW${say(o['s'])}`, CX + r + 24, CY + 4, 'start'));
    ozet = `SW${say(o['s'])}`;
  } else if (form === 'boru') {
    const r = (o['D'] ?? 0) / 2 * k, ri = Math.max(0, ((o['D'] ?? 0) / 2 - (o['t'] ?? 0)) * k);
    yollar.push({ d: `${cember(CX, CY, r)} ${cember(CX, CY, ri, true)}`, tur: 'govde', delikli: true });
    ekle(okluYazi({ x1: CX - r, y1: CY + r + 18, x2: CX + r, y2: CY + r + 18 }, `Ø${say(o['D'])}`, CX, CY + r + 36));
    ekle(okluYazi({ x1: CX + ri, y1: CY, x2: CX + r, y2: CY }, `t${say(o['t'])}`, CX + r + 8, CY - 6, 'start'));
    ozet = `Ø${say(o['D'])} × ${say(o['t'])}`;
  } else if (form === 'lama' || form === 'kutu' || form === 'blok' || form === 'levha' || form === 'rulo' || form === 'kumas') {
    const A = form === 'levha' || form === 'rulo' || form === 'kumas' ? o['w'] ?? 0 : o['a'] ?? 0;
    const B = form === 'levha' || form === 'rulo' ? o['t'] ?? 0 : form === 'blok' ? o['h'] ?? 0 : form === 'kumas' ? 0 : o['b'] ?? 0;
    const kk = Math.min((2 * R) / A, B > 0 ? (1.6 * R) / B : Infinity);
    // İnce sac ve film çizgi kalınlığında kalmasın diye en az 3 birim çizilir; yazı gerçek değeri taşır.
    const w = A * kk, h = Math.max(B * kk, 3);
    const dis = `M${CX - w / 2},${CY - h / 2} h${w} v${h} h${-w} Z`;
    if (form === 'kutu') {
      const t = (o['t'] ?? 0) * kk;
      yollar.push({ d: `${dis} M${CX - w / 2 + t},${CY - h / 2 + t} v${h - 2 * t} h${w - 2 * t} v${-(h - 2 * t)} Z`, tur: 'govde', delikli: true });
      yazilar.push({ x: CX + w / 2 + 8, y: CY - h / 2 + 14, metin: `t${say(o['t'])}`, hiza: 'start' });
    } else yollar.push({ d: dis, tur: 'govde' });
    ekle(okluYazi({ x1: CX - w / 2, y1: CY + h / 2 + 18, x2: CX + w / 2, y2: CY + h / 2 + 18 }, say(A), CX, CY + h / 2 + 36));
    if (B > 0) ekle(okluYazi({ x1: CX + w / 2 + 16, y1: CY - h / 2, x2: CX + w / 2 + 16, y2: CY + h / 2 }, say(B), CX + w / 2 + 24, CY + 4, 'start'));
    ozet = B > 0 ? `${say(A)} × ${say(B)}` : say(A);
  } else if (form === 'kosebent') {
    const kk = (1.7 * R) / S, a = (o['a'] ?? 0) * kk, b = (o['b'] ?? 0) * kk, t = (o['t'] ?? 0) * kk, x0 = CX - a / 2, y0 = CY + b / 2;
    yollar.push({ d: `M${x0},${y0} h${a} v${-t} h${-(a - t)} v${-(b - t)} h${-t} Z`, tur: 'govde' });
    ekle(okluYazi({ x1: x0, y1: y0 + 18, x2: x0 + a, y2: y0 + 18 }, say(o['a']), CX, y0 + 36));
    ekle(okluYazi({ x1: x0 - 16, y1: y0, x2: x0 - 16, y2: y0 - b }, say(o['b']), x0 - 22, CY + 4, 'end'));
    yazilar.push({ x: x0 + t + 8, y: y0 - b + 14, metin: `t${say(o['t'])}`, hiza: 'start' });
    ozet = `${say(o['a'])} × ${say(o['b'])} × ${say(o['t'])}`;
  } else if (form === 'disk') {
    yollar.push({ d: cember(CX, CY, R), tur: 'govde' });
    ekle(okluYazi({ x1: CX - R, y1: CY + R + 18, x2: CX + R, y2: CY + R + 18 }, `Ø${say(o['d'])}`, CX, CY + R + 36));
    ozet = `Ø${say(o['d'])} × ${say(o['t'])}`;
  } else if (form === 'oring') {
    const ri = (o['d1'] ?? 0) / 2 * k, re = ri + (o['d2'] ?? 0) * k;
    yollar.push({ d: `${cember(CX, CY, re)} ${cember(CX, CY, ri, true)}`, tur: 'govde', delikli: true });
    ekle(okluYazi({ x1: CX - ri, y1: CY, x2: CX + ri, y2: CY }, `İç Ø${say(o['d1'])}`, CX, CY - 8));
    yazilar.push({ x: CX + re + 8, y: CY + 4, metin: `${say(o['d2'])}`, hiza: 'start' });
    ozet = `${say(o['d1'])} × ${say(o['d2'])}`;
  } else return null;

  const eksenler: Cizgi[] = [{ x1: CX - R - 20, y1: CY, x2: CX + R + 20, y2: CY }, { x1: CX, y1: CY - R - 20, x2: CX, y2: CY + R + 20 }];
  yazilar.push({ x: CX, y: 22, metin: 'Kesit A-A', hiza: 'middle', soluk: true });

  const yan = form === 'disk' ? o['t'] : form === 'blok' ? o['b'] : form === 'levha' ? o['l'] : BOYLU.has(form) ? o['l'] : undefined;
  if (yan !== undefined && yan > 0) {
    // Boy görünüşü: uzun parça iki uçla ve arada kırık çizgiyle; kısa parça (disk, blok) tam.
    const x0 = 340, x1 = 620, hh = 70, y = CY - hh / 2;
    if (BOYLU.has(form) || form === 'levha') {
      const yari = (x1 - x0) / 2 - 14;
      yollar.push({ d: `M${x0},${y} h${yari} v${hh} h${-yari} Z`, tur: 'bos' }, { d: `M${x1 - yari},${y} h${yari} v${hh} h${-yari} Z`, tur: 'bos' });
      const kir = (x: number): string => `M${x - 4},${y - 8} q8,${hh / 4 + 4} 0,${hh / 2 + 8} q-8,${hh / 4 + 4} 0,${hh / 2 + 8}`;
      yollar.push({ d: kir(x0 + yari + 4), tur: 'kirik' }, { d: kir(x1 - yari - 4), tur: 'kirik' });
      eksenler.push({ x1: x0 - 10, y1: CY, x2: x1 + 10, y2: CY });
      yazilar.push({ x: x0, y: y - 12, metin: 'Boy görünüşü (kırık)', hiza: 'start', soluk: true });
    } else {
      const en = Math.min(x1 - x0, 200), x = x0 + (x1 - x0 - en) / 2;
      yollar.push({ d: `M${x},${y} h${en} v${hh} h${-en} Z`, tur: 'bos' });
      yazilar.push({ x, y: y - 12, metin: 'Yan görünüş', hiza: 'start', soluk: true });
    }
    const etiket = form === 'disk' ? `t ${say(yan)}` : `L ${say(yan)}`;
    ekle(okluYazi({ x1: x0, y1: y + hh + 22, x2: x1, y2: y + hh + 22 }, etiket, (x0 + x1) / 2, y + hh + 40));
    ozet += form === 'disk' ? '' : ` × ${say(yan)}`;
  } else if ((form === 'tel' || form === 'kord' || form === 'rulo' || form === 'kumas') && o['L'] !== undefined) {
    yazilar.push({ x: 480, y: CY + 4, metin: `${say(o['L'])} m`, hiza: 'middle' });
    ozet += ` · ${say(o['L'])} m`;
  }
  return { yollar, oklar, yazilar, eksenler, ozet };
}
