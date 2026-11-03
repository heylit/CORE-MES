import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MOTOR_AYARI_VARSAYILAN } from '#paylasilan/sozlesme/plan.ts';
import { calismayaMotorAyari } from './motor-ayari-kurallar.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';

// 1952 (1953 a, 1954 a, 1957 a, 1959 a): planlama atölyesinde insanlı istasyonun tezgâhları o istasyonda yetkin ve vardiyası olan
// kişilerdir; adım bu kişilere açılır, istasyondaki makine aday olmaz. Veriler uydurmadır.
const makine = (id: string, istasyon: string) => ({ id, code: `T${id}`, name: `Tezgah ${id}`, stationId: istasyon, status: 'aktif', aktif: true });
const istasyon = (id: string) => ({ id, code: `S${id}`, name: `Istasyon ${id}`, wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true });
const kisi = (id: string, skills: string[]) => ({
  id, name: `Kisi ${id}`, code: null, role: null, stationId: null, wcId: '1', shiftId: null, skills, cost: null, active: true, machines: [], maxMachines: null,
});
const ADIM = { id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '40', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [] };
const KAYIT = {
  version: 7, savedAt: 9,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek govde', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Montaj' }],
  machines: [],
  routes: { 50: { base: null, steps: [ADIM] } },
  orders: [
    { id: 'O1', no: 'E-1', itemId: '50', qty: 8, start: '2026-10-19', due: '2026-11-20', priority: 1, status: 'serbest' },
    { id: 'O2', no: 'E-2', itemId: '50', qty: 8, start: '2026-10-19', due: '2026-11-20', priority: 1, status: 'serbest' },
  ],
};
// Sunucunun rota okuması (Reçete ve Rota durumu): adımın motor ayarı açık çalışmadaki üründen gelir (sunucuKaydi).
const ROTA = {
  items: [{ id: '50', code: 'MM-1', name: 'Ornek govde', type: 'mamul', unit: 'ad', stock: 0 }],
  routes: { 50: { base: null, steps: [ADIM] } },
  routeRevs: [{ id: '7', itemId: '50', no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: [] } }],
};
const kaynak = (insanli: string[] | undefined, kisiler = ['7', '8']) => ({
  durum: {
    ...ROTA,
    wcs: [{ id: '1', code: 'IM-1', name: 'Montaj', week: null, aktif: true }],
    stations: [istasyon('10'), istasyon('40')],
    machines: [makine('100', '10'), makine('400', '40')],
    // 9 yetkin ama vardiyasız (1959 a), 10 yalnız makineli istasyonda yetkin.
    people: [kisi('7', ['40']), kisi('8', ['10', '40']), kisi('9', ['40']), kisi('10', ['10'])],
    cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
  },
  ek: {
    takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: { ...Object.fromEntries(kisiler.map((k) => [k, '3'])), 10: '3' } },
    makineNotu: null, kisiGorevi: null, ...(insanli ? { insanliIstasyonlar: insanli } : {}),
  },
});
const calismaKur = (kapali: string[]): Record<string, unknown> => ({
  surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  rrSavedAt: 5, dataVer: 1, kisitSurum: 2, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'sert', dondurma: 4, rule: 'edd' },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali, olaylar: [], plan: null,
});
const girdi = (insanli: string[] | undefined, kapali: string[] = ['personel'], calisma?: unknown, kisiler?: string[]) => {
  const g = planGirdisi({ calisma: calismayaMotorAyari(calisma ?? calismaKur(kapali), MOTOR_AYARI_VARSAYILAN), kayit: KAYIT, kaynak: kaynak(insanli, kisiler), bugun: '2026-10-19' });
  assert.ok(g);
  return g;
};
type D = { tezgahlar: { id: string; grup: string; vardiyalar?: string[]; opOran: number }[]; personel: { id: string; makineler: string[] }[]; urunler: { rota: { tezgahlar: { id: string }[] }[] }[] };
const D = (S: unknown) => (S as { D: D }).D;
const adayTezgahlar = (S: unknown) => D(S).urunler[0]!.rota[0]!.tezgahlar.map((t) => String(t.id));

