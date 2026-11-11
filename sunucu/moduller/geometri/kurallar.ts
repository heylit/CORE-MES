// Geometri kuralları: saf hesap, veritabanı ve saat yok. Ölçüler mm.

import { GEOMETRI_YUZ_TURLERI, HAM_STOK_FORMLARI } from '#paylasilan/sozlesme/geometri.ts';
import type { GeometriDelikDibi, GeometriOzellikTuru } from '#paylasilan/sozlesme/geometri.ts';

// Güvenilmeyen girdi sınırları (VARSAYIM, kart 1441; geri alma ucuz).
export const DOSYA_EN_BUYUK_BAYT = 200 * 1024 * 1024;
export const IS_SURE_SINIRI_MS = 120_000;
export const SUREC_BELLEK_ESIGI_BAYT = 2 * 1024 * 1024 * 1024;
export const EN_COK_DENEME = 3;
export const HATA_METNI_EN_UZUN = 500;
export const TUR_BASINA_EN_COK_IS = 5;
export const MOTOR = 'occt-import-js@0.0.23';
// Kesin yüz türü (1923 b, 1983 a): ölçüler üçgen ağından kalır, yüz türü ve parametreleri B-rep'ten okunur.
export const YUZ_MOTORU = 'libcascade@3.1.0';
// Bu sayıdan çok yüzlü modelde yüz listesi yazılmaz (VARSAYIM, kart 1984; geri alma ucuz): tablo ve yanıt büyüklüğü sınırlı kalır.
export const YUZ_EN_COK = 20_000;

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

export const YUZ_TURLERI = GEOMETRI_YUZ_TURLERI;
export type YuzTuru = (typeof YUZ_TURLERI)[number];

const GEOM_ABS: Readonly<Record<string, YuzTuru>> = {
  GeomAbs_Plane: 'duzlem', GeomAbs_Cylinder: 'silindir', GeomAbs_Cone: 'koni', GeomAbs_Sphere: 'kure', GeomAbs_Torus: 'torus',
  GeomAbs_BezierSurface: 'bezier', GeomAbs_BSplineSurface: 'bspline', GeomAbs_SurfaceOfRevolution: 'donel',
  GeomAbs_SurfaceOfExtrusion: 'ekstruzyon', GeomAbs_OffsetSurface: 'ofset',
};
export function yuzTuru(geomAbs: string): YuzTuru {
  return GEOM_ABS[geomAbs] ?? 'diger';
}

// B-rep yüzü. ters: yüz yönü yüzeyin doğal normalinin tersi (delik ile mil ayrımı bunu ister). yaricap: silindir ve küre yarıçapı, koninin
// eksen konumundaki yarıçapı, torusun büyük yarıçapı; ikinciYaricap yalnız torusun küçük yarıçapı; yariAci koninin yarı açısı (derece).
// eksen ve konum silindir, koni ve torusta eksen yönü ve eksen üstündeki nokta, kürede konum merkezdir. Türün taşımadığı alan null'dır.
export interface Yuz {
  tur: YuzTuru;
  ters: boolean;
  alanMm2: number;
  yaricapMm: number | null;
  ikinciYaricapMm: number | null;
  yariAciDerece: number | null;
  eksen: [number, number, number] | null;
  konum: [number, number, number] | null;
}

export function yuzSayilari(yuzler: readonly Yuz[]): Partial<Record<YuzTuru, number>> {
  const s: Partial<Record<YuzTuru, number>> = {};
  for (const y of yuzler) s[y.tur] = (s[y.tur] ?? 0) + 1;
  return s;
}

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

// Ağ kapalıysa her kenarı çift sayıda üçgen paylaşır. Konum aynı olan köşeler birleştirilir (OCCT yüz başına köşe çoğaltır). Çoğu kenar
// iki üçgendedir; matkap ucunun tepesi gibi birden çok yüzün bir noktada buluştuğu yerde aynı kenar dört üçgende olur ve katı yine
// kapalıdır. Tek sayıda üçgende kalan kenar açık sınırdır.
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
  for (const n of sayac.values()) if (n % 2 !== 0) return false;
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

export interface StokAdayi {
  malzemeNo: number; kod: string; ad: string | null; kalite: string | null; form: string; olcu: Readonly<Record<string, unknown>>;
  aile?: string | null; kaliteKodu?: string | null; yogunluk?: number | null;
}
export interface StokOnerisi {
  malzemeNo: number; kod: string; ad: string | null; kalite: string | null; form: StokFormu; olcu: Record<string, number>;
  // 1480: kalite yoğunluğu (g/cm³) sunucunun bildiği yerden; null ise ekran aile ve kalite koduyla Malzemeler tablosundan bulur.
  aile: string | null; kaliteKodu: string | null; yogunluk: number | null;
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
      aile: aday.aile ?? null, kaliteKodu: aday.kaliteKodu ?? null, yogunluk: aday.yogunluk ?? null,
      kesimBoyuMm: kesim === null ? null : yuvarla(kesim), hamHacimMm3: yuvarla(hacim),
    });
  }
  return [...enIyi.values()].sort((x, y) => x.hamHacimMm3 - y.hamHacimMm3);
}

// ---- Özellik tanıma (kart 2044; 1923 b) ----
// Girdi kesin B-rep yüzleri ve yüz komşuluğudur (hesap süreci libcascade ile çıkarır); kural saf hesaptır. Sonuç yalnız öneridir
// (1704 a ilkesi): rotaya, karta ya da Kalite Merkezi'ne kendiliğinden yazılmaz.

