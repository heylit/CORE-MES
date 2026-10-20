import type { Alan, Liste, Nesne, TurTanimi } from './sema.ts';
import { ATLANAN_ALANLAR } from './sema.ts';

/* Uygulamanın kaydı <-> tablo satırları (saf). Bağ alanları (başka İK kaydı) burada metin kimlik olarak kalır; sayı kimliğe
   çevirme sorgular.ts'tedir. Boş değer (undefined, null, '') sütunda NULL'dur; kurarken NULL alan kayda yazılmaz. */

export type Deger = string | number | boolean | null;
export type SatirDegeri = Record<string, Deger>;
export interface Satirlar {
  // Ana tablonun sütunları (ortak sütunlar hariç).
  ana: SatirDegeri;
  // Alt tablo adı -> satırlar (ana kaydın bağ sütunu hariç).
  altlar: Record<string, SatirDegeri[]>;
}

export class EslesmeHatasi extends Error {
  readonly alan: string;
  constructor(mesaj: string, alan: string) { super(mesaj); this.alan = alan; }
}

const TARIH = /^(\d{4})-(\d{2})-(\d{2})$/;
const AY = /^(\d{4})-(0[1-9]|1[0-2])$/;
const SAAT = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
const bosMu = (v: unknown): boolean => v === undefined || v === null || v === '';

function gecerliTarih(v: string): boolean {
  const m = TARIH.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

// Kayıttaki değer -> sütun değeri. Bağ alanı metin kimlik kalır.
export function yazimDegeri(a: Alan, v: unknown, yol: string): Deger {
  if (bosMu(v)) return null;
  if (a.bag) {
    if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(v)) throw new EslesmeHatasi(`${yol}: kayıt kimliği geçersiz.`, yol);
    return v;
  }
  switch (a.t) {
    case 'metin': {
      if (typeof v === 'number' && Number.isFinite(v)) return String(v);
      if (typeof v !== 'string') throw new EslesmeHatasi(`${yol}: metin bekleniyor.`, yol);
      if (a.secenek && !a.secenek.includes(v)) throw new EslesmeHatasi(`${yol}: "${v}" geçerli bir seçenek değil.`, yol);
      return v;
    }
    case 'tarih':
      if (typeof v !== 'string' || !gecerliTarih(v)) throw new EslesmeHatasi(`${yol}: tarih GGGG-AA-GG biçiminde olmalı.`, yol);
      return v;
    case 'ay':
      if (typeof v !== 'string' || !AY.test(v)) throw new EslesmeHatasi(`${yol}: ay GGGG-AA biçiminde olmalı.`, yol);
      return `${v}-01`;
    case 'saat':
      if (typeof v !== 'string' || !SAAT.test(v)) throw new EslesmeHatasi(`${yol}: saat SS:DD biçiminde olmalı.`, yol);
      return v;
    case 'zaman':
      if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw new EslesmeHatasi(`${yol}: zaman geçersiz.`, yol);
      return v;
    case 'mantik':
      if (typeof v !== 'boolean') throw new EslesmeHatasi(`${yol}: evet/hayır bekleniyor.`, yol);
      return v;
    case 'tamsayi': {
      const n = typeof v === 'string' ? Number(v) : v;
      if (typeof n !== 'number' || !Number.isInteger(n)) throw new EslesmeHatasi(`${yol}: tam sayı bekleniyor.`, yol);
      return n;
    }
    default: {
      const n = typeof v === 'string' ? Number(v) : v;
      if (typeof n !== 'number' || !Number.isFinite(n)) throw new EslesmeHatasi(`${yol}: sayı bekleniyor.`, yol);
      return n;
    }
  }
}

// Sütun değeri -> kayıttaki değer (NULL -> undefined). Sayısal sütun metin gelir (db.ts), uygulama sayı bekler.
export function okumaDegeri(a: Alan, v: Deger | undefined): unknown {
  if (v === null || v === undefined) return undefined;
  if (a.bag) return v;
  switch (a.t) {
    case 'tutar': case 'hesap': case 'sayi': case 'tamsayi': return Number(v);
    case 'ay': return String(v).slice(0, 7);
    case 'saat': return String(v).slice(0, 5);
    default: return v;
  }
}

