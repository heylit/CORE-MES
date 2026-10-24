import { fmtSize } from './belgeler.ts';
import { propDisp } from './birim.ts';
import { FAMS, FORMS } from './durum.ts';
import { clsObj, finalAd, finalKod, finalStd, grade, propsFor, unitOf, val } from './taslak.ts';
import { dimsStr, finalBirim, weight } from './turler.ts';
import type { Agirlik, Aile, Form, Kalite, Sinif, Sozluk, Taslak } from './tipler.ts';
import { esc, fmt, isNum, kgFmt, perM2Fmt, perMFmt } from './yardimcilar.ts';

export interface FoyOzelligi { ad: string; v: unknown; u: string | undefined; ch: boolean }
export interface FoySecenegi { ad: string; v: unknown }
// Föyün verisi (specData): föy, etiket ve karşılaştırma bunu okur.
export interface FoyVerisi {
  f: Aile | undefined;
  c: Sinif | null | undefined;
  g: Kalite | null;
  fm: Form | undefined;
  w: Agirlik | null;
  props: FoyOzelligi[];
  opts: FoySecenegi[];
  eq: Sozluk<string>;
  kod: string;
  ad: string;
  std: string;
  birim: string;
}
// Taslağın ek özellik satırı (extra) ve belge kaydı (docs); föy yalnız bu alanları okur.
type EkOzellik = { ad?: string; v: string | number; u?: string };
type FoyBelgesi = { url?: string; id?: string; ad: string; tip: string; size?: number };

