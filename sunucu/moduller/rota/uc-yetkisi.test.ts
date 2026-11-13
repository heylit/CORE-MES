// Rota okuma uçlarının yetki tablosu (2490 b): her okuma ucu kimliksiz 401, tablodaki işlemlerden biriyle geçer, başka her işlemle 403.
// Tablo bugünkü çağıranları taşır: Reçete ve Rota sayfası ile rota işlemleri; yeni kart sihirbazı (malzemeler.yaz), operasyon tipleri
// (sayfa.istasyonlar) ve markalama tanımları (sayfa.markalama) yalnız kendi okudukları uçta. Uç ya da işlem değişirse kırmızıya döner.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { rolluGiris, uclarinYetkisiniDene } from '#cekirdek/test-yetki.ts';
import type { BeklenenYetkiler } from '#cekirdek/test-yetki.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ROTA_ISLEMLERI } from '#paylasilan/islemler/rota.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uclar } from './uclar.ts';

// Bölünmüş eski rota.yaz (3165 a) hiçbir ucu açmaz; tablo dışı her işlem gibi 403 alır.
const OKUR = ['sayfa.recete-rota', 'recete-rota.oku', ...ROTA_ISLEMLERI.filter((i) => i !== 'rota.yaz')] as const;
const ROTA_OKUR = { biri: OKUR } as const;

const BEKLENEN: BeklenenYetkiler = {
  'GET /rota/sablonlar': { biri: [...OKUR, 'malzemeler.yaz'] },
  'GET /rota/urunler': { biri: [...OKUR, 'malzemeler.yaz'] },
  'GET /rota/secenekler': { biri: [...OKUR, 'sayfa.istasyonlar'] },
  'GET /rota/malzeme-ara': { biri: [...OKUR, 'sayfa.markalama'] },
  'GET /rota/malzeme-kullanimi': ROTA_OKUR,
  'GET /rota/revizyon-ozeti': ROTA_OKUR,
  'GET /rota/urunler/:urunId': ROTA_OKUR,
  'GET /rota/urunler/:urunId/ham-onerisi': ROTA_OKUR,
  'GET /rota/urunler/:urunId/op-numaralari': ROTA_OKUR,
  'GET /rota/urunler/:urunId/talimatlar/:opNo': ROTA_OKUR,
  'GET /rota/talimat-medyasi/:ozet': ROTA_OKUR,
  'GET /rota/talimat-sablonlari': ROTA_OKUR,
  'GET /rota/talimat-sablonlari/:id': ROTA_OKUR,
  'GET /rota/talimat-sablonlari/:id/kopyalar': ROTA_OKUR,
  'GET /rota/revizyonlar/:id': ROTA_OKUR,
  'GET /rota/revizyonlar/:id/sureler': ROTA_OKUR,
  'GET /rota/revizyonlar/:id/fark': ROTA_OKUR,
  'GET /rota/revizyonlar/:id/agac': ROTA_OKUR,
  'GET /rota/revizyon-kunyeleri': ROTA_OKUR,
  'GET /rota/sartnameler': ROTA_OKUR,
  'GET /rota/sartnameler/:id': ROTA_OKUR,
  'GET /rota/revizyonlar/:id/sartnameler': ROTA_OKUR,
  'GET /rota/is-emri-sartnameleri': ROTA_OKUR,
  'GET /rota/olcu-aleti-turleri': ROTA_OKUR,
  'GET /rota/patlatmalar/:id': 'rota.emre-kopyala',
  'GET /rota/revizyonlar/:id/patlatma-onizleme': 'rota.emre-kopyala',
  'GET /rota/urunler/:urunId/talimatlar/:opNo/sahneler': ROTA_OKUR,
};

describe('rota okuma uçlarının yetkisi (gerçek giriş, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani;
  let app: FastifyInstance;

  before(async () => {
    ortam = await testVeritabaniKur('rota_yetki');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
  });

  after(async () => {
    await app.close();
    await ortam.kaldir();
  });

  test('her okuma ucu tablodaki işlemi ister; kimliksiz 401, başka işlem 403, doğru işlem geçer', async () => {
    const sapmalar = await uclarinYetkisiniDene({
      uygulama: app, uclar: uclar.filter((u) => u.yontem === 'GET'), beklenen: BEKLENEN,
      islemler: [...OKUR, 'sayfa.rota', 'sayfa.terminal', 'sayfa.arkon', 'sayfa.malzemeler'],
      cerezAl: rolluGiris({ giris: app, vt: ortam.vt, kisiOlustur: yoneticiOlustur }),
    });
    assert.deepEqual(sapmalar, []);
  });
});
