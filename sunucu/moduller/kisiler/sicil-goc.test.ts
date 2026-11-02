import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';

const GERCEK_KLASOR = fileURLToPath(new URL('../../gocler/', import.meta.url));
const GOC = '20261101222000_kisiler_sicil_harfsiz_tek.sql';

describe('KIS-2: sicil no harften bağımsız tekil göçü var olan veritabanında (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testSemasiAc('gocsicil');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-gocsicil-'));
  });

  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('harf farkıyla çift sicil varken göç durur, yalnız kimlik yazar, hiçbir şey değişmez; çift ayrılınca uygulanır', async () => {
    const hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
    const sira = hepsi.indexOf(GOC);
    assert.equal(sira > 0, true, 'KIS-2 göçü bulunamadı');
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));

    const { ayar, sema, vt, sahip } = acik();
    await gocleriUygula(ayar, klasor, { sema });
    const ekle = async (ad: string, sicil: string): Promise<number> =>
      (await vt.tek<{ id: number }>('INSERT INTO kisi (ad, sicil_no) VALUES ($1, $2) RETURNING id', [ad, sicil]))!.id;
    const buyuk = await ekle('Deneme Bir', 'T-001');
    const kucuk = await ekle('Deneme İki', 't-001');
    await ekle('Deneme Üç', 'T-002');

    const hata = await gocleriUygula(ayar, GERCEK_KLASOR, { sema }).then(() => null, (h: unknown) => h);
    assert.ok(hata instanceof Error, 'göç durmalıydı');
    assert.match(hata.message, new RegExp(`\\(kimlik\\): ${buyuk}, ${kucuk}\\.`));
    // Sicil ve ad iletiye düşmez.
    assert.doesNotMatch(hata.message, /T-001|t-001|Deneme/);
    assert.deepEqual(await vt.sorgu('SELECT sicil_no FROM kisi ORDER BY id'), [{ sicil_no: 'T-001' }, { sicil_no: 't-001' }, { sicil_no: 'T-002' }]);

    await vt.sorgu('UPDATE kisi SET sicil_no = $1 WHERE id = $2', ['T-003', kucuk]);
    assert.deepEqual(await gocleriUygula(ayar, GERCEK_KLASOR, { sema }), hepsi.slice(sira));
    await assert.rejects(vt.sorgu('INSERT INTO kisi (ad, sicil_no) VALUES ($1, $2)', ['Deneme Dört', 't-002']), /kisi_sicil_no_tek/);
    assert.equal((await vt.sorgu('SELECT 1 FROM kisi WHERE sicil_no IS NULL')).length, 0);
    await vt.sorgu("INSERT INTO kisi (ad) VALUES ('Sicilsiz Bir'), ('Sicilsiz İki')");

    // Göç yeniden çalıştırılırsa (elle ya da geri alma sonrası) hata vermez ve aynı dizini bırakır.
    // Bundan sonraki göçlerin kaydı da silinir ki yalnız bu göç yeniden koşsun; geçici klasörde yalnız o eklenir.
    await sahip.sorgu('DELETE FROM goc_kaydi WHERE ad >= $1', [GOC]);
    await copyFile(join(GERCEK_KLASOR, GOC), join(klasor, GOC));
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [GOC]);
    const dizin = await vt.tek<{ tanim: string }>("SELECT pg_get_indexdef(to_regclass('kisi_sicil_no_tek')) AS tanim");
    assert.match(dizin?.tanim ?? '', /lower\(sicil_no\)/);
  });
});