// yan: yüzün dış normali (malzemeden dışarı) eğrilik merkezine mi bakıyor ('ic': delik, iç köşe radyüsü) yoksa ondan uzağa mı ('dis':
// mil, dış kenar radyüsü). Düzlemde null. normal yalnız düzlemde (dış normal). u ve v yüzün parametre aralığıdır: silindirde u açı
// (radyan), v eksen boyunca mm; konide u açı, v doğru boyunca mm.
export interface TanimaYuzu {
  yuz: Yuz;
  yan: 'ic' | 'dis' | null;
  normal: [number, number, number] | null;
  u: [number, number] | null;
  v: [number, number] | null;
}
export type KenarTuru = 'icbukey' | 'disbukey' | 'teget' | 'diger';
// a ve b yüzlerin dizideki yeri (0'dan). Aynı yüzün dikiş kenarı ve ikiden çok yüzlü kenar girdiye alınmaz.
export interface YuzKenari { a: number; b: number; tur: KenarTuru; uzunlukMm: number }

export interface Ozellik {
  tur: GeometriOzellikTuru;
  // Bağlı olduğu deliğin sonuç dizisindeki yeri (0'dan); kademe ve havşada dolu.
  ust: number | null;
  capMm: number | null;
  yaricapMm: number | null;
  derinlikMm: number | null;
  aciDerece: number | null;
  genislikMm: number | null;
  boyMm: number | null;
  gecis: boolean | null;
  dip: GeometriDelikDibi | null;
  ic: boolean | null;
  eksen: [number, number, number] | null;
  konum: [number, number, number] | null;
  // Yüzlerin analizdeki sıra numaraları (1'den).
  yuzler: number[];
}

// Tolerans (VARSAYIM, kart 2044; geri alma ucuz): uzunluk 0,01 mm, eksen yönü 1e-6, tam tur %99.
const UZ_TOL = 0.01;
const YON_TOL = 1e-6;
const TAM_TUR = 2 * Math.PI * 0.99;
// Pah: yüz iki komşusuna 10-80 derece eğik ve iki komşunun arasındaki açıyı böler (2 derece).
const PAH_EN_AZ = 10, PAH_EN_COK = 80, PAH_ACI_TOL = 2;

const derece = (r: number): number => (r * 180) / Math.PI;
const aciArasi = (a: V3, b: V3): number => derece(Math.acos(Math.max(-1, Math.min(1, ic(birim(a), birim(b))))));

// Eksen doğrusu: yön işaretten bağımsız (ilk sıfır olmayan bileşen artı), konum doğrunun orijine en yakın noktası.
interface Dogru { yon: V3; nokta: V3 }
function dogru(eksen: V3, konum: V3): Dogru {
  let y = birim(eksen);
  const ilk = Math.abs(y[0]) > YON_TOL ? y[0] : Math.abs(y[1]) > YON_TOL ? y[1] : y[2];
  if (ilk < 0) y = [-y[0], -y[1], -y[2]];
  const t = ic(konum, y);
  return { yon: y, nokta: [konum[0] - t * y[0], konum[1] - t * y[1], konum[2] - t * y[2]] };
}
const ayniDogru = (a: Dogru, b: Dogru): boolean =>
  Math.abs(ic(a.yon, b.yon)) > 1 - YON_TOL && Math.hypot(...cikar(a.nokta, b.nokta)) < UZ_TOL;
const eksenNoktasi = (d: Dogru, t: number): V3 => [d.nokta[0] + t * d.yon[0], d.nokta[1] + t * d.yon[1], d.nokta[2] + t * d.yon[2]];

// Silindir ya da koninin eksen doğrusu üzerindeki aralığı: t0 < t1, r0 ve r1 o uçlardaki yarıçap.
interface Parca { dogru: Dogru; tur: 'silindir' | 'koni'; t0: number; t1: number; r0: number; r1: number; yariAci: number | null; yuzler: number[]; kapsam: number }

function parca(y: TanimaYuzu, i: number): Parca | null {
  const z = y.yuz;
  if ((z.tur !== 'silindir' && z.tur !== 'koni') || z.eksen === null || z.konum === null || z.yaricapMm === null || y.u === null || y.v === null) return null;
  const d = dogru(z.eksen, z.konum);
  const isaret = ic(birim(z.eksen), d.yon) < 0 ? -1 : 1;
  const taban = ic(z.konum, d.yon);
  const kapsam = Math.min(2 * Math.PI, y.u[1] - y.u[0]);
  let uclar: [number, number][];
  if (z.tur === 'silindir') {
    uclar = y.v.map((v) => [taban + isaret * v, z.yaricapMm!] as [number, number]);
  } else {
    const a = ((z.yariAciDerece ?? 0) * Math.PI) / 180;
    uclar = y.v.map((v) => [taban + isaret * v * Math.cos(a), Math.max(0, z.yaricapMm! + v * Math.sin(a))] as [number, number]);
  }
  uclar.sort((p, q) => p[0] - q[0]);
  const [u0, u1] = uclar as [[number, number], [number, number]];
  return { dogru: d, tur: z.tur, t0: u0[0], t1: u1[0], r0: u0[1], r1: u1[1], yariAci: z.tur === 'koni' ? Math.abs(z.yariAciDerece ?? 0) : null, yuzler: [i], kapsam };
}

// Aynı yüzeyin parçaları (dikişle ikiye bölünmüş silindir, iki yarım koni) tek parça olur; kapsam toplanır.
function parcalariBirlestir(liste: readonly Parca[]): Parca[] {
  const sonuc: Parca[] = [];
  const ayni = (a: number, b: number): boolean => Math.abs(a - b) < UZ_TOL;
  for (const p of liste) {
    const es = sonuc.find((q) => q.tur === p.tur && ayniDogru(q.dogru, p.dogru) && ayni(q.t0, p.t0) && ayni(q.t1, p.t1) && ayni(q.r0, p.r0) && ayni(q.r1, p.r1));
    if (es === undefined) sonuc.push({ ...p, yuzler: [...p.yuzler] });
    else { es.yuzler.push(...p.yuzler); es.kapsam = Math.min(2 * Math.PI, es.kapsam + p.kapsam); }
  }
  return sonuc;
}

