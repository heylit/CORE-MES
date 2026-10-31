import { muayeneNumunePlani, type MuayenePlani } from '../../../../../../arkon/web/src/data/muayene-lotu.ts';
import { ISTASYONSUZ_GONDERIM, istasyonsuzMu, rotaEksigi } from '../../../../../../arkon/web/src/data/tmi-plan.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import type { Plant, Policy } from '../cekirdek/tipler.ts';
import { istasyonBul } from '../cekirdek/tesis.ts';
import type {
  IsKurallari, KaliteKurallari, KuralSablonu, NumuneKurali, NumuneZamani, Olcen, OpType, Pkg, PlanItem, Result, Takim, Ton, Uyari,
  UyariSeviyesi, UyariZamani, UretimKurallari,
} from './tipler.ts';

// Hazırlığın saf hesapları (eski kurallar.ts, istasyonlar.ts, hazirlik.ts ve operator-parcalar.ts'deki numune planı). Ekran ve
// operatör ekranı aynı işlevleri kullanır; eski işlevlerle eşitliği kurallar.test.ts sınar.

// Kayıt kimliği yalnız aynı paketin içinde ayırt eder (uyarı, takım, adım); güvenlik değeri taşımaz.
export const yeniKimlik = (): string => Math.random().toString(36).slice(2, 9);

/* ── iş kuralları ── */
export const UYARI_ZAMANLARI: readonly (readonly [UyariZamani, string])[] = [
  ['start', 'İş başında'], ['every', 'Her N parçada'], ['interval', 'Her N dakikada'], ['tool', 'Takım değişiminde'], ['shift', 'Vardiya başında'],
];
export const SEVIYELER: Readonly<Record<UyariSeviyesi, { l: string; ton: Ton; simge: SimgeAdi }>> = {
  info: { l: 'Bilgi', ton: 'done', simge: 'bell' }, warn: { l: 'Dikkat', ton: 'hazard', simge: 'alert' }, crit: { l: 'Kritik', ton: 'stop', simge: 'alert' },
};
export const HAZIR_UYARILAR: readonly Omit<Uyari, 'id'>[] = [
  { t: 'Ayna sıkma basıncı 32 bar olmalı · kontrol et', lvl: 'warn', when: 'start', ack: true },
  { t: 'Çapakları al, keskin kenarları kır', lvl: 'info', when: 'every', n: 50, ack: false },
  { t: 'Bor yağı konsantrasyonu %6–8 · refraktometre ile ölç', lvl: 'info', when: 'shift', ack: true },
  { t: 'Kritik ölçü Ø40 H7 · her parçada tampon mastar', lvl: 'crit', when: 'start', ack: true },
  { t: 'Yeni takımın ofsetini ilk parçada doğrula', lvl: 'warn', when: 'tool', ack: true },
  { t: 'Koruyucu gözlük ve eldiven zorunlu', lvl: 'warn', when: 'shift', ack: true },
  { t: 'Talaş konveyörünü boşalt', lvl: 'info', when: 'interval', n: 120, ack: false },
];
// Numune zamanı gelince istek kendiliğinden kaliteye düşer: operatör düğmeye basmayı unutunca numune kaçıyordu.
export const VARSAYILAN_KALITE: KaliteKurallari = { who: 'quality', firstPiece: true, nok: 'warn', band: 80, critTwice: false, autoSend: true };
export const VARSAYILAN_URETIM: UretimKurallari = { scrapPct: 3, scrapMin: 20, maxPauseMin: 15, tools: [] };

type KuralKaydi = { warns?: Uyari[]; q?: Partial<KaliteKurallari>; prod?: Partial<UretimKurallari> } | null | undefined;

export function isKurallari(p: { rules?: unknown } | null | undefined): IsKurallari {
  const r: NonNullable<KuralKaydi> = ((p && p.rules) as KuralKaydi) || {};
  return {
    warns: r.warns || [],
    q: { ...VARSAYILAN_KALITE, ...r.q },
    prod: { ...VARSAYILAN_URETIM, ...r.prod, tools: (r.prod && r.prod.tools) || [] },
  };
}

