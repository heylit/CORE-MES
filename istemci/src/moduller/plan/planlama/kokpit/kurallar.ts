import type { EmirNo } from '../ortak/emir-no.ts';
import { acikSaat, type Derleme, type OkunanPlan } from '../motor/kurallar.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';

// Kokpit'in saf kuralları (kart 3151): tahtanın, matrisin ve sorun turunun okuduğu model çalışmadan ve kayıtlı plandan kurulur.
// Saat ekseni çalışmanın eksenidir (başlangıç gününün 00:00'ından saat). Veri yoksa null; sıfır uydurulmaz.

export type EmirDurumu = 'gec' | 'risk' | 'plansiz' | 'iyi';
// Termine bu kadar saatten az kalan, geç kalmayan emir risklidir (ön izlemedeki "termine 8 saatten az").
export const RISK_SAATI = 8;

export interface KokpitIsi {
  id: string; job: string; ad: string; m: string; S: number; C: number;
  // Başlamış iş ve fason adım tahtadan taşınmaz.
  basladi: boolean; fason: boolean; kilitli: boolean;
  // Rotadaki yeri (0'dan).
  sira: number;
}
// onculler: adımın rotadaki bitmemiş öncülleri ve bağ türü (b: öncül bitince başlar, o: örtüşmeli, öncül bitmeden başlayabilir).
export type BagTuru = 'b' | 'o';
export interface KokpitAdimi { id: string; ad: string; adaylar: string[]; onculler?: readonly (readonly [string, BagTuru])[] }
// Tahtada çizilen bağ: öncülün ve ardılın planda yeri vardır. ters: "bitince" bağlı ardıl öncülü bitmeden başlıyor (geçersiz sıra).
export interface AdimBagi { kimden: string; kime: string; tur: BagTuru; ters: boolean }
export function adimBaglari(emirler: readonly KokpitEmri[], isler: Readonly<Record<string, KokpitIsi>>): AdimBagi[] {
  return emirler.flatMap((e) => e.adimlar.flatMap((a) => (a.onculler ?? []).flatMap(([kimden, tur]): AdimBagi[] => {
    const o = isler[kimden], x = isler[a.id];
    return o && x ? [{ kimden, kime: a.id, tur, ters: tur === 'b' && x.S < o.C - 0.01 }] : [];
  })));
}
// Adımın bağımlılık yazısı (3330): öncül, emrin operasyon listesindeki sıra numarasıyla (tablodaki # sütunu). uzun tablo sütunudur
// ("1 Torna · bitince"), kisa dar ekranda ve listede adın yanındadır ("1 Torna bitince", "2 Freze ile örtüşmeli"). Bekleyen öncülü yoksa null.
export function bagimlilik(e: Pick<KokpitEmri, 'adimlar'>, a: KokpitAdimi): { uzun: string; kisa: string } | null {
  const l = (a.onculler ?? []).flatMap(([q, tur]) => { const i = e.adimlar.findIndex((x) => x.id === q); return i < 0 ? [] : [{ no: String(i + 1), ad: e.adimlar[i]!.ad, tur }]; });
  if (l.length === 0) return null;
  return {
    uzun: l.map((x) => `${x.no} ${x.ad} · ${x.tur === 'o' ? 'örtüşmeli (bitmeden başlayabilir)' : 'bitince'}`).join('; '),
    kisa: l.map((x) => `${x.no} ${x.ad} ${x.tur === 'o' ? 'ile örtüşmeli' : 'bitince'}`).join(' · '),
  };
}
// Bağ okunun yolu (px). Kutu: işin sol ve sağ kenarı, orta yüksekliği, yüksekliği ve satırının yüksekliği. Ok başka işlerin yazısının
// üstünden geçmesin diye yatayda yalnız satır aralarından (iki satırın sınırı) yürür: öncülden çıkar, kendi satırının ardıla bakan sınırına
// iner, aradaki satırlarda boş bir hizadan ardılın satır sınırına geçer ve ardılın sol kenarının ortasına soldan girer. Bitince: öncülün
// sağ kenarından; örtüşmeli: öncülün ardıla bakan kenarından, ardılın başlangıç hizasında. Köşeler yuvarlaktır.
export interface OkKutusu { x1: number; x2: number; y: number; h: number; satir: number }
export interface OkEngeli { x1: number; x2: number; y: number }
const OK_PAYI = 8, OK_KOSE = 12;
const yuvarla = (n: number): number => Math.round(n * 10) / 10;
type Nokta = readonly [number, number];
function yuvarlakYol(noktalar: readonly Nokta[]): string {
  // Üst üste ve aynı doğrultudaki ara noktalar düşer.
  const l: Nokta[] = [];
  for (const n of noktalar) {
    const son = l.at(-1), onceki = l.at(-2);
    if (son && Math.abs(son[0] - n[0]) < 0.05 && Math.abs(son[1] - n[1]) < 0.05) continue;
    if (son && onceki && ((Math.abs(onceki[0] - son[0]) < 0.05 && Math.abs(son[0] - n[0]) < 0.05) || (Math.abs(onceki[1] - son[1]) < 0.05 && Math.abs(son[1] - n[1]) < 0.05))) l.pop();
    l.push(n);
  }
  const uz = (a: Nokta, b: Nokta): number => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  const yaklas = (a: Nokta, b: Nokta, r: number): Nokta => { const u = uz(a, b) || 1; return [a[0] + (b[0] - a[0]) * r / u, a[1] + (b[1] - a[1]) * r / u]; };
  const yaz = (n: Nokta): string => `${String(yuvarla(n[0]))},${String(yuvarla(n[1]))}`;
  let d = `M${yaz(l[0]!)}`;
  for (let i = 1; i < l.length - 1; i++) {
    const r = Math.min(OK_KOSE, uz(l[i - 1]!, l[i]!) / 2, uz(l[i]!, l[i + 1]!) / 2);
    d += ` L${yaz(yaklas(l[i]!, l[i - 1]!, r))} Q${yaz(l[i]!)} ${yaz(yaklas(l[i]!, l[i + 1]!, r))}`;
  }
  return `${d} L${yaz(l.at(-1)!)}`;
}
export function okYolu(a: OkKutusu, b: OkKutusu, tur: BagTuru, engeller: readonly OkEngeli[] = []): string {
  const ex = b.x1, ey = b.y, ayniSatir = Math.abs(ey - a.y) < 1;
  // Aynı satırda art arda duran iki iş arasında ok düz gider.
  if (ayniSatir && tur === 'b' && ex >= a.x2 && ex - a.x2 <= 3 * OK_PAYI) return yuvarlakYol([[a.x2, a.y], [ex, ey]]);
  const yon = ayniSatir || ey > a.y ? 1 : -1;
  const sinirA = a.y + yon * a.satir / 2, sinirB = ayniSatir ? sinirA : ey - yon * b.satir / 2;
  const bas: Nokta[] = tur === 'o'
    ? [[Math.min(Math.max(ex, a.x1 + 4), a.x2 - 4), a.y + yon * a.h / 2]]
    : [[a.x2, a.y], [a.x2 + OK_PAYI, a.y]];
  // Aradaki satırlarda dikey geçişin denk geldiği iş varsa geçiş o işin sağına kayar.
  const arada = engeller.filter((g) => (g.y - sinirA) * (g.y - sinirB) < 0).sort((p, q) => p.x1 - q.x1);
  let x = bas.at(-1)![0];
  for (const g of arada) if (x > g.x1 - OK_PAYI && x < g.x2 + OK_PAYI) x = g.x2 + OK_PAYI;
  return yuvarlakYol([...bas, [bas.at(-1)![0], sinirA], [x, sinirA], [x, sinirB], [ex - OK_PAYI, sinirB], [ex - OK_PAYI, ey], [ex, ey]]);
}
export const okUcu = (b: OkKutusu): string => `M${yuvarla(b.x1)},${yuvarla(b.y)} l-6,-3.5 v7 z`;
export interface KokpitEmri {
  id: string; no: string; urun: string; adet: number;
  termin: number | null; bitis: number | null;
  durum: EmirDurumu;
  // Artı: terminden sonra biter (saat). Plansızda ve terminsizde null.
  gecikme: number | null;
  adimlar: KokpitAdimi[];
}
// grup: planın istasyon kimliği; grupAdi istasyonun adı (yoksa kodu), 3B istasyona göre toplarken başlık olur.
export interface KokpitTezgahi { id: string; kod: string; ad: string; fason: boolean; grup?: string; grupAdi?: string }
// ariza: olaydan gelen (şu anki) arıza; değilse çalışmanın duruş listesinden planlı duruş, neden'i ile.
export interface KokpitDurusu { a: number; b: number; ariza: boolean; neden?: 'arıza' | 'bakım' }
export interface KokpitModeli {
  simdi: number;
  tezgahlar: KokpitTezgahi[];
  isler: Record<string, KokpitIsi>;
  emirler: KokpitEmri[];
  // Tahtanın ekseni: bugünün 00:00'ı ve son işin bittiği günün sonu (en az iki hafta).
  bas: number; son: number;
  // Tezgâhın açık saat pencereleri (hamle adayı açık saate oturur); bilinmeyen tezgâh hep açık sayılır.
  acik: Record<string, readonly (readonly [number, number])[]>;
  // Tezgâhın duruşları (saat aralığı). ariza: makine arızası olayından gelen; değilse planlı duruş (bakım).
  durus: Record<string, readonly KokpitDurusu[]>;
  // Tezgâhın bugünden sonraki ek mesaileri (3282 2a-2); satır başlığında "+ ek mesai" yazılır.
  mesai?: Record<string, readonly (KokpitEkMesaisi & { vardiyaAd: string })[]>;
}

