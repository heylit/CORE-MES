import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';

// 1459 a: stok satırı olmayan malzemenin stoku bilinmez (null); girdi 0 uydurmaz. Motor dağıtımda 0 gibi kullanır ve plana giren malzemede
// "stok bilinmiyor" uyarısı verir. Veriler uydurmadır.
const KAYIT = (stock: unknown) => ({
  version: 7, savedAt: 9,
  items: [{ id: 'H1', code: 'H1', name: 'Ornek cubuk', type: 'ham', unit: 'kg', stock }],
  opdefs: [], machines: [], routes: {}, orders: [],
});
const calisma = {
  surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'sert', dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
};
const stok = (stock: unknown): unknown => {
  const g = planGirdisi({ calisma, kayit: KAYIT(stock), kaynak: null, bugun: '2026-10-19' });
  assert.ok(g);
  return ((g.S as { D: { malzemeler: Record<string, unknown>[] } }).D.malzemeler).find((m) => m.kod === 'H1')?.stok;
};

describe('plan girdisi: bilinmeyen stok (1459 a)', () => {
  test('stok satırı yoksa (null, boş) stok null kalır; sayı ve sayı metni sayı olur; 0 bilinen sıfırdır', () => {
    assert.equal(stok(null), null);
    assert.equal(stok(undefined), null);
    assert.equal(stok(''), null);
    assert.equal(stok(0), 0);
    assert.equal(stok('12.5'), 12.5);
  });

  test('motor stoku bilinmeyen ve plana giren malzemede uyarır; bilinen stokta uyarmaz', () => {
    const m = motorYukle();
    const st = (stokDegeri: number | null) => m.stHazirla({
      D: {
        meta: { baslangic: '2026-01-05' }, ayarlar: {}, vardiyalar: [{ id: 'V', bas: '08:00', bit: '16:00' }],
        calismaGunleri: { pzt: ['V'], sal: ['V'], car: ['V'], per: ['V'], cum: ['V'] },
        tezgahlar: [{ id: 'T1', grup: 'G' }], personel: [{ id: 'P1', vardiya: 'V', gruplar: ['G'] }],
        malzemeler: [{ kod: 'H1', ad: 'Ornek cubuk', birim: 'kg', stok: stokDegeri, tedarikGun: 0, muayeneGun: 0 }],
        urunler: [{ id: 'U', rota: [{ k: '10', ad: 'Torna', tezgahlar: [{ id: 'T1', cevrim: 60, ayar: 0 }] }] }],
        siparisler: [{ id: 'S1', urun: 'U', adet: 4, termin: '2026-01-09 17:00', malzeme: [{ kod: 'H1', miktar: 1 }] }],
      },
      now: 8, down: [], ekMesai: [], eksik: [], locks: {}, pref: {}, boost: {}, gercek: {}, sapma: {}, saGecik: {}, ogren: {}, w: { ...m.W0 },
    });
    const uyarilar = (stokDegeri: number | null): string[] => {
      const s = st(stokDegeri);
      return (m.evaluate(m.schedule(s, 'yeni', null), s, null, false) as { warn: { txt: string }[] }).warn.map((w) => w.txt);
    };
    assert.ok(uyarilar(null).includes('H1: stok bilinmiyor; 0 sayıldı'), uyarilar(null).join(' | '));
    assert.equal(uyarilar(100).some((t) => t.includes('stok bilinmiyor')), false);
  });
});