// Ölçü toleransın kenarına yakın mı: band 80 ise orta noktadan uzaklık yarı aralığın %80'ini geçince yüzde döner, değilse 0.
export function sinirYakin(b: Pick<PlanItem, 'min' | 'max' | 'gauge'> | null | undefined, v: unknown, band: number): number {
  if (!band || !b || b.gauge || typeof v !== 'number' || !(b.max > b.min) || b.max > b.min + 500) return 0;
  const orta = (b.min + b.max) / 2, yari = (b.max - b.min) / 2, r = Math.abs(v - orta) / yari;
  return r >= band / 100 && r <= 1 + 1e-9 ? Math.round(r * 100) : 0;
}

export const parcaAilesi = (p: Pick<Pkg, 'partNo' | 'part'>): string => ((p.partNo || p.part || '').match(/^[A-Za-zÇĞİÖŞÜçğıöşü]+/) || [''])[0]!.toUpperCase();
export const kuralOzeti = (R: IsKurallari): string => [
  R.warns.length + ' uyarı', R.prod.tools.length + ' takım', R.q.who === 'operator' ? 'operatör ölçer' : 'kalite ölçer',
  R.q.nok === 'call' ? 'redde kalite çağır' : 'redde uyar',
].join(' · ');
export const kurallariKopyala = (R: IsKurallari, kimlik: () => string = yeniKimlik): IsKurallari => ({
  warns: R.warns.map((w) => ({ ...w, id: kimlik() })), q: { ...R.q },
  prod: { ...R.prod, tools: R.prod.tools.map((t): Takim => ({ ...t, id: kimlik() })) },
});
// Yeni paket: istasyon > parça ailesi > genel sırasıyla "otomatik uygula" işaretli şablon.
export function varsayilanSablon(sablonlar: readonly KuralSablonu[], p: Pick<Pkg, 'machine' | 'partNo' | 'part'>): KuralSablonu | null {
  const d = sablonlar.filter((t) => t.def);
  return d.find((t) => t.scope === 'machine' && t.key === p.machine) || d.find((t) => t.scope === 'family' && t.key && t.key === parcaAilesi(p))
    || d.find((t) => t.scope === 'all') || null;
}

/* ── istasyon tipleri ── */
export interface IsTuruTanimi { l: string; short: string; simge: SimgeAdi; cnt: string; unit: string; tab?: string; d: string }
export const IS_TURLERI: Readonly<Record<OpType, IsTuruTanimi>> = {
  cnc: { l: 'Talaşlı imalat', short: 'Talaşlı', simge: 'cpu', cnt: 'İyi parça', unit: 'adet', d: 'Torna, freze, pres · resim, ölçü, numune' },
  kalite: { l: 'Kalite kontrol', short: 'Muayene', simge: 'search', cnt: 'Muayene', unit: 'parça', tab: 'Muayene', d: 'Numune ölçümü, görsel kusur, lot kararı' },
  depo: { l: 'Depo · toplama', short: 'Toplama', simge: 'truck', cnt: 'Toplanan', unit: 'kalem', tab: 'Toplama listesi', d: 'Toplama / mal kabul listesi, raf yeri, kod okutma' },
  mark: { l: 'Markalama', short: 'Markala', simge: 'tag', cnt: 'Markalanan', unit: 'parça', tab: 'Markalama', d: 'Seri no, lazer / damga / etiket, QR doğrulama' },
  boya: { l: 'Boya · kaplama', short: 'Boya', simge: 'drop', cnt: 'Boyanan', unit: 'parça', tab: 'Boya', d: 'Renk, ortam, fırın süresi, kaplama kalınlığı' },
  montaj: { l: 'Montaj', short: 'Montaj', simge: 'box', cnt: 'Monte edilen', unit: 'ünite', tab: 'Montaj', d: 'Kit listesi, parça izlenebilirliği, tork' },
};
export const isTuru = (p: { opType?: unknown } | null | undefined): OpType =>
  p && typeof p.opType === 'string' && Object.hasOwn(IS_TURLERI, p.opType) ? (p.opType as OpType) : 'cnc';

