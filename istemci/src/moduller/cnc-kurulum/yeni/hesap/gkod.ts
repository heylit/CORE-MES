import { pad2, clamp, num } from '../bicim.ts';
import { save, state } from '../depo.ts';
import type { Tezgah } from '../veri/tipler.ts';

// G-Kod simülasyonunun yorumlayıcısı (Heidenhain Klartext + ISO) ve programın durumdaki yeri. Sahne, çizim ve panel P3'tedir;
// buradaki kısım başka görünümlerin de okuduğu kısımdır (Hazırlık program kaynağı, Takım Ömrü süreleri).

const TAU = Math.PI * 2;

export const SAMPLE_HEID = [
  'BEGIN PGM ORNEK MM', 'BLK FORM 0.1 Z  X+0  Y+0  Z-30', 'BLK FORM 0.2  X+120  Y+80  Z+0',
  '; --- T1 ALIN FREZESI D63 : YUZEY ---', 'TOOL CALL 1 Z S1050 F700', 'L  Z+100 R0 FMAX M3', 'L  X-40  Y+12 R0 FMAX', 'L  Z+2 FMAX', 'L  Z-0.5 F300', 'L  X+160 F700',
  'L  Z+2 FMAX', 'L  X-40  Y+52 FMAX', 'L  Z-0.5 F300', 'L  X+160 F700', 'L  Z+100 FMAX',
  '; --- T2 PARMAK FREZE D16 : DIKDORTGEN CEP 60x40 ---', 'TOOL CALL 2 Z S2780 F620', 'L  X+45  Y+40 R0 FMAX M3', 'L  Z+2 FMAX', 'L  Z-0.5 F300',
  'LBL 1', 'L  IZ-4 F150', 'L  X+23  Y+28 F620', 'L  X+67', 'L  Y+36', 'L  X+23', 'L  Y+44', 'L  X+67', 'L  Y+52', 'L  X+23', 'L  Y+28', 'L  X+45  Y+40', 'LBL 0',
  'CALL LBL 1 REP 1', 'L  Z+100 R0 FMAX',
  '; --- T3 PARMAK FREZE D10 : DAIRESEL CEP D30 ---', 'TOOL CALL 3 Z S4450 F710', 'L  X+97  Y+40 R0 FMAX M3', 'L  Z+2 FMAX', 'CC  X+97  Y+40',
  'LBL 3', 'L  IZ-5 F120', 'L  X+102  Y+40 F710', 'C  X+102  Y+40 DR+', 'L  X+107  Y+40', 'C  X+107  Y+40 DR+', 'L  X+97  Y+40', 'LBL 0', 'CALL LBL 3 REP 1',
  'L  Z+100 R0 FMAX',
  '; --- T7 PUNTA : CYCL 240 ---', 'TOOL CALL 7 Z S1990 F160', 'L  Z+100 R0 FMAX M3',
  'CYCL DEF 240 CENTERING', '  Q200=+2 ;SET-UP CLEARANCE', '  Q343=+0 ;SELECT DEPTH/DIA.', '  Q201=-2 ;DEPTH', '  Q206=+160 ;FEED RATE FOR PLNGNG', '  Q211=+0 ;DWELL TIME AT DEPTH', '  Q203=+0 ;SURFACE COORDINATE', '  Q204=+50 ;2ND SET-UP CLEARANCE',
  'LBL 2', 'L  X+10  Y+10 R0 FMAX M99', 'L  X+110  Y+10 R0 FMAX M99', 'L  X+110  Y+70 R0 FMAX M99', 'L  X+10  Y+70 R0 FMAX M99', 'LBL 0', 'L  Z+100 R0 FMAX',
  '; --- T9 MATKAP D8.5 : CYCL 200 ---', 'TOOL CALL 9 Z S2470 F420', 'L  Z+100 R0 FMAX M3',
  'CYCL DEF 200 DRILLING', '  Q200=+2 ;SET-UP CLEARANCE', '  Q201=-22 ;DEPTH', '  Q206=+420 ;FEED RATE FOR PLNGNG', '  Q202=+5 ;PLUNGING DEPTH', '  Q210=+0 ;DWELL TIME AT TOP', '  Q203=+0 ;SURFACE COORDINATE', '  Q204=+50 ;2ND SET-UP CLEARANCE', '  Q211=+0 ;DWELL TIME AT DEPTH',
  'CALL LBL 2', 'L  Z+100 R0 FMAX',
  '; --- T12 KILAVUZ M10 : CYCL 206 ---', 'TOOL CALL 12 Z S320 F480', 'L  Z+100 R0 FMAX M3',
  'CYCL DEF 206 TAPPING', '  Q200=+3 ;SET-UP CLEARANCE', '  Q201=-18 ;DEPTH OF THREAD', '  Q206=+480 ;FEED RATE FOR PLNGNG', '  Q211=+0 ;DWELL TIME AT DEPTH', '  Q203=+0 ;SURFACE COORDINATE', '  Q204=+50 ;2ND SET-UP CLEARANCE',
  'CALL LBL 2', 'L  Z+250 R0 FMAX M30', 'END PGM ORNEK MM',
].map((l, i) => `${String(i)} ${l}`).join('\n');
export const SAMPLE_ISO = ['%', 'O1001 (ORNEK ISO PROGRAM)', 'G21 G17 G90 G40 G80', '(T2 PARMAK FREZE D16 - KONTUR)', 'T2 M6', 'G54 G0 X-15 Y-15 S2780 M3', 'G43 H2 Z50', 'Z2', 'G1 Z-5 F300',
  'G41 D2 X0 Y0 F620', 'Y70', 'G2 X10 Y80 R10', 'G1 X110', 'G2 X120 Y70 R10', 'G1 Y10', 'G2 X110 Y0 R10', 'G1 X10', 'G2 X0 Y10 R10', 'G1 Y15', 'G40 G0 Z50',
  '(T3 PARMAK FREZE D10 - DAIRESEL CEP)', 'T3 M6', 'G0 X60 Y40 S4450 M3', 'Z2', 'G1 Z-6 F120', 'X70 F710', 'G3 X70 Y40 I-10 J0', 'G1 X60', 'G0 Z50',
  '(T9 MATKAP D8.5 - G83)', 'T9 M6', 'G0 X20 Y20 S2470 M3', 'Z50', 'G98 G83 X20 Y20 Z-20 R2 Q5 F420', 'X100', 'Y60', 'X20', 'G80', 'G0 Z100', 'M30', '%'].join('\n');

