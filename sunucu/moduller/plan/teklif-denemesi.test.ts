import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';
import { teklifDenemesi, type DenemeIstegi } from './teklif-denemesi.ts';

// Satış teklifi denemesi (Y4): kalemler acil sipariş olarak eklenir, satış taslakları kilitlidir, istenen termin yoksa plan dondurulur.
// İki tezgâh: 100 (ücret 750) ve 101 (ücreti girilmemiş); operatör gerekmez. Başlangıç 2026-10-19 Pazartesi, hafta içi 08:00-16:00. Veriler uydurmadır.

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
// ters: taban terminleri yer değiştirmiş veriyle kurulur (O2 önce); kural bugün O1'i önce alırdı, dondurulmuş deneme sırayı korumalı.
function tabanli(ters = false): Record<string, unknown> {
  const c = calismaKur();
  const kayit = ters ? { ...KAYIT, orders: KAYIT.orders.map((o, i) => ({ ...o, due: KAYIT.orders[1 - i]!.due })) } : KAYIT;
  const g = planGirdisi({ calisma: c, kayit, kaynak: KAYNAK, bugun: '2026-10-19' });
  assert.ok(g);
  const p = motorYukle().schedule(g.st, 'dagit', null);
  return { ...c, plan: { ops: p.ops } };
}
const istek = (ek: Partial<DenemeIstegi>): DenemeIstegi => ({
  calisma: tabanli(), kayit: KAYIT, kaynak: KAYNAK, bugun: '2026-10-19', kalemler: [{ id: 'TK-1', urun: '50', adet: 4 }], termin: null, taslaklar: [], haric: null, tamponGun: 2, ...ek,
});

