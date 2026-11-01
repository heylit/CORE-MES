import { save, state, yenile } from '../depo.ts';
import { D } from '../durum.ts';
import { clamp, num } from '../bicim.ts';
import { byId, invKey, machine, material, stockOf, toolById, tools } from '../secici.ts';
import { coolHint } from '../hesap/kesme.ts';
import { gkodaGonder } from '../hesap/gkod.ts';
import { onbellekSil } from '../sahne/gl.ts';
import {
  PR, PS, prAllSig, prChecks, prExportSim, prFixCap, prFixN, prGroup, prInfo, prIsDone, prMachineChanged, prPendOk, prPk, prProg, prSeq,
  prSig, prSrcText, prStep, prToolEval, type AdimSecenegi, type AdimSecimi, type HamOlcu, type HazirlikAdimi,
} from '../hesap/hazirlik.ts';
import type { Kalem, Tezgah } from '../veri/tipler.ts';
import type { CncYetkisi } from '../veri.ts';
import { prtSync, prtToggle } from './deneme.ts';
import { sahneKirli } from './hazirlik-sahnesi.ts';

// Hazırlık eylemleri (prototip 21434-21500) ve seçim kilidi (cerceve-kopru.ts 905-940). Görünüm durumu (odak, öneri, form açık,
// bildirim) bu parçadadır; çekirdeğin PR'ı yalnız adım verisini ve çarkın arama / cep alanlarını taşır.

export const PU = {
  focus: {} as Record<string, number>,
  sug: {} as Record<string, true>,
  mfOpen: false,
  noClick: false,
  flash: null as { metin: string; kotu: boolean; n: number } | null,
};

// Adım seçenekleri hem kalem hem program/malzeme öğesidir; tekli ve çoklu seçim aşağıdaki yardımcılarla okunur.
export type Secenek = Kalem | AdimSecenegi;
export const secimAl = (S: AdimSecimi | null | undefined): string | null | undefined => (S?.kind === 'single' ? S.get() : undefined);
export const secimYap = (S: AdimSecimi | null | undefined, id: string): void => { if (S?.kind === 'single') S.set(id); };
export const secimListesi = (S: AdimSecimi | null | undefined): string[] | null => (S?.kind === 'multi' ? S.list() : null);
export const secimCebi = (S: AdimSecimi | null | undefined): number => (S?.kind === 'single' ? S.pk ?? 0 : 0);

export function prCurStep(): HazirlikAdimi | undefined { return PR.seq[PR.at]; }

let flashT: ReturnType<typeof setTimeout> | undefined;
export function prFlash(metin: string, kotu = false): void {
  PU.flash = { metin, kotu, n: (PU.flash?.n ?? 0) + 1 };
  clearTimeout(flashT);
  flashT = setTimeout(() => { PU.flash = null; yenile(); }, 2600);
  yenile();
}

// Prototipin prUI'si: adım listesi ve deneme eşlenir, ekran yeniden çizilir.
export function prUI(): void {
  if (!PR.seq.length) PR.seq = prSeq();
  PR.at = clamp(PR.at, 0, PR.seq.length - 1);
  if (prtSync(prCurStep()?.g === 'trial')) sahneKirli();
  yenile();
}

// Açılışta kayıtlı adıma, Ana Sayfa'nın "Deneme"sinden gelişte son adıma gidilir.
export function prEnter(adim?: 'son'): void {
  PR.at = clamp(num(PS().at, 0), 0, 99); PR.seq = prSeq(); sahneKirli();
  if (adim === 'son') PR.at = PR.seq.length - 1;
  prUI();
}

