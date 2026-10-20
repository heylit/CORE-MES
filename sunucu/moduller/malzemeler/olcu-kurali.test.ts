import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

describe('UYUM-BORCU 4: hammadde ölçüsü doğrudan API kaydında da ekranın kuralıyla denetlenir (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  async function kaydet(kimlik: string, kayit: Record<string, unknown>, surum: number | null): Promise<{ statusCode: number; body: string; json: () => unknown }> {
    const url = `/malzeme-katalogu-kartlari/${kimlik}/kaydet`;
    const govde = { kayit: { id: kimlik, tur: 'hammadde', com: { kod: 'HM-OLC-00000', birim: 'kg' }, onay: { durum: 'taslak' }, ...kayit }, ozet: { benzersiz_anahtar: `hm|olc|${kimlik}`, mukerrer_gerekcesi: null }, surum };
    return app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: yonetici }, payload: (await surumlu(vt(), url, govde)) as object });
  }
  const kayitli = async (kimlik: string) => (await vt().tek<{ kayit: Record<string, unknown>; surum: number }>('SELECT kayit, surum FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!;

  before(async () => {
    ortam = await testVeritabaniKur('malzemeolcu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme ölçü', kullaniciAdi: 'olc-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'olc-yonetici', parola: PAROLA } });
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('geçerli ölçü ve ölçüsüz kart kaydolur; bilinmeyen form, sıfır ölçü ve et kalınlığı sınırı 400 ve kart yazılmaz', async () => {
    assert.equal((await kaydet('o1', { form: 'boru', dims: { D: 48.3, t: 2.6, l: 6000 } }, null)).statusCode, 200);
    assert.equal((await kaydet('o2', { fam: 'metal' }, null)).statusCode, 200);
    for (const [kimlik, kayit, ileti] of [
      ['o3', { form: 'yok', dims: { d: 1 } }, 'Bir form seç.'],
      ['o4', { form: 'cubuk', dims: { d: 0, l: 6000 } }, 'Tüm ölçüleri sıfırdan büyük girmelisin.'],
      ['o5', { form: 'boru', dims: { D: 10, t: 5, l: 6000 } }, 'Et kalınlığı dış çapın yarısından küçük olmalı.'],
    ] as const) {
      const c = await kaydet(kimlik, kayit, null);
      assert.equal(c.statusCode, 400, c.body);
      assert.match(c.body, new RegExp(ileti));
      assert.equal(await vt().tek('SELECT 1 FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]), null);
    }
  });

  test('kayıtlı kartta ölçü değişmezse eski uyumsuz ölçü kaydı engellemez; değişen ölçü denetlenir', async () => {
    await vt().tx(async (db) => {
      await db.sorgu("UPDATE malzeme_katalog_karti SET kayit = kayit || '{\"form\":\"cubuk\",\"dims\":{\"d\":0,\"l\":1}}'::jsonb WHERE kimlik = 'o2'");
    });
    const r = await kayitli('o2');
    const ad = await kaydet('o2', { ...r.kayit, com: { ...(r.kayit['com'] as object), not: 'Yalnız not' } }, r.surum);
    assert.equal(ad.statusCode, 200, ad.body);
    const r2 = await kayitli('o2');
    const olcu = await kaydet('o2', { ...r2.kayit, dims: { d: -1, l: 1 } }, r2.surum);
    assert.equal(olcu.statusCode, 400, olcu.body);
  });
});
