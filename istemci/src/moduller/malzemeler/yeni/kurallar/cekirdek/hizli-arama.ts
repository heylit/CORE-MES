import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { FAMS, FORMS, FORM_KELIME, KALITE_TAKMA, MA, ONAY, _hzIx, _hzIxSurum, _hzSurum, ayarla__hzIx, ayarla__hzIxSurum } from './durum.ts';
import { _xlBos } from './excel.ts';
import { _asc } from './kod-yapisi.ts';
import { _gImza, _kim, _nm, benzerKartlar, onayDurum } from './onay.ts';
import { stokOzeti__4 } from './operasyon.ts';
import { C, F, grade, newDraft } from './taslak.ts';
import { _katalog, hzImza } from './turler.ts';
import { clsKeyFor } from './uyumluluk.ts';
import { clone, isNum, tlc } from './yardimcilar.ts';
import type { Kisi, OnayBilgisi } from '../../tipler.ts';
import type { BenzerKart } from './onay.ts';
import type { Olcu, Sozluk, Taslak } from './tipler.ts';

// Hızlı arama dizinindeki kalite: metindeki kalite adı, eşdeğeri ya da takma adı bu üçlüye çıkar.
export interface HizliAday { fam: string; cls: string; kod: string }
export type HizliIndeks = Map<string, HizliAday[]>;
// Seçenek değeri: tekli seçimde metin, çoklu seçimde tek elemanlı liste.
export type HizliSecenek = string | string[];
export interface HizliAyristirma {
  metin: string;
  fam: string | null;
  cls: string | null;
  grade: string | null;
  form: string | null;
  dims: Olcu;
  opts: Sozluk<HizliSecenek>;
  varsayilanOlcu: string[];
  kalan: string[];
  adaylar: HizliAday[];
}
export interface HizliAramaSonucu { p: HizliAyristirma; ayni: BenzerKart[]; benzer: BenzerKart[]; yakin: Taslak[]; metin: Taslak[] }
export interface KartBelgesi { id: string; ad?: string; [alan: string]: unknown }
export interface KartBaglantisi { id?: string; kod: string; t: number }
// Birleştirmenin karta yazdığı alanlar: birleşenler, yerine geçen kart, pasif bilgisi ve belgeler.
export type BirlesmeKarti = Taslak & {
  docs?: KartBelgesi[];
  birlesen?: KartBaglantisi[];
  yerine?: KartBaglantisi;
  onay?: OnayBilgisi;
};
export interface BirlesmeSatiri { eski_kod: string; eski_ad: string; yeni_kod: string; tarih: string; neden: string }
interface KaliteEslesmesi { i: number; n: number; h: HizliAday[] }
interface SecenekEslesmesi { v: string; uz: number; i: number[] }

