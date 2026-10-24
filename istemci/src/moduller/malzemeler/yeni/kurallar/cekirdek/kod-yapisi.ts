import { AC_KISA, AYAR, D, DB_KAT, FAMS, FORMS, HM_GRUP, HZ_KAT, KOD_HANE, KOD_TUR, MA, SARF_KAT, YM_GRUP } from './durum.ts';
import { _nm, onayDurum } from './onay.ts';
import type { StokOzeti } from './operasyon.ts';
import { bomSatirlari, rota } from './operasyon.ts';
import { gradeLabel } from './standartlar.ts';
import { finalKod, finalStd } from './taslak.ts';
import { _gnum, _katalog, _tStr, _tarih, autoAd, autoKod__1, dbKat, dimsStr, flatItem__1, gAd, gAlanDegeri, gAlanGorunur, hzCesit, hzKat, hzKodu, sarfKat, specHTML__1, stokOzeti__1, turAdimlari } from './turler.ts';
import type { Alan, HizmetKategorisi, Sozluk, Taslak, TurAdimi } from './tipler.ts';
import type { Nesne } from '../../tipler.ts';
import { clsKeyFor } from './uyumluluk.ts';
import { variantKod__0 } from './varyant.ts';
import { cleanKod, esc, fmtD, isNum } from './yardimcilar.ts';

// Türün malzeme ayarındaki kuralı: zorunlu alanlar, ad kalıbı, açıklama kalıpları (ac[0..2]).
export interface TurKurali { zorunlu?: Sozluk<unknown>; ad?: string; ac?: string[]; [alan: string]: unknown }

export function _asc(s: unknown): string { return (String(s || '').toLocaleUpperCase('tr').replace(/Ç/g, 'C').replace(/Ğ/g, 'G').replace(/İ/g, 'I').replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ü/g, 'U')); }
export function _g3(s: unknown): string { const t = _asc(s).replace(/[^A-Z0-9 ]/g, ' ').trim(); if (!t)
    return ''; const w = t.split(/\s+/); return (w.length >= 3 ? w.map(x => x[0]).join('') : w.length === 2 ? w[0]!.slice(0, 2) + w[1]![0] : w[0]!.slice(0, 3)).slice(0, 3).padEnd(3, 'X'); }
export function kodGrubu(d: Taslak = D): string {
    const m = _asc(d.com && d.com.grup).replace(/[^A-Z0-9]/g, '').slice(0, 3);
    if (m.length === 3)
        return m;
    const t = d.tur || 'hammadde';
    if (t === 'hammadde') {
        const ck = clsKeyFor(d);
        const hm: Sozluk<Sozluk<string>> = HM_GRUP;
        return (hm[d.fam as string] && hm[d.fam as string]![ck as string]) || 'GEN';
    }
    if (t === 'sarf') {
        const k = sarfKat(d);
        return k ? k.kod.padEnd(3, 'X').slice(0, 3) : 'GEN';
    }
    if (t === 'demirbas') {
        const k = dbKat(d);
        return k ? (k.kod === 'BT' ? 'BIL' : k.kod.padEnd(3, 'X').slice(0, 3)) : 'GEN';
    }
    if (t === 'hizmet')
        return hzKodu(d);
    if (t === 'yarimamul')
        return (YM_GRUP as Sozluk<string>)[(d.g && d.g.tip) as string] || 'GEN';
    return _g3(d.g && (d.g.grup || d.g.ad)) || 'GEN';
}
export function firmaKodluTurler(): string[] { return (Array.isArray(AYAR.firmaKoduTurleri) ? AYAR.firmaKoduTurleri : ['mamul', 'yarimamul']); }
export function firmaKodluTur(d: Taslak): boolean { return (!!AYAR.firmaKodu && firmaKodluTurler().includes(d.tur || 'hammadde')); }
export function kodOnek(d: Taslak): string { return (firmaKodluTur(d) ? `${AYAR.firmaKodu}-${KOD_TUR[d.tur || 'hammadde']}-` : `${KOD_TUR[d.tur || 'hammadde']}-${kodGrubu(d)}-`); }
export function siradakiKod(d: Taslak = D, ekstra: string[] = []): string {
    const on = kodOnek(d);
    const re = new RegExp('^' + on.replace(/-/g, '\\-') + '(\\d{' + KOD_HANE + ',})$');
    let m = 0;
    [..._katalog().filter(x => x && x.id !== d.id).map(x => x.com && x.com.kod), ...ekstra].forEach(k => { const r = re.exec(k || ''); if (r)
        m = Math.max(m, +r[1]!); });
    return on + String(m + 1).padStart(KOD_HANE, '0');
}
export function teknikKod(d: Taslak = D): string {
    const t = d.tur || 'hammadde';
    const g: Nesne = d.g || {};
    if (t === 'hammadde')
        return autoKod__1(d);
    if (t === 'yarimamul' || t === 'mamul')
        return g.resim ? `${KOD_TUR[t]}-${cleanKod(g.resim).slice(0, 24)}${g.rev ? '-' + cleanKod(g.rev) : ''}` : '';
    if (t === 'sarf') {
        const k = sarfKat(d);
        const p = [g.sinif, g.olcu, g.iso, g.tur].find(Boolean);
        if (!k || !p)
            return '';
        return ['SF', k.kod, cleanKod(_asc(p)).slice(0, 14), isNum(_gnum(g.cap)) ? String(_gnum(g.cap)) : '', isNum(_gnum(g.boy)) ? String(_gnum(g.boy)) : ''].filter(Boolean).join('-');
    }
    if (t === 'demirbas') {
        const k = dbKat(d);
        return k && g.seri ? `DB-${k.kod}-${cleanKod(_asc(g.seri)).slice(0, 20)}` : '';
    }
    return '';
}
export function autoKod(d: Taslak = D): string { return AYAR.kodYapisi === 'teknik' ? autoKod__1(d) : siradakiKod(d); }
export function variantKod(vd: Taslak, ekstra?: string[]): string { if (AYAR.kodYapisi === 'teknik' || vd.kodManual)
    return variantKod__0(vd); return siradakiKod(vd, ekstra || []); }
