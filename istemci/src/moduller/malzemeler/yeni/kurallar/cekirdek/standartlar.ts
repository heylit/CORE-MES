import { D } from './durum.ts';
import { grade } from './taslak.ts';
import type { Taslak } from './tipler.ts';

export function gradeLabel(d: Taslak = D): string {
    const g = grade(d);
    if (!g)
        return '';
    const st = d.stds || [];
    if (!st.length)
        return g.ad;
    const en = st.some(x => /^EN\b/.test(x)), us = st.some(x => /^(ASTM|AMS|SAE|MIL)/.test(x));
    const k = g.eq && (g.eq['AISI/SAE'] ? 'AISI/SAE' : g.eq['AISI'] ? 'AISI' : null);
    if (!k)
        return g.ad;
    const v = String(g.eq[k]).replace(/^≈\s*/, '');
    if (g.ad.includes(v))
        return g.ad;
    const pre = k === 'AISI/SAE' ? 'SAE' : 'AISI';
    if (en && us)
        return `${g.ad} / ${pre} ${v}`;
    if (us && !en)
        return `${pre} ${v} (${g.ad})`;
    return g.ad;
}
