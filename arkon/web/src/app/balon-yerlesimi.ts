

/* ── Balon yerleşimi: üst üste binmeyi önler, boş yere kaydırır, ölçüye kılavuz çizgi çeker ── */
/** yazı kutusu: merkez x, y; yarı genişlik, yarı yükseklik; açı (radyan) */
type Kutu = number[];
type Nokta = number[];
export interface YerlesecekBalon { id: string | number; x: number; y: number; ar?: Kutu | null }
export interface BalonYeri { x: number; y: number; lead: number[] | null }
export function boxPt(ar: Kutu, px: number, py: number): Nokta { // yazı kutusunun (döndürülmüş) balona en yakın noktası
  const c = Math.cos(ar[4]), s = Math.sin(ar[4]), dx = px - ar[0], dy = py - ar[1];
  const lu = Math.max(-ar[2], Math.min(ar[2], dx * c + dy * s)), lv = Math.max(-ar[3], Math.min(ar[3], -dx * s + dy * c));
  return [ar[0] + lu * c - lv * s, ar[1] + lu * s + lv * c];
}
export function layoutBalloons(bal: YerlesecekBalon[], U: number, W: number, H: number, ink: ArrayLike<number> | null) {
  const out: { s: number; pos: Record<string, BalonYeri> } = { s: 1, pos: {} };
  if (!bal || !bal.length) return out;
  const R0 = 16 * U;
  const anc: Nokta[] = bal.map(b => b.ar ? [b.ar[0], b.ar[1]] : [b.x, b.y]);
  // yoğun resimde balonlar küçülür (en yakın komşu mesafesinin medyanına göre)
  if (bal.length > 2) {
    const nn = anc.map((a, i) => { let m = 1e9; anc.forEach((b, j) => { if (i !== j) m = Math.min(m, Math.hypot(a[0] - b[0], a[1] - b[1])); }); return m; }).sort((a, b) => a - b);
    const med = nn[nn.length >> 1];
    out.s = Math.max(0.62, Math.min(1, med / (R0 * 3.2)));
  }
  const R = R0 * out.s, gap = R * 0.22;
  const placed: Nokta[] = [];
  const boxes = bal.flatMap(b => b.ar ? [b.ar] : []);
  const inkCost = (x: number, y: number) => {
    if (!ink) return 0;
    let n = 0; const r = R * 0.95;
    for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; for (const f of [0.45, 0.95]) { const px = Math.round(x + Math.cos(a) * r * f), py = Math.round(y + Math.sin(a) * r * f); if (px > 0 && py > 0 && px < W && py < H && ink[py * W + px]) n++; } }
    return n / 32;
  };
  const hitsText = (x: number, y: number) => boxes.some(ar => { const p = boxPt(ar, x, y); return Math.hypot(p[0] - x, p[1] - y) < R * 0.95; });
  const overlap = (x: number, y: number) => { let o = 0; for (const p of placed) { const d = Math.hypot(p[0] - x, p[1] - y); if (d < 2 * R + gap) o += (2 * R + gap - d); } return o; };
  const inside = (x: number, y: number) => x > R && y > R && x < W - R && y < H - R;
  bal.forEach((b, i) => {
    const a = anc[i], own = b.ar || null;
    let best: Nokta;
    // yazısı bilinen balon: yazının hemen üstü (sağa yakın), yazıyı örtmeden
    let pref = [b.x, b.y];
    if (own) { const c = Math.cos(own[4]), sn = Math.sin(own[4]), lu = own[2] * 0.55, lv = -(own[3] + R * 1.2); pref = [own[0] + lu * c - lv * sn, own[1] + lu * sn + lv * c]; }
    const ok0 = inside(pref[0], pref[1]) && overlap(pref[0], pref[1]) === 0 && !hitsText(pref[0], pref[1]) && inkCost(pref[0], pref[1]) < 0.35;
    if (ok0) best = pref;
    else {
      const base = own ? Math.max(own[2], own[3]) : 0, cands: number[][] = [];
      for (const k of [1.25, 1.75, 2.4, 3.2, 4.3, 5.6]) for (let t = 0; t < 16; t++) {
        const ang = -Math.PI / 4 + t * Math.PI / 8, rr = base + R * k * (own ? 1 : 1.1);
        const x = a[0] + Math.cos(ang) * rr, y = a[1] + Math.sin(ang) * rr;
        if (!inside(x, y)) continue;
        const ov = overlap(x, y), cost = ov * 50 + (hitsText(x, y) ? R * 6 : 0) + inkCost(x, y) * R * 5 + Math.hypot(x - pref[0], y - pref[1]) * 0.35 + rr * 0.5;
        cands.push([cost, x, y]);
      }
      cands.sort((p, q) => p[0] - q[0]);
      best = cands.length ? [cands[0][1], cands[0][2]] : pref;
    }
    placed.push(best);
    let lead: number[] | null = null;
    if (own) { const p = boxPt(own, best[0], best[1]), d = Math.hypot(p[0] - best[0], p[1] - best[1]); if (d > R * 1.02) { const k = R / d; lead = [best[0] + (p[0] - best[0]) * k, best[1] + (p[1] - best[1]) * k, p[0], p[1]]; } }
    else { const d = Math.hypot(a[0] - best[0], a[1] - best[1]); if (d > R * 0.6) { const k = R / d; lead = [best[0] + (a[0] - best[0]) * k, best[1] + (a[1] - best[1]) * k, a[0], a[1]]; } }
    out.pos[b.id] = { x: best[0], y: best[1], lead };
  });
  return out;
}

