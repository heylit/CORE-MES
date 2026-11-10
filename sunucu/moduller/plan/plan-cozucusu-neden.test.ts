import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PlanMotoruIstegi } from './disari.ts';
import { motorPlaniDenetle } from './motor-sinir.ts';
import { adayNedeni, coz } from './plan-cozucusu.ts';

// B-2482-32 (2696): sunucu çözücüsü yerleştiremediği işin nedenini motorun failNeden'inden yazar; 'aday' nedeninde (işi yapabilecek tezgâh
// yok) kaynaktaki sebebi ayırır. Fikstür plan-cozucusu.test.ts'inkinin en azıdır. Veriler uydurmadır.
const V = '3';
const adim = (opNo: number, dk: number | string | null, ek: Record<string, unknown> = {}) => ({
  id: `50-o${String(opNo)}`, opNo, seq: opNo, opId: '13', name: 'Tornalama', stationId: '10', machineId: null, kisiId: null, fasonId: null, terminGun: null,
  setup: 0, proc: dk, chg: null, cycle: dk, dep: 'bagimli', depQty: 1, rejectPct: 0, split: 'tek', minLot: 0, resetup: false, alts: [], altTimes: {}, digerAdaylar: [], ins: [], outs: [],
  ...ek,
});
const emir = (id: string, no: string) => ({ id, no, itemId: '50', qty: 2, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'serbest' });
const MAKINE = { id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true };
const KISI = { id: '7', name: 'Deneme Kisi', code: 'K7', wcId: '1', stationId: '10', skills: ['10'], active: true, machines: [] };
function kaynakKur(o: { adimlar?: unknown[]; makineler?: unknown[]; kisiler?: unknown[]; insanli?: string[]; kisiVardiyasi?: Record<string, string> } = {}) {
  return {
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
        routes: { 50: { base: null, steps: o.adimlar ?? [adim(10, 30)] } },
        routeRevs: [{ id: '7', itemId: '50', no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: [] } }],
        wcs: [{ id: '1', code: 'IM', name: 'Merkez', aktif: true }],
        stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
        machines: o.makineler ?? [MAKINE],
        people: o.kisiler ?? [],
        cal: { shifts: [{ id: V, name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
        emirler: { orders: [emir('1', 'E-1')], opStatus: {}, opProg: {} },
        calisanAdimlar: [],
      },
      ek: { takvim: { hafta: { 1: { 1: [V], 2: [V], 3: [V], 4: [V], 5: [V] } }, kisiVardiyasi: o.kisiVardiyasi ?? {} }, makineNotu: null, kisiGorevi: null, insanliIstasyonlar: o.insanli ?? [] },
    },
  };
}
const istek = (ek: Partial<PlanMotoruIstegi>): PlanMotoruIstegi => ({
  kip: 'yeni', simdi: new Date('2026-10-19T05:00:00Z'), kuyruklar: [], sabitler: [], calisanlar: [], taslakId: 1, ...ek,
});
const ONEK = 'Sunucu motoru yerleştiremedi: ';

describe('sunucu çözücüsünde yerleşmeme nedeni (2696, B-2482-32)', () => {
  test('YN-02 aday: istasyonun aktif makinesi yoksa neden odur', async () => {
    const r = await coz(kaynakKur({ makineler: [{ ...MAKINE, aktif: false }] }), istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] }));
    assert.deepEqual(r.yerlesmeyen, ['E-1|10']);
    assert.equal(r.nedenler['E-1|10'], `${ONEK}Torna istasyonunun aktif makinesi yok.`);
  });
  test('YN-03 aday: insanlı istasyonda vardiyası olan yetkin kişi yoksa neden odur; kişiye vardiya verilince yerleşir', async () => {
    const yok = await coz(kaynakKur({ insanli: ['10'], kisiler: [KISI] }), istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] }));
    assert.deepEqual(yok.yerlesmeyen, ['E-1|10']);
    assert.equal(yok.nedenler['E-1|10'], `${ONEK}Torna insanlı istasyon; vardiyası olan yetkin kişi yok.`);
    const var_ = await coz(kaynakKur({ insanli: ['10'], kisiler: [KISI], kisiVardiyasi: { 7: V } }), istek({}));
    assert.ok(!var_.yerlesmeyen.includes('E-1|10'), JSON.stringify(var_.nedenler));
  });
  test('YN-04 zaman: aday var ama ufukta yer yoksa motorun metni', async () => {
    const r = await coz(kaynakKur({ adimlar: [adim(10, 1e7)] }), istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] }));
    assert.deepEqual(r.yerlesmeyen, ['E-1|10']);
    assert.equal(r.nedenler['E-1|10'], `${ONEK}ufuk içinde tezgâh, vardiya, kaynak ya da malzeme yeri yok.`);
  });
  test('YN-05 öncül: öncülü yerleşmeyen adım öncülü söyler, öncülün kendisi kendi nedenini', async () => {
    const r = await coz(kaynakKur({ adimlar: [adim(10, 30), adim(20, 15)], makineler: [{ ...MAKINE, aktif: false }] }),
      istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10', 'E-1|20'] }] }));
    assert.deepEqual(r.nedenler, { 'E-1|10': `${ONEK}Torna istasyonunun aktif makinesi yok.`, 'E-1|20': 'Önceki adım (E-1 OP 10) yerleşmedi.' });
  });
});

