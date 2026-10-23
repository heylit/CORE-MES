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
import { tamGovde } from '../test-kart.ts';
import { surumlu } from '../test-surum.ts';

const PAROLA = 'dogru-parola-1';

describe('malzemeler genel arama ucu (kart #1221, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yetkisiz = '';
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = async (cerez: string | null, yontem: 'GET' | 'POST', url: string, govde?: unknown) => {
    const c = await app.inject({ method: yontem, url: `/api${url}`, headers: cerez ? { cookie: cerez } : {}, ...(govde === undefined ? {} : { payload: (await surumlu(vt(), url, tamGovde(url, govde))) as object }) });
    return { durum: c.statusCode, govde: c.json() as unknown };
  };
  const giris = async (kullaniciAdi: string): Promise<string> => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  };
  async function kartAc(o: { tur: string; kod: string; ad: string; durum?: string }): Promise<number> {
    const kimlik = `ar${++sayac}`;
    const c = await istek(yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
      kayit: { id: kimlik, tur: o.tur, fam: 'metal', com: { kod: o.kod, ad: o.ad, birim: 'adet' }, onay: { durum: o.durum ?? 'aktif' } },
      ozet: { benzersiz_anahtar: `${o.tur}|arama|${kimlik}`, mukerrer_gerekcesi: null },
      surum: null,
    });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return (await vt().tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.no;
  }

  before(async () => {
    ortam = await testVeritabaniKur('malzemearama');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    const yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'ar-yonetici', parola: PAROLA }));
    // İşlemsiz rol: malzemeler sayfası yok.
    const bos = await vt().tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_bos', 'Geçici Boş') RETURNING id");
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    await vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme Yetkisiz', kullaniciAdi: 'ar-yetkisiz', parola: PAROLA });
      await rolAta(db, yoneticiId, id, bos!.id);
      await rolAl(db, yoneticiId, id, yoneticiRolu!.id);
    });
    yonetici = await giris('ar-yonetici');
    yetkisiz = await giris('ar-yetkisiz');
    const ayar = await istek(yonetici, 'POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } });
    assert.equal(ayar.durum, 200, JSON.stringify(ayar.govde));
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('kod ya da adda geçen kart katalog sayfasına giden sonuç olarak döner; en çok beş satır', async () => {
    const mil = await kartAc({ tur: 'mamul', kod: 'MM-ARM-00001', ad: 'Arama Mili' });
    const taslak = await kartAc({ tur: 'hammadde', kod: 'HM-ARM-00001', ad: 'Arama Çubuğu', durum: 'taslak' });
    const c = await istek(yonetici, 'GET', '/malzemeler/ara?q=arama');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const { sonuclar } = c.govde as KayitAramaCevabi;
    assert.deepEqual(sonuclar.map((s) => s.anahtar).sort(), [String(mil), String(taslak)].sort());
    const milSatiri = sonuclar.find((s) => s.anahtar === String(mil));
    assert.deepEqual(milSatiri, { anahtar: String(mil), baslik: 'MM-ARM-00001 Arama Mili', aciklama: 'Mamul', yol: '/malzemeler' });
    assert.equal(sonuclar.find((s) => s.anahtar === String(taslak))?.aciklama, 'Hammadde · taslak');
    for (let i = 0; i < 5; i += 1) await kartAc({ tur: 'sarf', kod: 'SF-ARM-00001', ad: `Arama Sarf ${i}` });
    assert.equal(((await istek(yonetici, 'GET', '/malzemeler/ara?q=arama')).govde as KayitAramaCevabi).sonuclar.length, 5);
  });

  test('reddedilen: sayfası olmayan 403, oturumsuz 401; tek harf ya da altmıştan uzun sorgu 400', async () => {
    assert.equal((await istek(yetkisiz, 'GET', '/malzemeler/ara?q=arama')).durum, 403);
    assert.equal((await istek(null, 'GET', '/malzemeler/ara?q=arama')).durum, 401);
    assert.equal((await istek(yonetici, 'GET', '/malzemeler/ara?q=a')).durum, 400);
    assert.equal((await istek(yonetici, 'GET', `/malzemeler/ara?q=${'a'.repeat(61)}`)).durum, 400);
  });
});
