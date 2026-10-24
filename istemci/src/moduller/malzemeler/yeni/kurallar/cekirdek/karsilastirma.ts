import { propDisp } from './birim.ts';
import { FAMS, ONAY, UNITS, ayarla_UNITS } from './durum.ts';
import { specData } from './foy.ts';
import { onayDurum } from './onay.ts';
import { dimsStr } from './turler.ts';
import { isNum, kgFmt, perM2Fmt, perMFmt } from './yardimcilar.ts';
import type { TurTaslagi } from './turler.ts';

// Karşılaştırma satırı: [bölüm, alan, değer metni].
export type KarsilastirmaSatiri = [string, string, string];
interface EkOzellik { ad?: string; v?: unknown; u?: string; [alan: string]: unknown }

export function flatItem__0(d: TurTaslagi, metric?: boolean): KarsilastirmaSatiri[] {
    const was = UNITS;
    if (metric)
        ayarla_UNITS('met');
    const rows: KarsilastirmaSatiri[] = [];
    try {
        const s = specData(d);
        if (!s.f)
            return rows;
        const P = (sec: string, k: string, v: unknown) => rows.push([sec, k, (v === undefined || v === null || v === '') ? '—' : String(v)]);
        P('Tanım', 'Kod', s.kod);
        P('Tanım', 'Ad', s.ad);
        P('Tanım', 'Onay durumu', ONAY[onayDurum(d)]!.ad);
        P('Tanım', 'Aile', s.f.ad);
        P('Tanım', 'Sınıf', s.c && s.c.ad);
        P('Tanım', 'Kalite', s.g && s.g.ad);
        P('Tanım', 'Standart', s.std);
        Object.entries(s.eq).forEach(([k, v]) => P('Eşdeğerler', k, v));
        P('Form ve ölçüler', 'Form', s.fm && s.fm.ad);
        P('Form ve ölçüler', 'Ölçüler', dimsStr(d));
        P('Form ve ölçüler', 'Tolerans', d.tol);
        if (s.w) {
            P('Form ve ölçüler', 'Ağırlık', kgFmt(s.w.kg));
            if (isNum(s.w.perM))
                P('Form ve ölçüler', 'Metre ağırlığı', perMFmt(s.w.perM));
            if (isNum(s.w.perM2))
                P('Form ve ölçüler', 'm² ağırlığı', perM2Fmt(s.w.perM2));
        }
        (FAMS[d.fam!]!.opts || []).forEach(o => { const v = d.opts && d.opts[o.k]; const t = Array.isArray(v) ? v.join(', ') : v; if (t)
            P('Durum ve işlem', o.ad, t); });
        s.props.forEach(p => P('Teknik özellikler', p.ad, propDisp(p.v, p.u)));
        ((d.extra || []) as EkOzellik[]).filter(e => e.ad).forEach(e => P('Ek özellikler', e.ad!, e.v + (e.u ? ' ' + e.u : '')));
        const cm = d.com || {};
        P('Ticari', 'Tedarikçi', cm.ted);
        P('Ticari', 'Stok birimi', s.birim);
        P('Ticari', 'Sertifikalar', (cm.sertifika || []).join(', '));
        P('Ticari', 'Notlar', cm.not);
        P('Ticari', 'Belgeler', (d.docs || []).map(x => x.ad).join(', '));
    }
    finally {
        ayarla_UNITS(was);
    }
    return rows;
}