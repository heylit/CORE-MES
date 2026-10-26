import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { motorYukle, planCoz, type Motor, type MotorDurumu, type MotorPlani } from './plan-motoru.ts';

// Tek tezgâh ve tek operatör, gün boyu açık; ürünün tek adımı adet başına 1 saat.
const veri = (siparisler: { id: string; adet: number; termin: string }[] = [{ id: 'S1', adet: 10, termin: '2026-01-20' }]) => ({
  meta: { baslangic: '2026-01-05' }, ayarlar: {}, vardiyalar: [{ id: 'V', bas: '00:00', bit: '00:00' }],
  calismaGunleri: Object.fromEntries(['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'].map((g) => [g, ['V']])),
  tezgahlar: [{ id: 'T1', grup: 'G' }], personel: [{ id: 'P1', vardiya: 'V', gruplar: ['G'] }],
  urunler: [{ id: 'U', rota: [{ k: 10, ad: 'Torna', tezgahlar: [{ id: 'T1', cevrim: 60, ayar: 0 }] }] }],
  siparisler: siparisler.map((s) => ({ ...s, urun: 'U' })),
});
const durum = (m: Motor, gercek: Record<string, unknown>, now = 7, D: unknown = veri()): MotorDurumu => ({
  D, now, down: [], ekMesai: [], eksik: [], locks: {}, pref: {}, boost: {}, gercek, sapma: {}, saGecik: {}, ogren: {},
  w: { ...m.W0, tampon: false },
});
// Bugünkü planda adım 0-10. saattedir; şimdi 7. saat, gerçekleşen bu planın üstüne konur.
const taban = (m: Motor): MotorPlani => m.schedule(durum(m, {}, 0), 'yeni', null);

describe('ortak plan motoru, başlamış adımın kalanı (391 a)', () => {
  test('sunucunun verdiği kalan varsa bitiş son sayımdan kalan kadar ilerler', () => {
    const m = motorYukle();
    const st = durum(m, { 'S1.10': { m: 'T1', S: 0, kalan: 2, sayim: 6 } });
    assert.equal(m.schedule(st, 'yeni', taban(m)).ops['S1.10']?.C, 8);
    assert.equal(m.lowerBound(st).C['S1'], 8);
    assert.equal(m.lbHeadsTails(st, m.compile(st)).fin['S1.10'], 8);
  });

  test('sayım anı yoksa kalan başlamadan sayılır', () => {
    const m = motorYukle();
    assert.equal(m.schedule(durum(m, { 'S1.10': { m: 'T1', S: 1, kalan: 3 } }), 'yeni', taban(m)).ops['S1.10']?.C, 4);
  });

  test('kalan yoksa bugünkü yol sürer: geçen süre düşülür', () => {
    const m = motorYukle();
    const st = durum(m, { 'S1.10': { m: 'T1', S: 0 } });
    assert.equal(m.schedule(st, 'yeni', taban(m)).ops['S1.10']?.C, 10);
    assert.equal(m.lowerBound(st).C['S1'], 10);
    assert.equal(m.lbHeadsTails(st, m.compile(st)).fin['S1.10'], 10);
  });

  test('sayıya çevrilemeyen kalan yok sayılır', () => {
    const m = motorYukle();
    assert.equal(m.schedule(durum(m, { 'S1.10': { m: 'T1', S: 0, kalan: 'x' } }), 'yeni', taban(m)).ops['S1.10']?.C, 10);
  });
});

describe('ortak plan motoru, adımın adedi (24 a)', () => {
  test('adımın adedi verilirse süre o adetle hesaplanır; verilmezse sipariş adedi', () => {
    const m = motorYukle();
    const adet = (st: MotorDurumu) => (m.compile(st) as { byId: Record<string, { adet: number }> }).byId['S1.10']?.adet;
    assert.equal(adet(durum(m, {}, 0)), 10);
    const st = durum(m, {}, 0, { ...veri(), opAdet: { 'S1.10': 7 } });
    assert.equal(adet(st), 7);
    assert.equal(m.schedule(st, 'yeni', null).ops['S1.10']?.C, 7);
  });
});

