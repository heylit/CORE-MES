import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';

// 13.1: emir, ürün ve rotanın sahibi Üretim Emirleri, Malzemeler ve Rota'dır; planlama sayfası (girdiKur) kaynak okumasındakileri kaydın
// üstüne koyar, sonradan açılan emir plana girer. Kayıtta bağlanmadan önceki yerel emir kalır. Veriler uydurmadır.

const KAYIT = {
  version: 7, savedAt: 9,
  items: [{ id: '40', code: 'ESKI', name: 'Eski yerel urun', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10' }],
  routes: { 40: { base: null, steps: [{ id: '40-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 0, cycle: 5, alts: [], altTimes: {}, ins: [] }] } },
  orders: [{ id: 'L1', no: 'YEREL-1', itemId: '40', qty: 5, start: '2026-10-19', due: '2026-10-30', priority: 1, status: 'serbest' }],
};
const D0 = {
  meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [],
  // planlamacının sayfada verdiği gelir aynı kimlikli emirde korunur
  siparisler: [{ id: '7', urun: '50', adet: 10, termin: '2026-10-30 12:00', serbest: null, oncelik: 2, ad: 'UE-7', gelir: 500, cezaGun: null, malzeme: [] }],
};
// çalışma kaydı okumasıyla aynı: kayıt değişmedi, kaynaklar yalnız kaynakBirlestir'den girer
const calisma = (D: Record<string, unknown>): Record<string, unknown> => ({
  D, rrSavedAt: 9, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'uyari', dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
});
const emir = (id: string, no: string, status: string) => ({ id, no, itemId: '50', qty: 10, start: '2026-10-19', due: '2026-10-30', priority: 2, note: '', status });
const durum = (emirler: unknown) => ({
  stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }],
  items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul', unit: 'adet', stock: 0 }],
  opdefs: [{ id: '13', code: 'TOR', name: 'Tornalama' }],
  routes: { 50: { steps: [{ id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 30, cycle: 6, alts: [], altTimes: {}, ins: [] }] } },
  routeRevs: [{ id: '1', itemId: '50', status: 'yururlukte' }],
  emirler,
});
type Siparis = { id: string; urun: string; gelir?: number; havuz?: boolean };
type Sonuc = { S: { D: { siparisler: Siparis[]; urunler: Array<{ id: string }> } }; st: { D: { siparisler: Siparis[] } } };
const kur = (D: Record<string, unknown>, emirler: unknown): Sonuc =>
  planGirdisi({ calisma: calisma(D), kayit: KAYIT, kaynak: { durum: durum(emirler), ek: null }, bugun: '2026-10-19' }) as unknown as Sonuc;

describe('plan girdisi: sunucunun emirleri (13.1)', () => {
  test('sonradan açılan emir plana girer; yerel emir girmez; biten ve iptal emir çalışmada kalır, motora girmez; sayfadaki emir ayarı korunur', () => {
    const r = kur(D0, { orders: [emir('7', 'UE-7', 'serbest'), emir('8', 'UE-8', 'serbest'), emir('9', 'UE-9', 'tamam'), emir('10', 'UE-10', 'iptal')] });
    assert.deepEqual(r.S.D.siparisler.map((s) => s.id), ['7', '8', '9', '10']);
    assert.deepEqual(r.S.D.urunler.map((u) => u.id), ['50']);
    assert.equal(r.S.D.siparisler[0]?.gelir, 500);
    assert.deepEqual(r.st.D.siparisler.map((s) => s.id), ['7', '8']);
    assert.ok((motorYukle().compile(r.st as never) as { ops: Array<{ id: string }> }).ops.some((o) => o.id === '8.10'));
  });

  test('taslak emir havuzdadır: çalışmada durur, motor görmez', () => {
    const r = kur(D0, { orders: [emir('7', 'UE-7', 'serbest'), emir('8', 'UE-8', 'taslak')] });
    assert.deepEqual(r.S.D.siparisler.map((s) => [s.id, !!s.havuz]), [['7', false], ['8', true]]);
    assert.deepEqual(r.st.D.siparisler.map((s) => s.id), ['7']);
  });

  test('aynı okuma ikinci açılışta çalışmayı değiştirmez', () => {
    const emirler = { orders: [emir('7', 'UE-7', 'serbest'), emir('8', 'UE-8', 'serbest')] };
    const ilk = kur(D0, emirler);
    const ikinci = kur(ilk.S.D as unknown as Record<string, unknown>, emirler);
    assert.deepEqual(ikinci.S.D, ilk.S.D);
  });

  test('emir okunamazsa (yetki yok) kayıttaki emirler kalır', () => {
    const r = planGirdisi({ calisma: calisma({ ...D0, siparisler: [] }), kayit: KAYIT, kaynak: { durum: { ...durum(null), items: null, routes: null, routeRevs: null }, ek: null }, bugun: '2026-10-19' }) as unknown as Sonuc;
    assert.deepEqual(r.S.D.siparisler.map((s) => s.id), ['L1']);
  });

  // 13.4: onaylı izin (kapasite okumasının izinli günleri) motorda devamsızlıktır; elle girilen kalır, sunucununki her okumada yeniden kurulur
  test('onaylı izin devamsızlık olur; elle girilen devamsızlık korunur; izin kalkınca sunucunun satırı düşer', () => {
    const elle = { personel: '5', gun: '2026-10-21' };
    const ek = (izinli: string[]) => ({ takvim: null, kapasite: { kisiler: [{ id: '5', izinli, fazlaMesai: [], paylar: [] }, { id: '6', izinli: ['2026-10-21'], fazlaMesai: [], paylar: [] }] } });
    const kur2 = (D: Record<string, unknown>, izinli: string[]) => planGirdisi({ calisma: calisma(D), kayit: KAYIT, kaynak: { durum: durum({ orders: [] }), ek: ek(izinli) }, bugun: '2026-10-19' }) as unknown as
      { S: { D: Record<string, unknown> & { devamsizlik: unknown[] } } };
    const r = kur2({ ...D0, devamsizlik: [elle] }, ['2026-10-21', '2026-10-22']);
    assert.deepEqual(r.S.D.devamsizlik, [elle, { personel: '5', gun: '2026-10-22', sunucu: true }, { personel: '6', gun: '2026-10-21', sunucu: true }]);
    assert.deepEqual(kur2(r.S.D, ['2026-10-21', '2026-10-22']).S.D, r.S.D);
    assert.deepEqual(kur2(r.S.D, []).S.D.devamsizlik, [elle, { personel: '6', gun: '2026-10-21', sunucu: true }]);
  });
});
