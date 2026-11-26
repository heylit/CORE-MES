import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { degerlendirmeSonucu } from '#paylasilan/sozlesme/planlama.ts';
import { degerlendirmeYap } from './degerlendirme.ts';

// 3734: bölünmüş adımda her pay kendi adedi x miktar kadar malzemeyi pay sırasıyla ve gelişler sırasıyla alır; payın hazır anı kendi
// kullandığı gelişlerin en geçidir. Bölünmemiş adım bütün satırı bekler (bugünkü kural). Veriler uydurmadır. Eksen: 19.10 00:00 = 0 saat;
// tezgâhlar 08:00-16:00, adet başına 30 dk, OP 10 için 1 kg ham; sipariş geldiği günün 08:00'inde hazırdır.
const makine = (id: string, istasyon: string) => ({ id, code: `T${id}`, name: `Tezgah ${id}`, stationId: istasyon, status: 'aktif', aktif: true });
const istasyon = (id: string) => ({ id, code: `S${id}`, name: `Istasyon ${id}`, wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true });
const adim = (seq: number, stationId: string, ins: { id: string; itemId: string; qty: number }[] = []) => ({
  id: `50-o${String(seq)}`, seq, opNo: seq, opId: '13', stationId, setup: 0, cycle: 30, alts: [], altTimes: {}, ins, split: 'tek', minLot: 0,
});
const rota = (stok: number) => ({
  items: [
    { id: '50', code: 'MM-1', name: 'Ornek govde', type: 'mamul', unit: 'ad', stock: 0 },
    { id: 'H1', code: 'H1', name: 'Ornek cubuk', type: 'ham', unit: 'kg', cost: 10, stock: stok, plan: { kod: 'H1', ad: 'Ornek cubuk', birim: 'kg', stok, birimFiyat: 10, tedarikGun: 5, muayeneGun: 0 } },
  ],
  routes: { 50: { base: null, steps: [adim(10, '10', [{ id: 'n1', itemId: 'H1', qty: 1 }]), adim(20, '30')] } },
  routeRevs: [{ id: '7', itemId: '50', no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: [] } }],
});
const kayit = (adet: number, stok: number) => ({
  version: 7, savedAt: 9, ...rota(stok), opdefs: [{ id: '13', name: 'Tornalama' }], machines: [],
  orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: adet, start: '2026-10-19', due: '2026-11-30', priority: 1, status: 'serbest' }],
});
const siparis = (satir: number, miktar: number, tarih: string) => ({ kod: 'H1', miktar, tarih, siparisNo: `ORN-SA-${String(satir)}`, satir, tedarikci: 'ORN-Tedarikci' });
const kaynak = (stok: number, acikSiparisler: unknown[]) => ({
  durum: {
    ...rota(stok),
    wcs: [{ id: '1', code: 'IM-1', name: 'Talasli', week: null, aktif: true }],
    stations: [istasyon('10'), istasyon('30')],
    machines: [makine('100', '10'), makine('101', '10'), makine('300', '30')],
    people: [],
    cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
  },
  ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'], 6: ['3'], 7: ['3'] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null, acikSiparisler },
});
type Elle = Record<string, { adet: number; m: string }[]>;
const calisma = (mat: string, elleBol: Elle | null, kapali: string[]) => ({
  surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  rrSavedAt: 5, dataVer: 1, kisitSurum: 2, down: [], ekMesai: [], locks: {}, gercek: {}, ...(elleBol ? { elleBol } : {}), w: { famK: 0.3, mat, dondurma: 0, rule: 'edd' },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali, olaylar: [], plan: null,
});
const AN = Date.parse('2026-10-19T05:00:00Z');
type Op = { S: number; C: number; m: string };
async function plan(g: { adet: number; stok: number; siparisler: unknown[]; elleBol: Elle | null; kapali?: string[] }): Promise<Record<string, Op>> {
  const r = await degerlendirmeYap({ calisma: calisma('sert', g.elleBol, g.kapali ?? ['personel']), kayit: kayit(g.adet, g.stok), kaynak: kaynak(g.stok, g.siparisler), bugun: '2026-10-19', istek: { tur: 'plan-kur' } }, AN);
  assert.ok(r && !('hata' in r), JSON.stringify(r));
  const s = degerlendirmeSonucu.parse(r.sonuc);
  assert.equal(s.tur, 'plan-kur');
  return (s as unknown as { plan: { ops: Record<string, Op> } }).plan.ops;
}
// Stok 2, yakın sipariş 8 (20.10), uzak sipariş 20 (26.10): 30 adet 10 + 20 bölünür.
const ELLE: Elle = { 'O1.10': [{ adet: 10, m: '100' }, { adet: 20, m: '101' }] };
const SIPARISLER = [siparis(1, 8, '2026-10-20'), siparis(2, 20, '2026-10-26')];
const YAKIN = 24 + 8, UZAK = 7 * 24 + 8;

describe('plan motoru: bölünmüş adımda pay başına malzeme (3734)', () => {
  test('1. pay stok ve yakın siparişle, 2. pay uzak siparişle hazır olur; hiçbir pay hazır anından önce başlamaz', async () => {
    const ops = await plan({ adet: 30, stok: 2, siparisler: SIPARISLER, elleBol: ELLE });
    const p1 = ops['O1.10']!, p2 = ops['O1.10~2']!, ardil = ops['O1.20']!;
    assert.ok(p1 && p2 && ardil, JSON.stringify(Object.keys(ops)));
    assert.equal(p1.m, '100');
    assert.ok(p1.S >= YAKIN && p1.S < UZAK, `1. pay yakın gelişten sonra, uzak gelişten önce başlar: ${String(p1.S)}`);
    assert.ok(p2.S >= UZAK, `2. pay uzak gelişi bekler: ${String(p2.S)}`);
    assert.ok(ardil.S >= Math.max(p1.C, p2.C) - 1e-6, 'ardıl son payın bitişinden sonra başlar');
  });

  test('payların sırası gelişlerin sırasıdır: erken pay erken gelişi alır (20 + 10 bölmede 1. pay da uzak gelişi bekler)', async () => {
    const ops = await plan({ adet: 30, stok: 2, siparisler: SIPARISLER, elleBol: { 'O1.10': [{ adet: 20, m: '100' }, { adet: 10, m: '101' }] } });
    // 1. pay 20 kg: 2 stok + 8 yakın + 10 uzak; 2. pay kalan 10 kg uzak.
    assert.ok(ops['O1.10']!.S >= UZAK && ops['O1.10~2']!.S >= UZAK, JSON.stringify(ops));
  });

  test('bölünmemiş adım bütün satırı bekler (bugünkü kural)', async () => {
    const ops = await plan({ adet: 30, stok: 2, siparisler: SIPARISLER, elleBol: null });
    assert.ok(ops['O1.10']!.S >= UZAK, JSON.stringify(ops['O1.10']));
    assert.equal(ops['O1.10~2'], undefined);
  });

  test('malzeme kısıtı kapalıyken (3669) paylar malzemeyi beklemez', async () => {
    const ops = await plan({ adet: 30, stok: 2, siparisler: SIPARISLER, elleBol: ELLE, kapali: ['personel', 'malzeme'] });
    assert.ok(ops['O1.10']!.S < YAKIN && ops['O1.10~2']!.S < YAKIN, JSON.stringify(ops));
  });
});
