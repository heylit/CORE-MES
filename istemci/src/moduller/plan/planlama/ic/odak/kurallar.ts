import { haritaGruplari } from '../../motor/harita/kurallar.ts';
import { saatYaz, type Derleme, type OkunanPlan, type Pencere, type PlanIslemi } from '../../motor/kurallar.ts';
import { beklemeler, type OzetVerisi } from '../../motor/ozet/veri.ts';
import type { PlanlamaCalismasi, PlanVerisi } from '../../tipler.ts';

// Odak tahtası (zg-odak.betik): tahtanın bir bölümüne (tezgâh grubu) ya da tek tezgâha girip orada çalışmak. Bölümde her tezgâh bir şerittir,
// tezgâhta her gün bir şerittir. Taşıma, sıra ve ek mesai motor ister (357 b); hesaplar kayıttaki plandandır.

export interface OdakYeri { g: string; m: string | null }
export const odakAdi = (m: string): string => (m.startsWith('@') ? `${m.slice(1)} (fason)` : m);
export const tezgahGrubu = (D: PlanVerisi, m: string): string => (m.startsWith('@') ? 'fason' : D.tezgahlar.find((t) => t.id === m)?.grup ?? 'diger');

export function odakTezgahlari(c: PlanlamaCalismasi, p: OkunanPlan, g: string): string[] {
  if (g === 'fason') return [...new Set(Object.values(p.ops).map((r) => r.m).filter((m) => m.startsWith('@')))].sort();
  return c.D.tezgahlar.filter((t) => (t.grup ?? 'diger') === g).map((t) => t.id);
}
// Bölümler haritadaki sırayla; tezgâhı olmayan grup düşer, haritada olmayan tezgâh grubu sona eklenir.
export function odakGruplari(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme): string[] {
  const l = haritaGruplari(c.D, p, cx).map((x) => x.g).filter((g) => odakTezgahlari(c, p, g).length);
  for (const t of c.D.tezgahlar) { const g = t.grup ?? 'diger'; if (!l.includes(g)) l.push(g); }
  return l;
}

// Görünen pencere: bugünden `kay` gün sonra başlayan `gun` gün; varsayılan tezgâhta 7 (telefonda 3), bölümde 3 (telefonda 1).
export const GUN_SECENEKLERI = { tez: [1, 3, 7, 14], grup: [1, 3, 7] } as const;
export const varsayilanGun = (tezgah: boolean, dar: boolean): number => (tezgah ? (dar ? 3 : 7) : (dar ? 1 : 3));
export function pencere(now: number, gun: number, kay: number): { gun: number; a: number; b: number } {
  const a = Math.floor(now / 24) * 24 + kay * 24;
  return { gun, a, b: a + gun * 24 };
}
// Geri ve ileri pencerenin yarısı kadar kayar, en az bir gün (od-kay).
export const kaydirma = (gun: number): number => Math.max(1, Math.round(gun / 2));

// Tezgâhın açık pencereleri; fason ve takvimsiz tezgâh her zaman açıktır.
export function acikPencereler(cx: Derleme, m: string, a: number, b: number): Pencere[] {
  const W = cx.M[m]?.rw; if (!W) return [[a, b]];
  const l: Pencere[] = [];
  for (const [x, y] of W) { if (y <= a) continue; if (x >= b) break; l.push([Math.max(a, x), Math.min(b, y)]); }
  return l;
}
export function kapaliPencereler(cx: Derleme, m: string, a: number, b: number): Pencere[] {
  const l: Pencere[] = []; let son = a;
  for (const [x, y] of acikPencereler(cx, m, a, b)) { if (x > son + 0.01) l.push([son, x]); son = Math.max(son, y); }
  if (son < b - 0.01) l.push([son, b]);
  return l;
}
// Açık saatlerin dolu payı; açık saat yoksa null (kapalı).
export function odakDolulugu(cx: Derleme, p: OkunanPlan, m: string, a: number, b: number): number | null {
  const acik = acikPencereler(cx, m, a, b); const top = acik.reduce((t, [x, y]) => t + y - x, 0); if (top < 0.01) return null;
  let dolu = 0;
  for (const r of Object.values(p.ops)) if (r.m === m && Number.isFinite(r.C)) for (const [x, y] of acik) dolu += Math.max(0, Math.min(y, r.C) - Math.max(x, r.S));
  return dolu / top;
}
const gec = (p: OkunanPlan, j: string): boolean => (p.J[j]?.T ?? 0) > 0.05;

