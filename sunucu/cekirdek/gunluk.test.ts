import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Veritabani } from './db.ts';
import { gunlukKur } from './gunluk.ts';
import type { GunlukNesnesi } from './gunluk.ts';
import { testSemasiAc } from './test-vt.ts';
import type { TestVeritabani } from './test-vt.ts';
import { uc, uclariKaydet } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';
import { isTanimi, isiBirKezCalistir } from './zamanlayici.ts';

// Veri biçimi hatası (22P02) iletisinde reddedilen değeri taşır; günlüğe değer sızmamalı.
const DEGERLI_SORGU = "SELECT 'gizli-deger-7'::int";

interface Satir { level: number; msg: string; uc?: string; is?: string; err?: { code?: string; message?: string } }

describe('işleyici ve zamanlanmış iş günlüğü (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const satirlar: string[] = [];

  const vt = (): Veritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const yakalanan = async (): Promise<unknown> => vt().sorgu(DEGERLI_SORGU).then(() => null, (hata: unknown) => hata);
  const okunan = (): Satir[] => satirlar.map((s) => JSON.parse(s) as Satir);

  before(async () => {
    ortam = await testSemasiAc('gunluk');
    app = Fastify({ logger: { level: 'warn', stream: { write: (s: string) => { satirlar.push(s); } } } });
    hataYonetiminiKur(app);
    uclariKaydet(app, [
      uc({
        yontem: 'GET', yol: '/yutar', yetki: 'acik', cevap: z.object({ tamam: z.literal(true) }),
        isle: async ({ gunluk }) => {
          gunluk.uyar('Kilit alınamadı, sürdürülüyor');
          gunluk.hata('Emir okunamadı, sürdürülüyor', await yakalanan());
          return { tamam: true as const };
        },
      }),
    ], { vt: vt(), kimlik: async () => null, modul: 'deneme' });
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('uç işleyicisi yuttuğu hatayı uç adıyla yazar; veritabanı hatası süzgeçten geçer, değer sızmaz; cevap değişmez', async () => {
    satirlar.length = 0;
    const cevap = await app.inject({ method: 'GET', url: '/api/yutar' });
    assert.equal(cevap.statusCode, 200, cevap.body);

    const [uyari, hata] = okunan().filter((s) => s.uc === 'GET /yutar');
    assert.deepEqual({ level: uyari?.level, msg: uyari?.msg, err: uyari?.err }, { level: 40, msg: 'Kilit alınamadı, sürdürülüyor', err: undefined });
    assert.equal(hata?.level, 50);
    assert.equal(hata?.msg, 'Emir okunamadı, sürdürülüyor');
    assert.equal(hata?.err?.code, '22P02');
    assert.equal(satirlar.join('\n').includes('gizli-deger-7'), false);
  });

  test('zamanlanmış iş yuttuğu hatayı iş adıyla yazar; günlük işin sonucunu değiştirmez', async () => {
    const yazilan: { nesne: GunlukNesnesi; mesaj: string; duzey: string }[] = [];
    const ham = {
      warn: (nesne: GunlukNesnesi, mesaj: string) => { yazilan.push({ nesne, mesaj, duzey: 'warn' }); },
      error: (nesne: GunlukNesnesi, mesaj: string) => { yazilan.push({ nesne, mesaj, duzey: 'error' }); },
    };
    const is = isTanimi({
      ad: 'yutan-is', aralikMs: 5000,
      calis: async (_db, gunluk) => { gunluk.hata('Satır atlandı', await yakalanan()); },
    });
    assert.equal(await isiBirKezCalistir(vt(), is, ham), 'tamam');
    assert.equal(yazilan.length, 1);
    assert.equal(yazilan[0]?.duzey, 'error');
    assert.equal(yazilan[0]?.mesaj, 'Satır atlandı');
    assert.equal(yazilan[0]?.nesne.is, 'yutan-is');
    assert.equal((yazilan[0]?.nesne.err as { code?: string } | undefined)?.code, '22P02');
    assert.equal(JSON.stringify(yazilan).includes('gizli-deger-7'), false);
  });
});

test('günlüğe yazılamaması yazanı düşürmez; veritabanı dışı hata olduğu gibi geçer', () => {
  const bozuk = gunlukKur({ warn: () => { throw new Error('disk dolu'); }, error: () => { throw new Error('disk dolu'); } }, { uc: 'x' });
  assert.doesNotThrow(() => { bozuk.uyar('a'); bozuk.hata('b', new Error('c')); });

  const yazilan: GunlukNesnesi[] = [];
  const gunluk = gunlukKur({ warn: () => undefined, error: (nesne) => { yazilan.push(nesne); } }, { is: 'y' });
  const hata = new TypeError('beklenmeyen');
  gunluk.hata('d', hata);
  assert.deepEqual(yazilan, [{ is: 'y', err: hata }]);
});
