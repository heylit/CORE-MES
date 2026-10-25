import type { ExtraAlanlar, Fasoncu, Malzeme, PlanVerisi, PlanlamaCalismasi, RotaAdimi, Siparis } from '../tipler.ts';

// P2'nin saf hesapları (205 a): Siparişler, Terminler ve Termin ve kâr görünümlerinin kayıtlı plandan ve çalışmanın verisinden çıkan değerleri.
// Kaynak bugünkü çerçevedir: zv-termin, zw-denge, zz25-sade-takvim, zz29-gorsel, zz30-isi, zr-agirlik ve motor/durum.betik, engine.betik
// (zaman). Plan motorunu yeniden koşturan hesaplar (satın alma listesi, sipariş maliyeti, plan seçenekleri) burada yoktur (357 b).

// ---- kayıtlı plan (c-masa.betik planKaydi) ----
export interface PlanIsi { id: string; job: string; m: string; S: number; C: number; su?: number; run?: number; fas?: number; done?: number }
export interface PlanSiparisSonucu { C: number | null; T: number | null }
export interface PlanUyarisi { t?: string; j?: string; gelis?: number; kod?: string; txt?: string }
export interface KayitliPlan { ops: Record<string, PlanIsi>; J: Record<string, PlanSiparisSonucu>; warn: PlanUyarisi[] }

const nesne = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const sonlu = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Çalışmanın planı; işi ya da sipariş sonucu okunamayan plan yok sayılır (çözülmüş plan bu iki alanı hep taşır).
export function kayitliPlan(c: PlanlamaCalismasi | null): KayitliPlan | null {
  const p = c?.plan;
  if (!p || !nesne(p.ops) || !nesne(p.J)) return null;
  const ops: Record<string, PlanIsi> = {};
  for (const [id, r] of Object.entries(p.ops)) {
    if (nesne(r) && typeof r.job === 'string' && typeof r.m === 'string' && sonlu(r.S) && sonlu(r.C)) ops[id] = { ...(r as unknown as PlanIsi), id };
  }
  const J: Record<string, PlanSiparisSonucu> = {};
  for (const [id, x] of Object.entries(p.J)) if (nesne(x)) J[id] = { C: sonlu(x.C) ? x.C : null, T: sonlu(x.T) ? x.T : null };
  const warn = Array.isArray(p.warn) ? (p.warn.filter(nesne) as PlanUyarisi[]) : [];
  return { ops, J, warn };
}

// ---- zaman (engine.betik): saat ekseni planın başlangıç günü 00:00'dan saattir ----
const GUN_AD = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const iki = (n: number) => String(n).padStart(2, '0');

export function baslangicMs(D: PlanVerisi): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof D.meta?.baslangic === 'string' ? D.meta.baslangic : '');
  return m ? Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!) : null;
}

export function saatOku(D: PlanVerisi, s: unknown): number | null {
  if (s == null || s === '') return null;
  if (sonlu(s)) return s;
  const b = baslangicMs(D);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(String(s).trim());
  if (!m || b === null) return null;
  return (Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, m[4] ? +m[4] : 0, m[5] ? +m[5] : 0) - b) / 3600000;
}

// 'GG.AA Gün SS:DD'
export function saatYaz(D: PlanVerisi, t: number | null | undefined): string {
  const b = baslangicMs(D);
  if (t == null || !Number.isFinite(t) || b === null) return '—';
  const d = new Date(b + t * 3600000);
  return `${iki(d.getUTCDate())}.${iki(d.getUTCMonth() + 1)} ${GUN_AD[(d.getUTCDay() + 6) % 7]!} ${iki(d.getUTCHours())}:${iki(d.getUTCMinutes())}`;
}

// 'GG.AA Gün' (zz25-sade-takvim stkGun)
export const gunYaz = (D: PlanVerisi, t: number | null | undefined): string => (t == null || !Number.isFinite(t) ? '—' : saatYaz(D, t).slice(0, 9));

// Duvar saati 'GGGG-AA-GG SS:DD' (durum.betik tmTarihYaz)
export function duvarSaati(D: PlanVerisi, t: number): string | null {
  const b = baslangicMs(D);
  return b === null ? null : new Date(b + t * 3600000).toISOString().slice(0, 16).replace('T', ' ');
}

// Tarih girdisinin değeri 'GGGG-AA-GG' (zt-malzeme-plan mpTarihGir)
export function tarihGirdisi(D: PlanVerisi, t: number | null | undefined): string {
  const b = baslangicMs(D);
  return t == null || !Number.isFinite(t) || b === null ? '' : new Date(b + t * 3600000).toISOString().slice(0, 10);
}

// Sayfanın şimdisi (girdi.betik stKur now: 7, simdiUygula): çalışmanın kaydettiği şimdi daha ilerideyse o.
export function simdi(c: PlanlamaCalismasi): number {
  const s = c.simdi;
  return sonlu(s) && s > 7 ? s : 7;
}

// ---- sayı (00-baslangic.betik sayi, saat; zr-agirlik agTL) ----
const BICIM = new Map<number, Intl.NumberFormat>();
export function sayi(x: number | null | undefined, k = 1): string {
  if (x == null || !Number.isFinite(x)) return '—';
  let b = BICIM.get(k);
  if (!b) { b = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: k, minimumFractionDigits: 0 }); BICIM.set(k, b); }
  return b.format(x);
}
export const saat = (x: number | null | undefined): string => (x == null || !Number.isFinite(x) ? '—' : `${sayi(x, 1)} sa`);
export const tl = (x: number | null | undefined): string => (x == null || !Number.isFinite(x) ? '—' : `${sayi(Math.round(x), 0)} TL`);

