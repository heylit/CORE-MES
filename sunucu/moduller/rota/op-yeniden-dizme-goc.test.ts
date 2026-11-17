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
const DIZME_GOCU = '_rota_op_numarasi_yeniden_dizme.sql';

describe('rota - OP numarası yeniden dizme göçü dolu tabloda (3250-2, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('rotadizmegoc');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-rotadizme-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('yürürlükteki revizyon 10, 20, 30 olur; şartname, adım bağı ve statü aynı operasyonda kalır; eski revizyon ve defterin kayıtlı numarası değişmez', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const goc = hepsi.find((ad) => ad.endsWith(DIZME_GOCU));
    assert.ok(goc, 'yeniden dizme göçü bulunamadı');
    for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });

    const kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'rd-kisi', kullaniciAdi: 'rd-kisi', parola: 'dogru-parola-1' }));
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('RD-', 0)");
    const kart = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('rd-1', 'mamul', 'RD-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'rd-1', com: { ad: 'Deneme mamul' } }), kisi]))!.no;
    const revizyon = async (harf: string, adimlar: readonly number[]): Promise<number> => {
      const id = (await sahip.tek<{ id: number }>(
        "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id) VALUES ($1, 'mamul', $2, $3) RETURNING id", [kart, harf, kisi]))!.id;
      for (const [i, op] of adimlar.entries()) {
        await sahip.sorgu(
          'INSERT INTO rota_op_numarasi (malzeme_id, op_no, ilk_revizyon_id) SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM rota_op_numarasi WHERE malzeme_id = $1 AND op_no = $2)',
          [kart, op, id]);
        await sahip.sorgu(
          `INSERT INTO rota_adimi (revizyon_id, malzeme_id, op_no, sira, operasyon_tipi_id, ad, ayar_suresi_dk, birim_sure_dk)
           VALUES ($1, $2, $3, $4, 1, 'Deneme adım', NULL, 1)`, [id, kart, op, i + 1]);
      }
      return id;
    };
    // Eski revizyon A (onaylı, yürürlükten kalkmış): 10, 20, 30. Yürürlükteki B: 30 silinmiş, 40 araya eklenmiş: 10, 40, 20.
    const onayla = async (id: number): Promise<void> => {
      await sahip.sorgu("UPDATE rota_revizyonu SET durum = 'onay_bekliyor', gonderen_kisi_id = $2, gonderme = now() WHERE id = $1", [id, kisi]);
      await sahip.sorgu("UPDATE rota_revizyonu SET durum = 'onayli', onaylayan_kisi_id = $2, onaylama = now(), dort_gozsuz_onay = true WHERE id = $1", [id, kisi]);
    };
    const a = await revizyon('A', [10, 20, 30]);
    await onayla(a);
    const b = await revizyon('B', [10, 40, 20]);
    const sartname = (await sahip.tek<{ id: number }>('SELECT id FROM rota_islem_sartnamesi ORDER BY id LIMIT 1'))?.id ?? null;
    if (sartname !== null) {
      await sahip.sorgu("INSERT INTO rota_adim_sartnamesi (revizyon_id, op_no, sira, sartname_id, degerler) VALUES ($1, 40, 1, $2, '{}'), ($1, 20, 1, $2, '{}')", [b, sartname]);
    }
    await onayla(b);
    await sahip.sorgu("UPDATE rota_revizyonu SET durum = 'yururlukte', yururluge_alan_kisi_id = $2, yururluge_alma = now() WHERE id = $1", [b, kisi]);
    const kimlik = async (op: number): Promise<number> =>
      (await sahip.tek<{ id: number }>('SELECT id FROM rota_op_numarasi WHERE malzeme_id = $1 AND op_no = $2', [kart, op]))!.id;
    const [k10, k20, k40] = [await kimlik(10), await kimlik(20), await kimlik(40)];
    await sahip.sorgu(
      `INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur, rota_revizyonu_id)
       VALUES ($1, 'OP 40', $2, '#2F6FDE', 'YM', $4), ($1, 'OP 20', $3, '#2F6FDE', 'YM', $4)`,
      [String(kart), `${String(kart)}-o40`, `${String(kart)}-o20`, b]);

    await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [goc]);

    const adimlar = async (id: number) => sahip.sorgu<{ op: number; k: number }>(
      'SELECT op_no AS op, operasyon_id AS k FROM rota_adimi WHERE revizyon_id = $1 ORDER BY sira', [id]);
    assert.deepEqual(await adimlar(b), [{ op: 10, k: k10 }, { op: 20, k: k40 }, { op: 30, k: k20 }]);
    assert.deepEqual((await adimlar(a)).map((x) => x.op), [10, 20, 30], 'yürürlükten kalkmış revizyon eski numarasıyla kalır');
    if (sartname !== null) {
      assert.deepEqual(await sahip.sorgu('SELECT op_no AS op FROM rota_adim_sartnamesi WHERE revizyon_id = $1 ORDER BY op_no', [b]), [{ op: 20 }, { op: 30 }]);
    }
    const statuler = await sahip.sorgu<{ kaynak: string; k: number | null }>(
      'SELECT kaynak_adim AS kaynak, operasyon_id AS k FROM recete_rota_statu WHERE rota_revizyonu_id = $1 ORDER BY kaynak_adim', [b]);
    assert.deepEqual(statuler, [{ kaynak: `${String(kart)}-o20`, k: k40 }, { kaynak: `${String(kart)}-o30`, k: k20 }]);
    // Defterin kayıtlı numarası değişmez ve ürün içinde tekil kalır (ürün düzeyi tablolar onunla yazar).
    assert.equal(await kimlik(40), k40);
    await assert.rejects(sahip.sorgu('INSERT INTO rota_op_numarasi (malzeme_id, op_no, ilk_revizyon_id) VALUES ($1, 20, $2)', [kart, b]));
    // İçerik kilidi göçten sonra yine açık: yürürlükteki revizyonun adımı değişmez.
    await assert.rejects(sahip.sorgu('UPDATE rota_adimi SET op_no = 90 WHERE revizyon_id = $1 AND sira = 1', [b]));
    assert.equal((await sahip.tek<{ n: number }>("SELECT count(*)::int AS n FROM pg_tables WHERE tablename LIKE 'gecici_3250%'"))?.n, 0);
  });
});