export function specData(d: Taslak): FoyVerisi {
    const f = d.fam ? FAMS[d.fam] : undefined;
    const c = f && clsObj(d);
    const g = grade(d);
    const fm = d.form ? FORMS[d.form] : undefined;
    const w = weight(d);
    const props: FoyOzelligi[] = f ? propsFor(d.fam).map(p => { const v = val(p.k, d); const o = d.ov && d.ov[p.k]; return { ad: p.ad, v, u: p.sel ? '' : unitOf(p, d.fam), ch: o !== undefined && o !== '' }; }).filter(x => x.v !== undefined && x.v !== '' && x.v !== null) : [];
    const opts = f ? f.opts.map(o => { const v = d.opts[o.k]; const s = Array.isArray(v) ? v.join(', ') : v; return s ? { ad: o.ad, v: s } : null; }).filter((x): x is NonNullable<typeof x> => Boolean(x)) : [];
    return { f, c, g, fm, w, props, opts, eq: (g && g.eq) || {}, kod: finalKod(d), ad: finalAd(d), std: finalStd(d), birim: finalBirim(d) };
}
export function specHTML__0(d: Taslak, compact?: unknown): string {
    const s = specData(d);
    if (!s.f)
        return '<div class="pv-empty">Föy, seçimlerini yaptıkça burada oluşur.</div>';
    const row = (k: string, v: unknown): string => v || v === 0 ? `<dt>${k}</dt><dd>${v}</dd>` : '';
    let h = `<div class="sd-head" style="--cc:${s.f.c}"><div class="sd-kod">${esc(s.kod)}</div><h3 class="sd-ad">${esc(s.ad || s.f.ad + ' (kalite seçilmedi)')}</h3></div>`;
    if (compact) {
        if (s.w)
            h += `<div class="pv-w"><div><small>${s.fm && s.fm.mass ? 'Ambalaj' : 'Parça'}</small><b>${kgFmt(s.w.kg)}</b></div>${isNum(s.w.perM) ? `<div><small>Metre</small><b>${perMFmt(s.w.perM)}</b></div>` : ''}${isNum(s.w.perM2) ? `<div><small>Metrekare</small><b>${perM2Fmt(s.w.perM2)}</b></div>` : ''}</div>`;
        h += `<dl class="dl">${row('Aile', esc(s.f.ad))}${row('Sınıf', esc(s.c && s.c.ad))}${Object.entries(s.eq).slice(0, 3).map(([k, v]) => row(esc(k), esc(v))).join('')}${row('Form', esc(s.fm && s.fm.ad))}${row('Ölçü', esc(dimsStr(d)))}${s.props.slice(0, 6).map(p => row(esc(p.ad), esc(propDisp(p.v, p.u)) + (p.ch ? ' <span class="tag ch">✎</span>' : ''))).join('')}</dl>`;
        return `<div class="pv">${h}</div>`;
    }
    h += `<div class="sd-sec"><h3>Tanım</h3><dl class="dl">${row('Aile', esc(s.f.ad))}${row('Sınıf', esc(s.c && s.c.ad))}${row('Kalite', esc(s.g && s.g.ad))}${row('Standart', esc(s.std))}</dl></div>`;
    if (Object.keys(s.eq).length)
        h += `<div class="sd-sec"><h3>Eşdeğerler ve diğer adlar</h3><dl class="dl">${Object.entries(s.eq).map(([k, v]) => row(esc(k), esc(v))).join('')}</dl><p class="eqnote">≈ işareti yakın eşdeğeri gösterir; bileşim ve mekanik sınırlar normlar arasında birebir aynı olmayabilir.</p></div>`;
    if (s.fm)
        h += `<div class="sd-sec"><h3>Form ve ölçüler</h3><dl class="dl">${row('Form', esc(s.fm.ad))}${row('Ölçüler', esc(dimsStr(d)))}${row('Tolerans', esc(d.tol))}${s.w ? row(s.fm.mass ? 'Ambalaj / rulo ağırlığı' : 'Parça ağırlığı', kgFmt(s.w.kg)) + (isNum(s.w.perM) ? row('Metre ağırlığı', perMFmt(s.w.perM)) : '') + (isNum(s.w.perM2) ? row('Metrekare ağırlığı', perM2Fmt(s.w.perM2)) : '') : ''}</dl></div>`;
    if (s.opts.length)
        h += `<div class="sd-sec"><h3>Durum ve işlem</h3><dl class="dl">${s.opts.map(o => row(esc(o.ad), esc(o.v))).join('')}</dl></div>`;
    if (s.props.length)
        h += `<div class="sd-sec"><h3>Teknik özellikler</h3><dl class="dl">${s.props.map(p => row(esc(p.ad), esc(propDisp(p.v, p.u)) + (p.ch ? '<span class="tag ch">Değiştirildi</span>' : ''))).join('')}</dl></div>`;
    const xs = ((d.extra || []) as EkOzellik[]).filter(e => e.ad);
    if (xs.length)
        h += `<div class="sd-sec"><h3>Ek özellikler</h3><dl class="dl">${xs.map(e => row(esc(e.ad), esc(e.v + (e.u ? ' ' + e.u : '')))).join('')}</dl></div>`;
    const cm = d.com;
    h += `<div class="sd-sec"><h3>Ticari</h3><dl class="dl">${row('Tedarikçi', esc(cm.ted))}${row('Stok birimi', esc(s.birim))}${row('Sertifikalar', esc((cm.sertifika || []).join(', ')))}${row('Notlar', esc(cm.not))}</dl></div>`;
    const docs = d.docs as FoyBelgesi[] | undefined;
    if ((docs || []).length)
        h += `<div class="sd-sec"><h3>Belgeler</h3><ul class="docs">${docs!.map(x => `<li><a href="${esc(x.url || '/_blob/' + x.id)}" target="_blank" rel="noopener">${esc(x.ad)}</a><span class="dtype">${esc(x.tip)}</span><span class="dsz">${fmtSize(x.size)}</span></li>`).join('')}</ul></div>`;
    return `<div class="sheetdoc">${h}</div>`;
}
export function specMD__0(d: Taslak): string {
    const s = specData(d);
    const L = [`# ${s.ad}`, '', `**Kod:** ${s.kod}  `, `**Aile / sınıf:** ${s.f ? s.f.ad : ''} / ${s.c ? s.c.ad : ''}  `, `**Kalite:** ${s.g ? s.g.ad : ''}  `, `**Standart:** ${s.std || '-'}`, ''];
    if (Object.keys(s.eq).length) {
        L.push('## Eşdeğerler ve diğer adlar', '');
        Object.entries(s.eq).forEach(([k, v]) => L.push(`- ${k}: ${v}`));
        L.push('', '_≈ yakın eşdeğer; normlar arasında birebir aynı olmayabilir._', '');
    }
    if (s.fm) {
        L.push('## Form ve ölçüler', '', `- Form: ${s.fm.ad}`, `- Ölçüler: ${dimsStr(d)}`);
        if (d.tol)
            L.push(`- Tolerans: ${d.tol}`);
        if (s.w) {
            L.push(`- Ağırlık: ${kgFmt(s.w.kg)}`);
            if (isNum(s.w.perM))
                L.push(`- Metre ağırlığı: ${perMFmt(s.w.perM)}`);
            if (isNum(s.w.perM2))
                L.push(`- Metrekare ağırlığı: ${perM2Fmt(s.w.perM2)}`);
        }
        L.push('');
    }
    if (s.opts.length) {
        L.push('## Durum ve işlem', '');
        s.opts.forEach(o => L.push(`- ${o.ad}: ${o.v}`));
        L.push('');
    }
    if (s.props.length) {
        L.push('## Teknik özellikler', '', '| Özellik | Değer | Birim |', '|---|---|---|');
        s.props.forEach(p => L.push(`| ${p.ad}${p.ch ? ' *' : ''} | ${isNum(p.v) ? fmt(p.v) : p.v} | ${p.u ?? ''} |`));
        if (s.props.some(p => p.ch))
            L.push('', '\\* Kalite değerinden değiştirildi.');
        L.push('');
    }
    const xs = ((d.extra || []) as EkOzellik[]).filter(e => e.ad);
    if (xs.length) {
        L.push('## Ek özellikler', '');
        xs.forEach(e => L.push(`- ${e.ad}: ${e.v}${e.u ? ' ' + e.u : ''}`));
        L.push('');
    }
    const cm = d.com;
    L.push('## Ticari', '', `- Tedarikçi: ${cm.ted || '-'}`, `- Birim: ${s.birim}`);
    if ((cm.sertifika || []).length)
        L.push(`- Sertifikalar: ${cm.sertifika.join(', ')}`);
    if (cm.not)
        L.push(`- Notlar: ${cm.not}`);
    return L.join('\n');
}