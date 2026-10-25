import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import type { DonemOlcegi } from '../../gorunumler.ts';
import type { PlanlamaCalismasi, PlanVerisi } from '../../tipler.ts';
import { haritaGruplari, siparisRengi, type Aralik } from '../harita/kurallar.ts';
import { acikSaat, AY_AD, hm, nedenMetni, saatOku, saatYaz, saatYazi, sayiYaz, tabanMs, UFUK_GUN, type Derleme, type OkunanPlan, type PlanIslemi } from '../kurallar.ts';

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
  sol: boolean; sag: boolean; secili: boolean; soluk: boolean; gec: boolean; risk: boolean; sabit: boolean; dondu: boolean;
}
// Gün katmanında iş bloğunun ipucu (v-yardim isIpucu): iş, tezgâh ve saat, neden burada, sabitlik, siparişin durumu.
export interface IsIpucu { baslik: string; satir: string; neden: string; kilit: string | null; durum: { ton: 'hata' | 'uyari' | 'tamam'; metin: string } }
const gecMetin = (h: number | null): string => (h == null || !Number.isFinite(h) ? 'belirsiz süre' : h >= 24 ? `${sayiYaz(h / 24, 1)} gün` : `${sayiYaz(Math.max(h, 0.1), 1)} saat`);
export function isIpucu(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme, id: string): IsIpucu | null {
  const r = p.ops[id]; if (!r) return null;
  const D = c.D; const J = p.J[r.job]; const kl = kilitli(c, id);
  const durum: IsIpucu['durum'] = (J?.T ?? 0) > 0.05 ? { ton: 'hata', metin: `Sipariş ${gecMetin(J?.T ?? null)} geç` }
    : riskte(J) ? { ton: 'uyari', metin: 'Termine yetişiyor ama tampon aşıldı' } : { ton: 'tamam', metin: 'Sipariş termine yetişiyor' };
  return {
    baslik: `${r.job} · ${cx.byId[id]?.ad || id}`, satir: `${r.m.startsWith('@') ? `${r.m.slice(1)} (fason)` : r.m} · ${saatYaz(D, r.S)} → ${saatYaz(D, r.C)}`, neden: nedenMetni(r),
    kilit: kl ? (kl.gun != null ? 'Gün donduruldu.' : 'Elle sabitlendi.') : null, durum,
  };
}
// Gecikmiyor ama tamponlu termini aşmış sipariş risk altındadır (s-gun gyRisk).
export const riskte = (J: OkunanPlan['J'][string] | undefined): boolean => !!J && J.dueB != null && J.C != null && J.C > J.dueB + 0.05 && !((J.T ?? 0) > 0.05);
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
        sol: r.S < a, sag: r.C > b, secili: sec?.id === r.id, soluk: !!sJ && r.job !== sJ, gec: (p.J[r.job]?.T ?? 0) > 0.05, risk: riskte(p.J[r.job]), sabit: !!kl, dondu: kl?.gun != null,
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
export interface ZamanBasligi { x: number; w: number; ad: string; tatil: boolean; saatler: { x: number; ad: string }[] }
export interface ZamanIsi { id: string; job: string; x: number; w: number; renk: string; ayar: number; gec: boolean; soluk: boolean; kilit: boolean; etiket: string | null; baslik: string }
export interface ZamanSatiri { m: string; kod: string; ad: string; u: number | null; kapali: { x: number; w: number }[]; ariza: { x: number; w: number; baslik: string }[]; isler: ZamanIsi[] }
export interface ZamanGrubu { g: string; n: number; u: number | null; satirlar: ZamanSatiri[] }
export interface ZamanCizelgesi { px: number; saat: number; basliklar: ZamanBasligi[]; cizgiler: number[]; gruplar: ZamanGrubu[]; fason: ZamanSatiri[]; termin: number | null; terminYazi: string | null }

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
  return { px, saat: son, basliklar, cizgiler, gruplar, fason, termin, terminYazi: s?.termin ?? null };
}

// Adımın adedi: adım başına girilen adet (opAdet) yoksa siparişin adedi.
function adimAdedi(D: PlanVerisi, id: string, siparis: number): number {
  const x = D.opAdet && typeof D.opAdet === 'object' ? (D.opAdet as Record<string, unknown>)[id] : undefined;
  return x != null && Number.isFinite(Number(x)) ? Number(x) : siparis;
}

