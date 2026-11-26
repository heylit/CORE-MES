import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { lsv2ListesiHatasi, lsv2ListesiniCoz, satirHatalari, satirlariCoz, satirlariYaz } from './lsv2-makineleri.ts';

// Kart 3757: Heidenhain makine listesi Sistem Ayarları'nda; sunucu ve ekran aynı kuralla doğrular. Adlar ve adresler uydurmadır.
describe('Heidenhain makine listesi (ayar değeri)', () => {
  test('boş liste geçerlidir ve makine yoktur (bağlantı açılmaz)', () => {
    assert.equal(lsv2ListesiHatasi(''), null);
    assert.deepEqual(lsv2ListesiniCoz('  '), []);
  });

  test('geçerli liste: kurum içi IPv4, isteğe bağlı D sayaç adresi', () => {
    const metin = 'ORN-H01=10.250.0.11;D10000, ORN-H02=192.168.250.12';
    assert.equal(lsv2ListesiHatasi(metin), null);
    assert.deepEqual(lsv2ListesiniCoz(metin), [
      { cihazAdi: 'ORN-H01', adres: '10.250.0.11', sayac: 10_000 },
      { cihazAdi: 'ORN-H02', adres: '192.168.250.12', sayac: null },
    ]);
  });

  test('dış adres, ad, kapı, bozuk sayaç ve tekrarlanan kod reddedilir; ileti adresi söylemez, makine sırasını söyler', () => {
    for (const deger of [
      'ORN-H01=192.0.2.11', 'ORN-H01=203.0.113.7;D10000', 'ORN-H01=127.0.0.1', 'ORN-H01=makine01', 'ORN-H01=orn.example', 'ORN-H01=10.250.0.11:19000',
      'ORN-H01=10.250.0.11;D10001', 'ORN-H01=10.250.0.11;W10000', 'ORN-H01=10.250.0.11;D10000;D4', 'ORN-H01', '=10.250.0.11',
      'ORN-H01=10.250.0.11,orn-h01=10.250.0.12', 'ORN H01=10.250.0.11', 'ORN-H01=fd00::1',
    ]) {
      const h = lsv2ListesiHatasi(deger);
      assert.ok(h !== null, deger);
      assert.ok(!h.includes('192.0.2') && !h.includes('10.250') && !h.includes('203.0'), h);
      assert.deepEqual(lsv2ListesiniCoz(deger), [], deger);
    }
    assert.match(lsv2ListesiHatasi('ORN-H01=10.250.0.11,ORN-H02=203.0.113.7') ?? '', /^2\. makine, IP adresi/);
  });

  test('en çok 32 makine', () => {
    const liste = Array.from({ length: 33 }, (_, i) => `ORN-H${String(i)}=10.250.0.${String(i + 1)}`).join(',');
    assert.match(lsv2ListesiHatasi(liste) ?? '', /En çok 32/);
  });

  test('ekran satırları: her alanın hatası kendi satırında; yazılan metin yeniden çözülür', () => {
    const satirlar = [{ kod: 'ORN-H01', adres: '10.250.0.11', sayac: 'D10000' }, { kod: 'ORN-H03', adres: '203.0.113.5', sayac: 'D10002' }];
    assert.deepEqual(satirHatalari(satirlar).map((h) => [h.satir, h.alan]), [[1, 'adres'], [1, 'sayac']]);
    assert.deepEqual(satirlariCoz(satirlariYaz([satirlar[0]!])), [satirlar[0]]);
  });
});