export function _hn(x: string): string { return (_asc(x).toLowerCase().replace(/[^a-z0-9]/g, '')); }
export function _hzIndeks(): HizliIndeks {
    if (_hzIx && _hzIxSurum === _hzSurum)
        return _hzIx;
    const m: HizliIndeks = new Map();
    const ekle = (id: string, v: HizliAday) => { const k = _hn(id); if (k.length < 2)
        return; if (!m.has(k))
        m.set(k, []); const l = m.get(k)!; if (!l.some(x => x.fam === v.fam && x.kod === v.kod))
        l.push(v); };
    for (const [fk, f] of Object.entries(FAMS)) {
        if (f.gizli)
            continue;
        for (const [ck, c] of Object.entries(f.classes)) {
            if (c.gizli)
                continue;
            for (const g of c.grades) {
                if (g.gizli)
                    continue;
                const v = { fam: fk, cls: ck, kod: g.kod };
                ekle(g.kod, v);
                ekle(g.ad, v);
                String(g.ad).split(/[()\/,]/).forEach(p => ekle(p, v));
                Object.entries(g.eq || {}).forEach(([ek, ev]) => { String(ev).split(/[\/,;]/).forEach(p => { if (p.includes('≈'))
                    return; ekle(p, v); if (/AISI|SAE/.test(ek))
                    ekle('aisi' + p, v); }); });
            }
        }
    }
    Object.entries(KALITE_TAKMA).forEach(([t, kod]) => { for (const [fk, f] of Object.entries(FAMS)) {
        const ck = Object.keys(f.classes).find(c => f.classes[c]!.grades.some(g => g.kod === kod));
        if (ck) {
            ekle(t, { fam: fk, cls: ck, kod });
            break;
        }
    } });
    ayarla__hzIx(m);
    ayarla__hzIxSurum(_hzSurum);
    return m;
}
export function _hzSayi(s: unknown): number | null { const n = parseFloat(String(s).replace(',', '.')); return isFinite(n) ? n : null; }
export function metinAyristir(metin: unknown): HizliAyristirma {
    const r: HizliAyristirma = { metin: String(metin || '').trim(), fam: null, cls: null, grade: null, form: null, dims: {}, opts: {}, varsayilanOlcu: [], kalan: [], adaylar: [] };
    if (!r.metin)
        return r;
    let t = tlc(r.metin).replace(/(\d),(\d)/g, '$1.$2').replace(/(\d)\s*[x×*]\s*(?=[ø⌀]?\d)/g, '$1x').replace(/[⌀]/g, 'ø').replace(/\bçap\b/g, 'ø').replace(/\bmm\b/g, ' ');
    t = t.replace(/ø\s*/g, 'ø');
    const tok = t.split(/[\s;]+/).filter(Boolean);
    const kul: boolean[] = new Array<boolean>(tok.length).fill(false);
    // kalite: en uzun n-gram
    const ix = _hzIndeks();
    let en: KaliteEslesmesi | null = null;
    const sayisal = (w: string) => /^ø?\d+(\.\d+)?(x\d+(\.\d+)?)*$/.test(w);
    for (let n = 3; n >= 1 && !en; n--)
        for (let i = 0; i + n <= tok.length; i++) {
            if (kul.slice(i, i + n).some(Boolean))
                continue;
            const pp = tok.slice(i, i + n);
            if (pp.every(sayisal))
                continue;
            const h = ix.get(_hn(pp.join('')));
            if (h && h.length) {
                en = { i, n, h };
                break;
            }
        }
    if (!en)
        for (let i = 0; i < tok.length && !en; i++) {
            const w = tok[i]!;
            if (!/^\d+(\.\d+)?$/.test(w) || (!w.includes('.') && w.length < 3))
                continue;
            const h = ix.get(_hn(w));
            if (h && h.length)
                en = { i, n: 1, h };
        }
    if (en) {
        for (let k = en.i; k < en.i + en.n; k++)
            kul[k] = true;
        const h = en.h;
        r.adaylar = h;
        const sec = h.find(x => x.fam === 'metal') || h[0]!;
        r.fam = sec.fam;
        r.cls = sec.cls;
        r.grade = sec.kod;
    }
    // form
    tok.forEach((w, i) => { if (kul[i])
        return; const ww = w.replace(/[^a-zçğıöşü-]/g, ''); const f = FORM_KELIME.find(([k, re]) => new RegExp('^(' + re + ')$').test(ww)); if (f) {
        if (!r.form)
            r.form = f[0];
        kul[i] = true;
    }
    else if (r.form && /^(profil|çubuk|cubuk)$/.test(ww))
        kul[i] = true; });
    // sayılar
    const sayilar: number[] = [];
    let cap = false;
    tok.forEach((w, i) => { if (kul[i])
        return; const m = w.match(/^(ø)?(\d+(?:\.\d+)?(?:x(?:ø)?\d+(?:\.\d+)?)*)$/); if (!m)
        return; if (m[1])
        cap = true; m[2]!.split('x').forEach(x => { const n = _hzSayi(x.replace('ø', '')); if (n !== null)
        sayilar.push(n); }); kul[i] = true; });
    if (!r.form) {
        if (cap)
            r.form = sayilar.length >= 2 && sayilar[1]! < sayilar[0]! / 3 && sayilar.length >= 3 ? 'boru' : 'cubuk';
        else if (sayilar.length >= 3)
            r.form = 'levha';
    }
    if (r.form && FORMS[r.form]) {
        const dims = FORMS[r.form]!.dims.map(x => x[0]);
        let ss = [...sayilar];
        if (r.form === 'lama' && ss.length >= 2 && ss[1]! > ss[0]!) {
            [ss[0], ss[1]] = [ss[1]!, ss[0]!];
        }
        dims.forEach((k, i) => { if (isNum(ss[i]))
            r.dims[k] = ss[i];
        else {
            const dv = (FORMS[r.form!]!.def || {})[k];
            if (isNum(dv)) {
                r.dims[k] = dv;
                r.varsayilanOlcu.push(k);
            }
        } });
    }
    // durum ve işlem seçenekleri
    if (r.fam) {
        const F = FAMS[r.fam]!;
        const C: Sozluk<unknown> = F.classes[r.cls!] || {};
        const metinN = ' ' + tok.filter((w, i) => !kul[i]).join(' ') + ' ';
        F.opts.forEach(o => {
            if (o.type !== 'select' && o.type !== 'multi')
                return;
            const vals = (o.from ? (C[o.from] || []) : (o.opts || [])) as string[];
            let best = null as SecenekEslesmesi | null;
            vals.forEach(v => {
                const kodlar: string[] = [];
                const pm = String(v).match(/\(([^)]+)\)/);
                if (pm)
                    kodlar.push(tlc(pm[1]!).replace(/\s+/g, ''));
                String(v).replace(/[()]/g, ' ').split(/[\s\/,]+/).forEach(wd => { if (wd && wd.length <= 6 && /[A-Z0-9]/.test(wd) && wd === wd.toUpperCase() && !/^\d+$/.test(wd))
                    kodlar.push(tlc(wd)); });
                const ilk = String(v).split(/[\s(]/)[0]!;
                if (/\d/.test(ilk))
                    kodlar.push(tlc(ilk));
                tok.forEach((w, i) => { if (kul[i])
                    return; const wn = w.replace(/[()]/g, ''); if (kodlar.includes(wn) || kodlar.includes('+' + wn)) {
                    if (!best || wn.length > best.uz)
                        best = { v, uz: wn.length + 5, i: [i] };
                } });
                const vn = tlc(String(v).replace(/\([^)]*\)/g, '')).trim();
                if (vn.length >= 4 && metinN.includes(' ' + vn + ' ')) {
                    const ii = vn.split(/\s+/).map(p => tok.findIndex((w, k) => !kul[k] && w === p));
                    if (ii.every(j => j >= 0) && (!best || vn.length > best.uz))
                        best = { v, uz: vn.length, i: ii };
                }
            });
            if (best) {
                r.opts[o.k] = o.type === 'multi' ? [best.v] : best.v;
                best.i.forEach(i => kul[i] = true);
            }
        });
    }
    r.kalan = tok.filter((w, i) => !kul[i] && !/^(ve|ile|-)$/.test(w));
    return r;
}
export function hizliTaslak(p: HizliAyristirma): Taslak {
    const d: Taslak = { ...newDraft(), fam: p.fam, cls: p.cls, grade: p.grade, stds: [] };
    if (p.form && FORMS[p.form]) {
        d.form = p.form;
        d.dims = { ...(FORMS[p.form]!.def || {}), ...p.dims };
    }
    d.opts = { ...p.opts };
    varsayilanlariUygula(d);
    return d;
}
export function hizliAra(metin: unknown, liste?: readonly Taslak[] | null): HizliAramaSonucu {
    liste = liste || _katalog();
    const p = metinAyristir(metin);
    const out: HizliAramaSonucu = { p, ayni: [], benzer: [], yakin: [], metin: [] };
    if (!p.metin)
        return out;
    const gor = new Set<string | undefined>();
    if (p.grade && p.form) {
        const d = hizliTaslak(p);
        benzerKartlar(d, liste).forEach((r: BenzerKart) => { (r.seviye === 'ayni' ? out.ayni : out.benzer).push(r); gor.add(r.x.id); });
        const dist = (x: Taslak) => FORMS[p.form!]!.dims.reduce((a, [k]) => a + Math.abs(Math.log(((x.dims || {})[k] as number || 1) / (d.dims[k] as number || 1))), 0);
        out.yakin = liste.filter(x => !gor.has(x.id) && x.fam === p.fam && x.grade === p.grade && x.form === p.form && onayDurum(x) !== 'pasif').sort((a, b) => dist(a) - dist(b)).slice(0, 6);
        out.yakin.forEach(x => gor.add(x.id));
    }
    else if (p.grade) {
        out.yakin = liste.filter(x => x.fam === p.fam && x.grade === p.grade && onayDurum(x) !== 'pasif').slice(0, 8);
        out.yakin.forEach(x => gor.add(x.id));
    }
    const kel = tlc(p.metin).split(/\s+/).filter(w => w.length >= 2);
    if (kel.length)
        out.metin = liste.filter(x => !gor.has(x.id) && onayDurum(x) !== 'pasif' && (() => { const hay = tlc([x.com && x.com.kod, x.com && x.com.ad, x.com && x.com.tkod, x.com && x.com.eskiKod, x.com && x.com.ac1, x.com && x.com.ac2, x.com && x.com.ac3, x.g && x.g.ad].filter(Boolean).join(' ')).replace(/,/g, '.'); return kel.every(w => hay.includes(w.replace(/,/g, '.'))); })()).slice(0, 8);
    return out;
}
export function _ak(n: unknown): string { return (isNum(n) ? String(Math.round(n * 1000) / 1000) : ''); }
export function kartAnahtari(d: Taslak): string {
    const t = d.tur || 'hammadde';
    const g = d.g || {};
    if (t === 'hammadde') {
        const gr = grade(d);
        if (!gr || !d.form || !FORMS[d.form])
            return '';
        const gk = d.grade === '__ozel' ? _nm((d.custom || {}).kod || (d.custom || {}).ad) : _nm(gr.kod);
        return ['HM', d.fam, gk, d.form, FORMS[d.form]!.dims.map(([k]) => _ak((d.dims || {})[k])).join('x'), _nm((d.opts || {}).durum || ''), _nm((d.opts || {}).yuzey || '')].join('|');
    }
    if (t === 'yarimamul' || t === 'mamul') {
        if (g.resim)
            return [t === 'mamul' ? 'MM' : 'YM', 'R', _nm(g.resim), _nm(g.rev || '')].join('|');
        if (g.musteri)
            return [t === 'mamul' ? 'MM' : 'YM', 'M', _nm(g.musteri)].join('|');
        return '';
    }
    if (t === 'sarf') {
        if (!g.kat)
            return '';
        return 'SF|' + g.kat + '|' + _gImza(d, ['depoYeri', 'marka', 'urunKodu']);
    }
    if (t === 'hizmet')
        return hzImza(d);
    if (t === 'ticari_mal')
        return g.urunKodu ? ['TM', _nm(g.marka || ''), _nm(g.urunKodu)].join('|') : '';
    if (t === 'demirbas') {
        if (g.seri)
            return ['DB', _nm(g.marka || ''), _nm(g.seri)].join('|');
        if (g.plaka)
            return 'DB|P|' + _nm(g.plaka);
        if (g.sasi)
            return 'DB|S|' + _nm(g.sasi);
        return '';
    }
    return '';
}
export function varsayilanlariUygula(d: Taslak): Taslak { const v = ((MA.v.varsayilanlar) || {})[d.fam + '|' + clsKeyFor(d)] as { opts?: Sozluk<unknown> } | undefined; if (!v)
    return d; d.opts = d.opts || {}; Object.entries(v.opts || {}).forEach(([k, x]) => { if (_xlBos(d.opts[k]) || (Array.isArray(d.opts[k]) && !d.opts[k].length))
    d.opts[k] = x; }); return d; }
