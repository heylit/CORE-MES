import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { degerlendirmeSonucu, type DegerlendirmeIstegi } from '#paylasilan/sozlesme/planlama.ts';
import { degerlendirmeYap } from './degerlendirme.ts';

// 3369: plan kaydı emrin malzemesinin nereden karşılandığını taşır (stoktan, siparişten, siparişi verilmemiş, eksik). Sipariş numarası ve
// tedarikçi adı kayda girmez; sipariş Satın Alma satırının anahtarıyla anılır. Veriler uydurmadır.
const tezgah = (id: string): Record<string, unknown> => ({ id, ad: id, grup: '10', ucret: 750, verim: 1, vardiyalar: ['3'], opOran: 0 });
const kayit = (stok: number) => ({
  version: 7, savedAt: 9,
  items: [
    { id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul' },
    { id: 'H1', code: 'H1', name: 'Ornek cubuk', type: 'ham', unit: 'kg', cost: 10, stock: stok, plan: { kod: 'H1', ad: 'Ornek cubuk', birim: 'kg', stok, birimFiyat: 10, tedarikGun: 5, muayeneGun: 0 } },
  ],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', plan: tezgah('100') }],
  routes: { 50: { base: null, steps: [{ id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [{ id: 'n1', itemId: 'H1', qty: 2 }] }] } },
  orders: [
    { id: 'O1', no: 'E-1', itemId: '50', qty: 10, start: '2026-10-19', due: '2026-10-20', priority: 2, status: 'serbest' },
    { id: 'O2', no: 'E-2', itemId: '50', qty: 16, start: '2026-10-19', due: '2026-10-21', priority: 2, status: 'serbest' },
  ],
});
const kaynak = (acikSiparisler: unknown, mrpEksikleri?: unknown) => ({
  durum: {
    wcs: [{ id: '1', code: 'IM-1', name: 'Talasli', week: null, aktif: true }],
    stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
    machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }],
    people: [],
    cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
  },
  ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null, acikSiparisler, ...(mrpEksikleri === undefined ? {} : { mrpEksikleri }) },
});
const calisma = (mat: string): Record<string, unknown> => ({
  surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat, dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
});
const AN = Date.parse('2026-10-19T06:00:00Z');
interface Pay { tur: string; kim?: number; q: number; gelis: number | null; tb: number }
interface Mal { kod: string; adim: string | null; need: number; t: number | null; stok: number; eksik: number; pay: Pay[] }
async function kur(stok: number, acik: unknown, mrp?: unknown, mat = 'karma', istek: DegerlendirmeIstegi = { tur: 'plan-kur' }): Promise<{ mal: Record<string, Mal[]>; ham: string; ops: Record<string, { S: number }> }> {
  const r = await degerlendirmeYap({ calisma: calisma(mat), kayit: kayit(stok), kaynak: kaynak(acik, mrp), bugun: '2026-10-19', istek }, AN);
  assert.ok(r && !('hata' in r), JSON.stringify(r));
  const s = degerlendirmeSonucu.parse(r.sonuc);
  assert.equal(s.tur, 'plan-kur');
  const plan = (s as unknown as { plan: { mal: Record<string, Mal[]>; ops: Record<string, { S: number }> } }).plan;
  return { mal: plan.mal, ham: JSON.stringify(r), ops: plan.ops };
}
const SIPARIS = { kod: 'H1', miktar: 15, tarih: '2026-10-22', siparisNo: 'ORN-SA-7', satir: 7001, tedarikci: 'Deneme Tedarikci' };

