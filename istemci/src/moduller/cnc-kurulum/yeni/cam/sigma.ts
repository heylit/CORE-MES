import { fmtN } from '../bicim.ts';
import { camCaps, fitCmp, fitI, type SigmaDurumu, type SigmaSatiri } from '../hesap/sinirlar.ts';
import { camReach } from './cekirdek.ts';
import type { CamTakim, FrezeIs, MtIs } from './tipler.ts';

/* Sigma kontrolu (programa bagli kisim): parca / ham ve takimlar tezgahin cap, boy, kurs, yuk sinirlarina sigiyor mu?
   Tezgah sinirlari ve karsilastirma cekirdekte (hesap/sinirlar.ts). */
export type SigmaListesi = (SigmaSatiri | { head: string })[];
export function fitToolLen(t: CamTakim): number { return (t.ln || camReach(t)) + 60; }

/* torna + (ayni tezgahta ya da ayri) freze */
export function camFitMT(J: MtIs): SigmaListesi {
  const cfg = J.cfg, L: SigmaListesi = [], C = camCaps(cfg.lathM), D0 = J.D0, Lp = J.Lp, stick = J.face + Lp + 0.5 + 3 + 5;
  L.push({ head: 'Torna · ' + cfg.lathM.name });
  if (cfg.lathM.manual) L.push(fitI('warn', 'Kumanda', 'elle (konvansiyonel)', 'CNC', 'Üniversal torna CNC değil: NC programı çalışmaz, işlem kartı ve ölçülerle çalışılır; süreler operatör hızına bağlıdır'));
  const fbar = fitCmp('Çubuk çapı → iş mili deliği', D0, C.bar, C.src['bar'], 'mm', 0.97, 'çubuk iş milinden geçmez: kesilmiş ham parçayla tek tek bağlayın ya da daha büyük çubuk kapasiteli tezgâh seçin'); if (fbar.st === 'bad') fbar.st = 'warn'; L.push(fbar);
  L.push(fitCmp('Ham çap → maks. tornalama çapı', D0, C.maxD, C.src['maxD'], 'mm', 0.95, 'tezgâhın tornalama çapını aşıyor'));
  L.push(fitCmp('Aynadan çıkış boyu → maks. tornalama boyu', stick, C.maxL, C.src['maxL'], 'mm', 0.95, 'tornalama boyuna sığmıyor'));
  let dmin = 1e9, run: { r: number; n: number } | null = null;
  J.P.prof.forEach((p) => { if (run && Math.abs(p.r - run.r) < 0.02) run.n++; else run = { r: p.r, n: 1 }; if (run.n >= 8 && p.r > 0.5) dmin = Math.min(dmin, 2 * p.r); }); if (dmin > 1e8) dmin = D0;
  const ld = stick / dmin; L.push(fitI(ld > 6 ? 'bad' : ld > 3.5 ? 'warn' : 'ok', 'Narinlik: serbest boy / en ince çap', fmtN(stick, 0) + ' / Ø' + fmtN(dmin, 0) + ' = ' + fmtN(ld, 1) + '×D', '≤ 3,5×D rahat · ≤ 6×D', ld > 6 ? 'punta ya da karşı iş mili desteği olmadan titreşir — destekle işleyin' : ld > 3.5 ? 'titreşim riski: finişte kesme derinliğini ve ilerlemeyi düşürün, karşı iş miliyle destekleyin' : ''));
  if (C.chuck) L.push(fitCmp('Ham çap → ayna tutma aralığı', D0, C.chuck * 25.4 * 0.8, C.src['chuck'], 'mm', 0.95, 'aynanın tutma aralığı dışında'));
  if (J.L2 && J.L2.ops.length) {
    let dg = 0; J.P.prof.forEach((p) => { if (-p.z <= J.grip) dg = Math.max(dg, 2 * p.r); });
    const sub = cfg.lathM.type === 'millturn', gr = J.grip / Math.max(1, dg);
    L.push(fitI(gr < 0.4 ? 'bad' : gr < 0.6 ? 'warn' : 'ok', (sub ? 'Karşı iş mili' : 'Ters bağlama') + ' tutma boyu', fmtN(J.grip, 0) + ' mm · Ø' + fmtN(dg, 0) + ' (' + fmtN(gr, 2) + '×D)', '≥ 0,6×D', gr < 0.4 ? 'bağlama boyu çok kısa — parça kayar' : gr < 0.6 ? 'kısa bağlama: sıkma kuvvetini ve kesme yükünü düşük tutun' : ''));
    if (sub && C.subBar) L.push(fitCmp('Tutulan çap → karşı iş mili kapasitesi', dg, C.subBar, C.src['subBar'], 'mm', 0.97, 'karşı iş mili bu çapı alamaz'));
  }
  const mill = J.rows.some((r) => r.proc === 'mill'); if (!mill) return L;
  if (!cfg.sep) {
    L.push({ head: 'C ekseni frezeleme · aynı tezgâh' });
    const yHalf = C.yT ? C.yT / 2 : 0; let worst = 0, ws: (typeof J.AS.setups)[number] | null = null;
    J.AS.setups.forEach((s, i) => {
      const R = J.res[i]; if (!R || !R.ops.length || s.dir.axial) return; const M = s.M!, yc = s.dir.ay[1]! * J.R + s.dir.ay[2]! * (-J.R) - M.o[1];
      R.ops.forEach((o) => { const r = o.tool.d / 2; if (o.cyc) o.cyc.holes.forEach((hh) => { const v = Math.abs(hh.y - yc) + r; if (v > worst) { worst = v; ws = s; } }); else o.mv.forEach((m) => { if (m.t && m.y != null) { const v = Math.abs(m.y - yc) + r; if (v > worst) { worst = v; ws = s; } } }); });
    });
    const w = ws as (typeof J.AS.setups)[number] | null;
    if (worst > 0) L.push(fitCmp('Radyal frezede yanal (Y) uzanım' + (w ? ' · ' + w.dir.name : ''), worst, yHalf, C.src['yT'], 'mm', 0.95, 'Y ekseni kursu (±' + fmtN(yHalf, 0) + ') yetmiyor: C ekseni interpolasyonu (polar) ya da ayrı freze tezgâhı gerekir'));
    let tl = 0; J.rows.forEach((r) => { if (r.proc === 'mill') tl = Math.max(tl, fitToolLen(r.tool)); });
    if (C.xT) L.push(fitCmp('Takım + parça yarıçapı → X kursu', tl + J.R, C.xT, C.src['xT'], 'mm', 0.95, 'en uzun takımla parça arasında X kursu yetmiyor'));
    return L;
  }
  const mm = cfg.millSel, MC = camCaps(mm);
  L.push({ head: 'Tornadan sonra freze · ' + mm.name });
  const mass = Math.PI * J.R * J.R * Lp / 1e6 * (J.c.mat.rho || 7.85);
  L.push(fitCmp('Tornalanmış parça ağırlığı → tabla yükü', mass, MC.load, MC.src['load'], 'kg', 0.9, 'tabla yükünü aşıyor'));
  L.push(fitI(2 * J.R > 100 ? 'warn' : 'ok', 'V-blok bağlama çapı', 'Ø' + fmtN(2 * J.R, 0), 'Ø5–100 (V-blok)', 2 * J.R > 100 ? 'V-blok aralığı dışında — prizma ya da üç ayaklı ayna kullanın' : ''));
  J.AS.setups.forEach((s, i) => {
    const R = J.res[i]; if (!R || !R.ops.length) return; const M = s.M!, H = M.zmax - M.zmin; let tl = 0, td = 0; R.ops.forEach((o) => { tl = Math.max(tl, fitToolLen(o.tool)); td = Math.max(td, o.tool.d); });
    const nm = 'OP' + (s.opn || s.op) + ' ' + s.dir.name;
    L.push(fitCmp(nm + ' · parça boyu + takım → X kursu', M.Lx + td + 20, MC.xT, MC.src['xT'], 'mm', 0.95, 'X kursu yetmiyor'));
    L.push(fitCmp(nm + ' · parça yüksekliği + takım boyu → iş mili–tabla', H + tl + (s.dir.axial ? 0 : 30), MC.zDay, MC.src['zDay'], 'mm', 0.92, 'parça + takım iş mili ile tabla arasına sığmıyor'));
  });
  return L;
}
/* yalniz freze (blok ham) */
export function camFitMill(J: FrezeIs): SigmaListesi {
  const m = J.mach, C = camCaps(m), st = J.G.stock, L: SigmaListesi = [{ head: 'Freze · ' + m.name }], mat = J.mat;
  const mass = st.Lx * st.Ly * st.Lz / 1e6 * (mat.rho || 7.85);
  L.push(fitCmp('Ham ağırlığı → tabla yükü', mass, C.load, C.src['load'], 'kg', 0.9, 'tabla yükünü aşıyor'));
  if (C.tblW) L.push(fitCmp('Ham boyu → tabla boyu', Math.max(st.Lx, st.Ly), C.tblW[0], C.src['tbl'], 'mm', 0.95, 'tablaya sığmıyor'));
  if (C.tblD) L.push(fitCmp('Ham köşegeni → döner tabla çapı', Math.hypot(st.Lx, st.Ly), C.tblD, C.src['tbl'], 'mm', 1.05, 'tabla çapını aşıyor — döner / devrilir tablada çarpma kontrolü yapın', 'tabla kenarına taşıyor; devirmede çarpma kontrolü yapın'));
  L.push(fitCmp('Bağlama genişliği → mengene açıklığı', Math.min(st.Lx, st.Ly), C.viseW, C.src['viseW'], 'mm', 0.95, 'mengeneye sığmıyor — pabuç / aparat ile bağlayın'));
  J.setups.forEach((s, i) => {
    const R = J.res[i]; if (!R || !R.ops.length) return; let tl = 0, td = 0; R.ops.forEach((o) => { tl = Math.max(tl, fitToolLen(o.tool)); td = Math.max(td, o.tool.d); });
    const nm = 'OP' + ((i + 1) * 10) + ' ' + s.dir.name, sL = s.L!;
    L.push(fitCmp(nm + ' · X uzanımı → X kursu', sL.x + td + 20, C.xT, C.src['xT'], 'mm', 0.95, 'X kursu yetmiyor'));
    L.push(fitCmp(nm + ' · Y uzanımı → Y kursu', sL.y + td + 20, C.yT, C.src['yT'], 'mm', 0.95, 'Y kursu yetmiyor'));
    L.push(fitCmp(nm + ' · yükseklik + takım → iş mili–tabla', sL.z + tl + 50, C.zDay, C.src['zDay'], 'mm', 0.92, 'parça + takım iş mili ile tabla arasına sığmıyor'));
  });
  return L;
}
export function sigmaSayilari(L: SigmaListesi): Record<SigmaDurumu, number> {
  const n: Record<SigmaDurumu, number> = { ok: 0, warn: 0, bad: 0, na: 0 }; L.forEach((x) => { if ('st' in x && x.st) n[x.st]++; }); return n;
}
