import type { PlanlamaCalismasi, PlanVerisi, Siparis, Tezgah } from '../tipler.ts';

// P3'ün saf hesapları (205 a): maliyet, genel gider, ek mesai ve fason. Bugünkü sayfanın hesaplarının aynısıdır (cerceve/planlama/parca
// zu-yan-sayfalar, zz6-maliyet-mesai, zv-termin; motor/durum.betik ymAyar, wipAyar, agBedel; motor/engine.betik compile ve matAlloc'un
// takvim ve malzeme kısmı). Plan motoru tarayıcıda yoktur (357 b): plan çözülmez, yalnız çalışmadaki son plan okunur; motorla ölçülen
// öneriler burada hesaplanmaz. Veri yoksa null döner, sıfır uydurulmaz.

type Nesne = Record<string, unknown>;
const nesneMi = (v: unknown): v is Nesne => typeof v === 'object' && v !== null && !Array.isArray(v);
export const sayiOku = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const metin = (v: unknown): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v as number));
const diziOku = (v: unknown): Nesne[] => (Array.isArray(v) ? v.filter(nesneMi) : []);
const top = (l: readonly number[]): number => l.reduce((a, b) => a + b, 0);
const alan = (o: unknown, k: string): unknown => (nesneMi(o) ? o[k] : undefined);

// ---------- biçim ----------
const BICIM: Record<number, Intl.NumberFormat> = {};
export const YOK = '—';
export function sayi(x: number | null | undefined, k = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return YOK;
  BICIM[k] ??= new Intl.NumberFormat('tr-TR', { maximumFractionDigits: k, minimumFractionDigits: 0 });
  return BICIM[k].format(x);
}
export const saatYaz = (x: number | null | undefined): string => (x === null || x === undefined || !Number.isFinite(x) ? YOK : `${sayi(x, 1)} sa`);
export const tl = (x: number | null | undefined): string => (x === null || x === undefined || !Number.isFinite(x) ? YOK : `${sayi(Math.round(x), 0)} TL`);
export const tlSaat = (x: number | null | undefined): string => (x === null || x === undefined || !Number.isFinite(x) ? YOK : `${sayi(x, x < 10 ? 1 : 0)} TL/sa`);
export const tlEksi = (x: number): string => (x < 0 ? `−${tl(-x)}` : tl(x));
export const yuzde = (x: number | null | undefined): string => (x === null || x === undefined || !Number.isFinite(x) ? YOK : `%${sayi(x * 100, 1)}`);
// Isı haritası hücresinin kısa tutarı (zz30-isi isTL).
export function kisaTl(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return '';
  if (Math.abs(x) >= 1e6) return `${sayi(x / 1e6, 1)} Mn`;
  if (Math.abs(x) >= 1e4) return `${sayi(x / 1e3, 0)} bin`;
  return sayi(Math.round(x), 0);
}
export const kucukHarf = (s: string): string => s.toLocaleLowerCase('tr-TR');

// ---------- zaman: planın saat ekseni başlangıç günü 00:00'dan saattir (engine.betik parseT, fmtDT) ----------
const GUN = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'] as const;
const GUN_AD = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;
export type GunAnahtari = (typeof GUN)[number];
const iki = (n: number): string => String(n).padStart(2, '0');

export function baslangicMs(D: PlanVerisi): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(metin(D.meta?.baslangic));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
export function saatOku(D: PlanVerisi, s: unknown): number | null {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  if (typeof s !== 'string' || s === '') return null;
  const b = baslangicMs(D);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(s.trim());
  if (b === null || !m) return null;
  return (Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0) - b) / 3600000;
}
const tarihOf = (D: PlanVerisi, t: number): Date | null => { const b = baslangicMs(D); return b === null ? null : new Date(b + t * 3600000); };
// "12.10 Pzt 08:00"
export function zamanYaz(D: PlanVerisi, t: number | null | undefined): string {
  if (t === null || t === undefined || !Number.isFinite(t)) return YOK;
  const d = tarihOf(D, t);
  if (d === null) return YOK;
  return `${iki(d.getUTCDate())}.${iki(d.getUTCMonth() + 1)} ${GUN_AD[(d.getUTCDay() + 6) % 7] ?? ''} ${iki(d.getUTCHours())}:${iki(d.getUTCMinutes())}`;
}
export const gunYaz = (D: PlanVerisi, t: number | null | undefined): string => (t === null || t === undefined || !Number.isFinite(t) ? YOK : zamanYaz(D, t).slice(0, 9).trim());
export function isoGun(D: PlanVerisi, g: number): string {
  const d = tarihOf(D, g * 24);
  return d === null ? '' : `${String(d.getUTCFullYear())}-${iki(d.getUTCMonth() + 1)}-${iki(d.getUTCDate())}`;
}
export function isoSaat(D: PlanVerisi, t: number): string {
  const d = tarihOf(D, t);
  return d === null ? '' : `${isoGun(D, Math.floor(t / 24))} ${iki(d.getUTCHours())}:${iki(d.getUTCMinutes())}`;
}
export function gunNo(D: PlanVerisi, iso: string): number | null { const t = saatOku(D, iso); return t === null ? null : Math.floor(t / 24); }
export function haftaGunu(D: PlanVerisi, g: number): GunAnahtari {
  const d = tarihOf(D, g * 24);
  return GUN[d === null ? 0 : (d.getUTCDay() + 6) % 7] ?? 'pzt';
}
const hm = (s: unknown): number => { const [h, m] = metin(s).split(':').map(Number); return (h ?? 0) + (m ?? 0) / 60; };
// Sayfanın "şimdi"si: plan başlangıcı 07:00'den önce değil, yeniden planlamada yazılan gerçek saat (girdi.betik simdiUygula, 31 a).
export function simdiSaati(c: PlanlamaCalismasi): number { const s = sayiOku(c.simdi); return s !== null && s > 7 ? s : 7; }

// ---------- ayarlar (motor/durum.betik) ----------
export interface MaliyetAyari { amac: string; risk: number; karHedef: number; mesaiCarpan: number; operatorUcret: number | null; genelGider: number | null }
const YM0: MaliyetAyari = { amac: 'tl', risk: 0.25, karHedef: 25, mesaiCarpan: 1.5, operatorUcret: null, genelGider: 120 };
export function ymAyar(D: PlanVerisi): MaliyetAyari {
  const p = nesneMi(D.planTL) ? D.planTL : {};
  return { ...YM0, ...p } as MaliyetAyari;
}
export interface BeklemeAyari { ac: boolean; vadeBas: 'termin' | 'bitis'; paletM2: number; paletAdet: number; tasimaSa: number; alan: number; loj: number; alfa: number; esik: number }
const WIP0: BeklemeAyari = { ac: true, vadeBas: 'termin', alan: 12.5, loj: 450, alfa: 0.05, esik: 8, paletM2: 2, paletAdet: 50, tasimaSa: 0.25 };
export function wipAyar(D: PlanVerisi): BeklemeAyari {
  const w = alan(D.planTL, 'wip');
  return { ...WIP0, ...(nesneMi(w) ? w : {}) } as BeklemeAyari;
}
interface AgAyari {
  kip: string; taban: number; fin: number; tavan: number; kar: number;
  sinif: Record<string, number>; bil: Record<string, number>;
}
const AG0: AgAyari = { kip: 'bedel', taban: 10, fin: 0.13, tavan: 10, kar: 0.3, sinif: { A: 1.5, B: 1, C: 0.7 }, bil: { ceza: 1, fin: 1, kar: 1, sinif: 1, elle: 1 } };
export function agAyar(D: PlanVerisi): AgAyari {
  const a = nesneMi(D.planAgirlik) ? D.planAgirlik : {};
  return { ...AG0, ...a, sinif: { ...AG0.sinif, ...(nesneMi(a.sinif) ? a.sinif : {}) }, bil: { ...AG0.bil, ...(nesneMi(a.bil) ? a.bil : {}) } } as AgAyari;
}
export interface TerminAyari { katMal: number; katFas: number; ekMal: number; ekFas: number; esik: number }
const TM0: TerminAyari = { katMal: 1, katFas: 1, ekMal: 0, ekFas: 0, esik: 7 };
export function tmAyar(D: PlanVerisi): TerminAyari { return { ...TM0, ...(nesneMi(D.terminAyar) ? D.terminAyar : {}) } as TerminAyari; }
export function pdDenge(D: PlanVerisi): number { const v = sayiOku(D.planDenge); return v === null ? 50 : Math.max(0, Math.min(100, v)); }
export const pdKat = (d: number): number => (d <= 50 ? 100 ** ((50 - d) / 50) : 10 ** ((50 - d) / 50));
export const ayarciUcreti = (D: PlanVerisi): number => sayiOku(alan(D.ayarlar, 'ayarciUcret')) ?? 0;
export const fasonTalasId = (D: PlanVerisi): string => metin(alan(D.ayarlar, 'fasonTalas'));
// Ek mesai tek ücreti; ayarlanmamışsa bedel bilinmez (zu-yan-sayfalar ymMesaiUcret).
export const mesaiUcreti = (D: PlanVerisi): number | null => sayiOku(alan(D.ayarlar, 'mesaiUcret'));