// RAL renk kartı: değer kayda yazılan renktir (operatöre örnek olarak gösterilir), tasarım rengi değildir.
export const RAL: Readonly<Record<string, readonly [string, string]>> = {
  '9005': ['Siyah', '#0a0a0a'], '9010': ['Saf beyaz', '#f1ece1'], '9016': ['Trafik beyazı', '#f1f0ea'], '7016': ['Antrasit gri', '#383e42'],
  '7021': ['Siyah gri', '#2f3234'], '7035': ['Açık gri', '#cbd0cc'], '7040': ['Pencere grisi', '#9da3a6'], '9006': ['Beyaz alüminyum', '#a5a8a6'],
  '3020': ['Trafik kırmızısı', '#c1121c'], '5010': ['Gentiyan mavisi', '#0e4c92'], '5015': ['Gök mavisi', '#2271b3'], '6005': ['Yosun yeşili', '#0f4336'],
  '1023': ['Trafik sarısı', '#f7b500'], '2004': ['Saf turuncu', '#f44611'],
};

export interface DepoKalemi { id: string; code: string; name: string; qty: number; unit: string; loc: string }
export interface MontajKalemi { id: string; code: string; name: string; qty: number; trace: boolean }
export interface TorkAdimi { id: string; name: string; nm: number; tol: number }
export interface IstasyonAyari {
  // kalite
  lot: number; n: number; ac: number; defects: string[];
  // depo
  mode: 'pick' | 'receive'; items: DepoKalemi[];
  // markalama ve montaj
  fmt: string; start: number; method: string; pos: string; verify: boolean; bom: MontajKalemi[]; torque: TorkAdimi[];
  // boya
  ral: string; name: string; hex: string; type: string; layers: number; dftMin: number; dftMax: number; cureT: number; cureMin: number;
  envTmin: number; envTmax: number; rhMax: number; rack: number;
}
export const VARSAYILAN_AYARLAR: Readonly<Record<OpType, () => Partial<IstasyonAyari>>> = {
  cnc: () => ({}),
  kalite: () => ({ lot: 200, n: 8, ac: 0, defects: ['Çizik', 'Ezik', 'Çapak', 'Eksik işlem', 'Pas / leke', 'Yanlış malzeme'] }),
  depo: () => ({ mode: 'pick', items: [] }),
  mark: () => ({ fmt: '{PARCA}-{YY}{WW}-{SEQ:5}', start: 1, method: 'lazer', pos: '', verify: true }),
  boya: () => ({
    ral: '7016', name: 'Antrasit gri', hex: '#383e42', type: 'Toz', layers: 1, dftMin: 60, dftMax: 90, cureT: 200, cureMin: 12, envTmin: 15, envTmax: 30,
    rhMax: 70, rack: 20,
  }),
  montaj: () => ({ bom: [], torque: [], fmt: '{PARCA}-{YY}{WW}-{SEQ:4}', start: 1 }),
};
// Operatör, düzenleyici ve doğrulama aynı lotu görsün diye türetme tek yerdedir. Türe ait olmayan alan kayıtta yoksa tanımsızdır.
export function istasyonAyari(p: Pick<Pkg, 'st' | 'opType' | 'id' | 'target'> | null | undefined): IstasyonAyari {
  const t = isTuru(p);
  const c = { ...VARSAYILAN_AYARLAR[t](), ...((p && p.st) || {}) } as IstasyonAyari;
  return t === 'kalite' ? (muayeneNumunePlani(p, c as unknown as MuayenePlani) as unknown as IstasyonAyari) : c;
}

