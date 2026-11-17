import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cozumGirdisi, planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';

// 3355 a: firması belirlenmemiş fason adım plana girer ("Firma belirlenmedi" hattı) ve ardılını düşürmez. Firma sırayla rotadan, emrin
// adımından, açık fason siparişinden okunur; dönüş siparişteki firma tarihi, yoksa adımın termin günü, yoksa motor ayarının fason süresi.
// Kokpit'in çalışma planı (çalışma + kayıt + kaynak okuması). Veriler uydurmadır.
const tezgah = (id: string, grup: string): Record<string, unknown> => ({ id, ad: id, grup, ucret: 750, verim: 1, vardiyalar: ['3'], opOran: 0 });
const adimlar = (fason: Record<string, unknown>) => [
  { id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [] },
  { id: '50-o20', seq: 20, opNo: 20, opId: '14', stationId: null, setup: 0, cycle: 0, alts: [], altTimes: {}, ins: [], ...fason },
  { id: '50-o30', seq: 30, opNo: 30, opId: '13', stationId: '10', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [] },
];
const kayit = (fason: Record<string, unknown>) => ({
  version: 7, savedAt: 9,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Tornalama' }, { id: '14', name: 'Kaplama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', plan: tezgah('100', '10') }],
  routes: { 50: { base: null, steps: adimlar(fason) } },
  orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: 4, start: '2026-10-19', due: '2026-11-20', priority: 2, status: 'serbest' }],
});
const kaynak = (opYer?: Record<string, unknown>) => ({
  durum: {
    wcs: [{ id: '1', code: 'IM-1', name: 'Talasli', week: null, aktif: true }],
    stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
    machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }],
    people: [],
    fasonFirms: [{ id: '7', name: 'ORN-Kaplama' }],
    cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    emirler: { orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: 4, start: '2026-10-19', due: '2026-11-20', priority: 2, status: 'serbest' }], opStatus: {}, opProg: {}, ...(opYer ? { opYer } : {}) },
  },
  ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null },
});
const calisma = (w: Record<string, unknown> = {}): Record<string, unknown> => ({
  surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  rrSavedAt: 9, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'sert', dondurma: 4, ...w },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
});
type Is = { S: number; C: number; m: string; fas?: unknown };
function coz(fason: Record<string, unknown>, opYer?: Record<string, unknown>, w: Record<string, unknown> = {}): { ops: Record<string, Is>; fail: string[]; D: Record<string, unknown>; warn: { t: string; txt: string }[] } {
  const g = planGirdisi({ calisma: calisma(w), kayit: kayit(fason), kaynak: kaynak(opYer), bugun: '2026-10-19' });
  assert.ok(g);
  const m = motorYukle();
  const ham = m.schedule(g.st, 'dagit', null);
  const p = ham as unknown as { ops: Record<string, Is>; fail?: string[] };
  const e = m.evaluate(ham, g.st, null, false) as { warn?: { t: string; txt: string }[] };
  return { ops: p.ops, fail: p.fail ?? [], D: (g.st as { D: Record<string, unknown> }).D, warn: [...(e.warn ?? [])] };
}
const fasonu = (ops: Record<string, Is>): Is => { const x = Object.values(ops).find((r) => r.fas); assert.ok(x, JSON.stringify(ops)); return x; };
const sonAdim = (ops: Record<string, Is>): Is => Object.values(ops).filter((r) => !r.fas).sort((a, b) => a.S - b.S).at(-1)!;
const saat = (gun: number, s: number): number => (gun - 19) * 24 + s;
const FIRMASIZ = { fason: true, fasonId: null };

