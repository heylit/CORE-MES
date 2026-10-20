import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { DURUM_ANAHTARI } from './disari.ts';
import { planAlanlariniKoru } from './kurallar.ts';

// Elle sıra ve dondurma canlı planındır (plan-ekran-verisi-yeri.md 5.2): ana kayda ekranın gönderdiği qorder, frozen ve frozenAt yazılmaz;
// kayıttaki eski hâl silinmeden kalır. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('ana kayıtta plan alanları (kural)', () => {
  test('gönderilen plan alanı yerine eskisi kalır; eskide yoksa yazılmaz; başka alan ve nesne olmayan değer olduğu gibi', () => {
    const eski = { qorder: { s1: ['a'] }, frozen: { a: { parts: [] } }, items: [1] };
    assert.deepEqual(planAlanlariniKoru({ qorder: { s1: ['b'] }, frozen: {}, frozenAt: '2030-01-01', items: [2] }, eski),
      { qorder: { s1: ['a'] }, frozen: { a: { parts: [] } }, items: [2] });
    assert.deepEqual(planAlanlariniKoru({ qorder: { s1: ['b'] }, items: [] }, null), { items: [] });
    assert.deepEqual(planAlanlariniKoru({ assign: { a: { resId: '33', personId: 'p2' }, b: { resId: '34' } } }, { assign: { a: { resId: '31', personId: 'p1' }, c: { resId: '35' } } }),
      { assign: { a: { personId: 'p2', resId: '31' }, c: { resId: '35' } } }, 'makine eskiden, kişi gönderilenden; yalnız makinesi gönderilen iş yazılmaz');
    assert.deepEqual(planAlanlariniKoru([1], eski), [1]);
    assert.equal(planAlanlariniKoru('metin', eski), 'metin');
  });
});

describe('ana kayıtta plan alanları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const yaz = async (anahtar: string, deger: unknown, beklenenSurum: number | null) => {
    const c = await app.inject({ method: 'POST', url: '/api/recete-rota/kayitlar/yaz', headers: { cookie: cerez }, payload: { anahtar, bicim: 'json', deger, beklenenSurum } });
    assert.equal(c.statusCode, 200, c.body);
  };
  const oku = async (anahtar: string) => (await vt().tek<{ deger: unknown }>('SELECT deger FROM recete_rota_kayit WHERE anahtar = $1', [anahtar]))?.deger;

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_plan_alanlari');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerez = String(giris.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await ortam?.kaldir(); });

  test('ilk yazımda plan alanı yazılmaz; kayıtta duran eski elle sıra ve dondurma sonraki yazımlarda değişmez; başka anahtar etkilenmez', async () => {
    await yaz(DURUM_ANAHTARI, { qorder: { s1: ['41|root|p1'] }, frozen: { k: {} }, items: [] }, null);
    assert.deepEqual(await oku(DURUM_ANAHTARI), { items: [] });
    await vt().sorgu(`UPDATE recete_rota_kayit SET deger = deger || '{"qorder": {"s1": ["eski"]}, "frozenAt": "2030-01-01"}'::jsonb WHERE anahtar = $1`, [DURUM_ANAHTARI]);
    await yaz(DURUM_ANAHTARI, { qorder: { s1: ['yeni'] }, frozen: { k: {} }, assign: { k: { resId: '31', personId: 'p1' } }, items: [1] }, 1);
    assert.deepEqual(await oku(DURUM_ANAHTARI), { qorder: { s1: ['eski'] }, frozenAt: '2030-01-01', assign: { k: { personId: 'p1' } }, items: [1] });
    await yaz(`${DURUM_ANAHTARI}:studio:1`, { qorder: { s1: ['senaryo'] } }, null);
    assert.deepEqual(await oku(`${DURUM_ANAHTARI}:studio:1`), { qorder: { s1: ['senaryo'] } }, 'senaryo kaydı kendi sırasını tutar');
  });
});