// --- ayrıntı (c-masa opDenetci, o-tahta tbTezPaneli) ---
// Uygun tezgâhlar ve süreleri, motorun derlemesiyle aynı hesap (engine.betik: arıza payı, verim, adımın adedi, süre olayının çarpanı); fasonda süre yoktur.
export interface Aday { m: string; sure: number | null }
export function adaylar(c: PlanlamaCalismasi, cx: Derleme, id: string): Aday[] {
  return adaySureleri(c, cx, id).map((x) => ({ m: x.m, sure: x.run == null || x.su == null ? null : x.su + x.run }));
}
// Uygun tezgâhın ayarı ve işlemesi ayrı (za-merkez mzRota çipi); fason tezgâhın süresi yok.
export interface AdaySuresi { m: string; su: number | null; run: number | null }
export function adaySureleri(c: PlanlamaCalismasi, cx: Derleme, id: string): AdaySuresi[] {
  const o = cx.byId[id]; if (!o) return [];
  const D = cx.g.D; const j = D.siparisler.find((s) => s.id === o.job);
  const k = id.slice(o.job.length + 1); const adim = D.urunler.find((u) => u.id === j?.urun)?.rota?.find((x) => String(x.k) === k);
  const adet = adimAdedi(D, id, Number(j?.adet) || 0);
  const acilPay = Number(c.param.acilPay) || 0; const x = cx.g.sapma[id] || 1;
  return o.c.map((m): AdaySuresi => {
    if (m.startsWith('@')) return { m, su: null, run: null };
    const t = adim?.tezgahlar?.find((x) => x.id === m); const M = D.tezgahlar.find((x) => x.id === m);
    const arizaGun = Number(M?.arizaGun) || 0;
    const pay = c.param.tampon ? Math.min(0.35, (arizaGun > 0 ? (Number(M?.onarimSaat) || 0) / (arizaGun * 24) : 0) + acilPay) : 0;
    const cyc = ((Number(t?.cevrim) || 0) / 60) * x / (1 - pay); const verim = Number(M?.verim) || 1;
    return { m, su: (Number(t?.ayar) || 0) / 60, run: (adet * cyc) / verim };
  });
}
// Tezgâhın planlı işleri başlangıç sırasıyla.
export const tezgahKuyrugu = (p: OkunanPlan, m: string): PlanIslemi[] => yerlesen(p).filter((r) => r.m === m).sort((a, b) => a.S - b.S);

// --- Kuyruk merceği (k-gorunum sKanban): her tezgâh bir sütun, kartlar plandaki sırasıyla ---
export const KUYRUK_ARALIKLARI = [[1, 'Bugün'], [3, '3 gün'], [7, '1 hafta'], [14, '2 hafta']] as const;
export type KuyrukDurumu = 'bitti' | 'ayar' | 'calisiyor' | 'sirada';
export const KUYRUK_DURUM: Record<KuyrukDurumu, [string, 'check' | 'wrench' | 'play' | 'clock']> = {
  bitti: ['Bitti', 'check'], ayar: ['Ayarda', 'wrench'], calisiyor: ['Çalışıyor', 'play'], sirada: ['Sırada', 'clock'],
};
export interface KuyrukKarti {
  id: string; job: string; k: string; ad: string; adet: number; durum: KuyrukDurumu; zaman: string; gec: number | null; kilit: boolean; renk: string; alt: string[];
}
export interface KuyrukSutunu { m: string; ad: string; n: number; dolu: number; isi: number; kartlar: KuyrukKarti[]; fazla: number; sonra: number }
const KUYRUK_KART = 40;
// Bitiş başlangıçla aynı gündeyse yalnız saati yazılır ("Cmt 09:59 → 10:38"). Eski sayfa saatin yalnız dakikasını yazıyordu (":38", SORU-P1c3 1).
export function kuyrukZamani(D: PlanVerisi, S: number, C: number): string {
  const ayni = C - S < 24 && Math.floor(C / 24) === Math.floor(S / 24);
  return `${saatYaz(D, S).slice(6)} → ${saatYaz(D, C).slice(ayni ? 10 : 6)}`;
}
export function kuyruk(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme, gun: number): KuyrukSutunu[] {
  const D = c.D; const now = cx.now; const ufuk = now + gun * 24;
  return D.tezgahlar.map((m): KuyrukSutunu => {
    const M = cx.M[m.id];
    const tum = yerlesen(p).filter((r) => r.m === m.id && r.C > now).sort((a, b) => a.S - b.S);
    const l = tum.filter((r) => r.S < ufuk);
    const cap = (M ? acikSaat(M.rw, now, ufuk) : 0) || 1;
    const dolu = l.reduce((s, r) => s + (M ? acikSaat(M.rw, Math.max(r.S, now), Math.min(r.C, ufuk)) : 0), 0) / cap;
    const kartlar = l.slice(0, KUYRUK_KART).map((r): KuyrukKarti => {
      const o = cx.byId[r.id]; const Su = r.Su ?? r.S; const T = p.J[r.job]?.T ?? null;
      const durum: KuyrukDurumu = r.C <= now ? 'bitti' : r.S <= now && now < Su ? 'ayar' : Su <= now && now < r.C ? 'calisiyor' : 'sirada';
      return {
        id: r.id, job: r.job, k: r.id.slice(r.job.length + 1), ad: o?.ad || r.id, adet: adimAdedi(D, r.id, cx.jobs[r.job]?.adet ?? 0), durum,
        zaman: kuyrukZamani(D, r.S, r.C), gec: T != null && T > 0.05 ? T : null, kilit: !!c.locks[r.id], renk: renk(D, r.job),
        alt: (o?.c ?? []).filter((x) => !x.startsWith('@') && x !== r.m),
      };
    });
    return { m: m.id, ad: m.ad ?? '', n: l.length, dolu, isi: isiSeviyesi(dolu), kartlar, fazla: Math.max(0, l.length - KUYRUK_KART), sonra: tum.length - l.length };
  });
}

