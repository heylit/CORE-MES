import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { degisiklikIcerigiCevabi, degisiklikListesiCevabi, degisiklikSecenekleriCevabi } from '#paylasilan/sozlesme/denetim.ts';
import type { DegisiklikIcerigiCevabi, DegisiklikListesiCevabi } from '#paylasilan/sozlesme/denetim.ts';
import type { Db } from '#cekirdek/db.ts';
import { izinYok, testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { denetimYaz } from './disari.ts';

const PAROLA = 'dogru-parola-1';
const GIZLI_DEGER = 'cok-gizli-deger-7';

interface Satir { kisi_id: number | null; tablo: string; anahtar: unknown; islem: string; alanlar: unknown }

// Deneme tabloları modül tablosunun yerine geçer: tetik işlevi tabloya bağlı değildir, modüller kendi göçüyle aynı kalıpla bağlar.
const FIKSTUR = [
  `CREATE TABLE deneme_kart (id int PRIMARY KEY, ad text NOT NULL, adet int, kayit jsonb, parola text, surum int NOT NULL DEFAULT 1)`,
  `CREATE TRIGGER deneme_kart_degisiklik AFTER UPDATE OR DELETE ON deneme_kart
     FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum')`,
  `CREATE TABLE deneme_yetki (kisi_id int, rol_id int, PRIMARY KEY (kisi_id, rol_id))`,
  `CREATE TRIGGER deneme_yetki_degisiklik AFTER INSERT OR UPDATE OR DELETE ON deneme_yetki
     FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('kisi_id,rol_id')`,
  `CREATE TABLE deneme_argumansiz (id int PRIMARY KEY, ad text)`,
  `CREATE TRIGGER deneme_argumansiz_degisiklik AFTER UPDATE ON deneme_argumansiz
     FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz()`,
];

describe('eski/yeni değer defteri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let mudur = '';
  let operator = '';
  let yoneticiId = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  // Yazma ucunun yaptığı gibi: kişi transaction başında oturum değişkenine yazılır.
  const kisiyle = <T>(kisi: string | null, is: (db: Db) => Promise<T>): Promise<T> =>
    o().vt.tx(async (db) => {
      if (kisi !== null) await db.sorgu("SELECT set_config('tmiv2.kisi_id', $1, true)", [kisi]);
      return is(db);
    });

  const defter = (tablo: string): Promise<Satir[]> =>
    o().vt.sorgu<Satir>('SELECT kisi_id, tablo, anahtar, islem, alanlar FROM denetim_degisiklik WHERE tablo = $1 ORDER BY id', [tablo]);

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  const oku = async <T>(cerez: string, yol: string): Promise<{ durum: number; govde: T }> => {
    const cevap = await app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });
    return { durum: cevap.statusCode, govde: cevap.json() as T };
  };

  async function rolluKisi(kullaniciAdi: string, rolKodu: string): Promise<number> {
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    if (!yoneticiRolu || !rol) throw new Error(`rol yok: ${rolKodu}`);
    return o().vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, id, rol.id);
      await rolAl(db, yoneticiId, id, yoneticiRolu.id);
      return id;
    });
  }

  before(async () => {
    ortam = await testVeritabaniKur('denetim_degisiklik');
    for (const ddl of FIKSTUR) await ortam.sahip.sorgu(ddl);
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await rolluKisi('mudur1', 'mudur');
    await rolluKisi('operator1', 'operator');
    yonetici = await girisCerezi('yonetici');
    mudur = await girisCerezi('mudur1');
    operator = await girisCerezi('operator1');
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('güncellemede yalnız değişen alanlar, eski ve yeni değeriyle, kişiyle yazılır; dışarıdaki sütun girmez', async () => {
    await o().vt.sorgu("INSERT INTO deneme_kart (id, ad, adet) VALUES (1, 'Mil', 5)");
    await kisiyle(String(yoneticiId), (db) => db.sorgu("UPDATE deneme_kart SET adet = 7, surum = surum + 1 WHERE id = 1"));
    assert.deepEqual(await defter('deneme_kart'), [
      { kisi_id: yoneticiId, tablo: 'deneme_kart', anahtar: { id: 1 }, islem: 'guncelle', alanlar: { adet: { eski: 5, yeni: 7 } } },
    ]);
  });

  test('ekleme kalıpta yoksa yazılmaz; değer değişmeyen güncelleme ve yalnız dışarıdaki sütunun değişimi satır yazmaz', async () => {
    await o().vt.sorgu("INSERT INTO deneme_kart (id, ad) VALUES (2, 'Burç')");
    await o().vt.sorgu("UPDATE deneme_kart SET ad = 'Burç' WHERE id = 2");
    await o().vt.sorgu('UPDATE deneme_kart SET surum = surum + 1 WHERE id = 2');
    const satirlar = await defter('deneme_kart');
    assert.equal(satirlar.some((s) => (s.anahtar as { id: number }).id === 2), false);
  });

  test('jsonb nesne sütununda fark üst anahtar düzeyindedir: değişmeyen anahtar yazılmaz', async () => {
    await o().vt.sorgu(`INSERT INTO deneme_kart (id, ad, kayit) VALUES (3, 'Flanş', '{"birim":"adet","renk":"gri","olcu":{"cap":10}}')`);
    await o().vt.sorgu(`UPDATE deneme_kart SET kayit = '{"birim":"kg","olcu":{"cap":12},"yeni":true}' WHERE id = 3`);
    const [satir] = (await defter('deneme_kart')).filter((s) => (s.anahtar as { id: number }).id === 3);
    assert.deepEqual(satir?.alanlar, {
      'kayit.birim': { eski: 'adet', yeni: 'kg' },
      'kayit.renk': { eski: 'gri', yeni: null },
      'kayit.olcu': { eski: { cap: 10 }, yeni: { cap: 12 } },
      'kayit.yeni': { eski: null, yeni: true },
    });
  });

  test('silmede bütün alanlar eski değeriyle yazılır; kişisiz değişimde (göç, arka iş) kişi boştur', async () => {
    await o().vt.sorgu("INSERT INTO deneme_kart (id, ad, adet) VALUES (4, 'Pim', 3)");
    await o().vt.sorgu('DELETE FROM deneme_kart WHERE id = 4');
    const [satir] = (await defter('deneme_kart')).filter((s) => (s.anahtar as { id: number }).id === 4);
    assert.deepEqual(satir, {
      kisi_id: null, tablo: 'deneme_kart', anahtar: { id: 4 }, islem: 'sil',
      alanlar: { id: { eski: 4, yeni: null }, ad: { eski: 'Pim', yeni: null }, adet: { eski: 3, yeni: null } },
    });
  });

  test('yetki kalıbı: ekleme ve silme bileşik anahtarla yazılır; sayı olmayan kişi değişkeni boş sayılır', async () => {
    await kisiyle(String(yoneticiId), (db) => db.sorgu('INSERT INTO deneme_yetki (kisi_id, rol_id) VALUES (9, 2)'));
    await kisiyle('1; DROP TABLE x', (db) => db.sorgu('DELETE FROM deneme_yetki WHERE kisi_id = 9 AND rol_id = 2'));
    assert.deepEqual(await defter('deneme_yetki'), [
      { kisi_id: yoneticiId, tablo: 'deneme_yetki', anahtar: { kisi_id: 9, rol_id: 2 }, islem: 'ekle',
        alanlar: { kisi_id: { eski: null, yeni: 9 }, rol_id: { eski: null, yeni: 2 } } },
      { kisi_id: null, tablo: 'deneme_yetki', anahtar: { kisi_id: 9, rol_id: 2 }, islem: 'sil',
        alanlar: { kisi_id: { eski: 9, yeni: null }, rol_id: { eski: 2, yeni: null } } },
    ]);
  });

  test('kişi değişkeni transaction ile biter: sonraki transaction kişisiz yazar', async () => {
    await o().vt.sorgu("INSERT INTO deneme_kart (id, ad) VALUES (5, 'Kapak')");
    await kisiyle(String(yoneticiId), (db) => db.sorgu("UPDATE deneme_kart SET ad = 'Kapak A' WHERE id = 5"));
    await o().vt.sorgu("UPDATE deneme_kart SET ad = 'Kapak B' WHERE id = 5");
    const satirlar = (await defter('deneme_kart')).filter((s) => (s.anahtar as { id: number }).id === 5);
    assert.deepEqual(satirlar.map((s) => s.kisi_id), [yoneticiId, null]);
  });

  test('reddedilen: anahtar sütunu verilmeyen bağlama yazmayı durdurur, değişim kalıcı olmaz', async () => {
    await o().vt.sorgu("INSERT INTO deneme_argumansiz (id, ad) VALUES (1, 'a')");
    await assert.rejects(o().vt.sorgu("UPDATE deneme_argumansiz SET ad = 'b' WHERE id = 1"), /birincil anahtar sütunları verilmedi/);
    assert.equal((await o().vt.tek<{ ad: string }>('SELECT ad FROM deneme_argumansiz WHERE id = 1'))?.ad, 'a');
  });

  test('reddedilen: defter satırı uygulama kullanıcısıyla değiştirilemez, silinemez, boşaltılamaz', async () => {
    await assert.rejects(o().vt.sorgu("UPDATE denetim_degisiklik SET tablo = 'baska'"), /yalnız ekleme|yalniz ekleme|append/i);
    await assert.rejects(o().vt.sorgu('DELETE FROM denetim_degisiklik'), /yalnız ekleme|yalniz ekleme|append/i);
    await assert.rejects(o().vt.sorgu('TRUNCATE denetim_degisiklik'), (hata: unknown) => izinYok(hata));
    assert.ok((await defter('deneme_kart')).length > 0);
  });

  test('liste: denetim.oku ile tablo, kişi ve alan adları gelir, değer gelmez; süzgeçler tablo ve kişiyi verir', async () => {
    await o().vt.sorgu(`INSERT INTO deneme_kart (id, ad, parola) VALUES (6, 'Gizli kart', 'eski-deger')`);
    await kisiyle(String(yoneticiId), (db) => db.sorgu(`UPDATE deneme_kart SET parola = $1, ad = 'Gizli kart 2' WHERE id = 6`, [GIZLI_DEGER]));
    const liste = await oku<DegisiklikListesiCevabi>(mudur, '/denetim-degisiklikleri?tablo=deneme_kart&sayfaBoyu=50');
    assert.equal(liste.durum, 200);
    degisiklikListesiCevabi.parse(liste.govde);
    const satir = liste.govde.satirlar.find((s) => s.anahtar.id === 6);
    assert.deepEqual(satir && { kisiAd: satir.kisiAd, islem: satir.islem, alanAdlari: satir.alanAdlari },
      { kisiAd: 'Deneme Yönetici', islem: 'guncelle', alanAdlari: ['ad', 'parola'] });
    assert.equal(JSON.stringify(liste.govde).includes(GIZLI_DEGER), false);
    assert.ok(liste.govde.satirlar.every((s) => s.tablo === 'deneme_kart'));
    const kisili = await oku<DegisiklikListesiCevabi>(mudur, `/denetim-degisiklikleri?kisi=${String(yoneticiId)}&sayfaBoyu=50`);
    assert.ok(kisili.govde.satirlar.length > 0 && kisili.govde.satirlar.every((s) => s.kisiId === yoneticiId));
    const secenek = await oku<unknown>(mudur, '/denetim-degisiklikleri/suzgecler');
    const cozulen = degisiklikSecenekleriCevabi.parse(secenek.govde);
    // Modül tablolarının tetikleri (yetki tabloları dahil) fikstür kurulumunu da deftere yazar; yalnız deneme tablolarının varlığı denetlenir.
    assert.deepEqual(cozulen.tablolar.filter((t) => t.startsWith('deneme_')), ['deneme_kart', 'deneme_yetki']);
    assert.deepEqual(cozulen.kisiler.map((k) => k.id), [yoneticiId]);
  });

  // 1384 b: kayıt ekranındaki "Geçmiş" düğmesi listeyi tablo ve anahtar çiftleriyle süzer; anahtar kapsamayla eşleşir.
  test('kayıt süzgeci: çiftlerden birine uyan satırlar gelir; kısmi anahtar kapsar; bozuk liste 400, operatör 403', async () => {
    for (const [kisi, rol] of [[12, 1], [12, 2], [13, 1]]) {
      await kisiyle(String(yoneticiId), (db) => db.sorgu('INSERT INTO deneme_yetki (kisi_id, rol_id) VALUES ($1, $2)', [kisi, rol]));
    }
    const kayitlar = encodeURIComponent(JSON.stringify([{ tablo: 'deneme_yetki', anahtar: { kisi_id: 12 } }, { tablo: 'deneme_kart', anahtar: { id: 5 } }]));
    const liste = await oku<DegisiklikListesiCevabi>(mudur, `/denetim-degisiklikleri?kayitlar=${kayitlar}&sayfaBoyu=50`);
    assert.equal(liste.durum, 200, JSON.stringify(liste.govde));
    assert.deepEqual(
      liste.govde.satirlar.map((s) => [s.tablo, s.anahtar]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      [['deneme_kart', { id: 5 }], ['deneme_kart', { id: 5 }], ['deneme_yetki', { kisi_id: 12, rol_id: 1 }], ['deneme_yetki', { kisi_id: 12, rol_id: 2 }]],
    );
    assert.equal(liste.govde.toplam, 4);
    // Tablo adı eşleşmeyen çift başka tablonun aynı anahtarlı satırını getirmez.
    const yanlis = encodeURIComponent(JSON.stringify([{ tablo: 'deneme_yetki', anahtar: { id: 5 } }]));
    assert.equal((await oku<DegisiklikListesiCevabi>(mudur, `/denetim-degisiklikleri?kayitlar=${yanlis}`)).govde.toplam, 0);
    for (const bozuk of ['{', '[]', JSON.stringify([{ tablo: 'x;drop', anahtar: { id: 1 } }]), JSON.stringify([{ tablo: 'deneme_kart', anahtar: {} }])]) {
      assert.equal((await oku(mudur, `/denetim-degisiklikleri?kayitlar=${encodeURIComponent(bozuk)}`)).durum, 400, bozuk);
    }
    assert.equal((await oku(operator, `/denetim-degisiklikleri?kayitlar=${kayitlar}`)).durum, 403);
  });

  test('içerik: denetim.govde-oku ile eski ve yeni değer gelir, gizli adlı alanın iki değeri de maskelenir', async () => {
    const liste = await oku<DegisiklikListesiCevabi>(yonetici, '/denetim-degisiklikleri?tablo=deneme_kart&sayfaBoyu=50');
    const id = liste.govde.satirlar.find((s) => s.anahtar.id === 6)?.id ?? 0;
    const icerik = await oku<DegisiklikIcerigiCevabi>(yonetici, `/denetim-degisiklikleri/${String(id)}/icerik`);
    assert.equal(icerik.durum, 200);
    assert.deepEqual(degisiklikIcerigiCevabi.parse(icerik.govde).alanlar, [
      { alan: 'ad', eski: 'Gizli kart', yeni: 'Gizli kart 2' },
      { alan: 'parola', eski: '[gizli]', yeni: '[gizli]' },
    ]);
    assert.equal((await oku<unknown>(yonetici, '/denetim-degisiklikleri/999999/icerik')).durum, 404);
  });

  test('reddedilen: denetim.govde-oku olmayan değeri, denetim.oku olmayan listeyi göremez', async () => {
    assert.equal((await oku<unknown>(mudur, '/denetim-degisiklikleri/1/icerik')).durum, 403);
    assert.equal((await oku<unknown>(operator, '/denetim-degisiklikleri')).durum, 403);
    assert.equal((await oku<unknown>(operator, '/denetim-degisiklikleri/suzgecler')).durum, 403);
    assert.equal((await oku<unknown>('', '/denetim-degisiklikleri')).durum, 401);
  });
});
