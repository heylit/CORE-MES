// Uç envanteri ile yetki denemesi (kart 2273): her uç kimliksiz 401, tablodaki işlemle geçer, başka her işlemle 403.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { rolluGiris, uclarinYetkisiniDene } from '#cekirdek/test-yetki.ts';
import type { BeklenenYetkiler } from '#cekirdek/test-yetki.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { KALIBRASYON_ISLEMLERI } from '#paylasilan/islemler/kalibrasyon.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uclar } from './uclar.ts';

// Okuma sayfa.kalibrasyon ya da kalibrasyon.oku ile açılır; bütün yazma uçları yalnız kalibrasyon.yaz ister.
const BEKLENEN: BeklenenYetkiler = {
  'GET /olcu-aletleri': { biri: ['sayfa.kalibrasyon', 'kalibrasyon.oku'] },
  'GET /olcu-aletleri/ozet': { biri: ['sayfa.kalibrasyon', 'kalibrasyon.oku'] },
  'GET /olcu-aletleri/:id': { biri: ['sayfa.kalibrasyon', 'kalibrasyon.oku'] },
  'POST /olcu-aletleri': 'kalibrasyon.yaz',
  'POST /olcu-aletleri/:id/guncelle': 'kalibrasyon.yaz',
  'POST /olcu-aletleri/:id/sil': 'kalibrasyon.yaz',
  'POST /olcu-aletleri/:id/kalibrasyon-kaydet': 'kalibrasyon.yaz',
  'POST /olcu-aletleri/:id/kayitlar/:kayitId/iptal': 'kalibrasyon.yaz',
  'POST /olcu-aletleri/:id/kullanim-disi': 'kalibrasyon.yaz',
  'GET /olcu-aleti-turleri': { biri: ['sayfa.kalibrasyon', 'kalibrasyon.oku'] },
  'POST /olcu-aleti-turleri': 'kalibrasyon.yaz',
  'POST /olcu-aleti-turleri/:id/guncelle': 'kalibrasyon.yaz',
};

describe('kalibrasyon uç yetkileri (gerçek giriş, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani;
  let app: FastifyInstance;

  before(async () => {
    ortam = await testVeritabaniKur('kalibrasyon_yetki');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
  });

  after(async () => {
    await app.close();
    await ortam.kaldir();
  });

  test('her uç tablodaki işlemi ister; kimliksiz 401, başka işlem 403, doğru işlem geçer', async () => {
    const sapmalar = await uclarinYetkisiniDene({
      uygulama: app, uclar, beklenen: BEKLENEN, islemler: ['sayfa.kalibrasyon', ...KALIBRASYON_ISLEMLERI],
      cerezAl: rolluGiris({ giris: app, vt: ortam.vt, kisiOlustur: yoneticiOlustur }),
    });
    assert.deepEqual(sapmalar, []);
  });
});
