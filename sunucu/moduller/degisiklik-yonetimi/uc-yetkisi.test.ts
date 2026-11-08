// Uç envanteri ile yetki denemesi (kart 2273): her uç kimliksiz 401, tablodaki işlemle geçer, başka her işlemle 403.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { rolluGiris, uclarinYetkisiniDene } from '#cekirdek/test-yetki.ts';
import type { BeklenenYetkiler } from '#cekirdek/test-yetki.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { DEGISIKLIK_YONETIMI_ISLEMLERI } from '#paylasilan/islemler/degisiklik-yonetimi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uclar } from './uclar.ts';

// Okuma, adım işlemlerinden biriyle açılır (1122 a); her komut yalnız kendi adımının işlemini ister. Sayfa işlemi hiçbir veri ucunu açmaz.
const OKUMA: BeklenenYetkiler[string] = { biri: DEGISIKLIK_YONETIMI_ISLEMLERI };
const BEKLENEN: BeklenenYetkiler = {
  'GET /degisiklik-yonetimi/gorevlerim': OKUMA,
  'GET /degisiklik-yonetimi/talepler': OKUMA,
  'GET /degisiklik-yonetimi/talepler/:id': OKUMA,
  'GET /degisiklik-yonetimi/parca-adaylari': 'degisiklik-yonetimi.talep-ac',
  'POST /degisiklik-yonetimi/talepler/ac': 'degisiklik-yonetimi.talep-ac',
  'POST /degisiklik-yonetimi/talepler/:id/siniflandir': 'degisiklik-yonetimi.siniflandir',
  'POST /degisiklik-yonetimi/talepler/:id/etki-analizi': 'degisiklik-yonetimi.siniflandir',
  'POST /degisiklik-yonetimi/talepler/:id/ccb': 'degisiklik-yonetimi.ccb-karar',
  'POST /degisiklik-yonetimi/talepler/:id/geri-cek': 'degisiklik-yonetimi.talep-ac',
  'POST /degisiklik-yonetimi/talepler/:id/musteri-onayi': 'degisiklik-yonetimi.musteri-onayi',
  'POST /degisiklik-yonetimi/talepler/:id/emir-ac': 'degisiklik-yonetimi.emir-ac',
  'GET /degisiklik-yonetimi/emirler': OKUMA,
  'GET /degisiklik-yonetimi/emirler/:id': OKUMA,
  'POST /degisiklik-yonetimi/emirler/:id/taslak-ac': 'degisiklik-yonetimi.revizyon-hazirla',
  'POST /degisiklik-yonetimi/emirler/:id/kalem-kaydet': 'degisiklik-yonetimi.revizyon-hazirla',
  'POST /degisiklik-yonetimi/emirler/:id/yayina-gonder': 'degisiklik-yonetimi.revizyon-hazirla',
  'POST /degisiklik-yonetimi/emirler/:id/geri-gonder': 'degisiklik-yonetimi.yayinla',
  'POST /degisiklik-yonetimi/emirler/:id/yayinla': 'degisiklik-yonetimi.yayinla',
  'POST /degisiklik-yonetimi/emirler/:id/karar': 'degisiklik-yonetimi.karar-ver',
  'POST /degisiklik-yonetimi/emirler/:id/toplu-karar': 'degisiklik-yonetimi.karar-ver',
  'POST /degisiklik-yonetimi/emirler/:id/mrb-karar': 'degisiklik-yonetimi.mrb-karar',
  'POST /degisiklik-yonetimi/emirler/:id/fai-onayla': 'degisiklik-yonetimi.fai-onayla',
  'POST /degisiklik-yonetimi/emirler/:id/kapat': 'degisiklik-yonetimi.kapat',
  'GET /degisiklik-yonetimi/son-urunler': OKUMA,
  'GET /degisiklik-yonetimi/konfigurasyon/:malzemeId': OKUMA,
  'GET /degisiklik-yonetimi/seriler': OKUMA,
  'GET /degisiklik-yonetimi/izlenebilirlik': OKUMA,
  'GET /degisiklik-yonetimi/raporlar': OKUMA,
  'GET /degisiklik-yonetimi/olaylar': OKUMA,
};

describe('degisiklik-yonetimi uç yetkileri (gerçek giriş, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani;
  let app: FastifyInstance;

  before(async () => {
    ortam = await testVeritabaniKur('dy_yetki');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
  });

  after(async () => {
    await app.close();
    await ortam.kaldir();
  });

  test('her uç tablodaki işlemi ister; kimliksiz 401, başka işlem 403, doğru işlem geçer', async () => {
    const sapmalar = await uclarinYetkisiniDene({
      uygulama: app, uclar, beklenen: BEKLENEN, islemler: ['sayfa.degisiklik-yonetimi', ...DEGISIKLIK_YONETIMI_ISLEMLERI],
      cerezAl: rolluGiris({ giris: app, vt: ortam.vt, kisiOlustur: yoneticiOlustur }),
    });
    assert.deepEqual(sapmalar, []);
  });
});
