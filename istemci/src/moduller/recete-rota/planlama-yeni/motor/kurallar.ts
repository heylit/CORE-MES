import type { ExtraAlanlar, PlanlamaCalismasi, PlanVerisi } from '../tipler.ts';

// P1'in saf hesapları: kayıttaki çözülmüş planın (calisma.plan; c-masa.betik planKaydi) okunması ve tahta, tezgâh panosu, özet için
// türetilen değerler. Plan saat eksenlidir: 0, D.meta.baslangic günü 00:00 duvar saatidir (engine.betik baseMs, parseT, fmtDT).
// Motor burada koşmaz (iskelet: plan motoru sunucudadır); yalnız var olan plan okunur.

// Planın işlem kaydı (c-masa.betik opKaydi). `m` tezgâh kimliği, fasonda `@fasoncu`.
export interface PlanIslemi {
  id: string; job: string; m: string; S: number; C: number;
  su?: number; run?: number; fas?: number; pin?: number; done?: number; act?: number;
  why?: { t: string; r?: string } | null;
}
export interface PlanOzeti { wT: number; late: number; n: number; suH?: number; Cmax?: number; tl?: number }
export interface OkunanPlan {
  ops: Record<string, PlanIslemi>;
  fail: string[];
  ozet: PlanOzeti;
  J: Record<string, { C: number | null; T: number }>;
  util: Record<string, { u: number }>;
  warn: { t?: string; m?: string; job?: string; metin?: string }[];
  dataVer: number;
  zaman: number | null;
  kim: string | null;
}

const nesne = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const sayi = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const metin = (v: unknown): string | null => (typeof v === 'string' ? v : null);

// Kayıttaki planı daraltır. Biçimi bozuk işlem (saatsiz, tezgâhsız) okunmaz; özet yoksa plan yok sayılır (sıfır uydurulmaz).
export function planOku(c: PlanlamaCalismasi | null): OkunanPlan | null {
  const p = c?.plan;
  if (!p || !nesne(p.ops) || !nesne(p.ozet)) return null;
  const ops: Record<string, PlanIslemi> = {};
  for (const [id, r] of Object.entries(p.ops)) {
    if (!nesne(r)) continue;
    const S = sayi(r.S), C = sayi(r.C), m = metin(r.m), job = metin(r.job);
    if (S === null || C === null || m === null || job === null) continue;
    const why = nesne(r.why) && typeof r.why.t === 'string' ? { t: r.why.t, ...(typeof r.why.r === 'string' ? { r: r.why.r } : {}) } : null;
    ops[id] = {
      id, job, m, S, C, why,
      ...(sayi(r.su) !== null ? { su: r.su as number } : {}), ...(sayi(r.run) !== null ? { run: r.run as number } : {}),
      fas: r.fas ? 1 : 0, pin: r.pin ? 1 : 0, done: r.done ? 1 : 0, act: r.act ? 1 : 0,
    };
  }
  const o = p.ozet;
  const ozet: PlanOzeti = {
    wT: sayi(o.wT) ?? 0, late: sayi(o.late) ?? 0, n: sayi(o.n) ?? Object.keys(nesne(p.J) ? p.J : {}).length,
    ...(sayi(o.suH) !== null ? { suH: o.suH as number } : {}), ...(sayi(o.Cmax) !== null ? { Cmax: o.Cmax as number } : {}),
    ...(sayi(o.tl) !== null ? { tl: o.tl as number } : {}),
  };
  const J: OkunanPlan['J'] = {};
  if (nesne(p.J)) for (const [j, x] of Object.entries(p.J)) if (nesne(x)) J[j] = { C: sayi(x.C), T: sayi(x.T) ?? 0 };
  const util: OkunanPlan['util'] = {};
  if (nesne(p.util)) for (const [m, x] of Object.entries(p.util)) if (nesne(x) && sayi(x.u) !== null) util[m] = { u: x.u as number };
  return {
    ops, J, util, ozet,
    fail: Array.isArray(p.fail) ? p.fail.filter((x): x is string => typeof x === 'string') : [],
    warn: Array.isArray(p.warn) ? (p.warn.filter(nesne) as OkunanPlan['warn']) : [],
    dataVer: p.dataVer, zaman: sayi(p.zaman), kim: metin(p.kim),
  };
}

