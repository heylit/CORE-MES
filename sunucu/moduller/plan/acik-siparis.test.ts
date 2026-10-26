import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import vm from 'node:vm';
import { TESIS_SAAT_DILIMI } from '#paylasilan/zaman.ts';
import { acikSiparisSatirlari } from './planlama-kurallar.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { motorKodu, type MotorDurumu } from './plan-motoru.ts';

// 525 1 a: satın almanın açık siparişi (kalan miktar, beklenen teslim) plana satın alma satırı olarak girer; katı malzeme kipinde iş
// malzemenin geldiği saatten önce başlamaz. Veriler uydurmadır.
const KAYIT = {
  version: 7, savedAt: 9,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek urun', type: 'mamul' }, { id: '60', code: 'HM-1', name: 'Ornek cubuk', type: 'ham', unit: 'kg', stock: 0 }],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10' }],
  routes: { 50: { base: null, steps: [{ id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 30, cycle: 6, alts: [], altTimes: {}, ins: [{ itemId: '60', qty: 1 }] }] } },
  orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: 10, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'serbest' }],
  cal: { shifts: [{ id: '3', start: '08:00', end: '16:00' }], holidays: [] },
  wcs: [{ id: 'w-atolye', week: { 0: ['3'], 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'], 6: ['3'] } }],
};
const calisma = (D: Record<string, unknown>, mat: string): Record<string, unknown> => ({
  D, rrSavedAt: 9, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat, dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
});
const ELLE = { kod: '60', miktar: 2, gelis: null, tedarikci: 'TD1', no: 'SA-0001' };
const ESKI_SUNUCU = { kod: '60', miktar: 9, gelis: '2026-10-20 08:00', tedarikci: '', no: 'PO-0', sunucu: true };
const D0 = { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], satinalma: [ELLE, ESKI_SUNUCU] };
const kaynak = (acikSiparisler: unknown) => ({ durum: { stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }] }, ek: { acikSiparisler } });
const satinalma = (r: ReturnType<typeof planGirdisi>): unknown => (r?.S['D'] as { satinalma?: unknown }).satinalma;

// Katı kipte malzemenin işe hazır olduğu saat (engine.betik matAlloc): plan başlangıç günü 00:00'dan saat.
function hazir(st: MotorDurumu): number {
  const b = vm.createContext({ GIRDI_SAAT_DILIMI: TESIS_SAAT_DILIMI }); b['self'] = b;
  vm.runInContext(motorKodu(), b, { filename: 'plan-motoru.js' });
  b['durum'] = st;
  return vm.runInContext('compile(stHazirla({ ...durum, w: { ...W0, ...(durum.w || {}) } })).mat.res["O1"].ready', b) as number;
}

describe('açık satın alma siparişi plana', () => {
  test('sunucu satırı her okumada yeniden kurulur, elle verilen sipariş satırı kalır; teslim günü yoksa geliş boştur', () => {
    const r = planGirdisi({ calisma: calisma(D0, 'uyari'), kayit: KAYIT, kaynak: kaynak([
      { kod: '60', miktar: 5, tarih: '2026-10-22', siparisNo: 'PO-1' }, { kod: '60', miktar: 3, tarih: null, siparisNo: 'PO-2' },
    ]) });
    assert.deepEqual(satinalma(r), [
      ELLE,
      { kod: '60', miktar: 5, gelis: '2026-10-22 08:00', tedarikci: '', no: 'PO-1', sunucu: true },
      { kod: '60', miktar: 3, gelis: null, tedarikci: '', no: 'PO-2', sunucu: true },
    ]);
  });

  test('açık sipariş kalmadıysa eski sunucu satırı düşer; hiç sunucu satırı yoksa ve gelmediyse alan değişmez; okunamadıysa (null) kayıttaki kalır', () => {
    assert.deepEqual(satinalma(planGirdisi({ calisma: calisma(D0, 'uyari'), kayit: KAYIT, kaynak: kaynak([]) })), [ELLE]);
    const elleOnly = { ...D0, satinalma: [ELLE] };
    assert.deepEqual(satinalma(planGirdisi({ calisma: calisma(elleOnly, 'uyari'), kayit: KAYIT, kaynak: kaynak([]) })), [ELLE]);
    assert.deepEqual(satinalma(planGirdisi({ calisma: calisma(D0, 'uyari'), kayit: KAYIT, kaynak: kaynak(null) })), [ELLE, ESKI_SUNUCU]);
  });

  test('katı kipte stoğu olmayan malzemeyi bekleyen iş açık siparişin teslim saatinde hazır olur', () => {
    const D = { ...D0, satinalma: [] };
    const r = planGirdisi({ calisma: calisma(D, 'sert'), kayit: KAYIT, kaynak: kaynak([{ kod: '60', miktar: 10, tarih: '2026-10-22', siparisNo: 'PO-1' }]) });
    assert.ok(r);
    // 22 Ekim 08:00 = başlangıçtan 3 gün 8 saat
    assert.equal(hazir(r.st), 3 * 24 + 8);
  });

  test('açık sipariş satırı malzemenin plandaki koduyla gelir; birimi farklı ya da kalanı olmayan satır alınmaz', () => {
    const gelisler = new Map([
      [60, [
        { tarih: '2026-10-22', miktar: '5.5', birim: 'kg', siparisNo: 'PO-1' }, { tarih: null, miktar: '3', birim: 'adet', siparisNo: 'PO-2' },
        { tarih: '2026-10-23', miktar: '0', birim: 'kg', siparisNo: 'PO-3' },
      ]],
      [61, [{ tarih: null, miktar: '2', birim: 'adet', siparisNo: 'PO-4' }]],
    ]);
    assert.deepEqual(acikSiparisSatirlari([{ id: '60', kayitNo: 60, unit: 'kg' }, { id: '61', kayitNo: 61, unit: 'adet' }, { id: '62', kayitNo: 62, unit: 'kg' }], gelisler), [
      { kod: '60', miktar: 5.5, tarih: '2026-10-22', siparisNo: 'PO-1' }, { kod: '61', miktar: 2, tarih: null, siparisNo: 'PO-4' },
    ]);
  });
});