export function isoHafta(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const gun = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - gun);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((+t - +y0) / 864e5 + 1) / 7);
}
// Seri numarası şablonu: {PARCA} {IE} {REV} {YY} {YYYY} {MM} {WW} {DD} {SEQ:n}.
export function seriNo(f: string | null | undefined, sira: number, p: Partial<Pick<Pkg, 'partNo' | 'part' | 'no' | 'rev'>> | null | undefined, d: Date = new Date()): string {
  const iki = (v: number) => String(v).padStart(2, '0');
  return String(f || '{PARCA}-{SEQ:5}').replace(/\{(\w+)(?::(\d+))?\}/g, (m: string, k0: string, n?: string) => {
    const k = k0.toUpperCase();
    if (k === 'SEQ') return String(sira).padStart(Number(n) || 4, '0');
    if (k === 'YY') return String(d.getFullYear()).slice(2);
    if (k === 'YYYY') return String(d.getFullYear());
    if (k === 'MM') return iki(d.getMonth() + 1);
    if (k === 'DD') return iki(d.getDate());
    if (k === 'WW') return iki(isoHafta(d));
    if (k === 'PARCA') return String((p && (p.partNo || p.part)) || 'PRC').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (k === 'IE') return String((p && p.no) || '').replace(/\D/g, '').slice(-5);
    if (k === 'REV') return (p && p.rev) || '';
    return m;
  });
}
// Çiğ noktası (Magnus): boya ortamı ölçümünde gösterilir.
export const cigNoktasi = (t: number, rh: number): number => {
  const a = 17.62, b = 243.12, g = Math.log(Math.max(1, rh) / 100) + a * t / (b + t);
  return b * g / (a - g);
};
// Ondalık virgülle de yazılır; sayı değilse NaN.
export const ondalik = (s: unknown): number => parseFloat(String(s ?? '').replace(',', '.'));

/* ── paket ── */
export const SIKLIKLAR = ['İlk parça', 'Her 10 parça', 'Her 50 parça', 'Saatlik', 'Vardiya başı', 'Son parça'] as const;
export type PaketDurumu = 'draft' | 'review' | 'published' | 'production' | 'done';
// Bu iş paketinin durumudur, üretim emrinin değil: ad "Paket:" ile başlar ki emir durumuyla karışmasın (1417 a).
export const PAKET_DURUMLARI: Readonly<Record<PaketDurumu, { l: string; ton: Ton }>> = {
  draft: { l: 'Paket: Taslak', ton: 'idle' }, review: { l: 'Paket: Onayda', ton: 'done' }, published: { l: 'Paket: Yayında', ton: 'run' },
  production: { l: 'Paket: Üretimde', ton: 'hazard' }, done: { l: 'Paket: Tamamlandı', ton: 'done' },
};
// Paket kartındaki durum: üretimden sonuç geldiyse ona göre.
export function paketKartDurumu(p: Pick<Pkg, 'status'>, r: Pick<Result, 'state'> | null | undefined): PaketDurumu {
  if (r && r.state === 'done') return 'done';
  if (r && r.state && r.state !== 'queued' && p.status !== 'draft') return 'production';
  return (Object.hasOwn(PAKET_DURUMLARI, p.status) ? p.status : 'draft') as PaketDurumu;
}
export const ADIM_SABLONLARI: Readonly<Record<string, readonly { t: string; d: string; r: boolean }[]>> = {
  'CNC ilk parça': [
    { t: 'Ayna / pens ve sıkma basıncını kontrol et', d: 'Sıkma basıncı talimattaki değerde', r: true },
    { t: 'Takım ofsetlerini ve programı doğrula', d: 'Program no ve takım listesi iş paketindeki ile aynı', r: true },
    { t: 'İlk parçayı ölç ve kaliteye onaylat', d: 'Kontrol planındaki "İlk parça" noktaları', r: true },
    { t: 'Talaş konveyörünü boşalt', d: 'Her 250 parçada bir', r: false },
  ],
  'Pres kalıp': [
    { t: 'Kalıp bağlantı cıvatalarını kontrol et', d: 'Tork değerleri kalıp kartında', r: true },
    { t: 'Sac kalınlığını ölç', d: 'Malzeme sertifikası ile karşılaştır', r: true },
    { t: 'İlk 3 parçayı gözle ve mastarla kontrol et', d: 'Çapak, ezik, çatlak', r: true },
  ],
};
// Rotalı TMI emrinin iş emri paketi: emir, operasyon, istasyon, adet, süreler, termin ve öncelik TMI planından gelir, burada değişmez.
export const tmiIsEmri = (p: { id?: unknown } | null | undefined): boolean => String((p && p.id) || '').startsWith('tmi-ie-');
export const TMI_KILIT = 'TMI planından gelir';

