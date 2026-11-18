import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const DIZME_GOCU = '_rota_op_numarasi_yeniden_dizme.sql';

type Kurulum = { ortam: TestVeritabani; klasor: string; goc: string; kart: number; kisi: number; a: number; b: number; sartname: number | null };

// Göçten önceki şemaya ürün, iki revizyon (A eski, B yürürlükte: 10, 40, 20), şartname ve statü kurulur; göç dosyası henüz kopyalanmaz.
async function kur(ad: string): Promise<Kurulum> {
  const ortam = await testSemasiAc(ad);
  const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-rotadizme-'));
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
  await sahip.sorgu(
    `INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur, rota_revizyonu_id)
     VALUES ($1, 'OP 40', $2, '#2F6FDE', 'YM', $4), ($1, 'OP 20', $3, '#2F6FDE', 'YM', $4)`,
    [String(kart), `${String(kart)}-o40`, `${String(kart)}-o20`, b]);

  return { ortam, klasor, goc, kart, kisi, a, b, sartname };
}
async function kaldir(k: Kurulum | undefined): Promise<void> {
  if (!k) return;
  await rm(k.klasor, { recursive: true, force: true });
  await k.ortam.kaldir();
}
const uygula = (k: Kurulum) => copyFile(join(GOC_KLASORU, k.goc), join(k.klasor, k.goc)).then(() => gocleriUygula(k.ortam.ayar, k.klasor, { sema: k.ortam.sema }));
const kimlik = async (k: Kurulum, op: number): Promise<number> =>
  (await k.ortam.sahip.tek<{ id: number }>('SELECT id FROM rota_op_numarasi WHERE malzeme_id = $1 AND op_no = $2', [k.kart, op]))!.id;
const adimNumaralari = async (k: Kurulum, id: number): Promise<number[]> =>
  (await k.ortam.sahip.sorgu<{ op: number }>('SELECT op_no AS op FROM rota_adimi WHERE revizyon_id = $1 ORDER BY sira', [id])).map((x) => x.op);

describe('rota - OP numarası yeniden dizme göçü dolu tabloda (3250-2, gerçek PostgreSQL)', () => {
  test('yürürlükteki revizyon 10, 20, 30 olur; şartname, adım bağı ve statü aynı operasyonda kalır; eski revizyon ve defterin kayıtlı numarası değişmez', async () => {
    let k: Kurulum | undefined;
    try {
      k = await kur('rotadizmegoc');
      const { sahip } = k.ortam;
      const { kart, a, b, sartname } = k;
      const [k10, k20, k40] = [await kimlik(k, 10), await kimlik(k, 20), await kimlik(k, 40)];
      assert.deepEqual(await uygula(k), [k.goc]);

      const adimlar = async (id: number) => sahip.sorgu<{ op: number; k: number }>(
        'SELECT op_no AS op, operasyon_id AS k FROM rota_adimi WHERE revizyon_id = $1 ORDER BY sira', [id]);
      assert.deepEqual(await adimlar(b), [{ op: 10, k: k10 }, { op: 20, k: k40 }, { op: 30, k: k20 }]);
      assert.deepEqual(await adimNumaralari(k, a), [10, 20, 30], 'yürürlükten kalkmış revizyon eski numarasıyla kalır');
      if (sartname !== null) {
        assert.deepEqual(await sahip.sorgu('SELECT op_no AS op FROM rota_adim_sartnamesi WHERE revizyon_id = $1 ORDER BY op_no', [b]), [{ op: 20 }, { op: 30 }]);
      }
      const statuler = await sahip.sorgu<{ kaynak: string; k: number | null }>(
        'SELECT kaynak_adim AS kaynak, operasyon_id AS k FROM recete_rota_statu WHERE rota_revizyonu_id = $1 ORDER BY kaynak_adim', [b]);
      assert.deepEqual(statuler, [{ kaynak: `${String(kart)}-o20`, k: k40 }, { kaynak: `${String(kart)}-o30`, k: k20 }]);
      // Defterin kayıtlı numarası değişmez ve ürün içinde tekil kalır (ürün düzeyi tablolar onunla yazar).
      assert.equal(await kimlik(k, 40), k40);
      await assert.rejects(sahip.sorgu('INSERT INTO rota_op_numarasi (malzeme_id, op_no, ilk_revizyon_id) VALUES ($1, 20, $2)', [kart, b]));
      // İçerik kilidi göçten sonra yine açık: yürürlükteki revizyonun adımı değişmez.
      await assert.rejects(sahip.sorgu('UPDATE rota_adimi SET op_no = 90 WHERE revizyon_id = $1 AND sira = 1', [b]));
      assert.equal((await sahip.tek<{ n: number }>("SELECT count(*)::int AS n FROM pg_tables WHERE tablename LIKE 'gecici_3250%'"))?.n, 0);
    } finally {
      await kaldir(k);
    }
  });

  // Risk K1: açık emrin rotadan gelen iş emri operasyon kimliği bulamıyorsa göç durur, hiçbir numara değişmez.
  test('K1: açık emirde kimliği bulunamayan rota iş emri varken göç durur ve numaralar değişmez', async () => {
    let k: Kurulum | undefined;
    try {
      k = await kur('rotadizmek1');
      const { sahip } = k.ortam;
      const emir = (await sahip.tek<{ id: number }>(
        "INSERT INTO uretim_emri (parca_no, parca_ad, adet, acan_id, malzeme_no) VALUES ('P-RD', 'Deneme', 4, $1, $2) RETURNING id", [k.kisi, k.kart]))!.id;
      await sahip.sorgu('UPDATE uretim_emri SET kaynak_rota_revizyonu_id = $2 WHERE id = $1', [emir, k.b]);
      // Rotada ve defterde olmayan numara: kimlik çözülemez.
      await sahip.sorgu(
        "INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad) VALUES ($1, 1, 990, 1, 'Kimliksiz adım')", [emir]);
      assert.equal((await sahip.tek<{ k: number | null }>('SELECT operasyon_id AS k FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1', [emir]))?.k, null);
      await assert.rejects(uygula(k), /Risk K1/);
      assert.deepEqual(await adimNumaralari(k, k.b), [10, 40, 20]);
    } finally {
      await kaldir(k);
    }
  });

  // Risk K2: yeni kaynak adımı aynı revizyondaki başka statüyle çakışırsa göç durur, hiçbir numara değişmez.
  test('K2: statü kaynak adımı çakışınca göç durur ve numaralar değişmez', async () => {
    let k: Kurulum | undefined;
    try {
      k = await kur('rotadizmek2');
      const { sahip } = k.ortam;
      // OP 20'nin yeni numarası 30; aynı revizyonda "-o30" kaynaklı başka statü zaten var.
      await sahip.sorgu(
        "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur, rota_revizyonu_id) VALUES ($1, 'OP 30', $2, '#2F6FDE', 'YM', $3)",
        [String(k.kart), `${String(k.kart)}-o30`, k.b]);
      await assert.rejects(uygula(k), /Risk K2/);
      assert.deepEqual(await adimNumaralari(k, k.b), [10, 40, 20]);
      assert.deepEqual((await sahip.sorgu<{ kaynak: string }>(
        'SELECT kaynak_adim AS kaynak FROM recete_rota_statu WHERE rota_revizyonu_id = $1 ORDER BY kaynak_adim', [k.b])).map((x) => x.kaynak),
      [`${String(k.kart)}-o20`, `${String(k.kart)}-o30`, `${String(k.kart)}-o40`]);
    } finally {
      await kaldir(k);
    }
  });
});
