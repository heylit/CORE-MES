import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type GecisTablosu, gecisTablosuHatalari, gecisVarMi } from './durum-gecis.ts';

type Durum = 'taslak' | 'onayda' | 'kapali';

const TABLO: GecisTablosu<Durum> = {
  taslak: ['onayda'],
  onayda: ['taslak', 'kapali'],
  kapali: [],
};

test('tabloda yazılı geçiş izinlidir, yazılmayan reddedilir', () => {
  assert.equal(gecisVarMi(TABLO, 'taslak', 'onayda'), true);
  assert.equal(gecisVarMi(TABLO, 'onayda', 'kapali'), true);
  assert.equal(gecisVarMi(TABLO, 'taslak', 'kapali'), false);
  assert.equal(gecisVarMi(TABLO, 'kapali', 'taslak'), false);
});

test('aynı durum yalnız ayniDurum seçeneğiyle geçiş sayılır', () => {
  assert.equal(gecisVarMi(TABLO, 'onayda', 'onayda'), false);
  assert.equal(gecisVarMi(TABLO, 'onayda', 'onayda', { ayniDurum: true }), true);
  assert.equal(gecisVarMi(TABLO, 'kapali', 'kapali', { ayniDurum: true }), true);
});

test('tabloda olmayan ad tip denetimini atlatsa da geçiş sayılmaz', () => {
  const disaridan = (ad: string) => ad as Durum;
  assert.equal(gecisVarMi(TABLO, disaridan('bilinmeyen'), 'taslak'), false);
  assert.equal(gecisVarMi(TABLO, 'taslak', disaridan('bilinmeyen')), false);
  assert.equal(gecisVarMi(TABLO, disaridan('constructor'), 'taslak'), false);
  assert.equal(gecisVarMi(TABLO, disaridan('toString'), disaridan('toString'), { ayniDurum: true }), false);
});

test('tablo denetimi kendine geçişi ve tekrar eden hedefi bulur; doğru tablo boş döner', () => {
  assert.deepEqual(gecisTablosuHatalari(TABLO), []);
  const bozuk: GecisTablosu<Durum> = { taslak: ['taslak', 'onayda', 'onayda'], onayda: [], kapali: [] };
  assert.deepEqual(gecisTablosuHatalari(bozuk), ['taslak: kendine geçiş tabloya yazılmaz', 'taslak: onayda iki kez yazılmış']);
});
