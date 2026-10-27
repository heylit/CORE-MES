import { AKTol, type TolSonucu } from './cekirdek.ts';

// PDF ölçü okuma (pdf-okuma.ts): sembol fontları, satırlar, dışlama bölgeleri (antet, tablo, pafta, notlar) ve güven puanı. Saf hesap;
// pdf.js ve OCR çıktısı aynı biçimde (MetinOgesi) gelir. Eşliği okuma.test.ts eski modülle sınar.

// Sayfa görüntüsünün düz piksel dizisi (ImageData'nın hesaba giren yüzü).
export interface Goruntu { data: ArrayLike<number>; width: number; height: number }
// Metin parçası: x, y taban çizgisi başlangıcı (piksel), a yazı açısı (radyan), h yazı yüksekliği, w genişlik.
export interface MetinOgesi { s: string; x: number; y: number; h: number; a: number; w: number; font?: string; conf?: number; bb?: number[] }
// Ölçünün yazı kutusu: merkez x, y; yarı genişlik, yarı yükseklik, açı.
export type YaziKutusu = [number, number, number, number, number];
export type GuvenSeviyesi = 'high' | 'mid' | 'low';
export interface OlcuOnerisi {
  x: number; y: number; tx: number; ty: number; ar: YaziKutusu; l: string; nom: string; tol: string; min: number; max: number; tool: string;
  gauge: boolean; raw: string; unknown: boolean; note: string; kind: string; ref: boolean; conf: number; lvl: GuvenSeviyesi; why: string; on: boolean;
  ocr?: boolean;
}
export interface OkumaIstatistigi {
  items?: number; rows?: number; segs?: number; table?: number; border?: number; notes?: number; prose?: number; found?: number;
  high?: number; mid?: number; low?: number; ocr?: boolean; tables?: number; ocrAdd?: number; added?: number;
}
export type Bolge = 'table' | 'border' | 'notes' | 'prose' | 'stack' | 'dim' | 'none';
export interface TaniParcasi { t: string; x: number; y: number; w: number; h: number; a: number; z: Bolge | string }
export interface TaniBolgesi { why: string; x0: number; y0: number; x1: number; y1: number }
export interface OkumaTanisi { segs: TaniParcasi[]; zones: TaniBolgesi[] }
// Eski biçim: liste dizidir, istatistik ve tanı dizinin üstündedir (önbellekte de böyle durur; eski ekranla aynı kayıt).
export type OlcuListesi = OlcuOnerisi[] & { stats?: OkumaIstatistigi; diag?: OkumaTanisi };
export interface Ayiklama { table?: boolean; border?: boolean; notes?: boolean; prose?: boolean }
export interface OkumaSecenegi {
  w?: number; h?: number; ink?: Uint8Array | null; ocr?: boolean; region?: boolean; ex?: Ayiklama; auto?: GuvenSeviyesi; diag?: boolean;
}

export const GDT_FONT_ESLEMESI: Readonly<Record<string, string>> = {
  n: 'Ø', j: '⌖', u: '⏤', c: '⏥', e: '○', g: '⌭', k: '⌒', d: '⌓', b: '⟂', a: '∠', f: '∥', i: '⌯', r: '◎', h: '↗', t: '⌰', v: '⌴', w: '⌵', x: '↧',
  m: 'Ⓜ', l: 'Ⓛ', s: 'Ⓢ', p: 'Ⓟ',
};
export function glifDuzelt(s: string, font?: string): string {
  let t = s;
  if (font && /gdt|isocp|amgdt|gdtsym|symbol\s*gd/i.test(font)) t = t.replace(/[a-z]/g, (ch) => GDT_FONT_ESLEMESI[ch] ?? ch);
  // Özel alan (PUA) ve denetim karakterleri: rakamdan hemen önceyse çoğu CAD'de çap işaretidir.
  return t.replace(/[-\u0080-\u009F\u0001-\u0008](?=\s?\d)/g, 'Ø').replace(/[-\u0000-\u001F\u0080-\u009F�]/g, '');
}
export const katla = (s: string): string => s.toLowerCase().replace(/̇/g, '').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u')
  .replace(/ö/g, 'o').replace(/ç/g, 'c');
