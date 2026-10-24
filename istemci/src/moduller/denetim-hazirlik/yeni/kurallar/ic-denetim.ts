import { ICG, ICR, MONS, SAHA, type SahaSablonu } from '../icerik/ic-denetim.ts';
import { PROGRAMLAR } from '../icerik/programlar.ts';
import { yeniDenetim, yeniKimlik } from '../normalize.ts';
import { aylar, bugunTarihi, gunEkle, gunFarki, tarihMetni } from '../tarih.ts';
import type { IcMaddesi, IcPlanSatiri, IcYurutme, Profil, SahaTuru, Surec } from '../tipler.ts';
import { dofSonGunuEsitle } from './denetim-takvimi.ts';

// İç denetim (ISO 9001 9.2): yıllık plan KYS süreçlerinden kurulur; yürütme bitince takvime "İç denetim" kaydı ve bulgular yazılır,
// majör/minör varsa DÖF son günü oluşur. Saha kontrolleri şablon sıklığıyla vadelenir.

export const ayEtiketi = (ym: string): string => `${MONS[Number(ym.slice(5, 7)) - 1] ?? ''} ${ym.slice(2, 4)}`;
export const buAy = (): string => bugunTarihi().slice(0, 7);
// Plan penceresi: bu aydan başlayan 12 ay.
export const planAylari = (): string[] => aylar(12, true);

export interface PlanSatiri { r: IcPlanSatiri; p: Surec }

// Plan satırları KYS süreçleriyle eşitlenir: yeni süreç satır alır, silinen sürecin satırı düşer, yıl bu yıla gelir.
// Yerinde değiştirir; okumada icPlanSatirlari kullanılır.
export function icPlaniEsitle(profil: Profil): void {
  const P = profil.ic.plan;
  const procs = profil.kys.procs;
  for (const p of procs) if (!P.rows.some((r) => r.pid === p.id)) P.rows.push({ pid: p.id, aud: '', months: [] });
  P.rows = P.rows.filter((r) => procs.some((p) => p.id === r.pid));
  const yil = Number(bugunTarihi().slice(0, 4));
  if (P.year !== yil) P.year = yil;
}

export function icPlanSatirlari(profil: Profil): PlanSatiri[] {
  const procs = profil.kys.procs;
  const rows = profil.ic.plan.rows.filter((r) => procs.some((p) => p.id === r.pid));
  for (const p of procs) if (!rows.some((r) => r.pid === p.id)) rows.push({ pid: p.id, aud: '', months: [] });
  return rows.map((r) => ({ r, p: procs.find((p) => p.id === r.pid) as Surec }));
}

const ayindaYapildi = (profil: Profil, pid: string, ym: string): boolean =>
  profil.ic.runs.some((x) => x.pid === pid && x.done && x.date.slice(0, 7) === ym);

export interface IcVadesi { o: PlanSatiri; m: string; late: boolean }

// Planda bu ay ya da önce olup yapılmamış denetimler (açık yürütmesi olan süreç sayılmaz).
export function icVadesiGelenler(profil: Profil): IcVadesi[] {
  const out: IcVadesi[] = [];
  const cy = buAy();
  for (const o of icPlanSatirlari(profil)) {
    const acik = profil.ic.runs.some((x) => x.pid === o.r.pid && !x.done);
    for (const ym of o.r.months) if (ym <= cy && !ayindaYapildi(profil, o.r.pid, ym) && !acik) out.push({ o, m: ym, late: ym < cy });
  }
  return out.sort((a, b) => (a.m < b.m ? -1 : 1));
}

// Otomatik plan: ana süreç yılda 2, diğerleri 1; aylar eşit dağılır; geçmiş aylar korunur; denetçi boşsa iç denetçi rolü atanır.
export function icOtomatikPlan(profil: Profil): void {
  icPlaniEsitle(profil);
  const rows = icPlanSatirlari(profil);
  const pencere = planAylari();
  const n = rows.length;
  const ia = profil.kys.roles['ic']?.kisi ?? '';
  const cy = buAy();
  rows.sort((a, b) => (a.p.type === 'a' ? 0 : 1) - (b.p.type === 'a' ? 0 : 1));
  rows.forEach((o, i) => {
    const k = Math.floor((i * 12) / Math.max(n, 1));
    const kalan = o.r.months.filter((ym) => ym < cy);
    const yeni = kalan.concat([pencere[k] as string]);
    if (o.p.type === 'a') yeni.push(pencere[(k + 6) % 12] as string);
    o.r.months = yeni.filter((v, j, a) => a.indexOf(v) === j).sort();
    if (!o.r.aud) o.r.aud = ia;
  });
}

// Kontrol listesi: 10 genel madde + sürece özgü en ağır 5 ISO sorusu (ana süreç 8, destek 7, yönetim 5-6-9).
export function icKontrolListesi(p: Surec | undefined): IcMaddesi[] {
  const G = p?.type === 'a' ? ['8'] : p?.type === 'd' ? ['7'] : ['5', '6', '9'];
  const Q = PROGRAMLAR.iso9001.Q.filter((x) => !x.d && G.includes(x.g)).slice().sort((a, b) => b.w - a.w).slice(0, 5);
  return ICG.map((x): IcMaddesi => ({ t: x[0], c: x[1], g: x[2], h: x[3], r: '', n: '' }))
    .concat(Q.map((x): IcMaddesi => ({ t: x.q, c: x.c, g: x.g, h: x.ev.join(' · '), r: '', n: '' })));
}

