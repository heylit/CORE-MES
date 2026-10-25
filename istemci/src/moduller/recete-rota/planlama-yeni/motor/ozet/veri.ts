import type { PlanlamaCalismasi } from '../../tipler.ts';
import {
  ayristir, donemAraligi, KATEGORI_AD, nabizOlc, saatYaz, saKisa, sayiEki, type Derleme, type Donem, type OkunanPlan, type PlanIslemi, type SureKategorisi,
} from '../kurallar.ts';

// Özet'in hesabı (zf-resim.betik brVeri ve bölgeleri, zs-olcek-ortak dönem): bütün hesap tek yerde, seçili dönemle. Metin parçası
// düz yazı ya da kalın (`{ b }`); eski sayfanın <b> vurgusu.
export type Parca = string | { b: string };
export type Metin = Parca[];

const GRUP_AD: Record<string, string> = {
  testere: 'Testere', torna: 'Torna', freze: 'Freze', '5eksen': '5 eksen', taslama: 'Taşlama', tesviye: 'Tesviye', yikama: 'Yıkama', olcum: 'Ölçüm', fason: 'Fason',
};
export const grupAdi = (g: string): string => GRUP_AD[g] ?? g;

export interface OzetAdimi { j: string; m: string; g: string; S: number; C: number; su: number; run: number; bek: number }
export interface OzetSiparisi {
  id: string; urun: string; adim: OzetAdimi[]; S: number; C: number; due: number | null; T: number; gec: boolean; yol: string[];
  seg: Partial<Record<SureKategorisi, number>> | null; kaynak: [SureKategorisi, string, number][];
}
export interface OzetVerisi {
  now: number; T0: number; H1: number; gun: number; kova: number; gunAd: string[]; gruplar: string[];
  sip: OzetSiparisi[]; yok: { id: string; adim: number }[]; yokAdim: number;
  yuk: { m: string; grup: string; g: (number | null)[] }[];
  u: [string, number][];
  ops: { m: string; job: string; S: number; C: number; su: number }[];
  oz: { suH: number | null; suN: number; famN: number | null; Cmax: number | null };
}