export const ANAHTAR_KELIME = /^(olcek|scale|malzeme|material|mat\.|cizen|cizim|drawn|designed|design|tasarlayan|tasarim|tarih|date|rev\.?|revizyon|revision|pafta|sheet|agirlik|weight|mass|kutle|parca ?(no|adi|numarasi|kodu|ismi)|part ?(no|number|name)|poz\.?|pozisyon|item|adet|qty|quantity|miktar|kontrol|kontrol eden|checked|chk|onay|onaylayan|approved|appr|dosya|file|proje|project|birim|units?|format|boyut|izdusum|projection|aciklama|description|desc\.?|genel tol.*|general tol.*|yuzey.*|surface.*|finish|sayfa|page|title|baslik|dwg\.? ?no|drawing ?(no|number)|resim ?no|firma|company|musteri|customer|sertlik|hardness|kaplama|coating|isil islem|heat treat.*|degisiklik|change|stok kodu|standart|standard|tolerans|tolerance|unless otherwise.*|aksi belirtilmedikce.*)\s*:?$/;
export const NOT_BASLIGI = /^(notlar?|notes?|genel notlar|general notes|aciklamalar|teknik sartlar)\s*:?$/;
export const OLCU_KELIMESI = /^(thru|boydan|boya|derin|derinlik|depth|typ|tip|ref|eqs|esit|aralikli|plcs|yerde|adet|delik|max|maks|min|havsa|cbore|csk|unc|unf|unef|npt|ra|rz|rmax|rt)$/;
export function duzyaziMi(s: string): boolean {
  const w = katla(s).match(/[a-z]{3,}/g) ?? [];
  return w.filter((x) => !OLCU_KELIMESI.test(x)).length >= 2;
}

export interface TabloBlogu { x0: number; x1: number; y0: number; y1: number }
type Cizgi = [number, number, number, number];

// Rasterdan tablo blokları: aynı uzunlukta, üst üste en az üç yatay çizgi (antet, malzeme listesi, revizyon tablosu).
export function tabloBul(ink: Uint8Array | null | undefined, W: number, H: number): TabloBlogu[] {
  if (!ink) return [];
  const minLen = Math.round(W * 0.045), raw: [number, number, number][] = [];
  for (let y = 0; y < H; y++) {
    const o = y * W; let run = 0, x0 = 0;
    for (let x = 0; x <= W; x++) {
      if (x < W && ink[o + x]) { if (!run) x0 = x; run++; } else { if (run >= minLen) raw.push([x0, x - 1, y]); run = 0; }
    }
  }
  const tol = Math.max(4, W * 0.003), lines: Cizgi[] = [];
  raw.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  for (const s of raw) {
    const l = lines.find((q) => Math.abs(q[0] - s[0]) <= tol && Math.abs(q[1] - s[1]) <= tol && s[2] - q[3] <= 2 && s[2] >= q[2]);
    if (l) l[3] = s[2]; else lines.push([s[0], s[1], s[2], s[2]]);
  }
  const cizgi = (i: number): Cizgi => lines[i]!;
  const used = new Set<number>(), blocks: TabloBlogu[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const grp = [i];
    for (let j = i + 1; j < lines.length; j++) {
      if (!used.has(j) && Math.abs(cizgi(j)[0] - cizgi(i)[0]) <= tol * 1.5 && Math.abs(cizgi(j)[1] - cizgi(i)[1]) <= tol * 1.5) grp.push(j);
    }
    grp.sort((a, b) => cizgi(a)[2] - cizgi(b)[2]);
    let chain = [grp[0]!];
    const flush = () => {
      if (chain.length < 3) return;
      chain.forEach((k) => used.add(k));
      const L0 = cizgi(chain[0]!), L1 = cizgi(chain[chain.length - 1]!);
      blocks.push({ x0: Math.min(L0[0], L1[0]), x1: Math.max(L0[1], L1[1]), y0: L0[2], y1: L1[3] });
    };
    for (let k = 1; k < grp.length; k++) {
      if (cizgi(grp[k]!)[2] - cizgi(chain[chain.length - 1]!)[3] <= H * 0.06) chain.push(grp[k]!); else { flush(); chain = [grp[k]!]; }
    }
    flush();
  }
  return blocks;
}

// Mürekkep haritası: Otsu eşiği (taranmış resimdeki soluk çizgiler için), makul aralıkta.
export function murekkep(img: Goruntu): Uint8Array {
  const d = img.data, n = img.width * img.height, ink = new Uint8Array(n), g = new Uint8Array(n), hist = new Uint32Array(256);
  for (let i = 0, j = 0; i < n; i++, j += 4) { const v = (d[j]! * 77 + d[j + 1]! * 150 + d[j + 2]! * 29) >> 8; g[i] = v; hist[v]!++; }
  const th = otsu(hist, n, 165, 150, 215);
  for (let i = 0; i < n; i++) ink[i] = g[i]! < th ? 1 : 0;
  return ink;
}

// Otsu eşiği: varsayılan, alt ve üst sınırla (inkOf ve ocrPrep aynı hesabı farklı sınırla yapar).
export function otsu(hist: Uint32Array, n: number, varsayilan: number, alt: number, ust: number): number {
  let sum = 0, sB = 0, wB = 0, best = 0, th = varsayilan;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]!; if (!wB) continue;
    const wF = n - wB; if (!wF) break;
    sB += i * hist[i]!;
    const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) { best = v; th = i; }
  }
  return Math.min(ust, Math.max(alt, th));
}

