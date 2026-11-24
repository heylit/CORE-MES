import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { KISI_BASKA_ISTASYONDA, kisiBaskaIstasyonda } from './kurallar.ts';

const KISI = (id: number) => ({ tur: 'kisi' as const, id });
const MAKINE = (id: number) => ({ tur: 'makine' as const, id });
const atama = (l: [number, number][]) => new Map(l);

describe('3612 kişi başka istasyonda uyarısı', () => {
  test('kişinin istasyonu adımınkinden farklıysa uyarır, aynıysa uyarmaz', () => {
    assert.equal(kisiBaskaIstasyonda(KISI(1), 10, atama([[1, 20]])), KISI_BASKA_ISTASYONDA);
    assert.equal(kisiBaskaIstasyonda(KISI(1), 10, atama([[1, 10]])), null);
  });
  test('atamasız kişide, istasyonsuz adımda ve makinede uyarı yok', () => {
    assert.equal(kisiBaskaIstasyonda(KISI(1), 10, atama([])), null);
    assert.equal(kisiBaskaIstasyonda(KISI(1), null, atama([[1, 20]])), null);
    assert.equal(kisiBaskaIstasyonda(MAKINE(1), 10, atama([[1, 20]])), null);
  });
});
