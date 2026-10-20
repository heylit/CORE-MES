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

// Bağın revizyona bağlanması (kullanıcı onayı 16.10.2026) dolu tabloda: revizyonsuz satır ürünün iptal olmayan her revizyonuna kopyalanır,
// sürümü ve yazanı korunur; revizyonu olmayan ürünün satırı silinmez, revizyonsuz kalır. Veriler uydurmadır.
const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const BAG_GOCU = '_recete_rota_bag_revizyon.sql';

describe('Reçete ve Rota bağ revizyonu göçü dolu tabloda (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('rrbagrev');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-rrbagrev-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('satır ürünün iptal olmayan her revizyonuna kopyalanır; revizyonu olmayan ürünün satırı revizyonsuz kalır; başka ürünün revizyonu reddedilir', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, vt, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const goc = hepsi.find((ad) => ad.endsWith(BAG_GOCU));
    assert.ok(goc, 'bağ revizyonu göçü bulunamadı');
    for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });

    const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'rrbagrev', parola: 'dogru-parola-1' }));
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('RBR-', 0) ON CONFLICT (onek) DO NOTHING");
    const kart = async (sira: number, tur: string): Promise<number> => (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'RBR-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`rbr-${String(sira)}`, tur, sira, JSON.stringify({ id: `rbr-${String(sira)}`, com: { ad: 'Bağ deneme' } }), kisi]))!.no;
    const revizyon = async (malzeme: number, harf: string, iptal = false): Promise<number> => {
      const id = (await sahip.tek<{ id: number }>("INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id) VALUES ($1, 'mamul', $2, $3) RETURNING id",
        [malzeme, harf, kisi]))!.id;
      if (iptal) await sahip.sorgu("UPDATE rota_revizyonu SET durum = 'iptal', iptal_eden_kisi_id = $2, iptal_etme = now() WHERE id = $1", [id, kisi]);
      return id;
    };
    const mm = await kart(1, 'mamul');
    const revsiz = await kart(2, 'mamul');
    const hm = await kart(3, 'hammadde');
    // Üründe tek açık revizyon olur: A onaylanır, C iptal edilir, sonra B açılır.
    const a = await revizyon(mm, 'A');
    await sahip.sorgu("UPDATE rota_revizyonu SET durum = 'onay_bekliyor', gonderen_kisi_id = $2, gonderme = now() WHERE id = $1", [a, kisi]);
    await sahip.sorgu("UPDATE rota_revizyonu SET durum = 'onayli', onaylayan_kisi_id = $2, onaylama = now(), dort_gozsuz_onay = true WHERE id = $1", [a, kisi]);
    await revizyon(mm, 'C', true);
    const b = await revizyon(mm, 'B');
    await sahip.sorgu("INSERT INTO recete_rota_statu_tanimi (kimlik, kod, ad, tur, renk, sira, guncelleyen_kisi_id) VALUES ('KKB', 'KKB', 'Kalite bekliyor', 'kalite', '#9A7400', 0, $1)", [kisi]);
    await sahip.sorgu(`INSERT INTO recete_rota_adim_bagi (malzeme_id, op_no, cikti_malzeme_id, cikti_statu, surum, guncelleyen_kisi_id)
                       VALUES ($1, 10, NULL, 'KKB', 3, $3), ($1, 20, $2, NULL, 1, $3), ($4, 10, NULL, 'KKB', 1, $3)`, [mm, hm, kisi, revsiz]);
    await sahip.sorgu(`INSERT INTO recete_rota_giren_statusu (malzeme_id, op_no, giren_malzeme_id, statu, giren_op_no, guncelleyen_kisi_id)
                       VALUES ($1, 20, $2, 'KKB', NULL, $3), ($4, 10, $2, NULL, 30, $3)`, [mm, hm, kisi, revsiz]);

    await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [goc]);

    assert.deepEqual(await sahip.sorgu('SELECT rota_revizyonu_id AS r, malzeme_id AS m, op_no AS o, cikti_malzeme_id AS c, cikti_statu AS s, surum FROM recete_rota_adim_bagi ORDER BY 1, 2, 3'), [
      { r: a, m: mm, o: 10, c: null, s: 'KKB', surum: 3 }, { r: a, m: mm, o: 20, c: hm, s: null, surum: 1 },
      { r: b, m: mm, o: 10, c: null, s: 'KKB', surum: 3 }, { r: b, m: mm, o: 20, c: hm, s: null, surum: 1 },
      { r: null, m: revsiz, o: 10, c: null, s: 'KKB', surum: 1 },
    ], 'iptal revizyona satır yok; revizyonu olmayan ürünün satırı revizyonsuz durur');
    assert.deepEqual(await sahip.sorgu('SELECT rota_revizyonu_id AS r, malzeme_id AS m, op_no AS o, giren_malzeme_id AS g, statu AS s FROM recete_rota_giren_statusu ORDER BY 1, 2'), [
      { r: a, m: mm, o: 20, g: hm, s: 'KKB' }, { r: b, m: mm, o: 20, g: hm, s: 'KKB' }, { r: null, m: revsiz, o: 10, g: hm, s: null },
    ]);
    await assert.rejects(sahip.sorgu("INSERT INTO recete_rota_adim_bagi (malzeme_id, op_no, cikti_statu, guncelleyen_kisi_id) VALUES ($1, 10, 'KKB', $2)", [revsiz, kisi]),
      (e: { constraint?: string }) => e.constraint === 'recete_rota_adim_bagi_revizyonsuz_tekil');
    await assert.rejects(sahip.sorgu("INSERT INTO recete_rota_adim_bagi (rota_revizyonu_id, malzeme_id, op_no, cikti_statu, guncelleyen_kisi_id) VALUES ($1, $2, 30, 'KKB', $3)", [a, revsiz, kisi]),
      (e: { constraint?: string }) => e.constraint === 'recete_rota_adim_bagi_revizyon_fkey');
    await assert.rejects(sahip.sorgu("INSERT INTO recete_rota_adim_bagi (rota_revizyonu_id, malzeme_id, op_no, cikti_statu, guncelleyen_kisi_id) VALUES ($1, $2, 10, 'KKB', $3)", [a, mm, kisi]),
      (e: { constraint?: string }) => e.constraint === 'recete_rota_adim_bagi_revizyon_op_tekil');
  });
});
