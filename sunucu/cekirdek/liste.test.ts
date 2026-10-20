import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AZAMI_SAYFA_BOYU, VARSAYILAN_SAYFA_BOYU, listeCevapSemasi, listeSorguAlanlari, sayfaSorguAlanlari } from '#paylasilan/liste.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type { Db } from './db.ts';
import { sayfaDilimi, sayfaliListe, siralamaSql, uygulananSayfaBoyu } from './liste.ts';
import type { Dilim, SiralamaTanimi } from './liste.ts';
import { testSemasiAc } from './test-vt.ts';
import type { TestVeritabani } from './test-vt.ts';
import { uc, uclariKaydet } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';

test('sayfa boyu: verilmezse varsayılan, üst sınırı aşarsa üst sınır, arada ise istenen uygulanır', () => {
  assert.equal(uygulananSayfaBoyu(undefined), VARSAYILAN_SAYFA_BOYU);
  assert.equal(uygulananSayfaBoyu(1), 1);
  assert.equal(uygulananSayfaBoyu(AZAMI_SAYFA_BOYU), AZAMI_SAYFA_BOYU);
  assert.equal(uygulananSayfaBoyu(AZAMI_SAYFA_BOYU + 1), AZAMI_SAYFA_BOYU);
  assert.equal(uygulananSayfaBoyu(2147483647), AZAMI_SAYFA_BOYU);
});

test('sayfa boyu: modül kendi varsayılanını ve üst sınırını verir; tutarsız sınır ve geçersiz istek tanım hatasıdır', () => {
  assert.equal(uygulananSayfaBoyu(undefined, { varsayilan: 10, azami: 20 }), 10);
  assert.equal(uygulananSayfaBoyu(20, { varsayilan: 10, azami: 20 }), 20);
  assert.equal(uygulananSayfaBoyu(21, { varsayilan: 10, azami: 20 }), 20);
  // Yalnız varsayılanı büyüten modülde üst sınır onun altında kalmaz.
  assert.equal(uygulananSayfaBoyu(undefined, { varsayilan: 500 }), 500);
  assert.equal(uygulananSayfaBoyu(900, { varsayilan: 500 }), 500);
  assert.equal(uygulananSayfaBoyu(900, { azami: 1000 }), 900);
  for (const sinir of [{ varsayilan: 0 }, { azami: 0 }, { varsayilan: 30, azami: 20 }, { varsayilan: 1.5 }, { azami: Number.NaN }]) {
    assert.throws(() => uygulananSayfaBoyu(undefined, sinir), /Geçersiz sayfa boyu sınırı/, JSON.stringify(sinir));
  }
  for (const istenen of [0, -1, 2.5, Number.NaN]) assert.throws(() => uygulananSayfaBoyu(istenen), /Geçersiz sayfa boyu/, String(istenen));
});

test('sayfa dilimi: sınır sayfa boyudur, atlanan önceki sayfaların satırıdır', () => {
  assert.deepEqual(sayfaDilimi(1, 50), { sinir: 50, atla: 0 });
  assert.deepEqual(sayfaDilimi(2, 50), { sinir: 50, atla: 50 });
  assert.deepEqual(sayfaDilimi(7, 25), { sinir: 25, atla: 150 });
  for (const [sayfa, boy] of [[0, 50], [1, 0], [1.5, 50], [-1, 50]] as const) assert.throws(() => sayfaDilimi(sayfa, boy), /Geçersiz sayfa/);
});

const SIRALAMA: SiralamaTanimi<'ad' | 'grup'> = { sutunlar: { ad: 'k.ad', grup: 'lower(k.grup)' }, ikincil: 'k.id' };