// ---- ısı haritası hücresi (zz30-isi) ----
export type Kademe = 0 | 1 | 2 | 3 | 4;
export interface IsiHucresi { kd?: Kademe | null; sm?: 'clock' | 'check' | 'alert' | 'box' | 'truck'; v?: string; iyi?: boolean; is?: boolean; bayrak?: boolean; tahmin?: string; etiket?: string; kapali?: boolean }
export interface IsiSutunu { k: string; ad: string; alt?: string; uzun?: string; bugun?: boolean }
export type IsiTonu = 'hata' | 'uyari' | 'tamam' | '';
export interface IsiSatiri { k: string; ad: string; alt: string; simge: 'flag' | 'box' | 'truck'; ton: IsiTonu; gizli: boolean; h: Record<string, IsiHucresi> }
export interface UstDurum { ton: 'hata' | 'uyari' | 'tamam'; simge: 'alert' | 'clock' | 'check' | 'gauge'; metin: string }

// Bekleme ya da gecikme saatinden kademe: sekiz saatlik bir vardiya, bir gün, üç gün.
export const kademe = (h: number | null): Kademe | null => (h == null ? null : h <= 0.05 ? 0 : h < 8 ? 1 : h < 24 ? 2 : h < 72 ? 3 : 4);
export const kisaSure = (h: number | null): string => (h == null ? '' : h < 48 ? `${Math.round(h)}s` : `${Math.round(h / 24)}g`);
const gunNo = (t: number) => Math.floor(t / 24);

// Hücre birleştirme: sonraki işaret öncekinin kademesini düşürmez, etiketler eklenir.
export function hucreKoy(h: Record<string, IsiHucresi>, k: string, o: IsiHucresi): void {
  const c = (h[k] ??= {});
  for (const [a, v] of Object.entries(o) as [keyof IsiHucresi, unknown][]) {
    if (v === undefined) continue;
    if (a === 'kd' && c.kd != null && v != null && c.kd > (v as number)) continue;
    if (a === 'etiket' && c.etiket) { c.etiket += `, ${String(v)}`; continue; }
    (c as Record<string, unknown>)[a] = v;
  }
}

export function gunSutunlari(D: PlanVerisi, now: number, n: number) {
  const g0 = gunNo(now);
  const l: IsiSutunu[] = [];
  for (let g = g0; g < g0 + n; g++) { const s = saatYaz(D, g * 24); l.push({ k: `g${g}`, ad: s.slice(0, 5), alt: s.slice(6, 9), bugun: g === g0 }); }
  return { g0, n, l, kis: (g: number) => Math.min(Math.max(g, g0), g0 + n - 1), ic: (g: number) => g >= g0 && g < g0 + n };
}

export function haftaSutunlari(D: PlanVerisi, now: number, n: number) {
  const g0 = gunNo(now);
  const l: IsiSutunu[] = [];
  for (let b = 0; b < n; b++) {
    const s = saatYaz(D, (g0 + 7 * b) * 24);
    l.push({ k: `w${b}`, ad: s.slice(0, 5), alt: b === 0 ? 'bu hafta' : 'hafta', uzun: `${s.slice(0, 5)} haftası`, bugun: b === 0 });
  }
  l.push({ k: `w${n}`, ad: 'Sonra', alt: '', uzun: `${n} haftadan sonra` });
  return { l, b: (t: number) => Math.min(Math.max(Math.floor((t / 24 - g0) / 7), 0), n) };
}

// ---- siparişler ----
export const plandaki = (D: PlanVerisi): Siparis[] => D.siparisler.filter((s) => !s.havuz);
export const urunAdi = (D: PlanVerisi, id: string): string => D.urunler.find((u) => u.id === id)?.ad ?? (id || '—');

// Planın geç bitirdiği siparişler, en çok geciken başta (zz24-sade sdGecikenler).
export function gecikenler(D: PlanVerisi, p: KayitliPlan | null) {
  if (!p) return [];
  return plandaki(D).filter((s) => p.J[s.id] && (p.J[s.id]!.T == null || p.J[s.id]!.T! > 0.01))
    .map((s) => ({ s, T: p.J[s.id]!.T, C: p.J[s.id]!.C }))
    .sort((a, b) => (b.T ?? 1e9) - (a.T ?? 1e9));
}

export interface SiparisSatiri extends IsiSatiri { s: Siparis; T: number | null; C: number | null; due: number | null }
export interface SiparisIsisi { sutunlar: IsiSutunu[]; satirlar: SiparisSatiri[]; ust: UstDurum }