export function ozetVerisi(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme, donem: Donem, kayma: number): OzetVerisi {
  const D = c.D; const now = cx.now;
  const tezGrup = new Map(D.tezgahlar.map((t) => [t.id, t.grup ?? 'diger']));
  const grup = (m: string) => (m.startsWith('@') ? 'fason' : tezGrup.get(m) ?? 'diger');
  const urunAd = new Map(D.urunler.map((u) => [u.id, u.ad ?? u.id]));
  const isler0 = D.siparisler.filter((s) => !s.havuz && p.J[s.id] && cx.jobs[s.id]);
  const eksik = (id: string) => (cx.jobs[id]?.ops ?? []).filter((o) => { const r = p.ops[o.id]; return !r || !Number.isFinite(r.S) || !Number.isFinite(r.C); }).length;
  const yok = isler0.map((s) => ({ id: s.id, adim: eksik(s.id) })).filter((x) => { const C = p.J[x.id]?.C; return x.adim > 0 || C == null || !Number.isFinite(C); });
  const isler = isler0.filter((s) => !yok.some((x) => x.id === s.id));
  const ops = Object.values(p.ops).filter((r) => Number.isFinite(r.S) && Number.isFinite(r.C));
  // Grupların rotadaki ortalama yeri satır sırasıdır.
  const yer: Record<string, number[]> = {};
  for (const s of isler) {
    const l = (cx.jobs[s.id]?.ops ?? []).map((o) => p.ops[o.id]).filter((r): r is PlanIslemi => r !== undefined);
    l.forEach((r, i) => (yer[grup(r.m)] ??= []).push(l.length > 1 ? i / (l.length - 1) : 0));
  }
  const ort = (l: number[]) => l.reduce((x, y) => x + y, 0) / l.length;
  const gruplar = Object.keys(yer).sort((a, b) => ort(yer[a] ?? []) - ort(yer[b] ?? []));
  const sip0: OzetSiparisi[] = isler.map((s) => {
    const j = cx.jobs[s.id]; const J = p.J[s.id];
    const l = (j?.ops ?? []).map((o) => p.ops[o.id]).filter((r): r is PlanIslemi => r !== undefined && Number.isFinite(r.S)).sort((a, b) => a.S - b.S);
    const yol: string[] = []; for (const r of l) { const g = grup(r.m); if (yol[yol.length - 1] !== g) yol.push(g); }
    const a = ayristir(p, cx, s.id);
    const adim = l.map((r, i) => ({ j: s.id, m: r.m, g: grup(r.m), S: r.S, C: r.C, su: r.su, run: r.run, bek: Math.max(0, r.S - (i ? l[i - 1]?.C ?? 0 : Math.max(now, Math.min(r.S, now)))) }));
    const T = J?.T ?? 0;
    return {
      id: s.id, urun: urunAd.get(s.urun) ?? s.urun ?? '—', adim, S: l[0]?.S ?? now, C: J?.C ?? Number.NaN, due: j?.due ?? null, T, gec: T > 0.05, yol,
      seg: a && a !== 'eksik' ? a.seg : null, kaynak: a && a !== 'eksik' ? a.kaynak : [],
    };
  });
  // Dönem: Özet seçili dönemi gösterir; yılda gün yerine hafta sütunu, günde üçer saatlik sekiz sütun (zz5-olcek-her-yer brVeri).
  const r = donemAraligi(now, donem, kayma);
  const kova = donem === 'yil' ? 7 : donem === 'gun' ? 3 / 24 : 1; const gun = donem === 'gun' ? 8 : Math.max(1, Math.round((r.b - r.a) / 24 / kova));
  const acikS = (m: string, x: number, z: number) => { const W = cx.M[m]?.rw; return z <= x ? 0 : W ? acik(W, x, z) : z - x; };
  const yuk = D.tezgahlar.filter((t) => ops.some((o) => o.m === t.id)).map((t) => ({
    m: t.id, grup: t.grup ?? '',
    g: Array.from({ length: gun }, (_, d) => {
      const x = r.a + d * kova * 24, z = x + kova * 24; const ac = acikS(t.id, x, z); if (ac < 0.01) return null;
      let dolu = 0; for (const o of ops) if (o.m === t.id) dolu += acikS(t.id, Math.max(x, o.S), Math.min(z, o.C));
      return dolu / ac;
    }),
  }));
  const gunAd = Array.from({ length: gun }, (_, d) => {
    if (donem === 'gun') return `${String((d * 3) % 24).padStart(2, '0')}:00`;
    const g = saatYaz(D, r.a + d * kova * 24 + 1);
    return kova === 1 ? g.slice(6, 9) : Number(g.slice(0, 2)) <= 7 ? AY[Number(g.slice(3, 5)) - 1] ?? '' : '';
  });
  const sip = sip0.filter((s) => s.S < r.b && Math.max(Number.isFinite(s.C) ? s.C : s.S, s.due ?? 0) > r.a);
  const w = nabizOlc({ J: p.J, ops: p.ops }, new Set(sip.map((s) => s.id)), cx, r);
  return {
    now, T0: r.a, H1: r.b, gun, kova, gunAd, gruplar, sip, yok, yokAdim: yok.reduce((t, x) => t + x.adim, 0), yuk,
    u: Object.entries(w.util),
    ops: ops.map((o) => ({ m: o.m, job: o.job, S: o.S, C: o.C, su: o.su })),
    oz: { suH: w.suH, suN: ops.filter((o) => o.su > 0 && o.S >= r.a && o.S < r.b).length, famN: null, Cmax: p.ozet.Cmax },
  };
}
const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
function acik(W: [number, number][], a: number, b: number) { let s = 0; for (const [x, y] of W) s += Math.max(0, Math.min(b, y) - Math.max(a, x)); return s; }

