import { ALAN, BIRIMLER, BIRIM_T, DB_KAT, DOCTIPS, FAMS, FAM_ICON, FORMS, HM_GRUP, MA, PROPS, SARF_KAT, SERTIFIKA, TABAN, TOLP, _hzSurum, ayarla__hzSurum } from './durum.ts';
import { _asc } from './kod-yapisi.ts';
import { _gnum } from './turler.ts';
import type { MalzemeAyari } from '../../tipler.ts';
import type { Alan, Sinif, Sozluk } from './tipler.ts';
import { clone } from './yardimcilar.ts';

// Malzeme ayarındaki kayıtların biçimi (MalzemeAyari bunları Nesne olarak taşır).
export type AileAyari = { key: string; ad: string; kod: string; kaynak?: string; renk?: string; desc?: string; forms?: string[] };
export type SinifAyari = { fam: string; key: string; ad: string; kod: string; std?: string };
export type KaliteAyari = { fam: string; cls: string; kod: string; ad: string; std?: string; stds?: string[]; eq?: Sozluk<string>; p?: Sozluk<number | string> };
export type OzellikAyari = { k: string; ad: string; u?: string; f?: string[] };
export type KategoriAyari = { key: string; ad: string; kod: string; bakim?: unknown; kal?: unknown };
export type ListeAyari = { gizle?: string[]; ekle?: string[] };
export interface AlanGrubu { yol: string; alanlar: Alan[] }
// Düzenlenebilir listenin canlı dizileri (hedef) ve ayarsız hâli (taban).
// Öneri listeleri sayı da taşır (ör. tel çapı); seçenek listeleri metindir.
export interface ListeHedefi { hedef: (string | number)[][]; taban: (string | number)[] }

export function _docTips(): string[] | null { try {
    const d = DOCTIPS;
    if (d && !TABAN.DOCTIPS)
        TABAN.DOCTIPS = clone(d);
    return d;
}
catch (e) {
    return null;
} }
export function tumAlanGruplari(): AlanGrubu[] { const g: AlanGrubu[] = []; Object.entries(ALAN).forEach(([k, l]) => g.push({ yol: 'ALAN.' + k, alanlar: l })); Object.entries(SARF_KAT).forEach(([k, c]) => { if (!c._ozel)
    g.push({ yol: 'SARF.' + k, alanlar: c.alanlar }); }); Object.entries(DB_KAT).forEach(([k, c]) => { if (!c._ozel)
    g.push({ yol: 'DB.' + k, alanlar: c.alanlar || [] }); }); return g; }
