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
  assert.equal(katalogCakismaAlanlari({ kurallar: { mamul: { cakisma: ['_varsayilan'] } } }, 'mamul'), null, '1879: yalnız varsayılan seçimi varsayılan kuraldır');
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

// 1879: hammaddenin kalite, form, ölçü, durum ve yüzeyi çakışma alanı olarak seçilebilir. Aynı örnek tablosu ekranda
// `istemci/src/moduller/malzemeler/yeni/kurallar/cakisma-esdegerlik.test.ts` içinde `benzerKartlar` ile sınanır; biri değişirse öteki de değişir.
type Kart = Record<string, unknown> & { tur: string };
const HM = (ek: Record<string, unknown> = {}): Kart => ({
  tur: 'hammadde', fam: 'metal', grade: 'K1', form: 'cubuk', dims: { d: 20, l: 3000 }, opts: { durum: 'D1', yuzey: 'Y1' }, com: { ad: 'Deneme bir' }, g: {}, ...ek,
});
const HMV = (ek: Record<string, unknown> = {}): Kart => HM({ grade: 'C45', cls: 'islah', ...ek });
const ORNEKLER: { ad: string; alanlar: string[]; a: Kart; b: Kart; sonuc: 'ayni' | 'farkli' | 'denetimsiz' }[] = [
  { ad: 'kalite, form, ölçü: yalnız adı farklı kart aynı', alanlar: ['_kalite', '_form', '_olcu'], a: HM(), b: HM({ com: { ad: 'Deneme iki' } }), sonuc: 'ayni' },
  { ad: 'ölçü binde bire yuvarlanır', alanlar: ['_kalite', '_olcu'], a: HM(), b: HM({ dims: { d: 20.0004, l: 3000 } }), sonuc: 'ayni' },
  { ad: 'ölçüde noktalama karışmaz (12,5 ile 1,25)', alanlar: ['_olcu'], a: HM({ dims: { d: 12.5, l: 3000 } }), b: HM({ dims: { d: 1.25, l: 3000 } }), sonuc: 'farkli' },
  { ad: 'aynı sayılar başka formda farklı ölçüdür', alanlar: ['_olcu'], a: HM(), b: HM({ form: 'altigen', dims: { s: 20, l: 3000 } }), sonuc: 'farkli' },
  { ad: 'farklı kalite', alanlar: ['_kalite', '_form', '_olcu'], a: HM(), b: HM({ grade: 'K2' }), sonuc: 'farkli' },
  {
    ad: 'özel kalite kodu harf ve noktalama farkı yok sayılarak', alanlar: ['_kalite'],
    a: HM({ grade: '__ozel', custom: { kod: 'OZ-1', ad: 'Deneme A' } }), b: HM({ grade: '__ozel', custom: { kod: 'oz 1', ad: 'Deneme B' } }), sonuc: 'ayni',
  },
  { ad: 'durum farkı', alanlar: ['_kalite', '_durum'], a: HM(), b: HM({ opts: { durum: 'D2', yuzey: 'Y1' } }), sonuc: 'farkli' },
  { ad: 'yüzey aynı', alanlar: ['_yuzey'], a: HM(), b: HM({ opts: { durum: 'D2', yuzey: 'y 1' } }), sonuc: 'ayni' },
  { ad: 'yalnız kart adı seçiliyse kalite ve ölçüsü aynı, adı farklı kart çakışmaz', alanlar: ['_ad'], a: HM(), b: HM({ com: { ad: 'Deneme iki' } }), sonuc: 'farkli' },
  { ad: 'eksik ölçülü kart denetlenmez', alanlar: ['_kalite', '_olcu'], a: HM({ dims: { d: 20 } }), b: HM({ dims: { d: 20 } }), sonuc: 'denetimsiz' },
  { ad: 'boş durumlu kart denetlenmez', alanlar: ['_durum'], a: HM({ opts: {} }), b: HM({ opts: {} }), sonuc: 'denetimsiz' },
  { ad: 'başka türde g alanı okunur', alanlar: ['musteri'], a: { tur: 'mamul', g: { musteri: 'M-1' }, com: { ad: 'Deneme' } }, b: { tur: 'mamul', g: { musteri: 'm1' }, com: { ad: 'Deneme 2' } }, sonuc: 'ayni' },
  // Varsayılan kural seçim olarak (1879): değeri kartın varsayılan anahtarıdır; kalite tablodaki bir kalite olmalı (ekran kaliteyi tablodan okur; sunucu kodu olduğu gibi alır).
  { ad: 'varsayılan ve kart adı: ikisi de aynıysa aynı', alanlar: ['_varsayilan', '_ad'], a: HMV(), b: HMV(), sonuc: 'ayni' },
  { ad: 'varsayılan ve kart adı: adı farklıysa farklı', alanlar: ['_varsayilan', '_ad'], a: HMV(), b: HMV({ com: { ad: 'Deneme iki' } }), sonuc: 'farkli' },
  { ad: 'varsayılan ve kart adı: ölçüsü farklıysa farklı', alanlar: ['_varsayilan', '_ad'], a: HMV(), b: HMV({ dims: { d: 25, l: 3000 } }), sonuc: 'farkli' },
  { ad: 'varsayılanın ölçüsünde noktalama karışmaz', alanlar: ['_varsayilan', '_ad'], a: HMV({ dims: { d: 12.5, l: 3000 } }), b: HMV({ dims: { d: 125, l: 3000 } }), sonuc: 'farkli' },
  { ad: 'varsayılan anahtarı kurulamayan kart denetlenmez', alanlar: ['_varsayilan', '_ad'], a: HMV({ grade: null }), b: HMV({ grade: null }), sonuc: 'denetimsiz' },
  { ad: 'mamulde varsayılan ve kart adı', alanlar: ['_varsayilan', '_ad'], a: { tur: 'mamul', g: { resim: 'R-1' }, com: { ad: 'Deneme' } }, b: { tur: 'mamul', g: { resim: 'r1' }, com: { ad: 'deneme' } }, sonuc: 'ayni' },
];

