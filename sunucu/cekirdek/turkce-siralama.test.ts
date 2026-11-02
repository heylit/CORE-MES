import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { turkceKarsilastir } from '#paylasilan/siralama.ts';
import { testVeritabaniKur } from './test-vt.ts';

describe('public.tr harmanlaması (gerçek PostgreSQL)', () => {
  let ortam: Awaited<ReturnType<typeof testVeritabaniKur>> | undefined;
  before(async () => { ortam = await testVeritabaniKur('turkce_siralama'); });
  after(async () => { await ortam?.kaldir(); });
  const acik = () => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam; };

  test('ORDER BY ... COLLATE public.tr istemcideki Türkçe sırayla aynı dizer; uygulama kullanıcısı kullanabilir', async () => {
    const adlar = ['Zeki', 'Çelik', 'cam', 'Ilgaz', 'İnce', 'ışık', 'Öz', 'Ordu', 'Şahin', 'Sarı', 'Ünal', 'Uslu', 'ORN-10', 'ORN-2'];
    const satirlar = await acik().vt.sorgu<{ ad: string }>(
      'SELECT ad FROM unnest($1::text[]) AS t(ad) ORDER BY ad COLLATE public.tr', [adlar],
    );
    assert.deepEqual(satirlar.map((s) => s.ad), [...adlar].sort(turkceKarsilastir));
  });
});
