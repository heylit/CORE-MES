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
const TORNA = { tur: 'istasyon', id: 10, ad: 'Torna' } as const;
const neden = (kod: string, metin: string, hedef: unknown = null) => ({ kod, metin, hedef });

// 2780: ileti tek ve somut nedendir (kod, tek cümle, düzeltilecek istasyon ya da tezgâh); motorun genel 'zaman' metni yazılmaz.
describe('sunucu çözücüsünde yerleşmeme nedeni (2696, B-2482-32, 2780)', () => {
  test('YN-02 aday: istasyonun aktif makinesi yoksa neden odur', async () => {
    const r = await coz(kaynakKur({ makineler: [{ ...MAKINE, aktif: false }] }), istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] }));
    assert.deepEqual(r.yerlesmeyen, ['E-1|10']);
    assert.deepEqual(r.nedenler['E-1|10'], neden('makine-yok', 'Torna istasyonunda aktif makine yok.', TORNA));
  });
  test('YN-03 aday: insanlı istasyonda yetkin kişi vardiyasız ya da hiç yoksa ayrı neden; kişiye vardiya verilince yerleşir', async () => {
    const yok = await coz(kaynakKur({ insanli: ['10'], kisiler: [KISI] }), istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] }));
    assert.deepEqual(yok.yerlesmeyen, ['E-1|10']);
    assert.deepEqual(yok.nedenler['E-1|10'], neden('kisi-vardiyasiz', 'Torna istasyonundaki yetkin kişilerin hiçbirinin vardiyası seçilmemiş.', TORNA));
    const yetkinsiz = await coz(kaynakKur({ insanli: ['10'], kisiler: [] }), istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] }));
    assert.deepEqual(yetkinsiz.nedenler['E-1|10'], neden('yetkin-kisi-yok', 'Torna insanlı istasyonunda yetkin kişi tanımlı değil.', TORNA));
    const var_ = await coz(kaynakKur({ insanli: ['10'], kisiler: [KISI], kisiVardiyasi: { 7: V } }), istek({}));
    assert.ok(!var_.yerlesmeyen.includes('E-1|10'), JSON.stringify(var_.nedenler));
  });
  test('YN-04 zaman: işin süresi tezgâhın ufuktaki açık süresinden uzunsa neden ufuktur, iki süreyle', async () => {
    const r = await coz(kaynakKur({ adimlar: [adim(10, 1e7)] }), istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] }));
    assert.deepEqual(r.yerlesmeyen, ['E-1|10']);
    const n = r.nedenler['E-1|10'];
    assert.equal(n?.kod, 'ufuk');
    assert.deepEqual(n?.hedef, { tur: 'makine', id: 100, ad: 'Torna 1' });
    assert.match(n?.metin ?? '', /^İşin süresi \([\d.,]+ sa\) Torna 1 tezgâhının planlama ufkunda \(\d+ gün\) açık süresinden \([\d.,]+ sa\) uzun\.$/);
  });
  test('YN-10: vardiyası hiç tanımsız tezgâhın işi motora girmez, vardiyasız listesindedir (168 b; neden servisçe takvim-yok)', async () => {
    const k = kaynakKur({});
    (k.calisma as { D: { calismaGunleri: object } }).D.calismaGunleri = {};
    (k.kaynak.ek as { takvim: { hafta: object } }).takvim.hafta = {};
    const r = await coz(k, istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] }));
    assert.deepEqual([r.vardiyasiz, r.nedenler], [['E-1|10'], {}]);
  });
  test('YN-05 öncül: öncülü yerleşmeyen adım öncülü söyler, öncülün kendisi kendi nedenini', async () => {
    const r = await coz(kaynakKur({ adimlar: [adim(10, 30), adim(20, 15)], makineler: [{ ...MAKINE, aktif: false }] }),
      istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10', 'E-1|20'] }] }));
    assert.deepEqual(r.nedenler, { 'E-1|10': neden('makine-yok', 'Torna istasyonunda aktif makine yok.', TORNA), 'E-1|20': neden('oncul', 'Önceki adım (E-1 OP 10) yerleşmedi.') });
  });
});

