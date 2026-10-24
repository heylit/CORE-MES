import type { ExtraAlanlar, PlanlamaCalismasi, PlanVerisi, Siparis } from '../tipler.ts';

// P1'in saf hesapları. Plan saat eksenlidir: 0, D.meta.baslangic günü 00:00 duvar saatidir (engine.betik baseMs, parseT, fmtDT).
// Motor burada koşmaz (357 b); kayıttaki çözülmüş plan okunur. Eski sayfanın tarayıcıda motorun derlemesinden (compile) aldığı takvim,
// iş sırası ve termin buradaki `derle` ile aynı kuralla kurulur; yalnız ekranın okuduğu alanlar.

const nesne = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const sayi = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const metin = (v: unknown): string | null => (typeof v === 'string' ? v : null);
// Düzenli ifade grubunun sayısı; eşleşmeyen grup 0.
const n = (g: string | undefined): number => (g === undefined ? 0 : Number(g));

// --- plan ---
// İşlemin bekleme nedeni (motorun `why`'ı): t tür, o ikincil kod (rota: 2 son parti kuralı).
export interface Neden { t: string; o?: number }
// Planın işlem kaydı. `m` tezgâh kimliği, fasonda `@fasoncu`. `Su` ayarın bittiği an, `lot1` ilk partinin bitişi.
export interface PlanIslemi {
  id: string; job: string; m: string; S: number; C: number;
  su: number; run: number; fas: boolean; pin: boolean;
  Su: number | null; lot1: number | null;
  why: Neden | null;
}
export interface PlanOzeti { wT: number; late: number; n: number; suH: number | null; suN: number | null; famN: number | null; Cmax: number | null }
export interface OkunanPlan {
  ops: Record<string, PlanIslemi>;
  fail: string[];
  ozet: PlanOzeti;
  J: Record<string, { C: number | null; T: number | null }>;
  util: Record<string, { u: number; n: number; busy: number; open: number }>;
  warn: { t: string; j: string | null; txt: string }[];
  dataVer: number;
}

// Kayıttaki planı daraltır. Saatsiz işlem `S`/`C` olarak NaN taşır (eski sayfa kayıtta Infinity'yi null okur, yerleşmemiş sayar);
// özet yoksa plan yok sayılır.
export function planOku(c: PlanlamaCalismasi | null): OkunanPlan | null {
  const p = c?.plan;
  if (!p || !nesne(p.ops) || !nesne(p.ozet)) return null;
  const ops: Record<string, PlanIslemi> = {};
  for (const [id, r] of Object.entries(p.ops)) {
    const m = nesne(r) ? metin(r.m) : null, job = nesne(r) ? metin(r.job) : null;
    if (!nesne(r) || m === null || job === null) continue;
    const why = nesne(r.why) && typeof r.why.t === 'string' ? { t: r.why.t, ...(sayi(r.why.o) !== null ? { o: r.why.o as number } : {}) } : null;
    ops[id] = {
      id, job, m, S: sayi(r.S) ?? Number.NaN, C: sayi(r.C) ?? Number.NaN,
      su: sayi(r.su) ?? 0, run: sayi(r.run) ?? 0, fas: !!r.fas, pin: !!r.pin, Su: sayi(r.Su), lot1: sayi(r.lot1), why,
    };
  }
  const o = p.ozet;
  const J: OkunanPlan['J'] = {};
  if (nesne(p.J)) for (const [j, x] of Object.entries(p.J)) if (nesne(x)) J[j] = { C: sayi(x.C), T: sayi(x.T) };
  const util: OkunanPlan['util'] = {};
  if (nesne(p.util)) for (const [m, x] of Object.entries(p.util)) if (nesne(x) && sayi(x.u) !== null) util[m] = { u: x.u as number, n: sayi(x.n) ?? 0, busy: sayi(x.busy) ?? 0, open: sayi(x.open) ?? 0 };
  return {
    ops, J, util,
    ozet: { wT: sayi(o.wT) ?? 0, late: sayi(o.late) ?? 0, n: sayi(o.n) ?? 0, suH: sayi(o.suH), suN: sayi(o.suN), famN: sayi(o.famN), Cmax: sayi(o.Cmax) },
    fail: Array.isArray(p.fail) ? p.fail.filter((x): x is string => typeof x === 'string') : [],
    warn: Array.isArray(p.warn) ? p.warn.filter(nesne).map((w) => ({ t: metin(w.t) ?? '', j: metin(w.j) ?? metin(w.job), txt: metin(w.txt) ?? '' })) : [],
    dataVer: p.dataVer,
  };
}

// --- saat ---
const GUN = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'] as const;
const GUN_AD = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const AY_AD = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const iki = (x: number) => String(x).padStart(2, '0');

// Planın 0 saati (UTC ile kodlanmış duvar saati). Başlangıç yoksa null.
export function tabanMs(D: PlanVerisi): number | null {
  const b = D.meta?.baslangic;
  const m = typeof b === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(b) : null;
  return m ? Date.UTC(n(m[1]), n(m[2]) - 1, n(m[3])) : null;
}
// "YYYY-AA-GG[ SS:DD]" metnini plan saatine çevirir (parseT); sayı olduğu gibi kalır.
export function saatOku(D: PlanVerisi, s: unknown): number | null {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  const b = tabanMs(D);
  const m = typeof s === 'string' ? /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(s.trim()) : null;
  if (b === null || !m) return null;
  return (Date.UTC(n(m[1]), n(m[2]) - 1, n(m[3]), n(m[4]), n(m[5])) - b) / 3_600_000;
}
// "19.10 Pzt 08:00" (fmtDT). Saat yoksa ya da sonsuzsa "—".
export function saatYaz(D: PlanVerisi, t: number | null | undefined): string {
  const b = tabanMs(D);
  if (b === null || t == null || !Number.isFinite(t)) return '—';
  const d = new Date(b + t * 3_600_000);
  return `${iki(d.getUTCDate())}.${iki(d.getUTCMonth() + 1)} ${GUN_AD[(d.getUTCDay() + 6) % 7]} ${iki(d.getUTCHours())}:${iki(d.getUTCMinutes())}`;
}
// Gün kodu (wdOf): planın d. günü.
function gunKodu(D: PlanVerisi, d: number): (typeof GUN)[number] {
  const b = tabanMs(D) ?? 0;
  return GUN[(new Date(b + d * 86_400_000).getUTCDay() + 6) % 7] ?? 'pzt';
}
const hm = (s: unknown): number => { const [h, m] = String(s).split(':').map(Number); return (h ?? 0) + (m || 0) / 60; };