/* ── yayın onayı: kural açıksa paket son değişikliğinden sonra kalitece onaylanmadan yayınlanamaz ── */
type OnayAlanlari = Pick<Pkg, 'approval' | 'apReq' | 'updatedAt'>;
export const onayli = (p: OnayAlanlari | null | undefined): boolean => !!(p && p.approval && p.approval.ok && p.approval.at >= (p.updatedAt || 0));
export const onayReddedildi = (p: OnayAlanlari | null | undefined): boolean =>
  !!(p && p.approval && p.approval.ok === false && (!p.apReq || p.approval.at >= p.apReq.at));
export const onayBekliyor = (p: OnayAlanlari | null | undefined): boolean => !!(p && p.apReq && !(p.approval && p.approval.at >= p.apReq.at));
export const onayGerekir = (p: OnayAlanlari | null | undefined, kurallar: Pick<Policy, 'approval'>): boolean => kurallar.approval && !onayli(p);

/* ── numune planı: ne zaman, kim ölçer (sırayla döner), hangi ölçüler ── */
export const NUMUNE_ZAMANLARI: Readonly<Record<NumuneZamani, string>> = {
  first: 'İlk parça', every: 'Her N parça', time: 'Her N dakika', shift: 'Vardiya başı', last: 'Son parça',
};
export const OLCENLER: Readonly<Record<Olcen, { l: string; ton: Ton; simge: SimgeAdi }>> = {
  q: { l: 'Kalite', ton: 'done', simge: 'target' }, op: { l: 'Operatör', ton: 'run', simge: 'ruler' },
};
export const siklikAdedi = (f: string | null | undefined): number => { const m = /Her (\d+) parça/.exec(f || ''); return m ? Number(m[1]) : 0; };
export const numuneEtiketi = (r: Pick<NumuneKurali, 'when' | 'n'>): string =>
  r.when === 'every' ? 'Her ' + r.n + ' parça' : r.when === 'time' ? 'Her ' + r.n + ' dk' : NUMUNE_ZAMANLARI[r.when];
export const siradakiOlcen = (r: Pick<NumuneKurali, 'who'>, k: number): Olcen => {
  const w = r.who && r.who.length ? r.who : (['q'] as Olcen[]);
  return w[((k % w.length) + w.length) % w.length]!;
};
// Paketin numune planı. Eski paketlerde ölçü başına sıklıktan ve "kim ölçer" kuralından türetilir.
export function numunePlani(p: Pick<Pkg, 'samp' | 'plan' | 'rules'> | null | undefined): NumuneKurali[] {
  if (!p) return [];
  if (p.samp && p.samp.length) return p.samp as NumuneKurali[];
  const R = isKurallari(p), who: Olcen[] = [R.q.who === 'operator' ? 'op' : 'q'], g: Record<string, number[]> = {};
  (p.plan || []).forEach((b) => { const f = b.freq || 'İlk parça'; (g[f] = g[f] || []).push(b.id); });
  return Object.keys(g).map((f, i): NumuneKurali => {
    const n = siklikAdedi(f), r = { id: 'lg' + i, who, items: g[f]! };
    if (f === 'İlk parça') return { ...r, when: 'first', gate: R.q.firstPiece };
    if (n) return { ...r, when: 'every', n };
    if (f === 'Saatlik') return { ...r, when: 'time', n: 60 };
    if (f === 'Vardiya başı') return { ...r, when: 'shift' };
    return { ...r, when: 'last' };
  });
}
export const numuneOlculeri = <T extends Pick<PlanItem, 'id' | 'crit'>>(p: { plan?: T[] }, r: Pick<NumuneKurali, 'items'>): T[] =>
  (p.plan || []).filter((b) => (r.items === 'crit' ? b.crit : Array.isArray(r.items) ? r.items.includes(b.id) : true));

