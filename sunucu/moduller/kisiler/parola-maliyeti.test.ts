import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { after, before, describe, it, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { TEST_N, URETIM_N, maliyetSec, parolaDogrula, parolaOzetle, testParolaMaliyetiAyarla, yenidenOzetlenmeli } from './parola.ts';
import { girisDogrula, yoneticiOlustur } from './servis.ts';

// Eski maliyetle (2226-4 öncesi, N=16384) üretilmiş özet: girişte doğrulanmalı ve yenilenmeli.
function eskiOzet(parola: string, n = 16384): string {
  const tuz = randomBytes(16);
  const ozet = scryptSync(parola.normalize('NFKC'), tuz, 32, { N: n, r: 8, p: 1, maxmem: 256 * n * 8 });
  return ['scrypt', n, 8, 1, tuz.toString('base64url'), ozet.toString('base64url')].join('$');
}

describe('parola özeti maliyeti (2226-4 a)', () => {
  it('üretim varsayılanı 65536; düşük maliyet yalnız açık istek + test ortamı birlikteyken', () => {
    assert.equal(URETIM_N, 65536);
    assert.equal(maliyetSec(null, undefined), URETIM_N);
    assert.equal(maliyetSec(null, 'test'), URETIM_N);
    assert.equal(maliyetSec(TEST_N, 'canli'), URETIM_N);
    assert.equal(maliyetSec(TEST_N, 'gelistirme'), URETIM_N);
    assert.equal(maliyetSec(TEST_N, undefined), URETIM_N);
    assert.equal(maliyetSec(TEST_N, 'test'), TEST_N);
  });

  it('ayarlanmadıkça özet üretim maliyetiyle çıkar; test dışı ortamda ayarlayıcı etkisizdir', async () => {
    assert.equal((await parolaOzetle('x')).split('$')[1], String(URETIM_N));
    const onceki = process.env.TMIV2_ORTAM;
    process.env.TMIV2_ORTAM = 'canli';
    try {
      testParolaMaliyetiAyarla();
      assert.equal((await parolaOzetle('x')).split('$')[1], String(URETIM_N));
    } finally {
      process.env.TMIV2_ORTAM = onceki;
      testParolaMaliyetiAyarla(null);
    }
  });

  it('gerçek üretim maliyetiyle (N=65536) tur: özetlenir, doğrulanır, yenilenmesi gerekmez', async () => {
    const ozet = await parolaOzetle('dogru-parola-1', URETIM_N);
    assert.equal(ozet.split('$')[1], '65536');
    assert.equal(await parolaDogrula('dogru-parola-1', ozet), true);
    assert.equal(await parolaDogrula('yanlis', ozet), false);
    assert.equal(yenidenOzetlenmeli(ozet, URETIM_N), false);
  });

  it('eski (16384) özet doğrulanmaya devam eder ve üretimde yenilenmesi gerekir', async () => {
    const ozet = eskiOzet('dogru-parola-1');
    assert.equal(await parolaDogrula('dogru-parola-1', ozet), true);
    assert.equal(yenidenOzetlenmeli(ozet, URETIM_N), true);
  });

  it('aşırı maliyetli (bozuk) özet hesaplanmadan reddedilir', async () => {
    const ozet = ['scrypt', 1 << 20, 8, 1, 'AAAA', 'AAAA'].join('$');
    assert.equal(await parolaDogrula('x', ozet), false);
  });
});

describe('girişte özet yenileme (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const kayit = (id: number) => vt().tek<{ parola_ozeti: string; gecersiz: string | null }>(
    'SELECT parola_ozeti, oturumlar_gecersiz_once::text AS gecersiz FROM kisi WHERE id = $1', [id],
  );

  before(async () => {
    testParolaMaliyetiAyarla();
    ortam = await testVeritabaniKur('kisiler_parola_maliyeti');
  });

  after(async () => {
    testParolaMaliyetiAyarla(null);
    await ortam?.kaldir();
  });

  test('doğru parola eski özeti yeni maliyete yeniler; oturumları geçersiz kılmaz', async () => {
    const id = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi: 'pm-yenile', parola: 'dogru-parola-1' }));
    // Bu bölümde hedef maliyet açıkça TEST_N'ye ayarlı; eski özet ondan düşük üretilir, yol üretimdekiyle aynıdır.
    const eski = eskiOzet('dogru-parola-1', TEST_N / 4);
    await vt().tx((db) => db.sorgu('UPDATE kisi SET parola_ozeti = $2 WHERE id = $1', [id, eski]));
    const once = await kayit(id);

    assert.notEqual(await vt().tx((db) => girisDogrula(db, 'pm-yenile', { parola: 'dogru-parola-1' })), null);
    const sonra = await kayit(id);
    assert.notEqual(sonra?.parola_ozeti, eski);
    assert.equal(sonra?.parola_ozeti.split('$')[1], String(TEST_N));
    assert.equal(sonra?.gecersiz, once?.gecersiz);
    // Yenilenen özetle giriş sürer.
    assert.notEqual(await vt().tx((db) => girisDogrula(db, 'pm-yenile', { parola: 'dogru-parola-1' })), null);
  });

  test('yanlış parola özeti değiştirmez', async () => {
    const id = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi: 'pm-yanlis', parola: 'dogru-parola-1' }));
    const eski = eskiOzet('dogru-parola-1');
    await vt().tx((db) => db.sorgu('UPDATE kisi SET parola_ozeti = $2 WHERE id = $1', [id, eski]));
    assert.equal(await vt().tx((db) => girisDogrula(db, 'pm-yanlis', { parola: 'yanlis-parola' })), null);
    assert.equal((await kayit(id))?.parola_ozeti, eski);
  });
});
