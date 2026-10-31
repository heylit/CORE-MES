import { kalanAdet } from '../../../../../../arkon/web/src/data/sayac-halkasi.ts';
import { istasyonPaketleri, istasyonPlanOzeti, planOnce, tmiPlani, type PlanliPaket } from '../../../../../../arkon/web/src/data/tmi-plan.ts';
import { anlikPencereler } from '../../../../../../arkon/web/src/data/vardiya-gunu.ts';
import type { LogCall, LogCount, LogEvent, Maint, Pkg, PlannedDown, Result } from '../../../../../../arkon/shared/model.ts';
import type { MakineDurumu } from '../../../../ortak/arayuz/index.ts';
import { formulKoru } from '../../../../ortak/veri/csv.ts';
import { planliNedenMi, type ArkonAyarlari } from '../cekirdek/ayarlar.ts';
import { gunAySaat, saat } from '../cekirdek/bicim.ts';
import { oeeHesapla, type OeeSonucu } from '../cekirdek/oee.ts';
import { IS_DURUMLARI, type IsDurumu } from '../cekirdek/sabitler.ts';
import { aktif, isMerkeziBul, istasyonBul, istasyonListesi, type IstasyonSatiri } from '../cekirdek/tesis.ts';
import {
  anlikVardiya, durusGerceklesmeleri, durusPencereleri, siradakiDurus, suankiDurus, vardiyaPencereleri,
  type AnlikVardiya, type DurusGerceklesmesi,
} from '../cekirdek/vardiya.ts';

// Pano, Plan Kuyruğu ve planlı duruş hesapları (pano-planlama.ts). Ekran yalnız bunları çağırır; eski işlevlerle eşitliği
// esitlik.test.ts sınar. Eski ekranda ayarlar modül değişkenindeydi, burada girdi olarak verilir.

export type TakvimAyarlari = Pick<ArkonAyarlari, 'vardiyalar' | 'tatiller' | 'planliDuruslar' | 'tesis'>;
export type Renk = 'run' | 'stop' | 'hold' | 'done' | 'idle' | 'hazard' | 'cmm';

const GUN = 864e5;

// ---- Çağrılar ----------------------------------------------------------------------------------------------------------
export interface Cagri {
  id: string; team: string; machine: string; wc?: string | null;
  open?: number; ack?: number; esc?: number; done?: number; cancel?: number;
  by?: string | null; note?: string | null; ackBy?: string | null;
}
type CagriSatiri = Pick<LogCall, 'callId' | 'team' | 'phase' | 'at' | 'note' | 'userName'> & { machine?: string | null; wc?: string | null };

// Çağrı kayıtları çağrı başına toplanır; açılışı görülmeyen çağrı listeye girmez (callsFrom).
export function cagrilariTopla(satirlar: readonly CagriSatiri[] | null | undefined): Cagri[] {
  const by = new Map<string, Cagri>();
  for (const r of satirlar ?? []) {
    let c = by.get(r.callId);
    if (!c) { c = { id: r.callId, team: r.team, machine: r.machine ?? '', wc: r.wc ?? null }; by.set(r.callId, c); }
    c[r.phase] = Math.min(c[r.phase] || Infinity, r.at);
    if (r.phase === 'open') { c.by = r.userName ?? null; c.note = r.note ?? null; }
    if (r.phase === 'ack') c.ackBy = r.userName ?? null;
  }
  return [...by.values()].filter((c) => c.open);
}
const ONIKI_SAAT = 12 * 3600e3;
export const acikCagriMi = (c: Cagri, simdi: number): boolean => !c.done && !c.cancel && simdi - (c.open ?? 0) < ONIKI_SAAT;

// ---- İstasyon durumu -------------------------------------------------------------------------------------------------
export interface IstasyonGorunumu { durum: MakineDurumu; etiket: string }
// Planlı nedenle duruş "Planlı duruş" yazar (rengi bitti); kaydı olmayan ya da bilinmeyen durum "Veri yok" (stLook).
export function istasyonGorunumu(durum: string, neden: string | null | undefined, planli: boolean | null | undefined, planliMi: (k: string | null | undefined) => boolean): IstasyonGorunumu {
  if (durum === 'stopped' && (planli || planliMi(neden))) return { durum: 'bitti', etiket: 'Planlı duruş' };
  const d = Object.hasOwn(IS_DURUMLARI, durum) ? IS_DURUMLARI[durum as IsDurumu] : null;
  if (durum === 'none' || d === null) return { durum: 'sirada', etiket: 'Veri yok' };
  return { durum: d.durum, etiket: d.etiket };
}