export const HAZIR_NUMUNE_PLANLARI: readonly { l: string; r: readonly Omit<NumuneKurali, 'id'>[] }[] = [
  { l: 'İlk parça kalite · her 50 operatör · son parça kalite', r: [{ when: 'first', who: ['q'], items: 'all', gate: true }, { when: 'every', n: 50, who: ['op'], items: 'all' }, { when: 'last', who: ['q'], items: 'all' }] },
  { l: 'İlk parça kalite · her 25 sırayla kalite → operatör', r: [{ when: 'first', who: ['q'], items: 'all', gate: true }, { when: 'every', n: 25, who: ['q', 'op'], items: 'all' }] },
  { l: 'İlk parça kalite · kritikler saatlik operatör · vardiya başı kalite', r: [{ when: 'first', who: ['q'], items: 'all', gate: true }, { when: 'time', n: 60, who: ['op'], items: 'crit' }, { when: 'shift', who: ['q'], items: 'all' }] },
];
// 700 a: sıklık işin adedine eşit ya da büyükse sayım ara numuneye hiç ulaşmaz (25 parçalık işte her 50). Kural değişmez; ara numune işin
// ortasında bir kez istenir. Adet bilinmiyorsa kural olduğu gibi işler. Terminal sayacı ve önizleme aynı hesabı kullanır.
export function araNumuneSikligi(n: number | undefined, adet: number): { n: number; tek: boolean } {
  const N = Math.max(1, n || 50);
  const T = Math.floor(adet);
  return T >= 1 && N >= T ? { n: Math.ceil(T / 2), tek: true } : { n: N, tek: false };
}
export interface NumuneOlayi { at: number; ri: number; who: Olcen; k: number }
// Numune olaylarının parça ekseninde dağılımı (önizleme); en çok 600 olay.
export function numuneOlaylari(kurallar: readonly NumuneKurali[], hedef: number, cevrim: number): NumuneOlayi[] {
  const ev: NumuneOlayi[] = [], T = Math.max(1, hedef || 1), cy = Math.max(1, cevrim || 30);
  kurallar.forEach((r, ri) => {
    const ekle = (at: number, k: number) => { if (at >= 1 && at <= T && ev.length < 600) ev.push({ at, ri, who: siradakiOlcen(r, k), k }); };
    if (r.when === 'first') ekle(1, 0);
    else if (r.when === 'last') ekle(T, 0);
    // Terminal sıklığın tam katında numune ister, son parça da olsa; önizleme de onu gösterir.
    else if (r.when === 'every') { const a = araNumuneSikligi(r.n, T); for (let k = 1; k * a.n <= T && (!a.tek || k === 1); k++) ekle(k * a.n, k - 1); }
    else if (r.when === 'time') { const N = Math.max(1, Math.round((r.n || 60) * 60 / cy)); for (let k = 1; k * N < T; k++) ekle(k * N, k - 1); }
    else if (r.when === 'shift') { const N = Math.max(1, Math.round(28800 / cy)); for (let k = 0; k * N < T; k++) ekle(Math.max(1, k * N), k); }
  });
  return ev;
}
// Numune planını yazar. Ölçülerin "sıklık" etiketi kurallardan yazılır: operatör ve kalite ekranları bunu gösterir.
export function numunePlaniYaz(p: Pick<Pkg, 'plan'>, rs: readonly NumuneKurali[]): { samp: NumuneKurali[]; plan: PlanItem[] } {
  const plan = p.plan.map((b) => {
    const ls = rs.filter((r) => numuneOlculeri({ plan: [b] }, r).length)
      .map((r) => numuneEtiketi(r) + ' · ' + (r.who || ['q']).map((w) => OLCENLER[w].l).join('→'));
    return { ...b, freq: ls.length ? ls.join(' + ') : 'Numune planında yok' };
  });
  return { samp: rs.map((r) => ({ ...r })), plan };
}

