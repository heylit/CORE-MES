import { D, DEFBIRIM, DKEY, FAMS, FORMS, MODS, PROPS, Store, ayarla_draftT, draftT, step } from './durum.ts';
import { autoKod, turKurali } from './kod-yapisi.ts';
import { Host, localStorage } from './ortam.ts';
import { gradeLabel } from './standartlar.ts';
import { autoAd, autoStd, dimsStr, gAlanGorunur, turAdimlari } from './turler.ts';
import { stepOk } from './turler-yardimci.ts';
import type { Agirlik, Aile, FormOlcusu, Kalite, Olcu, OlcuAnahtari, Ozellik, OzellikDegeri, OzellikDegerleri, Sinif, Sozluk, Taslak } from './tipler.ts';
import { variantList } from './varyant.ts';
import { IMP, cleanKod, fmt, fmtD, isNum, r4, tlc } from './yardimcilar.ts';

// Seçenek etkisi (MODS): özellik çarpanları ya da `set` ile sabit değer.
export interface Etken { set?: OzellikDegerleri; [ozellik: string]: number | OzellikDegerleri | undefined }

export function newDraft(): Taslak {
    return { tur: 'hammadde', g: {}, bom: [], ops: [], fam: null, cls: null, grade: null, custom: { ad: '', kod: '', std: '', eq: '', p: {} }, stds: [], form: null, dims: {}, tol: '', opts: {}, ov: {}, extra: [],
        com: { kod: '', ad: '', std: '', ted: '', birim: '', sertifika: [], not: '' }, kodManual: false, adManual: false };
}
export function saveDraft(): void { clearTimeout(draftT); ayarla_draftT(setTimeout(() => { try {
    localStorage.setItem(DKEY, JSON.stringify({ D, step }));
}
catch (e) { } }, 250)); }
export function F(): Aile | undefined { return (FAMS[D.fam as string]); }
export function C(): Sinif | undefined { return (F() && F()!.classes[D.cls as string]); }
export function grade(d: Taslak = D): Kalite | null {
    const f = FAMS[d.fam as string];
    if (!f)
        return null;
    if (d.grade === '__ozel')
        return d.custom.ad ? { ad: d.custom.ad, kod: d.custom.kod || d.custom.ad, std: d.custom.std, p: (d.custom.p || {}) as OzellikDegerleri, eq: d.custom.eq ? { 'Eşdeğerler / diğer adlar': d.custom.eq } : {} } : null;
    const c = f.classes[d.cls as string];
    return (c && c.grades.find(g => g.kod === d.grade)) || Object.values(f.classes).flatMap(x => x.grades).find(g => g.kod === d.grade) || null;
}
export function clsObj(d: Taslak): Sinif | null { const f = FAMS[d.fam as string]; if (!f)
    return null; return f.classes[clsOfGrade(d.fam, d.grade) as string] || f.classes[d.cls as string] || null; }
export function clsOfGrade(fam: string | null, kod: string | null): string | null { const f = FAMS[fam as string]; if (!f)
    return null; return Object.keys(f.classes).find(k => f.classes[k]!.grades.some(g => g.kod === kod)) || null; }
