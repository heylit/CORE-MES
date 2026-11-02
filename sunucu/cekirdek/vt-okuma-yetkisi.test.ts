import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from './test-vt.ts';
import type { TestVeritabani } from './test-vt.ts';

// Yedek (pg_dump) uygulama kullanıcısıyla koşar ve şemadaki her tabloyu, her diziyi okumak zorundadır: okuyamadığı tek nesne
// bütün yedeği, güncelleyicinin ön yedeğini ve geri yüklemenin ön yedeğini düşürür. Yeni tabloyu REVOKE ile açan göç
// burada kırmızı olur; okuma ayrıca verilmelidir (yazma kapalı kalabilir).
describe('uygulama kullanıcısı şemadaki her tabloyu ve diziyi okuyabilir: yedek düşmez (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => { ortam = await testVeritabaniKur('okuma_yetkisi'); });
  after(async () => { await ortam?.kaldir(); });

  // pg_dump'ın verisini ya da değerini okuduğu nesneler: tablo, bölümlü tablo, gerçekleşmiş görünüm, yabancı tablo, dizi.
  const okunamayanlar = async (): Promise<string[]> => {
    const { sahip, ayar, sema } = acik();
    const satirlar = await sahip.sorgu<{ ad: string }>(
      `SELECT c.relname::text AS ad FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relkind IN ('r', 'p', 'm', 'f', 'S')
          AND NOT has_table_privilege($2, c.oid, 'SELECT')
        ORDER BY 1`,
      [sema, ayar.pg.kullanici],
    );
    return satirlar.map((s) => s.ad);
  };

  test('göçlerden sonra okunamayan tablo ya da dizi yoktur', async () => {
    const { sahip, sema } = acik();
    const sayi = await sahip.tek<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relkind IN ('r', 'p')",
      [sema],
    );
    assert.ok((sayi?.n ?? 0) > 100, 'şemada göç tabloları olmalı; boş şemada denetim bir şey kanıtlamaz');
    assert.deepEqual(await okunamayanlar(), []);
  });

  test('okuma geri alınırsa denetim tabloyu adıyla yakalar; yeniden verilince temizlenir', async () => {
    const { sahip, ayar } = acik();
    const rol = `"${ayar.pg.kullanici.replaceAll('"', '""')}"`;
    await sahip.sorgu(`REVOKE SELECT ON stok_bakiye_defter_bekleyen FROM ${rol}`);
    try {
      assert.deepEqual(await okunamayanlar(), ['stok_bakiye_defter_bekleyen']);
    } finally {
      await sahip.sorgu(`GRANT SELECT ON stok_bakiye_defter_bekleyen TO ${rol}`);
    }
    assert.deepEqual(await okunamayanlar(), []);
  });
});
