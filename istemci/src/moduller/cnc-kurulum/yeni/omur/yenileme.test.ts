import { describe, expect, it, vi } from 'vitest';
import type { Takim } from './tipler.ts';
import { rnCaps, rnFactor, rnInsert, rnInsItem, rnState, rnTamamla, yeniTakim, yenile } from './yenileme.ts';

vi.mock('./cekirdek.ts', () => import('./test-verisi.ts'));

const takim = (o: Partial<Takim>): Takim => ({ id: 't', name: 'Takım', kind: 'endmill', tm: 'K', cut: {}, ...o });

describe('rnInsert', () => {
  it('ISO uç kodundan kenar sayısını çıkarır: negatif uç iki taraflıdır', () => {
    expect(rnInsert(takim({ kind: 'lt_ext', code: 'CNMG 120408' }))).toMatchObject({ edges: 4, n: 1, code: 'CNMG' });
    expect(rnInsert(takim({ kind: 'facemill', tm: 'I', code: 'SEKT 1203 · 5 uç' }))).toMatchObject({ edges: 4, n: 5 });
  });
  it('diş, kanal ve tırtıl uçlarını tanır; kod yoksa 2 kenar varsayar', () => {
    expect(rnInsert(takim({ kind: 'lt_thread' })).edges).toBe(3);
    expect(rnInsert(takim({ kind: 'lt_facegroove' })).edges).toBe(1);
    expect(rnInsert(takim({ kind: 'lt_knurl' })).edges).toBe(0);
    expect(rnInsert(takim({ kind: 'facemill', tm: 'I' }))).toMatchObject({ edges: 2, txt: 'uç kodu bulunamadı · 2 kenar varsayıldı' });
  });
});

describe('rnCaps', () => {
  it('uçlu takım çevrilir, karbür takım bilenir, küçük çap bilenmez', () => {
    expect(rnCaps(takim({ kind: 'facemill', tm: 'I', code: 'SEKN 1203' }))).toMatchObject({ kind: 'index', index: 4 });
    expect(rnCaps(takim({ kind: 'endmill', d: 10 }))).toMatchObject({ kind: 'regrind', regrind: 4, dD: 0.1 });
    expect(rnCaps(takim({ kind: 'endmill', d: 2 }))).toMatchObject({ regrind: 0, kind: 'dress' });
    expect(rnCaps(takim({ kind: 'threadmill', d: 8 }))).toMatchObject({ kind: 'none', why: 'Diş frezesi profil taşlamalı: bilenmez, yalnız değiştirilir' });
    expect(rnCaps(takim({ kind: 'probe' })).why).toBe('Ölçüm probu / boş cep');
  });
  it('bileme sonrası ömür katsayısı kaplamaya ve bileme sayısına göre düşer', () => {
    const t = takim({ kind: 'endmill', d: 10, name: 'AlTiN kaplı freze' }), caps = rnCaps(t);
    expect(caps.coated).toBe(true);
    expect(rnFactor(t, caps, 1, false)).toBeCloseTo(0.65);
    expect(rnFactor(t, caps, 1, true)).toBeCloseTo(0.9);
    expect(rnFactor(t, caps, 3, true)).toBeCloseTo(0.9 * 0.97 * 0.97);
  });
});

describe('yenile', () => {
  it('uç çevirme kenarı artırır, kullanımı sıfırlar, geçmişe yazar ve geri alınır', () => {
    const t = takim({ kind: 'facemill', tm: 'I', code: 'SEKN 1203' }), r = rnTamamla({ id: 't', used: 12.5, parts: 30, since: 1, demo: 1 });
    expect(yenile(t, r, { a: 'index' }, 1000)).toBe(true);
    expect(r).toMatchObject({ ed: 2, used: 0, parts: 0, since: 1000 });
    expect(r.demo).toBeUndefined();
    expect(r.log[0]?.txt).toBe('Uç çevrildi: kenar 1 → 2 (12,5 dk kesmişti)');
    expect(yenile(t, r, { a: 'undo' }, 2000)).toBe(true);
    expect(r).toMatchObject({ ed: 1, used: 12.5, parts: 30 });
  });
  it('bileme hakkı bitince ve kenar kalmayınca uygulanmaz', () => {
    const t = takim({ kind: 'endmill', d: 4 }), r = rnTamamla({ id: 't', used: 5, parts: 1, since: 1, rg: 2 });
    expect(rnCaps(t).regrind).toBe(2);
    expect(yenile(t, r, { a: 'regrind', cap: 3.9, boy: 0.3, kaplandi: false }, 1)).toBe(false);
    const u = takim({ kind: 'lt_ext', code: 'CNMG 1204' }), ru = rnTamamla({ id: 'u', used: 0, parts: 0, since: 1, ed: 4 });
    expect(yenile(u, ru, { a: 'index' }, 1)).toBe(false);
  });
  it('bileme çap kaybını, boy kaybını ve ömür katsayısını yazar; düzeltme kullanımın bir kısmını geri verir', () => {
    const t = takim({ kind: 'endmill', d: 10 }), r = rnTamamla({ id: 't', used: 20, parts: 5, since: 1 });
    yenile(t, r, { a: 'regrind', cap: 9.9, boy: 0.3, kaplandi: false }, 5);
    expect(r).toMatchObject({ rg: 1, used: 0, since: 5 });
    expect(r.dd).toBeCloseTo(0.1);
    expect(r.dl).toBeCloseTo(0.3);
    expect(r.lf).toBeCloseTo(0.9);
    r.used = 10;
    yenile(t, r, { a: 'dress', oran: 0.5 }, 6);
    expect(r.used).toBeCloseTo(5);
    expect(r.lf).toBeCloseTo(0.9 * 0.98);
  });
  it('yeni takım sayaçları sıfırlar ve geçmişe "Yeni takım takıldı" yazar', () => {
    expect(yeniTakim(takim({ id: 'x' }), 9)).toEqual({ id: 'x', used: 0, parts: 0, since: 9, ed: 1, rg: 0, lf: 1, log: [{ t: 9, a: 'new', txt: 'Yeni takım takıldı' }] });
  });
});

describe('rnState ve rnInsItem', () => {
  it('tablo satırı metnini kurar', () => {
    expect(rnState({ t: takim({ kind: 'endmill', d: 10 }), w: { id: 't', used: 0, parts: 0, since: 1, rg: 1 } }).txt).toBe('Bileme 1/4');
    expect(rnState({ t: takim({ kind: 'endmill', d: 10 }), w: { id: 't', used: 0, parts: 0, since: 1 } }).txt).toBe('Yeni (4 bileme hakkı)');
  });
  it('yeni uç setinde düşülecek sarf kalemini uç kodundan bulur', () => {
    const it0 = rnInsItem(takim({ kind: 'facemill', tm: 'I', code: 'SEKN 1203' }), [{ id: 'a', name: 'CNMG 1204' }, { id: 'b', name: 'SEKN 1203 AFTN' }]);
    expect(it0?.id).toBe('b');
  });
});