// Programdaki takım numarası; Heidenhain'de ad da olabilir (TOOL CALL "AD").
export type GTakim = number | string;
type Eksen = 'x' | 'y' | 'z';
export type Nokta = Record<Eksen, number>;
export interface GUyari { msg: string; line: number }
export interface GHareket {
  // 0 hızlı, 1 kesme.
  t: 0 | 1;
  a: number[];
  b: number[];
  pts: Float32Array | null;
  ln: number;
  T: GTakim;
  S: number;
  F: number;
  len: number;
  dur: number;
}
export interface GTakimOzeti { len: number; t: number; n: number; S: number }
export interface GIstatistik { rapidLen: number; feedLen: number; rapidT: number; feedT: number; perTool: Record<string, GTakimOzeti> }
export interface GDonelHam { mode: string; c: [number, number]; prof: number[][] }
export interface GProgram {
  heid: boolean;
  lines: string[];
  moves: GHareket[];
  warn: GUyari[];
  wc: Record<string, number>;
  blk: { min: Nokta; max: Nokta } | null;
  tools: GTakim[];
  toolSet: Record<string, 1>;
  lathe: boolean;
  dstock?: GDonelHam;
  cum: Float64Array;
  total: number;
  bounds: number[];
  fbounds: number[];
  stat: GIstatistik;
  name?: string;
  // Simülasyon görünümü programa kendi alanlarını ekler (yol sınırları, açıklamalar).
  [alan: string]: unknown;
}
export interface GSecenek { dialect?: string; lathe?: boolean; rapid?: number }

// Dizinin dışı prototipte undefined okur ve aritmetiği NaN yapar; aynı sonuç için NaN verilir.
const at = (a: ArrayLike<number>, i: number): number => a[i] ?? Number.NaN;
const sayi = (s: string | undefined): number => Number(s);

/* torna ISO: T0101 → istasyon 1 (ilk iki hane), son iki hane ofset */
export function tStation(T: GTakim, m: Pick<Tezgah, 'type'> | null | undefined, heid?: boolean): GTakim {
  return typeof T === 'number' && T >= 100 && !heid && m && (m.type === 'lathe' || m.type === 'millturn') ? Math.floor(T / 100) : T;
}

const PL: Record<string, [Eksen, Eksen, Eksen]> = { xy: ['x', 'y', 'z'], zx: ['z', 'x', 'y'], yz: ['y', 'z', 'x'] };