describe('ortak plan motoru, sunucuda çalışma (ADR 0018)', () => {
  const ikiSiparis = () => veri([{ id: 'S1', adet: 4, termin: '2026-01-20' }, { id: 'S2', adet: 2, termin: '2026-01-06' }]);
  const ozet = (p: MotorPlani) => Object.fromEntries(Object.entries(p.ops).map(([k, r]) => [k, [r.m, r.S, r.C]]));

  test('iş parçacığındaki çözüm aynı bağlamdaki çözümle aynıdır', async () => {
    const m = motorYukle();
    const st = durum(m, {}, 0, ikiSiparis());
    const iscide = await planCoz({ durum: st, kip: 'yeni', taban: null });
    assert.deepEqual(ozet(iscide), ozet(m.schedule(st, 'yeni', null)));
    assert.ok(iscide.ops['S2.10']!.C <= iscide.ops['S1.10']!.S, 'termini erken olan önce');
  });

  test('sabit kip tabandaki tezgâh sırasını korur', async () => {
    const m = motorYukle();
    const st = durum(m, {}, 0, ikiSiparis());
    // Planlamacı S1'i öne aldı: tezgâh sırası yalnız başlangıçlardan okunur.
    const ters = m.schedule(st, 'yeni', null);
    ters.ops['S1.10']!.S = 0;
    ters.ops['S2.10']!.S = 5;
    const p = await planCoz({ durum: st, kip: 'sabit', taban: ters });
    assert.ok(p.ops['S1.10']!.C <= p.ops['S2.10']!.S);
  });

  test('aynı girdi her koşuda aynı planı verir', async () => {
    const m = motorYukle();
    const st = durum(m, {}, 0, ikiSiparis());
    assert.deepEqual(ozet(await planCoz({ durum: st, kip: 'yeni', taban: null })), ozet(await planCoz({ durum: st, kip: 'yeni', taban: null })));
  });

  test('aramalı ya da bilinmeyen kip reddedilir', async () => {
    const m = motorYukle();
    await assert.rejects(planCoz({ durum: durum(m, {}), kip: 'lns' as 'yeni', taban: null }), /kipi geçersiz/);
  });

  test('süre aşılırsa çözüm reddedilir ve sıradaki çözüm yine koşar', async () => {
    const m = motorYukle();
    const st = durum(m, {}, 0, ikiSiparis());
    await assert.rejects(planCoz({ durum: st, kip: 'yeni', taban: null }, 1), /içinde bitmedi/);
    assert.ok((await planCoz({ durum: st, kip: 'yeni', taban: null })).ops['S1.10']);
  });

  test('bozuk girdi iş parçacığında hata olarak döner', async () => {
    await assert.rejects(planCoz({ durum: { D: {} }, kip: 'yeni', taban: null }));
  });
});