// Sipariş × hafta, termin riski (zz30-isi ISI.ysiparis.veri).
export function siparisIsisi(c: PlanlamaCalismasi, p: KayitliPlan): SiparisIsisi {
  const D = c.D; const now = simdi(c); const H = haftaSutunlari(D, now, 8);
  const bas: Record<string, number> = {};
  for (const r of Object.values(p.ops)) if (bas[r.job] == null || r.S < bas[r.job]!) bas[r.job] = r.S;
  const satirlar: SiparisSatiri[] = [];
  for (const s of plandaki(D)) {
    const J = p.J[s.id]; const due = saatOku(D, s.termin); const h: Record<string, IsiHucresi> = {};
    const T = J ? J.T : null; const C = J ? J.C : null; const gec = T != null && T > 0.05;
    if (C != null && bas[s.id] != null) for (let b = H.b(bas[s.id]!); b <= H.b(gec && due != null ? due : C); b++) hucreKoy(h, `w${b}`, { is: true, etiket: 'üretimde' });
    if (gec && due != null) for (let b = H.b(due); b <= H.b(C ?? due); b++) hucreKoy(h, `w${b}`, { kd: kademe(T), etiket: 'termin geçti' });
    if (C != null) hucreKoy(h, `w${H.b(C)}`, { sm: gec ? 'clock' : 'check', iyi: gec ? undefined : true, kd: gec ? kademe(T) : undefined, v: gec ? `+${kisaSure(T)}` : '', etiket: `plan ${gunYaz(D, C)} bitiriyor${gec ? `, ${saat(T)} geç` : ', zamanında'}` });
    else if (due != null) hucreKoy(h, `w${H.b(due)}`, { kd: 4, sm: 'alert', v: '!', etiket: 'plana sığmadı' });
    if (due != null) hucreKoy(h, `w${H.b(due)}`, { bayrak: true, etiket: `termin ${gunYaz(D, due)}` });
    const ton: IsiTonu = C == null || gec ? ((kademe(T) ?? 0) >= 3 || C == null ? 'hata' : 'uyari') : 'tamam';
    satirlar.push({ k: s.id, ad: s.id, alt: `${urunAdi(D, s.urun)} · ${sayi(s.adet, 0)} adet`, simge: 'flag', ton, gizli: !gec && C != null, h, s, T, C, due });
  }
  satirlar.sort((a, b) => Number(b.C == null) - Number(a.C == null) || (b.T ?? 0) - (a.T ?? 0) || (a.due ?? 1e12) - (b.due ?? 1e12));
  const gecL = satirlar.filter((r) => r.T != null && r.T > 0.05); const top = gecL.reduce((a, r) => a + r.T!, 0); const en = gecL[0];
  const yok = satirlar.filter((r) => r.C == null && r.due != null);
  const metin = en ? `En koyu satır ${en.ad}: termin ${gunYaz(D, en.due)}, plan ${gunYaz(D, en.C)} bitiriyor, ${saat(en.T)} geç. ${gecL.length} sipariş geç, toplam kayma ${saat(top)}${yok.length ? `; ${yok.length} sipariş plana sığmadı` : ''}.`
    : yok.length ? `${yok.length} sipariş plana sığmadı; diğerleri termininde bitiyor.` : `Bütün ${satirlar.length} sipariş termininde bitiyor.`;
  const ton = en || yok.length ? (en && (kademe(en.T) ?? 0) >= 3 ? 'hata' : 'uyari') : 'tamam';
  return { sutunlar: H.l, satirlar, ust: { ton, simge: en ? 'alert' : 'check', metin } };
}

// Satırın açılımındaki neden ve bilgi (ISI.ysiparis.acilim). Termin Üretim emirlerinden gelir (222 a): değiştirme yolu orasıdır.
export function siparisAcilimi(D: PlanVerisi, r: SiparisSatiri) {
  const s = r.s;
  const neden = r.C == null ? `${s.id} plana sığmadı; termin ${gunYaz(D, r.due)}. Termini Üretim emirlerinde değiştirmek ya da önemini artırmak planın onu yerleştirmesine yardım eder.`
    : r.T != null && r.T > 0.05 ? `${s.id} termini ${gunYaz(D, r.due)}, plan ${gunYaz(D, r.C)} bitiriyor: ${saat(r.T)} geç. Müşteri yeni tarih verdiyse termini Üretim emirlerinde değiştirin; vermediyse önemini artırın.`
      : `${s.id} termini ${gunYaz(D, r.due)}, plan ${gunYaz(D, r.C)} bitiriyor; zamanında.`;
  const bilgi: [string, string][] = [['Termin', gunYaz(D, r.due)], ['Planlanan bitiş', r.C == null ? 'plana sığmadı' : gunYaz(D, r.C)], ['Gecikme', r.T != null && r.T > 0.05 ? saat(r.T) : 'yok'], ['Adet', sayi(s.adet, 0)]];
  return { baslik: `${s.id} · ${urunAdi(D, s.urun)}`, neden, bilgi };
}

// ---- gecikme bedeli ve elle çarpan (durum.betik AG0, agAyar, agElle; zr-agirlik agElleSinir) ----
export interface AgirlikAyari { kip: string; fin: number }
export function agirlikAyari(D: PlanVerisi): AgirlikAyari {
  const a = nesne(D.planAgirlik) ? D.planAgirlik : {};
  return { kip: typeof a.kip === 'string' ? a.kip : 'bedel', fin: sonlu(a.fin) ? a.fin : 0.13 };
}
export const elleCarpan = (s: Siparis): number => (s.elle != null && Number.isFinite(+(s.elle as number)) ? +(s.elle as number) : 1);
// Elle çarpanın üst sınırı: eski rol modelinde planlamacı 2, müdür ve yönetici 3. 223 a eşlemesiyle maliyet okuyan (müdür, yönetici) 3,
// plan yazan 2 [VARSAYIM; SORU.md fark 6].
export const elleSinir = (y: { maliyetOku: boolean; planYaz: boolean }): number => (y.maliyetOku ? 3 : y.planYaz ? 2 : 0);
export const CARPANLAR: readonly [number, string][] = [[0.5, '×0,5 · daha az önemli'], [1, '×1 · normal'], [1.5, '×1,5 · önemli'], [2, '×2 · çok önemli'], [3, '×3 · en önemli (müdür)']];

// Plan TL ayarı (durum.betik YM0, ymAyar): yalnız amaç.
export const planAmaci = (D: PlanVerisi): string => (nesne(D.planTL) && typeof D.planTL.amac === 'string' ? D.planTL.amac : 'tl');

// Fiyat formunun denetimi (zz24-sade fiyat): tutar zorunlu ve eksi olmaz, vade boş ya da 0-365 tam gün.
export function fiyatDenetle(gelir: string, vade: string): { gelir: number; vade: number | null } | string {
  const g = gelir.trim() === '' ? NaN : Number(gelir);
  if (!Number.isFinite(g) || g < 0) return 'Tutar sıfır ya da daha büyük bir sayı olmalı.';
  if (vade.trim() === '') return { gelir: g, vade: null };
  const v = Number(vade);
  if (!Number.isInteger(v) || v < 0 || v > 365) return 'Ödeme vadesi 0 ile 365 arasında tam gün olmalı.';
  return { gelir: g, vade: v };
}