// ---- Fabrika panosu --------------------------------------------------------------------------------------------------
export interface PanoVerisi {
  ev: LogEvent[]; cn: LogCount[]; calls: Cagri[]; pk: Pkg[]; rs: Record<string, Result>; mt: Maint[]; sh: AnlikVardiya; at: number;
}
export interface PanoKarosu {
  s: IstasyonSatiri; last: LogEvent | null; state: string; pkg: Pkg | null; bekleyen: string | null; res: Result | null; c: OeeSonucu;
  dn: DurusGerceklesmesi | null; nx: DurusGerceklesmesi | null; calls: Cagri[]; mts: Maint[]; look: IstasyonGorunumu; since: number | null; tanimsiz: boolean;
}
export interface PanoToplami { run: number; planned: number; ideal: number; good: number; scrap: number; stop: number }
export interface PanoOzeti {
  karolar: PanoKarosu[]; toplam: PanoToplami; A: number | null; P: number | null; Q: number | null; oee: number | null;
  calisan: number; plansiz: number; planli: number; acikCagrilar: Cagri[]; yukseltilen: number;
  gruplar: { wc: string; ad: string; karolar: PanoKarosu[] }[]; arizalar: Maint[]; yaklasanDuruslar: DurusGerceklesmesi[];
}

export const oeeOrtami = (a: TakvimAyarlari & Pick<ArkonAyarlari, 'durusNedenleri'>, istasyon: string) => ({
  planliMi: (k: string | null | undefined) => planliNedenMi(a, k),
  durusPencereleri: (f: number, t: number) => durusPencereleri(istasyon, f, t, a.planliDuruslar, a.tesis),
});
export const anlikVardiyasi = (a: Pick<ArkonAyarlari, 'vardiyalar' | 'tatiller'>, t: number): AnlikVardiya => anlikVardiya(t, a.vardiyalar, a.tatiller);

const ariza = (m: Maint): m is Extract<Maint, { type: 'ariza' }> => m.type === 'ariza';
const durusPlanli = (k: Pick<PanoKarosu, 'look'>): boolean => k.look.etiket === 'Planlı duruş';

