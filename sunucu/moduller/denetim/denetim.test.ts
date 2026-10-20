import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { kararliJson } from '#cekirdek/tekrar.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uc, uclariKaydet } from '#cekirdek/uc.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { denetimYaz } from './disari.ts';

const PAROLA = 'dogru-parola-1';
const GIZLI_DEGER = 'cok-gizli-deger-7';

interface Satir {
  kisi_id: number | null;
  yontem: string;
  parametre: unknown;
  govde: unknown;
  bayt: number;
}

const sha256 = (metin: string): string => createHash('sha256').update(metin, 'utf8').digest('hex');

describe('denetim kipi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let yoneticiId = 0;
  let kosma = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  const govde = z.object({
    veri: z.string(),
    parola: z.string().optional(),
    token: z.string().optional(),
    ic: z.object({ pin: z.string(), not: z.string() }).optional(),
  });
  const cevap = z.object({ tamam: z.boolean() });
  const parametre = z.object({ tur: z.string() });
  const isle = (): { tamam: boolean } => { kosma += 1; return { tamam: true }; };
  const sahteUclar = [
    uc({ yontem: 'POST', yol: '/deneme-denetim/:tur/tam', yetki: 'oturum', parametre, govde, cevap, isle }),
    uc({ yontem: 'POST', yol: '/deneme-denetim/:tur/govdesiz', yetki: 'oturum', denetim: 'govdesiz', parametre, govde, cevap, isle }),
    uc({ yontem: 'POST', yol: '/deneme-denetim/:tur/yok', yetki: 'oturum', denetim: 'yok', parametre, govde, cevap, isle }),
    uc({
      yontem: 'POST', yol: '/deneme-denetim/:tur/secili', yetki: 'oturum', denetim: 'govdesiz', parametre, govde, cevap, isle,
      denetimOzeti: (g) => ({ durum: g.ic?.not ?? null, uzunluk: g.veri.length, parola: g.parola ?? null }),
    }),
    uc({
      yontem: 'POST', yol: '/deneme-denetim/:tur/tekrar', yetki: 'oturum', denetim: 'govdesiz', tekrarKorumali: true,
      parametre, govde, cevap, isle,
    }),
    ...(['tam', 'govdesiz'] as const).map((kip) => uc({
      yontem: 'POST', yol: `/deneme-denetim/:tur/yol-${kip}/:token/:parola/:id/:ozet/:kimlik`, yetki: 'oturum',
      ...(kip === 'govdesiz' ? { denetim: kip } : {}),
      parametre: z.object({ tur: z.string(), token: z.string(), parola: z.string(), id: z.coerce.number(), ozet: z.string(), kimlik: z.string() }),
      govde, cevap, isle,
    })),
  ];

  const gonder = (yol: string, yuk: z.input<typeof govde>, basliklar: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url: `/api/deneme-denetim/${yol}`, payload: yuk, headers: { cookie: cerez, ...basliklar } });

  const satirlar = (yol: string, tur: string): Promise<Satir[]> =>
    vt().sorgu<Satir>(
      `SELECT kisi_id, yontem, parametre, govde, pg_column_size(d.*)::int AS bayt
         FROM denetim_kaydi d WHERE yol = $1 AND parametre->>'tur' = $2 ORDER BY id`,
      [`/deneme-denetim/:tur/${yol}`, tur],
    );

  before(async () => {
    ortam = await testVeritabaniKur('denetim');
    const secenek = { kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu };
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, ...secenek });
    uclariKaydet(app, sahteUclar, { vt: ortam.vt, ...secenek });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    assert.equal(giris.statusCode, 200, giris.body);
    cerez = String(giris.headers['set-cookie']).split(';')[0] ?? '';
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('kip verilmeyen uç: gövde deftere tam girer; parola, token ve pin alanları maskelenir', async () => {
    const yuk = { veri: 'açık metin', parola: GIZLI_DEGER, token: GIZLI_DEGER, ic: { pin: GIZLI_DEGER, not: 'görünür' } };
    assert.equal((await gonder('a/tam', yuk)).statusCode, 200);
    const [satir, ...fazlasi] = await satirlar('tam', 'a');
    assert.deepEqual(fazlasi, []);
    assert.deepEqual(
      { kisi_id: satir?.kisi_id, yontem: satir?.yontem, parametre: satir?.parametre, govde: satir?.govde },
      {
        kisi_id: yoneticiId, yontem: 'POST', parametre: { tur: 'a' },
        govde: { veri: 'açık metin', parola: '[gizli]', token: '[gizli]', ic: { pin: '[gizli]', not: 'görünür' } },
      },
    );
  });

  test('gövdesiz uç: satır yazılır, gövde yerine yalnız boyut ve özet girer; 600 KB gövdede satır küçük kalır', async () => {
    // Rastgele içerik: yinelenen metin veritabanında sıkışır ve kipsiz satırı da küçük gösterirdi.
    const yuk = { veri: randomBytes(450 * 1024).toString('base64') };
    assert.equal(yuk.veri.length, 600 * 1024);
    const once = kosma;
    assert.equal((await gonder('buyuk/govdesiz', yuk)).statusCode, 200);
    assert.equal((await gonder('buyuk/tam', yuk)).statusCode, 200);
    assert.equal(kosma - once, 2);

    const [satir, ...fazlasi] = await satirlar('govdesiz', 'buyuk');
    assert.deepEqual(fazlasi, []);
    const metin = kararliJson(yuk);
    assert.deepEqual(
      { kisi_id: satir?.kisi_id, yontem: satir?.yontem, parametre: satir?.parametre, govde: satir?.govde },
      {
        kisi_id: yoneticiId, yontem: 'POST', parametre: { tur: 'buyuk' },
        govde: { _ozet: { boyut: Buffer.byteLength(metin, 'utf8'), sha256: sha256(metin) } },
      },
    );
    assert.ok((satir?.bayt ?? Infinity) < 400, `gövdesiz satır ${satir?.bayt} bayt`);
    // Aynı gövde kipsiz uçta deftere girer: küçüklük gövdenin deftere hiç ulaşmamasından değil, kipten gelir.
    const [tam] = await satirlar('tam', 'buyuk');
    assert.deepEqual(tam?.govde, yuk);
    assert.ok((tam?.bayt ?? 0) > 500 * 1024, `kipsiz satır ${tam?.bayt} bayt`);
  });

  test('gövdesiz uç: özet maskelenmiş gövdeden alınır, ham gövdenin özeti deftere girmez; bayt sayısı karakter sayısı değildir', async () => {
    const yuk = { veri: 'çğıöşü', parola: GIZLI_DEGER, ic: { pin: GIZLI_DEGER, not: 'n' } };
    assert.equal((await gonder('gizli/govdesiz', yuk)).statusCode, 200);
    const [satir] = await satirlar('govdesiz', 'gizli');
    const maskeli = kararliJson({ veri: 'çğıöşü', parola: '[gizli]', ic: { pin: '[gizli]', not: 'n' } });
    assert.deepEqual(satir?.govde, { _ozet: { boyut: Buffer.byteLength(maskeli, 'utf8'), sha256: sha256(maskeli) } });
    assert.notEqual(Buffer.byteLength(maskeli, 'utf8'), maskeli.length);
    assert.notEqual((satir?.govde as { _ozet: { sha256: string } })._ozet.sha256, sha256(kararliJson(yuk)));
  });

  test('yol parametresi de maskelenir: adı token ya da parola olan parametre deftere girmez, olağan parametreler aynen kalır', async () => {
    for (const kip of ['tam', 'govdesiz']) {
      const cevabi = await gonder(`yol/yol-${kip}/${GIZLI_DEGER}/${GIZLI_DEGER}/7/abc123/k-1`, { veri: 'x' });
      assert.equal(cevabi.statusCode, 200, cevabi.body);
      const kayitlar = await vt().sorgu<{ parametre: unknown; metin: string }>(
        'SELECT parametre, d::text AS metin FROM denetim_kaydi d WHERE yol = $1',
        [`/deneme-denetim/:tur/yol-${kip}/:token/:parola/:id/:ozet/:kimlik`],
      );
      assert.deepEqual(
        kayitlar.map((k) => k.parametre),
        [{ tur: 'yol', token: '[gizli]', parola: '[gizli]', id: 7, ozet: 'abc123', kimlik: 'k-1' }],
        kip,
      );
      assert.equal(kayitlar[0]?.metin.includes(GIZLI_DEGER), false, kip);
    }
  });

  test('denetimsiz uç: komut koşar, deftere satır düşmez; kipsiz uçta aynı istek satır bırakır', async () => {
    const once = kosma;
    assert.equal((await gonder('z/yok', { veri: 'x' })).statusCode, 200);
    assert.equal((await gonder('z/tam', { veri: 'x' })).statusCode, 200);
    assert.equal(kosma - once, 2);
    assert.equal((await satirlar('tam', 'z')).length, 1);
    assert.deepEqual(await satirlar('yok', 'z'), []);
  });

  test('gövdesiz ve tekrar korumalı uç: yinelenen istek ikinci denetim satırı yazmaz', async () => {
    const basliklar = { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() };
    const once = kosma;
    assert.equal((await gonder('t/tekrar', { veri: 'x' }, basliklar)).statusCode, 200);
    assert.equal((await gonder('t/tekrar', { veri: 'x' }, basliklar)).statusCode, 200);
    assert.equal(kosma - once, 1);
    const kayitlar = await satirlar('tekrar', 't');
    assert.equal(kayitlar.length, 1);
    assert.deepEqual(Object.keys(kayitlar[0]?.govde as object), ['_ozet']);
  });

  test('gövdesiz uç seçiciyle: özetin yanına yalnız seçilen alanlar girer, gövdenin gerisi girmez; seçimdeki gizli adlı alan maskelenir', async () => {
    const yuk = { veri: 'deftere-girmeyen-icerik', parola: GIZLI_DEGER, ic: { pin: GIZLI_DEGER, not: 'onayda' } };
    assert.equal((await gonder('s/secili', yuk)).statusCode, 200);
    const kayitlar = await vt().sorgu<{ kisi_id: number; govde: unknown; metin: string }>(
      "SELECT kisi_id, govde, d::text AS metin FROM denetim_kaydi d WHERE yol = '/deneme-denetim/:tur/secili'",
    );
    const maskeli = kararliJson({ veri: yuk.veri, parola: '[gizli]', ic: { pin: '[gizli]', not: 'onayda' } });
    assert.deepEqual(kayitlar.map((k) => ({ kisi_id: k.kisi_id, govde: k.govde })), [{
      kisi_id: yoneticiId,
      govde: {
        _ozet: { boyut: Buffer.byteLength(maskeli, 'utf8'), sha256: sha256(maskeli) },
        _secilen: { durum: 'onayda', uzunluk: yuk.veri.length, parola: '[gizli]' },
      },
    }]);
    assert.equal(kayitlar[0]?.metin.includes(yuk.veri), false);
    assert.equal(kayitlar[0]?.metin.includes(GIZLI_DEGER), false);
    // Seçicisiz gövdesiz uç eskisi gibidir: yalnız özet.
    assert.equal((await gonder('s/govdesiz', yuk)).statusCode, 200);
    assert.deepEqual(Object.keys((await satirlar('govdesiz', 's'))[0]?.govde as object), ['_ozet']);
  });

  test('kayıt ucun modülünü ve yetkisini taşır; modülsüz uçta modül boş, uç dışından yazılan kayıtta ikisi de boş; sonradan doldurulamaz', async () => {
    const son = (yol: string) =>
      vt().tek<{ id: number; modul: string | null; yetki: string | null }>(
        'SELECT id, modul, yetki FROM denetim_kaydi WHERE yol = $1 ORDER BY id DESC LIMIT 1', [yol],
      );
    // Modül ucu: keşifle kaydedilen gerçek uçlar (giriş açık uç, tür yazımı veri işlemi).
    assert.equal((await app.inject({ method: 'POST', url: '/api/olcu-aleti-turleri', payload: { ad: 'Denetim turu' }, headers: { cookie: cerez } })).statusCode, 200);
    assert.deepEqual(await son('/olcu-aleti-turleri'), { id: (await son('/olcu-aleti-turleri'))?.id, modul: 'kalibrasyon', yetki: 'kalibrasyon.yaz' });
    const giris = await son('/oturum/giris');
    assert.deepEqual({ modul: giris?.modul, yetki: giris?.yetki }, { modul: 'oturum', yetki: 'acik' });
    // Modülsüz kaydedilen uç: yetki yazılır, modül boş kalır.
    assert.equal((await gonder('m/tam', { veri: 'x' })).statusCode, 200);
    const sahte = await son('/deneme-denetim/:tur/tam');
    assert.deepEqual({ modul: sahte?.modul, yetki: sahte?.yetki }, { modul: null, yetki: 'oturum' });
    // Uç dışından yazılan kayıt (modül servisinin doğrudan yazımı) ikisini de taşımaz.
    await vt().tx((db) => denetimYaz(db, { kisiId: yoneticiId, yontem: 'POST', yol: '/elle-yazilan', parametre: undefined, govde: { x: 1 } }));
    const elle = await son('/elle-yazilan');
    assert.deepEqual({ modul: elle?.modul, yetki: elle?.yetki }, { modul: null, yetki: null });
    // Boş kalan sütun sonradan doldurulamaz: defter yalnız eklenir.
    await assert.rejects(vt().sorgu("UPDATE denetim_kaydi SET modul = 'kalibrasyon' WHERE id = $1", [elle?.id]), /yalnız ekleme/);
  });
});