// ---------- malzeme: kalite ve formun kg fiyatı (zu-yan-sayfalar) ----------
export const ML_CINS = ['Karbon çeliği', 'Alaşımlı çelik', 'Paslanmaz çelik', 'Takım çeliği', 'Alüminyum', 'Titanyum', 'Bakır alaşımı', 'Plastik', 'Diğer'] as const;
export const ML_FORM = ['Çubuk', 'Levha', 'Blok', 'Boru', 'Profil', 'Dövme', 'Döküm'] as const;
export interface KgFiyati { id: string; cins: string; kalite: string; form: string; fiyat: number | null; fire: number | null; tarih: string | null; kim: string }
export interface TalasFiyati { kalite: string; cins: string; fiyat: number | null; tarih: string | null; kim: string }
export const norm = (x: unknown): string => metin(x).trim().toLocaleUpperCase('tr-TR');
export function kgFiyatlari(D: PlanVerisi): KgFiyati[] | null {
  if (!Array.isArray(D.kgFiyat)) return null;
  return diziOku(D.kgFiyat).map((r) => ({
    id: metin(r.id), cins: metin(r.cins), kalite: metin(r.kalite), form: metin(r.form), fiyat: sayiOku(r.fiyat), fire: sayiOku(r.fire),
    tarih: typeof r.tarih === 'string' ? r.tarih : null, kim: metin(r.kim),
  }));
}
export function talasFiyatlari(D: PlanVerisi): TalasFiyati[] {
  const l = diziOku(D.talasFiyat).map((t) => ({ kalite: metin(t.kalite), cins: metin(t.cins), fiyat: sayiOku(t.fiyat), tarih: typeof t.tarih === 'string' ? t.tarih : null, kim: metin(t.kim) }));
  // Kg fiyatı girilen her kalite talaş listesinde de görünür (tlGoc); fiyatı yoksa boş satırdır.
  for (const r of kgFiyatlari(D) ?? []) {
    if (r.kalite && !l.some((t) => norm(t.kalite) === norm(r.kalite))) l.push({ kalite: r.kalite, cins: r.cins, fiyat: null, tarih: null, kim: '' });
  }
  return l;
}
export interface MalzemeBilgisi { kod: string; ad: string; birim: string; cins: string; kalite: string; form: string; olcu: string; kgBirim: number | null; kaynakFiyat: number | null }
export function malzemeler(D: PlanVerisi): MalzemeBilgisi[] {
  return (D.malzemeler ?? []).map((m) => ({
    kod: m.kod, ad: metin(m.ad), birim: metin(m.birim), cins: metin(m.cins), kalite: metin(m.kalite), form: metin(m.form), olcu: metin(m.olcu),
    kgBirim: sayiOku(m.kgBirim), kaynakFiyat: sayiOku(m.birimFiyat),
  }));
}
// Fiyat satırı kalite ve formla eşleşir; formu boş satır o kalitenin bütün formlarına geçer.
export function kgSatiri(D: PlanVerisi, m: Pick<MalzemeBilgisi, 'kalite' | 'form'>): KgFiyati | null {
  const l = kgFiyatlari(D) ?? [];
  const k = norm(m.kalite);
  if (!k) return null;
  return l.find((r) => norm(r.kalite) === k && norm(r.form) === norm(m.form)) ?? l.find((r) => norm(r.kalite) === k && !norm(r.form)) ?? null;
}
// Birim maliyet: kg fiyat listesi varsa ondan (birim kg değilse bir birimin ağırlığıyla), yoksa kaynağın birim maliyeti.
export function birimMaliyet(D: PlanVerisi, m: MalzemeBilgisi): number | null {
  if (kgFiyatlari(D) === null) return m.kaynakFiyat;
  const r = kgSatiri(D, m);
  if (!r || r.fiyat === null) return null;
  if (m.birim === 'kg') return r.fiyat;
  return m.kgBirim !== null && m.kgBirim > 0 ? r.fiyat * m.kgBirim : null;
}
export const firePayi = (D: PlanVerisi, m: MalzemeBilgisi): number => kgSatiri(D, m)?.fire ?? 0;
const talasSatiri = (D: PlanVerisi, kalite: string): TalasFiyati | null => talasFiyatlari(D).find((t) => norm(t.kalite) === norm(kalite)) ?? null;

// Siparişin malzeme tutarı: birim maliyet × fire dahil miktar × adet; bir malzemenin fiyatı yoksa bilinmez (engine.betik matAlloc fiyat).
export function malzemeTutari(D: PlanVerisi, s: Siparis): number | null {
  const ml = malzemeler(D);
  let t = 0;
  for (const r of s.malzeme ?? []) {
    const m = ml.find((x) => x.kod === r.kod);
    const b = m ? birimMaliyet(D, m) : null;
    if (!m || b === null) return null;
    t += b * r.miktar * (1 + firePayi(D, m) / 100) * s.adet;
  }
  return t;
}
// Talaş kredisi: (hammadde kg × (1 + fire) − net parça kg) × adet × kalitenin talaş fiyatı (214 a); net ağırlık ya da fiyat yoksa null.
export function talasKredisi(D: PlanVerisi, s: Siparis): { kg: number; tl: number } | null {
  const u = D.urunler.find((x) => x.id === s.urun);
  const net = sayiOku(u?.netKg);
  if (!u || net === null || !(s.malzeme ?? []).length) return null;
  const ml = malzemeler(D);
  let kg = 0, tutar = 0;
  for (const r of s.malzeme ?? []) {
    const m = ml.find((x) => x.kod === r.kod);
    if (!m) return null;
    const kb = m.birim === 'kg' ? 1 : m.kgBirim ?? 0;
    const tf = talasSatiri(D, m.kalite);
    if (!(kb > 0) || !tf || tf.fiyat === null) return null;
    const h = r.miktar * kb * (1 + firePayi(D, m) / 100);
    kg += h; tutar += h * tf.fiyat;
  }
  const t = (kg - net) * s.adet;
  if (!(t > 0)) return { kg: 0, tl: 0 };
  return { kg: t, tl: (tutar / kg) * t };
}

// ---------- plan ----------
export interface PlanIsi { id: string; job: string; m: string; S: number; C: number; su: number; run: number; fas: boolean; done: boolean; act: boolean; sl: number | null }
export function planIsleri(c: PlanlamaCalismasi): PlanIsi[] {
  const ops = alan(c.plan, 'ops');
  if (!nesneMi(ops)) return [];
  return Object.entries(ops).filter((e): e is [string, Nesne] => nesneMi(e[1])).map(([id, r]) => ({
    id: metin(r.id) || id, job: metin(r.job), m: metin(r.m), S: sayiOku(r.S) ?? Number.NaN, C: sayiOku(r.C) ?? Number.NaN,
    su: sayiOku(r.su) ?? 0, run: sayiOku(r.run) ?? 0, fas: Boolean(r.fas), done: Boolean(r.done), act: Boolean(r.act), sl: sayiOku(r.sl),
  }));
}
export function planSonucu(c: PlanlamaCalismasi, job: string): { C: number | null; T: number | null } | null {
  const j = alan(alan(c.plan, 'J'), job);
  return nesneMi(j) ? { C: sayiOku(j.C), T: sayiOku(j.T) } : null;
}
export const urunAdi = (D: PlanVerisi, id: string): string => D.urunler.find((u) => u.id === id)?.ad ?? (id || YOK);
export const aktifSiparisler = (D: PlanVerisi): Siparis[] => D.siparisler.filter((s) => !s.havuz);