/* ── yayın öncesi kontrol ── */
export interface Denetim { k: string; ok: boolean; l: string; d: string; soft?: boolean }
export function istasyonDenetimi(p: Pick<Pkg, 'st' | 'opType' | 'id' | 'target' | 'partNo' | 'part' | 'no' | 'rev'>): Denetim[] {
  const t = isTuru(p), c = istasyonAyari(p);
  if (t === 'depo') return [{ k: 'st', ok: (c.items || []).length > 0 && c.items.every((i) => !!i.code && i.qty > 0), l: 'Toplama listesi', d: (c.items || []).length + ' kalem · her kalemde kod ve miktar' }];
  if (t === 'mark') return [{ k: 'st', ok: /\{SEQ(:\d+)?\}/i.test(c.fmt || ''), l: 'Seri numarası şablonu', d: c.fmt ? seriNo(c.fmt, c.start, p) : 'Şablonda {SEQ} olmalı' }];
  if (t === 'boya') return [{ k: 'st', ok: !!c.ral && c.dftMax > c.dftMin && c.cureMin > 0, l: 'Boya parametreleri', d: 'RAL ' + c.ral + ' · ' + c.dftMin + '–' + c.dftMax + ' µm · ' + c.cureT + '°C ' + c.cureMin + ' dk' }];
  if (t === 'montaj') return [{ k: 'st', ok: (c.bom || []).length > 0, l: 'Montaj parça listesi', d: (c.bom || []).length + ' parça · ' + (c.torque || []).length + ' tork' }];
  if (t === 'kalite') return [{ k: 'st', ok: c.n > 0 && c.lot >= c.n, l: 'Numune planı', d: 'Lot ' + c.lot + ' · numune ' + c.n + ' · Ac ' + c.ac }];
  return [];
}
// 1307 b: talaşlı işte kontrol planı eksik görevdir, gönderimi durdurmaz; gönderen uyarıyı onaylar ve onay yayın geçmişine yazılır.
// Kalite muayenesinde plan zorunlu kalır; öteki iş türlerinde isteğe bağlıdır (uyarı sorulmaz).
export const PLAN_YOK_UYARISI = 'Eksik · gönderirken uyarı onayı istenir';
export const planYokUyarisiGerekir = (p: Pick<Pkg, 'opType' | 'plan'>): boolean => isTuru(p) === 'cnc' && p.plan.length === 0;

