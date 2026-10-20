import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { gocHataIletisi } from './goc.ts';

const vtHatasi = (code: string, ileti: string): Error => Object.assign(new pg.DatabaseError(ileti, 0, 'error'), { code });

test('göç kilit beklerken süre dolunca (55P03) Türkçe ve yol gösteren ileti verilir; diğer hatalar iletisiyle kalır', () => {
  const kilit = gocHataIletisi(vtHatasi('55P03', 'canceling statement due to lock timeout'));
  assert.match(kilit, /sunucu.*kullanıyor/i);
  assert.match(kilit, /kapatıp/);
  assert.doesNotMatch(kilit, /lock timeout/);
  assert.equal(gocHataIletisi(vtHatasi('42P01', 'relation "x" does not exist')), 'relation "x" does not exist');
  assert.equal(gocHataIletisi(new Error('başka')), 'başka');
  assert.equal(gocHataIletisi('düz metin'), 'düz metin');
});
