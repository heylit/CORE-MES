import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ANAHTARLI_TURLER, bildirimOlayAciklariCevabi, type BildirimOlayAciklariCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { bildirimGonder, type BildirimOlayi } from './disari.ts';

// 3478 (3478-1 a, 3478-2 a): olaylar göçten sonra kapalıdır; anahtar, toplu anahtar ve "Önceki hale dön". Bu dosya olayları
// açan test yardımcısını çağırmaz: göçün bıraktığı hali ölçer.
const PAROLA = 'dogru-parola-1';

describe('3478 olay anahtarı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let operatorId = 0;
  const cerez = new Map<string, string>();
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  async function giris(ad: string): Promise<void> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    cerez.set(ad, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }
  const istek = async (ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown) => {
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: cerez.get(ad) ?? '' }, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as unknown, metin: c.body };
  };
  const anahtarlar = async (): Promise<BildirimOlayAciklariCevabi> => {
    const c = await istek('yonetici', 'GET', '/bildirimler/olaylar');
    assert.equal(c.durum, 200, c.metin);
    return bildirimOlayAciklariCevabi.parse(c.govde);
  };
  const gonder = (olay: BildirimOlayi): Promise<number> => o().vt.tx((db) => bildirimGonder(db, olay));
  const satirlar = (tur: string) => o().sahip.sorgu<{ kisi_id: number; ortada: boolean }>('SELECT kisi_id, ortada FROM bildirim_kaydi WHERE tur = $1', [tur]);

  before(async () => {
    ortam = await testVeritabaniKur('bildirim_olay_acik');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const rol = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'operator'");
    const yonetici = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    operatorId = await ortam.vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme Operatör', kullaniciAdi: 'operator', parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol!.id);
      await rolAl(db, yoneticiId, yeni, yonetici!.id);
      return yeni;
    });
    await giris('yonetici');
    await giris('operator');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('göçten sonra bütün anahtarlı olaylar kapalı; ekip çağrısı ve kademe türleri listede yok; önceki hal saklı', async () => {
    const a = await anahtarlar();
    assert.equal(a.satirlar.length, ANAHTARLI_TURLER.length);
    assert.ok(a.satirlar.every((s) => !s.acik && s.surum === null));
    assert.ok(!a.satirlar.some((s) => s.tur === 'arkon.ekip-cagrisi' || s.tur.includes('.kademe-') || s.tur.startsWith('projeler.hazirlik-')));
    assert.notEqual(a.oncekiHal.alindi, null);
    assert.equal(a.oncekiHal.donuldu, null);
    assert.equal((await istek('operator', 'GET', '/bildirimler/olaylar')).durum, 403, 'ayar işlemi olmayan okuyamaz');
  });

  test('kapalı olay yazılmaz; görev sınıfı Gelenler\'e ekran ortasız yazılır; ekip çağrısı her zaman gider', async () => {
    assert.equal(await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'Makine durdu', yol: '/istasyonlar' }), 0);
    assert.deepEqual(await satirlar('istasyonlar.makine-durdu'), []);
    assert.ok(await gonder({ tur: 'satin-alma.talep-onay-bekliyor', baslik: 'Onay bekleyen talep', yol: '/satin-alma/onaylar', kaynakKimlik: 't1' }) >= 1);
    const gorev = await satirlar('satin-alma.talep-onay-bekliyor');
    assert.ok(gorev.length >= 1 && gorev.every((s) => !s.ortada), 'görev satırı yazıldı, ekran ortasına çıkmaz');
    assert.equal(await gonder({ tur: 'arkon.ekip-cagrisi', baslik: 'Bakım çağrısı', yol: null, kaynakKimlik: 'c1', kisiler: [yoneticiId] }), 1);
  });

  test('anahtar açılınca olay gider; eski sürümle 409; ayar işlemi olmayan 403; toplu kapatma', async () => {
    assert.equal((await istek('operator', 'POST', '/bildirimler/olaylar/istasyonlar.makine-durdu/degistir', { acik: true, surum: null })).durum, 403);
    const ac = await istek('yonetici', 'POST', '/bildirimler/olaylar/istasyonlar.makine-durdu/degistir', { acik: true, surum: null });
    assert.equal(ac.durum, 200, ac.metin);
    const satir = bildirimOlayAciklariCevabi.parse(ac.govde).satirlar.find((s) => s.tur === 'istasyonlar.makine-durdu');
    assert.deepEqual([satir?.acik, satir?.surum], [true, 1]);
    assert.ok(await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'Makine durdu', yol: '/istasyonlar' }) >= 1);
    assert.equal((await istek('yonetici', 'POST', '/bildirimler/olaylar/istasyonlar.makine-durdu/degistir', { acik: false, surum: null })).durum, 409, 'satır varken boş sürüm');
    const toplu = await istek('yonetici', 'POST', '/bildirimler/olaylar/toplu', { turler: ['istasyonlar.makine-durdu', 'cnc-kurulum.takim-omru'], acik: false });
    assert.equal(toplu.durum, 200, toplu.metin);
    assert.ok(bildirimOlayAciklariCevabi.parse(toplu.govde).satirlar.filter((s) => s.tur === 'istasyonlar.makine-durdu' || s.tur === 'cnc-kurulum.takim-omru').every((s) => !s.acik));
    await o().sahip.sorgu('DELETE FROM bildirim_kaydi');
    assert.equal(await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'Makine durdu', yol: '/istasyonlar' }), 0);
    assert.equal((await istek('yonetici', 'POST', '/bildirimler/olaylar/toplu', { turler: ['arkon.ekip-cagrisi'], acik: false })).durum, 400, 'anahtarsız tür');
  });

  test('Önceki hale dön: olaylar açılır; saklanan kademe ayarı geri yazılır, saklanmayan kaynak eski varsayılanıyla açılır', async () => {
    await o().sahip.sorgu(
      `INSERT INTO bildirim_kademe_ayari (kaynak, acik, k2_gun, k3_gun, k4_gun, k5_gun, eposta_kademe, serit, kapatilamaz) VALUES ('arkon.bakim-vade', false, 5, null, 2, 5, 3, true, true)`);
    await o().sahip.sorgu(`UPDATE bildirim_onceki_hal SET kademe = '[{"kaynak": "arkon.bakim-vade", "acik": false}, {"kaynak": "malzemeler.kart-onay", "acik": true}]'`);
    assert.equal((await istek('operator', 'POST', '/bildirimler/olaylar/onceki-hale-don', {})).durum, 403);
    const c = await istek('yonetici', 'POST', '/bildirimler/olaylar/onceki-hale-don', {});
    assert.equal(c.durum, 200, c.metin);
    const a = bildirimOlayAciklariCevabi.parse(c.govde);
    assert.ok(a.satirlar.every((s) => s.acik), 'bütün olaylar açık');
    assert.notEqual(a.oncekiHal.donuldu, null);
    const kademe = new Map((await o().sahip.sorgu<{ kaynak: string; acik: boolean }>('SELECT kaynak, acik FROM bildirim_kademe_ayari')).map((r) => [r.kaynak, r.acik]));
    assert.equal(kademe.get('arkon.bakim-vade'), false, 'saklanan kapalı ayar kapalı kalır');
    assert.equal(kademe.get('kalibrasyon.vade'), true, 'saklanmayan, eski varsayılanı açık kaynak açılır');
    assert.equal(kademe.get('malzemeler.kart-onay'), true, 'saklanan açık ayar geri gelir');
    assert.equal(kademe.get('kalite-merkezi.dof'), undefined, 'eski varsayılanı kapalı kaynağa satır açılmaz');
    void operatorId;
  });
});