export function _sigdir(s: string | null | undefined, n?: number): string {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (!n || s.length <= n)
        return s;
    for (const [r, y] of AC_KISA) {
        s = s.replace(r, y).replace(/\s+/g, ' ').trim();
        if (s.length <= n)
            return s;
    }
    let c = s.slice(0, n);
    const nx = s[n] || '';
    if (nx && !/[;,]/.test(nx)) {
        const seg = Math.max(c.lastIndexOf(';'), c.lastIndexOf(','));
        if (seg > n * 0.4)
            c = c.slice(0, seg);
        else if (/[A-Za-z0-9ÇĞİÖŞÜçğıöşü.]/.test(nx)) {
            const k = c.lastIndexOf(' ');
            if (k > n * 0.5)
                c = c.slice(0, k);
        }
    }
    return c.replace(/[\s,;/×-]+$/, '');
}
export function _tekil(l: unknown[]): unknown[] { const out: unknown[] = []; l.flat().filter(x => x !== undefined && x !== null && String(x).trim() !== '').forEach(v => { const n = _nm(v); if (!out.some(o => { const m = _nm(o); return m.includes(n) || n.includes(m); }))
    out.push(v); }); return out; }
export function _bir(...a: unknown[]): string { return (_tekil(a).join(', ')); }
export function turKurali(t?: string | null): TurKurali { const k = ((MA.v.kurallar || {}) as Sozluk<unknown>)[t || 'hammadde']; return k && typeof k === 'object' ? k as TurKurali : {}; }
export function turAlanlari(t: string): Alan[] {
    const katlar = t === 'sarf' ? Object.keys(SARF_KAT) : t === 'demirbas' ? Object.keys(DB_KAT) : t === 'hizmet' ? Object.keys(HZ_KAT) : [''];
    const m = new Map<string, Alan>();
    katlar.forEach(k => { let st: TurAdimi[] = []; try {
        st = turAdimlari({ tur: t, g: k ? { kat: k } : {}, com: {}, opts: {} } as Taslak);
    }
    catch (e) { } st.forEach(s => (s.alanlar || []).forEach(a => { if (a && a.k && !m.has(a.k))
        m.set(a.k, a); })); });
    return [...m.values()];
}
export function alanZorunlu(d: { tur?: string | null } | null | undefined, a: Pick<Alan, 'k' | 'gerekli'>): boolean {
    if (a.k === 'ad' && a.gerekli)
        return true;
    const z = (turKurali(d && d.tur).zorunlu || {})[a.k];
    return typeof z === 'boolean' ? z : !!a.gerekli;
}
export function kalipUygula(kalip: unknown, d: Taslak, oto?: string, ad?: string): string {
    const g: Nesne = d.g || {};
    const alanlar = turAlanlari(d.tur || 'hammadde');
    const s = String(kalip).replace(/\{([A-Za-z0-9_]+)\}/g, (_: string, k: string) => {
        if (k === 'OTO')
            return oto || '';
        if (k === 'AD')
            return ad === undefined ? (oto || '') : (ad || '');
        const a = alanlar.find(x => x.k === k);
        if (a)
            return gAlanDegeri(d, a);
        const v = g[k];
        return v === undefined || v === null ? '' : Array.isArray(v) ? v.join(', ') : String(v);
    });
    return s.replace(/\(\s*\)/g, '').replace(/\s+([,;])/g, '$1').replace(/([,;])(\s*[,;])+/g, '$1').replace(/\s+/g, ' ').replace(/^[\s,;/-]+|[\s,;/-]+$/g, '');
}
export function musteriKoduAc(g: Nesne): string { const v = String(g.musteri || '').trim(); return v ? 'Müşteri kodu ' + v : ''; }
export function aciklamaOtomatik(d: Taslak = D): string[] {
    const t = d.tur || 'hammadde';
    const g: Nesne = d.g || {};
    let a = ['', '', ''];
    if (t === 'hammadde') {
        const f = FAMS[d.fam as string];
        const fm = FORMS[d.form as string];
        a[0] = [gradeLabel(d), fm ? fm.ad.split(' /')[0]!.toLocaleLowerCase('tr') : '', dimsStr(d, true)].filter(Boolean).join(' ');
        if (f) {
            const durum = f.opts.filter(o => o.type === 'select' && ((o.grp || 'Durum') === 'Durum' || o.k === 'uretim')).map(o => d.opts[o.k]);
            const isl = f.opts.filter(o => o.grp === 'İşlemler').map(o => d.opts[o.k]);
            a[1] = _bir(durum, isl);
        }
        const ut = d.opts && d.opts.ut;
        const test = ((d.opts && d.opts.test) || []) as string[];
        a[2] = [finalStd(d), d.tol, (d.com.sertifika || []).join(' '), ut ? 'UT ' + ut : '', test.join(', ')].filter(Boolean).join('; ');
    }
    else if (t === 'yarimamul') {
        a[0] = gAd(d);
        const hm = bomSatirlari(d).find(r => r.it && (r.it.tur || 'hammadde') === 'hammadde');
        const boy = [g.boy, g.en, g.yuk].map(_gnum).filter(isNum);
        a[1] = _bir(g.tip, hm ? [gradeLabel(hm.it!), dimsStr(hm.it!, true)].filter(Boolean).join(' ') : '', boy.length ? boy.map(fmtD).join('×') + ' mm' : '');
        a[2] = [musteriKoduAc(g), g.tol, ((g.kontrol || []) as string[]).join('/'), rota(d).slice(0, 8).map(r => r.kod || r.ad).join('>')].filter(Boolean).join('; ');
    }
    else if (t === 'mamul') {
        a[0] = gAd(d);
        a[1] = _bir(g.grup, g.marka, ((g.uygun || []) as string[]).join(' '), g.ip);
        a[2] = [musteriKoduAc(g), g.gtin ? 'GTIN ' + g.gtin : '', g.gtip ? 'GTİP ' + g.gtip : '', isNum(_gnum(g.garanti)) ? _gnum(g.garanti) + ' ay garanti' : '', g.ambalaj].filter(Boolean).join('; ');
    }
    else if (t === 'sarf') {
        a[0] = gAd(d);
        const k = sarfKat(d);
        const a0 = _nm(a[0]);
        a[1] = k ? _bir(k.alanlar.filter(x => gAlanGorunur(d, x)).map(x => { const v = gAlanDegeri(d, x); if (!v || a0.includes(_nm(v)))
            return ''; return x.u && isNum(_gnum(g[x.k])) ? `${x.ad} ${v}` : v; })) : '';
        a[2] = [g.marka, g.urunKodu ? 'Ür. kodu ' + g.urunKodu : '', g.depoYeri ? 'Depo ' + g.depoYeri : ''].filter(Boolean).join('; ');
    }
    else if (t === 'ticari_mal') {
        a[0] = gAd(d);
        a[1] = _bir(g.grup, g.aciklama);
        a[2] = [g.urunKodu ? 'Ür. kodu ' + g.urunKodu : '', g.gtin ? 'GTIN ' + g.gtin : '', g.gtip ? 'GTİP ' + g.gtip : '', g.depoYeri ? 'Depo ' + g.depoYeri : ''].filter(Boolean).join('; ');
    }
    else if (t === 'hizmet') {
        a[0] = gAd(d);
        a[1] = _bir(g.yon ? g.yon + ' hizmet' : '', ((hzKat(d) || {}) as Partial<HizmetKategorisi>).ad);
        const c = hzCesit(d);
        a[2] = _bir(...(c ? c.alanlar!.filter(x => !x.ada && x.k !== 'cesitAd' && gAlanGorunur(d, x)).map(x => { const v = gAlanDegeri(d, x); return v && (x.tip === 'num' || x.tip === 'sec') ? `${x.ad} ${v}` : v; }) : []), g.kapsam || '');
    }
    else if (t === 'demirbas') {
        a[0] = gAd(d);
        a[1] = _bir(g.konum, g.sorumlu ? 'Zimmet: ' + g.sorumlu : '', g.durum);
        const tr = (s: unknown): string => { const x = _tarih(s); return x ? _tStr(x) : ''; };
        a[2] = [g.alis ? 'Alış ' + tr(g.alis) : '', g.fatura ? 'Fatura ' + g.fatura : '', g.kalibrasyon === 'Gerekli' && g.kalAy ? `Kalibrasyon ${g.kalAy} ay` : '', isNum(_gnum(g.bakimAy)) ? `Bakım ${_gnum(g.bakimAy)} ay` : ''].filter(Boolean).join('; ');
    }
    const K = turKurali(t).ac || [];
    a = a.map((x, i) => K[i] ? kalipUygula(K[i], d, x, autoAd(d)) : x);
    const L = AYAR.acUzunluk || 50;
    return a.map(x => { const y = _sigdir(x, L); return AYAR.acBuyuk ? y.toLocaleUpperCase('tr') : y; });
}
export function finalAc(d: Taslak, i: number): string { const m = d.acManual && (d.acManual as boolean[])[i]; const v = d.com && d.com['ac' + (i + 1)]; if (m && v !== undefined)
    return String(v); return aciklamaOtomatik(d)[i]!; }