// Sayı yazımı (sayi): Türkçe ondalık, verilen basamakla.
export function sayiYaz(x: number, basamak = 0): string {
  return x.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: basamak });
}
// Saat yazımı (saat): "—" ya da "3,5 sa".
export const saatYazi = (h: number | null | undefined): string => (h == null || !Number.isFinite(h) ? '—' : `${sayiYaz(h, 1)} sa`);
// Bölge sürelerinin kısa yazımı (zf-resim brSa): 10 saatten azı tek ondalık.
export const saKisa = (h: number): string => `${sayiYaz(h, h < 10 ? 1 : 0)} sa`;
// Sayıdan sonra Türkçe ek (zf-resim brEk): okunuşun son hecesine göre ünlü uyumu ("1'i", "6'sı", "%9'unda").
export function sayiEki(x: number, tur: 'i' | 'inde'): string {
  const k = Math.abs(Math.round(x));
  const bir = ['ı', 'i', 'i', 'ü', 'ü', 'e', 'ı', 'i', 'i', 'u'], on = [null, 'o', 'i', 'u', 'ı', 'i', 'ı', 'i', 'e', 'a'];
  const unluB = [false, false, true, false, false, false, true, true, false, false], unluO = [false, false, true, false, false, true, false, false, false, false];
  let u: string, sonUnlu: boolean;
  if (k === 0) { u = 'ı'; sonUnlu = false; }
  else if (k % 10) { u = bir[k % 10] ?? 'i'; sonUnlu = unluB[k % 10] ?? false; }
  else if (k % 100) { u = on[(k % 100) / 10] ?? 'i'; sonUnlu = unluO[(k % 100) / 10] ?? false; }
  else if (k % 1000) { u = 'ü'; sonUnlu = false; }
  else { u = 'i'; sonUnlu = false; }
  const dort = ({ a: 'ı', ı: 'ı', o: 'u', u: 'u', e: 'i', i: 'i', ö: 'ü', ü: 'ü' } as Record<string, string>)[u] ?? 'i';
  const ikili = 'aıou'.includes(u) ? 'a' : 'e';
  const ek = (sonUnlu ? 's' : '') + dort;
  return "'" + (tur === 'inde' ? `${ek}nd${ikili}` : ek);
}

// Planın "şimdi"si (girdi.betik stKur + simdiUygula): başlangıç günü 07:00, kaydın `simdi`'si daha ilerideyse o.
export const BASLANGIC_SAATI = 7;
export function simdiSaati(c: PlanlamaCalismasi): number {
  const s = sayi((c as ExtraAlanlar).simdi);
  return s !== null && s > BASLANGIC_SAATI ? s : BASLANGIC_SAATI;
}

// --- pencereler (engine.betik merge, subtract, wi, workIn) ---
export type Pencere = [number, number];
function birlestir(W: Pencere[]): Pencere[] {
  const s = [...W].sort((a, b) => a[0] - b[0]); const o: Pencere[] = [];
  for (const w of s) {
    if (w[1] <= w[0]) continue;
    const son = o[o.length - 1];
    if (son && w[0] <= son[1] + 1e-9) son[1] = Math.max(son[1], w[1]); else o.push([w[0], w[1]]);
  }
  return o;
}
function cikar(W: Pencere[], D: Pencere[]): Pencere[] {
  if (!D.length) return W;
  const o: Pencere[] = [];
  for (const [a, b] of W) {
    let par: Pencere[] = [[a, b]];
    for (const [c, d] of D) {
      const y: Pencere[] = [];
      for (const [x, z] of par) { if (d <= x || c >= z) { y.push([x, z]); continue; } if (c > x) y.push([x, c]); if (d < z) y.push([d, z]); }
      par = y;
    }
    o.push(...par);
  }
  return o;
}
function pencereNo(W: Pencere[], t: number): number {
  let lo = 0, hi = W.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if ((W[m]?.[1] ?? 0) <= t + 1e-9) lo = m + 1; else hi = m; }
  return lo;
}
// [a, b) aralığında pencerelerin içinde kalan saat.
export function acikSaat(W: Pencere[], a: number, b: number): number {
  let s = 0;
  for (let i = pencereNo(W, a); i < W.length; i++) {
    const w = W[i]; if (!w || w[0] >= b) break;
    s += Math.max(0, Math.min(b, w[1]) - Math.max(a, w[0]));
  }
  return s;
}

// --- derleme (engine.betik compile'ın ekranın okuduğu kısmı) ---
const UFUK_GUN = 63;
export interface DerlenenTezgah { id: string; grup: string; sw: Pencere[]; rw: Pencere[] }
// `c` uygun tezgâhlar, fason `@fasoncu`; `aile` aile kısalması, `aparat` bağlama aparatı.
export interface DerlenenAdim { id: string; ad: string; pr: [string, string][]; c: string[]; aile: string; aparat: string | null }
export interface DerlenenIs { id: string; due: number | null; rel: number | null; oncelik: number; adet: number; malzeme: { kod: string; miktar: number }[]; ops: DerlenenAdim[] }
export interface Derleme {
  g: Girdi; now: number; tasima: number;
  M: Record<string, DerlenenTezgah>;
  jobs: Record<string, DerlenenIs>;
  byId: Record<string, DerlenenAdim & { job: string }>;
}

interface Vardiya { bas: number; bit: number; mol: Pencere[] }
// Biten iş (girdi.betik tmiBitenler): biten ve iptal emir plana girmez; biten adım düşer, ardılı onu beklemez. Kaynak sunucunun iş emri
// durumu (`durum.emirler`): adım anahtarı "emir|root|sıra", sıra rotadaki yeri (1'den). Bütün adımı biten emir de düşer.
export interface Bitenler { siparis: Set<string>; adim: Set<string> }
export function bitenler(emirler: unknown, D: PlanVerisi): Bitenler {
  const y: Bitenler = { siparis: new Set(), adim: new Set() };
  if (!nesne(emirler)) return y;
  for (const o of Array.isArray(emirler.orders) ? emirler.orders : []) if (nesne(o) && (o.status === 'tamam' || o.status === 'iptal')) y.siparis.add(String(o.id));
  const durum = nesne(emirler.opStatus) ? emirler.opStatus : {};
  const urun = new Map(D.urunler.map((u) => [u.id, u]));
  for (const s of D.siparisler) {
    const rota = urun.get(s.urun)?.rota ?? [];
    if (y.siparis.has(s.id) || !rota.length) continue;
    const biten = rota.filter((_, i) => durum[`${s.id}|root|${i + 1}`] === 'tamam');
    if (biten.length === rota.length) y.siparis.add(s.id); else for (const a of biten) y.adim.add(`${s.id}.${a.k}`);
  }
  return y;
}
// İş emri durumu okunamazsa (emir yetkisi yok) biten iş kayıtlı plandan çıkarılır: planda da başarısızlar listesinde de olmayan adım bitmiştir.
export function plandanBitenler(c: PlanlamaCalismasi, p: OkunanPlan | null): Bitenler {
  const y: Bitenler = { siparis: new Set(), adim: new Set() };
  if (!p) return y;
  const urun = new Map(c.D.urunler.map((u) => [u.id, u]));
  for (const s of c.D.siparisler) {
    const ids = (urun.get(s.urun)?.rota ?? []).map((o) => `${s.id}.${o.k}`);
    const biten = ids.filter((id) => !p.ops[id] && !p.fail.includes(id));
    if (ids.length && biten.length === ids.length) y.siparis.add(s.id); else for (const id of biten) y.adim.add(id);
  }
  return y;
}

