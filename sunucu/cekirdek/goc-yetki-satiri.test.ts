import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ISLEMLER } from '../../paylasilan/islemler.ts';
import { gocleriUygula } from './goc.ts';
import { testSemasiAc } from './test-vt.ts';
import type { TestVeritabani } from './test-vt.ts';

const GERCEK_KLASOR = fileURLToPath(new URL('../gocler/', import.meta.url));

// Bundan önceki göçler kurulu makinelerde uygulanmıştır ve değişmez (özet denetimi); kural bundan sonrakiler içindir.
const SON_KORUMASIZ_GOC = '20261014105156_kisiler_stok_statu_degistir.sql';

const ihlalKodu = (beklenen: string) => (hata: unknown): boolean => (hata as { code?: unknown }).code === beklenen;

// Yönetici Yetkiler ekranından rol_islemi'ye satır yazar. Göç aynı satırı çakışma koruması olmadan eklerse birincil
// anahtara takılır, göç durur ve sunucu açılmaz: yetki satırı ekleyen göç ON CONFLICT ... DO NOTHING kullanır.
describe('yetki satırı ekleyen göç, ekrandan önceden verilmiş yetkide durmaz (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testSemasiAc('gocy');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-gocy-'));
  });

  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  const butunYetkileriVer = async (): Promise<void> => {
    await acik().sahip.sorgu(
      `INSERT INTO rol_islemi (rol_id, islem)
       SELECT r.id, i.islem FROM rol r CROSS JOIN unnest($1::text[]) AS i (islem) WHERE NOT r.yonetici
       ON CONFLICT DO NOTHING`,
      [[...ISLEMLER]],
    );
  };

  test('her role bütün yetkiler önceden verilmişken yeni göçler uygulanır; korumasız ekleme reddedilir, korumalı geçer', async () => {
    const hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
    const sira = hepsi.indexOf(SON_KORUMASIZ_GOC) + 1;
    assert.equal(sira > 0, true, `${SON_KORUMASIZ_GOC} göç klasöründe yok`);
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));

    const { ayar, sema } = acik();
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), hepsi.slice(0, sira));
    await butunYetkileriVer();
    assert.deepEqual(await gocleriUygula(ayar, GERCEK_KLASOR, { sema }), hepsi.slice(sira));

    // Denetimin kendisi: aynı satırı korumasız ekleyen göç durur, korumalı olan geçer.
    await butunYetkileriVer();
    const yonetmeyen = await acik().sahip.tek<{ sayi: number }>('SELECT count(*)::int AS sayi FROM rol WHERE NOT yonetici');
    assert.equal((yonetmeyen?.sayi ?? 0) > 0, true, 'yönetici olmayan rol yok: çakışma sınanamaz');
    const ekle = `INSERT INTO rol_islemi (rol_id, islem) SELECT id, '${ISLEMLER[0]}' FROM rol WHERE NOT yonetici`;
    for (const ad of hepsi) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));
    await writeFile(join(klasor, '99990101000000_korumasiz.sql'), `${ekle};\n`);
    await assert.rejects(gocleriUygula(ayar, klasor, { sema }), ihlalKodu('23505'));
    await rm(join(klasor, '99990101000000_korumasiz.sql'));
    await writeFile(join(klasor, '99990101000001_korumali.sql'), `${ekle}\nON CONFLICT (rol_id, islem) DO NOTHING;\n`);
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), ['99990101000001_korumali.sql']);
  });
});