// Zaman çubuğunda konum, 0-1 (brX).
export const konum = (v: OzetVerisi, t: number): number => Math.max(0, Math.min(1, (t - v.T0) / (v.H1 - v.T0)));
// Günün ortalama doluluğu (brGunOrt): kapalı tezgâh sayılmaz.
export function gunOrtalamasi(v: OzetVerisi): (number | null)[] {
  return v.gunAd.map((_, d) => { const l = v.yuk.map((y) => y.g[d]).filter((x): x is number => x != null); return l.length ? l.reduce((a, x) => a + Math.min(1, x), 0) / l.length : null; });
}
// Sütunun başladığı an.
export const sutunAni = (v: OzetVerisi, d: number): number => v.T0 + d * v.kova * 24 + 1;

// --- göstergeler (brKpi) ---
export interface Gosterge { simge: 'list' | 'alert' | 'check' | 'gauge' | 'cpu' | 'wrench' | 'flag'; ad: string; deger: string | number | null; ek: string; alt: string; ton: '' | 'hata' | 'tamam' | 'uyari' }
export function gostergeler(c: PlanlamaCalismasi, v: OzetVerisi, tezGrup: (m: string) => string): Gosterge[] {
  const n = v.sip.length, gec = v.sip.filter((s) => s.gec), zam = n - gec.length; const top = gec.reduce((a, s) => a + s.T, 0);
  const ort = v.u.length ? v.u.reduce((a, [, x]) => a + x, 0) / v.u.length : null; const dar = [...v.u].sort((a, b) => b[1] - a[1])[0];
  return [
    { simge: 'list', ad: 'Sipariş', deger: n + v.yok.length, ek: '', alt: v.yok.length ? `${n} tanesi tam yerleşti` : 'planda', ton: '' },
    ...(v.yok.length ? [{ simge: 'alert', ad: 'Yerleşmedi', deger: v.yok.length, ek: `${v.yokAdim} adım`, alt: 'kaynak ya da ufuk yetmedi', ton: 'hata' } as const] : []),
    { simge: 'check', ad: 'Zamanında', deger: zam, ek: `%${Math.round(zam / Math.max(1, n + v.yok.length) * 100)}`, alt: 'termininden önce biter', ton: 'tamam' },
    { simge: 'alert', ad: 'Geç', deger: gec.length, ek: saKisa(top), alt: 'toplam gecikme', ton: gec.length ? 'hata' : 'tamam' },
    { simge: 'gauge', ad: 'Ortalama doluluk', deger: ort == null ? null : Math.round(ort * 100), ek: '%', alt: 'çalışan tezgâhlarda', ton: '' },
    { simge: 'cpu', ad: 'En yoğun tezgâh', deger: dar ? dar[0] : '—', ek: dar ? `%${Math.round(dar[1] * 100)}` : '', alt: dar ? GRUP_AD[tezGrup(dar[0])] ?? '' : '', ton: 'uyari' },
    { simge: 'wrench', ad: 'Ayar', deger: Math.round(v.oz.suH ?? 0), ek: 'sa', alt: `${v.oz.suN} ayar${v.oz.famN != null ? `; aile ${v.oz.famN} kez kısalttı` : ' bu dönemde'}`, ton: '' },
    { simge: 'flag', ad: 'Son iş biter', deger: saatYaz(c.D, v.oz.Cmax).slice(6), ek: '', alt: 'planın sonu', ton: '' },
  ];
}

// Tahtanın anı (brCanli): çalışan tezgâh, üretimdeki sipariş, biten sipariş.
export function anOzeti(v: OzetVerisi, t: number) {
  const cal = v.ops.filter((r) => r.S <= t && r.C > t);
  return {
    tezgah: new Set(cal.filter((r) => !r.m.startsWith('@')).map((r) => r.m)).size, siparis: new Set(cal.map((r) => r.job)).size,
    biten: v.sip.filter((s) => s.C <= t).length, toplam: v.sip.length + v.yok.length, yok: v.yok.length,
  };
}

