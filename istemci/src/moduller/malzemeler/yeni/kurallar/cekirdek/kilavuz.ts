import { OPT_ICON } from './durum.ts';
import { feOf, prices } from './fiyat.ts';
import type { Fiyatlar } from './fiyat.ts';
import { specData } from './foy.ts';
import { svgI } from './tanimlar.ts';
import type { Nesne } from '../../tipler.ts';
import { finalStd, newDraft } from './taslak.ts';
import type { Agirlik, Kalite, Taslak } from './tipler.ts';
import type { TurTaslagi } from './turler.ts';
import { compatIssues, dimsStr, finalBirim, isGen, weight } from './turler.ts';
import { clsKeyFor } from './uyumluluk.ts';
import { isNum, r4 } from './yardimcilar.ts';

export function KL_IK(k: string): string { return (`<span class="kl-ik">${svgI(OPT_ICON[k] || OPT_ICON.wrench!)}</span>`); }
export function stokOzeti__0(x: TurTaslagi): Nesne {
    const s = specData(x), w = weight(x) || {} as Partial<Agirlik>, pr = prices(x) || {} as Partial<Fiyatlar>;
    const g = s.g || {} as Partial<Kalite>;
    return { stok_kodu: x.com.kod, stok_adi: x.com.ad, aile: x.fam, aile_adi: s.f ? s.f.ad : '', sinif: clsKeyFor(x), sinif_adi: s.c ? s.c.ad : '',
        kalite_kodu: x.grade === '__ozel' ? (x.custom.kod || x.custom.ad) : x.grade, kalite_adi: g.ad || '', standart: finalStd(x), standartlar: x.stds || [],
        form: x.form, form_adi: s.fm ? s.fm.ad : '', olcu_metni: dimsStr(x, true), olculer: { ...x.dims }, tolerans: x.tol || '',
        birim_agirlik_kg: isNum(w.kg) ? r4(w.kg) : null, metre_agirlik_kg: isNum(w.perM) ? r4(w.perM) : null, m2_agirlik_kg: isNum(w.perM2) ? r4(w.perM2) : null,
        stok_birimi: finalBirim(x), fiyat: isNum(x.com.fiyat) ? x.com.fiyat : null, fiyat_esasi: feOf(x), para_birimi: x.com.pb,
        kg_fiyati: isNum(pr.kg) ? r4(pr.kg) : null, parca_fiyati: isNum(pr.adet) ? r4(pr.adet) : null,
        tedarikci: x.com.ted || '', min_siparis: isNum(x.com.moq) ? x.com.moq : null, sertifikalar: x.com.sertifika || [],
        belge_sayisi: (x.docs || []).length, uyumluluk_notlari: compatIssues(x).map(i => ({ seviye: i.s === 'no' ? 'uyumsuz' : 'dikkat', konu: i.t, aciklama: i.m })) };
}
export function kartTamamla(x: Taslak): Taslak {
    if (isGen(x))
        return x;
    const t = newDraft();
    ['opts', 'dims', 'ov', 'extra', 'stds', 'custom'].forEach(k => { if (x[k] == null)
        x[k] = t[k]; });
    if (x.kodManual === undefined && x.com && x.com.kod)
        x.kodManual = true;
    if (x.adManual === undefined && x.com && x.com.ad)
        x.adManual = true;
    return x;
}