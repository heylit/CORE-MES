import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { inspect } from 'node:util';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { VERI_BICIMI_ILETISI } from './db.ts';
import { yakalanmamisRetYaz } from './surec.ts';
import { testSemasiAc } from './test-vt.ts';
import type { TestVeritabani } from './test-vt.ts';
import { uc, uclariKaydet } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';

const CAKISMA_GOVDESI = { kod: 'CAKISMA', mesaj: 'Aynı bilgilerle bir kayıt zaten var.' };
const BAGIMLI_GOVDESI = {
  kod: 'BAGIMLI_KAYIT',
  mesaj: 'İşlem yapılamadı: bağlanmak istenen kayıt yok ya da bu kayda bağlı başka kayıtlar var.',
};
const GECERSIZ_GOVDESI = { kod: 'GECERSIZ', mesaj: 'Girilen değerler kabul edilmedi. Bilgileri kontrol edip yeniden deneyin.' };
const SUNUCU_GOVDESI = { kod: 'SUNUCU', mesaj: 'Beklenmeyen bir hata oluştu.' };

// Veritabanının kendi iletisinde geçen adlar; cevap gövdesinde hiçbiri görünmemeli.
const IC_ADLAR = ['kisit_ana', 'kisit_yavru', 'kod_tek', 'adet_arti', 'arti_sayi', 'ana_fk', 'ana_id', 'adet', 'INSERT', 'DELETE', 'constraint'];

interface Engel {
  bekle(): Promise<void>;
  gecen(): number;
}

// Beklenen sayıda çağrı gelene dek hepsini tutar: hepsi transaction'ını açmış ve henüz yazmamışken birlikte salınır.
function engelKur(beklenen: number): Engel {
  let gelen = 0;
  let gecen = 0;
  let ac: () => void = () => undefined;
  const acildi = new Promise<void>((coz) => { ac = coz; });
  return {
    async bekle(): Promise<void> {
      gelen += 1;
      if (gelen === beklenen) ac();
      await acildi;
      gecen += 1;
    },
    gecen: () => gecen,
  };
}