// --- Matris merceği (k-gorunum gunlukDagilim, sMatris; zz5-olcek-her-yer mtKovalar; zt-malzeme-plan mpKova) ---
// Günlük dağılım: işlemin üretim süresi tezgâhın çalışma pencerelerine göre günlere bölünür, adet bu oranla paylaşılır.
export interface MatrisIsi { id: string; job: string; adet: number; m?: string }
export interface DagilimHucresi { adet: number; mesgul: number; isler: MatrisIsi[] }
export type DagilimSatirlari = Record<string, Record<number, DagilimHucresi>>;
export interface GunlukDagilim { d0: number; tez: DagilimSatirlari; kisi: DagilimSatirlari; sip: DagilimSatirlari }
// Atanamayan işin kişi satırı.
export const KISI_BOS = '_bos';

export function gunlukDagilim(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme): GunlukDagilim {
  const D = c.D; const d0 = Math.floor(cx.now / 24);
  const tez: DagilimSatirlari = {}, kisi: DagilimSatirlari = {}, sip: DagilimSatirlari = {};
  const hucre = (o: DagilimSatirlari, k: string, d: number): DagilimHucresi => ((o[k] ??= {})[d] ??= { adet: 0, mesgul: 0, isler: [] });
  const onculer = new Set<string>(); for (const o of Object.values(cx.byId)) for (const [q] of o.pr) onculer.add(q);
  const parca: { r: PlanIslemi; adet: number; d: number }[] = [];
  for (const r of Object.values(p.ops)) {
    const M = cx.M[r.m];
    if (r.fas || !Number.isFinite(r.C) || !cx.byId[r.id] || !M) continue;
    const Su = r.Su ?? r.S; const adet = adimAdedi(D, r.id, cx.jobs[r.job]?.adet ?? 0);
    const top = acikSaat(M.rw, Su, r.C) || 1;
    for (let d = Math.max(d0, Math.floor(r.S / 24)); d <= Math.floor((r.C - 1e-6) / 24); d++) {
      const a = d * 24, b = a + 24;
      const uret = acikSaat(M.rw, Math.max(Su, a), Math.min(r.C, b));
      const ayar = acikSaat(M.sw, Math.max(r.S, a), Math.min(Su, b));
      if (uret + ayar <= 1e-6) continue;
      const x = (adet * uret) / top;
      const h = hucre(tez, r.m, d); h.adet += x; h.mesgul += uret + ayar; h.isler.push({ id: r.id, job: r.job, adet: x });
      parca.push({ r, adet, d });
      if (!onculer.has(r.id) && x > 1e-6) { const s = hucre(sip, r.job, d); s.adet += x; s.isler.push({ id: r.id, job: r.job, adet: x }); }
    }
  }
  // Motor kişi seçmez, grup başına kişi sayar. Kişi satırları bu yüzden bir atama önerisidir: her vardiyada tezgâh, o vardiyada çalışan ve
  // tezgâhın grubunda yetkin, en az yüklü kişiye verilir.
  const vs = new Map((D.vardiyalar ?? []).map((v) => [String(v.id), v]));
  const pen = (d: number, sid: string): [number, number] | null => {
    const v = vs.get(sid); if (!v) return null;
    const a = d * 24 + hm(v.bas); let b = d * 24 + hm(v.bit); if (b <= a) b += 24; return [a, b];
  };
  const yuk = new Map<string, number>(); const bakar = new Map<string, string[]>();
  for (const { r, adet, d } of parca) {
    const M = cx.M[r.m]; if (!M) continue;
    const Su = r.Su ?? r.S; const top = acikSaat(M.rw, Su, r.C) || 1;
    for (const sid of cx.gunler[d] ?? []) {
      const w = pen(d, sid); if (!w) continue;
      const uret = acikSaat(M.rw, Math.max(Su, w[0]), Math.min(r.C, w[1])); if (uret <= 1e-6) continue;
      const x = (adet * uret) / top; const an = `${d}|${sid}`;
      const y = (k: string) => yuk.get(`${k}|${an}`) ?? 0;
      const aday = (D.personel ?? []).filter((k) => k.vardiya === sid && (k.gruplar ?? []).includes(M.grup));
      const yer = aday.filter((k) => y(k.id) + M.op <= 1.0001 || (bakar.get(`${k.id}|${an}`) ?? []).includes(r.m)).sort((a, b) => y(a.id) - y(b.id))[0];
      const kid = yer ? yer.id : KISI_BOS;
      const ml = bakar.get(`${kid}|${an}`) ?? [];
      if (!ml.includes(r.m)) { bakar.set(`${kid}|${an}`, [...ml, r.m]); yuk.set(`${kid}|${an}`, y(kid) + M.op); }
      const h = hucre(kisi, kid, d); h.adet += x; h.mesgul += uret; h.isler.push({ id: r.id, job: r.job, adet: x, m: r.m });
    }
  }
  return { d0, tez, kisi, sip };
}

