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
export interface KokpitAdimi { id: string; ad: string; adaylar: string[] }
export interface KokpitEmri {
  id: string; no: string; urun: string; adet: number;
  termin: number | null; bitis: number | null;
  durum: EmirDurumu;
  // Artı: terminden sonra biter (saat). Plansızda ve terminsizde null.
  gecikme: number | null;
  adimlar: KokpitAdimi[];
}
export interface KokpitTezgahi { id: string; kod: string; ad: string; fason: boolean }
export interface KokpitModeli {
  simdi: number;
  tezgahlar: KokpitTezgahi[];
  isler: Record<string, KokpitIsi>;
  emirler: KokpitEmri[];
  // Tahtanın ekseni: bugünün 00:00'ı ve son işin bittiği günün sonu (en az iki hafta).
  bas: number; son: number;
  // Tezgâhın açık saat pencereleri (hamle adayı açık saate oturur); bilinmeyen tezgâh hep açık sayılır.
  acik: Record<string, readonly (readonly [number, number])[]>;
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
      isler[a.id] = { id: a.id, job: j.id, ad: a.ad, m: x.m, S: x.S, C: x.C, basladi: x.act, fason: x.fas || fasonMu(x.m), kilitli: x.pin, sira };
      bitis = bitis === null ? x.C : Math.max(bitis, x.C);
      enSon = Math.max(enSon, x.C);
    });
    const plansiz = j.ops.length > 0 && yerlesen < j.ops.length;
    const gecikme = plansiz || bitis === null || j.due === null ? null : bitis - j.due;
    const durum: EmirDurumu = plansiz ? 'plansiz' : gecikme === null ? 'iyi' : gecikme > 0.01 ? 'gec' : gecikme > -RISK_SAATI ? 'risk' : 'iyi';
    if (!j.ops.length) continue;
    emirler.push({
      id: j.id, no: emirNo(j.id), urun: urunAdi.get(s?.urun ?? '') ?? s?.ad ?? '', adet: j.adet, termin: j.due, bitis: plansiz ? null : bitis, durum, gecikme,
      adimlar: j.ops.map((a) => ({ id: a.id, ad: a.ad, adaylar: a.c })),
    });
  }
  const tezgahlar: KokpitTezgahi[] = c.D.tezgahlar.filter((t) => cx.M[t.id]).map((t) => ({ id: t.id, kod: t.kod ?? t.id, ad: t.ad ?? '', fason: false }));
  if (Object.values(isler).some((x) => x.fason)) tezgahlar.push({ id: FASON_SATIRI, kod: 'Fason', ad: 'dış atölye', fason: true });
  const bas = Math.floor(simdi / 24) * 24;
  const acik = Object.fromEntries(Object.values(cx.M).map((t) => [t.id, t.sw]));
  return { simdi, tezgahlar, isler, emirler, bas, son: Math.max(bas + 14 * 24, Math.ceil(enSon / 24) * 24 + 24), acik };
}

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
export const yukYuzdesi = (y: GunYuku): number | null => (y.acik > 0 ? Math.round((y.plan / y.acik) * 100) : null);

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
export interface TurAdayi { isId: string; tezgah: string; baslangic: number; planaAl?: string }
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
