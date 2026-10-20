import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AG_ARALIGI_EN_COK, adresAraliktaMi, adresCoz, agAraligiHatasi, agAraliklariniCoz } from './ag-araligi.ts';

test('IPv4 aralığı: içindeki adres eşleşir, dışındaki eşleşmez; IPv4 taşıyan IPv6 biçimi IPv4 sayılır', () => {
  const { araliklar, hata } = agAraliklariniCoz('10.30.0.0/16, 192.168.5.7');
  assert.equal(hata, null);
  assert.equal(adresAraliktaMi('10.30.255.1', araliklar), true);
  assert.equal(adresAraliktaMi('::ffff:10.30.0.9', araliklar), true);
  assert.equal(adresAraliktaMi('10.31.0.1', araliklar), false);
  assert.equal(adresAraliktaMi('192.168.5.7', araliklar), true);
  assert.equal(adresAraliktaMi('192.168.5.8', araliklar), false);
  assert.equal(adresAraliktaMi('bozuk', araliklar), false);
});

test('IPv6 aralığı: kısaltılmış yazım çözülür; IPv4 aralığı IPv6 adresini kapsamaz', () => {
  const { araliklar, hata } = agAraliklariniCoz('fd00:30::/32\n10.0.0.0/8');
  assert.equal(hata, null);
  assert.equal(adresAraliktaMi('fd00:30:1::5', araliklar), true);
  assert.equal(adresAraliktaMi('fd00:31::5', araliklar), false);
  assert.equal(adresAraliktaMi('::1', araliklar), false);
  assert.deepEqual(adresCoz('::1'), { surum: 6, deger: 1n });
});

test('boş liste geçerlidir ve hiçbir adresi kapsamaz', () => {
  assert.deepEqual(agAraliklariniCoz('   '), { araliklar: [], hata: null });
  assert.equal(adresAraliktaMi('10.0.0.1', []), false);
});

test('hatalı yazım reddedilir: bozuk adres, sınır dışı önek, ağ adresi olmayan aralık, fazla öğe', () => {
  for (const yanlis of ['10.30.0/16', '10.30.0.0/33', '10.30.1.0/16', '256.0.0.1', '10.0.0.01', 'fd00::/129', '1::2::3', '10.0.0.0/8/1', 'abc']) {
    assert.notEqual(agAraligiHatasi(yanlis), null, yanlis);
  }
  assert.match(agAraligiHatasi('10.30.1.0/16') ?? '', /ağ adresi değil/);
  assert.notEqual(agAraligiHatasi(Array.from({ length: AG_ARALIGI_EN_COK + 1 }, (_, i) => `10.0.${String(i)}.0/24`).join(',')), null);
  assert.equal(agAraligiHatasi(Array.from({ length: AG_ARALIGI_EN_COK }, (_, i) => `10.0.${String(i)}.0/24`).join(',')), null);
});
