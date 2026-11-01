import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { istekOlcumunuKur } from './istek-olcumu.ts';
import { testSemasiAc } from './test-vt.ts';
import type { TestVeritabani } from './test-vt.ts';
import { uc, uclariKaydet } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';

// Yavaşlık ölçülmeden düzeltilemez: her uç cevabında süre ve o isteğin sorgu sayısı yerel günlüğe bir satır
// yazılır, eşiği geçen uç ayrı iletiyle ayrılır. Satır kalıbı, sorgu dizgesiz yolu ve istemci adresini taşır; sorgu metni girmez.
describe('uç süresi ve sorgu sayısı günlüğü (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  // Eşik uygulamaya göre seçilir: sayım testi yüklü makinede de yavaş sayılmasın, eşik testi kesin yavaş olsun.
  let sayimApp: FastifyInstance;
  let esikApp: FastifyInstance;
  const gunluk: string[] = [];
  const satirlar = (msg: string): Array<Record<string, unknown>> =>
    gunluk.map((s) => JSON.parse(s) as Record<string, unknown>).filter((s) => s.msg === msg);
  // Ölçüm satırı cevap gönderildikten sonra yazılır; inject sözü ondan önce çözülebilir. Satır sayısı beklenir, süresi ölçülmez.
  const satirBekle = async (adet: number): Promise<void> => {
    for (let i = 0; i < 200 && gunluk.filter((s) => s.includes('"Uç süresi"') || s.includes('"Yavaş uç"')).length < adet; i += 1) {
      await new Promise((coz) => setTimeout(coz, 10));
    }
  };

  const kur = (db: TestVeritabani, yavasMs: number): FastifyInstance => {
    const app = Fastify({ logger: { level: 'info', stream: { write: (s: string) => { gunluk.push(s); } } } });
    hataYonetiminiKur(app);
    istekOlcumunuKur(app, { yavasMs });
    const cevap = z.object({ n: z.number() });
    uclariKaydet(
      app,
      [
        uc({
          yontem: 'GET', yetki: 'acik', yol: '/uc-sayi/:kac', parametre: z.object({ kac: z.coerce.number() }), cevap,
          isle: async ({ db: d, parametre }) => {
            for (let i = 0; i < parametre.kac; i += 1) await d.sorgu('SELECT 1');
            return { n: parametre.kac };
          },
        }),
        uc({
          yontem: 'GET', yetki: 'acik', yol: '/uc-yavas', cevap,
          isle: async ({ db: d }) => {
            await d.sorgu('SELECT pg_sleep(0.3)');
            return { n: 1 };
          },
        }),
      ],
      { vt: db.vt, kimlik: async () => null },
    );
    return app;
  };

  before(async () => {
    ortam = await testSemasiAc('istek_olcumu');
    sayimApp = kur(ortam, 60_000);
    esikApp = kur(ortam, 150);
  });

  after(async () => {
    await sayimApp?.close();
    await esikApp?.close();
    await ortam?.kaldir();
  });

  test('her istek yol kalıbı, sorgu dizgesiz yol, istemci adresi, durum, süre ve kendi sorgu sayısıyla bir satır yazar; eşzamanlı istekler karışmaz', async () => {
    gunluk.length = 0;
    const cevaplar = await Promise.all([3, 5, 0].map((kac) => sayimApp.inject({ method: 'GET', url: `/api/uc-sayi/${String(kac)}?gizli=deger-91` })));
    for (const c of cevaplar) assert.equal(c.statusCode, 200, c.body);
    await satirBekle(3);
    const olcumler = satirlar('Uç süresi');
    assert.equal(olcumler.length, 3);
    assert.deepEqual(olcumler.map((s) => s.sorgu).sort(), [0, 3, 5]);
    for (const s of olcumler) {
      assert.equal(s.yontem, 'GET');
      assert.equal(s.yol, '/api/uc-sayi/:kac');
      assert.match(String(s.adres), /^\/api\/uc-sayi\/[035]$/);
      assert.equal(s.ip, '127.0.0.1');
      assert.equal(s.durum, 200);
      assert.equal(typeof s.sureMs, 'number');
    }
    assert.equal(gunluk.filter((s) => s.includes('"Uç süresi"') || s.includes('"Yavaş uç"')).join('').includes('deger-91'), false);
    assert.equal(satirlar('Yavaş uç').length, 0);
  });

  test('eşiği geçen uç "Yavaş uç" uyarısıyla ayrılır', async () => {
    gunluk.length = 0;
    const c = await esikApp.inject({ method: 'GET', url: '/api/uc-yavas' });
    assert.equal(c.statusCode, 200, c.body);
    await satirBekle(1);
    const yavas = satirlar('Yavaş uç');
    assert.equal(yavas.length, 1);
    assert.equal(yavas[0]?.level, 40);
    assert.equal(yavas[0]?.yol, '/api/uc-yavas');
    assert.equal(yavas[0]?.sorgu, 1);
    assert.ok((yavas[0]?.sureMs as number) >= 150);
    assert.equal(satirlar('Uç süresi').length, 0);
  });
});
