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
import { malzemeBirimDonusumleri } from './disari.ts';
import { tamGovde } from './test-kart.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

describe('323 b: kartta alış birimi ve katsayısı (1 alış birimi = N stok birimi) saklanır, Satın alma disari.ts ile okur (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  async function gonder(kimlik: string, comEki: Record<string, unknown>, surum: number | null, talep?: Record<string, unknown>) {
    const url = `/malzeme-katalogu-kartlari/${kimlik}/kaydet`;
    const govde = {
      kayit: { id: kimlik, tur: 'mamul', com: { kod: 'MM-BRM-00000', ad: `Deneme ${kimlik}`, birim: 'adet', ...comEki }, onay: { durum: 'aktif' }, ...(talep ? { talep } : {}) },
      ozet: { benzersiz_anahtar: null, mukerrer_gerekcesi: null },
      surum,
    };
    return app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: yonetici }, payload: (await surumlu(vt(), url, tamGovde(url, govde))) as object });
  }
  async function kaydet(kimlik: string, comEki: Record<string, unknown>, surum: number | null): Promise<number> {
    const c = await gonder(kimlik, comEki, surum);
    assert.equal(c.statusCode, 200, c.body);
    return (c.json() as KatalogKartiKaydetCevabi).surum;
  }
  const sutunlar = async (kimlik: string) => {
    const r = await vt().tek<{ alis_birimi: string | null; katsayi: string | null }>(
      'SELECT alis_birimi, alis_katsayisi::text AS katsayi FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]);
    return [r?.alis_birimi ?? null, r?.katsayi === null || r?.katsayi === undefined ? null : Number(r.katsayi)];
  };
  const no = async (kimlik: string) => (await vt().tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.no;

  before(async () => {
    ortam = await testVeritabaniKur('malzemebirimdonusumu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme birim', kullaniciAdi: 'brm-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'brm-yonetici', parola: PAROLA } });
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
    const a = await app.inject({ method: 'POST', url: '/api/malzeme-katalogu-ayarlari/genel/kaydet', headers: { cookie: yonetici }, payload: (await surumlu(vt(), '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } })) as object });
    assert.equal(a.statusCode, 200, a.body);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('yazılır, virgüllü katsayı kabul edilir, iki alan boşalınca silinir; dönüşümsüz kart haritada yok', async () => {
    const s1 = await kaydet('b1', { alisBirimi: 'kutu', alisKatsayisi: '50' }, null);
    assert.deepEqual(await sutunlar('b1'), ['kutu', 50]);
    const s2 = await kaydet('b1', { alisBirimi: ' kutu ', alisKatsayisi: '1,5' }, s1);
    assert.deepEqual(await sutunlar('b1'), ['kutu', 1.5]);
    await kaydet('b1', { alisBirimi: '', alisKatsayisi: '' }, s2);
    assert.deepEqual(await sutunlar('b1'), [null, null]);
    await kaydet('b2', {}, null);
    assert.deepEqual(await sutunlar('b2'), [null, null]);
  });

  test('Satın alma için disari.ts: stok birimi, alış birimi ve katsayı; dönüşümsüz kart haritada yok', async () => {
    await kaydet('b3', { alisBirimi: 'kutu', alisKatsayisi: 50 }, null);
    await kaydet('b4', {}, null);
    const harita = await vt().tx(async (db) => malzemeBirimDonusumleri(db, [await no('b3'), await no('b4'), 999999]));
    assert.deepEqual([...harita.values()], [{ stokBirimi: 'adet', alisBirimi: 'kutu', katsayi: '50' }]);
    assert.equal(harita.has(await no('b4')), false);
  });

  test('eksik ya da geçersiz dönüşüm reddedilir, kart değişmez', async () => {
    const s = await kaydet('b5', { alisBirimi: 'kutu', alisKatsayisi: '50' }, null);
    const durumlar: [Record<string, unknown>, string][] = [
      [{ alisBirimi: 'kutu', alisKatsayisi: '' }, 'kayit.com.alisKatsayisi'],
      [{ alisBirimi: '', alisKatsayisi: '10' }, 'kayit.com.alisBirimi'],
      [{ alisBirimi: 'kutu', alisKatsayisi: '0' }, 'kayit.com.alisKatsayisi'],
      [{ alisBirimi: 'kutu', alisKatsayisi: '-2' }, 'kayit.com.alisKatsayisi'],
      [{ alisBirimi: 'kutu', alisKatsayisi: 'elli' }, 'kayit.com.alisKatsayisi'],
      [{ alisBirimi: 'kutu', alisKatsayisi: '0,0000001' }, 'kayit.com.alisKatsayisi'],
      [{ alisBirimi: 'adet', alisKatsayisi: '5' }, 'kayit.com.alisBirimi'],
    ];
    for (const [ek, alan] of durumlar) {
      const c = await gonder('b5', ek, s);
      assert.equal(c.statusCode, 400, `${JSON.stringify(ek)} ${c.body}`);
      assert.equal((c.json() as { alan?: string }).alan, alan, c.body);
    }
    const yok = await gonder('b5', { alisBirimi: 'listede-olmayan', alisKatsayisi: '5' }, s);
    assert.notEqual(yok.statusCode, 200, yok.body);
    assert.match(yok.body, /birim listesinde yok/);
    assert.deepEqual(await sutunlar('b5'), ['kutu', 50]);
  });

  test('değişiklik talebinin önerdiği dönüşüm de aynı denetimden geçer', async () => {
    const s = await kaydet('b6', {}, null);
    const c = await gonder('b6', {}, s, { yeni: { id: 'b6', tur: 'mamul', com: { kod: 'MM-BRM-00000', ad: 'Deneme b6', birim: 'adet', alisBirimi: 'kutu', alisKatsayisi: '0' } } });
    assert.equal(c.statusCode, 400, c.body);
    assert.equal((c.json() as { alan?: string }).alan, 'kayit.talep.yeni.com.alisKatsayisi', c.body);
  });
});