// ---------- takvim: tezgâhın çalışabilir pencereleri (engine.betik compile) ----------
export type Aralik = [number, number];
export const UFUK_GUN = 63;
function birlestir(W: Aralik[]): Aralik[] {
  const s = [...W].sort((a, b) => a[0] - b[0]);
  const o: Aralik[] = [];
  for (const w of s) {
    if (w[1] <= w[0]) continue;
    const son = o[o.length - 1];
    if (son && w[0] <= son[1] + 1e-9) son[1] = Math.max(son[1], w[1]);
    else o.push([w[0], w[1]]);
  }
  return o;
}
function cikar(W: Aralik[], D: Aralik[]): Aralik[] {
  if (!D.length) return W;
  const o: Aralik[] = [];
  for (const [a, b] of W) {
    let p: Aralik[] = [[a, b]];
    for (const [c, d] of D) {
      const n: Aralik[] = [];
      for (const [x, y] of p) {
        if (d <= x || c >= y) { n.push([x, y]); continue; }
        if (c > x) n.push([x, c]);
        if (d < y) n.push([d, y]);
      }
      p = n;
    }
    o.push(...p);
  }
  return o;
}
// Pencerelerin [a, b) içindeki toplam saati (engine.betik workIn).
export function calisilir(W: readonly Aralik[], a: number, b: number): number {
  let s = 0;
  for (const [x, y] of W) { if (x >= b) break; s += Math.max(0, Math.min(b, y) - Math.max(a, x)); }
  return s;
}
export interface Vardiya { id: string; bas: string; bit: string; molalar: { bas: string; bit: string }[] }
export function vardiyalar(D: PlanVerisi): Vardiya[] {
  return diziOku(D.vardiyalar).map((v) => ({ id: metin(v.id), bas: metin(v.bas), bit: metin(v.bit), molalar: diziOku(v.molalar).map((m) => ({ bas: metin(m.bas), bit: metin(m.bit) })) }));
}
// Vardiyanın saati (gece vardiyası ertesi güne taşar).
export function vardiyaSaati(D: PlanVerisi, id: string): number {
  const v = vardiyalar(D).find((x) => x.id === id);
  if (!v) return 0;
  let h = hm(v.bit) - hm(v.bas);
  if (h <= 0) h += 24;
  return h;
}
export interface EkMesai { m: string; gun: number; vardiya: string }
export function ekMesailer(c: Pick<PlanlamaCalismasi, 'ekMesai'>): EkMesai[] {
  return c.ekMesai.map((e) => ({ m: metin(e.m), gun: sayiOku(e.gun) ?? Number.NaN, vardiya: metin(e.vardiya) })).filter((e) => Number.isFinite(e.gun));
}
export interface TezgahTakvimi { tezgah: Tezgah; rw: Aralik[]; pay: number; verim: number; ucret: number | null; opOran: number }
export interface Takvim { gunler: { wd: GunAnahtari; vard: string[] }[]; M: Record<string, TezgahTakvimi> }
export function takvimKur(c: PlanlamaCalismasi, ek: EkMesai[] = ekMesailer(c)): Takvim {
  const D = c.D;
  const vs = new Map(vardiyalar(D).map((v) => [v.id, { bas: hm(v.bas), bit: hm(v.bit), mol: v.molalar.map((x) => [hm(x.bas), hm(x.bit)] as const) }]));
  const tatil = new Set((D.tatiller ?? []).map((s) => saatOku(D, s)).filter((t): t is number => t !== null).map((t) => Math.floor(t / 24)));
  const gunler: Takvim['gunler'] = [];
  for (let d = 0; d < UFUK_GUN; d++) {
    const wd = haftaGunu(D, d);
    const cg = D.calismaGunleri?.[wd];
    gunler.push({ wd, vard: tatil.has(d) ? [] : (Array.isArray(cg) ? cg.map(metin) : []) });
  }
  const inst = (d: number, sid: string): Aralik | null => { const v = vs.get(sid); if (!v) return null; const a = d * 24 + v.bas; let b = d * 24 + v.bit; if (b <= a) b += 24; return [a, b]; };
  const molalar = (d: number, sid: string): Aralik[] => {
    const v = vs.get(sid);
    if (!v) return [];
    return v.mol.map(([x, y]) => { let a = d * 24 + x; if (a < d * 24 + v.bas) a += 24; let b = d * 24 + y; if (b <= a) b += 24; return [a, b] as Aralik; });
  };
  const Y = ymAyar(D);
  const tampon = Boolean(c.param.tampon);
  const acilPay = sayiOku(c.param.acilPay) ?? 0;
  const M: Record<string, TezgahTakvimi> = {};
  for (const m of D.tezgahlar) {
    const own = m.vardiyalar?.length ? new Set(m.vardiyalar) : null;
    let sw: Aralik[] = [];
    gunler.forEach((g, d) => { for (const sid of g.vard) if (!own || own.has(sid)) { const w = inst(d, sid); if (w) sw.push(...cikar([w], molalar(d, sid))); } });
    for (const e of ek) if (e.m === m.id) { const w = inst(e.gun, e.vardiya); if (w) sw.push(...cikar([w], molalar(e.gun, e.vardiya))); }
    sw = birlestir(sw);
    let rw = sw;
    if (m.isiksiz) { const l: Aralik[] = []; gunler.forEach((g, d) => { if (g.vard.length) l.push([d * 24, d * 24 + 24]); }); rw = birlestir([...l, ...sw]); }
    const dn = c.down.filter((x) => metin(x.m) === m.id).map((x) => [sayiOku(x.from) ?? 0, sayiOku(x.to) ?? 0] as Aralik);
    rw = cikar(rw, dn);
    const ariza = sayiOku(m.arizaGun) ?? 0;
    const pay = tampon ? Math.min(0.35, (ariza > 0 ? (sayiOku(m.onarimSaat) ?? 0) / (ariza * 24) : 0) + acilPay) : 0;
    const opOran = m.opOran === undefined || m.opOran === null ? 1 : m.opOran;
    const u = m.ucret ?? null;
    M[m.id] = { tezgah: m, rw, pay, verim: m.verim || 1, opOran, ucret: u !== null && Y.operatorUcret !== null ? u + Y.operatorUcret * opOran : u };
  }
  return { gunler, M };
}

// ---------- adımlar: rotadan (engine.betik compile işlemler) ----------
// Kayıtlı süre sapması olayları (engine.betik applyEvent sure / sureOp): adımın çevrimi oranla çarpılır, sonraki olay öncekini ezer.
// Olaylar plan kurulmadan uygulandığı için (girdi.betik stKur) "sure" ürünün bütün siparişlerine gider.
export function sureSapmasi(c: PlanlamaCalismasi): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ev of c.olaylar) {
    const oran = sayiOku(ev.oran);
    if (oran === null) continue;
    if (ev.tip === 'sure') { for (const j of c.D.siparisler) if (j.urun === metin(ev.urun)) out[`${j.id}.${metin(ev.k)}`] = oran; }
    else if (ev.tip === 'sureOp') out[metin(ev.id)] = oran;
  }
  return out;
}
export interface IsTanimi { id: string; job: string; ad: string; adet: number; fason: string | null; fasonIzin: boolean; secenekler: { m: string; run: number }[]; onculler: string[] }
export function isTanimlari(c: PlanlamaCalismasi, T: Takvim): Map<string, IsTanimi> {
  const D = c.D;
  const out = new Map<string, IsTanimi>();
  const opAdet = nesneMi(D.opAdet) ? D.opAdet : {};
  const sapma = sureSapmasi(c);
  for (const j of aktifSiparisler(D)) {
    const u = D.urunler.find((x) => x.id === j.urun);
    for (const o of u?.rota ?? []) {
      const id = `${j.id}.${o.k}`;
      const ad = sayiOku(opAdet[id]) ?? j.adet;
      const sec: IsTanimi['secenekler'] = [];
      if (!o.fason) {
        for (const t of o.tezgahlar ?? []) {
          const mm = T.M[t.id];
          if (!mm) continue;
          const cyc = (((t.cevrim ?? 0) / 60) * (sapma[id] ?? 1)) / (1 - mm.pay);
          sec.push({ m: t.id, run: (ad * cyc) / mm.verim });
        }
      }
      out.set(id, {
        id, job: j.id, ad: metin(o.ad), adet: ad, fason: o.fason ?? null, fasonIzin: Boolean(o.fasonIzin), secenekler: sec,
        onculler: (o.bag ?? []).map((b) => `${j.id}.${metin(b[0])}`),
      });
    }
  }
  return out;
}

// ---------- fason ----------
export interface FasoncuBilgisi { id: string; ad: string; fiyat: number | null; saatFiyat: number | null; tasima: number | null; sureGun: number | null; kapasite: number | null; terminKat: number | null; terminEk: number | null }
export function fasoncular(D: PlanVerisi): FasoncuBilgisi[] {
  return (D.fasoncular ?? []).map((f) => ({
    id: f.id, ad: metin(f.ad) || f.id, fiyat: sayiOku(f.fiyat), saatFiyat: sayiOku(f.saatFiyat), tasima: sayiOku(f.tasima), sureGun: sayiOku(f.sureGun),
    kapasite: sayiOku(f.kapasite), terminKat: sayiOku(f.terminKat), terminEk: sayiOku(f.terminEk),
  }));
}
// Fason adımının tutarı: rotadaki fason adet fiyatı + taşıma; talaşlı fason işin en kısa tezgâh süresi × saat fiyatı + taşıma (ymFasonTL).
export function fasonTutari(D: PlanVerisi, r: PlanIsi, tanim: IsTanimi | undefined): number | null {
  const f = fasoncular(D).find((x) => `@${x.id}` === r.m);
  if (!f || !tanim) return null;
  const talasli = !tanim.fason && tanim.fasonIzin && r.m === `@${fasonTalasId(D)}`;
  if (talasli) {
    const h = Math.min(...tanim.secenekler.map((x) => x.run), Infinity);
    return Number.isFinite(h) && f.saatFiyat !== null ? h * f.saatFiyat + (f.tasima ?? 0) * tanim.adet : null;
  }
  return f.fiyat !== null ? (f.fiyat + (f.tasima !== null && f.tasima > 0 ? f.tasima : 0)) * tanim.adet : null;
}
export const fasonTalasliMi = (D: PlanVerisi, r: PlanIsi): boolean => r.m === `@${fasonTalasId(D)}`;

