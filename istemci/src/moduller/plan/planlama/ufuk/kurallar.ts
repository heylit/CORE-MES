import type { Fasoncu, PlanVerisi, PlanlamaCalismasi, RotaAdimi, Siparis, Tezgah, Urun } from '../tipler.ts';

// Yıllık plan ve Ufuk'un saf hesapları (205 a). Ölçüt bugünkü sayfadır: cerceve/planlama/parca/zz9-yillik.betik ve zz39-ufuk.betik; hesaplar
// oradaki sırayla ve aynı yuvarlamayla taşındı. Saat ekseni planın başlangıç günü 00:00'dan saattir (motor engine.betik parseT).
// Bilinçli farklar yalnız şunlardır (DEVIR.md, soru 354): eski sayfanın uydurma genel gider ve mesai varsayılanları (zz6 msVarsayilan,
// mesaiVarsayilan) kurulmaz; bu ayarlar yoksa mesai saat bedeli ve yatırım bedeli bilinmez (null). Motorun derlenmiş takvimi yerine aynı
// takvim kuralı (engine.betik compile: vardiya, mola, ek mesai, ışıksız tezgâh, arıza) burada yeniden kurulur.

export const HDAYS = 63;
export const GUN = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'] as const;
const GUN_AD: Record<string, string> = { pzt: 'Pzt', sal: 'Sal', car: 'Çar', per: 'Per', cum: 'Cum', cmt: 'Cmt', paz: 'Paz' };
export const OL_AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
// Yıllık planın acil kapasite sütununun bedeli: gölge fiyat bu sütunun indirgenmiş maliyetinden okunur.
export const YL_ACIL = 1e5;
export const YL_GUN = 364;
export const TALEP_GECMIS_ENAZ = 12;
// Yatırım ve mesai bedeli bilinmeyen grupta eski sayfanın model ağırlıkları (zz9 ylModel: mesai `?? 1500`, birim değer `|| 1000`).
export const MESAI_VARSAYILAN_TL = 1500;
export const DEGER_VARSAYILAN_TL = 1000;

type Nesne = Record<string, unknown>;
const nesneMi = (v: unknown): v is Nesne => typeof v === 'object' && v !== null && !Array.isArray(v);
const diziOku = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
// Eski sayfanın `+x || 0` okuması: sayı olmayan ya da boş alan sıfırdır.
const n = (v: unknown): number => Number(v) || 0;
const iki = (x: number): string => String(x).padStart(2, '0');
const toplam = (l: readonly number[]): number => l.reduce((a, b) => a + b, 0);

// ---------- zaman ----------
export interface Zaman { base: number }

export function zamanKur(D: PlanVerisi): Zaman | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(D.meta?.baslangic ?? ''));
  return m ? { base: Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) } : null;
}

export function saatOku(z: Zaman, s: unknown): number | null {
  if (s === null || s === undefined || s === '') return null;
  if (typeof s === 'number') return s;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(String(s).trim());
  if (!m) return null;
  return (Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0) - z.base) / 3600000;
}

const tarihAl = (z: Zaman, saat: number): Date => new Date(z.base + saat * 3600000);
export const haftaGunu = (z: Zaman, gun: number): string => GUN[(new Date(z.base + gun * 86400000).getUTCDay() + 6) % 7] ?? 'pzt';
// "GG.AA"
export function gunAy(z: Zaman, saat: number): string { const d = tarihAl(z, saat); return `${iki(d.getUTCDate())}.${iki(d.getUTCMonth() + 1)}`; }
// "GG.AA Gün" (eski sayfanın fmtDT(...).slice(0, 9))
export function gunAyHafta(z: Zaman, saat: number): string {
  if (!Number.isFinite(saat)) return '—';
  const d = tarihAl(z, saat);
  return `${gunAy(z, saat)} ${GUN_AD[GUN[(d.getUTCDay() + 6) % 7] ?? 'pzt'] ?? ''}`;
}
const saatDk = (s: unknown): number => { const [h, m] = String(s).split(':').map(Number); return (h ?? NaN) + (m || 0) / 60; };

// Sayfanın "şimdi"si (31 a, girdi.betik simdiUygula): kaydedilen gerçek saat, yoksa başlangıç günü 07:00 (741 a: gece 07:00'den önce de olur).
export function simdiOku(c: PlanlamaCalismasi): number {
  const s = Number(c.simdi);
  return c.simdi != null && Number.isFinite(s) && s >= 0 ? s : 7;
}

// ---------- ayarlar (çalışmanın verisinde; yoksa varsayılan, sunucu motor/durum.betik ylAyar ile aynı) ----------
export type YillikHedefi = { aile: Record<string, string>; hedef: [string, number, number][] };
export interface YillikAyar {
  tahmin: 'gecmis' | 'elle';
  buyume: number;
  elle: Record<string, Record<string, number>>;
  mesaiMaks: number;
  gecTL: number;
  stokTL: number;
  yatirim: boolean;
  teslimAy: number;
  hedef: YillikHedefi | null;
}
const yillikVarsayilan = (): YillikAyar => ({ tahmin: 'gecmis', buyume: 10, elle: {}, mesaiMaks: 15, gecTL: 0.43, stokTL: 3.9, yatirim: true, teslimAy: 3, hedef: null });

export function yillikAyarOku(D: PlanVerisi): YillikAyar {
  const y = D.yillik;
  return nesneMi(y) ? { ...yillikVarsayilan(), ...y } as YillikAyar : yillikVarsayilan();
}
// Taslağın ayarını döndürür; yoksa varsayılanla kurar (değişiklik yalnız `komut.degistir` taslağında yapılır).
export function yillikAyarYaz(D: PlanVerisi): YillikAyar {
  const d = D as Nesne;
  if (!nesneMi(d.yillik)) d.yillik = yillikVarsayilan();
  const a = d.yillik as YillikAyar;
  if (!nesneMi(a.elle)) a.elle = {};
  return a;
}

export interface UfukAyar { hafta: number; kuyruk: number; ongoruMalzeme: boolean }
const ufukVarsayilan = (): UfukAyar => ({ hafta: 52, kuyruk: 1, ongoruMalzeme: false });
export function ufukAyarOku(D: PlanVerisi): UfukAyar {
  const u = D.ufuk;
  return nesneMi(u) ? { ...ufukVarsayilan(), ...u } as UfukAyar : ufukVarsayilan();
}
export function ufukAyarYaz(D: PlanVerisi): UfukAyar {
  const d = D as Nesne;
  if (!nesneMi(d.ufuk)) d.ufuk = ufukVarsayilan();
  return d.ufuk as UfukAyar;
}

// Genel gider sayfasının kullanılabilirliği (zz6 msSis().verim, %). Ayar yoksa eski sayfanın varsayılanı 85.
export function kullanilabilirlik(D: PlanVerisi): number {
  const m = D.maliyetSis;
  return (nesneMi(m) && n(m.verim)) || 85;
}

// ---------- mesai ve yatırım bedeli (zz6 msSaat, msGrupSaat; zz9 ylMesaiSaatTL, ylYatirimTL) ----------
interface MesaiSis { aylikSaat?: number; sgk?: number; yanHak?: number; carp?: { hi?: number }; kisiEk?: number; ucret?: Record<string, { brut?: number | null }> }
const mesaiSis = (D: PlanVerisi): MesaiSis | null => (nesneMi(D.mesaiSis) ? D.mesaiSis as MesaiSis : null);

function kisiSaatTL(D: PlanVerisi, m: MesaiSis, kisi: string): number | null {
  const u = m.ucret?.[kisi];
  if (!u || u.brut === null || u.brut === undefined) return null;
  return n(u.brut) * (1 + (n(m.sgk) + n(m.yanHak)) / 100) / (n(m.aylikSaat) || 225);
}