describe('motor nedeni şeması (Mimar N1)', () => {
  test('YN-09: tanınmayan neden kodu planı reddettirmez; yalnız o neden düşer', () => {
    const p = motorPlaniDenetle({ ops: {}, fail: ['S1.10', 'S1.20'], failNeden: { 'S1.10': { kod: 'yeni-kod' }, 'S1.20': { kod: 'oncul', oncul: 'S1.10' } } });
    assert.deepEqual(p.failNeden, { 'S1.10': undefined, 'S1.20': { kod: 'oncul', oncul: 'S1.10' } });
  });
});

describe('aday nedeni (saf)', () => {
  const k = (o: Parameters<typeof kaynakKur>[0]) => kaynakKur(o).kaynak;
  test('YN-01: adımın işlem süresi boş ve süreli alternatifi yoksa neden odur (makine ve kişi denetiminden önce)', () => {
    assert.equal(adayNedeni(k({ adimlar: [adim(10, null)] }), 'E-1|10'), 'adımın işlem süresi boş (rotada çevrim süresi girilmemiş)');
    assert.equal(adayNedeni(k({ adimlar: [adim(10, null)], makineler: [] }), 'E-1|10'), 'adımın işlem süresi boş (rotada çevrim süresi girilmemiş)');
    assert.equal(adayNedeni(k({ adimlar: [adim(10, '')] }), 'E-1|10'), 'adımın işlem süresi boş (rotada çevrim süresi girilmemiş)');
  });
  test('YN-08 (Mimar N2): süre kuralı motorunkiyle aynı; işlem ya da değişim dolu, çevrim boşsa süre nedeni değildir', () => {
    const makinesiz = { makineler: [] };
    assert.equal(adayNedeni(k({ adimlar: [adim(10, null, { proc: 30 })], ...makinesiz }), 'E-1|10'), 'Torna istasyonunun aktif makinesi yok');
    assert.equal(adayNedeni(k({ adimlar: [adim(10, null, { proc: null, chg: 5 })], ...makinesiz }), 'E-1|10'), 'Torna istasyonunun aktif makinesi yok');
    const { proc: _p, ...islemsiz } = adim(10, 30);
    assert.equal(adayNedeni(k({ adimlar: [islemsiz], ...makinesiz }), 'E-1|10'), 'Torna istasyonunun aktif makinesi yok', 'işlem alanı olmayan eski kayıtta çevrim');
    const { proc: _q, ...islemsizBos } = adim(10, null);
    assert.equal(adayNedeni(k({ adimlar: [islemsizBos] }), 'E-1|10'), 'adımın işlem süresi boş (rotada çevrim süresi girilmemiş)');
  });
  test('YN-06: süresi olan alternatif istasyon varsa süre nedeni değildir; adım ya da emir bulunamazsa null', () => {
    const alt = adim(10, null, { alts: ['11'], altTimes: { 11: { setup: 0, cycle: 5 } } });
    assert.notEqual(adayNedeni(k({ adimlar: [alt] }), 'E-1|10'), 'adımın işlem süresi boş (rotada çevrim süresi girilmemiş)');
    assert.equal(adayNedeni(k({}), 'E-9|10'), null);
    assert.equal(adayNedeni(k({}), 'E-1|99'), null);
    assert.equal(adayNedeni(null, 'E-1|10'), null);
  });
  test('YN-07: aktif makinesi ve süresi olan istasyonda neden ayrılamaz (null; motorun genel metni yazılır)', () => {
    assert.equal(adayNedeni(k({}), 'E-1|10'), null);
    assert.equal(adayNedeni(k({ insanli: ['10'], kisiler: [KISI], kisiVardiyasi: { 7: V } }), 'E-1|10'), null);
    assert.equal(adayNedeni(k({ insanli: ['10'], kisiler: [{ ...KISI, skills: ['12'] }], kisiVardiyasi: { 7: V } }), 'E-1|10'), 'Torna insanlı istasyon; vardiyası olan yetkin kişi yok');
    assert.equal(adayNedeni(k({ insanli: ['10'], kisiler: [{ ...KISI, active: false }], kisiVardiyasi: { 7: V } }), 'E-1|10'), 'Torna insanlı istasyon; vardiyası olan yetkin kişi yok');
  });
});