export function gParse(text: string, opt: GSecenek = {}): GProgram {
  const lines = text.replace(/\r/g, '').split('\n');
  const heid = opt.dialect === 'heid' ? true : opt.dialect === 'iso' ? false : (/BEGIN\s+PGM|TOOL\s+CALL|BLK\s+FORM|CYCL\s+DEF/i.test(text) || /^\s*\d+\s+L\s/m.test(text));
  const out: GProgram = {
    heid, lines, moves: [], warn: [], wc: {}, blk: null, tools: [], toolSet: {}, lathe: !!opt.lathe,
    cum: new Float64Array(1), total: 0, bounds: [], fbounds: [], stat: { rapidLen: 0, feedLen: 0, rapidT: 0, feedT: 0, perTool: {} },
  };
  // ISO programlarda ham parça açıklaması: (HAM KUTU X.. Y.. Z.. X.. Y.. Z..) ve dönel ham (HAM DONEL R|A C yc,zc P d:r ...)
  for (let li0 = 0; li0 < Math.min(lines.length, 40); li0++) {
    const L0 = lines[li0] ?? '';
    const mk = /\(\s*HAM\s+KUTU\s+X\s*([-+\d.]+)\s+Y\s*([-+\d.]+)\s+Z\s*([-+\d.]+)\s+X\s*([-+\d.]+)\s+Y\s*([-+\d.]+)\s+Z\s*([-+\d.]+)/i.exec(L0);
    if (mk) out.blk = { min: { x: sayi(mk[1]), y: sayi(mk[2]), z: sayi(mk[3]) }, max: { x: sayi(mk[4]), y: sayi(mk[5]), z: sayi(mk[6]) } };
    const md = /\(\s*HAM\s+DONEL\s+(R|A)\s+C\s*([-+\d.]+)\s*,\s*([-+\d.]+)\s+P\s*([^)]*)\)/i.exec(L0);
    if (md) {
      out.dstock = {
        mode: (md[1] ?? '').toUpperCase(), c: [sayi(md[2]), sayi(md[3])],
        prof: (md[4] ?? '').trim().split(/\s+/).map((q) => q.split(':').map(Number)).filter((q) => q.length === 2 && Number.isFinite(at(q, 0)) && Number.isFinite(at(q, 1))),
      };
    }
  }
  const rapid = opt.rapid || 30000;
  let pos: Nokta = { x: 0, y: 0, z: 50 };
  let tool: GTakim = 0;
  let feed = 0;
  let spindle = 0;
  const Q: Record<string, number> = {};
  const W = (key: string, msg: string, ln: number): void => {
    if (!out.wc[key]) out.warn.push({ msg, line: ln });
    out.wc[key] = (out.wc[key] || 0) + 1;
  };
  const useTool = (t: GTakim): void => {
    tool = t;
    if (!out.toolSet[t]) { out.toolSet[t] = 1; out.tools.push(t); }
  };
  const push = (type: 0 | 1, to: Nokta, ln: number, pts?: number[] | null, f?: number): void => {
    const a = [pos.x, pos.y, pos.z];
    const b = [to.x, to.y, to.z];
    let len = 0;
    if (pts) {
      let px = at(a, 0), py = at(a, 1), pz = at(a, 2);
      for (let i = 0; i < pts.length; i += 3) {
        len += Math.hypot(at(pts, i) - px, at(pts, i + 1) - py, at(pts, i + 2) - pz);
        px = at(pts, i); py = at(pts, i + 1); pz = at(pts, i + 2);
      }
    } else len = Math.hypot(at(b, 0) - at(a, 0), at(b, 1) - at(a, 1), at(b, 2) - at(a, 2));
    if (len < 1e-9) { pos = { x: to.x, y: to.y, z: to.z }; return; }
    let fr = type === 0 ? rapid : (f || feed);
    if (type !== 0 && !(fr > 0)) { W('nofeed', 'İlerleme (F) tanımsız — 100 mm/dk varsayıldı', ln); fr = 100; }
    out.moves.push({ t: type, a, b, pts: pts ? new Float32Array(pts) : null, ln, T: tool, S: spindle, F: type === 0 ? 0 : fr, len, dur: len / fr });
    pos = { x: to.x, y: to.y, z: to.z };
  };
  const arcPts = (to: Nokta, cen: Nokta, cw: boolean, plane: string): number[] => {
    const [A0, A1, A2] = PL[plane] ?? ['x', 'y', 'z'];
    const a0 = pos[A0] - cen[A0], b0 = pos[A1] - cen[A1], a1 = to[A0] - cen[A0], b1 = to[A1] - cen[A1];
    const r = Math.hypot(a0, b0), s = Math.atan2(b0, a0), e = Math.atan2(b1, a1);
    let sw = e - s;
    if (cw) { if (sw >= -1e-7) sw -= TAU; } else if (sw <= 1e-7) sw += TAU;
    const n = clamp(Math.ceil(Math.abs(sw) * Math.max(r, 0.2) / 0.6), 8, 720), pts: number[] = [], dl = to[A2] - pos[A2], base = pos[A2];
    for (let i = 1; i <= n; i++) {
      const t = i / n, an = s + sw * t;
      const p: Nokta = { x: 0, y: 0, z: 0 };
      p[A0] = cen[A0] + r * Math.cos(an); p[A1] = cen[A1] + r * Math.sin(an); p[A2] = base + dl * t;
      pts.push(p.x, p.y, p.z);
    }
    pts[pts.length - 3] = to.x; pts[pts.length - 2] = to.y; pts[pts.length - 1] = to.z;
    return pts;
  };
  const centerR = (to: Nokta, R: number, cw: boolean, plane: string): Nokta | null => {
    const [A0, A1, A2] = PL[plane] ?? ['x', 'y', 'z'];
    const x0 = pos[A0], y0 = pos[A1], x1 = to[A0], y1 = to[A1], dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
    if (d < 1e-9) return null;
    const r = Math.abs(R), h2 = r * r - d * d / 4, h = h2 > 0 ? Math.sqrt(h2) : 0;
    let left = !cw;
    if (R < 0) left = !left;
    const sg = left ? 1 : -1;
    const c: Nokta = { x: 0, y: 0, z: 0 };
    c[A0] = (x0 + x1) / 2 + sg * h * (-dy / d); c[A1] = (y0 + y1) / 2 + sg * h * (dx / d); c[A2] = 0;
    return c;
  };
  const drill = (x: number, y: number, zTop: number, zBottom: number, zRet: number, f: number, ln: number): void => {
    push(0, { x, y, z: pos.z }, ln); push(0, { x, y, z: zTop }, ln); push(1, { x, y, z: zBottom }, ln, null, f); push(0, { x, y, z: zRet }, ln);
  };
  let steps = 0;
  const MAXSTEPS = 3000000;

  if (heid) {
    const labels: Record<string, number> = {};
    let cyc: { n: number; q: Record<string, number> } | null = null;
    let modalCall = false;
    let blkMin: Nokta | null = null;
    let cc: Nokta = { x: 0, y: 0, z: 0 };
    const doCyc = (ln: number): void => {
      if (!cyc) { W('nocyc', 'Tanımsız döngü çağrısı', ln); return; }
      const q = cyc.q, surf = q['203'] || 0, clr = q['200'] ?? 2, dep = q['201'] ?? -5, f = q['206'] || feed || 100, clr2 = q['204'] ?? clr;
      if (cyc.n < 200) W('oldcyc', 'Eski tip döngüler (CYCL 1/17) yaklaşık gösterildi', ln);
      drill(pos.x, pos.y, surf + clr, surf + dep, surf + clr2, f, ln);
    };
    lines.forEach((l, i) => {
      const u = l.replace(/;.*/, '').replace(/^\s*\d+\s+/, '').trim().toUpperCase(), m = /^LBL\s+"?([^"\s]+)"?/.exec(u);
      if (m?.[1] !== undefined && m[1] !== '0') labels[m[1]] = i;
    });
    const stack: { lbl: string; ret: number; rep: number }[] = [];
    let i = 0;
    const qv = (s: string): number => {
      if (/Q\d+/.test(s)) { const neg = s.startsWith('-'), v = Q[s.replace(/[+-]/g, '')] || 0; return neg ? -v : v; }
      return Number.parseFloat(s);
    };
    while (i < lines.length) {
      if (++steps > MAXSTEPS) { W('loop', 'Program çok uzun ya da sonsuz döngü — simülasyon kesildi', i); break; }
      const raw = lines[i] ?? '', u = raw.replace(/;.*/, '').replace(/^\s*\d+\s+/, '').trim().toUpperCase(), ln = i;
      i++;
      if (!u) continue;
      let m: RegExpMatchArray | null;
      if (/^(BEGIN|END)\s+PGM/.test(u)) { if (u.startsWith('END')) break; continue; }
      if (/^BLK\s+FORM\s+0\.1\s+[XYZ]\s+(.*)/.test(u)) {
        const bm: Nokta = { x: 0, y: 0, z: 0 };
        for (const r of u.matchAll(/([XYZ])\s*([+-]?\d*\.?\d+)/g)) bm[(r[1] ?? '').toLowerCase() as Eksen] = sayi(r[2]);
        blkMin = bm;
        continue;
      }
      if ((m = /^(?:BLK\s+FORM\s+)?0\.2\s+(.*)/.exec(u)) && blkMin) {
        const alt: Nokta = blkMin;
        const bx2: Nokta = { ...alt };
        for (const r of (m[1] ?? '').matchAll(/(I?)([XYZ])\s*([+-]?\d*\.?\d+)/g)) { const k = (r[2] ?? '').toLowerCase() as Eksen; bx2[k] = r[1] ? alt[k] + sayi(r[3]) : sayi(r[3]); }
        out.blk = { min: alt, max: bx2 };
        continue;
      }
      if ((m = /^TOOL\s+CALL\s+("?)([^"\s]+)\1(.*)/.exec(u))) {
        const ad = m[2] ?? '', tn = Number.parseInt(ad, 10);
        useTool(Number.isNaN(tn) ? ad : tn);
        const sm = /\bS\s*([\d.]+)/.exec(m[3] ?? ''), fm = /\bF\s*([\d.]+)/.exec(m[3] ?? '');
        if (sm) spindle = sayi(sm[1]);
        if (fm) feed = sayi(fm[1]);
        continue;
      }
      if (/^TOOL\s+DEF/.test(u)) continue;
      if ((m = /^LBL\s+"?([^"\s]+)"?/.exec(u))) {
        const fr = stack[stack.length - 1];
        if (m[1] === '0' && fr) { if (fr.rep > 0) { fr.rep--; i = (labels[fr.lbl] ?? Number.NaN) + 1; } else { stack.pop(); i = fr.ret; } }
        continue;
      }
      if ((m = /^CALL\s+LBL\s+"?([^"\s]+)"?(?:\s+REP\s*(\d+))?/.exec(u))) {
        const lbl = m[1] ?? '', hedef = labels[lbl];
        if (hedef == null) { W(`lbl${lbl}`, `LBL ${lbl} bulunamadı`, ln); continue; }
        if (stack.length > 20) { W('deep', 'Alt program derinliği aşıldı', ln); continue; }
        stack.push({ lbl, ret: i, rep: Math.max(1, m[2] ? sayi(m[2]) : 1) - 1 });
        i = hedef + 1;
        continue;
      }
      if (/^CALL\s+PGM/.test(u)) { W('pgm', 'CALL PGM (harici program) simüle edilmez', ln); continue; }
      if ((m = /^CYCL\s+DEF\s+(\d+)/.exec(u))) {
        const cn = sayi(m[1]);
        cyc = (cn >= 200 && cn < 300 && cn !== 247 && cn !== 220 && cn !== 221) || cn === 1 || cn === 17 || cn === 18 ? { n: cn, q: {} } : null;
        if (!cyc && cn !== 247 && cn !== 7 && cn !== 19 && cn !== 32) W(`cyc${String(cn)}`, `CYCL DEF ${String(cn)} simüle edilmiyor`, ln);
        if (cn === 7 || cn === 19) W('shift', 'Sıfır noktası kaydırma / döndürme (CYCL 7/19) yok sayıldı', ln);
        continue;
      }
      if (/^PLANE\b/.test(u)) { if (!/RESET/.test(u)) W('plane', '5 eksen eğik düzlem (PLANE) — yol döndürülmeden 3 eksen olarak gösteriliyor', ln); continue; }
      if (/^FUNCTION\b/.test(u)) { if (/^FUNCTION\s+TCPM/.test(u)) W('tcpm', '5 eksen eşzamanlı işleme (TCPM) — döner eksenler simüle edilmiyor', ln); continue; }
      if (/^(STOP|SEL\b|DECLARE|TCH\b|\*)/.test(u)) continue;
      if (/^Q\d+\s*=/.test(u) && cyc) { const qm = /^Q(\d+)\s*=\s*([+-]?\d*\.?\d+)/.exec(u); if (qm) cyc.q[qm[1] ?? ''] = sayi(qm[2]); continue; }
      if ((m = /^(?:FN\s*0\s*:\s*)?Q(\d+)\s*=\s*([+-]?\d*\.?\d+)\s*$/.exec(u))) { Q[`Q${m[1] ?? ''}`] = sayi(m[2]); continue; }
      if (/^FN\s*\d+/.test(u)) { W('fn', 'FN hesaplama / koşul fonksiyonları yok sayıldı', ln); continue; }
      if (/^CYCL\s+CALL/.test(u)) { if (/PAT/.test(u)) W('pat', 'CYCL CALL PAT (nokta tablosu) desteklenmiyor', ln); else doCyc(ln); continue; }
      const isL = /^L\b/.test(u) || /^L[XYZI]/.test(u), isC = /^C\s/.test(u) || /^C[XYZI]/.test(u), isCR = /^CR\b/.test(u), isCT = /^CT\b/.test(u), isCC = /^CC\b/.test(u);
      if (/^(LP|CP|CTP|CRP)\b/.test(u)) { W('polar', 'Kutupsal koordinatlar (LP/CP) desteklenmiyor', ln); continue; }
      if (/^(RND|CHF)\b/.test(u)) { W('rnd', 'RND / CHF köşe yuvarlatma gösterilmez', ln); continue; }
      if (/^(APPR|DEP)\b/.test(u)) W('appr', 'APPR / DEP yaklaşma hareketleri doğrusal kabul edildi', ln);
      const to: Nokta = { x: pos.x, y: pos.y, z: pos.z };
      let any = false;
      for (const r of u.matchAll(/\b(I?)([XYZ])\s*([+-]?(?:\d*\.?\d+|Q\d+))/g)) {
        const k = (r[2] ?? '').toLowerCase() as Eksen, val = qv(r[3] ?? '');
        to[k] = r[1] ? (isCC ? pos[k] : to[k]) + val : val;
        any = true;
      }
      const fM = /\bF\s*(MAX|AUTO|[+-]?\d*\.?\d+)/.exec(u), isMax = fM?.[1] === 'MAX';
      if (fM && !isMax && fM[1] !== 'AUTO') feed = Math.abs(sayi(fM[1]));
      if (/\bM9[12]\b/.test(u) || /\bM140\b/.test(u)) {
        W('m91', 'M91/M92/M140 (tezgâh koordinatı / takım ekseninde çekilme) — güvenli yüksekliğe çekilme olarak gösterildi', ln);
        const zs = Math.max(pos.z, out.blk ? out.blk.max.z + 100 : 100);
        if (pos.z < zs) push(0, { x: pos.x, y: pos.y, z: zs }, ln);
        if (/\bM(30|2)\b/.test(u)) break;
        continue;
      }
      if (/\bM128\b/.test(u)) W('tcpm', '5 eksen eşzamanlı işleme (M128) — döner eksenler simüle edilmiyor', ln);
      if (/\b[ABC]\s*[+-]?\d/.test(u.replace(/\bF\s*\S+/, ''))) W('abc', 'Döner eksen (A/B/C) hareketleri gösterilmiyor', ln);
      if (/\bR[LR]\b/.test(u)) W('comp', 'Yarıçap telafisi (RL/RR) yok sayıldı — yol, kontur olarak gösterilir', ln);
      if (/\bM89\b/.test(u)) modalCall = true;
      if (/\bM99\b/.test(u)) modalCall = false;
      if (isCC) { cc = any ? { x: to.x, y: to.y, z: 0 } : { x: pos.x, y: pos.y, z: 0 }; continue; }
      if ((isL || /^APPR|^DEP/.test(u)) && any) push(isMax ? 0 : 1, to, ln);
      else if (isC) { const cw = /DR-/.test(u); push(1, to, ln, arcPts(to, { x: cc.x, y: cc.y, z: 0 }, cw, 'xy')); }
      else if (isCR) {
        const rm = /\bR\s*([+-]?\d*\.?\d+)/.exec(u), cw2 = /DR-/.test(u), c2 = rm ? centerR(to, sayi(rm[1]), cw2, 'xy') : null;
        if (c2) push(1, to, ln, arcPts(to, c2, cw2, 'xy')); else push(1, to, ln);
      } else if (isCT) { W('ct', 'CT (teğet yay) doğru olarak gösterildi', ln); push(1, to, ln); }
      if ((isL && /\bM99\b/.test(u)) || (isL && modalCall && any)) doCyc(ln);
      if (/\bM(30|2)\b/.test(u)) break;
    }
  } else {
    let mo = 0, absM = true, plane = 'xy', unit = 1, cz: number | null = null, cr: number | null = null, ret98 = true, initZ: number | null = null;
    let fpr = !!out.lathe, css = false, smax = 0;
    for (let li = 0; li < lines.length; li++) {
      if (++steps > MAXSTEPS) break;
      const s = (lines[li] ?? '').toUpperCase().replace(/\(.*?\)/g, '').replace(/;.*/, '').trim();
      if (!s || s === '%' || (/^O\d+/.test(s) && !/[GXYZ]/.test(s.replace(/^O\d+/, '')))) continue;
      if (s.includes('#')) { W('macro', 'Makro değişkenleri (#) desteklenmiyor', li); continue; }
      const words: Record<string, number | undefined> = {}, gs: number[] = [];
      for (const wm of s.matchAll(/([A-Z])\s*([+-]?(?:\d+\.?\d*|\.\d+))/g)) {
        if (wm[1] === 'G') gs.push(sayi(wm[2])); else words[wm[1] ?? ''] = sayi(wm[2]);
      }
      for (const g of gs) {
        if (g === 0 || g === 1 || g === 2 || g === 3) mo = g; else if (g === 90) absM = true; else if (g === 91) absM = false;
        else if (g === 17) plane = 'xy'; else if (g === 18) plane = 'zx'; else if (g === 19) plane = 'yz'; else if (g === 20) unit = 25.4; else if (g === 21) unit = 1;
        else if (g === 80) { mo = mo >= 73 ? 0 : mo; initZ = null; } else if (g === 98) { if (out.lathe) fpr = false; else ret98 = true; } else if (g === 99) { if (out.lathe) fpr = true; else ret98 = false; } else if (g === 95) fpr = true; else if (g === 94) fpr = false; else if (g === 96 && out.lathe) css = true; else if (g === 97) css = false;
        else if ([73, 74, 76, 81, 82, 83, 84, 85, 86, 87, 88, 89].includes(g)) { mo = g; initZ = pos.z; }
        else if (g === 28 || g === 53) W('g28', 'G28 / G53 referans dönüşleri atlandı', li);
        else if (g === 41 || g === 42) W('comp', 'Yarıçap telafisi (G41/G42) yok sayıldı — yol, kontur olarak gösterilir', li);
        else if (g === 68 || g === 51) W('rot', 'Koordinat döndürme / ölçekleme yok sayıldı', li);
      }
      if (gs.includes(28) || gs.includes(53)) continue;
      const { T: wT, S: wS, F: wF, R: wR, I: wI, J: wJ, K: wK, M: wM } = words;
      if (wT != null) useTool(wT);
      if (wS != null) { if (out.lathe && gs.includes(50)) smax = wS; else spindle = wS; }
      if (wF != null) feed = wF * (fpr ? 1 : unit);
      const tgt: Nokta = { x: pos.x, y: pos.y, z: pos.z };
      let has = false;
      for (const a of ['X', 'Y', 'Z'] as const) {
        const w = words[a];
        if (w != null) { let v = w * unit; if (a === 'X' && out.lathe) v /= 2; const k = a.toLowerCase() as Eksen; tgt[k] = absM ? v : pos[k] + v; has = true; }
      }
      const rpmE = css ? Math.min(smax || 4000, 1000 * (spindle || 100) / (Math.PI * Math.max(2 * Math.abs(pos.x), 5))) : spindle;
      const ef = fpr ? feed * (rpmE || 1000) : feed;
      if (fpr && !spindle) W('fpr', 'İlerleme mm/dev ama devir yok — 1000 dev/dk varsayıldı', li);
      if (css && !smax) W('css', 'G96 sabit kesme hızı: G50 devir sınırı yok — 4000 dev/dk alındı', li);
      if (mo >= 73) {
        if (words['Z'] != null) cz = words['Z'] * unit;
        if (wR != null) cr = wR * unit;
        if (words['X'] != null || words['Y'] != null || words['Z'] != null) {
          if (initZ == null) initZ = pos.z;
          if (cz != null && cr != null) drill(tgt.x, tgt.y, cr, cz, ret98 ? initZ : cr, ef, li);
        }
        continue;
      }
      if (mo === 2 || mo === 3) {
        if (!has && wI == null && wJ == null && wK == null) continue;
        const cw3 = mo === 2;
        const c3 = wR != null ? centerR(tgt, wR * unit, cw3, plane) : { x: pos.x + (wI || 0) * unit, y: pos.y + (wJ || 0) * unit, z: pos.z + (wK || 0) * unit };
        if (c3) push(1, tgt, li, arcPts(tgt, c3, cw3, plane), ef); else push(1, tgt, li, null, ef);
      } else if (has) push(mo === 0 ? 0 : 1, tgt, li, null, ef);
      if (wM === 30 || wM === 2) break;
    }
  }
  if (out.lathe) out.moves.forEach((mv) => { mv.b = [at(mv.b, 0), 0, at(mv.b, 2)]; mv.a = [at(mv.a, 0), 0, at(mv.a, 2)]; });
  const M = out.moves.length, cum = new Float64Array(M + 1), bnd = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9], fb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  const stat: GIstatistik = { rapidLen: 0, feedLen: 0, rapidT: 0, feedT: 0, perTool: {} };
  out.moves.forEach((mv, k) => {
    cum[k + 1] = at(cum, k) + mv.dur;
    const pts: ArrayLike<number> = mv.pts ?? mv.b;
    if (mv.t) for (let d0 = 0; d0 < 3; d0++) { if (at(mv.a, d0) < at(fb, d0)) fb[d0] = at(mv.a, d0); if (at(mv.a, d0) > at(fb, d0 + 3)) fb[d0 + 3] = at(mv.a, d0); }
    for (let j = 0; j < pts.length; j += 3) {
      for (let d = 0; d < 3; d++) {
        const v = at(pts, j + d);
        if (v < at(bnd, d)) bnd[d] = v;
        if (v > at(bnd, d + 3)) bnd[d + 3] = v;
        if (mv.t) { if (v < at(fb, d)) fb[d] = v; if (v > at(fb, d + 3)) fb[d + 3] = v; }
      }
    }
    if (mv.t) {
      stat.feedLen += mv.len; stat.feedT += mv.dur;
      const pt = stat.perTool[mv.T] ?? (stat.perTool[mv.T] = { len: 0, t: 0, n: 0, S: 0 });
      pt.len += mv.len; pt.t += mv.dur; pt.n++;
      if (mv.S > 0) pt.S = mv.S;
    } else { stat.rapidLen += mv.len; stat.rapidT += mv.dur; }
  });
  out.cum = cum; out.total = at(cum, M); out.bounds = bnd; out.fbounds = fb; out.stat = stat;
  return out;
}