// Sütunlar dönemin kırılımıdır: günde 7 ya da 14 gün, haftada hafta, ayda ay, yılda yıl; [a, b) gün aralığı.
export const MATRIS_KIRILIM: Record<DonemOlcegi, string> = { gun: 'Günlük', hafta: 'Haftalık', ay: 'Aylık', yil: 'Yıllık' };
export interface MatrisSutunu { a: number; b: number; gun: string; tarih: string; kapali: boolean }
export function matrisSutunlari(D: PlanVerisi, cx: Derleme, olcek: DonemOlcegi, d0: number, mGun: number): MatrisSutunu[] {
  const acik = (a: number, b: number) => { for (let d = a; d < b; d++) if (cx.gunler[d]?.length) return true; return false; };
  if (olcek === 'gun') {
    return Array.from({ length: mGun }, (_, i) => { const d = d0 + i; const t = saatYaz(D, d * 24); return { a: d, b: d + 1, gun: t.slice(6, 9), tarih: t.slice(0, 5), kapali: !acik(d, d + 1) }; });
  }
  const taban = tabanMs(D) ?? 0;
  const tarih = (t: number) => new Date(taban + t * 3_600_000);
  const saat = (x: Date) => (x.getTime() - taban) / 3_600_000;
  const kova = (t: number) => {
    const x = tarih(t); const y = x.getUTCFullYear(), m = x.getUTCMonth(), g = x.getUTCDate();
    if (olcek === 'yil') return saat(new Date(Date.UTC(y, 0, 1)));
    if (olcek === 'ay') return saat(new Date(Date.UTC(y, m, 1)));
    return saat(new Date(Date.UTC(y, m, g - ((x.getUTCDay() + 6) % 7))));
  };
  const sonraki = (k: number) => {
    const x = tarih(k); const y = x.getUTCFullYear(), m = x.getUTCMonth(), g = x.getUTCDate();
    return saat(olcek === 'yil' ? new Date(Date.UTC(y + 1, 0, 1)) : olcek === 'ay' ? new Date(Date.UTC(y, m + 1, 1)) : new Date(Date.UTC(y, m, g + 7)));
  };
  const ad = (k: number) => (olcek === 'yil' ? String(tarih(k).getUTCFullYear()) : olcek === 'ay' ? AY_AD[tarih(k).getUTCMonth()] ?? '' : saatYaz(D, k).slice(0, 5));
  const gunSon = d0 + UFUK_GUN; const l: MatrisSutunu[] = [];
  for (let k = kova(d0 * 24 + 1); k < gunSon * 24 && l.length < 60; k = sonraki(k)) {
    const a = Math.max(d0, Math.floor(k / 24)), b = Math.min(gunSon, Math.ceil(sonraki(k) / 24));
    if (b > a) l.push({ a, b, gun: '', tarih: ad(k), kapali: !acik(a, b) });
  }
  return l;
}

