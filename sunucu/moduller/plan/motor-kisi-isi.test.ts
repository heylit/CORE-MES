import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PlanMotoruIstegi } from './disari.ts';
import { coz } from './plan-cozucusu.ts';
import type { MotorYerlesimiCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 1888 b: kişiye yerleşen adım motorda kişinin el tezgâhında dizilir. Ürün 50'nin adımı tornada (makine), ürün 60'ın adımı kişi işidir.
// Veriler uydurmadır. Tesis Europe/Istanbul: 05:00Z tesiste 08:00, vardiya 08:00-16:00.
const V = '3';
const adim = (ek: Record<string, unknown>) => ({
  id: 'x-o10', opNo: 10, seq: 10, opId: '13', name: 'Isleme', stationId: '10', machineId: null, kisiId: null, fasonId: null, terminGun: null,
  setup: 0, proc: 60, chg: null, cycle: 60, dep: 'bagimli', depQty: 1, rejectPct: 0, split: 'tek', minLot: 0, resetup: false, alts: [], altTimes: {}, digerAdaylar: [], ins: [], outs: [],
  ...ek,
});
const emir = (id: string, no: string, itemId: string) => ({ id, no, itemId, qty: 1, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'serbest' });
const kisi = (id: string, makineler: string[]) => ({ id, name: `Kisi ${id}`, code: `K${id}`, wcId: '1', stationId: null, skills: ['10'], active: true, machines: makineler });
const kaynak = (personelKisiti: boolean) => ({
  calisma: {
    surum: 2, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null, ...(personelKisiti ? { kisitSurum: 2 } : {}),
    w: { famK: 0.3, mat: 'uyari', dondurma: 0 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
    D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [{ id: V, bas: '08:00', bit: '16:00' }], calismaGunleri: { pzt: [V], sal: [V], car: [V], per: [V], cum: [V] },
      tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  },
  kayit: { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] },
  kaynak: {
    durum: {
      items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul', unit: 'ad', stock: 0 }, { id: '60', code: 'MM-2', name: 'Ornek kapak', type: 'mamul', unit: 'ad', stock: 0 }],
      opdefs: [{ id: '13', code: 'ISL', name: 'Isleme' }],
      routes: { 50: { base: null, steps: [adim({ ayarli: false })] }, 60: { base: null, steps: [adim({ stationId: null, kisiId: '7', ayarli: false })] } },
      routeRevs: ['50', '60'].map((itemId) => ({ id: `7${itemId}`, itemId, no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: [] } })),
      wcs: [{ id: '1', code: 'IM', name: 'Merkez', aktif: true }],
      stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
      machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }],
      cal: { shifts: [{ id: V, name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
      people: [kisi('7', ['100']), kisi('8', [])],
      emirler: { orders: [emir('1', 'E-1', '50'), emir('2', 'E-2', '60'), emir('3', 'E-3', '60')], opStatus: {}, opProg: {} },
      calisanAdimlar: [],
    },
    ek: { takvim: { hafta: { 1: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((g) => [g, [V]])) }, kisiVardiyasi: { 7: V, 8: V } }, makineNotu: null, kisiGorevi: { 7: 'Operatör', 8: 'Operatör' } },
  },
});
const istek = (ek: Partial<PlanMotoruIstegi>): PlanMotoruIstegi => ({
  kip: 'yeni', simdi: new Date('2026-10-19T05:00:00Z'), kuyruklar: [], sabitler: [], calisanlar: [], taslakId: 1, ...ek,
});
const SAAT = 3_600_000;
const yer = (r: Awaited<ReturnType<typeof coz>>, a: string) => {
  const y = (r.kisiYerlesimleri ?? []).find((x) => x.anahtar === a);
  assert.ok(y, `${a} kişiye yerleşmedi: ${JSON.stringify(r.yerlesmeyen)} ${JSON.stringify(r.nedenler)}`);
  return { ...y, bas: Date.parse(y.baslangic), bit: Date.parse(y.bitis) };
};