// ----- seçim kilidi -----
// Hazırlık seçili emrin kurulumudur: seçim Kurulum'da yapılır, burada yalnız onaylanır. Program adımı serbesttir; yalnız hazırlık
// onayı olan kişide o da kilitlidir. Yazma yetkisi hiç olmayan kişide de seçim kilitlidir (yazma zaten gitmez).
const IZINLI = new Set(['ok', 'prev', 'next', 'print', 'toTrial']);
export function yazamaz(y: CncYetkisi): boolean { return !y.yazabilir && !y.hazirlikOnaylayabilir; }
export function kilitli(y: CncYetkisi): boolean { return y.saltOnay || yazamaz(y) || prCurStep()?.key !== 'prog'; }
export function izinli(y: CncYetkisi, eylem: string): boolean {
  if (y.saltOnay) return IZINLI.has(eylem);
  if (yazamaz(y)) return IZINLI.has(eylem) && eylem !== 'ok';
  return true;
}

// ----- çark -----
export function prSelIdx(st: HazirlikAdimi, S: AdimSecimi): number {
  if (S.kind === 'multi') {
    if (PU.focus[st.key] == null) {
      let f0 = -1;
      S.list().forEach((id) => { const o = byId(S.opts, id), ix = o ? S.opts.indexOf(o) : -1; if (ix >= 0 && (f0 < 0 || ix < f0)) f0 = ix; });
      PU.focus[st.key] = Math.max(0, f0);
    }
    return clamp(PU.focus[st.key] ?? 0, 0, Math.max(0, S.opts.length - 1));
  }
  const id = st.key === 'prog' && PR.upFocus ? 'p_up' : secimAl(S);
  for (let i = 0; i < S.opts.length; i++) if (S.opts[i]?.id === id) return i;
  return st.key === 'prog' && PR.upFocus ? S.opts.length - 2 : 0;
}

export type RozetTonu = 'ok' | 'mut' | 'warn' | 'bad';
export function prBadges(st: HazirlikAdimi, S: AdimSecimi, o: Secenek): [string, RozetTonu][] {
  const b: [string, RozetTonu][] = [];
  if (S.kind === 'multi' && S.list().includes(o.id)) b.push(['✓ seçili', 'ok']);
  if (st.g === 'tools' && o.kind !== 'empty') {
    const arr = tools(), pk = secimCebi(S), at = arr.indexOf(o.id);
    if (arr[pk] === o.id) b.push([`Cep ${String(pk + 1)} · takılı`, 'ok']); else if (at >= 0) b.push([`Cep ${String(at + 1)}'de`, 'mut']);
    if (PU.sug[o.id]) b.push(['programa uygun', 'warn']);
  }
  if (st.g === 'machine' && o.id === state.machine && !prIsDone(st)) b.push(['seçili', 'mut']);
  if (/^(fixture|jaw|tools|gauges|cons)$/.test(st.g) && !o.icon && o.kind !== 'empty') {
    const s = stockOf(invKey(o));
    if (s.st !== 'none') b.push([`depo ${String(s.avail)}`, s.st === 'ok' ? 'ok' : s.st === 'low' ? 'warn' : 'bad']);
  }
  if (st.g === 'cool' && coolHint(material()) === o.id) b.push(['önerilen', 'ok']);
  return b;
}

export function prTitleOf(st: HazirlikAdimi): string {
  const S = prStep(st); let o: Secenek | null = null;
  if (S?.kind === 'single') { const id = S.get(); o = id ? byId<Secenek>(S.opts, id) : null; }
  if (st.g === 'tools' && st.T) return `T${String(st.T)} · ${o ? o.name : 'cep boş'}`;
  if (st.key === 'mag') { const a0 = tools()[prPk(st)]; return `Cep ${String(prPk(st) + 1)} · ${a0 && a0 !== 'empty' ? toolById(a0).name : 'boş'}`; }
  if (st.g === 'final') return 'Son kontrol ve özet';
  if (st.g === 'trial') return 'Kesim ve takım ömrü denemesi';
  if (S?.kind === 'multi') return `${prGroup(st.g).t} · ${String(S.list().length)} kalem`;
  return prGroup(st.g).t + (o ? ` · ${o.name}` : '');
}

