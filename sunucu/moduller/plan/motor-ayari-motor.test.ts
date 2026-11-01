import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { MOTOR_AYARI_VARSAYILAN, MOTOR_KURALLARI, type MotorAyarlari } from '#paylasilan/sozlesme/plan.ts';
import type { PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { degerlendirmeBaslat, type DegerlendirmeGirdisi } from './degerlendirme.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { calismayaMotorAyari } from './motor-ayari-kurallar.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// Kart 811 P2 (771 a): motor kayıttaki plan amacını değil motor ayarını kullanır. Veriler uydurmadır.
const amacOku = (calisma: unknown): unknown => (calisma as { D: { planTL: { amac: unknown } } }).D.planTL.amac;

describe('plan: motor ayarı çalışmaya uygulanır', () => {
  test('sıralı ayar kayıttaki TL amacını kapatır, TL ayarı açar; kayıt değişmez, öbür alanlar kalır', () => {
    const kayit = { surum: 2, D: { planTL: { amac: 'tl', risk: 0.5 }, siparisler: [] }, w: { famK: 0.3 } };
    const sirali = calismayaMotorAyari(kayit, MOTOR_AYARI_VARSAYILAN) as typeof kayit;
    assert.deepEqual(sirali.D.planTL, { amac: 'sira', risk: 0.5 });
    assert.deepEqual([sirali.w, sirali.D.siparisler, kayit.D.planTL.amac], [{ ...kayit.w, rule: 'atcs', amac: 'sirali' }, kayit.D.siparisler, 'tl']);
    const tl = calismayaMotorAyari({ D: {} }, { ...MOTOR_AYARI_VARSAYILAN, amac: 'tl' }) as { D: { planTL: unknown } };
    assert.deepEqual(tl.D.planTL, { amac: 'tl' });
    assert.equal(calismayaMotorAyari(null, MOTOR_AYARI_VARSAYILAN), null);
  });
});

describe('plan: süre öğrenmesi çalışmaya uygulanır (1714, 1684 b)', () => {
  const ogren = { '7 1': { n: 3, f: 1.2, v: 0.01 } };
  const acik = { ...MOTOR_AYARI_VARSAYILAN, ogrenme: 'acik' as const };
  const oku = (c: unknown) => (c as { ogren: unknown }).ogren;
  test('kapalıyken alan boştur; açıkken verilen değer gider; kayda geçmiş eski değer açık verilen değerle ezilir', () => {
    assert.deepEqual(oku(calismayaMotorAyari({ D: {} }, MOTOR_AYARI_VARSAYILAN, null, null, ogren)), {});
    assert.deepEqual(oku(calismayaMotorAyari({ D: {} }, acik, null, null, ogren)), ogren);
    assert.deepEqual(oku(calismayaMotorAyari({ D: {}, ogren: { '9 9': { n: 5, f: 2, v: 0 } } }, acik, null, null, null)), {});
  });
  test('verilmezse çalışmadaki değer korunur; taslağın ayarında öğrenme kapalıysa boşalır', () => {
    const ilk = calismayaMotorAyari({ D: {} }, acik, null, null, ogren);
    assert.deepEqual(oku(calismayaMotorAyari(ilk, acik)), ogren);
    assert.deepEqual(oku(calismayaMotorAyari(ilk, MOTOR_AYARI_VARSAYILAN)), {});
  });
});

describe('plan: finansman oranı finanstan gelir (1383 a)', () => {
  test('finansın günlük oranı D.planAgirlik.fin olur, öbür ağırlıklar kalır; oran yoksa elle oran kalır', () => {
    const kayit = { D: { planAgirlik: { fin: 0.13, taban: 12 }, planTL: {} } };
    const finansli = calismayaMotorAyari(kayit, MOTOR_AYARI_VARSAYILAN, (3 * 12) / 365) as { D: { planAgirlik: { fin: number; taban: number } } };
    assert.deepEqual(finansli.D.planAgirlik, { fin: (3 * 12) / 365, taban: 12 });
    assert.equal(kayit.D.planAgirlik.fin, 0.13);
    const elle = calismayaMotorAyari(kayit, MOTOR_AYARI_VARSAYILAN, null) as typeof kayit;
    assert.deepEqual(elle.D.planAgirlik, { fin: 0.13, taban: 12 });
    const bos = calismayaMotorAyari({ D: {} }, MOTOR_AYARI_VARSAYILAN, 0.1) as { D: { planAgirlik: unknown } };
    assert.deepEqual(bos.D.planAgirlik, { fin: 0.1 });
  });
});

// 776 b: tek tezgâhta iki sipariş. O1 öncelikli ve uzun, termini geç, listede önce; O2 kısa, termini erken. Kural sırayı belirler.
const KAYIT = {
  version: 7, savedAt: 9,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', plan: { id: '100', ad: '100', grup: '10', ucret: 750, verim: 1, vardiyalar: ['3'], opOran: 0 } }],
  routes: { 50: { base: null, steps: [{ id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [] }] } },
  orders: [
    { id: 'O1', no: 'E-1', itemId: '50', qty: 20, start: '2026-10-19', due: '2026-11-20', priority: 1, status: 'serbest' },
    { id: 'O2', no: 'E-2', itemId: '50', qty: 4, start: '2026-10-19', due: '2026-10-21', priority: 3, status: 'serbest' },
  ],
};
const KAYNAK = {
  durum: {
    wcs: [{ id: '1', code: 'IM-1', name: 'Talasli', week: null, aktif: true }],
    stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
    machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }],
    people: [],
    cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
  },
  ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null },
};
const calismaKur = (): Record<string, unknown> => ({
  surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'sert', dondurma: 4, rule: 'kar' },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
});
const ilkSiparis = (kural: MotorAyarlari['kural'] | null): { rule: string; ilk: string } => {
  const calisma = kural === null ? calismaKur() : calismayaMotorAyari(calismaKur(), { ...MOTOR_AYARI_VARSAYILAN, kural });
  const g = planGirdisi({ calisma, kayit: KAYIT, kaynak: KAYNAK, bugun: '2026-10-19' });
  assert.ok(g);
  const m = motorYukle();
  const p = m.schedule(m.stHazirla(g.st), 'dagit', null);
  // Adım kimliği "sipariş.adım"dır.
  const ilk = Object.entries(p.ops).sort(([, a], [, b]) => a.S - b.S)[0]![0].split('.')[0]!;
  return { rule: (g.st as { w: { rule: string } }).w.rule, ilk };
};