// BoardApp'in karo ve özet hesabı: iş merkezi süzgeci uygulanmış istasyonlar, vardiya OEE'si, çağrı ve arıza bayrakları.
export function panoOzeti(d: PanoVerisi, simdi: number, a: TakvimAyarlari & Pick<ArkonAyarlari, 'durusNedenleri'>, wc: string): PanoOzeti {
  const sts = istasyonListesi(a.tesis).filter((s) => !wc || s.wc === wc);
  const karolar = sts.map((s): PanoKarosu => {
    const ev = d.ev.filter((e) => e.machine === s.id);
    const last = ev[ev.length - 1] ?? null;
    const state = last ? last.state : 'none';
    const pkg = (last && d.pk.find((p) => p.id === last.pkgId)) || istasyonPaketleri(d.pk, s.id)[0] || null;
    const res = pkg ? d.rs[pkg.id] ?? null : null;
    const cn = d.cn.filter((c) => c.machine === s.id);
    const c = oeeHesapla({ ev, cn, from: d.sh.s, to: Math.min(simdi, d.sh.e), windows: anlikPencereler(d.sh) }, oeeOrtami(a, s.id));
    const dn = suankiDurus(s.id, simdi, a.planliDuruslar, a.tesis);
    const nx = dn ? null : siradakiDurus(s.id, simdi, a.planliDuruslar, a.tesis, 60 * 60e3);
    return {
      s, last, state, pkg, bekleyen: istasyonPlanOzeti(d.pk, s.id), res, c, dn, nx,
      calls: d.calls.filter((x) => x.machine === s.id && acikCagriMi(x, simdi)),
      mts: d.mt.filter((m) => ariza(m) && m.status !== 'done' && m.st === s.id),
      look: istasyonGorunumu(state, last?.reason, last?.planned, (k) => planliNedenMi(a, k)),
      since: last ? last.at : null, tanimsiz: !!d.sh.tanimsiz,
    };
  });
  const toplam = karolar.reduce((t, k) => ({
    run: t.run + k.c.run, planned: t.planned + k.c.planned, ideal: t.ideal + k.c.ideal, good: t.good + k.c.good, scrap: t.scrap + k.c.scrap, stop: t.stop + k.c.stopMs,
  }), { run: 0, planned: 0, ideal: 0, good: 0, scrap: 0, stop: 0 });
  const A = toplam.planned ? Math.min(1, toplam.run / toplam.planned) : null;
  const P = toplam.run && toplam.ideal ? Math.min(1, toplam.ideal / toplam.run) : null;
  const Q = toplam.good + toplam.scrap ? toplam.good / (toplam.good + toplam.scrap) : null;
  const wcOf = (m: string | null | undefined) => istasyonBul(a.tesis, m ?? '').wc;
  const acikCagrilar = d.calls.filter((x) => acikCagriMi(x, simdi) && (!wc || wcOf(x.machine) === wc)).sort((x, y) => (x.open ?? 0) - (y.open ?? 0));
  const gruplar: PanoOzeti['gruplar'] = [];
  for (const k of karolar) {
    let g = gruplar.find((x) => x.wc === k.s.wc);
    if (!g) { g = { wc: k.s.wc, ad: k.s.wcName || 'İş merkezi atanmamış', karolar: [] }; gruplar.push(g); }
    g.karolar.push(k);
  }
  const yaklasan: DurusGerceklesmesi[] = [];
  const gorulen = new Set<string>();
  for (const s of sts) {
    for (const w of durusPencereleri(s.id, simdi, simdi + 8 * 3600e3, a.planliDuruslar, a.tesis)) {
      const k = w.d.id + String(w.s);
      if (gorulen.has(k)) continue;
      gorulen.add(k);
      yaklasan.push(w);
    }
  }
  yaklasan.sort((x, y) => x.s - y.s);
  return {
    karolar, toplam, A, P, Q, oee: A != null && P != null && Q != null ? A * P * Q : null,
    calisan: karolar.filter((k) => k.state === 'running').length,
    plansiz: karolar.filter((k) => k.state === 'stopped' && !durusPlanli(k)).length,
    planli: karolar.filter((k) => k.dn || durusPlanli(k)).length,
    acikCagrilar, yukseltilen: acikCagrilar.filter((c) => c.esc).length, gruplar,
    arizalar: d.mt.filter((m) => ariza(m) && m.status !== 'done' && (!wc || wcOf(m.st) === wc)),
    yaklasanDuruslar: yaklasan.slice(0, 8),
  };
}

// ---- Pano grafikleri ---------------------------------------------------------------------------------------------------
// İstasyon durumu halkası her istasyonu tek sınıfa koyar; toplam istasyon sayısını verir. Özet kartlarındaki sayılar ayrı
// kalır (planlı duruş penceresindeki çalışan istasyon orada planlı da sayılır).
export type KaroSinifi = 'calisiyor' | 'plansiz' | 'planli' | 'diger';
export function karoSinifi(k: Pick<PanoKarosu, 'state' | 'dn' | 'look'>): KaroSinifi {
  if (k.state === 'running') return 'calisiyor';
  if (k.state === 'stopped' && !durusPlanli(k)) return 'plansiz';
  if (k.dn || durusPlanli(k)) return 'planli';
  return 'diger';
}
export function karoSiniflari(karolar: readonly Pick<PanoKarosu, 'state' | 'dn' | 'look'>[]): Record<KaroSinifi, number> {
  const s: Record<KaroSinifi, number> = { calisiyor: 0, plansiz: 0, planli: 0, diger: 0 };
  for (const k of karolar) s[karoSinifi(k)] += 1;
  return s;
}

// Halka: çevresi 100 olan çemberde (r = 100 / 2π) her dilim yüzdesi kadar yay; dilimler arasında ince boşluk kalır.
// Toplam sıfırsa yay çizilmez (boş halka), sıfır olan dilim atlanır. Ölçek verilirse (OEE için 1) dilimler ona göre çizilir,
// kalan yer boş kalır.
export const HALKA_YARICAP = 100 / (2 * Math.PI);
const DILIM_ARASI = 0.6;
export interface HalkaYayi { renk: Renk; dizi: string; kayma: string }
export function halkaYaylari(dilimler: readonly { deger: number; renk: Renk }[], olcek?: number): HalkaYayi[] {
  const toplam = olcek ?? dilimler.reduce((t, d) => t + Math.max(0, d.deger), 0);
  if (!(toplam > 0)) return [];
  const tekDilim = dilimler.filter((d) => d.deger > 0).length === 1;
  let kayma = 25;
  const yaylar: HalkaYayi[] = [];
  for (const d of dilimler) {
    if (!(d.deger > 0)) continue;
    const pay = Math.min(100, (d.deger / toplam) * 100);
    const yay = tekDilim ? pay : Math.max(0, pay - DILIM_ARASI);
    yaylar.push({ renk: d.renk, dizi: `${yay.toFixed(2)} ${(100 - yay).toFixed(2)}`, kayma: kayma.toFixed(2) });
    kayma -= pay;
  }
  return yaylar;
}