interface Oge {
  s: string; x: number; y: number; h: number; a: number; w: number; dx: number; dy: number; ux: number; uy: number; ang: number; u: number; v: number;
  conf: number;
}
interface Satir { v: number; h: number; ang: number; parts: Oge[] }
interface Parca {
  txt: string; parts: Oge[]; gaps: number[]; u0: number; u1: number; v: number; h: number; ang: number; a: Oge; cx: number; cy: number;
  stack?: boolean; tag?: Bolge;
}
interface DislamaBolgesi extends TabloBlogu { why: 'table' | 'notes'; kw?: Parca }
type Sayac = Required<Pick<OkumaIstatistigi, 'items' | 'rows' | 'segs' | 'table' | 'border' | 'notes' | 'prose' | 'found' | 'high' | 'mid' | 'low' | 'tables'>>
  & { ocr: boolean };

const SEVIYE: Readonly<Record<GuvenSeviyesi, number>> = { high: 2, mid: 1, low: 0 };
const GENEL_EK = ' (genel tol.)';
// Çizimden okunan tolerans (±, sapma, uyum) ya da GD&T yanlış okunursa ölçüm yanlış kabul alır (967 a): böyle öneri güveni ne olursa olsun
// seçilmemiş gelir, kullanıcı tek tek onaylar. Genel tolerans (ISO 2768) bu kurala girmez.
export const onayIster = (o: Pick<OlcuOnerisi, 'kind' | 'l' | 'ref'>): boolean => !o.ref && (o.kind === 'gdt' || !o.l.endsWith(GENEL_EK));
export const OLCU_TURU_ADI: Readonly<Record<string, string>> = {
  diameter: 'Çap', linear: 'Uzunluk', radius: 'Radyus', angle: 'Açı', thread: 'Diş', chamfer: 'Pah', rough: 'Yüzey pürüzlülüğü',
};
export const olcuTuruAdi = (p: Pick<TolSonucu, 'kind' | 'gdtName'>): string =>
  p.kind === 'gdt' ? p.gdtName || 'Geometrik tol.' : OLCU_TURU_ADI[p.kind] ?? 'Ölçü';
const enKucuk = (l: readonly number[]): number => Math.min.apply(null, l as number[]);
const enBuyuk = (l: readonly number[]): number => Math.max.apply(null, l as number[]);