// Grubun kişi saat maliyeti: gruptaki kişilerin ortalaması, yoksa bütün kişilerin; mesai ayarı ya da ücret yoksa null.
export function grupSaatTL(D: PlanVerisi, grup: string): number | null {
  const m = mesaiSis(D);
  if (m === null) return null;
  const kisiler = D.personel ?? [];
  const ort = (l: (number | null)[]): number[] => l.filter((x): x is number => x !== null);
  const l = ort(kisiler.filter((p) => (p.gruplar ?? []).includes(grup)).map((p) => kisiSaatTL(D, m, p.id)));
  const t = l.length ? l : ort(kisiler.map((p) => kisiSaatTL(D, m, p.id)));
  return t.length ? toplam(t) / t.length : null;
}

const opOrani = (tz: readonly Tezgah[]): number => (tz.length ? toplam(tz.map((t) => t.opOran ?? 1)) / tz.length : 1);

export function mesaiSaatTL(D: PlanVerisi, grup: string): number | null {
  const m = mesaiSis(D);
  const s = grupSaatTL(D, grup);
  if (m === null || s === null) return null;
  const op = opOrani(D.tezgahlar.filter((t) => t.grup === grup));
  return s * op * (n(m.carp?.hi) || 1.5) + n(m.kisiEk) / 8 * op;
}

// Gruba bir tezgâhın aylık bedeli: ortalama amortisman + iki vardiya operatör maliyeti. Genel gider ayarı yoksa bilinmez (null).
export function yatirimTL(D: PlanVerisi, grup: string): number | null {
  const M = D.maliyetSis;
  const tz = D.tezgahlar.filter((t) => t.grup === grup);
  if (!nesneMi(M) || !tz.length) return null;
  const tez = nesneMi(M.tez) ? M.tez : {};
  const am = toplam(tz.map((t) => {
    const z = nesneMi(tez[t.id]) ? tez[t.id] as Nesne : {};
    return n(z.bedel) > 0 && n(z.omur) > 0 ? n(z.bedel) * (1 - n(z.hurda) / 100) / n(z.omur) / 12 : 0;
  })) / tz.length;
  const s = grupSaatTL(D, grup);
  const m = mesaiSis(D);
  return am + (s === null || m === null ? 0 : s * (n(m.aylikSaat) || 225) * opOrani(tz) * 2);
}

// Yatırım bedeli bilinmediği için yatırım denenmeyen gruplar (yillik-durum yatAday yalnız bedeli bilinen grubu aday yapar).
export const bedelsizGruplar = (D: PlanVerisi, gruplar: readonly string[]): string[] => gruplar.filter((g) => yatirimTL(D, g) === null);

// ---------- takvim: motorun açık pencereleri (engine.betik compile, rw) ----------
type Pencere = [number, number];
function birlestir(W: Pencere[]): Pencere[] {
  W.sort((a, b) => a[0] - b[0]);
  const o: Pencere[] = [];
  for (const w of W) {
    if (w[1] <= w[0]) continue;
    const son = o[o.length - 1];
    if (son && w[0] <= son[1] + 1e-9) son[1] = Math.max(son[1], w[1]);
    else o.push([w[0], w[1]]);
  }
  return o;
}
function cikar(W: Pencere[], C: Pencere[]): Pencere[] {
  if (!C.length) return W;
  const o: Pencere[] = [];
  for (const [a, b] of W) {
    let par: Pencere[] = [[a, b]];
    for (const [c, d] of C) {
      const yeni: Pencere[] = [];
      for (const [x, y] of par) {
        if (d <= x || c >= y) { yeni.push([x, y]); continue; }
        if (c > x) yeni.push([x, c]);
        if (d < y) yeni.push([d, y]);
      }
      par = yeni;
    }
    o.push(...par);
  }
  return o;
}
export const pencereSaati = (W: readonly Pencere[], a: number, b: number): number =>
  toplam(W.map(([x, y]) => Math.max(0, Math.min(b, y) - Math.max(a, x))));

interface Vardiya { bas: number; bit: number; mol: Pencere[] }
function vardiyalar(D: PlanVerisi): Record<string, Vardiya> {
  const o: Record<string, Vardiya> = {};
  for (const v of D.vardiyalar ?? []) {
    if (typeof v.id !== 'string') continue;
    o[v.id] = { bas: saatDk(v.bas), bit: saatDk(v.bit), mol: diziOku<Nesne>(v.molalar).map((x) => [saatDk(x.bas), saatDk(x.bit)]) };
  }
  return o;
}
const tatilGunleri = (D: PlanVerisi, z: Zaman): Set<number> =>
  new Set((D.tatiller ?? []).map((s) => saatOku(z, s)).filter((t): t is number => t !== null).map((t) => Math.floor(t / 24)));
const gunVardiyalari = (D: PlanVerisi, gun: string): string[] => diziOku<unknown>(D.calismaGunleri?.[gun]).map(String);

// Tezgâh başına açık pencereler (plan başından HDAYS gün): vardiya eksi kendi molası, ek mesai, ışıksız tezgâhta bütün çalışma günü, eksi arıza.
export function tezgahPencereleri(c: PlanlamaCalismasi, z: Zaman): Record<string, Pencere[]> {
  const D = c.D;
  const vs = vardiyalar(D);
  const tatil = tatilGunleri(D, z);
  const gunler = Array.from({ length: HDAYS }, (_, d) => (tatil.has(d) ? [] : gunVardiyalari(D, haftaGunu(z, d))));
  const ornek = (d: number, sid: string): Pencere | null => {
    const v = vs[sid]; if (!v) return null;
    const a = d * 24 + v.bas; let b = d * 24 + v.bit; if (b <= a) b += 24;
    return [a, b];
  };
  const molalar = (d: number, sid: string): Pencere[] => {
    const v = vs[sid]; if (!v) return [];
    return v.mol.map(([x, y]) => { let a = d * 24 + x; if (a < d * 24 + v.bas) a += 24; let b = d * 24 + y; if (b <= a) b += 24; return [a, b]; });
  };
  const ek = c.ekMesai as Nesne[];
  const o: Record<string, Pencere[]> = {};
  for (const m of D.tezgahlar) {
    const kendi = m.vardiyalar?.length ? new Set(m.vardiyalar) : null;
    let sw: Pencere[] = [];
    for (let d = 0; d < HDAYS; d++) for (const sid of gunler[d] ?? []) {
      if (kendi && !kendi.has(sid)) continue;
      const w = ornek(d, sid); if (w) sw.push(...cikar([w], molalar(d, sid)));
    }
    for (const e of ek) {
      if (e.m !== m.id) continue;
      const w = ornek(n(e.gun), String(e.vardiya)); if (w) sw.push(...cikar([w], molalar(n(e.gun), String(e.vardiya))));
    }
    let rw = birlestir(sw);
    if (m.isiksiz) {
      const tam: Pencere[] = [];
      for (let d = 0; d < HDAYS; d++) if (gunler[d]?.length) tam.push([d * 24, d * 24 + 24]);
      rw = birlestir(tam.concat(rw));
    }
    const ariza = (c.down as Nesne[]).filter((x) => x.m === m.id).map((x): Pencere => [n(x.from), n(x.to)]);
    o[m.id] = cikar(rw, ariza);
  }
  return o;
}

// ---------- talep hızı (zz9 talepHizi): kapanmış ve açık siparişlerin giriş tarihinden, son 52 hafta ----------
export interface TalepHizi { hafta: number; hiz: Record<string, number> | null; dusuk: boolean }
export function talepHizi(D: PlanVerisi, z: Zaman, now: number): TalepHizi {
  const l = [...diziOku<Siparis>(D.kapananSiparisler), ...D.siparisler]
    .map((s) => ({ urun: s.urun, q: n(s.adet), t: saatOku(z, s.siparisTarihi) }))
    .filter((x): x is { urun: string; q: number; t: number } => x.t !== null && x.t <= now && x.t > now - 52 * 168);
  const hafta = l.length ? Math.min(52, (now - Math.min(...l.map((x) => x.t))) / 168) : 0;
  if (!l.length) return { hafta, hiz: null, dusuk: true };
  const bolen = Math.max(hafta, TALEP_GECMIS_ENAZ);
  const hiz: Record<string, number> = {};
  for (const x of l) hiz[x.urun] = (hiz[x.urun] ?? 0) + x.q / bolen;
  return { hafta, hiz, dusuk: hafta < TALEP_GECMIS_ENAZ };
}