export function birlestir(asil: BirlesmeKarti, digerleri: BirlesmeKarti[], neden?: string | null): BirlesmeKarti[] {
    const k = _kim();
    const a: BirlesmeKarti = clone(asil);
    // Ticari bilgisi olmayan eski kayıt da birleşir; asıl kart boş ticari bilgiyle başlar.
    if (!a.com)
        a.com = newDraft().com;
    const kodlar = digerleri.map(x => x.com?.kod);
    a.birlesen = [...(a.birlesen || []), ...digerleri.map(x => ({ id: x.id, kod: x.com?.kod, t: k.t }))];
    const docs = [...(a.docs || [])];
    digerleri.forEach(x => (x.docs || []).forEach(dc => { if (!docs.some(y => y.id === dc.id))
        docs.push(dc); }));
    a.docs = docs;
    a.com.sertifika = [...new Set([...(a.com.sertifika || []), ...digerleri.flatMap(x => (x.com && x.com.sertifika) || [])])];
    if (!a.com.eskiKod) {
        const e = digerleri.map(x => x.com?.eskiKod).filter(Boolean);
        if (e.length)
            a.com.eskiKod = e[0];
    }
    a.updatedAt = k.t;
    a.rev = [...(a.rev || []), { t: k.t, by: k.by, byAd: k.byAd, ch: [{ f: 'Birleştirilen kartlar', a: '—', b: kodlar.join(', ') }], not: neden || 'Mükerrer birleştirme' }].slice(-30);
    const d = digerleri.map(x => {
        const y: BirlesmeKarti = clone(x);
        const eski = onayDurum(y);
        y.onay = { ...(y.onay || {}), durum: 'pasif', pasif: { ...k, neden: `Birleştirildi; yerine ${a.com.kod}${neden ? ' (' + neden + ')' : ''}` } };
        y.yerine = { id: a.id, kod: a.com.kod, t: k.t };
        y.updatedAt = k.t;
        y.rev = [...(y.rev || []), { t: k.t, by: k.by, byAd: k.byAd, ch: [{ f: 'Onay durumu', a: ONAY[eski]!.ad, b: 'Pasif' }, { f: 'Yerine', a: '—', b: a.com.kod }], not: neden || 'Mükerrer birleştirme' }].slice(-30);
        return y;
    });
    return [a, ...d];
}
export function birlesmeListesi(liste?: readonly BirlesmeKarti[] | null): BirlesmeSatiri[] { liste = liste || _katalog(); return liste.filter(x => x.yerine).map(x => ({ eski_kod: x.com?.kod, eski_ad: x.com?.ad, yeni_kod: x.yerine!.kod, tarih: x.yerine!.t ? tesisGunu(new Date(x.yerine!.t)) : '', neden: (x.onay && x.onay.pasif && x.onay.pasif.neden) || '' })); }
export function stokOzeti__5(x: BirlesmeKarti): Sozluk<unknown> { const o: Sozluk<unknown> = stokOzeti__4(x); o.benzersiz_anahtar = kartAnahtari(x); o.eski_kod = (x.com && x.com.eskiKod) || ''; if (x.yerine)
    o.yerine_kod = x.yerine.kod; if (x.birlesen && x.birlesen.length)
    o.birlesen_kodlar = x.birlesen.map(b => b.kod); return o; }