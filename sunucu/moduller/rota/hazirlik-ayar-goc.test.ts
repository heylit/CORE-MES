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

const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const AYAR_GOCU = '_rota_adim_ayar.sql';

describe('rota - hazırlık ve ayar göçü dolu tabloda (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('rotaayargoc');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-rotaayar-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('1310 a: var olan süre ayara taşınır, onay bekleyen revizyon da dolar; içerik kilidi göçten sonra açıktır', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const goc = hepsi.find((ad) => ad.endsWith(AYAR_GOCU));
    assert.ok(goc, 'ayar göçü bulunamadı');
    for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });

    const kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'ra-kisi', kullaniciAdi: 'ra-kisi', parola: 'dogru-parola-1' }));
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('RA-', 0)");
    const kart = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('ra-1', 'mamul', 'RA-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'ra-1', com: { ad: 'Deneme mamul' } }), kisi]))!.no;
    const rev = (await sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id) VALUES ($1, 'mamul', 'A', $2) RETURNING id", [kart, kisi]))!.id;
    for (const [op, sure] of [[10, '25.00'], [20, '0.00'], [30, null]] as const) {
      await sahip.sorgu('INSERT INTO rota_op_numarasi (malzeme_id, op_no, ilk_revizyon_id) VALUES ($1, $2, $3)', [kart, op, rev]);
      await sahip.sorgu(
        `INSERT INTO rota_adimi (revizyon_id, malzeme_id, op_no, sira, operasyon_tipi_id, ad, ayar_suresi_dk, birim_sure_dk)
         VALUES ($1, $2, $3, $4, 1, 'Deneme adım', $5, 1)`, [rev, kart, op, op / 10, sure]);
    }
    await sahip.sorgu("UPDATE rota_revizyonu SET durum = 'onay_bekliyor', gonderen_kisi_id = $2, gonderme = now() WHERE id = $1", [rev, kisi]);

    await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [goc]);

    assert.deepEqual(
      await sahip.sorgu('SELECT op_no AS "opNo", ayar_suresi_dk AS toplam, hazirlik_dk AS hazirlik, ayar, ayar_dk AS "ayarDk" FROM rota_adimi ORDER BY op_no'),
      [
        { opNo: 10, toplam: '25.00', hazirlik: '0.00', ayar: true, ayarDk: '25.00' },
        { opNo: 20, toplam: '0.00', hazirlik: '0.00', ayar: false, ayarDk: null },
        { opNo: 30, toplam: null, hazirlik: null, ayar: false, ayarDk: null },
      ],
    );
    assert.deepEqual(
      await sahip.sorgu("SELECT tgname::text AS ad, tgenabled::text AS durum FROM pg_trigger WHERE tgrelid = 'rota_adimi'::regclass AND tgname = 'rota_adimi_kilitli'"),
      [{ ad: 'rota_adimi_kilitli', durum: 'O' }],
    );
    await assert.rejects(sahip.sorgu('UPDATE rota_adimi SET hazirlik_dk = 5, ayar_suresi_dk = 30 WHERE op_no = 10'), /yalnız taslakta/);
    // Toplam bölümle tutarlı olmalı; ayar kapalı adımda ayar süresi olmaz.
    await sahip.sorgu("UPDATE rota_revizyonu SET durum = 'taslak', gonderen_kisi_id = NULL, gonderme = NULL WHERE id = $1", [rev]);
    await assert.rejects(sahip.sorgu('UPDATE rota_adimi SET hazirlik_dk = 5 WHERE op_no = 10'), /rota_adimi_hazirlik_toplami/);
    await assert.rejects(sahip.sorgu('UPDATE rota_adimi SET ayar_dk = 5, ayar_suresi_dk = 5 WHERE op_no = 20'), /rota_adimi_ayar_suresi_ayarda/);
    await sahip.sorgu('UPDATE rota_adimi SET hazirlik_dk = 5, ayar_suresi_dk = 30 WHERE op_no = 10');
  });
});
