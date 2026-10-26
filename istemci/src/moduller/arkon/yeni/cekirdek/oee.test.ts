import { describe, expect, it } from 'vitest';
import { oeeHesapla, type DurumOlayi } from './oee.ts';

// 684: istasyonda aynı anda birden çok iş açıkken istasyonun hâli. Değerler uydurmadır.
const ortam = { planliMi: () => false, durusPencereleri: () => [] };
const dk = 60e3;
const hesapla = (ev: DurumOlayi[]) => oeeHesapla({ ev, cn: [], from: 0, to: 60 * dk }, ortam);

describe('istasyon hâli iş başına son olaydan', () => {
  it('bir iş çalışırken öteki duraklayınca istasyon çalışıyor sayılır', () => {
    const c = hesapla([
      { at: 0, state: 'running', orderNo: 'A' },
      { at: 10 * dk, state: 'running', orderNo: 'B' },
      { at: 20 * dk, state: 'paused', orderNo: 'B' },
      { at: 40 * dk, state: 'paused', orderNo: 'A' },
    ]);
    expect(c.run).toBe(40 * dk);
    expect(c.pauseMs).toBe(20 * dk);
  });
  it('biri duruşta, öteki çalışıyorsa duruş sayılmaz; ikisi de durunca sayılır', () => {
    const c = hesapla([
      { at: 0, state: 'running', orderNo: 'A' },
      { at: 0, state: 'running', orderNo: 'B' },
      { at: 15 * dk, state: 'stopped', reason: 'D-01', orderNo: 'A' },
      { at: 30 * dk, state: 'stopped', reason: 'D-02', orderNo: 'B' },
    ]);
    expect(c.run).toBe(30 * dk);
    expect(c.stopMs).toBe(30 * dk);
    expect(c.segs.at(-1)).toMatchObject({ s: 'stopped' });
  });
  it('iş nosuz eski olaylarda son olay kazanır', () => {
    const c = hesapla([{ at: 0, state: 'running' }, { at: 30 * dk, state: 'paused' }]);
    expect(c.run).toBe(30 * dk);
    expect(c.pauseMs).toBe(30 * dk);
  });
});
