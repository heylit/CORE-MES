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
const ILK_GOC = '_rota_fason_kontrol.sql';

// 3708: göç iş emrine kontrol türü ekler; var olan satır 'gkk' kalır, kısıtlar geçersiz birleşimi reddeder. Veriler uydurmadır.
describe('fason kontrol türü göçü dolu tabloda (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('fkgoc');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-fk-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('var olan iş emri gkk kalır; kontrolsüz yalnız fason adımda, süre yalnız kaynağında muayenede; aktarım kaydı yalnız eklenir', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, vt, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const goc = hepsi.find((ad) => ad.endsWith(ILK_GOC));
    assert.ok(goc, 'fason kontrol göçü bulunamadı');
    for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });

    const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: 'fk-kisi', kullaniciAdi: 'fk-kisi', parola: 'dogru-parola-1' }));
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('FK-', 0)");
    const kart = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('fk-1', 'mamul', 'FK-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'fk-1', com: { ad: 'Deneme mamul' } }), kisi]))!.no;
    const tip = (await sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('FK-T', 'Deneme', 'TAL') RETURNING id"))!.id;
    const firma = (await sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fasoncu', 'tedarikci', $1, true) RETURNING id", [kisi]))!.id;
    const emir = (await sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, acan_id, malzeme_no) VALUES ('P-FK', 'Deneme', 4, $1, $2) RETURNING id", [kisi, kart]))!.id;
    const adim = async (op: number, fasonlu: boolean): Promise<number> => (await sahip.tek<{ id: number }>(
      `INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, fason_firma_id, termin_gun)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, [emir, op / 10, op, tip, `Adım ${op}`, fasonlu ? firma : null, fasonlu ? 3 : null]))!.id;
    const eskiFason = await adim(10, true);
    const eskiIc = await adim(20, false);
    const onceki = await sahip.sorgu('SELECT * FROM uretim_emirleri_is_emri ORDER BY id');

    await gocleriUygula(ayar, GOC_KLASORU, { sema });

    const sonra = await sahip.sorgu<Record<string, unknown>>('SELECT * FROM uretim_emirleri_is_emri ORDER BY id');
    const sutunlar = Object.keys(onceki[0] ?? {});
    assert.deepEqual(sonra.map((r) => Object.fromEntries(sutunlar.map((k) => [k, r[k]]))), onceki);
    assert.deepEqual(sonra.map((r) => [r.kontrol_turu, r.muayene_suresi_saat]), [['gkk', null], ['gkk', null]]);

    const guncelle = (id: number, tur: string, saat: number | null) =>
      sahip.sorgu('UPDATE uretim_emirleri_is_emri SET kontrol_turu = $2, muayene_suresi_saat = $3 WHERE id = $1', [id, tur, saat]);
    await guncelle(eskiFason, 'kontrolsuz', null);
    await guncelle(eskiFason, 'kaynakta', 2.5);
    await assert.rejects(guncelle(eskiIc, 'kontrolsuz', null), /uretim_emirleri_is_emri_kontrol_fasonda/);
    await assert.rejects(guncelle(eskiIc, 'kaynakta', null), /uretim_emirleri_is_emri_kontrol_fasonda/);
    await assert.rejects(guncelle(eskiFason, 'kontrolsuz', 2), /uretim_emirleri_is_emri_muayene_suresi_kaynakta/);
    await assert.rejects(guncelle(eskiFason, 'baska', null), /uretim_emirleri_is_emri_kontrol_turu/);
    await assert.rejects(guncelle(eskiFason, 'kaynakta', 0), /uretim_emirleri_is_emri_muayene_suresi/);

    const aktar = (saglam: number, hurda: number) => sahip.sorgu(
      'INSERT INTO uretim_emirleri_fason_aktarimi (is_emri_id, hedef_firma_id, saglam_adet, hurda_adet, kisi_id) VALUES ($1, $2, $3, $4, $5)', [eskiFason, firma, saglam, hurda, kisi]);
    await aktar(3, 1);
    await assert.rejects(aktar(0, 0), /uretim_emirleri_fason_aktarimi_bos_degil/);
    await assert.rejects(aktar(-1, 2), /uretim_emirleri_fason_aktarimi_saglam/);
    await assert.rejects(sahip.sorgu('UPDATE uretim_emirleri_fason_aktarimi SET saglam_adet = 9'));
    await assert.rejects(sahip.sorgu('DELETE FROM uretim_emirleri_fason_aktarimi'));
    // Rota adımı aynı sütunları ve kısıtları taşır (ayrıntılı davranış rota göç testinde değil, kısıt adıyla burada yoklanır).
    const kisitlar = (await sahip.sorgu<{ conname: string }>("SELECT conname FROM pg_constraint WHERE conrelid = 'rota_adimi'::regclass AND conname LIKE 'rota_adimi_%kontrol%' OR conname = 'rota_adimi_muayene_suresi_kaynakta'")).map((r) => r.conname);
    assert.ok(['rota_adimi_kontrol_turu', 'rota_adimi_kontrol_fasonda', 'rota_adimi_muayene_suresi_kaynakta'].every((k) => kisitlar.includes(k)), kisitlar.join());
  });
});
