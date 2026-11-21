import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { degerlendirmeSonucu } from '#paylasilan/sozlesme/planlama.ts';
import { degerlendirmeYap } from './degerlendirme.ts';
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
interface Ek { yavasFreze?: boolean; opStatus?: Record<string, string>; adimAdetleri?: Record<string, number>; w?: Record<string, unknown>; locks?: Record<string, { m: string; S: number }>; kayit?: ReturnType<typeof kayit>; acikSiparisler?: { kod: string; miktar: number; tarih: string; siparisNo: string }[] }
const kaynak = (orders: Emir[], ek: Ek) => ({
  durum: {
    wcs: [{ id: '1', code: 'IM-1', name: 'Talasli', week: null, aktif: true }],
    stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }, { id: '20', code: 'FRZ', name: 'Freze', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
    machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true },
      ...(ek.yavasFreze ? [{ id: '201', code: 'F0', name: 'Freze 0', stationId: '20', status: 'aktif', aktif: true }] : []),
      { id: '200', code: 'F1', name: 'Freze 1', stationId: '20', status: 'aktif', aktif: true }],
    people: [], cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    emirler: { orders, opStatus: ek.opStatus ?? {}, opProg: {} },
    adimAdetleri: ek.adimAdetleri ?? {},
  },
  ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null, ...(ek.acikSiparisler ? { acikSiparisler: ek.acikSiparisler } : {}) },
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
  // Ölçüm (değerlendirme hesabı) için: birleşmiş çalışma ve sayfanın kaydettiği biçimin en azıyla plan.
  S: Record<string, unknown>; plan: Record<string, unknown>;
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
  const m = motorYukle(), p = m.schedule(g.st, 'dagit', null);
  const e = m.evaluate(p, g.st, null, false) as { J: Record<string, { C: number; T: number }> };
  const yerlesmeyen = p.fail ?? [];
  assert.equal(yerlesmeyen.length, 0, `bütün adımlar yerleşti: ${yerlesmeyen.join(', ')}`);
  const ops = p.ops as unknown as Record<string, Is>;
  return {
    ops, isler: Object.keys(ops).sort(), adimBekle: JSON.parse(JSON.stringify(st.adimBekle ?? {})) as Record<string, { kadar: number }>,
    emirler, bitti: Object.keys(st.bitti ?? {}).sort(), kolDisi: JSON.parse(JSON.stringify(st.kolDisi ?? {})) as Record<string, number>, malzeme, eksik,
    S: g.S, plan: { ops, fail: [], J: Object.fromEntries(Object.entries(e.J).map(([id, x]) => [id, { C: x.C, T: x.T }])), dataVer: g.S['dataVer'] },
  };
}
// Üst emir 2 (9 adetten 6'sı kaldı), 2. adımdan bölünen parti 3 (3 adet). Üst emrin 1. adımı 9 adet işler (adimAdetleri).
const ust = emir('2', 6);
const ADET = { adimAdetleri: { 'E-2|10': 9 } };
// "Partiyi böl" ölçümü: kayıtlı planın üstünde emri partilere ayırıp yeniden dizer. Dönen: ölçümün planındaki işler.
async function bol(orders: Emir[], ek: Ek, siparisId: string, adetler: number[], an = '2026-10-19T05:00:00Z'): Promise<Record<string, Is>> {
  const onceki = kur(orders, ek);
  const r = await degerlendirmeYap({ calisma: { ...onceki.S, plan: onceki.plan }, kayit: ek.kayit ?? kayit(), kaynak: kaynak(orders, ek), bugun: '2026-10-19',
    istek: { tur: 'parti-bolme', siparisId, dagitim: 'ayni', adetler } }, Date.parse(an));
  assert.ok(r && !('hata' in r), JSON.stringify(r));
  const s = degerlendirmeSonucu.parse(r.sonuc);
  if (s.tur !== 'parti-bolme' || !s.sonuc) return assert.fail(JSON.stringify(s));
  assert.deepEqual(s.sonuc.plan['fail'] ?? [], [], 'ölçümde bütün adımlar yerleşti');
  return s.sonuc.plan['ops'] as Record<string, Is>;
}

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

  test('KZ-05 (3502): kilitli adımın öncülünü bölünen parti de bekliyorsa öncül kilide yaslanmaz, en erken yere konur; başka bekleyeni yoksa kilide yaslanır', () => {
    const kilit = { locks: { '2.20': { m: '100', S: 100 } } };
    // Parti (20. adımdan ayrılan kol) üst emrin 10. adımını bekler: o adım geç yapılırsa parti kilide kadar boşuna bekler.
    const partili = kur([ust, emir('3', 3, '2', { n: 1, m: 4 })], { ...ADET, ...kilit }).ops;
    assert.equal(partili['2.20']!.S, 100);
    assert.deepEqual([partili['2.10']!.S, partili['2.10']!.C], [8, 33], 'öncül planın başında');
    assert.equal(partili['3.20']!.S, partili['2.10']!.C, 'parti öncül biter bitmez başlar');
    const neden = (r: Is | undefined): string => JSON.stringify((r as unknown as { why?: unknown }).why);
    assert.equal(neden(partili['2.10']), JSON.stringify({ t: 'kilit-oncul', r: '2.20', o: 1 }), 'öne çekilen öncülün nedeni ayrı');
    // Aynı emir partisiz: öncülü yalnız kilitli adım bekler. Kilitten önceki son iş gününe (80.-88. saat) yaslanır.
    const yalin = kur([ust], kilit).ops;
    assert.equal(yalin['2.20']!.S, 100);
    assert.ok(yalin['2.10']!.S >= 80 && yalin['2.10']!.C <= 88 + 1e-9, `öncül kilide yaslanır: ${String(yalin['2.10']!.S)}-${String(yalin['2.10']!.C)}`);
    assert.equal(neden(yalin['2.10']), JSON.stringify({ t: 'kilit-oncul', r: '2.20' }));
  });

  test('KZ-06 (3502): en erken yere konan öncül, en erken bitirdiği tezgâha konur', () => {
    // İkinci freze yarı hızda ve listede önde: iki tezgâh da boş, başlangıç aynı. Bitişe bakılmazsa öncül yavaş tezgâha düşer, parti daha geç başlar.
    const k = kayit();
    k.machines.splice(1, 0, { id: '201', code: 'F0', name: 'Freze 0', stationId: '20', plan: { ...tezgah('201', '20'), verim: 0.5 } });
    const r = kur([ust, emir('3', 3, '2', { n: 1, m: 4 })], { ...ADET, yavasFreze: true, kayit: k, locks: { '2.20': { m: '100', S: 100 } } }).ops;
    assert.deepEqual([r['2.10']!.m, r['2.10']!.S, r['2.10']!.C], ['200', 8, 33]);
    assert.equal(r['3.20']!.S, 33);
  });

  test('KZ-07 (3502): öne çekilen öncülün kendi öncülü de onunla birlikte öne gelir', () => {
    // Parti 30. adımdan ayrılır: üst emrin 20. adımını hem kilitli 30. adım hem parti bekler. 20. adım öne gelebilsin diye 10. adım da öne gelir.
    const r = kur([ust, emir('3', 3, '2', { n: 2, m: 4 })], { adimAdetleri: { 'E-2|10': 9, 'E-2|20': 9 }, locks: { '2.30': { m: '200', S: 200 } } }).ops;
    assert.equal(r['2.30']!.S, 200);
    assert.deepEqual([r['2.10']!.S, r['2.10']!.C, r['2.20']!.S], [8, 33, 33]);
    assert.equal(r['3.30']!.S, r['2.20']!.C, 'parti 20. adım biter bitmez başlar');
    // Partisiz aynı emir: iki öncülü de yalnız zincir bekler, ikisi de kilide yaslı kalır (kilit ikinci haftanın salısında, öncüller o haftada).
    const yalin = kur([ust], { locks: { '2.30': { m: '200', S: 200 } } }).ops;
    assert.ok(yalin['2.20']!.S >= 176 && yalin['2.20']!.C <= 200 + 1e-9, `20. adım kilide yaslı: ${String(yalin['2.20']!.S)}`);
    assert.ok(yalin['2.10']!.S >= 104 && yalin['2.10']!.C <= yalin['2.20']!.S + 1e-9, `10. adım 20. adıma yaslı: ${String(yalin['2.10']!.S)}`);
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
    // 3 (10 ve 20) 2'ye 3. adımda katılır; 4 (10 ve 20) 3'ten ayrıldı ve 3'e katılmaz: adımları 3'ün katılma yerinde biter (kaynak böyle
    // partiye { 0, 3 } verir). 30. adımı 3 işlemez: 4'ü bekleyecek olan 2'dir.
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

describe('"Partiyi böl" ölçümü biten ve kol dışı adımı partilere taşır (3514)', () => {
  test('PB-01: biten adım ölçümde yeniden planlanmaz', async () => {
    const ops = await bol([emir('2', 6)], { opStatus: { '2|root|1': 'tamam' } }, '2', [4, 2]);
    assert.deepEqual(Object.keys(ops).sort(), ['2/1.20', '2/1.30', '2/2.20', '2/2.30']);
  });

  test('PB-02: bölünen kol ölçümde de yalnız kendi adımlarıyla dizilir; partileri üst emrin önceki adımını bekler', async () => {
    const ops = await bol([ust, emir('3', 3, '2', { n: 1, m: 4 })], ADET, '3', [2, 1]);
    assert.deepEqual(Object.keys(ops).sort(), ['2.10', '2.20', '2.30', '3/1.20', '3/1.30', '3/2.20', '3/2.30']);
    for (const p of ['3/1.20', '3/2.20']) assert.ok(ops[p]!.S >= ops['2.10']!.C - 1e-9, `${p} üst emrin 10. adımını bekler: ${String(ops[p]!.S)} >= ${String(ops['2.10']!.C)}`);
  });

  test('PB-03: bölünen üst emrin partileri de kolun adımlarına bağlıdır', async () => {
    // Katılan kol (yalnız 20): üst emrin 30. adımı kolu bekler. Üst emir ölçümde bölününce iki partinin 30. adımı da bekler.
    const ops = await bol([ust, emir('3', 3, '2', { n: 1, m: 3 })], { adimAdetleri: { 'E-2|10': 9, 'E-2|30': 9 } }, '2', [4, 2]);
    assert.deepEqual(Object.keys(ops).sort(), ['2/1.10', '2/1.20', '2/1.30', '2/2.10', '2/2.20', '2/2.30', '3.20']);
    for (const p of ['2/1.30', '2/2.30']) assert.ok(ops[p]!.S >= ops['3.20']!.C - 1e-9, `${p} kolun son adımını bekler`);
    assert.ok(ops['3.20']!.S >= Math.max(ops['2/1.10']!.C, ops['2/2.10']!.C) - 1e-9, 'kol iki partinin 10. adımını da bekler');
  });

  test('PB-04: üst emrin beklemesi ölçümde bölünen partinin partilerinde de geçerlidir (3511)', async () => {
    const KADAR = 200;
    const w = { adimBekle: { '2.20': { kadar: KADAR, neden: 'malzeme', an: 1 } } };
    const ops = await bol([ust, emir('3', 3, '2')], { w }, '3', [2, 1]);
    for (const p of ['3/1.20', '3/2.20']) assert.ok(ops[p]!.S >= KADAR, `${p}: ${String(ops[p]!.S)} >= ${String(KADAR)}`);
    assert.ok(ops['3/1.10']!.S < KADAR, 'beklemesi olmayan adım yerinde');
  });

  test('PB-05: adımın emrin adedinden farklı adedi ilk partide kalır', async () => {
    const sure = (ops: Record<string, Is>, k: string): number[] => [ops[`2/1.${k}`]!.run, ops[`2/2.${k}`]!.run];
    // Üst emir (6 adet) 10. adımı kolun 3 adediyle birlikte, 9 adet işler: ölçümde 7 + 2.
    const kollu = await bol([ust, emir('3', 3, '2', { n: 1, m: 4 })], ADET, '2', [4, 2]);
    assert.deepEqual([sure(kollu, '10'), sure(kollu, '20'), sure(kollu, '30')], [[7, 2], [4, 2], [4, 2]]);
    // Hurdası düşülmüş adım (6 yerine 5 adet): 3 + 2. Başka emrin adım adedi partilere karışmaz.
    const hurdali = await bol([emir('2', 6), emir('4', 6)], { adimAdetleri: { 'E-2|20': 5, 'E-4|30': 8 } }, '2', [4, 2]);
    assert.deepEqual([sure(hurdali, '10'), sure(hurdali, '20'), sure(hurdali, '30'), hurdali['4.30']!.run], [[4, 2], [3, 2], [4, 2], 8]);
    // Fark ilk partiye adet bırakmıyorsa taşınmaz.
    const azalan = await bol([emir('2', 6)], { adimAdetleri: { 'E-2|20': 2 } }, '2', [4, 2]);
    assert.deepEqual(sure(azalan, '20'), [4, 2]);
  });

  test('PB-06: biten adımın malzemesi ölçümde partilerle yeniden ihtiyaca girmez; başka emir malzemesini gelişinden önce almaz', async () => {
    // Emir 2'nin 10. adımı bitti, malzemesi tüketildi. Emir 4'ün 12 kg'ı 22.10 08:00'de (80. saat) gelecek açık siparişte.
    const emirler = [emir('2', 6), emir('4', 6)];
    const ek = { opStatus: { '2|root|1': 'tamam' }, acikSiparisler: [{ kod: '90', miktar: 12, tarih: '2026-10-22', siparisNo: 'SA-ORN-1' }] };
    const onceki = kur(emirler, ek);
    assert.deepEqual([onceki.ops['4.10']!.S, onceki.eksik], [80, 0]);
    const ops = await bol(emirler, ek, '2', [4, 2]);
    assert.equal(ops['4.10']!.S, 80, 'ölçüm emir 4\'ü malzemesi gelmeden başlatmaz');
  });
});

describe('"Partiyi böl" ölçümü plana göre süren adımı ilk partinin adediyle sürdürür (3518)', () => {
  // Plan 10. adımı 08:00-14:00'e (8.-14. saat) yazdı; gerçekleşen kaydı yok. Ölçüm 09:00'da (06:00Z) yapılır: adım plana göre sürüyor sayılır.
  const SONRA = '2026-10-19T06:00:00Z';
  const yer = (ops: Record<string, Is>): Record<string, (string | number)[]> => Object.fromEntries(Object.entries(ops).map(([id, r]) => [id, [r.m, r.S, r.C, r.run]]));

  test('PB-07: ölçüm anı adımın plandaki başlangıcından sonraysa sonuç başlangıç anındaki ölçümle aynıdır', async () => {
    const basta = await bol([emir('2', 6)], {}, '2', [4, 2]);
    const sonra = await bol([emir('2', 6)], {}, '2', [4, 2], SONRA);
    assert.deepEqual([yer(sonra)['2/1.10'], yer(sonra)['2/2.10']], [['200', 8, 12, 4], ['200', 12, 14, 2]]);
    assert.deepEqual(yer(sonra), yer(basta));
  });

  test('PB-08: süren adımın adedi emrin adedinden farklıysa ilk parti fazlasıyla sürdürür', async () => {
    // Üst emir 10. adımı kolun 3 adediyle birlikte 9 adet işler (08:00'den ertesi gün 09:00'a): ilk parti 7 adet.
    const emirler = [ust, emir('3', 3, '2', { n: 1, m: 4 })];
    const basta = await bol(emirler, ADET, '2', [4, 2]);
    const sonra = await bol(emirler, ADET, '2', [4, 2], SONRA);
    assert.deepEqual([yer(sonra)['2/1.10'], yer(sonra)['2/2.10']], [['200', 8, 15, 7], ['200', 15, 33, 2]]);
    // Başlangıç anındaki ölçüm iki partiyi öbür sırayla dizer; 10. adımın bitişi ve sonraki adımlar aynıdır.
    const sonrasi = (ops: Record<string, Is>): unknown => Object.fromEntries(Object.entries(yer(ops)).filter(([id]) => !id.endsWith('.10')));
    assert.deepEqual(sonrasi(sonra), sonrasi(basta));
  });

  test('PB-09: öteki partiler adıma başlamamıştır; ilk partinin payı şimdiden önce bitiyorsa o da yapılmış sayılmaz', async () => {
    const ops = await bol([emir('2', 6)], {}, '2', [2, 4], SONRA);
    assert.deepEqual([ops['2/1.10']!.S, ops['2/1.10']!.C, ops['2/2.10']!.run], [8, 10, 4]);
    assert.ok(ops['2/2.10']!.S >= 10 - 1e-9, `ikinci parti ilk partiden sonra: ${String(ops['2/2.10']!.S)}`);
    // 1 adetlik ilk partinin payı 09:00'da biter; ölçüm 09:30'da. Kaydı olmayan iş bitmiş sayılmaz, şimdiden sonraya dizilir.
    const kucuk = await bol([emir('2', 6)], {}, '2', [1, 5], '2026-10-19T06:30:00Z');
    assert.deepEqual([kucuk['2/1.10']!.run, kucuk['2/2.10']!.run], [1, 5]);
    for (const p of ['2/1.10', '2/2.10']) assert.ok(kucuk[p]!.S >= 9.5 - 1e-9, `${p} şimdiden sonra: ${String(kucuk[p]!.S)}`);
  });

  test('PB-10: fasonda süren adım bütün partilerde plandaki dönüşüyle kalır', async () => {
    // 10. adım fason (firması seçilmemiş): 08:00'de çıktı, 176. saatte döner. Parçalar birlikte dışarıdadır; hiçbir parti yeniden gönderilmez.
    const fasonlu = kayit([{ ...adim(10, '20', 60, 0), stationId: null as unknown as string, fasonId: 'F1', terminGun: 2 } as unknown as ReturnType<typeof adim>, adim(20, '10', 60, 0), adim(30, '20', 60, 0)]);
    const ops = await bol([emir('2', 6)], { kayit: fasonlu }, '2', [4, 2], SONRA);
    assert.deepEqual([ops['2/1.10']!.C, ops['2/2.10']!.C, ops['2/1.20']!.S, ops['2/2.20']!.S], [176, 176, 176, 180]);
  });

  test('PB-11: ilk parça kontrolü olan süren adımda ilk parçanın süresi ayarda kalır, işleme süresine yeniden eklenmez', async () => {
    // İlk parça kontrollü adım: ilk parça ayara sayılır (1 saat), kalan 3 adet işlenir. 4 adetlik ilk parti 08:00-12:00.
    const faili = kayit([{ ...adim(10, '20', 60, 0), plan: { k: '10', fai: true } } as unknown as ReturnType<typeof adim>, adim(20, '10', 60, 0), adim(30, '20', 60, 0)]);
    const basta = await bol([emir('2', 6)], { kayit: faili }, '2', [4, 2]);
    const sonra = await bol([emir('2', 6)], { kayit: faili }, '2', [4, 2], SONRA);
    assert.deepEqual([yer(sonra)['2/1.10'], yer(sonra)['2/2.10']], [['200', 8, 12, 3], ['200', 12, 14, 1]]);
    assert.deepEqual(yer(sonra), yer(basta));
  });
});