// ---------- yıllık plan ----------
export interface Donem { a: number; b: number; tur: 'hafta' | 'ay'; ad: string; uzun: string }

// Dönemler gün olarak [a, b): önce 13 hafta haftalık, sonra bir yıla kadar aylık.
export function yillikDonemler(z: Zaman): Donem[] {
  const l: { a: number; b: number; tur: 'hafta' | 'ay' }[] = [];
  for (let w = 0; w < 13; w++) l.push({ a: w * 7, b: w * 7 + 7, tur: 'hafta' });
  let a = 91;
  while (a < YL_GUN) {
    const d = new Date(z.base + a * 864e5);
    const son = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - z.base) / 864e5);
    const b = Math.min(YL_GUN, son);
    const onceki = l[l.length - 1];
    if (b - a >= 7 || !onceki) l.push({ a, b, tur: 'ay' }); else onceki.b = b;
    a = b;
  }
  return l.map((p) => {
    const d = new Date(z.base + p.a * 864e5);
    const ay = OL_AY[d.getUTCMonth()] ?? '';
    const ad = p.tur === 'hafta' ? `${iki(d.getUTCDate())}.${iki(d.getUTCMonth() + 1)}` : `${ay} ${String(d.getUTCFullYear()).slice(2)}`;
    const uzun = p.tur === 'hafta' ? `${ad} haftası` : `${ay} ${d.getUTCFullYear()}${p.b - p.a < 25 ? ` (${p.b - p.a} gün)` : ''}`;
    return { ...p, ad, uzun };
  });
}

// Elle tahmin tablosunun 13 ayı: [anahtar "YYYY-AA", kısa ad].
export function yillikAylar(z: Zaman): [string, string][] {
  const b = new Date(z.base);
  return Array.from({ length: 13 }, (_, i) => {
    const d = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + i, 1));
    return [`${d.getUTCFullYear()}-${iki(d.getUTCMonth() + 1)}`, `${OL_AY[d.getUTCMonth()] ?? ''} ${String(d.getUTCFullYear()).slice(2)}`];
  });
}

const grupHaritasi = (D: PlanVerisi): Record<string, string> => Object.fromEntries(D.tezgahlar.map((t) => [t.id, t.grup || t.id]));

// Ürün ailesi: ürünün en çok süre tutan adımının ayar ailesi (yoksa ürünün kendisi); ürünün grup başına birim saati ve ayar saati.
export function urunAileleri(D: PlanVerisi): { urunAile: Record<string, string>; urunSaat: Record<string, Record<string, number>> } {
  const grupOf = grupHaritasi(D);
  const tezOf = Object.fromEntries(D.tezgahlar.map((t) => [t.id, t]));
  const urunAile: Record<string, string> = {};
  const urunSaat: Record<string, Record<string, number>> = {};
  for (const u of D.urunler) {
    const say: Record<string, number> = {};
    const h: Record<string, number> = {};
    for (const o of u.rota ?? []) {
      const ts = (o.tezgahlar ?? []).filter((t) => grupOf[t.id]);
      if (!ts.length) continue;
      let en: { s: number; ayar: number; g: string } | null = null;
      for (const t of ts) {
        const s = n(t.cevrim) / 60 / (n(tezOf[t.id]?.verim) || 1);
        if (!en || s < en.s) en = { s, ayar: n(t.ayar), g: grupOf[t.id] ?? t.id };
      }
      if (!en) continue;
      h[en.g] = (h[en.g] ?? 0) + en.s;
      h[`${en.g}|ayar`] = (h[`${en.g}|ayar`] ?? 0) + en.ayar / 60;
      if (o.aile) say[o.aile] = (say[o.aile] ?? 0) + en.s;
    }
    const b = Object.entries(say).sort((x, y) => y[1] - x[1])[0];
    urunAile[u.id] = b ? b[0] : u.id;
    urunSaat[u.id] = h;
  }
  return { urunAile, urunSaat };
}

export interface YillikVeri {
  urunAile: Record<string, string>;
  aileler: string[];
  saat: Record<string, Record<string, number>>;
  gruplar: string[];
  kapH: Record<string, number>;
  tezKap: Record<string, number>;
  kisiH: Record<string, number>;
  sinir: Record<string, 'tezgah' | 'kisi'>;
  yeniH: Record<string, number>;
  haftalik: Record<string, number>;
  th: TalepHizi;
  birimDeger: Record<string, number>;
  // Birim değeri siparişin gelirinden okunamayan aile (model eski sayfanın varsayılan değeriyle kuruldu).
  degerVarsayilan: string[];
  sip: { s: Siparis; t: number }[];
  now: number;
}

export function yillikVeri(c: PlanlamaCalismasi, z: Zaman, A: YillikAyar): YillikVeri {
  const D = c.D;
  const now = simdiOku(c);
  const grupOf = grupHaritasi(D);
  const { urunAile, urunSaat } = urunAileleri(D);
  const sip = D.siparisler.map((s) => ({ s, t: (saatOku(z, s.termin) ?? now) / 24 }));
  const th = talepHizi(D, z, now);
  const haftalik: Record<string, number> = {};
  const deger: Record<string, number> = {};
  const adetTop: Record<string, number> = {};
  for (const [u, h] of Object.entries(th.hiz ?? {})) { const f = urunAile[u]; if (f) haftalik[f] = (haftalik[f] ?? 0) + h; }
  for (const { s } of sip) {
    const f = urunAile[s.urun]; if (!f) continue;
    if (s.gelir !== null && s.gelir !== undefined && s.adet) { deger[f] = (deger[f] ?? 0) + n(s.gelir); adetTop[f] = (adetTop[f] ?? 0) + s.adet; }
  }
  const aileler = [...new Set(Object.values(urunAile))].filter((f) => D.siparisler.some((s) => urunAile[s.urun] === f)
    || Object.values(A.elle[f] ?? {}).some((x) => x > 0));
  const birimDeger: Record<string, number> = {};
  const degerVarsayilan: string[] = [];
  const ort = toplam(Object.values(deger)) / Math.max(1, toplam(Object.values(adetTop)));
  for (const f of aileler) {
    const a = adetTop[f];
    if (a) birimDeger[f] = (deger[f] ?? 0) / a;
    else if (ort) birimDeger[f] = ort;
    else { birimDeger[f] = DEGER_VARSAYILAN_TL; degerVarsayilan.push(f); }
  }
  // Aile birim saati: aile ürünlerinin sipariş adedi ağırlıklı ortalaması; ayar ortalama parti adedine bölünür.
  const saat: Record<string, Record<string, number>> = {};
  const gruplar = new Set<string>();
  for (const f of aileler) {
    let w = 0; const h: Record<string, number> = {};
    for (const u of D.urunler.filter((x) => urunAile[x.id] === f)) {
      const sp = D.siparisler.filter((s) => s.urun === u.id);
      const q = toplam(sp.map((s) => s.adet)) || 1;
      const parti = sp.length ? q / sp.length : 20;
      const us = urunSaat[u.id] ?? {};
      for (const [g, v] of Object.entries(us)) {
        if (g.endsWith('|ayar')) continue;
        gruplar.add(g);
        h[g] = (h[g] ?? 0) + q * (v + (us[`${g}|ayar`] ?? 0) / parti);
      }
      w += q;
    }
    saat[f] = Object.fromEntries(Object.entries(h).map(([g, v]) => [g, v / w]));
  }
  // Grup kapasitesi: motor ufkundaki açık saatlerin haftalık ortalaması × kullanılabilirlik.
  const verim = kullanilabilirlik(D) / 100;
  const pencere = tezgahPencereleri(c, z);
  const kapH: Record<string, number> = {}; const tezH: Record<string, number> = {}; const tezN: Record<string, number> = {};
  for (const m of D.tezgahlar) {
    const g = grupOf[m.id] ?? m.id;
    const h = pencereSaati(pencere[m.id] ?? [], 0, HDAYS * 24) / (HDAYS / 7);
    kapH[g] = (kapH[g] ?? 0) + h * verim; tezH[g] = (tezH[g] ?? 0) + h * verim; tezN[g] = (tezN[g] ?? 0) + 1;
  }
  const yeniH = Object.fromEntries(Object.keys(tezH).map((g) => [g, (tezH[g] ?? 0) / (tezN[g] ?? 1)]));
  // Personel sınırı: grubun kişi saati ÷ ortalama operatör oranı; birden çok gruptaki kişi saati eşit bölünür.
  const vSaat: Record<string, number> = {};
  for (const x of D.vardiyalar ?? []) { let h = saatDk(x.bit) - saatDk(x.bas); if (h <= 0) h += 24; vSaat[String(x.id)] = h; }
  const gunN = (v: string | undefined): number => Object.values(D.calismaGunleri ?? {}).filter((l) => diziOku<unknown>(l).includes(v)).length;
  const kisiH: Record<string, number> = {};
  for (const p of D.personel ?? []) {
    const gs = (p.gruplar ?? []).filter((g) => (kapH[g] ?? 0) > 0);
    if (!gs.length) continue;
    const h = (vSaat[p.vardiya ?? ''] || 8) * gunN(p.vardiya);
    for (const g of gs) kisiH[g] = (kisiH[g] ?? 0) + h / gs.length;
  }
  const tezKap = { ...kapH };
  const sinir: Record<string, 'tezgah' | 'kisi'> = {};
  for (const g of Object.keys(kapH)) {
    const kh = kisiH[g];
    if (kh === undefined) { sinir[g] = 'tezgah'; continue; }
    const k = kh / opOrani(D.tezgahlar.filter((t) => t.grup === g));
    if (k < (kapH[g] ?? 0)) { kapH[g] = k; sinir[g] = 'kisi'; } else sinir[g] = 'tezgah';
  }
  return {
    urunAile, aileler, saat, gruplar: [...gruplar].filter((g) => (kapH[g] ?? 0) > 0), kapH, tezKap, kisiH, sinir, yeniH, haftalik, th,
    birimDeger, degerVarsayilan, sip, now: now / 24,
  };
}

