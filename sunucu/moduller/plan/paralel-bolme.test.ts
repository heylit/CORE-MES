import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { MOTOR_AYARI_VARSAYILAN } from '#paylasilan/sozlesme/plan.ts';
import type { PlanMotoruIstegi } from './disari.ts';
import { coz } from './plan-cozucusu.ts';
import { yerlesimleriSil, yerlesimler, yerlesimYaz, yersizBolmeler } from './sorgular.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { calismayaMotorAyari } from './motor-ayari-kurallar.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';

// 1952 iş 2a (1955 a, 1956 a, 1958 a): rotada "paralel böl" adımı planlama atölyesinde motorca paylara bölünür; paylar ayrı kaynaklarda
// aynı anda çalışır, ardıl hepsini bekler. İnsanlı istasyonda önce ekip. Veriler uydurmadır.
const makine = (id: string, istasyon: string) => ({ id, code: `T${id}`, name: `Tezgah ${id}`, stationId: istasyon, status: 'aktif', aktif: true });
const istasyon = (id: string) => ({ id, code: `S${id}`, name: `Istasyon ${id}`, wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true });
const kisi = (id: string) => ({
  id, name: `Kisi ${id}`, code: null, role: null, stationId: null, wcId: '1', shiftId: null, skills: ['40'], cost: null, active: true, machines: [], maxMachines: null,
});
const adim = (seq: number, stationId: string, ek: Record<string, unknown> = {}) => ({
  id: `50-o${String(seq)}`, seq, opNo: seq, opId: '13', stationId, setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [], split: 'tek', minLot: 0, ...ek,
});
type Ayar = { istasyon: '40' | '10'; split?: 'bol' | 'tek'; minLot?: number; adet?: number; ekip?: Record<string, string[]>; bolmeKip?: string };
const girdi = (a: Ayar) => {
  const steps = [adim(10, a.istasyon, { split: a.split ?? 'bol', minLot: a.minLot ?? 0 }), adim(20, '30')];
  const ROTA = {
    items: [{ id: '50', code: 'MM-1', name: 'Ornek govde', type: 'mamul', unit: 'ad', stock: 0 }],
    routes: { 50: { base: null, steps } },
    routeRevs: [{ id: '7', itemId: '50', no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: [] } }],
  };
  const kayit = {
    version: 7, savedAt: 9, items: ROTA.items, opdefs: [{ id: '13', name: 'Montaj' }], machines: [], routes: ROTA.routes,
    orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: a.adet ?? 8, start: '2026-10-19', due: '2026-11-20', priority: 1, status: 'serbest' }],
  };
  const kaynak = {
    durum: {
      ...ROTA,
      wcs: [{ id: '1', code: 'IM-1', name: 'Montaj', week: null, aktif: true }],
      stations: [istasyon('10'), istasyon('30'), istasyon('40')],
      machines: [makine('100', '10'), makine('101', '10'), makine('102', '10'), makine('300', '30')],
      people: [kisi('7'), kisi('8'), kisi('9')],
      cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    },
    ek: {
      takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: { 7: '3', 8: '3', 9: '3' } },
      makineNotu: null, kisiGorevi: null, insanliIstasyonlar: ['40'], ekipUyeleri: a.ekip ?? {},
    },
  };
  const calisma = {
    surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
    rrSavedAt: 5, dataVer: 1, kisitSurum: 2, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'sert', dondurma: 4, rule: 'edd' },
    param: { tampon: false, tamponZ: 0, acilPay: 0, ...(a.bolmeKip ? { bolmeKip: a.bolmeKip } : {}) }, kapali: ['personel'], olaylar: [], plan: null,
  };
  const g = planGirdisi({ calisma: calismayaMotorAyari(calisma, MOTOR_AYARI_VARSAYILAN), kayit, kaynak, bugun: '2026-10-19' });
  assert.ok(g);
  return g;
};
type Yer = { m: string; S: number; C: number };
const planla = (a: Ayar) => {
  const m = motorYukle();
  const st = girdi(a).st;
  const cx = m.compile(m.stHazirla(st)) as { ops: { id: string; adet: number; c: { m: string }[]; pr: [string, string][] }[] };
  const p = m.schedule(st, 'yeni', null) as { ops: Record<string, Yer> };
  return { cx, p, paylar: Object.keys(p.ops).filter((id) => id.startsWith('O1.10')).sort() };
};

