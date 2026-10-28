import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  KAPANIS_EKSIK, KAPANIS_MUAF_EKSIK_DEGIL, KAPANIS_ONAY_VERILMIS, KAPANIS_TAMAM, KAPANIS_TAMAM_DEGIL, gerekmeyenKapanisMaddeleri, kapanisAcikIhlali,
  kapanisAsamasi, kapanisGeriAcIhlali, kapanisMaddeHali, kapanisMuafIhlali, kapanisOnayIhlali, kapanisSonucu,
} from './kurallar.ts';

describe('uretim-emirleri kapanış kuralları (1072 a, 1074-1080)', () => {
  test('UE-KP1: bağlı olmayan madde bilinmiyor; eksik madde muafsa muaf, değilse eksik; tamam ve gerekmez olduğu gibi', () => {
    assert.equal(kapanisMaddeHali(undefined, false), 'bilinmiyor');
    assert.equal(kapanisMaddeHali(undefined, true), 'bilinmiyor', 'muafiyet bilinmeyeni tamam saymaz');
    assert.equal(kapanisMaddeHali({ durum: 'eksik', ayrinti: 'x' }, false), 'eksik');
    assert.equal(kapanisMaddeHali({ durum: 'eksik', ayrinti: 'x' }, true), 'muaf');
    assert.equal(kapanisMaddeHali({ durum: 'tamam', ayrinti: null }, true), 'tamam');
    assert.equal(kapanisMaddeHali({ durum: 'gerekmez', ayrinti: null }, false), 'gerekmez');
  });

  test('UE-KP2: sağlamsız emirde sevk ve stok, stok türünde sevk, fasonsuz emirde fason aranmaz', () => {
    const l = (saglamAdet: number, emirTuru: 'seri' | 'stok', fasonVar: boolean) => [...gerekmeyenKapanisMaddeleri({ saglamAdet, emirTuru, fasonVar })].sort();
    assert.deepEqual(l(5, 'seri', true), []);
    assert.deepEqual(l(5, 'seri', false), ['fason']);
    assert.deepEqual(l(5, 'stok', true), ['sevkiyat']);
    assert.deepEqual(l(0, 'seri', true), ['sevkiyat', 'stok']);
    assert.deepEqual(l(0, 'stok', false), ['fason', 'sevkiyat', 'stok']);
  });

  test('UE-KP3: eksik madde belge aşamasında tutar; bilinmiyor ve muaf durdurmaz; tamam kapanış tamam', () => {
    assert.equal(kapanisAsamasi('acik', [{ durum: 'tamam' }, { durum: 'eksik' }]), 'belge');
    assert.equal(kapanisAsamasi('acik', [{ durum: 'tamam' }, { durum: 'bilinmiyor' }, { durum: 'muaf' }, { durum: 'gerekmez' }]), 'onay');
    assert.equal(kapanisAsamasi('tamam', [{ durum: 'eksik' }]), 'tamam');
    assert.equal(kapanisSonucu('acik', 3), null);
    assert.equal(kapanisSonucu('tamam', 3), 'tamamlandi');
    assert.equal(kapanisSonucu('tamam', 0), 'saglamsiz');
  });

  test('UE-KP4: onay sırasız; aynı onay ikinci kez verilmez; eksik varken ve tamamda reddedilir; iki rollü kişi öbürünü verir', () => {
    const acik = { durum: 'acik' as const, kaliteKisiId: null, mudurKisiId: null };
    assert.equal(kapanisOnayIhlali(acik, 'mudur', 0), null, 'müdür kaliteden önce onaylayabilir (1077 b)');
    assert.equal(kapanisOnayIhlali(acik, 'kalite', 0), null);
    assert.equal(kapanisOnayIhlali(acik, 'kalite', 1), KAPANIS_EKSIK);
    assert.equal(kapanisOnayIhlali({ ...acik, kaliteKisiId: 7 }, 'kalite', 0), KAPANIS_ONAY_VERILMIS);
    assert.equal(kapanisOnayIhlali({ ...acik, kaliteKisiId: 7 }, 'mudur', 0), null, 'aynı kişi (7) müdür onayını da verebilir');
    assert.equal(kapanisOnayIhlali({ durum: 'tamam', kaliteKisiId: 7, mudurKisiId: 7 }, 'mudur', 0), KAPANIS_TAMAM);
    assert.equal(kapanisAcikIhlali('acik'), null);
    assert.equal(kapanisAcikIhlali('tamam'), KAPANIS_TAMAM);
  });

  test('UE-KP5: yalnız eksik madde muaf tutulur; yalnız tamam kapanış geri açılır', () => {
    assert.equal(kapanisMuafIhlali('acik', 'eksik'), null);
    for (const hal of ['tamam', 'muaf', 'gerekmez', 'bilinmiyor'] as const) assert.equal(kapanisMuafIhlali('acik', hal), KAPANIS_MUAF_EKSIK_DEGIL, hal);
    assert.equal(kapanisMuafIhlali('tamam', 'eksik'), KAPANIS_TAMAM);
    assert.equal(kapanisGeriAcIhlali('tamam'), null);
    assert.equal(kapanisGeriAcIhlali('acik'), KAPANIS_TAMAM_DEGIL);
  });
});
