import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PurchaseRequest, Quote, Settings, Supplier } from './tipler.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, bump } from './store.ts';
import {
  approvalState, awardTotals, birimReddi, durumEtiketi, evaluate, kurIstenir, lateBy, leadScore, payText, quoteCalc, requiredApprover,
} from './calc.ts';

// Bugünkü davranışı sabitler (kayıt: hesaplar.md H1-H4); beklenen değerler bugünkü çıktıdır; vade değerleri 1383 a ile basit faiz, 365 gündür. Girdiler kayıt betiğindeki gibi eksik
// alanlıdır, çünkü eksik alanın (ör. compliant yok) nasıl yorumlandığı da sabitlenen davranışın parçasıdır.

const AYAR: Settings = {
  ...structuredClone(DEFAULT_SETTINGS),
  currencies: { TRY: { rate: 1, monthly: 3 }, USD: { rate: 34, monthly: 0.4 }, EUR: { rate: 37, monthly: 0.3 } } as unknown as Settings['currencies'],
};
const KALEMLER = [{ id: 'i1', name: 'Kalem 1', qty: 10, unit: 'adet' }, { id: 'i2', name: 'Kalem 2', qty: 5, unit: 'adet' }];
const q1 = { id: 'q1', supplierId: 's1', currency: 'TRY', prices: { i1: 100, i2: 200 }, discountPct: 0, shipping: 50, deliveryIncluded: false, otherCost: 0, advancePct: 0, payDays: 0, leadDays: 7, warrantyMonths: 12 };
const q2 = { id: 'q2', supplierId: 's2', currency: 'USD', prices: { i1: 2.5, i2: 6 }, fxRate: 34, discountPct: 10, shipping: 0, deliveryIncluded: true, otherCost: 0, advancePct: 30, payDays: 60, leadDays: 14, warrantyMonths: 6 };
const q3 = { id: 'q3', supplierId: 's3', currency: 'TRY', prices: { i1: 80 }, discountPct: 0, shipping: 100, deliveryIncluded: false, otherCost: 0, advancePct: 0, payDays: 30, leadDays: 5, warrantyMonths: 24 };
const TALEP = { id: 'r1', no: 'T', title: 'Kayit satin', status: 'eval', items: KALEMLER, quotes: [q1, q2, q3], needDate: '2026-10-25', updatedAt: 1 };
const talep = (r: object) => r as unknown as PurchaseRequest;
const teklif = (q: object) => q as unknown as Quote;

beforeEach(() => {
  // Termin gecikmesi bugünden sayılır; kayıt 15.10.2026'da alındı.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T12:00:00'));
  S.settings = structuredClone(AYAR);
  S.requests = {};
  S.materials = {};
  S.suppliers = {
    s1: { id: 's1', name: 'Kayit satin Ted A' }, s2: { id: 's2', name: 'Kayit satin Ted B' }, s3: { id: 's3', name: 'Kayit satin Ted C' },
  } as unknown as Record<string, Supplier>;
  S.ready = true;
  bump();
});
afterEach(() => { vi.useRealTimers(); });