export interface YillikTalep { fir: Record<string, number[]>; tah: Record<string, number[]>; d: Record<string, number[]> }

// Dönem talebi = max(sipariş, tahmin): sipariş tahmini tüketir, üstüne eklenmez.
export function yillikTalep(v: YillikVeri, P: readonly Donem[], A: YillikAyar, z: Zaman): YillikTalep {
  const fir: Record<string, number[]> = {}; const tah: Record<string, number[]> = {};
  for (const f of v.aileler) { fir[f] = P.map(() => 0); tah[f] = P.map(() => 0); }
  const sonB = P[P.length - 1]?.b ?? 0;
  for (const { s, t } of v.sip) {
    const l = fir[v.urunAile[s.urun] ?? ''];
    if (!l) continue;
    const i = Math.max(0, P.findIndex((p) => t < p.b));
    if (t < sonB) l[i] = (l[i] ?? 0) + s.adet;
  }
  P.forEach((p, i) => {
    const d = new Date(z.base + p.a * 864e5);
    const ay = `${d.getUTCFullYear()}-${iki(d.getUTCMonth() + 1)}`;
    for (const f of v.aileler) {
      const l = tah[f]; if (!l) continue;
      if (A.tahmin === 'elle') {
        const m = A.elle[f]?.[ay];
        if (m !== undefined && m !== null) { const gun = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); l[i] = m * (p.b - p.a) / gun; }
      } else l[i] = (v.haftalik[f] ?? 0) * (p.b - p.a) / 7 * Math.pow(1 + (A.buyume || 0) / 100, ((p.a + p.b) / 2) / 365);
    }
  });
  const d: Record<string, number[]> = {};
  for (const f of v.aileler) d[f] = P.map((_, i) => Math.max(fir[f]?.[i] ?? 0, tah[f]?.[i] ?? 0));
  return { fir, tah, d };
}

export interface ModelSecenegi { yat: boolean; yatAday?: (g: string, s: number) => boolean; sabit?: Record<string, number> }
export interface YillikModel { lp: string; want: string[]; fi: (f: string) => string; gi: (g: string) => string; mesaiVarsayilan: string[] }

// CPLEX LP biçimi; adlar yalnız harf, rakam ve alt çizgi.
export function yillikModel(D: PlanVerisi, v: YillikVeri, P: readonly Donem[], T: YillikTalep, A: YillikAyar, o: ModelSecenegi): YillikModel {
  const F = v.aileler; const G = v.gruplar;
  const fi = (f: string): string => `f${F.indexOf(f)}`;
  const gi = (g: string): string => `g${G.indexOf(g)}`;
  const obj: string[] = []; const R: string[] = []; const bnd: string[] = []; const bin: string[] = [];
  const mesaiVarsayilan: string[] = [];
  const ter = (c: number, x: string): string => (c ? `${c >= 0 ? '+' : '-'} ${Math.abs(c).toFixed(6)} ${x}` : '');
  const yatAday = (g: string, s: number): boolean => o.yatAday?.(g, s) ?? false;
  P.forEach((p, t) => {
    const gun = p.b - p.a; const son = t === P.length - 1;
    for (const f of F) {
      const bd = v.birimDeger[f] ?? 0;
      obj.push(ter(bd * A.stokTL / 100 * gun / 30, `I_${fi(f)}_${t}`), ter(bd * A.gecTL / 100 * gun * (son ? 4 : 1), `B_${fi(f)}_${t}`));
      R.push(`d_${fi(f)}_${t}: x_${fi(f)}_${t} - I_${fi(f)}_${t} + B_${fi(f)}_${t}${t ? ` + I_${fi(f)}_${t - 1} - B_${fi(f)}_${t - 1}` : ''} = ${(T.d[f]?.[t] ?? 0).toFixed(4)}`);
    }
    for (const g of G) {
      const kap = (v.kapH[g] ?? 0) * gun / 7;
      const mtl = mesaiSaatTL(D, g);
      if (mtl === null && !mesaiVarsayilan.includes(g)) mesaiVarsayilan.push(g);
      obj.push(ter(mtl ?? MESAI_VARSAYILAN_TL, `o_${gi(g)}_${t}`), ter(YL_ACIL, `e_${gi(g)}_${t}`));
      bnd.push(` 0 <= o_${gi(g)}_${t} <= ${(kap * A.mesaiMaks / 100).toFixed(3)}`);
      const yuk = F.map((f) => ((v.saat[f]?.[g] ?? 0) > 0 ? ter(v.saat[f]?.[g] ?? 0, `x_${fi(f)}_${t}`) : '')).filter(Boolean).join(' ');
      const yat = o.yat ? P.slice(0, t + 1).map((_, s) => (yatAday(g, s) ? ter(-((v.yeniH[g] ?? 0) * gun / 7), `y_${gi(g)}_${s}`) : '')).filter(Boolean).join(' ') : '';
      R.push(`k_${gi(g)}_${t}: ${yuk || `0 x_${fi(F[0] ?? '')}_${t}`} - o_${gi(g)}_${t} - e_${gi(g)}_${t} ${yat} <= ${kap.toFixed(3)}`);
    }
  });
  if (o.yat) for (const g of G) {
    const l = P.map((_, s) => (yatAday(g, s) ? s : null)).filter((s): s is number => s !== null);
    if (!l.length) continue;
    const ay = yatirimTL(D, g) ?? 0;
    for (const s of l) {
      const ayS = (YL_GUN - (P[s]?.a ?? 0)) / 30.4;
      obj.push(ter(ay * ayS, `y_${gi(g)}_${s}`));
      if (o.sabit) { const val = (o.sabit[`y_${gi(g)}_${s}`] ?? 0) > 0.5 ? 1 : 0; bnd.push(` ${val} <= y_${gi(g)}_${s} <= ${val}`); }
      else { bnd.push(` 0 <= y_${gi(g)}_${s} <= 1`); bin.push(`y_${gi(g)}_${s}`); }
    }
    R.push(`tek_${gi(g)}: ${l.map((s) => `+ y_${gi(g)}_${s}`).join(' ')} <= 1`);
  }
  const lp = `Minimize\n obj: ${obj.filter(Boolean).join(' ')}\nSubject To\n ${R.join('\n ')}\nBounds\n${bnd.join('\n')}\n${bin.length ? `Binary\n ${bin.join(' ')}\n` : ''}End\n`;
  const want: string[] = [];
  P.forEach((_, t) => {
    for (const f of F) want.push(`x_${fi(f)}_${t}`, `I_${fi(f)}_${t}`, `B_${fi(f)}_${t}`);
    for (const g of G) want.push(`o_${gi(g)}_${t}`, `e_${gi(g)}_${t}`);
  });
  if (o.yat) for (const g of G) P.forEach((_, s) => { if (yatAday(g, s)) want.push(`y_${gi(g)}_${s}`); });
  return { lp, want, fi, gi, mesaiVarsayilan };
}