describe('plan: insanlı istasyon planlama atölyesinde (1952)', () => {
  test('adım insanlı istasyonda yetkin ve vardiyası olan kişilere açılır; makine ve vardiyasız kişi aday olmaz', () => {
    const g = girdi(['40']);
    assert.deepEqual(adayTezgahlar(g.S), ['kisi-7', 'kisi-8']);
    const t = Object.fromEntries(D(g.S).tezgahlar.map((x) => [x.id, x]));
    assert.deepEqual(Object.keys(t), ['100', '400', 'kisi-7', 'kisi-8'], 'vardiyasız kişi (9) ve makineli istasyonun kişisi (10) tezgâh almaz');
    assert.deepEqual([t['kisi-7']?.grup, t['kisi-7']?.vardiyalar, t['kisi-7']?.opOran], ['40', ['3'], 1], 'istasyonun operatör oranı el tezgâhına uygulanmaz');
    const p = Object.fromEntries(D(g.S).personel.map((x) => [x.id, x]));
    assert.deepEqual([p['7']?.makineler, p['8']?.makineler, p['9']?.makineler], [['kisi-7'], ['kisi-8'], []]);
  });

  test('istasyon insanlı değilse (liste yok ya da istasyon listede değil) bugünkü gibi makinelere açılır', () => {
    assert.deepEqual(adayTezgahlar(girdi(undefined).S), ['400']);
    assert.deepEqual(adayTezgahlar(girdi(['10']).S), ['400']);
    assert.ok(!D(girdi(undefined).S).tezgahlar.some((x) => x.id.startsWith('kisi-')));
  });

  test('istasyon insanlıya dönünce kayıttaki makine adayı kişilere geçer; geri dönünce makineye', () => {
    const once = girdi(undefined);
    assert.deepEqual(adayTezgahlar(once.S), ['400']);
    const sonra = girdi(['40'], ['personel'], once.S);
    assert.deepEqual(adayTezgahlar(sonra.S), ['kisi-7', 'kisi-8']);
    assert.deepEqual(adayTezgahlar(girdi(undefined, ['personel'], sonra.S).S), ['400']);
  });

  // Süre makinedeki gibi rotadandır; kalan kişinin adımdaki öteki ayarı korunur.
  test('kişi vardiya alınca ya da kaybedince aday kümesi yenilenir; kalan kişinin adım ayarı korunur', () => {
    const ilk = girdi(['40'], ['personel'], undefined, ['7']);
    assert.deepEqual(adayTezgahlar(ilk.S), ['kisi-7']);
    const rota = D(ilk.S).urunler[0]!.rota[0]! as unknown as { tezgahlar: Record<string, unknown>[] };
    rota.tezgahlar[0]!['ornekAyar'] = 'elle';
    const iki = girdi(['40'], ['personel'], ilk.S, ['7', '8']);
    const t = (D(iki.S).urunler[0]!.rota[0]! as unknown as { tezgahlar: Record<string, unknown>[] }).tezgahlar.map((x) => [x['id'], x['cevrim'], x['ornekAyar']]);
    assert.deepEqual(t, [['kisi-7', 30, 'elle'], ['kisi-8', 30, undefined]]);
    assert.deepEqual(adayTezgahlar(girdi(['40'], ['personel'], iki.S, ['8']).S), ['kisi-8']);
  });

  test('motor iki işi iki kişiye aynı anda dizer; kişi aynı anda tek iş yapar', () => {
    for (const kapali of [['personel'], []]) {
      const g = girdi(['40'], kapali);
      const m = motorYukle();
      const p = m.schedule(g.st, 'yeni', null) as { ops: Record<string, { m: string; S: number; C: number }> };
      const o1 = p.ops['O1.10'], o2 = p.ops['O2.10'];
      assert.ok(o1 && o2, `kısıt ${kapali.join(',') || 'açık'}: iki iş de yerleşmeli`);
      assert.deepEqual([o1.m, o2.m].sort(), ['kisi-7', 'kisi-8'], `kısıt ${kapali.join(',') || 'açık'}`);
      assert.equal(o1.S, o2.S);
    }
  });
});
