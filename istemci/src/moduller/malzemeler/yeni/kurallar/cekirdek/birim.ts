import { FRAC, PCONV } from './durum.ts';
import type { Sozluk, Taslak } from './tipler.ts';
import { clsKeyFor } from './uyumluluk.ts';
import type { OlcuGrubu } from './varyant.ts';
import { PG } from './varyant.ts';
import { IMP, fmt, isNum, r4 } from './yardimcilar.ts';

type HazirlikCifti = [string, number | number[]];

export function propDisp<T>(v: T, u?: string): string | Exclude<NonNullable<T>, number> { const pc: Sozluk<[string, (v: number) => number]> = PCONV; if (!isNum(v))
    return (v ?? '') as Exclude<NonNullable<T>, number>; if (IMP() && u !== undefined && pc[u]) {
    const [nu, f] = pc[u];
    return fmt(r4(f(v)), 3) + ' ' + nu;
} return fmt(v) + (u ? ' ' + u : ''); }
export function mmi(x: number): number { return (Math.round(x * 25.4 * 1e4) / 1e4); }
export function impPresets(d: Taslak): OlcuGrubu[] | null {
    const f = d.form, fam = d.fam, cls = clsKeyFor(d);
    if (!(['metal', 'plastik'] as (string | null)[]).includes(fam))
        return null;
    const G = (id: string, ad: string, keys: string[], pairs: HazirlikCifti[], inch?: boolean): OlcuGrubu => { const g: OlcuGrubu = PG(id, ad, keys, pairs.map(p => p[1]), !!inch); g.labels = pairs.map(p => p[0]); g.inch = !!inch; return g; };
    const fr = (a: number, b: number): HazirlikCifti[] => FRAC.filter(([, v]) => v >= a && v <= b).map(([l, v]) => [l, mmi(v)]);
    if (f === 'levha')
        return [G('t', 'Kalınlık (inç)', ['t'], fr(1 / 16, 2), true), G('plaka', 'Plaka ölçüsü (inç)', ['w', 'l'], [['48 × 96"', [mmi(48), mmi(96)]], ['48 × 120"', [mmi(48), mmi(120)]], ['60 × 120"', [mmi(60), mmi(120)]]])];
    if (f === 'cubuk')
        return [G('d', 'Çap (inç)', ['d'], fr(1 / 4, 4), true), G('l', 'Boy', ['l'], [['12 ft', mmi(144)], ['20 ft', mmi(240)]])];
    if (f === 'altigen')
        return [G('s', 'Anahtar ağzı (inç)', ['s'], fr(1 / 4, 3), true), G('l', 'Boy', ['l'], [['12 ft', mmi(144)]])];
    if (f === 'boru' && fam === 'metal' && (['karbon', 'paslanmaz', 'islah', 'nikel', 'titanyum'] as (string | null)[]).includes(cls))
        return [G('Dt', 'NPS, Sch 40 (ASME B36.10)', ['D', 't'], [['1/2"', [21.3, 2.77]], ['3/4"', [26.7, 2.87]], ['1"', [33.4, 3.38]], ['1-1/4"', [42.2, 3.56]], ['1-1/2"', [48.3, 3.68]], ['2"', [60.3, 3.91]], ['3"', [88.9, 5.49]], ['4"', [114.3, 6.02]], ['6"', [168.3, 7.11]], ['8"', [219.1, 8.18]]]), G('l', 'Boy', ['l'], [['20 ft', mmi(240)], ['21 ft', mmi(252)]])];
    return null;
}