describe('plan: süre öğrenmesi motora (1714, 1684 b)', () => {
  // Ürün 50'nin tek adımı rotada sıra 10'dur; motorun anahtarı "ürün sıra"dır.
  const sigma = (ayar: MotorAyarlari, ogren: Record<string, { n: number; f: number; v: number }> | null): number[] => {
    const g = planGirdisi({ calisma: calismayaMotorAyari(calismaKur(), ayar, null, null, ogren), kayit: KAYIT, kaynak: KAYNAK, bugun: '2026-10-19' });
    assert.ok(g);
    const m = motorYukle(); const st = m.stHazirla(g.st);
    return [...(m.compile(st) as { ops: { sig: number }[] }).ops].map((o) => o.sig);
  };
  test('açıkken öğrenilen belirsizlik adıma geçer; kapalıyken varsayılan kalır', () => {
    const ogren = { '50 10': { n: 5, f: 1.25, v: 0.0625 } };
    const varsayilan = sigma(MOTOR_AYARI_VARSAYILAN, null);
    assert.deepEqual(sigma(MOTOR_AYARI_VARSAYILAN, ogren), varsayilan);
    assert.deepEqual(sigma({ ...MOTOR_AYARI_VARSAYILAN, ogrenme: 'acik' }, ogren), varsayilan.map(() => 0.2));
  });
});

