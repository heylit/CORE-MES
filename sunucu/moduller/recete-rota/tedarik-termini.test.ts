import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import vm from 'node:vm';
import { TESIS_SAAT_DILIMI } from '#paylasilan/zaman.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { motorKodu, type MotorDurumu } from './plan-motoru.ts';

// 533 a: malzemenin tedarik termini Satın Alma'dandır; plan girilen termini kesinleşen geliş sayar, geç kalırsa katı kipte iş bekler.
// Veriler uydurmadır.
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
const calisma = (D: Record<string, unknown>, mat = 'sert'): Record<string, unknown> => ({
  D, rrSavedAt: 9, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat, dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
});
const D0 = { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], satinalma: [] };
const kaynak = (tedarikTerminleri: unknown) => ({ durum: { stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }] }, ek: { acikSiparisler: [], tedarikTerminleri } });
const malzeme = (r: ReturnType<typeof planGirdisi>): Record<string, unknown> | undefined =>
  (r?.S['D'] as { malzemeler: Record<string, unknown>[] }).malzemeler.find((m) => m['kod'] === '60');

function hazir(st: MotorDurumu): number {
  const b = vm.createContext({ GIRDI_SAAT_DILIMI: TESIS_SAAT_DILIMI }); b['self'] = b;
  vm.runInContext(motorKodu(), b, { filename: 'plan-motoru.js' });
  b['durum'] = st;
  return vm.runInContext('compile(stHazirla({ ...durum, w: { ...W0, ...(durum.w || {}) } })).mat.res["O1"].ready', b) as number;
}

describe('tedarik termini plana', () => {
  test('termin ve sürümü malzemeye yazılır; okunamadıysa açık çalışmadaki kalır; satırı kalkan malzemede alan düşer', () => {
    const r = planGirdisi({ calisma: calisma(D0), kayit: KAYIT, kaynak: kaynak([{ kod: '60', termin: '2026-10-24', surum: 3, aciklama: 'Deneme not' }]) });
    assert.deepEqual([malzeme(r)?.['saTermin'], malzeme(r)?.['saSurum'], malzeme(r)?.['saAciklama']], ['2026-10-24', 3, 'Deneme not']);
    const D1 = r?.S['D'] as Record<string, unknown>;
    const okunamadi = planGirdisi({ calisma: calisma(D1), kayit: KAYIT, kaynak: kaynak(null) });
    assert.deepEqual([malzeme(okunamadi)?.['saTermin'], malzeme(okunamadi)?.['saSurum']], ['2026-10-24', 3]);
    const kalkti = planGirdisi({ calisma: calisma(D1), kayit: KAYIT, kaynak: kaynak([]) });
    assert.deepEqual([malzeme(kalkti)?.['saTermin'], malzeme(kalkti)?.['saSurum']], [undefined, undefined]);
    const silindi = planGirdisi({ calisma: calisma(D1), kayit: KAYIT, kaynak: kaynak([{ kod: '60', termin: null, surum: 4, aciklama: '' }]) });
    assert.deepEqual([malzeme(silindi)?.['saTermin'], malzeme(silindi)?.['saSurum']], [null, 4]);
  });

  test('katı kipte stoğu olmayan malzemeyi bekleyen iş girilen terminin 08:00 inde hazır olur', () => {
    const r = planGirdisi({ calisma: calisma(D0), kayit: KAYIT, kaynak: kaynak([{ kod: '60', termin: '2026-10-24', surum: 1, aciklama: '' }]) });
    assert.ok(r);
    // 24 Ekim 08:00 = başlangıçtan 5 gün 8 saat
    assert.equal(hazir(r.st), 5 * 24 + 8);
  });

  test('termin teslim günü olmayan açık siparişe de uygulanır; teslim günü olan sipariş kendi günüyle kalır', () => {
    const D = { ...D0, satinalma: [{ kod: '60', miktar: 4, gelis: '2026-10-21 08:00', tedarikci: '', no: 'PO-1' }, { kod: '60', miktar: 6, gelis: null, tedarikci: '', no: 'PO-2' }] };
    const r = planGirdisi({ calisma: calisma(D), kayit: KAYIT, kaynak: { ...kaynak([{ kod: '60', termin: '2026-10-24', surum: 1, aciklama: '' }]), ek: { acikSiparisler: null, tedarikTerminleri: [{ kod: '60', termin: '2026-10-24', surum: 1, aciklama: '' }] } } });
    assert.ok(r);
    const sa = (r.st as unknown as { D: { satinalma: { no?: string; gelis: string; tm?: string }[] } }).D.satinalma;
    assert.deepEqual(sa.map((p) => [p.no, p.gelis, p.tm ?? null]), [['PO-1', '2026-10-21 08:00', null], ['PO-2', '2026-10-24 08:00', 'sa-termin']]);
    assert.equal(hazir(r.st), 5 * 24 + 8);
  });
});
