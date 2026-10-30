import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KayitAramaCevabi } from '#paylasilan/sayfa-tanimi.ts';
import type { TesisSecimCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { denetimYaz } from '../../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../../kisiler/disari.ts';
import { kimlikCozucu } from '../../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

describe('istasyonlar genel arama ucu (kart #1221, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yetkisiz = '';
  let arkoncu = '';

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
    // Seçiciyi çağıran modülün sayfa işlemi (1321 b): yalnız sayfa.arkon.
    const arkon = await vt().tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_arkon', 'Geçici Arkon') RETURNING id");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'sayfa.arkon')", [arkon!.id]);
    await vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme Arkon', kullaniciAdi: 'is-arkon', parola: PAROLA });
      await rolAta(db, yoneticiId, id, arkon!.id);
      await rolAl(db, yoneticiId, id, yoneticiRolu!.id);
    });
    yonetici = await giris('is-yonetici');
    arkoncu = await giris('is-arkon');
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

  test('#1318 ortak seçici: istasyon iş merkeziyle, makine istasyonuyla gelir; pasif yalnız istenirse; makine istasyona süzülür; sayfa ve daha var', async () => {
    const ars1 = await vt().tek<{ id: number }>("SELECT id FROM istasyon WHERE kod = 'ARS-1'");
    await ortam!.sahip.sorgu(
      "INSERT INTO makine (kod, ad, istasyon_id) SELECT 'SCM-' || lpad(n::text, 2, '0'), 'Secim Makinesi', $1 FROM generate_series(1, 32) n", [ars1!.id],
    );
    const ara = async (adres: string) => {
      const c = await istek(arkoncu, 'GET', `/istasyonlar/secim-ara?${adres}`);
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return c.govde as TesisSecimCevabi;
    };
    const ist = await ara('tur=istasyon&q=ars-2');
    assert.deepEqual(ist.sonuclar.map((x) => [x.kod, x.ust?.kod]), [['ARS-2', 'ARIM']]);
    assert.equal(ist.dahaVar, false);
    assert.deepEqual((await ara('tur=makine&q=ARM-1')).sonuclar, []);
    const pasif = await ara('tur=makine&q=ARM-1&pasifler=true');
    assert.deepEqual(pasif.sonuclar.map((x) => [x.kod, x.aktif, x.ust]), [['ARM-1', false, null]]);
    const ilk = await ara(`tur=makine&q=scm&istasyonId=${ars1!.id}`);
    assert.equal(ilk.sonuclar.length, 30);
    assert.equal(ilk.dahaVar, true);
    assert.deepEqual([ilk.sonuclar[0]?.kod, ilk.sonuclar[0]?.ust?.kod], ['SCM-01', 'ARS-1']);
    const ikinci = await ara(`tur=makine&q=scm&istasyonId=${ars1!.id}&sayfa=2`);
    assert.deepEqual([ikinci.sonuclar.map((x) => x.kod), ikinci.dahaVar], [['SCM-31', 'SCM-32'], false]);
    const baska = await vt().tek<{ id: number }>("SELECT id FROM istasyon WHERE kod = 'ARS-2'");
    assert.deepEqual((await ara(`tur=makine&q=scm&istasyonId=${baska!.id}`)).sonuclar, []);
    assert.deepEqual((await ara('tur=makine&q=SCM-07')).sonuclar.map((x) => x.kod), ['SCM-07']);
    assert.deepEqual((await ara('tur=makine&q=%25%25')).sonuclar, []);
  });

  test('#1318 reddedilen: çağıran modül işlemi olmayan 403 (1321 b), oturumsuz 401; tür yok ya da geçersiz sorgu 400', async () => {
    assert.equal((await istek(yetkisiz, 'GET', '/istasyonlar/secim-ara?tur=makine')).durum, 403);
    assert.equal((await istek(null, 'GET', '/istasyonlar/secim-ara?tur=makine')).durum, 401);
    for (const adres of ['', '?tur=ekip', '?tur=makine&sayfa=0', '?tur=makine&istasyonId=-1']) {
      assert.equal((await istek(yonetici, 'GET', `/istasyonlar/secim-ara${adres}`)).durum, 400, adres);
    }
  });
});