// ----- eylemler -----
export function prGo(i: number): void {
  const n = PR.seq.length; i = clamp(Math.round(i), 0, n - 1);
  if (i === PR.at) return;
  PR.at = PS().at = i; PR.upFocus = false; sahneKirli(); save(); prUI();
}
export function prSetOpt(i: number): void {
  const st = prCurStep(), S = prStep(st); if (!st || !S?.opts.length) return;
  i = clamp(Math.round(i), 0, S.opts.length - 1);
  if (S.kind === 'multi') { PU.focus[st.key] = i; prUI(); return; }
  const o = S.opts[i]; if (!o || (o.id === secimAl(S) && !(st.key === 'prog' && PR.upFocus))) return;
  secimYap(S, o.id); sahneKirli(); save(); prUI();
}
export function prMove(d: number): void { const st = prCurStep(), S = prStep(st); if (!st || !S?.opts.length) return; prSetOpt(prSelIdx(st, S) + d); }
export function prToggle(): void {
  const st = prCurStep(), S = prStep(st); if (!st || S?.kind !== 'multi') return;
  const o = S.opts[prSelIdx(st, S)], L0 = S.list(); if (!o) return;
  const k = L0.indexOf(o.id); if (k >= 0) L0.splice(k, 1); else L0.push(o.id);
  sahneKirli(); save(); prUI();
}
export function prRemove(id: string): void {
  const L0 = secimListesi(prStep(prCurStep())); if (!L0) return;
  const k = L0.indexOf(id); if (k >= 0) L0.splice(k, 1); sahneKirli(); save(); prUI();
}

// Dönüş: dosya seçici açılmalı mı (program adımında "Dosyadan yükle" kartı).
export function prConfirm(): 'dosya' | null {
  const st = prCurStep(); if (!st) return null;
  if (st.g === 'trial') { const h = prtToggle(); if (h) prFlash(h, true); else prUI(); return null; }
  if (st.key === 'prog' && PR.upFocus) return 'dosya';
  if (st.g === 'final') {
    if (prIsDone(st)) { prGo(PR.at + 1); return null; }
    const err = prChecks().filter((c) => c.lvl === 'err'), e0 = err[0];
    if (e0) { prFlash(`⚠ ${e0.txt}`, true); if (e0.go != null) prGo(e0.go); return null; }
    PS().fin = { ts: Date.now(), sig: prAllSig() }; save(); sahneKirli(); prUI(); prFlash('✓ Tezgâh hazır — form yazdırılabilir'); return null;
  }
  if (prIsDone(st)) { prGo(PR.at + 1); return null; }
  if (st.T) { const e = prToolEval(st.T); if (!e.t) { prFlash(`⚠ T${String(st.T)}: ${e.msgs[0] ?? ''}`, true); return null; } }
  if (st.key === 'machine') PR.progKey = '';
  PS().done[st.key] = prSig(st);
  if (st.key === 'prog') { sahneKirli(); PR.seq = prSeq(); PS().done['prog'] = prSig(st); prExportSim(); }
  if (st.T) prExportSim();
  save(); sahneKirli();
  prFlash(`✓ ${st.T ? `T${String(st.T)} magazine yüklendi` : `${prGroup(st.g).t} onaylandı`}`);
  PR.seq = prSeq(); prGo(PR.at + 1);
  return null;
}

export function prAccAll(): void {
  prPendOk().forEach((x) => { PS().done[x.key] = prSig(x); });
  prExportSim(); sahneKirli(); save(); prUI(); prFlash('✓ Bekleyen adımlar onaylandı');
}

const ISTEK_SINIRI = 600000;
export function prLoadFile(f: File | null | undefined): void {
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    const txt = typeof rd.result === 'string' ? rd.result : '';
    if (!txt.trim()) { prFlash('⚠ Dosya boş', true); return; }
    state['gsimText'] = { name: f.name, text: txt.length < ISTEK_SINIRI ? txt : txt.slice(0, ISTEK_SINIRI) };
    PS().src = 'cur'; PR.upFocus = false; PR.progKey = ''; sahneKirli(); save();
    const p = prProg(); prUI();
    prFlash(p && !p.err ? `✓ ${f.name} · ${String(p.tools.length)} takım okundu` : '⚠ Program okunamadı', !(p && !p.err));
  };
  rd.readAsText(f);
}

