import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { degisiklikAkisi } from './disari.ts';
import { AKIS_EN_COK_SATIR, AKIS_EN_COK_TABLO, akisAlanlari, akisIstegiHatasi } from './kurallar.ts';

const GIZLI_DEGER = 'cok-gizli-deger-9';

// Deneme tabloları modül tablosunun yerine geçer: modüller kendi göçüyle aynı tetiği bağlar (1973).
const FIKSTUR = [
  `CREATE TABLE deneme_tezgah (id int PRIMARY KEY, ad text, verim numeric, parola text, ayar jsonb, surum int NOT NULL DEFAULT 1)`,
  `CREATE TRIGGER deneme_tezgah_degisiklik AFTER INSERT OR UPDATE OR DELETE ON deneme_tezgah
     FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum')`,
  `CREATE TABLE deneme_tatil (tarih date PRIMARY KEY, ad text)`,
  `CREATE TRIGGER deneme_tatil_degisiklik AFTER INSERT OR UPDATE OR DELETE ON deneme_tatil
     FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('tarih')`,
];

// 1962 / 1966 a: değişiklik akışı okuması. Okuyan modül tablo ve alan sözlüğünü verir; değer yalnız sözlükteki alanda döner.
describe('değişiklik akışı okuması (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici = 0;
  let baslangic = '';

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kisiyle = <T>(is: (db: Db) => Promise<T>): Promise<T> =>
    o().vt.tx(async (db) => {
      await db.sorgu("SELECT set_config('tmiv2.kisi_id', $1, true)", [String(yonetici)]);
      return is(db);
    });
  const SOZLUK = { deneme_tezgah: ['verim', 'parola', 'ayar'], deneme_tatil: ['ad'] } as const;

  before(async () => {
    ortam = await testVeritabaniKur('denetim_akis');
    for (const ddl of FIKSTUR) await ortam.sahip.sorgu(ddl);
    yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Akış Yazan', kullaniciAdi: 'akis-yazan', parola: 'dogru-parola-1' }));
    await ortam.sahip.sorgu("INSERT INTO deneme_tezgah (id, ad, verim) VALUES (1, 'Eski kayıt', 100)");
    // Başlangıçtan önceki satır akışa girmez: defter satırının zamanı yazan transaction'ın başıdır, başlangıç ondan sonra alınır.
    baslangic = (await ortam.sahip.tek<{ z: string }>('SELECT clock_timestamp()::text AS z'))!.z;
    await kisiyle((db) => db.sorgu("INSERT INTO deneme_tezgah (id, ad, verim, parola, ayar) VALUES (2, 'T-02', 90, 'ilk', '{\"isik\": false}')"));
    await kisiyle((db) => db.sorgu(
      "UPDATE deneme_tezgah SET verim = 75, ad = 'T-02b', parola = $1, ayar = '{\"isik\": true}', surum = surum + 1 WHERE id = 2", [GIZLI_DEGER]));
    await kisiyle((db) => db.sorgu("INSERT INTO deneme_tatil (tarih, ad) VALUES ('2026-11-05', 'Deneme tatili')"));
    await o().sahip.sorgu('CREATE TABLE deneme_baska (id int PRIMARY KEY, ad text)');
    await o().sahip.sorgu(`CREATE TRIGGER deneme_baska_degisiklik AFTER INSERT ON deneme_baska
      FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id')`);
    await kisiyle((db) => db.sorgu("INSERT INTO deneme_baska (id, ad) VALUES (1, 'Sözlükte yok')"));
  });
  after(async () => { await ortam?.kaldir(); });

  test('izinli alan değeriyle, değişen öteki alan yalnız adıyla döner; kişi adı gelir, en yeni önce', async () => {
    const akis = await o().vt.tx((db) => degisiklikAkisi(db, { tablolar: SOZLUK, baslangic, sinir: 50 }));
    assert.deepEqual(akis.map((s) => [s.tablo, s.islem]), [['deneme_tatil', 'ekle'], ['deneme_tezgah', 'guncelle'], ['deneme_tezgah', 'ekle']]);
    const g = akis[1]!;
    assert.equal(g.kisiId, yonetici);
    assert.equal(g.kisiAd, 'Akış Yazan');
    assert.deepEqual(g.anahtar, { id: 2 });
    assert.deepEqual(g.alanlar.find((a) => a.alan === 'verim'), { alan: 'verim', eski: 90, yeni: 75 });
    assert.deepEqual(g.digerAlanlar, ['ad']);
    assert.equal(JSON.stringify(g).includes('T-02b'), false);
    assert.deepEqual(akis[0]?.alanlar, [{ alan: 'ad', eski: null, yeni: 'Deneme tatili' }]);
  });

  test('gizli adlı alan sözlükte olsa da maskelenir; jsonb alt anahtarı sütun izniyle döner', async () => {
    const [, g] = await o().vt.tx((db) => degisiklikAkisi(db, { tablolar: SOZLUK, baslangic, sinir: 50 }));
    assert.deepEqual(g?.alanlar.find((a) => a.alan === 'parola'), { alan: 'parola', eski: '[gizli]', yeni: '[gizli]' });
    assert.deepEqual(g?.alanlar.find((a) => a.alan === 'ayar.isik'), { alan: 'ayar.isik', eski: false, yeni: true });
    assert.equal(JSON.stringify(g).includes(GIZLI_DEGER), false);
  });

  test('sözlükte olmayan tablo ve başlangıçtan eski satır dönmez', async () => {
    const akis = await o().vt.tx((db) => degisiklikAkisi(db, { tablolar: SOZLUK, baslangic, sinir: 50 }));
    assert.equal(akis.some((s) => s.tablo === 'deneme_baska'), false);
    assert.equal(akis.some((s) => s.tablo === 'deneme_tezgah' && s.anahtar.id === 1), false);
    const yalniz = await o().vt.tx((db) => degisiklikAkisi(db, { tablolar: { deneme_tatil: ['ad'] }, baslangic, sinir: 50 }));
    assert.deepEqual(yalniz.map((s) => s.tablo), ['deneme_tatil']);
    const gelecek = await o().vt.tx((db) => degisiklikAkisi(db, { tablolar: SOZLUK, baslangic: '2999-01-01T00:00:00Z', sinir: 50 }));
    assert.deepEqual(gelecek, []);
  });

  test('sınır ve önceki kimlik sayfalar; ikinci sayfa ilkinin devamıdır', async () => {
    const hepsi = await o().vt.tx((db) => degisiklikAkisi(db, { tablolar: SOZLUK, baslangic, sinir: 50 }));
    const ilk = await o().vt.tx((db) => degisiklikAkisi(db, { tablolar: SOZLUK, baslangic, sinir: 2 }));
    const ikinci = await o().vt.tx((db) => degisiklikAkisi(db, { tablolar: SOZLUK, baslangic, sinir: 2, onceId: ilk.at(-1)!.id }));
    assert.deepEqual([...ilk, ...ikinci].map((s) => s.id), hepsi.map((s) => s.id));
  });

  test('reddedilen istek: boş, çok tablolu, bozuk adlı sözlük ve aralık dışı sınır okumaz', async () => {
    const oku = (istek: Parameters<typeof degisiklikAkisi>[1]) => o().vt.tx((db) => degisiklikAkisi(db, istek));
    const cok = Object.fromEntries(Array.from({ length: AKIS_EN_COK_TABLO + 1 }, (_, i) => [`deneme_${String(i)}`, ['ad']]));
    for (const istek of [
      { tablolar: {}, baslangic, sinir: 10 },
      { tablolar: cok, baslangic, sinir: 10 },
      { tablolar: { 'deneme_tezgah; drop': ['ad'] }, baslangic, sinir: 10 },
      { tablolar: SOZLUK, baslangic, sinir: 0 },
      { tablolar: SOZLUK, baslangic, sinir: AKIS_EN_COK_SATIR + 1 },
    ]) await assert.rejects(oku(istek), (h: unknown) => (h as { kod?: string }).kod === 'GECERSIZ');
  });
});