const r4 = (x: number): number => yuvarla(x, 4) + 0;
const v4 = (v: V3): [number, number, number] => [r4(v[0]), r4(v[1]), r4(v[2])];
const v8 = (v: V3): [number, number, number] => [yuvarla(v[0], 8) + 0, yuvarla(v[1], 8) + 0, yuvarla(v[2], 8) + 0];
const bos = (tur: GeometriOzellikTuru, yuzler: number[]): Ozellik => ({
  tur, ust: null, capMm: null, yaricapMm: null, derinlikMm: null, aciDerece: null, genislikMm: null, boyMm: null,
  gecis: null, dip: null, ic: null, eksen: null, konum: null, yuzler,
});

export function ozellikleriTani(yuzler: readonly TanimaYuzu[], kenarlar: readonly YuzKenari[]): Ozellik[] {
  const komsu: { diger: number; tur: KenarTuru; uzunlukMm: number }[][] = yuzler.map(() => []);
  for (const k of kenarlar) {
    if (k.a === k.b || komsu[k.a] === undefined || komsu[k.b] === undefined) continue;
    komsu[k.a]!.push({ diger: k.b, tur: k.tur, uzunlukMm: k.uzunlukMm });
    komsu[k.b]!.push({ diger: k.a, tur: k.tur, uzunlukMm: k.uzunlukMm });
  }
  const sonuc: Ozellik[] = [];
  const kullanilan = new Set<number>();

  // Delik: içe bakan, tam tur silindir ve koni parçaları aynı eksen doğrusunda sıralanır. Değen parçalar (kademe ve havşa basamağı
  // eksen boyunca sıfır kalınlıktadır) ve aynı yarıçaplı iki silindir arasındaki boşluk (çapraz delikle kesilen delik) tek deliktir.
  const icParcalar = parcalariBirlestir(yuzler.flatMap((y, i) => (y.yan === 'ic' ? [parca(y, i)].filter((p): p is Parca => p !== null) : [])))
    .filter((p) => p.kapsam >= TAM_TUR);
  const dogrular: Parca[][] = [];
  for (const p of icParcalar) {
    const g = dogrular.find((x) => ayniDogru(x[0]!.dogru, p.dogru));
    if (g === undefined) dogrular.push([p]); else g.push(p);
  }
  for (const grup of dogrular) {
    grup.sort((a, b) => a.t0 - b.t0 || a.t1 - b.t1);
    const zincirler: Parca[][] = [];
    for (const p of grup) {
      const z = zincirler[zincirler.length - 1];
      const son = z?.[z.length - 1];
      const deger = son !== undefined && p.t0 <= Math.max(...z!.map((x) => x.t1)) + UZ_TOL;
      const kopru = son !== undefined && son.tur === 'silindir' && p.tur === 'silindir' && Math.abs(son.r0 - p.r0) < UZ_TOL;
      if (z !== undefined && (deger || kopru)) z.push(p); else zincirler.push([p]);
    }
    for (const z of zincirler) deligiYaz(z);
  }

  function dipBul(z: Parca[], alt: boolean): { dip: GeometriDelikDibi; yuz: number | null; aci: number | null; t: number } | null {
    const uc = alt ? z[0]! : z[z.length - 1]!;
    const t = alt ? Math.min(...z.map((p) => p.t0)) : Math.max(...z.map((p) => p.t1));
    // Matkap ucu: uçtaki koni dışa doğru daralır ve zincir dışında komşusu yoktur (tepe noktası yüz sınırı değildir).
    const daralir = alt ? uc.r0 < uc.r1 - UZ_TOL : uc.r1 < uc.r0 - UZ_TOL;
    const zincirde = new Set(z.flatMap((p) => p.yuzler));
    if (uc.tur === 'koni' && daralir && uc.yuzler.every((i) => komsu[i]!.every((k) => zincirde.has(k.diger)))) {
      return { dip: 'matkap', yuz: null, aci: r4(2 * (uc.yariAci ?? 0)), t: alt ? uc.t1 : uc.t0 };
    }
    for (const i of uc.yuzler) for (const k of komsu[i]!) {
      const d = yuzler[k.diger]!;
      if (k.tur !== 'icbukey' || d.yuz.tur !== 'duzlem' || d.normal === null || d.yuz.konum === null) continue;
      if (Math.abs(ic(birim(d.normal), uc.dogru.yon)) < 1 - YON_TOL) continue;
      if (Math.abs(ic(d.yuz.konum, uc.dogru.yon) - t) < UZ_TOL) return { dip: 'duz', yuz: k.diger, aci: null, t };
    }
    return null;
  }

  function deligiYaz(z: Parca[]): void {
    const silindirler = z.filter((p) => p.tur === 'silindir');
    if (silindirler.length === 0) return;
    const altDip = dipBul(z, true), ustDip = dipBul(z, false);
    const d = z[0]!.dogru;
    const tAlt = Math.min(...z.map((p) => p.t0)), tUst = Math.max(...z.map((p) => p.t1));
    const rEn = Math.min(...silindirler.map((p) => p.r0));
    // Giriş: kör delikte dibin karşı ucu; geçişte geniş (kademe ya da havşa) ucu, yoksa eksenin alt ucu.
    let girisAlt: boolean;
    if (altDip !== null && ustDip === null) girisAlt = false;
    else if (ustDip !== null && altDip === null) girisAlt = true;
    else girisAlt = !((z[z.length - 1]!.r1) > (z[0]!.r0) + UZ_TOL);
    const tGiris = girisAlt ? tAlt : tUst;
    const dip = girisAlt ? ustDip : altDip;
    const tSon = dip?.t ?? (girisAlt ? tUst : tAlt);
    const yon: V3 = girisAlt ? d.yon : [-d.yon[0], -d.yon[1], -d.yon[2]];
    const tum = z.flatMap((p) => p.yuzler);
    if (dip !== null && dip.yuz !== null) tum.push(dip.yuz);
    for (const i of tum) kullanilan.add(i);
    const delikYeri = sonuc.length;
    sonuc.push({
      ...bos('delik', [...new Set(tum)].sort((a, b) => a - b).map((i) => i + 1)),
      capMm: r4(2 * rEn), derinlikMm: r4(Math.abs(tSon - tGiris)), gecis: altDip === null && ustDip === null,
      dip: dip?.dip ?? null, aciDerece: dip?.aci ?? null, eksen: v8(yon), konum: v4(eksenNoktasi(d, tGiris)),
    });
    const ucIc = dip?.dip === 'matkap' ? (girisAlt ? z[z.length - 1] : z[0]) : undefined;
    for (const p of z) {
      if (p.tur === 'silindir' && p.r0 > rEn + UZ_TOL) {
        sonuc.push({ ...bos('kademe', p.yuzler.map((i) => i + 1)), ust: delikYeri, capMm: r4(2 * p.r0), derinlikMm: r4(p.t1 - p.t0) });
      } else if (p.tur === 'koni' && p !== ucIc) {
        sonuc.push({
          ...bos('havsa', p.yuzler.map((i) => i + 1)), ust: delikYeri, capMm: r4(2 * Math.max(p.r0, p.r1)),
          aciDerece: r4(2 * (p.yariAci ?? 0)), derinlikMm: r4(p.t1 - p.t0),
        });
      }
    }
  }

  // Radyüs: deliğe girmemiş silindir, torus ya da küre yüzü, iki ayrı komşusuna teğet geçiyor. Torusta yarıçap küçük yarıçaptır.
  yuzler.forEach((y, i) => {
    if (kullanilan.has(i)) return;
    const z = y.yuz;
    if (z.tur !== 'silindir' && z.tur !== 'torus' && z.tur !== 'kure') return;
    const tegetler = new Set(komsu[i]!.filter((k) => k.tur === 'teget').map((k) => k.diger));
    if (tegetler.size < 2) return;
    const yaricap = z.tur === 'torus' ? z.ikinciYaricapMm : z.yaricapMm;
    if (yaricap === null) return;
    const p = z.tur === 'silindir' ? parca(y, i) : null;
    kullanilan.add(i);
    sonuc.push({
      ...bos('radyus', [i + 1]), yaricapMm: r4(yaricap), ic: y.yan === null ? null : y.yan === 'ic',
      boyMm: p === null ? null : r4(p.t1 - p.t0), eksen: z.eksen === null ? null : v8(birim(z.eksen)), konum: z.konum === null ? null : v4(z.konum),
    });
  });

  // Pah: (1) düzlem yüz, en uzun iki kenarı dışbükey ve iki ayrı düzlem komşuya; yüz ikisine de 10-80 derece eğik ve aradaki açıyı
  // böler. Genişlik alan / en uzun kenar (dikdörtgen pah yüzünde kesin). Açı büyük komşuya göredir.
  // (2) Dışa bakan tam tur koni, dışbükey kenarla aynı eksenli dışa bakan silindire bağlı (mil ucu pahı). Açı koninin yarı açısıdır.
  yuzler.forEach((y, i) => {
    if (kullanilan.has(i)) return;
    const z = y.yuz;
    if (z.tur === 'duzlem' && y.normal !== null) {
      const kenar = [...komsu[i]!].sort((a, b) => b.uzunlukMm - a.uzunlukMm);
      const [e1, e2] = kenar;
      if (e1 === undefined || e2 === undefined || e1.diger === e2.diger || e1.tur !== 'disbukey' || e2.tur !== 'disbukey') return;
      const A = yuzler[e1.diger]!, B = yuzler[e2.diger]!;
      if (A.yuz.tur !== 'duzlem' || B.yuz.tur !== 'duzlem' || A.normal === null || B.normal === null) return;
      const ta = aciArasi(y.normal, A.normal), tb = aciArasi(y.normal, B.normal), tab = aciArasi(A.normal, B.normal);
      if (ta < PAH_EN_AZ || ta > PAH_EN_COK || tb < PAH_EN_AZ || tb > PAH_EN_COK || Math.abs(ta + tb - tab) > PAH_ACI_TOL) return;
      const boy = Math.max(e1.uzunlukMm, e2.uzunlukMm);
      if (boy <= 0) return;
      const genislik = z.alanMm2 / boy;
      if (genislik >= boy) return;
      kullanilan.add(i);
      sonuc.push({ ...bos('pah', [i + 1]), genislikMm: r4(genislik), boyMm: r4(boy), aciDerece: r4(A.yuz.alanMm2 >= B.yuz.alanMm2 ? ta : tb) });
      return;
    }
    if (z.tur === 'koni' && y.yan === 'dis') {
      const p = parca(y, i);
      if (p === null) return;
      const birlesik = parcalariBirlestir(yuzler.flatMap((x, j) => (x.yan === 'dis' && x.yuz.tur === 'koni' ? [parca(x, j)].filter((q): q is Parca => q !== null) : [])))
        .find((q) => q.yuzler.includes(i));
      if (birlesik === undefined || birlesik.kapsam < TAM_TUR) return;
      const milde = birlesik.yuzler.some((j) => komsu[j]!.some((k) => {
        if (k.tur !== 'disbukey') return false;
        const q = parca(yuzler[k.diger]!, k.diger);
        return q !== null && q.tur === 'silindir' && yuzler[k.diger]!.yan === 'dis' && ayniDogru(q.dogru, p.dogru);
      }));
      if (!milde) return;
      for (const j of birlesik.yuzler) kullanilan.add(j);
      const a = ((p.yariAci ?? 0) * Math.PI) / 180;
      sonuc.push({
        ...bos('pah', birlesik.yuzler.map((j) => j + 1).sort((x, w) => x - w)), capMm: r4(2 * Math.max(p.r0, p.r1)),
        genislikMm: r4((p.t1 - p.t0) / Math.cos(a)), aciDerece: r4(p.yariAci ?? 0), eksen: v8(p.dogru.yon),
        konum: v4(eksenNoktasi(p.dogru, p.t0)),
      });
    }
  });
  return sonuc;
}

