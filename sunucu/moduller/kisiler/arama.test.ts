import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { aramaSade, basDeseni, icindeDeseni, type KayitAramaIstegi } from '#paylasilan/kayit-aramasi.ts';
import { kayitAramaKaynaklari, yoneticiOlustur } from './disari.ts';
import { kisiEkle, kisiPasifeAl } from './servis.ts';

describe('kişi arama kaynağı (kart #1236, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let ayse = 0;
  let pasif = 0;
  const kaynak = kayitAramaKaynaklari[0]!;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (q: string, islemler: readonly Islem[] = ['kisiler.oku'], sinir = 5): KayitAramaIstegi => ({
    q, sade: aramaSade(q), icindeDeseni: icindeDeseni(q), basDeseni: basDeseni(q), sinir, kullanici: { id: 1, islemler },
  });
  const ara = (q: string, islemler?: readonly Islem[], sinir?: number) => vt().tx((db) => kaynak.ara(db, istek(q, islemler, sinir)));

  before(async () => {
    ortam = await testVeritabaniKur('kisiler_arama');
    const yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    ayse = await ortam.vt.tx((db) => kisiEkle(db, { ad: 'Ayşe Aramaca', sicilNo: 'S-100', gorev: 'Tornacı' }));
    await ortam.vt.tx((db) => kisiEkle(db, { ad: 'Mehmet Aramaca', sicilNo: 'S-1001', gorev: null }));
    await ortam.vt.tx((db) => kisiEkle(db, { ad: 'Yüzde%Deneme', sicilNo: null, gorev: null }));
    pasif = await ortam.vt.tx((db) => kisiEkle(db, { ad: 'Aramaca Pasif', sicilNo: null, gorev: null }));
    await ortam.vt.tx((db) => kisiPasifeAl(db, yonetici, pasif));
  });
  after(async () => { await ortam?.kaldir(); });

  test('kaynak kişi türünü kisiler.oku işlemiyle bildirir', () => {
    assert.equal(kayitAramaKaynaklari.length, 1);
    assert.equal(kaynak.tur, 'kisi');
    assert.deepEqual(kaynak.yetki, ['kisiler.oku']);
  });

  test('izinli: adda, sicil no da ve görevde arar; sonuç Personel formunu açar', async () => {
    const adla = await ara('aramaca');
    assert.equal(adla.length, 3);
    // Adı metinle başlayan önce, aktif pasiften önce.
    assert.equal(adla[0]!.baslik, 'Aramaca Pasif');
    assert.deepEqual(adla.slice(1).map((s) => s.baslik), ['Ayşe Aramaca', 'Mehmet Aramaca']);
    assert.equal(adla[0]!.aciklama, 'Pasif');
    const gorevle = await ara('tornac');
    assert.deepEqual(gorevle, [{ anahtar: String(ayse), baslik: 'Ayşe Aramaca', aciklama: 'S-100 · Tornacı', yol: `/personel?kisi=${ayse}` }]);
  });

  test('sicil no su tam tutan önce gelir; sınır uygulanır', async () => {
    const sonuc = await ara('s-100');
    assert.deepEqual(sonuc.map((s) => s.baslik), ['Ayşe Aramaca', 'Mehmet Aramaca']);
    assert.equal((await ara('aramaca', undefined, 1)).length, 1);
  });

  test('Türkçe harf büyük-küçük farkı gözetilmez', async () => {
    assert.deepEqual((await ara('AYŞE')).map((s) => s.baslik), ['Ayşe Aramaca']);
    assert.deepEqual((await ara('TORNACI')).map((s) => s.baslik), ['Ayşe Aramaca']);
    assert.deepEqual((await ara('ayse')).map((s) => s.baslik), ['Ayşe Aramaca']);
  });

  test('joker karakter düz metin aranır', async () => {
    assert.deepEqual((await ara('%')).map((s) => s.baslik), ['Yüzde%Deneme']);
  });

  test('reddedilen: kisiler.oku olmayan kullanıcıya sonuç dönmez', async () => {
    assert.deepEqual(await ara('aramaca', []), []);
    assert.deepEqual(await ara('aramaca', ['kisiler.yaz', 'sayfa.personel']), []);
  });

  test('indeksler kurulu ve arama sorgusu onları kullanabilir', async () => {
    const indeksler = await vt().sorgu<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'kisi' AND indexname LIKE '%_trgm' ORDER BY 1",
    );
    assert.deepEqual(indeksler.map((i) => i.indexname), ['kisiler_kisi_ad_trgm', 'kisiler_kisi_gorev_trgm', 'kisiler_kisi_sicil_no_trgm']);
    const plan = await vt().tx(async (db) => {
      await db.sorgu('SET LOCAL enable_seqscan = off');
      return db.sorgu<{ 'QUERY PLAN': string }>(
        "EXPLAIN SELECT id FROM kisi WHERE public.arama_sade(ad) LIKE '%aram%' OR public.arama_sade(sicil_no) LIKE '%aram%' OR public.arama_sade(gorev) LIKE '%aram%'",
      );
    });
    const metin = plan.map((p) => p['QUERY PLAN']).join('\n');
    for (const ad of ['kisiler_kisi_ad_trgm', 'kisiler_kisi_sicil_no_trgm', 'kisiler_kisi_gorev_trgm']) assert.match(metin, new RegExp(ad), metin);
  });
});
