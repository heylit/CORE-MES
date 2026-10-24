import { state } from '../depo.ts';
import { esc, fmt, pad2 } from '../bicim.ts';
import { allCons, allGauges, byId, machine, material, toolById, tools } from '../secici.ts';
import { cutData, holderOf } from '../hesap/kesme.ts';
import type { IsMalzemesi, Tezgah } from '../veri/tipler.ts';
import { download, fname } from '../indir.ts';
import { GENEL_ADIM, K } from './satirlar.ts';

// Kurulum kartının dışa aktarımı (prototip 17748-17777): CSV, JSON ve yazdırma. Biçimler prototipteki gibidir; hepsi tarayıcıda üretilir.

export { esc };

export interface KurulumAktarimi { m: Tezgah; mat: IsMalzemesi; gen: string[][]; tl: (string | number)[][]; g: string[]; c: string[] }

export function rowsForExport(): KurulumAktarimi {
  const m = machine(), mat = material(), arr = tools(), gen: string[][] = [], tl: (string | number)[][] = [];
  for (let i = 0; i < GENEL_ADIM; i++) {
    const d = K.defs[i]; if (!d || d.type !== 'single') continue;
    const o = byId(d.options, d.get());
    gen.push([d.title, o ? o.name : '—', o ? (o.code ?? '') : '']);
  }
  arr.forEach((id, p) => {
    const t = toolById(id); if (t.kind === 'empty') return; const cd = cutData(t, mat, m) ?? {};
    tl.push([`T${pad2(p + 1)}`, t.name, t.code ?? '', holderOf(t, m), t.d ? fmt(t.d) : '', t.z ?? '', cd.vc ?? '', cd.n ? cd.n : '',
      cd.fz ? fmt(cd.fz) : cd.f ? fmt(cd.f) : '', cd.F ?? '', cd.warn ?? cd.note ?? '']);
  });
  const g = state.gauges.map((id) => byId(allGauges(), id)?.name ?? id), c = state.cons.map((id) => byId(allCons(), id)?.name ?? id);
  return { m, mat, gen, tl, g, c };
}

const q = (v: unknown): string => { const s = String(v == null ? '' : v as string); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function csvMetni(r: KurulumAktarimi, tarih: string): string {
  const L: unknown[][] = [];
  L.push(['CNC KURULUM KARTI']);
  L.push(['Parça No', state.meta.part, 'Program No', state.meta.prog, 'Operatör', state.meta.op, 'Tarih', tarih]);
  if (state.meta.stock) L.push(['Hammadde', state.meta.stock]);
  L.push([]);
  r.gen.forEach((x) => { L.push(x); }); L.push([]);
  L.push(['Cep', 'Takım', 'Kod', 'Tutucu', 'Ø (mm)', 'Z', 'Vc (m/dk)', 'n (dev/dk)', 'fz / f', 'F (mm/dk)', 'Not']);
  r.tl.forEach((x) => { L.push(x); }); L.push([]);
  L.push(['Ölçüm Aletleri', ...r.g]); L.push(['Sarf Malzemeleri', ...r.c]);
  return '﻿' + L.map((row) => row.map(q).join(';')).join('\r\n');
}

export function exportCSV(): void {
  download(fname('csv'), csvMetni(rowsForExport(), new Date().toLocaleDateString('tr-TR')), 'text/csv;charset=utf-8');
}

export function exportJSON(): void {
  const r = rowsForExport();
  download(fname('json'), JSON.stringify({ olusturma: new Date().toISOString(), meta: state.meta, tezgah: r.m, malzeme: r.mat.name, genel: r.gen, takimlar: r.tl, olcum: r.g, sarf: r.c, ham: state }, null, 2), 'application/json');
}

// Yazdırma alanı: sayfanın geri kalanı yazdırmada gizlenir (kurulum.css), alan yazdırmadan sonra kalkar.
export function yazdir(html: string): void {
  const alan = document.createElement('div');
  alan.className = 'tc-ck-yazdir';
  alan.innerHTML = html;
  document.body.appendChild(alan);
  document.body.classList.add('tc-ck-yazdiriliyor');
  const bitir = (): void => { alan.remove(); document.body.classList.remove('tc-ck-yazdiriliyor'); window.removeEventListener('afterprint', bitir); };
  window.addEventListener('afterprint', bitir);
  window.print();
  setTimeout(bitir, 1000);
}

export function kurulumKartiHtml(r: KurulumAktarimi, tarih: string): string {
  let h = `<h1>CNC Kurulum Kartı</h1><table class="pm"><tr><td>Parça No</td><td>${esc(state.meta.part)}</td><td>Program No</td><td>${esc(state.meta.prog)}</td><td>Operatör</td><td>${esc(state.meta.op)}</td><td>Tarih</td><td>${tarih}</td></tr>${state.meta.stock ? `<tr><td>Hammadde</td><td colspan="7">${esc(state.meta.stock)}</td></tr>` : ''}</table>`;
  h += `<h2>Genel</h2><table>${r.gen.map((x) => `<tr><th>${esc(x[0])}</th><td>${esc(x[1])}</td><td>${esc(x[2])}</td></tr>`).join('')}</table>`;
  h += `<h2>Takım Listesi</h2><table><tr><th>Cep</th><th>Takım</th><th>Kod</th><th>Tutucu</th><th>Ø</th><th>Z</th><th>Vc</th><th>n</th><th>fz/f</th><th>F</th><th>✓</th></tr>${r.tl.map((x) => `<tr>${x.slice(0, 10).map((v) => `<td>${esc(v)}</td>`).join('')}<td class="ck"></td></tr>`).join('')}</table>`;
  h += `<h2>Ölçüm Aletleri</h2><p>${esc(r.g.join(' · '))}</p><h2>Sarf Malzemeleri</h2><p>${esc(r.c.join(' · '))}</p><p class="pf">Kesme verileri başlangıç değeridir; takım üreticisi kataloğunu esas alın.</p>`;
  return h;
}

export function printSheet(): void { yazdir(kurulumKartiHtml(rowsForExport(), new Date().toLocaleDateString('tr-TR'))); }
