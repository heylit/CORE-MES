import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ROL_GORUNUMLERI, etkinGorunum, seritRolGorunurMu } from './rol-gorunumleri.ts';
import { SAYFALAR, menudeGorunur } from './sayfalar.ts';

describe('rol görünümleri (1390 a)', () => {
  test('her rolün menüsü en çok 8 sayfadır, tekrarsızdır ve yalnız menüde görünen kayıtlı sayfaları içerir', () => {
    const menudekiler = new Set(SAYFALAR.filter(menudeGorunur).map((s) => s.yol as string));
    for (const [rol, g] of Object.entries(ROL_GORUNUMLERI)) {
      assert.ok(g.sayfalar.length > 0 && g.sayfalar.length <= 8, `${rol}: ${String(g.sayfalar.length)} sayfa`);
      assert.equal(new Set(g.sayfalar).size, g.sayfalar.length, `${rol}: tekrar eden sayfa`);
      for (const yol of g.sayfalar) assert.ok(menudekiler.has(yol), `${rol}: menüde olmayan sayfa ${yol}`);
      assert.equal(new Set(g.kartlar).size, g.kartlar.length, `${rol}: tekrar eden kart`);
    }
  });

  test('operatör CNC Kurulum görmez (1393 c+); yönetici rol listesinde yoktur, tam görünümdedir', () => {
    assert.equal(ROL_GORUNUMLERI.operator?.sayfalar.includes('/cnc-kurulum'), false);
    assert.equal(ROL_GORUNUMLERI.yonetici, undefined);
  });

  test('etkin görünüm: birden çok rol birleşir; yönetici, listesiz rol ya da rol bilgisi yoksa tam görünüm', () => {
    const iki = etkinGorunum(['operator', 'depo']);
    assert.deepEqual(iki.sayfaSirasi.slice(0, 3), ['/uretim-terminali', '/kuyruk', '/ik-islemlerim']);
    assert.ok(iki.sayfalar?.has('/stok'));
    assert.ok(iki.kartlar?.has('arkon-ozetim') && iki.kartlar.has('stok-sayim'));
    for (const roller of [undefined, [], ['yonetici'], ['operator', 'yonetici'], ['ozel_rol']]) {
      const g = etkinGorunum(roller);
      assert.equal(g.sayfalar, null);
      assert.equal(g.kartlar, null);
    }
    // Müdürün menüsü daralır, ana sayfası (şirket özeti) süzülmez.
    const mudur = etkinGorunum(['mudur']);
    assert.ok(mudur.sayfalar !== null);
    assert.equal(mudur.kartlar, null);
  });

  test('kur ve faiz şeridi yalnız finans, satın alma, müdür ve yöneticide (1394 a)', () => {
    for (const rol of ['muhasebe_finans', 'satin_alma', 'mudur', 'yonetici']) assert.equal(seritRolGorunurMu('kur-faiz', [rol]), true);
    for (const rol of ['operator', 'kalite', 'planlama_proje', 'ozel_rol']) assert.equal(seritRolGorunurMu('kur-faiz', [rol]), false);
    assert.equal(seritRolGorunurMu('kur-faiz', undefined), false);
    assert.equal(seritRolGorunurMu('baska-serit', ['operator']), true);
  });
});