// HiGHS'ın cevabı (sunucunun yıllık plan çözüm ucu): model durumu, amaç, istenen sütunların değeri ve indirgenmiş maliyeti.
export interface CozumCevabi { s: number; ob: number | null; val: Record<string, number> | null; dual: Record<string, number | null> | null }
export const HS_DURUM: Record<number, string> = { 7: 'en iyi bulundu', 13: 'süre doldu', 8: 'çözüm yok', 14: 'adım sınırı' };

export interface AileDonemi { d: number; fir: number; tah: number; x: number; I: number; B: number }
export interface GrupDonemi { kap: number; ek: number; yuk: number; o: number; e: number; golge: number | null }
export interface YillikSonuc {
  aile: Record<string, AileDonemi[]>;
  grup: Record<string, GrupDonemi[]>;
  yat: { g: string; t: number; ay: number | null }[];
  tl: number | null;
  tl0: number | null;
  durum: number;
}

export function yillikSonuc(D: PlanVerisi, v: YillikVeri, P: readonly Donem[], T: YillikTalep, r: CozumCevabi, rd: CozumCevabi, m: YillikModel, r0: CozumCevabi): YillikSonuc {
  const val = (ad: string): number => Math.max(0, r.val?.[ad] ?? 0);
  const F = v.aileler; const G = v.gruplar;
  const aile: Record<string, AileDonemi[]> = {}; const grup: Record<string, GrupDonemi[]> = {}; const yat: YillikSonuc['yat'] = [];
  const yatirimlar = Object.entries(r.val ?? {}).map(([ad, x]) => ({ m: /^y_g(\d+)_(\d+)$/.exec(ad), x }))
    .filter((y): y is { m: RegExpExecArray; x: number } => y.m !== null && y.x > 0.5).map((y) => ({ g: G[Number(y.m[1])] ?? '', t: Number(y.m[2]) }));
  for (const f of F) aile[f] = P.map((_, t) => ({
    d: T.d[f]?.[t] ?? 0, fir: T.fir[f]?.[t] ?? 0, tah: T.tah[f]?.[t] ?? 0, x: val(`x_${m.fi(f)}_${t}`), I: val(`I_${m.fi(f)}_${t}`), B: val(`B_${m.fi(f)}_${t}`),
  }));
  for (const g of G) grup[g] = P.map((p, t) => {
    const kap = (v.kapH[g] ?? 0) * (p.b - p.a) / 7;
    const ek = yatirimlar.filter((y) => y.g === g && y.t <= t).length * (v.yeniH[g] ?? 0) * (p.b - p.a) / 7;
    const yuk = toplam(F.map((f) => (v.saat[f]?.[g] ?? 0) * val(`x_${m.fi(f)}_${t}`)));
    const e = val(`e_${m.gi(g)}_${t}`);
    const rc = rd.dual ? rd.dual[`e_${m.gi(g)}_${t}`] ?? null : null;
    const golge = e > 1e-6 ? YL_ACIL : rc === null ? null : Math.max(0, YL_ACIL - rc);
    return { kap: kap + ek, ek, yuk, o: val(`o_${m.gi(g)}_${t}`), e, golge };
  });
  for (const y of yatirimlar) yat.push({ g: y.g, t: y.t, ay: yatirimTL(D, y.g) });
  return { aile, grup, yat, tl: r.ob, tl0: r0.ob, durum: r.s };
}

// Özet sayılar (KPI ve Özet sekmesi).
export interface YillikOzet { topD: number; zamaninda: number | null; gecAdet: number; mesai: number; acil: number }
export function yillikOzet(v: YillikVeri, s: YillikSonuc): YillikOzet {
  const F = v.aileler; const G = v.gruplar;
  const topD = toplam(F.map((f) => toplam((s.aile[f] ?? []).map((x) => x.d))));
  const gecYeni = toplam(F.map((f) => { const l = s.aile[f] ?? []; return toplam(l.map((x, t) => Math.max(0, x.B - (t ? l[t - 1]?.B ?? 0 : 0)))); }));
  return {
    topD,
    zamaninda: topD > 0 ? 1 - gecYeni / topD : null,
    gecAdet: toplam(F.map((f) => toplam((s.aile[f] ?? []).map((x) => x.B)))),
    mesai: toplam(G.map((g) => toplam((s.grup[g] ?? []).map((x) => x.o)))),
    acil: toplam(G.map((g) => toplam((s.grup[g] ?? []).map((x) => x.e)))),
  };
}

// Darboğaz tablosu: grup başına ortalama yük, en yüklü dönem, en yüksek gölge fiyat ve dar dönem sayısı (gölge fiyatı en yüksek başta).
export interface Darbogaz { g: string; enY: { o: number; t: number }; gm: number; gD: number; o: number; ort: number }
export function darbogazlar(v: YillikVeri, s: YillikSonuc): Darbogaz[] {
  return v.gruplar.map((g) => {
    const l = s.grup[g] ?? [];
    const enY = l.reduce((a, x, t) => (x.kap > 0 && x.yuk / x.kap > a.o ? { o: x.yuk / x.kap, t } : a), { o: 0, t: 0 });
    return {
      g, enY, gm: Math.max(0, ...l.map((x) => x.golge ?? 0)), gD: l.filter((x) => (x.golge ?? 0) > 0.5).length,
      o: toplam(l.map((x) => x.o)), ort: toplam(l.map((x) => x.yuk)) / Math.max(1, toplam(l.map((x) => x.kap))),
    };
  }).sort((a, b) => b.gm - a.gm || b.ort - a.ort);
}

// Motor hedefi: yalnız öne üretim. Yıllık plan bir aileyi termininden önce stoğa üretiyorsa (stok > 0) o hafta sonuna kadar termini gelmiş
// siparişler + öne üretilen adet bitmiş olmalı; motor ufkundaki haftalar için kümülatif adet.
export function yillikHedefKur(D: PlanVerisi, v: YillikVeri, P: readonly Donem[], s: YillikSonuc): YillikHedefi {
  const H: [string, number, number][] = [];
  for (const f of v.aileler) {
    let fir = 0; let enC = 0;
    const top = toplam(D.siparisler.filter((x) => v.urunAile[x.urun] === f).map((x) => n(x.adet)));
    P.forEach((p, t) => {
      if (p.tur !== 'hafta' || p.b > HDAYS) return;
      const x = s.aile[f]?.[t]; if (!x) return;
      fir += x.fir;
      if (x.I > 0.5) { enC = Math.max(enC, Math.min(top, Math.round(fir + x.I))); H.push([f, p.b * 24 - 0.01, enC]); }
    });
  }
  return { aile: v.urunAile, hedef: H };
}