// ---------- genel gider sistemi (zz6-maliyet-mesai) ----------
export const MS_TUR = [['personel', 'Dolaylı personel'], ['kira', 'Kira'], ['enerji', 'Genel enerji'], ['su', 'Su'], ['dogalgaz', 'Doğalgaz ve ısınma'], ['bakim', 'Bakım sözleşmesi'], ['sigorta', 'Sigorta'], ['bt', 'Bilgi işlem ve lisans'], ['kalite', 'Kalibrasyon ve kalite'], ['isg', 'İSG, servis ve yemek'], ['sarf', 'Genel sarf'], ['diger', 'Diğer']] as const;
export const MS_ANAHTAR = [['saat', 'Makine saati'], ['alan', 'Alan (m²)'], ['kw', 'Kurulu güç (kW)'], ['kisi', 'Operatör sayısı'], ['esit', 'Eşit']] as const;
export const anahtarAdi = (k: string): string => MS_ANAHTAR.find((x) => x[0] === k)?.[1] ?? k;
export const turAnahtari = (tur: string): string => ({ kira: 'alan', dogalgaz: 'alan', enerji: 'kw', su: 'kisi', isg: 'kisi' } as Record<string, string>)[tur] ?? 'saat';
export interface GiderKalemi { id: string; ad: string; tur: string; aylik: number | null; anahtar: string; kapsam: string }
export interface TezgahGideri { bedel: number | null; omur: number | null; hurda: number | null; kw: number | null; yuk: number | null; alan: number | null; sarf: number | null; bakim: number | null }
export const TEZGAH_GIDER_ALANLARI = ['bedel', 'omur', 'hurda', 'kw', 'yuk', 'alan', 'sarf', 'bakim'] as const;
export interface MaliyetSistemi { kip: 'kalem' | 'tek'; verim: number; kwh: number | null; tez: Record<string, TezgahGideri>; kalemler: GiderKalemi[]; dolayli: { id: string; gorev: string; brut: number | null }[] }
// Belgede yoksa boş başlar: bugünkü sayfanın uydurma kalemleri ve tutarları yeni ekrana girmez (208 a).
export function maliyetSistemiVarsayilan(): MaliyetSistemi { return { kip: 'kalem', verim: 85, kwh: null, tez: {}, kalemler: [], dolayli: [] }; }
export function maliyetSistemi(D: PlanVerisi): MaliyetSistemi {
  const m = D.maliyetSis;
  if (!nesneMi(m)) return maliyetSistemiVarsayilan();
  const tez: Record<string, TezgahGideri> = {};
  if (nesneMi(m.tez)) for (const [k, v] of Object.entries(m.tez)) tez[k] = Object.fromEntries(TEZGAH_GIDER_ALANLARI.map((a) => [a, sayiOku(alan(v, a))])) as unknown as TezgahGideri;
  return {
    kip: m.kip === 'tek' ? 'tek' : 'kalem', verim: sayiOku(m.verim) ?? 85, kwh: sayiOku(m.kwh), tez,
    kalemler: diziOku(m.kalemler).map((k) => ({ id: metin(k.id), ad: metin(k.ad), tur: metin(k.tur), aylik: sayiOku(k.aylik), anahtar: metin(k.anahtar) || 'saat', kapsam: metin(k.kapsam) })),
    dolayli: diziOku(m.dolayli).map((g) => ({ id: metin(g.id), gorev: metin(g.gorev), brut: sayiOku(g.brut) })),
  };
}
export interface MesaiSistemi {
  kisiBazli: boolean; aylikSaat: number; sgk: number; yanHak: number; carp: Record<'hi' | 'cmt' | 'paz' | 'tatil', number>; kisiEk: number | null;
  gunlukSinir: number; geceSinir: number; yillikSinir: number; ucret: Record<string, { brut: number | null; yil: number | null }>;
}
// Kural değerleri bugünkü sayfanınkidir (4857 sayılı kanundan bilinen sınırlar; belgeden doğrulanmadı, sayfadaki notla). Kişi ücreti ve
// yemek-servis tutarı uydurulmaz: boş başlar.
export function mesaiSistemiVarsayilan(): MesaiSistemi {
  return { kisiBazli: true, aylikSaat: 225, sgk: 20.75, yanHak: 8, carp: { hi: 1.5, cmt: 1.5, paz: 2, tatil: 2 }, kisiEk: null, gunlukSinir: 11, geceSinir: 7.5, yillikSinir: 270, ucret: {} };
}
export function mesaiSistemi(D: PlanVerisi): MesaiSistemi {
  const m = D.mesaiSis;
  const v = mesaiSistemiVarsayilan();
  if (!nesneMi(m)) return v;
  const ucret: MesaiSistemi['ucret'] = {};
  if (nesneMi(m.ucret)) for (const [k, u] of Object.entries(m.ucret)) ucret[k] = { brut: sayiOku(alan(u, 'brut')), yil: sayiOku(alan(u, 'yil')) };
  const c = nesneMi(m.carp) ? m.carp : {};
  return {
    kisiBazli: m.kisiBazli !== false, aylikSaat: sayiOku(m.aylikSaat) ?? v.aylikSaat, sgk: sayiOku(m.sgk) ?? v.sgk, yanHak: sayiOku(m.yanHak) ?? v.yanHak,
    carp: { hi: sayiOku(c.hi) ?? v.carp.hi, cmt: sayiOku(c.cmt) ?? v.carp.cmt, paz: sayiOku(c.paz) ?? v.carp.paz, tatil: sayiOku(c.tatil) ?? v.carp.tatil },
    kisiEk: sayiOku(m.kisiEk), gunlukSinir: sayiOku(m.gunlukSinir) ?? v.gunlukSinir, geceSinir: sayiOku(m.geceSinir) ?? v.geceSinir,
    yillikSinir: sayiOku(m.yillikSinir) ?? v.yillikSinir, ucret,
  };
}
export const sgkKatsayisi = (m: MesaiSistemi): number => 1 + (m.sgk + m.yanHak) / 100;
export const dolayliAylik = (M: MaliyetSistemi, m: MesaiSistemi): number => top(M.dolayli.map((g) => (g.brut ?? 0) * sgkKatsayisi(m)));
export const kalemTutari = (k: GiderKalemi, M: MaliyetSistemi, m: MesaiSistemi): number => (k.tur === 'personel' && k.aylik === null ? dolayliAylik(M, m) : k.aylik ?? 0);
// Kişinin saat maliyeti (SGK ve yan hak dahil); ücreti yoksa null.
export function kisiSaati(id: string, m: MesaiSistemi): number | null {
  const u = m.ucret[id];
  return u && u.brut !== null ? (u.brut * sgkKatsayisi(m)) / (m.aylikSaat || 225) : null;
}
// Grubun ortalama kişi saat maliyeti; grupta ücretli kişi yoksa bütün kişilerin ortalaması.
export function grupSaati(D: PlanVerisi, grup: string, m: MesaiSistemi): number | null {
  const P = D.personel ?? [];
  const l = P.filter((p) => (p.gruplar ?? []).includes(grup)).map((p) => kisiSaati(p.id, m)).filter((x): x is number => x !== null);
  const t = l.length ? l : P.map((p) => kisiSaati(p.id, m)).filter((x): x is number => x !== null);
  return t.length ? top(t) / t.length : null;
}

