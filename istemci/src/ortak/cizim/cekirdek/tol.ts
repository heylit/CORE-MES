/** ölçü metninin ayrıştırılmış hâli (balon / kontrol planı satırına dönüşür) */
export interface TolOpts { cls?: string; requireMarkup?: boolean }
export interface TolResult { raw: string; count: number; prefix: string; nominal: number; fit: string | null; kind: string; up: number; lo: number; min: number; max: number; nomText: string; tolText: string; general: boolean; tool: string; gauge: boolean; gdtName?: string; explicitFit?: boolean; unknownFit?: boolean; note?: string; label?: string; ref?: boolean; [k: string]: unknown }
/* Arkon — ölçü metni ayrıştırma, ISO 286 geçme toleransları, ISO 2768 genel toleranslar */
  const B = [3, 6, 10, 18, 30, 50, 80, 120, 180, 250, 315, 400, 500];
  type Row = number[];
  const IT: Record<number, Row> = {
    5: [4, 5, 6, 8, 9, 11, 13, 15, 18, 20, 23, 25, 27],
    6: [6, 8, 9, 11, 13, 16, 19, 22, 25, 29, 32, 36, 40],
    7: [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63],
    8: [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97],
    9: [25, 30, 36, 43, 52, 62, 74, 87, 100, 115, 130, 140, 155],
    10: [40, 48, 58, 70, 84, 100, 120, 140, 160, 185, 210, 230, 250],
    11: [60, 75, 90, 110, 130, 160, 190, 220, 250, 290, 320, 360, 400],
    12: [100, 120, 150, 180, 210, 250, 300, 350, 400, 460, 520, 570, 630],
    13: [140, 180, 220, 270, 330, 390, 460, 540, 630, 720, 810, 890, 970],
    4: [3, 4, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20]
  };
  // mil üst sapmaları (es, µm) ve alt sapmaları (ei, µm)
  const ES: Record<string, Row> = {
    f: [-6, -10, -13, -16, -20, -25, -30, -36, -43, -50, -56, -62, -68],
    g: [-2, -4, -5, -6, -7, -9, -10, -12, -14, -15, -17, -18, -20],
    h: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    e: [-14, -20, -25, -32, -40, -50, -60, -72, -85, -100, -110, -125, -135],
    d: [-20, -30, -40, -50, -65, -80, -100, -120, -145, -170, -190, -210, -230]
  };
  // delik üst sapmaları (ES, µm) — yalnız 7. kalite
  const HOLE7: Record<string, Row> = {
    K: [0, 3, 5, 6, 6, 7, 9, 10, 12, 13, 16, 17, 18],
    M: [-2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    N: [-4, -4, -4, -5, -7, -8, -9, -10, -12, -14, -14, -16, -17],
    P: [-6, -8, -9, -11, -14, -17, -21, -24, -28, -33, -36, -41, -45]
  };
  const EI: Record<string, Row> = {
    k: [0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5],
    m: [2, 4, 6, 7, 8, 9, 11, 13, 15, 17, 20, 21, 23],
    n: [4, 8, 10, 12, 15, 17, 20, 23, 27, 31, 34, 37, 40],
    p: [6, 12, 15, 18, 22, 26, 32, 37, 43, 50, 56, 62, 68]
  };
  function rangeIdx(n: number): number { for (let i = 0; i < B.length; i++) if (n <= B[i]) return i; return -1; }
  /** ISO 286: "H7" gibi bir geçme için {up, lo} mm döndürür, bilinmiyorsa null */
  function fit(nominal: number, letters: string | null, grade: number): { up: number; lo: number } | null {
    const i = rangeIdx(nominal); const it = IT[grade];
    if (i < 0 || !it) return null;
    const t = it[i];
    if (letters === null) return null;
    let up: number, lo: number;
    if (letters === 'JS' || letters === 'js') { up = t / 2; lo = -t / 2; }
    else if (letters === 'H') { lo = 0; up = t; }
    else if (letters === 'G') { lo = -ES.g[i]; up = lo + t; }
    else if (letters === 'F') { lo = -ES.f[i]; up = lo + t; }
    else if (letters === 'E' || letters === 'D') { lo = -ES[letters.toLowerCase()][i]; up = lo + t; }
    else if (HOLE7[letters] && +grade === 7) { up = HOLE7[letters][i]; lo = up - t; }
    else if (ES[letters]) { up = ES[letters][i]; lo = up - t; }
    else if (EI[letters]) { let ei = EI[letters][i]; if (letters === 'k' && grade > 7) ei = 0; lo = ei; up = ei + t; }
    else return null;
    return { up: up / 1000, lo: lo / 1000 };
  }
  // ISO 2768-1 doğrusal ölçüler
  const G_RANGES = [3, 6, 30, 120, 400, 1000, 2000, 4000];
  const G: Record<string, (number | null)[]> = { f: [.05, .05, .1, .15, .2, .3, .5, null], m: [.1, .1, .2, .3, .5, .8, 1.2, 2], c: [.2, .3, .5, .8, 1.2, 2, 3, 4], v: [null, .5, 1, 1.5, 2.5, 4, 6, 8] };
  function general(n: number, cls?: string | null, kind?: string): number {
    cls = cls || 'm';
    if (kind === 'radius' || kind === 'chamfer') { const fm = cls === 'f' || cls === 'm'; return n <= 3 ? (fm ? .2 : .4) : n <= 6 ? (fm ? .5 : 1) : (fm ? 1 : 2); }
    for (let i = 0; i < G_RANGES.length; i++) if (n <= G_RANGES[i]) return (G[cls] || G.m)[i] || G.m[i] || 2;
    return 2;
  }
  const num = (s: unknown): number => parseFloat(String(s).replace(/\s+/g, '').replace(',', '.'));
  const fmt = (v: number): string => { const s = (Math.round(v * 10000) / 10000).toFixed(4).replace(/0+$/, '').replace(/\.$/, ''); return s; };
  const sgn = (v: number): string => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v));

  function normalize(s: unknown): string {
    return String(s)
      .replace(/%%[cC]/g, 'Ø').replace(/%%[pP]/g, '±').replace(/%%[dD]/g, '°')
      .replace(/[⌀øΦφ∅]/g, 'Ø').replace(/[−–—‐]/g, '-').replace(/[×✕]/g, 'x').replace(/[     ]/g, ' ')
      .replace(/[º˚]/g, '°').replace(/[’′]/g, "'").replace(/[”″]/g, '"').replace(/\+\s*\/\s*-|\+-(?=\s*[\d.])/g, '±').replace(/⊥/g, '⟂').replace(/▱/g, '⏥')
      .replace(/(\d),(\d)/g, '$1.$2').replace(/(^|[^\d.])\.(\d)/g, '$10.$2').replace(/\s+/g, ' ').trim();
  }
  const RE = /^(?:(\d{1,3})\s*[xX]\s*)?(SØ|SR|Ø|R|M|□)?\s*(\d{1,4}(?:\.\d+)?)(?:\s*[xX]\s*(\d+(?:\.\d+)?))?\s*(?:([A-Za-z]{1,2})\s?(\d{1,2}))?\s*(?:±\s*(\d*\.?\d+)|([+-]\s*\d*\.?\d+|0)\s*\/?\s*([+-]?\s*\d*\.?\d+))?\s*$/;
  // GD&T: sembol → [Türkçe ad, ölçü aleti]
  const GDT: Record<string, [string, string]> = { '⌖': ['Konum', 'CMM'], '⏤': ['Doğrusallık', 'Komparatör'], '⏥': ['Düzlemsellik', 'Komparatör'], '○': ['Yuvarlaklık', 'Yuvarlaklık cihazı'], '⌭': ['Silindiriklik', 'CMM'], '⌒': ['Çizgi profili', 'CMM'], '⌓': ['Yüzey profili', 'CMM'], '⟂': ['Diklik', 'Komparatör'], '∠': ['Eğim', 'CMM'], '∥': ['Paralellik', 'Komparatör'], '⫽': ['Paralellik', 'Komparatör'], '⌯': ['Simetri', 'CMM'], '◎': ['Eş merkezlilik', 'Komparatör'], '↗': ['Salgı', 'Komparatör'], '⌰': ['Toplam salgı', 'Komparatör'] };
  const GDT_CHARS = Object.keys(GDT).join('');
  const RE_GDT = new RegExp('^([' + GDT_CHARS + '])\\s*\\|?\\s*(Ø)?\\s*(\\d*\\.?\\d+)\\s*(Ⓜ|Ⓛ|Ⓢ|Ⓟ|Ⓕ|Ⓔ|\\(M\\)|\\(L\\))?((?:\\s*\\|?\\s*[A-Z](?:\\s*-\\s*[A-Z])?\\s*(?:Ⓜ|Ⓛ|\\(M\\))?)*)\\s*\\|?\\s*$');
  const STOP = /\s*(?:↧|⌴|⌵|\bTHRU\b|\bBOYDAN(?: BOYA)?\b|\bDER[İI]N(?:L[İI]K)?\b|\bDEPTH\b|\bDP\b|\bDERINLIK\b|\bEQS\b|\bE[ŞS][İI]T(?: ARALIKLI)?\b|\bTYP\.?\b|\bT[İI]P\.?\b|\bREF\.?\b|\bPLCS\b|\bYERDE\b|\bADET\b|\bDEL[İI]K\b|\bHAVŞA\b|\bHAVSA\b|\bCBORE\b|\bCSK\b|\bSPOTFACE\b)/i;

  /**
   * Bir ölçü metnini ayrıştırır. Örnekler: "Ø40 H7", "18 ±0.05", "6x Ø16 THRU", "M10x1.5-6H", "Ø60 +0.02/-0.01",
   * "45°", "1x45°", "C1", "(150)", "12 MAX", "Ø25 H7/g6", "Ø25 H7 (+0.021/0)", "⌖ Ø0.05 A B", "Ra 1.6", "30°30'"
   * @returns {null | {raw, count, prefix, nominal, fit, kind, up, lo, min, max, tolText, general, tool, ref?, note?, gdtName?}}
   */
  function parse(s: unknown, opt: TolOpts = {}): TolResult | null {
    let raw = normalize(s);
    if (!raw || raw.length > 60) return null;
    // GD&T çerçevesi
    let m: RegExpExecArray | null = RE_GDT.exec(raw);
    if (m) {
      const t = num(m[3]); if (!(t > 0) || t > 10) return null;
      const g = GDT[m[1]], dat = (m[5] || '').replace(/[|\s]+/g, ' ').trim();
      const nomText = m[1] + ' ' + (m[2] || '') + fmt(t) + (m[4] ? ' ' + m[4] : '') + (dat ? ' | ' + dat.split(' ').join(' | ') : '');
      return { raw, count: 1, prefix: m[1], nominal: t, fit: null, kind: 'gdt', up: t, lo: 0, min: 0, max: t, nomText, tolText: '≤ ' + fmt(t) + (dat ? ' · referans ' + dat.split(' ').join('|') : ''), general: false, tool: g[1], gauge: false, gdtName: g[0] };
    }
    // yüzey pürüzlülüğü
    m = /^(?:√\s*)?(Ra|Rz|Rt|Rmax)\s*(\d*\.?\d+)\s*(?:µm|um|μm)?$/i.exec(raw);
    if (m) { const v = num(m[2]); if (!(v > 0) || v > 100) return null; const k = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(); return { raw, count: 1, prefix: k, nominal: v, fit: null, kind: 'rough', up: 0, lo: -v, min: 0, max: v, nomText: k + ' ' + fmt(v), tolText: '≤ ' + fmt(v) + ' µm', general: false, tool: 'Pürüzlülük ölçer', gauge: false }; }
    // referans ölçü (parantez)
    let ref = false;
    m = /^\((.+)\)$/.exec(raw); if (m && !/^\d{1,3}\s*x$/i.test(m[1])) { ref = true; raw = m[1].trim(); }
    // inç ve boru dişleri
    m = /^(\d+\/\d+|\d+(?:\.\d+)?)"?\s*-\s*(\d{1,2})\s*(UNC|UNF|UNEF|UNS|UN)(?:\s*-?\s*(\d[AB]))?$/i.exec(raw) || /^(G|Rc|Rp|NPT|NPS|BSPP|BSPT)\s*(\d+\/\d+|\d+(?:\.\d+)?)"?(?:\s*([AB]))?$/i.exec(raw);
    if (m) return { raw, count: 1, prefix: '', nominal: 0, fit: null, kind: 'thread', up: 0, lo: 0, min: 0, max: 0, nomText: raw, tolText: 'Geçer / Geçmez', general: false, tool: 'Diş mastarı', gauge: true };
    if (/:|^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(raw)) return null;
    // adet (önde / sonda)
    let count = 1, note = '', label = '';
    m = /^(\d{1,3})\s*[xX]\s*(?=[ØRMS□\d⌴⌵(])/.exec(raw) || /^(\d{1,3})\s*-\s*(?=Ø)/.exec(raw);
    if (m && !/^\d+(\.\d+)?\s*x\s*\d+(\.\d+)?\s*°/.test(raw)) { count = +m[1]; raw = raw.slice(m[0].length); }
    m = /\s*\(\s*(\d{1,3})\s*[xX]\s*\)\s*$|\s+[xX]\s?(\d{1,2})$|\s+(\d{1,3})\s*(?:PLCS|YERDE|ADET|DEL[İI]K)\b.*$/i.exec(raw);
    if (m && count === 1) { count = +(m[1] || m[2] || m[3]); raw = raw.slice(0, m.index).trim(); }
    // havşa/derinlik ve ek ifadeler: ilk parça ölçülür, kalanı not olur
    m = /^(⌴|⌵)\s*/.exec(raw); if (m) { label = m[1] === '⌴' ? 'Havşa (düz)' : 'Havşa (konik)'; raw = raw.slice(m[0].length); }
    const st = STOP.exec(raw);
    if (st && st.index > 0) { note = raw.slice(st.index).trim(); raw = raw.slice(0, st.index).trim(); }
    else if (st && st.index === 0) return null;
    if (/^(TYP|TİP|REF)/i.test(note)) note = note.replace(/^REF\.?/i, () => { ref = true; return ''; }).trim();
    // MAX / MIN
    let one: 'min' | 'max' | null = null;
    m = /\s*\b(MAX|MAKS|MIN)\.?$/i.exec(raw); if (m) { one = /^MIN/i.test(m[1]) ? 'min' : 'max'; raw = raw.slice(0, m.index).trim(); }
    // pah: C1, 1x45°, 0.5x30°
    m = /^C\s?(\d*\.?\d+)$/.exec(raw);
    if (m) { const n = num(m[1]); if (!(n > 0) || n > 50) return null; const g = general(n, opt.cls, 'chamfer'); return fin(mk(raw, count, 'C', n, null, 'chamfer', g, -g, true, opt, ''), ref, note, label); }
    m = /^(\d*\.?\d+)\s*x\s*(\d{2})°$/.exec(raw) || /^(\d{2})°\s*x\s*(\d*\.?\d+)$/.exec(raw);
    if (m) { let n = num(m[1]), an = +m[2]; if (/^\d{2}°/.test(raw)) { an = num(m[1]); n = num(m[2]); } if (an < 10 || an > 80 || !(n > 0)) return null; const g = general(n, opt.cls, 'chamfer'); return fin(mk(raw, count, '', n, null, 'chamfer', g, -g, true, opt, '× ' + an + '°'), ref, note, label); }
    // açı: 30°30'  ·  60° ±1°  ·  45° ±30'
    let isAngle = /°/.test(raw);
    if (isAngle) {
      raw = raw.replace(/(\d+)°\s*(\d{1,2})'(?:\s*(\d{1,2})")?/g, (_: string, d: string, mi: string, se?: string) => fmt(+d + +mi / 60 + (se ? +se / 3600 : 0)) + '°')
        .replace(/([±+-]\s*)(\d{1,2})'/g, (_: string, sg: string, mi: string) => sg + fmt(+mi / 60) + '°').replace(/°/g, ' ').replace(/\s+/g, ' ').trim();
    }
    // geçme çifti (H7/g6) → ilki; geçme + açık tolerans (parantezli)
    let pair = '';
    raw = raw.replace(/\b([A-Za-z]{1,2}\d{1,2})\s*\/\s*([A-Za-z]{1,2}\d{1,2})\b/, (_: string, a: string, b: string) => { pair = a + '/' + b; return a; });
    raw = raw.replace(/\(\s*([±+\-0][^()]*)\)/, ' $1').replace(/^(.*?)\s*\(\s*([A-Za-z]{1,2}\d{1,2})\s*\)\s*(.*)$/, (_: string, a: string, f: string, b: string) => { const p = /^([^\d]*\d+(?:\.\d+)?)(.*)$/.exec(a); return p ? p[1] + ' ' + f + ' ' + p[2] + ' ' + b : a; }).replace(/\s+/g, ' ').trim();
    // diş toleransı: M10x1.5-6H / M6-6g
    let thrCls = '';
    raw = raw.replace(/^(M\s*\d+(?:\.\d+)?(?:\s*x\s*\d+(?:\.\d+)?)?)\s*-\s*(\d[A-Ha-h](?:\d[A-Ha-h])?)$/, (_: string, a: string, c: string) => { thrCls = c; return a; });
    // sınır ölçü: 25.021/25.000
    m = /^(Ø|R)?\s*(\d+\.\d+)\s*(?:\/|\s)\s*(\d+\.\d+)$/.exec(raw);
    if (m) { const a = num(m[2]), b = num(m[3]), hi = Math.max(a, b), lo = Math.min(a, b); if (hi - lo > 0 && hi - lo <= Math.max(0.5, hi * 0.02)) { const kind = m[1] === 'R' ? 'radius' : m[1] ? 'diameter' : 'linear'; return fin(mk(raw, count, m[1] || '', lo, null, kind, hi - lo, 0, false, opt), ref, note, label); } }
    m = RE.exec(raw);
    if (!m) return null;
    if (m[1]) count = +m[1];
    const prefix = m[2] || '', nominal = num(m[3]);
    if (!(nominal > 0) || nominal > 5000) return null;
    let kind = prefix === 'M' ? 'thread' : prefix.indexOf('R') >= 0 ? 'radius' : isAngle ? 'angle' : prefix.indexOf('Ø') >= 0 ? 'diameter' : 'linear';
    if (kind === 'angle' && nominal > 360) return null;
    if (kind === 'thread') return fin(mk(raw, count, prefix, nominal, null, 'thread', 0, 0, false, opt, (m[4] ? '×' + m[4] : '') + (thrCls ? '-' + thrCls : '')), ref, note, label);
    let up: number | undefined, lo: number | undefined, isGeneral = false, fitTxt: string | null = null, unknownFit = false;
    if (m[5] && m[6]) fitTxt = pair || (m[5] + m[6]);
    if (m[7]) { up = num(m[7]); lo = -up; }
    else if (m[8]) { const a = num(m[8]), b = num(m[9]); up = Math.max(a, b); lo = Math.min(a, b); }
    else if (fitTxt) {
      const L = m[5], f = fit(nominal, L.length === 2 ? (L === 'js' || L === 'JS' ? L : null) : L, +m[6]);
      if (!f) unknownFit = true; else { up = f.up; lo = f.lo; }
    }
    if (up === undefined && !unknownFit) {
      if (kind === 'angle') { up = 1; lo = -1; isGeneral = true; }
      else { if (opt.requireMarkup && !prefix && !one) return null; const g = general(nominal, opt.cls, kind); up = g; lo = -g; isGeneral = true; }
    }
    if (unknownFit) return fin(Object.assign(mk(raw, count, prefix, nominal, fitTxt, kind, 0, 0, false, opt), { unknownFit: true }), ref, note, label);
    if (one) { const r = mk(raw, count, prefix, nominal, null, kind, 0, 0, false, opt, ' ' + one.toUpperCase()); if (one === 'max') { r.min = 0; r.max = nominal; r.tolText = '≤ ' + fmt(nominal) + ' (üst sınır)'; } else { r.min = nominal; r.max = +fmt(nominal * 10 + 1000); r.tolText = '≥ ' + fmt(nominal) + ' (alt sınır)'; } r.general = false; return fin(r, ref, note, label); }
    const r = mk(raw, count, prefix, nominal, fitTxt, kind, up as number, lo as number, isGeneral, opt);
    if (fitTxt && (m[7] || m[8])) r.explicitFit = true;
    return fin(r, ref, note, label);
  }
  function fin(r: TolResult, ref: boolean, note: string, label: string): TolResult {
    if (note) { note = note.replace(/↧/g, 'derinlik ').replace(/⌴/g, 'havşa ').replace(/⌵/g, 'konik havşa ').replace(/\s+/g, ' ').trim(); r.note = note; }
    if (label) r.label = label;
    if (ref) { r.ref = true; r.nomText = '(' + r.nomText + ')'; r.tolText = 'Referans ölçü · bilgi amaçlı'; }
    return r;
  }
  function mk(raw: string, count: number, prefix: string, nominal: number, fitTxt: string | null, kind: string, up: number, lo: number, isGeneral: boolean, opt: TolOpts, extra?: string): TolResult {
    const min = nominal + lo, max = nominal + up;
    const w = up - lo;
    const nomText = (prefix && prefix !== 'C' ? prefix : prefix === 'C' ? 'C' : '') + fmt(nominal) + (extra || '') + (fitTxt ? ' ' + fitTxt : '') + (kind === 'angle' ? '°' : '');
    let tolText = kind === 'thread' ? 'Geçer / Geçmez' : isGeneral ? '±' + fmt(up) + (kind === 'angle' ? '°' : '') + ' (ISO 2768-' + (opt.cls || 'm') + ')' : (Math.abs(up + lo) < 1e-9 ? '±' + fmt(up) : sgn(up) + ' / ' + sgn(lo));
    if (fitTxt && !isGeneral && kind !== 'thread') tolText = sgn(up) + ' / ' + sgn(lo);
    if (kind === 'angle' && !isGeneral) tolText = tolText.replace(/(\d)(?=$| )/g, '$1°');
    let tool = 'Kumpas';
    if (kind === 'thread') tool = 'Diş mastarı';
    else if (kind === 'radius') tool = 'Radyus mastarı';
    else if (kind === 'angle') tool = 'Açı ölçer';
    else if (kind === 'chamfer') tool = 'Pah şablonu';
    else if (fitTxt && /^[A-Z]/.test(fitTxt) && w <= 0.06) tool = 'Tampon mastar';
    else if (fitTxt && w <= 0.06) tool = 'Çatal mastar';
    else if (w > 0 && w < 0.02) tool = 'Komparatör';
    else if (w > 0 && w < 0.1) tool = 'Mikrometre';
    return { raw, count, prefix, nominal, fit: fitTxt, kind, up, lo, min: +fmt(min), max: +fmt(max), nomText: (count > 1 ? count + '× ' : '') + nomText, tolText, general: isGeneral, tool, gauge: kind === 'thread' };
  }
  function detectClass(text?: string | null): string { const m = /2768\s*-?\s*([fmcv])/i.exec(text || ''); return m ? m[1].toLowerCase() : 'm'; }
  export const AKTol = { parse, fit, general, normalize, detectClass, fmt, GDT_CHARS };
(window as any).AKTol = AKTol;