test('sıralama: izinli anahtar modülün sütununa çevrilir, yön iki sütuna da uygulanır, ikincil anahtar sona eklenir', () => {
  assert.equal(siralamaSql(SIRALAMA, { sirala: 'ad', yon: 'artan' }), 'k.ad ASC, k.id ASC');
  assert.equal(siralamaSql(SIRALAMA, { sirala: 'ad', yon: 'azalan' }), 'k.ad DESC, k.id DESC');
  assert.equal(siralamaSql(SIRALAMA, { sirala: 'grup', yon: 'azalan' }), 'lower(k.grup) DESC, k.id DESC');
  assert.equal(siralamaSql(SIRALAMA, { sirala: 'grup' }), 'lower(k.grup) ASC, k.id ASC');
});

test('sıralama: istek sıralama vermezse modülün varsayılanı, o da yoksa yalnız ikincil anahtar uygulanır', () => {
  assert.equal(siralamaSql(SIRALAMA), 'k.id ASC');
  assert.equal(siralamaSql(SIRALAMA, { yon: 'azalan' }), 'k.id ASC');
  const varsayilanli = { ...SIRALAMA, varsayilan: { sutun: 'k.guncelleme', yon: 'azalan' } } as const;
  assert.equal(siralamaSql(varsayilanli, { yon: 'artan' }), 'k.guncelleme DESC, k.id DESC');
  assert.equal(siralamaSql(varsayilanli, { sirala: 'ad', yon: 'artan' }), 'k.ad ASC, k.id ASC');
});

test('sıralama: eşlemede olmayan ad ve bilinmeyen yön SQL parçasına dönüşmez, fırlatır', () => {
  const tipsiz = siralamaSql as (tanim: unknown, istek: unknown) => string;
  for (const sirala of ['id', 'k.ad', 'constructor', 'toString', '__proto__', 'ad; DROP TABLE k', '']) {
    assert.throws(() => tipsiz(SIRALAMA, { sirala, yon: 'artan' }), /eşlemesinde yok/, sirala);
  }
  for (const yon of ['DESC', 'asc; DROP TABLE k', 'toString', '']) {
    assert.throws(() => tipsiz(SIRALAMA, { sirala: 'ad', yon }), /Geçersiz sıralama yönü/, yon);
  }
});

function sahteKaynak(toplam: number): { say: () => Promise<number>; satirlar: (d: Dilim) => Promise<number[]>; dilimler: Dilim[] } {
  const dilimler: Dilim[] = [];
  return {
    dilimler,
    say: async () => toplam,
    satirlar: async (dilim) => {
      dilimler.push(dilim);
      return Array.from({ length: Math.max(0, Math.min(dilim.sinir, toplam - dilim.atla)) }, (_, i) => dilim.atla + i + 1);
    },
  };
}

test('sayfalı liste: sayılan listede taşan sayfa son sayfaya çekilir; cevap uygulanan sayfayı ve boyu taşır', async () => {
  const kaynak = sahteKaynak(23);
  assert.deepEqual(await sayfaliListe({ sayfa: 2, sayfaBoyu: 10 }, kaynak), {
    satirlar: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], toplam: 23, sayfa: 2, sayfaBoyu: 10,
  });
  assert.deepEqual(await sayfaliListe({ sayfa: 3, sayfaBoyu: 10 }, kaynak), { satirlar: [21, 22, 23], toplam: 23, sayfa: 3, sayfaBoyu: 10 });
  assert.deepEqual(await sayfaliListe({ sayfa: 4, sayfaBoyu: 10 }, kaynak), { satirlar: [21, 22, 23], toplam: 23, sayfa: 3, sayfaBoyu: 10 });
  assert.deepEqual(await sayfaliListe({ sayfa: 99999, sayfaBoyu: 10 }, kaynak), { satirlar: [21, 22, 23], toplam: 23, sayfa: 3, sayfaBoyu: 10 });
  assert.deepEqual(kaynak.dilimler, [{ sinir: 10, atla: 10 }, { sinir: 10, atla: 20 }, { sinir: 10, atla: 20 }, { sinir: 10, atla: 20 }]);
});

