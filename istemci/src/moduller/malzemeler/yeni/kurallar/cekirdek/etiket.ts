import { FAMS } from './durum.ts';
import { specData } from './foy.ts';
import { qrcode } from './ortam.ts';
import { qrMetni } from './roller-talep.ts';
import { dimsStr, weight } from './turler.ts';
import { IMP, kgFmt } from './yardimcilar.ts';
import type { Sozluk, Taslak } from './tipler.ts';

export function qrPath(text: string, x0: number, y0: number, size: number): string {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    const c = size / (n + 2);
    let p = '';
    for (let r = 0; r < n; r++)
        for (let k = 0; k < n; k++)
            if (q.isDark(r, k))
                p += `M${(x0 + (k + 1) * c).toFixed(3)} ${(y0 + (r + 1) * c).toFixed(3)}h${c.toFixed(3)}v${c.toFixed(3)}h${(-c).toFixed(3)}z`;
    return p;
}
export function xesc(s: unknown): string { return (String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Sozluk<string>)[c]!)); }
export function wrapTxt(t: unknown, max: number, lines: number): string[] { const w = String(t).split(/\s+/); const out: string[] = []; let cur = ''; for (const x of w) {
    if ((cur + ' ' + x).trim().length > max) {
        if (cur)
            out.push(cur);
        cur = x;
    }
    else
        cur = (cur + ' ' + x).trim();
} if (cur)
    out.push(cur); if (lines < 1)
    return []; if (out.length > lines) {
    out.length = lines;
    out[lines - 1] = out[lines - 1]!.slice(0, max - 1) + '…';
} return out; }
export function labelSVG__0(x: Taslak, [W, H]: readonly [number, number]): string {
    const s = specData(x);
    // Ailesi tanımsız kartta şerit çizilmez; etiket yine basılır.
    const famRenk = (FAMS[x.fam as string] || FAMS.diger)?.c ?? 'none';
    const pad = 2.5, qs = H - 2 * pad;
    const qrTxt = qrMetni(x);
    const tx = pad + qs + 2.5, tw = W - tx - pad;
    const f1 = Math.min(H * 0.13, 5.6), f2 = Math.min(H * 0.085, 3.4), f3 = f2 * 0.9;
    const cw = (f: number) => f * 0.56;
    const mx = (f: number) => Math.max(6, Math.floor(tw / cw(f)));
    const kod = String(s.kod);
    const kodFs = Math.max(Math.min(f1, tw / (kod.length * 0.7)), 2.2);
    const kodFit = kod.length * kodFs * 0.7 > tw;
    const ad = wrapTxt(s.ad, mx(f2), H >= 45 ? 3 : 2);
    const ds = dimsStr(x);
    const meta = [(s.g ? s.g.ad : '') + (s.std ? ' / ' + s.std : ''), s.ad.includes(dimsStr(x, true)) && !IMP() ? '' : ds].filter(Boolean).map(t => t.length > mx(f3) ? t.slice(0, mx(f3) - 1) + '…' : t);
    const w = weight(x);
    const foot = [w ? kgFmt(w.kg) : '', x.com && x.com.ted ? x.com.ted : ''].filter(Boolean).join('   ');
    let y = pad + kodFs * 0.95;
    let t = `<text x="${tx}" y="${y.toFixed(2)}" font-size="${kodFs.toFixed(2)}" font-weight="700"${kodFit ? ` textLength="${tw.toFixed(2)}" lengthAdjust="spacingAndGlyphs"` : ''}>${xesc(kod)}</text>`;
    y += f2 * 1.35;
    ad.forEach(l => { t += `<text x="${tx}" y="${y.toFixed(2)}" font-size="${f2.toFixed(2)}" font-weight="600">${xesc(l)}</text>`; y += f2 * 1.2; });
    y += f3 * 0.3;
    meta.forEach(l => { t += `<text x="${tx}" y="${y.toFixed(2)}" font-size="${f3.toFixed(2)}" fill="#333">${xesc(l)}</text>`; y += f3 * 1.2; });
    if (foot)
        t += `<text x="${tx}" y="${(H - pad).toFixed(2)}" font-size="${f3.toFixed(2)}" fill="#333">${xesc(foot.length > mx(f3) ? foot.slice(0, mx(f3) - 1) + '…' : foot)}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="'Barlow Condensed','Arial Narrow',Arial,sans-serif"><rect width="${W}" height="${H}" fill="#fff"/><rect width="1.4" height="${H}" fill="${famRenk}"/><path d="${qrPath(qrTxt, pad, pad, qs)}" fill="#000"/>${t}</svg>`;
}