describe('ortak plan motoru, kilitli iş (kilit a)', () => {
  // S1 4 saat, termini erken; S2 2 saat, termini geç. Kilitsiz plan S1 0-4, S2 4-6.
  const ikiSiparis = () => veri([{ id: 'S1', adet: 4, termin: '2026-01-06' }, { id: 'S2', adet: 2, termin: '2026-01-20' }]);
  const kilitli = (m: Motor, S: number, ek: Partial<MotorDurumu> = {}): MotorDurumu => ({ ...durum(m, {}, 0, ikiSiparis()), locks: { 'S2.10': { m: 'T1', S } }, ...ek });
  const yer = (p: MotorPlani, id: string) => [p.ops[id]?.S, p.ops[id]?.C];

  test('önüne sığmayan iş girse de kilitli iş kilit saatinde kalır, öteki iş arkasına dizilir', () => {
    const m = motorYukle();
    const p = m.schedule(kilitli(m, 1), 'yeni', null);
    assert.deepEqual(yer(p, 'S2.10'), [1, 3]);
    assert.deepEqual(yer(p, 'S1.10'), [3, 7]);
  });

  test('operatör boşken de iş kilitli işin üstüne binmez: tezgâh kilit süresince doludur', () => {
    const m = motorYukle();
    const D = { ...ikiSiparis(), personel: [{ id: 'P1', vardiya: 'V', gruplar: ['G'] }, { id: 'P2', vardiya: 'V', gruplar: ['G'] }] };
    const p = m.schedule({ ...kilitli(m, 1), D }, 'yeni', null);
    assert.deepEqual(yer(p, 'S2.10'), [1, 3]);
    assert.deepEqual(yer(p, 'S1.10'), [3, 7]);
  });

  test('önüne sığan iş kilitten önce yapılır; kilit saatine kadar boşluk kalabilir', () => {
    const m = motorYukle();
    const p = m.schedule(kilitli(m, 5), 'yeni', null);
    assert.deepEqual(yer(p, 'S1.10'), [0, 4]);
    assert.deepEqual(yer(p, 'S2.10'), [5, 7]);
  });

  test('alt sınır ve baş-kuyruk kilidin yerini sayar', () => {
    const m = motorYukle();
    const st = kilitli(m, 1);
    assert.equal(m.lowerBound(st).C['S2'], 3);
    assert.equal(m.lbHeadsTails(st, m.compile(st)).fin['S2.10'], 3);
  });

  test('kilit saatinde arıza varsa iş kilit saatinde başlar, arıza süresince durur ve uyarı çıkar', () => {
    const m = motorYukle();
    const st = kilitli(m, 1, { down: [{ m: 'T1', from: 1.5, to: 2.5, id: 'd0' }] });
    const p = m.schedule(st, 'yeni', null);
    assert.deepEqual(yer(p, 'S2.10'), [1, 4]);
    const uyari = (m.evaluate(p, st, null) as { warn: { t: string; txt: string }[] }).warn.filter((w) => w.t === 'kilit');
    assert.equal(uyari.length, 1);
    assert.match(uyari[0]!.txt, /S2\.10/);
  });

  test('arızasız kilitte uyarı yoktur', () => {
    const m = motorYukle();
    const st = kilitli(m, 1);
    assert.equal((m.evaluate(m.schedule(st, 'yeni', null), st, null) as { warn: { t: string }[] }).warn.filter((w) => w.t === 'kilit').length, 0);
  });

  test('saati geçmiş kilit yalnız tezgâhı bağlar: iş şimdiden önce yerleşmez', () => {
    const m = motorYukle();
    const p = m.schedule({ ...kilitli(m, 0), now: 2 }, 'yeni', null);
    assert.ok(p.ops['S2.10']!.S >= 2);
    assert.equal(p.ops['S2.10']!.m, 'T1');
  });
});

describe('ortak plan motoru, sayfanın motor kancaları (458 a)', () => {
  // Aynı iş emrinin iki partisi aynı tezgâhta art arda: sayfanın ayar sıfırlama kancası (zz13) ikinci partide ayarı yeniden saymaz.
  const partili = () => ({ ...veri([{ id: 'S1/1', adet: 2, termin: '2026-01-20' }, { id: 'S1/2', adet: 2, termin: '2026-01-20' }]),
    personel: [{ id: 'P1', vardiya: 'V', gruplar: ['G'], ayar: true }],
    urunler: [{ id: 'U', rota: [{ k: '10', ad: 'Torna', tezgahlar: [{ id: 'T1', cevrim: 60, ayar: 120 }] }] }] });
  test('motorYukle ve planCoz kancalarla kurar: ikinci partinin ayarı yok', async () => {
    const m = motorYukle();
    const st = durum(m, {}, 0, partili());
    const bitis = (p: MotorPlani) => Math.max(p.ops['S1/1.10']?.C ?? 0, p.ops['S1/2.10']?.C ?? 0);
    assert.equal(bitis(m.schedule(st, 'yeni', null)), 6);
    assert.equal(bitis(await planCoz({ durum: st, kip: 'yeni', taban: null })), 6);
  });
});