// ---- malzeme ve fason terminleri (durum.betik TM0, tmAyar, tmKat; zv-termin tmSureFas, tmFason, tmFasonDurum) ----
export interface TerminAyari { katMal: number; katFas: number; ekMal: number; ekFas: number; esik: number }
export const TM0: TerminAyari = { katMal: 1, katFas: 1, ekMal: 0, ekFas: 0, esik: 7 };
export const terminAyari = (D: PlanVerisi): TerminAyari => ({ ...TM0, ...(nesne(D.terminAyar) ? (D.terminAyar as Partial<TerminAyari>) : {}) });
export const katsayi = (x: ExtraAlanlar | undefined, k: string, genel: number): number => (x && x[k] != null && Number.isFinite(+(x[k] as number)) ? +(x[k] as number) : genel);

// Ayar alanlarının sınırı (zv-termin sTerminler al): en az, en çok, adım.
export const AYAR_SINIRI: Record<keyof TerminAyari, { ad: string; min: number; max: number; adim: number }> = {
  katMal: { ad: 'Malzeme katsayısı ×', min: 0.1, max: 10, adim: 0.1 },
  ekMal: { ad: 'Malzeme ek gün / 100 birim', min: 0, max: 100, adim: 0.1 },
  katFas: { ad: 'Fason katsayısı ×', min: 0.1, max: 10, adim: 0.1 },
  ekFas: { ad: 'Fason ek gün / 100 adet', min: 0, max: 100, adim: 0.1 },
  esik: { ad: 'Termin zorunlu (gün önce)', min: 1, max: 60, adim: 1 },
};
// Malzeme ve fasoncu başına katsayının sınırı (tmKatKart): katsayı 0,1-10, ek gün 0-100; boş genel katsayıdır.
export const KAT_SINIRI = { terminKat: { min: 0.1, max: 10 }, terminEk: { min: 0, max: 100 } } as const;

// Girilen değer sınırdaysa sayı; boş ve sınır dışı null.
export function sinirliSayi(deger: string, min: number, max: number): number | null {
  if (deger.trim() === '') return null;
  const x = Number(deger);
  return Number.isFinite(x) && x >= min && x <= max ? x : null;
}

export const fasonSuresi = (f: Fasoncu | undefined, adet: number, A: TerminAyari): number =>
  ((+(f?.sureGun ?? 0) || 1) * (f && f.terminKat != null ? +(f.terminKat as number) : A.katFas) + (f && f.terminEk != null ? +(f.terminEk as number) : A.ekFas) * adet / 100) * 24;

export interface FasonSatiri {
  id: string; r: PlanIsi; s: Siparis; f: Fasoncu | undefined; adet: number;
  ger: number | null; enGec: number | null; T: number | null; ref: number | null; tahmini: number; yakin: boolean;
}

// Plandaki her fason çıkışı: gerekli dönüş (ardıl adımın başlangıcı, ardılı yoksa termin) ve siparişi geciktirmeden en geç dönüş (zv-termin tmFason).
// Ardıl adım rotadaki bağdan bulunur (engine.betik compile: pr = o.bag).
export function fasonSatirlari(c: PlanlamaCalismasi, p: KayitliPlan): FasonSatiri[] {
  const D = c.D; const now = simdi(c); const A = terminAyari(D);
  const k = nesne(D.fasonTermin) ? D.fasonTermin : {}; const ref = nesne(D.fasonRef) ? D.fasonRef : {};
  const opAdet = nesne(D.opAdet) ? D.opAdet : {};
  const out: FasonSatiri[] = [];
  for (const [id, r] of Object.entries(p.ops)) {
    if (!r.fas || r.done) continue;
    const s = D.siparisler.find((x) => x.id === r.job); const u = s && D.urunler.find((x) => x.id === s.urun);
    const adim = id.slice(r.job.length + 1);
    if (!s || !u || !(u.rota ?? []).some((o) => o.k === adim)) continue;
    const ardillar = new Set((u.rota ?? []).filter((o) => (o.bag ?? []).some((b) => b[0] === adim)).map((o) => `${r.job}.${o.k}`));
    let ger: number | null = null;
    for (const x of Object.values(p.ops)) if (x.job === r.job && ardillar.has(x.id)) ger = ger == null ? x.S : Math.min(ger, x.S);
    const due = saatOku(D, s.termin);
    if (ger == null) ger = due;
    const C = p.J[r.job]?.C ?? null; const bol = due != null && C != null ? Math.max(0, due - C) : 0;
    const f = (D.fasoncular ?? []).find((x) => x.id === r.m.slice(1));
    const adet = opAdet[id] != null && Number.isFinite(+(opAdet[id] as number)) ? +(opAdet[id] as number) : s.adet;
    out.push({
      id, r, s, f, adet, ger, enGec: ger == null ? null : ger + bol, T: k[id] ? saatOku(D, k[id]) : null, ref: saatOku(D, ref[id]),
      tahmini: r.S + fasonSuresi(f, adet, A), yakin: r.S <= now + A.esik * 24,
    });
  }
  return out.sort((a, b) => a.r.S - b.r.S);
}

export type DurumTonu = 'hata' | 'uyari' | 'tamam';
export function fasonDurumu(x: FasonSatiri): [string, DurumTonu] {
  const don = x.T ?? x.r.C;
  if (x.T == null) return x.yakin ? ['Termin yok, bir hafta içinde çıkıyor', 'hata'] : ['Termin bekleniyor', 'uyari'];
  if (x.enGec != null && don > x.enGec + 1e-6) return ['Siparişi geciktirir', 'hata'];
  if (x.ger != null && don > x.ger + 1e-6) return ['Plandan geç', 'uyari'];
  if (x.ref != null && x.T > x.ref + 1e-6) return ['Referanstan geç, plan güncellenmeli', 'uyari'];
  return ['Karşılıyor', 'tamam'];
}