// --- seçim (brSecim): sipariş ya da tezgâh; bütün bölgeler buna göre yanar ---
export interface OzetSecimi { j: string | null; s: OzetSiparisi | null; m: string | null; hucre: Set<string>; tez: Set<string>; grup: Set<string>; sip: Set<string> }
export function secim(v: OzetVerisi, secJob: string | null, secTez: string | null, tezGrup: (m: string) => string): OzetSecimi | null {
  const s = secJob ? v.sip.find((x) => x.id === secJob) ?? null : null;
  const m = !s && secTez ? secTez : null; if (!s && !m) return null;
  const hucre = new Set<string>(), tez = new Set<string>(), grup = new Set<string>(), sip = new Set<string>();
  const adimlar = s ? s.adim : v.sip.flatMap((x) => x.adim.filter((a) => a.m === m));
  for (const a of adimlar) {
    tez.add(a.m); grup.add(a.g); sip.add(a.j);
    for (let d = Math.max(0, Math.floor((a.S - v.T0) / 24 / v.kova)); d < v.gun && v.T0 + d * v.kova * 24 < a.C; d++) hucre.add(`${a.m}|${d}`);
  }
  if (m) { tez.add(m); grup.add(m.startsWith('@') ? 'fason' : tezGrup(m)); }
  return { j: s?.id ?? null, s, m, hucre, tez, grup, sip };
}

// --- nerede bekliyor (brBekleVeri) ---
export interface BeklemeSatiri { id: string; isl: number; ayar: number; bek: number; bekG: number; sip: Record<string, number> }
export function beklemeler(v: OzetVerisi): BeklemeSatiri[] {
  const g: Record<string, BeklemeSatiri> = {};
  for (const id of v.gruplar) g[id] = { id, isl: 0, ayar: 0, bek: 0, bekG: 0, sip: {} };
  for (const s of v.sip) for (const a of s.adim) {
    const x = (g[a.g] ??= { id: a.g, isl: 0, ayar: 0, bek: 0, bekG: 0, sip: {} });
    x.isl += a.run; x.ayar += a.su; x.bek += a.bek; if (s.gec) x.bekG += a.bek; x.sip[s.id] = (x.sip[s.id] ?? 0) + a.bek;
  }
  return v.gruplar.map((id) => g[id]).filter((x) => x !== undefined);
}

// --- süre nereye gidiyor (brSure) ---
export function sureToplami(v: OzetVerisi): { sira: [SureKategorisi, number][]; hep: number } {
  const top: Partial<Record<SureKategorisi, number>> = {}; let hep = 0;
  for (const s of v.sip) if (s.seg) for (const [k, x] of Object.entries(s.seg) as [SureKategorisi, number][]) { top[k] = (top[k] ?? 0) + x; hep += x; }
  return { sira: (Object.entries(top) as [SureKategorisi, number][]).filter(([, x]) => x > 0.01).sort((a, b) => b[1] - a[1]), hep };
}

