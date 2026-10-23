import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { KosuKaydi } from '../../ekran-testleri/benzetim/kayit.ts';
import { ADRES, SAYFA_BOYU, izlemeKur } from './sunucu.js';

const kok = mkdtempSync(join(tmpdir(), 'tmiv2-izleme-sunucu-'));
const PORT = 4200;
const app = izlemeKur({ kok, port: PORT });
after(async () => { await app.close(); rmSync(kok, { recursive: true, force: true }); });

const k = new KosuKaydi({
  kok, kosuId: 'kosu-a', taban: 'abc1234', tohum: 1, gunSayisi: 1, roller: ['ornek.depo'], senaryolar: ['BNZ-s'],
  model: { kip: 'kapali', ustSinir: 0 },
});
const ek = k.ek('ekran.png', 'png');
for (let i = 0; i < SAYFA_BOYU + 5; i += 1) {
  k.adim({ gun: 1, rol: 'ornek.depo', senaryo: 'BNZ-s', adim: `adim ${String(i)}`, tur: 'api', sonuc: i === 3 ? 'dustu' : 'gecti', sureMs: i,
    yontem: 'GET', yol: '/stok', beklenen: '200', gelen: i === 3 ? '500' : '200', ileti: null, ek: i === 3 ? [ek] : [] });
}

const al = (url, ek = {}) => app.inject({ method: 'GET', url, headers: { host: `127.0.0.1:${String(PORT)}` }, ...ek });

describe('izleme sunucusu', () => {
  it('yalnız 127.0.0.1 adresini dinler', () => { assert.equal(ADRES, '127.0.0.1'); });

  it('sayfa, betik, stil ve yerel chart.js servis edilir; CSP yalnız kendi kaynağı', async () => {
    for (const [yol, tur] of [['/', 'text/html'], ['/uygulama.js', 'text/javascript'], ['/stil.css', 'text/css'], ['/chart.js', 'text/javascript']]) {
      const c = await al(yol);
      assert.equal(c.statusCode, 200, yol);
      assert.match(c.headers['content-type'], new RegExp(tur));
      assert.match(c.headers['content-security-policy'], /default-src 'self'/);
      assert.equal(c.headers['x-content-type-options'], 'nosniff');
    }
    assert.match((await al('/chart.js')).body, /Chart/);
  });

  it('başka ad (DNS yeniden bağlama) reddedilir', async () => {
    const c = await app.inject({ method: 'GET', url: '/api/kosular', headers: { host: 'kotu.example:4200' } });
    assert.equal(c.statusCode, 421);
  });

  it('yazma yöntemi reddedilir', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const c = await al('/api/kosular', { method });
      assert.equal(c.statusCode, 405, method);
    }
  });

  it('koşu listesi ve ayrıntısı', async () => {
    const liste = (await al('/api/kosular')).json();
    assert.deepEqual(liste.kosular.map((x) => x.kosuId), ['kosu-a']);
    const a = (await al('/api/kosular/kosu-a')).json();
    assert.equal(a.adimSayisi, SAYFA_BOYU + 5);
    assert.equal(a.sonAdimlar[0].sira, SAYFA_BOYU + 4);
    assert.deepEqual(a.roller, ['ornek.depo']);
    assert.equal(a.yorumVar, false);
    assert.equal((await al('/api/kosular/yok')).statusCode, 404);
    assert.equal((await al('/api/kosular/..%2Fx')).statusCode, 400);
  });

  it('adımlar yeniden eskiye sayfalanır ve süzülür', async () => {
    const s0 = (await al('/api/kosular/kosu-a/adimlar')).json();
    assert.equal(s0.toplam, SAYFA_BOYU + 5);
    assert.equal(s0.adimlar.length, SAYFA_BOYU);
    assert.equal(s0.adimlar[0].sira, SAYFA_BOYU + 4);
    assert.equal((await al('/api/kosular/kosu-a/adimlar?sayfa=1')).json().adimlar.length, 5);
    const d = (await al('/api/kosular/kosu-a/adimlar?sonuc=dustu')).json();
    assert.deepEqual(d.adimlar.map((x) => x.sira), [3]);
    assert.equal((await al('/api/kosular/kosu-a/adimlar?sonuc=xx')).statusCode, 400);
    assert.equal((await al('/api/kosular/kosu-a/adimlar?gun=-1')).statusCode, 400);
  });

  it('adım ayrıntısı ve ek', async () => {
    const a = (await al('/api/kosular/kosu-a/adimlar/3')).json();
    assert.equal(a.gelen, '500');
    assert.deepEqual(a.ek, [{ yol: 'ekler/ekran.png', var: true, tur: 'image/png' }]);
    assert.equal((await al('/api/kosular/kosu-a/adimlar/9999')).statusCode, 404);
    const e = await al(`/api/kosular/kosu-a/ek?yol=${encodeURIComponent(ek)}`);
    assert.equal(e.statusCode, 200);
    assert.equal(e.headers['content-type'], 'image/png');
    assert.equal(e.body, 'png');
  });

  it('ek koşu klasörü dışına çıkamaz', async () => {
    for (const yol of ['ozet.json', '../kosu-a/ozet.json', 'ekler/../ozet.json', '/etc/passwd', 'ekler%5C..%5Cozet.json']) {
      const c = await al(`/api/kosular/kosu-a/ek?yol=${yol.includes('%') ? yol : encodeURIComponent(yol)}`);
      assert.equal(c.statusCode, 404, yol);
    }
  });

  it('yorum, eğilim ve ara sıra okunur', async () => {
    assert.deepEqual((await al('/api/kosular/kosu-a/yorum')).json(), { yorum: null });
    k.yorumYaz('BNZ');
    assert.deepEqual((await al('/api/kosular/kosu-a/yorum')).json(), { yorum: 'BNZ' });
    assert.equal((await al('/api/egilim')).json().kosular.length, 1);
    assert.deepEqual((await al('/api/ara-sira')).json(), { adimlar: [] });
  });
});