describe('kısıt ihlalleri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const gunluk: string[] = [];
  let engel: Engel | null = null;
  let ertelenmisIsleyiciBitti = 0;

  const oku = (yol: string) => app.inject({ method: 'GET', url: `/api${yol}` });

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  const gonder = (yol: string, govde?: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: `/api${yol}`, ...(govde ? { payload: govde } : {}) });

  const anaEkle = async (kod: string): Promise<number> => {
    const cevap = await gonder('/ana', { kod, adet: 1 });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return (cevap.json() as { id: number }).id;
  };

  const anaSayisi = async (kod: string): Promise<number> =>
    (await vt().sorgu('SELECT 1 FROM kisit_ana WHERE kod = $1', [kod])).length;

  const gunlukSatirlari = (msg: string): Array<Record<string, unknown>> =>
    gunluk.map((satir) => JSON.parse(satir) as Record<string, unknown>).filter((satir) => satir.msg === msg);

  function adSizmadi(govde: string): void {
    for (const ad of IC_ADLAR) assert.equal(govde.includes(ad), false, `cevapta iç ad geçiyor: ${ad}`);
  }

  before(async () => {
    ortam = await testSemasiAc('kisit');
    await ortam.sahip.sorgu(`
      CREATE TABLE kisit_ana (
        id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        kod text NOT NULL,
        adet int NOT NULL,
        aciklama text,
        CONSTRAINT kisit_ana_adet_arti CHECK (adet > 0)
      );
      CREATE UNIQUE INDEX kisit_ana_kod_tek ON kisit_ana (kod);
      CREATE TABLE kisit_yavru (
        id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        ana_id int NOT NULL CONSTRAINT kisit_yavru_ana_fk REFERENCES kisit_ana
      );
      CREATE DOMAIN kisit_arti_sayi AS int CONSTRAINT kisit_arti_sayi_arti CHECK (VALUE > 0);
      CREATE TABLE kisit_ertelenmis (
        id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        ana_id int NOT NULL CONSTRAINT kisit_ertelenmis_ana_fk REFERENCES kisit_ana DEFERRABLE INITIALLY DEFERRED
      );
    `);

    app = Fastify({ logger: { level: 'info', stream: { write: (satir: string) => { gunluk.push(satir); } } } });
    hataYonetiminiKur(app);
    const kimlikli = z.object({ id: z.number() });
    const ortak = { yontem: 'POST', yetki: 'acik' } as const;
    uclariKaydet(
      app,
      [
        uc({
          ...ortak, yol: '/ana', govde: z.object({ kod: z.string(), adet: z.number() }), cevap: kimlikli,
          isle: async ({ db, govde }) => {
            await engel?.bekle();
            return (await db.tek<{ id: number }>('INSERT INTO kisit_ana (kod, adet) VALUES ($1, $2) RETURNING id', [govde.kod, govde.adet]))!;
          },
        }),
        // GET salt okunur koşar, yazamaz: kısıt ihlali yazmadan, alan tipine çevirmeyle doğar.
        uc({
          yontem: 'GET', yetki: 'acik', yol: '/okuma/:adet', parametre: z.object({ adet: z.coerce.number() }), cevap: kimlikli,
          isle: async ({ db, parametre }) =>
            (await db.tek<{ id: number }>('SELECT $1::int::kisit_arti_sayi AS id', [parametre.adet]))!,
        }),
        // Ertelenmiş kısıt eklemede değil COMMIT'te denetlenir: işleyici hatasız döner.
        uc({
          ...ortak, yol: '/ertelenmis', govde: z.object({ anaId: z.number() }), cevap: kimlikli,
          isle: async ({ db, govde }) => {
            const satir = (await db.tek<{ id: number }>('INSERT INTO kisit_ertelenmis (ana_id) VALUES ($1) RETURNING id', [govde.anaId]))!;
            ertelenmisIsleyiciBitti += 1;
            return satir;
          },
        }),
        uc({
          ...ortak, yol: '/kodsuz', govde: z.object({ aciklama: z.string() }), cevap: kimlikli,
          isle: async ({ db, govde }) =>
            (await db.tek<{ id: number }>('INSERT INTO kisit_ana (kod, adet, aciklama) VALUES (NULL, 1, $1) RETURNING id', [govde.aciklama]))!,
        }),
        // Önce ana satır yazılır: bağlama reddedilirse o yazının da geri alındığı görülür.
        uc({
          ...ortak, yol: '/ana-ve-yavru', govde: z.object({ kod: z.string(), anaId: z.number().nullable() }), cevap: kimlikli,
          isle: async ({ db, govde }) => {
            const ana = (await db.tek<{ id: number }>('INSERT INTO kisit_ana (kod, adet) VALUES ($1, 1) RETURNING id', [govde.kod]))!;
            await db.sorgu('INSERT INTO kisit_yavru (ana_id) VALUES ($1)', [govde.anaId ?? ana.id]);
            return ana;
          },
        }),
        uc({
          ...ortak, yol: '/ana/:id/sil', parametre: z.object({ id: z.coerce.number() }), cevap: z.object({ silinen: z.number() }),
          isle: async ({ db, parametre }) =>
            ({ silinen: (await db.sorgu('DELETE FROM kisit_ana WHERE id = $1 RETURNING id', [parametre.id])).length }),
        }),
        uc({
          ...ortak, yol: '/bicimsiz', govde: z.object({ deger: z.string() }), cevap: kimlikli,
          isle: async ({ db, govde }) => (await db.tek<{ id: number }>('SELECT $1::int AS id', [govde.deger]))!,
        }),
        uc({
          ...ortak, yol: '/bozuk-sorgu', cevap: kimlikli,
          isle: async ({ db }) => (await db.tek<{ id: number }>('SELEC 1 AS id'))!,
        }),
      ],
      { vt: ortam.vt, kimlik: async () => null },
    );
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('aynı tekil değerle eşzamanlı iki eklemeden biri kabul edilir, öteki 409 CAKISMA alır; tek satır kalır', async () => {
    const ikili = engelKur(2);
    engel = ikili;
    const cevaplar = await Promise.all([gonder('/ana', { kod: 'es-zamanli', adet: 1 }), gonder('/ana', { kod: 'es-zamanli', adet: 1 })])
      .finally(() => { engel = null; });
    // İkisi de transaction'ını açıp eklemeden önce aynı anda bekledi: sıralı koşu engeli geçemez.
    assert.equal(ikili.gecen(), 2);
    assert.deepEqual(cevaplar.map((c) => c.statusCode).sort(), [200, 409]);
    const reddedilen = cevaplar.find((c) => c.statusCode === 409);
    assert.deepEqual(reddedilen?.json(), CAKISMA_GOVDESI);
    assert.equal(await anaSayisi('es-zamanli'), 1);

    const sonraki = await gonder('/ana', { kod: 'es-zamanli', adet: 1 });
    assert.equal(sonraki.statusCode, 409);
    assert.deepEqual(sonraki.json(), CAKISMA_GOVDESI);
    assert.equal(await anaSayisi('es-zamanli'), 1);
  });

  test('olmayan kayda bağlama 409 BAGIMLI_KAYIT alır ve önceki yazı geri alınır; var olana bağlama kabul edilir', async () => {
    const ret = await gonder('/ana-ve-yavru', { kod: 'yetim', anaId: 2_000_000_000 });
    assert.equal(ret.statusCode, 409);
    assert.deepEqual(ret.json(), BAGIMLI_GOVDESI);
    adSizmadi(ret.body);
    assert.equal(await anaSayisi('yetim'), 0);

    const kabul = await gonder('/ana-ve-yavru', { kod: 'sahipli', anaId: null });
    assert.equal(kabul.statusCode, 200, kabul.body);
    assert.equal(await anaSayisi('sahipli'), 1);
  });

  test('bağımlısı olan kaydı silme 409 BAGIMLI_KAYIT alır ve kayıt durur; bağımlısı olmayan silinir', async () => {
    const bagimli = (await gonder('/ana-ve-yavru', { kod: 'bagimli', anaId: null })).json() as { id: number };
    const ret = await gonder(`/ana/${bagimli.id}/sil`);
    assert.equal(ret.statusCode, 409);
    assert.deepEqual(ret.json(), BAGIMLI_GOVDESI);
    adSizmadi(ret.body);
    assert.equal(await anaSayisi('bagimli'), 1);

    const serbest = await anaEkle('serbest');
    const kabul = await gonder(`/ana/${serbest}/sil`);
    assert.equal(kabul.statusCode, 200, kabul.body);
    assert.deepEqual(kabul.json(), { silinen: 1 });
    assert.equal(await anaSayisi('serbest'), 0);
  });

  test('denetim kısıtına uymayan değer 422 GECERSIZ alır; uyan değer kabul edilir', async () => {
    const ret = await gonder('/ana', { kod: 'sifir-adet', adet: 0 });
    assert.equal(ret.statusCode, 422);
    assert.deepEqual(ret.json(), GECERSIZ_GOVDESI);
    adSizmadi(ret.body);
    assert.equal(await anaSayisi('sifir-adet'), 0);

    await anaEkle('arti-adet');
    assert.equal(await anaSayisi('arti-adet'), 1);
  });

  test('cevap gövdesi kısıt, tablo ve sütun adı ya da satır değeri taşımaz; günlük kısıtı adıyla, değeri olmadan yazar', async () => {
    await anaEkle('gizli-deger-41');
    // Veritabanının kendi iletisi bu adları taşır; sınanan şey onların cevaba geçmemesidir.
    await assert.rejects(vt().sorgu("INSERT INTO kisit_ana (kod, adet) VALUES ('gizli-deger-41', 1)"), /kisit_ana_kod_tek/);

    gunluk.length = 0;
    const ret = await gonder('/ana', { kod: 'gizli-deger-41', adet: 1 });
    assert.equal(ret.statusCode, 409);
    assert.deepEqual(ret.json(), CAKISMA_GOVDESI);
    adSizmadi(ret.body);
    assert.equal(ret.body.includes('gizli-deger-41'), false);

    assert.equal(gunlukSatirlari('Beklenmeyen hata').length, 0);
    assert.deepEqual(
      gunlukSatirlari('Kısıt ihlali').map((satir) => satir.kisit),
      [{ pgKodu: '23505', kisit: 'kisit_ana_kod_tek', tablo: 'kisit_ana' }],
    );
    assert.equal(gunluk.join('').includes('gizli-deger-41'), false);
  });

  test('okuma ucunda kısıt ihlali aynı cevabı alır; kısıta uyan değer kabul edilir', async () => {
    const kabul = await oku('/okuma/7');
    assert.equal(kabul.statusCode, 200, kabul.body);
    assert.deepEqual(kabul.json(), { id: 7 });

    gunluk.length = 0;
    const ret = await oku('/okuma/0');
    assert.equal(ret.statusCode, 422);
    assert.deepEqual(ret.json(), GECERSIZ_GOVDESI);
    adSizmadi(ret.body);
    assert.deepEqual(
      gunlukSatirlari('Kısıt ihlali').map((satir) => satir.kisit),
      [{ pgKodu: '23514', kisit: 'kisit_arti_sayi_arti', tablo: null }],
    );
  });

  test('COMMIT anında denetlenen ertelenmiş bağ ihlali 409 BAGIMLI_KAYIT alır ve yazı kalmaz; geçerli bağ kalır', async () => {
    const say = async (): Promise<number> => (await vt().sorgu('SELECT 1 FROM kisit_ertelenmis')).length;
    ertelenmisIsleyiciBitti = 0;
    const ret = await gonder('/ertelenmis', { anaId: 2_000_000_000 });
    // İşleyici hatasız bitti: ret eklemeden değil bitiş komutundan geldi.
    assert.equal(ertelenmisIsleyiciBitti, 1);
    assert.equal(ret.statusCode, 409);
    assert.deepEqual(ret.json(), BAGIMLI_GOVDESI);
    adSizmadi(ret.body);
    assert.equal(await say(), 0);

    const kabul = await gonder('/ertelenmis', { anaId: await anaEkle('ertelenmis-ana') });
    assert.equal(kabul.statusCode, 200, kabul.body);
    assert.equal(await say(), 1);
  });

  test('boş geçilemez ihlali 422 GECERSIZ döner; günlük kodu ve tabloyu yazar, satır değerini yazmaz', async () => {
    const DEGER = 'gizli-satir-77';
    // Veritabanının ayrıntı alanı reddedilen satırın bütün değerlerini taşır; sınanan şey günlüğe geçmemesidir.
    await assert.rejects(
      vt().sorgu('INSERT INTO kisit_ana (kod, adet, aciklama) VALUES (NULL, 1, $1)', [DEGER]),
      (hata: { code?: string; detail?: string }) => hata.code === '23502' && hata.detail?.includes(DEGER) === true,
    );

    gunluk.length = 0;
    const cevap = await gonder('/kodsuz', { aciklama: DEGER });
    assert.equal(cevap.statusCode, 422);
    assert.equal(cevap.json().kod, 'GECERSIZ');
    assert.equal(cevap.body.includes(DEGER), false);
    assert.equal(gunlukSatirlari('Kısıt ihlali').length, 0);
    assert.equal(gunlukSatirlari('Beklenmeyen hata').length, 0);

    const hatalar = gunlukSatirlari('Veritabanı değeri reddetti').map((satir) => satir.err as Record<string, unknown>);
    assert.equal(hatalar.length, 1);
    assert.deepEqual(
      { code: hatalar[0]?.code, table: hatalar[0]?.table, column: hatalar[0]?.column },
      { code: '23502', table: 'kisit_ana', column: 'kod' },
    );
    assert.equal(typeof hatalar[0]?.message, 'string');
    assert.equal(typeof hatalar[0]?.stack, 'string');
    assert.equal(gunluk.join('').includes(DEGER), false);
  });

  test('veri biçimi hatasında günlük kodu ve yığını yazar, girilen değeri yazmaz; yakalanmamış ret yolunda da aynı', async (t) => {
    const DEGER = 'gizli-deger-22';
    const yigindaCerceve = (yigin: unknown): boolean => typeof yigin === 'string' && /\n\s+at /.test(yigin);
    // Veritabanının iletisi ve yığının başlığı girilen değeri taşır; sınanan şey günlüğe geçmemesidir.
    const ham = await vt().sorgu('SELECT $1::int AS id', [DEGER]).catch((hata: unknown) => hata) as Error & { code?: string };
    assert.equal(ham.code, '22P02');
    assert.equal(ham.message.includes(DEGER), true);
    assert.equal(ham.stack?.includes(DEGER), true);

    assert.deepEqual((await gonder('/bicimsiz', { deger: '7' })).json(), { id: 7 });
    gunluk.length = 0;
    const cevap = await gonder('/bicimsiz', { deger: DEGER });
    assert.equal(cevap.statusCode, 422);
    assert.equal(cevap.json().kod, 'GECERSIZ');
    assert.equal(cevap.body.includes(DEGER), false);
    const istekte = gunlukSatirlari('Veritabanı değeri reddetti').map((satir) => satir.err as Record<string, unknown>);
    assert.deepEqual(istekte.map((err) => ({ code: err.code, message: err.message })), [{ code: '22P02', message: VERI_BICIMI_ILETISI }]);
    assert.equal(yigindaCerceve(istekte[0]?.stack), true);
    assert.equal(gunluk.join('').includes(DEGER), false);

    gunluk.length = 0;
    yakalanmamisRetYaz(app.log, ham);
    const rette = gunlukSatirlari('Yakalanmamış söz reddi').map((satir) => satir.err as Record<string, unknown>);
    assert.deepEqual(rette.map((err) => ({ code: err.code, message: err.message })), [{ code: '22P02', message: VERI_BICIMI_ILETISI }]);
    assert.equal(yigindaCerceve(rette[0]?.stack), true);
    assert.equal(gunluk.join('').includes(DEGER), false);

    // Günlükleyici hata verince yazılan yedek satır da süzülmüş izi taşır.
    const yedek = t.mock.method(console, 'error', () => undefined);
    yakalanmamisRetYaz({ error: (): void => { throw new Error('günlük kapalı'); } }, ham);
    const yedekMetni = yedek.mock.calls.map((cagri) => inspect(cagri.arguments, { depth: 5 })).join('\n');
    yedek.mock.restore();
    assert.equal(yedek.mock.callCount(), 1);
    assert.equal(yedekMetni.includes('22P02'), true);
    assert.equal(yedekMetni.includes(DEGER), false);

    // Süzgeç yalnız veri biçimi sınıfındadır: başka sınıfın iletisi tanı için günlükte kalır.
    gunluk.length = 0;
    const baska = await vt().sorgu('SELEC 1 AS id').catch((hata: unknown) => hata) as Error & { code?: string };
    assert.equal(baska.code, '42601');
    yakalanmamisRetYaz(app.log, baska);
    await gonder('/bozuk-sorgu');
    const iletiler = [...gunlukSatirlari('Yakalanmamış söz reddi'), ...gunlukSatirlari('Beklenmeyen hata')]
      .map((satir) => (satir.err as Record<string, unknown>).message);
    assert.deepEqual(iletiler, [baska.message, baska.message]);
  });

  test('kısıt dışındaki veritabanı hatası 500 SUNUCU kalır ve beklenmeyen hata olarak günlüğe düşer', async () => {
    gunluk.length = 0;
    const cevap = await gonder('/bozuk-sorgu');
    assert.equal(cevap.statusCode, 500);
    assert.deepEqual(cevap.json(), SUNUCU_GOVDESI);
    assert.equal(gunlukSatirlari('Beklenmeyen hata').length, 1);
    assert.equal(gunlukSatirlari('Kısıt ihlali').length, 0);
  });
});