// --- veriden yorum (brYorum): her madde bir gözlem ve bir yön ---
export type YorumEylemi = 'br-git-sip' | 'br-git-tez' | 'br-rota';
export interface Yorum { simge: 'alert' | 'check' | 'target' | 'clock' | 'grid' | 'gauge' | 'wrench' | 'flag'; ton: 'hata' | 'tamam' | 'uyari' | 'bilgi'; m: Metin; eylem?: { tur: YorumEylemi; v: string | null; ad: string } }
export function yokMetni(v: OzetVerisi): Metin {
  if (!v.yok.length) return [];
  const l: Metin = [{ b: String(v.yok.length) }, ' siparişin ', { b: String(v.yokAdim) }, ' adımı yerleşmedi (kaynak ya da ufuk yetmedi): '];
  v.yok.slice(0, 4).forEach((x, i) => { if (i) l.push(', '); l.push({ b: x.id }); });
  l.push(`${v.yok.length > 4 ? '…' : ''}. Bu siparişler bitmiş ya da zamanında sayılmaz.`);
  return l;
}
export function yorumlar(c: PlanlamaCalismasi, v: OzetVerisi, tezGrup: (m: string) => string): Yorum[] {
  const D = c.D; const l: Yorum[] = []; const n = v.sip.length; const gec = v.sip.filter((s) => s.gec).sort((a, b) => b.T - a.T);
  if (v.yok.length) l.push({ simge: 'alert', ton: 'hata', m: yokMetni(v) });
  const g0 = gec[0];
  if (n) {
    l.push(g0 ? {
      simge: 'alert', ton: 'hata',
      m: [`${n} siparişin `, { b: String(n - gec.length) }, `${sayiEki(n - gec.length, 'i')} zamanında, `, { b: String(gec.length) }, `${sayiEki(gec.length, 'i')} geç. En çok geciken `, { b: g0.id }, ` (${g0.urun}), termininden `, { b: saKisa(g0.T) }, ' sonra bitiyor.'],
      eylem: { tur: 'br-git-sip', v: g0.id, ad: 'Tahtada göster' },
    } : { simge: 'check', ton: 'tamam', m: [`${v.yok.length ? 'Yerleşen ' : ''}${n} siparişin hepsi termininden önce bitiyor.`] });
  }
  const bek: Record<string, number> = {};
  for (const s of gec) for (const [k, ad, x] of s.kaynak) if (k !== 'isleme') bek[ad] = (bek[ad] ?? 0) + x;
  const bk = Object.entries(bek).sort((a, b) => b[1] - a[1]);
  const [b0, b1] = bk;
  if (b0) {
    const tz = D.tezgahlar.find((t) => t.id === b0[0]);
    l.push({
      simge: 'target', ton: 'uyari',
      m: ['Geç siparişleri en çok ', { b: b0[0] }, ' bekletiyor: toplam ', { b: saKisa(b0[1]) }, `.${b1 ? ` Sonra ${b1[0]} (${saKisa(b1[1])}).` : ''} Bu kaynağı rahatlatmak gecikmeyi en çok azaltır.`],
      ...(tz ? { eylem: { tur: 'br-git-tez', v: tz.id, ad: 'Tezgâha git' } as const } : {}),
    });
  }
  const { sira, hep } = sureToplami(v); const isl = sira.find(([k]) => k === 'isleme')?.[1] ?? 0;
  const en = sira.filter(([k]) => k !== 'isleme')[0];
  if (hep && en) {
    const y = isl / hep * 100;
    l.push({ simge: 'clock', ton: 'bilgi', m: ['Bir sipariş atölyede geçirdiği sürenin yalnız ', { b: `%${Math.round(y)}` }, `${sayiEki(y, 'inde')} işleniyor. En büyük pay `, { b: KATEGORI_AD[en[0]].toLowerCase() }, ` (%${Math.round(en[1] / hep * 100)}).`] });
  }
  const gt = gunOrtalamasi(v).map((x) => x ?? -1); const dmax = gt.indexOf(Math.max(...gt));
  if (v.yuk.length) {
    const o = (gt[dmax] ?? 0) * 100;
    l.push({ simge: 'grid', ton: 'bilgi', m: ['En yoğun gün ', { b: v.gunAd[dmax] ?? '' }, ` (${saatYaz(D, sutunAni(v, dmax)).slice(0, 5)}): tezgâhların ortalama `, { b: `%${Math.round(o)}` }, `${sayiEki(o, 'i')} dolu.`] });
  }
  const gu: Record<string, number[]> = {}; for (const [m, x] of v.u) (gu[tezGrup(m)] ??= []).push(x);
  const gl = Object.entries(gu).map(([g, a]): [string, number] => [g, a.reduce((x, y) => x + y, 0) / a.length]).sort((a, b) => a[1] - b[1]);
  const ilk = gl[0], son = gl[gl.length - 1];
  if (gl.length > 1 && ilk && son) {
    l.push({
      simge: 'gauge', ton: 'bilgi',
      m: ['En boş grup ', { b: grupAdi(ilk[0]) }, ` (%${Math.round(ilk[1] * 100)}), en dolu `, { b: grupAdi(son[0]) }, ` (%${Math.round(son[1] * 100)}). Dolu gruptaki adımlara boş gruptan alternatif tezgâh tanımlamak yükü dengeler.`],
      eylem: { tur: 'br-rota', v: null, ad: 'Reçete ve Rota' },
    });
  }
  if (v.oz.suN) l.push({ simge: 'wrench', ton: 'bilgi', m: ['Ayara ', { b: saatYaziKisa(v.oz.suH) }, ` gidiyor (${v.oz.suN} ayar).${v.oz.famN != null ? ` Aile sıralaması ${v.oz.famN} ayarı kısalttı.` : ''}`] });
  l.push({ simge: 'flag', ton: 'bilgi', m: ['Plandaki son işin bitişi: ', { b: saatYaz(D, v.oz.Cmax) }, '.'] });
  return l;
}
const saatYaziKisa = (h: number | null) => saKisa(h ?? 0);

