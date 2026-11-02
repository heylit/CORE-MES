import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { kategori, profilMetni, profilOzeti } from './profil-ozet.ts';
import type { CpuProfili } from './profil-ozet.ts';

const cerceve = (functionName: string, url: string, lineNumber = 0) => ({ functionName, url, lineNumber });

// kök > servis.isMalzemeleri > sorgular.oku > pg ; kök > (idle)
const profil: CpuProfili = {
  nodes: [
    { id: 1, callFrame: cerceve('(root)', ''), children: [2, 5] },
    { id: 2, callFrame: cerceve('isMalzemeleri', 'file:///k/sunucu/moduller/stok/servis.ts', 3024), children: [3] },
    { id: 3, callFrame: cerceve('oku', 'file:///k/sunucu/moduller/stok/sorgular.ts', 9), children: [4] },
    { id: 4, callFrame: cerceve('parse', 'file:///k/node_modules/pg-protocol/dist/parser.js', 1) },
    { id: 5, callFrame: cerceve('(idle)', '') },
  ],
  samples: [2, 3, 4, 4, 5, 5, 5, 5, 5, 5],
  timeDeltas: [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
};

describe('CPU profili özeti', () => {
  it('kategoriler kendi süresiyle, modül fonksiyonları kapsayıcı süreyle toplanır', () => {
    const o = profilOzeti(profil);
    assert.equal(o.toplamSn, 0);
    assert.deepEqual(o.kategoriler, [{ ad: 'bos (idle)', yuzde: 60 }, { ad: 'pg surucusu', yuzde: 20 }, { ad: 'modul stok', yuzde: 20 }].sort((a, b) => b.yuzde - a.yuzde || a.ad.localeCompare(b.ad)));
    assert.deepEqual(o.modulFonksiyonlari, [{ ad: 'stok/servis.ts isMalzemeleri', yuzde: 40 }, { ad: 'stok/sorgular.ts oku', yuzde: 30 }]);
    assert.equal(o.fonksiyonlar[0]?.ad, '(idle) :1');
    assert.match(profilMetni(o), /isMalzemeleri/);
  });

  it('kategori: paket, çekirdek ve node içi ayrılır', () => {
    assert.equal(kategori(cerceve('f', 'file:///k/node_modules/@fastify/cookie/x.js')), 'fastify');
    assert.equal(kategori(cerceve('f', 'file:///k/node_modules/@scope/paket/x.js')), 'paket @scope/paket');
    assert.equal(kategori(cerceve('f', 'file:///k/sunucu/cekirdek/vt.ts')), 'cekirdek vt.ts');
    assert.equal(kategori(cerceve('f', 'node:internal/x')), 'node ic node:internal/x');
    assert.equal(kategori(cerceve('(garbage collector)', '')), 'GC');
  });

  it('boş profilde sıfıra bölünmez', () => {
    assert.deepEqual(profilOzeti({ nodes: [], samples: [], timeDeltas: [] }), { toplamSn: 0, kategoriler: [], fonksiyonlar: [], modulFonksiyonlari: [] });
  });
});
