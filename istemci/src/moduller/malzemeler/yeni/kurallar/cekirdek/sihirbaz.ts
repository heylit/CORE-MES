import { D, FAMS } from './durum.ts';
import type { Kalite } from './tipler.ts';
import { fmt, isNum } from './yardimcilar.ts';

export function keyFigure(g: Kalite, fam?: string | null): string {
    fam = fam || D.fam;
    const p = g.p || {};
    const bits: string[] = [];
    if (isNum(p.ro))
        bits.push(`ρ ${fmt(p.ro)}`);
    if (isNum(p.cekme))
        bits.push(`Rm ${fmt(p.cekme)}`);
    else if (isNum(p.egilme))
        bits.push(`σf ${fmt(p.egilme)}`);
    if (isNum(p.sert) && fam)
        bits.push(`${fmt(p.sert)} ${FAMS[fam]!.sert}`);
    return bits.join('  ');
}
