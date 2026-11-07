import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, test } from 'node:test';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { ROL_MATRISI, YALNIZ_YONETICIDE, YONETICI_ROLU } from './yetki-beklentisi.ts';

// Beklenen matris (`araclar/yetki-beklentisi.ts`) testlerin tek beklentisidir. Burada üç yerin aynı olduğu ölçülür: rol göçlerinin
// kurduğu veritabanı, beklenen matris ve okunur belge (`kurulum/yetki-matrisi.md`). Sunucu testleri dosya okumaz, belge karşılaştırması
// bu yüzden araçlardadır.
describe('yetki matrisi: rol göçleri, beklenen matris ve belge aynıdır (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let belge = '';

  const kodlar = (metin: string): string[] => [...metin.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? '');
  const sirali = (liste: readonly string[]): string[] => [...liste].sort();
  const beklenenRoller = (): Array<{ kod: string; ad: string; islemler: readonly string[] }> =>
    Object.entries(ROL_MATRISI).map(([kod, rol]) => ({ kod, ad: rol.ad, islemler: rol.islemler }));

  before(async () => {
    ortam = await testVeritabaniKur('yetkibelge');
    belge = await readFile(new URL('../kurulum/yetki-matrisi.md', import.meta.url), 'utf8');
  });
  after(async () => { await ortam?.kaldir(); });

  test('beklenen matris kendi içinde tutarlıdır: işlemler kayıtlı, tekrarsız; yalnız yöneticide olan hiçbir rolde yoktur', () => {
    assert.equal(beklenenRoller().length > 1, true);
    for (const rol of beklenenRoller()) {
      assert.equal(new Set(rol.islemler).size, rol.islemler.length, `${rol.kod} tekrar eden işlem`);
      for (const islem of rol.islemler) assert.equal((ISLEMLER as readonly string[]).includes(islem), true, `${rol.kod}: ${islem}`);
      for (const islem of YALNIZ_YONETICIDE) assert.equal(rol.islemler.includes(islem), false, `${rol.kod}: ${islem}`);
    }
    assert.equal(YALNIZ_YONETICIDE.length > 0, true);
    for (const islem of YALNIZ_YONETICIDE) assert.equal((ISLEMLER as readonly string[]).includes(islem), true, islem);
  });

  test('rol göçleri beklenen matrisi kurar: roller, adlar, bayrak ve rol x işlem satırları birebir', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const roller = await ortam.vt.sorgu<{ kod: string; ad: string; yonetici: boolean }>('SELECT kod, ad, yonetici FROM rol ORDER BY kod');
    assert.deepEqual(
      roller,
      [{ kod: YONETICI_ROLU.kod, ad: YONETICI_ROLU.ad, yonetici: true }, ...beklenenRoller().map((r) => ({ kod: r.kod, ad: r.ad, yonetici: false }))]
        .sort((a, b) => a.kod.localeCompare(b.kod)),
    );
    // Bayraklı rol satır taşımaz.
    const satirlar = (await ortam.vt.sorgu<{ kod: string; islem: string }>('SELECT r.kod, ri.islem FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id'))
      .map((s) => `${s.kod}:${s.islem}`).sort();
    assert.deepEqual(satirlar, beklenenRoller().flatMap((r) => r.islemler.map((i) => `${r.kod}:${i}`)).sort());
  });

  test('belge beklenen matrisin okunur hâlidir: rol başına ad, sayfa ve işlem kümeleri; yalnız yöneticide listesi', () => {
    const hucreler = belge.split(/\r?\n/).filter((s) => /^\| `[a-z_]+` \|/.test(s)).map((s) => s.split('|').map((h) => h.trim()));
    const belgedeki = new Map(hucreler.map((h) => [kodlar(h[1] ?? '')[0] ?? '', { ad: h[2], sayfalar: kodlar(h[3] ?? ''), islemler: kodlar(h[4] ?? '') }]));
    assert.deepEqual(sirali([...belgedeki.keys()]), sirali([YONETICI_ROLU.kod, ...Object.keys(ROL_MATRISI)]));
    // Bayraklı rol belgede işlem saymaz: yeni işlem eklenince belge eskimesin.
    assert.deepEqual(belgedeki.get(YONETICI_ROLU.kod), { ad: YONETICI_ROLU.ad, sayfalar: [], islemler: [] });
    for (const rol of beklenenRoller()) {
      const satir = belgedeki.get(rol.kod);
      assert.equal(satir?.ad, rol.ad, rol.kod);
      assert.deepEqual(sirali(satir?.sayfalar ?? []), sirali(rol.islemler.filter((i) => i.startsWith('sayfa.'))), `${rol.kod} sayfalar`);
      assert.deepEqual(sirali(satir?.islemler ?? []), sirali(rol.islemler.filter((i) => !i.startsWith('sayfa.'))), `${rol.kod} işlemler`);
    }
    const bolum = belge.split(/^## /m).find((b) => b.startsWith('Yalnız yöneticide')) ?? '';
    // Bölüm, yalnız yöneticide olmayan bir işlemi açıklama için anabilir; o işlem bir rolde olduğundan sayılmaz.
    const verilenler = new Set(beklenenRoller().flatMap((r) => r.islemler));
    assert.deepEqual(sirali(kodlar(bolum).filter((k) => !verilenler.has(k))), sirali(YALNIZ_YONETICIDE));
  });
});