describe('plan kaydında emrin malzeme payı (3369)', () => {
  test('stok öncelik sırasıyla dağılır; kalan siparişten, sipariş de yetmezse siparişi verilmemiş satırdan karşılanır', async () => {
    const { mal } = await kur(30, [SIPARIS]);
    // O1: 10 adet x 2 kg = 20 kg, hepsi stoktan. O2: 32 kg = 10 stok + 15 sipariş + 7 siparişi verilmemiş.
    assert.deepEqual(mal['O1'], [{ kod: 'H1', adim: '10', need: 20, t: mal['O1']![0]!.t, stok: 20, eksik: 0, pay: [] }]);
    const o2 = mal['O2']![0]!;
    assert.deepEqual({ need: o2.need, stok: o2.stok, eksik: o2.eksik }, { need: 32, stok: 10, eksik: 0 });
    const sa = o2.pay.find((p) => p.tur === 'sa')!, yok = o2.pay.find((p) => p.tur === 'yok')!;
    assert.equal(o2.pay.length, 2);
    assert.deepEqual([sa.kim, sa.q, sa.tb], [7001, 15, 0]);
    assert.deepEqual(['kim' in yok, yok.q, yok.tb], [false, 7, 1]);
    // 22 Ekim 08:00 = başlangıçtan 3 gün 8 saat
    assert.equal(sa.gelis, 3 * 24 + 8);
    assert.equal(o2.stok + o2.pay.reduce((a, p) => a + p.q, 0) + o2.eksik, o2.need, 'paylar ihtiyacı tam böler');
  });

  test('sipariş numarası ve tedarikçi adı plan kaydına da çalışmaya da yazılmaz', async () => {
    const { ham, mal } = await kur(30, [SIPARIS]);
    assert.equal(ham.includes('Deneme Tedarikci'), false);
    assert.equal(JSON.stringify(mal).includes('ORN-SA-7'), false);
  });

  test('teslim günü girilmemiş sipariş: pay termini bekleniyor (tb) işaretlidir, plan işi bekletmez', async () => {
    const { mal, ops } = await kur(0, [{ ...SIPARIS, miktar: 60, tarih: null }]);
    const o1 = mal['O1']![0]!;
    assert.deepEqual(o1.pay.map((p) => [p.tur, p.kim, p.q, p.tb]), [['sa', 7001, 20, 1]]);
    assert.equal(o1.stok, 0);
    assert.equal(typeof o1.pay[0]!.gelis, 'number');
    assert.ok(ops['O1.10']!.S < 24, 'iş ilk gün başlar');
  });

  test('teslim günü girilmiş siparişi bekleyen adım gelişten önce başlamaz; payın anı adımın başlangıcıdır', async () => {
    const { mal, ops } = await kur(0, [{ ...SIPARIS, miktar: 60 }]);
    const o1 = mal['O1']![0]!;
    assert.equal(o1.t, 3 * 24 + 8);
    assert.ok(ops['O1.10']!.S >= 3 * 24 + 8 - 1e-9);
  });

  test('satın alma okunamadıysa (null) ve stok yoksa bütün ihtiyaç siparişi verilmemiş paydır', async () => {
    const { mal } = await kur(0, null);
    assert.deepEqual(mal['O1']![0]!.pay.map((p) => [p.tur, p.q]), [['yok', 20]]);
    assert.equal(mal['O1']![0]!.stok, 0);
  });

  test('anahtarsız gelen (eski) sipariş satırı anahtarsız pay olur', async () => {
    const { mal } = await kur(0, [{ kod: 'H1', miktar: 60, tarih: '2026-10-22', siparisNo: 'ORN-SA-8' }]);
    assert.deepEqual(mal['O1']![0]!.pay.map((p) => [p.tur, 'kim' in p, p.q]), [['sa', false, 20]]);
  });

  test('eksiği hesaplanamayan malzemede (siparişi verilmemiş satır yazılmaz) karşılanmayan miktar eksik alanındadır', async () => {
    const { mal } = await kur(5, [], [{ kod: 'H1', eksik: null }]);
    const o1 = mal['O1']![0]!;
    assert.deepEqual({ need: o1.need, stok: o1.stok, eksik: o1.eksik, pay: o1.pay, t: o1.t }, { need: 20, stok: 5, eksik: 15, pay: [], t: null });
  });
});
