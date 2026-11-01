// Geometri kuralları: saf hesap, veritabanı ve saat yok. Ölçüler mm.

import { HAM_STOK_FORMLARI } from '#paylasilan/sozlesme/geometri.ts';

// Güvenilmeyen girdi sınırları (VARSAYIM, kart 1441; geri alma ucuz).
export const DOSYA_EN_BUYUK_BAYT = 200 * 1024 * 1024;
export const IS_SURE_SINIRI_MS = 120_000;
export const SUREC_BELLEK_ESIGI_BAYT = 2 * 1024 * 1024 * 1024;
export const EN_COK_DENEME = 3;
export const HATA_METNI_EN_UZUN = 500;
export const TUR_BASINA_EN_COK_IS = 5;
export const MOTOR = 'occt-import-js@0.0.23';

export const ILETILER = {
  dosyaYok: 'Model dosyası Çizim Merkezi\'nde bulunamadı (belge arşivde ya da revizyon değişti).',
  dosyaBuyuk: `Model dosyası ${String(DOSYA_EN_BUYUK_BAYT / 1024 / 1024)} MB sınırını aşıyor.`,
  bicimYanlis: 'Dosya STEP ya da IGES biçiminde görünmüyor.',
  okunamadi: 'Model okunamadı (dosya bozuk ya da desteklenmeyen içerik).',
  bosModel: 'Modelde katı ya da yüzey yok.',
  sureAsimi: `Hesap ${String(IS_SURE_SINIRI_MS / 1000)} saniyede bitmedi.`,
  surecDustu: 'Hesap süreci beklenmedik biçimde kapandı.',
  modelYok: 'Bu revizyon bir malzeme kartına bağlı, yayındaki STEP ya da IGES modeli değil.',
} as const;

export type DosyaTuru = 'step' | 'iges';

// Dosyanın başı biçimiyle tutmalı: STEP "ISO-10303-21", IGES 80 sütunluk satırın 73. sütununda 'S' (başlangıç bölümü).
export function bicimDenetimi(tur: DosyaTuru, bas: Uint8Array): string | null {
  const metin = Buffer.from(bas.subarray(0, 256)).toString('latin1');
  if (tur === 'step') return metin.trimStart().startsWith('ISO-10303-21') ? null : ILETILER.bicimYanlis;
  return metin.length >= 73 && metin[72] === 'S' ? null : ILETILER.bicimYanlis;
}

export function hataMetniKisalt(metin: string): string {
  const t = metin.trim() || ILETILER.okunamadi;
  return t.length <= HATA_METNI_EN_UZUN ? t : `${t.slice(0, HATA_METNI_EN_UZUN - 1)}…`;
}

// Kalıcı hata (biçim, boş model, okunamayan dosya) yinelenmez; geçici olan (süre, süreç düşmesi) EN_COK_DENEME'ye kadar yinelenir.
export function hataSonrasiDurum(denemeSayisi: number, kalici: boolean): 'bekliyor' | 'hata' {
  return kalici || denemeSayisi >= EN_COK_DENEME ? 'hata' : 'bekliyor';
}

export interface UcgenAgi {
  // x, y, z ardışık; indeks üçlüleri üçgendir.
  konum: ArrayLike<number>;
  indeks: ArrayLike<number>;
}

export interface Olcum {
  kutu: { x: number; y: number; z: number };
  // cap: uzun eksen (a) çevresinde parçayı kapsayan en küçük dairenin çapı (döner parçada parçanın çapı).
  obb: { a: number; b: number; c: number; cap: number; yon: [number, number, number][] };
  hacimMm3: number | null;
  alanMm2: number;
  govdeSayisi: number;
  kapali: boolean;
  ucgenSayisi: number;
}

type V3 = [number, number, number];

const nokta = (k: ArrayLike<number>, i: number): V3 => [k[i * 3] as number, k[i * 3 + 1] as number, k[i * 3 + 2] as number];
const cikar = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const capraz = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const ic = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Ağ kapalıysa her kenarı tam iki üçgen paylaşır. Konum aynı olan köşeler birleştirilir (OCCT yüz başına köşe çoğaltır).
function kapaliMi(ag: UcgenAgi, anahtar: (i: number) => string): boolean {
  const sayac = new Map<string, number>();
  const ix = ag.indeks;
  for (let t = 0; t + 2 < ix.length; t += 3) {
    const k = [anahtar(ix[t] as number), anahtar(ix[t + 1] as number), anahtar(ix[t + 2] as number)];
    for (let j = 0; j < 3; j++) {
      const a = k[j] as string, b = k[(j + 1) % 3] as string;
      if (a === b) continue;
      const kenar = a < b ? `${a}|${b}` : `${b}|${a}`;
      sayac.set(kenar, (sayac.get(kenar) ?? 0) + 1);
    }
  }
  if (sayac.size === 0) return false;
  for (const n of sayac.values()) if (n !== 2) return false;
  return true;
}

