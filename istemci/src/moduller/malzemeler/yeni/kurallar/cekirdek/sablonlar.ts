import { FAMS, FORMS } from './durum.ts';
import { grade } from './taslak.ts';
import type { Taslak } from './tipler.ts';
import { tlc } from './yardimcilar.ts';

export function tplSummary__0(t: Taslak): string {
    const g = grade({ fam: t.fam, cls: t.cls, grade: t.grade, custom: t.custom || {} } as Taslak);
    const bits: unknown[] = [g ? g.ad : FAMS[String(t.fam)]!.ad];
    if (t.form)
        bits.push(tlc(FORMS[t.form]!.ad.split(' /')[0]));
    Object.values(t.opts || {}).forEach(v => { (Array.isArray(v) ? v : [v]).filter(Boolean).forEach(x => bits.push(x)); });
    (t.com && t.com.sertifika || []).forEach(x => bits.push(x));
    const s = bits.join(', ');
    return s.length > 110 ? s.slice(0, 108) + '…' : s;
}