// Metin parçalarından ölçü önerileri (pdfDims).
export function olcuOnerileri(items0: readonly MetinOgesi[], cls: string, secenek?: OkumaSecenegi): OlcuListesi {
  const opt = secenek ?? {};
  const T = AKTol, W = opt.w || 4000, H = opt.h || 3000, ink = opt.ink || null, M = Math.min(W, H);
  const ex: Ayiklama = opt.ex || {}, autoR = SEVIYE[opt.auto || 'mid'];
  const st: Sayac = { items: items0.length, rows: 0, segs: 0, table: 0, border: 0, notes: 0, prose: 0, found: 0, high: 0, mid: 0, low: 0, ocr: !!opt.ocr, tables: 0 };
  // 1) Öğeler, yerel koordinatta (u okuma yönü, v yukarı).
  const it: Oge[] = [];
  for (const o of items0) {
    const s = glifDuzelt(String(o.s), o.font).replace(/\s+/g, ' ').trim(); if (!s) continue;
    const a = o.a, dx = Math.cos(a), dy = Math.sin(a), ux = Math.sin(a), uy = -Math.cos(a), h = Math.max(o.h, 1);
    let ang = Math.round(a * 180 / Math.PI / 2) * 2; if (ang <= -180) ang += 360;
    it.push({ s, x: o.x, y: o.y, h, a, w: o.w > 0 ? o.w : h * 0.55 * s.length, dx, dy, ux, uy, ang, u: o.x * dx + o.y * dy, v: o.x * ux + o.y * uy, conf: o.conf == null ? 100 : o.conf });
  }
  // 2) Aynı taban çizgisindekiler satır olur; satır içinde boşluğa göre parçalara ayrılır.
  const groups = new Map<number, Oge[]>();
  for (const o of it) { const g = groups.get(o.ang); if (g) g.push(o); else groups.set(o.ang, [o]); }
  const rows: Satir[] = [];
  for (const g of groups.values()) {
    g.sort((p, q) => p.v - q.v);
    let open: Satir[] = [];
    for (const o of g) {
      open = open.filter((r) => o.v - r.v <= r.h * 1.2);
      let best: Satir | null = null, bd = 1e9;
      for (const r of open) {
        const dv = Math.abs(o.v - r.v), k = o.h / r.h;
        const uyar = opt.ocr ? dv < 0.4 * Math.min(r.h, o.h) && k > 0.66 && k < 1.5 : dv < 0.4 * Math.min(r.h, o.h) && k > 0.72 && k < 1.38;
        if (uyar && dv < bd) { bd = dv; best = r; }
      }
      if (best) best.parts.push(o); else { const r: Satir = { v: o.v, h: o.h, ang: o.ang, parts: [o] }; open.push(r); rows.push(r); }
    }
  }
  st.rows = rows.length;
  const GD = T.GDT_CHARS || '';
  const isGd = (c: string | undefined): boolean => !!c && GD.indexOf(c) >= 0;
  const segs: Parca[] = [];
  for (const r of rows) {
    r.parts.sort((p, q) => p.u - q.u);
    let cur: Parca | null = null;
    for (const o of r.parts) {
      const gap = cur ? o.u - cur.u1 : 1e9;
      const gdtJoin = !!cur && isGd(cur.parts[0]!.s[0]) && gap < 3.4 * r.h && gap > -0.5 * r.h && o.s.length <= 9 && /^[Ø\d.A-Z|ⓂⓁⓈⓅ() -]+$/.test(o.s);
      if (cur && ((gap < 0.95 * r.h && gap > -0.5 * r.h) || gdtJoin)) {
        cur.txt += gdtJoin && gap >= 0.95 * r.h ? ' | ' : gap > 0.18 * r.h ? ' ' : '';
        cur.txt += o.s; cur.parts.push(o); cur.gaps.push(gap); cur.u1 = Math.max(cur.u1, o.u + o.w);
      } else { cur = { txt: o.s, parts: [o], gaps: [], u0: o.u, u1: o.u + o.w, v: r.v, h: r.h, ang: r.ang, a: o, cx: 0, cy: 0 }; segs.push(cur); }
    }
  }
  st.segs = segs.length;
  // Yerelden piksele.
  const P = (sg: Pick<Parca, 'a' | 'v'>, u: number, vo: number): [number, number] => {
    const a = sg.a; return [u * a.dx + (sg.v + vo) * a.ux, u * a.dy + (sg.v + vo) * a.uy];
  };
  for (const sg of segs) { const c = P(sg, (sg.u0 + sg.u1) / 2, sg.h * 0.35); sg.cx = c[0]; sg.cy = c[1]; }
  // 3) İstifli toleranslar (+0.02 / -0.01).
  const small = segs.filter((o) => /^([+\-±]\s*)?\d*[.,]?\d+$/.test(o.txt.replace(/\s/g, '')) || o.txt.trim() === '0');
  for (const L of segs) {
    if (!/\d$|[A-Za-z]\d$/.test(L.txt) || L.stack) continue;
    let c = small.filter((o) => o !== L && !o.stack && o.ang === L.ang && o.h < 0.85 * L.h && o.u0 >= L.u1 - 0.3 * L.h && o.u0 <= L.u1 + 1.6 * L.h
      && o.v <= L.v + 1.4 * L.h && o.v >= L.v - 0.6 * L.h);
    // Daha gevşek: aynı boyda istif, biraz uzakta başlayan ya da daha aşağı inen alt satır.
    if (c.length < 2) {
      c = small.filter((o) => o !== L && !o.stack && o.ang === L.ang && o.h <= 1.02 * L.h && o.u0 >= L.u1 - 0.5 * L.h && o.u0 <= L.u1 + 2.6 * L.h
        && o.v <= L.v + 1.7 * L.h && o.v >= L.v - 1.1 * L.h);
    }
    if (c.length >= 2) { c.sort((a, b) => b.v - a.v); if (c[0]!.v - c[c.length - 1]!.v < 0.55 * Math.min(c[0]!.h, c[c.length - 1]!.h)) c = []; }
    if (c.length >= 2) {
      c.sort((a, b) => b.v - a.v);
      const up = c[0]!, lo = c[c.length - 1]!;
      L.txt += ' ' + up.txt.replace(/\s/g, '') + '/' + lo.txt.replace(/\s/g, ''); up.stack = lo.stack = true; L.u1 = Math.max(L.u1, up.u1, lo.u1);
    }
  }
  // 4) Dışlama bölgeleri.
  const zones: DislamaBolgesi[] = [];
  const icinde = (s: Parca, b: TabloBlogu) => s.cx >= b.x0 && s.cx <= b.x1 && s.cy >= b.y0 && s.cy <= b.y1;
  const tbl = tabloBul(ink, W, H).filter((b) => {
    const inside = segs.filter((s) => icinde(s, b));
    return inside.length >= 3 && (inside.some((s) => ANAHTAR_KELIME.test(katla(s.txt))) || inside.length >= 6);
  });
  st.tables = tbl.length;
  tbl.forEach((b) => zones.push({ why: 'table', ...b }));
  for (const s of segs) {
    const f = katla(s.txt);
    if (ANAHTAR_KELIME.test(f) && !tbl.some((b) => icinde(s, b)) && Math.abs(s.ang) < 3) {
      zones.push({ why: 'table', x0: s.a.x - s.h, x1: s.a.x + s.h * 16, y0: s.a.y - s.h * 1.6, y1: s.a.y + s.h * 3.6, kw: s });
    }
    if (NOT_BASLIGI.test(f)) zones.push({ why: 'notes', x0: s.a.x - s.h * 2, x1: s.a.x + s.h * 70, y0: s.a.y - s.h * 0.5, y1: s.a.y + s.h * 26, kw: s });
  }
  // Tablo başlık satırı (en az iki anahtar kelime yan yana): sütun hizasındaki satırlar da tablo sayılır.
  const flat = segs.filter((s) => Math.abs(s.ang) < 3);
  const kwRows: { y: number; h: number; segs: Parca[] }[] = [];
  for (const s of flat) {
    if (!ANAHTAR_KELIME.test(katla(s.txt))) continue;
    const r = kwRows.find((q) => Math.abs(q.y - s.a.y) < s.h * 0.7);
    if (r) r.segs.push(s); else kwRows.push({ y: s.a.y, h: s.h, segs: [s] });
  }
  const rowsY: { y: number; segs: Parca[] }[] = [];
  for (const s of flat) { const r = rowsY.find((q) => Math.abs(q.y - s.a.y) < s.h * 0.6); if (r) r.segs.push(s); else rowsY.push({ y: s.a.y, segs: [s] }); }
  rowsY.sort((a, b) => a.y - b.y);
  for (const kr of kwRows) {
    if (kr.segs.length < 2) continue;
    const cols = kr.segs.map((s) => s.a.x), hh = kr.h, x0 = enKucuk(cols) - hh * 2, x1 = enBuyuk(kr.segs.map((s) => s.a.x + (s.u1 - s.u0))) + hh * 16;
    let y0 = kr.y - hh * 1.2, y1 = kr.y + hh * 0.6;
    const ri = rowsY.findIndex((r) => Math.abs(r.y - kr.y) < hh * 0.6);
    for (const dir of [1, -1]) {
      let last = kr.y;
      for (let k = ri + dir; k >= 0 && k < rowsY.length; k += dir) {
        const r = rowsY[k]!; if (Math.abs(r.y - last) > hh * 3.2) break;
        const inX = r.segs.filter((s) => s.a.x >= x0 && s.a.x <= x1); if (!inX.length) continue;
        const hit = inX.filter((s) => cols.some((c) => Math.abs(s.a.x - c) < hh * 1.3)).length;
        if (!hit) break;
        last = r.y; if (dir > 0) y1 = r.y + hh * 0.6; else y0 = r.y - hh * 1.2;
      }
    }
    zones.push({ why: 'table', x0, x1, y0, y1 });
  }
  const edge = M * 0.022, edge2 = M * 0.05;
  const zoneOf = (s: Parca): 'border' | 'table' | 'notes' | null => {
    if (s.cx < edge || s.cy < edge || s.cx > W - edge || s.cy > H - edge) return 'border';
    if (/^([A-Z]|\d{1,2})$/.test(s.txt) && (s.cx < edge2 || s.cy < edge2 || s.cx > W - edge2 || s.cy > H - edge2)) return 'border';
    for (const z of zones) if (z.kw !== s && icinde(s, z)) return z.why;
    if (/^\d{1,2}[.)]\s+\S/.test(s.txt) && duzyaziMi(s.txt)) return 'notes';
    return null;
  };
  // 5) Ayrıştır: bütün parça, olmazsa alt parçalar.
  const collapse = (s: string) => s.replace(/(\d)\s+(?=[\d.])/g, '$1').replace(/\.\s+(?=\d)/g, '.');
  const tryP = (s: string) => T.parse(s, { cls }) || (/\d\s+[\d.]/.test(s) ? T.parse(collapse(s), { cls }) : null);
  const cands: { s: Parca; p: TolSonucu; txt: string }[] = [];
  for (const s of segs) {
    if (s.stack) { s.tag = 'stack'; continue; }
    const z = zoneOf(s);
    if (z) { st[z]++; s.tag = z; if (ex[z] !== false) continue; }
    if (ANAHTAR_KELIME.test(katla(s.txt)) || NOT_BASLIGI.test(katla(s.txt))) { s.tag = s.tag || 'table'; continue; }
    if (opt.ocr) s.txt = s.txt.replace(/^(\S*\d)\s+\+\s?(\d*\.\d+)$/, '$1 ±$2');
    const p = tryP(s.txt);
    if (p) { cands.push({ s, p, txt: s.txt }); s.tag = 'dim'; continue; }
    if (duzyaziMi(s.txt)) { st.prose++; s.tag = 'prose'; if (ex.prose !== false) continue; }
    if (s.parts.length > 1) {
      let i = 0; const n = s.parts.length;
      while (i < n) {
        let hit = false;
        for (let j = Math.min(n - 1, i + 3); j >= i; j--) {
          if (i === 0 && j === n - 1) continue;
          const ps = s.parts.slice(i, j + 1);
          const txt = ps.map((q, k) => (k ? (q.u - (ps[k - 1]!.u + ps[k - 1]!.w) > 0.18 * s.h ? ' ' : '') : '') + q.s).join('');
          const q = tryP(txt);
          if (q) {
            s.tag = 'dim';
            const sub: Parca = { ...s, parts: ps, u0: ps[0]!.u, u1: enBuyuk(ps.map((x) => x.u + x.w)), txt, a: ps[0]! };
            const c = P(sub, (sub.u0 + sub.u1) / 2, s.h * 0.35); sub.cx = c[0]; sub.cy = c[1];
            cands.push({ s: sub, p: q, txt }); i = j + 1; hit = true; break;
          }
        }
        if (!hit) i++;
      }
    }
  }
  // 6) Ölçü çizgisi kanıtı: yazının altında ya da üstünde yazıdan uzun düz çizgi.
  const inkAt = (x0: number, y0: number): number => {
    if (!ink) return 0;
    const x = Math.round(x0), y = Math.round(y0); if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return 0;
    const o = y * W + x; return ink[o]! || ink[o - W]! || ink[o + W]!;
  };
  const dimLine = (sg: Parca): boolean => {
    if (!ink) return false;
    const len = sg.u1 - sg.u0, n = 28;
    for (const off of [-0.18, -0.3, -0.45, -0.62, -0.8, -1.0, 1.12, 1.3]) {
      let hit = 0; for (let k = 0; k < n; k++) { const q = P(sg, sg.u0 + len * (k + 0.5) / n, sg.h * off); hit += inkAt(q[0], q[1]); }
      if (hit / n >= 0.86) return true;
    }
    return false;
  };
  const hs = cands.map((c) => c.s.h).sort((a, b) => a - b), modalH = hs.length ? hs[hs.length >> 1]! : 0;
  const out: OlcuListesi = [];
  for (const { s, p } of cands) {
    let c = 0.3; const why: string[] = [];
    if (p.kind === 'gdt') { c += 0.45; why.push('GD&T'); } else if (p.kind === 'rough') { c += 0.15; why.push('yüzey'); } else {
      if (!p.general) { c += 0.3; why.push(p.fit ? 'geçme' : 'toleranslı'); }
      if (/^(SØ|SR|Ø|R|M|□|C)$/.test(p.prefix) || p.kind === 'thread') { c += 0.2; why.push('sembol'); }
      if (p.kind === 'angle' || p.kind === 'chamfer') c += 0.12;
      if (p.count > 1) c += 0.08;
    }
    if (dimLine(s)) { c += 0.25; why.push('ölçü çizgisi'); }
    if (modalH && !opt.ocr) { if (Math.abs(s.h / modalH - 1) < 0.25) c += 0.05; else { c -= 0.12; why.push('farklı yazı boyu'); } }
    if (p.general && !p.prefix && p.kind === 'linear' && p.nominal < 10 && Number.isInteger(p.nominal)) { c -= 0.2; why.push('tek hane'); }
    if (p.ref) { c -= 0.25; why.push('referans'); }
    if (opt.ocr) { const oc = enKucuk(s.parts.map((q) => q.conf)); c -= oc < 60 ? 0.25 : oc < 80 ? 0.12 : 0.04; why.push('OCR %' + Math.round(oc)); }
    c = Math.max(0, Math.min(1, c));
    const lvl: GuvenSeviyesi = c >= 0.6 ? 'high' : c >= 0.38 ? 'mid' : 'low';
    // Balon yazının üst sağında; kılavuz çizgi yazı kutusuna.
    const a = s.a, hw = (s.u1 - s.u0) / 2;
    const bx = s.cx + a.ux * s.h * 1.9 + a.dx * (hw + s.h * 0.6), by = s.cy + a.uy * s.h * 1.9 + a.dy * (hw + s.h * 0.6);
    if (out.some((o) => o.nom === p.nomText && Math.hypot(o.tx - s.cx, o.ty - s.cy) < s.h * 2)) continue;
    const o: OlcuOnerisi = {
      x: bx, y: by, tx: s.cx, ty: s.cy, ar: [s.cx, s.cy, hw, s.h * 0.62, Math.atan2(a.dy, a.dx)],
      l: (p.label || olcuTuruAdi(p)) + (p.ref ? ' (referans)' : p.general ? GENEL_EK : ''), nom: p.nomText, tol: p.tolText, min: p.min, max: p.max,
      tool: p.tool, gauge: p.gauge, raw: s.txt, unknown: !!p.unknownFit, note: p.note || '', kind: p.kind, ref: !!p.ref, conf: +c.toFixed(2), lvl,
      why: why.join(' · '), on: SEVIYE[lvl] >= autoR && !p.ref && p.kind !== 'rough',
    };
    if (o.on && onayIster(o)) o.on = false;
    out.push(o);
  }
  // Okuma sırası: yukarıdan aşağı, soldan sağa (bantlı).
  const band = Math.max(modalH * 6, H / 24);
  out.sort((p, q) => Math.floor(p.ty / band) - Math.floor(q.ty / band) || p.tx - q.tx);
  out.forEach((o) => { st[o.lvl]++; });
  st.found = out.length;
  out.stats = st;
  if (opt.diag) {
    out.diag = {
      segs: segs.map((q) => ({ t: q.txt, x: q.cx, y: q.cy, w: q.u1 - q.u0, h: q.h, a: Math.atan2(q.a.dy, q.a.dx), z: q.tag || 'none' })),
      zones: zones.map((z) => ({ why: z.why, x0: z.x0, y0: z.y0, x1: z.x1, y1: z.y1 })),
    };
  }
  return out;
}