// DEĞİŞECEK: para hesabı tarayıcıda; sunucuya (kurallar.ts) taşınınca bu beklentiler sunucu testine geçer.
describe('SA-HESAP H1: teklif toplamı ve bugünkü değer', () => {
  it('SA-HESAP H1: varsayılan ağırlıklar ve onay limitleri', () => {
    expect(DEFAULT_SETTINGS.weights).toEqual({ cost: 50, lead: 20, supplier: 20, warranty: 10 });
    expect(DEFAULT_SETTINGS.approvalLimits).toEqual([
      { max: 50000, role: 'Satın alma uzmanı' },
      { max: 250000, role: 'Satın alma müdürü' },
      { max: 1000000, role: 'Genel müdür yardımcısı' },
      { max: null, role: 'Genel müdür' },
    ]);
  });

  it('SA-HESAP H1: q1 TRY, nakliye ayrı, peşin', () => {
    const x = quoteCalc(talep(TALEP), teklif(q1), AYAR);
    expect({ rate: x.rate, sub: x.sub, net: x.net, ship: x.ship, total: x.total, totalTRY: x.totalTRY, factor: x.factor, pvTRY: x.pvTRY, vadeGain: x.vadeGain, coverage: x.coverage })
      .toEqual({ rate: 1, sub: 2000, net: 2000, ship: 50, total: 2050, totalTRY: 2050, factor: 1, pvTRY: 2050, vadeGain: 0, coverage: 1 });
  });

  it('SA-HESAP H1: q2 USD, %10 iskonto, %30 avans 60 gün vade', () => {
    const x = quoteCalc(talep(TALEP), teklif(q2), AYAR);
    expect(x.rate).toBe(34);
    expect(x.sub).toBeCloseTo(55, 6);
    expect(x.net).toBeCloseTo(49.5, 6);
    expect(x.ship).toBe(0);
    expect(x.total).toBeCloseTo(49.5, 6);
    expect(x.totalTRY).toBeCloseTo(1683, 2);
    expect(x.factor).toBeCloseTo(0.99452, 5);
    expect(x.pvTRY).toBeCloseTo(1673.78, 2);
    expect(x.vadeGain).toBeCloseTo(9.22, 2);
    expect(x.coverage).toBe(1);
  });

  it('SA-HESAP H1: q3 kısmi kapsama, 30 gün vade TRY %3', () => {
    const x = quoteCalc(talep(TALEP), teklif(q3), AYAR);
    expect({ rate: x.rate, sub: x.sub, net: x.net, ship: x.ship, total: x.total, totalTRY: x.totalTRY, coverage: x.coverage })
      .toEqual({ rate: 1, sub: 800, net: 800, ship: 100, total: 900, totalTRY: 900, coverage: 0.5 });
    expect(x.factor).toBeCloseTo(0.97126, 5);
    expect(x.pvTRY).toBeCloseTo(874.14, 2);
    expect(x.vadeGain).toBeCloseTo(25.86, 2);
  });

  it('SA-HESAP H1: ödeme metni [peşin, avans ve vade, %100 avans, yalnız vade]', () => {
    expect([q1, q2, { advancePct: 100 }, { advancePct: 0, payDays: 45 }].map((q) => payText(teklif(q))))
      .toEqual(['Peşin', '%30 avans, kalan 60 gün vade', '%100 avans', '45 gün vade']);
  });

  it('SA-HESAP H1: kur günündeki döviz teklifi finansta kur yokken kur ister', () => {
    const ayar = { ...AYAR, ratesDate: '2026-10-15', currencies: { TRY: { rate: 1, monthly: 3 } } } as unknown as Settings;
    expect(kurIstenir('USD', null, ayar, '2026-10-15')).toBe(true);
  });

  it('SA-HESAP H1: birim listede yoksa ileti; boş ya da listedeyse null', () => {
    expect(birimReddi('kg', ['adet'])).toBe("Birim listede yok: kg. Ayarlar'dan ekleyin ya da listeden seçin.");
    expect(birimReddi('', ['adet'])).toBeNull();
    expect(birimReddi('adet', ['adet'])).toBeNull();
  });
});

// DEĞİŞECEK: puanlama tarayıcıda; iş kuralı kurallar.ts'e taşınacak.
describe('SA-HESAP H2: puanlama ve öneri', () => {
  it('SA-HESAP H2: üç teklifin alt puanları, doldurma ve gecikme', () => {
    const ev = evaluate(talep(TALEP));
    const ozet = ev.all.map((x) => ({
      id: x.q.id, uygun: ev.elig.includes(x), fill: +x.fill.toFixed(2), scorePV: +x.scorePV.toFixed(2),
      s: Object.fromEntries(Object.entries(x.s).map(([a, b]) => [a, +(+b).toFixed(2)])), score: +x.score.toFixed(2), late: x.late,
    }));
    expect(ozet).toEqual([
      { id: 'q1', uygun: true, fill: 0, scorePV: 2050, s: { cost: 81.65, lead: 100, supplier: 60, warranty: 100 }, score: 82.82, late: null },
      { id: 'q2', uygun: true, fill: 0, scorePV: 1673.78, s: { cost: 100, lead: 73.33, supplier: 60, warranty: 50 }, score: 81.67, late: 4 },
      // Kısmi teklif uygun sayılır; eksik kalem en pahalı birim fiyatla doldurulur.
      { id: 'q3', uygun: true, fill: 1000, scorePV: 1874.14, s: { cost: 89.31, lead: 100, supplier: 60, warranty: 100 }, score: 86.65, late: null },
    ]);
  });

  it('SA-HESAP H2: sıralamada bütün kalemleri kapsayanlar önce; q3 en yüksek puanlı olsa da sonda', () => {
    expect(evaluate(talep(TALEP)).ranking.map((x) => x.q.id)).toEqual(['q1', 'q2', 'q3']);
  });

  it('SA-HESAP H2: termin puanı, ihtiyaç tarihi yok 70; 20 gün termin 10 gün gecikmeyle 33,33', () => {
    expect(leadScore(talep({ ...TALEP, needDate: '' }), teklif(q2), 5)).toBe(70);
    expect(leadScore(talep(TALEP), teklif({ leadDays: 20 }), 5)).toBeCloseTo(33.3333, 4);
    expect(lateBy(talep(TALEP), teklif({ leadDays: 20 }))).toBe(10);
  });

  it('SA-HESAP H2: uyumsuz tek teklifte uygun teklif ve bölme yok', () => {
    const a = { id: 'a', supplierId: 's1', currency: 'TRY', prices: { i1: 100, i2: 100 }, shipping: 0, deliveryIncluded: true, leadDays: 5, compliant: false };
    const ev = evaluate(talep({ id: 'r3', status: 'eval', items: KALEMLER, quotes: [a], updatedAt: 3 }));
    expect(ev.elig).toHaveLength(0);
    expect(ev.ranking).toHaveLength(0);
    expect(ev.split).toBeNull();
  });
});

