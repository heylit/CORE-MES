import { CAST, CFORM, CLS_BASE, D, DIMRULES, FAMS, FORMS, GA, GFORM, NO, R, REC, STEEL_CLS, WARN } from './durum.ts';
import { renderWizard, toast } from './ortam.ts';
import { clsOfGrade, saveDraft } from './taslak.ts';
import { compatIssues } from './turler.ts';
import type { Taslak } from './tipler.ts';
import { isNum } from './yardimcilar.ts';

// Uyumluluk kararı: s 'ok' | 'rec' | 'warn' | 'no'; m açıklama.
export interface UyumDurumu { s: string; m?: string; [alan: string]: unknown }
// Kuralların gördüğü bağlam (ctxOf).
export interface UyumBaglami {
  fam: string | null;
  cls: string | null;
  g: string | null;
  form: string | null;
  o: Record<string, unknown>;
  t: number | null;
  cls0: string | null;
  steel: boolean;
  cast: boolean;
  custom: boolean;
}
// R tablosundaki seçenek kuralı.
export type UyumKurali = (v: string, c: UyumBaglami) => UyumDurumu | null;
// GA tablosundaki kalite izni: a izinli seçenekler (null: sınır yok), r önerilenler.
export interface IzinliSecenek { a: string[] | null; r: string[] }
export interface UyumSorunu { step: number; s: string; t: string; m?: string | undefined; k?: string; v?: string; [alan: string]: unknown }

export function SET<T>(...a: T[]): Set<T> { return (new Set(a)); }
export function inF(c: { form?: string | null }, ...l: (string | readonly string[])[]): boolean { const fl: readonly unknown[] = l.flat(); return (fl.includes(c.form)); }
export function has(c: { o: Record<string, unknown> }, k: string, v: unknown): boolean { const x = c.o[k]; return Array.isArray(x) ? x.includes(v) : x === v; }
export function clsKeyFor(d: Taslak): string | null { return clsOfGrade(d.fam, d.grade) || d.cls; }
export function formList(d: Taslak = D): string[] | null {
    if (!d.fam || d.fam === 'diger')
        return null;
    const gf: string[] | undefined = d.grade ? GFORM[d.grade] : undefined;
    if (gf)
        return gf;
    const ck = clsKeyFor(d);
    const alias: Record<string, Record<string, string>> = { kompozit: { karbon: 'karbon_k', cam: 'cam_k' }, ahsap: { levha: 'levha_a', muh: 'muh_a' } };
    const af = alias[d.fam];
    const k = (af && ck && af[ck]) || ck;
    return (k && CFORM[k]) || null;
}
export function formStatus(f: string, d: Taslak = D): UyumDurumu { const l = formList(d); if (!l)
    return { s: 'ok' }; if (!l.includes(f))
    return NO('Bu kalite genellikle bu formda üretilmez veya satılmaz.'); return l[0] === f ? REC : { s: 'ok' }; }
export function A(a: string[] | null, r?: string[]): IzinliSecenek { return ({ a, r: r || [] }); }
export function ctxOf(d: Taslak = D): UyumBaglami {
    const cls0 = clsKeyFor(d), cls = (cls0 && CLS_BASE[cls0]) || cls0;
    return { fam: d.fam, cls, g: d.grade, form: d.form, o: d.opts || {}, t: (d.dims && isNum(d.dims.t)) ? d.dims.t : null,
        cls0, steel: d.fam === 'metal' && STEEL_CLS.has(cls), cast: CAST.has(d.grade), custom: d.grade === '__ozel' };
}
export function optStatus(k: string, v: string, d: Taslak = D): UyumDurumu {
    if (!d.fam || d.fam === 'diger')
        return { s: 'ok', m: '' };
    const c = ctxOf(d);
    let rec = false;
    const warns: (string | undefined)[] = [];
    const gf = c.fam ? GA[c.fam] : undefined, gk = gf && gf[k];
    const gm = gf && gk && c.g !== null ? gk[c.g] : undefined;
    if (gm) {
        if (gm.a && !gm.a.includes(v))
            return NO(gm.a.length ? 'Bu kalite için tipik bir seçenek değil.' : 'Bu kalitede bu seçenek uygulanmaz.');
        if (gm.r.includes(v))
            rec = true;
    }
    const rf = c.fam ? R[c.fam] : undefined;
    for (const f of ((rf && rf[k]) || [])) {
        const r = f(v, c);
        if (!r)
            continue;
        if (r.s === 'no')
            return r;
        if (r.s === 'warn')
            warns.push(r.m);
        if (r.s === 'rec')
            rec = true;
    }
    if (warns.length)
        return WARN(warns.join(' '));
    return rec ? REC : { s: 'ok', m: '' };
}
export function dimWarns(d: Taslak = D): string[] { if (!d.form || !d.dims)
    return []; return DIMRULES.map(f => f(d)).filter((x): x is string => Boolean(x)); }
export function compatIssues__0(d: Taslak = D): UyumSorunu[] {
    const out: UyumSorunu[] = [];
    const f = d.fam ? FAMS[d.fam] : undefined;
    if (!f || d.fam === 'diger')
        return out;
    if (d.form) {
        const fs = formStatus(d.form, d);
        if (fs.s === 'no')
            out.push({ step: 2, s: 'no', t: 'Form: ' + FORMS[d.form]!.ad, m: fs.m });
    }
    dimWarns(d).forEach(m => out.push({ step: 2, s: 'warn', t: 'Ölçüler', m }));
    for (const o of f.opts) {
        if (o.type !== 'select' && o.type !== 'multi')
            continue;
        const v = d.opts[o.k];
        const vals: string[] = Array.isArray(v) ? v : (v ? [v as string] : []);
        for (const x of vals) {
            const st = optStatus(o.k, x, d);
            if (st.s === 'no' || st.s === 'warn')
                out.push({ step: 3, s: st.s, t: o.ad + ': ' + x, m: st.m, k: o.k, v: x });
        }
    }
    return out;
}
export function removeIncompatible(): void {
    let n = 0;
    compatIssues().filter((i: UyumSorunu): i is UyumSorunu & { k: string } => i.s === 'no' && !!i.k).forEach(i => { const cur = D.opts[i.k]; if (Array.isArray(cur)) {
        D.opts[i.k] = cur.filter(x => x !== i.v);
    }
    else
        D.opts[i.k] = ''; n++; });
    saveDraft();
    renderWizard();
    toast(n ? `${n} uyumsuz seçim kaldırıldı.` : 'Kaldırılacak uyumsuz seçim yok.');
}