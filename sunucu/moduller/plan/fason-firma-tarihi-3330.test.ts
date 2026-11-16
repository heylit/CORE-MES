import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { degerlendirmeYap } from './degerlendirme.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';

// 3330 a: Kokpit'in çalışma planı (çalışma + kayıt + kaynak okuması) açık satın alma siparişindeki firma tarihini dönüş anı sayar.
// Veriler uydurmadır.
const tezgah = (id: string, grup: string): Record<string, unknown> => ({ id, ad: id, grup, ucret: 750, verim: 1, vardiyalar: ['3'], opOran: 0 });
const KAYIT = {
  version: 7, savedAt: 9,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Tornalama' }, { id: '14', name: 'Kaplama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', plan: tezgah('100', '10') }],
  routes: { 50: { base: null, steps: [
    { id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [] },
    { id: '50-o20', seq: 20, opNo: 20, opId: '14', stationId: null, fasonId: 'F1', terminGun: 2, setup: 0, cycle: 0, alts: [], altTimes: {}, ins: [] },
    { id: '50-o30', seq: 30, opNo: 30, opId: '13', stationId: '10', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [] },
  ] } },
  orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: 4, start: '2026-10-19', due: '2026-11-20', priority: 2, status: 'serbest' }],
};
const kaynak = (opYer: Record<string, unknown> | undefined, opStatus: Record<string, string> = {}) => ({
  durum: {
    wcs: [{ id: '1', code: 'IM-1', name: 'Talasli', week: null, aktif: true }],
    stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
    machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }],
    people: [],
    fasonFirms: [{ id: 'F1', name: 'Deneme Kaplama' }],
    cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    emirler: { orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: 4, start: '2026-10-19', due: '2026-11-20', priority: 2, status: 'serbest' }], opStatus, opProg: {}, ...(opYer ? { opYer } : {}) },
  },
  ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null },
});
const calisma = (ek: Record<string, unknown> = {}, plan: unknown = null): Record<string, unknown> => ({
  surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {}, ...ek },
  rrSavedAt: 9, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'sert', dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan,
});
type Is = { S: number; C: number; fas?: unknown };
function coz(opYer?: Record<string, unknown>, c: Record<string, unknown> = calisma()): { ops: Record<string, Is>; st: Record<string, unknown>; kayitD: Record<string, unknown> } {
  const g = planGirdisi({ calisma: c, kayit: KAYIT, kaynak: kaynak(opYer), bugun: '2026-10-19' });
  assert.ok(g);
  const p = motorYukle().schedule(g.st, 'dagit', null) as { ops: Record<string, Is> };
  return { ops: p.ops, st: g.st as Record<string, unknown>, kayitD: g.S['D'] as Record<string, unknown> };
}
const fason = (ops: Record<string, Is>): Is => { const x = Object.entries(ops).find(([k]) => k.startsWith('O1.') && ops[k]!.fas); assert.ok(x, JSON.stringify(ops)); return x[1]; };
const saat = (gun: number, s: number): number => (gun - 19) * 24 + s;
const yer = (tarih: string) => ({ 'O1|root|2': { fasonId: 'F1', terminGun: 2, stationId: null, setup: null, cycle: null, fasonSiparis: { tarih, siparisNo: null } } });

describe('3330: firma tarihi çalışma planında', () => {
  test('sipariş yoksa dönüş firmanın süresiyle; firma tarihi varsa o gün 08:00, sonraki adım ondan sonra başlar', () => {
    const yok = fason(coz().ops);
    const var_ = coz(yer('2026-10-28'));
    const f = fason(var_.ops);
    assert.equal(f.S, yok.S);
    assert.notEqual(yok.C, saat(28, 8));
    assert.equal(f.C, saat(28, 8));
    const son = Object.entries(var_.ops).filter(([k]) => k.startsWith('O1.') && !var_.ops[k]!.fas).map(([, x]) => x).sort((a, b) => a.S - b.S).at(-1)!;
    assert.ok(son.S >= saat(28, 8));
  });

  test('firma tarihi çıkıştan önceyse dönüş çıkıştan sonradır (geçmişe dönmez)', () => {
    const f = fason(coz(yer('2026-10-12')).ops);
    assert.ok(f.C >= f.S + 1);
  });

  test('firma tarihi çalışmanın kaydına yazılmaz; yalnız çözümün kopyasında durur', () => {
    const r = coz(yer('2026-10-28'));
    assert.equal(Object.values(r.st['fasonSiparis'] as Record<string, string>)[0], '2026-10-28 08:00');
    assert.equal('fasonSiparis' in (r.st['D'] as object), false);
    assert.equal('fasonSiparis' in r.kayitD, false);
    assert.equal('fasonTermin' in r.kayitD, false);
  });

  test('elle girilen dönüş termini firma tarihi yokken geçerlidir; firma tarihi varsa o kazanır', () => {
    const id = Object.entries(coz().ops).find(([, x]) => x.fas)![0];
    const elle = calisma({ fasonTermin: { [id]: '2026-10-30 08:00' } });
    assert.equal(fason(coz(undefined, elle).ops).C, saat(30, 8));
    assert.equal(fason(coz(yer('2026-10-28'), calisma({ fasonTermin: { [id]: '2026-10-30 08:00' } })).ops).C, saat(28, 8));
  });

  test('"dönüş termini girilmedi" uyarısı firma tarihi olan adımda yazılmaz', () => {
    const ilk = coz();
    const planli = (): Record<string, unknown> => calisma({}, { ops: ilk.ops, fail: [], J: {}, dataVer: 1 });
    const uyari = (r: ReturnType<typeof coz>): unknown[] => (r.st['tmUyari'] as { t: string }[]).filter((u) => u.t === 'Termin yok');
    assert.equal(uyari(coz(undefined, planli())).length, 1);
    assert.equal(uyari(coz(yer('2026-10-28'), planli())).length, 0);
  });

  test('biten fason adıma firma tarihi yazılmaz', () => {
    const g = planGirdisi({ calisma: calisma(), kayit: KAYIT, kaynak: kaynak(yer('2026-10-28'), { 'O1|root|2': 'tamam' }), bugun: '2026-10-19' });
    assert.ok(g);
    assert.equal((g.st as Record<string, unknown>)['fasonSiparis'], undefined);
    assert.deepEqual(Object.keys((g.st as { bitti: Record<string, number> }).bitti), ['O1.20']);
  });

  test('kayıtlı çalışmaya dışarıdan konan fasonSiparis etkisizdir: tarih yalnız sunucunun okumasından gelir', () => {
    const yok = fason(coz().ops);
    const id = Object.entries(coz().ops).find(([, x]) => x.fas)![0];
    const sokulan = { ...calisma({ fasonSiparis: { [id]: '2026-10-28 08:00' } }), fasonSiparis: { [id]: '2026-10-28 08:00' } };
    const r = coz(undefined, sokulan);
    assert.equal(fason(r.ops).C, yok.C);
    assert.equal(r.st['fasonSiparis'], undefined);
  });

  test('Kokpit değerlendirmesi (plan-kur) aynı tarihi kullanır', async () => {
    const r = await degerlendirmeYap({ calisma: calisma(), kayit: KAYIT, kaynak: kaynak(yer('2026-10-28')), bugun: '2026-10-19', istek: { tur: 'plan-kur' } }, Date.parse('2026-10-19T06:00:00Z'));
    assert.ok(r && !('hata' in r), JSON.stringify(r));
    const plan = (r.sonuc as unknown as { plan: { ops: Record<string, Is> } }).plan;
    assert.equal(fason(plan.ops).C, saat(28, 8));
  });
});
