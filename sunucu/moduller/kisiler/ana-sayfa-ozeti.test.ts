import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { EksikBilgiOzetiCevabi, PersonelCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { yoneticiOlustur } from './disari.ts';
import { hesapAc, kisiEkle, kisiPasifeAl } from './servis.ts';

const PAROLA = 'dogru-parola-1';

describe('eksik bilgi özeti ucu (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let okur = '';
  let okumayan = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  const girisYap = async (kullaniciAdi: string): Promise<string> => {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  };

  // Yerleşik rollerde olmayan işlem birleşimleri için test rolü (modülün kendi tablosu).
  const rolAc = async (kod: string, islemler: string[]): Promise<number> => {
    const satir = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [kod]);
    if (!satir) throw new Error('rol açılamadı');
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [satir.id, islem]);
    return satir.id;
  };

  const kullanici = async (aktor: number, kullaniciAdi: string, rolId: number): Promise<string> => {
    await vt().tx(async (db) => {
      const id = await kisiEkle(db, { ad: `Kişi ${kullaniciAdi}`, sicilNo: `S-${kullaniciAdi}`, gorev: 'Deneme' });
      await hesapAc(db, aktor, id, { kullaniciAdi, parola: PAROLA, rolId });
    });
    return girisYap(kullaniciAdi);
  };

  const cagir = (cerez: string | null, url: string) =>
    app.inject({ method: 'GET', url: `/api${url}`, ...(cerez === null ? {} : { headers: { cookie: cerez } }) });

  before(async () => {
    ortam = await testVeritabaniKur('kisiler_ozet');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yonetici = await girisYap('yonetici');
    okur = await kullanici(yoneticiId, 'okur', await rolAc('test_kisi_okur', ['kisiler.oku']));
    okumayan = await kullanici(yoneticiId, 'okumayan', await rolAc('test_kisi_okumayan', ['sayfa.personel']));
    await ortam.vt.tx(async (db) => {
      await kisiEkle(db, { ad: 'Sicilsiz', gorev: 'Operatör' });
      await kisiEkle(db, { ad: 'Görevsiz', sicilNo: 'S-2' });
      await kisiEkle(db, { ad: 'İkisi de boş' });
      await kisiEkle(db, { ad: 'Boşluklu', sicilNo: '  ', gorev: ' ' });
      const pasif = await kisiEkle(db, { ad: 'Pasif boş' });
      await kisiPasifeAl(db, yoneticiId, pasif);
    });
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('sayılar liste ucundan aynı kuralla (aktif kişi, sicil no ya da görev boş) hesaplananla aynıdır; pasif kişi sayılmaz', async () => {
    const liste = (await cagir(yonetici, '/kisiler')).json<PersonelCevabi>().kisiler.filter((k) => k.aktif);
    const beklenen: EksikBilgiOzetiCevabi = {
      eksik: liste.filter((k) => k.sicilNo === null || k.gorev === null).length,
      sicilsiz: liste.filter((k) => k.sicilNo === null).length,
      gorevsiz: liste.filter((k) => k.gorev === null).length,
    };
    const cevap = await cagir(okur, '/kisiler/eksik-bilgi-ozeti');
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.deepEqual(cevap.json(), beklenen);
    // Yönetici sicil no ve görevsiz açılır; dört boş kişi eklenir.
    assert.deepEqual(beklenen, { eksik: 5, sicilsiz: 4, gorevsiz: 4 });
  });

  test('yetki: oturumsuz 401, kisiler.oku olmayan 403, liste ucunu okuyan okur', async () => {
    assert.equal((await cagir(null, '/kisiler/eksik-bilgi-ozeti')).statusCode, 401);
    assert.equal((await cagir(okumayan, '/kisiler/eksik-bilgi-ozeti')).statusCode, 403);
    assert.equal((await cagir(okumayan, '/kisiler')).statusCode, 403);
    assert.equal((await cagir(okur, '/kisiler/eksik-bilgi-ozeti')).statusCode, 200);
  });
});