// Sürecin açık yürütmesi varsa o açılır; yoksa yeni yürütme başlar. Açılan yürütmenin kimliği döner.
export function icBaslat(profil: Profil, pid: string): string | null {
  const p = profil.kys.procs.find((x) => x.id === pid);
  if (!p) return null;
  const satir = profil.ic.plan.rows.find((r) => r.pid === pid);
  const acik = profil.ic.runs.find((x) => x.pid === pid && !x.done);
  if (acik) {
    profil.ic.cur = acik.id;
    return acik.id;
  }
  const r: IcYurutme = { id: `ic${yeniKimlik()}`, pid, pname: p.name, date: bugunTarihi(), aud: satir?.aud ?? '', done: false, audId: '', items: icKontrolListesi(p) };
  profil.ic.runs.unshift(r);
  profil.ic.cur = r.id;
  return r.id;
}

export function icSayilari(r: IcYurutme): { u: number; g: number; m: number; M: number; na: number; x: number } {
  const c = { u: 0, g: 0, m: 0, M: 0, na: 0, x: 0 };
  for (const i of r.items) {
    if (i.r) c[i.r]++;
    else c.x++;
  }
  return c;
}

// Yürütmeyi bitirir: takvime "İç denetim / ön denetim" kaydı ve bulgular, gerekiyorsa DÖF son günü.
export function icBitir(profil: Profil, r: IcYurutme): void {
  const c = icSayilari(r);
  const lv = { g: 'obs', m: 'minor', M: 'major' } as const;
  const a = yeniDenetim({ prog: 'iso9001', type: 'İç denetim / ön denetim', date: r.date, cb: r.aud ? `İç denetçi: ${r.aud}` : 'İç denetim', note: `Süreç: ${r.pname}` });
  a.status = 'done';
  a.res.items = r.items.flatMap((i) => (i.r === 'g' || i.r === 'm' || i.r === 'M' ? [{ lvl: lv[i.r], g: i.g, c: i.c, t: (i.t + (i.n ? ` — ${i.n}` : '')).slice(0, 400) }] : []));
  a.res.major = c.M;
  a.res.minor = c.m;
  a.res.obs = c.g;
  profil.audits.push(a);
  dofSonGunuEsitle(a, profil);
  r.done = true;
  r.audId = a.id;
  profil.ic.cur = '';
}

export function icRaporMetni(profil: Profil, r: IcYurutme): string {
  const c = icSayilari(r);
  return [
    'İÇ DENETİM RAPORU', profil.profile.firma ? `Firma: ${profil.profile.firma}` : '', `Süreç: ${r.pname}`, `Tarih: ${tarihMetni(r.date)}`, `Denetçi: ${r.aud || '—'}`,
    `Sonuç: ${String(c.u)} uygun, ${String(c.g)} gözlem, ${String(c.m)} minör, ${String(c.M)} majör, ${String(c.na)} N/A`, '',
  ].concat(r.items.map((i, k) => `${String(k + 1)}. [${i.r ? ICR[i.r] : '—'}] ${i.c} · ${i.t}${i.n ? `\n   Not: ${i.n}` : ''}`))
    .filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
}

export const sahaSon = (profil: Profil, tpl: string): SahaTuru | null => profil.ic.saha.find((x) => x.tpl === tpl && x.done) ?? null;

export function sahaVadesi(profil: Profil, t: SahaSablonu): { next: string; dd: number } | null {
  const l = sahaSon(profil, t.id);
  if (!l) return null;
  const n = gunEkle(l.date, t.f);
  return { next: n, dd: gunFarki(n) };
}

export function sahaAcikUygunsuzluklar(profil: Profil): { n: number; L: { run: SahaTuru; k: number }[] } {
  const L: { run: SahaTuru; k: number }[] = [];
  for (const x of profil.ic.saha) {
    if (!x.done) continue;
    x.items.forEach((i, k) => { if (i.r === 'no' && !i.fix) L.push({ run: x, k }); });
  }
  return { n: L.length, L };
}

export const SAHA_SABLONLARI = SAHA;

// Saha turu başlatır (prototip sstart): denetçi KYS sorumlusu rolündeki kişi, açık iş "s:<kimlik>". Sekme geçişi ekran durumundadır
// (ekran.ic.tab = 'saha'). Açılan turun kimliği döner; şablon yoksa null.
export function sahaBaslat(profil: Profil, sablon: string): string | null {
  const t0 = SAHA.find((s) => s.id === sablon);
  if (!t0) return null;
  const sr: SahaTuru = {
    id: `s${yeniKimlik()}`, tpl: t0.id, date: bugunTarihi(), by: profil.kys.roles['kys']?.kisi ?? '', done: false,
    items: t0.items.map(() => ({ r: '', n: '', fix: false })),
  };
  profil.ic.saha.unshift(sr);
  profil.ic.cur = `s:${sr.id}`;
  return sr.id;
}