describe('plan: paralel bölme planlama atölyesinde (1952 iş 2a)', () => {
  test('insanlı istasyonda adım vardiyalı kişilere eşit paylarla bölünür, paylar aynı anda başlar, ardıl hepsini bekler', () => {
    const { cx, p, paylar } = planla({ istasyon: '40', adet: 7 });
    assert.deepEqual(paylar, ['O1.10', 'O1.10~2', 'O1.10~3']);
    assert.deepEqual([...cx.ops.filter((o) => o.id.startsWith('O1.10')).map((o) => o.adet)], [3, 2, 2], 'kalan ilk paya');
    assert.deepEqual(new Set(paylar.map((id) => p.ops[id]!.m)), new Set(['kisi-7', 'kisi-8', 'kisi-9']));
    assert.equal(new Set(paylar.map((id) => p.ops[id]!.S)).size, 1);
    assert.deepEqual([...(cx.ops.find((o) => o.id === 'O1.20')?.pr ?? [])].map(([q]) => q).sort(), paylar);
    assert.ok(p.ops['O1.20']!.S >= Math.max(...paylar.map((id) => p.ops[id]!.C)) - 1e-9);
  });

  test('makineli istasyonda da aynı kural: paylar boş makinelere (1956 a)', () => {
    const { p, paylar } = planla({ istasyon: '10', adet: 9 });
    assert.equal(paylar.length, 3);
    assert.deepEqual(new Set(paylar.map((id) => p.ops[id]!.m)), new Set(['100', '101', '102']));
  });

  test('pay sayısı en küçük parçayla ve bölme sınırıyla sınırlıdır; tek pay bölme değildir', () => {
    assert.equal(planla({ istasyon: '40', adet: 8, minLot: 4 }).paylar.length, 2);
    assert.deepEqual(planla({ istasyon: '40', adet: 8, minLot: 5 }).paylar, ['O1.10']);
    assert.deepEqual(planla({ istasyon: '40', adet: 1 }).paylar, ['O1.10']);
  });

  test('reddedilen: rotada paralel böl yoksa ya da çalışmada bölme kapalıysa bölünmez', () => {
    assert.deepEqual(planla({ istasyon: '40', split: 'tek' }).paylar, ['O1.10']);
    assert.deepEqual(planla({ istasyon: '40', bolmeKip: 'kapali' }).paylar, ['O1.10']);
  });

  test('önce ekip (1955 a): ekipte iki üye varsa paylar yalnız onlara; tek üyede istasyonun bütün kişileri', () => {
    const e = planla({ istasyon: '40', adet: 9, ekip: { 40: ['8', '9'] } });
    assert.deepEqual(new Set(e.paylar.map((id) => e.p.ops[id]!.m)), new Set(['kisi-8', 'kisi-9']));
    const t = planla({ istasyon: '40', adet: 9, ekip: { 40: ['8'] } });
    assert.deepEqual(new Set(t.paylar.map((id) => t.p.ops[id]!.m)), new Set(['kisi-7', 'kisi-8', 'kisi-9']));
  });

  test('bölünmeyen adımın adayları ekipten etkilenmez', () => {
    const g = girdi({ istasyon: '40', split: 'tek', ekip: { 40: ['8', '9'] } });
    const rota = (g.S as { D: { urunler: { rota: { tezgahlar: { id: string }[] }[] }[] } }).D.urunler[0]!.rota[0]!;
    assert.deepEqual(rota.tezgahlar.map((t) => t.id), ['kisi-7', 'kisi-8', 'kisi-9']);
  });
});