describe('3355: firması belirlenmemiş fason adım (Kokpit çalışma planı)', () => {
  test('rotada firma yoksa adım "Firma belirlenmedi" hattına motor ayarının süresiyle yerleşir; ardılı ondan sonra başlar', () => {
    const r = coz(FIRMASIZ);
    assert.equal(r.fail.length, 0);
    const f = fasonu(r.ops);
    assert.equal(f.m, '@~belirsiz');
    assert.equal(f.C - f.S, 7 * 24);
    assert.ok(sonAdim(r.ops).S >= f.C);
    const hat = (r.D['fasoncular'] as { id: string; ad: string }[]).find((x) => x.id === '~belirsiz');
    assert.equal(hat?.ad, 'Firma belirlenmedi');
    const uyari = r.warn.filter((w) => w.t === 'Firma belirlenmedi');
    assert.equal(uyari.length, 1);
    assert.match(uyari[0]!.txt, /fason firması belirlenmedi; 7 gün ile \(Motor ayarları > Fason süresi\) planlandı/);
  });

  test('motor ayarındaki fason süresi kullanılır; rotadaki termin günü ondan önce gelir', () => {
    assert.equal(((f) => f.C - f.S)(fasonu(coz(FIRMASIZ, undefined, { fasonGun: 3 }).ops)), 3 * 24);
    const rota = coz({ ...FIRMASIZ, terminGun: 2 }, undefined, { fasonGun: 3 });
    assert.equal(((f) => f.C - f.S)(fasonu(rota.ops)), 2 * 24);
    // Not, süreyi değiştirebileceği yeri söyler: rotadaki gün motor ayarına yönlendirmez.
    assert.match(rota.warn.find((w) => w.t === 'Firma belirlenmedi')!.txt, /rotadaki 2 gün ile planlandı/);
  });

  test('alt sınır (lbHeadsTails) rotadaki termin gününü kullanır, motor ayarını değil: arama planı iyimser ya da kötümser tahmin etmez', () => {
    const g = planGirdisi({ calisma: calisma({ fasonGun: 9 }), kayit: kayit({ ...FIRMASIZ, terminGun: 2 }), kaynak: kaynak(), bugun: '2026-10-19' });
    assert.ok(g);
    const m = motorYukle();
    const plan = m.schedule(g.st, 'dagit', null) as unknown as { ops: Record<string, Is> };
    const [id, f] = Object.entries(plan.ops).find(([, r]) => r.fas)!;
    const lb = m.lbHeadsTails(g.st, m.compile(g.st));
    assert.equal(f.C - f.S, 2 * 24);
    assert.ok(lb.fin[id]! <= f.C + 1e-6, `alt sınır ${String(lb.fin[id])} plandaki dönüşten (${String(f.C)}) büyük olamaz`);
  });

  test('rotadaki firma fason listesinde değilse adım yine yerleşir (belirsiz hat)', () => {
    const r = coz({ fasonId: '99', terminGun: 2 });
    assert.equal(r.fail.length, 0);
    assert.equal(fasonu(r.ops).m, '@~belirsiz');
  });

  test('rotada firma yok, emrin adımında firma ve açık siparişin tarihi var: firmaya yerleşir, dönüş firma tarihidir, ardıl ondan sonra', () => {
    const r = coz(FIRMASIZ, { 'O1|root|2': { fasonId: '7', terminGun: null, stationId: null, setup: null, cycle: null, fasonSiparis: { tarih: '2026-10-28', siparisNo: null } } });
    assert.equal(r.fail.length, 0);
    const f = fasonu(r.ops);
    assert.equal(f.m, '@7');
    assert.equal(f.C, saat(28, 8));
    assert.ok(sonAdim(r.ops).S >= saat(28, 8));
  });

  test('rotadaki firma listede yok, açık siparişin firması listede: siparişin firmasına ve tarihine yerleşir', () => {
    const r = coz({ fasonId: '99' }, { 'O1|root|2': { fasonId: '99', terminGun: null, stationId: null, setup: null, cycle: null, fasonSiparis: { tarih: '2026-10-28', siparisNo: null, firmaId: 7 } } });
    const f = fasonu(r.ops);
    assert.equal(f.m, '@7');
    assert.equal(f.C, saat(28, 8));
  });

  test('rotada ve emirde firma yok, açık siparişin tarihi var: belirsiz hatta, dönüş firma tarihidir', () => {
    const r = coz(FIRMASIZ, { 'O1|root|2': { fasonId: null, terminGun: null, stationId: null, setup: null, cycle: null, fasonSiparis: { tarih: '2026-10-28', siparisNo: null } } });
    const f = fasonu(r.ops);
    assert.equal(f.m, '@~belirsiz');
    assert.equal(f.C, saat(28, 8));
    assert.match(r.warn.find((w) => w.t === 'Firma belirlenmedi')!.txt, /satın alma siparişindeki tarihle planlandı/);
  });
});

// Sunucu çözümü (plan komutu): her fason adıma ayrı, hemen çıkan fasoncu kurulur (669 a); firmasız adımınki "Firma belirlenmedi" adını ve
// motor ayarının fason süresini alır, rotada termin günü varsa o geçer.
describe('3355: firması belirlenmemiş fason adım (sunucu çözümü)', () => {
  const sunucu = (fason: Record<string, unknown>, w: Record<string, unknown> = {}) => {
    const g = cozumGirdisi({
      calisma: calisma(w), kayit: kayit(fason), kaynak: kaynak(),
      istek: { simdi: '2026-10-19T05:00:00Z', kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10', 'E-1|30'] }], sabitler: [], calisanlar: [] },
    });
    assert.ok(g);
    const D = (g.st as { D: { fasoncular: { id: string; ad: string; sureGun: number }[] } }).D;
    const m = motorYukle();
    const p = m.schedule(m.stHazirla({ ...g.st, w: { ...m.W0, ...(g.st['w'] as object) } }), 'yeni', null) as unknown as { ops: Record<string, Is>; fail?: string[] };
    return { hat: D.fasoncular.filter((f) => f.id.startsWith('~') && f.id !== '~belirsiz'), ops: p.ops, fail: p.fail ?? [] };
  };

  test('firmasız adım "Firma belirlenmedi" hattında motor ayarının süresiyle yerleşir; ardılı ondan sonra başlar', () => {
    const r = sunucu(FIRMASIZ, { fasonGun: 3 });
    assert.deepEqual(r.hat.map((f) => [f.ad, f.sureGun]), [['Firma belirlenmedi', 3]]);
    assert.equal(r.fail.length, 0);
    const f = fasonu(r.ops);
    assert.equal(f.C - f.S, 3 * 24);
    assert.ok(sonAdim(r.ops).S >= f.C);
  });

  test('rotadaki termin günü motor ayarından önce gelir; firması olan adımın hattı firma hattıdır', () => {
    assert.deepEqual(sunucu({ ...FIRMASIZ, terminGun: 2 }, { fasonGun: 3 }).hat.map((f) => [f.ad, f.sureGun]), [['Firma belirlenmedi', 2]]);
    assert.deepEqual(sunucu({ fasonId: '7' }, { fasonGun: 3 }).hat.map((f) => [f.ad, f.sureGun]), [['fason', 3]]);
  });
});