// Planın girdisi (girdi.betik stKur, simdiUygula): verinin kopyası; havuzdaki ve biten sipariş düşer, kapalı kısıtın gevşetmesi ve olaylar
// uygulanır. Ekranın okuduğu alanlar: takvim, duruş, ek mesai, sipariş, personel, aparat, fason, ayar matrisi, satın alma gecikmesi.
export interface Girdi {
  D: PlanVerisi & { ayarlar: Record<string, unknown>; aparatlar?: unknown[]; ayarMatrisi?: unknown[] }; now: number; kapali: Set<string>; bitti: Set<string>;
  down: { m: string; from: number; to: number }[]; ekMesai: { m: string; gun: number; vardiya: string }[]; saGecik: Record<string, number>;
}
const GUN_KODLARI = [...GUN];
const GEVSEK: Record<string, (g: Girdi) => void> = {
  tvardiya: (g) => { g.D.tezgahlar = g.D.tezgahlar.map(({ vardiyalar: _, ...m }) => m); },
  tatil: (g) => { g.D.tatiller = []; },
  ariza: (g) => { g.down = []; },
  personel: (g) => { g.D.tezgahlar = g.D.tezgahlar.map((m) => ({ ...m, opOran: 0 })); },
  yetkin: (g) => { const gr = [...new Set(g.D.tezgahlar.map((m) => m.grup ?? ''))]; g.D.personel = (g.D.personel ?? []).map((p) => ({ ...p, gruplar: [...gr] })); },
  ayarci: (g) => {
    for (const v of g.D.vardiyalar ?? []) for (let i = 0; i < 40; i++) (g.D.personel ??= []).push({ id: `~A${String(v.id)}${i}`, ad: 'sanal ayarcı', vardiya: String(v.id), gruplar: [], ayar: true });
  },
  aparat: (g) => { g.D.aparatlar = (Array.isArray(g.D.aparatlar) ? g.D.aparatlar : []).filter(nesne).map((a) => ({ ...a, adet: 999 })); },
  serbest: (g) => { g.D.siparisler = g.D.siparisler.map((s) => ({ ...s, serbest: null })); },
  tasima: (g) => { g.D.ayarlar = { ...g.D.ayarlar, tasimaSaat: 0 }; },
  fasonGun: (g) => { g.D.fasoncular = (g.D.fasoncular ?? []).map((f) => ({ ...f, cikisGunleri: [...GUN_KODLARI] })); },
  ayar: (g) => { g.D.ayarMatrisi = []; },
};
export function girdiKur(c: PlanlamaCalismasi, biten: Bitenler = { siparis: new Set(), adim: new Set() }): Girdi {
  const D = structuredClone(c.D) as Girdi['D'];
  D.ayarlar = nesne(D.ayarlar) ? D.ayarlar : {};
  D.siparisler = D.siparisler.filter((s) => !s.havuz && !biten.siparis.has(s.id));
  const g: Girdi = { D, now: simdiSaati(c), kapali: new Set(c.kapali), bitti: biten.adim, down: [], ekMesai: [], saGecik: {} };
  for (const d of c.down) { const m = metin(d.m), a = sayi(d.from), b = sayi(d.to); if (m !== null && a !== null && b !== null) g.down.push({ m, from: a, to: b }); }
  for (const e of c.ekMesai) { const m = metin(e.m), gun = sayi(e.gun), v = metin(e.vardiya); if (m !== null && gun !== null && v !== null) g.ekMesai.push({ m, gun, vardiya: v }); }
  for (const k of g.kapali) GEVSEK[k]?.(g);
  // Soru 159 b: vardiyası olan ayarcı yoksa ayarcı sınırı uygulanmaz.
  const vids = new Set((D.vardiyalar ?? []).map((v) => String(v.id)));
  if (!g.kapali.has('ayarci') && !(D.personel ?? []).some((p) => p.ayar && vids.has(String(p.vardiya)))) GEVSEK.ayarci?.(g);
  for (const ev of c.olaylar) {
    if (ev.tip === 'ariza' && typeof ev.m === 'string') {
      const from = ev.bas != null ? saatOku(D, ev.bas) ?? g.now : g.now;
      g.down.push({ m: ev.m, from, to: from + (Number(ev.saat) || 8) });
    } else if (ev.tip === 'acil' && typeof ev.urun === 'string') {
      let k = 901; while (D.siparisler.some((j) => j.id === `SP-${k}`)) k++;
      const u = D.urunler.find((x) => x.id === ev.urun);
      D.siparisler.push({ id: `SP-${k}`, ad: `${u?.ad ?? ev.urun} (acil)`, urun: ev.urun, adet: Number(ev.adet), termin: metin(ev.termin), oncelik: Number(ev.oncelik) || 1, serbest: null });
    } else if (ev.tip === 'malzeme' && typeof ev.kod === 'string') {
      g.saGecik[ev.kod] = (g.saGecik[ev.kod] ?? 0) + Number(ev.gun) * 24;
    } else if (ev.tip === 'fason') {
      D.fasoncular = (D.fasoncular ?? []).map((f) => (f.id === ev.f ? { ...f, sureGun: (Number(f.sureGun) || 1) + Number(ev.gun) } : f));
    } else if (ev.tip === 'mesai' && typeof ev.m === 'string' && typeof ev.vardiya === 'string' && sayi(ev.gun) !== null) {
      g.ekMesai.push({ m: ev.m, gun: ev.gun as number, vardiya: ev.vardiya });
    }
  }
  return g;
}

