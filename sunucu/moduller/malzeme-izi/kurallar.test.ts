import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { HalGirdisi } from '#paylasilan/sozlesme/malzeme-izi.ts';
import { grupDagilimi, hal } from './kurallar.ts';

const satir = (g: Partial<HalGirdisi>): HalGirdisi => ({ konumTuru: 'raf_gozu', statuId: null, kaliteDurumu: 'serbest', rezerveMi: false, ...g });

describe('MIZ-1 malzemenin hâli', () => {
  test('raftaki serbest satır serbest; emre ayrılmışsa rezerve', () => {
    assert.equal(hal(satir({})), 'serbest');
    assert.equal(hal(satir({ rezerveMi: true })), 'rezerve');
  });
  test('kalite kararı konumdan önce gelir: karantinada karar bekleyen kalite bekliyor, kabulde red red', () => {
    assert.equal(hal(satir({ konumTuru: 'karantina', kaliteDurumu: 'karar_bekliyor' })), 'kalite_bekliyor');
    assert.equal(hal(satir({ konumTuru: 'kabul', kaliteDurumu: 'karar_bekliyor' })), 'kalite_bekliyor');
    assert.equal(hal(satir({ konumTuru: 'kabul', kaliteDurumu: 'red' })), 'red');
    assert.equal(hal(satir({ konumTuru: 'karantina' })), 'red');
    assert.equal(hal(satir({ kaliteDurumu: 'sartli', rezerveMi: true })), 'sartli');
  });
  test('hurda konumu her şeyden önce; kabul, fason ve yolda konumları', () => {
    assert.equal(hal(satir({ konumTuru: 'hurda', kaliteDurumu: 'red' })), 'hurda');
    assert.equal(hal(satir({ konumTuru: 'kabul' })), 'kabul');
    assert.equal(hal(satir({ konumTuru: 'fason', statuId: 4 })), 'fason');
    assert.equal(hal(satir({ konumTuru: 'yolda' })), 'fason');
    assert.equal(hal(satir({ konumTuru: 'sevkiyat' })), 'fason');
  });
  test('statülü ya da istasyondaki parça üretimde, rezerveden önce', () => {
    assert.equal(hal(satir({ statuId: 7, rezerveMi: true })), 'uretimde');
    assert.equal(hal(satir({ konumTuru: 'istasyon' })), 'uretimde');
    assert.equal(hal(satir({ konumTuru: 'uretim_cikisi' })), 'uretimde');
  });
});

describe('MIZ-2 stok grup dağılımı', () => {
  test('sabit sırayla, sıfır grup yazılmaz, aynı grup toplanır', () => {
    assert.deepEqual(grupDagilimi([
      { grup: 'hurda', toplam: '2.500' }, { grup: 'kullanilabilir', toplam: '10.100' }, { grup: 'kullanilabilir', toplam: '0.200' }, { grup: 'fason', toplam: '0' },
    ]), [{ grup: 'kullanilabilir', miktar: '10.3' }, { grup: 'hurda', miktar: '2.5' }]);
    assert.deepEqual(grupDagilimi([]), []);
  });
});
