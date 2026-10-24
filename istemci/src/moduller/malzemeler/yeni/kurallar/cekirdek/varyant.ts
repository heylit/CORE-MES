import { impPresets } from './birim.ts';
import { D, EN10220, FORMS, ISO1127, KUTU_ST, LAMA_M, L_ST } from './durum.ts';
import { autoKod } from './kod-yapisi.ts';
import { autoAd, dimsStr } from './turler.ts';
import { clsKeyFor } from './uyumluluk.ts';
import type { Olcu, Sozluk, Taslak } from './tipler.ts';
import { IMP, isNum, tlc } from './yardimcilar.ts';

// Hazır ölçü grubu (PG): keys ölçü anahtarları, vals her seçeneğin değerleri (anahtar sırasıyla).
export interface OlcuGrubu {
  id: string;
  ad: string;
  keys: string[];
  vals: number[][];
  custom: boolean;
  labels?: string[];
  inch?: boolean;
}
// Toplu varyant seçimi (taslağın vsel'i): grup kimliği → seçilen değer dizileri.
export type VaryantSecimi = Sozluk<number[][]>;

export function PG(id: string, ad: string, keys: string[], vals: readonly (number | number[])[], custom?: boolean): OlcuGrubu { return ({ id, ad, keys, vals: vals.map(v => Array.isArray(v) ? v : [v]), custom: !!custom }); }
export function presetGroups(d: Taslak = D): OlcuGrubu[] {
    const f = d.form, fam = d.fam, cls = clsKeyFor(d), g = d.grade;
    if (!f || !fam)
        return [];
    if (IMP()) {
        const ip = impPresets(d);
        if (ip)
            return ip;
    }
    const by = (o: Sozluk<number[]>, def: number[]): number[] => o[fam] !== undefined ? o[fam] : def;
    switch (f) {
        case 'levha': {
            let t: number[], pl: number[][];
            if (fam === 'metal') {
                t = cls === 'sac' ? [0.5, 0.6, 0.7, 0.8, 1, 1.2, 1.5, 2, 2.5, 3] : cls === 'aluminyum' ? [0.5, 0.8, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50] : cls === 'paslanmaz' ? [0.5, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20] : [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50];
                pl = cls === 'paslanmaz' ? [[1000, 2000], [1250, 2500], [1500, 3000], [1219, 2438]] : cls === 'aluminyum' ? [[1000, 2000], [1250, 2500], [1500, 3000]] : [[1000, 2000], [1250, 2500], [1500, 3000], [1500, 6000], [2000, 6000]];
            }
            else if (fam === 'plastik') {
                t = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50];
                pl = g === 'PMMA' ? [[2050, 3050], [1000, 2000]] : g !== null && ['PEHD', 'PELD', 'PPH', 'PPC', 'PVCU', 'PVCC', 'PEUHMW'].includes(g) ? [[1000, 2000], [1220, 2440], [1500, 3000]] : [[620, 1000], [1000, 2000], [1220, 2440]];
            }
            else if (fam === 'elastomer') {
                t = [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 15, 20];
                pl = [[1000, 1000], [1200, 1200], [1400, 1400]];
            }
            else if (fam === 'kompozit') {
                t = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10];
                pl = g !== null && ['FR4', 'G11'].includes(g) ? [[1020, 1220], [1220, 2440]] : cls === 'sandvic' ? [[1250, 2500], [1500, 3000]] : [[500, 500], [1000, 1000], [1000, 2000]];
            }
            else if (fam === 'seramik') {
                t = [0.25, 0.38, 0.5, 0.635, 1, 2, 3, 5, 10];
                pl = [[50, 50], [100, 100], [114, 114], [200, 200]];
            }
            else if (fam === 'ahsap') {
                if (cls === 'levha') {
                    t = [3, 4, 6, 8, 10, 12, 15, 16, 18, 22, 25, 30];
                    pl = [[1830, 3660], [2100, 2800], [1220, 2440], [1250, 2500]];
                }
                else if (cls === 'muh') {
                    t = [60, 80, 100, 120, 140, 160, 200, 240];
                    pl = [[2400, 12000], [2950, 12000]];
                }
                else {
                    t = [18, 20, 25, 30, 40];
                    pl = [[600, 2000], [1000, 2000], [1200, 3000]];
                }
            }
            else if (fam === 'cam') {
                t = [2, 3, 4, 5, 6, 8, 10, 12, 15, 19];
                pl = [[3210, 6000], [3210, 2250]];
            }
            else {
                t = [1, 2, 3, 5, 10];
                pl = [[1000, 2000]];
            }
            return [PG('t', 'Kalınlık', ['t'], t, true), PG('plaka', 'Plaka ölçüsü (en × boy)', ['w', 'l'], pl)];
        }
        case 'rulo': return [PG('t', 'Kalınlık', ['t'], by({ metal: [0.4, 0.5, 0.6, 0.8, 1, 1.2, 1.5, 2, 2.5, 3], plastik: [0.05, 0.1, 0.2, 0.3, 0.5, 1, 2], elastomer: [1, 2, 3, 4, 5, 6, 8, 10] }, [0.5, 1, 2]), true),
            PG('w', 'Rulo eni', ['w'], by({ metal: [1000, 1250, 1500], plastik: [1000, 1220, 1500], elastomer: [1000, 1200, 1400] }, [1000]), true),
            PG('L', 'Rulo boyu', ['L'], by({ metal: [100, 250, 500], plastik: [50, 100, 250], elastomer: [10, 20] }, [50, 100]), true)];
        case 'cubuk': return [PG('d', 'Çap', ['d'], by({ metal: [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 30, 32, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200, 250], plastik: [6, 8, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 150, 180, 200], seramik: [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25], kompozit: [2, 3, 4, 5, 6, 8, 10, 12, 16, 20], cam: [3, 4, 5, 6, 8, 10, 12], ahsap: [6, 8, 10, 12, 16, 20, 25, 30, 40] }, [10, 20, 50]), true),
            PG('l', 'Boy', ['l'], by({ metal: cls === 'titanyum' || cls === 'nikel' ? [1000, 3000] : [3000, 6000], plastik: [1000, 3000], seramik: [100, 300, 500, 1000], kompozit: [1000, 2000, 3000], cam: [1000, 1500], ahsap: [1000, 2000] }, [1000]), true)];
        case 'altigen': return [PG('s', 'Anahtar ağzı', ['s'], [8, 10, 11, 13, 14, 17, 19, 22, 24, 27, 30, 32, 36, 41, 46, 50, 55, 60], true), PG('l', 'Boy', ['l'], [3000, 6000], true)];
        case 'lama': {
            if (fam === 'ahsap') {
                return cls === 'muh' ? [PG('ab', 'Kesit (en × yükseklik)', ['a', 'b'], [[120, 240], [140, 280], [160, 320], [200, 400], [200, 600]]), PG('l', 'Boy', ['l'], [6000, 8000, 12000], true)] :
                    [PG('ab', 'Kesit (en × kalınlık)', ['a', 'b'], [[100, 20], [100, 25], [150, 25], [100, 50], [150, 50], [200, 50], [200, 60], [100, 100], [120, 120]]), PG('l', 'Boy', ['l'], [2000, 3000, 4000, 5000, 6000], true)];
            }
            if (fam === 'kompozit')
                return [PG('ab', 'Kesit (en × kalınlık)', ['a', 'b'], [[10, 2], [20, 3], [30, 3], [50, 5], [100, 10]]), PG('l', 'Boy', ['l'], [1000, 3000, 6000], true)];
            return [PG('ab', 'Kesit (en × kalınlık)', ['a', 'b'], cls === 'takim' ? [[50, 10], [100, 20], [150, 30], [200, 40], [300, 50]] : LAMA_M), PG('l', 'Boy', ['l'], [3000, 6000], true)];
        }
        case 'boru': {
            let v: number[][], L = [6000];
            if (fam === 'metal')
                v = cls === 'paslanmaz' ? ISO1127 : cls === 'aluminyum' ? [[20, 2], [25, 2], [30, 2], [40, 2], [50, 3], [60, 3], [80, 3], [100, 5]] : cls === 'bakir' ? [[12, 1], [15, 1], [18, 1], [22, 1], [28, 1], [35, 1.2], [42, 1.2], [54, 1.5]] : EN10220;
            else if (fam === 'plastik') {
                v = [[20, 2], [25, 2.3], [32, 2.9], [40, 3.7], [50, 4.6], [63, 5.8], [75, 6.8], [90, 8.2], [110, 10], [160, 14.6]];
                L = [1000, 3000, 6000];
            }
            else if (fam === 'elastomer') {
                v = [[16, 3], [19, 3.5], [25, 4], [32, 4.5], [40, 5]];
                L = [10000, 20000];
            }
            else if (fam === 'kompozit') {
                v = [[10, 1], [16, 1], [20, 1.5], [25, 2], [30, 2], [40, 2], [50, 2.5]];
                L = [1000, 2000];
            }
            else if (fam === 'seramik') {
                v = [[6, 1], [10, 1.5], [20, 2], [30, 3], [50, 5]];
                L = [300, 500, 1000];
            }
            else if (fam === 'cam') {
                v = [[10, 1.5], [16, 1.8], [25, 1.8], [50, 2.5], [100, 3.2]];
                L = [1500];
            }
            else
                v = EN10220;
            const ad = fam === 'metal' && cls === 'paslanmaz' ? 'Dış çap × et (EN ISO 1127)' : fam === 'metal' && cls === 'bakir' ? 'Dış çap × et (EN 1057)' : fam === 'plastik' ? 'Dış çap × et (SDR 11)' : fam === 'metal' ? 'Dış çap × et (EN 10220)' : 'Dış çap × et';
            return [PG('Dt', ad, ['D', 't'], v), PG('l', 'Boy', ['l'], L, true)];
        }
        case 'kutu': return [PG('abt', 'Kesit (a × b × et)', ['a', 'b', 't'], fam === 'kompozit' ? [[40, 40, 4], [50, 50, 5], [100, 100, 6]] : cls === 'aluminyum' ? [[20, 20, 2], [25, 25, 2], [30, 30, 2], [40, 40, 2], [50, 50, 2], [40, 20, 2], [60, 30, 2], [80, 40, 3], [100, 50, 3]] : KUTU_ST), PG('l', 'Boy', ['l'], [6000], true)];
        case 'kosebent': return [PG('abt', 'Kesit (a × b × et)', ['a', 'b', 't'], fam === 'kompozit' ? [[50, 50, 5], [75, 75, 6], [100, 100, 8]] : cls === 'aluminyum' ? [[20, 20, 2], [30, 30, 3], [40, 40, 4], [50, 50, 5]] : L_ST), PG('l', 'Boy', ['l'], [6000], true)];
        case 'tel': return [PG('d', 'Tel çapı', ['d'], [0.5, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6], true), PG('L', 'Uzunluk', ['L'], [100, 500, 1000], true)];
        case 'kord': return [PG('d', 'Kord çapı', ['d'], [2, 3, 4, 5, 6, 8, 10, 12, 15, 20], true), PG('L', 'Uzunluk', ['L'], [10, 50, 100], true)];
        case 'disk': return fam === 'seramik' ? [PG('d', 'Çap', ['d'], [10, 20, 25, 30, 50, 100], true), PG('t', 'Kalınlık', ['t'], [1, 2, 3, 5, 10], true)] : [PG('d', 'Çap', ['d'], [50, 100, 150, 200, 250, 300, 400, 500], true), PG('t', 'Kalınlık', ['t'], [5, 10, 15, 20, 25, 30, 50], true)];
        case 'oring': return [PG('o', 'İç çap × kesit', ['d1', 'd2'], [[5, 1.5], [8, 1.5], [10, 2], [12, 2], [15, 2], [18, 2.5], [20, 2.5], [25, 3], [30, 3], [35, 3], [40, 3], [45, 3.5], [50, 3.5], [60, 4], [80, 5], [100, 5]])];
        case 'granul': return [PG('kg', 'Ambalaj', ['kg'], [25, 500, 1000], true)];
        case 'kumas': return [PG('g', 'Gramaj', ['g'], [80, 160, 200, 245, 300, 400, 600], true), PG('w', 'En', ['w'], [1000, 1270], true), PG('L', 'Rulo boyu', ['L'], [50, 100], true)];
        default: return [];
    }
}
export function vkey(v: readonly unknown[]): string { return (v.join('|')); }
export function variantList(d: Taslak = D): Taslak[] {
    const vsel = d.vsel as VaryantSecimi | undefined;
    if (!d.vmode || !vsel || d.id)
        return [];
    const lists: Olcu[][] = [];
    for (const g of presetGroups(d)) {
        const sel = vsel[g.id] || [];
        if (sel.length)
            lists.push(sel.map(v => Object.fromEntries(g.keys.map((k, i) => [k, v[i]!]))));
    }
    if (!lists.length)
        return [];
    let out: Olcu[] = [{}];
    for (const L of lists) {
        const n: Olcu[] = [];
        for (const a of out)
            for (const b of L)
                n.push({ ...a, ...b });
        out = n;
    }
    return out.map(p => ({ ...d, dims: { ...d.dims, ...p } }));
}
export function variantKod__0(vd: Taslak, _ekstra?: unknown): string { return (vd.kodManual && vd.com.kod) ? vd.com.kod + '-' + FORMS[vd.form!]!.dims.map(([k]) => vd.dims[k]).filter(isNum).join('x') : autoKod(vd); }
export function variantAd(vd: Taslak): string { return (vd.adManual && vd.com.ad) ? vd.com.ad + ' ' + dimsStr(vd, true) : autoAd(vd); }
export function variantSummary(d: Taslak = D): string {
    const vsel = d.vsel as VaryantSecimi | undefined;
    const parts: string[] = [];
    for (const g of presetGroups(d)) {
        const n = (vsel && vsel[g.id] || []).length;
        if (n)
            parts.push(`${n} ${tlc(g.ad.split(' (')[0])}`);
    }
    return parts.join(' × ');
}