// --- saat ---
const GUNLER = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const iki = (n: number) => String(n).padStart(2, '0');
// Düzenli ifade grubunun sayısı; eşleşmeyen grup 0.
const n = (g: string | undefined): number => (g === undefined ? 0 : Number(g));

// Planın 0 saati (UTC ile kodlanmış duvar saati, engine.betik baseMs). Başlangıç yoksa null.
export function tabanMs(D: PlanVerisi): number | null {
  const b = D.meta?.baslangic;
  const m = typeof b === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(b) : null;
  return m ? Date.UTC(n(m[1]), n(m[2]) - 1, n(m[3])) : null;
}

// "22.10 Per 09:00" (fmtDT). Saat yoksa ya da sonsuzsa "—".
export function saatYaz(D: PlanVerisi, t: number | null | undefined): string {
  const b = tabanMs(D);
  if (b === null || t == null || !Number.isFinite(t)) return '—';
  const d = new Date(b + t * 3_600_000);
  return `${iki(d.getUTCDate())}.${iki(d.getUTCMonth() + 1)} ${GUNLER[(d.getUTCDay() + 6) % 7]} ${iki(d.getUTCHours())}:${iki(d.getUTCMinutes())}`;
}

export function gunYaz(D: PlanVerisi, t: number): string { return saatYaz(D, t).slice(0, 9); }

// Süre (saat) "3 sa", "45 dk", "2 g 4 sa".
export function sureYaz(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return '—';
  const a = Math.abs(h);
  if (a < 1) return `${Math.round(a * 60)} dk`;
  if (a < 48) return `${(Math.round(a * 10) / 10).toLocaleString('tr-TR')} sa`;
  const g = Math.floor(a / 24), s = Math.round(a - g * 24);
  return s ? `${g} g ${s} sa` : `${g} g`;
}

// Planın "şimdi"si: kaydın `simdi` alanı (girdi.betik baslangicKaydir), yoksa yerel duvar saatinin plan saati.
export function simdiSaati(c: PlanlamaCalismasi, an: number = Date.now()): number | null {
  const s = sayi((c as ExtraAlanlar).simdi);
  if (s !== null) return s;
  const b = tabanMs(c.D);
  if (b === null) return null;
  const d = new Date(an);
  return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()) - b) / 3_600_000;
}

// --- ufuk ---
export const UFUKLAR = [['gun', 'Gün', 24], ['hafta', 'Hafta', 168], ['ay', 'Ay', 720]] as const;
export type Ufuk = (typeof UFUKLAR)[number][0];
export const ufukSaati = (u: Ufuk): number => UFUKLAR.find((x) => x[0] === u)?.[2] ?? 168;

// --- tezgâhlar ---
export interface TezgahOzeti {
  id: string; ad: string; grup: string; fason: boolean;
  doluluk: number | null;
  kuyruk: PlanIslemi[];
  gecikenSiparis: number;
  ariza: boolean;
}

export const tezgahKodu = (m: string): string => (m.startsWith('@') ? m.slice(1) : m);

const gecikiyor = (p: OkunanPlan, job: string): boolean => { const j = p.J[job]; return j !== undefined && (j.C === null || j.T > 0.05); };

// Tezgâhın önümüzdeki kuyruğu (bitmemiş işler, başlangıç sırasıyla; o-tahta tbKart).
export function kuyruk(p: OkunanPlan, m: string, simdi: number): PlanIslemi[] {
  return Object.values(p.ops).filter((r) => r.m === m && r.C > simdi).sort((a, b) => a.S - b.S);
}