export function paketDenetimi(p: Pkg, tesis: Plant): Denetim[] {
  const pdf = p.files.find((f) => f.kind === 'pdf'), mdl = p.files.find((f) => f.kind === 'model'), ty = isTuru(p), turlu = ty !== 'cnc';
  const rota = rotaEksigi(p);
  return istasyonDenetimi(p).concat([
    { k: 'info', ok: !istasyonsuzMu(p), l: 'İstasyon seçildi', d: istasyonsuzMu(p) ? ISTASYONSUZ_GONDERIM : istasyonBul(tesis, p.machine).name || p.machine },
    ...(rota ? [{ k: 'info', ok: false, l: 'Rotada girdi seçildi', d: rota + ' · Reçete ve Rota\'da tamamlayın' }] : []),
    { k: 'info', ok: !!(p.no && p.part && p.rev && p.op && p.target > 0), l: 'İş emri bilgileri tam', d: 'No, parça adı, revizyon, operasyon ve hedef adet' },
    {
      k: 'docs', ok: !!p.primary, l: 'Ana teknik resim seçildi',
      d: pdf ? pdf.name : mdl ? mdl.name + ' (modelden resim)' : turlu ? 'İsteğe bağlı · bu iş türünde resim şart değil' : 'PDF veya 3B model ekle', soft: turlu,
    },
    { k: 'docs', ok: !!mdl, l: '3B model eklendi', d: mdl ? mdl.name : 'İsteğe bağlı · STEP önerilir', soft: true },
    {
      k: 'plan', ok: p.plan.length > 0, l: 'Kontrol planı hazır',
      d: p.plan.length ? p.plan.length + ' nokta · ' + p.plan.filter((b) => b.crit).length + ' kritik'
        : ty === 'kalite' ? 'En az bir kontrol noktası' : ty === 'cnc' ? PLAN_YOK_UYARISI : 'İsteğe bağlı',
      soft: ty !== 'kalite',
    },
    { k: 'steps', ok: p.steps.length > 0, l: 'Operasyon adımları', d: p.steps.length ? p.steps.length + ' adım · ' + p.steps.filter((s) => s.r).length + ' zorunlu' : 'En az bir adım' },
  ]);
}

/* ── istasyon panellerinin hesapları ── */
// Toplama: kalem tamam (toplanan >= miktar) ya da eksik bildirildi.
export const kalemBitti = (it: Pick<DepoKalemi, 'id' | 'qty'>, toplanan: Readonly<Record<string, number>>, eksik: Readonly<Record<string, unknown>>): boolean =>
  (toplanan[it.id] || 0) >= it.qty || !!eksik[it.id];
// Okutulan koda uyan kalem: önce tam eşleşme, sonra kodu içeren.
export function kodaUyanKalem<T extends Pick<DepoKalemi, 'code'>>(kalemler: readonly T[], kod: string): T | null {
  const sade = (s: string) => s.toUpperCase().replace(/\s+/g, '');
  const c = sade(kod.trim());
  return kalemler.find((i) => sade(String(i.code)) === c) || kalemler.find((i) => c.indexOf(sade(String(i.code))) >= 0) || null;
}
// Eksik kalemler önce değil sonra; aynı durumda raf sırası.
export const toplamaSirasi = <T extends DepoKalemi>(kalemler: readonly T[], bitti: (it: T) => boolean): T[] =>
  kalemler.slice().sort((a, b) => (Number(bitti(a)) - Number(bitti(b))) || String(a.loc).localeCompare(String(b.loc), 'tr'));
export const torkUygun = (t: Pick<TorkAdimi, 'nm' | 'tol'>, v: number | null | undefined): boolean => v != null && Math.abs(v - t.nm) <= t.tol + 1e-9;
export const olcuUygun = (b: Pick<PlanItem, 'min' | 'max'>, v: number): boolean => v >= b.min - 1e-9 && v <= b.max + 1e-9;
// Excel'den yapıştırılan toplama satırları: sekme ya da noktalı virgülle kod, ad, miktar, birim, raf.
export function yapistirilanKalemler(metin: string, kimlik: () => string = yeniKimlik): DepoKalemi[] {
  return metin.split(/\r?\n/).map((l) => l.split(/\t|;/).map((s) => s.trim())).filter((r) => r[0])
    .map((r) => ({ id: kimlik(), code: r[0]!, name: r[1] || '', qty: Number(String(r[2] || '1').replace(',', '.')) || 1, unit: r[3] || 'adet', loc: r[4] || '' }));
}
// Ölçüm yöntemi (teknik-resim.ts methOf): satırda yazılı değilse aleti CMM olan ölçü CMM'dir.
export const olcumYontemi = (b: Pick<PlanItem, 'm' | 'tool'>): 'cmm' | 'man' => b.m || (b.tool === 'CMM' ? 'cmm' : 'man');