test('sayfalı liste: tam dolu son sayfanın ötesi boş sayfa açmaz; kayıtsız listede sayfa 1, toplam 0 ve satır sorgusu atılmaz', async () => {
  const dolu = sahteKaynak(20);
  assert.deepEqual((await sayfaliListe({ sayfa: 3, sayfaBoyu: 10 }, dolu)).sayfa, 2);
  assert.deepEqual(dolu.dilimler, [{ sinir: 10, atla: 10 }]);

  const bos = sahteKaynak(0);
  assert.deepEqual(await sayfaliListe({ sayfa: 5 }, bos), { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: VARSAYILAN_SAYFA_BOYU });
  assert.deepEqual(bos.dilimler, []);
});

test('sayfalı liste: sayılmayan listede toplam null döner (0 değil); taşan sayfa çekilmez, boş döner', async () => {
  const { satirlar, dilimler } = sahteKaynak(23);
  assert.deepEqual(await sayfaliListe({ sayfa: 3, sayfaBoyu: 10 }, { satirlar }), { satirlar: [21, 22, 23], toplam: null, sayfa: 3, sayfaBoyu: 10 });
  assert.deepEqual(await sayfaliListe({ sayfa: 9, sayfaBoyu: 10 }, { satirlar }), { satirlar: [], toplam: null, sayfa: 9, sayfaBoyu: 10 });
  assert.deepEqual(dilimler, [{ sinir: 10, atla: 20 }, { sinir: 10, atla: 80 }]);
});

test('sayfalı liste: sınırı aşan sayfa boyu üst sınıra çekilir ve sorguya çekilmiş sınır gider; bozuk sayım fırlatır', async () => {
  const kaynak = sahteKaynak(1000);
  const cevap = await sayfaliListe({ sayfa: 2, sayfaBoyu: 100000 }, kaynak);
  assert.equal(cevap.sayfaBoyu, AZAMI_SAYFA_BOYU);
  assert.equal(cevap.satirlar.length, AZAMI_SAYFA_BOYU);
  assert.deepEqual(kaynak.dilimler, [{ sinir: AZAMI_SAYFA_BOYU, atla: AZAMI_SAYFA_BOYU }]);

  const modulSinirli = await sayfaliListe({ sayfa: 1, sayfaBoyu: 100000 }, { ...sahteKaynak(1000), sayfaBoyu: { varsayilan: 10, azami: 20 } });
  assert.equal(modulSinirli.sayfaBoyu, 20);
  assert.equal(modulSinirli.satirlar.length, 20);

  for (const toplam of [-1, 1.5, Number.NaN]) {
    await assert.rejects(sayfaliListe({ sayfa: 1 }, { say: async () => toplam, satirlar: async () => [] }), /Geçersiz toplam/, String(toplam));
  }
});

// Bir modülün sözleşmesinde duracak şemalar.
const KALEM_SIRALAMA_ALANLARI = ['ad', 'grup'] as const;
const kalemSemasi = z.object({ id: z.number().int(), ad: z.string(), grup: z.string().nullable() });
const kalemListeSorgusu = z.object({ ...listeSorguAlanlari(KALEM_SIRALAMA_ALANLARI), grup: z.string().max(20).optional() });
const kalemListeCevabi = listeCevapSemasi(kalemSemasi);
type Kalem = z.output<typeof kalemSemasi>;
type KalemListeSorgusu = z.output<typeof kalemListeSorgusu>;

// Bir modülün `sorgular.ts` dosyasında duracaklar: süzgeç parçası sayım ile satır sorgusunda aynıdır.
const KALEM_SIRALAMA: SiralamaTanimi<(typeof KALEM_SIRALAMA_ALANLARI)[number]> = {
  sutunlar: { ad: 'k.ad', grup: 'k.grup' },
  ikincil: 'k.id',
};
const KALEM_SUZGECI = 'FROM liste_kalem k WHERE ($1::text IS NULL OR k.grup = $1)';

const kalemSay = async (db: Db, grup: string | null): Promise<number> =>
  (await db.tek<{ toplam: number }>(`SELECT count(*) AS toplam ${KALEM_SUZGECI}`, [grup]))?.toplam ?? 0;