// Grafik kartlarının kısa listeleri: OEE'si en düşük ve vardiyada en çok iyi parça çıkaran istasyonlar (verisi olanlar).
export const enDusukOee = (karolar: readonly PanoKarosu[], adet = 3): PanoKarosu[] =>
  karolar.filter((k) => k.c.oee != null).sort((a, b) => (a.c.oee ?? 0) - (b.c.oee ?? 0)).slice(0, adet);
export const enCokUretim = (karolar: readonly PanoKarosu[], adet = 3): PanoKarosu[] =>
  karolar.filter((k) => k.c.good > 0).sort((a, b) => b.c.good - a.c.good).slice(0, adet);

// Kapsam metni: Pano yaklaşan listesi ("bütün tesis", iş merkezi adı ya da istasyon kodu).
export const kapsamKisa = (d: PlannedDown, a: Pick<ArkonAyarlari, 'tesis'>): string =>
  d.scope === 'all' ? 'bütün tesis' : d.scope === 'wc' ? (isMerkeziBul(a.tesis, d.target)?.name ?? d.target) : d.target;

// ---- Plan Kuyruğu ----------------------------------------------------------------------------------------------------
/** Termin metnini zamana çevirir: "14:30", "05.10", "05.10.2026", "Yarın 16:00", "2026-10-05 14:00" (parseDue). */
export function terminCoz(metin: unknown, taban?: number): number | null {
  const s0 = String(metin || '').trim();
  if (!s0) return null;
  const b = new Date(taban || Date.now());
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s0);
  if (m) return new Date(+m[1]!, +m[2]! - 1, +m[3]!, m[4] ? +m[4] : 23, m[5] ? +m[5] : 59).getTime();
  m = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s0);
  if (m) {
    const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : b.getFullYear();
    return new Date(y, +m[2]! - 1, +m[1]!, m[4] ? +m[4] : 23, m[5] ? +m[5] : 59).getTime();
  }
  m = /^(yarın|yarin)?\s*(\d{1,2}):(\d{2})$/i.exec(s0);
  if (m) {
    const d = new Date(b);
    d.setHours(+m[2]!, +m[3]!, 0, 0);
    if (m[1]) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  return null;
}

/** İstasyonun çalışılabilir dilimleri (vardiya − mola − planlı duruş), şimdiden 21 gün (availSlots). */
export function uygunDilimler(istasyon: string, from: number, a: TakvimAyarlari): [number, number][] {
  const to = from + 21 * GUN;
  const out: [number, number][] = [];
  for (const w of vardiyaPencereleri(from, to, a.vardiyalar, a.tatiller)) {
    const kes = [...(w.breaks ?? []), ...durusPencereleri(istasyon, w.s, w.e, a.planliDuruslar, a.tesis)].map((x): [number, number] => [x.s, x.e]).sort((x, y) => x[0] - y[0]);
    let t = Math.max(w.s, from);
    for (const [x, y] of kes) {
      if (y <= t) continue;
      if (x > t) out.push([t, Math.min(x, w.e)]);
      t = Math.max(t, y);
      if (t >= w.e) break;
    }
    if (t < w.e) out.push([t, w.e]);
  }
  return out.filter((x) => x[1] > x[0]);
}

export interface Tahmin { start: number; end: number | null }
/** Sıradaki işlerin tahmini başlangıç ve bitişi; takvime sığmayanın bitişi null (schedule). */
export function takvimle(istasyon: string, isler: readonly { ms: number }[], from: number, a: TakvimAyarlari): Tahmin[] {
  const dilimler = uygunDilimler(istasyon, from, a);
  let si = 0;
  let t = dilimler[0] ? dilimler[0][0] : from;
  return isler.map((x) => {
    let gerek = x.ms;
    let bas: number | null = null;
    while (gerek > 0 && si < dilimler.length) {
      const [p, q] = dilimler[si]!;
      if (t < p) t = p;
      if (bas == null) bas = t;
      const al = Math.min(gerek, q - t);
      gerek -= al;
      t += al;
      if (t >= q) si++;
    }
    return { start: bas == null ? t : bas, end: gerek > 0 ? null : t };
  });
}

