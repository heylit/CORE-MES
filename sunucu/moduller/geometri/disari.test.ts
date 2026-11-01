import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { malzemeGeometrisi } from './disari.ts';
import { geometriTuru } from './servis.ts';
import { geometriSureci, geometriSureciKur } from './surec.ts';
import type { GeometriSureci } from './surec.ts';
import { kutuStep } from './test-ortak.ts';

const PAROLA = 'dogru-parola-1';
const sessiz = { uyar: () => undefined, hata: () => undefined };

describe('geometri dışa açık okuma: malzemenin 3B analizi ve ham önerisi (1707)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let surec: GeometriSureci;
  let cerez = '';
  let mil = 0;
  let flans = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const istek = (yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, headers: { cookie: cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, payload: govde as object });
  const tamam = (r: LightMyRequestResponse): unknown => { assert.equal(r.statusCode, 200, r.body); return r.json(); };

  // Model Çizim Merkezi'nin kendi uçlarıyla eklenip yayınlanır (bu test merkezin tablolarına yazmaz).
  async function modelEkle(malzemeNo: number, icerik: Buffer, dosyaAdi: string): Promise<void> {
    const ozet = createHash('sha256').update(icerik).digest('hex');
    tamam(await istek(`/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') }));
    const ad = `Model ${dosyaAdi}`;
    const c = tamam(await istek(`/cizimler/malzemeler/${String(malzemeNo)}/belge-ekle`, { ad, tur: '3b-model', ozet, dosyaAdi })) as
      { belgeler: { id: number; ad: string; surum: number; revizyonlar: { id: number }[] }[] };
    const b = c.belgeler.find((x) => x.ad === ad);
    assert.ok(b);
    tamam(await istek(`/cizimler/${String(b.id)}/revizyonlar/${String(b.revizyonlar[0]?.id)}/yayinla`, { surum: b.surum }));
  }

  before(async () => {
    ortam = await testVeritabaniKur('geometri_disari');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const secilen = (await modulOrnekVerileriniKesfet()).filter((t) => t.modul === 'malzemeler' || t.modul === 'kisiler');
    assert.equal((await ornekVeriYukle(ortam.vt, secilen, { ortam: 'test', bildir: () => undefined })).durum, 'yuklendi');
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    cerez = String(r.headers['set-cookie']).split(';')[0] ?? '';
    await o().vt.tx(async (db) => {
      mil = (await ornekMalzemeNo(db, 'mil'))!;
      flans = (await ornekMalzemeNo(db, 'flans'))!;
    });
    surec = geometriSureciKur();
  });

  after(async () => {
    surec?.kapat();
    geometriSureci().kapat();
    await ortam?.kaldir();
  });

  test('modeli olmayan malzemede null; model yayında ama analiz yokken analiz null ve öneri "analiz-yok"', async () => {
    assert.equal(await o().vt.tx((db) => malzemeGeometrisi(db, flans)), null);
    await modelEkle(mil, Buffer.from(kutuStep(40, 20, 10)), 'kup.step');
    const once = await o().vt.tx((db) => malzemeGeometrisi(db, mil));
    assert.ok(once);
    assert.equal(once.analiz.analiz, null);
    assert.equal(once.ham.neden, 'analiz-yok');
    assert.deepEqual(once.ham.oneriler, []);
  });

  test('analizden sonra ölçü ve pay eklenmiş en az ham gelir; birden çok modelde en son yayına giren okunur', async () => {
    await geometriTuru(o().vt, surec, sessiz);
    const a = await o().vt.tx((db) => malzemeGeometrisi(db, mil, { payMm: 2 }));
    assert.ok(a?.analiz.analiz);
    assert.deepEqual(a.analiz.analiz.kutu, { x: 40, y: 20, z: 10 });
    assert.equal(a.ham.payMm, 2);
    assert.equal(a.ham.payKaynagi, 'istek');
    assert.notEqual(a.ham.enAz, null);
    const ilkRevizyon = a.analiz.revizyonId;
    await modelEkle(mil, Buffer.from(kutuStep(60, 30, 15)), 'buyuk.step');
    const b = await o().vt.tx((db) => malzemeGeometrisi(db, mil));
    assert.ok(b);
    assert.ok(b.analiz.revizyonId > ilkRevizyon, 'yeni yayındaki model');
    assert.equal(b.belgeAdi, 'Model buyuk.step');
  });
});
