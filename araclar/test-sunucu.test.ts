import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { hataSatiri, veriKodla } from './test-rapor-github.ts';
import { ESZAMANLI_EN_FAZLA, eszamanliOku, parcaOku, sunucuTestArgv } from './test-sunucu.ts';

describe('sunucu testleri eşzamanlılığı', () => {
  test('boş ya da tanımsız değer node varsayılanını bırakır: argv bayrak taşımaz', () => {
    assert.equal(eszamanliOku(undefined), null);
    assert.equal(eszamanliOku(' '), null);
    assert.ok(!sunucuTestArgv(null).some((a) => a.startsWith('--test-concurrency')));
  });

  test('geçerli değer bayrağa dönüşür ve desenlerden önce gelir', () => {
    assert.equal(eszamanliOku('8'), 8);
    assert.equal(eszamanliOku(String(ESZAMANLI_EN_FAZLA)), ESZAMANLI_EN_FAZLA);
    const argv = sunucuTestArgv(8);
    const bayrak = argv.indexOf('--test-concurrency=8');
    assert.ok(bayrak > argv.indexOf('--test'));
    assert.ok(bayrak < argv.indexOf('sunucu/**/*.test.ts'));
    assert.deepEqual(argv.slice(-4), ['sunucu/**/*.test.ts', 'araclar/**/*.test.ts', 'paylasilan/**/*.test.ts', 'ekran-testleri/benzetim/**/*.test.ts']);
  });

  test('sayı olmayan, sıfır ya da üst sınırı aşan değer reddedilir: sessizce varsayılana düşmez', () => {
    for (const kotu of ['0', '-1', '2.5', 'sekiz', '8x', String(ESZAMANLI_EN_FAZLA + 1)]) {
      assert.throws(() => eszamanliOku(kotu), /TMIV2_TEST_ESZAMANLI/, kotu);
    }
  });
});

describe('sunucu testleri parçalara bölünmesi', () => {
  test('boş değer bütün dosyaları koşar: argv parça bayrağı taşımaz', () => {
    assert.equal(parcaOku(undefined), null);
    assert.equal(parcaOku(''), null);
    assert.ok(!sunucuTestArgv(8, true).some((a) => a.startsWith('--test-shard')));
  });

  test('geçerli parça bayrağa dönüşür ve desenlerden önce gelir', () => {
    assert.equal(parcaOku(' 2/4 '), '2/4');
    assert.equal(parcaOku('1/1'), '1/1');
    const argv = sunucuTestArgv(8, true, '3/4');
    const bayrak = argv.indexOf('--test-shard=3/4');
    assert.ok(bayrak > argv.indexOf('--test'));
    assert.ok(bayrak < argv.indexOf('sunucu/**/*.test.ts'));
  });

  test('bozuk parça reddedilir: sessizce bütün testleri ya da hiçbirini koşmaz', () => {
    for (const kotu of ['0/4', '5/4', '1/0', '2', '1/4/2', 'a/b', '-1/4', '1.5/4']) {
      assert.throws(() => parcaOku(kotu), /TMIV2_TEST_PARCA/, kotu);
    }
  });
});

describe('CI uyarı satırı raporcusu', () => {
  test('yalnız CI argv\'si raporcuyu ekler; spec çıktısı yerinde kalır', () => {
    assert.ok(!sunucuTestArgv(8).some((a) => a.startsWith('--test-reporter')));
    const argv = sunucuTestArgv(8, true);
    assert.ok(argv.includes('--test-reporter=spec'));
    assert.ok(argv.includes('--test-reporter=./araclar/test-rapor-github.ts'));
    assert.equal(argv.filter((a) => a === '--test-reporter-destination=stdout').length, 2);
  });

  test('kırmızı yaprak test dosya, satır, ad ve asıl iletiyle tek satır olur; takım kırmızısı basılmaz', () => {
    const asil = new Error('beklenen 1, gelen 2\nikinci satır');
    const satir = hataSatiri({
      name: 'kilit, sıra: ikinci', file: new URL('../sunucu/x.test.ts', import.meta.url).href, line: 12,
      details: { error: { code: 'ERR_TEST_FAILURE', message: 'sarmal', cause: asil } },
    });
    assert.ok(satir !== null);
    assert.ok(satir.startsWith('::error file=sunucu/x.test.ts,line=12,title=kilit%2C sıra%3A ikinci::'), satir);
    assert.ok(satir.includes('beklenen 1, gelen 2%0Aikinci satır'));
    assert.ok(!satir.includes('sarmal'));
    assert.equal(satir.split('\n').length, 2);
    assert.equal(hataSatiri({ name: 'takım', details: { type: 'suite', error: { message: 'x' } } }), null);
  });

  test('yüzde ve satır sonu kodlanır', () => {
    assert.equal(veriKodla('%50\r\n'), '%2550%0D%0A');
  });
});
