import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KisiSecimCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from './disari.ts';
import { kisiEkle, kisiPasifeAl } from './servis.ts';

const PAROLA = 'dogru-parola-1';

describe('kişi seçim arama ucu (kart #1320, karar 1321 b, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let mesajci = '';
  let yetkisiz = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = async (cerez: string | null, url: string) => {
    const c = await app.inject({ method: 'GET', url: `/api${url}`, headers: cerez ? { cookie: cerez } : {} });
    return { durum: c.statusCode, govde: c.json() as unknown };
  };
  const giris = async (kullaniciAdi: string): Promise<string> => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  };

  before(async () => {
    ortam = await testVeritabaniKur('kisisecim');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    const yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'ks-yonetici', parola: PAROLA }));
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const kisiKur = async (kullaniciAdi: string, rolKod: string, islem: string | null) => {
      const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [rolKod]);
      if (islem) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol!.id, islem]);
      await vt().tx(async (db) => {
        const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
        await rolAta(db, yoneticiId, id, rol!.id);
        await rolAl(db, yoneticiId, id, yoneticiRolu!.id);
      });
      return giris(kullaniciAdi);
    };
    mesajci = await kisiKur('ks-mesaj', 'gecici_mesaj', 'sayfa.mesaj');
    yetkisiz = await kisiKur('ks-bos', 'gecici_bos', null);
    for (let n = 1; n <= 31; n += 1) {
      await vt().tx((db) => kisiEkle(db, { ad: `Seçim Kişisi ${String(n).padStart(2, '0')}`, sicilNo: `SK-${n}`, gorev: null }));
    }
    const pasif = await vt().tx((db) => kisiEkle(db, { ad: 'Seçim Pasifi', sicilNo: null, gorev: null }));
    await vt().tx((db) => kisiPasifeAl(db, yoneticiId, pasif));
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  const ara = async (adres: string) => {
    const c = await istek(mesajci, `/kisiler/secim-ara?${adres}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde as KisiSecimCevabi;
  };

  test('izinli: çağıran modülün sayfa işlemi yeter; adda ya da sicilde arar, Türkçe harf duyarsız, yalnız aktif, sayfa 30 ve daha var', async () => {
    const ilk = await ara('q=SECIM');
    assert.equal(ilk.sonuclar.length, 30);
    assert.equal(ilk.dahaVar, true);
    assert.deepEqual(Object.keys(ilk.sonuclar[0]!).sort(), ['ad', 'aktif', 'id', 'kod', 'ust']);
    assert.deepEqual([ilk.sonuclar[0]?.ad, ilk.sonuclar[0]?.kod], ['Seçim Kişisi 01', 'SK-1']);
    const ikinci = await ara('q=secim&sayfa=2');
    assert.deepEqual([ikinci.sonuclar.map((k) => k.ad), ikinci.dahaVar], [['Seçim Kişisi 31'], false]);
    assert.deepEqual((await ara('q=secim pasif')).sonuclar, []);
    assert.deepEqual((await ara('q=secim pasif&pasifler=true')).sonuclar.map((k) => [k.ad, k.kod, k.aktif]), [['Seçim Pasifi', '', false]]);
    assert.deepEqual((await ara('q=sk-12')).sonuclar.map((k) => k.kod), ['SK-12']);
    assert.deepEqual((await ara('q=%25%25')).sonuclar, []);
  });

  test('reddedilen: işlemsiz 403, oturumsuz 401; geçersiz sayfa ve uzun metin 400', async () => {
    assert.equal((await istek(yetkisiz, '/kisiler/secim-ara?q=secim')).durum, 403);
    assert.equal((await istek(null, '/kisiler/secim-ara?q=secim')).durum, 401);
    for (const adres of ['?sayfa=0', `?q=${'a'.repeat(81)}`]) assert.equal((await istek(mesajci, `/kisiler/secim-ara${adres}`)).durum, 400, adres);
  });
});