// Şerit sırası: canlı plandaki TMI işi önce, sonra Planlama sırası, termin ve oluşturma (sortL).
export const planSirasi = (x: Pkg, y: Pkg): number =>
  planOnce(x, y) || (x.seq ?? 1e9) - (y.seq ?? 1e9) || (terminCoz(x.due) || 9e15) - (terminCoz(y.due) || 9e15) || (x.createdAt || 0) - (y.createdAt || 0);
export const seritSirala = (l: readonly Pkg[]): Pkg[] => [...l].sort(planSirasi);

export const kalanMs = (p: Pick<Pkg, 'target' | 'cycle'>, r: Pick<Result, 'good' | 'scrap'> | null | undefined): number =>
  kalanAdet(p.target, r?.good || 0, r?.scrap || 0) * (p.cycle || 0) * 1000;

// İstasyon tiplerinin adı (istasyonlar.ts OPTYPES l): taşıma onayının metni.
export const OPTYPE_ADLARI: Readonly<Record<string, string>> = {
  cnc: 'Talaşlı imalat', kalite: 'Kalite kontrol', depo: 'Depo · toplama', mark: 'Markalama', boya: 'Boya · kaplama', montaj: 'Montaj',
};

export const tmiIsi = (p: Pick<Pkg, 'id'>): boolean => String(p.id).startsWith('tmi-');
export const onayBekliyor = (p: Pick<Pkg, 'apReq' | 'approval'> | null | undefined): boolean => !!(p && p.apReq && !(p.approval && p.approval.at >= p.apReq.at));

export type KartDurumu = 'draft' | 'review' | 'published' | 'production' | 'done';
// Bu iş paketinin durumudur, üretim emrinin değil: ad "Paket:" ile başlar ki emir durumuyla karışmasın (1417 a).
export const KART_DURUMLARI: Readonly<Record<KartDurumu, { etiket: string; renk: Renk }>> = {
  draft: { etiket: 'Paket: Taslak', renk: 'idle' }, review: { etiket: 'Paket: Onayda', renk: 'done' }, published: { etiket: 'Paket: Yayında', renk: 'run' },
  production: { etiket: 'Paket: Üretimde', renk: 'hazard' }, done: { etiket: 'Paket: Tamamlandı', renk: 'done' },
};
// Kart rozeti (PSTAT seçimi): bitmiş, üretimde, kalite onayında, yoksa paketin kendi durumu.
export function kartDurumu(p: Pkg, r: Result | null | undefined): KartDurumu {
  if (r && r.state === 'done') return 'done';
  if (r && r.state && r.state !== 'queued' && p.status !== 'draft') return 'production';
  if (onayBekliyor(p)) return 'review';
  return Object.hasOwn(KART_DURUMLARI, p.status) ? p.status as KartDurumu : 'draft';
}

export interface TasimaPlani { yazilacaklar: Pkg[]; sira: number; tasindi: boolean }
// Rotasız işin şerit içi ya da şeritler arası taşınması (moveTo): şerit yeniden 10'ar adımla sıralanır; değişmeyen ve TMI planlı
// paket yazılmaz. Taşınan paketin makinesi boşalır.
export function tasimaPlani(seritteki: readonly Pkg[], p: Pkg, istasyon: string, onceki?: string | null): TasimaPlani {
  const serit = seritSirala(seritteki.filter((x) => x.machine === istasyon && x.id !== p.id));
  const bulunan = onceki ? Math.max(0, serit.findIndex((x) => x.id === onceki)) : serit.length;
  serit.splice(bulunan < 0 ? serit.length : bulunan, 0, p);
  const tasindi = p.machine !== istasyon;
  const yazilacaklar: Pkg[] = [];
  serit.forEach((x, i) => {
    const seq = (i + 1) * 10;
    if (tmiPlani(x as PlanliPaket)) return;
    if (x.seq === seq && !(x.id === p.id && tasindi)) return;
    yazilacaklar.push({ ...x, seq, ...(x.id === p.id ? { machine: istasyon, mc: tasindi ? '' : x.mc } : {}) } as Pkg);
  });
  return { yazilacaklar, sira: bulunan, tasindi };
}