export function derle(g: Girdi): Derleme {
  const bitti = (id: string) => g.bitti.has(id);
  const { D, now, kapali } = g;
  const vs: Record<string, Vardiya> = {};
  for (const v of D.vardiyalar ?? []) {
    const id = metin(v.id); if (id === null) continue;
    const mol = Array.isArray(v.molalar) ? v.molalar.filter(nesne).map((x): Pencere => [hm(x.bas), hm(x.bit)]) : [];
    vs[id] = { bas: hm(v.bas), bit: hm(v.bit), mol };
  }
  const tatil = new Set((D.tatiller ?? []).map((s) => Math.floor((saatOku(D, s) ?? Number.NaN) / 24)));
  const gunler = Array.from({ length: UFUK_GUN }, (_, d) => {
    const wd = gunKodu(D, d); const v = D.calismaGunleri?.[wd];
    return tatil.has(d) ? [] : Array.isArray(v) ? v.map(String) : [];
  });
  const an = (d: number, sid: string): Pencere | null => {
    const v = vs[sid]; if (!v) return null;
    const a = d * 24 + v.bas; let b = d * 24 + v.bit; if (b <= a) b += 24; return [a, b];
  };
  // Mola yalnız kendi vardiyasından düşer; gece vardiyasında vardiya başından önceki mola ertesi güne düşer.
  const molalar = (d: number, sid: string): Pencere[] => {
    const v = vs[sid]; if (!v) return [];
    return v.mol.map(([x, y]) => { let a = d * 24 + x; if (a < d * 24 + v.bas) a += 24; let b = d * 24 + y; if (b <= a) b += 24; return [a, b]; });
  };
  const { down, ekMesai: ek } = g; const siparisler = D.siparisler;
  const M: Derleme['M'] = {};
  for (const m of D.tezgahlar) {
    const kendi = Array.isArray(m.vardiyalar) && m.vardiyalar.length ? new Set(m.vardiyalar) : null;
    let sw: Pencere[] = [];
    for (let d = 0; d < UFUK_GUN; d++) for (const sid of gunler[d] ?? []) if (!kendi || kendi.has(sid)) { const w = an(d, sid); if (w) sw.push(...cikar([w], molalar(d, sid))); }
    for (const e of ek) if (e.m === m.id) { const w = an(e.gun, e.vardiya); if (w) sw.push(...cikar([w], molalar(e.gun, e.vardiya))); }
    sw = birlestir(sw);
    let rw = sw;
    if (m.isiksiz) { const t: Pencere[] = []; for (let d = 0; d < UFUK_GUN; d++) if (gunler[d]?.length) t.push([d * 24, d * 24 + 24]); rw = birlestir(t.concat(sw)); }
    const dn = down.filter((x) => x.m === m.id).map((x): Pencere => [x.from, x.to]);
    M[m.id] = { id: m.id, grup: m.grup ?? '', sw: cikar(sw, dn), rw: cikar(rw, dn) };
  }
  const urun = Object.fromEntries(D.urunler.map((u) => [u.id, u]));
  const A = D.ayarlar;
  const fasonTalas = metin(A.fasonTalas), fasoncu = new Set((D.fasoncular ?? []).map((f) => f.id));
  const jobs: Derleme['jobs'] = {}; const byId: Derleme['byId'] = {};
  for (const j of siparisler) {
    const u = urun[j.urun]; if (!u) continue;
    const is: DerlenenIs = {
      id: j.id, due: saatOku(D, j.termin), rel: saatOku(D, j.serbest), oncelik: Number(j.oncelik) || 2, adet: Number(j.adet) || 0,
      malzeme: Array.isArray(j.malzeme) ? j.malzeme : [], ops: [],
    };
    for (const o of u.rota ?? []) {
      const id = `${j.id}.${o.k}`;
      if (bitti(id)) continue;
      const cs: string[] = o.fason ? [`@${o.fason}`] : (o.tezgahlar ?? []).filter((t) => M[t.id]).map((t) => t.id);
      if (o.fasonIzin && fasonTalas !== null && fasoncu.has(fasonTalas)) cs.push(`@${fasonTalas}`);
      const pr = (o.bag ?? []).filter((b) => b.length >= 2).map((b): [string, string] => [`${j.id}.${String(b[0])}`, String(b[1])]).filter(([q]) => !bitti(q));
      const adim = { id, ad: metin(o.ad) ?? '', pr, c: cs, aile: metin(o.aile) ?? '', aparat: metin(o.aparat) };
      is.ops.push(adim); byId[id] = { ...adim, job: j.id };
    }
    jobs[j.id] = is;
  }
  return { g, now, tasima: sayi(A.tasimaSaat) ?? 0, M, jobs, byId };
}

// --- süre ayrıştırması (c-masa.betik ayristir): siparişin bitişini belirleyen zincir ---
export type SureKategorisi = 'isleme' | 'ayar' | 'kapali' | 'tezgah' | 'personel' | 'ayarci' | 'aparat' | 'ariza' | 'tasima' | 'fason' | 'fasonBek' | 'rota' | 'baslangic';
export const KATEGORI_AD: Record<SureKategorisi, string> = {
  isleme: 'İşleme', ayar: 'Ayar', kapali: 'Tezgâh kapalı (vardiya dışı, tatil)', tezgah: 'Tezgâh dolu bekledi', personel: 'Operatör bekledi',
  ayarci: 'Ayarcı bekledi', aparat: 'Aparat bekledi', ariza: 'Arıza, bakım', tasima: 'Taşıma', fason: 'Fasonda',
  fasonBek: 'Fason çıkışı ya da kapasitesi bekledi', rota: 'Son parti kuralı', baslangic: 'Başlangıç koşulu (serbest, malzeme, NC programı, kilit)',
};
const NEDEN_KAT: Record<string, SureKategorisi> = {
  tezgah: 'tezgah', personel: 'personel', yetkin: 'personel', ayarci: 'ayarci', aparat: 'aparat', ariza: 'ariza', 'fason-kap': 'fasonBek',
  'fason-cikis': 'fasonBek', serbest: 'baslangic', malzeme: 'baslangic', program: 'baslangic', kilit: 'baslangic', oneri: 'baslangic',
};
export interface Ayrisim { seg: Partial<Record<SureKategorisi, number>>; kaynak: [SureKategorisi, string, number][]; C: number; toplam: number }

