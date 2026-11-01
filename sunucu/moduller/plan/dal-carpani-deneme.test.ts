import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { sanalAdimAdetleriyle } from './plan-cozucusu.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';
import { planTestOrtami } from './plan-ortak.test.ts';
import { teklifAdimAdetleri } from './planlama-servis.ts';
import { teklifDenemesi, type DenemeIstegi } from './teklif-denemesi.ts';

// 1527: emri açılmamış işte (planın deneme emri, satış teklifi kalemi) dal adımı bir mamul için çarpan kadar parça işler (1257 a); adet
// uretim-emirleri'nin rotadanAdimAdetleri'nden gelir, plan ve motor çarpanı kendisi uygulamaz. Veriler uydurmadır.

// Teklif denemesinin girdisi teklif-denemesi.test.ts'tekiyle aynı (iki tezgâh, hafta içi 08:00-16:00, başlangıç 2026-10-19).
const tezgah = (id: string, grup: string, ucret: number | null): Record<string, unknown> => ({ id, ad: id, grup, ucret, verim: 1, vardiyalar: ['3'], opOran: 0 });
const KAYIT = {
  version: 7, savedAt: 9,
  items: [
    { id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul' },
    { id: '60', code: 'MM-2', name: 'Ornek burc', type: 'mamul' },
    { id: 'H1', code: 'H1', name: 'Ornek cubuk', type: 'ham', unit: 'kg', cost: 10, stock: 100, plan: { kod: 'H1', ad: 'Ornek cubuk', birim: 'kg', stok: 100, birimFiyat: 10, tedarikGun: 5, muayeneGun: 0 } },
  ],
  opdefs: [{ id: '13', name: 'Tornalama' }, { id: '14', name: 'Taslama' }],
  // tezgâhın motor ayarları kaydın plan alt nesnesindedir (çerçeve rrDenemedenKur ile yazar)
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', plan: tezgah('100', '10', 750) }, { id: '101', code: 'S1', name: 'Taslama 1', stationId: '11', plan: tezgah('101', '11', null) }],
  routes: {
    50: { base: null, steps: [{ id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [{ id: 'n1', itemId: 'H1', qty: 2 }] }] },
    60: { base: null, steps: [{ id: '60-o10', seq: 10, opNo: 10, opId: '14', stationId: '11', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [] }] },
  },
  orders: [
    { id: 'O1', no: 'E-1', itemId: '50', qty: 10, start: '2026-10-19', due: '2026-10-23', priority: 2, status: 'serbest' },
    { id: 'O2', no: 'E-2', itemId: '50', qty: 16, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'serbest' },
  ],
};
const D0 = {
  meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [],
  tezgahlar: [], personel: [], siparisler: [], ayarlar: {},
};
const KAYNAK = {
  durum: {
    wcs: [{ id: '1', code: 'IM-1', name: 'Talasli', week: null, aktif: true }],
    stations: [
      { id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true },
      { id: '11', code: 'TAS', name: 'Taslama', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true },
    ],
    machines: [
      { id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true },
      { id: '101', code: 'S1', name: 'Taslama 1', stationId: '11', status: 'aktif', aktif: true },
    ],
    people: [],
    cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
  },
  ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null },
};
const calismaKur = (): Record<string, unknown> => ({
  D: D0, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'sert', dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
});
// Taban: aynı girdiyle kural tabanlı plan (çerçevede "sıfırdan çöz"ün ilk adımı).
function tabanli(): Record<string, unknown> {
  const c = calismaKur();
  const g = planGirdisi({ calisma: c, kayit: KAYIT, kaynak: KAYNAK, bugun: '2026-10-19' });
  assert.ok(g);
  const p = motorYukle().schedule(g.st, 'dagit', null);
  return { ...c, plan: { ops: p.ops } };
}
const istek = (ek: Partial<DenemeIstegi>): DenemeIstegi => ({
  calisma: tabanli(), kayit: KAYIT, kaynak: KAYNAK, bugun: '2026-10-19', kalemler: [{ id: 'TK-1', urun: '50', adet: 4 }], termin: null, taslaklar: [], haric: null, tamponGun: 2, ...ek,
});