// Şeridin içi, oranlar pencereye göre (0-1): kapalı saatler, arıza, gün çizgileri, şimdi ve işler.
export interface SeritIsi { id: string; job: string; x: number; w: number; ayar: number; gec: boolean; durum: 'bitti' | 'simdi' | null; sabit: boolean; baslik: string }
export interface Serit { kapali: [number, number][]; ariza: [number, number][]; gunc: number[]; simdi: number | null; isler: SeritIsi[] }
export function serit(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme, m: string, a: number, b: number, now: number): Serit {
  const D = c.D; const L = b - a;
  const x = (t: number) => (t - a) / L; const w = (s: number, e: number) => Math.max(0.0015, (Math.min(b, e) - Math.max(a, s)) / L);
  const kapali = kapaliPencereler(cx, m, a, b).map(([s, e]): [number, number] => [x(s), w(s, e)]);
  const ariza: [number, number][] = [];
  for (const d of c.down) {
    const s = typeof d.from === 'number' ? d.from : null, e = typeof d.to === 'number' ? d.to : null;
    if (d.m === m && s !== null && e !== null && e > a && s < b) ariza.push([x(Math.max(a, s)), w(s, e)]);
  }
  const gunc: number[] = []; for (let t = Math.ceil(a / 24) * 24; t < b; t += 24) if (t > a) gunc.push(x(t));
  const urun = new Map(D.siparisler.map((s) => [s.id, D.urunler.find((u) => u.id === s.urun)?.ad ?? s.urun ?? '']));
  const isler = Object.values(p.ops).filter((r) => r.m === m && Number.isFinite(r.C) && r.C > a && r.S < b).map((r): SeritIsi => {
    const g = gec(p, r.job);
    return {
      id: r.id, job: r.job, x: x(Math.max(a, r.S)), w: w(r.S, r.C), ayar: r.C > r.S ? Math.min(1, r.su / (r.C - r.S)) : 0, gec: g,
      durum: r.C <= now ? 'bitti' : r.S <= now ? 'simdi' : null, sabit: !!c.locks[r.id],
      baslik: `${r.id} · ${urun.get(r.job) ?? ''}\n${saatYaz(D, r.S)} → ${saatYaz(D, r.C)} · ayar ${saatKisa(r.su)}, işleme ${saatKisa(r.run)}${g ? ' · sipariş geç' : ''}`,
    };
  });
  return { kapali, ariza, gunc, simdi: now > a && now < b ? x(now) : null, isler };
}
const saatKisa = (h: number): string => `${(Math.round(h * 10) / 10).toLocaleString('tr-TR')} sa`;

// Zaman ekseni: gün adları; kısa pencerede saatler (tek gün şeridinde üç saatte bir).
export interface EksenEtiketi { x: number; e: string; tur: 'gun' | 'saat' }
export function eksen(D: PlanVerisi, a: number, b: number, tekGun: boolean): EksenEtiketi[] {
  const L = b - a; const gun = L / 24; const adim = tekGun || gun <= 1 ? 3 : gun <= 3 ? 6 : 24; const l: EksenEtiketi[] = [];
  if (!tekGun) for (let t = Math.ceil(a / 24) * 24; t < b; t += 24) l.push({ x: (t - a) / L, e: saatYaz(D, t + 1).slice(0, 9), tur: 'gun' });
  if (adim < 24) for (let t = a; t < b; t += adim) l.push({ x: (t - a) / L, e: `${String(Math.round(((t % 24) + 24) % 24)).padStart(2, '0')}:00`, tur: 'saat' });
  return l;
}

// Bölümde tezgâh sırası bekleyen adımlar: geç siparişler önde, sonra en uzun bekleyen.
export interface BekleyenAdim { j: string; m: string; bek: number; gec: boolean; T: number }
export function bekleyenler(v: OzetVerisi, g: string): { l: BekleyenAdim[]; top: number } {
  const l: BekleyenAdim[] = [];
  for (const s of v.sip) for (const a of s.adim) if (a.g === g && a.bek > 0.5) l.push({ j: s.id, m: a.m, bek: a.bek, gec: s.gec, T: s.T });
  l.sort((x, y) => Number(y.gec) - Number(x.gec) || y.bek - x.bek);
  return { l, top: l.reduce((t, x) => t + x.bek, 0) };
}
export function kuyruk(p: OkunanPlan, m: string, now: number): PlanIslemi[] {
  return Object.values(p.ops).filter((r) => r.m === m && Number.isFinite(r.C) && r.C > now).sort((a, b) => a.S - b.S);
}

// Nereden açılırsa açılsın en anlamlı yer (odOtomatik): seçili işin tezgâhı, seçili tezgâh, seçili siparişin en çok beklediği bölüm,
// yoksa en çok bekleten bölüm (fason dışında).
export function otomatikOdak(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme, v: OzetVerisi | null, sec: { adim: string | null; tezgah: string | null; siparis: string | null }): OdakYeri {
  const tez = (m: string): OdakYeri => ({ g: tezgahGrubu(c.D, m), m });
  const r = sec.adim ? p.ops[sec.adim] : undefined;
  if (r) return tez(r.m);
  if (sec.tezgah) return tez(sec.tezgah);
  const ilk = odakGruplari(c, p, cx)[0] ?? 'diger';
  if (!v) return { g: ilk, m: null };
  if (sec.siparis) { const s = v.sip.find((x) => x.id === sec.siparis); const a = s ? [...s.adim].sort((x, y) => y.bek - x.bek)[0] : undefined; if (a) return { g: a.g, m: null }; }
  const b = beklemeler(v).filter((x) => x.id !== 'fason').sort((x, y) => y.bekG - x.bekG || y.bek - x.bek)[0];
  return { g: b ? b.id : ilk, m: null };
}