export function ayristir(p: OkunanPlan, cx: Derleme, jid: string): Ayrisim | 'eksik' | null {
  const j = cx.jobs[jid]; if (!j || !j.ops.length) return null;
  const rs = j.ops.map((o) => p.ops[o.id]);
  if (rs.some((r) => !r || !Number.isFinite(r.C))) return 'eksik';
  const seg: Ayrisim['seg'] = {}; const kaynak: Ayrisim['kaynak'] = [];
  const ekle = (k: SureKategorisi, v: number) => { if (v > 1e-6) seg[k] = (seg[k] ?? 0) + v; };
  const bekle = (w: Neden, r: PlanIslemi, v: number) => {
    if (v <= 1e-6) return;
    const k: SureKategorisi = NEDEN_KAT[w.t] ?? (w.t === 'rota' && w.o === 2 ? 'rota' : 'kapali');
    ekle(k, v);
    const Mg = cx.M[r.m]?.grup ?? '';
    const ad = k === 'tezgah' ? r.m : k === 'personel' ? `Operatör · ${Mg}` : k === 'ayarci' ? 'Ayarcı' : k === 'aparat' ? `Aparat · ${cx.byId[r.id]?.aparat ?? ''}`
      : k === 'fasonBek' ? `Fason · ${r.m.slice(1)}` : k === 'ariza' ? `Arıza · ${r.m}` : null;
    if (ad !== null) kaynak.push([k, ad, v]);
  };
  let r = (rs as PlanIslemi[]).reduce((a, b) => (b.C > a.C ? b : a));
  const C = r.C; let son = C;
  for (let g = 0; g < 200; g++) {
    const o = cx.byId[r.id]; const bas = r.S, bit = Math.max(bas, son);
    if (r.fas) ekle('fason', bit - bas);
    else {
      const M = cx.M[r.m]; const suSon = Math.min(Math.max(r.Su ?? Number.NaN, bas), bit);
      if (M) {
        const ay = acikSaat(M.sw, bas, suSon); ekle('ayar', ay); ekle('kapali', suSon - bas - ay);
        const is = acikSaat(M.rw, suSon, bit); ekle('isleme', is); ekle('kapali', bit - suSon - is);
      } else ekle('isleme', bit - bas);
    }
    let pr: PlanIslemi | null = null, prT = -Infinity, prSon = 0;
    for (const [pid, tur] of o?.pr ?? []) {
      const q = p.ops[pid]; if (!q) continue;
      const e = tur === 'o' && !q.fas ? q.lot1 ?? Number.NaN : q.C; const t = e + (q.fas ? 0 : cx.tasima);
      if (t > prT) { prT = t; pr = q; prSon = e; }
    }
    const w = r.why ?? { t: '' };
    if (pr) {
      ekle('tasima', Math.max(0, Math.min(prT - prSon, bas - prSon)));
      bekle(w, r, bas - prT);
      son = Math.min(prSon, bas); r = pr; continue;
    }
    const rel = j.rel != null && j.rel > cx.now ? Math.min(j.rel, bas) : cx.now;
    ekle('baslangic', rel - cx.now);
    bekle(w.t === 'serbest' ? { t: 'simdi' } : w, r, bas - rel);
    break;
  }
  return { seg, kaynak, C, toplam: C - cx.now };
}

// --- dönem (zq-olcek olAralik, zs-olcek-ortak) ---
export const DONEMLER = [['gun', 'Gün', 1], ['hafta', 'Hafta', 7], ['ay', 'Ay', 30], ['yil', 'Yıl', 364]] as const;
export type Donem = (typeof DONEMLER)[number][0];
export interface DonemAraligi { a: number; b: number; gun: number }
export function donemAraligi(now: number, d: Donem, kayma: number): DonemAraligi {
  const g = DONEMLER.find((x) => x[0] === d)?.[2] ?? 7;
  const a = Math.floor(now / 24) * 24 + kayma * g * 24;
  return { a, b: a + g * 24, gun: g };
}
const DONEM_BU: Record<Donem, string> = { gun: 'bugün', hafta: 'bu hafta', ay: 'bu ay', yil: 'bu yıl' };
export const donemAdi = (d: Donem): string => (DONEMLER.find((x) => x[0] === d)?.[1] ?? '').toLocaleLowerCase('tr-TR');
// Nabız etiketinin dönemi (olDonemEtiket): kaydırılmamışsa "bu hafta", kaydırılmışsa "seçili hafta".
export const donemEtiketi = (d: Donem, kayma: number): string => (kayma ? `seçili ${donemAdi(d)}` : DONEM_BU[d]);
// Ölçülen dönemin yazımı (olDonemAd): "19.10 Pzt – 25.10 Paz", günde tek gün.
export function donemYaz(D: PlanVerisi, d: Donem, r: DonemAraligi): string {
  const g = (t: number) => saatYaz(D, t).slice(0, 9);
  return d === 'gun' ? g(r.a) : `${g(r.a)} – ${g(r.b - 24)}`;
}