export function normQ(s: unknown): string { return (tlc(s).replace(/[^a-z0-9çğıöşüâî]/g, '')); }
export function eqText(eq: Sozluk<unknown> | null | undefined): string { return Object.entries(eq || {}).map(([k, v]) => `${k}: ${v}`).join('; '); }
export function propsFor(fam: string | null): Ozellik[] {
    const f = FAMS[fam as string]!;
    return PROPS.filter(p => (fam === 'diger' || !p.f || p.f.includes(fam as string)) && !(p.sel === 'yanma' && !f.yanma) && !(p.k === 'sert' && fam !== 'diger' && !f.sert));
}
export function unitOf(p: Ozellik, fam: string | null): string | undefined { return p.u === '*' ? (FAMS[fam as string]!.sert || '—') : p.u; }
export function activeMods(d: Taslak = D): Etken[] {
    const mods: Sozluk<Etken> = MODS;
    const out: Etken[] = [];
    Object.values(d.opts || {}).forEach(v => { (Array.isArray(v) ? v as unknown[] : [v]).forEach(x => { if (mods[x as string])
        out.push(mods[x as string]!); }); });
    return out;
}
export function computed(k: string, d: Taslak = D): OzellikDegeri | undefined {
    const f = FAMS[d.fam as string];
    if (!f)
        return undefined;
    const c: Partial<Sinif> = clsObj(d) || {};
    const g = grade(d);
    let v: OzellikDegeri | undefined = (g && g.p && g.p[k] !== undefined && g.p[k] !== null && g.p[k] !== '') ? g.p[k] : (c.def || {})[k];
    for (const m of activeMods(d)) {
        if (m.set && k in m.set)
            v = m.set[k];
        else if (isNum(v) && m[k])
            v = r4(v * (m[k] as number));
    }
    return v;
}
export function modded(k: string, d: Taslak = D): boolean { return activeMods(d).some(m => (m.set && k in m.set) || m[k]); }
export function val(k: string, d: Taslak = D): OzellikDegeri | undefined { const o = d.ov && d.ov[k]; return (o !== undefined && o !== '') ? o as OzellikDegeri : computed(k, d); }
export function dimVals(d: Taslak = D): Olcu | null { const fm = FORMS[d.form as string]; if (!fm)
    return null; const o: Olcu = {}; for (const [k] of fm.dims) {
    const v = d.dims[k];
    if (!isNum(v) || v <= 0)
        return null;
    o[k] = v;
} return o; }
export function dimsErr(d: Taslak = D): string { const fm = FORMS[d.form as string]; if (!fm)
    return 'Bir form seç.'; const v = dimVals(d); if (!v)
    return 'Tüm ölçüleri sıfırdan büyük girmelisin.'; if (fm.chk) {
    const r = fm.chk(v as FormOlcusu);
    if (r !== true)
        return r;
} return ''; }
export function weight__0(d: Taslak = D): Agirlik | null {
    const fm = FORMS[d.form as string];
    const v = dimVals(d) as FormOlcusu | null;
    if (!fm || !v || dimsErr(d))
        return null;
    if (fm.mass)
        return { kg: fm.mass(v), perM2: fm.perM2mass ? fm.perM2mass(v) : null };
    const ro = val('ro', d);
    if (!isNum(ro) || ro <= 0)
        return null;
    const out = {} as Agirlik;
    if (fm.sec) {
        const L = fm.len ? v[fm.len as OlcuAnahtari] * 1000 : v.l;
        out.kg = fm.sec(v) * L * ro * 1e-6;
        out.perM = fm.sec(v) * ro / 1000;
    }
    else
        out.kg = fm.vol!(v) * ro * 1e-6;
    if (fm.perM2)
        out.perM2 = fm.perM2(v) * ro;
    return out;
}
export function dimsStr__0(d: Taslak = D, metric?: boolean): string {
    const fm = FORMS[d.form as string];
    if (!fm)
        return '';
    const mm: string[] = [], other: string[] = [];
    const imp = IMP() && !metric;
    const cv: Sozluk<[number, string]> = { m: [3.28084, 'ft'], kg: [2.20462, 'lb'], 'g/m²': [0.0294935, 'oz/yd²'] };
    fm.dims.forEach(([k, l, u]) => {
        const v = d.dims[k];
        if (!isNum(v))
            return;
        if (u && u !== 'mm') {
            other.push(imp && cv[u] ? `${fmt(v * cv[u][0], 2)} ${cv[u][1]}` : `${fmtD(v)} ${u}`);
        }
        else
            mm.push(imp ? fmt(r4(v / 25.4), 3) : fmtD(v));
    });
    let s = mm.length ? (['cubuk', 'tel', 'kord', 'disk'].includes(d.form!) ? 'Ø' : '') + mm.join('×') + (imp ? ' in' : ' mm') : '';
    if (other.length)
        s += (s ? ', ' : '') + other.join(', ');
    return s;
}
export function autoKod__0(d: Taslak = D): string {
    const f = FAMS[d.fam as string];
    if (!f)
        return '';
    const c = clsObj(d);
    const g = grade(d);
    const fm = FORMS[d.form as string];
    const p = [f.kod];
    if (c)
        p.push(c.kod);
    if (g)
        p.push(cleanKod(g.kod || g.ad).slice(0, 12));
    if (fm) {
        p.push(fm.kod);
        const v = fm.dims.map(([k]) => d.dims[k]).filter(isNum);
        if (v.length)
            p.push(v.join('x'));
    }
    return p.join('-');
}
export function mainOpts(d: Taslak = D): unknown[] { const f = FAMS[d.fam as string]; if (!f)
    return []; return f.opts.filter(o => o.type === 'select' && (o.grp || 'Durum') === 'Durum' && d.opts[o.k]).map(o => d.opts[o.k]).slice(0, 2); }