const kalemSatirlari = (db: Db, grup: string | null, sorgu: KalemListeSorgusu, dilim: Dilim): Promise<Kalem[]> =>
  db.sorgu<Kalem>(
    `SELECT k.id, k.ad, k.grup ${KALEM_SUZGECI} ORDER BY ${siralamaSql(KALEM_SIRALAMA, sorgu)} LIMIT $2 OFFSET $3`,
    [grup, dilim.sinir, dilim.atla],
  );

// Bir modülün `servis.ts` dosyasında duracak çağrı.
const kalemListesi = (db: Db, sorgu: KalemListeSorgusu): Promise<SayfaliListe<Kalem>> => {
  const grup = sorgu.grup ?? null;
  return sayfaliListe(sorgu, {
    say: () => kalemSay(db, grup),
    satirlar: (dilim) => kalemSatirlari(db, grup, sorgu, dilim),
    sayfaBoyu: { varsayilan: 10, azami: 20 },
  });
};

describe('sayfalı liste ucu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  const liste = async (sorgu: string): Promise<{ kod: number; govde: SayfaliListe<Kalem> }> => {
    const cevap = await app.inject({ method: 'GET', url: `/api/kalemler${sorgu}` });
    return { kod: cevap.statusCode, govde: cevap.json() };
  };
  const idler = (govde: SayfaliListe<Kalem>): number[] => govde.satirlar.map((k) => k.id);

  before(async () => {
    ortam = await testSemasiAc('liste');
    await ortam.sahip.sorgu('CREATE TABLE liste_kalem (id int PRIMARY KEY, ad text NOT NULL, grup text)');
    // 23 satır; ad yalnız üç değer alır (eşit değerli satır çok), grup: 8 satır a, 7 satır b, 8 satır boş.
    await ortam.sahip.sorgu(
      `INSERT INTO liste_kalem (id, ad, grup)
       SELECT n, (ARRAY['civata', 'somun', 'pul'])[1 + n % 3], (ARRAY[NULL, 'a', 'b'])[1 + n % 3] FROM generate_series(1, 23) n`,
    );

    app = Fastify();
    hataYonetiminiKur(app);
    uclariKaydet(app, [
      uc({ yontem: 'GET', yol: '/kalemler', yetki: 'acik', sorgu: kalemListeSorgusu, cevap: kalemListeCevabi, isle: ({ db, sorgu }) => kalemListesi(db, sorgu) }),
      uc({
        yontem: 'GET', yol: '/sayimsiz', yetki: 'acik', sorgu: z.object(sayfaSorguAlanlari), cevap: kalemListeCevabi,
        isle: ({ db, sorgu }) => sayfaliListe(sorgu, {
          satirlar: (dilim) => db.sorgu<Kalem>('SELECT id, ad, grup FROM liste_kalem ORDER BY id LIMIT $1 OFFSET $2', [dilim.sinir, dilim.atla]),
          sayfaBoyu: { varsayilan: 10, azami: 20 },
        }),
      }),
    ], { vt: ortam.vt, kimlik: async () => null });
  });

  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('sorgusuz istek ilk sayfayı modülün varsayılan boyuyla, ikincil anahtar sırasıyla ve toplamla döner', async () => {
    const { kod, govde } = await liste('');
    assert.equal(kod, 200);
    assert.deepEqual(idler(govde), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.deepEqual({ toplam: govde.toplam, sayfa: govde.sayfa, sayfaBoyu: govde.sayfaBoyu }, { toplam: 23, sayfa: 1, sayfaBoyu: 10 });
    assert.deepEqual(govde.satirlar[0], { id: 1, ad: 'somun', grup: 'a' });
  });

  test('sayfa sınırları: son sayfa kalan satırları taşır; taşan sayfa son sayfaya çekilir ve cevap uygulanan sayfayı söyler', async () => {
    const ikinci = (await liste('?sayfa=2')).govde;
    assert.deepEqual(idler(ikinci), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    const son = (await liste('?sayfa=3')).govde;
    assert.deepEqual({ idler: idler(son), sayfa: son.sayfa }, { idler: [21, 22, 23], sayfa: 3 });
    const tasan = (await liste('?sayfa=4')).govde;
    assert.deepEqual({ idler: idler(tasan), sayfa: tasan.sayfa, toplam: tasan.toplam }, { idler: [21, 22, 23], sayfa: 3, toplam: 23 });
    const uzak = (await liste('?sayfa=100000&sayfaBoyu=5')).govde;
    assert.deepEqual({ idler: idler(uzak), sayfa: uzak.sayfa, sayfaBoyu: uzak.sayfaBoyu }, { idler: [21, 22, 23], sayfa: 5, sayfaBoyu: 5 });
  });

  test('sayfa üst sınırını aşan istek 400 almaz: sayılan listede son sayfaya, sayılmayanda üst sınıra çekilir', async () => {
    for (const sayfa of ['100001', '999999999']) {
      const { kod, govde } = await liste(`?sayfa=${sayfa}`);
      assert.equal(kod, 200, sayfa);
      assert.deepEqual({ idler: idler(govde), sayfa: govde.sayfa }, { idler: [21, 22, 23], sayfa: 3 }, sayfa);
    }
    // En büyük sayfa boyuyla da atlanan satır sayısı veritabanı tam sayısına sığar: sorgu hata vermez.
    const sayimsiz = await app.inject({ method: 'GET', url: '/api/sayimsiz?sayfa=999999999&sayfaBoyu=20' });
    assert.equal(sayimsiz.statusCode, 200);
    assert.deepEqual(sayimsiz.json(), { satirlar: [], toplam: null, sayfa: 100000, sayfaBoyu: 20 });
  });

  test('sayfa boyu: istenen uygulanır; üst sınırı aşan boy üst sınıra çekilir ve o kadar satır döner', async () => {
    const kucuk = (await liste('?sayfaBoyu=4&sayfa=2')).govde;
    assert.deepEqual({ idler: idler(kucuk), sayfaBoyu: kucuk.sayfaBoyu }, { idler: [5, 6, 7, 8], sayfaBoyu: 4 });
    const asan = (await liste('?sayfaBoyu=1000')).govde;
    assert.deepEqual({ adet: asan.satirlar.length, sayfaBoyu: asan.sayfaBoyu, toplam: asan.toplam }, { adet: 20, sayfaBoyu: 20, toplam: 23 });
  });

  test('geçersiz sayfa ve sayfa boyu 400 DOGRULAMA döner, alanı ve Türkçe iletisiyle', async () => {
    for (const [sorgu, alan, mesaj] of [
      ['?sayfa=0', 'sayfa', 'En az 1 olmalı.'],
      ['?sayfa=iki', 'sayfa', 'Sayı bekleniyor.'],
      ['?sayfa=1.5', 'sayfa', 'Tam sayı bekleniyor.'],
      ['?sayfaBoyu=0', 'sayfaBoyu', 'En az 1 olmalı.'],
    ] as const) {
      const cevap = await app.inject({ method: 'GET', url: `/api/kalemler${sorgu}` });
      assert.equal(cevap.statusCode, 400, sorgu);
      assert.deepEqual({ kod: cevap.json().kod, alan: cevap.json().alan, mesaj: cevap.json().mesaj }, { kod: 'DOGRULAMA', alan, mesaj }, sorgu);
    }
  });

  test('izinsiz sıralama alanı ve yönü 400 DOGRULAMA döner; SQL parçası taşıyan değer tabloya dokunmaz', async () => {
    for (const sirala of ['id', 'k.ad', 'ad%3B%20DROP%20TABLE%20liste_kalem', 'ad%2Cgrup', '']) {
      const cevap = await app.inject({ method: 'GET', url: `/api/kalemler?sirala=${sirala}` });
      assert.equal(cevap.statusCode, 400, sirala);
      assert.deepEqual(
        { kod: cevap.json().kod, alan: cevap.json().alan, mesaj: cevap.json().mesaj },
        { kod: 'DOGRULAMA', alan: 'sirala', mesaj: 'Geçersiz seçenek. Geçerli değerler: ad, grup.' },
        sirala,
      );
    }
    const yon = await app.inject({ method: 'GET', url: '/api/kalemler?sirala=ad&yon=DESC' });
    assert.equal(yon.statusCode, 400);
    assert.deepEqual({ alan: yon.json().alan, mesaj: yon.json().mesaj }, { alan: 'yon', mesaj: 'Geçersiz seçenek. Geçerli değerler: artan, azalan.' });
    assert.equal((await liste('?sirala=ad')).kod, 200);
    assert.equal((await vt().tek<{ sayi: number }>('SELECT count(*) AS sayi FROM liste_kalem'))?.sayi, 23);
  });

  test('sıralama: izinli alan iki yönde sıralar; eşit değerli satırlar kimlikle dizilir ve sayfalar arasında yinelenmez', async () => {
    for (const yon of ['artan', 'azalan'] as const) {
      const toplanan: Kalem[] = [];
      for (const sayfa of [1, 2, 3, 4, 5]) toplanan.push(...(await liste(`?sirala=ad&yon=${yon}&sayfaBoyu=5&sayfa=${sayfa}`)).govde.satirlar);
      const isaret = yon === 'artan' ? 1 : -1;
      const beklenen = [...toplanan].sort((a, b) => isaret * (a.ad.localeCompare(b.ad, 'en') || a.id - b.id));
      assert.equal(toplanan.length, 23, yon);
      assert.equal(new Set(toplanan.map((k) => k.id)).size, 23, yon);
      assert.deepEqual(toplanan.map((k) => k.id), beklenen.map((k) => k.id), yon);
      assert.equal(toplanan[0]?.ad, yon === 'artan' ? 'civata' : 'somun');
    }
    // Yön verilmezse artan.
    assert.deepEqual(idler((await liste('?sirala=ad&sayfaBoyu=3')).govde), [3, 6, 9]);
    assert.deepEqual(idler((await liste('?sirala=ad&yon=azalan&sayfaBoyu=3')).govde), [22, 19, 16]);
  });

  test('toplam süzgece uyan bütün satırları sayar, sayfadakileri değil; hiç satır yoksa 0, ilk sayfa ve boş liste döner', async () => {
    const a = (await liste('?grup=a&sayfaBoyu=3')).govde;
    assert.deepEqual({ idler: idler(a), toplam: a.toplam, sayfa: a.sayfa }, { idler: [1, 4, 7], toplam: 8, sayfa: 1 });
    const tasan = (await liste('?grup=a&sayfaBoyu=3&sayfa=9')).govde;
    assert.deepEqual({ idler: idler(tasan), toplam: tasan.toplam, sayfa: tasan.sayfa }, { idler: [19, 22], toplam: 8, sayfa: 3 });
    const yok = (await liste('?grup=olmayan&sayfa=4')).govde;
    assert.deepEqual(yok, { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 10 });
  });

  test('sayılmayan liste toplamı null döner; son sayfa eksik satırdan anlaşılır, taşan sayfa boş ve istenen sayfayla döner', async () => {
    const cek = async (sorgu: string): Promise<SayfaliListe<Kalem>> => (await app.inject({ method: 'GET', url: `/api/sayimsiz${sorgu}` })).json();
    const ilk = await cek('');
    assert.deepEqual({ adet: ilk.satirlar.length, toplam: ilk.toplam, sayfa: ilk.sayfa, sayfaBoyu: ilk.sayfaBoyu }, { adet: 10, toplam: null, sayfa: 1, sayfaBoyu: 10 });
    const son = await cek('?sayfa=3');
    assert.deepEqual({ idler: idler(son), toplam: son.toplam, sayfa: son.sayfa }, { idler: [21, 22, 23], toplam: null, sayfa: 3 });
    assert.deepEqual(await cek('?sayfa=7'), { satirlar: [], toplam: null, sayfa: 7, sayfaBoyu: 10 });
  });
});