// Tezgâhlar ve plana giren fasoncular; grup istasyondur, fason ayrı gruptur (o-tahta tbYerlesim).
export function tezgahlar(c: PlanlamaCalismasi, p: OkunanPlan, simdi: number): TezgahOzeti[] {
  const D = c.D;
  const down = c.down as { m?: unknown; to?: unknown }[];
  const ozet = (id: string, ad: string, grup: string, fason: boolean): TezgahOzeti => {
    const k = kuyruk(p, id, simdi);
    return {
      id, ad, grup, fason, doluluk: p.util[id]?.u ?? null, kuyruk: k,
      gecikenSiparis: new Set(k.filter((r) => gecikiyor(p, r.job)).map((r) => r.job)).size,
      ariza: down.some((d) => d.m === id && typeof d.to === 'number' && d.to > simdi),
    };
  };
  const l = D.tezgahlar.map((t) => ozet(t.id, t.ad ?? t.id, t.grup ?? 'Grupsuz', false));
  const kullanilan = new Set(Object.values(p.ops).map((r) => r.m));
  for (const f of D.fasoncular ?? []) if (kullanilan.has('@' + f.id)) l.push(ozet('@' + f.id, f.ad ?? f.id, 'fason', true));
  return l;
}

export interface GrupOzeti { ad: string; tezgahlar: TezgahOzeti[]; doluluk: number | null }

// Gruplar rotadaki ortalama sıralarıyla dizilir (o-tahta tbYerlesim: adımın rota içindeki yeri / adım sayısı).
export function gruplar(t: readonly TezgahOzeti[], p: OkunanPlan): GrupOzeti[] {
  const grubu = new Map(t.map((x) => [x.id, x.grup]));
  const isler = new Map<string, PlanIslemi[]>();
  for (const r of Object.values(p.ops)) { const l = isler.get(r.job) ?? []; l.push(r); isler.set(r.job, l); }
  const top = new Map<string, number>(), say = new Map<string, number>();
  for (const l of isler.values()) {
    l.sort((a, b) => a.S - b.S);
    l.forEach((r, i) => {
      const g = grubu.get(r.m); if (g === undefined) return;
      top.set(g, (top.get(g) ?? 0) + i / Math.max(1, l.length - 1)); say.set(g, (say.get(g) ?? 0) + 1);
    });
  }
  const sira = (g: string) => (say.get(g) ? (top.get(g) ?? 0) / (say.get(g) ?? 1) : 0.5);
  const m = new Map<string, TezgahOzeti[]>();
  for (const x of t) { const l = m.get(x.grup) ?? []; l.push(x); m.set(x.grup, l); }
  return [...m.entries()].sort((a, b) => sira(a[0]) - sira(b[0])).map(([ad, l]) => {
    const d = l.map((x) => x.doluluk).filter((x): x is number => x !== null);
    return { ad, tezgahlar: l, doluluk: d.length ? d.reduce((a, b) => a + b, 0) / d.length : null };
  });
}

// Isı seviyesi (k-gorunum isiSeviye eşikleri 0,05 / 0,35 / 0,65 / 0,9): boş, düşük, orta, yüksek, aşırı.
export function isiSeviyesi(u: number | null): 'yok' | 'dusuk' | 'orta' | 'yuksek' | 'asiri' {
  if (u === null || u < 0.05) return 'yok';
  return u < 0.35 ? 'dusuk' : u < 0.65 ? 'orta' : u < 0.9 ? 'yuksek' : 'asiri';
}

// --- siparişler ---
export type SiparisDurumu = 'gec' | 'risk' | 'iyi';
// Termine bundan az pay kalan zamanında sipariş risklidir (zz36 sipBilgi: 8 sa).
export const RISK_PAYI = 8;

export interface SiparisOzeti {
  id: string; urun: string; adet: number;
  oncelik: number | null;
  ilk: number | null; bitis: number | null; termin: number | null;
  gecikme: number; pay: number | null; durum: SiparisDurumu;
  adimlar: PlanIslemi[];
}

export function terminSaati(D: PlanVerisi, s: string | null | undefined): number | null {
  const b = tabanMs(D);
  const m = typeof s === 'string' ? /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(s.trim()) : null;
  if (b === null || !m) return null;
  return (Date.UTC(n(m[1]), n(m[2]) - 1, n(m[3]), n(m[4]), n(m[5])) - b) / 3_600_000;
}