// Fason dönüş termini yazımı (zv-termin tm-fason): tarih 16:00 olarak girer; ilk girişte planın dönüşü referans olarak saklanır.
export function fasonTerminiYaz(t: PlanlamaCalismasi, id: string, tarih: string): void {
  const k = { ...(nesne(t.D.fasonTermin) ? t.D.fasonTermin : {}) } as Record<string, unknown>;
  if (tarih) k[id] = `${tarih} 16:00`; else delete k[id];
  (t.D as Record<string, unknown>).fasonTermin = k;
  const p = kayitliPlan(t); const r = p?.ops[id];
  const ref = nesne(t.D.fasonRef) ? t.D.fasonRef : {};
  if (tarih && r && !ref[id]) {
    const y = duvarSaati(t.D, r.C);
    if (y !== null) (t.D as Record<string, unknown>).fasonRef = { ...ref, [id]: y };
  }
}

export interface TerminKalemi { k: string; ad: string; alt: string; durum: string; ton: DurumTonu; bas: number; son: number; ger: number | null; tahmini: boolean; neden: string; bilgi: [string, string][]; x: FasonSatiri }

// Terminler ısı haritasının fason kalemleri (zz29-gorsel gvTmKalemler, fason kısmı).
export function fasonKalemleri(D: PlanVerisi, L: FasonSatiri[]): TerminKalemi[] {
  return L.map((x) => {
    const [d, ton] = fasonDurumu(x); const don = x.T ?? x.r.C;
    const neden = x.T == null ? `Fasoncu dönüş tarihi vermedi; plan fasoncunun süresinden ${gunYaz(D, x.r.C)} döner varsayıyor. Sonraki adım ${gunYaz(D, x.ger)} başlıyor.`
      : d === 'Siparişi geciktirir' ? `Dönüş ${gunYaz(D, don)}; sipariş gecikmeden en geç ${gunYaz(D, x.enGec)} dönmeliydi. Fasoncuyla tarihi öne çekin.`
        : d === 'Plandan geç' ? `Dönüş ${gunYaz(D, don)}, sonraki adım ${gunYaz(D, x.ger)} başlıyor; iş kayar ama sipariş termini tutar.` : `Dönüş ${gunYaz(D, don)}, sonraki adım ${gunYaz(D, x.ger)} başlıyor.`;
    return {
      k: `f:${x.id}`, ad: x.id, alt: `${x.f?.ad ?? x.r.m} · ${sayi(x.adet, 0)} adet`, durum: d, ton, bas: x.r.S, son: don, ger: x.ger, tahmini: x.T == null, neden,
      bilgi: [['Çıkış', gunYaz(D, x.r.S)], [x.T == null ? 'Dönüş (tahmini)' : 'Dönüş (fasoncu)', gunYaz(D, don)], ['Gerekli dönüş', gunYaz(D, x.ger)], ['Sipariş gecikmeden en geç', gunYaz(D, x.enGec)], ['Sipariş', x.r.job]],
      x,
    };
  });
}

const SIRA: Record<DurumTonu, number> = { hata: 0, uyari: 1, tamam: 2 };
const TAHMIN = 'tarih girilmedi, olağan süreye göre';
// kalem null: malzeme satırı; satın alma listesi plan motoruyla gelir, o zamana dek satır yerinde ve hücreleri kapalıdır (357 b).
export interface TerminSatiri extends IsiSatiri { kalem: TerminKalemi | null; gun: number | null }
export const MALZEME_SATIRI = 'malzeme';
export interface TerminIsisi { sutunlar: IsiSutunu[]; satirlar: TerminSatiri[]; ust: UstDurum }

// Kalem × gün, neyi bekliyor (zz30-isi ISI.terminler.veri). Fason kalemleri plandan; malzeme kalemleri motorla gelir, yerinde kapalı satır.
export function terminIsisi(c: PlanlamaCalismasi, K: TerminKalemi[]): TerminIsisi {
  const D = c.D; const G = gunSutunlari(D, simdi(c), 21); const satirlar: TerminSatiri[] = [];
  for (const x of [...K].sort((a, b) => SIRA[a.ton] - SIRA[b.ton] || (a.ger ?? 1e12) - (b.ger ?? 1e12))) {
    const h: Record<string, IsiHucresi> = {}; const tah = x.tahmini ? TAHMIN : undefined; const gec = x.ger != null && x.son > x.ger + 0.05;
    const kd: Kademe = x.ton === 'hata' ? 4 : 2;
    { const a = Math.max(gunNo(x.bas), G.g0), b = Math.min(gunNo(gec ? x.ger! : x.son) - (gec ? 0 : 1), G.g0 + G.n - 1); for (let g = a; g <= b; g++) hucreKoy(h, `g${g}`, { is: true, etiket: 'fasoncuda' }); }
    if (gec) for (let g = Math.max(gunNo(x.ger!), G.g0); g <= Math.min(gunNo(x.son), G.g0 + G.n - 1); g++) hucreKoy(h, `g${g}`, { kd, tahmin: tah, etiket: 'bekleniyor' });
    { const g = gunNo(x.son); const dis = !G.ic(g); const fark = gec ? Math.ceil((x.son - x.ger!) / 24) : 0;
      hucreKoy(h, `g${G.kis(g)}`, { sm: 'truck', kd: gec ? kd : undefined, iyi: gec ? undefined : true, tahmin: tah, v: gec ? `+${fark}g` : dis ? '»' : '', etiket: `geliş ${gunYaz(D, x.son)}${gec ? `, gerekenden ${fark} gün geç` : ''}` }); }
    if (x.ger != null) hucreKoy(h, `g${G.kis(gunNo(x.ger))}`, { bayrak: true, etiket: `plan ${gunYaz(D, x.ger)} istiyor` });
    satirlar.push({ k: x.k, ad: x.ad, alt: x.durum, simge: 'truck', ton: x.ton, gizli: x.ton === 'tamam', h, kalem: x, gun: gec ? (x.son - x.ger!) / 24 : 0 });
  }
  const hata = satirlar.filter((r) => r.ton === 'hata'); const bek = satirlar.filter((r) => (r.gun ?? 0) > 0);
  const en = [...satirlar].filter((r) => r.ton !== 'tamam').sort((a, b) => Number(b.ton === 'hata') - Number(a.ton === 'hata') || (b.gun ?? 99) - (a.gun ?? 99))[0];
  const metin = !en?.kalem ? `Bütün ${satirlar.length} fason kalemi gerektiği gün geliyor.`
    : `En koyu satır ${en.ad}: plan ${gunYaz(D, en.kalem.ger)} istiyor, geliş ${gunYaz(D, en.kalem.son)} (${sayi(en.gun, 1)} gün bekleme). ${bek.length} kalem gerekenden geç geliyor, ${satirlar.filter((r) => r.kalem?.tahmini).length} kalemin dönüş tarihi yok; ${hata.length} kalem işi kaydırıyor.`;
  satirlar.push({
    k: MALZEME_SATIRI, ad: 'Malzeme', alt: 'satın alma listesi', simge: 'box', ton: '', gizli: false, kalem: null, gun: null,
    h: Object.fromEntries(G.l.map((c) => [c.k, { kapali: true, etiket: 'malzeme kalemleri plan motoruyla gelir' }])),
  });
  return { sutunlar: G.l, satirlar, ust: { ton: hata.length ? 'hata' : en ? 'uyari' : 'tamam', simge: hata.length ? 'alert' : en ? 'clock' : 'check', metin } };
}

