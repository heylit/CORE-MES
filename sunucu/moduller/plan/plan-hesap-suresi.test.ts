import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { setTimeout as bekle } from 'node:timers/promises';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur, type TestVeritabani } from '#cekirdek/test-vt.ts';
import type { PlanMotoruIstegi, PlanMotoruOturumu } from './servis.ts';
import { canliTut, coz, sunucuPlanCozucusu } from './plan-cozucusu.ts';
import { planCoz, type PlanIstegi } from './plan-motoru.ts';
import { motorPlaniDenetle } from './motor-sinir.ts';
import { NEDEN_OLCULEMEDI } from './planlanamama-kurallar.ts';

// 3724: plan kilidi altındaki işlem motoru beklerken boşta işlem sınırına takılmaz; aynı koşunun turları girdiyi bir kez okur ve tek
// süre sınırını paylaşır; yerleşmeme ölçüsü iş parçacığında alınır. Veriler uydurmadır.
const istek = (ek: Partial<PlanMotoruIstegi> = {}): PlanMotoruIstegi => ({
  kip: 'sabit', simdi: new Date('2026-10-19T05:00:00Z'), kuyruklar: [], sabitler: [], calisanlar: [], taslakId: null, ...ek,
});
// Fikstür plan-cozucusu-neden.test.ts'in en azıdır: tezgâhın iki yıllık açık süresinden uzun tek adım (yerleşmez, neden ufuk).
const V = '3';
const kaynak = (dk = 1e7) => ({
  calisma: {
    surum: 2, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
    w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
    D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [{ id: V, bas: '08:00', bit: '16:00' }], calismaGunleri: { pzt: [V], sal: [V], car: [V], per: [V], cum: [V] },
      tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  },
  kayit: { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] },
  kaynak: {
    durum: {
      items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul', unit: 'ad', stock: 0 }],
      opdefs: [{ id: '13', code: 'TOR', name: 'Tornalama' }],
      routes: { 50: { base: null, steps: [{
        id: '50-o10', opNo: 10, seq: 10, opId: '13', name: 'Tornalama', stationId: '10', machineId: null, kisiId: null, fasonId: null, terminGun: null,
        setup: 0, proc: dk, chg: null, cycle: dk, dep: 'bagimli', depQty: 1, rejectPct: 0, split: 'tek', minLot: 0, resetup: false, alts: [], altTimes: {}, digerAdaylar: [], ins: [], outs: [],
      }] } },
      routeRevs: [{ id: '7', itemId: '50', no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: [] } }],
      wcs: [{ id: '1', code: 'IM', name: 'Merkez', aktif: true }],
      stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
      machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }],
      people: [],
      cal: { shifts: [{ id: V, name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
      emirler: { orders: [{ id: '1', no: 'E-1', itemId: '50', qty: 2, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'serbest' }], opStatus: {}, opProg: {} },
      calisanAdimlar: [],
    },
    ek: { takvim: { hafta: { 1: { 1: [V], 2: [V], 3: [V], 4: [V], 5: [V] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null, insanliIstasyonlar: [] },
  },
});
const sayan = (db: Db) => {
  const sqller: string[] = [];
  const d: Db = {
    sorgu: (sql, p) => { sqller.push(sql); return db.sorgu(sql, p); },
    tek: (sql, p) => { sqller.push(sql); return db.tek(sql, p); },
  };
  return { d, sqller };
};

describe('plan hesabı işlem süresine sığar (3724)', () => {
  let t: TestVeritabani;
  before(async () => { t = await testVeritabaniKur('plan_hesap_suresi'); });
  after(async () => { await t.kaldir(); });

  test('HS-01: canliTut hesap sürerken işlemi boşta işlem sınırından korur; korumasız işlem kesilir', async () => {
    // Sınır yoklama aralığının 15 katı: yavaş CI makinesinde (Windows) olay döngüsü takılsa da korunan işlem sınıra değmez.
    const tx = (is: (db: Db) => Promise<void>) => t.vt.tx(async (db) => {
      await db.sorgu("SET LOCAL idle_in_transaction_session_timeout = '1500ms'");
      await is(db);
      await db.sorgu('SELECT 1');
    });
    await tx(async (db) => { await canliTut(db, bekle(3500), 100); });
    await assert.rejects(tx(async () => { await bekle(3500); }), /bağlantısı kullanılamaz|terminat|idle/i);
  });

  test('HS-02: canliTut hesabın sonucunu ve hatasını aynen döndürür; süren yoklama bitmeden dönmez', async () => {
    const { d, sqller } = sayan(t.vt);
    assert.equal(await canliTut(d, bekle(250).then(() => 7), 50), 7);
    assert.ok(sqller.length >= 2 && sqller.every((s) => s === 'SELECT 1'));
    await assert.rejects(canliTut(d, bekle(120).then(() => { throw new Error('hesap bozuk'); }), 50), /hesap bozuk/);
  });

  test('HS-03: aynı oturumun ikinci turu girdiyi yeniden okumaz ve ilk turun süre sınırını taşır; başka an yeniden okur', async () => {
    const { d, sqller } = sayan(t.vt);
    const oturum: PlanMotoruOturumu = {};
    // Boş şemada kuyruk yoktur: çözücü girdiyi okur, motoru açmadan boş plan döner. Okuma sayısı ölçülür.
    assert.deepEqual((await sunucuPlanCozucusu(d, istek({ oturum }))).yerlesimler, []);
    const ilk = sqller.length;
    const sonAn = oturum.sonAn;
    assert.ok(ilk > 0 && typeof sonAn === 'number');
    assert.deepEqual((await sunucuPlanCozucusu(d, istek({ oturum }))).yerlesimler, []);
    assert.equal(sqller.length, ilk, 'ikinci tur veritabanını okumaz');
    assert.equal(oturum.sonAn, sonAn);
    assert.deepEqual((await sunucuPlanCozucusu(d, istek({ oturum, simdi: new Date('2026-10-20T05:00:00Z') }))).yerlesimler, []);
    assert.equal(sqller.length, 2 * ilk, 'başka an girdiyi yeniden okur');
    assert.deepEqual((await sunucuPlanCozucusu(d, istek())).yerlesimler, []);
    assert.equal(sqller.length, 3 * ilk, 'oturumsuz istek her seferinde okur');
  });
});

describe('motor süresi ve yerleşmeme ölçüsü (3724, saf)', () => {
  const KUYRUK: Partial<PlanMotoruIstegi> = { kip: 'yeni', taslakId: 1, kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] };
  test('HS-04: süre sınırı geçmişse iş parçacığı açılmadan aynı meşgul iletisiyle reddedilir', async () => {
    await assert.rejects(coz(kaynak(30), { ...istek(KUYRUK), sonAn: Date.now() - 1 }), /Plan 60 saniyede hesaplanamadı; plan değişmedi\./);
  });
  test('HS-05: iş yerleşirse ölçü iletide yoktur', async () => {
    let p: Awaited<ReturnType<typeof planCoz>> | null = null;
    const r = await coz(kaynak(30), istek(KUYRUK), async (i) => (p = await planCoz(i)));
    assert.deepEqual(r.yerlesmeyen, []);
    assert.equal(p!.olcu, undefined);
  });
  test('HS-08: süre sınırı sırada beklerken dolarsa çağrı öndeki çözümü beklemeden reddedilir; öndeki çözüm sürer', async () => {
    let durum: PlanIstegi['durum'] | null = null;
    await coz(kaynak(30), istek(KUYRUK), async (i) => { durum = i.durum; return planCoz(i); });
    const sira: string[] = [];
    const onde = planCoz({ durum: durum!, kip: 'yeni', taban: null }).then(() => sira.push('onde'));
    const arkada = planCoz({ durum: durum!, kip: 'yeni', taban: null, sonAn: Date.now() + 1 }).catch((e: Error) => { sira.push('arkada'); throw e; });
    await assert.rejects(arkada, /Plan 60 saniyede hesaplanamadı/);
    await onde;
    assert.deepEqual(sira, ['arkada', 'onde']);
  });
  test('HS-09: çözücü girdiyi değiştirmez; oturumda paylaşılan girdi turdan tura aynı kalır', async () => {
    for (const [dk, ek] of [[30, {}], [1e7, {}], [30, { sanalEmirler: [{ no: 'Yeni emir', malzemeId: 50, adet: 2, baslangic: null, teslim: '2026-10-30', oncelik: 2, adimAdetleri: { 10: 2 } }] }]] as const) {
      const k = kaynak(dk);
      const once = structuredClone(k);
      await coz(k, { ...istek({ ...KUYRUK, kip: 'yeni' }), ...ek } as PlanMotoruIstegi);
      await coz(k, { ...istek({ ...KUYRUK, kip: 'sabit' }), ...ek } as PlanMotoruIstegi);
      assert.deepEqual(k, once);
    }
  });
  test('HS-06: bozuk ölçü planı reddettirmez, düşer; sonsuz malzeme saati geçerlidir', () => {
    const plan = { ops: {}, fail: ['S1.10'] };
    assert.equal(motorPlaniDenetle({ ...plan, olcu: { gelmeyen: 'x' } }).olcu, undefined);
    const olcu = { gelmeyen: [], sinirda: false, olculer: [{ ufukGun: 56, malzemeHazirSaat: Infinity, adaylar: [] }] };
    assert.deepEqual(motorPlaniDenetle({ ...plan, olcu }).olcu, olcu);
  });
  test('HS-07: çözücü ölçüyü iş parçacığından ister; ölçü gelmezse neden "ölçülemedi" kalır, ana iş parçacığı derlemez', async () => {
    let giden: PlanIstegi | null = null;
    const r = await coz(kaynak(), { ...istek(KUYRUK), sonAn: Date.now() + 60_000 }, async (i) => {
      giden = i;
      const { olcu, ...p } = await planCoz({ ...i, olcu: false });
      assert.equal(olcu, undefined);
      return p;
    });
    assert.equal(giden!.olcu, true);
    assert.equal(typeof giden!.sonAn, 'number');
    assert.deepEqual(r.yerlesmeyen, ['E-1|10']);
    assert.deepEqual(r.nedenler['E-1|10'], NEDEN_OLCULEMEDI);
    const tam = await coz(kaynak(), istek(KUYRUK));
    assert.equal(tam.nedenler['E-1|10']?.kod, 'ufuk', 'ölçü iş parçacığından gelince neden ölçülür');
  });
});