export interface TezgahGiderSatiri {
  tezgah: Tezgah; x: TezgahGideri; acik: number; kap: number; amort: number; op: number;
  dog: { enerji: number; sarf: number; bakim: number; operator: number | null }; dogTop: number;
  pay: number; kalem: Record<string, number>; mesgul: number; aylik: number; oran: number | null; absorbe: number; atil: number;
}
export interface GenelGiderHesabi { tez: TezgahGiderSatiri[]; aylik: number; amort: number; kap: number; mesgul: number; absorbe: number; atil: number; kalemTop: number; ort: number | null }
const bosGider: TezgahGideri = { bedel: null, omur: null, hurda: null, kw: null, yuk: null, alan: null, sarf: null, bakim: null };
// Tezgâhın genel gider oranı = (dağılan pay + amortisman) / önümüzdeki 30 günün pratik kapasitesi (msHesap).
export function genelGiderHesabi(c: PlanlamaCalismasi, T: Takvim): GenelGiderHesabi {
  const D = c.D;
  const M = maliyetSistemi(D), ms = mesaiSistemi(D);
  const now = simdiSaati(c), son = now + 720;
  const ops = planIsleri(c);
  const tez = D.tezgahlar.map((t): TezgahGiderSatiri => {
    const W = T.M[t.id]?.rw ?? [];
    const acik = calisilir(W, now, son);
    const x = M.tez[t.id] ?? bosGider;
    const kap = (acik * (M.verim || 85)) / 100;
    const amort = x.bedel !== null && x.bedel > 0 && x.omur !== null && x.omur > 0 ? (x.bedel * (1 - (x.hurda ?? 0) / 100)) / (x.omur * 12) : 0;
    const op = t.opOran === undefined || t.opOran === null ? 1 : t.opOran;
    const opSaat = grupSaati(D, t.grup ?? '', ms);
    const dog = { enerji: (x.kw ?? 0) * (x.yuk ?? 0) * (M.kwh ?? 0), sarf: x.sarf ?? 0, bakim: x.bakim ?? 0, operator: opSaat === null ? null : opSaat * op };
    let mesgul = 0;
    for (const r of ops) if (r.m === t.id && Number.isFinite(r.C)) mesgul += Math.max(0, Math.min(son, r.C) - Math.max(now, r.S));
    return { tezgah: t, x, acik, kap, amort, op, dog, dogTop: dog.enerji + dog.sarf + dog.bakim + (dog.operator ?? 0), pay: 0, kalem: {}, mesgul, aylik: 0, oran: null, absorbe: 0, atil: 0 };
  });
  const taban = (k: GiderKalemi, z: TezgahGiderSatiri): number => (k.anahtar === 'alan' ? z.x.alan ?? 0 : k.anahtar === 'kw' ? z.x.kw ?? 0 : k.anahtar === 'kisi' ? z.op : k.anahtar === 'esit' ? 1 : z.kap);
  for (const k of M.kalemler) {
    const tutar = kalemTutari(k, M, ms);
    const l = tez.filter((z) => !k.kapsam || z.tezgah.grup === k.kapsam);
    const t = top(l.map((z) => taban(k, z)));
    if (!(t > 0) || !tutar) continue;
    for (const z of l) { const p = (tutar * taban(k, z)) / t; z.pay += p; z.kalem[k.id] = p; }
  }
  for (const z of tez) {
    z.aylik = z.pay + z.amort;
    z.oran = z.kap > 0 ? z.aylik / z.kap : null;
    z.absorbe = z.oran === null ? 0 : Math.min(z.mesgul, z.kap) * z.oran;
    z.atil = z.oran === null ? 0 : Math.max(0, z.kap - z.mesgul) * z.oran;
  }
  const t = (f: (z: TezgahGiderSatiri) => number): number => top(tez.map(f));
  const kap = t((z) => z.kap);
  const aylik = t((z) => z.aylik);
  return {
    tez, aylik, amort: t((z) => z.amort), kap, mesgul: t((z) => z.mesgul), absorbe: t((z) => z.absorbe), atil: t((z) => z.atil),
    kalemTop: top(M.kalemler.map((k) => kalemTutari(k, M, ms))), ort: kap > 0 ? aylik / kap : null,
  };
}
// Sipariş maliyetinde tezgâh saatine düşen genel gider: kalem kipinde tezgâhın kendi oranı, tek oranda plan ayarı (msGgOran).
export function genelGiderOrani(D: PlanVerisi, G: GenelGiderHesabi | null, m: string): number {
  const tek = ymAyar(D).genelGider ?? 0;
  if (maliyetSistemi(D).kip !== 'kalem') return tek;
  const z = G?.tez.find((x) => x.tezgah.id === m);
  if (z && z.oran !== null) return z.oran;
  // Atölye ortalaması yoksa ya da sıfırsa tek orana düşülür (msGgOran).
  const ort = G?.ort ?? null;
  return ort !== null && ort !== 0 ? ort : tek;
}

// ---------- ek mesai (zu-yan-sayfalar, zz6) ----------
export type GunTuru = 'hi' | 'cmt' | 'paz' | 'tatil';
export const GUN_TURU_ADI: Record<GunTuru, string> = { hi: 'hafta içi', cmt: 'cumartesi', paz: 'pazar', tatil: 'resmî tatil' };
export function gunTuru(D: PlanVerisi, g: number): GunTuru {
  if ((D.tatiller ?? []).includes(isoGun(D, g))) return 'tatil';
  const w = haftaGunu(D, g);
  return w === 'cmt' ? 'cmt' : w === 'paz' ? 'paz' : 'hi';
}
// Ek vardiyanın bedeli: kişi bazlıysa saat × operatör oranı × grubun kişi saat maliyeti × gün çarpanı + kişi başı yemek ve servis;
// değilse vardiya saati × mesai ücreti × (hafta sonu ve tatilde) çarpan. Ücret yoksa null.
export function mesaiBedeli(c: PlanlamaCalismasi, T: Takvim, e: EkMesai): number | null {
  const D = c.D;
  const m = mesaiSistemi(D);
  const h = vardiyaSaati(D, e.vardiya);
  const tek = (): number | null => {
    const u = mesaiUcreti(D);
    if (u === null) return null;
    const g = T.gunler[e.gun];
    const tatil = !g || !g.vard.length;
    return h * u * (tatil ? ymAyar(D).mesaiCarpan || 1 : 1);
  };
  if (!m.kisiBazli) return tek();
  const t = D.tezgahlar.find((x) => x.id === e.m);
  const op = t && t.opOran !== undefined && t.opOran !== null ? t.opOran : 1;
  const s = grupSaati(D, t?.grup ?? '', m);
  if (s === null) return tek();
  return h * op * s * (m.carp[gunTuru(D, e.gun)] || 1.5) + op * (m.kisiEk ?? 0);
}
// Ek mesai bedeli o tezgâhta mesai vardiyasında çalışan işlere çalıştıkları saat oranında dağılır; bedeli bilinmeyen vardiyadaki işin payı null.
export function mesaiPaylari(c: PlanlamaCalismasi, T: Takvim): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const D = c.D;
  const ops = planIsleri(c);
  for (const e of ekMesailer(c)) {
    const v = vardiyalar(D).find((x) => x.id === e.vardiya);
    if (!v) continue;
    const a = e.gun * 24 + hm(v.bas), b = a + vardiyaSaati(D, e.vardiya);
    const pay: Record<string, number> = {};
    let t = 0;
    for (const r of ops) { if (r.m !== e.m) continue; const h = Math.min(b, r.C) - Math.max(a, r.S); if (h > 0) { pay[r.job] = (pay[r.job] ?? 0) + h; t += h; } }
    const bedel = mesaiBedeli(c, T, e);
    if (!t) continue;
    for (const [j, h] of Object.entries(pay)) {
      if (bedel === null) { out[j] = null; continue; }
      const o = out[j];
      if (o !== null) out[j] = (o ?? 0) + (bedel * h) / t;
    }
  }
  return out;
}
export interface MesaiAtamasi { i: number; e: EkMesai; tezgah: Tezgah; h: number; tur: GunTuru; kisiler: { id: string; ad: string }[]; ihlal: string[] }
// Ek vardiyaya o grupta yetkin, o gün izinli olmayan, aynı vardiyada çalışmayan ve bu yıl en az fazla mesai yapmış kişi atanır (msAtama).
export function mesaiAtamasi(c: PlanlamaCalismasi): { liste: MesaiAtamasi[]; plan: Record<string, number> } {
  const D = c.D;
  const m = mesaiSistemi(D);
  const P = D.personel ?? [];
  const kisi = new Map(P.map((p) => [p.id, { yil: m.ucret[p.id]?.yil ?? 0, plan: 0, gun: {} as Record<number, number> }]));
  const devam = diziOku(D.devamsizlik);
  const liste: MesaiAtamasi[] = [];
  const sirali = ekMesailer(c).map((e, i) => ({ e, i })).sort((a, b) => a.e.gun - b.e.gun);
  for (const { e, i } of sirali) {
    const t = D.tezgahlar.find((x) => x.id === e.m);
    const v = vardiyalar(D).find((x) => x.id === e.vardiya);
    if (!t || !v) continue;
    const h = vardiyaSaati(D, e.vardiya);
    const tur = gunTuru(D, e.gun);
    const gk = haftaGunu(D, e.gun);
    const iso = isoGun(D, e.gun);
    const need = Math.max(1, Math.ceil(t.opOran === undefined || t.opOran === null ? 1 : t.opOran));
    const normal = (p: (typeof P)[number]): number | null => {
      const cal = D.calismaGunleri?.[gk] ?? [];
      const izin = devam.some((d) => metin(d.personel ?? d.kisi) === p.id && metin(d.gun) === iso);
      if (izin) return null;
      return tur !== 'tatil' && cal.map(metin).includes(p.vardiya ?? '') ? vardiyaSaati(D, p.vardiya ?? '') : 0;
    };
    const aday = P.filter((p) => (p.gruplar ?? []).includes(t.grup ?? '')).flatMap((p) => {
      const k = kisi.get(p.id);
      const n = normal(p);
      if (!k || n === null) return [];
      const ayni = n > 0 && p.vardiya === e.vardiya;
      if (ayni) return [];
      const gunTop = n + (k.gun[e.gun] ?? 0) + h;
      const neden: string[] = [];
      if (gunTop > m.gunlukSinir + 1e-6) neden.push(`günde ${sayi(gunTop, 1)} sa (sınır ${sayi(m.gunlukSinir, 1)})`);
      if (k.yil + k.plan + h > m.yillikSinir + 1e-6) neden.push(`yılda ${sayi(k.yil + k.plan + h, 0)} sa (sınır ${String(m.yillikSinir)})`);
      return [{ p, k, neden, gunTop, yuk: k.yil + k.plan }];
    }).sort((a, b) => a.neden.length - b.neden.length || a.gunTop - b.gunTop || a.yuk - b.yuk);
    const sec = aday.slice(0, need);
    for (const a of sec) { a.k.plan += h; a.k.gun[e.gun] = (a.k.gun[e.gun] ?? 0) + h; }
    const ihlal: string[] = [];
    if (sec.length < need) ihlal.push(`${String(need - sec.length)} kişi eksik: grupta uygun kişi yok`);
    for (const a of sec) for (const n of a.neden) ihlal.push(`${a.p.ad ?? a.p.id}: ${n}`);
    const b = hm(v.bas), son = hm(v.bit);
    const gece = b >= 20 || (son <= 6 && son < b);
    if (gece && h > m.geceSinir + 1e-6) ihlal.push(`gece vardiyası ${sayi(h, 1)} sa (gece sınırı ${sayi(m.geceSinir, 1)} sa)`);
    liste.push({ i, e, tezgah: t, h, tur, kisiler: sec.map((a) => ({ id: a.p.id, ad: a.p.ad ?? a.p.id })), ihlal });
  }
  return { liste, plan: Object.fromEntries([...kisi].map(([id, k]) => [id, k.plan])) };
}