const FASON_SATIRI = '@';
export const fasonMu = (m: string): boolean => m.startsWith('@');

export function modelKur(c: PlanlamaCalismasi, p: OkunanPlan | null, cx: Derleme, emirNo: EmirNo): KokpitModeli {
  const simdi = cx.now;
  const urunAdi = new Map(c.D.urunler.map((u) => [u.id, u.ad ?? u.id]));
  const siparis = new Map(c.D.siparisler.map((s) => [s.id, s]));
  const isler: Record<string, KokpitIsi> = {};
  const emirler: KokpitEmri[] = [];
  let enSon = simdi;
  for (const j of Object.values(cx.jobs)) {
    const s = siparis.get(j.id);
    let yerlesen = 0, bitis: number | null = null;
    j.ops.forEach((a, sira) => {
      const x = p?.ops[a.id];
      if (!x || !Number.isFinite(x.S) || !Number.isFinite(x.C)) return;
      yerlesen++;
      isler[a.id] = { id: a.id, job: j.id, ad: a.ad, m: x.m, S: x.S, C: x.C, basladi: x.act, fason: x.fas || fasonMu(x.m), kilitli: !!c.locks[a.id], sira };
      bitis = bitis === null ? x.C : Math.max(bitis, x.C);
      enSon = Math.max(enSon, x.C);
    });
    const plansiz = j.ops.length > 0 && yerlesen < j.ops.length;
    const gecikme = plansiz || bitis === null || j.due === null ? null : bitis - j.due;
    const durum: EmirDurumu = plansiz ? 'plansiz' : gecikme === null ? 'iyi' : gecikme > 0.01 ? 'gec' : gecikme > -RISK_SAATI ? 'risk' : 'iyi';
    if (!j.ops.length) continue;
    emirler.push({
      id: j.id, no: emirNo(j.id), urun: urunAdi.get(s?.urun ?? '') ?? s?.ad ?? '', adet: j.adet, termin: j.due, bitis: plansiz ? null : bitis, durum, gecikme,
      adimlar: j.ops.map((a) => ({ id: a.id, ad: a.ad, adaylar: a.c, ...(a.pr.length ? { onculler: a.pr.map(([q, t]) => [q, t === 'o' ? 'o' : 'b'] as const) } : {}) })),
    });
  }
  const tezgahlar: KokpitTezgahi[] = c.D.tezgahlar.filter((t) => cx.M[t.id]).map((t) => ({ id: t.id, kod: t.kod ?? t.ad ?? t.id, ad: t.kod ? t.ad ?? '' : '', fason: false, ...(t.grup ? { grup: t.grup } : {}), ...(t.grupAd ?? t.grupKod ? { grupAdi: t.grupAd ?? t.grupKod } : {}) }));
  if (Object.values(isler).some((x) => x.fason)) tezgahlar.push({ id: FASON_SATIRI, kod: 'Fason', ad: 'dış atölye', fason: true });
  const bas = Math.floor(simdi / 24) * 24;
  const acik = Object.fromEntries(Object.values(cx.M).map((t) => [t.id, t.sw]));
  const durus: Record<string, KokpitDurusu[]> = {};
  for (const d of cx.g.down) {
    if (d.to <= bas) continue;
    const plan = c.down.find((x) => String(x['m']) === d.m && x['from'] === d.from && x['to'] === d.to);
    (durus[d.m] ??= []).push(plan ? { a: d.from, b: d.to, ariza: false, neden: plan['neden'] === 'bakım' ? 'bakım' : 'arıza' } : { a: d.from, b: d.to, ariza: true });
  }
  const mesai: Record<string, (KokpitEkMesaisi & { vardiyaAd: string })[]> = {};
  for (const e of kokpitEkMesaileri(c)) if (e.gun * 24 >= bas) (mesai[e.m] ??= []).push({ ...e, vardiyaAd: vardiyaAdi(c, e.vardiya) });
  for (const l of Object.values(mesai)) l.sort((x, y) => x.gun - y.gun);
  return { simdi, tezgahlar, isler, emirler, bas, son: Math.max(bas + 14 * 24, Math.ceil(enSon / 24) * 24 + 24), acik, durus, mesai };
}
export const gunYazisi = (g: number, zaman: (t: number) => string): string => zaman(g * 24).replace(/ \d\d:\d\d$/, '');
export const ekMesaiYazisi = (l: readonly (KokpitEkMesaisi & { vardiyaAd: string })[], zaman: (t: number) => string): string =>
  `Ek mesai: ${l.map((e) => `${gunYazisi(e.gun, zaman)} ${e.vardiyaAd}`).join(', ')}`;

