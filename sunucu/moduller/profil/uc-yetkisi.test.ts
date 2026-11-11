// Uç envanteri ile yetki denemesi (kart 2273): her uç kimliksiz 401, tablodaki işlemle geçer, başka her işlemle 403.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { rolluGiris, uclarinYetkisiniDene } from '#cekirdek/test-yetki.ts';
import type { BeklenenYetkiler } from '#cekirdek/test-yetki.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { PROFIL_ISLEMLERI } from '#paylasilan/islemler/profil.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uclar } from './uclar.ts';

// Kişinin kendi profili, teması ve geri bildirim gönderme her oturuma açıktır; Geri Bildirim Merkezi okuma, yanıt ve kategori
// ayrı işlemlerdir (2192-1 a, 2192-3 a).
const BEKLENEN: BeklenenYetkiler = {
  'GET /profil': 'oturum',
  'POST /profil/geri-bildirim-gonder': 'oturum',
  'GET /profil/geri-bildirimler': 'profil.geri-bildirim-oku',
  'GET /profil/geri-bildirimler/:id': 'profil.geri-bildirim-oku',
  'POST /profil/geri-bildirimler/:id/yanitla': 'profil.geri-bildirim-yanitla',
  'POST /profil/geri-bildirimler/:id/not-ekle': 'profil.geri-bildirim-yanitla',
  'POST /profil/geri-bildirimler/:id/takip-degistir': 'profil.geri-bildirim-yanitla',
  'GET /profil/geri-bildirim-secenekleri': 'profil.geri-bildirim-oku',
  'GET /profil/geri-bildirim-ozeti': 'profil.geri-bildirim-oku',
  'POST /profil/geri-bildirim-kategorileri': 'profil.geri-bildirim-kategori-yaz',
  'POST /profil/geri-bildirim-kategorileri/:id/guncelle': 'profil.geri-bildirim-kategori-yaz',
  'GET /profil/tema': 'oturum',
  'POST /profil/tema-sec': 'oturum',
  'GET /profil/mini-pano': 'oturum',
  'POST /profil/mini-pano-sec': 'oturum',
  'GET /profil/menu': 'oturum',
  'POST /profil/menu-sec': 'oturum',
};

describe('profil uç yetkileri (gerçek giriş, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani;
  let app: FastifyInstance;

  before(async () => {
    ortam = await testVeritabaniKur('profil_yetki');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
  });

  after(async () => {
    await app.close();
    await ortam.kaldir();
  });

  test('her uç tablodaki işlemi ister; kimliksiz 401, başka işlem 403, doğru işlem geçer', async () => {
    const sapmalar = await uclarinYetkisiniDene({
      uygulama: app, uclar, beklenen: BEKLENEN, islemler: [...PROFIL_ISLEMLERI],
      cerezAl: rolluGiris({ giris: app, vt: ortam.vt, kisiOlustur: yoneticiOlustur }),
    });
    assert.deepEqual(sapmalar, []);
  });
});