// Metin katmanından ve OCR'dan gelen ölçüler birleşir; aynı yerdeki aynı değer bir kez sayılır (pdf.ts mergeDims).
export function olcuBirlestir(a: OlcuListesi, b: readonly OlcuOnerisi[], W: number, bst?: OkumaIstatistigi): OlcuListesi {
  const add = b.filter((p) => !a.some((q) => q.nom === p.nom && Math.hypot(q.tx - p.tx, q.ty - p.ty) < W * 0.012));
  const out: OlcuListesi = a.concat(add), sa = a.stats || {}, sb = bst || {};
  const st: OkumaIstatistigi = { ...sa, found: out.length, ocr: true, ocrAdd: add.length, high: 0, mid: 0, low: 0 };
  out.forEach((o) => { st[o.lvl] = (st[o.lvl] || 0) + 1; });
  (['table', 'border', 'notes', 'prose'] as const).forEach((k) => { st[k] = (sa[k] || 0) + (sb[k] || 0); });
  out.stats = st;
  return out;
}

// Mürekkep haritası önbellekte bit dizisi olarak durur.
export function bitPaketle(a: ArrayLike<number>): Uint8Array {
  const o = new Uint8Array((a.length + 7) >> 3);
  for (let i = 0; i < a.length; i++) if (a[i]) o[i >> 3]! |= 1 << (i & 7);
  return o;
}
export function bitAc(p: ArrayLike<number>, n: number): Uint8Array {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = (p[i >> 3]! >> (i & 7)) & 1;
  return a;
}

