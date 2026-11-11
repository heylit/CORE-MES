import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { sifirlamaHazirla, testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { yoneticiOlustur } from './disari.ts';
import { hesapAc, kisiEkle } from './servis.ts';
import { ILETILER } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';
const ISLEM = 'kisiler.oturum-kapat';

describe('başkasının bütün oturumlarını kapatma: POST /kisiler/:id/oturumlari-kapat (2288-1 a; gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let uygulama: FastifyInstance | undefined;
  let sifirla: (() => Promise<void>) | undefined;
  let yoneticiId = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const app = (): FastifyInstance => {
    if (!uygulama) throw new Error('Uygulama kurulmadı.');
    return uygulama;
  };

  before(async () => {
    ortam = await testVeritabaniKur('kisiler_otkapat');
    sifirla = await sifirlamaHazirla(ortam);
  });
  after(async () => { await ortam?.kaldir(); });
  beforeEach(async () => {
    if (!ortam || !sifirla) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    await sifirla();
    uygulama = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
  });
  afterEach(async () => {
    await uygulama?.close();
    uygulama = undefined;
  });

  const rolId = async (kod: string): Promise<number> => {
    const rol = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]);
    if (!rol) throw new Error(`rol yok: ${kod}`);
    return rol.id;
  };
  const rolAc = async (kod: string, islemler: string[]): Promise<number> => {
    const satir = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [kod]);
    if (!satir) throw new Error('rol açılamadı');
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [satir.id, islem]);
    return satir.id;
  };
  const kullanici = async (kullaniciAdi: string, rolKimligi: number): Promise<number> =>
    vt().tx(async (db) => {
      const id = await kisiEkle(db, { ad: `Kişi ${kullaniciAdi}` });
      await hesapAc(db, yoneticiId, id, { kullaniciAdi, parola: PAROLA, rolId: rolKimligi });
      return id;
    });
  const cerez = async (kullaniciAdi: string): Promise<string> => {
    const cevap = await app().inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  };
  const surum = async (kisiId: number): Promise<number> =>
    (await vt().tek<{ surum: number }>('SELECT surum FROM kisi WHERE id = $1', [kisiId]))?.surum ?? 0;
  const kapat = async (cerezi: string | null, kisiId: number, govde?: object): Promise<LightMyRequestResponse> =>
    app().inject({
      method: 'POST', url: `/api/kisiler/${kisiId}/oturumlari-kapat`, headers: cerezi === null ? {} : { cookie: cerezi },
      payload: govde ?? { surum: await surum(kisiId) },
    });
  // GET /oturum herkese açıktır ve düşmüş oturumda da 200 döner; oturumun yaşadığı kullanıcının dolu gelmesinden okunur.
  const oturumAcik = async (cerezi: string): Promise<boolean> => {
    const cevap = await app().inject({ method: 'GET', url: '/api/oturum', headers: { cookie: cerezi } });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return (cevap.json() as { kullanici: unknown }).kullanici !== null;
  };

  test('izinli: yönetici kişinin bütün oturumlarını kapatır; sürüm artar, denetime düşer, kendi oturumu ve kişinin girişi kalır', async () => {
    const hedef = await kullanici('kayip-telefon', await rolId('planlama_proje'));
    const birinci = await cerez('kayip-telefon');
    const ikinci = await cerez('kayip-telefon');
    const yoneticiCerezi = await cerez('yonetici');
    const once = await surum(hedef);

    const cevap = await kapat(yoneticiCerezi, hedef);
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.deepEqual(cevap.json(), { tamam: true });

    assert.equal(await oturumAcik(birinci), false);
    assert.equal(await oturumAcik(ikinci), false);
    assert.equal((await app().inject({ method: 'GET', url: '/api/kisiler', headers: { cookie: birinci } })).statusCode, 401);
    assert.equal(await oturumAcik(yoneticiCerezi), true);
    assert.equal(await surum(hedef), once + 1);
    const kayit = await vt().tek<{ kisi_id: number; yetki: string }>(
      "SELECT kisi_id, yetki FROM denetim_kaydi WHERE yol = '/kisiler/:id/oturumlari-kapat' ORDER BY id DESC LIMIT 1",
    );
    assert.deepEqual(kayit, { kisi_id: yoneticiId, yetki: ISLEM });
    const kisi = await vt().tek<{ aktif: boolean; gecersiz: boolean }>(
      'SELECT aktif, oturumlar_gecersiz_once IS NOT NULL AS gecersiz FROM kisi WHERE id = $1', [hedef],
    );
    assert.deepEqual(kisi, { aktif: true, gecersiz: true });
    // Kişi pasife alınmaz: aynı parolayla yeniden girer ve yeni oturumu çalışır.
    assert.equal(await oturumAcik(await cerez('kayip-telefon')), true);
  });

  test('izinli: yönetici başka bir yöneticinin oturumlarını da kapatır', async () => {
    const hedef = await kullanici('ikinci-yonetici', await rolId('yonetici'));
    const hedefCerezi = await cerez('ikinci-yonetici');
    const cevap = await kapat(await cerez('yonetici'), hedef);
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.equal(await oturumAcik(hedefCerezi), false);
  });

  test('yasak: işlemsiz kişi (kisiler.yaz taşıyan İK dahil) 403, oturumsuz 401; hedefin oturumu ve sürümü değişmez', async () => {
    const hedef = await kullanici('hedef-kisi', await rolId('planlama_proje'));
    const hedefCerezi = await cerez('hedef-kisi');
    await kullanici('ik-kisi', await rolId('insan_kaynaklari'));
    const once = await surum(hedef);

    assert.equal((await kapat(await cerez('ik-kisi'), hedef)).statusCode, 403);
    assert.equal((await kapat(null, hedef)).statusCode, 401);
    assert.equal(await oturumAcik(hedefCerezi), true);
    assert.equal(await surum(hedef), once);
  });

  test('yasak: kişi kendi oturumlarını bu yoldan kapatamaz (422) ve oturumu kalır', async () => {
    const yoneticiCerezi = await cerez('yonetici');
    const cevap = await kapat(yoneticiCerezi, yoneticiId);
    assert.equal(cevap.statusCode, 422, cevap.body);
    assert.equal(cevap.json().mesaj, ILETILER.kendiOturumYolu);
    assert.equal(await oturumAcik(yoneticiCerezi), true);
  });

  test('yasak: girişsiz kişi 422, olmayan kişi 404, eski sürüm 409, sürümsüz 400', async () => {
    const yoneticiCerezi = await cerez('yonetici');
    const girissiz = await vt().tx((db) => kisiEkle(db, { ad: 'Girişsiz Kişi' }));
    const girissizCevap = await kapat(yoneticiCerezi, girissiz);
    assert.equal(girissizCevap.statusCode, 422, girissizCevap.body);
    assert.equal(girissizCevap.json().mesaj, ILETILER.girisYok);

    assert.equal((await kapat(yoneticiCerezi, 999999, { surum: 1 })).statusCode, 404);

    const hedef = await kullanici('surum-hedefi', await rolId('planlama_proje'));
    const hedefCerezi = await cerez('surum-hedefi');
    const eski = await kapat(yoneticiCerezi, hedef, { surum: (await surum(hedef)) - 1 });
    assert.equal(eski.statusCode, 409, eski.body);
    assert.equal((await kapat(yoneticiCerezi, hedef, {})).statusCode, 400);
    assert.equal(await oturumAcik(hedefCerezi), true);
  });

  test('yasak: işlemi taşıyan ama bayraksız kişi yöneticinin oturumlarını kapatamaz (403); bayraksız kişininkini kapatır', async () => {
    await kullanici('bayraksiz-kapatan', await rolAc('oturum_kapatan', [ISLEM]));
    const kapatanCerezi = await cerez('bayraksiz-kapatan');
    const yoneticiCerezi = await cerez('yonetici');

    const ret = await kapat(kapatanCerezi, yoneticiId);
    assert.equal(ret.statusCode, 403, ret.body);
    assert.equal(await oturumAcik(yoneticiCerezi), true);

    const hedef = await kullanici('siradan-hedef', await rolId('planlama_proje'));
    const hedefCerezi = await cerez('siradan-hedef');
    assert.equal((await kapat(kapatanCerezi, hedef)).statusCode, 200);
    assert.equal(await oturumAcik(hedefCerezi), false);
  });

  test('yasak: işlem kişiye ek işlem olarak verilemez (422, devredilmez)', async () => {
    const kisi = await kullanici('ek-islem-adayi', await rolId('planlama_proje'));
    const cevap = await app().inject({
      method: 'POST', url: `/api/kisiler/${kisi}/ek-islem-degistir`, headers: { cookie: await cerez('yonetici') }, payload: { islem: ISLEM, verildi: true },
    });
    assert.equal(cevap.statusCode, 422, cevap.body);
    assert.equal(cevap.json().mesaj, ILETILER.devredilmezIslem);
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM kisi_islemi WHERE kisi_id = $1', [kisi]))?.n, 0);
  });
});