export function MA_BOS(): MalzemeAyari { return ({ surum: 1, aileler: [], gizliAileler: [], siniflar: [], gizliSiniflar: [], kaliteler: [], gizliKaliteler: [], ozellikler: [], gizliOzellikler: [], kategoriler: { sarf: [], demirbas: [] }, gizliKategoriler: [], listeler: {}, varsayilanlar: {}, favoriler: [] }); }
export function _alanBul(yol: string, k: string): Alan | null { const [t, x] = yol.split('.'); const l = t === 'ALAN' ? ALAN[String(x)] : t === 'SARF' ? (SARF_KAT[String(x)] || { alanlar: undefined }).alanlar : t === 'DB' ? (DB_KAT[String(x)] || { alanlar: undefined }).alanlar : null; return (l || []).find(a => a.k === k) || null; }
export function listeHedef(id: string): ListeHedefi | null {
    const p = id.split('|');
    const p1 = p[1], p2 = p[2];
    if (id === 'sertifika')
        return { hedef: [SERTIFIKA], taban: TABAN.SERTIFIKA };
    if (id === 'belge') {
        const dt = _docTips();
        return dt ? { hedef: [dt], taban: TABAN.DOCTIPS || [] } : null;
    }
    if (id === 'birim')
        return { hedef: [BIRIMLER], taban: TABAN.BIRIMLER };
    if (p[0] === 'birim') {
        if (p1 === undefined)
            return null;
        const bl = BIRIM_T[p1] = BIRIM_T[p1] || [];
        return { hedef: [bl], taban: TABAN.BIRIM_T[p1] || [] };
    }
    if (p[0] === 'tol') {
        if (p1 === undefined || p2 === undefined)
            return null;
        const tf = TOLP[p1] = TOLP[p1] || {};
        const tl = tf[p2] = tf[p2] || [];
        return { hedef: [tl], taban: ((TABAN.TOLP[p1] || {})[p2]) || [] };
    }
    if (p[0] === 'opt') {
        if (p1 === undefined)
            return null;
        const f = FAMS[p1];
        const o = f && f.opts.find(x => x.k === p[2]);
        if (!o)
            return null;
        const tf = TABAN.FAMS[p1];
        const to = tf && tf.opts.find(x => x.k === p[2]);
        if (o.from) {
            const from = o.from;
            const cl: Sinif[] = Object.values(f.classes);
            cl.forEach(c => { c[from] = c[from] || []; });
            const tb: string[] = [];
            if (tf)
                Object.values(tf.classes).forEach(c => ((c[from] || []) as string[]).forEach(v => { if (!tb.includes(v))
                    tb.push(v); }));
            return { hedef: cl.map(c => c[from] as string[]), taban: tb };
        }
        o.opts = o.opts || [];
        return { hedef: [o.opts], taban: (to && to.opts) || [] };
    }
    if (p[0] === 'alan') {
        const a = _alanBul(p[1]!, p[2]!);
        if (!a)
            return null;
        if (a._tOpts)
            return { hedef: [a.opts!], taban: a._tOpts };
        a.oneri = a.oneri || [];
        return { hedef: [a.oneri], taban: a._tOneri || [] };
    }
    return null;
}
export function malzemeAyarUygula(v?: MalzemeAyari): void {
    v = v || MA.v;
    for (const k of Object.keys(FAMS))
        delete FAMS[k];
    Object.assign(FAMS, clone(TABAN.FAMS));
    PROPS.length = 0;
    PROPS.push(...clone(TABAN.PROPS));
    SERTIFIKA.length = 0;
    SERTIFIKA.push(...TABAN.SERTIFIKA);
    BIRIMLER.length = 0;
    BIRIMLER.push(...TABAN.BIRIMLER);
    {
        const dt = _docTips();
        if (dt) {
            dt.length = 0;
            dt.push(...TABAN.DOCTIPS!);
        }
    }
    for (const k of Object.keys(BIRIM_T))
        delete BIRIM_T[k];
    Object.assign(BIRIM_T, clone(TABAN.BIRIM_T));
    for (const k of Object.keys(TOLP))
        delete TOLP[k];
    Object.assign(TOLP, clone(TABAN.TOLP));
    for (const k of Object.keys(HM_GRUP))
        delete HM_GRUP[k];
    Object.assign(HM_GRUP, clone(TABAN.HM_GRUP));
    Object.keys(SARF_KAT).forEach(k => { if (SARF_KAT[k]!._ozel)
        delete SARF_KAT[k];
    else
        delete SARF_KAT[k]!.gizli; });
    Object.keys(DB_KAT).forEach(k => { if (DB_KAT[k]!._ozel)
        delete DB_KAT[k];
    else
        delete DB_KAT[k]!.gizli; });
    tumAlanGruplari().forEach(gr => gr.alanlar.forEach(a => { if (a._tOpts)
        a.opts = [...a._tOpts]; if (a._tOneri)
        a.oneri = [...a._tOneri]; }));
    ((v.aileler || []) as AileAyari[]).forEach(a => {
        if (FAMS[a.key])
            return;
        const kay = a.kaynak && TABAN.FAMS[a.kaynak] ? a.kaynak : 'diger';
        const src = TABAN.FAMS[kay]!;
        FAMS[a.key] = { ad: a.ad, kod: a.kod, c: a.renk || '#7D8580', desc: a.desc || 'Kullanıcı tanımlı malzeme ailesi', forms: (a.forms && a.forms.length) ? a.forms.filter(f => FORMS[f]) : clone(src.forms), opts: clone(src.opts), sert: src.sert, yanma: src.yanma ? clone(src.yanma) : undefined, classes: {}, ozel: true, kaynak: kay };
        PROPS.forEach(p => { if (Array.isArray(p.f) && p.f.includes(kay) && !p.f.includes(a.key))
            p.f.push(a.key); });
        if (typeof FAM_ICON !== 'undefined' && !FAM_ICON[a.key])
            FAM_ICON[a.key] = FAM_ICON[kay] || FAM_ICON.diger!;
        HM_GRUP[a.key] = HM_GRUP[a.key] || {};
    });
    ((v.siniflar || []) as SinifAyari[]).forEach(c => {
        const f = FAMS[c.fam];
        if (!f || f.classes[c.key])
            return;
        const ilk = Object.values(f.classes)[0] || Object.values((TABAN.FAMS[f.kaynak || 'diger'] || TABAN.FAMS.diger!).classes)[0];
        const y: Sinif = { ad: c.ad, kod: c.kod, std: c.std || '', def: {}, grades: [], ozel: true };
        f.opts.forEach(o => { if (o.from)
            y[o.from] = clone((ilk && ilk[o.from]) || []); });
        f.classes[c.key] = y;
        HM_GRUP[c.fam] = HM_GRUP[c.fam] || {};
        HM_GRUP[c.fam]![c.key] = _asc(c.kod).replace(/[^A-Z0-9]/g, '').slice(0, 3).padEnd(3, 'X');
    });
    ((v.kaliteler || []) as KaliteAyari[]).forEach(g => { const c = FAMS[g.fam] && FAMS[g.fam]!.classes[g.cls]; if (!c || c.grades.some(x => x.kod === g.kod))
        return; c.grades.push({ kod: g.kod, ad: g.ad, std: g.std || '', stds: g.stds || [], eq: g.eq || {}, p: g.p || {}, ozel: true }); });
    (v.gizliKaliteler || []).forEach(k => { const [fam, cls, kod] = k.split('|'); const c = FAMS[String(fam)] && FAMS[String(fam)]!.classes[String(cls)]; const g = c && c.grades.find(x => x.kod === kod); if (g)
        g.gizli = true; });
    ((v.ozellikler || []) as OzellikAyari[]).forEach(p => { if (!PROPS.some(x => x.k === p.k))
        PROPS.push({ k: p.k, ad: p.ad, u: p.u || '', ...(p.f && p.f.length ? { f: p.f } : {}), ozel: true }); });
    {
        const gp = new Set(v.gizliOzellikler || []);
        for (let i = PROPS.length - 1; i >= 0; i--)
            if (gp.has(PROPS[i]!.k))
                PROPS.splice(i, 1);
    }
    (((v.kategoriler || {}).sarf || []) as KategoriAyari[]).forEach(c => { if (!SARF_KAT[c.key])
        SARF_KAT[c.key] = { ad: c.ad, kod: c.kod, ikon: 'flask', alanlar: SARF_KAT.genel ? SARF_KAT.genel.alanlar : [], _ozel: true }; });
    (((v.kategoriler || {}).demirbas || []) as KategoriAyari[]).forEach(c => { if (!DB_KAT[c.key])
        DB_KAT[c.key] = { ad: c.ad, kod: c.kod, ikon: 'box', omur: null, bakim: _gnum(c.bakim) || 0, kal: !!c.kal, alanlar: [], _ozel: true }; });
    (v.gizliAileler || []).forEach(k => { const f = FAMS[k]; if (f)
        f.gizli = true; });
    (v.gizliSiniflar || []).forEach(x => { const [f, c] = x.split('|'); const s = FAMS[String(f)] && FAMS[String(f)]!.classes[String(c)]; if (s)
        s.gizli = true; });
    (v.gizliKategoriler || []).forEach(x => { const [t, k] = x.split('|'); const T = t === 'sarf' ? SARF_KAT : DB_KAT; const kt = T[String(k)]; if (kt)
        kt.gizli = true; });
    try {
        ayarla__hzSurum(_hzSurum + 1);
    }
    catch (e) { }
    for (const [id, l] of Object.entries((v.listeler || {}) as Sozluk<ListeAyari>)) {
        const h = listeHedef(id);
        if (!h)
            continue;
        const gz = new Set<string | number>(l.gizle || []);
        h.hedef.forEach(arr => { for (let i = arr.length - 1; i >= 0; i--)
            if (gz.has(arr[i]!))
                arr.splice(i, 1); (l.ekle || []).forEach(x => { if (!arr.includes(x))
            arr.push(x); }); });
    }
}