function bilinmeyenler(nesne: Record<string, unknown>, bilinen: readonly string[], yol: string): void {
  const fazla = Object.keys(nesne).filter((k) => !bilinen.includes(k) && nesne[k] !== undefined);
  if (fazla.length) throw new EslesmeHatasi(`${yol}: tanımsız alan: ${fazla.join(', ')} (yeni alan göç ister).`, `${yol}.${fazla[0]}`);
}

function nesneMi(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function alanlariYaz(alanlar: readonly Alan[], kaynak: Record<string, unknown>, hedef: SatirDegeri, yol: string, onek = ''): void {
  for (const a of alanlar) {
    const v = yazimDegeri(a, kaynak[a.a], `${yol}.${a.a}`);
    if (a.zorunlu && v === null) throw new EslesmeHatasi(`${yol}.${a.a}: boş olamaz.`, `${yol}.${a.a}`);
    hedef[onek + a.s] = v;
  }
}

function listeyiYaz(l: Liste, v: unknown, yol: string): SatirDegeri[] {
  if (bosMu(v)) return [];
  const satirlar: SatirDegeri[] = [];
  if (l.bicim === 'dizi') {
    if (!Array.isArray(v)) throw new EslesmeHatasi(`${yol}: liste bekleniyor.`, yol);
    v.forEach((oge, i) => {
      if (!nesneMi(oge)) throw new EslesmeHatasi(`${yol}[${i}]: nesne bekleniyor.`, yol);
      bilinmeyenler(oge, l.alanlar.map((a) => a.a), `${yol}[${i}]`);
      const s: SatirDegeri = { sira: i + 1 };
      alanlariYaz(l.alanlar, oge, s, `${yol}[${i}]`);
      satirlar.push(s);
    });
    return satirlar;
  }
  if (l.bicim === 'kimlik') {
    if (!Array.isArray(v)) throw new EslesmeHatasi(`${yol}: liste bekleniyor.`, yol);
    const a = l.alanlar[0]!;
    for (const k of new Set(v)) satirlar.push({ [a.s]: yazimDegeri(a, k, yol) });
    return satirlar;
  }
  if (!nesneMi(v)) throw new EslesmeHatasi(`${yol}: nesne bekleniyor.`, yol);
  for (const [anahtar, oge] of Object.entries(v)) {
    if (oge === undefined) continue;
    if (anahtar === '') throw new EslesmeHatasi(`${yol}: boş anahtar.`, yol);
    const s: SatirDegeri = { [l.anahtar!]: anahtar };
    if (l.bicim === 'deger') {
      s[l.alanlar[0]!.s] = yazimDegeri(l.alanlar[0]!, oge, `${yol}.${anahtar}`);
    } else {
      if (!nesneMi(oge)) throw new EslesmeHatasi(`${yol}.${anahtar}: nesne bekleniyor.`, yol);
      bilinmeyenler(oge, l.alanlar.map((a) => a.a), `${yol}.${anahtar}`);
      alanlariYaz(l.alanlar, oge, s, `${yol}.${anahtar}`);
    }
    satirlar.push(s);
  }
  return satirlar;
}

function nesneyiYaz(n: Nesne, v: unknown, hedef: SatirDegeri, onek: string, yol: string): void {
  const var_ = !bosMu(v);
  hedef[`${onek}${n.onek}var`] = var_;
  if (var_ && !nesneMi(v)) throw new EslesmeHatasi(`${yol}: nesne bekleniyor.`, yol);
  const kaynak = var_ ? (v as Record<string, unknown>) : {};
  if (var_) bilinmeyenler(kaynak, n.alanlar.map((a) => a.a), yol);
  alanlariYaz(n.alanlar, kaynak, hedef, yol, onek + n.onek);
}

// Kayıt -> satırlar. Tanımsız alan, yanlış tip ve boş zorunlu alan EslesmeHatasi'dir (uç 400 döner).
export function parcala(t: TurTanimi, kayit: Record<string, unknown>): Satirlar {
  const yol = 'govde';
  const bilinen = [...ATLANAN_ALANLAR, ...t.alanlar.map((a) => a.a), ...t.listeler.map((l) => l.a), ...(t.ozet ? [t.ozet.a] : [])];
  bilinmeyenler(kayit, bilinen, yol);
  const ana: SatirDegeri = {};
  alanlariYaz(t.alanlar, kayit, ana, yol);
  const altlar: Record<string, SatirDegeri[]> = {};
  for (const l of t.listeler) altlar[l.tablo] = listeyiYaz(l, kayit[l.a], `${yol}.${l.a}`);
  if (t.ozet) {
    const o = t.ozet;
    const v = kayit[o.a];
    const kaynak = nesneMi(v) ? v : {};
    if (!bosMu(v) && !nesneMi(v)) throw new EslesmeHatasi(`${yol}.${o.a}: nesne bekleniyor.`, `${yol}.${o.a}`);
    bilinmeyenler(kaynak, [...o.alanlar.map((a) => a.a), ...o.nesneler.map((n) => n.a), ...o.listeler.map((l) => l.a)], `${yol}.${o.a}`);
    alanlariYaz(o.alanlar, kaynak, ana, `${yol}.${o.a}`, o.onek);
    for (const n of o.nesneler) nesneyiYaz(n, kaynak[n.a], ana, o.onek, `${yol}.${o.a}.${n.a}`);
    for (const l of o.listeler) altlar[l.tablo] = listeyiYaz(l, kaynak[l.a], `${yol}.${o.a}.${l.a}`);
  }
  return { ana, altlar };
}

function alanlariOku(alanlar: readonly Alan[], kaynak: SatirDegeri, hedef: Record<string, unknown>, onek = ''): void {
  for (const a of alanlar) {
    const v = okumaDegeri(a, kaynak[onek + a.s]);
    if (v !== undefined) hedef[a.a] = v;
  }
}

function listeyiOku(l: Liste, satirlar: readonly SatirDegeri[]): unknown {
  if (!satirlar.length) return undefined;
  if (l.bicim === 'dizi') {
    return [...satirlar].sort((x, y) => Number(x['sira']) - Number(y['sira'])).map((s) => { const o: Record<string, unknown> = {}; alanlariOku(l.alanlar, s, o); return o; });
  }
  if (l.bicim === 'kimlik') return satirlar.map((s) => s[l.alanlar[0]!.s]);
  const o: Record<string, unknown> = {};
  for (const s of satirlar) {
    const k = String(s[l.anahtar!]);
    if (l.bicim === 'deger') o[k] = okumaDegeri(l.alanlar[0]!, s[l.alanlar[0]!.s]);
    else { const ic: Record<string, unknown> = {}; alanlariOku(l.alanlar, s, ic); o[k] = ic; }
  }
  return o;
}

// Satırlar -> kayıt (kimlik ve tür dahil). Boş liste kayda yazılmaz.
export function kur(t: TurTanimi, kimlik: string, ana: SatirDegeri, altlar: Readonly<Record<string, readonly SatirDegeri[]>>): Record<string, unknown> {
  const kayit: Record<string, unknown> = { id: kimlik, kind: t.tur };
  alanlariOku(t.alanlar, ana, kayit);
  for (const l of t.listeler) {
    const v = listeyiOku(l, altlar[l.tablo] ?? []);
    if (v !== undefined) kayit[l.a] = v;
  }
  if (t.ozet) {
    const o = t.ozet;
    const snap: Record<string, unknown> = {};
    alanlariOku(o.alanlar, ana, snap, o.onek);
    for (const n of o.nesneler) {
      if (ana[`${o.onek}${n.onek}var`] !== true) { if (n.bos) snap[n.a] = null; continue; }
      const ic: Record<string, unknown> = {};
      alanlariOku(n.alanlar, ana, ic, o.onek + n.onek);
      snap[n.a] = ic;
    }
    for (const l of o.listeler) snap[l.a] = listeyiOku(l, altlar[l.tablo] ?? []) ?? null;
    if (Object.keys(snap).length) kayit[o.a] = snap;
  }
  return kayit;
}