// Tezgâh şu anda arızadaysa o arıza (başlığa "arızada · bitiş" yazılır). Planlı duruş kapalı saat gibi taralıdır, başlığa yazılmaz.
export const suAndakiDurus = (m: Pick<KokpitModeli, 'durus' | 'simdi'>, tezgah: string): KokpitDurusu | null =>
  m.durus[tezgah]?.find((d) => d.ariza && d.a <= m.simdi && m.simdi < d.b) ?? null;
export const durusYazisi = (d: KokpitDurusu, zaman: (t: number) => string): string => `arızada · ${zaman(d.b).slice(6)}`;
export const planliDurusYazisi = (d: KokpitDurusu, zaman: (t: number) => string): string =>
  `${d.neden === 'bakım' ? 'Bakım' : 'Arıza'} · ${zaman(d.a)} → ${zaman(d.b)}`;

// Fason işler tek satırda toplanır (fasoncu kimliği satır değildir).
export const satirKimligi = (x: Pick<KokpitIsi, 'm' | 'fason'>): string => (x.fason ? FASON_SATIRI : x.m);

export interface Sayim { gec: number; risk: number; plansiz: number }
export function sayim(emirler: readonly KokpitEmri[]): Sayim {
  const n: Sayim = { gec: 0, risk: 0, plansiz: 0 };
  for (const e of emirler) if (e.durum !== 'iyi') n[e.durum]++;
  return n;
}

const AGIRLIK: Record<EmirDurumu, number> = { gec: 0, risk: 1, plansiz: 2, iyi: 3 };
// Sorunlu emirler: en ağırı önce (geç, riskli, plansız), aynı durumda en çok geciken, sonra termini yakın olan.
export function sorunlular(emirler: readonly KokpitEmri[]): KokpitEmri[] {
  return emirler.filter((e) => e.durum !== 'iyi').sort((a, b) =>
    AGIRLIK[a.durum] - AGIRLIK[b.durum] || (b.gecikme ?? 0) - (a.gecikme ?? 0) || (a.termin ?? Infinity) - (b.termin ?? Infinity));
}
// Matris sırası: sorunlular üstte, sonra termin.
export function matrisSirasi(emirler: readonly KokpitEmri[]): KokpitEmri[] {
  return [...emirler].sort((a, b) => AGIRLIK[a.durum] - AGIRLIK[b.durum] || (a.termin ?? Infinity) - (b.termin ?? Infinity));
}

// Arama: emir no, ürün ve işlerinin tezgâh kodu.
export function aramaUyar(e: KokpitEmri, m: KokpitModeli, ara: string): boolean {
  const q = ara.trim().toLocaleLowerCase('tr-TR');
  if (!q) return true;
  const kod = new Map(m.tezgahlar.map((t) => [t.id, t.kod]));
  const metin = [e.no, e.urun, ...e.adimlar.map((a) => { const x = m.isler[a.id]; return x ? kod.get(satirKimligi(x)) ?? '' : ''; })].join(' ').toLocaleLowerCase('tr-TR');
  return metin.includes(q);
}

// --- ölçek ---
export const OLCEKLER = [['G', 'Gün'], ['3', '3 gün'], ['H', 'Hafta'], ['A', 'Ay'], ['Y', 'Yıl']] as const;
export type KokpitOlcegi = (typeof OLCEKLER)[number][0];
// Bir saatin ekrandaki eni. Ay ve Yıl'da tahta yük hücrelerine döner (hücre: gün ya da hafta).
export const SAAT_ENI: Record<KokpitOlcegi, number> = { G: 44, '3': 15, H: 6.5, A: 1.5, Y: 0.14 };
export const uzakMi = (o: KokpitOlcegi): boolean => o === 'A' || o === 'Y';
export function olcekKomsusu(o: KokpitOlcegi, yon: 1 | -1): KokpitOlcegi {
  const i = OLCEKLER.findIndex(([k]) => k === o) + yon;
  return OLCEKLER[Math.max(0, Math.min(OLCEKLER.length - 1, i))]?.[0] ?? o;
}