// 1952 iş 2b: canlı planın motor önerisinde ('yeni' kip) bölünen adım paylarıyla döner; sabit kipte bölünmez. Veriler uydurmadır.
const V = '3';
const canliAdim = (seq: number, stationId: string, ek: Record<string, unknown> = {}) => ({
  id: `x-o${String(seq)}`, opNo: seq, seq, opId: '13', name: 'Isleme', stationId, machineId: null, kisiId: null, fasonId: null, terminGun: null,
  setup: 0, proc: 30, chg: null, cycle: 30, dep: 'bagimli', depQty: 1, rejectPct: 0, split: 'tek', minLot: 0, resetup: false, alts: [], altTimes: {}, digerAdaylar: [], ins: [], outs: [],
  ayarli: false, ...ek,
});
const canliKisi = (id: string) => ({ id, name: `Kisi ${id}`, code: `K${id}`, wcId: '1', stationId: null, skills: ['40'], active: true, machines: [] });
const canliKaynak = (istasyonId: '10' | '40', ekip: Record<string, string[]> = {}) => ({
  calisma: {
    surum: 2, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: ['personel'], olaylar: [], plan: null,
    w: { famK: 0.3, mat: 'uyari', dondurma: 0 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
    D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [{ id: V, bas: '08:00', bit: '16:00' }], calismaGunleri: { pzt: [V], sal: [V], car: [V], per: [V], cum: [V] },
      tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  },
  kayit: { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] },
  kaynak: {
    durum: {
      items: [{ id: '50', code: 'MM-1', name: 'Ornek govde', type: 'mamul', unit: 'ad', stock: 0 }],
      opdefs: [{ id: '13', code: 'ISL', name: 'Isleme' }],
      routes: { 50: { base: null, steps: [canliAdim(10, istasyonId, { split: 'bol' }), canliAdim(20, '30')] } },
      routeRevs: [{ id: '750', itemId: '50', no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: [] } }],
      wcs: [{ id: '1', code: 'IM', name: 'Merkez', aktif: true }],
      stations: ['10', '30', '40'].map((id) => istasyon(id)),
      machines: [makine('100', '10'), makine('101', '10'), makine('102', '10'), makine('300', '30')],
      cal: { shifts: [{ id: V, name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
      people: [canliKisi('7'), canliKisi('8'), canliKisi('9')],
      emirler: { orders: [{ id: '1', no: 'E-1', itemId: '50', qty: 9, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'serbest' }], opStatus: {}, opProg: {} },
      calisanAdimlar: [],
    },
    ek: {
      takvim: { hafta: { 1: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((g) => [g, [V]])) }, kisiVardiyasi: { 7: V, 8: V, 9: V } },
      makineNotu: null, kisiGorevi: null, insanliIstasyonlar: ['40'], ekipUyeleri: ekip,
    },
  },
});
const canliIstek = (ek: Partial<PlanMotoruIstegi>): PlanMotoruIstegi => ({
  kip: 'yeni', simdi: new Date('2026-10-19T05:00:00Z'), kuyruklar: [{ makineId: 300, anahtarlar: ['E-1|20'] }], sabitler: [], calisanlar: [], taslakId: 1, ...ek,
});
const kaynagi = (p: { makineId: number | null; kisiId: number | null }) => (p.kisiId !== null ? `kisi-${String(p.kisiId)}` : String(p.makineId));

describe('plan: paralel bölme canlı planın motor önerisinde (1952 iş 2b)', () => {
  test('makineli istasyonda adım üç makineye paylarla döner; ardıl son payı bekler', async () => {
    const r = await coz(canliKaynak('10'), canliIstek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }, { makineId: 300, anahtarlar: ['E-1|20'] }] }));
    assert.deepEqual(r.yerlesmeyen, [], JSON.stringify(r.nedenler));
    const p = r.parcaliYerlesimler?.find((x) => x.anahtar === 'E-1|10');
    assert.ok(p, 'adım paylı dönmeli');
    assert.deepEqual(p.parcalar.map((x) => [x.no, x.adet]), [[1, 3], [2, 3], [3, 3]]);
    assert.deepEqual(new Set(p.parcalar.map(kaynagi)), new Set(['100', '101', '102']));
    assert.ok(!r.yerlesimler.some((x) => x.anahtar === 'E-1|10'), 'paylı adım tek yer olarak da dönmez');
    const ardil = r.yerlesimler.find((x) => x.anahtar === 'E-1|20')!;
    assert.ok(Date.parse(ardil.baslangic) >= Math.max(...p.parcalar.map((x) => Date.parse(x.bitis))));
  });

  test('reddedilen: sabit kipte (kuyruğun tezgâh sırası) adım bölünmez', async () => {
    const r = await coz(canliKaynak('10'), canliIstek({ kip: 'sabit', kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }, { makineId: 300, anahtarlar: ['E-1|20'] }] }));
    assert.equal(r.parcaliYerlesimler, undefined);
    assert.equal(r.yerlesimler.find((x) => x.anahtar === 'E-1|10')?.makineId, 100);
  });

  test('insanlı istasyonda paylar kişilere; ekipte iki kişi varsa yalnız ekibe (1955 a)', async () => {
    const kisiIstegi = canliIstek({ kisiKuyruklari: [{ kisiId: 7, anahtarlar: ['E-1|10'] }], kisiAdaylari: [{ anahtar: 'E-1|10', kisiIdler: [7, 8, 9] }] });
    const hepsi = (await coz(canliKaynak('40'), kisiIstegi)).parcaliYerlesimler?.[0];
    assert.deepEqual(new Set(hepsi?.parcalar.map(kaynagi)), new Set(['kisi-7', 'kisi-8', 'kisi-9']));
    const ekip = (await coz(canliKaynak('40', { 40: ['8', '9'] }), kisiIstegi)).parcaliYerlesimler?.[0];
    assert.deepEqual(ekip?.parcalar.map((x) => x.adet), [5, 4]);
    assert.deepEqual(new Set(ekip?.parcalar.map(kaynagi)), new Set(['kisi-8', 'kisi-9']));
  });
});

