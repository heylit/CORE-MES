import type { DonemOlcegi } from '../../gorunumler.ts';
import type { PlanlamaCalismasi, PlanVerisi } from '../../tipler.ts';
import { haritaGruplari, siparisRengi, type Aralik } from '../harita/kurallar.ts';
import { acikSaat, AY_AD, saatOku, saatYaz, type Derleme, type OkunanPlan, type PlanIslemi } from '../kurallar.ts';

// Çizelge hesapları (zq-olcek olYuzey, s-gun sGunYuzey ve gyErken, w-v20 v20KilitSerit, zp-klavye kbTez, c-masa tezgahAd).

// Kapasitesiz en erken bitiş (c-masa: p.lbC): çözücünün kayda yazdığı alt sınır; yoksa ya da sonlu değilse null.
export function kapasitesizEnErken(c: PlanlamaCalismasi, j: string): number | null {
  const l = c.plan?.lbC; const x = l && typeof l === 'object' ? (l as Record<string, unknown>)[j] : null;
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

// Tezgâh satırlarının sırası (o-tahta tbYerlesim kart): düz nesne, sayı biçimli kimlikler önce küçükten büyüğe, ötekiler grup sırasıyla.
export function tezgahSirasi(D: PlanVerisi, p: OkunanPlan, cx: Derleme): string[] {
  const kart: Record<string, true> = {};
  for (const g of haritaGruplari(D, p, cx)) for (const m of g.l) kart[m.id] = true;
  return Object.keys(kart);
}
export const tezEtiketi = (m: string): string => (m.startsWith('@') ? `fason ${m.slice(1)}` : m);
export function tezgahAdi(D: PlanVerisi, m: string): string {
  if (m.startsWith('@')) { const f = (D.fasoncular ?? []).find((x) => x.id === m.slice(1)); return `Fason: ${f?.ad ?? m.slice(1)}`; }
  return `${m} · ${D.tezgahlar.find((x) => x.id === m)?.ad ?? ''}`;
}
export const gunAdi = (D: PlanVerisi, t: number): string => saatYaz(D, t).slice(0, 9);
export const isiSeviyesi = (o: number | null): number => (o == null ? 0 : o < 0.05 ? 0 : o < 0.35 ? 1 : o < 0.65 ? 2 : o < 0.9 ? 3 : 4);
const renk = (D: PlanVerisi, j: string) => `var(--tc-pym-is-${siparisRengi(D, j)})`;
const yerlesen = (p: OkunanPlan) => Object.values(p.ops).filter((r) => Number.isFinite(r.C) && Number.isFinite(r.S));
const kilitli = (c: PlanlamaCalismasi, id: string): { gun: number | null } | null => {
  const l = c.locks[id]; if (!l || typeof l !== 'object') return null;
  const g = (l as Record<string, unknown>).gun; return { gun: typeof g === 'number' ? g : null };
};

// --- hafta, ay, yıl: tezgâh satırlarında işler gün ızgarasında; yılda hafta başına doluluk ısısı ---
export interface OlcekBasligi { t: number; x: number; w: number; ad: string; bugun: boolean; baslik: string }
export interface OlcekIsi { x: number; w: number; d: 1 | 2 | 3; o: number; baslik: string }
export interface OlcekIsi2 { id: string; x: number; w: number; renk: string; etiket: string | null; baslik: string; sabit: boolean }
export interface OlcekSatiri { m: string; etiket: string; isi: OlcekIsi[]; isler: OlcekIsi2[] }
export interface OlcekCizelgesi { basliklar: OlcekBasligi[]; satirlar: OlcekSatiri[]; simdi: number | null; ufuk: number | null }

export function olcekCizelgesi(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme, olcek: Exclude<DonemOlcegi, 'gun'>, r: Aralik, now: number): OlcekCizelgesi {
  const D = c.D; const { a, b } = r; const L = b - a; const gun = L / 24;
  const yil = olcek === 'yil'; const kova = yil ? 7 : 1; const nk = Math.ceil(gun / kova); const kw = (kova * 24) / L;
  const ops = yerlesen(p); const son = Math.max(now, ...ops.map((x) => x.C));
  const basliklar = Array.from({ length: nk }, (_, i): OlcekBasligi => {
    const t = a + i * kova * 24; const g = gunAdi(D, t);
    const ad = yil ? (Number(g.slice(0, 2)) <= 7 ? AY_AD[Number(g.slice(3, 5)) - 1] ?? '' : '') : olcek === 'ay' ? g.slice(0, 2) : g;
    return { t, x: (t - a) / L, w: kw, ad, bugun: t <= now && now < t + kova * 24, baslik: `${g}${yil ? ' haftası' : ''}: saatlik aç` };
  });
  const satirlar = tezgahSirasi(D, p, cx).map((m): OlcekSatiri => {
    const M = cx.M[m]; const l = ops.filter((x) => x.m === m && x.C > a && x.S < b);
    const isi: OlcekIsi[] = [];
    if (yil || olcek === 'ay') {
      for (let i = 0; i < nk; i++) {
        const x = a + i * kova * 24, y = x + kova * 24; if (x > son) break;
        const acik = M ? M.rw.reduce((s, [u, v]) => s + Math.max(0, Math.min(v, y) - Math.max(u, x)), 0) : 0;
        const dolu = l.reduce((s, q) => s + (q.C > x && q.S < y ? (M ? acikSaat(M.rw, Math.max(x, q.S), Math.min(y, q.C)) : Math.min(y, q.C) - Math.max(x, q.S)) : 0), 0);
        const o = acik ? dolu / acik : null;
        if (o != null && dolu > 0.05) isi.push({ x: (x - a) / L, w: kw, d: o > 0.97 ? 3 : o > 0.75 ? 2 : 1, o: Math.min(1, o), baslik: `${tezEtiketi(m)} · ${gunAdi(D, x)}${yil ? ' haftası' : ''}: %${Math.round(o * 100)} dolu` });
      }
    }
    const isler = yil ? [] : l.sort((x, y) => x.S - y.S).map((q): OlcekIsi2 => {
      const s = Math.max(a, q.S), e = Math.min(b, q.C); const w = (e - s) / L;
      return { id: q.id, x: (s - a) / L, w, renk: renk(D, q.job), etiket: olcek === 'hafta' && w > 0.035 ? q.job : null, baslik: `${q.id} · ${saatYaz(D, q.S)} → ${saatYaz(D, q.C)}`, sabit: !!kilitli(c, q.id) };
    });
    return { m, etiket: tezEtiketi(m), isi, isler };
  });
  return { basliklar, satirlar, simdi: now > a && now < b ? (now - a) / L : null, ufuk: son > a && son < b ? (son - a) / L : null };
}

// --- saatlik gün ---
// İşin en erken başlayabileceği an ve nedeni (gyErken): serbest bırakma, önceki adım, fasondan dönüş. Malzeme yeni derlemede yok.
export interface ErkenBaslama { t: number; ad: string }
export function erkenBaslama(p: OkunanPlan, cx: Derleme, id: string): ErkenBaslama | null {
  const o = cx.byId[id]; if (!o) return null;
  let t = cx.now, ad = 'Hemen başlayabilir';
  const j = cx.jobs[o.job]; if (j?.rel != null && j.rel > t) { t = j.rel; ad = 'Sipariş serbest bırakılır'; }
  for (const [pid, ty] of o.pr) {
    const q = p.ops[pid]; if (!q || !Number.isFinite(q.C)) continue;
    const x = (ty === 'o' && !q.fas ? q.lot1 ?? q.C : q.C) + (q.fas ? 0 : cx.tasima);
    if (x > t) { t = x; ad = q.fas ? `Fasondan döner (${q.m.slice(1)})` : `Önceki adım ${ty === 'o' ? 'ilk partiyi verir' : 'biter'} (${pid.split('.').pop() ?? pid})`; }
  }
  return { t, ad };
}

export interface GunAraligi { x: number; w: number }
export interface GunBlogu {
  id: string; job: string; ad: string; x: number; w: number; renk: string; baslik: string;
  sol: boolean; sag: boolean; secili: boolean; soluk: boolean; gec: boolean; sabit: boolean; dondu: boolean;
}
export interface GunSatiri {
  m: string; etiket: string; ad: string; oran: number | null; isi: number; uygun: boolean | null;
  kapali: GunAraligi[]; ariza: GunAraligi[]; bloklar: GunBlogu[]; erken: (GunAraligi & { ad: string; t: number; cizgi: number | null }) | null;
}
export interface GunCizelgesi {
  a: number; gunler: { g: number; ad: string; dondu: boolean }[]; satirlar: GunSatiri[]; simdi: number | null;
  cit: number | null; citBant: GunAraligi | null; erken: ErkenBaslama | null;
  kilit: { donukBu: number; donukTum: number; elle: number; cit: number | null };
}
const DONDURMA_SAATI: Record<string, number> = { elle: 72, dengeli: 24, otomatik: 0 };

export function gunCizelgesi(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme, g: number, secId: string | null, secJob: string | null): GunCizelgesi {
  const D = c.D; const now = cx.now; const d0 = Math.floor(now / 24) * 24; const a = d0 + g * 24, b = a + 24;
  const x = (t: number) => (t - a) / 24; const w = (s: number, e: number) => (e - s) / 24;
  const sec = secId ? p.ops[secId] ?? null : null; const secO = sec ? cx.byId[sec.id] : undefined;
  const uygun = new Set(secO ? secO.c : []); const yanan = !!sec;
  const erken = sec ? erkenBaslama(p, cx, sec.id) : null; const sJ = sec ? sec.job : secJob;
  const durus = c.down.flatMap((d) => (typeof d.m === 'string' && typeof d.from === 'number' && typeof d.to === 'number' ? [{ m: d.m, from: d.from, to: d.to }] : []));
  const ops = yerlesen(p);
  const satirlar = tezgahSirasi(D, p, cx).map((m): GunSatiri => {
    const M = cx.M[m];
    const kapali: GunAraligi[] = [];
    if (M) {
      let t = a;
      for (const [u, v] of M.rw) { if (v <= a) continue; if (u >= b) break; if (u > t) kapali.push({ x: x(t), w: w(t, Math.min(u, b)) }); t = Math.max(t, v); }
      if (t < b) kapali.push({ x: x(t), w: w(t, b) });
    }
    const ariza = durus.filter((d) => d.m === m && d.to > a && d.from < b).map((d) => ({ x: x(Math.max(a, d.from)), w: w(Math.max(a, d.from), Math.min(b, d.to)) }));
    let dolu = 0;
    const bloklar = ops.filter((r) => r.m === m && r.C > a && r.S < b).sort((u, v) => u.S - v.S).map((r: PlanIslemi): GunBlogu => {
      const s = Math.max(a, r.S), e = Math.min(b, r.C); dolu += M ? acikSaat(M.rw, s, e) : e - s;
      const o = cx.byId[r.id]; const kl = kilitli(c, r.id);
      return {
        id: r.id, job: r.job, ad: o?.ad ?? '', x: x(s), w: w(s, e), renk: renk(D, r.job),
        baslik: `${r.id} · ${o?.ad ?? ''} · ${saatYaz(D, r.S)} → ${saatYaz(D, r.C)}${kl ? (kl.gun != null ? ' · dondurulmuş gün' : ' · sabit') : ''}`,
        sol: r.S < a, sag: r.C > b, secili: sec?.id === r.id, soluk: !!sJ && r.job !== sJ, gec: (p.J[r.job]?.T ?? 0) > 0.05, sabit: !!kl, dondu: kl?.gun != null,
      };
    });
    const acik = M ? M.rw.reduce((s, [u, v]) => s + Math.max(0, Math.min(v, b) - Math.max(u, a)), 0) : 24;
    const oran = acik ? dolu / acik : null; const uy = yanan ? uygun.has(m) : null;
    const er = uy && erken && erken.t > a ? { x: 0, w: w(a, Math.min(b, erken.t)), ad: erken.ad, t: erken.t, cizgi: erken.t < b ? x(erken.t) : null } : null;
    return { m, etiket: m.startsWith('@') ? m.slice(1) : m, ad: tezgahAdi(D, m), oran, isi: isiSeviyesi(oran), uygun: uy, kapali, ariza, bloklar, erken: er };
  });
  const L = Object.values(c.locks).map((l) => (l && typeof l === 'object' ? (l as Record<string, unknown>).gun : undefined));
  const gNo = Math.floor(now / 24) + g;
  const donukGunler = new Set(L.filter((v): v is number => typeof v === 'number'));
  const citU = DONDURMA_SAATI[String((c.w as Record<string, unknown>).denge ?? 'dengeli')] ?? 24; const cit = now + citU;
  return {
    a, gunler: Array.from({ length: 7 }, (_, i) => ({ g: i, ad: gunAdi(D, d0 + i * 24), dondu: donukGunler.has(Math.floor(now / 24) + i) })),
    satirlar, simdi: now > a && now < b ? x(now) : null,
    cit: citU && cit > a && cit < b ? x(cit) : null, citBant: citU && now < b && cit > a ? { x: x(Math.max(a, now)), w: w(Math.max(a, now), Math.min(b, cit)) } : null,
    erken, kilit: { donukBu: L.filter((v) => v === gNo).length, donukTum: L.filter((v) => typeof v === 'number').length, elle: L.filter((v) => typeof v !== 'number').length, cit: citU ? cit : null },
  };
}

// --- Siparişler merceği: bütün planın tezgâh zaman çizelgesi (c-masa gantt, zz5-olcek-her-yer ölçeği) ---
// Ölçek saat başına piksel olarak eskidekiyle aynıdır; ekran konumu saat cinsinden alır, piksel çarpanı stildedir. Sayılar yalnız etiket kararları içindir.
export const ZAMAN_PX: Record<DonemOlcegi, number> = { gun: 40, hafta: 10, ay: 2.5, yil: 0.6 };
const UFUK_GUN = 63;
export interface ZamanBasligi { x: number; w: number; ad: string; tatil: boolean; saatler: { x: number; ad: string }[] }
export interface ZamanIsi { id: string; job: string; x: number; w: number; renk: string; ayar: number; gec: boolean; soluk: boolean; kilit: boolean; etiket: string | null; baslik: string }
export interface ZamanSatiri { m: string; kod: string; ad: string; u: number | null; kapali: { x: number; w: number }[]; ariza: { x: number; w: number; baslik: string }[]; isler: ZamanIsi[] }
export interface ZamanGrubu { g: string; n: number; u: number | null; satirlar: ZamanSatiri[] }
export interface ZamanCizelgesi { px: number; saat: number; basliklar: ZamanBasligi[]; cizgiler: number[]; gruplar: ZamanGrubu[]; fason: ZamanSatiri[]; termin: number | null }

export function zamanCizelgesi(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme, olcek: DonemOlcegi, secJob: string | null): ZamanCizelgesi {
  const D = c.D; const px = ZAMAN_PX[olcek];
  const ops = Object.values(p.ops);
  const Cmax = Math.max(p.ozet.Cmax ?? 24, ...ops.map((r) => r.C).filter(Number.isFinite));
  const gunN = Math.min(UFUK_GUN, Math.ceil(Cmax / 24) + 1); const son = gunN * 24;
  const gec = new Set(Object.entries(p.J).filter(([, x]) => x.T == null || x.T > 0.01).map(([j]) => j));
  const tatil = new Set((D.tatiller ?? []).map((s) => Math.floor((saatOku(D, s) ?? Number.NaN) / 24)));
  const durus = c.down.flatMap((d) => (typeof d.m === 'string' && typeof d.from === 'number' && typeof d.to === 'number' ? [{ m: d.m, from: d.from, to: d.to }] : []));
  const byM: Record<string, PlanIslemi[]> = {};
  for (const r of ops) (byM[r.m] ??= []).push(r);
  const kisa = (id: string) => id.slice(id.lastIndexOf('.') + 1);
  const isler = (m: string): ZamanIsi[] => (byM[m] ?? []).filter((r) => Number.isFinite(r.C)).map((r) => {
    const w = Math.max(3 / px, r.C - r.S); const kilit = !!kilitli(c, r.id);
    return {
      id: r.id, job: r.job, x: r.S, w: r.C - r.S, renk: renk(D, r.job), ayar: r.C > r.S ? Math.max(0, Math.min(1, ((r.Su ?? r.S) - r.S) / (r.C - r.S))) : 0,
      gec: gec.has(r.job), soluk: !!secJob && r.job !== secJob, kilit, etiket: w * px > 56 ? `${r.job}·${kisa(r.id)}` : null,
      baslik: `${r.id} · ${saatYaz(D, r.S)} → ${saatYaz(D, r.C)}${gec.has(r.job) ? ' · gecikiyor' : ''}${kilit ? ' · kilitli' : ''}`,
    };
  });
  const satir = (m: string, ad: string, alt: boolean): ZamanSatiri => {
    const u = p.util[m]; const M = cx.M[m];
    const kapali: { x: number; w: number }[] = [];
    if (alt && M) {
      let t = 0;
      for (const [a, b] of M.rw) { if (a > son) break; if (a > t) kapali.push({ x: t, w: Math.min(a, son) - t }); t = Math.max(t, b); }
      if (t < son) kapali.push({ x: t, w: son - t });
    }
    const ariza = alt ? durus.filter((d) => d.m === m).map((d) => ({ x: d.from, w: d.to - d.from, baslik: `Arıza/bakım ${saatYaz(D, d.from)} → ${saatYaz(D, d.to)}` })) : [];
    return { m, kod: m.startsWith('@') ? m.slice(1) : m, ad, u: u ? u.u : null, kapali, ariza, isler: isler(m) };
  };
  // Düz nesne: grup sırası eski sayfadaki gibi anahtar sırasıdır (sayı biçimli grup adları önce, küçükten büyüğe).
  const tg: Record<string, { id: string; ad: string }[]> = {};
  for (const m of D.tezgahlar) (tg[String(m.grup)] ??= []).push({ id: m.id, ad: m.ad ?? '' });
  const gruplar = Object.keys(tg).map((g): ZamanGrubu => {
    const l = tg[g] ?? []; let b = 0, o = 0, n = 0;
    for (const m of l) { const u = p.util[m.id]; if (u) { b += u.busy; o += u.open; n++; } }
    return { g, n: l.length, u: n ? (o ? b / o : 0) : null, satirlar: l.map((m) => satir(m.id, m.ad, true)) };
  });
  const fason = (D.fasoncular ?? []).filter((f) => ops.some((r) => r.m === `@${f.id}`) || Object.values(cx.byId).some((o) => o.c.includes(`@${f.id}`)))
    .map((f) => satir(`@${f.id}`, f.ad ?? '', false));
  let basliklar: ZamanBasligi[]; let cizgiler: number[];
  if (px >= 1) {
    basliklar = Array.from({ length: gunN }, (_, d) => ({
      x: d * 24, w: 24, ad: `${px >= 4 ? gunAdi(D, d * 24) : gunAdi(D, d * 24).slice(0, 2)}${tatil.has(d) ? ' · tatil' : ''}`, tatil: tatil.has(d),
      saatler: px >= 20 ? [6, 12, 18].map((h) => ({ x: h, ad: String(h).padStart(2, '0') })) : [],
    }));
    cizgiler = Array.from({ length: gunN }, (_, d) => d * 24);
  } else {
    // Yılda günlük başlık okunmaz: ay adları ve yalnız hafta başı çizgileri.
    const ayBas: [number, number][] = []; let ay0: string | null = null;
    for (let d = 0; d <= gunN; d++) { const ay = gunAdi(D, d * 24).slice(3, 5); if (ay !== ay0) { ayBas.push([d, Number(ay)]); ay0 = ay; } }
    basliklar = ayBas.flatMap(([d, ay], i) => { const s = i + 1 < ayBas.length ? ayBas[i + 1]?.[0] ?? gunN : gunN; return s > d ? [{ x: d * 24, w: (s - d) * 24, ad: AY_AD[ay - 1] ?? '', tatil: false, saatler: [] }] : []; });
    cizgiler = Array.from({ length: gunN }, (_, d) => d).filter((d) => gunAdi(D, d * 24).slice(6, 9).startsWith('Pzt')).map((d) => d * 24);
  }
  const s = secJob ? D.siparisler.find((z) => z.id === secJob) : undefined;
  const termin = s ? saatOku(D, s.termin) : null;
  return { px, saat: son, basliklar, cizgiler, gruplar, fason, termin };
}

// --- ayrıntı (c-masa opDenetci, o-tahta tbTezPaneli) ---
// Uygun tezgâhlar ve süreleri, motorun derlemesiyle aynı hesap (engine.betik: arıza payı, verim, adımın adedi); fasonda süre yoktur.
// Motorun öğrendiği süre sapması istemcide yoktur; süre onsuz hesaplanır.
export interface Aday { m: string; sure: number | null }
export function adaylar(c: PlanlamaCalismasi, cx: Derleme, id: string): Aday[] {
  const o = cx.byId[id]; if (!o) return [];
  const D = cx.g.D; const j = D.siparisler.find((s) => s.id === o.job);
  const k = id.slice(o.job.length + 1); const adim = D.urunler.find((u) => u.id === j?.urun)?.rota?.find((x) => String(x.k) === k);
  const opAdet = D.opAdet && typeof D.opAdet === 'object' ? (D.opAdet as Record<string, unknown>)[id] : undefined;
  const adet = opAdet != null && Number.isFinite(Number(opAdet)) ? Number(opAdet) : Number(j?.adet) || 0;
  const acilPay = Number(c.param.acilPay) || 0;
  return o.c.map((m): Aday => {
    if (m.startsWith('@')) return { m, sure: null };
    const t = adim?.tezgahlar?.find((x) => x.id === m); const M = D.tezgahlar.find((x) => x.id === m);
    const arizaGun = Number(M?.arizaGun) || 0;
    const pay = c.param.tampon ? Math.min(0.35, (arizaGun > 0 ? (Number(M?.onarimSaat) || 0) / (arizaGun * 24) : 0) + acilPay) : 0;
    const cyc = (Number(t?.cevrim) || 0) / 60 / (1 - pay); const verim = Number(M?.verim) || 1;
    return { m, sure: (Number(t?.ayar) || 0) / 60 + (adet * cyc) / verim };
  });
}
// Tezgâhın planlı işleri başlangıç sırasıyla.
export const tezgahKuyrugu = (p: OkunanPlan, m: string): PlanIslemi[] => yerlesen(p).filter((r) => r.m === m).sort((a, b) => a.S - b.S);
