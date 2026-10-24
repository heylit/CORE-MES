import { D, STEPS, TURLER } from './durum.ts';
import { labelSVG__0, qrPath, wrapTxt, xesc } from './etiket.ts';
import { tplSummary__0 } from './sablonlar.ts';
import { stepOk__0 } from './taslak.ts';
import type { Kategori, Taslak, TurAdimi } from './tipler.ts';
import type { TurDegerleri, TurTaslagi } from './turler.ts';
import { gSablonOzet, gStepOk, isGen, sarfKat, turAdimlari } from './turler.ts';

export function curSteps(): TurAdimi[] { return isGen(D) ? [{ ad: 'Malzeme türü', help: 'Ne oluşturacağını seç.' }, ...turAdimlari(D)] : STEPS; }
export function curLast(): number { return curSteps().length - 1; }
export function gLabelSVG(x: TurTaslagi, [W, H]: readonly [number, number]): string {
    const t = TURLER[x.tur]!;
    const g: TurDegerleri = x.g || {};
    const pad = 2.5, qs = H - 2 * pad;
    const kod = x.com.kod, ad = x.com.ad;
    const meta = x.tur === 'demirbas' ? [[g.seri ? 'S/N ' + g.seri : '', g.konum].filter(Boolean).join('   '), g.sorumlu ? 'Zimmet: ' + g.sorumlu : ''] : x.tur === 'sarf' ? [(sarfKat(x) || {} as Partial<Kategori>).ad || '', g.marka || ''] : x.tur === 'ticari_mal' ? [[g.marka, g.model].filter(Boolean).join(' '), t.ad] : [g.resim ? `Resim ${g.resim}${g.rev ? ' rev ' + g.rev : ''}` : '', t.ad];
    const qrTxt = [kod, ad, ...meta].filter(Boolean).join('\n');
    const tx = pad + qs + 2.5, tw = W - tx - pad;
    const f1 = Math.min(H * 0.13, 5.6), f2 = Math.min(H * 0.085, 3.4), f3 = f2 * 0.9;
    const mx = (f: number) => Math.max(6, Math.floor(tw / (f * 0.56)));
    const kodFs = Math.max(Math.min(f1, tw / (String(kod).length * 0.7)), 2.2);
    let y = pad + kodFs * 0.95;
    let s = `<text x="${tx}" y="${y.toFixed(2)}" font-size="${kodFs.toFixed(2)}" font-weight="700">${xesc(kod)}</text>`;
    y += f2 * 1.35;
    wrapTxt(ad, mx(f2), H >= 45 ? 3 : 2).forEach(l => { s += `<text x="${tx}" y="${y.toFixed(2)}" font-size="${f2.toFixed(2)}" font-weight="600">${xesc(l)}</text>`; y += f2 * 1.2; });
    y += f3 * 0.3;
    meta.filter(Boolean).forEach(l => { const tt = l.length > mx(f3) ? l.slice(0, mx(f3) - 1) + '…' : l; s += `<text x="${tx}" y="${y.toFixed(2)}" font-size="${f3.toFixed(2)}" fill="#333">${xesc(tt)}</text>`; y += f3 * 1.2; });
    if (x.tur === 'demirbas')
        s += `<text x="${tx}" y="${(H - pad).toFixed(2)}" font-size="${f3.toFixed(2)}" fill="#333">DEMİRBAŞ</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="'Barlow Condensed','Arial Narrow',Arial,sans-serif"><rect width="${W}" height="${H}" fill="#fff"/><rect width="1.4" height="${H}" fill="${t.c}"/><path d="${qrPath(qrTxt, pad, pad, qs)}" fill="#000"/>${s}</svg>`;
}
export function labelSVG(x: TurTaslagi, sz: readonly [number, number]): string { return isGen(x) ? gLabelSVG(x, sz) : labelSVG__0(x, sz); }
export function tplSummary(t: TurTaslagi): string { return t.tur && t.tur !== 'hammadde' ? gSablonOzet(t) : tplSummary__0(t); }
export function stepOk(i: number, d: Taslak = D): boolean { return isGen(d) ? gStepOk(i, d) : stepOk__0(i, d); }