describe('değişiklik akışı kuralları', () => {
  test('izin sütun adıyladır; jsonb alt anahtarı sütununa bağlıdır; izinsiz değer düşer, adı kalır', () => {
    const sonuc = akisAlanlari({ verim: { eski: 90, yeni: 75 }, 'ayar.isik': { eski: false, yeni: true }, ad: { eski: 'A', yeni: 'B' } }, ['verim', 'ayar']);
    assert.deepEqual(sonuc.alanlar, [{ alan: 'ayar.isik', eski: false, yeni: true }, { alan: 'verim', eski: 90, yeni: 75 }]);
    assert.deepEqual(sonuc.digerAlanlar, ['ad']);
    assert.deepEqual(akisAlanlari({ ad: { eski: 'A', yeni: 'B' } }, []), { alanlar: [], digerAlanlar: ['ad'] });
  });

  test('gizli adlı izinli alanın iki değeri de çıkmaz; ekleme ve silmede boş taraf boş kalır', () => {
    assert.deepEqual(akisAlanlari({ pin_ozeti: { yeni: 'x' } }, ['pin_ozeti']).alanlar, [{ alan: 'pin_ozeti', eski: null, yeni: '[gizli]' }]);
  });

  test('istek denetimi sınırları ve tablo adını kabul eder ya da gerekçesiyle reddeder', () => {
    assert.equal(akisIstegiHatasi({ tablolar: { vardiya: ['bitis'] }, sinir: AKIS_EN_COK_SATIR }), null);
    assert.match(akisIstegiHatasi({ tablolar: {}, sinir: 1 }) ?? '', /en az bir tablo/);
    assert.match(akisIstegiHatasi({ tablolar: { Vardiya: [] }, sinir: 1 }) ?? '', /geçersiz/);
    assert.match(akisIstegiHatasi({ tablolar: { vardiya: [] }, sinir: 1.5 }) ?? '', /sınırı/);
  });
});