describe('motor nedeni şeması (Mimar N1)', () => {
  test('YN-09: tanınmayan neden kodu planı reddettirmez; yalnız o neden düşer', () => {
    const p = motorPlaniDenetle({ ops: {}, fail: ['S1.10', 'S1.20'], failNeden: { 'S1.10': { kod: 'yeni-kod' }, 'S1.20': { kod: 'oncul', oncul: 'S1.10' } } });
    assert.deepEqual(p.failNeden, { 'S1.10': undefined, 'S1.20': { kod: 'oncul', oncul: 'S1.10' } });
  });
});

describe('aday nedeni (saf)', () => {
  const SURE_BOS = neden('sure-bos', 'Adımın Torna istasyonundaki işlem süresi girilmemiş.', TORNA);
  const MAKINESIZ = neden('makine-yok', 'Torna istasyonunda aktif makine yok.', TORNA);
  const YETKINSIZ = neden('yetkin-kisi-yok', 'Torna insanlı istasyonunda yetkin kişi tanımlı değil.', TORNA);
  const k = (o: Parameters<typeof kaynakKur>[0]) => kaynakKur(o).kaynak;
  test('YN-01: adımın işlem süresi boş ve süreli alternatifi yoksa neden odur (makine ve kişi denetiminden önce)', () => {
    assert.deepEqual(adayNedeni(k({ adimlar: [adim(10, null)] }), 'E-1|10'), SURE_BOS);
    assert.deepEqual(adayNedeni(k({ adimlar: [adim(10, null)], makineler: [] }), 'E-1|10'), SURE_BOS);
    assert.deepEqual(adayNedeni(k({ adimlar: [adim(10, '')] }), 'E-1|10'), SURE_BOS);
  });
  test('YN-08 (Mimar N2): süre kuralı motorunkiyle aynı; işlem ya da değişim dolu, çevrim boşsa süre nedeni değildir', () => {
    const makinesiz = { makineler: [] };
    assert.deepEqual(adayNedeni(k({ adimlar: [adim(10, null, { proc: 30 })], ...makinesiz }), 'E-1|10'), MAKINESIZ);
    assert.deepEqual(adayNedeni(k({ adimlar: [adim(10, null, { proc: null, chg: 5 })], ...makinesiz }), 'E-1|10'), MAKINESIZ);
    const { proc: _p, ...islemsiz } = adim(10, 30);
    assert.deepEqual(adayNedeni(k({ adimlar: [islemsiz], ...makinesiz }), 'E-1|10'), MAKINESIZ, 'işlem alanı olmayan eski kayıtta çevrim');
    const { proc: _q, ...islemsizBos } = adim(10, null);
    assert.deepEqual(adayNedeni(k({ adimlar: [islemsizBos] }), 'E-1|10'), SURE_BOS);
  });
  test('YN-11: pasif istasyon kendi nedenidir (makine ve kişiden önce)', () => {
    const d = kaynakKur({}).kaynak;
    (d.durum as { stations: { aktif: boolean }[] }).stations[0]!.aktif = false;
    assert.deepEqual(adayNedeni(d, 'E-1|10'), neden('istasyon-pasif', 'Torna istasyonu pasif.', TORNA));
  });
  test('YN-06: süresi olan alternatif istasyon varsa süre nedeni değildir; adım ya da emir bulunamazsa null', () => {
    const alt = adim(10, null, { alts: ['11'], altTimes: { 11: { setup: 0, cycle: 5 } } });
    assert.notDeepEqual(adayNedeni(k({ adimlar: [alt] }), 'E-1|10'), SURE_BOS);
    assert.equal(adayNedeni(k({}), 'E-9|10'), null);
    assert.equal(adayNedeni(k({}), 'E-1|99'), null);
    assert.equal(adayNedeni(null, 'E-1|10'), null);
  });
  test('YN-07: aktif makinesi ve süresi olan istasyonda kaynakta neden yok (null; motor ölçüsüne kalır)', () => {
    assert.equal(adayNedeni(k({}), 'E-1|10'), null);
    assert.equal(adayNedeni(k({ insanli: ['10'], kisiler: [KISI], kisiVardiyasi: { 7: V } }), 'E-1|10'), null);
    assert.deepEqual(adayNedeni(k({ insanli: ['10'], kisiler: [{ ...KISI, skills: ['12'] }], kisiVardiyasi: { 7: V } }), 'E-1|10'), YETKINSIZ);
    assert.deepEqual(adayNedeni(k({ insanli: ['10'], kisiler: [{ ...KISI, active: false }], kisiVardiyasi: { 7: V } }), 'E-1|10'), YETKINSIZ);
  });
});
