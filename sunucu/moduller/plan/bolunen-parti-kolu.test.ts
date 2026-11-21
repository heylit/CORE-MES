import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';
import { kolYerleri } from '../../../istemci/src/moduller/plan/planlama/tipler.ts';

// 3512: adım ortasından bölünen parti (kol) rotanın yalnız kendi adımlarını işler; ayrıldığı yerden önceki adımı üst emir partinin adediyle
// birlikte yapar, parti katıldığı adımda üst emre döner. Emirler kaynak okumasındaki biçimdedir (Reçete ve Rota emirleriCevir: parentId,
// kol { n, m }, adimAdetleri "emir no|OP"); veriler uydurmadır.

const tezgah = (id: string, grup: string): Record<string, unknown> => ({ id, ad: id, grup, ucret: 750, verim: 1, vardiyalar: ['3'], opOran: 0 });
// 10. adım ham malzeme tüketir (parça başına 2 kg).
const adim = (seq: number, st: string, cycle: number, setup: number) => ({ id: `51-o${String(seq)}`, seq, opNo: seq, opId: '13', stationId: st, setup, cycle, alts: [], altTimes: {}, ins: seq === 10 ? [{ itemId: '90', qty: 2 }] : [] });
// Üç adım: 10 frezede, 20 tornada, 30 frezede.
const kayit = (adimlar = [adim(10, '20', 60, 0), adim(20, '10', 60, 0), adim(30, '20', 60, 0)]) => ({
  version: 7, savedAt: 9,
  items: [{ id: '51', code: 'MM-2', name: 'Ornek burc', type: 'mamul' }, { id: '90', code: 'HM-1', name: 'Ornek cubuk', type: 'ham', unit: 'kg' }],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', plan: tezgah('100', '10') }, { id: '200', code: 'F1', name: 'Freze 1', stationId: '20', plan: tezgah('200', '20') }],
  routes: { 51: { base: null, steps: adimlar } },
  orders: [],
});
type Kol = { n: number; m: number } | null;
type Emir = { id: string; no: string; itemId: string; qty: number; start: string; due: string; priority: number; status: string; note: string; parentId: string | null; kol: Kol };
const emir = (id: string, qty: number, parentId: string | null = null, kol: Kol = null): Emir =>
  ({ id, no: `E-${id}`, itemId: '51', qty, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'serbest', note: '', parentId, kol });