// Planı olan siparişler: gecikene, sonra en az paya göre (zz36 siparisler).
export function siparisler(c: PlanlamaCalismasi, p: OkunanPlan): SiparisOzeti[] {
  const D = c.D;
  const urunAdi = new Map(D.urunler.map((u) => [u.id, u.ad ?? u.id]));
  const adim = new Map<string, PlanIslemi[]>();
  for (const r of Object.values(p.ops)) { const l = adim.get(r.job) ?? []; l.push(r); adim.set(r.job, l); }
  const l: SiparisOzeti[] = [];
  for (const s of D.siparisler) {
    const a = (adim.get(s.id) ?? []).sort((x, y) => x.S - y.S);
    const J = p.J[s.id];
    if (!a.length && J === undefined) continue;
    const bitis = J?.C ?? (a.length ? Math.max(...a.map((r) => r.C)) : null);
    const termin = terminSaati(D, s.termin);
    const gecikme = J?.T ?? 0;
    const pay = termin !== null && bitis !== null ? termin - bitis : null;
    const durum: SiparisDurumu = gecikme > 0.01 || bitis === null ? 'gec' : pay !== null && pay < RISK_PAYI ? 'risk' : 'iyi';
    l.push({
      id: s.id, urun: urunAdi.get(s.urun) ?? s.urun, adet: s.adet, oncelik: s.oncelik ?? null,
      ilk: a[0]?.S ?? null, bitis, termin, gecikme, pay, durum, adimlar: a,
    });
  }
  return l.sort((a, b) => b.gecikme - a.gecikme || (a.pay ?? 1e9) - (b.pay ?? 1e9));
}

// Siparişin yolu: adımlar ve aradaki bekleme (o-tahta tbOdakSeridi). Bekleme bir önceki adımın bitişinden bu adımın başına.
export interface YolAdimi { islem: PlanIslemi; bekleme: number | null }
export function yol(s: SiparisOzeti): { adimlar: YolAdimi[]; islem: number; bekleme: number } {
  const adimlar = s.adimlar.map((r, i) => ({ islem: r, bekleme: i ? r.S - (s.adimlar[i - 1]?.C ?? r.S) : null }));
  const islem = s.adimlar.reduce((t, r) => t + (r.C - r.S), 0);
  const ilk = s.adimlar[0], son = s.adimlar.at(-1);
  const top = ilk && son ? son.C - ilk.S : 0;
  return { adimlar, islem, bekleme: Math.max(0, top - islem) };
}

// --- özet (Plan nasıl gidiyor?) ---
export interface PlanSayilari {
  siparis: number; zamaninda: number; gec: number; gecikme: number;
  ortDoluluk: number | null; enYogun: { id: string; u: number } | null;
  ayar: number | null; sonBitis: number | null; yerlesmeyen: number;
}
export function planSayilari(c: PlanlamaCalismasi, p: OkunanPlan): PlanSayilari {
  const tez = new Set(c.D.tezgahlar.map((t) => t.id));
  const u = Object.entries(p.util).filter(([m, x]) => tez.has(m) && x.u > 0);
  const en = u.reduce<{ id: string; u: number } | null>((a, [m, x]) => (!a || x.u > a.u ? { id: m, u: x.u } : a), null);
  const C = Object.values(p.ops).map((r) => r.C);
  return {
    siparis: p.ozet.n, gec: p.ozet.late, zamaninda: Math.max(0, p.ozet.n - p.ozet.late), gecikme: p.ozet.wT,
    ortDoluluk: u.length ? u.reduce((t, [, x]) => t + x.u, 0) / u.length : null, enYogun: en,
    ayar: p.ozet.suH ?? null, sonBitis: p.ozet.Cmax ?? (C.length ? Math.max(...C) : null), yerlesmeyen: p.fail.length,
  };
}

// --- yapılacaklar (karar paneli) ---
export interface Yapilacak { anahtar: string; ton: 'hata' | 'uyari'; simge: 'alert' | 'flag' | 'box' | 'clock'; baslik: string; metin: string; siparis?: string; tezgah?: string }

