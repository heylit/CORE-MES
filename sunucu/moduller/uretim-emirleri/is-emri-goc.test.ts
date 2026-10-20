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
const IS_EMRI_GOCU = '_uretim_emirleri_is_emri.sql';

describe('iş emri göçü dolu tabloda (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('isemrigoc');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-isemri-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('eski emirlerin hepsi arşive kopyalanır; planlı ve başlamış iptal olur, bitmiş bitti kalır; arşiv değişmez', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, vt, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const goc = hepsi.find((ad) => ad.endsWith(IS_EMRI_GOCU));
    assert.ok(goc, 'iş emri göçü bulunamadı');
    for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });

    const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: 'ie-kisi', kullaniciAdi: 'ie-kisi', parola: 'dogru-parola-1' }));
    const merkez = (await sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('IEG', 'Deneme') RETURNING id"))!.id;
    let sayac = 0;
    const emirKur = async (durum: 'planli' | 'basladi' | 'bitti' | 'iptal'): Promise<number> => {
      sayac += 1;
      const ist = (await sahip.tek<{ id: number }>(
        'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`IEG${sayac}`, `Deneme ${sayac}`, merkez]))!.id;
      const emir = (await sahip.tek<{ id: number }>(
        `INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id) VALUES ('P-IE', 'Deneme', 5, $1, $2) RETURNING id`, [ist, kisi]))!.id;
      const ek = { planli: null, basladi: 'baslama = now()', bitti: 'baslama = now(), bitis = now(), saglam_adet = 4', iptal: 'iptal = now()' }[durum];
      if (ek !== null) await sahip.sorgu(`UPDATE uretim_emri SET durum = $2, ${ek} WHERE id = $1`, [emir, durum]);
      return emir;
    };
    const planli = await emirKur('planli');
    const basladi = await emirKur('basladi');
    const bitti = await emirKur('bitti');
    const iptal = await emirKur('iptal');
    const once = await sahip.sorgu<{ id: number; durum: string; istasyon_id: number; baslama: Date | null; bitis: Date | null; saglam_adet: number | null }>(
      'SELECT id, durum, istasyon_id, baslama, bitis, saglam_adet FROM uretim_emri ORDER BY id');

    await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [goc]);

    const arsiv = await sahip.sorgu<{ emir_id: number; eski_durum: string; istasyon_id: number; baslama: Date | null; saglam_adet: number | null }>(
      'SELECT emir_id, eski_durum, istasyon_id, baslama, saglam_adet FROM uretim_emirleri_arsiv ORDER BY emir_id');
    assert.deepEqual(arsiv.map((a) => [a.emir_id, a.eski_durum, a.istasyon_id]), once.map((e) => [e.id, e.durum, e.istasyon_id]));
    assert.ok(arsiv.find((a) => a.emir_id === basladi)?.baslama !== null, 'başlamış emrin başlaması arşivde kalır');
    assert.equal(arsiv.find((a) => a.emir_id === bitti)?.saglam_adet, 4);

    const sonra = new Map((await sahip.sorgu<{ id: number; durum: string; arsiv: boolean; baslama: Date | null; saglam_adet: number | null }>(
      'SELECT id, durum, arsiv, baslama, saglam_adet FROM uretim_emri')).map((e) => [e.id, e]));
    assert.deepEqual([planli, basladi, bitti, iptal].map((id) => sonra.get(id)?.durum), ['iptal', 'iptal', 'bitti', 'iptal']);
    assert.ok([...sonra.values()].every((e) => e.arsiv));
    assert.equal(sonra.get(basladi)?.baslama, null);
    assert.equal(sonra.get(bitti)?.saglam_adet, 4);

    await assert.rejects(sahip.sorgu('UPDATE uretim_emirleri_arsiv SET eski_durum = $1', ['bitti']));
    await assert.rejects(sahip.sorgu('DELETE FROM uretim_emirleri_arsiv'));
    // Arşivdeki emir iş emirli olamaz (malzeme no boş kalır).
    await assert.rejects(sahip.sorgu('UPDATE uretim_emri SET malzeme_no = 1, kaynak_rota_revizyonu_id = 1 WHERE id = $1', [bitti]));
  });
});
