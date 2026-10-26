import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, test } from 'node:test';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';

// Belge (`kurulum/yetki-matrisi.md`) rol göçlerinin okunur hâlidir. Göçlerin onaylı matrisle aynı olduğunu oturum modülünün
// matris testi ölçer; burada belgenin göçlerle aynı olduğu ölçülür. Sunucu testleri dosya okumaz, bu yüzden test araçlardadır.
describe('yetki matrisi belgesi rol göçleriyle aynıdır (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let belge = '';

  const kodlar = (metin: string): string[] => [...metin.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? '');

  before(async () => {
    ortam = await testVeritabaniKur('yetkibelge');
    belge = await readFile(new URL('../kurulum/yetki-matrisi.md', import.meta.url), 'utf8');
  });
  after(async () => { await ortam?.kaldir(); });

  test('rol başına ad, sayfa ve işlem kümeleri; yalnız yöneticide olanlar hiçbir rolde yoktur', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const roller = await ortam.vt.sorgu<{ kod: string; ad: string; yonetici: boolean; islemler: string[] }>(
      `SELECT r.kod, r.ad, r.yonetici, COALESCE(array_agg(ri.islem) FILTER (WHERE ri.islem IS NOT NULL), '{}') AS islemler
         FROM rol r LEFT JOIN rol_islemi ri ON ri.rol_id = r.id GROUP BY r.id`,
    );
    const hucreler = belge.split(/\r?\n/).filter((s) => /^\| `[a-z_]+` \|/.test(s)).map((s) => s.split('|').map((h) => h.trim()));
    const belgedeki = new Map(hucreler.map((h) => [kodlar(h[1] ?? '')[0] ?? '', { ad: h[2], sayfalar: kodlar(h[3] ?? ''), islemler: kodlar(h[4] ?? '') }]));
    assert.equal(roller.length > 1, true);
    assert.deepEqual([...belgedeki.keys()].sort(), roller.map((r) => r.kod).sort());

    for (const rol of roller) {
      const satir = belgedeki.get(rol.kod);
      assert.equal(satir?.ad, rol.ad, rol.kod);
      if (rol.yonetici) {
        // Bayraklı rol satır taşımaz ve belgede işlem saymaz: yeni işlem eklenince belge eskimesin.
        assert.deepEqual({ satirlar: rol.islemler, sayfalar: satir?.sayfalar, islemler: satir?.islemler }, { satirlar: [], sayfalar: [], islemler: [] }, rol.kod);
        continue;
      }
      assert.deepEqual([...(satir?.sayfalar ?? [])].sort(), rol.islemler.filter((i) => i.startsWith('sayfa.')).sort(), `${rol.kod} sayfalar`);
      assert.deepEqual([...(satir?.islemler ?? [])].sort(), rol.islemler.filter((i) => !i.startsWith('sayfa.')).sort(), `${rol.kod} işlemler`);
    }

    // "Yalnız yöneticide" bölümünde sayılan her işlem kayıtlıdır ve hiçbir rolde yoktur.
    const bolum = belge.split(/^## /m).find((b) => b.startsWith('Yalnız yöneticide')) ?? '';
    const verilenler = new Set(roller.flatMap((r) => r.islemler));
    const yalniz = kodlar(bolum).filter((k) => !verilenler.has(k));
    assert.deepEqual(yalniz.sort(), [
      'arkon.yonetici', 'denetim.govde-oku', 'guvenlik.oku', 'guvenlik.yonet', 'kisiler.parola-degistir', 'kisiler.rol-yonet', 'logo.birim-seti-yaz', 'oturum.ortak-cihaz',
      'saglik.ayrinti-oku', 'sayfa.guvenlik', 'smartes.esleme-yaz',
    ]);
    for (const islem of yalniz) assert.equal((ISLEMLER as readonly string[]).includes(islem), true, islem);
  });
});