// Montaj ağacı (kart 2109, M1). occt-import-js çıktısı: düğümler montajdır, parçalar düğümün ağlarıdır (`meshes`); ağ konumları dünya
// koordinatındadır (montaj yerleşimi uygulanmış). Alt düğümü olmayan ve tek ağlı düğüm parçanın kendisidir (bazı yazıcılar parçayı
// düğüm yapar, ağa genel ad verir). Ölçüler yalnız öneridir (2101-2 b): gerçek montaj dosyasıyla denenmedi.
export const MONTAJ_DUGUM_EN_COK = 20_000;
export const MONTAJ_AD_EN_UZUN = 200;

export interface OcctDugumu { name?: unknown; meshes?: unknown; children?: unknown }
export interface AdliAg extends UcgenAgi { ad: string | null }
export type MontajDugumTuru = 'montaj' | 'parca';

// sira 1'den, ön sıralı (üst her zaman alttan önce); ust üstün sırası, kökte null. Parçada obb, hacim, alan ve kapalı dolu; montajda
// null. kutuEn ve kutuUst dünya koordinatında eksenlere hizalı kutu; montajda altındaki parçaların kapsayanı, parçası yoksa null.
export interface MontajDugumu {
  sira: number;
  ust: number | null;
  tur: MontajDugumTuru;
  ad: string | null;
  kutuEn: V3 | null;
  kutuUst: V3 | null;
  obb: { a: number; b: number; c: number } | null;
  hacimMm3: number | null;
  alanMm2: number | null;
  kapali: boolean | null;
}

