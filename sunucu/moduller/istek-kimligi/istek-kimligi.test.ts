import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { veritabaniAc } from '#cekirdek/db.ts';
import type { Veritabani } from '#cekirdek/db.ts';
import { UygulamaHatasi, cakisma } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uc, uclariKaydet } from '#cekirdek/uc.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from './disari.ts';
import { ANAHTAR_BEKLEME_MS, SAKLAMA_SAAT, TEMIZLIK_SINIRI } from './kurallar.ts';
import { tekrarDeposuKur } from './servis.ts';

const PAROLA = 'dogru-parola-1';
const KISA_SORGU_SURE_MS = 600;
const KISA_BEKLEME_MS = 400;
const SAY_YOLU = '/deneme-tekrar/:tur/say';

// Sıradaki işleyici koşusunun davranışı; koşu onu alır ve sıfırlar (yinelenen istek ilkinin ayarını devralmasın).
interface Mod {
  kapi?: Promise<void>;
  basladi?: () => void;
  hata?: Error;
}

describe('tekrar korumalı komut (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisaVt: Veritabani | undefined;
  let app: FastifyInstance;
  let kisaApp: FastifyInstance;
  let kisaBeklemeApp: FastifyInstance;
  let islemliKosma = 0;
  let iscideKilitSuresi: string | null = null;
  let yoneticiId = 0;
  let ucuncuId = 0;
  const cerezler = new Map<string, string>();
  let kosma = 0;
  let siradaki: Mod = {};

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  const govdeSemasi = z.object({ adet: z.number().int(), not: z.string().optional() });
  const sayCevabi = z.object({ sira: z.number(), adet: z.number() });
  const sayUcu = (yol: string) => uc({
    yontem: 'POST',
    yol,
    yetki: 'oturum',
    tekrarKorumali: true,
    parametre: z.object({ tur: z.string() }),
    govde: govdeSemasi,
    cevap: sayCevabi,
    isle: async ({ db, govde, parametre }) => {
      kosma += 1;
      const mod = siradaki;
      siradaki = {};
      iscideKilitSuresi = (await db.tek<{ deger: string }>("SELECT current_setting('lock_timeout') AS deger"))?.deger ?? null;
      const satir = await db.tek<{ id: number }>('INSERT INTO deneme_sayim (tur, adet) VALUES ($1, $2) RETURNING id', [parametre.tur, govde.adet]);
      mod.basladi?.();
      if (mod.kapi) await mod.kapi;
      if (mod.hata) throw mod.hata;
      const sonuc = { sira: satir?.id ?? 0, adet: govde.adet, fazladan: 'sizmamali' };
      return sonuc;
    },
  });
  const sahteUclar = [
    uc({
      yontem: 'POST', yol: '/deneme-tekrar/islemli', yetki: 'kisiler.yaz', tekrarKorumali: true, cevap: z.object({ kosma: z.number() }),
      isle: () => { islemliKosma += 1; return { kosma: islemliKosma }; },
    }),
    uc({
      yontem: 'POST', yol: '/deneme-tekrar/sorgulu', yetki: 'oturum', tekrarKorumali: true,
      sorgu: z.object({ zorla: z.string().optional() }), cevap: z.object({ zorla: z.string().nullable() }),
      isle: ({ sorgu }) => { kosma += 1; return { zorla: sorgu.zorla ?? null }; },
    }),
    sayUcu(SAY_YOLU),
    sayUcu('/deneme-tekrar/:tur/baska'),
    uc({
      yontem: 'POST', yol: '/deneme-tekrar/bos', yetki: 'oturum', tekrarKorumali: true, cevap: z.undefined(),
      isle: () => { kosma += 1; return undefined; },
    }),
    uc({
      yontem: 'POST', yol: '/deneme-tekrar/cerez', yetki: 'oturum', tekrarKorumali: true, cevap: z.object({ tamam: z.boolean() }),
      isle: async ({ db, istek }) => {
        await db.sorgu("INSERT INTO deneme_sayim (tur, adet) VALUES ('cerez', 1)");
        istek.cerezYaz('deneme', 'x', 60);
        return { tamam: true };
      },
    }),
    uc({
      yontem: 'POST', yol: '/deneme-tekrar/duz', yetki: 'oturum', govde: govdeSemasi, cevap: z.object({ adet: z.number() }),
      isle: async ({ db, govde }) => {
        kosma += 1;
        await db.sorgu("INSERT INTO deneme_sayim (tur, adet) VALUES ('duz', $1)", [govde.adet]);
        return { adet: govde.adet };
      },
    }),
  ];

  interface Girdi {
    kim?: string | null;
    kimlik?: string | null;
    govde?: unknown;
    uyg?: FastifyInstance;
  }
  const gonder = (yol: string, { kim = 'yonetici', kimlik = null, govde = { adet: 1 }, uyg = app }: Girdi = {}) =>
    uyg.inject({
      method: 'POST',
      url: `/api${yol}`,
      payload: govde as object,
      headers: {
        ...(kim === null ? {} : { cookie: cerezler.get(kim) ?? '' }),
        ...(kimlik === null ? {} : { [ISTEK_KIMLIGI_BASLIGI]: kimlik }),
      },
    });

  const sayim = async (tur: string): Promise<number> =>
    (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM deneme_sayim WHERE tur = $1', [tur]))?.n ?? -1;
  const denetim = async (tur: string): Promise<number> =>
    (await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM denetim_kaydi WHERE yol = $1 AND parametre->>'tur' = $2", [SAY_YOLU, tur]))?.n ?? -1;
  const anahtarlar = (kimlik: string) =>
    vt().sorgu<{ kisi_id: number; uc: string; durum_kodu: number | null; cevap: unknown }>(
      'SELECT kisi_id, uc, durum_kodu, cevap FROM istek_kimligi WHERE istek_kimligi = $1::uuid ORDER BY kisi_id', [kimlik],
    );
  const anahtarSayisi = async (): Promise<number> =>
    (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM istek_kimligi'))?.n ?? -1;
  const eskit = async (kimlik: string, saat: number): Promise<void> => {
    await vt().sorgu('UPDATE istek_kimligi SET olusma = now() - make_interval(hours => $2) WHERE istek_kimligi = $1::uuid', [kimlik, saat]);
  };

  // İşleyicisi yazısını yapıp kapıda bekleyen ilk istek: komutun transaction'ı açık, anahtar satırı kalıcı değil.
  function kapidaBeklet(hata?: Error): { basladi: Promise<void>; ac: () => void } {
    let ac = (): void => undefined;
    let basladiCoz = (): void => undefined;
    const kapi = new Promise<void>((coz) => { ac = coz; });
    const basladi = new Promise<void>((coz) => { basladiCoz = coz; });
    siradaki = { kapi, basladi: basladiCoz, ...(hata ? { hata } : {}) };
    return { basladi, ac };
  }

  // İkinci isteğin anahtar eklemesi veritabanında kilit bekliyor: yarış sıralı koşuya dönüşmeden gözlenir.
  async function kilitBekleyeniGor(): Promise<void> {
    const son = performance.now() + 5000;
    for (;;) {
      const satir = await vt().tek<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid()
            AND wait_event_type = 'Lock' AND query LIKE 'INSERT INTO istek_kimligi%'`,
      );
      if ((satir?.n ?? 0) > 0) return;
      if (performance.now() > son) throw new Error('İkinci istek anahtar kilidinde beklemedi');
      await new Promise((coz) => { setTimeout(coz, 20); });
    }
  }

  before(async () => {
    ortam = await testVeritabaniKur('istek_kimligi');
    await ortam.sahip.sorgu('CREATE TABLE deneme_sayim (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tur text NOT NULL, adet int NOT NULL)');
    const kur = async (havuz: Veritabani, tekrar = tekrarDeposu): Promise<FastifyInstance> => {
      const secenek = { kimlik: kimlikCozucu(havuz), denetle: denetimYaz, tekrar };
      const uyg = await uygulamaKur({ vt: havuz, ayar: ortam!.ayar, ...secenek });
      uclariKaydet(uyg, sahteUclar, { vt: havuz, ...secenek });
      return uyg;
    };
    app = await kur(ortam.vt);
    kisaVt = veritabaniAc({ pg: { ...ortam.ayar.pg, sorguSureMs: KISA_SORGU_SURE_MS } }, { sema: ortam.sema });
    kisaApp = await kur(kisaVt);
    kisaBeklemeApp = await kur(ortam.vt, tekrarDeposuKur({ beklemeMs: KISA_BEKLEME_MS }));
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'İkinci Kişi', kullaniciAdi: 'ikinci', parola: PAROLA }));
    ucuncuId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Üçüncü Kişi', kullaniciAdi: 'ucuncu', parola: PAROLA }));
    for (const kullaniciAdi of ['yonetici', 'ikinci', 'ucuncu']) {
      const giris = await app.inject({
        method: 'POST',
        url: '/api/oturum/giris',
        payload: { kullaniciAdi, parola: PAROLA },
        // Bayraksız gerçek uç başlığa bakmaz: bozuk değer girişi düşürmez.
        headers: { [ISTEK_KIMLIGI_BASLIGI]: 'uuid-degil' },
      });
      assert.equal(giris.statusCode, 200, giris.body);
      cerezler.set(kullaniciAdi, String(giris.headers['set-cookie']).split(';')[0] ?? '');
    }
  });

  after(async () => {
    await kisaVt?.kapat();
    await ortam?.kaldir();
  });

  test('aynı kimlikle yinelenen istek: tek yazma, aynı cevap, tek denetim satırı; saklanan cevap şemadan geçmiş haldir', async () => {
    const kimlik = randomUUID();
    const once = kosma;
    const ilk = await gonder('/deneme-tekrar/ilk/say', { kimlik, govde: { adet: 4 } });
    const ikinci = await gonder('/deneme-tekrar/ilk/say', { kimlik, govde: { adet: 4 } });

    assert.equal(ilk.statusCode, 200, ilk.body);
    assert.equal(ikinci.statusCode, 200, ikinci.body);
    assert.deepEqual(Object.keys(ilk.json()).sort(), ['adet', 'sira']);
    assert.equal(ilk.json().adet, 4);
    assert.deepEqual(ikinci.json(), ilk.json());
    assert.equal(ikinci.headers['content-type'], ilk.headers['content-type']);
    assert.equal(kosma - once, 1);
    assert.equal(await sayim('ilk'), 1);
    assert.equal(await denetim('ilk'), 1);
    assert.deepEqual(await anahtarlar(kimlik), [
      { kisi_id: yoneticiId, uc: `POST ${SAY_YOLU}`, durum_kodu: 200, cevap: ilk.json() },
    ]);
  });

  test('anahtar eklemesinin bekleme sınırı işleyiciye sızmaz: komut oturumun kendi kilit süresiyle koşar', async () => {
    const oturumDegeri = (await vt().tek<{ deger: string }>("SELECT current_setting('lock_timeout') AS deger"))?.deger;
    iscideKilitSuresi = null;
    const cevap = await gonder('/deneme-tekrar/kilit-suresi/say', { kimlik: randomUUID() });
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.equal(typeof oturumDegeri, 'string');
    assert.equal(iscideKilitSuresi, oturumDegeri);
  });

  test('gövdesiz cevap da saklanır: yinelenen istek 204 alır, işleyici bir kez koşar', async () => {
    const kimlik = randomUUID();
    const once = kosma;
    const ilk = await gonder('/deneme-tekrar/bos', { kimlik, govde: undefined });
    const ikinci = await gonder('/deneme-tekrar/bos', { kimlik, govde: undefined });
    assert.deepEqual([ilk.statusCode, ilk.body], [204, '']);
    assert.deepEqual([ikinci.statusCode, ikinci.body], [204, '']);
    assert.equal(kosma - once, 1);
  });

  test('yarış: ilki sürerken gelen aynı kimlikli istek kilitte bekler, sonra ilk cevabı alır; tek satır, tek koşu, tek denetim', async () => {
    const kimlik = randomUUID();
    const once = kosma;
    const kapi = kapidaBeklet();
    const a = gonder('/deneme-tekrar/yaris/say', { kimlik, govde: { adet: 7 } });
    await kapi.basladi;
    const b = gonder('/deneme-tekrar/yaris/say', { kimlik, govde: { adet: 7 } });
    const beklerkenKosan = await kilitBekleyeniGor().then(() => kosma - once).finally(() => { kapi.ac(); });
    const [ilk, ikinci] = await Promise.all([a, b]);
    assert.equal(beklerkenKosan, 1);

    assert.equal(ilk.statusCode, 200, ilk.body);
    assert.equal(ikinci.statusCode, 200, ikinci.body);
    assert.deepEqual(ikinci.json(), ilk.json());
    assert.equal(kosma - once, 1);
    assert.equal(await sayim('yaris'), 1);
    assert.equal(await denetim('yaris'), 1);
    assert.equal((await anahtarlar(kimlik)).length, 1);
  });

  test('yarış: ilk istek hata verip geri alınırsa bekleyen ikinci taze çalışır', async () => {
    const kimlik = randomUUID();
    const once = kosma;
    const kapi = kapidaBeklet(cakisma('Deneme çakışması.'));
    const a = gonder('/deneme-tekrar/yaris-hata/say', { kimlik });
    await kapi.basladi;
    const b = gonder('/deneme-tekrar/yaris-hata/say', { kimlik });
    await kilitBekleyeniGor().finally(() => { kapi.ac(); });
    const [ilk, ikinci] = await Promise.all([a, b]);

    assert.equal(ilk.statusCode, 409, ilk.body);
    assert.equal(ikinci.statusCode, 200, ikinci.body);
    assert.equal(kosma - once, 2);
    assert.equal(await sayim('yaris-hata'), 1);
    assert.equal(await denetim('yaris-hata'), 1);
    assert.deepEqual((await anahtarlar(kimlik)).map((s) => s.cevap), [ikinci.json()]);
  });

  test('bekleme sunucunun sorgu süre sınırını aşarsa 503 MESGUL döner (4xx değil); aynı kimlikle yeniden deneme ilk cevabı alır', async (t) => {
    const kimlik = randomUUID();
    const once = kosma;
    const kapi = kapidaBeklet();
    const a = gonder('/deneme-tekrar/sure/say', { kimlik });
    await kapi.basladi;
    const baslangic = performance.now();
    const bekleyen = await gonder('/deneme-tekrar/sure/say', { kimlik, uyg: kisaApp });
    const gecen = Math.round(performance.now() - baslangic);
    t.diagnostic(`sorgu süre sınırı ${KISA_SORGU_SURE_MS} ms; bekleyen istek ${gecen} ms sonra ${bekleyen.statusCode} aldı`);
    // Kapı doğrulamadan önce açılır: düşen doğrulama ilk isteği asılı bırakıp koşuyu kilitlemesin.
    kapi.ac();
    const ilk = await a;

    assert.equal(bekleyen.statusCode, 503, bekleyen.body);
    assert.equal(bekleyen.json().kod, 'MESGUL');
    assert.ok(gecen >= KISA_SORGU_SURE_MS, `erken döndü: ${gecen} ms`);
    assert.equal(ilk.statusCode, 200, ilk.body);

    const yeniden = await gonder('/deneme-tekrar/sure/say', { kimlik, uyg: kisaApp });
    assert.equal(yeniden.statusCode, 200, yeniden.body);
    assert.deepEqual(yeniden.json(), ilk.json());
    assert.equal(kosma - once, 1);
    assert.equal(await sayim('sure'), 1);
  });

  test('bekleme kilit süre sınırıyla biter: sınır dolunca 503 MESGUL, bağlantı bırakılır; ilki bitince yeniden deneme ilk cevabı alır', async (t) => {
    assert.ok(ANAHTAR_BEKLEME_MS < 5000, 'bekleme sınırı istemcinin deneme süresinden kısa olmalı');
    const kimlik = randomUUID();
    const once = kosma;
    const kapi = kapidaBeklet();
    const a = gonder('/deneme-tekrar/kilit-siniri/say', { kimlik });
    await kapi.basladi;
    const baslangic = performance.now();
    const bekleyen = await gonder('/deneme-tekrar/kilit-siniri/say', { kimlik, uyg: kisaBeklemeApp });
    const gecen = Math.round(performance.now() - baslangic);
    t.diagnostic(`kilit bekleme sınırı ${KISA_BEKLEME_MS} ms; bekleyen istek ${gecen} ms sonra ${bekleyen.statusCode} aldı`);
    kapi.ac();
    const ilk = await a;

    assert.equal(bekleyen.statusCode, 503, bekleyen.body);
    assert.equal(bekleyen.json().kod, 'MESGUL');
    assert.ok(gecen >= KISA_BEKLEME_MS, `erken döndü: ${gecen} ms`);
    // Sınır işlemeseydi istek havuzun sorgu süre sınırına kadar beklerdi.
    assert.ok(gecen < KISA_BEKLEME_MS + 2000, `geç döndü: ${gecen} ms`);
    assert.equal(ilk.statusCode, 200, ilk.body);

    const yeniden = await gonder('/deneme-tekrar/kilit-siniri/say', { kimlik, uyg: kisaBeklemeApp });
    assert.equal(yeniden.statusCode, 200, yeniden.body);
    assert.deepEqual(yeniden.json(), ilk.json());
    assert.equal(kosma - once, 1);
    assert.equal(await sayim('kilit-siniri'), 1);
  });

  test('yetki tekrar denetiminden önce gelir: yetkisi alınan kişi saklı kimlikle 403, oturumu biten 401 alır; saklı cevap sızmaz', async () => {
    const kimlik = randomUUID();
    const once = islemliKosma;
    const yetkili = await gonder('/deneme-tekrar/islemli', { kim: 'ucuncu', kimlik, govde: undefined });
    assert.equal(yetkili.statusCode, 200, yetkili.body);
    const yinelenen = await gonder('/deneme-tekrar/islemli', { kim: 'ucuncu', kimlik, govde: undefined });
    assert.deepEqual([yinelenen.statusCode, yinelenen.json()], [200, yetkili.json()]);
    assert.equal(islemliKosma - once, 1);

    await vt().sorgu("UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = 'operator') WHERE kisi_id = $1", [ucuncuId]);
    const yetkisiz = await gonder('/deneme-tekrar/islemli', { kim: 'ucuncu', kimlik, govde: undefined });
    assert.equal(yetkisiz.statusCode, 403, yetkisiz.body);
    assert.equal(yetkisiz.json().kod, 'YETKI_YOK');
    assert.equal(yetkisiz.json().kosma, undefined);

    await vt().sorgu('UPDATE oturum SET kapandi = now() WHERE kisi_id = $1 AND kapandi IS NULL', [ucuncuId]);
    const oturumsuz = await gonder('/deneme-tekrar/islemli', { kim: 'ucuncu', kimlik, govde: undefined });
    assert.equal(oturumsuz.statusCode, 401, oturumsuz.body);
    assert.equal(oturumsuz.json().kosma, undefined);
    assert.equal(islemliKosma - once, 1);
  });

  test('özet sorguyu da kapsar: kimlik başka sorguyla gelirse 422 GECERSIZ, aynı sorguyla ilk cevabı alır', async () => {
    const kimlik = randomUUID();
    const ilk = await gonder('/deneme-tekrar/sorgulu?zorla=evet', { kimlik, govde: undefined });
    assert.deepEqual([ilk.statusCode, ilk.json()], [200, { zorla: 'evet' }]);
    const once = kosma;

    const ayni = await gonder('/deneme-tekrar/sorgulu?zorla=evet', { kimlik, govde: undefined });
    assert.deepEqual([ayni.statusCode, ayni.json()], [200, { zorla: 'evet' }]);
    for (const yol of ['/deneme-tekrar/sorgulu?zorla=hayir', '/deneme-tekrar/sorgulu']) {
      const baska = await gonder(yol, { kimlik, govde: undefined });
      assert.equal(baska.statusCode, 422, `${yol}: ${baska.body}`);
      assert.equal(baska.json().kod, 'GECERSIZ');
    }
    assert.equal(kosma, once);
  });

  test('kimlik başka gövdeyle ya da başka parametreyle gelirse 422 GECERSIZ; alan sırası değişen aynı gövde ilk cevabı alır', async () => {
    const kimlik = randomUUID();
    const ilk = await gonder('/deneme-tekrar/govde/say', { kimlik, govde: { adet: 2, not: 'a' } });
    assert.equal(ilk.statusCode, 200, ilk.body);
    const once = kosma;

    const ayniSirasiz = await gonder('/deneme-tekrar/govde/say', { kimlik, govde: { not: 'a', adet: 2 } });
    assert.equal(ayniSirasiz.statusCode, 200, ayniSirasiz.body);
    assert.deepEqual(ayniSirasiz.json(), ilk.json());

    const baskaGovde = await gonder('/deneme-tekrar/govde/say', { kimlik, govde: { adet: 3, not: 'a' } });
    assert.equal(baskaGovde.statusCode, 422, baskaGovde.body);
    assert.deepEqual(baskaGovde.json(), { kod: 'GECERSIZ', mesaj: 'Bu istek kimliği başka bir istekte kullanılmış.' });

    const baskaParametre = await gonder('/deneme-tekrar/govde-2/say', { kimlik, govde: { adet: 2, not: 'a' } });
    assert.equal(baskaParametre.statusCode, 422, baskaParametre.body);

    assert.equal(kosma, once);
    assert.equal(await sayim('govde'), 1);
    assert.equal(await sayim('govde-2'), 0);
    assert.deepEqual((await anahtarlar(kimlik)).map((s) => s.cevap), [ilk.json()]);
  });

  test('kimlik başka uçta kullanılırsa 422 GECERSIZ; işleyici koşmaz', async () => {
    const kimlik = randomUUID();
    const ilk = await gonder('/deneme-tekrar/uc/say', { kimlik });
    assert.equal(ilk.statusCode, 200, ilk.body);
    const once = kosma;

    const baska = await gonder('/deneme-tekrar/uc/baska', { kimlik });
    assert.equal(baska.statusCode, 422, baska.body);
    assert.equal(baska.json().kod, 'GECERSIZ');
    assert.equal(kosma, once);
    assert.equal(await sayim('uc'), 1);

    const taze = await gonder('/deneme-tekrar/uc/baska', { kimlik: randomUUID() });
    assert.equal(taze.statusCode, 200, taze.body);
  });

  test('hata cevabı saklanmaz: yazı ve anahtar geri alınır, aynı kimlikle yeniden deneme taze çalışır', async () => {
    const kimlik = randomUUID();
    const once = kosma;
    siradaki = { hata: cakisma('Deneme çakışması.') };
    const hatali = await gonder('/deneme-tekrar/hata/say', { kimlik });
    assert.equal(hatali.statusCode, 409, hatali.body);
    assert.equal(await sayim('hata'), 0);
    assert.deepEqual(await anahtarlar(kimlik), []);

    const yeniden = await gonder('/deneme-tekrar/hata/say', { kimlik });
    assert.equal(yeniden.statusCode, 200, yeniden.body);
    assert.equal(kosma - once, 2);
    assert.equal(await sayim('hata'), 1);

    const ucuncu = await gonder('/deneme-tekrar/hata/say', { kimlik });
    assert.deepEqual(ucuncu.json(), yeniden.json());
    assert.equal(kosma - once, 2);
  });

  test('yazıları kalan ret de saklanmaz: yazı kalır, anahtar bırakılır, yeniden deneme taze çalışır', async () => {
    const kimlik = randomUUID();
    siradaki = { hata: new UygulamaHatasi('CAKISMA', 'Deneme reddi.', { yazilarKalir: true }) };
    const ret = await gonder('/deneme-tekrar/kalir/say', { kimlik });
    assert.equal(ret.statusCode, 409, ret.body);
    assert.equal(await sayim('kalir'), 1);
    assert.deepEqual(await anahtarlar(kimlik), []);

    const yeniden = await gonder('/deneme-tekrar/kalir/say', { kimlik });
    assert.equal(yeniden.statusCode, 200, yeniden.body);
    assert.equal(await sayim('kalir'), 2);
  });

  test('korumalı uç kimliksiz ya da bozuk kimlikli isteği 400 ile reddeder, işleyici koşmaz; oturumsuz istek 401 alır', async () => {
    const once = kosma;
    const onceAnahtar = await anahtarSayisi();
    const alan = ISTEK_KIMLIGI_BASLIGI;

    const yok = await gonder('/deneme-tekrar/baslik/say');
    assert.equal(yok.statusCode, 400, yok.body);
    assert.deepEqual(yok.json(), { kod: 'DOGRULAMA', mesaj: 'Bu komut istek kimliği ister.', alan });

    for (const bozuk of ['uuid-degil', '', `${randomUUID()}0`, randomUUID().replaceAll('-', '')]) {
      const cevap = await gonder('/deneme-tekrar/baslik/say', { kimlik: bozuk });
      assert.equal(cevap.statusCode, 400, `${bozuk}: ${cevap.body}`);
      assert.deepEqual(cevap.json(), { kod: 'DOGRULAMA', mesaj: 'İstek kimliği UUID biçiminde olmalı.', alan });
    }

    const oturumsuz = await gonder('/deneme-tekrar/baslik/say', { kim: null, kimlik: randomUUID() });
    assert.equal(oturumsuz.statusCode, 401, oturumsuz.body);

    assert.equal(kosma, once);
    assert.equal(await sayim('baslik'), 0);
    assert.equal(await anahtarSayisi(), onceAnahtar);

    const gecerli = await gonder('/deneme-tekrar/baslik/say', { kimlik: randomUUID().toUpperCase() });
    assert.equal(gecerli.statusCode, 200, gecerli.body);
    assert.equal(await sayim('baslik'), 1);
  });

  test('anahtar kişiye özeldir: başka kişinin aynı kimliği ayrı istek sayılır, kendi cevabını alır', async () => {
    const kimlik = randomUUID();
    const once = kosma;
    const birinci = await gonder('/deneme-tekrar/kisi/say', { kimlik, govde: { adet: 1 } });
    const ikinci = await gonder('/deneme-tekrar/kisi/say', { kim: 'ikinci', kimlik, govde: { adet: 9 } });
    assert.equal(birinci.statusCode, 200, birinci.body);
    assert.equal(ikinci.statusCode, 200, ikinci.body);
    assert.equal(ikinci.json().adet, 9);
    assert.equal(kosma - once, 2);
    assert.equal(await sayim('kisi'), 2);
    assert.deepEqual((await anahtarlar(kimlik)).map((s) => s.cevap), [birinci.json(), ikinci.json()]);

    const birinciYine = await gonder('/deneme-tekrar/kisi/say', { kimlik, govde: { adet: 1 } });
    const ikinciYine = await gonder('/deneme-tekrar/kisi/say', { kim: 'ikinci', kimlik, govde: { adet: 9 } });
    assert.deepEqual(birinciYine.json(), birinci.json());
    assert.deepEqual(ikinciYine.json(), ikinci.json());
    assert.equal(kosma - once, 2);
  });

  test('saklama süresi: süresi dolan satır sonraki komutta silinir, dolmayan kalır ve cevabını vermeyi sürdürür', async () => {
    const eski = randomUUID();
    const taze = randomUUID();
    const eskiCevap = await gonder('/deneme-tekrar/saklama/say', { kimlik: eski });
    const tazeCevap = await gonder('/deneme-tekrar/saklama/say', { kimlik: taze });
    assert.equal(eskiCevap.statusCode, 200, eskiCevap.body);
    await eskit(eski, SAKLAMA_SAAT + 1);
    await eskit(taze, SAKLAMA_SAAT - 1);
    assert.equal((await anahtarlar(eski)).length, 1);

    const tetik = await gonder('/deneme-tekrar/saklama/say', { kimlik: randomUUID() });
    assert.equal(tetik.statusCode, 200, tetik.body);
    assert.deepEqual(await anahtarlar(eski), []);
    assert.equal((await anahtarlar(taze)).length, 1);

    const once = kosma;
    const tazeYine = await gonder('/deneme-tekrar/saklama/say', { kimlik: taze });
    assert.deepEqual(tazeYine.json(), tazeCevap.json());
    assert.equal(kosma, once);
    const eskiYine = await gonder('/deneme-tekrar/saklama/say', { kimlik: eski });
    assert.equal(eskiYine.statusCode, 200, eskiYine.body);
    assert.notDeepEqual(eskiYine.json(), eskiCevap.json());
    assert.equal(kosma - once, 1);
  });

  test('temizlik sınırlıdır: tek komut en çok sınır kadar eski satır siler', async () => {
    const fazla = 5;
    await vt().sorgu(
      `INSERT INTO istek_kimligi (kisi_id, istek_kimligi, uc, govde_ozeti, durum_kodu, olusma)
       SELECT $1, gen_random_uuid(), 'POST /eski', 'x', 204, now() - make_interval(hours => $2)
         FROM generate_series(1, $3::int)`,
      [yoneticiId, SAKLAMA_SAAT * 2, TEMIZLIK_SINIRI + fazla],
    );
    const eskiSayisi = async (): Promise<number> =>
      (await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM istek_kimligi WHERE uc = 'POST /eski'"))?.n ?? -1;
    assert.equal(await eskiSayisi(), TEMIZLIK_SINIRI + fazla);

    assert.equal((await gonder('/deneme-tekrar/sinir/say', { kimlik: randomUUID() })).statusCode, 200);
    assert.equal(await eskiSayisi(), fazla);
    assert.equal((await gonder('/deneme-tekrar/sinir/say', { kimlik: randomUUID() })).statusCode, 200);
    assert.equal(await eskiSayisi(), 0);
  });

  test('temizlik başkasının kilitlediği eski satırı beklemez: komut hemen cevaplanır, satır sonraki komutta silinir', async () => {
    await vt().sorgu(
      `INSERT INTO istek_kimligi (kisi_id, istek_kimligi, uc, govde_ozeti, durum_kodu, olusma)
       VALUES ($1, gen_random_uuid(), 'POST /kilitli', 'x', 204, now() - make_interval(hours => $2))`,
      [yoneticiId, SAKLAMA_SAAT * 2],
    );
    const kilitliSayisi = async (): Promise<number> =>
      (await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM istek_kimligi WHERE uc = 'POST /kilitli'"))?.n ?? -1;
    let birak = (): void => undefined;
    let kilitlendi = (): void => undefined;
    const kapi = new Promise<void>((coz) => { birak = coz; });
    const hazir = new Promise<void>((coz) => { kilitlendi = coz; });
    const tutan = vt().tx(async (db) => {
      await db.sorgu("SELECT 1 FROM istek_kimligi WHERE uc = 'POST /kilitli' FOR UPDATE");
      kilitlendi();
      await kapi;
    });
    await hazir;
    // Kısa süre sınırlı havuz: kilidi bekleyen temizlik sınırı aşar ve komutu düşürür.
    const cevap = await gonder('/deneme-tekrar/kilit/say', { kimlik: randomUUID(), uyg: kisaApp });
    birak();
    await tutan;

    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.equal(await kilitliSayisi(), 1);
    assert.equal((await gonder('/deneme-tekrar/kilit/say', { kimlik: randomUUID() })).statusCode, 200);
    assert.equal(await kilitliSayisi(), 0);
  });

  test('bayraksız uç başlığı yok sayar: bozuk ya da yinelenen kimlikle her istek koşar, anahtar yazılmaz', async () => {
    const once = kosma;
    const onceAnahtar = await anahtarSayisi();
    const onceSayim = await sayim('duz');
    const kimlik = randomUUID();
    for (const deger of [kimlik, kimlik, 'uuid-degil', null]) {
      const cevap = await gonder('/deneme-tekrar/duz', { kimlik: deger, govde: { adet: 2 } });
      assert.equal(cevap.statusCode, 200, cevap.body);
    }
    assert.equal(kosma - once, 4);
    assert.equal((await sayim('duz')) - onceSayim, 4);
    assert.equal(await anahtarSayisi(), onceAnahtar);
  });

  test('tekrar korumalı uç çerez yazamaz: tanım hatası 500 verir, yazı ve anahtar geri alınır', async () => {
    const kimlik = randomUUID();
    const cevap = await gonder('/deneme-tekrar/cerez', { kimlik, govde: undefined });
    assert.equal(cevap.statusCode, 500, cevap.body);
    assert.equal(cevap.headers['set-cookie'], undefined);
    assert.equal(await sayim('cerez'), 0);
    assert.deepEqual(await anahtarlar(kimlik), []);
  });
});
