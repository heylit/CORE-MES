import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import vm from 'node:vm';
import { motorKodu, motorYukle, planCoz, type Motor, type MotorDurumu, type MotorPlani } from './plan-motoru.ts';

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

// 3335-3b: adıma bildirilen ek süre. Başlamamış adımda koşu süresine eklenir; çalışan adımda hedef bitiştir (bildirildiği andaki
// planlı bitiş + ek saat) ve sunucunun adetten hesapladığı kalanla yarışır: hangisi geçse o.
describe('ortak plan motoru, adıma bildirilen ek süre (3335-3b)', () => {
  const ekli = (m: Motor, gercek: Record<string, Record<string, unknown>>, now: number, ek: { ekSaat: number; bitis0: number }): MotorDurumu => ({
    ...durum(m, Object.fromEntries(Object.entries(gercek).map(([id, a]) => [id, { ...a, ek }])), now), adimEk: { 'S1.10': ek },
  });
  test('başlamamış adım ek saat kadar uzar; çarpan değildir', () => {
    const m = motorYukle();
    assert.equal(m.schedule(ekli(m, {}, 0, { ekSaat: 3, bitis0: 10 }), 'yeni', null).ops['S1.10']?.C, 13);
    assert.equal(m.schedule(ekli(m, {}, 0, { ekSaat: 0.5, bitis0: 10 }), 'yeni', null).ops['S1.10']?.C, 10.5);
  });
  test('çalışan adım: sunucunun kalanı hedeften erken bitiriyorsa bitiş hedeftir; sayım ilerleyince ek yeniden eklenmez', () => {
    const m = motorYukle();
    const ek = { ekSaat: 3, bitis0: 10 };
    // Kalan 2, sayım 6: sunucuya göre bitiş 8; hedef 10 + 3 = 13.
    const st = ekli(m, { 'S1.10': { m: 'T1', S: 0, kalan: 2, sayim: 6 } }, 7, ek);
    assert.equal(m.schedule(st, 'yeni', taban(m)).ops['S1.10']?.C, 13);
    assert.equal(m.lowerBound(st).C['S1'], 13);
    assert.equal(m.lbHeadsTails(st, m.compile(st)).fin['S1.10'], 13);
    // Sonraki sayım (kalan 1, sayım 9: sunucuya göre 10): bitiş yine 13, 16 değil.
    assert.equal(m.schedule(ekli(m, { 'S1.10': { m: 'T1', S: 0, kalan: 1, sayim: 9 } }, 9.5, ek), 'yeni', taban(m)).ops['S1.10']?.C, 13);
  });
  test('çalışan adım: sunucunun kalanı hedefi geçiyorsa sunucununki geçerlidir', () => {
    const m = motorYukle();
    assert.equal(m.schedule(ekli(m, { 'S1.10': { m: 'T1', S: 0, kalan: 9, sayim: 6 } }, 7, { ekSaat: 3, bitis0: 10 }), 'yeni', taban(m)).ops['S1.10']?.C, 15);
  });
  test('bölünen adımda ek saat yalnız ilk payın koşu süresine eklenir', () => {
    const m = motorYukle();
    const D = { ...veri(), tezgahlar: [{ id: 'T1', grup: 'G' }, { id: 'T2', grup: 'G' }], personel: [{ id: 'P1', vardiya: 'V', gruplar: ['G'] }, { id: 'P2', vardiya: 'V', gruplar: ['G'] }],
      urunler: [{ id: 'U', rota: [{ k: 10, ad: 'Torna', bol: true, tezgahlar: [{ id: 'T1', cevrim: 60, ayar: 0 }, { id: 'T2', cevrim: 60, ayar: 0 }] }] }] };
    const st = (ek: boolean): MotorDurumu => ({ ...durum(m, {}, 0, D), w: { ...m.W0, tampon: false, bol: true, bolMaks: 2 }, ...(ek ? { adimEk: { 'S1.10': { ekSaat: 3, bitis0: 5 } } } : {}) });
    const kosu = (x: MotorDurumu) => Object.fromEntries(Object.entries((m.compile(x) as { byId: Record<string, { c: { run: number }[] }> }).byId).map(([id, o]) => [id, Array.from(o.c, (c) => c.run)]));
    assert.deepEqual(kosu(st(false)), { 'S1.10': [5, 5], 'S1.10~2': [5, 5] });
    assert.deepEqual(kosu(st(true)), { 'S1.10': [8, 8], 'S1.10~2': [5, 5] });
  });

  test('plan ekseni kayınca hedefin dayandığı bitiş de kayar: hedef aynı gerçek ana düşer', () => {
    const b = vm.createContext({ GIRDI_SAAT_DILIMI: 'Europe/Istanbul' }); b['self'] = b;
    const kaydir = vm.runInContext(`${motorKodu()}\n;baslangicKaydir;`, b) as (S: Record<string, unknown>, yeni: string) => number;
    const S = { D: veri(), w: { adimEk: { 'S1.10': { ekSaat: 3, bitis0: 34 }, 'S2.10': { ekSaat: 1 } } }, gercek: { 'S1.10': { m: 'T1', S: 24, sayim: 30, kalan: 2 } } };
    assert.equal(kaydir(S, '2026-01-06'), 1);
    assert.deepEqual(S.w.adimEk, { 'S1.10': { ekSaat: 3, bitis0: 10 }, 'S2.10': { ekSaat: 1 } });
    assert.deepEqual(S.gercek['S1.10'], { m: 'T1', S: 0, sayim: 6, kalan: 2 });
    // Kayan değerlerle çalışan adımın bitişi hedeftir: 10 + 3.
    const m = motorYukle();
    const ek = S.w.adimEk['S1.10'] as { ekSaat: number; bitis0: number };
    assert.equal(m.schedule(ekli(m, { 'S1.10': S.gercek['S1.10'] }, 7, ek), 'yeni', taban(m)).ops['S1.10']?.C, 13);
  });

  test('ek süre yoksa ya da sayı değilse davranış aynıdır', () => {
    const m = motorYukle();
    const st = durum(m, { 'S1.10': { m: 'T1', S: 0, kalan: 2, sayim: 6, ek: { ekSaat: 'x', bitis0: 10 } } });
    assert.equal(m.schedule(st, 'yeni', taban(m)).ops['S1.10']?.C, 8);
  });
});

