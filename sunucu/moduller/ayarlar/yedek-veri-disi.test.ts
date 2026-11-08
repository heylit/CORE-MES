import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { promisify } from 'node:util';
import { semayiSil, testSemaAdi, testVeritabaniKur, type TestVeritabani } from '#cekirdek/test-vt.ts';
import { YEDEKTE_VERISI_ALINMAYAN_TABLOLAR } from '#cekirdek/yedek-disi.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { aracAnaSurumu, sunucuAnaSurumu } from './kurallar.ts';
import { veriAlinmayanArgumanlari, yedekOrtamiOku } from './yedek.ts';

const calistir = promisify(execFile);

// 2339-S CEO kararı a: türetilmiş tablonun satırları yedeğe girmez, yapısı girer. Gerçek pg_dump ve pg_restore ile: test şeması yedeklenir,
// şema kenara alınıp yedekten geri yüklenir, sayılar karşılaştırılır, sonra şema geri konur. pg_dump sunucudan eskiyse ya da yoksa
// (sürüm denetimi 2306 aynı nedenle yedek almaz) test atlanır ve nedenini yazar. Satırlar uydurmadır.
describe('ayarlar yedeği: verisi alınmayan tablo (gerçek PostgreSQL, gerçek pg_dump ve pg_restore)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';
  let atla: string | false = false;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const pgDump = yedekOrtamiOku().pgDump;
  const pgRestore = /[\\/]/.test(pgDump.dosya)
    ? path.join(path.dirname(pgDump.dosya), `pg_restore${path.extname(pgDump.dosya)}`)
    : 'pg_restore';
  const baglanti = (): string[] => {
    const a = o().ayar;
    return [`--host=${a.pg.host}`, `--port=${String(a.pg.port)}`, `--username=${a.goc.kullanici}`, `--dbname=${a.pg.veritabani}`, '--no-password'];
  };
  const pgOrtami = (): NodeJS.ProcessEnv => ({ ...process.env, PGPASSWORD: o().ayar.goc.parola });
  const adim = async <T>(ad: string, p: Promise<T>): Promise<T> => { try { return await p; } catch (h) { throw new Error(`${ad}: ${(h as { stderr?: string }).stderr ?? String(h)}`); } };
  const say = async (tablo: string): Promise<number> => (await o().sahip.tek<{ n: number }>(`SELECT count(*)::int AS n FROM ${tablo}`))!.n;

  before(async () => {
    ortam = await testVeritabaniKur('ayarlar_yedek_veri_disi');
    klasor = mkdtempSync(path.join(tmpdir(), 'yedek-veri-disi-'));
    let arac: number | null = null;
    try {
      arac = aracAnaSurumu((await calistir(pgDump.dosya, [...pgDump.onEk, '--version'])).stdout);
    } catch { /* araç yok: aşağıda atlanır */ }
    const sunucu = sunucuAnaSurumu((await o().sahip.tek<{ v: number }>("SELECT current_setting('server_version_num')::int AS v"))?.v ?? null);
    if (arac === null) atla = `pg_dump bulunamadı (${pgDump.dosya})`;
    else if (sunucu === null || arac < sunucu) atla = `pg_dump ${String(arac)} sunucudan (${String(sunucu)}) eski`;
    const kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    await ortam.sahip.sorgu(
      "INSERT INTO arkon_belge (depo, kimlik, govde, surum, degistiren_id) VALUES ('pkgs', 'tmi-ie-1', '{\"status\":\"published\"}', 1, $1), ('kv', 'mode', '{}', 1, $1)",
      [kisiId],
    );
    await ortam.sahip.sorgu(
      `INSERT INTO arkon_pdf_goruntu (kaynak, sayfa, imza, genislik, yukseklik, png, sure_ms)
       VALUES ($1, 1, 'r1.a.net.b1.hi.14171c', 10, 10, '\\x89504e47'::bytea, 5), ($1, 1, 'r1.k.net.b1.hi.f2f4f7', 10, 10, '\\x89504e47'::bytea, 5)`,
      ['a'.repeat(64)],
    );
  });
  after(async () => {
    if (klasor) rmSync(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('liste çekirdektedir; argüman tam adla, jokersiz yazılır', () => {
    assert.deepEqual([...YEDEKTE_VERISI_ALINMAYAN_TABLOLAR], ['arkon_pdf_goruntu']);
    assert.deepEqual(veriAlinmayanArgumanlari(), ['--exclude-table-data=public.arkon_pdf_goruntu']);
    for (const a of veriAlinmayanArgumanlari()) assert.doesNotMatch(a, /[*?]/);
  });

  test('geri yüklemeden sonra arkon_pdf_goruntu vardır ve boştur; öbür tabloların satırları tamdır', async (t) => {
    if (atla) { t.skip(atla); return; }
    // Kenara alınan şema da test adı biçimindedir: paralel koşan testlerin artık temizliği onu artık sayıp silmez.
    const sema = o().sema, kenar = testSemaAdi('ayarlar_yedek_kenar'), dosya = path.join(klasor, 'yedek.dump');
    const once = { kisi: await say('kisi'), belge: await say('arkon_belge'), goc: await say('goc_kaydi') };
    assert.equal(await say('arkon_pdf_goruntu'), 2);
    await adim('pg_dump', calistir(pgDump.dosya, [...pgDump.onEk, '--format=custom', `--schema=${sema}`, `--file=${dosya}`, ...veriAlinmayanArgumanlari(sema), ...baglanti()], { env: pgOrtami() }));
    await o().sahip.sorgu(`ALTER SCHEMA ${sema} RENAME TO ${kenar}`);
    try {
      await adim('pg_restore', calistir(pgRestore, ['--exit-on-error', '--no-owner', '--no-privileges', ...baglanti(), dosya], { env: pgOrtami() }));
      const tablo = await o().sahip.tek<{ var: boolean }>(
        "SELECT to_regclass($1) IS NOT NULL AS var", [`${sema}.arkon_pdf_goruntu`],
      );
      assert.equal(tablo?.var, true, 'tablo yapısı yedekte olmalı');
      assert.equal(await say(`${sema}.arkon_pdf_goruntu`), 0);
      assert.deepEqual(
        { kisi: await say(`${sema}.kisi`), belge: await say(`${sema}.arkon_belge`), goc: await say(`${sema}.goc_kaydi`) },
        once,
      );
      assert.ok(once.kisi > 0 && once.belge === 2 && once.goc > 0);
    } finally {
      // Bölümlü tablolar çok kilit ister: şema test altyapısının kümeli silmesiyle kaldırılır (test-vt.ts semayiSil).
      await semayiSil(o().sahip, sema);
      await o().sahip.sorgu(`ALTER SCHEMA ${kenar} RENAME TO ${sema}`);
    }
  });
});
