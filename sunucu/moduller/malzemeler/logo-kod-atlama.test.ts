import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { logoKodCozucusu } from './disari.ts';
import { tamGovde } from './test-kart.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

// 2089-2 a: yeni stok kodu Logo'da kullanılan numarayı atlar. Logo'nun aynası yerine sahte çözücü (kablolama'nın bağladığı yerine).
describe('Yeni stok kodu Logo\'daki kodları atlar (2089-2 a, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  const logodakiler = new Set<string>();
  const sorulanlar: string[][] = [];

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  let sayac = 0;
  async function taslakAc(kod: string): Promise<string> {
    const kimlik = `lk${++sayac}`;
    const url = `/malzeme-katalogu-kartlari/${kimlik}/kaydet`;
    const govde = {
      kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', com: { kod, ad: `Kod deneme ${kimlik}`, birim: 'kg' }, onay: { durum: 'taslak' } },
      ozet: { benzersiz_anahtar: `hammadde|metal|${kimlik}`, mukerrer_gerekcesi: null },
      surum: null,
    };
    const c = await app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: cerez }, payload: (await surumlu(vt(), url, tamGovde(url, govde))) as object });
    assert.equal(c.statusCode, 200, c.body);
    return (await vt().tek<{ kod: string }>('SELECT stok_kodu AS kod FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.kod;
  }

  before(async () => {
    ortam = await testVeritabaniKur('malzemelogokod');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kod', kullaniciAdi: 'lk-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'lk-yonetici', parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    cerez = String(c.headers['set-cookie']).split(';')[0] ?? '';
    logoKodCozucusu(async (_db, kodlar) => {
      sorulanlar.push([...kodlar]);
      return kodlar.filter((k) => logodakiler.has(k));
    });
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('Logo\'da olan numara atlanır, atlanan numara sonra da verilmez; Logo\'da olmayan ilk numara hemen verilir', async () => {
    assert.equal(await taslakAc('HM-KOD-00001'), 'HM-KOD-00001');
    logodakiler.add('HM-KOD-00002');
    logodakiler.add('HM-KOD-00003');
    sorulanlar.length = 0;
    assert.equal(await taslakAc('HM-KOD-00001'), 'HM-KOD-00004');
    assert.deepEqual(sorulanlar, [['HM-KOD-00002'], ['HM-KOD-00003'], ['HM-KOD-00004']]);
    logodakiler.clear();
    assert.equal(await taslakAc('HM-KOD-00001'), 'HM-KOD-00005');
  });

  test('önek başına ayrı: başka önekte Logo\'daki kod yalnız o öneki etkiler', async () => {
    logodakiler.add('HM-ATL-00001');
    assert.equal(await taslakAc('HM-ATL-00001'), 'HM-ATL-00002');
    assert.equal(await taslakAc('HM-YOK-00001'), 'HM-YOK-00001');
  });
});