// Planın t saatine kadar bitirdiği aile adedi (çözülmüş plandaki iş bitişleri, plan.J).
export function planUretimi(c: PlanlamaCalismasi, h: YillikHedefi, f: string, t: number): number | null {
  const J = nesneMi(c.plan) && nesneMi(c.plan.J) ? c.plan.J : null;
  if (J === null) return null;
  let k = 0;
  for (const s of c.D.siparisler) {
    if (h.aile[s.urun] !== f) continue;
    const j = J[s.id];
    if (nesneMi(j) && typeof j.C === 'number' && j.C <= t) k += n(s.adet);
  }
  return k;
}

// ---------- ufuk ----------
interface UfukTakvimi { isGunu: (d: number) => boolean; tezSaat: (m: Tezgah, d: number) => number }

// Tezgâhın o günkü açık saati (vardiya süresi, molasız) ve iş günü; tatil düşülür.
export function ufukTakvimi(D: PlanVerisi, z: Zaman): UfukTakvimi {
  const vs: Record<string, number> = {};
  for (const v of D.vardiyalar ?? []) { let h = saatDk(v.bit) - saatDk(v.bas); if (h <= 0) h += 24; vs[String(v.id)] = h; }
  const tatil = tatilGunleri(D, z);
  const gun = (d: number): string[] => (tatil.has(d) ? [] : gunVardiyalari(D, haftaGunu(z, d)));
  return {
    isGunu: (d) => gun(d).length > 0,
    tezSaat: (m, d) => {
      const kendi = m.vardiyalar?.length ? m.vardiyalar : null;
      return toplam(gun(d).filter((s) => !kendi || kendi.includes(s)).map((s) => vs[s] ?? 0));
    },
  };
}

// t saatinden geriye k iş günü (iş günü tam gün sayılır); tatil ve kapalı gün atlanır.
export function geriIsGunu(cal: UfukTakvimi, t: number, k: number): number {
  let kal = k; let x = t; let g = 0;
  while (kal > 1e-9 && g++ < 2000) {
    const d = Math.ceil(x / 24 - 1e-9) - 1;
    const pay = x / 24 - d;
    if (cal.isGunu(d)) { const al = Math.min(kal, pay); kal -= al; x -= al * 24; if (kal > 1e-9) x = d * 24; } else x = d * 24;
  }
  return x;
}

export interface GeriAdim { o: RotaAdimi; m?: string; g?: string; fas?: string; a: number; b: number; h: number }
export interface GeriZamanlama { bas: number; adim: GeriAdim[] }

// Bir ürün partisini terminden geriye zamanlar: adımlar rota sırasının tersiyle, her adım en hızlı tezgâhında; üstüne adım başı bekleme.
export function geriZamanla(cal: UfukTakvimi, u: Urun, adet: number, due: number, kuyruk: number, tezOf: Record<string, Tezgah>,
  fsOf: Record<string, Fasoncu>, gunH: Record<string, number>): GeriZamanlama {
  const adim: GeriAdim[] = []; let t = due;
  for (const o of [...(u.rota ?? [])].reverse()) {
    const ts = (o.tezgahlar ?? []).filter((x) => tezOf[x.id]);
    if (o.fason || !ts.length) {
      const f = o.fason ? fsOf[o.fason] : undefined;
      const gun = f ? n(f.sureGun) + 7 / Math.max(1, (f.cikisGunleri ?? []).length) / 2 : 2;
      const a = t - gun * 24;
      adim.push({ o, fas: o.fason || '?', a, b: t, h: 0 });
      t = geriIsGunu(cal, a, kuyruk);
      continue;
    }
    let en: { s: number; x: (typeof ts)[number] } | null = null;
    for (const x of ts) { const s = n(x.cevrim) / (n(tezOf[x.id]?.verim) || 1); if (!en || s < en.s) en = { s, x }; }
    if (!en) continue;
    const tz = tezOf[en.x.id];
    const h = (n(en.x.ayar) + adet * n(en.x.cevrim)) / 60 / (n(tz?.verim) || 1);
    const a = geriIsGunu(cal, t, h / Math.max(1, gunH[en.x.id] || 8));
    adim.push({ o, m: en.x.id, g: tz?.grup || en.x.id, a, b: t, h });
    t = geriIsGunu(cal, a, kuyruk);
  }
  adim.reverse();
  return { bas: adim[0]?.a ?? due, adim };
}

export interface UfukAyi { k: string; ad: string; a0: number; a: number; b: number; kesir: number }
export interface UfukOngorusu { urun: string; ay: UfukAyi; tah: number; fir: number; net: number; due: number; r?: GeriZamanlama }

// Ürün ve ay başına öngörü (Yıllık plan ayarından); aynı ürün ve aydaki sipariş tahmini tüketir.
export function ufukOngorusu(D: PlanVerisi, z: Zaman, aylar: readonly UfukAyi[], now: number, gec: TalepHizi, A: YillikAyar): UfukOngorusu[] {
  const out: UfukOngorusu[] = [];
  const sip = D.siparisler.map((s) => ({ s, t: saatOku(z, s.termin) })).filter((x): x is { s: Siparis; t: number } => x.t !== null);
  if (A.tahmin !== 'elle' && !gec.hiz) return out;
  const hiz = gec.hiz ?? {};
  let aile: Record<string, string> = {}; const pay: Record<string, number> = {};
  if (A.tahmin === 'elle') {
    aile = urunAileleri(D).urunAile;
    for (const u of D.urunler) pay[u.id] = toplam(D.siparisler.filter((s) => s.urun === u.id).map((s) => n(s.adet)));
    const fTop: Record<string, number> = {};
    for (const u of D.urunler) { const f = aile[u.id] ?? ''; fTop[f] = (fTop[f] ?? 0) + (pay[u.id] ?? 0); }
    for (const u of D.urunler) {
      const f = aile[u.id] ?? ''; const say = D.urunler.filter((x) => aile[x.id] === f).length;
      pay[u.id] = (fTop[f] ?? 0) > 0 ? (pay[u.id] ?? 0) / (fTop[f] ?? 1) : 1 / Math.max(1, say);
    }
  }
  for (const u of D.urunler) for (const ay of aylar) {
    let tah = 0; const gunAy = (ay.b - ay.a) / 24;
    if (A.tahmin === 'elle') {
      const m = A.elle[aile[u.id] ?? '']?.[ay.k];
      if (m === undefined || m === null) continue;
      tah = m * (pay[u.id] ?? 0) * ay.kesir;
    } else tah = (hiz[u.id] ?? 0) * gunAy / 7 * Math.pow(1 + (A.buyume || 0) / 100, ((ay.a + ay.b) / 2 - now) / 24 / 365);
    const fir = toplam(sip.filter((x) => x.s.urun === u.id && x.t >= ay.a && x.t < ay.b).map((x) => n(x.s.adet)));
    const net = Math.round(Math.max(0, tah - fir));
    if (net > 0) out.push({ urun: u.id, ay, tah, fir, net, due: ay.b - 7 });
  }
  return out;
}

export type UfukKatmani = 'plan' | 'kaba' | 'ongoru';
export interface UfukHaftasi { k: number; a: number; b: number; ad: string; plan: boolean }
export interface UfukYuku { g: string; kat: UfukKatmani; w0: number | null; w1: number | null; h: number; j: string; op?: string; adim?: string; ad?: string }
export interface UfukHucresi { plan: number; kaba: number; ongoru: number; top: number; kap: number; o: number; oK: number }
export interface UfukSatiri { g: string; n: number; w: UfukHucresi[] }
export interface UfukKabasi { s: Siparis; r: GeriZamanlama; gec: number; havuz: boolean }

export interface MalzemeOlayi { kod: string; t: number; q: number; kat: UfukKatmani; j: string }
export interface MalzemeHaftasi { plan: number; kaba: number; ongoru: number; gelen: number; yeni: number; talep: number; son: number | null }
export interface MalzemeSatiri {
  kod: string; ad: string; birim: string; stok: number; yol: number; plan: number; kaba: number; ongoru: number;
  tedarikGun: number; muayeneGun: number;
  yeni: { q: number; ihtiyac: number; talep: number; j: string; kat: UfukKatmani }[];
  one: { po: number; ted: string; q: number; ihtiyac: number; geli: number; j: string }[];
  satir: MalzemeHaftasi[];
  yeniQ: number; ilkTalep: number | null; gec: boolean; yakin: boolean; fiyat: number | null;
}

