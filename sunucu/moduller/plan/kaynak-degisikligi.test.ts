import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { KAYNAK_FARKI_EN_COK, kaynakDegisikligi } from '#paylasilan/sozlesme/planlama.ts';
import { planGirdisi } from './plan-girdisi.ts';

// 1962 / 1963 a: birleşme başka sayfadaki değişikliği bulup planı eskitince neyin değiştiği cevaba girer; eskitmeyince null. Betik değişmez,
// sarmalama plan-girdisi.ts'tedir. Veriler uydurmadır.

const KAYIT = {
  version: 7, savedAt: 9,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek urun', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10' }],
  routes: { 50: { base: null, steps: [{ id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 30, cycle: 6, alts: [], altTimes: {}, ins: [] }] } },
  orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: 10, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'uretimde' }],
  cal: { shifts: [{ id: '3', start: '08:00', end: '16:00' }], holidays: [] },
  wcs: [{ id: 'w-atolye', week: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }],
};
const D0 = { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [] };
const ILK = {
  D: D0, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'uyari', dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
};
interface Makine { id: string; code: string; name: string; stationId: string; status: string; aktif: boolean }
const makine = (i: number, ad = `Torna ${String(i)}`, status = 'aktif'): Makine => ({ id: String(100 + i), code: `T${String(i)}`, name: ad, stationId: '10', status, aktif: true });
const kaynak = (makineler: Makine[] = [makine(0)]) => ({
  durum: { stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }], machines: makineler },
  ek: null,
});
const oku = (calisma: unknown, k = kaynak(), kayit: unknown = KAYIT) => planGirdisi({ calisma, kayit, kaynak: k, bugun: '2026-10-19' })!;

// Açılıştaki çalışma bir kez sunucu birleşmesinden ve eski öncelik geçişinden geçmiştir (sayfanın kaydettiği hâl).
function oturmus(k = kaynak()): Record<string, unknown> {
  let S = oku(ILK, k).S;
  for (let i = 0; i < 3; i++) S = oku(S, k).S;
  return S;
}

describe('kaynak değişikliği (1962)', () => {
  test('aynı veriyle yeniden okuma planı eskitmez: değişiklik null', () => {
    const S = oturmus();
    const r = oku(S);
    assert.equal(r.kaynakDegisikligi, null);
    assert.equal(r.S.dataVer, S.dataVer);
  });

  test('yeni tezgâh tezgâhlar alanı ve farkıyla gelir; sözleşmeden geçer', () => {
    const S = oturmus();
    const r = oku(S, kaynak([makine(0), makine(1)]));
    assert.ok(r.kaynakDegisikligi);
    assert.ok(r.kaynakDegisikligi.alanlar.includes('tezgahlar'));
    assert.ok(r.kaynakDegisikligi.farklar.some((f) => f.yol === 'tezgahlar.length' && f.eski === 1 && f.yeni === 2), JSON.stringify(r.kaynakDegisikligi));
    assert.equal(r.kaynakDegisikligi.kesik, false);
    assert.doesNotThrow(() => kaynakDegisikligi.parse(r.kaynakDegisikligi));
    assert.ok(Number(r.S.dataVer) > Number(S.dataVer));
  });

  test('makine arızaya geçince arıza alanı gelir', () => {
    const S = oturmus();
    const r = oku(S, kaynak([makine(0, 'Torna 0', 'ariza')]));
    assert.ok(r.kaynakDegisikligi?.alanlar.includes('ariza'), JSON.stringify(r.kaynakDegisikligi));
  });

  test('Reçete ve Rota kaydının yeni sürümü kayıt alanıyla gelir', () => {
    const S = oturmus();
    const yeniKayit = { ...KAYIT, savedAt: 11, orders: [...KAYIT.orders, { id: 'O2', no: 'E-2', itemId: '50', qty: 4, start: '2026-10-19', due: '2026-10-31', priority: 2, status: 'serbest' }] };
    const r = oku(S, kaynak(), yeniKayit);
    assert.ok(r.kaynakDegisikligi?.alanlar.includes('receteRotaKaydi'), JSON.stringify(r.kaynakDegisikligi));
  });

  test('fark sınırı aşılınca en çok 50 fark döner ve kesik işaretlenir', () => {
    const cok = Array.from({ length: KAYNAK_FARKI_EN_COK + 10 }, (_, i) => makine(i));
    const S = oturmus(kaynak(cok));
    const r = oku(S, kaynak(cok.map((m) => ({ ...m, code: `Y${m.code}` }))));
    assert.ok(r.kaynakDegisikligi, 'değişiklik bekleniyordu');
    assert.equal(r.kaynakDegisikligi.farklar.length, KAYNAK_FARKI_EN_COK);
    assert.equal(r.kaynakDegisikligi.kesik, true);
  });

  test('B-2499-1: yalnız Satın Alma termin satırının sürümü artınca plan eskimez, sürüm yine yenilenir', () => {
    const KAYIT2 = { ...KAYIT, items: [...KAYIT.items, { id: '60', code: 'HM-1', name: 'Ornek cubuk', type: 'ham', unit: 'kg' }] };
    const k = (surum: number, termin: string | null = null) => ({ ...kaynak(), ek: { tedarikTerminleri: [{ kod: '60', termin, surum, aciklama: null }] } });
    let S = oku(ILK, k(1), KAYIT2).S;
    for (let i = 0; i < 3; i++) S = oku(S, k(1), KAYIT2).S;
    const malzeme = (x: Record<string, unknown>) => ((x['D'] as { malzemeler: { kod: string; saSurum?: number }[] }).malzemeler).find((m) => m.kod === '60');
    assert.equal(malzeme(S)?.saSurum, 1, JSON.stringify((S['D'] as { malzemeler: unknown }).malzemeler));
    const r = oku(S, k(2), KAYIT2);
    assert.equal(r.kaynakDegisikligi, null, JSON.stringify(r.kaynakDegisikligi));
    assert.equal(r.S['dataVer'], S['dataVer']);
    assert.equal(malzeme(r.S)?.saSurum, 2, 'ekran termin yazarken güncel sürümü gönderir');
    const t = oku(S, k(2, '2026-10-25'), KAYIT2);
    assert.ok(t.kaynakDegisikligi?.alanlar.includes('malzemeler'), 'termin değişince plan yine eskir');
  });

  test('girdi değişmez', () => {
    const S = oturmus();
    const once = JSON.stringify(S);
    oku(S, kaynak([makine(0), makine(1)]));
    assert.equal(JSON.stringify(S), once);
  });
});