describe('1879 çakışma kuralı, sunucu tarafı (ekranla aynı örnekler)', () => {
  for (const o of ORNEKLER) {
    test(o.ad, () => {
      const alanlar = [...new Set(o.alanlar)].sort();
      const a = katalogKuralAnahtari(o.a.tur, alanlar, o.a);
      const b = katalogKuralAnahtari(o.b.tur, alanlar, o.b);
      const sonuc = a === null ? 'denetimsiz' : a === b ? 'ayni' : 'farkli';
      assert.equal(sonuc, o.sonuc, `${String(a)} / ${String(b)}`);
    });
  }
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

  // 1879: hammaddede kalite, form ve ölçü seçiliyken yalnız adı farklı kart sunucuda gerekçesiz kaydolmaz.
  test('1879: hammadde kalite, form ve ölçüsü aynı, adı farklı kart engellenir; gerekçeyle kaydedilir', async () => {
    const c = await istek('/malzeme-katalogu-ayarlari/malzeme/kaydet', { deger: { kurallar: { hammadde: { cakisma: ['_kalite', '_form', '_olcu'] } } } });
    assert.equal(c.statusCode, 200, c.body);
    const hm = async (kimlik: string, ad: string, gerekce: string | null = null) => {
      const r = await istek(`/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
        kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', grade: 'K1', form: 'cubuk', dims: { d: 20, l: 3000 }, com: { kod: 'HM-GEN-00000', ad, birim: 'kg' }, onay: { durum: 'taslak' } },
        ozet: { benzersiz_anahtar: `hammadde|${kimlik}`, mukerrer_gerekcesi: gerekce }, surum: null,
      });
      return r;
    };
    assert.equal((await hm('h1', 'Deneme bir')).statusCode, 200);
    const r = await hm('h2', 'Deneme iki');
    assert.equal(r.statusCode, 409, r.body);
    assert.equal((await hm('h2', 'Deneme iki', 'Ayrı kart gerekli')).statusCode, 200);
    const k = await vt().tx((db) => db.sorgu<{ b: string | null }>(`SELECT benzersiz_anahtar AS b FROM malzeme_katalog_karti WHERE kimlik = 'h1'`));
    assert.equal(k[0]?.b, 'K|hammadde|_form=cubuk|_kalite=k1|_olcu=cubuk20000x3000000');
  });

  // 1879 (kullanıcı 02.11): varsayılan kural da seçimdir; kart adı onun yanına eklenince ikisi birlikte tek kuraldır.
  test('1879: varsayılan ve kart adı birlikte: ikisi de aynı kart engellenir, yalnız adı farklı kart kaydolur', async () => {
    const hm = (kimlik: string, ad: string, d: number) => istek(`/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
      kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', grade: 'K1', form: 'cubuk', dims: { d, l: 3000 }, com: { kod: 'HM-GEN-00000', ad, birim: 'kg' }, onay: { durum: 'taslak' } },
      ozet: { benzersiz_anahtar: `hammadde|${kimlik}`, mukerrer_gerekcesi: null }, surum: null,
    });
    const c = await istek('/malzeme-katalogu-ayarlari/malzeme/kaydet', { deger: { kurallar: { hammadde: { cakisma: ['_varsayilan', '_ad'] } } } });
    assert.equal(c.statusCode, 200, c.body);
    const k = await vt().tx((db) => db.sorgu<{ b: string | null }>(`SELECT benzersiz_anahtar AS b FROM malzeme_katalog_karti WHERE kimlik = 'h1'`));
    assert.equal(k[0]?.b, 'K|hammadde|_ad=denemebir|_varsayilan=HM|metal|k1|cubuk|20x3000||');
    assert.equal((await hm('h3', 'deneme  BİR', 20)).statusCode, 409);
    assert.equal((await hm('h4', 'Deneme üç', 20)).statusCode, 200, 'yalnız adı farklı');
    assert.equal((await hm('h5', 'Deneme bir', 21)).statusCode, 200, 'yalnız ölçüsü farklı');
  });
});
