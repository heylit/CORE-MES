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
import { rotaRevizyonlariCozucusu } from './disari.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

// Rota bu modülü ithal eder; kartın rotası çözücüyle gelir (kablolama.ts). Test kendi çözücüsünü kaydeder: rotası olan kart kümesi.
describe('233 a: rotası olan kartın operasyon ve reçetesi kartta değişmez (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  const rotali = new Set<number>();

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  async function istek(yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<{ statusCode: number; json: () => unknown; body: string }> {
    return app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: yonetici }, ...(govde === undefined ? {} : { payload: (await surumlu(vt(), url, govde)) as object }) });
  }
  const OPS = [{ no: 10, kod: 'TRN', ad: 'Tornalama' }, { no: 20, kod: 'FRZ', ad: 'Frezeleme' }];
  const BOM = [{ ref: null, ad: 'Örnek kalem', miktar: 1, birim: 'adet', fire: '' }];
  let sira = 0;
  const kartAc = async (): Promise<{ kimlik: string; no: number }> => {
    sira += 1;
    const kimlik = `rk${sira}`;
    const kayit = { id: kimlik, tur: 'yarimamul', com: { kod: `YM-RTK-0000${sira}`, birim: 'adet' }, onay: { durum: 'aktif' }, ops: OPS, bom: BOM };
    const c = await istek('POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, { kayit, ozet: { benzersiz_anahtar: `ym|rk|${kimlik}`, mukerrer_gerekcesi: null }, surum: null });
    assert.equal(c.statusCode, 200, c.body);
    return { kimlik, no: (await vt().tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.no };
  };
  const yenidenKaydet = async (kimlik: string, degistir: (k: Record<string, unknown>) => Record<string, unknown>) => {
    const r = (await vt().tek<{ kayit: Record<string, unknown>; surum: number }>('SELECT kayit, surum FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!;
    return istek('POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, { kayit: degistir(r.kayit), ozet: { benzersiz_anahtar: `ym|rk|${kimlik}`, mukerrer_gerekcesi: null }, surum: r.surum });
  };

  before(async () => {
    ortam = await testVeritabaniKur('malzemerotali');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme rota', kullaniciAdi: 'rk-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'rk-yonetici', parola: PAROLA } });
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
    const a = await istek('POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } });
    assert.equal(a.statusCode, 200, a.body);
    rotaRevizyonlariCozucusu(async (_db, no) => (rotali.has(no) ? [{ id: 1 }] : []));
  });
  after(async () => { rotaRevizyonlariCozucusu(async () => []); await app?.close(); await ortam?.kaldir(); });

  test('rotası olmayan kartta operasyon ve reçete değişir; ekran rotasız görür', async () => {
    const k = await kartAc();
    const c = await yenidenKaydet(k.kimlik, (r) => ({ ...r, ops: [...OPS, { no: 30, kod: 'TAS', ad: 'Taşlama' }], bom: [] }));
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual((await istek('GET', `/malzeme-katalogu-kartlari/${k.kimlik}/rota`)).json(), { rotali: false });
  });

  test('rotası olan kartta operasyon, reçete ya da talebin önerdiği operasyon değişirse 409; değişmeyen ve yalnız yeniden numaralanan kayıt geçer', async () => {
    const k = await kartAc();
    rotali.add(k.no);
    assert.deepEqual((await istek('GET', `/malzeme-katalogu-kartlari/${k.kimlik}/rota`)).json(), { rotali: true });

    const ayni = await yenidenKaydet(k.kimlik, (r) => ({ ...r, com: { ...(r['com'] as object), not: 'Ad dışı değişiklik' } }));
    assert.equal(ayni.statusCode, 200, ayni.body);
    const numarasiz = await yenidenKaydet(k.kimlik, (r) => ({ ...r, ops: OPS.map(({ kod, ad }) => ({ kod, ad })) }));
    assert.equal(numarasiz.statusCode, 200, numarasiz.body);

    for (const [ad, degistir] of [
      ['operasyon eklendi', (r: Record<string, unknown>) => ({ ...r, ops: [...OPS, { no: 30, kod: 'TAS', ad: 'Taşlama' }] })],
      ['operasyon sırası', (r: Record<string, unknown>) => ({ ...r, ops: [{ ...OPS[1], no: 10 }, { ...OPS[0], no: 20 }] })],
      ['reçete', (r: Record<string, unknown>) => ({ ...r, bom: [{ ...BOM[0], miktar: 2 }] })],
      ['talep', (r: Record<string, unknown>) => ({ ...r, talep: { yeni: { ...r, ops: [] }, farklar: [] } })],
    ] as const) {
      const c = await yenidenKaydet(k.kimlik, degistir);
      assert.equal(c.statusCode, 409, `${ad}: ${c.body}`);
      assert.match(c.body, /Reçete ve Rota'da düzenlenir/, ad);
    }
  });

  test('olmayan kartın rotası sorulunca 404', async () => {
    assert.equal((await istek('GET', '/malzeme-katalogu-kartlari/olmayan-kart/rota')).statusCode, 404);
  });
});