// --- nabız (zh-nabiz, zs-olcek-ortak olKume/olOlc, zr-agirlik) ---
// Dönemde iş gören ya da termini dönemde olan siparişler (olKume).
export function donemKumesi(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme, r: DonemAraligi): Set<string> {
  const ilk: Record<string, number> = {};
  for (const x of Object.values(p.ops)) if (Number.isFinite(x.S) && (ilk[x.job] == null || x.S < (ilk[x.job] ?? 0))) ilk[x.job] = x.S;
  const k = new Set<string>();
  for (const s of c.D.siparisler) {
    const J = p.J[s.id], j = cx.jobs[s.id];
    if (s.havuz || !J || !j) continue;
    const C = J.C ?? Number.NaN; const bas = ilk[s.id] ?? (Number.isFinite(C) ? C : null);
    const son = Math.max(Number.isFinite(C) ? C : bas ?? 0, j.due ?? -Infinity);
    if ((bas == null || bas < r.b) && son > r.a) k.add(s.id);
  }
  return k;
}
// Nabzın dönemlik ölçüsü (olOlc): kümedeki sipariş sayısı, geciken, toplam gecikme (ağırlıksız saat), darboğaz ve ayar.
export interface NabizOlcusu { n: number; late: number; wT: number; zam: number | null; dar: number | null; suH: number | null; util: Record<string, number> }
// Kısa kayıt: nabız tarihçesinde ops [tezgâh, başlangıç, bitiş, ayar], J [bitiş, gecikme] (nbOpsKisa, nbJKisa).
export interface NabizKaynagi { J: Record<string, unknown>; ops: Record<string, unknown> }
export function nabizOlc(src: NabizKaynagi, kume: Set<string>, cx: Derleme, r: DonemAraligi): NabizOlcusu {
  let say = 0, late = 0, wT = 0;
  for (const id of kume) {
    const x = src.J[id]; if (x == null) continue; say++;
    const T = Array.isArray(x) ? Number(x[1]) : nesne(x) ? Number(x.T) : 0;
    if (T > 0.05) { late++; wT += T; }
  }
  const busy: Record<string, number> = {}; let suH = 0, tam = true;
  for (const r0 of Object.values(src.ops)) {
    const x = Array.isArray(r0) ? { m: String(r0[0]), S: Number(r0[1]), C: r0[2] == null ? null : Number(r0[2]), su: Number(r0[3]) || 0 }
      : nesne(r0) ? { m: String(r0.m), S: Number(r0.S), C: sayi(r0.C), su: Number(r0.su) || 0 } : null;
    if (!x || !Number.isFinite(x.S)) continue;
    if (x.C === null) { tam = false; continue; }
    if (x.m.startsWith('@') || x.C <= r.a || x.S >= r.b) continue;
    const M = cx.M[x.m];
    busy[x.m] = (busy[x.m] ?? 0) + (M ? acikSaat(M.rw, Math.max(r.a, x.S), Math.min(r.b, x.C)) : Math.min(r.b, x.C) - Math.max(r.a, x.S));
    if (x.S >= r.a && x.su) suH += x.su;
  }
  const util: Record<string, number> = {};
  for (const [m, v] of Object.entries(busy)) { const M = cx.M[m]; const ac = M ? acikSaat(M.rw, r.a, r.b) : r.b - r.a; if (ac > 0.5) util[m] = v / ac; }
  const u = Object.values(util);
  return { n: say, late, wT, zam: say ? (say - late) / say * 100 : null, dar: tam && u.length ? Math.max(...u) * 100 : null, suH: tam ? suH : null, util };
}
export const NABIZ_ESIGI = { zam: 0.5, late: 0.5, wT: 0.05, dar: 0.5, suH: 0.05, deg: 0.5 } as const;
export type NabizGostergesi = keyof typeof NABIZ_ESIGI;
// Referansa göre fark (nbFark): ton iyi/kötü ya da boş, metin "+1", "−3,5 sa", "+2 puan".
export function nabizFarki(id: NabizGostergesi, a: number | null, b: number | null, kucukIyi: boolean): { ton: '' | 'iyi' | 'kotu'; m: string } {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) < NABIZ_ESIGI[id]) return { ton: '', m: 'aynı' };
  const d = a - b; const isaret = d > 0 ? '+' : '−';
  const m = id === 'wT' || id === 'suH' ? `${isaret}${sayiYaz(Math.abs(d), 1)} sa` : id === 'zam' || id === 'dar' ? `${isaret}${Math.round(Math.abs(d))} puan` : `${isaret}${Math.round(Math.abs(d))}`;
  return { ton: (a < b) === kucukIyi ? 'iyi' : 'kotu', m };
}
// Referansa göre yeri değişen iş (nbDegisen): tezgâhı ya da 8 saatten çok başlangıcı değişen.
export function degisenIs(ops: Record<string, PlanIslemi>, ref: Record<string, unknown> | null): number | null {
  if (!ref) return null;
  let say = 0;
  for (const [id, r] of Object.entries(ops)) {
    const q = ref[id]; if (q == null || !Number.isFinite(r.S)) continue;
    const qm = Array.isArray(q) ? q[0] : nesne(q) ? q.m : null, qs = Number(Array.isArray(q) ? q[1] : nesne(q) ? q.S : Number.NaN);
    if (qm !== r.m || Math.abs(qs - r.S) > 8) say++;
  }
  return say;
}
// Nabız tarihçesi (S.nabiz) ve sabit referans (S.nbSabit): eski sayfa her plan değişiminde yazar; yeni ekran plan çözmediği için okur.
export interface NabizKaydi { ne: string; ops: Record<string, unknown> | null; J: Record<string, unknown> | null; o: Record<string, number | null> | null }
export function nabizTarihcesi(c: PlanlamaCalismasi): NabizKaydi[] {
  const l = (c as ExtraAlanlar).nabiz;
  return Array.isArray(l) ? l.filter(nesne).map((x) => ({
    ne: metin(x.ne) ?? 'Plan', ops: nesne(x.ops) ? x.ops : null, J: nesne(x.J) ? x.J : null, o: nesne(x.o) ? (x.o as NabizKaydi['o']) : null,
  })) : [];
}
export interface NabizReferansi { tur: 'onceki' | 'sabit'; ad: string; kayit: NabizKaydi | null }
// Referans (nbRef): kayıttaki seçim; sabit yoksa bir önceki sürüm. Canlı plan referansı sayfanın kendi senaryosundandır, yeni ekranda yok (221 c).
export function nabizReferansi(c: PlanlamaCalismasi): NabizReferansi {
  const sabit = nesne((c as ExtraAlanlar).nbSabit) ? (c as ExtraAlanlar).nbSabit as Record<string, unknown> : null;
  if ((c as ExtraAlanlar).nbRef === 'sabit' && sabit) {
    return { tur: 'sabit', ad: `Referans: ${metin(sabit.ad) ?? ''}`, kayit: { ne: metin(sabit.ad) ?? '', ops: nesne(sabit.ops) ? sabit.ops : null, J: nesne(sabit.J) ? sabit.J : null, o: null } };
  }
  const l = nabizTarihcesi(c); const x = l.length >= 2 ? l[l.length - 2] ?? null : null;
  return x ? { tur: 'onceki', ad: `Önceki sürüm (${x.ne})`, kayit: x } : { tur: 'onceki', ad: 'Önceki sürüm yok', kayit: null };
}

// --- öncelik ağırlığı (engine.betik PW, isAgirligi) ---
const ONCELIK_AGIRLIGI: Record<number, number> = { 1: 4, 2: 2, 3: 1 };
export function isAgirligi(s: Siparis): number {
  const pay = sayi(s.pay);
  return (ONCELIK_AGIRLIGI[Number(s.oncelik)] ?? 1) * (pay !== null && pay > 0 && pay < 1 ? pay : 1);
}

// --- malzemenin hazır olduğu an (engine.betik matAlloc): stok ve satın alma, öncelik ve termin sırasıyla dağıtılır; karşılanmayan Infinity ---
export function malzemeHazir(cx: Derleme): Record<string, number> {
  const D = cx.g.D;
  const mats = new Map((D.malzemeler ?? []).map((m) => [m.kod, m]));
  const ted = new Map((Array.isArray(D.tedarikciler) ? D.tedarikciler : []).filter(nesne).map((t) => [String(t.id), t]));
  const sup: Record<string, { t: number; kalan: number }[]> = {};
  for (const m of D.malzemeler ?? []) sup[m.kod] = [{ t: -1e9, kalan: Number(m.stok) || 0 }];
  for (const p of Array.isArray(D.satinalma) ? D.satinalma : []) {
    if (!nesne(p)) continue;
    const kod = String(p.kod), soz = saatOku(D, p.gelis), td = ted.get(String(p.tedarikci));
    const gec = (Number(td?.ortGecikmeGun) || 0) * 24 + (cx.g.saGecik[kod] ?? 0), mu = (Number(mats.get(kod)?.muayeneGun) || 0) * 24;
    (sup[kod] ??= []).push({ t: soz === null ? 1e9 : Math.max(soz + gec, soz) + mu, kalan: Number(p.miktar) || 0 });
  }
  for (const l of Object.values(sup)) l.sort((a, b) => a.t - b.t);
  const sira = Object.values(cx.jobs).sort((a, b) => (a.oncelik - b.oncelik) || ((a.due ?? 1e9) - (b.due ?? 1e9)));
  const hazir: Record<string, number> = {};
  for (const j of sira) {
    let ready = cx.now;
    for (const r of j.malzeme) {
      let kalan = (Number(r.miktar) || 0) * j.adet, t = -1e9;
      for (const x of sup[r.kod] ?? []) {
        if (kalan <= 1e-9) break; if (x.kalan <= 1e-9) continue;
        const q = Math.min(x.kalan, kalan); x.kalan -= q; kalan -= q; t = Math.max(t, x.t);
      }
      ready = kalan > 1e-9 ? Infinity : Math.max(ready, t, cx.now);
    }
    hazir[j.id] = ready;
  }
  return hazir;
}