describe('dal çarpanı: emri açılmamış işin adım adedi (1527)', () => {
  test('sanal emrin adım adetleri kaynak okumasına "emir no|OP no" anahtarıyla eklenir; çağıranın nesnesi değişmez', () => {
    const kaynak = { durum: { adimAdetleri: { 'E-1|20': 7 } }, ek: null };
    const y = sanalAdimAdetleriyle(kaynak, [{ no: 'DENEME-3', malzemeId: 5, adet: 10, baslangic: null, teslim: null, oncelik: 1, adimAdetleri: { 10: 20 } }]);
    assert.deepEqual(y?.durum, { adimAdetleri: { 'E-1|20': 7, 'DENEME-3|10': 20 } });
    assert.deepEqual(kaynak.durum.adimAdetleri, { 'E-1|20': 7 });
    assert.equal(sanalAdimAdetleriyle(kaynak, undefined), kaynak);
    assert.equal(sanalAdimAdetleriyle(null, [{ no: 'D', malzemeId: 5, adet: 1, baslangic: null, teslim: null, oncelik: 1, adimAdetleri: { 10: 2 } }]), null);
    assert.deepEqual(sanalAdimAdetleriyle({ durum: {}, ek: null }, [{ no: 'D', malzemeId: 5, adet: 1, baslangic: null, teslim: null, oncelik: 1, adimAdetleri: { 10: 2 } }])?.durum,
      { adimAdetleri: { 'D|10': 2 } });
  });

  test('teklif kaleminin dal adımı motorda adım adediyle işlenir (TL ve süre); dizi rotayla uyuşmazsa kalem adedi', async () => {
    // Ürün 50'nin tek adımı: çevrim 30 dk, ücret 750. Kalem 4 adet, adım adedi 8 (çarpan 2): 8 x 0,5 sa x 750.
    const k = (await teklifDenemesi(istek({ kalemler: [{ id: 'TK-1', urun: '50', adet: 4, adimAdetleri: [8] }] })))?.kalemler[0];
    assert.equal(k?.islemler[0]?.tl, 8 * 0.5 * 750);
    assert.equal(k?.islemler[0]?.islemeSaat, 4);
    const uymaz = (await teklifDenemesi(istek({ kalemler: [{ id: 'TK-1', urun: '50', adet: 4, adimAdetleri: [8, 8] }] })))?.kalemler[0];
    assert.equal(uymaz?.islemler[0]?.tl, 4 * 0.5 * 750);
    const taslak = { id: 'ST-1', kalemler: [{ id: 'ST-1-1', urun: '50', adet: 4, termin: '2026-11-06 23:00', adimAdetleri: [8] }], yerlesim: {} };
    const r = await teklifDenemesi(istek({ termin: '2026-10-22 23:00', taslaklar: [taslak], kalemler: [{ id: 'TK-1', urun: '60', adet: 1 }] }));
    assert.ok(r?.plan?.bloklar.some((b) => b.tur === 'satis-taslagi'));
  });

  test('teklif kaleminin adım adetleri motorun rota sırasıyla (seq); rota kaynak okumasından, yoksa kayıttan; rotasız ürün alansız', () => {
    const adimlar = [{ seq: 30, opNo: 30 }, { seq: 10, opNo: 10, adetCarpani: 2 }, { seq: 20, opNo: 20, adetCarpani: null }];
    const f = teklifAdimAdetleri({ durum: { routes: { 50: { base: null, steps: adimlar } } }, ek: null }, { routes: { 60: { steps: [{ seq: 10, opNo: 10, adetCarpani: 3 }] } } });
    assert.deepEqual(f('50', 4), { adimAdetleri: [8, 4, 4] });
    assert.deepEqual(f('60', 4), { adimAdetleri: [12] });
    assert.deepEqual(f('70', 4), {});
    assert.deepEqual(teklifAdimAdetleri(null, null)('50', 4), {});
  });
});

describe('dal çarpanı (gerçek PostgreSQL): planın deneme emri (1527)', () => {
  const { c, tamam, yeniAdim, isEmirleriAc, planOku } = planTestOrtami();

  test('acil sipariş denemesinde dal adımının adedi ve motordaki süresi çarpanla; ana hat ve birleştirme emir adediyle', async () => {
    // Dal A (çarpan 2) ve dal B birleştirmede buluşur; ayar 30 dk, birim 2 dk. Deneme emri 100 adet: dal A 200 parça, 30 + 400 dk.
    const [a1] = await isEmirleriAc([
      yeniAdim({ dal: 'A', adetCarpani: 2 }), yeniAdim({ dal: 'B' }), yeniAdim({ birlesen: ['A', 'B'], bilesenler: [] }),
    ]);
    const gercek = await planOku();
    assert.equal([...gercek.yerlesimler, ...gercek.yerlesmemis].find((y) => y.isEmriId === a1)?.adet, 20, 'gerçek emir (10 adet) zaten çarpanlı');
    let s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', '/plan/senaryolar', { ad: 'Dal 1527' })).senaryolar.find((x) => x.ad === 'Dal 1527')!;
    s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${s.id}/hizli`, { tur: 'acil', surum: s.surum })).senaryolar.find((x) => x.id === s.id)!;
    // Uçtan okunur (1556): cevap şeması deneme emrinin eksi kimliğini kabul eder; önceden GET /plan?taslak= 500 dönüyordu.
    const p = await planOku(s.id);
    // Ekranın çizdiği motor yerleşimi de aynı taslağı okur; deneme işleri eksi kimlikle gelir.
    const m = await tamam<{ yerlesimler: { isEmriId: number }[] }>(c.planlama, 'GET', `/plan/motor-yerlesimi?taslak=${s.id}`);
    assert.ok(m.yerlesimler.some((y) => y.isEmriId < 0), 'motor yerleşiminde deneme işi var');
    const deneme = [...p.yerlesimler, ...p.yerlesmemis].filter((y) => y.isEmriId < 0).sort((x, y) => x.opNo - y.opNo);
    assert.deepEqual(deneme.map((y) => y.adet), [200, 100, 100]);
    const dalA = p.yerlesimler.find((y) => y.isEmriId === deneme[0]!.isEmriId);
    assert.ok(dalA, 'deneme emrinin dal adımı yerleşir');
    // Merkez tam gün çalışır: süre ayar + adet x birim süre (motor çeyrek saate yuvarlar); çarpansız 230 dk olurdu.
    assert.ok(Date.parse(dalA.bitis) - Date.parse(dalA.baslangic) >= 420 * 60_000, `${dalA.baslangic} - ${dalA.bitis}`);
  });
});
