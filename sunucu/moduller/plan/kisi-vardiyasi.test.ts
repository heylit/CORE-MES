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
const ADIM = { id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '40', setup: 0, cycle: 80, alts: [], altTimes: {}, ins: [] };
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
    cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }, { id: '4', name: 'Gece', start: '20:00', end: '05:00', breaks: [] }], holidays: [] },
  },
  ek: {
    takvim: { hafta: { 1: { 1: ['3', '4'], 2: ['3', '4'], 3: ['3', '4'], 4: ['3', '4'], 5: ['3', '4'] } }, kisiVardiyasi: { ...Object.fromEntries(kisiler.map((k) => [k, '3'])), 10: '3' } },
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

const gunSaat = (h: number): number => h % 24;
describe('plan motoru: tek vardiyalı kişi (3601)', () => {
  test('KV-01: kişinin el tezgâhı yalnız kişinin vardiyasında çalışır; tesisin öteki vardiyası (gece) uzun adımı taşımaz', () => {
    const g = girdi(['40'], ['personel'], undefined, ['7']);
    const p = motorYukle().schedule(g.st, 'yeni', null) as { ops: Record<string, { m: string; S: number; C: number }> };
    const o1 = p.ops['O1.10'], o2 = p.ops['O2.10'];
    assert.ok(o1 && o2, 'iki iş de yerleşti');
    assert.deepEqual([o1.m, o2.m], ['kisi-7', 'kisi-7']);
    // 80 dk x 8 adet = 10 sa 40 dk: gündüz vardiyası (08:00-16:00) günde 8 saat verir; ikinci gün 10:40'ta biter, gece vardiyasına (20:00) taşmaz.
    for (const o of [o1, o2]) {
      assert.ok(gunSaat(o.S) >= 8 - 1e-9 && gunSaat(o.S) < 16, `başlangıç gündüz vardiyasında: ${String(o.S)}`);
      assert.ok(gunSaat(o.C) > 8 && gunSaat(o.C) <= 16 + 1e-9, `bitiş gündüz vardiyasında: ${String(o.C)}`);
    }
    assert.ok(Math.abs(o1.C - (24 + 10 + 40 / 60)) < 1e-6, 'ilk iş ertesi gün 10:40 biter (iki gün x gündüz vardiyası)');
    assert.ok(o2.S >= o1.C - 1e-9, 'ikinci iş ilkinin ardından');
  });

  test('KV-02: kişi tezgâhının vardiya listesi sayı kimlikle ya da boş olabilir; sayı aynı vardiyadır, boş liste tesisin bütün vardiyalarına düşmez', () => {
    const sayiyla = girdi(['40'], ['personel'], undefined, ['7']);
    D(sayiyla.st).tezgahlar.find((x) => x.id === 'kisi-7')!.vardiyalar = [3] as unknown as string[];
    const p = motorYukle().schedule(sayiyla.st, 'yeni', null) as { ops: Record<string, { m: string; S: number; C: number }> };
    assert.ok(Math.abs(p.ops['O1.10']!.C - (24 + 10 + 40 / 60)) < 1e-6, 'sayı kimlik kişinin vardiyasıdır');

    const bos = girdi(['40'], ['personel'], undefined, ['7']);
    D(bos.st).tezgahlar.find((x) => x.id === 'kisi-7')!.vardiyalar = [];
    const q = motorYukle().schedule(bos.st, 'yeni', null) as { ops: Record<string, { m: string; S: number; C: number }> };
    assert.equal(q.ops['O1.10'], undefined, 'vardiyası olmayan kişiye iş yerleşmez');
  });

  test('KV-03: kilit saati kişinin vardiyası dışına düşerse plan kilitli işi ilk açık ana yerleştirir (sunucu sabit işi vardiya dışında kabul etmez)', () => {
    const g = girdi(['40'], ['personel'], undefined, ['7']);
    (g.st as unknown as { locks: Record<string, unknown> }).locks = { 'O1.10': { m: 'kisi-7', S: 20 } };
    const p = motorYukle().schedule(g.st, 'yeni', null) as { ops: Record<string, { m: string; S: number; C: number }> };
    const o1 = p.ops['O1.10']!;
    assert.equal(o1.m, 'kisi-7');
    assert.equal(o1.S, 32, 'kilit 20:00 (vardiya dışı): iş ertesi sabah 08:00\'e yerleşir');
    assert.ok(gunSaat(o1.S) >= 8 && gunSaat(o1.S) < 16, 'başlangıç kişinin vardiyasında');
    assert.ok(p.ops['O2.10']!.S >= o1.C - 1e-9, 'ardıl işin başlangıcı öncülün bitişinden önce olamaz');
  });
});
