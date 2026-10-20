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
const FIRMA_GOCU = '_musteri_tedarikci_firma.sql';

// Göç dolu tabloda denenir (S2, S4, S6): satırlar, kimlikler, sevkiyat koordinatı ve rol işlemleri korunur.
describe('müşteri ve tedarikçi göçü dolu tabloda (gerçek PostgreSQL, kart #1164)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('mtgoc');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-mtgoc-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('firma satırı ve kimliği aynı kalır; bağlı aktif noktanın koordinatı bir kez teslim adresi olur; işlemler aynı rollere taşınır', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, vt, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const goc = hepsi.find((ad) => ad.endsWith(FIRMA_GOCU));
    assert.ok(goc, 'müşteri ve tedarikçi göçü bulunamadı');
    for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });

    const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: 'mt-kisi', kullaniciAdi: 'mt-kisi', parola: 'dogru-parola-1' }));
    const firma = async (ad: string): Promise<number> =>
      (await sahip.tek<{ id: number }>("INSERT INTO finans_firma (ad, tur, olusturan_id) VALUES ($1, 'musteri', $2) RETURNING id", [ad, kisi]))!.id;
    const bagli = await firma('Goc Deneme Bagli');
    const pasifNoktali = await firma('Goc Deneme Pasif Noktali');
    const noktasiz = await firma('Goc Deneme Noktasiz');
    const nokta = (ad: string, firmaId: number | null, aktif: boolean, enlem: number, boylam: number) => sahip.sorgu(
      "INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam, adres, aktif, firma_id) VALUES ($1, 'musteri', $2, $3, 'Deneme Sok. 1', $4, $5)",
      [ad, enlem, boylam, aktif, firmaId]);
    await nokta('Goc Nokta A', bagli, true, 40.5, 29.25);
    await nokta('Goc Nokta B', pasifNoktali, false, 41, 30);
    await nokta('Goc Nokta C', null, true, 39, 32);
    const rol = (await sahip.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('mt_goc', 'mt_goc') RETURNING id"))!.id;
    const rolsuz = (await sahip.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('mt_goc_yok', 'mt_goc_yok') RETURNING id"))!.id;
    for (const islem of ['finans.firma-oku', 'finans.firma-yaz', 'sayfa.finans']) await sahip.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol, islem]);
    await sahip.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'sayfa.finans')", [rolsuz]);
    const once = await sahip.sorgu<{ id: number; ad: string }>('SELECT id, ad FROM finans_firma ORDER BY id');

    await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [goc]);

    assert.deepEqual(await sahip.sorgu('SELECT id, ad FROM musteri_tedarikci_firma ORDER BY id'), once, 'satırlar ve kimlikler aynı');
    assert.equal((await sahip.tek<{ n: number }>("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = current_schema() AND tablename = 'finans_firma'"))?.n, 0);
    const adresler = await sahip.sorgu<{ firma_id: number; tur: string; ad: string; enlem: number; boylam: number; olusturan_id: number }>(
      'SELECT firma_id, tur, ad, enlem::float8 AS enlem, boylam::float8 AS boylam, olusturan_id FROM musteri_tedarikci_adres ORDER BY id');
    assert.deepEqual(adresler, [{ firma_id: bagli, tur: 'teslim', ad: 'Goc Nokta A', enlem: 40.5, boylam: 29.25, olusturan_id: kisi }],
      'yalnız firmaya bağlı aktif nokta kopyalanır');
    assert.ok(![pasifNoktali, noktasiz].some((id) => adresler.some((a) => a.firma_id === id)));
    const islemler = async (rolId: number) => (await sahip.sorgu<{ islem: string }>('SELECT islem FROM rol_islemi WHERE rol_id = $1 ORDER BY islem', [rolId])).map((s) => s.islem);
    assert.deepEqual(await islemler(rol), ['musteri-tedarikci.oku', 'musteri-tedarikci.yaz', 'sayfa.finans', 'sayfa.musteri-tedarikci']);
    assert.deepEqual(await islemler(rolsuz), ['sayfa.finans'], 'firma işlemi olmayan rol sayfayı almaz');
    // Sevkiyatın yabancı anahtarı yeni tabloya bağlı kalır.
    await assert.rejects(sahip.sorgu("INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam, firma_id) VALUES ('Goc Nokta D', 'musteri', 1, 1, 999999)"), /sevkiyat_noktasi_firma/);
    await assert.rejects(sahip.sorgu('DELETE FROM musteri_tedarikci_firma WHERE id = $1', [noktasiz]));
  });
});
