import { FASETLER, FORMS } from './durum.ts';
import { onayDurum } from './onay.ts';
import { fmt, isNum } from './yardimcilar.ts';
import type { OlcuTanimi, Sozluk, Taslak } from './tipler.ts';

export interface OlcuAraligi { min?: number | null; max?: number | null; [alan: string]: unknown }
// Seçili süzgeçler: faset anahtarına göre değer listesi; `olcu` ölçü anahtarına göre aralıktır.
export interface FiltreSecimi {
  olcu?: Sozluk<OlcuAraligi | null | undefined>;
  [faset: string]: string[] | Sozluk<OlcuAraligi | null | undefined> | undefined;
}
export type FasetSayilari = Sozluk<[string, number][]>;
export interface FiltreEtiketi { k: string; v: string; ad: string; et: string }

export function _hmMi(x: Taslak): boolean { return ((x.tur || 'hammadde') === 'hammadde'); }
export function filtreUygula(liste: readonly Taslak[], sec?: FiltreSecimi | null, haric?: string | null): Taslak[] {
    sec = sec || {};
    return liste.filter(x => {
        for (const f of FASETLER) {
            if (f.k === haric)
                continue;
            const s = sec[f.k] as string[] | undefined;
            if (!s || !s.length)
                continue;
            if (!f.deg(x).some(v => s.includes(v)))
                return false;
        }
        if (haric !== 'onay' && !(sec.onay && sec.onay.length) && onayDurum(x) === 'pasif')
            return false;
        if (haric !== 'olcu' && sec.olcu) {
            for (const [k, r] of Object.entries(sec.olcu)) {
                if (!r || (!isNum(r.min) && !isNum(r.max)))
                    continue;
                const n = (x.dims || {})[k];
                if (!isNum(n))
                    return false;
                if (isNum(r.min) && n < r.min - 1e-9)
                    return false;
                if (isNum(r.max) && n > r.max + 1e-9)
                    return false;
            }
        }
        return true;
    });
}
export function fasetSayilari(liste: readonly Taslak[], sec?: FiltreSecimi | null): FasetSayilari {
    const out: FasetSayilari = {};
    FASETLER.forEach(f => {
        const l = filtreUygula(liste, sec, f.k);
        const m = new Map<string, number>();
        l.forEach(x => f.deg(x).forEach(v => m.set(v, (m.get(v) || 0) + 1)));
        (((sec || {})[f.k] || []) as string[]).forEach(v => { if (!m.has(v))
            m.set(v, 0); });
        const et = (v: string) => String(f.et ? f.et(v) : v);
        out[f.k] = [...m.entries()].sort((a, b) => b[1] - a[1] || et(a[0]).localeCompare(et(b[0]), 'tr'));
    });
    return out;
}
export function filtreOlcuAnahtarlari(sec?: FiltreSecimi | null): OlcuTanimi[] | null { const fl = ((sec && sec.form) || []) as string[]; if (fl.length !== 1 || !FORMS[fl[0]!])
    return null; return FORMS[fl[0]!]!.dims; }
export function filtreEtiketleri(sec?: FiltreSecimi | null): FiltreEtiketi[] {
    const out: FiltreEtiketi[] = [];
    FASETLER.forEach(f => (((sec || {})[f.k] || []) as string[]).forEach(v => out.push({ k: f.k, v, ad: f.ad, et: String(f.et ? f.et(v) : v) })));
    Object.entries((sec && sec.olcu) || {}).forEach(([k, r]) => { if (r && (isNum(r.min) || isNum(r.max)))
        out.push({ k: 'olcu', v: k, ad: 'Ölçü ' + k, et: isNum(r.min) && isNum(r.max) ? (r.min === r.max ? fmt(r.min) : `${fmt(r.min)}–${fmt(r.max)}`) : isNum(r.min) ? '≥ ' + fmt(r.min) : '≤ ' + fmt(r.max) }); });
    return out;
}