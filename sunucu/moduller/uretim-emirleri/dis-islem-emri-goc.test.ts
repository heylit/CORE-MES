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
const SEMA_GOCU = '_uretim_emirleri_dis_islem_emri.sql';

// 2428-3 a: göç açık fason işlerine belge ekler, var olan satırı değiştirmez. Veriler uydurmadır.
describe('dış işlem emri göçleri dolu tabloda (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('diegoc');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-die-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('yalnız açık fason işe "goc" belgesi açılır; bitmiş adım, iptal ve bitmiş emir, iç adım girmez (arşivdeki emrin adımı olmaz: uretim_emri_arsiv_adimsiz); iş emri ve hareket satırları değişmez', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, vt, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const goc = hepsi.find((ad) => ad.endsWith(SEMA_GOCU));
    assert.ok(goc, 'dış işlem emri göçü bulunamadı');
    for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });

    const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: 'dg-kisi', kullaniciAdi: 'dg-kisi', parola: 'dogru-parola-1' }));
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('DG-', 0)");
    const kart = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('dg-1', 'mamul', 'DG-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'dg-1', com: { ad: 'Deneme mamul' } }), kisi]))!.no;
    const tip = (await sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('DG-T', 'Deneme', 'TAL') RETURNING id"))!.id;
    const firma = (await sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fasoncu', 'tedarikci', $1, true) RETURNING id", [kisi]))!.id;
    const emir = async (durum: 'planli' | 'bitti' | 'iptal'): Promise<number> => {
      const id = (await sahip.tek<{ id: number }>(
        "INSERT INTO uretim_emri (parca_no, parca_ad, adet, acan_id, malzeme_no) VALUES ('P-DG', 'Deneme', 4, $1, $2) RETURNING id", [kisi, kart]))!.id;
      const ek = { planli: null, bitti: 'baslama = now(), bitis = now(), saglam_adet = 4', iptal: 'iptal = now()' }[durum];
      if (ek !== null) await sahip.sorgu(`UPDATE uretim_emri SET durum = $2, ${ek} WHERE id = $1`, [id, durum]);
      return id;
    };
    const adim = async (emirId: number, op: number, fasonlu: boolean, tamam = false): Promise<number> => {
      const id = (await sahip.tek<{ id: number }>(
        `INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, fason_firma_id, termin_gun, makine_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL) RETURNING id`,
        [emirId, op / 10, op, tip, `Adım ${op}`, fasonlu ? firma : null, fasonlu ? 3 : null]))!.id;
      if (tamam) await sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now(), bitis = now(), saglam_adet = 4 WHERE id = $1", [id]);
      return id;
    };
    const acikEmir = await emir('planli');
    const acikFason = await adim(acikEmir, 10, true);
    const icAdim = await adim(acikEmir, 20, false);
    const bitmisAdim = await adim(acikEmir, 30, true, true);
    const iptalAdim = await adim(await emir('iptal'), 10, true);
    const bitmisEmirAdim = await adim(await emir('bitti'), 10, true);
    await sahip.sorgu("INSERT INTO uretim_emirleri_fason_hareketi (is_emri_id, yon, adet, kisi_id) VALUES ($1, 'gidis', 3, $2)", [acikFason, kisi]);

    const isEmirleri = () => sahip.sorgu('SELECT * FROM uretim_emirleri_is_emri ORDER BY id');
    const hareketler = () => sahip.sorgu('SELECT id, is_emri_id, yon, adet, hurda_adet, kisi_id, zaman FROM uretim_emirleri_fason_hareketi ORDER BY id');
    const onceIs = await isEmirleri();
    const onceHareket = await hareketler();

    await gocleriUygula(ayar, GOC_KLASORU, { sema });

    const belgeler = await sahip.sorgu<{ isEmriId: number; acilis: string; kisi: number | null; no: string }>(
      'SELECT is_emri_id AS "isEmriId", acilis, olusturan_kisi_id AS kisi, no FROM uretim_emirleri_dis_islem_emri ORDER BY id');
    assert.deepEqual(belgeler.map((b) => [b.isEmriId, b.acilis, b.kisi]), [[acikFason, 'goc', null]]);
    assert.match(belgeler[0]!.no, /^DIE-\d{6}$/);
    for (const yok of [icAdim, bitmisAdim, iptalAdim, bitmisEmirAdim]) assert.ok(!belgeler.some((b) => b.isEmriId === yok), String(yok));
    assert.deepEqual(await isEmirleri(), onceIs);
    assert.deepEqual(await hareketler(), onceHareket);
  });
});
