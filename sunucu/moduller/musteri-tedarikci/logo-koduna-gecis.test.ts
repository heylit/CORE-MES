import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

// 3473 a: zaten Logo'ya bağlı firmaların kodu Logo cari koduna geçer. Göçten önceki şemaya uydurma firmalar yazılır, sonra göç
// uygulanır (kisit-dogrulama-goc.test.ts kalıbı); göç kaydı silinip yeniden uygulanınca bir şey değişmez.
const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const GOC = '20261120081208_musteri_tedarikci_logo_koduna_gecis.sql';

describe('3473 bağlı firmaların kodu Logo cari koduna geçer (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  let kisi = 0;
  let klasor = '';
  const firma = async (kod: string | null, logoCariKodu: string | null, logoKayitNo: number | null): Promise<number> =>
    (await o().sahip.tek<{ id: number }>(
      `INSERT INTO musteri_tedarikci_firma (kod, ad, tur, logo_cari_kodu, logo_kayit_no, olusturan_id)
       VALUES ($1, $2, 'musteri', $3, $4, $5) RETURNING id`,
      [kod, `ORN Gecis ${kod ?? logoCariKodu ?? 'x'}`, logoCariKodu, logoKayitNo, kisi],
    ))!.id;

  before(async () => {
    ortam = await testSemasiAc('mtlogogecis');
    klasor = await mkdtemp(join(tmpdir(), 'logo-koduna-gecis-'));
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    assert.ok(hepsi.includes(GOC), 'göç bulunamadı');
    for (const ad of hepsi.filter((a) => a < GOC)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
    kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('farklı kodlu bağlı firma geçer, eski kod geçmişte; aynı kodlu, bağsız ve kodu başka firmada olan değişmez; kilit yeniden açık', async () => {
    const gecen = await firma('ORN-G1', 'ORN.LG1', 101);
    const kodsuz = await firma(null, 'ORN.LG2', 102);
    const harf = await firma('orn.lg3', 'ORN.LG3', 103);
    const ayni = await firma('ORN.LG4', 'ORN.LG4', 104);
    const bagsiz = await firma('ORN-G5', 'ORN.LG5', null);
    const sahip = await firma('ORN.LG6', null, null);
    const cakisan = await firma('ORN-G6', 'ORN.LG6', 106);
    const surumler = new Map((await o().vt.sorgu<{ id: number; surum: number }>('SELECT id, surum FROM musteri_tedarikci_firma')).map((r) => [r.id, r.surum]));

    await copyFile(join(GOC_KLASORU, GOC), join(klasor, GOC));
    assert.deepEqual(await gocleriUygula(o().ayar, klasor, { sema: o().sema }), [GOC]);

    const kodlar = new Map((await o().vt.sorgu<{ id: number; kod: string | null; surum: number }>('SELECT id, kod, surum FROM musteri_tedarikci_firma'))
      .map((r) => [r.id, [r.kod, r.surum - surumler.get(r.id)!]]));
    assert.deepEqual(
      [gecen, kodsuz, harf, ayni, bagsiz, sahip, cakisan].map((id) => kodlar.get(id)),
      [['ORN.LG1', 1], ['ORN.LG2', 1], ['ORN.LG3', 1], ['ORN.LG4', 0], ['ORN-G5', 0], ['ORN.LG6', 0], ['ORN-G6', 0]],
    );
    const gecmis = await o().vt.sorgu<{ firma_id: number; kod: string; birakan_id: number | null }>(
      'SELECT firma_id, kod, birakan_id FROM musteri_tedarikci_kod_gecmisi ORDER BY firma_id');
    assert.deepEqual(gecmis, [{ firma_id: gecen, kod: 'ORN-G1', birakan_id: null }, { firma_id: harf, kod: 'orn.lg3', birakan_id: null }]);

    // Kilit tetiği göçten sonra yine açık: bağlı firmanın kodu elle değişmez.
    await assert.rejects(o().vt.sorgu("UPDATE musteri_tedarikci_firma SET kod = 'ORN-YENI' WHERE id = $1", [gecen]), /musteri_tedarikci_firma_logo_kilidi|değişmez/);

    // İkinci koşu bir şey değiştirmez.
    await o().sahip.sorgu('DELETE FROM goc_kaydi WHERE ad = $1', [GOC]);
    assert.deepEqual(await gocleriUygula(o().ayar, klasor, { sema: o().sema }), [GOC]);
    assert.equal((await o().vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM musteri_tedarikci_kod_gecmisi'))?.n, 2);
  });
});