describe('plan motoru: kişi işi (1888 b)', () => {
  test('kişi kuyruğundaki işler kişinin vardiyasında, üst üste binmeden dizilir; yer kişidir, makine değil', async () => {
    const r = await coz(kaynak(false), istek({ kisiKuyruklari: [{ kisiId: 7, anahtarlar: ['E-2|10', 'E-3|10'] }] }));
    assert.deepEqual(r.yerlesmeyen, []);
    assert.deepEqual(r.yerlesimler, []);
    const a = yer(r, 'E-2|10'), b = yer(r, 'E-3|10');
    assert.deepEqual([a.kisiId, b.kisiId], [7, 7]);
    assert.equal(Math.min(a.bas, b.bas), Date.parse('2026-10-19T05:00:00Z'));
    assert.ok(a.bit - a.bas >= SAAT && b.bit - b.bas >= SAAT, 'süre rotadaki parça başı süredir');
    assert.ok(a.bit <= b.bas || b.bit <= a.bas, 'aynı kişide üst üste binmez');
  });

  test('aday kişiler verilirse motor işi boş olan kişiye verir', async () => {
    const r = await coz(kaynak(false), istek({
      kisiKuyruklari: [{ kisiId: 7, anahtarlar: ['E-2|10', 'E-3|10'] }],
      kisiAdaylari: [{ anahtar: 'E-2|10', kisiIdler: [7, 8] }, { anahtar: 'E-3|10', kisiIdler: [7, 8] }],
    }));
    const a = yer(r, 'E-2|10'), b = yer(r, 'E-3|10');
    assert.deepEqual(new Set([a.kisiId, b.kisiId]), new Set([7, 8]));
    assert.deepEqual([a.bas, b.bas], [Date.parse('2026-10-19T05:00:00Z'), Date.parse('2026-10-19T05:00:00Z')]);
  });

  test('personel kısıtı açıkken kişi aynı saatte hem baktığı makinede hem el işinde gösterilmez; kapalıyken iki iş birlikte başlar', async () => {
    const i = istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }], kisiKuyruklari: [{ kisiId: 7, anahtarlar: ['E-2|10'] }] });
    const acik = await coz(kaynak(true), i);
    assert.deepEqual(acik.yerlesmeyen, []);
    const m = acik.yerlesimler.find((x) => x.anahtar === 'E-1|10')!, k = yer(acik, 'E-2|10');
    assert.ok(Date.parse(m.bitis) <= k.bas || k.bit <= Date.parse(m.baslangic), `makine ${m.baslangic}-${m.bitis}, el ${k.baslangic}-${k.bitis}`);
    const kapali = await coz(kaynak(false), i);
    assert.equal(kapali.yerlesimler.find((x) => x.anahtar === 'E-1|10')!.baslangic, yer(kapali, 'E-2|10').baslangic);
  });

  test('kişinin sabit işi el tezgâhını o aralıkta doldurur', async () => {
    const r = await coz(kaynak(false), istek({
      kisiKuyruklari: [{ kisiId: 7, anahtarlar: ['E-3|10'] }],
      kisiSabitleri: [{ anahtar: 'E-2|10', kisiId: 7, baslangic: '2026-10-19T05:00:00.000Z', bitis: '2026-10-19T07:00:00.000Z' }],
    }));
    assert.ok(yer(r, 'E-3|10').bas >= Date.parse('2026-10-19T07:00:00Z'));
  });

  test('kişi kuyruğu yokken istek ve sonuç eskisi gibidir', async () => {
    const r = await coz(kaynak(false), istek({ kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] }));
    assert.equal(r.kisiYerlesimleri, undefined);
    assert.equal(r.yerlesimler.length, 1);
  });
});