describe('plan: amaç motor ayarından motora (771 a)', () => {
  test('899 a (832 a): TL amacı her iki ayarda kapalı; bedel kipi kalktı, kayıttaki amaç geçmez', () => {
    const tlAcik = (amac: MotorAyarlari['amac']): unknown => {
      const k = calismaKur();
      const calisma = calismayaMotorAyari({ ...k, D: { ...(k.D as object), planTL: { amac: amac === 'tl' ? 'sira' : 'tl' } } }, { ...MOTOR_AYARI_VARSAYILAN, amac });
      const g = planGirdisi({ calisma, kayit: KAYIT, kaynak: KAYNAK, bugun: '2026-10-19' });
      assert.ok(g);
      return (g.st as { tlAmac: { ac: boolean } }).tlAmac.ac;
    };
    assert.deepEqual([tlAcik('sirali'), tlAcik('tl')], [false, false]);
  });
  test('840 a: bitiş amaç vektöründe boşta kalmadan sonraki yerdedir', () => {
    const g = planGirdisi({ calisma: calismayaMotorAyari(calismaKur(), MOTOR_AYARI_VARSAYILAN), kayit: KAYIT, kaynak: KAYNAK, bugun: '2026-10-19' });
    assert.ok(g);
    const m = motorYukle(); const st = m.stHazirla(g.st);
    const e = m.evaluate(m.schedule(st, 'dagit', null), st, null, false) as { lex: number[]; Cmax: number; idle: number };
    assert.deepEqual([e.lex.length, e.lex[5], e.lex[6]], [7, e.idle, e.Cmax]);
  });
});

describe('plan: sıralama kuralı motor ayarından motora (776 b)', () => {
  test('her kural motora geçer; tanınmayan kayıt değeri ATCS olur', () => {
    for (const k of MOTOR_KURALLARI) assert.equal(ilkSiparis(k).rule, k);
    assert.equal(ilkSiparis(null).rule, 'atcs');
  });
  test('kural sırayı değiştirir: öncelik ve FIFO önce O1, SPT ve EDD önce O2', () => {
    const ilk = Object.fromEntries((['oncelik', 'fifo', 'spt', 'edd'] as const).map((k) => [k, ilkSiparis(k).ilk]));
    assert.deepEqual(ilk, { oncelik: 'O1', fifo: 'O1', spt: 'O2', edd: 'O2' });
  });
});

describe('plan (gerçek PostgreSQL): sayfa ve "Planı kur" güncel motor ayarıyla', () => {
  const { c, tamam, durum } = planTestOrtami();
  let ortam: TestVeritabani | undefined;
  before(() => { ({ ortam } = durum()); });

  test('sayfanın okuduğu ve değerlendirmeye giden çalışmada amaç motor ayarındandır; kayıt yazılmaz', async () => {
    const sayfa = await tamam<PlanlamaCalismasiCevabi>(c.yonetici, 'POST', '/plan/planlama-calismasi/olustur');
    assert.ok(sayfa.surum !== null && sayfa.calisma !== null);
    const yonetici = (await ortam!.sahip.tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'yonetici'"))!.id;
    const kullanici = { id: yonetici, ad: 'Deneme Yönetici', islemler: [] };
    const kayitAmaci = async () => (await ortam!.sahip.tek<{ amac: string | null }>(
      "SELECT deger #>> '{D,planTL,amac}' AS amac FROM plan_planlama_kaydi WHERE anahtar = $1", [PLANLAMA_ANAHTARI]))!.amac;
    const once = await kayitAmaci();
    const amaclar = async () => {
      let giden: DegerlendirmeGirdisi | undefined;
      const yap = (g: DegerlendirmeGirdisi) => { giden = g; return Promise.resolve(null); };
      await ortam!.vt.tx((db) => degerlendirmeBaslat(db, kullanici, { surum: sayfa.surum!, istek: { tur: 'plan-kur' } }, Date.now() + Math.random() * 1e6, yap));
      const okunan = await tamam<PlanlamaCalismasiCevabi>(c.yonetici, 'GET', '/plan/planlama-calismasi');
      return [amacOku(giden!.calisma), amacOku(okunan.calisma)];
    };
    assert.deepEqual(await amaclar(), ['sira', 'sira']);
    // 832 a: TL ayarda kapalı (uç reddeder); motorun TL yolu sürüm satırıyla denenir.
    const surumYaz = (amac: string) => ortam!.sahip.sorgu('INSERT INTO plan_motor_ayar_surumu (degerler, yazan_kisi_id) VALUES ($1, $2)', [JSON.stringify({ amac }), yonetici]);
    await surumYaz('tl');
    assert.deepEqual(await amaclar(), ['tl', 'tl']);
    await surumYaz('sirali');
    assert.equal(await kayitAmaci(), once);
  });
});
