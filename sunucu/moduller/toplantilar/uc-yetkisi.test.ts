// Uç envanteri ile yetki denemesi (kart 2273): her uç kimliksiz 401, tablodaki işlemle geçer, başka her işlemle 403.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { rolluGiris, uclarinYetkisiniDene } from '#cekirdek/test-yetki.ts';
import type { BeklenenYetkiler } from '#cekirdek/test-yetki.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { TOPLANTILAR_ISLEMLERI } from '#paylasilan/islemler/toplantilar.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uclar } from './uclar.ts';

// 3448-2 a: okuma oturumla (kişinin kendi toplantısı, süzme serviste); bütün yazma uçları toplantilar.yaz.
const BEKLENEN: BeklenenYetkiler = {
  'GET /toplantilar': 'oturum',
  'GET /toplantilar/:id': 'oturum',
  'GET /toplantilar/konu-ara': 'toplantilar.yaz',
  'POST /toplantilar': 'toplantilar.yaz',
  'PUT /toplantilar/:id': 'toplantilar.yaz',
  'POST /toplantilar/:id/iptal': 'toplantilar.yaz',
  'POST /toplantilar/:id/yapildi': 'toplantilar.yaz',
  'POST /toplantilar/:id/kararlar': 'toplantilar.yaz',
  'POST /toplantilar/:id/aksiyonlar': 'toplantilar.yaz',
  'POST /toplantilar/:id/aksiyonlar/:aksiyonId/durum': 'toplantilar.yaz',
  'POST /toplantilar/:id/aksiyonlar/:aksiyonId/gorev': 'toplantilar.yaz',
};

describe('toplantılar uç yetkileri (gerçek giriş, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani;
  let app: FastifyInstance;

  before(async () => {
    ortam = await testVeritabaniKur('toplantilar_yetki');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
  });

  after(async () => {
    await app.close();
    await ortam.kaldir();
  });

  test('her uç tablodaki işlemi ister; kimliksiz 401, başka işlem 403, doğru işlem geçer', async () => {
    const sapmalar = await uclarinYetkisiniDene({
      uygulama: app, uclar, beklenen: BEKLENEN, islemler: ['sayfa.toplantilar', ...TOPLANTILAR_ISLEMLERI],
      cerezAl: rolluGiris({ giris: app, vt: ortam.vt, kisiOlustur: yoneticiOlustur }),
    });
    assert.deepEqual(sapmalar, []);
  });
});