// Uçtan uca: motor yerleşimi (Reçete ve Rota > Plan) kişi işini kişiye, insanlı istasyonun işini istasyonun kişilerine yerleştirir (1888 b, 1891).
describe('plan (gerçek PostgreSQL): kişi işi motor yerleşiminde (1888 b)', () => {
  const o = planTestOrtami();

  test('kişi kaynaklı adım ve makinesiz istasyondaki adım kişiye yerleşir; adayı olmayan adım nedenini söyler', async () => {
    const { operatorId, merkezId } = o.durum();
    const istasyon = async (kod: string) => (await o.tamam<{ id: number }>(o.c.yonetici, 'POST', '/istasyonlar', { kod, ad: `Deneme ${kod}`, isMerkeziId: merkezId })).id;
    const insanli = await istasyon('RT-EL'), bos = await istasyon('RT-BOS');
    // 1891 A b: insanlı istasyon kapasite kaynağı "insan" olandır; kaynağı boş makinesiz istasyon makine sayılır ve adaysız kalır.
    // Terminal insanlı istasyonda işi istasyonda yetkin kişiye başlatır: aday kişiler yetkinlikten.
    await o.durum().ortam!.sahip.sorgu("UPDATE istasyon SET kapasite_kaynagi = 'insan' WHERE id = $1", [insanli]);
    await o.durum().ortam!.sahip.sorgu("INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, i FROM kisi, unnest($1::int[]) i WHERE ad IN ('Deneme operator', 'Deneme planlama')", [[insanli, bos]]);
    // 1959 a: insanlı istasyonun adayı yalnız kişi vardiyası olan yetkin kişidir; vardiya yalnız birine verilir (öteki vardiyasız kalır).
    await o.durum().ortam!.sahip.sorgu(`INSERT INTO vardiya_kisi (kisi_id, vardiya_id) SELECT k.id, (SELECT min(vardiya_id) FROM vardiya_matrisi WHERE is_merkezi_id = $1)
      FROM kisi k WHERE k.ad = 'Deneme planlama' ON CONFLICT (kisi_id) DO UPDATE SET vardiya_id = EXCLUDED.vardiya_id`, [merkezId]);
    const [kisiIsi, elIsi, adaysiz] = await o.isEmirleriAc([
      o.yeniAdim({ kaynak: { tur: 'kisi', id: operatorId }, ayarSuresiDk: 10, birimSureDk: 1 }),
      o.yeniAdim({ kaynak: { tur: 'istasyon', id: insanli }, ayarSuresiDk: 0, birimSureDk: 2, bilesenler: [] }),
      o.yeniAdim({ kaynak: { tur: 'istasyon', id: bos }, ayarSuresiDk: 0, birimSureDk: 2, bilesenler: [] }),
    ]);
    const [elIsi2] = await o.isEmirleriAc([o.yeniAdim({ kaynak: { tur: 'istasyon', id: insanli }, ayarSuresiDk: 0, birimSureDk: 2 })]);
    const m = await o.tamam<MotorYerlesimiCevabi>(o.c.planlama, 'GET', '/plan/motor-yerlesimi');
    const yeri = (id: number) => m.yerlesimler.find((y) => y.isEmriId === id);
    const k = yeri(kisiIsi!), e = yeri(elIsi!);
    const yetkinler = (await o.vt().tx((db) => db.sorgu<{ id: number }>("SELECT id FROM kisi WHERE ad = 'Deneme planlama'"))).map((x) => x.id);
    assert.deepEqual(k?.kaynak, { tur: 'kisi', id: operatorId }, JSON.stringify(m.yerlesmeyen));
    assert.ok(e?.kaynak.tur === 'kisi' && yetkinler.includes(e.kaynak.id), `istasyonun işi yetkin kişiye: ${JSON.stringify(e?.kaynak)}`);
    assert.equal((Date.parse(k!.bitis) - Date.parse(k!.baslangic)) / 60_000, 20, 'ayar ve parça başı süre rotadandır');
    assert.ok(Date.parse(e!.baslangic) >= Date.parse(k!.bitis), 'ardıl adım öncülünü bekler, aynı kişide üst üste binmez');
    // 1891 B a: insanlı istasyon yetkin ve vardiyalı kişilerin havuzudur; öncülü beklemeyen ikinci iş boş olan kişiye, öteki işle paralel dizilir.
    const e2 = yeri(elIsi2!);
    assert.ok(e2?.kaynak.tur === 'kisi' && yetkinler.includes(e2.kaynak.id), JSON.stringify(m.yerlesmeyen));
    assert.ok(Date.parse(e2!.baslangic) < Date.parse(e!.bitis), `havuzdaki ikinci iş ilkini beklemez: ${e2!.baslangic} / ${e!.baslangic}-${e!.bitis}`);
    if (e2!.kaynak.id === e!.kaynak.id) assert.ok(Date.parse(e2!.bitis) <= Date.parse(e!.baslangic), 'aynı kişide üst üste binmez');
    // 2780: tek ve somut neden, düzeltilecek istasyonla.
    const a = m.yerlesmeyen.find((y) => y.isEmriId === adaysiz);
    assert.deepEqual([a?.neden, a?.nedenKodu, a?.hedef], ['Deneme RT-BOS istasyonunda aktif makine yok.', 'makine-yok', { tur: 'istasyon', id: bos, ad: 'Deneme RT-BOS' }]);
    assert.equal(m.yerlesmeyen.some((y) => /dizilmez/.test(y.neden)), false);
  });

  // 1959 a (1969): yetkin kişilerin hiçbirinin vardiyası yoksa insanlı istasyonun işi vardiyasız kişiye yedek olarak verilmez.
  test('reddedilen: insanlı istasyonda yetkin kişi vardiyasızsa iş yerleşmez ve nedenini söyler', async () => {
    const { merkezId } = o.durum();
    const { id: insanli } = await o.tamam<{ id: number }>(o.c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-VS', ad: 'Deneme RT-VS', isMerkeziId: merkezId });
    await o.durum().ortam!.sahip.sorgu("UPDATE istasyon SET kapasite_kaynagi = 'insan' WHERE id = $1", [insanli]);
    await o.durum().ortam!.sahip.sorgu("INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi WHERE ad = 'Deneme operator'", [insanli]);
    await o.durum().ortam!.sahip.sorgu("DELETE FROM vardiya_kisi WHERE kisi_id IN (SELECT id FROM kisi WHERE ad = 'Deneme operator')");
    const [elIsi] = await o.isEmirleriAc([o.yeniAdim({ kaynak: { tur: 'istasyon', id: insanli }, ayarSuresiDk: 0, birimSureDk: 2 })]);
    const m = await o.tamam<MotorYerlesimiCevabi>(o.c.planlama, 'GET', '/plan/motor-yerlesimi');
    assert.equal(m.yerlesimler.some((y) => y.isEmriId === elIsi), false, JSON.stringify(m.yerlesimler.find((y) => y.isEmriId === elIsi)));
    const y = m.yerlesmeyen.find((x) => x.isEmriId === elIsi);
    assert.deepEqual([y?.neden, y?.nedenKodu, y?.hedef], ['Deneme RT-VS istasyonundaki yetkin kişilerin hiçbirinin vardiyası seçilmemiş.', 'kisi-vardiyasiz', { tur: 'istasyon', id: insanli, ad: 'Deneme RT-VS' }]);
  });
});
