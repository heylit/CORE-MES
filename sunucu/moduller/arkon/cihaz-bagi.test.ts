import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

interface Cevap<T = unknown> { durum: number; govde: T }

// 3392 a madde 11: ortak cihazın istasyon ve makine bağı yalnız istasyon yönetimi olan rolle yazılır ve iz olarak yalnız eklenir.
describe('arkon cihaz bağı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let yonetici = '';
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const sahip = (): TestVeritabani['sahip'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı.');
    return ortam.sahip;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  async function istek<T = unknown>(cerez: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const cevap = await app.inject({
      method: yontem, url: `/api${yol}`, headers: cerez ? { cookie: cerez } : {}, ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: cevap.statusCode, govde: (cevap.body ? cevap.json() : undefined) as T };
  }

  async function kisiKur(kullaniciAdi: string, islemler: string[]): Promise<{ cerez: string; id: number }> {
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const gecici = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $2) RETURNING id', [`gecici_${kullaniciAdi}`, kullaniciAdi]);
    if (!yoneticiRolu || !gecici) throw new Error('rol kurulamadı');
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [gecici.id, islem]);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, gecici.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return yeni;
    });
    return { cerez: await girisCerezi(kullaniciAdi), id };
  }

  async function istasyonKur(makineSayisi: number): Promise<{ kod: string; makineler: string[]; merkezId: number }> {
    const merkez = await istek<{ id: number }>(yonetici, 'POST', '/is-merkezleri', { kod: `CM${(sayac += 1)}`, ad: 'Cihaz merkezi' });
    const kod = `CI${(sayac += 1)}`;
    const ist = await istek<{ id: number }>(yonetici, 'POST', '/istasyonlar', { kod, ad: 'Cihaz istasyonu', isMerkeziId: merkez.govde.id, tip: 'talasli' });
    assert.equal(ist.durum, 200, JSON.stringify(ist.govde));
    const makineler: string[] = [];
    for (let i = 0; i < makineSayisi; i += 1) {
      const mk = `CK${(sayac += 1)}`;
      await sahip().sorgu('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3)', [mk, 'Tezgah', ist.govde.id]);
      makineler.push(mk);
    }
    return { kod, makineler, merkezId: merkez.govde.id };
  }

  const CIHAZ = '0f8e2a4c-1b3d-4e5f-8a9b-0c1d2e3f4a5b';
  const bagla = (cerez: string, govde: unknown) => istek<{ tamam?: true; mesaj?: string }>(cerez, 'POST', '/arkon/cihaz-bagi', govde);
  const izler = () => sahip().sorgu<{ cihaz: string; istasyon_id: number; makine_id: number | null; kisi_id: number }>(
    'SELECT cihaz, istasyon_id, makine_id, kisi_id FROM arkon_cihaz_bagi ORDER BY id');

  before(async () => {
    ortam = await testVeritabaniKur('arkoncihaz');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yonetici = await girisCerezi('yonetici');
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('amir cihazı istasyona ve makineye bağlar; makinesiz bağ da yazılır; iz kişiyi taşır', async () => {
    const yer = await istasyonKur(2);
    const amir = await kisiKur('cihazamir', ['sayfa.uretim-terminali', 'arkon.amir']);
    const r = await bagla(amir.cerez, { cihaz: CIHAZ, istasyon: yer.kod, makine: yer.makineler[1] });
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    assert.deepEqual(r.govde, { tamam: true });
    const r2 = await bagla(amir.cerez, { cihaz: CIHAZ, istasyon: yer.kod, makine: null });
    assert.equal(r2.durum, 200, JSON.stringify(r2.govde));
    const satirlar = await izler();
    assert.equal(satirlar.length, 2);
    assert.equal(satirlar[0]!.kisi_id, amir.id);
    assert.notEqual(satirlar[0]!.makine_id, null);
    assert.equal(satirlar[1]!.makine_id, null);
  });

  test('operatör bağlayamaz (403); başka istasyonun makinesi ve bilinmeyen istasyon reddedilir (422); biçimsiz cihaz 400', async () => {
    const yer = await istasyonKur(1);
    const oteki = await istasyonKur(1);
    const once = (await izler()).length;
    const operator = await kisiKur('cihazoperator', ['sayfa.uretim-terminali', 'arkon.operator']);
    assert.equal((await bagla(operator.cerez, { cihaz: CIHAZ, istasyon: yer.kod, makine: yer.makineler[0] })).durum, 403);
    const amir = await kisiKur('cihazamir2', ['sayfa.uretim-terminali', 'arkon.amir']);
    const yabanci = await bagla(amir.cerez, { cihaz: CIHAZ, istasyon: yer.kod, makine: oteki.makineler[0] });
    assert.equal(yabanci.durum, 422, JSON.stringify(yabanci.govde));
    assert.equal((await bagla(amir.cerez, { cihaz: CIHAZ, istasyon: 'YOK-BOYLE', makine: null })).durum, 422);
    assert.equal((await bagla(amir.cerez, { cihaz: 'cihaz-1', istasyon: yer.kod, makine: null })).durum, 400);
    assert.equal((await izler()).length, once, 'reddedilen bağ iz bırakmaz');
  });

  test('iş merkezi kapsamı olan amir yalnız kapsamındaki istasyona bağlar; kapsam dışı 403 ve iz yok', async () => {
    const icerde = await istasyonKur(1);
    const disarda = await istasyonKur(1);
    const amir = await kisiKur('cihazamir3', ['sayfa.uretim-terminali', 'arkon.amir']);
    const k = await istek(yonetici, 'POST', `/kisi-is-merkezleri/${String(amir.id)}/belirle`, { isMerkeziIdleri: [icerde.merkezId] });
    assert.equal(k.durum, 200, JSON.stringify(k.govde));
    const once = (await izler()).length;
    const dis = await bagla(amir.cerez, { cihaz: CIHAZ, istasyon: disarda.kod, makine: disarda.makineler[0] });
    assert.equal(dis.durum, 403, JSON.stringify(dis.govde));
    assert.equal((await izler()).length, once, 'kapsam dışı bağ iz bırakmaz');
    const ic = await bagla(amir.cerez, { cihaz: CIHAZ, istasyon: icerde.kod, makine: icerde.makineler[0] });
    assert.equal(ic.durum, 200, JSON.stringify(ic.govde));
  });

  test('iz yalnız eklenir: güncelleme ve silme reddedilir', async () => {
    await assert.rejects(sahip().sorgu('UPDATE arkon_cihaz_bagi SET makine_id = NULL'));
    await assert.rejects(sahip().sorgu('DELETE FROM arkon_cihaz_bagi'));
  });
});
