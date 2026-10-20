import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Award, PurchaseRequest, Quote, RequestStatus, Settings } from './tipler.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, UNDO_MS, bump, persistUndoable, undoLast } from './store.ts';
import { transport } from './tasiyici.ts';
import { KUR_ILETISI, birimReddi, miktarIn, miktarSayisi, yapistirilanKalemler, durumEtiketi, siparisEtiketi, birimUyarisi, budgetUse, kataloglaEslesenleriBagla, fixedRates, kaydedilecekKur, kurIstenir, otomatikKur, quoteCalc, rateFor, vsLast, fiyatUyarisi } from './calc.ts';
import { alerts } from './views.ts';

const ayar = (ek: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, departments: [{ name: 'Bakım', budget: 1000 }], ...ek });

function teklif(id: string, supplierId: string, fiyat: number, ek: Partial<Quote> = {}): Quote {
  return {
    id, supplierId, supplierName: supplierId, date: '2026-03-01', validUntil: '', currency: 'TRY', fxRate: null,
    prices: { k1: fiyat }, discountPct: 0, shipping: 0, otherCost: 0, deliveryTerm: '', deliveryIncluded: true,
    leadDays: null, payDays: 0, advancePct: 0, warrantyMonths: null, compliant: true, note: '', ...ek,
  };
}
function talep(id: string, status: RequestStatus, quotes: Quote[], award: Partial<Award> | null, ek: Partial<PurchaseRequest> = {}): PurchaseRequest {
  return {
    id, no: id, title: 'Deneme', department: 'Bakım', requester: '', priority: 'normal', needDate: '', notes: '', status,
    items: [{ id: 'k1', materialId: 'm1', name: 'Deneme kalem', spec: '', qty: 10, unit: 'adet' }],
    rfqs: [], quotes, log: [], createdAt: 1,
    award: award ? { mode: 'single', quoteId: quotes[0]?.id ?? null, reason: '', by: '', decidedAt: '2026-03-02', ...award } : null,
    ...ek,
  };
}
function kur(talepler: PurchaseRequest[], set: Settings = ayar()): void {
  S.requests = Object.fromEntries(talepler.map((t) => [t.id, t]));
  S.materials = { m1: { id: 'm1', code: 'M-1', name: 'Deneme kalem', category: '', unit: 'adet', spec: '', notes: '', aliases: [], createdAt: 1 } };
  S.suppliers = {};
  S.settings = set;
  bump();
}

beforeEach(() => kur([]));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('SAT-60 birim bütçe kullanımı', () => {
  it('yalnız siparişe dönmüş kararlar, birimin o yılı için sayılır', () => {
    kur([
      talep('t1', 'ordered', [teklif('q1', 'f1', 10)], { orderDate: '2026-04-01' }),
      talep('t2', 'received', [teklif('q2', 'f1', 5)], { orderDate: '2026-05-01' }),
      talep('t3', 'approval', [teklif('q3', 'f1', 100)], {}),
      talep('t4', 'eval', [teklif('q4', 'f1', 100)], {}),
      talep('t5', 'cancelled', [teklif('q5', 'f1', 100)], {}),
      talep('t6', 'ordered', [teklif('q6', 'f1', 100)], { orderDate: '2025-12-31' }),
      talep('t7', 'ordered', [teklif('q7', 'f1', 100)], { orderDate: '2026-04-01' }, { department: 'Üretim' }),
    ]);
    expect(budgetUse('Bakım', 2026)).toEqual({ budget: 1000, used: 150 });
    expect(budgetUse('bakım', '2025').used).toBe(1000);
  });
});