// --- veri denetimi (kisitlar.betik veriDenetimi ve sayfanın denetimBulgulari): çözücüden önce kısıtların birlikte sınanması ---
export interface VeriBulgusu { k: string; t: string }
export function veriDenetimi(c: PlanlamaCalismasi, cx: Derleme): VeriBulgusu[] {
  const D = cx.g.D; const out: VeriBulgusu[] = []; const bul = (k: string, t: string) => out.push({ k, t });
  const kim: Record<string, Set<string>> = {};
  for (const p of D.personel ?? []) for (const g of p.gruplar ?? []) (kim[g] ??= new Set()).add(String(p.vardiya));
  const ayarci = new Set((D.personel ?? []).filter((p) => p.ayar).map((p) => String(p.vardiya)));
  const tumVardiya = [...new Set(Object.values(D.calismaGunleri ?? {}).flat().map(String))];
  for (const m of D.tezgahlar) {
    const vs = m.vardiyalar?.length ? m.vardiyalar : tumVardiya;
    const op = m.opOran == null ? 1 : Number(m.opOran);
    for (const v of vs) {
      if (op > 0 && !kim[m.grup ?? '']?.has(v)) bul('personel', `${m.id} ${v} vardiyasında açık ama ${m.grup ?? ''} yetkinliğinde personel yok; bu vardiyadaki işler yerleşemez.`);
      if (!ayarci.has(v)) bul('ayarci', `${m.id} ${v} vardiyasında ayarcı yok; ayar bu vardiyada yapılamaz.`);
    }
  }
  const aparat = new Set((Array.isArray(D.aparatlar) ? D.aparatlar : []).filter(nesne).map((a) => String(a.id)));
  const ops = Object.values(cx.jobs).flatMap((j) => j.ops);
  for (const o of ops) {
    if (!o.c.length) bul('tezgah', `${o.id}: uygun tezgâh ya da fasoncu yok.`);
    if (o.aparat && !aparat.has(o.aparat)) bul('aparat', `${o.id}: ${o.aparat} aparatı tanımlı değil.`);
  }
  for (const u of D.urunler) for (const o of u.rota ?? []) for (const b of o.bag ?? []) if (!(u.rota ?? []).some((x) => x.k === b[0])) bul('rota', `${u.id} ${o.k}: öncül ${String(b[0])} rotada yok.`);
  const fam: Record<string, Set<string>> = {};
  for (const o of ops) if (o.aile) for (const m of o.c) if (!m.startsWith('@')) (fam[m] ??= new Set()).add(o.aile);
  const mx = new Set((Array.isArray(D.ayarMatrisi) ? D.ayarMatrisi : []).filter(nesne).map((e) => `${String(e.den)}|${String(e.ye)}`));
  let eksik = 0;
  for (const a of Object.values(fam)) for (const x of a) for (const y of a) if (x !== y && !mx.has(`${x}|${y}`)) eksik++;
  if (eksik) bul('ayar', `${eksik} aile geçişinin ayar süresi matriste yok; tam ayar alınır.`);
  for (const [j, t] of Object.entries(malzemeHazir(cx))) if (!Number.isFinite(t)) bul('malzeme', `${j}: malzeme stok ve siparişle karşılanmıyor.`);
  for (const f of D.fasoncular ?? []) if (!f.cikisGunleri?.length) bul('fason', `${f.id}: çıkış günü yok.`);
  for (const s of c.D.siparisler) {
    if (!c.D.urunler.some((u) => u.id === s.urun)) bul('tezgah', `${s.id}: ürün ${s.urun} tanımlı değil; sipariş planlanmaz.`);
    if (!s.termin) bul('amac', `${s.id}: termin yok; gecikmesi ölçülemez.`);
  }
  for (const u of c.D.urunler) if (!u.rota?.length) bul('rota', `${u.id}: rotada adım yok.`);
  return out;
}

// --- gecikmenin kaynağı (n-karar.betik gecikmeKaynaklari): geciken siparişin zincirinde en çok beklenen yer, öncelik ağırlıklı saat ---
export interface GecikmeKaynagi { ad: string; k: SureKategorisi; v: number; n: number }
export function gecikmeKaynaklari(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme): { liste: GecikmeKaynagi[]; is: Record<string, { ad: string; k: SureKategorisi; v: number } | null> } {
  const top: Record<string, GecikmeKaynagi> = {}; const is: Record<string, { ad: string; k: SureKategorisi; v: number } | null> = {};
  for (const s of c.D.siparisler) {
    const j = p.J[s.id]; if (!j || !((j.T ?? 0) > 0.05)) continue;
    const a = ayristir(p, cx, s.id); if (!a || a === 'eksik') continue;
    const w = isAgirligi(s); let en: { ad: string; k: SureKategorisi; v: number } | null = null;
    const yer: Record<string, { k: SureKategorisi; v: number }> = {};
    for (const [k, ad, v] of a.kaynak) { const x = (yer[ad] ??= { k, v: 0 }); x.v += v; }
    for (const [ad, x] of Object.entries(yer)) {
      const t = (top[ad] ??= { ad, k: x.k, v: 0, n: 0 }); t.v += x.v * w; t.n++;
      if (!en || x.v > en.v) en = { ad, ...x };
    }
    is[s.id] = en;
  }
  return { liste: Object.values(top).sort((a, b) => b.v - a.v), is };
}

// Grup doluluğu (m-plan.betik grupDoluluk): planın dolu ve açık saatlerinden, en doludan.
export function grupDoluluk(c: PlanlamaCalismasi, p: OkunanPlan): { ad: string; u: number }[] {
  const g: Record<string, { b: number; o: number }> = {};
  for (const m of c.D.tezgahlar) { const u = p.util[m.id]; if (!u) continue; const x = (g[m.grup ?? ''] ??= { b: 0, o: 0 }); x.b += u.busy; x.o += u.open; }
  return Object.entries(g).map(([ad, x]) => ({ ad, u: x.o ? x.b / x.o : 0 })).sort((a, b) => b.u - a.u);
}

