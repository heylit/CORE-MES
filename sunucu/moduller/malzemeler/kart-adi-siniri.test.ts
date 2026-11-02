import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { KATALOG_KART_ADI_EN_COK } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tamGovde } from './test-kart.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

describe('MLZ-4: kart adının sunucuda üst sınırı var (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  async function kaydet(kimlik: string, ad: string, ek: Record<string, unknown> = {}) {
    const url = `/malzeme-katalogu-kartlari/${kimlik}/kaydet`;
    const govde = {
      kayit: { id: kimlik, tur: 'mamul', com: { kod: 'MM-ADS-00000', ad, birim: 'adet' }, onay: { durum: 'aktif' }, ...ek },
      ozet: { benzersiz_anahtar: null, mukerrer_gerekcesi: null },
      surum: null,
    };
    return app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: yonetici }, payload: (await surumlu(vt(), url, tamGovde(url, govde))) as object });
  }
  const kartSayisi = async (kimlik: string) => Number((await vt().tek<{ n: string }>('SELECT count(*) AS n FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))?.n);

  before(async () => {
    ortam = await testVeritabaniKur('malzemeadsiniri');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme ad sınırı', kullaniciAdi: 'ads-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'ads-yonetici', parola: PAROLA } });
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
    const a = await app.inject({ method: 'POST', url: '/api/malzeme-katalogu-ayarlari/genel/kaydet', headers: { cookie: yonetici }, payload: (await surumlu(vt(), '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } })) as object });
    assert.equal(a.statusCode, 200, a.body);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('sınırdaki ad kaydedilir (izinli)', async () => {
    const c = await kaydet('ads1', 'A'.repeat(KATALOG_KART_ADI_EN_COK));
    assert.equal(c.statusCode, 200, c.body);
  });

  test('sınırı aşan ad 400 alır ve kart yazılmaz (reddedilen)', async () => {
    const c = await kaydet('ads2', 'A'.repeat(5000));
    assert.equal(c.statusCode, 400, c.body);
    assert.equal((c.json() as { alan: string }).alan, 'kayit.com.ad');
    assert.equal(await kartSayisi('ads2'), 0);
  });

  test('değişiklik talebinin önerdiği uzun ad da reddedilir (reddedilen)', async () => {
    const talep = { id: 't1', durum: 'beklemede', yeni: { com: { kod: 'MM-ADS-00000', ad: 'B'.repeat(KATALOG_KART_ADI_EN_COK + 1), birim: 'adet' } }, farklar: [] };
    const c = await kaydet('ads3', 'Kısa ad', { talep });
    assert.equal(c.statusCode, 400, c.body);
    assert.equal((c.json() as { alan: string }).alan, 'kayit.talep.yeni.com.ad');
  });
});
