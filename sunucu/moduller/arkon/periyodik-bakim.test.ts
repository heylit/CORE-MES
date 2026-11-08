import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { periyodikBakimPlanlari } from './kurallar.ts';

// 2319 (2311 S10): Bakım ekranının periyodik planları plan girdisine okunur. Veriler uydurmadır.
describe('periyodik bakım planları', () => {
  test('PB-01: yalnız plan türü; makine kodu, gün, süre ve son yapılış okunur; eksik süre ve son yapılış null', () => {
    const l = periyodikBakimPlanlari([
      { kimlik: 'pl-1', govde: { type: 'plan', mc: ' T1 ', title: 'Yağ', everyDays: 30, durMin: 45, lastAt: Date.parse('2026-11-01T09:00:00Z') } },
      { kimlik: 'pl-2', govde: { type: 'plan', mc: 'T2', title: 'Filtre', everyDays: 7.6 } },
      { kimlik: 'ar-1', govde: { type: 'ariza', mc: 'T1', status: 'open' } },
      { kimlik: 'pm-1', govde: { type: 'pm', mc: 'T1' } },
    ]);
    assert.deepEqual(l, [
      { kimlik: 'pl-1', makineKod: 'T1', baslik: 'Yağ', herGun: 30, sureDk: 45, sonYapilma: new Date('2026-11-01T09:00:00Z') },
      { kimlik: 'pl-2', makineKod: 'T2', baslik: 'Filtre', herGun: 7, sureDk: null, sonYapilma: null },
    ]);
  });

  test('PB-02: makinesi boş, gün sayısı 1den küçük ya da sayı olmayan plan atlanır', () => {
    assert.deepEqual(periyodikBakimPlanlari([
      { kimlik: 'a', govde: { type: 'plan', mc: '', everyDays: 30 } },
      { kimlik: 'b', govde: { type: 'plan', mc: 'T1', everyDays: 0 } },
      { kimlik: 'c', govde: { type: 'plan', mc: 'T1', everyDays: '30' } },
      { kimlik: 'd', govde: null },
    ]), []);
  });
});