export function yapilacaklar(c: PlanlamaCalismasi, p: OkunanPlan, s: readonly SiparisOzeti[], guncel: boolean): Yapilacak[] {
  const l: Yapilacak[] = [];
  if (!guncel) l.push({ anahtar: 'bayat', ton: 'uyari', simge: 'clock', baslik: 'Veri plandan sonra değişti', metin: 'Plan yeniden çözülene dek saatler eskidir.' });
  if (p.fail.length) l.push({ anahtar: 'yerlesmeyen', ton: 'hata', simge: 'alert', baslik: `${p.fail.length} işlem planlanamadı`, metin: p.fail.slice(0, 4).join(', ') + (p.fail.length > 4 ? '…' : '') });
  for (const x of s.filter((y) => y.durum === 'gec').slice(0, 5)) {
    l.push({ anahtar: 'gec-' + x.id, ton: 'hata', simge: 'flag', baslik: `${x.id} ${sureYaz(x.gecikme)} gecikiyor`, metin: `${x.urun} · ${x.adet} adet`, siparis: x.id });
  }
  const kalan = s.filter((y) => y.durum === 'gec').length - 5;
  if (kalan > 0) l.push({ anahtar: 'gec-daha', ton: 'uyari', simge: 'flag', baslik: `${kalan} sipariş daha gecikiyor`, metin: 'Sipariş listesinde gecikene göre sıralı.' });
  const malzeme = p.warn.filter((w) => w.t === 'malzeme').length;
  if (malzeme) l.push({ anahtar: 'malzeme', ton: 'uyari', simge: 'box', baslik: `${malzeme} malzeme uyarısı`, metin: 'Malzemesi gelmeden başlayan işler var.' });
  void c;
  return l;
}

// --- karar alanları (komut.degistir ile yazılır; tercih ve karar alanları planlamanındır, 221 c) ---
export interface Kilit { m: string; S: number }

export function kilitliMi(c: PlanlamaCalismasi, id: string): boolean { return Object.hasOwn(c.locks, id); }

// İşi bugünkü yerinde sabitler ya da sabitini kaldırır (c-masa.betik: locks[id] = { m, S }).
export function kilitDegistir(taslak: PlanlamaCalismasi, r: PlanIslemi): void {
  if (Object.hasOwn(taslak.locks, r.id)) delete taslak.locks[r.id];
  else taslak.locks[r.id] = { m: r.m, S: r.S } satisfies Kilit;
}

export interface Ariza { m: string; from: number; to: number }

// Arıza ya da bakım penceresi (05-olaylar: down.push, başlangıca göre sıralı). Bitiş başlangıçtan önce olamaz.
export function arizaEkle(taslak: PlanlamaCalismasi, a: Ariza): boolean {
  if (!(a.to > a.from)) return false;
  taslak.down = [...taslak.down, { m: a.m, from: a.from, to: a.to }].sort((x, y) => (x.from as number) - (y.from as number));
  return true;
}

export function arizaKaldir(taslak: PlanlamaCalismasi, i: number): boolean {
  if (i < 0 || i >= taslak.down.length) return false;
  taslak.down = taslak.down.filter((_, k) => k !== i);
  return true;
}

export function arizalar(c: PlanlamaCalismasi, m: string): { i: number; from: number; to: number }[] {
  return c.down.flatMap((d, i) => (d.m === m && typeof d.from === 'number' && typeof d.to === 'number' ? [{ i, from: d.from, to: d.to }] : []));
}

// "2026-10-24T09:30" (datetime-local) -> plan saati.
export function girdiSaati(D: PlanVerisi, deger: string): number | null {
  return terminSaati(D, deger.replace('T', ' '));
}
export function girdiDegeri(D: PlanVerisi, t: number): string {
  const b = tabanMs(D);
  if (b === null) return '';
  const d = new Date(b + t * 3_600_000);
  return `${d.getUTCFullYear()}-${iki(d.getUTCMonth() + 1)}-${iki(d.getUTCDate())}T${iki(d.getUTCHours())}:${iki(d.getUTCMinutes())}`;
}