// ---------- gecikme bedeli (motor/durum.betik agKatki, agBedel; zr-agirlik agGecTL) ----------
const isPayi = (s: Siparis): number => { const p = sayiOku(s.pay); return p !== null && p > 0 && p < 1 ? p : 1; };
function katkiPayi(c: PlanlamaCalismasi, s: Siparis): number | null {
  const D = c.D;
  if (s.gelir === null || s.gelir === undefined || !c.plan) return null;
  let t = 0;
  const ml = malzemeler(D);
  for (const r of s.malzeme ?? []) { const m = ml.find((x) => x.kod === r.kod); const b = m ? birimMaliyet(D, m) : null; if (b === null) return null; t += b * r.miktar * s.adet; }
  const ops = planIsleri(c).filter((r) => r.job === s.id);
  if (!ops.length) return null;
  for (const r of ops) {
    if (r.fas) { const f = fasoncular(D).find((x) => `@${x.id}` === r.m); if (!f || f.fiyat === null) return null; t += f.fiyat * s.adet; continue; }
    const m = D.tezgahlar.find((x) => x.id === r.m);
    if (!m || m.ucret === null || m.ucret === undefined) return null;
    t += r.run * m.ucret + r.su * (m.ucret + ayarciUcreti(D));
  }
  return s.gelir - t;
}
export interface GecikmeBedeli { b: number; ceza: number | null; tavanTL: number | null; sonra: number; eksik: string[] }
export function gecikmeBedeli(c: PlanlamaCalismasi, s: Siparis): GecikmeBedeli {
  const D = c.D;
  const A = agAyar(D);
  const pay = isPayi(s);
  const mu = diziOku(D.musteriler).find((m) => metin(m.id) === metin(s.musteri)) ?? null;
  const tutar = s.gelir ?? null;
  const oran = sayiOku(s.cezaOran) ?? sayiOku(mu?.cezaOran);
  const ceza = s.cezaGun !== null && s.cezaGun !== undefined ? (s.cezaGun / 24) * pay : tutar !== null && oran !== null ? (tutar * oran) / 100 / 24 : null;
  const fin = tutar !== null ? (tutar * A.fin) / 100 / 24 : 0;
  const B = A.bil;
  const kat = katkiPayi(c, s);
  const kr = kat === null ? null : (Math.max(0, kat) * A.kar) / 100 / 24;
  const sc = B.sinif && mu ? (A.sinif[metin(mu.sinif)] ?? 1) : 1;
  const el = B.elle ? (sayiOku(s.elle) ?? 1) : 1;
  const eksik: string[] = [];
  if (tutar === null) eksik.push('tutar');
  if (B.ceza && ceza === null) eksik.push('ceza oranı');
  if (!mu) eksik.push('müşteri');
  if (B.kar && kat === null) eksik.push('maliyet');
  const temel = B.ceza ? (ceza ?? A.taban * pay) : 0;
  let ham = temel + (B.fin ? fin : 0) + (B.kar ? kr ?? 0 : 0);
  if (ham <= 0) ham = A.taban * pay;
  const tavanO = sayiOku(s.cezaTavan) ?? sayiOku(mu?.cezaTavan) ?? A.tavan;
  const tavanTL = B.ceza && (s.cezaGun === null || s.cezaGun === undefined) && tutar !== null && ceza !== null ? (tutar * tavanO) / 100 : null;
  return { b: ham * sc * el, ceza: B.ceza ? ceza : null, tavanTL, sonra: ham * sc * el, eksik };
}
export function gecikmeTutari(x: GecikmeBedeli, T: number): number {
  if (!(T > 0.05)) return 0;
  if (x.ceza === null || x.tavanTL === null || x.ceza <= 0) return T * x.b;
  const h = x.tavanTL / x.ceza;
  return T <= h ? T * x.b : h * x.b + (T - h) * x.sonra;
}

