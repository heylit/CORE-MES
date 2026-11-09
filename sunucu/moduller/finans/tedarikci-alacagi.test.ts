import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tedarikciAlacagiGecisHatasi } from './kurallar.ts';

test('2540 Güvenlik K2: tedarikçi alacağı yalnız üç geçişle ilerler; düşüldü ve kapandı son durumdur; düşürme ve kapatma gerekçe ister', () => {
  assert.equal(tedarikciAlacagiGecisHatasi('teyit_bekliyor', 'acik', null), null);
  assert.equal(tedarikciAlacagiGecisHatasi('teyit_bekliyor', 'dusuldu', 'Avans ödenmedi'), null);
  assert.equal(tedarikciAlacagiGecisHatasi('acik', 'kapandi', 'Mahsup edildi'), null);
  for (const [eski, yeni] of [['teyit_bekliyor', 'kapandi'], ['acik', 'dusuldu'], ['acik', 'teyit_bekliyor'], ['dusuldu', 'acik'], ['kapandi', 'acik'], ['kapandi', 'dusuldu']] as const) {
    assert.match(tedarikciAlacagiGecisHatasi(eski, yeni, 'Deneme') ?? '', /geçemez/, `${eski} -> ${yeni}`);
  }
  assert.match(tedarikciAlacagiGecisHatasi('teyit_bekliyor', 'dusuldu', '  ') ?? '', /gerekçe/);
  assert.match(tedarikciAlacagiGecisHatasi('acik', 'kapandi', null) ?? '', /gerekçe/);
});
