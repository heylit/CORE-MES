import { D, FAMS } from './durum.ts';
import { kimyasalStandartlari, mekanikStandartlari, varsayilanStandart } from './metal-standartlari.ts';
import { grade } from './taslak.ts';
import { kaliteAdi, ortakAstmKarsiliklari, standartTercihi } from '../../standart-adlari.ts';
import type { Taslak } from './tipler.ts';

export function gradeLabel(d: Taslak = D): string {
    const g = grade(d);
    if (!g)
        return '';
    // 3633: standardı seçilmiş kartta kalite adı seçili standarda göre (ASTM karşılığı varsa o); eski kartta kalitenin kendi adı.
    const ad = kaliteAdi(g, standartTercihi(d as unknown as { readonly [k: string]: unknown }), ortakAstmKarsiliklari(FAMS));
    const st = d.stds || [];
    if (!st.length)
        return ad;
    const en = st.some(x => /^EN\b/.test(x)), us = st.some(x => /^(ASTM|AMS|SAE|MIL)/.test(x));
    const k = g.eq && (g.eq['AISI/SAE'] ? 'AISI/SAE' : g.eq['AISI'] ? 'AISI' : null);
    if (!k)
        return ad;
    const v = String(g.eq[k]).replace(/^≈\s*/, '');
    if (ad.includes(v))
        return ad;
    const pre = k === 'AISI/SAE' ? 'SAE' : 'AISI';
    if (en && us)
        return `${ad} / ${pre} ${v}`;
    if (us && !en)
        return `${pre} ${v} (${ad})`;
    return ad;
}

export interface StandartOncesi { cls: string | null; form: string | null; grade: string | null }
// Yeni kartta kimyasal ve mekanik standart sınıf, kalite ve forma göre kendiliğinden seçilir. Boşsa doldurulur; doluysa yalnız
// önceki sınıf / formun varsayılanıyla aynıysa (elle seçilmemiş sayılır) ve yeni listede yoksa yenisiyle değişir. Kayıtlı kart
// (id'li) değişmez: düzenlemeye açmak değişiklik talebi doğurmasın.
export function standartlariDoldur(d: Taslak, once?: StandartOncesi): Taslak {
    if (d.id || d.fam !== 'metal' || !d.cls)
        return d;
    const sinifler = FAMS.metal?.classes;
    const C = sinifler?.[d.cls], O = once?.cls ? sinifler?.[once.cls] : undefined;
    if (!C)
        return d;
    const kStd = (c: typeof C | undefined, kod: string | null | undefined) => c?.grades.find(g => g.kod === kod)?.std;
    d.opts = d.opts || {};
    const yaz = (k: string, l: string[], eski: string) => {
        const yeni = varsayilanStandart(l, kStd(C, d.grade));
        const cur = typeof d.opts[k] === 'string' ? String(d.opts[k]) : '';
        if (!yeni)
            return;
        if (!cur || (cur === eski && cur !== yeni))
            d.opts[k] = yeni;
    };
    const oncekiKim = once ? varsayilanStandart(kimyasalStandartlari(O), kStd(O, once.grade)) : '';
    const oncekiMek = once ? varsayilanStandart(mekanikStandartlari(O, once.form), kStd(O, once.grade)) : '';
    yaz('kimstd', kimyasalStandartlari(C), oncekiKim);
    if (d.form)
        yaz('mekstd', mekanikStandartlari(C, d.form), oncekiMek);
    return d;
}
