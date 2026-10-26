import type { Db } from '#cekirdek/db.ts';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { DURUM_ANAHTARI } from '../recete-rota/disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import * as sorgular from './sorgular.ts';

// Reçete ve Rota'nın ana kaydı (planın girdisi) doğrudan yazılır: sahibi modülün yazma yolu bu testin konusu değildir.
const receteRotaKaydiEkle = (db: Db, deger: unknown, kisiId: number) => db.sorgu(
  `INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, 'json', $2::jsonb, nextval('recete_rota_surum'), $3)`,
  [DURUM_ANAHTARI, JSON.stringify(deger), kisiId]);

// 542 a, 546 a, 549 a: Satın Alma'nın plan ucu. Satın alma işlemi olan okur ve yalnız beyaz listedeki alanları alır; başkası reddedilir.
// Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
const YOL = '/api/plan/planlama-calismasi/satin-alma';

describe('Satın Alma plan ucu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    return girisCerezi(kullaniciAdi);
  }
  const oku = (cerez?: string) => app.inject({ method: 'GET', url: YOL, headers: cerez ? { cookie: cerez } : {} });

  const kayit = { version: 7, savedAt: 9, items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul' }], opdefs: [], machines: [], routes: {}, orders: [] };
  const calisma = {
    surum: 2, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], w: { mat: 'uyari' }, param: {},
    plan: { dataVer: 1, ops: { 'E-1.10': { id: 'E-1.10', job: 'E-1', m: 'T9', S: 8, C: 10, done: 0 } }, J: { 'E-1': { C: 10, T: 0, kar: 5 } } },
    D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [],
      siparisler: [], ayarlar: { mesaiUcret: 300 } },
  };
  async function calismaYaz(deger: unknown): Promise<void> {
    await vt().tx(async (db) => {
      await db.sorgu('DELETE FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI]);
      await sorgular.planlamaKaydiEkle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger, kisiId: yoneticiId });
    });
  }

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_satin_alma_plan');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await ortam.vt.tx((db) => receteRotaKaydiEkle(db, kayit, yoneticiId));
  });
  after(async () => { await ortam?.kaldir(); });

  test('SAP-01: satın alma işlemi olan okur; giden çalışmada maliyet, tezgâh ve ayar yoktur, iş ve saatleri vardır', async () => {
    await calismaYaz(calisma);
    const cerez = await islemliKisi('satinalmaci', ['satin-alma.oku']);
    const cevap = await oku(cerez);
    assert.equal(cevap.statusCode, 200, cevap.body);
    const c = (cevap.json() as PlanlamaCalismasiCevabi).calisma as Record<string, unknown>;
    assert.deepEqual(c['plan'], { dataVer: 1, ops: { 'E-1.10': { id: 'E-1.10', job: 'E-1', S: 8, C: 10, done: 0 } }, J: { 'E-1': { C: 10 } } });
    const metin = JSON.stringify(c);
    for (const yasak of ['"kar"', 'T9', 'mesaiUcret', 'ayarlar', 'Ornek', '"w"', 'locks']) assert.ok(!metin.includes(yasak), `${yasak} gitmemeli`);
    assert.equal((await oku(await islemliKisi('satinalmaci2', ['satin-alma.yaz']))).statusCode, 200);
  });

  test('SAP-02: satın alma ve planlama okuma işlemi olmayan 403, oturumsuz 401 alır', async () => {
    await calismaYaz(calisma);
    assert.equal((await oku(await islemliKisi('yazar', ['recete-rota.yaz', 'stok.giris']))).statusCode, 403);
    assert.equal((await oku()).statusCode, 401);
  });

  test('SAP-03: çalışma kaydı yoksa çalışma null döner', async () => {
    await vt().sorgu('DELETE FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI]);
    const cerez = await islemliKisi('satinalmaci3', ['satin-alma.oku']);
    assert.deepEqual((await oku(cerez)).json(), { calisma: null, surum: null });
  });
});
