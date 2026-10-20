import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { after, before, describe, test } from 'node:test';
import { ICERIK_ILKESI } from '../../istemci/src/ortak/pwa/icerik-ilkesi.ts';
import { CALISAN_ILKESI, icerikIlkesi } from '../../arkon/sun.ts';
import { arayuzIsleyicisi, arayuzPortuOku } from './arayuz.ts';

const SAYFA = '<!doctype html><html><head></head><body><div id="kok"></div></body></html>';
const ARKON_SAYFASI = '<!doctype html><html><body><script>window.x=1</script></body></html>';
const BUYUK_BETIK = `export const a = "${'x'.repeat(4000)}";`;

describe('arayüz kapısı', () => {
  let kok = '';
  let sunucu: Server;
  let adres = '';
  const apiIstekleri: string[] = [];

  before(async () => {
    kok = await mkdtemp(join(tmpdir(), 'tmi-arayuz-'));
    await mkdir(join(kok, 'assets'), { recursive: true });
    await mkdir(join(kok, 'arkon-mes', 'vendor', 'occt'), { recursive: true });
    await writeFile(join(kok, 'index.html'), SAYFA);
    await writeFile(join(kok, 'assets', 'index-AbCd1234.js'), BUYUK_BETIK);
    await writeFile(join(kok, 'sw.js'), 'self.addEventListener("fetch", () => {});');
    await writeFile(join(kok, 'manifest.webmanifest'), '{}');
    await writeFile(join(kok, 'arkon-mes', 'index.html'), ARKON_SAYFASI);
    await writeFile(join(kok, 'arkon-mes', 'vendor', 'occt', 'step-calisan.js'), '// calisan');
    await writeFile(join(tmpdir(), 'tmi-arayuz-disari.txt'), 'gizli');
    const isle = arayuzIsleyicisi({
      kok,
      api: (istek, yanit) => {
        apiIstekleri.push(`${istek.method ?? ''} ${istek.url ?? ''}`);
        yanit.setHeader('Content-Type', 'application/json');
        yanit.end('{"api":true}');
      },
    });
    sunucu = createServer(isle);
    await new Promise<void>((coz) => { sunucu.listen(0, '127.0.0.1', coz); });
    const a = sunucu.address();
    assert.ok(a !== null && typeof a === 'object');
    adres = `http://127.0.0.1:${String(a.port)}`;
  });
  after(async () => {
    await new Promise<void>((coz) => { sunucu.close(() => { coz(); }); });
    await rm(kok, { recursive: true, force: true });
    await rm(join(tmpdir(), 'tmi-arayuz-disari.txt'), { force: true });
  });

  test('/api istekleri olduğu gibi uygulamaya gider; /apix gibi benzer yol gitmez', async () => {
    const cevap = await fetch(`${adres}/api/saglik?x=1`, { method: 'POST', body: '{}' });
    assert.equal(await cevap.text(), '{"api":true}');
    assert.deepEqual(apiIstekleri, ['POST /api/saglik?x=1']);
    const benzer = await fetch(`${adres}/apix`);
    assert.equal(benzer.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(apiIstekleri.length, 1);
  });

  test('sayfa ve ekran adresleri index.html ile, uygulamanın içerik ilkesiyle açılır', async () => {
    for (const yol of ['/', '/uretim-emirleri/12', '/profil?sekme=pin']) {
      const cevap = await fetch(`${adres}${yol}`);
      assert.equal(cevap.status, 200, yol);
      assert.equal(await cevap.text(), SAYFA, yol);
      assert.equal(cevap.headers.get('content-security-policy'), ICERIK_ILKESI, yol);
      assert.equal(cevap.headers.get('cache-control'), 'no-cache', yol);
      assert.equal(cevap.headers.get('x-content-type-options'), 'nosniff', yol);
    }
  });

  test('özetli dosya kalıcı önbellekle, gzip isteyene sıkıştırılmış gider; ETag eşleşirse 304', async () => {
    const cevap = await fetch(`${adres}/assets/index-AbCd1234.js`, { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(cevap.status, 200);
    assert.equal(cevap.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(cevap.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(await cevap.text(), BUYUK_BETIK);
    const etiket = cevap.headers.get('etag');
    assert.ok(etiket !== null);
    const tekrar = await fetch(`${adres}/assets/index-AbCd1234.js`, { headers: { 'if-none-match': etiket, 'accept-encoding': 'gzip' } });
    assert.equal(tekrar.status, 304);
    const ham = await new Promise<{ kodlama: string | undefined; govde: Buffer }>((coz, red) => {
      void import('node:http').then(({ get }) => {
        get(`${adres}/assets/index-AbCd1234.js`, { headers: { 'accept-encoding': 'gzip' } }, (y) => {
          const parcalar: Buffer[] = [];
          y.on('data', (p: Buffer) => parcalar.push(p));
          y.on('end', () => { coz({ kodlama: y.headers['content-encoding'], govde: Buffer.concat(parcalar) }); });
        }).on('error', red);
      });
    });
    assert.equal(ham.kodlama, 'gzip');
    assert.equal(gunzipSync(ham.govde).toString('utf8'), BUYUK_BETIK);
  });

  test('bildirim ve service worker kendi türüyle ve sorarak önbellekle gider', async () => {
    const bildirim = await fetch(`${adres}/manifest.webmanifest`);
    assert.equal(bildirim.headers.get('content-type'), 'application/manifest+json; charset=utf-8');
    const calisan = await fetch(`${adres}/sw.js`);
    assert.equal(calisan.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(calisan.headers.get('cache-control'), 'no-cache');
  });

  test('Arkon sayfası kendi ilkesiyle, STEP çalışanı çalışan ilkesiyle gider; Arkon dışı yolda ilke değişmez', async () => {
    const sayfa = await fetch(`${adres}/arkon-mes/`);
    assert.equal(await sayfa.text(), ARKON_SAYFASI);
    assert.equal(sayfa.headers.get('content-security-policy'), icerikIlkesi(ARKON_SAYFASI));
    const calisan = await fetch(`${adres}/arkon-mes/vendor/occt/step-calisan.js`);
    assert.equal(calisan.headers.get('content-security-policy'), CALISAN_ILKESI);
    const olmayan = await fetch(`${adres}/arkon-mes/yok.js`);
    assert.equal(olmayan.status, 404);
  });

  test('bulunmayan uzantılı dosya 404; kök dışına çıkan ve bozuk kodlu yol dosya vermez', async () => {
    assert.equal((await fetch(`${adres}/assets/yok-AbCd1234.js`)).status, 404);
    for (const yol of ['/..%2ftmi-arayuz-disari.txt', '/%2e%2e/tmi-arayuz-disari.txt', '/assets/%E0%A4%A']) {
      const cevap = await fetch(`${adres}${yol}`);
      assert.notEqual(await cevap.text(), 'gizli', yol);
      assert.ok(cevap.status === 400 || cevap.status === 404, `${yol}: ${String(cevap.status)}`);
    }
  });

  test('HEAD gövdesiz cevap verir; dosya yolunda yazma isteği 405', async () => {
    const bas = await fetch(`${adres}/`, { method: 'HEAD' });
    assert.equal(bas.status, 200);
    assert.equal(await bas.text(), '');
    const yaz = await fetch(`${adres}/`, { method: 'POST', body: 'x' });
    assert.equal(yaz.status, 405);
    assert.equal(yaz.headers.get('allow'), 'GET, HEAD');
  });

  test('derlenmemiş istemcide sayfa yerine ne yapılacağını söyleyen 503 döner', async () => {
    const bos = await mkdtemp(join(tmpdir(), 'tmi-arayuz-bos-'));
    const s = createServer(arayuzIsleyicisi({ kok: bos, api: (_i, y) => { y.end(); } }));
    await new Promise<void>((coz) => { s.listen(0, '127.0.0.1', coz); });
    try {
      const a = s.address();
      assert.ok(a !== null && typeof a === 'object');
      const cevap = await fetch(`http://127.0.0.1:${String(a.port)}/`);
      assert.equal(cevap.status, 503);
      assert.match(await cevap.text(), /npm run derle:istemci/);
    } finally {
      await new Promise<void>((coz) => { s.close(() => { coz(); }); });
      await rm(bos, { recursive: true, force: true });
    }
  });
});

test('arayüz kapısı TMIV2_ARAYUZ_PORT ile değişir; verilmezse 4101; API kapısıyla aynı olamaz', () => {
  assert.equal(arayuzPortuOku({}, 4100), 4101);
  assert.equal(arayuzPortuOku({ TMIV2_ARAYUZ_PORT: ' 8443 ' }, 4100), 8443);
  assert.throws(() => arayuzPortuOku({ TMIV2_ARAYUZ_PORT: 'abc' }, 4100), /TMIV2_ARAYUZ_PORT/);
  assert.throws(() => arayuzPortuOku({ TMIV2_ARAYUZ_PORT: '70000' }, 4100), /TMIV2_ARAYUZ_PORT/);
  assert.throws(() => arayuzPortuOku({ TMIV2_ARAYUZ_PORT: '4100' }, 4100), /TMIV2_PORT/);
});