// Simetrik 3x3 matrisin özvektörleri (Jacobi dönüşleri). Sütunlar özvektördür.
export function ozvektorler(m: number[][]): V3[] {
  const a = m.map((r) => [...r]);
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let tur = 0; tur < 50; tur++) {
    let p = 0, q = 1, en = 0;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const d = Math.abs(a[i]![j]!);
      if (d > en) { en = d; p = i; q = j; }
    }
    if (en < 1e-12) break;
    const teta = (a[q]![q]! - a[p]![p]!) / (2 * a[p]![q]!);
    const t = Math.sign(teta || 1) / (Math.abs(teta) + Math.sqrt(teta * teta + 1));
    const c = 1 / Math.sqrt(t * t + 1), s = t * c;
    for (let k = 0; k < 3; k++) {
      const akp = a[k]![p]!, akq = a[k]![q]!;
      a[k]![p] = c * akp - s * akq; a[k]![q] = s * akp + c * akq;
    }
    for (let k = 0; k < 3; k++) {
      const apk = a[p]![k]!, aqk = a[q]![k]!;
      a[p]![k] = c * apk - s * aqk; a[q]![k] = s * apk + c * aqk;
    }
    for (let k = 0; k < 3; k++) {
      const vkp = v[k]![p]!, vkq = v[k]![q]!;
      v[k]![p] = c * vkp - s * vkq; v[k]![q] = s * vkp + c * vkq;
    }
  }
  return [0, 1, 2].map((j) => [v[0]![j]!, v[1]![j]!, v[2]![j]!] as V3);
}

const birim = (a: V3): V3 => { const u = Math.hypot(...a); return [a[0] / u, a[1] / u, a[2] / u]; };

type V2 = [number, number];

// Dışbükey zarf (monoton zincir); sıralama girdinin kopyasındadır.
function zarf2B(noktalar: readonly V2[]): V2[] {
  const iz = [...noktalar].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const yon = (o: V2, a: V2, b: V2): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const alt: V2[] = [], ust: V2[] = [];
  for (const p of iz) { while (alt.length >= 2 && yon(alt[alt.length - 2]!, alt[alt.length - 1]!, p) <= 0) alt.pop(); alt.push(p); }
  for (let i = iz.length - 1; i >= 0; i--) { const p = iz[i]!; while (ust.length >= 2 && yon(ust[ust.length - 2]!, ust[ust.length - 1]!, p) <= 0) ust.pop(); ust.push(p); }
  const z = [...alt.slice(0, -1), ...ust.slice(0, -1)];
  return z.length > 0 ? z : iz.slice(0, 1);
}

interface Daire { x: number; y: number; r: number }
const icinde = (d: Daire, p: V2): boolean => Math.hypot(p[0] - d.x, p[1] - d.y) <= d.r * (1 + 1e-12) + 1e-9;
const ikiNoktadan = (a: V2, b: V2): Daire => ({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, r: Math.hypot(a[0] - b[0], a[1] - b[1]) / 2 });
function ucNoktadan(a: V2, b: V2, c: V2): Daire {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) {
    const adaylar = [ikiNoktadan(a, b), ikiNoktadan(a, c), ikiNoktadan(b, c)];
    return adaylar.reduce((en, x) => (x.r > en.r ? x : en));
  }
  const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2;
  const x = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const y = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return { x, y, r: Math.hypot(a[0] - x, a[1] - y) };
}