describe('satış teklifi denemesi (Y4)', () => {
  test('istenen termin yoksa plan dondurulur: başka siparişin bitişi değişmez, kalem arkaya yerleşir ve plan termini çalışma gününe düşer', async () => {
    const r = await teklifDenemesi(istek({}));
    assert.ok(r);
    assert.equal(r.baslangic, '2026-10-19');
    assert.deepEqual(r.kayan, []);
    const k = r.kalemler[0]!;
    assert.equal(k.tamam, true);
    assert.ok(k.bitis !== null && k.planTerminGun !== null);
    // bitiş + 2 gün; Cumartesi ya da Pazar ise Pazartesi (günler başlangıçtan sıra, 0 = Pazartesi)
    const ham = Math.floor((k.bitis + 48) / 24);
    assert.equal(k.planTerminGun, [5, 6].includes(ham % 7) ? ham + (7 - (ham % 7)) : ham);
    assert.equal(k.islemler.length, 1);
    assert.equal(k.islemler[0]?.m, '100');
    assert.equal(k.islemler[0]?.tl, 4 * 0.5 * 750);
    assert.deepEqual(k.kilit, { 'TK-1.10': { m: '100', S: k.islemler[0]?.S } });
    const ters = await teklifDenemesi(istek({ calisma: tabanli(true) }));
    assert.deepEqual(ters?.kayan, []);
    // kısa iş: kural onu uzun işlerin önüne alırdı; dondurulmuş denemede yine arkadadır
    const kisa = await teklifDenemesi(istek({ kalemler: [{ id: 'TK-1', urun: '50', adet: 1 }] }));
    assert.deepEqual(kisa?.kayan, []);
    // aynı kalem yakın terminle istenince atölye yeniden dağıtır ve başka siparişler kayar: dondurma boş sınama değildir
    const yakin = await teklifDenemesi(istek({ termin: '2026-10-19 23:00' }));
    assert.ok((yakin?.kayan.length ?? 0) > 0);
    assert.equal(yakin?.kalemler[0]?.ulasir, true);
  });

  test('kilitli satış taslağı yerinde kalır; düzenlenen taslak denemeye girmez', async () => {
    const yer = { 'ST-1-1.10': { m: '100', S: 10 * 24 + 8 } };
    const taslak = { id: 'ST-1', kalemler: [{ id: 'ST-1-1', urun: '50', adet: 4, termin: '2026-11-06 23:00' }], yerlesim: yer };
    const r = await teklifDenemesi(istek({ termin: '2026-10-22 23:00', taslaklar: [taslak] }));
    assert.ok(r);
    assert.deepEqual(r.taslakYeri, yer);
    const r2 = await teklifDenemesi(istek({ termin: '2026-10-22 23:00', taslaklar: [taslak], haric: 'ST-1' }));
    assert.deepEqual(r2?.taslakYeri, {});
  });

  test('eksik hammaddeli kalem karttaki tedarik süresiyle farazi satın almayla yerleşir', async () => {
    // stok 100 kg; O1 ve O2 52 kg kullanır, 30 adetlik teklif 60 kg ister: 12 kg eksik, tedarik 5 gün
    const r = await teklifDenemesi(istek({ kalemler: [{ id: 'TK-1', urun: '50', adet: 30 }] }));
    const k = r?.kalemler[0];
    assert.ok(k?.tamam);
    assert.equal(k.satinalma.length, 1);
    assert.deepEqual({ ...k.satinalma[0], miktar: Math.round(k.satinalma[0]!.miktar) }, { kod: 'H1', birim: 'kg', miktar: 12, gelis: r!.simdi + 5 * 24, gun: 5 });
    assert.ok((k.islemler[0]?.S ?? 0) >= r!.simdi + 5 * 24);
  });

  test('ücreti girilmemiş tezgâhta işlemin TL si null, eksik listesinde yazar; sıfır sayılmaz', async () => {
    const r = await teklifDenemesi(istek({ kalemler: [{ id: 'TK-1', urun: '60', adet: 2 }] }));
    const k = r?.kalemler[0];
    assert.ok(k?.tamam);
    assert.equal(k.islemler[0]?.m, '101');
    assert.equal(k.islemler[0]?.tl, null);
    assert.ok(k.eksik.includes('101 saat ücreti'));
    assert.ok(k.eksik.includes('reçetede hammadde yok'));
  });

  test('plan şeridi: pencere şimdiden max(termin, geçerlilik) + 2 günün sonuna; kapalı günler, tezgâhlar sırayla ve blok türleri döner', async () => {
    // termin yok: pencerenin sonu kalemin plan termini ile geçerliliğin büyüğü (2026-11-06 = gün 18) + 2 gün
    const r = await teklifDenemesi(istek({ gecerlilik: '2026-11-06' }));
    const k = r?.kalemler[0];
    assert.ok(r?.plan && k?.planTerminGun != null);
    assert.equal(r.plan.bas, r.simdi);
    assert.equal(r.plan.bit, (Math.max(18, k.planTerminGun) + 3) * 24);
    for (const g of ['2026-10-24', '2026-10-25', '2026-10-31', '2026-11-01']) assert.ok(r.plan.kapaliGunler.includes(g), g);
    assert.ok(!r.plan.kapaliGunler.includes('2026-10-20'));
    assert.deepEqual(r.plan.hatlar.map((h) => [h.m, h.fason]), [['100', false], ['101', false]]);
    const teklif = r.plan.bloklar.filter((b) => b.tur === 'teklif');
    assert.deepEqual(teklif.map((b) => [b.is, b.kalem, b.adim, b.m, b.S, b.C]), [['teklif', 1, '10', '100', k.islemler[0]?.S, k.islemler[0]?.C]]);
    const siparis = r.plan.bloklar.filter((b) => b.tur === 'siparis');
    assert.deepEqual([...new Set(siparis.map((b) => b.is))].sort(), ['O1', 'O2']);
    assert.ok(siparis.every((b) => b.kalem === null && !b.gecikir));
    assert.ok(r.plan.bloklar.every((b) => b.C > r.plan!.bas && b.S < r.plan!.bit));
  });

  test('plan şeridi: pencere dışındaki blok verilmez; satış taslağı bloğu taslak kimliği ve kalem sırasıyla gelir', async () => {
    const yer = { 'ST-1-1.10': { m: '100', S: 10 * 24 + 8 } };
    const taslak = { id: 'ST-1', kalemler: [{ id: 'ST-1-1', urun: '50', adet: 4, termin: '2026-11-06 23:00' }], yerlesim: yer };
    // termin 2026-10-22 (gün 3), geçerlilik yok: pencere gün 5 sonunda biter, gün 10'daki taslak dışarıda kalır
    const kisa = await teklifDenemesi(istek({ termin: '2026-10-22 23:00', taslaklar: [taslak] }));
    assert.equal(kisa?.plan?.bit, 6 * 24);
    assert.ok(!kisa.plan.bloklar.some((b) => b.tur === 'satis-taslagi'));
    const uzun = await teklifDenemesi(istek({ termin: '2026-10-22 23:00', taslaklar: [taslak], gecerlilik: '2026-11-06' }));
    assert.deepEqual(uzun?.plan?.bloklar.filter((b) => b.tur === 'satis-taslagi').map((b) => [b.is, b.kalem, b.adim, b.m, b.S]), [['ST-1', 1, '10', '100', 10 * 24 + 8]]);
  });

  test('plan şeridi: termini geçen sipariş gecikir diye işaretlenir', async () => {
    // O1 başlangıç günü 17:00'de bitmeli ama 40 adet 20 saat işler: hiçbir yerleşim ona ulaşamaz
    const kayit = { ...KAYIT, orders: KAYIT.orders.map((o) => (o.id === 'O1' ? { ...o, qty: 40, due: '2026-10-19' } : o)) };
    const r = await teklifDenemesi(istek({ calisma: calismaKur(), kayit, gecerlilik: '2026-11-06' }));
    const bloklar = r?.plan?.bloklar ?? [];
    assert.ok(bloklar.some((b) => b.is === 'O1'));
    assert.ok(bloklar.filter((b) => b.is === 'O1').every((b) => b.gecikir));
    assert.ok(bloklar.filter((b) => b.is === 'O2').every((b) => !b.gecikir));
  });

  test('çalışma yoksa null; süre aşılırsa reddedilir', async () => {
    assert.equal(await teklifDenemesi(istek({ calisma: null })), null);
    await assert.rejects(teklifDenemesi(istek({}), 1), /ms içinde bitmedi/);
  });
});
