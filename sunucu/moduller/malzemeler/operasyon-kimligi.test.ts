import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KatalogAyarlariCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kartOperasyonKimlikleri, kartOperasyonlari, OPERASYON_AYARI_ILETISI } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

// C1: kimlikler okumada çözülür; kart kodu ve eski merkez metnini tutar.
describe('kartOperasyonKimlikleri (C1, saf)', () => {
  const tipler = [{ id: 1, kod: 'TRN' }, { id: 2, kod: 'FRZ' }, { id: 3, kod: 'ESK' }];
  const istasyonlar = [
    { id: 10, kod: 'T-01', ad: 'Torna hücresi' }, { id: 11, kod: 'F-01', ad: 'Freze hücresi' },
    { id: 12, kod: 'X-01', ad: 'Ortak' }, { id: 13, kod: 'X-02', ad: 'Ortak' },
  ];

  test('kod tipe, merkez metni istasyona (önce kod, sonra ad) eşlenir; harf ve boşluk farkı sayılmaz', () => {
    const kayit = { ops: [
      { no: 20, kod: ' frz ', ad: 'Freze', merkez: 'Freze hücresi' },
      { no: 10, kod: 'TRN', ad: 'Torna', merkez: ' t-01 ' },
    ] };
    assert.deepEqual(kartOperasyonKimlikleri(kayit, tipler, istasyonlar), [
      { no: 10, kod: 'TRN', ad: 'Torna', operasyonTipiId: 1, istasyonId: 10 },
      { no: 20, kod: 'frz', ad: 'Freze', operasyonTipiId: 2, istasyonId: 11 },
    ]);
  });

  test('bilinmeyen kod, boş ya da bilinmeyen merkez ve iki istasyona uyan ad null kalır; tahmin edilmez', () => {
    const kayit = { ops: [
      { no: 10, kod: 'YOK', merkez: 'Torna hücresi' },
      { no: 20, kod: 'TRN', merkez: '' },
      { no: 30, kod: 'TRN', merkez: 'Olmayan yer' },
      { no: 40, kod: 'TRN', merkez: 'Ortak' },
      { no: 50, kod: 'TRN' },
    ] };
    assert.deepEqual(kartOperasyonKimlikleri(kayit, tipler, istasyonlar).map((o) => [o.operasyonTipiId, o.istasyonId]), [
      [null, 10], [1, null], [1, null], [1, null], [1, null],
    ]);
  });

  test('numara, sıra ve kodsuz satırın düşmesi kartOperasyonlari ile aynıdır', () => {
    const kayit = { ops: [{ no: 30, kod: 'FRZ' }, { kod: 'TRN' }, { no: 10, kod: '' }, { no: 10, kod: 'ESK', ad: 'Eski' }] };
    assert.deepEqual(kartOperasyonKimlikleri(kayit, tipler, istasyonlar).map(({ no, kod, ad }) => ({ no, kod, ad })), kartOperasyonlari(kayit));
  });

  test('operasyonsuz kart boş dizi', () => {
    assert.deepEqual(kartOperasyonKimlikleri({}, tipler, istasyonlar), []);
  });
});

describe('Eski operasyonlar ayarı salt okunur (C1, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';

  before(async () => {
    ortam = await testVeritabaniKur('malzemeopkimlik');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme op kimlik', kullaniciAdi: 'opk-yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'opk-yonetici', parola: PAROLA } });
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  const kaydet = (anahtar: string, deger: Record<string, unknown>) => app.inject({
    method: 'POST', url: `/api/malzeme-katalogu-ayarlari/${anahtar}/kaydet`, headers: { cookie: cerez },
    payload: { deger, surum: null },
  });
  const ayarlar = async (): Promise<KatalogAyarlariCevabi> =>
    (await app.inject({ method: 'GET', url: '/api/malzeme-katalogu-ayarlari', headers: { cookie: cerez } })).json() as KatalogAyarlariCevabi;

  test('reddedilen: tanım yazma yetkisi olan yönetici de operasyonlar ayarını yazamaz (422), ayar ve sürüm değişmez', async () => {
    const c = await kaydet('operasyonlar', { ops: [{ kod: 'YNI', ad: 'Yeni' }] });
    assert.deepEqual({ durum: c.statusCode, kod: c.json().kod, mesaj: c.json().mesaj }, { durum: 422, kod: 'GECERSIZ', mesaj: OPERASYON_AYARI_ILETISI });
    const a = await ayarlar();
    assert.deepEqual({ deger: a.operasyonlar, surum: a.surumler.operasyonlar }, { deger: null, surum: null });
    assert.ok(a.operasyonTipleri.length > 0, 'liste İstasyonlar\'dan okunmaya devam eder');
  });

  test('izinli: aynı kullanıcı öteki ayarı yazar', async () => {
    const c = await kaydet('genel', { ad: 'deneme' });
    assert.equal(c.statusCode, 200, c.body);
    assert.equal((await ayarlar()).surumler.genel, 1);
  });
});
