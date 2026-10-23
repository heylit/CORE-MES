import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { oturumsuzIstemci } from './senaryo.ts';

interface Gelen { yontem: string; yol: string; basliklar: IncomingHttpHeaders; govde: string }

describe('oturumsuz istemci', () => {
  const gelenler: Gelen[] = [];
  const sunucu = createServer((istek, yanit) => {
    let govde = '';
    istek.on('data', (p: Buffer) => { govde += p.toString(); });
    istek.on('end', () => {
      gelenler.push({ yontem: istek.method ?? '', yol: istek.url ?? '', basliklar: istek.headers, govde });
      if (istek.url === '/duz') {
        yanit.writeHead(200, { 'content-type': 'text/plain' }).end('düz metin');
        return;
      }
      yanit.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ hata: 'oturum-yok' }));
    });
  });
  let kok = '';
  before(async () => {
    await new Promise<void>((r) => { sunucu.listen(0, '127.0.0.1', r); });
    kok = `http://127.0.0.1:${String((sunucu.address() as AddressInfo).port)}`;
  });
  after(() => { sunucu.close(); });

  it('yazmada çerezsiz, JSON gövdeli ve istek kimlikli gönderir; JSON cevabı çözer', async () => {
    const c = await oturumsuzIstemci(kok).istek('POST', '/api/bnz/1/kaydet', {});
    assert.deepEqual(c, { durum: 401, govde: { hata: 'oturum-yok' } });
    const g = gelenler.at(-1);
    assert.equal(g?.yontem, 'POST');
    assert.equal(g.yol, '/api/bnz/1/kaydet');
    assert.equal(g.govde, '{}');
    assert.equal(g.basliklar['content-type'], 'application/json');
    assert.match(String(g.basliklar['istek-kimligi']), /^[0-9a-f-]{36}$/);
    assert.equal(g.basliklar.cookie, undefined);
  });

  it('okumada gövde ve istek kimliği yoktur; düz metin olduğu gibi döner', async () => {
    const c = await oturumsuzIstemci(kok).istek('GET', '/duz');
    assert.deepEqual(c, { durum: 200, govde: 'düz metin' });
    const g = gelenler.at(-1);
    assert.equal(g?.govde, '');
    assert.equal(g.basliklar['content-type'], undefined);
    assert.equal(g.basliklar['istek-kimligi'], undefined);
  });
});
