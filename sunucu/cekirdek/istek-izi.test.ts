import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import Fastify from 'fastify';
import { IZ_ALANI, etkinIz, istekIziniKur, istekIziUret, izIle, izKarisimi } from './istek-izi.ts';
import { gunlukKur } from './uygulama.ts';


test('iz: bağlam içinde görünür, dışında yoktur; karışım yalnız bağlamda alan verir', () => {
  assert.equal(etkinIz(), undefined);
  assert.deepEqual(izKarisimi({}, 30), {});
  izIle('ab12cd34', () => {
    assert.equal(etkinIz(), 'ab12cd34');
    assert.deepEqual(izKarisimi({}, 30), { [IZ_ALANI]: 'ab12cd34' });
    assert.deepEqual(izKarisimi({}, 30, { bindings: () => ({ [IZ_ALANI]: 'ab12cd34' }) }), {});
  });
  assert.equal(etkinIz(), undefined);
  assert.match(istekIziUret(), /^[0-9a-f]{8}$/);
});

test('iz: istekte uygulama günlüğüne yazılan satır isteğin izini taşır; istek günlüğü izi bir kez yazar; istek dışı satır izsizdir', async () => {
  const ayar = gunlukKur('canli', mkdtempSync(join(tmpdir(), 'tmiv2-iz-')), 'linux');
  assert.notEqual(ayar, false);
  if (ayar === false) return;
  // Sunucunun günlük ayarı, yalnız çıktı belleğe alınır.
  const ham: string[] = [];
  const logger = { ...ayar, stream: { write: (satir: string): void => { ham.push(satir); } } };
  const app = Fastify({ logger, genReqId: istekIziUret, requestIdHeader: false });
  istekIziniKur(app);
  app.get('/yaz', async (istek) => {
    await new Promise((coz) => setImmediate(coz));
    app.log.warn('uygulama satırı');
    istek.log.warn('istek satırı');
    return { iz: istek.id };
  });
  const cevap = await app.inject({ method: 'GET', url: '/yaz' });
  app.log.warn('istek dışı satır');
  await app.close();
  const { iz } = cevap.json<{ iz: string }>();
  assert.match(iz, /^[0-9a-f]{8}$/);
  const hepsi = ham.map((satir) => JSON.parse(satir) as Record<string, unknown>);
  const bul = (msg: string): Record<string, unknown> | undefined => hepsi.find((s) => s['msg'] === msg);
  assert.equal(bul('uygulama satırı')?.[IZ_ALANI], iz);
  assert.equal(bul('istek satırı')?.[IZ_ALANI], iz);
  assert.equal(bul('istek dışı satır')?.[IZ_ALANI], undefined);
  const istekSatiri = ham.find((satir) => satir.includes('istek satırı')) ?? '';
  assert.equal(istekSatiri.split(`"${IZ_ALANI}"`).length - 1, 1);
});