// Noktaları kapsayan en küçük daire (artımlı Welzl, zarf üzerinde). Çubuk hamı için: parça uzun ekseni çevresinde bu çapa sığar.
export function kapsayanDaireCapi(noktalar: readonly V2[]): number {
  const z = zarf2B(noktalar);
  if (z.length === 0) return 0;
  let d: Daire = { x: z[0]![0], y: z[0]![1], r: 0 };
  for (let i = 1; i < z.length; i++) {
    if (icinde(d, z[i]!)) continue;
    d = { x: z[i]![0], y: z[i]![1], r: 0 };
    for (let j = 0; j < i; j++) {
      if (icinde(d, z[j]!)) continue;
      d = ikiNoktadan(z[i]!, z[j]!);
      for (let k = 0; k < j; k++) if (!icinde(d, z[k]!)) d = ucNoktadan(z[i]!, z[j]!, z[k]!);
    }
  }
  return 2 * d.r;
}

// Sabit eksen n için dik düzlemdeki en küçük alanlı dikdörtgen: izdüşümün dışbükey zarfı üzerinde döner kumpas (zarfın bir kenarına
// hizalı dikdörtgenlerden biri en küçüktür). Dönen: üç kenar ve eksenler.
function sabitEksenliKutu(noktalar: readonly V3[], n: V3): { kenar: V3; yon: V3[] } {
  const ref: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = birim(capraz(n, ref)), v = capraz(n, u);
  let enN = Infinity, ustN = -Infinity;
  const iz: V2[] = noktalar.map((p) => {
    const d = ic(p, n);
    if (d < enN) enN = d;
    if (d > ustN) ustN = d;
    return [ic(p, u), ic(p, v)];
  });
  const zarf = zarf2B(iz);
  let en = { alan: Infinity, g: 0, y: 0, aci: [1, 0] as [number, number] };
  const kenarlar: [number, number][] = zarf.length < 2 ? [[1, 0]] : zarf.map((p, i) => {
    const q = zarf[(i + 1) % zarf.length]!;
    return [q[0] - p[0], q[1] - p[1]];
  });
  for (const [dx, dy] of kenarlar) {
    const l = Math.hypot(dx, dy);
    if (l === 0) continue;
    const ex: [number, number] = [dx / l, dy / l];
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of zarf.length ? zarf : iz) {
      const x = p[0] * ex[0] + p[1] * ex[1], y = -p[0] * ex[1] + p[1] * ex[0];
      if (x < a0) a0 = x; if (x > a1) a1 = x; if (y < b0) b0 = y; if (y > b1) b1 = y;
    }
    const alan = (a1 - a0) * (b1 - b0);
    if (alan < en.alan) en = { alan, g: a1 - a0, y: b1 - b0, aci: ex };
  }
  const e1 = birim([u[0] * en.aci[0] + v[0] * en.aci[1], u[1] * en.aci[0] + v[1] * en.aci[1], u[2] * en.aci[0] + v[2] * en.aci[1]]);
  const e2 = capraz(n, e1);
  return { kenar: [en.g, en.y, ustN - enN], yon: [e1, e2, n] };
}

const yuvarla = (x: number, basamak = 4): number => {
  const k = 10 ** basamak;
  return Math.round(x * k) / k;
};