// --- yük ---
export interface GunYuku { acik: number; plan: number }
// Tezgâhın [a, b) aralığındaki açık saati ve plandaki işlerin o aralıktaki açık saati.
export function aralikYuku(cx: Derleme, isler: readonly KokpitIsi[], m: string, a: number, b: number): GunYuku {
  const M = cx.M[m];
  if (!M) return { acik: 0, plan: 0 };
  let plan = 0;
  for (const x of isler) if (x.m === m && !x.fason && x.C > a && x.S < b) plan += acikSaat(M.rw, Math.max(a, x.S), Math.min(b, x.C));
  return { acik: acikSaat(M.rw, a, b), plan };
}
export type YukSinifi = 'kapali' | 'hafif' | 'orta' | 'dolu' | 'asim';
export function yukSinifi(y: GunYuku): YukSinifi {
  if (y.acik <= 0) return 'kapali';
  const o = y.plan / y.acik;
  return o > 1 ? 'asim' : o > 0.85 ? 'dolu' : o > 0.5 ? 'orta' : 'hafif';
}
// Matrisin yük basamağı: boş gün renksizdir, %100 ve üstü tam doludur.
export type MatrisYuku = 'kapali' | 'bos' | 'hafif' | 'orta' | 'dolu' | 'tam';
export function matrisYuku(y: GunYuku): MatrisYuku {
  if (y.acik <= 0) return 'kapali';
  const o = y.plan / y.acik;
  return o <= 0.005 ? 'bos' : o < 0.5 ? 'hafif' : o < 0.85 ? 'orta' : o < 0.995 ? 'dolu' : 'tam';
}
export const yukYuzdesi = (y: GunYuku): number | null => (y.acik > 0 ? Math.round((y.plan / y.acik) * 100) : null);

// --- matris ---
export const MATRIS_GUNU = 14;
// Bundan kısa bekleme sıra sayılmaz (açık saat): vardiya arası ve taşıma payı bekleme diye gösterilmez.
export const BEKLEME_ESIGI = 4;
const acikSure = (W: readonly (readonly [number, number])[] | undefined, a: number, b: number): number => {
  if (b <= a) return 0;
  if (!W) return b - a;
  let s = 0;
  for (const [x, y] of W) { if (x >= b) break; s += Math.max(0, Math.min(b, y) - Math.max(a, x)); }
  return s;
};
// Adımın sırada beklediği aralık: emrin önceki plandaki adımı bitince (ilk adımda şimdi) başlar, adım başlayınca biter.
// acik: aralıkta adımın tezgâhının açık olduğu saat (eşik bununla ölçülür), sure: duvar saati (kişinin gördüğü bekleme).
// Plansız, başlamış ve fason adımda null: sıra beklemez.
export interface Bekleme { bas: number; son: number; acik: number; sure: number }
export function adimBeklemesi(m: KokpitModeli, e: KokpitEmri, k: number): Bekleme | null {
  const x = m.isler[e.adimlar[k]?.id ?? ''];
  if (!x || x.basladi || x.fason) return null;
  let bas = m.simdi;
  for (let j = 0; j < k; j++) { const y = m.isler[e.adimlar[j]?.id ?? '']; if (y) bas = Math.max(bas, y.C); }
  if (x.S <= bas) return null;
  return { bas, son: x.S, acik: acikSure(m.acik[x.m], bas, x.S), sure: x.S - bas };
}
// Emrin en çok bekleyen adımı (eşiği aşan); yoksa null.
export function enCokBekleyen(m: KokpitModeli, e: KokpitEmri): { k: number; tezgah: string; bekleme: Bekleme } | null {
  let en: { k: number; tezgah: string; bekleme: Bekleme } | null = null;
  e.adimlar.forEach((a, k) => {
    const b = adimBeklemesi(m, e, k), x = m.isler[a.id];
    if (b && x && b.acik >= BEKLEME_ESIGI && (!en || b.acik > en.bekleme.acik)) en = { k, tezgah: x.m, bekleme: b };
  });
  return en;
}
// Geç emirlerin en çok sıra beklediği tezgâh: beklemeleri tezgâh başına toplanır. Geç emir ya da eşiği aşan bekleme yoksa null.
export interface Darbogaz { tezgah: string; sure: number; emir: number }
export function darbogaz(m: KokpitModeli): Darbogaz | null {
  const t = new Map<string, { acik: number; sure: number; emirler: Set<string> }>();
  for (const e of m.emirler) {
    if (e.durum !== 'gec') continue;
    e.adimlar.forEach((a, k) => {
      const b = adimBeklemesi(m, e, k), x = m.isler[a.id];
      if (!b || !x || b.acik < BEKLEME_ESIGI) return;
      const s = t.get(x.m) ?? { acik: 0, sure: 0, emirler: new Set<string>() };
      s.acik += b.acik; s.sure += b.sure; s.emirler.add(e.id); t.set(x.m, s);
    });
  }
  let en: Darbogaz | null = null, enAcik = 0;
  for (const [tezgah, s] of t) if (s.acik > enAcik) { enAcik = s.acik; en = { tezgah, sure: s.sure, emir: s.emirler.size }; }
  return en;
}
// Emrin gün gün yeri (Akış düzeni): o gün süren adımlar (rotadaki sırasıyla), sırada beklediği gün, termin günü, terminden sonra süren gün.
export interface EmirGunu { adimlar: number[]; bekle: boolean; termin: boolean; sonra: boolean }
export function emirGunleri(m: KokpitModeli, e: KokpitEmri, gun = MATRIS_GUNU): EmirGunu[] {
  const beklemeler = e.adimlar.map((_, k) => { const b = adimBeklemesi(m, e, k); return b && b.acik >= BEKLEME_ESIGI ? { b, W: m.acik[m.isler[e.adimlar[k]?.id ?? '']?.m ?? ''] } : null; });
  const terminGunu = e.termin === null ? null : Math.floor((e.termin - 0.01 - m.bas) / 24);
  return Array.from({ length: gun }, (_, g) => {
    const a = m.bas + g * 24, b = a + 24;
    const adimlar: number[] = [];
    e.adimlar.forEach((ad, k) => { const x = m.isler[ad.id]; if (x && x.S < b && x.C > a) adimlar.push(k); });
    const bekle = adimlar.length === 0 && beklemeler.some((w) => w !== null && acikSure(w.W, Math.max(a, w.b.bas), Math.min(b, w.b.son)) >= 1);
    return { adimlar, bekle, termin: terminGunu === g, sonra: terminGunu !== null && g > terminGunu && e.bitis !== null && e.termin !== null && e.bitis > e.termin + 0.01 && a < e.bitis };
  });
}
// Tezgâhın o gününde (gun null: herhangi bir gün) işi olan emir mi (yük hücresi süzgeci).
export function tezgahGunundeMi(m: KokpitModeli, e: KokpitEmri, tezgah: string, gun: number | null): boolean {
  return e.adimlar.some((a) => { const x = m.isler[a.id]; return x !== undefined && satirKimligi(x) === tezgah && (gun === null || (x.S < m.bas + (gun + 1) * 24 && x.C > m.bas + gun * 24)); });
}