export interface UfukVerisi {
  gec: TalepHizi; H: UfukHaftasi[]; sat: UfukSatiri[]; yuk: UfukYuku[]; kaba: UfukKabasi[]; ong: UfukOngorusu[]; aylar: UfukAyi[];
  mal: MalzemeSatiri[]; now: number; fasN: number; failJ: Set<string>; malzemesiz: Set<string>; son: number;
}

interface PlanIslemi { id?: unknown; job?: unknown; m?: unknown; S?: unknown; C?: unknown; done?: unknown; su?: unknown; run?: unknown }

// Ufuk: planın işlemleri, plan dışı siparişlerin geriye zamanlaması ve öngörü aynı hafta ızgarasında; malzeme netleştirmesi. Plan yoksa null.
export function ufukVerisi(c: PlanlamaCalismasi, z: Zaman, ongoruGoster: boolean): UfukVerisi | null {
  const p = c.plan;
  if (p === null || !nesneMi(p.ops)) return null;
  const D = c.D; const A = ufukAyarOku(D); const Y = yillikAyarOku(D); const now = simdiOku(c);
  const cal = ufukTakvimi(D, z); const verim = kullanilabilirlik(D) / 100;
  const tezOf = Object.fromEntries(D.tezgahlar.map((t) => [t.id, t]));
  const fsOf = Object.fromEntries((D.fasoncular ?? []).map((f) => [f.id, f]));
  const grupOf = (id: string): string => tezOf[id]?.grup || id;
  // Haftalar bugünün haftasının pazartesisinden.
  const g0 = Math.floor(now / 24);
  const pzt = g0 - ((new Date(z.base + g0 * 864e5).getUTCDay() + 6) % 7);
  const H: UfukHaftasi[] = Array.from({ length: A.hafta }, (_, k) => { const a = (pzt + 7 * k) * 24; return { k, a, b: a + 168, ad: gunAy(z, a), plan: a < HDAYS * 24 }; });
  const ilkA = H[0]?.a ?? 0;
  const son = H[H.length - 1]?.b ?? ilkA;
  const wOf = (t: number): number => (t < ilkA ? 0 : Math.min(H.length - 1, Math.floor((t - ilkA) / 168)));
  // Kapasite: grup × hafta.
  const gunH: Record<string, number> = {};
  const gruplar = [...new Set(D.tezgahlar.map((t) => t.grup || t.id))];
  const kap: Record<string, number[]> = Object.fromEntries(gruplar.map((g) => [g, H.map(() => 0)]));
  for (const m of D.tezgahlar) {
    let top = 0; let say = 0; const l = kap[m.grup || m.id];
    for (const w of H) for (let d = w.a / 24; d < w.b / 24; d++) {
      if (d < g0) continue;
      const s = cal.tezSaat(m, d);
      if (l) l[w.k] = (l[w.k] ?? 0) + s * verim;
      if (s > 0) { top += s; say++; }
    }
    gunH[m.id] = say ? top / say : 0;
  }
  // Yük kaydı: [a, b) aralığına h saat, haftalara takvim süresiyle.
  const yuk: UfukYuku[] = [];
  const hucre: Record<string, { plan: number; kaba: number; ongoru: number }[]> = Object.fromEntries(gruplar.map((g) => [g, H.map(() => ({ plan: 0, kaba: 0, ongoru: 0 }))]));
  const ekle = (g: string, kat: UfukKatmani, a: number, b: number, h: number, ref: Omit<UfukYuku, 'g' | 'kat' | 'w0' | 'w1' | 'h'>): void => {
    const hs = hucre[g];
    if (!(h > 0) || !hs) return;
    const aa = Math.max(a, ilkA); const bb = Math.min(b, son);
    if (bb <= aa) {
      if (a >= son) return;
      const w = wOf(aa); const x = hs[w]; if (x) x[kat] += h;
      yuk.push({ g, kat, w0: w, w1: w, h, ...ref });
      return;
    }
    const L = b - a; let w0: number | null = null; let w1: number | null = null;
    for (let w = wOf(aa); w < H.length && (H[w]?.a ?? Infinity) < bb; w++) {
      const hw = H[w]; const x = hs[w]; if (!hw || !x) continue;
      const o = Math.min(bb, hw.b) - Math.max(aa, hw.a);
      if (o <= 0) continue;
      x[kat] += h * o / Math.max(1e-9, L);
      w0 ??= w; w1 = w;
    }
    yuk.push({ g, kat, w0, w1, h: h * (bb - aa) / Math.max(1e-9, L), ...ref });
  };
  // 1. plan
  const planli = new Set<string>(); const ilk: Record<string, number> = {}; let fasN = 0;
  for (const r of Object.values(p.ops as Record<string, PlanIslemi>)) {
    const S = Number(r.S); const C = Number(r.C); const job = String(r.job);
    if (!Number.isFinite(S) || !Number.isFinite(C)) continue;
    planli.add(job);
    if (r.done) continue;
    if (ilk[job] === undefined || S < (ilk[job] ?? Infinity)) ilk[job] = S;
    if (C <= now) continue;
    const h0 = n(r.su) + n(r.run); let a = S; let h = h0;
    if (a < now) { h = h0 * (C - now) / Math.max(1e-9, C - S); a = now; }
    if (String(r.m).startsWith('@')) { fasN++; continue; }
    ekle(grupOf(String(r.m)), 'plan', a, C, h, { j: job, op: String(r.id) });
  }
  const failJ = new Set(diziOku<unknown>(p.fail).map((id) => String(id).split('.')[0] ?? '').filter((j) => planli.has(j)));
  // 2. plan dışı: geriye zamanlama
  const urunOf = Object.fromEntries(D.urunler.map((u) => [u.id, u]));
  const kaba: UfukKabasi[] = [];
  for (const s of D.siparisler) {
    if (planli.has(s.id)) continue;
    const u = urunOf[s.urun]; const due = saatOku(z, s.termin);
    if (!u || due === null) continue;
    let r = geriZamanla(cal, u, n(s.adet), due, A.kuyruk, tezOf, fsOf, gunH); let gec = 0;
    if (r.bas < now) {
      const dt = now - r.bas;
      for (const x of r.adim) { x.a += dt; x.b += dt; }
      gec = r.adim.length ? (r.adim[r.adim.length - 1]?.b ?? due) - due : 0;
      r = { ...r, bas: now };
    }
    kaba.push({ s, r, gec, havuz: !!s.havuz });
    for (const x of r.adim) if (!x.fas && x.g) ekle(x.g, 'kaba', x.a, x.b, x.h, { j: s.id, adim: x.o.k, ad: x.o.ad ?? '' });
  }
  // 3. öngörü
  const aylar: UfukAyi[] = [];
  {
    const d0 = new Date(z.base + ilkA * 36e5); let y = d0.getUTCFullYear(); let m = d0.getUTCMonth();
    for (let i = 0; i < 14; i++) {
      const a0 = (Date.UTC(y, m, 1) - z.base) / 36e5; const b = (Date.UTC(y, m + 1, 1) - z.base) / 36e5;
      if (a0 >= son) break;
      const a = Math.max(a0, now);
      if (b > now) aylar.push({ k: `${y}-${iki(m + 1)}`, ad: `${OL_AY[m] ?? ''} ${String(y).slice(2)}`, a0, a, b: Math.min(b, son), kesir: (Math.min(b, son) - a) / (b - a0) });
      m++; if (m > 11) { m = 0; y++; }
    }
  }
  const gec = talepHizi(D, z, now);
  const ong = ongoruGoster ? ufukOngorusu(D, z, aylar, now, gec, Y) : [];
  for (const o of ong) {
    const u = urunOf[o.urun]; if (!u) continue;
    let r = geriZamanla(cal, u, o.net, Math.min(o.due, son - 1), A.kuyruk, tezOf, fsOf, gunH);
    if (r.bas < now) { const dt = now - r.bas; for (const x of r.adim) { x.a += dt; x.b += dt; } r = { ...r, bas: now }; }
    o.r = r;
    for (const x of r.adim) if (!x.fas && x.g) ekle(x.g, 'ongoru', x.a, x.b, x.h, { j: `Öngörü ${u.id} ${o.ay.ad}`, adim: x.o.k, ad: x.o.ad ?? '' });
  }
  // Malzeme: ürün başına birim miktar en son siparişten.
  const birimMal: Record<string, { kod: string; miktar: number }[]> = {};
  for (const s of D.siparisler) if ((s.malzeme ?? []).length) birimMal[s.urun] = s.malzeme ?? [];
  const olay: MalzemeOlayi[] = [];
  for (const s of D.siparisler) {
    const t = planli.has(s.id) ? ilk[s.id] ?? null : null;
    const kb = kaba.find((x) => x.s.id === s.id);
    const need = t ?? (kb ? kb.r.bas : null);
    if (need === null || need >= son) continue;
    for (const r of s.malzeme ?? []) olay.push({ kod: r.kod, t: need, q: n(r.miktar) * n(s.adet), kat: t !== null ? 'plan' : 'kaba', j: s.id });
  }
  const malzemesiz = new Set<string>();
  for (const o of ong) {
    const l = birimMal[o.urun];
    if (!l) { malzemesiz.add(o.urun); continue; }
    if (!o.r || o.r.bas >= son) continue;
    for (const r of l) olay.push({ kod: r.kod, t: o.r.bas, q: n(r.miktar) * o.net, kat: 'ongoru', j: `Öngörü ${o.urun} ${o.ay.ad}` });
  }
  const mal = ufukMalzemesi(D, z, olay, now, A.ongoruMalzeme, wOf, H, cal);
  const sat: UfukSatiri[] = gruplar.map((g) => ({
    g, n: D.tezgahlar.filter((t) => (t.grup || t.id) === g).length,
    w: H.map((w) => {
      const x = hucre[g]?.[w.k] ?? { plan: 0, kaba: 0, ongoru: 0 };
      const k = kap[g]?.[w.k] ?? 0; const top = x.plan + x.kaba + x.ongoru;
      return { ...x, top, kap: k, o: k > 0 ? top / k : top > 0 ? Infinity : 0, oK: k > 0 ? (x.plan + x.kaba) / k : 0 };
    }),
  })).filter((x) => x.w.some((h) => h.kap > 0 || h.top > 0));
  return { gec, H, sat, yuk, kaba, ong, aylar, mal, now, fasN, failJ, malzemesiz, son };
}

