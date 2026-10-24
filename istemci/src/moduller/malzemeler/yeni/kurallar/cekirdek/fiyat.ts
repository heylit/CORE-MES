import { D } from './durum.ts';
import type { Agirlik, Sozluk, Taslak } from './tipler.ts';
import { finalBirim, weight } from './turler.ts';
import { fmt, isNum } from './yardimcilar.ts';

// Birim fiyatın birimlere çevrilmiş hali: `fe` fiyatın girildiği birim, `p` girilen fiyat, `kg` kilogram fiyatı.
export interface Fiyatlar {
    fe: string;
    p: number;
    kg: number | null;
    adet?: number;
    m?: number;
    'm²'?: number;
    [birim: string]: number | string | null | undefined;
}

export function feOf(d: Taslak = D): string { if (d.com && d.com.fe)
    return d.com.fe as string; const b = finalBirim(d); if (({ kg: 1, m: 1, 'm²': 1 } as Sozluk<number>)[b])
    return b; return d.fam === 'metal' ? 'kg' : 'adet'; }
export function money(v: unknown, pb?: string): string { return (isNum(v) ? fmt(v, 2) + ' ' + (pb || '') : '—'); }
export function prices(d: Taslak = D): Fiyatlar | null {
    const p = d.com && d.com.fiyat;
    if (!isNum(p))
        return null;
    const w: Partial<Agirlik> = weight(d) || {};
    const fe = feOf(d);
    const per = ({ kg: 1, adet: w.kg, m: w.perM, 'm²': w.perM2 } as Sozluk<number | null | undefined>)[fe];
    const perKg = fe === 'kg' ? p : (isNum(per) && per > 0 ? p / per : null);
    const o: Fiyatlar = { fe, p, kg: perKg };
    if (isNum(perKg)) {
        if (isNum(w.kg))
            o.adet = perKg * w.kg;
        if (isNum(w.perM))
            o.m = perKg * w.perM;
        if (isNum(w.perM2))
            o['m²'] = perKg * w.perM2;
    }
    o[fe] = p;
    return o;
}