describe('SAT-61 son alışa göre fiyat sapması', () => {
  it('teklif birim fiyatı aynı malzemenin son alışıyla yüzde olarak karşılaştırılır; talebin kendisi sayılmaz', () => {
    const eski = talep('t1', 'received', [teklif('q1', 'f1', 100, { date: '2026-01-10' })], { orderDate: '2026-01-10' });
    const yeni = talep('t2', 'eval', [teklif('q2', 'f2', 115)], null);
    kur([eski, yeni]);
    const s = vsLast(yeni, yeni.items[0]!, 115);
    expect(s?.last.reqId).toBe('t1');
    expect(s?.pct).toBeCloseTo(15);
    expect(s!.pct >= ayar().priceAlertPct).toBe(true);
    expect(vsLast(yeni, yeni.items[0]!, 105)!.pct >= ayar().priceAlertPct).toBe(false);
  });

  it('önceki alış yoksa sapma yoktur (sıfır uydurulmaz)', () => {
    const yeni = talep('t2', 'eval', [teklif('q2', 'f2', 115)], null);
    kur([yeni]);
    expect(vsLast(yeni, yeni.items[0]!, 115)).toBeNull();
  });

  it('uyarı eşiğe eşit ya da üstündeki artışta çıkar; sapma yoksa ya da düşüşte çıkmaz', () => {
    expect(fiyatUyarisi(10, 10)).toBe(true);
    expect(fiyatUyarisi(15, 10)).toBe(true);
    expect(fiyatUyarisi(9.99, 10)).toBe(false);
    expect(fiyatUyarisi(-20, 10)).toBe(false);
    expect(fiyatUyarisi(null, 10)).toBe(false);
    expect(fiyatUyarisi(undefined, 10)).toBe(false);
  });
});

describe('SAT-62 en az teklif uyarısı', () => {
  const uyarilar = () => alerts().filter((a) => a.t.includes('geçerli teklif var'));

  it('geçerli teklif sayısı ayardaki en azdan azsa açık talepte uyarı çıkar', () => {
    kur([talep('t1', 'eval', [teklif('q1', 'f1', 10), teklif('q2', 'f2', 11, { compliant: false })], null)]);
    expect(uyarilar().map((a) => a.t)).toEqual(['1 geçerli teklif var; en az 3 önerilir.']);
  });

  it('yeterli teklifte, onaydaki ya da sipariş verilmiş talepte uyarı yoktur; eşik ayardan okunur', () => {
    kur([talep('t1', 'eval', [teklif('q1', 'f1', 10)], null)], ayar({ minQuotes: 1 }));
    expect(uyarilar()).toEqual([]);
    kur([
      talep('t2', 'approval', [teklif('q2', 'f1', 10)], {}),
      talep('t3', 'ordered', [teklif('q3', 'f1', 10)], { orderDate: '2026-04-01' }),
    ]);
    expect(uyarilar()).toEqual([]);
  });
});

describe('SAT-56 ekran ve sunucu aynı toplamı bulur', () => {
  it('sunucu testindeki (SAT-13) fikstürle ekran toplamı da 125 çıkar', () => {
    // 10 × 10 + 4 × 5 = 120; %10 iskonto 108; nakliye fiyata dahil değil 15; diğer 2 → 125
    const r = talep('t1', 'eval', [], null, { items: [
      { id: 'k1', name: 'Deneme rulman', spec: '', qty: 10, unit: 'adet' },
      { id: 'k2', name: 'Deneme kayış', spec: '', qty: 4, unit: 'adet' },
    ] });
    const q = teklif('q1', 'f1', 10, { prices: { k1: 10, k2: 5 }, discountPct: 10, deliveryIncluded: false, shipping: 15, otherCost: 2 });
    expect(quoteCalc(r, q, ayar()).total).toBeCloseTo(125);
  });
});

describe('SAT-68 silmeyi geri alma', () => {
  it('silme 8 saniye bekletilir; geri alınırsa hiçbir şey yazılmaz ve kayıt ekrana döner', () => {
    vi.useFakeTimers();
    const yaz = vi.spyOn(transport, 'write').mockImplementation(() => undefined);
    const t = talep('t1', 'draft', [], null);
    kur([t]);
    persistUndoable('requests', 't1', null, 'silindi');
    expect(S.requests.t1).toBeUndefined();
    undoLast();
    vi.advanceTimersByTime(UNDO_MS + 1);
    expect(yaz).not.toHaveBeenCalled();
    expect(S.requests.t1).toEqual(t);
  });

  it('süre dolunca silme bir kez yazılır', () => {
    vi.useFakeTimers();
    const yaz = vi.spyOn(transport, 'write').mockImplementation(() => undefined);
    kur([talep('t1', 'draft', [], null)]);
    persistUndoable('requests', 't1', null, 'silindi');
    vi.advanceTimersByTime(UNDO_MS - 1);
    expect(yaz).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(yaz).toHaveBeenCalledTimes(1);
    expect(yaz).toHaveBeenCalledWith('requests', 't1', null);
  });
});