// Döndürülmüş kutu: aday eksenlerin (model eksenleri ve yüzey ağırlıklı ana bileşenler) her biri sabit tutulup dik düzlemde en küçük
// dikdörtgen aranır; hacmi en küçük olan seçilir. Bir ekseni bu adaylardan birine hizalı parçada (prizmatik, döner, ekstrüzyon) kesin
// sonuç verir; genel en küçük kutu değildir (VARSAYIM: ham önerisi için yeterli).
function donukKutu(aglar: readonly UcgenAgi[]): Olcum['obb'] {
  let alan = 0;
  const m: V3 = [0, 0, 0];
  const c = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const noktalar: V3[] = [];
  for (const ag of aglar) {
    for (let i = 0; i * 3 < ag.konum.length; i++) noktalar.push(nokta(ag.konum, i));
    const ix = ag.indeks;
    for (let t = 0; t + 2 < ix.length; t += 3) {
      const a = nokta(ag.konum, ix[t] as number), b = nokta(ag.konum, ix[t + 1] as number), d = nokta(ag.konum, ix[t + 2] as number);
      const s = Math.hypot(...capraz(cikar(b, a), cikar(d, a))) / 2;
      if (s === 0) continue;
      alan += s;
      // Üçgen yüzeyi üzerinde birinci ve ikinci moment (kesin): ∫p = s·Σp/3, ∫ppᵀ = s/12·(Σpᵢpᵢᵀ + ΣpΣpᵀ).
      const top: V3 = [a[0] + b[0] + d[0], a[1] + b[1] + d[1], a[2] + b[2] + d[2]];
      for (let i = 0; i < 3; i++) {
        m[i] = (m[i] as number) + (s * (top[i] as number)) / 3;
        for (let j = 0; j < 3; j++) {
          const kare = a[i]! * a[j]! + b[i]! * b[j]! + d[i]! * d[j]!;
          c[i]![j] = c[i]![j]! + (s / 12) * (kare + top[i]! * top[j]!);
        }
      }
    }
  }
  const adaylar: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  if (alan > 0) {
    const ort = m.map((x) => x / alan) as V3;
    adaylar.push(...ozvektorler(c.map((r, i) => r.map((x, j) => x / alan - (ort[i] as number) * (ort[j] as number)))));
  }
  let en: { kenar: V3; yon: V3[] } | null = null;
  for (const n of adaylar) {
    const k = sabitEksenliKutu(noktalar, birim(n));
    if (en === null || k.kenar[0] * k.kenar[1] * k.kenar[2] < en.kenar[0] * en.kenar[1] * en.kenar[2] - 1e-9) en = k;
  }
  const sirali = [0, 1, 2].map((i) => ({ k: en!.kenar[i] as number, y: en!.yon[i] as V3 })).sort((x, y) => y.k - x.k);
  const u = sirali[1]!.y, v = sirali[2]!.y;
  const cap = kapsayanDaireCapi(noktalar.map((p) => [ic(p, u), ic(p, v)] as V2));
  return {
    a: yuvarla(sirali[0]!.k), b: yuvarla(sirali[1]!.k), c: yuvarla(sirali[2]!.k), cap: yuvarla(cap),
    yon: sirali.map((s) => s.y.map((x) => yuvarla(x, 8) + 0) as [number, number, number]),
  };
}

// Ağ başına bir gövde sayılır (OCCT çıktısında her katı ayrı ağ). Hacim, kapalı ağda işaretli dört yüzlü toplamıdır.
export function agOlcumu(aglar: readonly UcgenAgi[]): Olcum | null {
  const dolu = aglar.filter((a) => a.indeks.length >= 3 && a.konum.length >= 9);
  if (dolu.length === 0) return null;
  const en = [Infinity, Infinity, Infinity], ust = [-Infinity, -Infinity, -Infinity];
  let hacim = 0, alan = 0, ucgen = 0, kapali = true;
  for (const ag of dolu) {
    const k = ag.konum;
    for (let i = 0; i < k.length; i += 3) for (let e = 0; e < 3; e++) {
      const d = k[i + e] as number;
      if (d < (en[e] as number)) en[e] = d;
      if (d > (ust[e] as number)) ust[e] = d;
    }
    let agHacmi = 0;
    for (let t = 0; t + 2 < ag.indeks.length; t += 3) {
      const a = nokta(k, ag.indeks[t] as number), b = nokta(k, ag.indeks[t + 1] as number), c = nokta(k, ag.indeks[t + 2] as number);
      agHacmi += ic(a, capraz(b, c)) / 6;
      alan += Math.hypot(...capraz(cikar(b, a), cikar(c, a))) / 2;
      ucgen++;
    }
    hacim += Math.abs(agHacmi);
    if (kapali) kapali = kapaliMi(ag, (i) => nokta(k, i).map((x) => x.toFixed(6)).join(','));
  }
  return {
    kutu: { x: yuvarla((ust[0] as number) - (en[0] as number)), y: yuvarla((ust[1] as number) - (en[1] as number)), z: yuvarla((ust[2] as number) - (en[2] as number)) },
    obb: donukKutu(dolu),
    hacimMm3: kapali && hacim > 0 ? yuvarla(hacim) : null,
    alanMm2: yuvarla(alan),
    govdeSayisi: dolu.length,
    kapali,
    ucgenSayisi: ucgen,
  };
}

// Ham önerisi: döndürülmüş kutunun her kenarına iki yüzün payı eklenir.
export function enAzHam(obb: { a: number; b: number; c: number }, payMm: number): { a: number; b: number; c: number } {
  return { a: yuvarla(obb.a + 2 * payMm), b: yuvarla(obb.b + 2 * payMm), c: yuvarla(obb.c + 2 * payMm) };
}