// --- taşıma ---
// Çeyrek saate yuvarlanır; şimdiden önce olamaz (sunucu geçmişe konan kilidi reddeder).
export const tasimaSaati = (S: number, simdi: number): number => Math.max(Math.ceil(simdi * 4 - 1e-9) / 4, Math.round(S * 4) / 4);
export function tasinabilir(x: KokpitIsi): string | null {
  return x.basladi ? 'Başlamış iş taşınmaz' : x.fason ? 'Fason adım tahtadan taşınmaz' : null;
}

// Verilen andan sonraki ilk açık an; pencere bilinmiyorsa ya da kalmadıysa anın kendisi.
export function acigaOtur(W: readonly (readonly [number, number])[] | undefined, t: number): number {
  for (const [a, b] of W ?? []) if (b > t + 1e-9) return Math.max(a, t);
  return t;
}
// Tezgâhta verilen andan sonra süreye yeten ilk boşluk; başlangıç açık saate oturur. Süre duvar saatidir (kapalı saatleri taşımayı
// denetleyen sunucu önizlemesi hesaplar); burada yalnız denenecek yer seçilir.
export function ilkBosluk(m: KokpitModeli, tezgah: string, sure: number, baslangic: number, haric?: string): number {
  const dolu = Object.values(m.isler).filter((x) => x.m === tezgah && x.id !== haric && x.C > baslangic).sort((a, b) => a.S - b.S);
  const W = m.acik[tezgah];
  let t = acigaOtur(W, baslangic);
  for (const x of dolu) { if (x.S - t >= sure - 1e-9) break; t = acigaOtur(W, Math.max(t, x.C)); }
  return t;
}

// --- sorun turu ---
// planaAl dolu ise hamle taşıma değil plana almadır: değer emrin kimliğidir, isId emrin ilk adımıdır.
// adimlar (3229 a): plana almada ilk adımdan sonraki adımlar için kullanıcının seçtiği tezgâh ve / veya saat.
export interface AdimSecimi { tezgah?: string | undefined; baslangic?: number | undefined }
export interface TurAdayi { isId: string; tezgah: string; baslangic: number; planaAl?: string; adimlar?: { isId: string; tezgah?: string; baslangic?: number }[] }
// Sunucuya giden seçim listesi: ilk adım ayrı alanlarla gider, boş seçim ve emrin olmayan adımı gitmez; rota sırasıyla.
export function adimSecimleri(e: Pick<KokpitEmri, 'adimlar'>, sec: Readonly<Record<string, AdimSecimi>>): { isId: string; tezgah?: string; baslangic?: number }[] {
  return e.adimlar.slice(1).flatMap((a) => {
    const s = sec[a.id];
    if (!s || (s.tezgah === undefined && s.baslangic === undefined)) return [];
    return [{ isId: a.id, ...(s.tezgah === undefined ? {} : { tezgah: s.tezgah }), ...(s.baslangic === undefined ? {} : { baslangic: s.baslangic }) }];
  });
}
// Başlama saati seçenekleri: bugünden başlayarak yedi gün, iki saatte bir 06:00-22:00; geçmiş saat yok.
export function baslamaSaatleri(m: Pick<KokpitModeli, 'bas' | 'simdi'>, gun = 7): number[] {
  const l: number[] = [];
  for (let g = 0; g < gun; g++) for (let h = 6; h <= 22; h += 2) { const t = m.bas + g * 24 + h; if (t >= m.simdi) l.push(t); }
  return l;
}
// Emrin taşınabilen bekleyen adımları için hamle adayları: aday tezgâhların her birinde, öncül adım bittikten sonraki en erken boşluk.
// Bugünkü yerinden erken olmayan aday hamle değildir; en çok öne alan başta. Sonucu (emrin yeni bitişi) sunucu önizlemesi verir; burada
// yalnız denenecek yerler seçilir. `isId` verilirse yalnız o adım (ayrıntıdaki seçenekler).
export function turAdaylari(m: KokpitModeli, e: KokpitEmri, isId: string | null = null, enCok = 3): TurAdayi[] {
  if (e.durum === 'plansiz') return planaAlAdaylari(m, e, enCok);
  const l: (TurAdayi & { kazanc: number })[] = [];
  let onceki = m.simdi;
  for (const adim of e.adimlar) {
    const x = m.isler[adim.id];
    if (!x) continue;
    if (tasinabilir(x) === null && x.S > m.simdi && (isId === null || adim.id === isId)) {
      for (const tezgah of adim.adaylar) {
        if (fasonMu(tezgah)) continue;
        const baslangic = tasimaSaati(ilkBosluk(m, tezgah, x.C - x.S, onceki, x.id), m.simdi);
        if (baslangic < x.S - 0.25) l.push({ isId: x.id, tezgah, baslangic, kazanc: x.S - baslangic });
      }
    }
    onceki = Math.max(onceki, x.C);
  }
  return l.sort((a, b) => b.kazanc - a.kazanc).slice(0, enCok).map(({ isId: id, tezgah, baslangic }) => ({ isId: id, tezgah, baslangic }));
}
// Plansız emrin plana alma adayları: ilk adımın aday tezgâhlarında şimdiden sonraki ilk açık an. Boş yeri ve emrin bitişini sunucu
// önizlemesi verir (adımın süresi plana alınmadan bilinmez). Bir adımı planda olan emir tahtadan taşınır, plana alınmaz.
export function planaAlAdaylari(m: KokpitModeli, e: KokpitEmri, enCok = 3): TurAdayi[] {
  const ilk = e.adimlar[0];
  if (!ilk || e.adimlar.some((a) => m.isler[a.id])) return [];
  return ilk.adaylar.filter((t) => !fasonMu(t)).slice(0, enCok)
    .map((tezgah) => ({ isId: ilk.id, tezgah, baslangic: tasimaSaati(acigaOtur(m.acik[tezgah], m.simdi), m.simdi), planaAl: e.id }));
}
// Önizlemeden emrin yeni bitişi: taşınan ve itilen adımlar önizlemedeki, ötekiler bugünkü yerinde.
export function onizlemeBitisi(m: KokpitModeli, e: KokpitEmri, isler: readonly { isId: string; C: number }[]): number | null {
  const yeni = new Map(isler.map((x) => [x.isId, x.C]));
  let b: number | null = null;
  for (const a of e.adimlar) { const C = yeni.get(a.id) ?? m.isler[a.id]?.C; if (C === undefined) return null; b = b === null ? C : Math.max(b, C); }
  return b;
}