export function montajAdi(ad: unknown): string | null {
  if (typeof ad !== 'string') return null;
  const t = ad.trim().slice(0, MONTAJ_AD_EN_UZUN);
  return t === '' ? null : t;
}

const agIndeksleri = (d: OcctDugumu): number[] =>
  (Array.isArray(d.meshes) ? d.meshes : []).filter((i): i is number => Number.isInteger(i) && (i as number) >= 0);
const altDugumler = (d: OcctDugumu): OcctDugumu[] =>
  (Array.isArray(d.children) ? d.children : []).filter((c): c is OcctDugumu => typeof c === 'object' && c !== null);

function agSiniri(ag: UcgenAgi): { en: V3; ust: V3 } {
  const en: V3 = [Infinity, Infinity, Infinity], ust: V3 = [-Infinity, -Infinity, -Infinity];
  const k = ag.konum;
  for (let i = 0; i + 2 < k.length; i += 3) for (let e = 0; e < 3; e++) {
    const d = k[i + e] as number;
    if (d < en[e]!) en[e] = d;
    if (d > ust[e]!) ust[e] = d;
  }
  return { en: en.map((x) => yuvarla(x) + 0) as V3, ust: ust.map((x) => yuvarla(x) + 0) as V3 };
}

// Ağdan parça düğümü; katısı olmayan (boş) ağ parça sayılmaz.
function parcaDugumu(ag: AdliAg | undefined, ad: string | null, ust: number | null): Omit<MontajDugumu, 'sira'> | null {
  if (ag === undefined) return null;
  const o = agOlcumu([ag]);
  if (o === null) return null;
  const s = agSiniri(ag);
  return {
    ust, tur: 'parca', ad: ad ?? ag.ad, kutuEn: s.en, kutuUst: s.ust,
    obb: { a: o.obb.a, b: o.obb.b, c: o.obb.c }, hacimMm3: o.hacimMm3, alanMm2: o.alanMm2, kapali: o.kapali,
  };
}

// Kökün adsız tek sarmalayıcısı (dosya kökü) atlanır. Düğüm sınırını aşan ya da parçasız model null verir. Yığınla gezilir: güvenilmeyen
// dosyada derin iç içe yapı çağrı yığınını taşırmaz.
export function montajAgaci(kok: OcctDugumu, aglar: readonly AdliAg[]): MontajDugumu[] | null {
  let bas = kok;
  while (montajAdi(bas.name) === null && agIndeksleri(bas).length === 0 && altDugumler(bas).length === 1) bas = altDugumler(bas)[0]!;
  const dugumler: MontajDugumu[] = [];
  const ekle = (d: Omit<MontajDugumu, 'sira'>): number => {
    dugumler.push({ sira: dugumler.length + 1, ...d });
    return dugumler.length;
  };
  const yigin: { d: OcctDugumu; ust: number | null }[] = [{ d: bas, ust: null }];
  while (yigin.length > 0) {
    const { d, ust } = yigin.pop()!;
    if (dugumler.length > MONTAJ_DUGUM_EN_COK || yigin.length > MONTAJ_DUGUM_EN_COK) return null;
    const indeksler = agIndeksleri(d), altlar = altDugumler(d);
    if (altlar.length === 0 && indeksler.length === 1) {
      const p = parcaDugumu(aglar[indeksler[0]!], montajAdi(d.name), ust);
      if (p !== null) ekle(p);
      continue;
    }
    const sira = ekle({ ust, tur: 'montaj', ad: montajAdi(d.name), kutuEn: null, kutuUst: null, obb: null, hacimMm3: null, alanMm2: null, kapali: null });
    for (const i of indeksler) {
      const p = parcaDugumu(aglar[i], null, sira);
      if (p !== null) ekle(p);
    }
    for (let i = altlar.length - 1; i >= 0; i--) yigin.push({ d: altlar[i]!, ust: sira });
  }
  if (dugumler.length > MONTAJ_DUGUM_EN_COK || !dugumler.some((d) => d.tur === 'parca')) return null;
  // Montaj kutusu: ön sırada alt her zaman üstten sonra gelir; sondan başa gezmek her üste altlarının kutusunu taşır.
  for (let i = dugumler.length - 1; i >= 0; i--) {
    const d = dugumler[i]!;
    if (d.ust === null || d.kutuEn === null || d.kutuUst === null) continue;
    const u = dugumler[d.ust - 1]!;
    u.kutuEn = u.kutuEn === null ? [...d.kutuEn] : (u.kutuEn.map((x, e) => Math.min(x, d.kutuEn![e]!)) as V3);
    u.kutuUst = u.kutuUst === null ? [...d.kutuUst] : (u.kutuUst.map((x, e) => Math.max(x, d.kutuUst![e]!)) as V3);
  }
  return dugumler;
}

