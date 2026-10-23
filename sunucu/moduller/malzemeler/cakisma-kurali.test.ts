import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KatalogKartiKaydetCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tamGovde } from './test-kart.ts';
import { surumlu } from './test-surum.ts';
import {
  katalogAnahtarCakismalari, katalogCakismaAlanlari, katalogCakismaListesiGecerliMi, katalogKuralAnahtari, katalogKurallariGecerliMi, katalogYeniAnahtar,
} from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

test('MKK-16: çakışma listesi alan adlarından oluşur; kurallar nesnesi tür başına denetlenir', () => {
  for (const d of [undefined, null, [], ['musteri'], ['_ad', '_ac', 'tr_no']]) assert.equal(katalogCakismaListesiGecerliMi(d), true, JSON.stringify(d));
  for (const d of ['musteri', [1], ['a b'], ['x'.repeat(41)], {}]) assert.equal(katalogCakismaListesiGecerliMi(d), false, JSON.stringify(d));
  for (const d of [undefined, null, {}, { mamul: null }, { mamul: { ad: 'x' } }, { mamul: { cakisma: ['musteri'] } }]) assert.equal(katalogKurallariGecerliMi(d), true, JSON.stringify(d));
  for (const d of [[], 'x', { mamul: 'x' }, { mamul: { cakisma: 'musteri' } }]) assert.equal(katalogKurallariGecerliMi(d), false, JSON.stringify(d));
  assert.deepEqual(katalogCakismaAlanlari({ kurallar: { mamul: { cakisma: ['rev', 'musteri', 'rev'] } } }, 'mamul'), ['musteri', 'rev']);
  assert.equal(katalogCakismaAlanlari({ kurallar: { mamul: { cakisma: [] } } }, 'mamul'), null);
  assert.equal(katalogCakismaAlanlari({ kurallar: { mamul: { cakisma: ['musteri'] } } }, 'yarimamul'), null);
  assert.equal(katalogCakismaAlanlari(null, 'mamul'), null);
});

test('MKK-16: kural anahtarı harf, boşluk ve noktalamayı yok sayar; boş alan anahtar üretmez', () => {
  const a = katalogKuralAnahtari('mamul', ['musteri', '_ad'], { com: { ad: 'Flanş Ø40' }, g: { musteri: 'Örnek-A' } });
  const b = katalogKuralAnahtari('mamul', ['musteri', '_ad'], { com: { ad: 'flanş ø 40' }, g: { musteri: 'örnek a' } });
  assert.equal(a, 'K|mamul|musteri=örneka|_ad=flanş40');
  assert.equal(a, b);
  assert.equal(katalogKuralAnahtari('mamul', ['musteri'], { g: {} }), null);
  assert.equal(katalogKuralAnahtari('mamul', ['_ac'], { com: { ac1: 'X', ac2: '', ac3: 'Y' } }), 'K|mamul|_ac=xy');
  assert.equal(katalogKuralAnahtari('sarf', ['oz'], { g: { oz: ['b', 'a'] } }), katalogKuralAnahtari('sarf', ['oz'], { g: { oz: ['a', 'b'] } }));
  assert.equal(katalogYeniAnahtar('mamul', null, { kayit: {}, varsayilanAnahtar: 'v' }), 'v');
  assert.deepEqual(katalogAnahtarCakismalari([
    { stokKodu: 'A', anahtar: 'k', etkin: true, gerekceli: false },
    { stokKodu: 'B', anahtar: 'k', etkin: true, gerekceli: false },
    { stokKodu: 'C', anahtar: 'k', etkin: false, gerekceli: false },
    { stokKodu: 'D', anahtar: 'k', etkin: true, gerekceli: true },
    { stokKodu: 'E', anahtar: null, etkin: true, gerekceli: false },
  ]), [['A', 'B']]);
});