// Dakikayı s:dd ya da s:dd:ss biçiminde yazar (prototipte G-Kod süresi; Takım Ömrü ve Ana Sayfa da kullanır).
export function fmtT(min: number | null | undefined): string {
  const x = typeof min === 'number' && min >= 0 ? min : 0;
  const s = Math.round(x * 60), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60;
  return `${h ? `${String(h)}:${pad2(m)}` : String(m)}:${pad2(ss)}`;
}

// ----- Programın durumdaki yeri (prototipin gsimOpt, gtools, gsimText alanları; eski ekranla aynı kayıt) -----

export interface GsimAyari {
  rapid: number | string;
  dialect: string;
  lathe: boolean;
  removal: boolean;
  showRapid: boolean;
  follow: boolean;
  speed: string;
  stockSrc: string;
  hamOrigin: string;
  showPart: boolean;
  compare: boolean;
  [alan: string]: unknown;
}
// Programdaki takım numarası → kütüphane kalemi ya da elle çap (program adı başına).
export type GTakimEslesmesi = Record<string, { id?: string; d?: number }>;
export interface GsimMetni { name: string; text: string }


// Açılış varsayılanları durum kurulurken uygulanır (durum.ts acilisVarsayimlari); burada yalnız tipli okunur.
export function gsimHazirla(): GsimAyari { return state['gsimOpt'] as GsimAyari; }
export function gsimTakimlari(): Record<string, GTakimEslesmesi | number> { return state['gtools'] as Record<string, GTakimEslesmesi | number>; }

