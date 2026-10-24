import type { KatalogOnayDurumu } from '#paylasilan/sozlesme/malzemeler.ts';
import type { Kisi, OnayBilgisi } from '../../tipler.ts';
import { AYAR, AYAR_SUNUCU, AYAR_VARSAYILAN, CAKISMA_OZEL, D, FAMS, FORMS, LVL, MTIP, MUADIL, ONAY, PROPS, myUid } from './durum.ts';
import { finalAc, turAlanlari, turKurali } from './kod-yapisi.ts';
import { Host } from './ortam.ts';
import { yetki } from './roller-talep.ts';
import { clsObj, finalAd, grade } from './taslak.ts';
import { _katalog } from './turler.ts';
import { clsKeyFor } from './uyumluluk.ts';
import type { Kalite, Sinif, Taslak } from './tipler.ts';
import { clone, isNum, tlc } from './yardimcilar.ts';

// _kim her zaman görünen adı yazar (boş olabilir).
export type Kim = Kisi & { byAd: string };
// Onay durumu yazılırken ara biçim: önceki onay yoksa durum boş başlar; ret ve pasif kaydı null ile silinir.
export interface OnayYazimi {
    durum?: KatalogOnayDurumu;
    talep?: Kisi;
    onay?: Kisi | null;
    red?: (Kisi & { neden?: string }) | null;
    pasif?: (Kisi & { neden?: string }) | null;
    [alan: string]: unknown;
}
export interface BenzerKart { x: Taslak; seviye: 'ayni' | 'benzer'; neden: string }
export interface MukerrerGrubu { kartlar: Taslak[]; neden: string }
export type MuadilTipi = 'tam' | 'ust' | 'sartli';
export interface MuadilKarsilastirma { tip: MuadilTipi; not: string }
export interface MuadilKalite { kod: string; ad: string; sinif: string | null; tip: MuadilTipi; not: string; kaynak: 'liste' | 'hesap' }
export type MuadilKart = MuadilKalite & { x: Taslak };

export function yerelAyariBirak(): void {
    AYAR_SUNUCU.forEach(k => delete AYAR[k]);
    Object.assign(AYAR, AYAR_VARSAYILAN);
}
export function onayDurum(x: Taslak | null | undefined): KatalogOnayDurumu { return ((x && x.onay && ONAY[x.onay.durum] && x.onay.durum) || 'aktif'); }
export function pasifKilitli(x: Taslak | null | undefined): boolean { return (onayDurum(x) === 'pasif' && !yetki('onay')); }
export function _kim(): Kim { return ({ by: (typeof myUid !== 'undefined' && myUid) || null, byAd: (typeof Host !== 'undefined' && Host.kullaniciAd) || '', t: Date.now() }); }
export function onayAta(item: Taslak, prev: Taslak | null | undefined): Taslak {
    if (!prev) {
        item.onay = AYAR.onayAkisi ? { durum: 'onayda', talep: _kim() } : { durum: 'aktif', onay: _kim() };
        return item;
    }
    const pd = onayDurum(prev);
    if (pd === 'pasif') {
        item.onay = clone(prev.onay);
        return item;
    }
    const son = item.rev && item.rev[item.rev.length - 1];
    const degisti = !!(son && son.ch && son.ch.length);
    if (!AYAR.onayAkisi) {
        item.onay = { ...(prev.onay || {}), durum: pd === 'taslak' ? 'aktif' : pd };
        return item;
    }
    if (pd === 'aktif' && !degisti) {
        item.onay = clone(prev.onay || { durum: 'aktif' });
        return item;
    }
    item.onay = { durum: 'onayda', talep: _kim(), degisiklik: pd === 'aktif', sonOnay: (prev.onay && prev.onay.onay) || null };
    return item;
}
export function onayYetkili(x: Taslak | null | undefined): boolean {
    if (!AYAR.onayYetkisi || !yetki('onay'))
        return false;
    if (AYAR.dortGoz && x && x.onay && x.onay.talep && x.onay.talep.by && x.onay.talep.by === ((typeof myUid !== 'undefined' && myUid) || null))
        return false;
    return true;
}
export function onayUygula(x: Taslak, islem: string, neden?: string): Taslak {
    const it = clone(x);
    const eski = onayDurum(x);
    const k = _kim();
    const o: OnayYazimi = { ...(it.onay || {}) };
    if (islem === 'onayla') {
        o.durum = 'aktif';
        o.onay = k;
        o.red = null;
    }
    else if (islem === 'reddet') {
        o.durum = 'taslak';
        o.red = { ...k, neden: neden || '' };
    }
    else if (islem === 'gonder') {
        o.durum = AYAR.onayAkisi ? 'onayda' : 'aktif';
        o.talep = k;
        o.red = null;
    }
    else if (islem === 'pasif') {
        o.durum = 'pasif';
        o.pasif = { ...k, neden: neden || '' };
    }
    else if (islem === 'aktif') {
        o.durum = AYAR.onayAkisi ? 'onayda' : 'aktif';
        o.talep = k;
        o.pasif = null;
    }
    it.onay = o as OnayBilgisi;
    it.updatedAt = k.t;
    it.rev = [...(it.rev || []), { t: k.t, by: k.by, byAd: k.byAd, ch: [{ f: 'Onay durumu', a: ONAY[eski]!.ad, b: ONAY[o.durum!]!.ad }], not: neden || '' }].slice(-30);
    return it;
}
export function _nm(s: unknown): string { return (tlc(String(s ?? '')).replace(/[^a-z0-9çğıöşü]/g, '')); }
export function gradeKimlik(d: Taslak): Set<string> {
    const g = grade(d);
    if (!g)
        return new Set();
    const ids = new Set<string>([_nm(g.kod), _nm(g.ad)]);
    Object.values(g.eq || {}).forEach(v => { const t = String(v); if (t.includes('≈'))
        return; t.split(/[\/,;]/).forEach(p => { const n = _nm(p); if (n.length >= 3)
        ids.add(n); }); });
    if (d.grade === '__ozel' && d.custom && d.custom.eq)
        String(d.custom.eq).split(/[\/,;:]/).forEach(p => { const n = _nm(p); if (n.length >= 3)
            ids.add(n); });
    return ids;
}
export function olcuEsit(a: Taslak, b: Taslak): boolean { const fa = FORMS[String(a.form)]; if (!fa || a.form !== b.form)
    return false; return fa.dims.every(([k]) => { const x = a.dims && a.dims[k], y = b.dims && b.dims[k]; return isNum(x) && isNum(y) && Math.abs(x - y) <= Math.max(0.01, Math.abs(x) * 0.005); }); }
