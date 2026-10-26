import type { Db } from '#cekirdek/db.ts';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { DURUM_ANAHTARI } from '../recete-rota/disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import * as sorgular from './sorgular.ts';

// Reçete ve Rota'nın ana kaydı (planın girdisi) doğrudan yazılır: sahibi modülün yazma yolu bu testin konusu değildir.
const receteRotaKaydiEkle = (db: Db, deger: unknown, kisiId: number) => db.sorgu(
  `INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, 'json', $2::jsonb, nextval('recete_rota_surum'), $3)`,
  [DURUM_ANAHTARI, JSON.stringify(deger), kisiId]);

// 599: çalışma jsonb'de durur, jsonb nesne anahtarlarını kendi sırasına dizer. Birleşmiş çalışma olduğu gibi geri yazılıp okununca veri
// sürümü artmamalı (plan bayatlamaz); gerçek veri değişikliği yine artırır. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('planlama çalışması: yazıp okumada veri sürümü (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let cerez = '';
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  const kayit = (ad: string, savedAt: number) => ({
    version: 7, savedAt, items: [{ id: '50', code: 'MM-1', name: ad, type: 'mamul' }], opdefs: [], machines: [], routes: {}, orders: [],
  });
  const calisma = {
    surum: 2, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
    w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
    D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [],
      personel: [], siparisler: [], ayarlar: {} },
  };
  const oku = async (): Promise<PlanlamaCalismasiCevabi> => {
    const c = await app.inject({ method: 'GET', url: '/api/plan/planlama-calismasi', headers: { cookie: cerez } });
    assert.equal(c.statusCode, 200, c.body);
    return c.json() as PlanlamaCalismasiCevabi;
  };
  // Sayfanın yaptığı gibi: birleşmiş çalışma kayıt yazma ucundan, sürüm denetimiyle geri yazılır.
  const geriYaz = async (c: PlanlamaCalismasiCevabi): Promise<void> => {
    const y = await app.inject({ method: 'POST', url: '/api/plan/planlama-kayitlari/yaz', headers: { cookie: cerez },
      payload: { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: c.calisma, beklenenSurum: c.surum } });
    assert.equal(y.statusCode, 200, y.body);
  };
  const kayitYaz = (deger: unknown) => vt().tx(async (db) => {
    await db.sorgu('DELETE FROM recete_rota_kayit WHERE anahtar = $1', [DURUM_ANAHTARI]);
    await receteRotaKaydiEkle(db, deger, yoneticiId);
  });

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_girdi_esitlik');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    assert.equal(giris.statusCode, 200);
    cerez = String(giris.headers['set-cookie']).split(';')[0] ?? '';
    // Çalışma günleri nesnesi kaynak okumasından gelir; jsonb onun anahtarlarını yeniden dizer.
    const s = ortam.sahip;
    const merkez = (await s.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('GE-IM', 'Deneme merkezi') RETURNING id"))!.id;
    const vardiya = (await s.tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis, aktif) VALUES ('Gunduz', '08:00', '16:00', true) RETURNING id"))!.id;
    await s.sorgu('INSERT INTO vardiya_matrisi (is_merkezi_id, gun, vardiya_id) VALUES ($1, 1, $2), ($1, 3, $2), ($1, 7, $2)', [merkez, vardiya]);
    await kayitYaz(kayit('Ornek mil', 9));
    await ortam.vt.tx((db) => sorgular.planlamaKaydiEkle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: calisma, kisiId: yoneticiId }));
  });
  after(async () => { await ortam?.kaldir(); });

  test('GE-01: birleşmiş çalışma değişmeden geri yazılıp okununca veri sürümü artmaz, çalışma aynı kalır', async () => {
    const ilk = await oku();
    assert.notEqual(ilk.calisma, null);
    let onceki = ilk;
    for (let tur = 1; tur <= 3; tur++) {
      await geriYaz(onceki);
      const sonra = await oku();
      assert.equal(sonra.calisma?.['dataVer'], ilk.calisma?.['dataVer'], `tur ${tur}`);
      assert.deepEqual(sonra.calisma, ilk.calisma);
      onceki = sonra;
    }
  });

  test('GE-02: gerçek veri değişikliği (Reçete ve Rota kaydı) veri sürümünü yine artırır', async () => {
    const once = await oku();
    await geriYaz(once);
    await kayitYaz(kayit('Ornek mil yeni ad', 10));
    const sonra = await oku();
    // Kayıt çevirisi ve kaynak birleşmesi ayrı ayrı sayar (PC-01); burada yalnız artışı aranır.
    assert.ok(Number(sonra.calisma?.['dataVer']) > Number(once.calisma?.['dataVer']));
    assert.notDeepEqual(sonra.calisma?.['D'], once.calisma?.['D']);
  });
});