// 1985 a: motorun bölmesi işaretle yazılır; yer kalkınca motorun bölmesi de kalkar, elle bölme yersiz parçalar olarak kalır.
describe('plan (gerçek PostgreSQL): motor bölmesi işareti (1985 a)', () => {
  let ortam: TestVeritabani | undefined;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  before(async () => { ortam = await testVeritabaniKur('plan_motor_bolmesi'); });
  after(async () => { await ortam?.kaldir(); });

  test('motorun bölmesi okunur; silinince parçaları da gider, elle bölme yersiz kalır', async () => {
    const kisi = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'mb-kisi', kullaniciAdi: 'mb-kisi', parola: 'dogru-parola-1' }));
    const senaryo = (await o().sahip.tek<{ id: number }>('INSERT INTO plan_senaryosu (ad, taban_plan_surumu, acan_kisi_id) VALUES ($1, 1, $2) RETURNING id', ['Deneme', kisi]))!.id;
    const t = (saat: number) => new Date(Date.UTC(2099, 9, 5, saat));
    const yaz = (isEmriId: number, motorBolmesi: boolean) => o().vt.tx((db) => yerlesimYaz(db, senaryo, {
      isEmriId, kaynak: { tur: 'kisi', id: kisi }, baslangic: t(8), bitis: t(10), kilitli: false, dondurulmus: false, elleSira: null,
      parcalar: [1, 2].map((no) => ({ no, adet: 2, kaynak: { tur: 'kisi' as const, id: kisi }, baslangic: t(7 + no), bitis: t(8 + no), elleSira: null, elleIstasyonId: null, elleKaynak: false, motorBolmesi })),
    }));
    await yaz(-1001, true);
    await yaz(-1002, false);
    const okunan = await o().vt.tx((db) => yerlesimler(db, senaryo));
    assert.deepEqual(okunan.map((y) => [y.isEmriId, y.parcalar?.map((p) => p.motorBolmesi)]).sort(), [[-1001, [true, true]], [-1002, [false, false]]].sort());
    await o().vt.tx((db) => yerlesimleriSil(db, senaryo, [-1001, -1002]));
    assert.deepEqual([...(await o().vt.tx((db) => yersizBolmeler(db, senaryo))).keys()], [-1002]);
    const kalan = await o().sahip.sorgu<{ id: number }>('SELECT DISTINCT is_emri_id AS id FROM plan_senaryo_yerlesim_parcasi WHERE senaryo_id = $1', [senaryo]);
    assert.deepEqual(kalan.map((x) => x.id), [-1002]);
  });
});
