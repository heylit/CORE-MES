import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { numaraAl } from './disari.ts';
import { ayarDegistir } from './servis.ts';
import { simdikiYilAy } from './sorgular.ts';

const bosMu = () => Promise.resolve(false);

describe('ayarlar: belge numarası (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisiId = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const kalipYaz = (anahtar: string, kalip: unknown) => vt().tx((db) => ayarDegistir(db, kisiId, anahtar, kalip));

  before(async () => {
    ortam = await testVeritabaniKur('ayarlar_numara');
    kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
  });
  after(async () => { await ortam?.kaldir(); });
  beforeEach(async () => {
    await vt().sorgu('DELETE FROM ayar');
    await vt().sorgu('DELETE FROM ayar_numara_sayaci');
  });

  test('varsayılan kalıp bugünkü biçimi verir ve her istekte sıra bir artar', async () => {
    assert.equal(await vt().tx((db) => numaraAl(db, 'stok.mal-kabul-no', { varMi: bosMu })), 'MK-000001');
    assert.equal(await vt().tx((db) => numaraAl(db, 'stok.mal-kabul-no', { varMi: bosMu })), 'MK-000002');
    // Belgelerin sayaçları ayrıdır.
    assert.equal(await vt().tx((db) => numaraAl(db, 'stok.fis-no', { varMi: bosMu })), 'TF-000001');
  });

  test('kalıp değişince yeni numara yeni kalıpla kurulur; yıl ve ay atölye saatindendir, dönem sayacı ayrıdır', async () => {
    const { yil, ay } = await vt().tx((db) => simdikiYilAy(db));
    const yy = String(yil % 100).padStart(2, '0');
    const aa = String(ay).padStart(2, '0');
    await vt().tx((db) => numaraAl(db, 'stok.toplama-no', { varMi: bosMu }));
    await kalipYaz('stok.toplama-no', 'TL/{YY}{AA}/{SAYAC:2}');
    assert.equal(await vt().tx((db) => numaraAl(db, 'stok.toplama-no', { varMi: bosMu })), `TL/${yy}${aa}/01`);
    const donemler = await vt().sorgu<{ donem: string; son_sira: number }>(
      "SELECT donem, son_sira FROM ayar_numara_sayaci WHERE anahtar = 'stok.toplama-no' ORDER BY donem",
    );
    assert.deepEqual(donemler, [{ donem: '-', son_sira: 1 }, { donem: `${yil}-${aa}`, son_sira: 1 }]);
  });

  test('belge alanları numaraya girer; boş alan iki yanındaki tireyle birlikte düşer', async () => {
    const { yil, ay } = await vt().tx((db) => simdikiYilAy(db));
    const yyaa = `${String(yil % 100).padStart(2, '0')}-${String(ay).padStart(2, '0')}`;
    const al = (alanlar: Record<string, string | null>) =>
      vt().tx((db) => numaraAl(db, 'uretim-emirleri.emir-no', { alanlar, varMi: bosMu }));
    assert.equal(await al({ FIRMA: 'FRM', PROJE: 'PRJ', PARCA: 'PRC' }), `FRM-PRJ-PRC-${yyaa}-001`);
    assert.equal(await al({ FIRMA: null, PROJE: '', PARCA: 'PRC' }), `PRC-${yyaa}-002`);
  });

  test('kullanılan numara atlanır: kalıp eski numarayla çakışırsa sıradaki boş numara verilir', async () => {
    const dolu = new Set(['MI-000001', 'MI-000002']);
    const no = await vt().tx((db) => numaraAl(db, 'stok.malzeme-istegi-no', { varMi: (n) => Promise.resolve(dolu.has(n)) }));
    assert.equal(no, 'MI-000003');
    // Karşı örnek: atlama yoksa ilk sıra verilir.
    assert.equal(await vt().tx((db) => numaraAl(db, 'stok.fis-no', { varMi: bosMu })), 'TF-000001');
  });

  test('kayıt geri alınırsa sıra da geri alınır; aynı anda iki işlem aynı numarayı alamaz', async () => {
    await assert.rejects(vt().tx(async (db) => {
      await numaraAl(db, 'satin-alma.katalog-kodu', { varMi: bosMu });
      throw new Error('kayıt geri alındı');
    }), /kayıt geri alındı/);
    assert.equal(await vt().tx((db) => numaraAl(db, 'satin-alma.katalog-kodu', { varMi: bosMu })), 'M-0001');
    const nolar = await Promise.all(Array.from({ length: 6 }, () => vt().tx((db) => numaraAl(db, 'satin-alma.katalog-kodu', { varMi: bosMu }))));
    assert.deepEqual([...nolar].sort(), ['M-0002', 'M-0003', 'M-0004', 'M-0005', 'M-0006', 'M-0007']);
  });

  test('bozuk kalıp kaydedilmez: sayaçsız, bilinmeyen alan, yılsız ay ve küçük harf reddedilir; geçerli kalıp kabul edilir', async () => {
    for (const kotu of ['MK-{YYYY}', 'MK-{SAYAC:3}-{SAYAC:2}', 'MK-{PARCA}-{SAYAC:3}', 'MK-{AA}-{SAYAC:3}', 'mk-{SAYAC:3}', 'MK-{SAYAC:0}', '', 5, null]) {
      await assert.rejects(kalipYaz('stok.mal-kabul-no', kotu), (h: unknown) => h instanceof UygulamaHatasi && h.durum === 400, String(kotu));
    }
    assert.equal((await vt().sorgu('SELECT 1 FROM ayar')).length, 0);
    const ayar = await kalipYaz('stok.mal-kabul-no', 'MK-{YYYY}-{SAYAC:4}');
    assert.equal(ayar.deger, 'MK-{YYYY}-{SAYAC:4}');
    // Belge alanı yalnız tanımında bildirilen belgede geçer.
    assert.equal((await kalipYaz('uretim-emirleri.emir-no', '{PARCA}-{SAYAC:3}')).deger, '{PARCA}-{SAYAC:3}');
  });

  test('sayaç satırı biçim kısıtlarına uyar', async () => {
    await assert.rejects(vt().sorgu("INSERT INTO ayar_numara_sayaci (anahtar, donem, son_sira) VALUES ('stok.fis-no', '2026-1', 1)"), /ayar_numara_sayaci_donem_bicimi/);
    await assert.rejects(vt().sorgu("INSERT INTO ayar_numara_sayaci (anahtar, donem, son_sira) VALUES ('stok.fis-no', '2026', 0)"), /ayar_numara_sayaci_sira_pozitif/);
    await vt().sorgu("INSERT INTO ayar_numara_sayaci (anahtar, donem, son_sira) VALUES ('stok.fis-no', '2026-10', 1)");
  });
});