// --- yazı ---
// "2 gün 3 sa" (çeyrek saat duyarlı); işaret çağırandadır.
export function sureYaz(saat: number): string {
  const a = Math.round(Math.abs(saat) * 4) / 4, g = Math.floor(a / 24), s = Math.floor(a - g * 24), dk = Math.round((a - g * 24 - s) * 60);
  if (a < 0.01) return '0 dk';
  return [g ? `${String(g)} gün` : '', s ? `${String(s)} sa` : '', dk ? `${String(dk)} dk` : ''].filter(Boolean).join(' ');
}
export function durumYazisi(e: KokpitEmri): string {
  if (e.durum === 'plansiz') return 'plansız';
  if (e.gecikme === null) return 'termin yok';
  return e.gecikme > 0.01 ? `${sureYaz(e.gecikme)} geç` : e.durum === 'risk' ? `termine ${sureYaz(-e.gecikme)}` : 'zamanında';
}

// --- 3B (kart 3208) ---
// Hücre: bir tezgâhın bir günü. Yük oranı açık saate göredir (1 = tam dolu); kapalı günde null. Durum, o gün o tezgâhta işi olan
// emirlerin en kötüsüdür (plansız emrin yerleşmiş adımı zamanında sayılmaz, riskli sayılır). Değişen: plandaki saatin taslakta yeri
// değişip henüz onaylanmamış kısmı (0-1; onaylı plan okunmadıysa null). Önce: aynı hücrenin onaylı plandaki yük oranı.
export type HucreDurumu = 'gec' | 'risk' | 'iyi';
export interface Hucre3B { tezgah: string; gun: number; yuk: number | null; durum: HucreDurumu | null; degisen: number | null; once: number | null; plan: number; acik: number }
export interface OnayliYer { m: string; S: number; C: number }
// Yeri değişen iş: onaylı planda yok, başka tezgâhta ya da çeyrek saatten çok kaymış ("Önce / sonra" ile aynı ölçü, motor/fark.ts).
export const yeriDegisti = (x: Pick<KokpitIsi, 'm' | 'S'>, a: OnayliYer | undefined): boolean => !a || a.m !== x.m || Math.abs(a.S - x.S) > 0.25;
const DURUM_AGIRLIGI: Record<HucreDurumu, number> = { iyi: 0, risk: 1, gec: 2 };

export function hucreler3B(m: KokpitModeli, cx: Derleme, once: Record<string, OnayliYer> | null, gun = MATRIS_GUNU): Hucre3B[][] {
  const isler = Object.values(m.isler);
  const durum = new Map(m.emirler.map((e) => [e.id, e.durum === 'gec' ? 'gec' : e.durum === 'iyi' ? 'iyi' : 'risk'] as const));
  const onayli: KokpitIsi[] = once === null ? [] : Object.entries(once).map(([id, a]) => ({ id, job: '', ad: '', m: a.m, S: a.S, C: a.C, basladi: false, fason: fasonMu(a.m), kilitli: false, sira: 0 }));
  return m.tezgahlar.filter((t) => !t.fason).map((t) => {
    const M = cx.M[t.id];
    return Array.from({ length: gun }, (_, g): Hucre3B => {
      const a = m.bas + g * 24, b = a + 24;
      const y = aralikYuku(cx, isler, t.id, a, b);
      if (y.acik <= 0 || !M) return { tezgah: t.id, gun: g, yuk: null, durum: null, degisen: null, once: null, plan: 0, acik: 0 };
      let en: HucreDurumu | null = null, degisen = 0;
      for (const x of isler) {
        if (x.m !== t.id || x.fason || x.C <= a || x.S >= b) continue;
        const d = durum.get(x.job) ?? 'iyi';
        if (en === null || DURUM_AGIRLIGI[d] > DURUM_AGIRLIGI[en]) en = d;
        if (once !== null && yeriDegisti(x, once[x.id])) degisen += acikSaat(M.rw, Math.max(a, x.S), Math.min(b, x.C));
      }
      const o = once === null ? null : aralikYuku(cx, onayli, t.id, a, b);
      return { tezgah: t.id, gun: g, yuk: y.plan / y.acik, durum: en, degisen: once === null ? null : y.plan > 0 ? Math.min(1, degisen / y.plan) : 0, once: o === null ? null : o.plan / o.acik, plan: y.plan, acik: y.acik };
    });
  });
}