describe('SA3 a: kur finanstan', () => {
  it('güncel kur yoksa teklifin kendi kuru kullanılır, 1 uydurulmaz; sipariş kuru da öyle sabitlenir', () => {
    const set = ayar({ currencies: { ...DEFAULT_SETTINGS.currencies, USD: { rate: null, monthly: 0 }, EUR: { rate: 47, monthly: 0 } } });
    const q = teklif('q1', 'f1', 10, { currency: 'USD', fxRate: 41.5 });
    const e = teklif('q2', 'f2', 10, { currency: 'EUR', fxRate: 46 });
    const r = talep('t1', 'eval', [q, e], null);
    kur([r], set);
    expect([rateFor(r, q, set), rateFor(r, e, set)]).toEqual([41.5, 47]);
    expect(fixedRates(r, set)).toEqual({ USD: 41.5, EUR: 47 });
  });
});

describe('#375 kart bekleyen kalem', () => {
  it('açık talepte kartsız kalem iş kutusunda ayrı uyarıdır; onaydaysa öncelikli', () => {
    const serbest = { id: 'k2', materialId: null, name: 'Deneme serbest', spec: '', qty: 2, unit: 'adet' };
    const t1 = talep('t1', 'draft', [], null);
    t1.items.push(serbest);
    const t2 = talep('t2', 'approval', [teklif('q1', 'f1', 10)], {});
    t2.items.push(serbest);
    kur([t1, t2, talep('t3', 'draft', [], null)]);
    const k = alerts().filter((a) => a.t.includes('kart bekliyor'));
    expect(k.map((a) => [a.r.id, a.sev, a.t, a.a])).toEqual([
      ['t2', 'h', '1 kalem kart bekliyor (Deneme serbest); kart bağlanmadan sipariş verilmez.', 'Karta bağla'],
      ['t1', 'm', '1 kalem kart bekliyor (Deneme serbest); kart bağlanmadan sipariş verilmez.', 'Karta bağla'],
    ]);
  });
});

describe('S6 b birim uyarısı', () => {
  it('yazılan birim kart biriminden farklıysa kullanıcıya söylenir; aynıysa, boşsa ya da kartın birimi yoksa söylenmez', () => {
    expect(birimUyarisi('adet', 'kg')).toBe('Birim kartla aynı yapıldı: kg');
    expect(birimUyarisi('koli', ' Çift ')).toBe('Birim kartla aynı yapıldı: Çift');
    expect(birimUyarisi('KG', 'kg')).toBeNull();
    expect(birimUyarisi('', 'kg')).toBeNull();
    expect(birimUyarisi('adet', '')).toBeNull();
    expect(birimUyarisi('adet', null)).toBeNull();
  });
  it('denetim #37: kalem miktarı ortak ayrıştırıcıdan okunur; virgülsüz "1.250" belirsizdir; girdi binliksiz yazılır', () => {
    expect([miktarSayisi('12,5'), miktarSayisi('12.5'), miktarSayisi('1.250,5'), miktarSayisi(' 40 ')]).toEqual([12.5, 12.5, 1250.5, 40]);
    expect(miktarSayisi('1.250')).toBe('belirsiz');
    expect([miktarSayisi(''), miktarSayisi('iki'), miktarSayisi('-3')]).toEqual([null, null, null]);
    expect([miktarIn(1250), miktarIn(1250.5), miktarIn(null)]).toEqual(['1250', '1250,5', '']);
    expect(miktarSayisi(miktarIn(1250))).toBe(1250);
  });
  it('328 a: toplu yapıştırmada miktar ortak ayrıştırıcıdan okunur; tek belirsiz "1.250" bütün yapıştırmayı durdurur; boş miktar 1 adet', () => {
    expect(yapistirilanKalemler('Mil\t12,5\tkg\tØ20\nPul;1.250,5\nVida')).toEqual([
      { name: 'Mil', qty: 12.5, unit: 'kg', spec: 'Ø20' },
      { name: 'Pul', qty: 1250.5, unit: 'adet', spec: '' },
      { name: 'Vida', qty: 1, unit: 'adet', spec: '' },
    ]);
    expect(yapistirilanKalemler('Mil\t40\nPul\t1.250\tadet')).toBe('belirsiz');
    expect(yapistirilanKalemler(' \n\n')).toEqual([]);
  });
});

