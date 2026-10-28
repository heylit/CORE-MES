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
const KAPANIS_GOCU = '_uretim_emirleri_kapanis.sql';

describe('kapanış göçü dolu tabloda (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('kapanisgoc');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-kapanis-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('bitmiş iş emirli emir onaysız tamam ve eski olur; açık, iptal ve istasyonlu (iş emirsiz) emir kapanışa girmez', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, vt, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const goc = hepsi.find((ad) => ad.endsWith(KAPANIS_GOCU));
    assert.ok(goc, 'kapanış göçü bulunamadı');
    for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });

    const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: 'kg-kisi', kullaniciAdi: 'kg-kisi', parola: 'dogru-parola-1' }));
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KG-', 0)");
    const kart = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('kg-1', 'mamul', 'KG-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'kg-1', com: { ad: 'Deneme mamul' } }), kisi]))!.no;
    const merkez = (await sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('KGM', 'Deneme') RETURNING id"))!.id;
    const ist = (await sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('KGI', 'Deneme', $1) RETURNING id", [merkez]))!.id;
    const emir = async (durum: 'planli' | 'bitti' | 'iptal', malzemeli: boolean): Promise<number> => {
      const id = (await sahip.tek<{ id: number }>(
        `INSERT INTO uretim_emri (parca_no, parca_ad, adet, acan_id, ${malzemeli ? 'malzeme_no' : 'istasyon_id'}) VALUES ('P-KG', 'Deneme', 4, $1, $2) RETURNING id`,
        [kisi, malzemeli ? kart : ist]))!.id;
      const ek = { planli: null, bitti: 'baslama = now(), bitis = now(), saglam_adet = 4', iptal: 'iptal = now()' }[durum];
      if (ek !== null) await sahip.sorgu(`UPDATE uretim_emri SET durum = $2, ${ek} WHERE id = $1`, [id, durum]);
      return id;
    };
    const bitmis = await emir('bitti', true);
    const acik = await emir('planli', true);
    const iptal = await emir('iptal', true);
    const istasyonlu = await emir('bitti', false);

    await gocleriUygula(ayar, GOC_KLASORU, { sema });
    const satirlar = await sahip.sorgu<{ id: number; durum: string; eski: boolean; tamam: boolean; kalite: number | null; mudur: number | null }>(
      `SELECT k.uretim_emri_id AS id, k.durum, k.eski, k.tamamlanma = e.bitis AS tamam, k.kalite_kisi_id AS kalite, k.mudur_kisi_id AS mudur
         FROM uretim_emirleri_kapanis k JOIN uretim_emri e ON e.id = k.uretim_emri_id ORDER BY k.uretim_emri_id`);
    assert.deepEqual(satirlar, [{ id: bitmis, durum: 'tamam', eski: true, tamam: true, kalite: null, mudur: null }]);
    for (const id of [acik, iptal, istasyonlu]) assert.ok(!satirlar.some((s) => s.id === id), String(id));
    const defter = await sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emirleri_kapanis_defteri');
    assert.equal(defter?.n, 0, 'dolum deftere olay yazmaz');
  });
});
