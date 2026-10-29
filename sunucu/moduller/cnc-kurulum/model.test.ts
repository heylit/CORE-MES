import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { CncModel } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { kaydaBagla, kaydaBagliBelgeler } from '../cizimler/disari.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { modelBelgesiSec } from './kurallar.ts';

// 3B model bağı (1212 a). Kişi, istasyon, makine, aparat ve belge adları uydurmadır; dosyalar yalnız imza taşır.
const PAROLA = 'dogru-parola-1';

describe('model seçimi (saf)', () => {
  test('MD-01: yalnız yayındaki 3B model (GLB, glTF, STEP, IGES, STL) sayılır; birden çoksa en eski; çizim ve taslak sayılmaz', () => {
    const b = (id: number, tur: string, dosyaTuru: string | null, harf: string | null = 'A') => ({ id, ad: `B${id}`, tur, harf, ozet: harf === null ? null : 'o', dosyaTuru });
    assert.equal(modelBelgesiSec([]), null);
    assert.equal(modelBelgesiSec([b(1, 'teknik-resim', 'pdf'), b(2, '3b-model', 'glb', null), b(3, 'makine', 'glb'), b(4, '3b-model', 'pdf')]), null);
    assert.equal(modelBelgesiSec([b(9, '3b-model', 'glb'), b(7, '3b-model', 'step'), b(8, '3b-model', 'stl')])?.belgeId, 7);
  });
});