describe('Çakışma alanları sunucu engeli (MKK-16, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = async (url: string, govde: unknown) =>
    app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: cerez }, payload: (await surumlu(vt(), url, tamGovde(url, govde))) as object });
  const ayar = (cakisma: string[] | undefined) =>
    istek('/malzeme-katalogu-ayarlari/malzeme/kaydet', { deger: cakisma === undefined ? {} : { kurallar: { mamul: { ad: '{musteri}', cakisma } } } });
  const surumler = new Map<string, number>();
  const kaydet = async (kimlik: string, musteri: string, gerekce: string | null = null) => {
    const c = await istek(`/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
      kayit: { id: kimlik, tur: 'mamul', com: { kod: 'MM-GEN-00000', ad: `Parça ${kimlik}`, birim: 'adet' }, g: { musteri, resim: kimlik }, onay: { durum: 'taslak' } },
      ozet: { benzersiz_anahtar: `mamul|resim|${kimlik}`, mukerrer_gerekcesi: gerekce }, surum: surumler.get(kimlik) ?? null,
    });
    if (c.statusCode === 200) surumler.set(kimlik, (c.json() as KatalogKartiKaydetCevabi).surum);
    return c;
  };
  const anahtarlar = async (): Promise<Record<string, { b: string | null; v: string | null }>> => {
    const satirlar = await vt().tx((db) => db.sorgu<{ kimlik: string; b: string | null; v: string | null }>(
      `SELECT kimlik, benzersiz_anahtar AS b, varsayilan_anahtar AS v FROM malzeme_katalog_karti WHERE tur = 'mamul'`));
    return Object.fromEntries(satirlar.map((s) => [s.kimlik, { b: s.b, v: s.v }]));
  };

  before(async () => {
    ortam = await testVeritabaniKur('cakismakurali');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme çakışma', kullaniciAdi: 'ck-yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'ck-yonetici', parola: PAROLA } });
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  // Varsayılan anahtarı sunucu kurar (B11): resim no ile kart başına ayrıdır, ekranın gönderdiği okunmaz.
  test('liste yokken sunucunun varsayılan anahtarı geçerlidir ve varsayılan anahtar olarak da saklanır', async () => {
    assert.equal((await kaydet('c1', 'Müşteri A')).statusCode, 200);
    assert.equal((await kaydet('c2', 'Müşteri A')).statusCode, 200, 'varsayılan kuralda anahtarlar farklı');
    const k = await anahtarlar();
    assert.deepEqual(k['c1'], { b: 'MM|R|c1|', v: 'MM|R|c1|' });
  });

  test('yeni kural var olan etkin kartları çakıştırıyorsa ayar yazılmaz ve anahtarlar değişmez', async () => {
    const c = await ayar(['musteri']);
    assert.equal(c.statusCode, 409, c.body);
    assert.match(c.body, /MM-/);
    const k = await anahtarlar();
    assert.equal(k['c1']?.b, 'MM|R|c1|');
    const kayitli = await vt().tx((db) => db.sorgu<{ deger: unknown }>(`SELECT deger FROM malzeme_katalog_ayari WHERE anahtar = 'malzeme'`));
    assert.ok(!JSON.stringify(kayitli).includes('"cakisma"'), 'ayar geri alındı');
  });

  test('çakışan kart gerekçeliyse kural kaydedilir; anahtarlar ayardan yeniden kurulur', async () => {
    assert.equal((await kaydet('c2', 'Müşteri A', 'Aynı müşteri, farklı parça')).statusCode, 200);
    assert.equal((await ayar(['musteri'])).statusCode, 200);
    const k = await anahtarlar();
    assert.equal(k['c1']?.b, 'K|mamul|musteri=müşteria');
    assert.equal(k['c1']?.v, 'MM|R|c1|', 'varsayılan anahtar saklı kalır');
  });

  test('aynı müşteri kodlu yeni kart (büyük-küçük harf ve boşluk farkıyla) engellenir; gerekçeyle kaydedilir', async () => {
    const c = await kaydet('c3', 'müşteri  a');
    assert.equal(c.statusCode, 409, c.body);
    assert.equal((await kaydet('c3', 'müşteri  a', 'Ayrı kart gerekli')).statusCode, 200);
    assert.equal((await kaydet('c4', 'Müşteri B')).statusCode, 200);
    assert.equal((await anahtarlar())['c4']?.v, 'MM|R|c4|');
  });

  test('alanı boş kart denetlenmez', async () => {
    assert.equal((await kaydet('c5', '')).statusCode, 200);
    assert.equal((await anahtarlar())['c5']?.b, null);
  });

  test('kurallar göndermeyen eski sekme listeyi silmez; liste boşalınca kartlar varsayılan anahtarlarına döner', async () => {
    assert.equal((await ayar(undefined)).statusCode, 200);
    assert.equal((await anahtarlar())['c1']?.b, 'K|mamul|musteri=müşteria');
    assert.equal((await ayar([])).statusCode, 200);
    const k = await anahtarlar();
    for (const id of ['c1', 'c2', 'c3', 'c4', 'c5']) assert.equal(k[id]?.b, `MM|R|${id}|`, id);
  });

  test('geçersiz çakışma listesi reddedilir', async () => {
    const c = await istek('/malzeme-katalogu-ayarlari/malzeme/kaydet', { deger: { kurallar: { mamul: { cakisma: 'musteri' } } } });
    assert.equal(c.statusCode, 400, c.body);
  });
});