describe('ortak plan motoru, kişi ataması (563 c, 563 2 a)', () => {
  // İki tezgâh, her birinde 4 saatlik tek iş; ikisi de 0. saatte başlayabilir. Veriler uydurmadır.
  const iki = (personel: unknown[], opOran: [number, number] = [1, 1]) => ({
    ...veri([{ id: 'S1', adet: 4, termin: '2026-01-20' }]),
    tezgahlar: [{ id: 'T1', grup: 'G', opOran: opOran[0] }, { id: 'T2', grup: 'G', opOran: opOran[1] }],
    personel,
    urunler: [
      { id: 'U', rota: [{ k: 10, ad: 'Torna', tezgahlar: [{ id: 'T1', cevrim: 60, ayar: 0 }] }] },
      { id: 'U2', rota: [{ k: 10, ad: 'Freze', tezgahlar: [{ id: 'T2', cevrim: 60, ayar: 0 }] }] },
    ],
    siparisler: [{ id: 'S1', urun: 'U', adet: 4, termin: '2026-01-20' }, { id: 'S2', urun: 'U2', adet: 4, termin: '2026-01-20' }],
  });
  const plan = (D: unknown) => { const m = motorYukle(); return m.schedule(durum(m, {}, 0, D), 'yeni', null); };
  const paralel = (p: MotorPlani) => p.ops['S1.10']!.S < p.ops['S2.10']!.C && p.ops['S2.10']!.S < p.ops['S1.10']!.C;
  const kisi = (ek: Record<string, unknown> = {}) => ({ id: 'P1', vardiya: 'V', gruplar: ['G'], ...ek });

  test('kayıtlı iki tezgâh tek kişiye düşer: oran toplamı 1i geçmez, yarım oranlı iki tezgâh birlikte çalışır', () => {
    assert.equal(paralel(plan(iki([kisi({ makineler: ['T1', 'T2'] })]))), false);
    assert.equal(paralel(plan(iki([kisi({ makineler: ['T1', 'T2'] })], [0.5, 0.5]))), true);
  });

  test('aynı anda en çok tezgâh sınırı oran yetse de ikinci tezgâhı bekletir', () => {
    assert.equal(paralel(plan(iki([kisi({ makineler: ['T1', 'T2'], enCok: 1 })], [0.5, 0.5]))), false);
    assert.equal(paralel(plan(iki([kisi({ makineler: ['T1', 'T2'], enCok: 2 })], [0.5, 0.5]))), true);
  });

  test('kayıtlı tezgâha yalnız listesinde o tezgâh olan kişi bakar; grupta başka kişi olması yetmez', () => {
    const p = plan(iki([kisi({ makineler: ['T1'] }), { id: 'P2', vardiya: 'V', gruplar: ['G'], makineler: ['T2'] }]));
    assert.equal(paralel(p), true);
    // P2 grupta ama listesi yok: iki kayıtlı tezgâhı yalnız P1 çalıştırır.
    assert.equal(paralel(plan(iki([kisi({ makineler: ['T1', 'T2'] }), { id: 'P2', vardiya: 'V', gruplar: ['G'] }]))), false);
    // T2 kayıtsızdır, grup kapasitesiyle hesaplanır: P1 T1'de, P2 T2'de.
    assert.equal(paralel(plan(iki([kisi(), { id: 'P2', vardiya: 'V', gruplar: ['G'], makineler: ['T1'] }]))), true);
  });

  test('iki operatör isteyen kayıtlı tezgâh iki kişiye bölünür; tek kişiyle yerleşmez', () => {
    const tek = iki([kisi({ makineler: ['T1'] })], [2, 0]);
    assert.equal(plan(tek).ops['S1.10'], undefined);
    const cift = iki([kisi({ makineler: ['T1'] }), { id: 'P2', vardiya: 'V', gruplar: ['G'], makineler: ['T1'] }], [2, 0]);
    assert.ok(plan(cift).ops['S1.10']);
  });

  test('listesi olmayan veride plan bugünkü gibidir', () => {
    const ozet = (p: MotorPlani) => Object.fromEntries(Object.entries(p.ops).map(([k, r]) => [k, [r.m, r.S, r.C]]));
    const D = iki([kisi(), { id: 'P2', vardiya: 'V', gruplar: ['G'] }]);
    assert.deepEqual(ozet(plan(D)), ozet(plan({ ...D, personel: D.personel.map((p) => ({ ...(p as object), makineler: [] })) })));
  });
});
