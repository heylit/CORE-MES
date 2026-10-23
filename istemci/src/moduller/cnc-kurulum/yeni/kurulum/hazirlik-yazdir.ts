import { state } from '../depo.ts';
import { D } from '../durum.ts';
import { fmtN } from '../bicim.ts';
import { allCons, allGauges, bt, byId, machine, material, tools } from '../secici.ts';
import { holderOf } from '../hesap/kesme.ts';
import { fmtT } from '../hesap/gkod.ts';
import {
  PR, PS, prChecks, prFinalDone, prFixList, prFixN, prInfo, prIsDone, prJawList, prProg, prSeq, prSrcText, prStk, prStkKg, prStkLabel,
  prToolEval, prTs, prZeroList,
} from '../hesap/hazirlik.ts';
import type { Kalem } from '../veri/tipler.ts';
import { esc, yazdir } from './disa-aktarim.ts';
import { LVL_IC } from './hazirlik-eylem.ts';

// Hazırlık formu (prototip prPrint 21489-21509). Metin ve tablo düzeni prototipinkidir; imza satırının ölçüsü kurulum.css'tedir.
export function hazirlikFormuHtml(tarih: string): string {
  const m = machine(), mat = material(), s = prStk(), p = prProg(), src = prSrcText(), w = byId(D.WCS[m.ctrl], state.wcs[m.ctrl]), ch = prChecks();
  const fin = !!PS().fin && prFinalDone();
  const nm = (L0: readonly Kalem[], id: string | undefined): string => byId(L0, id)?.name ?? '—';
  const I = prInfo(m), b = bt();
  let h = `<h1>CNC Hazırlık Formu ${fin ? '· HAZIR ✓' : '· TASLAK'}</h1><table><tr><th>Tezgâh</th><td>${esc(m.name)}${I['ctrlUnit'] ? ` · ${esc(I['ctrlUnit'])}` : ''}${I['seri'] ? ` · S/N ${esc(I['seri'])}` : ''}${I['loc'] ? ` · ${esc(I['loc'])}` : ''}</td><th>Tarih</th><td>${tarih}</td></tr>`;
  h += `<tr><th>Program</th><td>${esc(src ? src.name : 'Programsız')}</td><th>Parti</th><td>${esc(PS().qty)} adet${p && !p.err ? ` · çevrim ${fmtT(p.total)}` : ''}</td></tr>`;
  h += `<tr><th>Malzeme</th><td>${esc(mat.name)}</td><th>Ham ölçü</th><td>${prStkLabel(s)} · ${fmtN(prStkKg(s), 2)} kg</td></tr>`;
  h += `<tr><th>Bağlama</th><td>${esc(nm(prFixList(), b.fixture))}${prFixN() > 1 ? ` × ${String(prFixN())}` : ''}</td><th>Çene</th><td>${esc(nm(prJawList(), b.jaw))}</td></tr>`;
  h += `<tr><th>Sıfırlama</th><td>${esc(nm(prZeroList(), b.zero))}</td><th>${m.ctrl === 'heid' ? 'Preset' : 'İş koord.'}</th><td>${esc(w ? w.name : '—')}</td></tr>`;
  h += `<tr><th>Soğutma</th><td colspan="3">${esc(nm(D.COOL, state.coolant))}</td></tr></table>`;
  h += '<h2>Takımlar</h2><table><tr><th class="ck">✓</th><th>T</th><th>Takım</th><th>Tutucu</th><th>Kesme / parça</th><th>Ömür</th><th>Yedek</th><th>Not</th></tr>';
  const Ts = prTs();
  if (!Ts.length) tools().forEach((id, i) => { if (id !== 'empty' && id !== 'probe') Ts.push(i + 1); });
  Ts.forEach((T) => {
    const e = prToolEval(T);
    h += `<tr><td class="ck">${prIsDone({ key: `T${String(T)}`, g: 'tools', T }) ? '✓' : ''}</td><td>T${String(T)}</td><td>${esc(e.t ? e.t.name : 'BOŞ')}</td><td>${esc(e.t ? holderOf(e.t, m) : '')}</td>`
      + `<td>${e.cutT != null ? `${fmtN(e.cutT, 2)} dk` : '—'}</td><td>${typeof e.c?.pct === 'number' ? `%${String(Math.round(e.c.pct * 100))}` : '—'}</td><td>${e.c?.spare != null ? String(e.c.spare) : '—'}</td>`
      + `<td>${esc(e.msgs.filter((x) => !x.includes('yeterli')).join('; '))}</td></tr>`;
  });
  h += '</table><h2>Ölçüm aletleri ve sarf</h2><table><tr><th class="ck">✓</th><th>Kalem</th><th class="ck">✓</th><th>Kalem</th></tr>';
  const it = state.gauges.map((id) => nm(allGauges(), id)).concat(state.cons.map((id) => nm(allCons(), id)));
  for (let i = 0; i < it.length; i += 2) h += `<tr><td class="ck"></td><td>${esc(it[i])}</td><td class="ck"></td><td>${esc(it[i + 1] ?? '')}</td></tr>`;
  h += `</table><h2>Kontrol</h2><table>${ch.map((c) => `<tr><td class="ck">${LVL_IC[c.lvl]}</td><td>${esc(c.txt)}</td></tr>`).join('')}</table>`;
  h += '<table class="imza"><tr><th>Hazırlayan</th><td></td><th>Kontrol eden</th><td></td></tr></table><div class="pf">CNC Kurulum Motoru · Hazırlık</div>';
  return h;
}

export function prPrint(): void { yazdir(hazirlikFormuHtml(new Date().toLocaleString('tr-TR'))); }

// Ana sayfadaki Yazdır: adım listesi önce kurulur (prototip 21889).
export function hazirlikYazdir(): void { PR.seq = prSeq(); prPrint(); }