// Malzeme termini girilmediği için sipariş yok sayılan işler (zz25-sade-takvim stkTmUyari); uyarı kayıtlı plandadır.
export function terminUyarisi(p: KayitliPlan | null): { js: string[]; g: number } | null {
  const w = (p?.warn ?? []).filter((x) => x.t === 'Termin yok' && sonlu(x.gelis));
  if (!w.length) return null;
  return { js: [...new Set(w.map((x) => x.j ?? ''))].filter(Boolean), g: Math.max(...w.map((x) => x.gelis!)) };
}

export const tedarikliMalzemeler = (D: PlanVerisi): Malzeme[] => (D.malzemeler ?? []).filter((m) => m.tedarikGun != null);

// ---- termin ve kâr dengesi (durum.betik pdDenge, pdKat, karar1650Goc; zw-denge pdAd, pdKatYaz) ----
// Kayıtta denge yoksa 50'dir; 1650 kararları taşınmamış çalışmada sayfa açılışta 25 yazardı (karar1650Goc), ekran o değeri gösterir.
export function planDengesi(c: PlanlamaCalismasi): number {
  const v = c.D.planDenge;
  if (v == null) return c.karar1650 ? 50 : 25;
  return Number.isFinite(+(v as number)) ? Math.max(0, Math.min(100, +(v as number))) : 50;
}
export const dengeKatsayisi = (d: number): number => (d <= 50 ? 100 ** ((50 - d) / 50) : 10 ** ((50 - d) / 50));
export const dengeAdi = (d: number): string => (d <= 10 ? 'Termin önce' : d < 40 ? 'Termine yakın' : d <= 60 ? 'Dengeli' : d < 90 ? 'Kâra yakın' : 'Kâr önce');
export const dengeKatYazi = (d: number): string => `×${sayi(dengeKatsayisi(d), dengeKatsayisi(d) >= 10 ? 0 : 2)}`;
export const dengeEtkin = (D: PlanVerisi): boolean => planAmaci(D) === 'tl' && agirlikAyari(D).kip === 'bedel';

export const UZATMALAR = [0, 1, 2, 3, 5] as const;
export interface DengeSatiri extends IsiSatiri { s: Siparis; T: number | null; C: number | null }
export interface DengeIsisi { sutunlar: IsiSutunu[]; satirlar: DengeSatiri[]; ust: UstDurum; yalnizGec: boolean }

// Sipariş × termin uzatması, kalan gecikme (zz30-isi ISI.denge.veri). Kâr sütunu sipariş maliyetinden gelir; plan motoruyla açılır (357 b).
// fg: maliyet okuyan; "Kâr" sütunu yalnız ona çizilir. Değeri motorun sipariş maliyetinden gelir; motor bağlanana dek hücre kapalıdır (357 b).
export function dengeIsisi(D: PlanVerisi, p: KayitliPlan, fg = false): DengeIsisi {
  let L = plandaki(D).filter((s) => p.J[s.id] && saatOku(D, s.termin) != null).map((s) => ({ s, T: p.J[s.id]!.T, C: p.J[s.id]!.C }));
  const gec = L.filter((z) => z.T != null && z.T > 0.05); const yalnizGec = gec.length > 0;
  L = (yalnizGec ? gec : L).sort((a, b) => (b.T ?? 1e9) - (a.T ?? 1e9) || (a.C ?? 0) - (b.C ?? 0)).slice(0, 12);
  const sutunlar: IsiSutunu[] = [...UZATMALAR.map((d) => ({ k: `u${d}`, ad: d ? `+${d} gün` : 'Şimdi', alt: d ? 'uzatma' : 'plan' })), ...(fg ? [{ k: 'kar', ad: 'Kâr', alt: 'şimdi' }] : [])];
  const satirlar = L.map(({ s, T, C }): DengeSatiri => {
    const h: Record<string, IsiHucresi> = {};
    for (const d of UZATMALAR) {
      if (T == null) { hucreKoy(h, `u${d}`, { kd: 4, sm: 'alert', v: '!', etiket: 'plana sığmadı' }); continue; }
      const k = Math.max(0, T - d * 24);
      hucreKoy(h, `u${d}`, k > 0.05 ? { kd: kademe(k), v: kisaSure(k), etiket: `${saat(k)} geç kalır` } : { iyi: true, sm: 'check', etiket: 'zamanında' });
    }
    if (fg) h.kar = { kapali: true, etiket: 'kâr plan motoruyla hesaplanır' };
    return { k: s.id, ad: s.id, alt: `termin ${gunYaz(D, saatOku(D, s.termin))} · ${urunAdi(D, s.urun)}`, simge: 'flag', ton: T == null || T >= 24 ? 'hata' : T > 0.05 ? 'uyari' : '', gizli: false, h, s, T, C };
  });
  const en = satirlar[0]; const kurt = en && en.T != null ? UZATMALAR.find((d) => en.T! - d * 24 <= 0.05) : undefined;
  const metin = !yalnizGec ? `Geç biten sipariş yok; termine en yakın ${satirlar.length} sipariş gösteriliyor.`
    : `En sıcak satır ${en!.ad}: şimdiki planda ${en!.T == null ? 'plana sığmadı' : `${saat(en!.T)} geç`}. ${kurt != null ? `${kurt} gün uzatma gecikmeyi kapatıyor.` : 'Beş günlük uzatma da yetmiyor.'} ${gec.length} sipariş geç.`;
  return { sutunlar, satirlar, ust: { ton: yalnizGec ? 'uyari' : 'tamam', simge: 'gauge', metin }, yalnizGec };
}

