import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { TABAN_HAMMADDE_AILELERI } from '#paylasilan/sozlesme/kategori-agaci-sabitleri.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kategoriAgaci } from './disari.ts';
import { kategoriAgaciKur } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

describe('kategori ağacı kuralı (2465)', () => {
  test('ayarsız: taban aileler aktif, Hammadde altında, taban sırasıyla', () => {
    const a = kategoriAgaciKur(null, []);
    assert.deepEqual(a.map((d) => d.kod), TABAN_HAMMADDE_AILELERI.map((x) => x.kod));
    assert.ok(a.every((d) => d.tur === 'hammadde' && d.ustAd === 'Hammadde' && d.aktif));
  });

  test('ek aile sona eklenir, gizli aile pasif döner; bozuk, boş ve tabanla aynı anahtarlı ek atlanır', () => {
    const a = kategoriAgaciKur({
      aileler: [{ key: ' ozel ', ad: ' Özel aile ' }, { key: 'metal', ad: 'İkinci metal' }, { key: '', ad: 'Boş' }, { key: 'x' }, 'bozuk', { key: 'ozel', ad: 'Tekrar' }],
      gizliAileler: ['cam', 'ozel', 3],
    }, []);
    assert.deepEqual(a.at(-1), { tur: 'hammadde', kod: 'ozel', ad: 'Özel aile', ustAd: 'Hammadde', aktif: false });
    assert.equal(a.length, TABAN_HAMMADDE_AILELERI.length + 1);
    assert.equal(a.find((d) => d.kod === 'metal')?.ad, 'Metal');
    assert.equal(a.find((d) => d.kod === 'cam')?.aktif, false);
  });

  test('kategoriler tür sırasıyla; türde yerleşik önce, sonra ad', () => {
    const a = kategoriAgaciKur(null, [
      { tur: 'hizmet', kod: 'isil', ad: 'Isıl işlem', yerlesik: true, aktif: true },
      { tur: 'sarf', kod: 'ek', ad: 'Ambalaj eki', yerlesik: false, aktif: false },
      { tur: 'demirbas', kod: 'bt', ad: 'Bilgisayar', yerlesik: true, aktif: true },
      { tur: 'sarf', kod: 'takim', ad: 'Kesici takım', yerlesik: true, aktif: true },
      { tur: 'sarf', kod: 'cay', ad: 'Çay ocağı', yerlesik: false, aktif: true },
    ]).filter((d) => d.tur !== 'hammadde');
    assert.deepEqual(a.map((d) => `${d.ustAd}/${d.kod}/${String(d.aktif)}`), ['Sarf/takim/true', 'Sarf/ek/false', 'Sarf/cay/true', 'Demirbaş/bt/true', 'Hizmet/isil/true']);
  });
});

describe('kategori ağacı okuması (2465, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisiId = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  before(async () => {
    ortam = await testVeritabaniKur('malzemekagac');
    kisiId = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Ağaç', kullaniciAdi: 'agac-yonetici', parola: PAROLA }));
  });
  after(async () => { await ortam?.kaldir(); });

  test('yerleşik sarf, demirbaş ve hizmet satırları ve taban aileler döner', async () => {
    const a = await o().vt.okumaTx((db) => kategoriAgaci(db));
    assert.equal(a.filter((d) => d.tur === 'hammadde').length, TABAN_HAMMADDE_AILELERI.length);
    assert.deepEqual(a.find((d) => d.tur === 'sarf' && d.kod === 'takim'), { tur: 'sarf', kod: 'takim', ad: 'Kesici takım', ustAd: 'Sarf', aktif: true });
    assert.deepEqual(a.find((d) => d.tur === 'demirbas' && d.kod === 'olcu'), { tur: 'demirbas', kod: 'olcu', ad: 'Ölçü ve test aleti', ustAd: 'Demirbaş', aktif: true });
    assert.deepEqual(a.find((d) => d.tur === 'hizmet' && d.kod === 'isil'), { tur: 'hizmet', kod: 'isil', ad: 'Isıl işlem', ustAd: 'Hizmet', aktif: true });
    assert.deepEqual([...new Set(a.map((d) => d.tur))], ['hammadde', 'sarf', 'demirbas', 'hizmet']);
  });

  test('Malzeme ayarındaki ek aile ve gizli aile, pasif kategori okunur', async () => {
    await o().sahip.sorgu(
      `INSERT INTO malzeme_katalog_ayari (anahtar, deger, guncelleyen_kisi_id) VALUES ('malzeme', $1, $2)
       ON CONFLICT (anahtar) DO UPDATE SET deger = EXCLUDED.deger`,
      [JSON.stringify({ aileler: [{ key: 'ozelaile', ad: 'Özel aile', kod: 'OZL' }], gizliAileler: ['ahsap'] }), kisiId],
    );
    await o().sahip.sorgu("UPDATE malzeme_kategorisi SET aktif = false WHERE tur = 'sarf' AND kod = 'ambalaj'");
    const a = await o().vt.okumaTx((db) => kategoriAgaci(db));
    assert.deepEqual(a.find((d) => d.kod === 'ozelaile'), { tur: 'hammadde', kod: 'ozelaile', ad: 'Özel aile', ustAd: 'Hammadde', aktif: true });
    assert.equal(a.find((d) => d.tur === 'hammadde' && d.kod === 'ahsap')?.aktif, false);
    assert.equal(a.find((d) => d.tur === 'sarf' && d.kod === 'ambalaj')?.aktif, false);
  });
});