// Malzeme netleştirme: olaylar zaman sırasıyla; stok, açık satın alma (etkin geliş), öne çekme, yeni alım.
export function ufukMalzemesi(D: PlanVerisi, z: Zaman, olay: readonly MalzemeOlayi[], now: number, ongoruDahil: boolean, wOf: (t: number) => number,
  H: readonly UfukHaftasi[], cal: UfukTakvimi): MalzemeSatiri[] {
  const isGunuOnce = (t: number): number => { let d = Math.floor(t / 24); let g = 0; while (!cal.isGunu(d) && g++ < 30) d--; return d * 24 + 8; };
  const mats = Object.fromEntries((D.malzemeler ?? []).map((m) => [m.kod, m]));
  const ted = Object.fromEntries(diziOku<Nesne>(D.tedarikciler).map((t) => [String(t.id), t]));
  const satinalma = diziOku<Nesne>(D.satinalma);
  const kodlar = [...new Set([...olay.map((o) => o.kod), ...satinalma.map((p) => String(p.kod))])].filter((k) => olay.some((o) => o.kod === k));
  return kodlar.map((kod): MalzemeSatiri => {
    const m = mats[kod]; const mu = n(m?.muayeneGun) * 24; const td = n(m?.tedarikGun) * 24;
    const po = satinalma.map((x, i) => ({ x, i })).filter(({ x }) => x.kod === kod).map(({ x, i }) => {
      const soz = saatOku(z, x.gelis); const tt = ted[String(x.tedarikci)];
      return { i, ted: String(x.tedarikci ?? ''), q: n(x.miktar), kalan: n(x.miktar), t: soz === null ? 1e9 : soz + (tt ? n(tt.ortGecikmeGun) : 0) * 24 + mu };
    }).sort((a, b) => a.t - b.t);
    let eld = n(m?.stok);
    const yeni: MalzemeSatiri['yeni'] = []; const one: MalzemeSatiri['one'] = [];
    const satir: MalzemeHaftasi[] = H.map(() => ({ plan: 0, kaba: 0, ongoru: 0, gelen: 0, yeni: 0, talep: 0, son: null }));
    const hf = (t: number): MalzemeHaftasi => satir[wOf(t)] ?? { plan: 0, kaba: 0, ongoru: 0, gelen: 0, yeni: 0, talep: 0, son: null };
    const l = olay.filter((o) => o.kod === kod).sort((a, b) => a.t - b.t);
    let pi = 0;
    const gelenAl = (t: number): void => {
      while (pi < po.length && (po[pi]?.t ?? Infinity) <= t) { const x = po[pi++]; if (!x) break; eld += x.kalan; if (x.kalan > 0) hf(Math.max(x.t, now)).gelen += x.kalan; x.kalan = 0; }
    };
    for (const o of l) {
      hf(o.t)[o.kat] += o.q;
      if (o.kat === 'ongoru' && !ongoruDahil) continue;
      gelenAl(o.t);
      let eks = o.q - eld; eld = Math.max(0, eld - o.q);
      if (eks <= 1e-9) continue;
      for (let k = pi; k < po.length && eks > 1e-9; k++) {
        const x = po[k]; if (!x || x.kalan <= 1e-9) continue;
        const q = Math.min(x.kalan, eks); x.kalan -= q; eks -= q;
        one.push({ po: x.i, ted: x.ted, q, ihtiyac: o.t, geli: x.t, j: o.j });
        hf(Math.max(o.t, now)).gelen += q;
      }
      if (eks > 1e-9) {
        const talep = isGunuOnce(o.t - mu - td);
        yeni.push({ q: eks, ihtiyac: o.t, talep, j: o.j, kat: o.kat });
        hf(o.t).yeni += eks; hf(Math.max(talep, now)).talep += eks;
      }
    }
    gelenAl(Infinity);
    // Hafta sonu eldeki: stok + gelen − tüketilen (öngörü ayara göre).
    let e = n(m?.stok);
    for (const s of satir) { e += s.gelen + s.yeni - s.plan - s.kaba - (ongoruDahil ? s.ongoru : 0); s.son = e; }
    const brut = (k: UfukKatmani): number => toplam(l.filter((o) => o.kat === k).map((o) => o.q));
    const ilkTalep = yeni.length ? Math.min(...yeni.map((y) => y.talep)) : null;
    return {
      kod, ad: m?.ad || kod, birim: m?.birim || '', stok: n(m?.stok), yol: toplam(po.map((x) => x.q)), plan: brut('plan'), kaba: brut('kaba'), ongoru: brut('ongoru'),
      tedarikGun: n(m?.tedarikGun), muayeneGun: n(m?.muayeneGun), yeni, one, satir,
      yeniQ: toplam(yeni.map((y) => y.q)), ilkTalep,
      gec: ilkTalep !== null && ilkTalep < Math.floor(now / 24) * 24,
      yakin: ilkTalep !== null && ilkTalep >= now && ilkTalep < now + 7 * 24,
      fiyat: m?.birimFiyat === undefined || m.birimFiyat === null ? null : Number(m.birimFiyat),
    };
  }).sort((a, b) => (a.ilkTalep ?? 1e12) - (b.ilkTalep ?? 1e12));
}