export type MatrisGorunumu = 'tezgah' | 'kisi' | 'siparis';
export interface MatrisHucre { adet: string; oran: number | null; isi: number; ipucu: string }
export interface MatrisSatiri { id: string; ad: string; alt: string; uyari: boolean; hucreler: (MatrisHucre | null)[]; toplam: string }
export interface MatrisGrubu { ad: string | null; satirlar: MatrisSatiri[] }
export interface Matris { sutunlar: MatrisSutunu[]; gruplar: MatrisGrubu[]; toplamlar: string[]; toplam: string; bos: MatrisSatiri | null }

const adetYaz = (x: number) => (x < 0.5 ? (x > 1e-6 ? '<1' : '') : sayiYaz(Math.round(x), 0));
const toplamYaz = (x: number) => (x ? sayiYaz(Math.round(x), 0) : '—');
function ipucu(h: DagilimHucresi): string {
  const l = [...h.isler].sort((a, b) => b.adet - a.adet).slice(0, 8).map((x) => `${x.id} · ${x.adet < 1 ? '<1' : Math.round(x.adet)} adet${x.m ? ` · ${x.m}` : ''}`);
  return l.join('\n') + (h.isler.length > 8 ? `\n+${h.isler.length - 8} iş` : '');
}

export function matris(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme, v: GunlukDagilim, gor: MatrisGorunumu, olcek: DonemOlcegi, mGun: number): Matris {
  const D = c.D; const sutunlar = matrisSutunlari(D, cx, olcek, v.d0, mGun);
  const toplamG = sutunlar.map(() => 0);
  const acikGun = (k: MatrisSutunu) => { let n = 0; for (let d = k.a; d < k.b; d++) if (cx.gunler[d]?.length) n++; return n; };
  const satir = (sat: Record<number, DagilimHucresi> | undefined, kapasite: (k: MatrisSutunu) => number, s: Omit<MatrisSatiri, 'hucreler' | 'toplam'>, hep = false): MatrisSatiri => {
    let top = 0;
    const hucreler = sutunlar.map((k, i): MatrisHucre | null => {
      let h: DagilimHucresi | null = null;
      for (let d = k.a; d < k.b; d++) { const x = sat?.[d]; if (!x) continue; h ??= { adet: 0, mesgul: 0, isler: [] }; h.adet += x.adet; h.mesgul += x.mesgul; h.isler.push(...x.isler); }
      if (!h) return null;
      const cap = kapasite(k); const oran = cap ? h.mesgul / cap : null; top += h.adet; toplamG[i] = (toplamG[i] ?? 0) + h.adet;
      return { adet: adetYaz(h.adet), oran, isi: isiSeviyesi(oran), ipucu: ipucu(h) };
    });
    return { ...s, hucreler, toplam: hep ? sayiYaz(Math.round(top), 0) : toplamYaz(top) };
  };
  const gruplar: MatrisGrubu[] = []; let bos: MatrisSatiri | null = null;
  if (gor === 'tezgah') {
    // Düz nesne: grup sırası eski sayfadaki gibi anahtar sırasıdır.
    const tg: Record<string, typeof D.tezgahlar> = {};
    for (const m of D.tezgahlar) (tg[String(m.grup)] ??= []).push(m);
    for (const [ad, l] of Object.entries(tg)) {
      gruplar.push({ ad, satirlar: l.map((m) => { const M = cx.M[m.id]; return satir(v.tez[m.id], (k) => (M ? acikSaat(M.rw, k.a * 24, k.b * 24) : 0), { id: m.id, ad: m.id, alt: m.ad ?? '', uyari: false }); }) });
    }
  } else if (gor === 'kisi') {
    const vs = new Map((D.vardiyalar ?? []).map((x) => [String(x.id), x]));
    const l = D.personel ?? []; const sira = [...l.filter((k) => v.kisi[k.id]), ...l.filter((k) => !v.kisi[k.id])];
    gruplar.push({
      ad: null,
      satirlar: sira.map((k) => {
        const x = k.vardiya != null ? vs.get(k.vardiya) : undefined; const fark = x ? hm(x.bit) - hm(x.bas) : 8; const sure = fark <= 0 ? fark + 24 : fark;
        // Kapasite: kırılımdaki açık gün sayısı kadar vardiya (eski sayfa haftada, ayda da tek vardiya sayıyordu, SORU-P1c3 2).
        return satir(v.kisi[k.id], (s) => acikGun(s) * sure, { id: k.id, ad: k.ad ?? k.id, alt: `${k.vardiya ?? ''} · ${(k.gruplar ?? []).join(', ')}`, uyari: false });
      }),
    });
    if (v.kisi[KISI_BOS]) bos = satir(v.kisi[KISI_BOS], () => 0, { id: KISI_BOS, ad: 'Kişi atanamadı', alt: 'vardiyada yetkin kişi yok ya da dolu', uyari: true }, true);
  } else {
    gruplar.push({
      ad: null,
      satirlar: D.siparisler.map((s) => {
        const T = p.J[s.id]?.T ?? null; const gec = T != null && T > 0.05; const urun = D.urunler.find((u) => u.id === s.urun)?.ad ?? s.urun;
        return satir(v.sip[s.id], () => 0, { id: s.id, ad: s.id, alt: `${urun} · ${sayiYaz(Number(s.adet) || 0, 0)} adet${gec ? ` · ${saatYazi(T)} gecikme` : ''}`, uyari: gec });
      }),
    });
  }
  return { sutunlar, gruplar, bos, toplamlar: toplamG.map((x) => (x ? sayiYaz(Math.round(x), 0) : '')), toplam: sayiYaz(Math.round(toplamG.reduce((a, b) => a + b, 0)), 0) };
}