// Simülasyonda aç: program G-Kod görünümüne gider (prototip prOpenSim).
export function prOpenSim(git: () => void): void {
  const src = prSrcText(); if (!src) { prFlash('Program seçilmedi', true); return; }
  // Program aynı adla G-Kod'da zaten yüklüyse yeniden okunmaz (prototipte GS.prog.name karşılaştırması).
  prExportSim(); gkodaGonder(src.text, src.name, { adDegisinceYukle: true }); git();
}

export function prQty(v: string): void { PS().qty = Math.max(1, Math.round(num(v, 1))); sahneKirli(); save(); prUI(); }
export function prWcs(v: string): void { state.wcs[machine().ctrl] = v; sahneKirli(); save(); prUI(); }
export function prStkSet(k: 'd' | 'l' | 'x' | 'y' | 'z', v: string, s0: HamOlcu): void {
  PS().stk = { ...s0, [k]: Math.max(0.1, num(v, 1)), src: 'man' }; sahneKirli(); save(); prUI();
}
export function prStkAuto(): void { PS().stk = null; sahneKirli(); save(); prUI(); }
export function prCat(pk: number, cat: string): void { PS().cat[`p${String(pk)}`] = cat; PR.q[`p${String(pk)}`] = ''; save(); prUI(); }
export function prQ(pk: number, q: string): void { PR.q[`p${String(pk)}`] = q; yenile(); }
export function prSug(id: string): void { secimYap(prStep(prCurStep()), id); sahneKirli(); save(); prUI(); }
export function prPocket(pq: number): void {
  const stc = prCurStep(); if (!stc) return;
  if (stc.key === 'mag') { PR.magP = pq; sahneKirli(); prUI(); return; }
  const gi = PR.seq.findIndex((x) => x.T === pq + 1);
  if (gi >= 0) prGo(gi); else prFlash(`Cep ${String(pq + 1)} programda kullanılmıyor`, false);
}
export function prRail(g: string): void {
  let first = -1, nd = -1;
  PR.seq.forEach((s, i) => { if (s.g !== g) return; if (first < 0) first = i; if (nd < 0 && !prIsDone(s)) nd = i; });
  prGo(nd >= 0 ? nd : first);
}