// Bileşen listesi: aynı ad ve aynı ölçüdeki (döndürülmüş kutu ve hacim, 0,01 mm ve 1 mm3 duyarlıkla) parçalar tek satırda toplanır;
// yerleşim yönü sonucu değiştirmez. Sıra ilk görünüşe göre. dugumler: o bileşenin parça düğümlerinin sıraları.
export interface MontajBileseni {
  sira: number;
  ad: string | null;
  adet: number;
  obb: { a: number; b: number; c: number };
  hacimMm3: number | null;
  alanMm2: number;
  kapali: boolean;
  dugumler: number[];
}

export function bilesenListesi(dugumler: readonly MontajDugumu[]): MontajBileseni[] {
  const gruplar = new Map<string, MontajBileseni>();
  for (const d of dugumler) {
    if (d.tur !== 'parca' || d.obb === null) continue;
    const anahtar = JSON.stringify([d.ad, Math.round(d.obb.a * 100), Math.round(d.obb.b * 100), Math.round(d.obb.c * 100), d.hacimMm3 === null ? null : Math.round(d.hacimMm3)]);
    const g = gruplar.get(anahtar);
    if (g !== undefined) {
      g.adet++;
      g.dugumler.push(d.sira);
      continue;
    }
    gruplar.set(anahtar, {
      sira: gruplar.size + 1, ad: d.ad, adet: 1, obb: { ...d.obb }, hacimMm3: d.hacimMm3, alanMm2: d.alanMm2 ?? 0, kapali: d.kapali ?? false, dugumler: [d.sira],
    });
  }
  return [...gruplar.values()];
}

// Dosya sağlık raporu (kart 2143, 2140-1 a). Ölçüm B-rep okumasında, okuyucunun kendi onarımından sonra yapılır: onarımın kapattığı
// kusur görünmez, onarılamayan kalır. Onarımın yüzeyi kaydırarak kapattığı boşluk kenar toleransını büyütür (ölçülen: 5 mm kaymış yüzde
// tolerans 5 mm); bu yüzden tolerans da bulgudur.
export interface SaglikOlcumu {
  acikKenarSayisi: number;
  acikSinirSayisi: number;
  gecersizYuzSayisi: number;
  sekilGecerli: boolean;
  enBuyukToleransMm: number;
  kucukKenarSayisi: number;
  dosyaBirimi: string | null;
}

// Sınırlar (VARSAYIM, kart 2143; geri alma ucuz). Kenar 0,01 mm'den kısaysa ağ ve ölçü hesabını bozar; tolerans 0,01 mm'yi aşarsa ölçü o
// kadar belirsizdir, 0,1 mm'yi aşarsa CNC ölçüsü için güvenilmez. Parçanın en uzun kenarı 1 mm'den kısa ya da 10 m'den uzunsa birim
// büyük olasılıkla yanlıştır (inç dosya mm diye yazılmış ya da tersi). Serbest kenar dikişi 0,001 mm içinde aranır.
export const KUCUK_KENAR_MM = 0.01;
export const TOLERANS_DIKKAT_MM = 0.01;
export const TOLERANS_GUVENME_MM = 0.1;
export const OLCU_EN_AZ_MM = 1;
export const OLCU_EN_COK_MM = 10_000;
export const SERBEST_KENAR_DIKIS_MM = 0.001;
export const BIRIM_EN_UZUN = 40;

const MM_ADLARI = new Set(['millimetre', 'millimeter', 'mm']);

export type SaglikDurumu = 'iyi' | 'dikkat' | 'guvenme';
export type SaglikBulguKodu =
  | 'acik-kenar' | 'gecersiz-yuz' | 'gecersiz-sekil' | 'acik-ag' | 'buyuk-tolerans' | 'tolerans' | 'kucuk-kenar' | 'birim-mm-degil'
  | 'olcu-cok-kucuk' | 'olcu-cok-buyuk';
export interface SaglikBulgusu { kod: SaglikBulguKodu; durum: Exclude<SaglikDurumu, 'iyi'>; metin: string }

const sayi = (x: number): string => x.toLocaleString('tr-TR', { maximumFractionDigits: 4 });