export function _gImza(d: Taslak, haric: string[]): string { const g = d.g || {}; return JSON.stringify(Object.keys(g).filter(k => !haric.includes(k)).sort().map(k => [k, Array.isArray(g[k]) ? [...g[k]].sort() : _nm(g[k])])); }
export function cakismaDegeri(x: Taslak, k: string): string {
    if (k === '_ad')
        return (x.com && x.com.ad) || finalAd(x);
    if (k === '_ac')
        return [0, 1, 2].map(i => finalAc(x, i)).join('|');
    const v = x.g && x.g[k];
    return v === undefined || v === null ? '' : Array.isArray(v) ? [...v].sort().join(',') : String(v);
}
export function cakismaAlanAdi(t: string, k: string): string { return CAKISMA_OZEL[k] || (turAlanlari(t).find(a => a.k === k) || { ad: k }).ad; }
export function benzerKartlar(d: Taslak = D, liste?: readonly Taslak[] | null): BenzerKart[] {
    liste = liste || _katalog();
    const out: BenzerKart[] = [];
    const tur = d.tur || 'hammadde';
    const ekle = (x: Taslak, seviye: BenzerKart['seviye'], neden: string): number => out.push({ x, seviye, neden });
    const adN = _nm(d.com && d.com.ad ? d.com.ad : finalAd(d));
    const cakismaAlanlari = Array.isArray(turKurali(tur).cakisma) ? turKurali(tur).cakisma as string[] : [];
    let ids: Set<string> | null = null;
    for (const x of liste) {
        if (!x || x.id === d.id || x.yerine)
            continue;
        if (d.com && d.com.eskiKod && x.com && _nm(x.com.eskiKod) === _nm(d.com.eskiKod)) {
            ekle(x, 'ayni', 'Aynı eski / ERP kodu');
            continue;
        }
        if ((x.tur || 'hammadde') !== tur)
            continue;
        if (cakismaAlanlari.length) {
            const dv = cakismaAlanlari.map(k => _nm(cakismaDegeri(d, k)));
            if (dv.every(Boolean) && cakismaAlanlari.every((k, i) => _nm(cakismaDegeri(x, k)) === dv[i]))
                ekle(x, 'ayni', 'Aynı ' + cakismaAlanlari.map(k => cakismaAlanAdi(tur, k).toLocaleLowerCase('tr')).join(', '));
            continue;
        }
        if (tur === 'hammadde') {
            if (!grade(d) || !d.form)
                continue;
            if (!ids)
                ids = gradeKimlik(d);
            const ayniKalite = (x.fam === d.fam && x.grade === d.grade && d.grade !== '__ozel') || [...gradeKimlik(x)].some(i => ids!.has(i));
            if (ayniKalite && olcuEsit(d, x)) {
                const fark = ['durum', 'yuzey', 'islem', 'renk', 'kaplama'].filter(k => JSON.stringify(d.opts && d.opts[k] || '') !== JSON.stringify(x.opts && x.opts[k] || ''));
                if (!fark.length)
                    ekle(x, 'ayni', 'Aynı kalite, form ve ölçü');
                else
                    ekle(x, 'benzer', 'Aynı kalite ve ölçü; ' + fark.map(k => ((FAMS[d.fam!]!.opts.find(o => o.k === k) || {}).ad || k).toLocaleLowerCase('tr')).join(', ') + ' farklı');
                continue;
            }
            if (adN && _nm(x.com && x.com.ad) === adN)
                ekle(x, 'ayni', 'Aynı ad');
            continue;
        }
        const g = d.g || {}, h = x.g || {};
        if (tur === 'yarimamul' || tur === 'mamul') {
            if (g.resim && _nm(g.resim) === _nm(h.resim)) {
                _nm(g.rev) === _nm(h.rev) ? ekle(x, 'ayni', 'Aynı teknik resim ve revizyon') : ekle(x, 'benzer', `Aynı teknik resim, farklı revizyon (${h.rev || '—'})`);
                continue;
            }
            if (g.musteri && _nm(g.musteri) === _nm(h.musteri)) {
                ekle(x, 'ayni', 'Aynı müşteri parça no');
                continue;
            }
            if (adN && _nm(x.com && x.com.ad) === adN) {
                ekle(x, 'benzer', 'Aynı ad');
                continue;
            }
            continue;
        }
        if (tur === 'sarf') {
            if (g.kat !== h.kat)
                continue;
            if (_gImza(d, ['ambalaj']) === _gImza(x, ['ambalaj'])) {
                _nm(g.ambalaj) === _nm(h.ambalaj) ? ekle(x, 'ayni', 'Aynı kategori ve özellikler') : ekle(x, 'benzer', 'Aynı malzeme, farklı ambalaj');
                continue;
            }
            if (adN && _nm(x.com && x.com.ad) === adN)
                ekle(x, 'ayni', 'Aynı ad');
            continue;
        }
        if (tur === 'demirbas') {
            if (g.seri && _nm(g.seri) === _nm(h.seri) && _nm(g.marka) === _nm(h.marka)) {
                ekle(x, 'ayni', 'Aynı marka ve seri numarası');
                continue;
            }
            if (g.plaka && _nm(g.plaka) === _nm(h.plaka)) {
                ekle(x, 'ayni', 'Aynı plaka');
                continue;
            }
            if (g.sasi && _nm(g.sasi) === _nm(h.sasi)) {
                ekle(x, 'ayni', 'Aynı şasi numarası');
                continue;
            }
        }
    }
    return out.sort((a, b) => (a.seviye === 'ayni' ? 0 : 1) - (b.seviye === 'ayni' ? 0 : 1));
}
export function mukerrerGruplari(liste?: readonly Taslak[] | null): MukerrerGrubu[] {
    liste = liste || _katalog();
    const grup: MukerrerGrubu[] = [];
    const atandi = new Set<string | undefined>();
    for (const x of liste) {
        if (atandi.has(x.id))
            continue;
        const b = benzerKartlar(x, liste).filter(r => r.seviye === 'ayni' && !atandi.has(r.x.id));
        if (b.length) {
            const g = [x, ...b.map(r => r.x)];
            g.forEach(i => atandi.add(i.id));
            grup.push({ kartlar: g, neden: b[0]!.neden });
        }
    }
    return grup;
}
export function _lv(g: Kalite, c: Sinif | null | undefined, k: string): number | null { const v = (g.p && g.p[k]) ?? (c && c.def && c.def[k]); const i = (LVL as readonly unknown[]).indexOf(v); return i < 0 ? null : i; }
export function _karsilastir(g: Kalite, h: Kalite, fam: string | null, c1: Sinif | null | undefined, c2: Sinif | null | undefined): MuadilKarsilastirma | null {
    const keys = ['cekme', 'akma', 'egilme', 'sert', 'tmax', 'uzama'];
    const dus: string[] = [], yuk: string[] = [];
    keys.forEach(k => { const a = g.p && g.p[k], b = h.p && h.p[k]; if (!isNum(a) || !isNum(b) || a === 0)
        return; if (b < a * 0.95)
        dus.push(k);
    else if (b > a * 1.05)
        yuk.push(k); });
    ['korozyon', 'kaynak'].forEach(k => { const a = _lv(g, c1, k), b = _lv(h, c2, k); if (a === null || b === null)
        return; if (b < a)
        dus.push(k);
    else if (b > a)
        yuk.push(k); });
    const ad = (k: string): string => (PROPS.find(p => p.k === k) || { ad: k }).ad.toLocaleLowerCase('tr');
    const ro1 = g.p && g.p.ro, ro2 = h.p && h.p.ro;
    const yog = isNum(ro1) && isNum(ro2) && Math.abs(ro2 - ro1) / ro1 > 0.05;
    let tip: MuadilTipi, not: string;
    if (!dus.length && !yuk.length) {
        tip = 'tam';
        not = 'Temel mekanik değerler ±%5 içinde.';
    }
    else if (!dus.length) {
        tip = 'ust';
        not = 'Daha yüksek: ' + yuk.map(ad).join(', ') + '.';
    }
    else if (dus.length <= 2) {
        tip = 'sartli';
        not = 'Daha düşük: ' + dus.map(ad).join(', ') + '.' + (yuk.length ? ' Daha yüksek: ' + yuk.map(ad).join(', ') + '.' : '');
    }
    else
        return null;
    if (yog)
        not += ' Yoğunluk farklı; ağırlık değişir.';
    return { tip, not };
}
export function muadilKaliteler(d: Taslak = D): MuadilKalite[] {
    if ((d.tur || 'hammadde') !== 'hammadde' || !FAMS[String(d.fam)])
        return [];
    const g = grade(d);
    if (!g || d.grade === '__ozel')
        return [];
    const fam = FAMS[d.fam!]!;
    const c1 = clsObj(d);
    const bul = (k: string): { h: Kalite; ck: string; c: Sinif } | null => { for (const [ck, c] of Object.entries(fam.classes)) {
        const h = c.grades.find(x => x.kod === k);
        if (h)
            return { h, ck, c };
    } return null; };
    const out: MuadilKalite[] = [];
    const seen = new Set([g.kod]);
    (MUADIL[g.kod] || []).forEach(([k, tip, not]) => { const r = bul(k); if (!r || seen.has(k))
        return; seen.add(k); out.push({ kod: k, ad: r.h.ad, sinif: r.ck, tip, not, kaynak: 'liste' }); });
    if (c1)
        c1.grades.forEach(h => { if (seen.has(h.kod) || h.gizli)
            return; const r = _karsilastir(g, h, d.fam, c1, c1); if (r) {
            seen.add(h.kod);
            out.push({ kod: h.kod, ad: h.ad, sinif: clsKeyFor(d), tip: r.tip, not: r.not, kaynak: 'hesap' });
        } });
    return out.sort((a, b) => (a.kaynak === 'liste' ? 0 : 1) - (b.kaynak === 'liste' ? 0 : 1) || MTIP[a.tip].s - MTIP[b.tip].s).slice(0, 8);
}
export function muadilKartlar(d: Taslak = D, liste?: readonly Taslak[] | null): MuadilKart[] {
    liste = liste || _katalog();
    const mk = muadilKaliteler(d);
    if (!mk.length || !d.form)
        return [];
    const map = Object.fromEntries(mk.map(m => [m.kod, m]));
    return liste.filter(x => x.id !== d.id && (x.tur || 'hammadde') === 'hammadde' && x.fam === d.fam && map[String(x.grade)] && onayDurum(x) !== 'pasif' && olcuEsit(d, x)).map(x => ({ x, ...map[x.grade!]! }));
}