// ---- Planlı duruşlar -------------------------------------------------------------------------------------------------
export const GUNLER = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const;
export interface DurusTaslagi extends PlannedDown { isNew?: boolean }

export function durusKapsami(d: Pick<PlannedDown, 'scope' | 'target'>, a: Pick<ArkonAyarlari, 'tesis'>): string {
  if (d.scope === 'all') return 'Bütün tesis';
  if (d.scope === 'wc') return `İş merkezi · ${isMerkeziBul(a.tesis, d.target)?.name || d.target}`;
  return `İstasyon · ${d.target}`;
}
// Kayıt öncesi denetim (DownsView save): hata iletisi ya da null.
export function durusHatasi(d: Pick<PlannedDown, 'reason' | 'from' | 'to' | 'scope' | 'target'>): string | null {
  if (!d.reason) return 'Neden seç';
  if (!(d.to > d.from)) return 'Bitiş başlangıçtan sonra olmalı';
  if (d.scope !== 'all' && !d.target) return `${d.scope === 'wc' ? 'İş merkezi' : 'İstasyon'} seç`;
  return null;
}
// Değişiklik günlüğündeki ayrıntı: "05.10 08:00–10:00 · her gün · İstasyon · T-01".
export const durusGunlukMetni = (d: PlannedDown, a: Pick<ArkonAyarlari, 'tesis'>): string =>
  `${gunAySaat(d.from)}–${saat(d.to)}${d.rep && d.rep !== 'none' ? ` · ${d.rep === 'daily' ? 'her gün' : 'haftalık'}` : ''} · ${durusKapsami(d, a)}`;

export const yeniKimlik = (): string => Math.random().toString(36).slice(2, 9);

// Yeni kayıt: yarın 08:00-10:00, ilk planlı neden, ilk istasyon, hafta içi günleri.
export function yeniDurus(simdi: number, a: Pick<ArkonAyarlari, 'durusNedenleri' | 'tesis'>, kimlik: string): DurusTaslagi {
  const s0 = new Date(simdi + GUN);
  s0.setHours(8, 0, 0, 0);
  return {
    id: `dn-${kimlik}`, isNew: true, title: '', reason: a.durusNedenleri.find((r) => r.cat === 'p')?.code ?? '', scope: 'st',
    target: istasyonListesi(a.tesis)[0]?.id ?? '', from: s0.getTime(), to: s0.getTime() + 2 * 3600e3, rep: 'none', days: [1, 2, 3, 4, 5], until: null, note: '',
  };
}

// Listede sıra: en yakın gerçekleşmesi önce gelir (geçmiş kayıtlar sona).
export function duruslariSirala(liste: readonly PlannedDown[], simdi: number): PlannedDown[] {
  const ilk = (d: PlannedDown) => durusGerceklesmeleri(d, simdi - GUN, simdi + 60 * GUN)[0]?.s ?? 9e15;
  return [...liste].sort((x, y) => ilk(x) - ilk(y));
}

// Haftalık şeritte konum (yüzde, 0-100) ve en az görünür genişlik.
export const seritKonumu = (t: number, gun0: number): number => Math.max(0, Math.min(100, ((t - gun0) / (7 * GUN)) * 100));

// ---- CSV -------------------------------------------------------------------------------------------------------------
// Eski ekranın biçimi (csvDownload): BOM, noktalı virgül, sayı en çok iki ondalık ve virgülle, gerekirse tırnak.
export type CsvHucresi = string | number | null | undefined;
export function csvMetni(satirlar: readonly (readonly CsvHucresi[])[]): string {
  const kac = (v: CsvHucresi) => {
    // Formül gibi başlayan metin ' ile başlar (Excel onu komut olarak çalıştırmasın); düz sayı metni olduğu gibi kalır.
    const s0 = v == null ? '' : typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : formulKoru(v, { sayiSerbest: true });
    return /[;"\n]/.test(s0) ? `"${s0.replace(/"/g, '""')}"` : s0;
  };
  return String.fromCharCode(0xfeff) + satirlar.map((r) => r.map(kac).join(';')).join('\r\n');
}
export const csvDosyaAdi = (ad: string): string => `${ad.replace(/[^\wİıŞşĞğÜüÖöÇç.-]+/g, '_')}.csv`;

export const aktifIsMerkezleri = (a: Pick<ArkonAyarlari, 'tesis'>) => a.tesis.wcs.filter(aktif);