// ----- tezgâh bilgileri (prototip 20823-20862) -----
type AlanTuru = 'text' | 'num' | 'ctrl' | 'taper';
export interface TezgahAlani { k: string; ad: string; tur: AlanTuru; temel: boolean; ipucu?: string }
const A = (k: string, ad: string, tur: AlanTuru, temel: 0 | 1, ipucu?: string): TezgahAlani => ({ k, ad, tur, temel: temel === 1, ipucu });
export const MF: readonly TezgahAlani[] = [
  A('no', 'Tezgâh no', 'text', 1, 'ör. T-02'), A('name', 'Görünen ad', 'text', 1), A('marka', 'Marka', 'text', 0, 'ör. üretici'), A('model', 'Model', 'text', 0, 'ör. model adı'),
  A('ctrlUnit', 'Kontrol ünitesi (bilgisayar)', 'text', 0, 'ör. Heidenhain TNC 640'), A('ctrl', 'Program dili', 'ctrl', 1), A('taper', 'Takım bağlantısı', 'taper', 1),
  A('pockets', 'Magazin / taret cep sayısı', 'num', 1), A('rpm', 'Maks. iş mili devri (dev/dk)', 'num', 1), A('kw', 'İş mili gücü (kW)', 'num', 0, 'ör. 13'),
  A('fixCap', 'Aynı anda bağlanabilen aparat', 'num', 0, '1'), A('pallet', 'Palet sayısı', 'num', 0, 'ör. 2'),
  A('xT', 'X kursu (mm)', 'num', 0, 'ör. 500'), A('yT', 'Y kursu (mm)', 'num', 0, 'ör. 450'), A('zT', 'Z kursu (mm)', 'num', 0, 'ör. 400'),
  A('tbl', 'Tabla ölçüsü (mm)', 'text', 0, 'ör. Ø630 / 800×500'), A('load', 'Tabla yükü (kg)', 'num', 0, 'ör. 200'),
  A('zDay', 'İş mili burnu – tabla maks. (mm)', 'num', 0, 'ör. 600'), A('viseW', 'Mengene maks. açıklığı (mm)', 'num', 0, 'ör. 160'),
  A('maxD', 'Maks. tornalama çapı (mm)', 'num', 0, 'ör. 366'), A('maxL', 'Maks. tornalama boyu (mm)', 'num', 0, 'ör. 705'), A('bar', 'Çubuk kapasitesi (mm)', 'num', 0, 'ör. 80'),
  A('subBar', 'Karşı iş mili çubuk kapasitesi (mm)', 'num', 0, 'ör. 65'), A('chuck', 'Ayna ölçüsü (inç)', 'num', 0, 'ör. 10'),
  A('seri', 'Seri no', 'text', 0, ''), A('yil', 'Üretim yılı', 'num', 0, 'ör. 2019'), A('loc', 'Konum / hücre', 'text', 0, 'ör. Hol 2 · Hücre B'), A('note', 'Not', 'text', 0, ''),
];
// Prototipin TAPER_OPTS'u (18310); katalogdaki bağlantılara tareti ekler.
export const TAPER_OPTS = ['HSK-A63', 'HSK-A100', 'BT40', 'SK40', 'BT50', 'Capto C6', 'Taret'];

export function prMachMain(m: Tezgah): string {
  const I = prInfo(m), b = I['model'] ? [I['marka'] || I['marka0'], I['model']].filter(Boolean).join(' ') : (m.baseName ?? m.name);
  return (m.no ? `${m.no} · ` : '') + b;
}
export function prSetFixN(n: number): void {
  const m = machine(), o = PS().fixN ?? (PS().fixN = {});
  o[m.id] = clamp(n, 1, prFixCap(m)); sahneKirli(); save(); prUI();
}
export function prSetMF(k: string, v0: string): void {
  let m0 = machine();
  const f = MF.find((x) => x.k === k); if (!f) return;
  const cm = byId(state.customMachines, m0.id), tgt: Partial<Tezgah> & Record<string, unknown> = cm ?? (state.mo[m0.id] ??= {});
  let v: string | number = f.tur === 'num' ? (v0 === '' ? '' : num(v0) ?? '') : v0;
  if (f.temel) {
    if (k === 'pockets') v = clamp(Math.round(num(v, m0.pockets)), 1, 120);
    if (k === 'rpm') v = clamp(Math.round(num(v, m0.rpm)), 100, 80000);
    if (k === 'name' && !String(v).trim()) return;
    if (k === 'no') v = String(v || '').trim().toUpperCase();
    tgt[k] = v;
    if (k === 'ctrl') { m0 = machine(); const w = D.WCS[v as Tezgah['ctrl']]; if (!state.wcs[String(v)] && w?.[0]) state.wcs[String(v)] = w[0].id; }
    prMachineChanged();
  } else {
    const info: Record<string, string | number | null | undefined> = { ...m0.info, ...(tgt.info ?? {}) };
    if (v === '') delete info[k]; else info[k] = v;
    tgt.info = info; sahneKirli();
  }
  if (k === 'fixCap') prSetFixN(prFixN());
  onbellekSil(m0.id); save(); prUI();
}

export const LVL_IC = { ok: '✓', warn: '!', err: '✕' } as const;