// OCR okumasının düzeltmeleri (ocr.ts): rakama benzeyen harfler, çap işareti, kelime kutusu ve çakışan okumaların ayıklanması.
export const OCR_RAKAMI: Readonly<Record<string, string>> = {
  O: '0', o: '0', D: '0', Q: '0', S: '5', s: '5', I: '1', l: '1', '|': '1', i: '1', B: '8', Z: '2', z: '2', G: '6', b: '6', g: '9', q: '9', A: '4', T: '7',
};
const rakamla = (r: string): string => r.replace(/[^0-9.,]/g, (ch) => OCR_RAKAMI[ch] ?? ch);
export function ocrDuzelt(s0: string): string {
  let s = s0.replace(/^[“"'‘`]+|[”"'’`]+$/g, '').replace(/^[£t](?=\s?\d)/, '±').replace(/^([±+-])0(\d+)$/, '$10.$2');
  s = s.replace(/^[O@%Q¢øoD](?=\d)/, 'Ø');
  // Önek (Ø/R/M/C) ve sayıya benzeyen harfler rakam olur (RS → R5, RO.4 → R0.4).
  s = s.replace(/^(Ø|R|M|C)([0-9OoDQSsIlBZzGbgqi|.,]{1,6})$/, (m, p: string, r: string) => (/[0-9]/.test(r) || r.length <= 2 ? p + rakamla(r) : m));
  s = s.replace(/^([0-9OoSIlBZ.,]{2,8})$/, (m, r: string) => (/^\d/.test(r) && /\d/.test(r.slice(1)) ? rakamla(r) : m));
  return s.replace(/(\d)[o*º](?=$|\s|[±+-])/g, '$1°').replace(/(\d)[Il|](?=\d)/g, '$11');
}

// Karakter kutusunda çap işareti (Ø) var mı: halka ve çapraz çizgi iki çapraz delik bırakır.
export function capIsaretiMi(bin: ArrayLike<number>, W: number, H: number, x00: number, y00: number, x10: number, y10: number): boolean {
  const x0 = Math.max(0, x00 - 1), y0 = Math.max(0, y00 - 1), x1 = Math.min(W - 1, x10 + 1), y1 = Math.min(H - 1, y10 + 1);
  const w = x1 - x0 + 1, h = y1 - y0 + 1; if (w < 6 || h < 6 || w * h > 40000) return false;
  const lab = new Int32Array(w * h), st: number[] = [];
  const at = (x: number, y: number) => bin[(y0 + y) * W + x0 + x];
  // Kenara değen boşluklar dıştır.
  const fill = (sx: number, sy: number, id: number): [number, number, number] => {
    let n = 0, cx = 0, cy = 0; st.push(sx, sy); lab[sy * w + sx] = id;
    while (st.length) {
      const y = st.pop()!, x = st.pop()!; n++; cx += x; cy += y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx; if (lab[k] || at(nx, ny)) continue;
        lab[k] = id; st.push(nx, ny);
      }
    }
    return [n, cx / n, cy / n];
  };
  for (let x = 0; x < w; x++) { if (!lab[x] && !at(x, 0)) fill(x, 0, -1); if (!lab[(h - 1) * w + x] && !at(x, h - 1)) fill(x, h - 1, -1); }
  for (let y = 0; y < h; y++) { if (!lab[y * w] && !at(0, y)) fill(0, y, -1); if (!lab[y * w + w - 1] && !at(w - 1, y)) fill(w - 1, y, -1); }
  const holes: [number, number, number][] = []; let id = 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = y * w + x; if (!lab[k] && !at(x, y)) { const r = fill(x, y, id++); if (r[0] >= 4) holes.push(r); } }
  if (holes.length !== 2) return false;
  const dx = Math.abs(holes[0]![1] - holes[1]![1]), dy = Math.abs(holes[0]![2] - holes[1]![2]);
  return dx > w * 0.18 && dy > h * 0.18;
}