interface Ek { opStatus?: Record<string, string>; adimAdetleri?: Record<string, number>; w?: Record<string, unknown>; locks?: Record<string, { m: string; S: number }>; kayit?: ReturnType<typeof kayit> }
const kaynak = (orders: Emir[], ek: Ek) => ({
  durum: {
    wcs: [{ id: '1', code: 'IM-1', name: 'Talasli', week: null, aktif: true }],
    stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }, { id: '20', code: 'FRZ', name: 'Freze', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
    machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }, { id: '200', code: 'F1', name: 'Freze 1', stationId: '20', status: 'aktif', aktif: true }],
    people: [], cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    emirler: { orders, opStatus: ek.opStatus ?? {}, opProg: {} },
    adimAdetleri: ek.adimAdetleri ?? {},
  },
  ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null },
});
const calismaKur = (w: Record<string, unknown> = {}, locks: Record<string, unknown> = {}): Record<string, unknown> => ({
  surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks, gercek: {}, w: { famK: 0.3, mat: 'sert', dondurma: 4, ...w },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
});
interface Is { m: string; S: number; C: number; run: number }
interface Sonuc {
  ops: Record<string, Is>; isler: string[]; adimBekle: Record<string, { kadar: number }>;
  // Motorun gördüğü: plandaki emirler, biten adımlar, kolun işlemediği adımlar, emir başına ayrılan malzeme ve siparişi verilmemiş eksik (kg).
  emirler: string[]; bitti: string[]; kolDisi: Record<string, number>; malzeme: Record<string, number>; eksik: number;
}
function kur(orders: Emir[], ek: Ek = {}): Sonuc {
  const k = kaynak(orders, ek), kyt = ek.kayit ?? kayit();
  let S = calismaKur(ek.w, ek.locks);
  let g = planGirdisi({ calisma: S, kayit: kyt, kaynak: k, bugun: '2026-10-19' });
  for (let i = 0; i < 4 && g && g.S['dataVer'] !== S['dataVer']; i++) { S = g.S; g = planGirdisi({ calisma: S, kayit: kyt, kaynak: k, bugun: '2026-10-19' }); }
  assert.ok(g && g.S['dataVer'] === S['dataVer'], 'birleşme kararlı');
  const st = g.st as unknown as { adimBekle?: unknown; bitti?: Record<string, unknown>; kolDisi?: Record<string, number>; D: { siparisler: { id: string }[]; satinalma?: { tm?: string; miktar: number }[] } };
  const eksik = (st.D.satinalma ?? []).filter((x) => x.tm === 'siparis-yok').reduce((t, x) => t + x.miktar, 0);
  const emirler = st.D.siparisler.map((x) => x.id).sort();
  const cx = motorYukle().compile(g.st) as unknown as { mat: { res: Record<string, { det: { need: number }[] }> } };
  const malzeme = Object.fromEntries(Object.entries(cx.mat.res).map(([j, r]) => [j, r.det.reduce((t, d) => t + d.need, 0)]));
  const p = motorYukle().schedule(g.st, 'dagit', null);
  const yerlesmeyen = p.fail ?? [];
  assert.equal(yerlesmeyen.length, 0, `bütün adımlar yerleşti: ${yerlesmeyen.join(', ')}`);
  const ops = p.ops as unknown as Record<string, Is>;
  return {
    ops, isler: Object.keys(ops).sort(), adimBekle: JSON.parse(JSON.stringify(st.adimBekle ?? {})) as Record<string, { kadar: number }>,
    emirler, bitti: Object.keys(st.bitti ?? {}).sort(), kolDisi: JSON.parse(JSON.stringify(st.kolDisi ?? {})) as Record<string, number>, malzeme, eksik,
  };
}
// Üst emir 2 (9 adetten 6'sı kaldı), 2. adımdan bölünen parti 3 (3 adet). Üst emrin 1. adımı 9 adet işler (adimAdetleri).
const ust = emir('2', 6);
const ADET = { adimAdetleri: { 'E-2|10': 9 } };

