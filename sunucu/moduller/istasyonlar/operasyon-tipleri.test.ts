import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { OPERASYON_GRUP_KODLARI } from '#paylasilan/sozlesme/istasyonlar.ts';
import { operasyonTipleri } from './disari.ts';

describe('IS11: operasyon tipi kataloğu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  // Kısıtların kendisi sınanır: kayıt uç atlanarak doğrudan eklenir (uç testleri IS13).
  const ekle = (kod: string, ad: string, grup = 'TAL', aktif = true) =>
    vt().sorgu('INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup, aktif) VALUES ($1, $2, $3, $4)', [kod, ad, grup, aktif]);
  const kisitAdi = (ad: string) => (h: { constraint?: string }) => h.constraint === ad;
  const aktifler = () => vt().tx((db) => operasyonTipleri(db));

  before(async () => {
    ortam = await testVeritabaniKur('istasyonlar_operasyon');
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('İ2: katalog malzemelerin kodlu listesiyle gelir: 96 aktif tip, her grupta en az bir tip, kodlar tekil', async () => {
    const liste = await aktifler();
    assert.equal(liste.length, 96);
    assert.ok(liste.every((t) => t.aktif));
    assert.deepEqual([...new Set(liste.map((t) => t.grup))].sort(), [...OPERASYON_GRUP_KODLARI].sort());
    assert.equal(new Set(liste.map((t) => t.kod)).size, 96);
    const torna = liste.find((t) => t.kod === 'TRN');
    assert.deepEqual(torna && { ad: torna.ad, grup: torna.grup }, { ad: 'Torna (CNC)', grup: 'TAL' });
  });

  test('koda göre sıralı gelir; pasif yalnız istenince döner', async () => {
    await ekle('ZZ-ESKI', 'Eski İşlem', 'TAL', false);
    const kodlar = (await aktifler()).map((t) => t.kod);
    assert.deepEqual(kodlar, [...kodlar].sort());
    assert.equal(kodlar.includes('ZZ-ESKI'), false);
    const hepsi = await vt().tx((db) => operasyonTipleri(db, { pasiflerDahil: true }));
    assert.deepEqual(hepsi.find((t) => t.kod === 'ZZ-ESKI')?.aktif, false);
    assert.deepEqual(Object.keys(hepsi[0] ?? {}).sort(), [
      'ad', 'aktif', 'grup', 'id', 'kisaltma', 'kod', 'varsayilanAyarDk', 'varsayilanBirimDk', 'varsayilanIstasyonId',
    ]);
  });

  test('kod benzersiz ve biçimli, ad boş olamaz, grup listeden; geçerli kayıt kabul edilir', async () => {
    await assert.rejects(ekle('TRN', 'Yine Torna'), kisitAdi('istasyonlar_operasyon_tipi_kod_benzersiz'));
    await assert.rejects(ekle('kucuk-kod', 'Küçük'), kisitAdi('istasyonlar_operasyon_tipi_kod_bicimi'));
    await assert.rejects(ekle('BOS-AD', '  '), kisitAdi('istasyonlar_operasyon_tipi_ad_bos_degil'));
    await assert.rejects(ekle('YENI-GRP', 'Yeni', 'XYZ'), kisitAdi('istasyonlar_operasyon_tipi_grup_degeri'));
    await ekle('ZZ-YENI', 'Yeni İşlem', 'KAL');
    assert.ok((await aktifler()).some((t) => t.kod === 'ZZ-YENI'));
  });

  test('IR1: varsayılanlar boş olabilir; 96 tohum satırında boş kalır; kısaltma biçimli, süre negatif olamaz, istasyon var olmalı', async () => {
    const tohum = (await aktifler()).filter((t) => !t.kod.startsWith('ZZ-'));
    assert.equal(tohum.length, 96);
    assert.ok(tohum.every((t) => t.kisaltma === null && t.varsayilanAyarDk === null && t.varsayilanBirimDk === null && t.varsayilanIstasyonId === null));
    const guncelle = (sutun: string, deger: unknown) =>
      vt().sorgu(`UPDATE istasyonlar_operasyon_tipi SET ${sutun} = $1 WHERE kod = 'TRN'`, [deger]);
    await assert.rejects(guncelle('kisaltma', 'cok-uzun'), kisitAdi('istasyonlar_operasyon_tipi_kisaltma_bicimi'));
    await assert.rejects(guncelle('varsayilan_ayar_dk', -1), kisitAdi('istasyonlar_operasyon_tipi_ayar_negatif_degil'));
    await assert.rejects(guncelle('varsayilan_birim_dk', -0.5), kisitAdi('istasyonlar_operasyon_tipi_birim_negatif_degil'));
    await assert.rejects(guncelle('varsayilan_istasyon_id', 999999), (h: { code?: string }) => h.code === '23503');
    await guncelle('kisaltma', 'TÖR');
    assert.equal((await aktifler()).find((t) => t.kod === 'TRN')?.kisaltma, 'TÖR');
  });
});