export function dengeAcilimi(r: DengeSatiri, ck: string, sutunAd: string) {
  const d = ck === 'kar' ? 2 : Number(ck.slice(1)) || 1; const c = r.h[ck] ?? {};
  const simdiki = r.T != null && r.T > 0.05 ? `${saat(r.T)} geç` : 'zamanında';
  const neden = r.T == null ? `${r.ad} plana sığmadı; uzatma tek başına yetmeyebilir.`
    : ck === 'kar' ? `${r.ad} ${c.etiket ?? ''}; şimdiki planda ${simdiki}.` : `${r.ad} şimdi ${simdiki}; ${d} gün uzatmayla ${c.etiket ?? ''}.`;
  return { baslik: `${r.ad} · ${sutunAd}`, ton: (c.kd ?? 0) >= 4 ? 'hata' : (c.kd ?? 0) >= 2 ? 'uyari' : '', neden, gun: d };
}

// ---- parti bölme (zz10 ebAdaylar, t-tekyer basladiMi) ----
// Bölünebilecek iş emirleri: planda, havuzda değil, en az iki adet, başlamamış; en çok geciken başta.
export function partiAdaylari(D: PlanVerisi, p: KayitliPlan): Siparis[] {
  const isler = Object.values(p.ops);
  const basladi = (j: string) => isler.some((r) => r.job === j && (Boolean(r.done) || Boolean((r as unknown as Record<string, unknown>).act)));
  return D.siparisler.filter((s) => !s.havuz && s.adet >= 2 && isler.some((r) => r.job === s.id) && !basladi(s.id))
    .sort((a, b) => (p.J[b.id]?.T ?? 0) - (p.J[a.id]?.T ?? 0) || a.id.localeCompare(b.id, 'tr'));
}
export const PARTI_EN_COK = 20;

// Darboğaz adımı (zz4-oto-bolme darbogazAdimi): işin plandaki adımlarından, hazır olduğu andan başlamasına en uzun bekleyen. Hazır olma, adım
// tezgâh, kişi, yetkinlik, ayarcı ya da aparat beklediyse önceki adımların (rota bağı) en geç bitişidir; değilse planlanan başlangıç.
// Seçenek tezgâhlar adımın rotadaki öteki tezgâhlarıdır, iş süresi kısa olan önce (motor derlemesi gibi adet × çevrim / verim + ayar).
const BEKLEME_NEDENI = new Set(['tezgah', 'personel', 'yetkin', 'ayarci', 'aparat']);
export interface Darbogaz { k: string; m: string; alt: string[] }
export function darbogaz(D: PlanVerisi, p: KayitliPlan, jid: string, simdiSaat: number): Darbogaz | null {
  const s = D.siparisler.find((x) => x.id === jid); const u = s && D.urunler.find((x) => x.id === s.urun);
  if (!s || !u) return null;
  let en: { o: RotaAdimi; r: PlanIsi } | null = null; let enW = -1;
  for (const o of u.rota ?? []) {
    const r = p.ops[`${jid}.${o.k}`] as (PlanIsi & { act?: unknown; why?: { t?: string } | null }) | undefined;
    if (!r || r.fas || r.done || r.act) continue;
    let hazir = r.S;
    if (r.why?.t && BEKLEME_NEDENI.has(r.why.t)) {
      const once = (o.bag ?? []).map((b) => p.ops[`${jid}.${String(b[0])}`]?.C).filter(sonlu);
      hazir = once.length ? Math.max(...once) : simdiSaat;
    }
    const w = r.S - hazir + (r.run ?? 0) * 0.01;
    if (w > enW) { enW = w; en = { o, r }; }
  }
  if (!en) return null;
  const verim = (m: string) => { const t = D.tezgahlar.find((x) => x.id === m); return t && sonlu(t.verim) && t.verim > 0 ? t.verim : 1; };
  const m = en.r.m;
  const alt = (en.o.fason ? [] : en.o.tezgahlar ?? [])
    .filter((t) => t.id !== m && D.tezgahlar.some((x) => x.id === t.id))
    .map((t) => ({ id: t.id, sure: (s.adet * (+(t.cevrim ?? 0) || 0)) / 60 / verim(t.id) + (+(t.ayar ?? 0) || 0) / 60 }))
    .sort((a, b) => a.sure - b.sure).map((t) => t.id);
  return { k: en.o.k, m, alt };
}