// --- kararlar (n-karar.betik sorunlar): planın sorunları, önem sırasıyla değil ekleniş sırasıyla; Yapılacaklar ilk eylemi gösterir ---
const KISIT_AD: Record<string, string> = {
  tek: 'Tezgâhta aynı anda tek iş', uygun: 'Tezgâh uygunluğu, alternatif tezgâh ve farklı süre', vardiya: 'Vardiya ve çalışma günü', tvardiya: 'Tezgâhın kendi vardiyası',
  tatil: 'Tatil günleri', ariza: 'Arıza ve planlı bakım', isiksiz: 'Işıksız (gözetimsiz) çalışma', ekmesai: 'Ek mesai', tampon: 'Arıza payı ve termin tamponu',
  toplu: 'Toplu işlem (fırın partisi)', enerji: 'Enerji ve puant saat', personel: 'Operatör sayısı', yetkin: 'Operatör yetkinliği (tezgâh grubu)', devam: 'Devamsızlık',
  ayarci: 'Ayarcı sayısı', cokmakine: 'Çok tezgâha bakan operatör', verim: 'Kişiye göre verim', aparat: 'Bağlama aparatı ve fikstür adedi',
  program: 'NC programının hazır olması', fai: 'İlk parça onayı', cmm: 'CMM ve ölçüm kapasitesi', takim: 'Kesici takım ve magazin', omur: 'Takım ömrü',
  kalibrasyon: 'Ölçü aleti ve kalibrasyon', malzeme: 'Malzeme hazır olması', serbest: 'Serbest bırakma zamanı', rota: 'Rota sırası (bitince başla)',
  ortusme: 'Örtüşmeli geçiş ve son parti kuralı', tasima: 'Taşıma süresi', fasonGun: 'Fason çıkış günü ve süresi', fasonKap: 'Fason kapasitesi',
  fasonTalas: 'Talaşlı işi fasona verme', bekleme: 'En az ve en çok bekleme (soğuma, kuruma)', nowait: 'Ara beklemesiz akış', bolme: 'Parti bölme',
  wip: 'Alan ve WIP sınırı', ayar: 'Ayar süresi', sdst: 'Sıraya bağlı ayar (aile matrisi)', aile: 'Aynı aile kısalması', kampanya: 'Kampanya uzunluğu (en az, en çok)',
  termin: 'Termin ve öncelik ağırlığı', dondurma: 'Dondurulmuş bölge', kilit: 'Elle kilit', degisim: 'Değişiklik bütçesi (canlıya göre)', belge: 'Belge onayı',
  karantina: 'Kalite bekletme', yeniden: 'Yeniden işleme',
};
export const kisitAdi = (id: string): string => KISIT_AD[id] ?? id;
export type SorunTonu = 'hata' | 'uyari' | 'bilgi';
// Eylem türü: `motor` plan motoru ister (357 b), `git` sayfa içi görünüme gider, `sec` siparişi seçer, öteki çalışmaya yazar.
export type SorunEylemi = 'ekip' | 'kisit-hepsi' | 'git' | 'one-al' | 'sec-is' | 'suz-gec' | 'hs-mesai' | 'durus-kaldir' | 'olay-kaldir';
export interface Sorun { ton: SorunTonu; simge: 'rotate' | 'alert' | 'flag' | 'box' | 'gauge' | 'wrench' | 'scan'; baslik: string; eylem: { ad: string; tur: SorunEylemi; v: string } }
export function olayAdi(c: PlanlamaCalismasi, ev: ExtraAlanlar): string {
  const D = c.D;
  if (ev.tip === 'malzeme') { const m = (D.malzemeler ?? []).find((x) => x.kod === ev.kod); return `${m?.ad ?? String(ev.kod)}: satın alma ${String(ev.gun)} gün gecikti`; }
  if (ev.tip === 'eksik') return `${saatYaz(D, Number(ev.gun) * 24).slice(0, 9)} ${String(ev.vardiya)}: ${String(ev.n)} ${ev.grup === 'ayar' ? 'ayarcı' : `${String(ev.grup)} personeli`} eksik`;
  if (ev.tip === 'fason') return `${String(ev.f)} teslim süresi +${String(ev.gun)} gün`;
  return String(ev.tip);
}
export function sorunlar(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme, guncel: boolean): Sorun[] {
  const D = c.D; const out: Sorun[] = [];
  const ekle = (ton: SorunTonu, simge: Sorun['simge'], baslik: string, ad: string, tur: SorunEylemi, v = '') => out.push({ ton, simge, baslik, eylem: { ad, tur, v } });
  if (!guncel) ekle('uyari', 'rotate', 'Plan eski veriyle hesaplı', 'Planı iyileştir', 'ekip');
  if (c.kapali.length) ekle('hata', 'alert', `${c.kapali.length} kısıt kapalı`, 'Hepsini aç', 'kisit-hepsi');
  if (p.fail.length) ekle('hata', 'alert', `${p.fail.length} işlem planlanamadı`, 'Veri denetimi', 'git', 'denetim');
  const gec = D.siparisler.map((s) => ({ s, j: p.J[s.id] })).filter((x): x is { s: Siparis; j: NonNullable<typeof x.j> } => !!x.j && (x.j.T == null || x.j.T > 0.05))
    .sort((a, b) => (b.j.T ?? 1e4) * isAgirligi(b.s) - (a.j.T ?? 1e4) * isAgirligi(a.s));
  for (const { s, j } of gec.slice(0, 3)) ekle('hata', 'flag', `${s.id} ${j.T == null ? 'planlanamadı' : `${saatYazi(j.T)} gecikiyor`}`, 'Öne almayı dene', 'one-al', s.id);
  if (gec.length > 3) ekle('uyari', 'flag', `${gec.length - 3} sipariş daha gecikiyor`, 'Gecikenleri göster', 'suz-gec');
  const malJ = [...new Set(p.warn.filter((w) => w.t === 'malzeme').map((w) => w.j ?? ''))];
  if (malJ.length) ekle('uyari', 'box', `${malJ.length} siparişin malzemesi eksik`, 'Ayrıntı', 'sec-is', malJ[0]);
  const dol = grupDoluluk(c, p).filter((g) => g.u > 0.88);
  if (dol.length || gecikmeKaynaklari(c, p, cx).liste.some((x) => x.k === 'tezgah')) ekle('uyari', 'gauge', 'Darboğaz', 'Ek mesai öner', 'hs-mesai');
  c.down.forEach((d, i) => { if ((sayi(d.to) ?? 0) > 7) ekle('bilgi', 'wrench', `${String(d.m)} duruşta`, 'Duruşu kaldır', 'durus-kaldir', String(i)); });
  c.olaylar.forEach((ev, i) => ekle('bilgi', 'alert', olayAdi(c, ev), 'Olayı kaldır', 'olay-kaldir', String(i)));
  const den = veriDenetimi(c, cx);
  if (den.length) ekle('uyari', 'scan', `${den.length} veri bulgusu`, 'Veri denetimi', 'git', 'denetim');
  return out;
}
