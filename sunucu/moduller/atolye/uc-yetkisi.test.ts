// Uç envanteri ile yetki denemesi (kart 2273): her uç kimliksiz 401, tablodaki işlemle geçer, başka her işlemle 403.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { rolluGiris, uclarinYetkisiniDene } from '#cekirdek/test-yetki.ts';
import type { BeklenenYetkiler } from '#cekirdek/test-yetki.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ATOLYE_ISLEMLERI } from '#paylasilan/islemler/atolye.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uclar } from './uclar.ts';

// Okuma uçları sayfa.atolye ya da atolye.yaz ile, çizim merkezi listeleri ve bütün yazma uçları yalnız atolye.yaz ile açılır.
const BEKLENEN: BeklenenYetkiler = {
  'GET /atolye/salonlar': { biri: ['sayfa.atolye', 'atolye.yaz'] },
  'GET /atolye/salonlar/:id': { biri: ['sayfa.atolye', 'atolye.yaz'] },
  'GET /atolye/istasyonlar/:id/merkez-modeli': { biri: ['sayfa.atolye', 'atolye.yaz'] },
  'GET /atolye/malzeme-modelleri': { biri: ['sayfa.atolye', 'atolye.yaz'] },
  'GET /atolye/malzemeler/:no/merkez-modeli': { biri: ['sayfa.atolye', 'atolye.yaz'] },
  'GET /atolye/salonlar/:id/rota': { biri: ['sayfa.atolye', 'atolye.yaz'] },
  'GET /atolye/arama': { biri: ['sayfa.atolye', 'atolye.yaz'] },
  'GET /atolye/raflar/:id/gozler': { biri: ['sayfa.atolye', 'atolye.yaz'] },
  'GET /atolye/modeller': { biri: ['sayfa.atolye', 'atolye.yaz'] },
  'GET /atolye/modeller/:id/parcalar/:sira': { biri: ['sayfa.atolye', 'atolye.yaz'] },
  'GET /atolye/fabrika': { biri: ['sayfa.atolye', 'atolye.yaz'] },
  'GET /atolye/kroki-ayari': { biri: ['sayfa.atolye', 'atolye.yaz'] },
  'GET /atolye/fabrika/kroki': { biri: ['sayfa.atolye', 'atolye.yaz'] },
  'GET /atolye/fabrika/kroki/parcalar/:sira': { biri: ['sayfa.atolye', 'atolye.yaz'] },
  'GET /atolye/salonlar/:id/kroki': { biri: ['sayfa.atolye', 'atolye.yaz'] },
  'GET /atolye/salonlar/:id/kroki/parcalar/:sira': { biri: ['sayfa.atolye', 'atolye.yaz'] },
  'GET /atolye/goz-kalemleri': { biri: ['sayfa.atolye', 'atolye.yaz'] },
  'GET /atolye/kalem-gorunumleri': { biri: ['sayfa.atolye', 'atolye.yaz'] },
  'POST /atolye/salonlar': 'atolye.yaz',
  'POST /atolye/salonlar/:id/yerlesim-kaydet': 'atolye.yaz',
  'POST /atolye/salonlar/:id/hucre-ata': 'atolye.yaz',
  'POST /atolye/fabrika/kaydet': 'atolye.yaz',
  'POST /atolye/fabrika/kroki': 'atolye.yaz',
  'POST /atolye/fabrika/kroki/parca-yaz': 'atolye.yaz',
  'POST /atolye/fabrika/kroki/tamamla': 'atolye.yaz',
  'POST /atolye/kroki-ayari/degistir': 'atolye.yaz',
  'POST /atolye/fabrika/kroki/hizala': 'atolye.yaz',
  'POST /atolye/fabrika/kroki/sil': 'atolye.yaz',
  'POST /atolye/salonlar/:id/kroki': 'atolye.yaz',
  'POST /atolye/salonlar/:id/kroki/parca-yaz': 'atolye.yaz',
  'POST /atolye/salonlar/:id/kroki/tamamla': 'atolye.yaz',
  'POST /atolye/salonlar/:id/kroki/hizala': 'atolye.yaz',
  'POST /atolye/salonlar/:id/kroki/sil': 'atolye.yaz',
  'GET /atolye/cizim-merkezi/krokiler': 'atolye.yaz',
  'GET /atolye/yerlesmemis-istasyonlar': { biri: ['sayfa.atolye', 'atolye.yaz'] },
  'GET /atolye/cizim-merkezi/modeller': 'atolye.yaz',
  'POST /atolye/istasyonlar/:id/merkez-modeli-bagla': 'atolye.yaz',
  'POST /atolye/salonlar/:id/kroki/merkezden': 'atolye.yaz',
  'POST /atolye/modeller': 'atolye.yaz',
  'POST /atolye/modeller/:id/parca-yaz': 'atolye.yaz',
  'POST /atolye/modeller/:id/tamamla': 'atolye.yaz',
  'POST /atolye/modeller/:id/ayarla': 'atolye.yaz',
  'POST /atolye/modeller/:id/sil': 'atolye.yaz',
  'POST /atolye/kalem-gorunumleri/yaz': 'atolye.yaz',
  'POST /atolye/goz-kalemleri/yaz': 'atolye.yaz',
  'POST /atolye/goz-kalemleri/sil': 'atolye.yaz',
  'POST /atolye/kalem-gorunumleri/sil': 'atolye.yaz',
};

describe('atolye uç yetkileri (gerçek giriş, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani;
  let app: FastifyInstance;

  before(async () => {
    ortam = await testVeritabaniKur('atolye_yetki');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
  });

  after(async () => {
    await app.close();
    await ortam.kaldir();
  });

  test('her uç tablodaki işlemi ister; kimliksiz 401, başka işlem 403, doğru işlem geçer', async () => {
    const sapmalar = await uclarinYetkisiniDene({
      uygulama: app, uclar, beklenen: BEKLENEN, islemler: ['sayfa.atolye', ...ATOLYE_ISLEMLERI],
      cerezAl: rolluGiris({ giris: app, vt: ortam.vt, kisiOlustur: yoneticiOlustur }),
    });
    assert.deepEqual(sapmalar, []);
  });
});
