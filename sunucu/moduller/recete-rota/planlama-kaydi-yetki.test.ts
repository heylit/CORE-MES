import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { DURUM_ANAHTARI, PLANLAMA_ANAHTARI } from './disari.ts';
import * as sorgular from './sorgular.ts';

// 287 a: planlama çalışmasının kaydı (`:planlama`) yalnız plan.yaz taşıyana yazılır ve silinir; öteki anahtarlar recete-rota.yaz ile kalır.
// Müdür rolü 524/3 b ile plan.yaz da taşır; planlamayı okuyup plan.yaz taşımayan rol çalışmayı değiştiremez. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('planlama çalışması kaydının yazma yetkisi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let planci = '';
  let yalnizYazar = '';
  let mudurBenzeri = '';
  let mudur = '';
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  // Kişi yönetici rolüyle doğar; verilen rol atanır, öteki roller alınır.
  async function rolluKisi(kullaniciAdi: string, rolId: number): Promise<string> {
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rolId);
      for (const r of kisi.roller) if (r.id !== rolId) await rolAl(db, yoneticiId, yeni, r.id);
    });
    return girisCerezi(kullaniciAdi);
  }
  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    return rolluKisi(kullaniciAdi, rol?.id ?? 0);
  }
  const istek = (cerez: string, url: string, payload: object) => app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: cerez }, payload });
  const yaz = (cerez: string, anahtar: string, deger: unknown, beklenenSurum: number | null) =>
    istek(cerez, '/recete-rota/kayitlar/yaz', { anahtar, bicim: 'json', deger, beklenenSurum });
  const sil = (cerez: string, anahtar: string, beklenenSurum: number) => istek(cerez, '/recete-rota/kayitlar/sil', { anahtar, beklenenSurum });
  const kayit = (anahtar: string) => vt().tx((db) => sorgular.kayitGetir(db, anahtar));
  async function calismaKur(deger: unknown): Promise<number> {
    await vt().sorgu('DELETE FROM recete_rota_kayit WHERE anahtar = $1', [PLANLAMA_ANAHTARI]);
    const k = await vt().tx((db) => sorgular.kayitEkle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger, kisiId: yoneticiId }));
    return k?.surum ?? -1;
  }

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_planlama_yetki');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    planci = await islemliKisi('planci', ['recete-rota.yaz', 'plan.yaz']);
    yalnizYazar = await islemliKisi('yazar', ['recete-rota.yaz']);
    mudurBenzeri = await islemliKisi('mudur_benzeri', ['recete-rota.planlama-oku', 'recete-rota.yaz']);
    const mudurRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'mudur'");
    assert.ok(mudurRolu, 'müdür rolü göçlerde yok');
    mudur = await rolluKisi('mudur_kisi', mudurRolu.id);
  });
  after(async () => { await ortam?.kaldir(); });

  test('PY-01: plan.yaz ve recete-rota.yaz taşıyan çalışmayı yazar ve siler', async () => {
    const surum = await calismaKur({ surum: 2, v: 1 });
    const yazma = await yaz(planci, PLANLAMA_ANAHTARI, { surum: 2, v: 2 }, surum);
    assert.equal(yazma.statusCode, 200, yazma.body);
    const yeni = (yazma.json() as { kayit: { surum: number } }).kayit.surum;
    assert.deepEqual((await kayit(PLANLAMA_ANAHTARI))?.deger, { surum: 2, v: 2 });
    const silme = await sil(planci, PLANLAMA_ANAHTARI, yeni);
    assert.equal(silme.statusCode, 200, silme.body);
    assert.equal(await kayit(PLANLAMA_ANAHTARI), null);
  });

  test('PY-02: plan.yaz taşımayan (yalnız recete-rota.yaz) çalışmayı yazamaz ve silemez: 403, kayıt değişmez', async () => {
    const surum = await calismaKur({ surum: 2, v: 1 });
    const yazma = await yaz(yalnizYazar, PLANLAMA_ANAHTARI, { surum: 2, v: 9 }, surum);
    assert.equal(yazma.statusCode, 403, yazma.body);
    assert.equal((yazma.json() as { kod: string }).kod, 'YETKI_YOK');
    assert.equal((await sil(yalnizYazar, PLANLAMA_ANAHTARI, surum)).statusCode, 403);
    const k = await kayit(PLANLAMA_ANAHTARI);
    assert.equal(k?.surum, surum);
    assert.deepEqual(k?.deger, { surum: 2, v: 1 });
  });

  test('PY-03: kayıt yokken de ilk yazma plan.yaz ister; metin biçimi de aynı denetimden geçer', async () => {
    await vt().sorgu('DELETE FROM recete_rota_kayit WHERE anahtar = $1', [PLANLAMA_ANAHTARI]);
    assert.equal((await yaz(yalnizYazar, PLANLAMA_ANAHTARI, { surum: 2 }, null)).statusCode, 403);
    const metin = await istek(yalnizYazar, '/recete-rota/kayitlar/yaz', { anahtar: PLANLAMA_ANAHTARI, bicim: 'metin', deger: '{"surum":2}', beklenenSurum: null });
    assert.equal(metin.statusCode, 403);
    assert.equal(await kayit(PLANLAMA_ANAHTARI), null);
  });

  test('PY-04: plan.yaz taşımayan müdür benzeri rol reddedilir: planlamayı okuyup recete-rota.yaz taşısa da', async () => {
    const surum = await calismaKur({ surum: 2, v: 1 });
    assert.equal((await yaz(mudurBenzeri, PLANLAMA_ANAHTARI, { surum: 2, v: 5 }, surum)).statusCode, 403);
    assert.equal((await sil(mudurBenzeri, PLANLAMA_ANAHTARI, surum)).statusCode, 403);
    assert.deepEqual((await kayit(PLANLAMA_ANAHTARI))?.deger, { surum: 2, v: 1 });
    // recete-rota.yaz taşıdığı için ret yalnız bu denetimden gelir: ana kayda yazabilir.
    const ana = await yaz(mudurBenzeri, `${DURUM_ANAHTARI}:mudur-deneme`, { v: 1 }, null);
    assert.equal(ana.statusCode, 200, ana.body);
  });

  test('PY-04b: göçteki müdür rolü plan.yaz taşır (524/3 b): çalışmayı yazar ve siler', async () => {
    const surum = await calismaKur({ surum: 2, v: 1 });
    const yazma = await yaz(mudur, PLANLAMA_ANAHTARI, { surum: 2, v: 6 }, surum);
    assert.equal(yazma.statusCode, 200, yazma.body);
    assert.deepEqual((await kayit(PLANLAMA_ANAHTARI))?.deger, { surum: 2, v: 6 });
    const yeni = (yazma.json() as { kayit: { surum: number } }).kayit.surum;
    assert.equal((await sil(mudur, PLANLAMA_ANAHTARI, yeni)).statusCode, 200);
    assert.equal(await kayit(PLANLAMA_ANAHTARI), null);
  });

  test('PY-05: öteki anahtarlar plan.yaz istemez (ana kayıt, alt anahtar ve planlama önekli cihaz anahtarı)', async () => {
    for (const anahtar of [DURUM_ANAHTARI, `${DURUM_ANAHTARI}:studio`, `${PLANLAMA_ANAHTARI}-ui4`]) {
      const yazma = await yaz(yalnizYazar, anahtar, { v: 1 }, null);
      assert.equal(yazma.statusCode, 200, `${anahtar}: ${yazma.body}`);
      const surum = (yazma.json() as { kayit: { surum: number } }).kayit.surum;
      assert.equal((await sil(yalnizYazar, anahtar, surum)).statusCode, 200);
    }
  });
});