// En küçük parti ve kasa (zz14-qmin-kasa): bölünen adımda en küçük parti, adımın elle girilen en küçüğü ile "çalışma süresi ayarın en az iki
// katı" kuralının büyüğü (adımın tezgâhlarının en büyüğü). Kasa adımın, yoksa ürünün, yoksa 1. Bölünen adım darboğaz, yoksa ilk adım.
export interface PartiKurali { k: string | null; qmin: number; kasa: number }
export function partiKurali(D: PlanVerisi, jid: string, dar: Darbogaz | null): PartiKurali {
  const s = D.siparisler.find((x) => x.id === jid); const u = s && D.urunler.find((x) => x.id === s.urun);
  const o = u?.rota?.find((x) => x.k === dar?.k) ?? u?.rota?.[0];
  if (!o) return { k: null, qmin: 1, kasa: 1 };
  let oran = 1;
  if (!o.fason) for (const t of o.tezgahlar ?? []) { const c = +(t.cevrim ?? 0), a = +(t.ayar ?? 0); if (c > 0 && a > 0) oran = Math.max(oran, Math.ceil((2 * a) / c)); }
  const kasa = Math.max(1, Math.round(+(o.kasa as number) || +(u?.kasa as number) || 1));
  return { k: o.k, qmin: Math.max(+(o.minParti ?? 0) || 1, oran), kasa };
}

// Eşit partileri kasaya yuvarlar, son partiyi en küçüğe tamamlar (önceki partilerden sondan başa birer kasa); olmuyorsa null (pqYuvarla).
export function kasayaBol(adetler: readonly number[], kasa: number, qmin: number): number[] | null {
  const n = adetler.length; if (n < 2) return adetler.slice();
  const top = adetler.reduce((a, x) => a + x, 0);
  const on = adetler.slice(0, -1).map((x) => (kasa > 1 ? Math.max(kasa, Math.round(x / kasa) * kasa) : Math.max(1, Math.round(x))));
  let son = top - on.reduce((a, x) => a + x, 0);
  const alt = Math.max(qmin, kasa);
  for (let tur = 0; son < qmin && tur < 1000; tur++) {
    let oldu = false;
    for (let i = on.length - 1; i >= 0 && son < qmin; i--) if (on[i]! - kasa >= alt) { on[i] = on[i]! - kasa; son += kasa; oldu = true; }
    if (!oldu) break;
  }
  const l = [...on, son];
  return l.every((x) => x >= qmin && x >= 1) && son >= 1 ? l : null;
}

// Kurala uymayan ilk parti (pqDenetle): en küçük partiden az ya da son parti dışında kasanın katı değil.
export function partiKuraliDenetle(adetler: readonly number[], kasa: number, qmin: number): string | null {
  for (let i = 0; i < adetler.length; i++) {
    const x = adetler[i]!;
    if (x < qmin) return `${String(i + 1)}. parti ${String(x)} adet; bu adımda en küçük parti ${String(qmin)}.`;
    if (kasa > 1 && i < adetler.length - 1 && x % kasa) return `${String(i + 1)}. parti ${String(x)} adet; kasa ${String(kasa)} adedin katı olmalı (son parti hariç).`;
  }
  return null;
}

// Taramada iş emrinin seçenek sayısı (zz11 btAdaylar, zz14): bölünmez, 2-20 eşit parti aynı tezgâhlarda, seçenek tezgâh varsa darboğazda
// dağıtılmış; kurala uymayan parti sayısı denenmez.
export function taramaSecenekSayisi(adet: number, dar: Darbogaz | null, kural: PartiKurali): number {
  let n = 1;
  for (let k = 2; k <= Math.min(PARTI_EN_COK, adet); k++) {
    const e = Array.from({ length: k }, (_, i) => Math.floor(adet / k) + (i >= k - (adet % k) ? 1 : 0));
    if (kasayaBol(e, kural.kasa, kural.qmin)) n += dar && dar.alt.length ? 2 : 1;
  }
  return n;
}

// Taramanın kapsamı (zz11 btAdaylar): en çok geciken k iş emri; geciken mamullerin yarı mamul iş emirleri de girer (kendi gecikmeleri yoktur,
// montajı bekletirler), toplam en çok 10.
export const TARAMA_EN_COK_IS = 10;
export function taramaKapsami(D: PlanVerisi, p: KayitliPlan, k: number): Siparis[] {
  const l = partiAdaylari(D, p); const kok = (id: string) => id.split('/')[0]!;
  const ust = (s: Siparis): string | null => (typeof s.ust === 'string' && s.ust ? s.ust : null);
  const sec = l.filter((s) => !ust(s) && (p.J[s.id]?.T ?? 0) > 0.05).slice(0, k);
  const kokler = new Set(sec.map((s) => kok(s.id)));
  const ustKok = (s: Siparis): string | null => {
    let u = ust(s);
    for (let i = 0; i < 6 && u; i++) { const x = D.siparisler.find((z) => kok(z.id) === u); if (!x || !ust(x)) return u; u = ust(x); }
    return u;
  };
  for (const s of l) { const u = ust(s) ? ustKok(s) : null; if (u && kokler.has(u) && sec.length < TARAMA_EN_COK_IS) sec.push(s); }
  return sec;
}

// ---- siparişler: maliyet ve kâr (zu-yan-sayfalar sSiparisKar; durum.betik YM0) ----
export const KAR_ORANLARI = [0, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100] as const;
export function hedefKarOrani(D: PlanVerisi, s: Siparis): number {
  if (s.karOran != null && Number.isFinite(+(s.karOran as number))) return +(s.karOran as number);
  const k = nesne(D.planTL) ? D.planTL.karHedef : null;
  return sonlu(k) ? k : 25;
}
// Gecikme ve erken bitiş plandan (saat); plan siparişi yerleştiremediyse null.
export function siparisZamani(D: PlanVerisi, p: KayitliPlan, s: Siparis): { T: number | null; erken: number | null } {
  const J = p.J[s.id]; if (!J || J.C == null) return { T: null, erken: null };
  const due = saatOku(D, s.termin);
  return { T: J.T, erken: due == null ? null : Math.max(0, due - J.C) };
}
// Önerilen fiyat = maliyet × (1 + hedef kâr oranı); eksik maliyette yok. Uygulanırken 10 TL'ye yuvarlanır (sSiparisKar ym-fiyat-toplu).
export const onerilenFiyat = (toplam: number | null, oran: number): number | null => (toplam == null ? null : toplam * (1 + oran / 100));
export const fiyatYuvarla = (x: number): number => Math.round(x / 10) * 10;