// Bulgular ve genel durum. kapali ağ ölçümünden (occt-import-js), enBuyukOlcuMm döndürülmüş kutunun en uzun kenarıdır; ikisi de
// analizden gelir. Herhangi bir "guvenme" bulgusu genel durumu "guvenme", yalnız "dikkat" bulgusu "dikkat" yapar.
export function saglikDegerlendir(
  o: SaglikOlcumu, analiz: { kapali: boolean; enBuyukOlcuMm: number } | null,
): { durum: SaglikDurumu; bulgular: SaglikBulgusu[] } {
  const b: SaglikBulgusu[] = [];
  if (o.acikKenarSayisi > 0) {
    b.push({ kod: 'acik-kenar', durum: 'guvenme', metin: `${String(o.acikKenarSayisi)} açık kenar (${String(o.acikSinirSayisi)} açık sınır): model kapalı değil, hacim ve ağırlık güvenilmez.` });
  }
  if (o.gecersizYuzSayisi > 0) {
    b.push({ kod: 'gecersiz-yuz', durum: 'guvenme', metin: `${String(o.gecersizYuzSayisi)} geçersiz yüz: bu yüzlerdeki delik ve ölçü önerilerine güvenme.` });
  } else if (!o.sekilGecerli) {
    b.push({ kod: 'gecersiz-sekil', durum: 'guvenme', metin: 'Şekil geçerlilik denetiminden geçmedi (yüzler tek tek geçerli, aralarındaki bağ bozuk).' });
  }
  if (analiz !== null && !analiz.kapali && o.acikKenarSayisi === 0) {
    b.push({ kod: 'acik-ag', durum: 'guvenme', metin: 'Üçgen ağı kapanmadı: hacim hesaplanamadı.' });
  }
  if (o.enBuyukToleransMm > TOLERANS_GUVENME_MM) {
    b.push({ kod: 'buyuk-tolerans', durum: 'guvenme', metin: `En büyük kenar toleransı ${sayi(o.enBuyukToleransMm)} mm: yüzler arasında boşluk ya da kayma var, ölçüler bu kadar belirsiz.` });
  } else if (o.enBuyukToleransMm > TOLERANS_DIKKAT_MM) {
    b.push({ kod: 'tolerans', durum: 'dikkat', metin: `En büyük kenar toleransı ${sayi(o.enBuyukToleransMm)} mm: ince ölçülerde dikkat.` });
  }
  if (o.kucukKenarSayisi > 0) {
    b.push({ kod: 'kucuk-kenar', durum: 'dikkat', metin: `${String(o.kucukKenarSayisi)} kenar ${sayi(KUCUK_KENAR_MM)} mm'den kısa.` });
  }
  if (o.dosyaBirimi !== null && !MM_ADLARI.has(o.dosyaBirimi.toLowerCase())) {
    b.push({ kod: 'birim-mm-degil', durum: 'dikkat', metin: `Dosya birimi ${o.dosyaBirimi}; ölçüler mm'ye çevrildi, ilk parçada denetle.` });
  }
  if (analiz !== null && analiz.enBuyukOlcuMm < OLCU_EN_AZ_MM) {
    b.push({ kod: 'olcu-cok-kucuk', durum: 'dikkat', metin: `En uzun ölçü ${sayi(analiz.enBuyukOlcuMm)} mm: birim yanlış olabilir.` });
  } else if (analiz !== null && analiz.enBuyukOlcuMm > OLCU_EN_COK_MM) {
    b.push({ kod: 'olcu-cok-buyuk', durum: 'dikkat', metin: `En uzun ölçü ${sayi(analiz.enBuyukOlcuMm)} mm: birim yanlış olabilir.` });
  }
  const durum: SaglikDurumu = b.some((x) => x.durum === 'guvenme') ? 'guvenme' : b.length > 0 ? 'dikkat' : 'iyi';
  return { durum, bulgular: b };
}

// Dosyadaki birim adı: boşluk kırpılır, 40 karakteri aşan ya da boş ad null (güvenilmeyen girdi).
export function birimAdi(ad: unknown): string | null {
  if (typeof ad !== 'string') return null;
  const t = ad.trim();
  return t === '' || t.length > BIRIM_EN_UZUN ? null : t;
}

// IGES global bölümünün (sütun 73 'G') 14. alanı birim bayrağıdır; 3 ise 15. alandaki ad geçerlidir. Alan ayıracı 1., kayıt ayıracı 2.
// alandadır (boşsa ',' ve ';'). Metin Hollerith biçimindedir (nHxxx). Okunamazsa null.
const IGES_BIRIMLERI: Readonly<Record<number, string>> = {
  1: 'INCH', 2: 'MM', 4: 'FT', 5: 'MI', 6: 'M', 7: 'KM', 8: 'MIL', 9: 'UM', 10: 'CM', 11: 'UIN',
};
const IGES_GLOBAL_EN_COK_SATIR = 200;
export function igesBirimi(veri: Uint8Array): string | null {
  const metin = new TextDecoder('latin1').decode(veri.subarray(0, 82 * (IGES_GLOBAL_EN_COK_SATIR + 100)));
  const g = metin.split(/\r?\n/).filter((s) => s.length >= 73 && s[72] === 'G').slice(0, IGES_GLOBAL_EN_COK_SATIR).map((s) => s.slice(0, 72)).join('');
  if (g === '') return null;
  let i = 0;
  const ayirac = (): string | null => {
    if (g.startsWith('1H', i)) { const c = g[i + 2]; i += 3; return c ?? null; }
    return null;
  };
  const p = ayirac() ?? ',';
  if (g[i] === p) i++;
  const k = ayirac() ?? ';';
  const alanlar: string[] = [p, k];
  if (g[i] === p) i++;
  while (i < g.length && alanlar.length < 15) {
    const h = /^(\d+)H/.exec(g.slice(i, i + 12));
    let deger: string;
    if (h !== null) {
      const n = Number(h[1]);
      deger = g.slice(i + h[0].length, i + h[0].length + n);
      i += h[0].length + n;
      while (i < g.length && g[i] !== p && g[i] !== k) i++;
    } else {
      const j0 = i;
      while (i < g.length && g[i] !== p && g[i] !== k) i++;
      deger = g.slice(j0, i).trim();
    }
    alanlar.push(deger);
    if (g[i] === k) break;
    i++;
  }
  const bayrak = Number(alanlar[13]);
  if (bayrak === 3) return birimAdi(alanlar[14]);
  return IGES_BIRIMLERI[bayrak] ?? null;
}

// ---------------- Yüzey işaretleri (kart 2144) ----------------

export const YUZEY_ILETILERI = {
  analizYok: 'Model analizi bitmeden yüzey işaretlenemez.',
  yuzYok: 'Bu modelin yüzleri okunamadı; yüzey işaretlenemez.',
  yuzBilinmiyor: (sira: number): string => `${String(sira)} numaralı yüz bu modelde yok.`,
  yuzYinelendi: (sira: number): string => `${String(sira)} numaralı yüz birden çok kez işaretlendi; bir yüz tek işleme atanır.`,
  adimYok: (opNo: number): string => `OP ${String(opNo)} adımı ya da şartnamesi bugünkü rotada yüzey işlemi olarak yok.`,
} as const;

