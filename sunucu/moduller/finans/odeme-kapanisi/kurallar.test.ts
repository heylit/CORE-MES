import assert from 'node:assert/strict';
import { test } from 'node:test';
import { siparisKapanisi } from './kurallar.ts';

test('FNS-74: bütün bağlı belgeler kapandıysa kapanış en geç kapatan gündür', () => {
  assert.deepEqual(siparisKapanisi({ belgeSayisi: 2, acikSayisi: 0, sonGun: '2026-10-20' }), { kapanis: '2026-10-20' });
});

test('FNS-74: belgesiz, açık belgeli ya da günü bulunamayan sipariş null', () => {
  assert.equal(siparisKapanisi(undefined), null);
  assert.equal(siparisKapanisi({ belgeSayisi: 0, acikSayisi: 0, sonGun: null }), null);
  assert.equal(siparisKapanisi({ belgeSayisi: 2, acikSayisi: 1, sonGun: '2026-10-20' }), null);
  assert.equal(siparisKapanisi({ belgeSayisi: 1, acikSayisi: 0, sonGun: null }), null);
});
