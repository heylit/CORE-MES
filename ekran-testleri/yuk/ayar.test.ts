import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ayarOku, karmaOku } from './ayar.ts';

describe('yük ayarı', () => {
  it('ayar komut satırından gelir, .env değeri ancak komut satırı boşsa geçer, ikisi de yoksa varsayılan', () => {
    const ortam = { TMIV2_YUK_KISI: '50', TMIV2_YUK_SURE_SN: '120' };
    const a = ayarOku(['--kisi', '200'], ortam);
    assert.equal(a.komut, 'kos');
    assert.equal(a.kisi, 200);
    assert.equal(a.sureSn, 120);
    assert.equal(a.isinmaSn, 60);
    assert.equal(a.yazma, false);
    assert.equal(a.sunucuAc, false);
    assert.equal(a.yonetici, 'ornek.yonetici');
    assert.equal(ayarOku([], {}).kisi, 1000);
  });

  it('hazirla ve profil-ozet komutları ayrılır; bilinmeyen komut ve seçenek reddedilir', () => {
    assert.equal(ayarOku(['hazirla', '--kisi', '10'], {}).komut, 'hazirla');
    const p = ayarOku(['profil-ozet', '/tmp/a.cpuprofile'], {});
    assert.equal(p.komut, 'profil-ozet');
    assert.equal(p.dosya, '/tmp/a.cpuprofile');
    assert.throws(() => ayarOku(['profil-ozet'], {}));
    assert.throws(() => ayarOku(['kostur'], {}));
    assert.throws(() => ayarOku(['--bilinmeyen'], {}));
    assert.throws(() => ayarOku(['hazirla', 'fazla'], {}));
  });

  it('profil sunucuyu koşunun açmasını gerektirir; yazma ve profil .env ile de açılır', () => {
    const a = ayarOku(['--profil'], {});
    assert.equal(a.profil, true);
    assert.equal(a.sunucuAc, true);
    const b = ayarOku([], { TMIV2_YUK_YAZMA: '1', TMIV2_YUK_PROFIL: 'evet' });
    assert.equal(b.yazma, true);
    assert.equal(b.sunucuAc, true);
    assert.equal(ayarOku([], { TMIV2_YUK_YAZMA: '0' }).yazma, false);
  });

  it('sınır dışı sayı adıyla reddedilir', () => {
    assert.throws(() => ayarOku(['--kisi', '0'], {}), /kisi/);
    assert.throws(() => ayarOku(['--sure', '5'], {}), /sure/);
    assert.throws(() => ayarOku([], { TMIV2_YUK_TOHUM: '1.5' }), /tohum/);
  });

  it('karma ad=pay listesidir; bozuk, sıfır ve tekrar reddedilir', () => {
    assert.deepEqual([...karmaOku('terminal=120,ofis=60, pano=20')], [['terminal', 120], ['ofis', 60], ['pano', 20]]);
    for (const bozuk of ['', 'terminal', 'terminal=0', 'terminal=1.5', 'a=1,a=2', '=3', 'a=1=2']) assert.throws(() => karmaOku(bozuk), bozuk);
    assert.equal(ayarOku(['--karma', 'ofis=1'], { TMIV2_YUK_KARMA: 'pano=1' }).karma?.get('ofis'), 1);
    assert.equal(ayarOku([], { TMIV2_YUK_KARMA: 'pano=1' }).karma?.get('pano'), 1);
  });
});