export function kelimeKutusu(o: Pick<MetinOgesi, 'x' | 'y' | 'a' | 'w' | 'h'>): number[] {
  const c = Math.cos(o.a || 0), s = Math.sin(o.a || 0), x2 = o.x + c * o.w, y2 = o.y + s * o.w;
  const hx = s * o.h * 0.72, hy = -c * o.h * 0.72;
  const xs = [o.x, x2, o.x + hx, x2 + hx], ys = [o.y, y2, o.y + hy, y2 + hy];
  return [enKucuk(xs), enKucuk(ys), enBuyuk(xs), enBuyuk(ys)];
}
// Karo bindirmesinden ve iki geçişten gelen çakışmalar ayıklanır: rakamlı, uzun ve güvenli okuma kalır. Öğelerin sırası ve kutusu değişir (eskisi gibi).
export function kelimeAyikla<O extends MetinOgesi & { conf: number }>(items: O[]): O[] {
  items.forEach((o) => { o.bb = kelimeKutusu(o); });
  const val = (o: O) => (/\d/.test(o.s) ? 100 + Math.min(o.s.length, 6) * 10 : 0) + o.conf;
  items.sort((p, q) => val(q) - val(p));
  const keep: O[] = [];
  for (const o of items) {
    const b = o.bb!;
    const ov = keep.find((k) => {
      const a = k.bb!, ix = Math.max(0, Math.min(a[2]!, b[2]!) - Math.max(a[0]!, b[0]!)), iy = Math.max(0, Math.min(a[3]!, b[3]!) - Math.max(a[1]!, b[1]!));
      const ar = (b[2]! - b[0]!) * (b[3]! - b[1]!);
      return ix * iy > 0.45 * Math.min(ar, (a[2]! - a[0]!) * (a[3]! - a[1]!));
    });
    if (!ov) keep.push(o);
  }
  return keep;
}
// Okunabilir PDF yazıları görüntüden silinir: OCR yalnız çizgiye dönmüş yazıları okur, aynı ölçü iki kez gelmez. Görüntü yerinde değişir.
export function yaziMaskele<G extends { data: { [i: number]: number }; width: number; height: number }>(
  img: G, items: readonly MetinOgesi[] | null | undefined, ox: number, oy: number, f: number,
): G {
  if (!items || !items.length) return img;
  const W = img.width, H = img.height, d = img.data;
  for (const o of items) {
    if (!/[0-9A-Za-z]/.test(o.s)) continue;
    const b = kelimeKutusu(o), p = o.h * 0.22;
    const x0 = Math.max(0, Math.floor((b[0]! - p - ox) * f)), y0 = Math.max(0, Math.floor((b[1]! - p - oy) * f));
    const x1 = Math.min(W, Math.ceil((b[2]! + p - ox) * f)), y1 = Math.min(H, Math.ceil((b[3]! + p - oy) * f));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const j = (y * W + x) * 4; d[j] = d[j + 1] = d[j + 2] = 255; }
  }
  return img;
}
