import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KayitAramaCevabi } from '#paylasilan/sayfa-tanimi.ts';
import { denetimYaz } from '../../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../../kisiler/disari.ts';
import { kimlikCozucu } from '../../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

describe('istasyonlar genel arama ucu (kart #1221, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yetkisiz = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = async (cerez: string | null, yontem: 'GET' | 'POST', url: string, govde?: unknown) => {
    const c = await app.inject({ method: yontem, url: `/api${url}`, headers: cerez ? { cookie: cerez } : {}, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: c.json() as unknown };
  };
  const giris = async (kullaniciAdi: string): Promise<string> => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  };
  before(async () => {
    ortam = await testVeritabaniKur('istasyonarama');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    const yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'is-yonetici', parola: PAROLA }));
    // İşlemsiz rol: istasyonlar sayfası ve yazma işlemi yok.
    const bos = await vt().tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_bos', 'Geçici Boş') RETURNING id");
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    await vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme Yetkisiz', kullaniciAdi: 'is-yetkisiz', parola: PAROLA });
      await rolAta(db, yoneticiId, id, bos!.id);
      await rolAl(db, yoneticiId, id, yoneticiRolu!.id);
    });
    yonetici = await giris('is-yonetici');
    yetkisiz = await giris('is-yetkisiz');
    const sahip = ortam.sahip;
    const im = await sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('ARIM', 'Arama Merkezi') RETURNING id");
    await sahip.sorgu("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('ARS-1', 'Arama Torna', $1), ('ARS-2', 'Arama Freze', $1)", [im!.id]);
    await sahip.sorgu("INSERT INTO makine (kod, ad, aktif) VALUES ('ARM-1', 'Arama Makinesi', false)");
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('istasyon ve makine kodda ya da adda aranır; kodu tam tutan önce, sonuç kaydın bölümünü açar', async () => {
    const c = await istek(yonetici, 'GET', '/istasyonlar/ara?q=ARS-2');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual((c.govde as KayitAramaCevabi).sonuclar.map((s) => [s.baslik, s.aciklama, s.yol]), [['ARS-2 Arama Freze', 'İstasyon', '/istasyonlar/is-merkezleri']]);
    const hepsi = (await istek(yonetici, 'GET', '/istasyonlar/ara?q=arm-1')).govde as KayitAramaCevabi;
    assert.deepEqual(hepsi.sonuclar.map((s) => [s.baslik, s.aciklama, s.yol]), [['ARM-1 Arama Makinesi', 'Makine · pasif', '/istasyonlar/makineler']]);
    const ad = (await istek(yonetici, 'GET', '/istasyonlar/ara?q=arama')).govde as KayitAramaCevabi;
    assert.deepEqual(ad.sonuclar.map((s) => s.baslik), ['ARS-1 Arama Torna', 'ARS-2 Arama Freze', 'ARM-1 Arama Makinesi']);
  });

  test('reddedilen: sayfası ve yazma işlemi olmayan 403, oturumsuz 401; joker karakter joker değildir', async () => {
    assert.equal((await istek(yetkisiz, 'GET', '/istasyonlar/ara?q=arama')).durum, 403);
    assert.equal((await istek(null, 'GET', '/istasyonlar/ara?q=arama')).durum, 401);
    assert.deepEqual(((await istek(yonetici, 'GET', '/istasyonlar/ara?q=%25%25')).govde as KayitAramaCevabi).sonuclar, []);
  });
});