describe('cnc-kurulum 3B model bağı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let yonetici = '';
  let yazar = '';
  let okur = '';
  let yetkisiz = '';
  let freze = 0;
  let kalite = 0;
  let pasif = 0;
  let glbBelge = 0;
  let stepBelge = 0;
  let cizim = 0;
  let taslak = 0;
  const GLB = Buffer.concat([Buffer.from('glTF'), Buffer.from([2, 0, 0, 0, 12, 0, 0, 0])]);
  const STEP = Buffer.from('ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n');

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

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

  const istek = (cerez: string | null, yontem: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method: yontem, url: `/api${url}`, headers: cerez === null ? {} : { cookie: cerez }, payload: payload as object | undefined });
  const bagla = (cerez: string, govde: unknown) => istek(cerez, 'POST', '/cnc-kurulum/modeller/bagla', govde);
  const liste = async (cerez: string): Promise<CncModel[]> => {
    const c = await istek(cerez, 'GET', '/cnc-kurulum/modeller');
    assert.equal(c.statusCode, 200, c.body);
    return (c.json() as { modeller: CncModel[] }).modeller;
  };

  // Belge Çizim Merkezi'nin kendi uçlarıyla açılır (bu test merkez tablolarına yazmaz).
  async function merkezKomutu<T>(yol: string, govde: unknown): Promise<{ durum: number; govde: T }> {
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: yonetici, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } });
    return { durum: c.statusCode, govde: c.json() as T };
  }
  async function merkezBelgesi(tur: string, icerik: Buffer, dosyaAdi: string, yayinla: boolean): Promise<number> {
    const ozet = createHash('sha256').update(icerik).digest('hex');
    assert.equal((await merkezKomutu(`/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') })).durum, 200);
    const b = await merkezKomutu<{ id: number; surum: number; revizyonlar: { id: number }[] }>('/cizimler', { ad: `Deneme ${dosyaAdi}`, tur, ozet, dosyaAdi });
    assert.equal(b.durum, 200, JSON.stringify(b.govde));
    if (yayinla) assert.equal((await merkezKomutu(`/cizimler/${b.govde.id}/revizyonlar/${b.govde.revizyonlar[0]?.id}/yayinla`, { surum: b.govde.surum })).durum, 200);
    return b.govde.id;
  }

  before(async () => {
    ortam = await testVeritabaniKur('cnc_kurulum_model');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yonetici = await girisCerezi('yonetici');
    yazar = await islemliKisi('yazar', ['cnc-kurulum.yaz']);
    okur = await islemliKisi('okur', ['cnc-kurulum.oku']);
    yetkisiz = await islemliKisi('yetkisiz', ['sayfa.ayarlar']);
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('TEMMD', 'Deneme Merkezi') RETURNING id");
    const istasyonEkle = async (kod: string, tip: string): Promise<number> =>
      (await ortam!.sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, tip) VALUES ($1, $1, $2, $3) RETURNING id', [kod, im!.id, tip]))!.id;
    const talasli = await istasyonEkle('MD-IF', 'talasli');
    const olcum = await istasyonEkle('MD-IK', 'kalite');
    const makineEkle = async (kod: string, istasyonId: number | null, aktif: boolean): Promise<number> =>
      (await ortam!.sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id, aktif) VALUES ($1, $1, $2, $3) RETURNING id', [kod, istasyonId, aktif]))!.id;
    freze = await makineEkle('MD-F01', talasli, true);
    kalite = await makineEkle('MD-K01', olcum, true);
    pasif = await makineEkle('MD-F02', talasli, false);
    glbBelge = await merkezBelgesi('3b-model', GLB, 'tezgah.glb', true);
    stepBelge = await merkezBelgesi('3b-model', STEP, 'aparat.step', true);
    cizim = await merkezBelgesi('teknik-resim', Buffer.from('%PDF-1.4\n% uydurma parca cizimi\n%%EOF\n'), 'parca.pdf', true);
    taslak = await merkezBelgesi('3b-model', Buffer.concat([GLB, Buffer.from('    ')]), 'taslak.glb', false);
  });

  after(async () => { await ortam?.kaldir(); });

  test('MD-02: yazan makineye ilk modeli 0 sürümle bağlar; okuyan listede ve dosya ucunda görür; bağ Çizim Merkezi\'ndedir', async () => {
    assert.deepEqual(await liste(okur), []);
    const c = await bagla(yazar, { hedef: { tur: 'makine', makineId: freze }, belgeId: glbBelge, beklenenSurum: 0 });
    assert.equal(c.statusCode, 200, c.body);
    const m = (c.json() as { model: CncModel }).model;
    assert.deepEqual({ ...m, id: 0 }, { id: 0, hedef: { tur: 'makine', makineId: freze }, belge: { belgeId: glbBelge, ad: 'Deneme tezgah.glb', harf: 'A', ozet: createHash('sha256').update(GLB).digest('hex'), dosyaTuru: 'glb' }, surum: 1 });
    assert.deepEqual(await liste(okur), [m]);
    const d = await istek(okur, 'GET', `/cnc-kurulum/modeller/${m.id}/dosya`);
    assert.equal(d.statusCode, 200);
    assert.deepEqual(d.rawPayload, GLB);
    assert.deepEqual((await vt().tx((db) => kaydaBagliBelgeler(db, 'cnc-kurulum', m.id))).map((b) => b.id), [glbBelge]);
  });

  test('MD-03: aparata STEP bağlanır; başka modele geçince eskisi kaldırılır; null bağı kaldırır, dosya 204', async () => {
    const ilk = await bagla(yazar, { hedef: { tur: 'aparat', anahtar: 'custom' }, belgeId: stepBelge, beklenenSurum: 0 });
    assert.equal(ilk.statusCode, 200, ilk.body);
    const m = (ilk.json() as { model: CncModel }).model;
    assert.equal(m.belge?.dosyaTuru, 'step');
    const ikinci = await bagla(yazar, { hedef: { tur: 'aparat', anahtar: 'custom' }, belgeId: glbBelge, beklenenSurum: 1 });
    assert.equal(ikinci.statusCode, 200, ikinci.body);
    assert.deepEqual((await vt().tx((db) => kaydaBagliBelgeler(db, 'cnc-kurulum', m.id))).map((b) => b.id), [glbBelge]);
    const kaldir = await bagla(yazar, { hedef: { tur: 'aparat', anahtar: 'custom' }, belgeId: null, beklenenSurum: 2 });
    assert.equal(kaldir.statusCode, 200, kaldir.body);
    assert.deepEqual((kaldir.json() as { model: CncModel }).model.belge, null);
    assert.equal((await istek(okur, 'GET', `/cnc-kurulum/modeller/${m.id}/dosya`)).statusCode, 204);
    assert.equal((await istek(okur, 'GET', '/cnc-kurulum/modeller/999999/dosya')).statusCode, 404);
  });

  test('MD-04: sürüm tutmazsa 409 ve bağ değişmez', async () => {
    const once = await liste(okur);
    const c = await bagla(yazar, { hedef: { tur: 'makine', makineId: freze }, belgeId: stepBelge, beklenenSurum: 0 });
    assert.equal(c.statusCode, 409, c.body);
    assert.deepEqual(await liste(okur), once);
  });

  test('MD-05: parça çizimi, taslak, olmayan belge, talaşlı olmayan, pasif ve olmayan makine, geçersiz aparat reddedilir', async () => {
    const once = await liste(okur);
    const makine = (makineId: number) => ({ tur: 'makine', makineId });
    for (const [govde, durum] of [
      [{ hedef: makine(freze), belgeId: cizim, beklenenSurum: 1 }, 400],
      [{ hedef: makine(freze), belgeId: taslak, beklenenSurum: 1 }, 404],
      [{ hedef: makine(freze), belgeId: 999999, beklenenSurum: 1 }, 404],
      [{ hedef: makine(kalite), belgeId: glbBelge, beklenenSurum: 0 }, 400],
      [{ hedef: makine(pasif), belgeId: glbBelge, beklenenSurum: 0 }, 400],
      [{ hedef: makine(999999), belgeId: glbBelge, beklenenSurum: 0 }, 404],
      [{ hedef: { tur: 'aparat', anahtar: 'bos luk' }, belgeId: glbBelge, beklenenSurum: 0 }, 400],
      [{ hedef: { tur: 'istasyon', id: 1 }, belgeId: glbBelge, beklenenSurum: 0 }, 400],
    ] as const) {
      const c = await bagla(yazar, govde);
      assert.equal(c.statusCode, durum, `${JSON.stringify(govde)} ${c.body}`);
    }
    assert.deepEqual(await liste(okur), once);
  });

  test('MD-06: seçici yalnız yayındaki 3B modelleri verir ve yazana açıktır; okumayan listeyi ve dosyayı göremez', async () => {
    const s = await istek(yazar, 'GET', '/cnc-kurulum/model-secenekleri');
    assert.equal(s.statusCode, 200, s.body);
    const idler = (s.json() as { belgeler: { belgeId: number }[] }).belgeler.map((b) => b.belgeId).sort((a, b) => a - b);
    assert.deepEqual(idler, [glbBelge, stepBelge].sort((a, b) => a - b));
    assert.equal((await istek(okur, 'GET', '/cnc-kurulum/model-secenekleri')).statusCode, 403);
    assert.equal((await bagla(okur, { hedef: { tur: 'makine', makineId: freze }, belgeId: null, beklenenSurum: 1 })).statusCode, 403);
    const [m] = await liste(okur);
    assert.equal((await istek(yetkisiz, 'GET', '/cnc-kurulum/modeller')).statusCode, 403);
    assert.equal((await istek(yetkisiz, 'GET', `/cnc-kurulum/modeller/${m!.id}/dosya`)).statusCode, 403);
    assert.equal((await istek(null, 'GET', `/cnc-kurulum/modeller/${m!.id}/dosya`)).statusCode, 401);
  });

  test('MD-07: başka yoldan kurulmuş parça çizimi bağı dosya ucundan dönmez; bağlı modeli olan makine silinmez', async () => {
    const [m] = await liste(okur);
    await vt().tx(async (db) => {
      const kullanici = await kullaniciYukle(db, yoneticiId);
      if (!kullanici) throw new Error('kullanıcı yok');
      await kaydaBagla(db, kullanici, cizim, 'cnc-kurulum', m!.id);
    });
    const d = await istek(okur, 'GET', `/cnc-kurulum/modeller/${m!.id}/dosya`);
    assert.equal(d.statusCode, 200);
    assert.deepEqual(d.rawPayload, GLB);
    await assert.rejects(ortam!.sahip.sorgu('DELETE FROM makine WHERE id = $1', [freze]), (e: { code?: string }) => e.code === '23503');
  });
});