export function autoAd__0(d: Taslak = D): string {
    const g = grade(d);
    const fm = FORMS[d.form as string];
    if (!g)
        return '';
    let s = gradeLabel(d);
    if (fm)
        s += ' ' + tlc(fm.ad) + (dimsStr(d, true) ? ' ' + dimsStr(d, true) : '');
    const mo = mainOpts(d);
    if (mo.length)
        s += ', ' + mo.join(', ');
    return s;
}
export function autoStd__0(d: Taslak = D): string { if (d.stds && d.stds.length) {
    const gk: Partial<Kalite> = grade(d) || {};
    const gl = gk.stds || [];
    return d.stds.slice().sort((a, b) => (gl.indexOf(a) + 99 * +(gl.indexOf(a) < 0)) - (gl.indexOf(b) + 99 * +(gl.indexOf(b) < 0))).join(' / ');
} const g = grade(d); const c = FAMS[d.fam as string] && clsObj(d); return (g && g.std) || (c && c.std) || ''; }
export function kayitliKod(d: Taslak | null | undefined): string { if (!Host.on || !d || !d.id)
    return ''; const k = Store.items.find(x => x && x.id === d.id); return k && (k.tur || 'hammadde') === (d.tur || 'hammadde') && k.com && k.com.kod ? k.com.kod : ''; }
export function finalKod(d: Taslak = D): string { return ((d.kodManual && d.com.kod) ? d.com.kod : (kayitliKod(d) || autoKod(d))); }
export function finalAd(d: Taslak = D): string { return ((d.adManual && d.com.ad) ? d.com.ad : autoAd(d)); }
export function finalStd(d: Taslak = D): string { return (d.com.std || autoStd(d)); }
export function finalBirim__0(d: Taslak = D): string { const db: Sozluk<string> = DEFBIRIM; return (d.com.birim || db[d.form as string] || 'adet'); }
export function birimIstenir(d: Taslak = D): boolean { if (!d || !d.id || String((d.com && d.com.birim) || '').trim())
    return false; const k = Store.items.find(x => x && x.id === d.id); return !!k && !String((k.com && k.com.birim) || '').trim(); }
export function uygulanmayanZorunlu(d: Taslak): string[] { const z = turKurali(d.tur).zorunlu || {}; const gorunur = new Set<string>(); try {
    (turAdimlari(d) || []).forEach(st => (st.alanlar || []).forEach(a => { if (gAlanGorunur(d, a))
        gorunur.add(a.k); }));
}
catch (e) { } return Object.keys(z).filter(k => z[k] === true && !gorunur.has(k) && /^[A-Za-z0-9_]{1,40}$/.test(k)).slice(0, 200); }
export function stepOk__0(i: number, d: Taslak = D): boolean { switch (i) {
    case 0: return !!d.fam;
    case 1: return !!grade(d);
    case 2: return (d.vmode && !d.id && variantList(d).length) ? variantList(d).some(v => !dimsErr(v)) : !dimsErr(d);
    default: return true;
} }
export function canGo(i: number): boolean { for (let j = 0; j < i; j++)
    if (!stepOk(j))
        return false; return true; }