// Onaylı planda geç biten emir sayısı ("Önce / sonra"da geç emir önce → sonra). Adımı onaylı planda olmayan ya da terminsiz emir sayılmaz.
export function onayliGecSayisi(m: KokpitModeli, once: Record<string, OnayliYer>): number {
  return m.emirler.filter((e) => {
    if (e.termin === null || !e.adimlar.length) return false;
    let bitis = -Infinity;
    for (const a of e.adimlar) { const x = once[a.id]; if (!x) return false; bitis = Math.max(bitis, x.C); }
    return bitis > e.termin + 0.01;
  }).length;
}

// Ek mesai (3282 2a-2, 3282-7 b): vardiya dışı ek kapasite, operatörüyle. Kurallar sunucudakinin aynısıdır (sunucu taslak-kurallar.ts
// operatorSorunu ve ekMesaiUygula); burada seçenek listesini ve bütçe yazısını kurar, son söz sunucunundur.
type Nesne = Record<string, unknown>;
const nesneMi = (x: unknown): x is Nesne => typeof x === 'object' && x !== null && !Array.isArray(x);
const HAFTA_GUNLERI = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'] as const;
// Motorun varsayılan haftalık ek mesai bütçesi (saat); 0 sınırsız.
export const MESAI_HAFTA_VARSAYILAN = 8;
const saatDegeri = (x: unknown): number => { const [h, d] = String(x).split(':').map(Number); return (h ?? 0) + (d ?? 0) / 60; };
const tarihMs = (b: string): number => { const [y, a, g] = b.split('-').map(Number); return Date.UTC(y ?? 0, (a ?? 1) - 1, g ?? 1); };

export interface KokpitEkMesaisi { m: string; gun: number; vardiya: string; personel: string | null }
export const kokpitEkMesaileri = (c: PlanlamaCalismasi): KokpitEkMesaisi[] => c.ekMesai.flatMap((e) =>
  typeof e['m'] === 'string' && typeof e['gun'] === 'number' && Number.isInteger(e['gun']) && e['vardiya'] !== undefined && e['vardiya'] !== null
    ? [{ m: e['m'], gun: e['gun'], vardiya: String(e['vardiya']), personel: e['personel'] === undefined || e['personel'] === null ? null : String(e['personel']) }] : []);

// Adıma bildirilen uzama (3335-3b): çalışmanın w.adimEk'inde iş kimliğiyle durur (motor girdi.js stKur); iş kimliği → ek saat.
export function adimEkleri(c: PlanlamaCalismasi): Record<string, number> {
  const v = (c.w as Record<string, unknown>)['adimEk'], s: Record<string, number> = {};
  if (typeof v !== 'object' || v === null) return s;
  for (const [id, e] of Object.entries(v as Record<string, unknown>)) {
    const n = typeof e === 'object' && e !== null ? (e as Record<string, unknown>)['ekSaat'] : null;
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) s[id] = n;
  }
  return s;
}
export const adimEkYazisi = (saat: number): string => `+${String(Math.round(saat * 100) / 100).replace('.', ',')} sa`;

// Vardiyanın adı yoksa saatleri ("16:00–24:00"); çalışmada yoksa kimliği.
export function vardiyaAdi(c: PlanlamaCalismasi, id: string): string {
  const v = (c.D.vardiyalar ?? []).find((x) => String(x['id']) === id);
  if (!v) return id;
  return typeof v['ad'] === 'string' && v['ad'] !== '' ? v['ad'] : `${String(v['bas'] ?? '')}–${String(v['bit'] ?? '')}`;
}
export function mesaiTakvimi(c: PlanlamaCalismasi) {
  const D = c.D as unknown as Nesne;
  const b = nesneMi(D['meta']) && typeof D['meta']['baslangic'] === 'string' ? D['meta']['baslangic'] : '1970-01-01';
  const taban = tarihMs(b);
  const gunOf = (x: unknown): number | null =>
    typeof x === 'number' ? Math.floor(x / 24) : typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x) ? Math.floor((tarihMs(x.slice(0, 10)) - taban) / 86_400_000) : null;
  const tatil = new Set((Array.isArray(D['tatiller']) ? D['tatiller'] : []).map(gunOf));
  const cg = nesneMi(D['calismaGunleri']) ? D['calismaGunleri'] : {};
  const vardiyalari = (d: number): string[] => {
    if (tatil.has(d)) return [];
    const l = cg[HAFTA_GUNLERI[(new Date(taban + d * 86_400_000).getUTCDay() + 6) % 7]!];
    return Array.isArray(l) ? l.map(String) : [];
  };
  const vl = (Array.isArray(D['vardiyalar']) ? D['vardiyalar'] : []).filter(nesneMi);
  const vardiya = (id: string): Nesne | null => vl.find((v) => String(v['id']) === id) ?? null;
  const pencere = (d: number, id: string): [number, number] | null => {
    const v = vardiya(id);
    if (v === null) return null;
    const a = d * 24 + saatDegeri(v['bas']);
    let z = d * 24 + saatDegeri(v['bit']);
    if (z <= a) z += 24;
    return [a, z];
  };
  const netSaat = (id: string): number => {
    const v = vardiya(id);
    if (v === null) return 0;
    const a = saatDegeri(v['bas']);
    let z = saatDegeri(v['bit']);
    if (z <= a) z += 24;
    let h = z - a;
    for (const mo of Array.isArray(v['molalar']) ? v['molalar'] : []) {
      if (!nesneMi(mo)) continue;
      let x = saatDegeri(mo['bas']), y = saatDegeri(mo['bit']);
      if (x < a) x += 24;
      if (y <= x) y += 24;
      h -= Math.max(0, Math.min(y, z) - Math.max(x, a));
    }
    return Math.max(0, h);
  };
  const haftaNo = (gun: number): number => Math.floor((gun + (new Date(taban).getUTCDay() + 6) % 7) / 7);
  const devamsiz = new Set((Array.isArray(D['devamsizlik']) ? D['devamsizlik'] : []).flatMap((x) => (nesneMi(x) ? [`${String(x['personel'])}@${String(gunOf(x['gun']))}`] : [])));
  return { vardiyalar: vl.map((v) => String(v['id'])), vardiyalari, pencere, netSaat, haftaNo, devamsiz };
}

