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
import { logoyaGidecekMalzemeler } from './disari.ts';
import { tamGovde } from './test-kart.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

describe('334 a: ekranın Açıklama 1, 2, 3 değeri kartta saklanır ve Logo kuyruğuna gider (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  async function kaydet(kimlik: string, tur: string, ozetEki: Record<string, unknown>, surum: number | null): Promise<number> {
    const url = `/malzeme-katalogu-kartlari/${kimlik}/kaydet`;
    const onek = tur === 'mamul' ? 'MM' : 'HM';
    const govde = {
      kayit: { id: kimlik, tur, com: { kod: `${onek}-ACK-00000`, ad: `Deneme ${kimlik}`, birim: 'adet' }, onay: { durum: 'aktif' } },
      ozet: { benzersiz_anahtar: tur === 'hammadde' ? `hm|ack|${kimlik}` : null, mukerrer_gerekcesi: null, ...ozetEki },
      surum,
    };
    const c = await app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: yonetici }, payload: (await surumlu(vt(), url, tamGovde(url, govde))) as object });
    assert.equal(c.statusCode, 200, c.body);
    return (c.json() as KatalogKartiKaydetCevabi).surum;
  }
  const aciklamalar = async (kimlik: string) =>
    Object.values((await vt().tek<Record<string, string | null>>('SELECT aciklama_1, aciklama_2, aciklama_3 FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!);

  before(async () => {
    ortam = await testVeritabaniKur('malzemeaciklama');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme açıklama', kullaniciAdi: 'ack-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'ack-yonetici', parola: PAROLA } });
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
    const a = await app.inject({ method: 'POST', url: '/api/malzeme-katalogu-ayarlari/genel/kaydet', headers: { cookie: yonetici }, payload: (await surumlu(vt(), '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } })) as object });
    assert.equal(a.statusCode, 200, a.body);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('her türde yazılır, boşluk kırpılır, boş metin null; gönderilmezse korunur, null gelirse silinir', async () => {
    const s1 = await kaydet('a1', 'hammadde', { aciklama_1: ' Ø50 ÇUBUK ', aciklama_2: '', aciklama_3: 'P-1 ÖRNEK' }, null);
    assert.deepEqual(await aciklamalar('a1'), ['Ø50 ÇUBUK', null, 'P-1 ÖRNEK']);
    const s2 = await kaydet('a1', 'hammadde', {}, s1);
    assert.deepEqual(await aciklamalar('a1'), ['Ø50 ÇUBUK', null, 'P-1 ÖRNEK']);
    await kaydet('a1', 'hammadde', { aciklama_1: null, aciklama_2: 'İkinci', aciklama_3: null }, s2);
    assert.deepEqual(await aciklamalar('a1'), [null, 'İkinci', null]);
    await kaydet('a2', 'mamul', { aciklama_1: 'Mamul açıklaması' }, null);
    assert.deepEqual(await aciklamalar('a2'), ['Mamul açıklaması', null, null]);
  });

  test('Logo kuyruğu kartın üç açıklamasını verir', async () => {
    await kaydet('a3', 'mamul', { aciklama_1: 'Bir', aciklama_2: null, aciklama_3: 'Üç' }, null);
    await vt().tx((db) => db.sorgu("UPDATE malzeme_katalog_karti SET logo_gonderim_durumu = 'bekliyor' WHERE kimlik = 'a3'"));
    const kuyruk = await vt().tx((db) => logoyaGidecekMalzemeler(db, 50));
    const kart = kuyruk.find((k) => k.ad === 'Deneme a3');
    assert.deepEqual([kart?.aciklama1, kart?.aciklama2, kart?.aciklama3], ['Bir', null, 'Üç']);
  });
});
