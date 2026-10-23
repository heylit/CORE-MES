import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KmKimlikCevabi, KmSurumCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

// 195 a (B18, Soru 158): Kalite Merkezi'nde kapama ve MRB kararı TMI işlemindendir. Yalnız kayıt yazan (Muayeneci) uygunsuzluğu
// açar ve yürütür; MRB kararı ve kapanış `kalite-merkezi.onayla` ister. Uygulamanın kendi rol kaydı sunucuda hiç sorulmaz.
describe('Kalite Merkezi kapama ve MRB yetkisi (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let muayeneci = '';
  let kalite = '';
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (cerez: string, url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: govde === undefined ? 'GET' : 'POST', url: `/api${url}`, headers: { cookie: cerez }, ...(govde === undefined ? {} : { payload: govde as object }) });
  const yol = (kimlik: string, uc: 'yaz' | 'onayla') => `/kalite-merkezi/kayitlar/ncr/${kimlik}/${uc}`;
  async function tamam(cerez: string, url: string, govde: unknown): Promise<KmSurumCevabi> {
    const r = await istek(cerez, url, govde);
    assert.equal(r.statusCode, 200, `${url}: ${r.body}`);
    return r.json() as KmSurumCevabi;
  }
  async function reddedilir(cerez: string, url: string, govde: unknown): Promise<Record<string, unknown>> {
    const r = await istek(cerez, url, govde);
    assert.equal(r.statusCode, 403, `${url}: ${r.body}`);
    return r.json() as Record<string, unknown>;
  }
  async function girisYap(kullaniciAdi: string, rolKodu: string, aktor: number): Promise<{ id: number; cerez: string }> {
    const rol = async (kod: string) => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, aktor, yeni, await rol(rolKodu));
      await rolAl(db, aktor, yeni, await rol('yonetici'));
      return yeni;
    });
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return { id, cerez: String(r.headers['set-cookie']).split(';')[0] ?? '' };
  }

  before(async () => {
    ortam = await testVeritabaniKur('km_kapama');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    const yonId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'kmk-yon', parola: PAROLA }));
    // Yalnız okuyup yazan kişi (Muayeneci): hiçbir rolde bu ikili tek başına yok, ek işlemle verilir.
    const m = await girisYap('kmk-muayeneci', 'operator', yonId);
    await vt().sorgu("INSERT INTO kisi_islemi (kisi_id, islem, veren_id) VALUES ($1, 'kalite-merkezi.oku', $2), ($1, 'kalite-merkezi.yaz', $2)", [m.id, yonId]);
    muayeneci = m.cerez;
    kalite = (await girisYap('kmk-kalite', 'kalite', yonId)).cerez;
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('kimlik ucu: onay işlemi olan kalite onaylayabilir, yalnız yazan onaylayamaz (uygulama rolü buradan çıkar)', async () => {
    const oku = async (cerez: string) => ((await istek(cerez, '/kalite-merkezi/kimlik')).json() as KmKimlikCevabi).onaylayabilir;
    assert.equal(await oku(kalite), true);
    assert.equal(await oku(muayeneci), false);
  });

  test('Muayeneci uygunsuzluğu açar ve yürütür; MRB kararı ve kapanış ona kapalıdır, kayıt değişmez', async () => {
    const acik = { no: 'NCR-K1', durum: 'Açık', mrb: 'Karar bekliyor' };
    const ilk = await tamam(muayeneci, yol('ncr_k1', 'yaz'), { govde: acik, surum: null });
    const mrbde = await tamam(muayeneci, yol('ncr_k1', 'yaz'), { govde: { ...acik, durum: 'MRB değerlendirmesinde' }, surum: ilk.surum });
    const karar = { ...acik, durum: 'MRB değerlendirmesinde', mrb: 'Hurda' };
    const red = await reddedilir(muayeneci, yol('ncr_k1', 'yaz'), { govde: karar, surum: mrbde.surum });
    assert.deepEqual([red['alan'], red['ayrinti']], ['onay', { alanlar: ['mrb'] }]);
    await reddedilir(muayeneci, yol('ncr_k1', 'onayla'), { govde: karar, surum: mrbde.surum });
    await reddedilir(muayeneci, yol('ncr_k1', 'onayla'), { govde: { ...karar, durum: 'Kapalı' }, surum: mrbde.surum });
    // Yeni kayıt da kararla açılamaz.
    await reddedilir(muayeneci, yol('ncr_k2', 'yaz'), { govde: { no: 'NCR-K2', durum: 'Açık', mrb: 'Yeniden işle' }, surum: null });
    const satir = await vt().tek<{ surum: string }>("SELECT surum FROM kalite_merkezi_belge WHERE koleksiyon = 'ncr' AND kimlik = 'ncr_k1'");
    assert.equal(Number(satir?.surum), mrbde.surum);
  });

  test('kalite-merkezi.onayla taşıyan kalite MRB kararını verir ve kapatır; genel yazma kararı yine onay ucuna gönderir', async () => {
    const acik = { no: 'NCR-K3', durum: 'Açık', mrb: 'Karar bekliyor' };
    const ilk = await tamam(kalite, yol('ncr_k3', 'yaz'), { govde: acik, surum: null });
    const karar = { ...acik, durum: 'MRB değerlendirmesinde', mrb: 'Hurda' };
    const red = await reddedilir(kalite, yol('ncr_k3', 'yaz'), { govde: karar, surum: ilk.surum });
    assert.equal(red['alan'], 'onay');
    const kararli = await tamam(kalite, yol('ncr_k3', 'onayla'), { govde: karar, surum: ilk.surum });
    await tamam(kalite, yol('ncr_k3', 'onayla'), { govde: { ...karar, durum: 'Kapalı' }, surum: kararli.surum });
  });
});