export type YuzeyIslemi = { tur: 'maske' } | { tur: 'rota'; opNo: number; sartnameId: number };

export const islemAnahtari = (i: YuzeyIslemi): string => (i.tur === 'maske' ? 'maske' : `rota:${String(i.opNo)}:${String(i.sartnameId)}`);

export interface YuzeyAlanYuzu { sira: number; alanMm2: number }
export interface YuzeyIsaretGirdisi { yuzSira: number; islem: YuzeyIslemi; oneri: boolean }

// İşlem başına toplam alan (ilk geçiş sırasıyla), işaretsiz ve toplam alan. Modelde olmayan yüzün işareti sayılmaz.
export function yuzeyAlanlari(yuzler: readonly YuzeyAlanYuzu[], isaretler: readonly YuzeyIsaretGirdisi[]): {
  alanlar: { islem: YuzeyIslemi; yuzSayisi: number; alanMm2: number; oneriVar: boolean }[];
  isaretsizMm2: number;
  toplamMm2: number;
} {
  const alan = new Map(yuzler.map((y) => [y.sira, y.alanMm2]));
  const gruplar = new Map<string, { islem: YuzeyIslemi; yuzSayisi: number; alanMm2: number; oneriVar: boolean }>();
  let isaretli = 0;
  for (const x of isaretler) {
    const a = alan.get(x.yuzSira);
    if (a === undefined) continue;
    const k = islemAnahtari(x.islem);
    const g = gruplar.get(k) ?? { islem: x.islem, yuzSayisi: 0, alanMm2: 0, oneriVar: false };
    g.yuzSayisi += 1;
    g.alanMm2 += a;
    g.oneriVar ||= x.oneri;
    gruplar.set(k, g);
    isaretli += a;
  }
  const toplamMm2 = yuzler.reduce((t, y) => t + y.alanMm2, 0);
  return { alanlar: [...gruplar.values()], isaretsizMm2: Math.max(0, toplamMm2 - isaretli), toplamMm2 };
}

// Kayıt denetimi: yüz modelde olmalı ve bir kez geçmeli; rota işaretinin adımı bugünkü rotada olmalı. Rotadan kalkmış adımın aynı yüzdeki
// kayıtlı işareti kalabilir (silinmez, uyarıyla görünür); yeni atama yapılamaz. Hata yoksa null.
export function yuzeyKaydiDenetle(
  yuzSiralari: ReadonlySet<number>, rotadaki: ReadonlySet<string>, kayitli: readonly YuzeyIsaretGirdisi[], isaretler: readonly YuzeyIsaretGirdisi[],
): string | null {
  const eski = new Map(kayitli.map((x) => [x.yuzSira, islemAnahtari(x.islem)]));
  const gorulen = new Set<number>();
  for (const x of isaretler) {
    if (!yuzSiralari.has(x.yuzSira)) return YUZEY_ILETILERI.yuzBilinmiyor(x.yuzSira);
    if (gorulen.has(x.yuzSira)) return YUZEY_ILETILERI.yuzYinelendi(x.yuzSira);
    gorulen.add(x.yuzSira);
    if (x.islem.tur === 'rota') {
      const k = islemAnahtari(x.islem);
      if (!rotadaki.has(k) && eski.get(x.yuzSira) !== k) return YUZEY_ILETILERI.adimYok(x.islem.opNo);
    }
  }
  return null;
}

export interface EslesenYuz {
  sira: number;
  tur: YuzTuru;
  ters: boolean;
  alanMm2: number;
  yaricapMm: number | null;
  eksen: readonly number[] | null;
  konum: readonly number[] | null;
}

const ESLESME_ALAN_ORANI = 1e-3;
const ESLESME_ALAN_MM2 = 0.01;
const ESLESME_UZUNLUK_MM = 0.01;
const ESLESME_YON = 1 - 1e-6;

function ayniYuzMu(a: EslesenYuz, b: EslesenYuz): boolean {
  if (a.tur !== b.tur || a.ters !== b.ters) return false;
  if (Math.abs(a.alanMm2 - b.alanMm2) > Math.max(ESLESME_ALAN_MM2, ESLESME_ALAN_ORANI * Math.max(a.alanMm2, b.alanMm2))) return false;
  if ((a.yaricapMm === null) !== (b.yaricapMm === null)) return false;
  if (a.yaricapMm !== null && b.yaricapMm !== null && Math.abs(a.yaricapMm - b.yaricapMm) > ESLESME_UZUNLUK_MM) return false;
  if (a.eksen !== null && b.eksen !== null) {
    const nokta = Math.abs(a.eksen.reduce((t, v, i) => t + v * (b.eksen![i] ?? 0), 0));
    if (nokta < ESLESME_YON) return false;
  }
  if (a.konum !== null && b.konum !== null && a.konum.some((v, i) => Math.abs(v - (b.konum![i] ?? Number.NaN)) > ESLESME_UZUNLUK_MM)) return false;
  return true;
}

// Önceki revizyonun yüzünü yeni revizyonda bulur (2140-4 a): tür, yön, alan, yarıçap, eksen ve konum aynı olan, daha önce alınmamış ilk yüz.
// Yüz sırası revizyonlar arasında değişebilir; eşleşmeyen işaret taşınmaz. Sonuç eski sıra -> yeni sıra.
export function yuzleriEslestir(eski: readonly EslesenYuz[], yeni: readonly EslesenYuz[]): Map<number, number> {
  const alinan = new Set<number>();
  const sonuc = new Map<number, number>();
  for (const e of eski) {
    const ayniSira = yeni.find((y) => y.sira === e.sira && !alinan.has(y.sira) && ayniYuzMu(e, y));
    const bulunan = ayniSira ?? yeni.find((y) => !alinan.has(y.sira) && ayniYuzMu(e, y));
    if (bulunan === undefined) continue;
    alinan.add(bulunan.sira);
    sonuc.set(e.sira, bulunan.sira);
  }
  return sonuc;
}