describe('adım ortasından bölünen parti (3512)', () => {
  test('KL-01: katılmayan kol yalnız ayrıldığı adımdan sonrasını işler; önceki adımı üst emir partinin adediyle yapar, parti onu bekler', () => {
    const r = kur([ust, emir('3', 3, '2', { n: 1, m: 4 })], ADET);
    assert.deepEqual(r.isler, ['2.10', '2.20', '2.30', '3.20', '3.30'], 'partinin 10. adımı planda yok');
    assert.equal(r.ops['2.10']!.run, 9, 'üst emrin 10. adımı 9 adet');
    assert.equal(r.ops['2.20']!.run, 6);
    assert.equal(r.ops['3.20']!.run, 3);
    assert.ok(r.ops['3.20']!.S >= r.ops['2.10']!.C - 1e-9, `parti üst emrin 10. adımını bekler: ${String(r.ops['3.20']!.S)} >= ${String(r.ops['2.10']!.C)}`);
  });

  test('KL-02: katılan kol katıldığı adımdan sonrasını da işlemez; üst emrin o adımı partinin son adımını bekler', () => {
    const r = kur([ust, emir('3', 3, '2', { n: 1, m: 3 })], { adimAdetleri: { 'E-2|10': 9, 'E-2|30': 9 } });
    assert.deepEqual(r.isler, ['2.10', '2.20', '2.30', '3.20']);
    assert.equal(r.ops['2.30']!.run, 9, 'katılma adımı 9 adet');
    assert.ok(r.ops['3.20']!.S >= r.ops['2.10']!.C - 1e-9, 'parti üst emrin 10. adımını bekler');
    assert.ok(r.ops['2.30']!.S >= r.ops['3.20']!.C - 1e-9, `katılma adımı partiyi bekler: ${String(r.ops['2.30']!.S)} >= ${String(r.ops['3.20']!.C)}`);
    assert.ok(r.ops['2.30']!.S >= r.ops['2.20']!.C - 1e-9, 'kendi önceki adımını da bekler');
  });

  test('KL-03: üst emrin önceki adımı bittiyse parti beklemez; ilk adımdan ayrılıp katılan kolun öncülü yoktur', () => {
    const biten = kur([ust, emir('3', 3, '2', { n: 1, m: 4 })], { opStatus: { '2|root|1': 'tamam' } });
    assert.deepEqual(biten.isler, ['2.20', '2.30', '3.20', '3.30']);
    assert.equal(Math.min(biten.ops['2.20']!.S, biten.ops['3.20']!.S), 8, 'tornanın ilk işi sabah başlar');
    const bastan = kur([ust, emir('3', 3, '2', { n: 0, m: 2 })], { adimAdetleri: { 'E-2|20': 9, 'E-2|30': 9 } });
    assert.deepEqual(bastan.isler, ['2.10', '2.20', '2.30', '3.10']);
    assert.ok(bastan.ops['2.20']!.S >= bastan.ops['3.10']!.C - 1e-9, 'katılma adımı partiyi bekler');
  });

  test('KL-04: ilk adımdan bölünen tam rotalı parti ve rotaya uymayan aralık bütün rotasıyla dizilir', () => {
    assert.deepEqual(kur([ust, emir('3', 3, '2')]).isler, ['2.10', '2.20', '2.30', '3.10', '3.20', '3.30']);
    for (const kol of [{ n: 2, m: 3 }, { n: 1, m: 5 }, { n: 3, m: 4 }]) {
      assert.deepEqual(kur([ust, emir('3', 3, '2', kol)]).isler, ['2.10', '2.20', '2.30', '3.10', '3.20', '3.30'], JSON.stringify(kol));
    }
    assert.deepEqual(kur([ust, emir('3', 3, null, { n: 1, m: 4 })]).isler, ['2.10', '2.20', '2.30', '3.10', '3.20', '3.30'], 'üst emri olmayan emir kol değildir');
  });

  test('KL-05: kendi adımlarının hepsi biten kol plandan düşer; bir kısmı bittiyse kalanı dizilir', () => {
    const hepsi = kur([ust, emir('3', 3, '2', { n: 1, m: 3 })], { opStatus: { '3|root|2': 'tamam' } });
    assert.deepEqual(hepsi.isler, ['2.10', '2.20', '2.30']);
    assert.deepEqual(hepsi.emirler, ['2'], 'kendi adımı kalmayan kol plandaki emirlerden düşer');
    const kismi = kur([ust, emir('3', 3, '2', { n: 1, m: 4 })], { opStatus: { '3|root|2': 'tamam' } });
    assert.deepEqual(kismi.isler, ['2.10', '2.20', '2.30', '3.30']);
  });

  test('KL-06: bağ yalnız ayrılma ve katılma adımındadır: parti üst emrin aynı sıradaki adımını, üst emrin ara adımı da partiyi beklemez', () => {
    // Üst emrin 20. adımı 100. saate kilitli: parti onu beklemeden, 10. adım biter bitmez başlar.
    const gecUst = kur([ust, emir('3', 3, '2', { n: 1, m: 4 })], { ...ADET, locks: { '2.20': { m: '100', S: 100 } } });
    assert.equal(gecUst.ops['2.20']!.S, 100);
    assert.ok(gecUst.ops['3.20']!.S >= gecUst.ops['2.10']!.C - 1e-9 && gecUst.ops['3.20']!.C <= 100, `parti 20. adımı beklemez: ${String(gecUst.ops['3.20']!.S)}`);
    // Partinin 20. adımı 100. saate kilitli: üst emrin 20. adımı onu beklemez, katılma adımı (30) bekler.
    const gecParti = kur([ust, emir('3', 3, '2', { n: 1, m: 3 })], { adimAdetleri: { 'E-2|10': 9, 'E-2|30': 9 }, locks: { '3.20': { m: '100', S: 100 } } });
    assert.equal(gecParti.ops['3.20']!.S, 100);
    assert.ok(gecParti.ops['2.20']!.C <= 100, `üst emrin 20. adımı partiyi beklemez: ${String(gecParti.ops['2.20']!.S)}`);
    assert.ok(gecParti.ops['2.30']!.S >= gecParti.ops['3.20']!.C - 1e-9, 'katılma adımı bekler');
  });

  test('KL-07: üst emrin beklemesi kolun yalnız kendi adımına geçer (3511)', () => {
    const r = kur([ust, emir('3', 3, '2', { n: 1, m: 4 })], { ...ADET, w: { adimBekle: { '2.10': { kadar: 100, neden: 'malzeme' }, '2.20': { kadar: 200, neden: 'malzeme' } } } });
    assert.deepEqual(r.adimBekle, { '2.10': { kadar: 100 }, '2.20': { kadar: 200 }, '3.20': { kadar: 200 } }, 'partinin işlemediği 10. adıma bekleme yazılmaz');
    assert.ok(r.ops['3.20']!.S >= 200);
  });

  test('KL-08: kolun işlemediği adım bitmiş sayılmaz; malzeme payı üst emir o adımı bitirene dek ihtiyaçta kalır, sonra düşer', () => {
    const bekleyen = kur([ust, emir('3', 3, '2', { n: 1, m: 4 })], ADET);
    assert.deepEqual(bekleyen.bitti, [], 'partinin 10. adımı biten adım değil (maliyeti partiye yazılmaz)');
    assert.deepEqual(bekleyen.kolDisi, { '3.10': 1 });
    assert.deepEqual(bekleyen.malzeme, { 2: 12, 3: 6 }, 'üst emir 6 adet, parti 3 adet: toplam 9 adedin malzemesi');
    assert.equal(bekleyen.eksik, 18, 'siparişi verilmemiş eksik de 9 adet içindir');
    const biten = kur([ust, emir('3', 3, '2', { n: 1, m: 4 })], { opStatus: { '2|root|1': 'tamam' } });
    assert.deepEqual(biten.bitti, ['2.10']);
    assert.deepEqual(biten.kolDisi, { '3.10': 2 });
    assert.deepEqual(biten.malzeme, { 2: 0, 3: 0 }, 'üst emir adımı bitirince partinin payı da tüketilmiştir');
    assert.equal(biten.eksik, 0);
    // Kaynak kolun işlemediği yere durum yazsa da o adım kolun biten adımı olmaz.
    const yabanci = kur([ust, emir('3', 3, '2', { n: 1, m: 4 })], { ...ADET, opStatus: { '3|root|1': 'tamam' } });
    assert.deepEqual([yabanci.bitti, yabanci.kolDisi, yabanci.isler], [[], { '3.10': 1 }, ['2.10', '2.20', '2.30', '3.20', '3.30']]);
    // Katılan kol: katıldığı adımdan sonrası da kol dışıdır.
    assert.deepEqual(kur([ust, emir('3', 3, '2', { n: 1, m: 3 })], { adimAdetleri: { 'E-2|10': 9, 'E-2|30': 9 } }).kolDisi, { '3.10': 1, '3.30': 1 });
  });

  test('KL-09: koldan bölünen kol: adımın sahibi o yeri kendi işleyen en yakın üst emirdir', () => {
    // 3 (20 ve 30), 2'den 2. adımda ayrıldı; 4 (yalnız 30), 3'ten 3. adımda ayrıldı. 4'ün 10. adımını 2, 20. adımını 3 yapar.
    const emirler = [ust, emir('3', 2, '2', { n: 1, m: 4 }), emir('4', 1, '3', { n: 2, m: 4 })];
    const r = kur(emirler, ADET);
    assert.deepEqual(r.isler, ['2.10', '2.20', '2.30', '3.20', '3.30', '4.30']);
    assert.ok(r.ops['4.30']!.S >= r.ops['3.20']!.C - 1e-9, `4, 3'ün 20. adımını bekler: ${String(r.ops['4.30']!.S)} >= ${String(r.ops['3.20']!.C)}`);
    assert.deepEqual(r.kolDisi, { '3.10': 1, '4.10': 1, '4.20': 1 });
    const biten = kur(emirler, { opStatus: { '2|root|1': 'tamam' } });
    assert.deepEqual(biten.kolDisi, { '3.10': 2, '4.10': 2, '4.20': 1 }, "4'ün 10. adımının sahibi 2'dir (3 o adımı işlemez)");
    assert.deepEqual(biten.malzeme, { 2: 0, 3: 0, 4: 0 });
  });

  test('KL-11: üst emir kapandıysa (bitti ya da iptal) kolun işlemediği adım yapılmış sayılır, malzeme payı düşer', () => {
    for (const status of ['tamam', 'iptal']) {
      const r = kur([{ ...ust, status }, emir('3', 3, '2', { n: 1, m: 4 })], ADET);
      assert.deepEqual([r.emirler, r.isler, r.kolDisi, r.malzeme, r.eksik], [['3'], ['3.20', '3.30'], { '3.10': 2 }, { 3: 0 }, 0], status);
    }
  });

  test('KL-12: katılma adımının sahibi de o yeri kendi işleyen en yakın üst emirdir', () => {
    // 3 (10 ve 20) 2'ye 3. adımda katılır; 4 (10 ve 20) 3'ten ayrıldı, o da 3. adımda katılır. 30. adımı 3 işlemez: 4'ü bekleyecek olan 2'dir.
    const emirler = [ust, emir('3', 1, '2', { n: 0, m: 3 }), emir('4', 3, '3', { n: 0, m: 3 })];
    const r = kur(emirler, { adimAdetleri: { 'E-2|30': 10 }, w: { adimBekle: { '4.20': { kadar: 200, neden: 'malzeme' } } } });
    assert.deepEqual(r.isler, ['2.10', '2.20', '2.30', '3.10', '3.20', '4.10', '4.20']);
    assert.deepEqual(r.kolDisi, { '3.30': 1, '4.30': 1 });
    assert.ok(r.ops['4.20']!.S >= 200 && r.ops['2.30']!.S >= r.ops['4.20']!.C - 1e-9, `2'nin 30. adımı 4'ün son adımını bekler: ${String(r.ops['2.30']!.S)} >= ${String(r.ops['4.20']!.C)}`);
  });

  test('KL-10: motor ile Kokpit\'in kendi hesabı kolun adımlarını aynı kuralla seçer', () => {
    // Kural iki yerde yazılıdır (motor girdisi ve istemci tipler.ts); biri değişip öbürü kalırsa Kokpit partiyi motordan farklı gösterir.
    const adimlar = [adim(10, '20', 60, 0), adim(20, '10', 60, 0), adim(30, '20', 60, 0)];
    const araliklar: Kol[] = [{ n: 1.5, m: 4 }, { n: 1, m: 3.5 }];
    for (let n = -1; n <= 4; n++) for (let m = 0; m <= 6; m++) araliklar.push({ n, m });
    for (const sayi of [2, 3]) for (const kol of araliklar) for (const ustId of ['2', null]) {
      const parti = emir('3', 3, ustId, kol), rota = adimlar.slice(0, sayi);
      const motor = kur([ust, parti], { kayit: kayit(rota) }).isler.filter((x) => x.startsWith('3.'));
      const yer = kolYerleri([ust, parti]).get('3');
      const istemci = rota.filter((_, i) => !yer || yer(i + 1, sayi)).map((a) => `3.${String(a.seq)}`);
      assert.deepEqual(motor, istemci, `kol ${JSON.stringify(kol)}, ${String(sayi)} adım, üst ${String(ustId)}`);
    }
  });
});