export function operatorSorunu(c: PlanlamaCalismasi, e: { tezgah: string; gun: number; vardiya: string; personel: string }): string | null {
  const p = (c.D.personel ?? []).find((x) => String(x.id) === e.personel);
  if (!p) return 'Operatör çalışmanın personelinde yok.';
  const t = c.D.tezgahlar.find((x) => x.id === e.tezgah);
  const makineler = Array.isArray(p['makineler']) ? (p['makineler'] as unknown[]).map(String) : [], gruplar = (p.gruplar ?? []).map(String);
  if (!makineler.includes(e.tezgah) && !(t?.grup !== undefined && gruplar.includes(String(t.grup)))) return 'Operatör bu tezgâhı çalıştırmıyor.';
  const k = mesaiTakvimi(c);
  if (k.devamsiz.has(`${e.personel}@${String(e.gun)}`)) return 'Operatör o gün devamsız.';
  const w = k.pencere(e.gun, e.vardiya);
  const kendi = p.vardiya == null ? '' : String(p.vardiya);
  if (w !== null && kendi !== '') {
    for (const d of [e.gun - 1, e.gun]) {
      if (!k.vardiyalari(d).includes(kendi) || k.devamsiz.has(`${e.personel}@${String(d)}`)) continue;
      const o = k.pencere(d, kendi);
      if (o !== null && o[0] < w[1] && w[0] < o[1]) return 'Ek vardiya operatörün kendi vardiyasıyla çakışıyor.';
    }
  }
  if (kokpitEkMesaileri(c).some((x) => x.personel === e.personel && x.gun === e.gun && x.vardiya === e.vardiya)) return 'Operatör o gün ve vardiyada başka bir ek mesaide.';
  return null;
}

// O tezgâh, gün ve vardiyada seçilebilen operatörler; boşsa ilk kişinin nedeni (kimse yoksa çalışmanın personeli boştur).
export function uygunOperatorler(c: PlanlamaCalismasi, e: { tezgah: string; gun: number; vardiya: string }): { kisiler: { id: string; ad: string }[]; neden: string | null } {
  const l = c.D.personel ?? [];
  const nedenler = l.map((p) => operatorSorunu(c, { ...e, personel: String(p.id) }));
  const kisiler = l.filter((_, i) => nedenler[i] === null).map((p) => ({ id: String(p.id), ad: p.ad ?? String(p.id) }));
  if (kisiler.length) return { kisiler, neden: null };
  const sayac = new Map<string, number>();
  for (const n of nedenler) if (n !== null) sayac.set(n, (sayac.get(n) ?? 0) + 1);
  const en = [...sayac.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return { kisiler, neden: en === undefined ? 'Çalışmada operatör yok.' : `Uygun operatör yok: ${en.charAt(0).toLocaleLowerCase('tr')}${en.slice(1)}` };
}

// Günün haftasındaki ek mesai (saat) ve bütçe; bütçe null ise sınırsız.
export function mesaiButcesi(c: PlanlamaCalismasi, gun: number): { kullanilan: number; sinir: number | null; vardiyaSaati: (v: string) => number } {
  const t = mesaiTakvimi(c);
  const ham = c.param['mesaiHafta'];
  const s = ham === undefined || ham === null ? MESAI_HAFTA_VARSAYILAN : Number(ham);
  const h = t.haftaNo(gun);
  const kullanilan = kokpitEkMesaileri(c).filter((x) => t.haftaNo(x.gun) === h).reduce((a, x) => a + t.netSaat(x.vardiya), 0);
  return { kullanilan, sinir: Number.isFinite(s) && s > 0 ? s : null, vardiyaSaati: t.netSaat };
}

// 3330 a: bitmemiş fason adımın açık satın alma siparişindeki firma tarihi satırda yazar. Kök emrin adımında tarih ve sipariş numarası
// sunucunun emir okumasındadır (opYer; numara Satın Alma'yı göremeyene null gelir), çok katmanlı emrin alt düğümünde yalnız tarih vardır
// (dugumFirma). Plan dönüşü o günün sabahına sabitler; elle girilmiş dönüş termini farklıysa ikisi de yazar. bugun: tesisin günü.
// gun: firma tarihinin 'GG.AA' yazısı; planın dönüş günüyle kıyaslanır (plan tarih girilmeden önce dizildiyse farklıdır).
export interface FirmaYazisi { yazi: string; gecti: boolean; gun: string }
const gunAy = (t: string): string => `${t.slice(8, 10)}.${t.slice(5, 7)}`;
export function firmaYazilari(c: PlanlamaCalismasi, emirler: unknown, bugun: string): Record<string, FirmaYazisi> {
  const y: Record<string, FirmaYazisi> = {};
  const yer = nesneMi(emirler) && nesneMi(emirler['opYer']) ? emirler['opYer'] : {};
  const elle = nesneMi(c.D['fasonTermin']) ? c.D['fasonTermin'] : {};
  const urun = new Map(c.D.urunler.map((u) => [u.id, u]));
  for (const s of c.D.siparisler) {
    const dugum = s['dugum'] ? (nesneMi(s['dugumFirma']) ? s['dugumFirma'] : {}) : null;
    (urun.get(s.urun)?.rota ?? []).forEach((a, i) => {
      const id = `${s.id}.${a.k}`, kok = dugum ? null : yer[`${s.id}|root|${String(i + 1)}`];
      const fs = nesneMi(kok) && nesneMi(kok['fasonSiparis']) ? kok['fasonSiparis'] : null;
      const tarih = dugum ? dugum[a.k] : fs?.['tarih'];
      if (typeof tarih !== 'string' || tarih.length < 10) return;
      const no = typeof fs?.['siparisNo'] === 'string' ? fs['siparisNo'] : null, e = elle[id];
      const elleGun = typeof e === 'string' && e.slice(0, 10) !== tarih ? e.slice(0, 10) : null;
      y[id] = {
        yazi: elleGun !== null ? `Firma ${gunAy(tarih)} · elle ${gunAy(elleGun)}, plan firma tarihine göre` : `Firma tarihi ${gunAy(tarih)}${no !== null ? ` · sipariş ${no}` : ''}`,
        gecti: tarih < bugun, gun: gunAy(tarih),
      };
    });
  }
  return y;
}