// ---------- malzemenin hazır olması ----------
// Sunucu motorunun kopyası (sunucu/moduller/recete-rota/motor: girdi.betik stKur olayları, durum.betik ymUygula fire payı ve tmUygula
// tahmini geliş, engine.betik matAlloc); istemci motoru ithal edemez. Sıra matAlloc'unkidir: öncelik, sonra termin. Bedel kipinde öncelik
// metin anahtardır ('b:<id>'), fark sayı olmaz ve sıra yalnız terminle kurulur.
const dakikaya = (t: number): number => Math.floor(t * 60 + 1e-9) / 60;
export function malzemeHazir(c: PlanlamaCalismasi, now: number): Record<string, number> {
  const D = c.D;
  const A = tmAyar(D);
  const sinir = now + A.esik * 24;
  const ml = new Map((D.malzemeler ?? []).map((m) => [m.kod, m]));
  const mb = new Map(malzemeler(D).map((m) => [m.kod, m]));
  const ted = new Map(diziOku(D.tedarikciler).map((t) => [metin(t.id), t]));
  const urunMalzeme = (u: string) => (aktifSiparisler(D).find((x) => x.urun === u && (x.malzeme ?? []).length)?.malzeme ?? []).map((r) => ({ ...r }));
  const sip: { id: string; adet: number; due: number | null; oncelik: unknown; malzeme: { kod: string; miktar: number }[] }[] =
    aktifSiparisler(D).map((s) => ({ id: s.id, adet: s.adet, due: saatOku(D, s.termin), oncelik: s.oncelik, malzeme: (s.malzeme ?? []).map((r) => ({ ...r })) }));
  const saGecik: Record<string, number> = {};
  for (const ev of c.olaylar) {
    if (ev.tip === 'acil') {
      let n = 901;
      while (sip.some((j) => j.id === `SP-${String(n)}`)) n++;
      sip.push({ id: `SP-${String(n)}`, adet: sayiOku(ev.adet) ?? 0, due: saatOku(D, ev.termin), oncelik: sayiOku(ev.oncelik) || 1, malzeme: urunMalzeme(metin(ev.urun)) });
    } else if (ev.tip === 'malzeme') {
      const k = metin(ev.kod);
      saGecik[k] = (saGecik[k] ?? 0) + (sayiOku(ev.gun) ?? 0) * 24;
    }
  }
  for (const j of sip) for (const r of j.malzeme) { const m = mb.get(r.kod); const f = m ? firePayi(D, m) : 0; if (f > 0) r.miktar = r.miktar * (1 + f / 100); }
  const tmSure = (kod: string, q: number): number | null => {
    const m = ml.get(kod);
    if (!m || m.tedarikGun === undefined || m.tedarikGun === null) return null;
    return (m.tedarikGun * (sayiOku(m.terminKat) ?? A.katMal) + ((sayiOku(m.terminEk) ?? A.ekMal) * q) / 100) * 24;
  };
  const ilk: Record<string, number> = {};
  for (const r of planIsleri(c)) if (!r.done && Number.isFinite(r.S) && (ilk[r.job] === undefined || r.S < (ilk[r.job] ?? Infinity))) ilk[r.job] = r.S;
  const ihtiyacGunu: Record<string, number> = {};
  for (const s of aktifSiparisler(D)) { const t = ilk[s.id]; if (t === undefined) continue; for (const r of s.malzeme ?? []) ihtiyacGunu[r.kod] = Math.min(ihtiyacGunu[r.kod] ?? Infinity, t); }
  const sa = diziOku(D.satinalma).map((p) => {
    const kod = metin(p.kod), miktar = sayiOku(p.miktar) ?? 0;
    let soz = saatOku(D, p.gelis);
    if (soz === null) {
      const sure = tmSure(kod, miktar);
      if (sure !== null) { const h = ihtiyacGunu[kod]; soz = dakikaya(h !== undefined && h <= sinir ? now + sure : Math.max(now, (saatOku(D, p.verildi) ?? now) + sure)); }
    }
    return { kod, miktar, soz, tedarikci: metin(p.tedarikci) };
  });
  const ihtiyac: Record<string, number> = {};
  for (const j of sip) for (const r of j.malzeme) ihtiyac[r.kod] = (ihtiyac[r.kod] ?? 0) + r.miktar * j.adet;
  for (const [kod, q] of Object.entries(ihtiyac)) {
    const m = ml.get(kod);
    const eks = q - ((m?.stok ?? 0) + top(sa.filter((p) => p.kod === kod).map((p) => p.miktar)));
    if (eks <= 1e-6) continue;
    const sure = tmSure(kod, eks);
    if (sure === null) continue;
    sa.push({ kod, miktar: eks, soz: dakikaya(now + sure), tedarikci: metin(m?.tedarikci) });
  }
  const sup = new Map<string, { t: number; kalan: number }[]>();
  for (const m of D.malzemeler ?? []) sup.set(m.kod, [{ t: -1e9, kalan: m.stok ?? 0 }]);
  for (const p of sa) {
    const gec = (sayiOku(alan(ted.get(p.tedarikci), 'ortGecikmeGun')) ?? 0) * 24 + (saGecik[p.kod] ?? 0);
    const mu = (ml.get(p.kod)?.muayeneGun ?? 0) * 24;
    const l = sup.get(p.kod) ?? [];
    l.push({ t: p.soz === null ? 1e9 : Math.max(p.soz + gec, p.soz) + mu, kalan: p.miktar });
    sup.set(p.kod, l);
  }
  for (const l of sup.values()) l.sort((a, b) => a.t - b.t);
  const bedel = agAyar(D).kip === 'bedel';
  const onc = (j: (typeof sip)[number]): number => (bedel ? NaN : Number(j.oncelik));
  const sira = [...sip].sort((a, b) => (onc(a) - onc(b)) || ((a.due ?? 1e9) - (b.due ?? 1e9)));
  const res: Record<string, number> = {};
  for (const j of sira) {
    let ready = now;
    for (const r of j.malzeme) {
      let rem = r.miktar * j.adet, t = -1e9;
      for (const x of sup.get(r.kod) ?? []) { if (rem <= 1e-9) break; if (x.kalan <= 1e-9) continue; const q = Math.min(x.kalan, rem); x.kalan -= q; rem -= q; t = Math.max(t, x.t); }
      ready = rem > 1e-9 ? Infinity : Math.max(ready, t, now);
    }
    res[j.id] = ready;
  }
  return res;
}

// ---------- bekleme maliyeti (zu-yan-sayfalar wipHesap) ----------
export interface Bekleme { tl: number; fin: number; tah: number; saat: number; ilk: number; ara: number; son: number }
export interface BeklemeHesabi { tl: number; tah: number; saat: number; J: Record<string, Bekleme> }
export function beklemeHesabi(c: PlanlamaCalismasi, T: Takvim, I: Map<string, IsTanimi>): BeklemeHesabi {
  const D = c.D;
  const P = wipAyar(D);
  const fin = agAyar(D).fin;
  const now = simdiSaati(c);
  const out: BeklemeHesabi = { tl: 0, tah: 0, saat: 0, J: {} };
  const ops = planIsleri(c);
  const plan = new Map(ops.map((r) => [r.id, r]));
  const hazir = malzemeHazir(c, now);
  for (const s of aktifSiparisler(D)) {
    const l0 = ops.filter((r) => r.job === s.id);
    if (!l0.length) continue;
    const mal = malzemeTutari(D, s) ?? 0;
    const l = l0.map((r) => {
      let cc = 0;
      if (r.fas) cc = fasonTutari(D, r, I.get(r.id)) ?? 0;
      else { const M = T.M[r.m]; if (M && M.ucret !== null) cc = r.run * (1 - M.pay) * M.ucret + r.su * (M.ucret + ayarciUcreti(D)); }
      return { r, c: cc };
    }).sort((a, b) => a.r.C - b.r.C);
    const deger = (t: number): number => { let v = mal; for (const x of l) { if (x.r.C <= t + 1e-9) v += x.c; else break; } return v; };
    const z: Bekleme = { tl: 0, fin: 0, tah: 0, saat: 0, ilk: 0, ara: 0, son: 0 };
    const say = (W: number, V: number, yer: 'ilk' | 'ara' | 'son'): void => {
      if (!(W > 0.25)) return;
      const f = ((V * fin) / 100) * (W / 24);
      z.fin += f; z.saat += W; z[yer] += f;
    };
    const mr = hazir[s.id];
    const h = Math.max(now, mr !== undefined && Number.isFinite(mr) ? mr : now);
    for (const x of l) {
      const o = I.get(x.r.id);
      if (!o || x.r.done) continue;
      if (!o.onculler.length) { if (mal > 0) say(x.r.S - h, mal, 'ilk'); continue; }
      let cp = -Infinity;
      for (const p of o.onculler) { const q = plan.get(p); if (q) cp = Math.max(cp, q.C); }
      if (!Number.isFinite(cp)) continue;
      say(x.r.S - Math.max(cp, now), deger(cp), 'ara');
    }
    const due = saatOku(D, s.termin);
    const rotaBoyu = D.urunler.find((u) => u.id === s.urun)?.rota?.length ?? 0;
    const son = l[l.length - 1];
    if (due !== null && son && l.length === rotaBoyu) {
      const C = son.r.C;
      // Erken sevki kabul eden siparişte vade üretim bitince başlar (zz3-erken-sevk, sunucu durum.betik wipP.erken).
      const vb = s.erkenSevk === true ? 'bitis' : P.vadeBas;
      if (vb === 'termin') say(due - Math.max(C, now), deger(C), 'son');
      else if (s.gelir !== null && s.gelir !== undefined && due > C + 0.25) z.tah = ((-s.gelir * fin) / 100) * ((due - Math.max(C, now)) / 24);
    }
    z.tl = z.fin + z.tah;
    out.J[s.id] = z;
    out.tl += z.tl; out.tah += z.tah; out.saat += z.saat;
  }
  return out;
}