// Seçili işin açılımları (s-gun gyYan, t-tekyer gercekFormu, hedefFormu): parti bölme birden çok adetli, bitmemiş ve başlamamış işte; fason olmayan ve
// tezgâhı aday olan işte başlamışsa gerçekleşen, değilse erken ya da geç bitme (süre olayı varsa çarpanıyla açık); hedefe yetiştirme siparişi olan işte.
const nesneMi = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object';
export function gunAcilimlari(c: PlanlamaCalismasi, cx: Derleme, r: PlanIslemi): [SimgeAdi, string, boolean][] {
  const s = c.D.siparisler.find((x) => x.id === r.job); const l: [SimgeAdi, string, boolean][] = [];
  if (s && Number(s.adet) > 1 && !r.act && r.C > cx.now) l.push(['ruler', 'Partiyi böl', false]);
  if (!r.fas && cx.byId[r.id]?.c.includes(r.m)) {
    // Başlamış ya da gerçekleşeni girilmiş adımda "Gerçekleşen" (t-tekyer gercekFormu; içerik yazar, pasif: 492/3 a).
    const g = nesneMi(c.gercek) ? c.gercek[r.id] : undefined;
    if (r.S <= cx.now + 1e-6 || g) { l.push(['clock', `Gerçekleşen${g ? ' (girildi)' : ''}`, !!g]); if (s) l.push(['target', 'Hedefe yetiştir', false]); return l; }
    const sap = c.olaylar.filter((e) => e.tip === 'sureOp' && e.id === r.id).pop(); const oran = sap ? Number(sap.oran) : 1;
    l.push(['clock', `Erken ya da geç biterse${sap && Math.abs(oran - 1) > 1e-3 ? ` (×${oran.toLocaleString('tr-TR', { maximumFractionDigits: 2 })})` : ''}`, !!sap]);
  }
  if (s) l.push(['target', 'Hedefe yetiştir', false]);
  return l;
}
