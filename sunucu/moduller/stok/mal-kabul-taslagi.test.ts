import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { MalKabulCevabi } from '#paylasilan/sozlesme/stok.ts';
import { malKabulTaslagiCevabi } from '#paylasilan/sozlesme/stok-mal-kabul-taslagi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// 3087 a, 3091 a: yarım kalan mal kabul kişinin hesabında taslak olarak durur. Yalnız sahibi görür; iki cihaz sürümle ayrılır;
// teslimde form isterse taslak aynı işlemde silinir. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
const ROL_ISLEMLERI: Record<string, string[]> = {
  depo: ['stok.giris', 'stok.transfer', 'stok.tanim', 'stok.geri-al'],
};

interface Cevap<T = unknown> { durum: number; govde: T }

describe('stok: mal kabul taslağı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  let yonetici = 0, sira = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const baslik = { cookie: cerezler.get(kim) ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: baslik, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const oku = async (kim: string) => {
    const c = await istek(kim, 'GET', '/stok/mal-kabul-taslagi');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return malKabulTaslagiCevabi.parse(c.govde).taslak;
  };
  const form = (irsaliye: string, satirlar: Record<string, unknown>[] = [{ kart: '4', miktar: '10' }]) => ({ tur: 'satin_alma', irsaliye, satirlar });
  async function kart(gkk = false): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['MKS-DNM-']);
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, gkk_gerekli)
       VALUES ($1, 'hammadde', 'MKS-DNM-', $2, 'aktif', $3, $4, $4, $5) RETURNING no`,
      [`mks-dnm-${sira}`, sira, JSON.stringify({ id: `mks-dnm-${sira}`, com: { ad: `Kabul deneme ${sira}`, birim: 'adet' } }), yonetici, gkk]))!.no;
  }
  before(async () => {
    ortam = await testVeritabaniKur('stok_mal_kabul_taslagi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const yon = (await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!.id;
    for (const [rol, islemler] of Object.entries(ROL_ISLEMLERI)) {
      const r = (await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]))!.id;
      for (const i of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r, i]);
    }
    for (const rol of ['depo', 'operator']) {
      const r = (await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]))!.id;
      await ortam.vt.tx(async (db) => {
        const k = await yoneticiOlustur(db, { ad: `Deneme ${rol}`, kullaniciAdi: rol, parola: PAROLA });
        await rolAta(db, yonetici, k, r);
        await rolAl(db, yonetici, k, yon);
      });
      const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: rol, parola: PAROLA } });
      assert.equal(g.statusCode, 200);
      cerezler.set(rol, String(g.headers['set-cookie']).split(';')[0] ?? '');
    }
    const depoRol = (await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'depo'"))!.id;
    await ortam.vt.tx(async (db) => {
      const k = await yoneticiOlustur(db, { ad: 'Deneme ikinci depocu', kullaniciAdi: 'depo2', parola: PAROLA });
      await rolAta(db, yonetici, k, depoRol);
      await rolAl(db, yonetici, k, yon);
    });
    const g2 = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'depo2', parola: PAROLA } });
    assert.equal(g2.statusCode, 200);
    cerezler.set('depo2', String(g2.headers['set-cookie']).split(';')[0] ?? '');
  });
  after(async () => { await ortam?.kaldir(); });

  test('yetki: oturumsuz 401, mal kabul yapamayan 403; taslağı olmayana null', async () => {
    assert.equal((await istek('oturumsuz', 'GET', '/stok/mal-kabul-taslagi')).durum, 401);
    assert.equal((await istek('operator', 'GET', '/stok/mal-kabul-taslagi')).durum, 403);
    assert.equal((await istek('operator', 'POST', '/stok/mal-kabul-taslagi/kaydet', { govde: form('ORN-IRS-1'), surum: null })).durum, 403);
    assert.equal(await oku('depo'), null);
  });

  test('kaydet, oku, sürümle güncelle; başka kişi görmez; eski sürüm ve ikinci ilk yazma çakışır', async () => {
    const ilk = await istek<{ surum: number }>('depo', 'POST', '/stok/mal-kabul-taslagi/kaydet', { govde: form('ORN-IRS-1'), surum: null });
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    assert.equal(ilk.govde.surum, 1);
    const t = await oku('depo');
    assert.deepEqual(t?.govde, form('ORN-IRS-1'));
    assert.equal(await oku('depo2'), null);
    const iki = await istek<{ surum: number }>('depo', 'POST', '/stok/mal-kabul-taslagi/kaydet', { govde: form('ORN-IRS-2'), surum: 1 });
    assert.equal(iki.govde.surum, 2);
    const eski = await istek<{ kod: string }>('depo', 'POST', '/stok/mal-kabul-taslagi/kaydet', { govde: form('ORN-IRS-3'), surum: 1 });
    assert.equal(eski.durum, 409);
    assert.equal(eski.govde.kod, 'CAKISMA');
    assert.equal((await istek('depo', 'POST', '/stok/mal-kabul-taslagi/kaydet', { govde: form('ORN-IRS-3'), surum: null })).durum, 409);
    assert.equal((await oku('depo'))?.govde.irsaliye, 'ORN-IRS-2');
  });

  test('sil: eski sürümle silinmez, doğru sürümle silinir; taslak yoksa sessiz', async () => {
    const t = (await oku('depo'))!;
    assert.equal((await istek('depo', 'POST', '/stok/mal-kabul-taslagi/sil', { surum: t.surum - 1 })).durum, 409);
    const sil = await istek<{ silindi: boolean }>('depo', 'POST', '/stok/mal-kabul-taslagi/sil', { surum: t.surum });
    assert.deepEqual(sil.govde, { silindi: true });
    assert.equal(await oku('depo'), null);
    assert.deepEqual((await istek('depo', 'POST', '/stok/mal-kabul-taslagi/sil', { surum: null })).govde, { silindi: false });
  });

  test('sınır: 50 satırdan çok ya da büyük taslak reddedilir', async () => {
    const cok = Array.from({ length: 51 }, () => ({ kart: '4' }));
    assert.equal((await istek('depo', 'POST', '/stok/mal-kabul-taslagi/kaydet', { govde: form('ORN-IRS-4', cok), surum: null })).durum, 400);
    const buyuk = [{ not: 'x'.repeat(300 * 1024) }];
    assert.equal((await istek('depo', 'POST', '/stok/mal-kabul-taslagi/kaydet', { govde: form('ORN-IRS-4', buyuk), surum: null })).durum, 400);
    assert.equal(await oku('depo'), null);
  });

  test('teslim: taslakSil ile taslak aynı işlemde silinir; alan yoksa kalır; başkasının taslağına dokunulmaz', async () => {
    const k = await kart();
    for (const kim of ['depo', 'depo2']) {
      assert.equal((await istek(kim, 'POST', '/stok/mal-kabul-taslagi/kaydet', { govde: form('ORN-IRS-5'), surum: null })).durum, 200);
    }
    const bagsiz = await istek<MalKabulCevabi>('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', irsaliyeNo: 'ORN-IRS-6', satirlar: [{ malzemeId: k, miktar: '1' }] });
    assert.equal(bagsiz.durum, 200, JSON.stringify(bagsiz.govde));
    assert.notEqual(await oku('depo'), null);
    const silen = await istek<MalKabulCevabi>('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', irsaliyeNo: 'ORN-IRS-5', taslakSil: true, satirlar: [{ malzemeId: k, miktar: '1' }] });
    assert.equal(silen.durum, 200, JSON.stringify(silen.govde));
    assert.equal(await oku('depo'), null);
    assert.notEqual(await oku('depo2'), null);
  });

  test('3142: irsaliye tarihi belgeye yazılır, düzeltmede korunur, taslakta durur; geçersiz tarih reddedilir, verilmezse boştur', async () => {
    const k = await kart();
    const yeni = await istek<MalKabulCevabi>('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', irsaliyeNo: 'ORN-IRS-T1', irsaliyeTarihi: '2026-11-10', satirlar: [{ malzemeId: k, miktar: '2' }] });
    assert.equal(yeni.durum, 200, JSON.stringify(yeni.govde));
    assert.equal(yeni.govde.belge.irsaliyeTarihi, '2026-11-10');
    const duz = await istek<MalKabulCevabi>('depo', 'POST', `/stok/mal-kabuller/${yeni.govde.belge.id}/duzelt`, { satirlar: [{ malzemeId: k, miktar: '1' }] });
    assert.equal(duz.durum, 200, JSON.stringify(duz.govde));
    assert.equal(duz.govde.belge.irsaliyeTarihi, '2026-11-10');
    assert.equal((await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', irsaliyeTarihi: '2026-02-30', satirlar: [{ malzemeId: k, miktar: '1' }] })).durum, 400);
    const bos = await istek<MalKabulCevabi>('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId: k, miktar: '1' }] });
    assert.equal(bos.govde.belge.irsaliyeTarihi, null);
    const t = await oku('depo');
    assert.equal((await istek('depo', 'POST', '/stok/mal-kabul-taslagi/kaydet', { govde: { ...form('ORN-IRS-T2'), irsaliyeTarihi: '2026-11-11' }, surum: t?.surum ?? null })).durum, 200);
    assert.equal((await oku('depo'))?.govde.irsaliyeTarihi, '2026-11-11');
  });

  test('kaydet deftere gövdesiz girer', async () => {
    const gizli = 'ORN-GOVDE-DEFTERE-GIRMEZ';
    const t = await oku('depo');
    assert.equal((await istek('depo', 'POST', '/stok/mal-kabul-taslagi/kaydet', { govde: form(gizli), surum: t?.surum ?? null })).durum, 200);
    const satirlar = await o().sahip.sorgu<{ metin: string }>(
      "SELECT row_to_json(d)::text AS metin FROM denetim_kaydi d WHERE yol LIKE '%/mal-kabul-taslagi/kaydet' ORDER BY id DESC LIMIT 1",
    );
    assert.equal(satirlar.length, 1);
    assert.equal(satirlar[0]?.metin.includes(gizli), false);
    assert.equal((await istek('depo', 'POST', '/stok/mal-kabul-taslagi/sil', { surum: null })).durum, 200);
  });

  test('şemaya artık uymayan saklı taslak okunmaz', async () => {
    const k = (await o().sahip.tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'depo2'"))!.id;
    await o().sahip.sorgu(
      `INSERT INTO stok_mal_kabul_taslagi (kisi_id, govde) VALUES ($1, '{"tur":"yok"}') ON CONFLICT (kisi_id) DO UPDATE SET govde = EXCLUDED.govde`, [k]);
    assert.equal(await oku('depo2'), null);
  });

  test('teslim reddedilirse taslak kalır', async () => {
    assert.equal((await istek('depo', 'POST', '/stok/mal-kabul-taslagi/kaydet', { govde: form('ORN-IRS-7'), surum: null })).durum, 200);
    const red = await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', taslakSil: true, satirlar: [{ malzemeId: 2147483000, miktar: '1' }] });
    assert.notEqual(red.durum, 200);
    assert.notEqual(await oku('depo'), null);
  });
});