// 3335-3c: adıma bildirilen bekleme (malzeme yok, kişi yok). İşlem bekleme anından önce başlayamaz; alt sınır kestirimleri de onu sayar.
describe('ortak plan motoru, adıma bildirilen bekleme (3335-3c)', () => {
  const ikiSiparis = () => veri([{ id: 'S1', adet: 4, termin: '2026-01-06' }, { id: 'S2', adet: 2, termin: '2026-01-20' }]);
  const bekleyen = (m: Motor, kadar: unknown, D: unknown = veri()): MotorDurumu => ({ ...durum(m, {}, 0, D), adimBekle: { 'S1.10': { kadar } } });
  test('işlem bekleme anından önce başlamaz; nedeni beklemedir; alt sınırlar da bekler', () => {
    const m = motorYukle();
    const st = bekleyen(m, 30);
    const r = m.schedule(st, 'yeni', null).ops['S1.10'] as { S: number; C: number; why?: { t: string } };
    assert.deepEqual([r.S, r.C, r.why?.t], [30, 40, 'bekleme']);
    assert.equal(m.lowerBound(st).C['S1'], 40);
    assert.equal(m.lbHeadsTails(st, m.compile(st)).fin['S1.10'], 40);
  });
  test('bekleyen adımın tezgâhı boş durmaz: öteki emir öne geçer', () => {
    const m = motorYukle();
    const p = m.schedule(bekleyen(m, 30, ikiSiparis()), 'yeni', null).ops;
    assert.deepEqual([p['S2.10']?.S, p['S2.10']?.C, p['S1.10']?.S], [0, 2, 30]);
    // Bekleme yokken termini erken olan S1 öndedir.
    assert.equal(m.schedule(durum(m, {}, 0, ikiSiparis()), 'yeni', null).ops['S1.10']?.S, 0);
  });
  test('geçmişte kalan ya da sayı olmayan bekleme etkisizdir', () => {
    const m = motorYukle();
    assert.equal(m.schedule({ ...bekleyen(m, 5), now: 7 }, 'yeni', null).ops['S1.10']?.S, 7);
    assert.equal(m.schedule(bekleyen(m, 'x'), 'yeni', null).ops['S1.10']?.S, 0);
  });
  test('plan ekseni kayınca bekleme anı da kayar: aynı gerçek ana düşer', () => {
    const b = vm.createContext({ GIRDI_SAAT_DILIMI: 'Europe/Istanbul' }); b['self'] = b;
    const kaydir = vm.runInContext(`${motorKodu()}\n;baslangicKaydir;`, b) as (S: Record<string, unknown>, yeni: string) => number;
    const S = { D: veri(), w: { adimBekle: { 'S1.10': { kadar: 54, neden: 'malzeme' } } }, gercek: {} };
    assert.equal(kaydir(S, '2026-01-06'), 1);
    assert.deepEqual(S.w.adimBekle, { 'S1.10': { kadar: 30, neden: 'malzeme' } });
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
    await assert.rejects(planCoz({ durum: st, kip: 'yeni', taban: null }, 1), /Plan 1 saniyede hesaplanamadı; plan değişmedi\./);
    assert.ok((await planCoz({ durum: st, kip: 'yeni', taban: null })).ops['S1.10']);
  });

  test('takvime sığmayan iş için takvim büyür (3501 a); sürenin büyüme payı dolmuşsa büyümez, iş yerleşmemiş döner', async () => {
    // Tezgâh gün boyu açık: 240 günlük takvimde 5.760 saat. 6.000 saatlik sipariş ancak büyüyen takvime sığar.
    const m = motorYukle();
    const uzun = (): MotorDurumu => durum(m, {}, 0, veri([{ id: 'S1', adet: 6000, termin: '2026-01-20' }]));
    const p = await planCoz({ durum: uzun(), kip: 'yeni', taban: null });
    assert.deepEqual([(p.fail ?? []).length, p.takvimGun, p.ops['S1.10']?.C, p.buyumeKesildi], [0, 480, 6000, undefined]);
    const kisik = await planCoz({ durum: uzun(), kip: 'yeni', taban: null }, undefined, -1);
    assert.deepEqual([kisik.fail, kisik.takvimGun, kisik.ops['S1.10'], kisik.buyumeKesildi], [['S1.10'], 240, undefined, true]);
    // Motorda: pay verilmezse sınır yoktur (kıyas); geçmiş bir an büyümeyi durdurur.
    assert.equal((m.takvimliCoz(uzun(), 'yeni', null, { buyumeSonu: 0 }).fail ?? []).length, 1);
    assert.equal(m.takvimGunu(), 240);
  });

  // Saat sabit adımlıdır: her çözüm turu takvim günü x 10 adım sürer (büyük takvim daha pahalıdır). Dönen: tur başına takvim günü.
  const adimliSaat = (): { m: Motor; turlar: number[]; saat: () => number } => {
    const b = vm.createContext({ GIRDI_SAAT_DILIMI: 'Europe/Istanbul' }); b['self'] = b;
    const m = vm.runInContext(motorKodu(), b) as Motor;
    b['turlar'] = [];
    vm.runInContext('var __t = 0; Date.now = () => __t; { const s0 = schedule; schedule = function () { turlar.push(HDAYS); __t += HDAYS * 10; return s0.apply(this, arguments); }; }', b);
    return { m, turlar: b['turlar'] as number[], saat: () => vm.runInContext('__t', b) as number };
  };
  // 12.000 saatlik sipariş 480 günlük takvime (11.520 saat) sığmaz, iki yıllık takvime sığar.
  const cokUzun = (m: Motor): MotorDurumu => m.stHazirla(durum(m, {}, 0, veri([{ id: 'S1', adet: 12000, termin: '2026-01-20' }])));

  test('süre koruması sonraki turu bu turun takvimiyle kestirir: sığmayacaksa büyümez, sığacaksa iki yıla kadar büyür (3506)', () => {
    // 240 günlük tur 2.400 adım; 480 günlük tur iki katı (4.800) kestirilir: 7.000'e sığmaz, takvim büyümez.
    const dar = adimliSaat();
    const kesilen = dar.m.takvimliCoz(cokUzun(dar.m), 'yeni', null, { buyumeSonu: 7000 });
    assert.deepEqual([[...dar.turlar], kesilen.buyumeKesildi, (kesilen.fail ?? []).length, dar.saat() <= 7000], [[240], true, 1, true]);
    // 480 günlük turdan sonra (7.200. adım) 730 günlük tur 4.800 x 730 / 480 = 7.300 adım kestirilir: 14.500, sınıra sığar.
    const genis = adimliSaat();
    const tam = genis.m.takvimliCoz(cokUzun(genis.m), 'yeni', null, { buyumeSonu: 15000 });
    assert.deepEqual([[...genis.turlar], tam.buyumeKesildi, (tam.fail ?? []).length, genis.saat()], [[240, 480, 730], undefined, 0, 14500]);
  });

  test('kayıtlı plan takvimden uzunsa çözüm takvimi baştan ona göre kurar: tek tur (3506)', () => {
    const uzun = (m: Motor): MotorDurumu => m.stHazirla(durum(m, {}, 0, veri([{ id: 'S1', adet: 6000, termin: '2026-01-20' }])));
    // Kayıtlı plan başka bağlamda kurulur: bu çözümün bağlamı takvimi yalnız plandan öğrenir.
    const once = motorYukle();
    const ilk = JSON.parse(JSON.stringify(once.takvimliCoz(uzun(once), 'yeni', null))) as MotorPlani;
    const s = adimliSaat();
    const p = s.m.takvimliCoz(uzun(s.m), 'sabit', ilk);
    assert.deepEqual([[...s.turlar], s.m.takvimGunu(), (p.fail ?? []).length], [[480], 480, 0]);
  });

  test('takvimle geçmeyecek neden takvimi büyütmez: hazırlığı vardiyaya sığmayan iş yerleşmez, takvim 240 gün kalır (3506)', async () => {
    const D = { ...veri(), vardiyalar: [{ id: 'V', bas: '08:00', bit: '16:00' }], urunler: [{ id: 'U', rota: [{ k: 10, ad: 'Torna', tezgahlar: [{ id: 'T1', cevrim: 60, ayar: 600 }] }] }] };
    const p = await planCoz({ durum: durum(motorYukle(), {}, 0, D), kip: 'yeni', taban: null });
    assert.deepEqual([p.fail, p.takvimGun, p.buyumeKesildi], [['S1.10'], 240, undefined]);
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

describe('ortak plan motoru, bedeli bilinmeyen tezgâh (763)', () => {
  // T1'in saat ücreti boş, T2'ninki 100 TL ve dakikası daha kısa. Boş ücret 0 sayılsaydı T1 bedava görünür ve seçilirdi.
  const D = {
    ...veri(), tezgahlar: [{ id: 'T1', grup: 'G', ucret: null }, { id: 'T2', grup: 'G', ucret: 100 }],
    personel: [{ id: 'P1', vardiya: 'V', gruplar: ['G'] }, { id: 'P2', vardiya: 'V', gruplar: ['G'] }],
    urunler: [{ id: 'U', rota: [{ k: 10, ad: 'Torna', tezgahlar: [{ id: 'T1', cevrim: 61, ayar: 0 }, { id: 'T2', cevrim: 60, ayar: 0 }] }] }],
  };

  test('adaylardan birinin ücreti boşsa bedel kıyaslanmaz; erken biten tezgâh seçilir', () => {
    const m = motorYukle();
    assert.equal(m.schedule(durum(m, {}, 0, D), 'yeni', null).ops['S1.10']?.m, 'T2');
  });

  test('ücretlerin hepsi biliniyorsa bedel kıyaslanır', () => {
    const m = motorYukle();
    const bilinen = { ...D, tezgahlar: [{ id: 'T1', grup: 'G', ucret: 1 }, { id: 'T2', grup: 'G', ucret: 100 }] };
    assert.equal(m.schedule(durum(m, {}, 0, bilinen), 'yeni', null).ops['S1.10']?.m, 'T1');
  });
});

// Duruş satırları tezgâha göre dizinlenir (3509): dizin duruş listesine bağlıdır, liste değişince eskisi kullanılmaz.
describe('ortak plan motoru, duruş satırları tezgâha göre okunur (3509)', () => {
  const durus = (m: string, from: number, to: number, id = 'd0') => ({ id, m, from, to, neden: 'planlı duruş' });
  const bitis = (m: Motor, st: MotorDurumu): number | undefined => m.schedule(st, 'yeni', null).ops['S1.10']?.C;

  test('iş kendi tezgâhının duruşunda bekler; başka tezgâhın duruşu onu geciktirmez', () => {
    const m = motorYukle();
    assert.equal(bitis(m, { ...durum(m, {}, 0), down: [durus('T1', 2, 5)] }), 13);
    assert.equal(bitis(m, { ...durum(m, {}, 0), down: [durus('T9', 2, 5)] }), 10);
  });

  test('listeye sonradan eklenen duruş da geçerlidir; aynı uzunlukta yeni liste eskisinin yerine geçer', () => {
    const m = motorYukle();
    const st = { ...durum(m, {}, 0), down: [durus('T9', 2, 5)] };
    assert.equal(bitis(m, st), 10);
    st.down.push(durus('T1', 2, 5, 'd1'));
    assert.equal(bitis(m, st), 13, 'eklenen satır');
    st.down = [durus('T9', 2, 5), durus('T1', 20, 24, 'd1')];
    assert.equal(bitis(m, st), 10, 'yeni liste');
  });

  test('plan, dizildiği andaki duruşları tanır: sonradan eklenen duruş süren işi keser', () => {
    const m = motorYukle();
    const st = { ...durum(m, {}, 0), down: [durus('T1', 12, 14)] };
    const taban = m.schedule(st, 'yeni', null);
    assert.deepEqual((taban as unknown as { downIds: string[] }).downIds, ['d0']);
    st.down.push(durus('T1', 8, 9, 'd1'));
    const sonra = m.schedule({ ...st, now: 7 }, 'sabit', taban);
    assert.deepEqual((taban as unknown as { downIds: string[] }).downIds, ['d0'], 'eski planın listesi değişmez');
    assert.equal(sonra.ops['S1.10']?.C, 11, 'süren iş yeni duruş kadar geç biter');
  });
});