describe('S7 döviz teklifi kuru', () => {
  const finanslı = ayar({ ratesDate: '2026-10-09', currencies: { ...DEFAULT_SETTINGS.currencies, USD: { rate: 45, monthly: 0 } } });
  it('kur gününün teklifinde finansın kuru kaydedilir; finansta kur yoksa kursuz kayıt durur, tek teklifle aynı ileti', () => {
    expect(KUR_ILETISI).toBe('Teklif günündeki kuru girin.');
    expect(kaydedilecekKur('USD', null, finanslı, '2026-10-09')).toBe(45);
    expect(kaydedilecekKur('USD', 41.5, finanslı, '2026-10-09')).toBe(41.5);
    expect(kaydedilecekKur('TRY', null, ayar(), '2026-10-09')).toBe(1);
    expect([kurIstenir('EUR', null, finanslı, '2026-10-09'), kurIstenir('EUR', 0, finanslı, '2026-10-09'), kurIstenir('USD', null, finanslı, '2026-10-09'),
      kurIstenir('TRY', null, finanslı, '2026-10-09')]).toEqual([true, true, false, false]);
  });
  it('borç 37: geçmiş tarihli teklifte bugünün kuru gönderilmez; kur boşsa sunucu o günün kurunu finanstan alır ya da ister', () => {
    expect(kaydedilecekKur('USD', null, finanslı, '2026-09-30')).toBeNull();
    expect(otomatikKur('USD', '2026-09-30', finanslı)).toBeNull();
    expect(kurIstenir('USD', null, finanslı, '2026-09-30')).toBe(false);
    expect(kaydedilecekKur('USD', 41.5, finanslı, '2026-09-30')).toBe(41.5);
  });
});

describe('#544 demo bulguları', () => {
  it('siparişte adı ya da diğer adı katalogla eşleşen bağsız kalem bağlanır; elle verilmiş bağ ve eşleşmeyen kalem değişmez', () => {
    S.materials.m1!.aliases = ['rulman 6205'];
    S.materials.m2 = { id: 'm2', code: 'M-2', name: 'Deneme gres', category: '', unit: 'kg', spec: '', notes: '', aliases: [], createdAt: 1 };
    bump();
    const items = [
      { id: 'a', name: 'deneme KALEM', spec: '', qty: 1, unit: 'adet' },
      { id: 'b', name: 'Rulman 6205', spec: '', qty: 1, unit: 'adet' },
      { id: 'c', materialId: 'm2', name: 'Deneme kalem', spec: '', qty: 1, unit: 'adet' },
      { id: 'd', name: 'Katalogda olmayan', spec: '', qty: 1, unit: 'adet' },
    ];
    kataloglaEslesenleriBagla(items);
    expect(items.map((i) => i.materialId ?? null)).toEqual(['m1', 'm1', 'm2', null]);
  });

  it('BR1: listede olmayan birim form kapanmadan sunucunun iletisiyle reddedilir; boş ve listedeki birim geçer', () => {
    expect(birimReddi('', ['Bakım'])).toBeNull();
    expect(birimReddi(' Bakım ', ['Bakım'])).toBeNull();
    expect(birimReddi('Kalite', ['Bakım'])).toBe("Birim listede yok: Kalite. Ayarlar'dan ekleyin ya da listeden seçin.");
    expect(birimReddi('Kalite', [])).not.toBeNull();
  });
});

describe('#544 durum etiketi', () => {
  it('onaylanıp sipariş bekleyen talep "Onaylandı, sipariş bekliyor" görünür; onay bekleyen ve öteki durumlar kendi adıyla', () => {
    const onay = { id: 'o1', at: 1, by: 'u1', name: 'Deneme Müdür', decision: 'approved' as const, note: '' };
    expect(durumEtiketi(talep('t1', 'approval', [], { approvals: [onay] }))).toBe('Onaylandı, sipariş bekliyor');
    expect(durumEtiketi(talep('t2', 'approval', [], { approvals: [] }))).toBe('Onay');
    expect(durumEtiketi(talep('t3', 'ordered', [], { approvals: [onay] }))).toBe('Sipariş verildi');
  });
});

describe('#544 sipariş numarası', () => {
  it('görünen numara TMI numarasıdır, Logo numarası varsa yanında; ikisi de yoksa boş', () => {
    expect(siparisEtiketi({ orderNo: 'SP-2026-004', poNo: 'L-77' })).toBe('SP-2026-004 / L-77');
    expect(siparisEtiketi({ orderNo: 'SP-2026-004', poNo: '' })).toBe('SP-2026-004');
    expect(siparisEtiketi({ poNo: 'L-77' })).toBe('L-77');
    expect(siparisEtiketi({})).toBe('');
  });
});