export function specHTML(d: Taslak, compact?: boolean): string {
    const h = specHTML__1(d, compact);
    if (compact || !h.endsWith('</div>'))
        return h;
    const ac = [0, 1, 2].map(i => finalAc(d, i));
    const tk = teknikKod(d);
    if (!ac.some(Boolean) && !tk)
        return h;
    const sec = `<div class="sd-sec"><h3>Kod ve açıklamalar</h3><dl class="dl">${tk && tk !== finalKod(d) ? `<dt>Teknik kod</dt><dd>${esc(tk)}</dd>` : ''}${ac.map((v, i) => v ? `<dt>Açıklama ${i + 1}</dt><dd>${esc(v)}</dd>` : '').join('')}</dl></div>`;
    return h.slice(0, -6) + sec + '</div>';
}
export function flatItem(d: Taslak, metric?: boolean): ReturnType<typeof flatItem__1> { const r = flatItem__1(d, metric); const tk = teknikKod(d); if (tk)
    r.push(['Kod ve açıklama', 'Teknik kod', tk]); [0, 1, 2].forEach(i => { const v = finalAc(d, i); if (v)
    r.push(['Kod ve açıklama', 'Açıklama ' + (i + 1), v]); }); return r; }
export function stokOzeti__2(x: Taslak): StokOzeti { return { ...stokOzeti__1(x), teknik_kod: (x.com && x.com.tkod) || teknikKod(x), kod_grubu: kodGrubu(x), aciklama_1: finalAc(x, 0), aciklama_2: finalAc(x, 1), aciklama_3: finalAc(x, 2), onay_durumu: onayDurum(x) }; }
export function kodlariSabitle(item: Taslak): Taslak { item.com.tkod = teknikKod(item); item.acManual = item.acManual || [false, false, false]; [0, 1, 2].forEach(i => item.com['ac' + (i + 1)] = finalAc(item, i)); return item; }