// ---------- sipariş maliyeti (ymSipMaliyet, zz6 genel gider) ----------
export interface SiparisMaliyeti {
  mal: number | null; talas: number; talasKg: number | null; isl: number; ayar: number; gg: number; mes: number | null; fas: number;
  fin: number | null; bek: Bekleme | null; top: number; eksik: string[]; tutar: number | null; gec: number; T: number | null; erken: number;
  kar: number | null; net: number | null;
}
export interface MaliyetBaglami { c: PlanlamaCalismasi; T: Takvim; I: Map<string, IsTanimi>; G: GenelGiderHesabi; W: BeklemeHesabi; MP: Record<string, number | null>; ops: PlanIsi[] }
// Planın maliyet hesabı için bir kez kurulan bağlam; plan yoksa null.
export function maliyetBaglami(c: PlanlamaCalismasi | null): MaliyetBaglami | null {
  if (!c || !c.plan || baslangicMs(c.D) === null) return null;
  const T = takvimKur(c);
  const I = isTanimlari(c, T);
  return { c, T, I, G: genelGiderHesabi(c, T), W: beklemeHesabi(c, T, I), MP: mesaiPaylari(c, T), ops: planIsleri(c) };
}
export function siparisMaliyeti(b: MaliyetBaglami, s: Siparis): SiparisMaliyeti | null {
  const { c, T, I, G } = b;
  const D = c.D;
  const ops = b.ops.filter((r) => r.job === s.id);
  if (!ops.length) return null;
  let isl = 0, ayar = 0, fas = 0, gg = 0;
  const eksik: string[] = [];
  // Kalem kipinde genel gider saat ücreti olmayan tezgâhın adımına da yazılır (zz6 ymSipMaliyet üstüne yazımı); tek oranda yalnız ücretli adıma.
  const kalem = maliyetSistemi(D).kip === 'kalem';
  for (const r of ops) {
    if (r.fas) { const t = fasonTutari(D, r, I.get(r.id)); if (t === null) eksik.push('fason fiyatı'); else fas += t; continue; }
    if (kalem) gg += (r.run + r.su) * genelGiderOrani(D, G, r.m);
    const M = T.M[r.m];
    if (!M || M.ucret === null) { eksik.push(`${r.m} saat maliyeti`); continue; }
    isl += r.run * (1 - M.pay) * M.ucret;
    ayar += r.su * (M.ucret + ayarciUcreti(D));
    if (!kalem) gg += (r.run + r.su) * genelGiderOrani(D, G, r.m);
  }
  const mal = malzemeTutari(D, s);
  if (mal === null && (s.malzeme ?? []).length) eksik.push('malzeme kg fiyatı');
  const J = planSonucu(c, s.id);
  const due = saatOku(D, s.termin);
  const tutar = s.gelir ?? null;
  const vade = sayiOku(s.vade);
  const fin = tutar !== null && vade !== null ? ((tutar * agAyar(D).fin) / 100) * vade : null;
  const erken = J?.C !== null && J?.C !== undefined && due !== null ? Math.max(0, due - J.C) : 0;
  const tal = talasKredisi(D, s);
  const talas = tal && tal.tl > 0 ? tal.tl : 0;
  const bek = b.W.J[s.id] ?? null;
  const mes = s.id in b.MP ? b.MP[s.id] ?? null : 0;
  if (mes === null) eksik.push('mesai ücreti');
  const topl = (mal ?? 0) - talas + isl + ayar + gg + fas + (mes ?? 0);
  const Tg = J?.T ?? null;
  const gec = Tg !== null && Tg > 0.05 ? gecikmeTutari(gecikmeBedeli(c, s), Tg) : 0;
  const ek = [...new Set(eksik)];
  const bilinmez = tutar === null || ek.length > 0;
  return {
    mal, talas, talasKg: tal ? tal.kg : null, isl, ayar, gg, mes, fas, fin, bek, top: topl, eksik: ek, tutar, gec, T: Tg, erken,
    kar: bilinmez ? null : tutar - topl, net: bilinmez ? null : tutar - topl - gec - (fin ?? 0) - (bek ? bek.tl : 0),
  };
}
export interface PlanMaliyeti { mal: number; talas: number; isl: number; ayar: number; gg: number; fas: number; mes: number; fin: number; tah: number; gec: number; eksik: number; mesTop: number | null }
// Bu planın bütün maliyeti tek yerde (tmPlanMaliyet).
export function planMaliyeti(b: MaliyetBaglami): PlanMaliyeti {
  const t: PlanMaliyeti = { mal: 0, talas: 0, isl: 0, ayar: 0, gg: 0, fas: 0, mes: 0, fin: 0, tah: 0, gec: 0, eksik: 0, mesTop: null };
  for (const s of aktifSiparisler(b.c.D)) {
    const x = siparisMaliyeti(b, s);
    if (!x) continue;
    if (x.eksik.length) t.eksik++;
    t.mal += x.mal ?? 0; t.talas += x.talas; t.isl += x.isl; t.ayar += x.ayar; t.gg += x.gg; t.fas += x.fas; t.mes += x.mes ?? 0; t.gec += x.gec;
    if (x.bek) { t.fin += x.bek.fin; t.tah += x.bek.tah; }
  }
  const ml = ekMesailer(b.c).map((e) => mesaiBedeli(b.c, b.T, e));
  t.mesTop = ml.some((x) => x === null) ? null : top(ml.map((x) => x ?? 0));
  return t;
}
// ---------- fason dönüş terminleri (zv-termin tmFason) ----------
export interface FasonIsi { id: string; r: PlanIsi; tanim: IsTanimi | undefined; f: FasoncuBilgisi | null; ger: number | null; enGec: number | null; T: number | null; tahmini: number; yakin: boolean; ref: number | null }
export function fasonSuresi(f: FasoncuBilgisi | null, adet: number, A: TerminAyari): number {
  return ((f?.sureGun || 1) * (f?.terminKat ?? A.katFas) + ((f?.terminEk ?? A.ekFas) * adet) / 100) * 24;
}
export function fasonIsleri(c: PlanlamaCalismasi, I: Map<string, IsTanimi>): FasonIsi[] {
  const D = c.D;
  const now = simdiSaati(c);
  const A = tmAyar(D);
  const k = nesneMi(D.fasonTermin) ? D.fasonTermin : {};
  const ref = nesneMi(D.fasonRef) ? D.fasonRef : {};
  const ops = planIsleri(c);
  // Fason gecikme olayı fasoncunun süresini uzatır (applyEvent fason); dönüş tahmini motorun gördüğü süreyle yapılır (cx.FS).
  const FS = fasoncular(D).map((f) => ({ ...f }));
  for (const ev of c.olaylar) {
    const f = ev.tip === 'fason' ? FS.find((x) => x.id === metin(ev.f)) : undefined;
    if (f) f.sureGun = (f.sureGun || 1) + (sayiOku(ev.gun) ?? 0);
  }
  const out: FasonIsi[] = [];
  for (const r of ops) {
    if (!r.fas || r.done) continue;
    const o = I.get(r.id);
    const j = D.siparisler.find((s) => s.id === r.job);
    if (!j) continue;
    let ger: number | null = null;
    for (const x of ops) if (x.job === r.job && I.get(x.id)?.onculler.includes(r.id)) ger = ger === null ? x.S : Math.min(ger, x.S);
    const due = saatOku(D, j.termin);
    if (ger === null) ger = due;
    const C = planSonucu(c, r.job)?.C ?? null;
    const bol = due !== null && C !== null ? Math.max(0, due - C) : 0;
    const f = FS.find((x) => `@${x.id}` === r.m) ?? null;
    out.push({
      id: r.id, r, tanim: o, f, ger, enGec: ger === null ? null : ger + bol, T: saatOku(D, k[r.id]), tahmini: r.S + fasonSuresi(f, o?.adet ?? j.adet, A),
      yakin: r.S <= now + A.esik * 24, ref: saatOku(D, ref[r.id]),
    });
  }
  return out.sort((a, b) => a.r.S - b.r.S);
}
export type Ton = 'tamam' | 'uyari' | 'hata';
export function fasonDurumu(x: FasonIsi): [string, Ton] {
  const don = x.T ?? x.r.C;
  if (x.T === null) return x.yakin ? ['Termin yok, bir hafta içinde çıkıyor', 'hata'] : ['Termin bekleniyor', 'uyari'];
  if (x.enGec !== null && don > x.enGec + 1e-6) return ['Siparişi geciktirir', 'hata'];
  if (x.ger !== null && don > x.ger + 1e-6) return ['Plandan geç', 'uyari'];
  if (x.ref !== null && x.T > x.ref + 1e-6) return ['Referanstan geç, plan güncellenmeli', 'uyari'];
  return ['Karşılıyor', 'tamam'];
}

// ---------- girdi denetimi ----------
// Sayı alanı: boş null'dır; sayı değilse ya da sınır dışındaysa hata (sayfanın "Geçerli bir sayı girin." iletisi).
export function sayiGirdisi(ham: string, sinir: { min?: number; max?: number } = {}): { tamam: true; deger: number | null } | { tamam: false; ileti: string } {
  const s = ham.trim().replace(',', '.');
  if (s === '') return { tamam: true, deger: null };
  const v = Number(s);
  if (!Number.isFinite(v) || v < (sinir.min ?? 0) || (sinir.max !== undefined && v > sinir.max)) return { tamam: false, ileti: 'Geçerli bir sayı girin.' };
  return { tamam: true, deger: v };
}
// Listedeki en büyük numaranın bir sonrası (K3 varsa K4).
export const sonrakiKimlik = (l: readonly { id: string }[], on: string): string => `${on}${String(Math.max(0, ...l.map((x) => Number(x.id.replace(/\D/g, '')) || 0)) + 1)}`;