describe('SA-HESAP H3: kalem bazlı bölme', () => {
  it('SA-HESAP H3: tek tedarikçi her kalemde en ucuzsa bölme önerilmez', () => {
    const sp = evaluate(talep(TALEP)).split;
    expect(sp).not.toBeNull();
    expect(sp!.plan.assign).toEqual({ i1: 'q2', i2: 'q2' });
    expect(sp!.total).toBeCloseTo(1673.78, 2);
    expect(sp!.best?.q.id).toBe('q2');
    expect(sp!.bestTotal).toBeCloseTo(1673.78, 2);
    expect(sp!.saving).toBeCloseTo(0, 6);
    expect(sp!.suggested).toBe(false);
  });

  it('SA-HESAP H3: S2, i1 B\'ye i2 A\'ya; toplam 1020, kazanç 480, önerilir', () => {
    const a = { id: 'a', supplierId: 's1', currency: 'TRY', prices: { i1: 100, i2: 100 }, shipping: 0, deliveryIncluded: true, leadDays: 5 };
    const b = { id: 'b', supplierId: 's2', currency: 'TRY', prices: { i1: 50, i2: 300 }, shipping: 20, deliveryIncluded: false, leadDays: 5 };
    const ev = evaluate(talep({ id: 'r2', status: 'eval', items: KALEMLER, quotes: [a, b], updatedAt: 2 }));
    expect(ev.all.map((x) => `${x.q.id}:${x.c.pvTRY}`)).toEqual(['a:1500', 'b:2020']);
    const sp = ev.split!;
    expect({ assign: sp.plan.assign, goods: sp.plan.goods, extras: sp.plan.extras, total: sp.total, best: sp.best?.q.id, bestTotal: sp.bestTotal, saving: sp.saving, suggested: sp.suggested })
      .toEqual({ assign: { i1: 'b', i2: 'a' }, goods: 1000, extras: 20, total: 1020, best: 'a', bestTotal: 1500, saving: 480, suggested: true });
  });

  it('SA-HESAP H3: onaylanmış tek teklif kararının toplamları ve durum etiketi', () => {
    const r = talep({ ...TALEP, status: 'approval', award: { mode: 'single', quoteId: 'q2', approvals: [{ decision: 'approved' }] } });
    const t = awardTotals(r)!;
    expect(t.totalTRY).toBeCloseTo(1683, 2);
    expect(t.pvTRY).toBeCloseTo(1673.78, 2);
    expect(t.suppliers).toEqual(['s2']);
    expect(durumEtiketi(r)).toBe('Onaylandı, sipariş bekliyor');
    expect(approvalState(r).state).toBe('approved');
  });

  it('SA-HESAP H5: son kayıt ret ve talep değerlendirmede ise rejected', () => {
    const r = talep({ ...TALEP, status: 'eval', award: { mode: 'single', quoteId: 'q2', approvals: [{ decision: 'rejected' }] } });
    expect(approvalState(r).state).toBe('rejected');
    expect(durumEtiketi(r)).toBe('Değerlendirme');
  });
});

describe('SA-HESAP H4: gereken onaylayan', () => {
  it('SA-HESAP H4: tutara göre seviye, sınır dahil', () => {
    // DEĞİŞECEK: seviye yalnız metin; onay yetkisi tutara değil işleme bağlı, tutar denetimi sunucuya taşınacak.
    expect([5000, 50000, 500000, 5e6].map((t) => requiredApprover(t))).toEqual([
      { max: 50000, role: 'Satın alma uzmanı' },
      { max: 50000, role: 'Satın alma uzmanı' },
      { max: 1000000, role: 'Genel müdür yardımcısı' },
      { max: null, role: 'Genel müdür' },
    ]);
  });

  it('SA-HESAP H4: varsayılan limitlerde sınır değerler "kadar" kuralıyla alt basamakta kalır, limitsiz son basamaktır', () => {
    const uzman = { max: 50000, role: 'Satın alma uzmanı' };
    const mudur = { max: 250000, role: 'Satın alma müdürü' };
    const gmy = { max: 1000000, role: 'Genel müdür yardımcısı' };
    const gm = { max: null, role: 'Genel müdür' };
    expect([50000, 50001, 250000, 250001, 1000000, 1000001].map((t) => requiredApprover(t))).toEqual([uzman, mudur, mudur, gmy, gmy, gm]);
    S.settings = { ...structuredClone(AYAR), approvalLimits: [{ max: 50000, role: 'A' }, { max: 250000, role: 'B' }] };
    expect([requiredApprover(250001), requiredApprover(1e9)]).toEqual([{ max: 250000, role: 'B' }, { max: 250000, role: 'B' }]);
  });
});