// Stok ölçüsüne yuvarlama (1433 a): ölçü adları Malzemeler'in hammadde formlarındakiyle aynıdır (çubuk d,l; altıgen s,l; lama a,b,l;
// levha t,w,l; blok a,b,h). Boru, profil ve disk parçanın yönüyle eşlenemediği için önerilmez.
export const STOK_FORMLARI = HAM_STOK_FORMLARI;
export type StokFormu = (typeof HAM_STOK_FORMLARI)[number];
const FORM_OLCULERI: Record<StokFormu, readonly string[]> = { cubuk: ['d', 'l'], altigen: ['s', 'l'], lama: ['a', 'b', 'l'], levha: ['t', 'w', 'l'], blok: ['a', 'b', 'h'] };

export interface StokAdayi { malzemeNo: number; kod: string; ad: string | null; kalite: string | null; form: string; olcu: Readonly<Record<string, unknown>> }
export interface StokOnerisi {
  malzemeNo: number; kod: string; ad: string | null; kalite: string | null; form: StokFormu; olcu: Record<string, number>;
  // Çubuk, altıgen, lama ve levhada kesilecek parça boyu (uzun eksen + pay); blokta null (blok bütün kullanılır).
  kesimBoyuMm: number | null;
  // Kullanılan ham parçanın hacmi; formlar arası sıra bununla (en az talaş önce).
  hamHacimMm3: number;
}

const AYNI = 1e-9;
const sigar = (x: number, gereken: number) => x + AYNI >= gereken;

function olcuOku(form: StokFormu, ham: Readonly<Record<string, unknown>>): Record<string, number> | null {
  const o: Record<string, number> = {};
  for (const k of FORM_OLCULERI[form]) {
    const v = ham[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
    o[k] = v;
  }
  return o;
}

// Ölçüsü eksik ya da sıfır olan aday önerilmez (uydurulmaz). Sığmayan aday yoksa boş liste.
export function stokEslestir(
  obb: { a: number; b: number; c: number; cap: number }, payMm: number, adaylar: readonly StokAdayi[],
): StokOnerisi[] {
  const L = obb.a + 2 * payMm, B = obb.b + 2 * payMm, C = obb.c + 2 * payMm, D = obb.cap + 2 * payMm;
  const enIyi = new Map<StokFormu, StokOnerisi>();
  for (const aday of adaylar) {
    if (!(STOK_FORMLARI as readonly string[]).includes(aday.form)) continue;
    const form = aday.form as StokFormu;
    const o = olcuOku(form, aday.olcu);
    if (o === null) continue;
    let hacim: number | null = null;
    let kesim: number | null = L;
    if (form === 'cubuk') {
      if (sigar(o['d']!, D) && sigar(o['l']!, L)) hacim = (Math.PI * o['d']! ** 2 / 4) * L;
    } else if (form === 'altigen') {
      // Altıgenin iç teğet dairesi anahtar ağzıdır: kapsayan daire buna sığmalı.
      if (sigar(o['s']!, D) && sigar(o['l']!, L)) hacim = (Math.sqrt(3) / 2) * o['s']! ** 2 * L;
    } else if (form === 'lama') {
      const g = Math.max(o['a']!, o['b']!), k = Math.min(o['a']!, o['b']!);
      if (sigar(g, B) && sigar(k, C) && sigar(o['l']!, L)) hacim = g * k * L;
    } else if (form === 'levha') {
      const u = Math.max(o['w']!, o['l']!), e = Math.min(o['w']!, o['l']!);
      if (sigar(o['t']!, C) && sigar(u, L) && sigar(e, B)) hacim = o['t']! * L * B;
    } else {
      const s = [o['a']!, o['b']!, o['h']!].sort((x, y) => y - x);
      kesim = null;
      if (sigar(s[0]!, L) && sigar(s[1]!, B) && sigar(s[2]!, C)) hacim = s[0]! * s[1]! * s[2]!;
    }
    if (hacim === null) continue;
    const onceki = enIyi.get(form);
    if (onceki !== undefined && onceki.hamHacimMm3 <= hacim) continue;
    enIyi.set(form, {
      malzemeNo: aday.malzemeNo, kod: aday.kod, ad: aday.ad, kalite: aday.kalite, form, olcu: o,
      kesimBoyuMm: kesim === null ? null : yuvarla(kesim), hamHacimMm3: yuvarla(hacim),
    });
  }
  return [...enIyi.values()].sort((x, y) => x.hamHacimMm3 - y.hamHacimMm3);
}