// gLoad'un ayrıştırma ve durum kısmı: programı ayarlarla okur, kaydeder (600 000 karakteri aşan metin kayda girmez) ve ham kaynağını
// düzeltir. Çizim, zaman çizelgesi ve kayıt yazımı (gRefresh → save) G-Kod görünümünündür.
export function gYukle(text: string, name: string): { prog: GProgram } | { hata: string } {
  const gs = gsimHazirla();
  let p: GProgram;
  try { p = gParse(text, { dialect: gs.dialect, lathe: gs.lathe, rapid: num(gs.rapid, 30000) }); } catch (e) { return { hata: `⚠ Program okunamadı: ${e instanceof Error ? e.message : String(e)}` }; }
  p.name = name;
  state['gsimText'] = text.length < 600000 ? { name, text } : null;
  if (gs.stockSrc === 'blk' && !p.blk) gs.stockSrc = 'auto';
  return { prog: p };
}

export interface GonderimAyari {
  // Hazırlık'tan açılışta program aynı adla zaten yüklüyse yeniden okunmaz (prOpenSim).
  adDegisinceYukle?: boolean;
}
let bekleyen: (GsimMetni & { adDegisince: boolean }) | null = null;

// Başka görünümden simülasyona program gönderir (prototipte prOpenSim): metni duruma
// yazar, kaydeder ve G-Kod görünümünün açılışta okuyacağı gönderimi bırakır. Görünüme geçmek gönderenin işidir (`git('gcode')`):
// görünüm geçişi kabuktadır, hesap katmanı gezinmez.
export function gkodaGonder(metin: string, ad: string, ayar: GonderimAyari = {}): void {
  gsimHazirla();
  state['gsimText'] = { name: ad, text: metin };
  save();
  bekleyen = { name: ad, text: metin, adDegisince: !!ayar.adDegisinceYukle };
}

// G-Kod görünümü açılınca bir kez alır; `yukluAd` görünümde yüklü programın adı.
export function bekleyenGkodAl(yukluAd: string | null): GsimMetni | null {
  const b = bekleyen;
  bekleyen = null;
  if (!b || (b.adDegisince && yukluAd === b.name)) return null;
  return { name: b.name, text: b.text };
}