// --- bölgenin cevabı (brCevap) ---
export type BolgeKimligi = 'ozet' | 'bekle' | 'yuk' | 'sure' | 'yaris' | 'yorum';
export function cevap(c: PlanlamaCalismasi, v: OzetVerisi, id: BolgeKimligi, yor: Yorum[]): Metin {
  const D = c.D; const n = v.sip.length, gec = v.sip.filter((s) => s.gec).sort((a, b) => b.T - a.T); const top = gec.reduce((a, s) => a + s.T, 0);
  switch (id) {
    case 'ozet':
      if (!n) return [...yokMetni(v), ' Son işin bitişi: ', { b: saatYaz(D, v.oz.Cmax) }, '.'];
      return [...(v.yok.length ? [...yokMetni(v), ' Yerleşen '] : []), `${n} siparişin `, { b: String(n - gec.length) }, `${sayiEki(n - gec.length, 'i')} zamanında`,
        ...(gec.length ? [', ', { b: String(gec.length) }, `${sayiEki(gec.length, 'i')} geç (toplam ${saKisa(top)})`] : []), '. Son işin bitişi: ', { b: saatYaz(D, v.oz.Cmax) }, '.'];
    case 'bekle': {
      const x = [...beklemeler(v)].sort((a, b) => b.bek - a.bek)[0];
      return x && x.bek > 0.5 ? ['En çok bekleme ', { b: grupAdi(x.id) }, ` grubunda: ${saKisa(x.bek)}`, ...(x.bekG > 0.5 ? [', bunun ', { b: saKisa(x.bekG) }, "'i geç siparişlerin"] : []), '.'] : ['Belirgin bir bekleme yok.'];
    }
    case 'yuk': {
      const gt = gunOrtalamasi(v).map((x) => x ?? -1); const d = gt.indexOf(Math.max(...gt)); const enT = [...v.u].sort((a, b) => b[1] - a[1])[0];
      return ['En yoğun gün ', { b: `${v.gunAd[d] ?? ''} ${saatYaz(D, sutunAni(v, d)).slice(0, 5)}` }, ` (ortalama %${Math.round((gt[d] ?? 0) * 100)}). Plan boyunca en dolu tezgâh `, { b: enT ? enT[0] : '—' }, `${enT ? ` (%${Math.round(enT[1] * 100)})` : ''}.`];
    }
    case 'sure': return yor.find((x) => x.simge === 'clock')?.m ?? [];
    case 'yaris': {
      const g0 = gec[0];
      return g0 ? [{ b: String(gec.length) }, ' sipariş geç; en çok geciken ', { b: g0.id }, `, termininden ${saKisa(g0.T)} sonra biter.`] : ['Bütün siparişler termininden önce biter.'];
    }
    case 'yorum': return ['Veriden çıkan ', { b: String(yor.length) }, ' gözlem; önce sorunlar.'];
  }
}
