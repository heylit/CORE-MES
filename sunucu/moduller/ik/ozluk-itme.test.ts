import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { sifirlamaHazirla, testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, yoneticiOlustur } from '../kisiler/disari.ts';
import { OZLUK_SON_YONETICI_UYARISI, ozlukItmesi } from './kurallar.ts';
import { iptalEt, kaydet } from './servis.ts';

type Govde = Record<string, unknown>;

describe('IK-84 özlük itmesi kuralı (saf)', () => {
  const p = (ek: Govde): Govde => ({ ad: 'Ayşe', soyad: 'Deneme', sicilNo: 'S-1', pozisyon: 'Ayarcı', ...ek });
  test('yeni bağda iter; aynı alanlarda itmez; ilgisiz alan itmez; ad soyadla birleşir, boş alan null', () => {
    assert.deepEqual(ozlukItmesi(null, p({ kisiId: 5 })), {
      birak: null, it: { kisiId: 5, ad: 'Ayşe Deneme', sicilNo: 'S-1', gorev: 'Ayarcı', cikisTarihi: null },
    });
    assert.deepEqual(ozlukItmesi(p({ kisiId: 5 }), p({ kisiId: 5, telefon: '1' })), { birak: null, it: null });
    assert.deepEqual(ozlukItmesi(p({ kisiId: 5 }), p({ kisiId: 5, pozisyon: ' ', sicilNo: undefined }))?.it, {
      kisiId: 5, ad: 'Ayşe Deneme', sicilNo: null, gorev: null, cikisTarihi: null,
    });
    assert.equal(ozlukItmesi(p({ kisiId: 5 }), p({ kisiId: 5, cikisTarihi: '2026-12-31' })).it?.cikisTarihi, '2026-12-31');
  });
  test('bağ değişince eskisi bırakılır; bağ kalkınca ya da kart iptalinde itme yok; bağsız kartta hiçbir şey yok', () => {
    assert.deepEqual(ozlukItmesi(p({ kisiId: 5 }), p({ kisiId: 6 })).birak, 5);
    assert.deepEqual(ozlukItmesi(p({ kisiId: 5 }), p({})), { birak: 5, it: null });
    assert.deepEqual(ozlukItmesi(p({ kisiId: 5 }), null), { birak: 5, it: null });
    assert.deepEqual(ozlukItmesi(p({}), p({ ad: 'Başka' })), { birak: null, it: null });
  });
});

// 1302 a, 1315 a: İK personel kartı bağlı kişiye ad, sicil no, görev ve çıkışı iter. Veriler uydurmadır.
describe('İK personel kaydı kişiye iter (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let sifirla: (() => Promise<void>) | undefined;
  let yon: Kullanici;
  let im = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  beforeEach(async () => {
    if (!ortam) {
      ortam = await testVeritabaniKur('ik_ozluk');
      sifirla = await sifirlamaHazirla(ortam);
    }
    await sifirla!();
    await o().vt.tx(async (db) => {
      im = (await db.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('IKO1', 'Merkez') RETURNING id"))!.id;
      yon = (await kullaniciYukle(db, await yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'ik-ozluk-yon', parola: 'dogru-parola-1' })))!;
    });
  });
  after(async () => { await ortam?.kaldir(); });

  const kisiAc = (ad: string): Promise<number> => o().vt.tx(async (db) => (await db.tek<{ id: number }>('INSERT INTO kisi (ad) VALUES ($1) RETURNING id', [ad]))!.id);
  const kisi = (id: number) => o().sahip.tek<{ ad: string; sicil_no: string | null; gorev: string | null; aktif: boolean; ozluk_ik: boolean; cikis: string | null; surum: number }>(
    'SELECT ad, sicil_no, gorev, aktif, ozluk_ik, ozluk_cikis_tarihi::text AS cikis, surum FROM kisi WHERE id = $1', [id],
  );
  const personel = (ek: Govde): Govde => ({ id: 'emp_a', kind: 'emp', ad: 'Ayşe', soyad: 'Deneme', sicilNo: 'S-10', pozisyon: 'Ayarcı', isMerkeziId: im, ...ek });
  const yaz = (ek: Govde, surum: number | null, kim: Kullanici = yon) => o().vt.tx((db: Db) => kaydet(db, kim, 'personel', 'emp_a', personel(ek), surum));

  test('bağlanan kişiye ad soyad, sicil, pozisyon iter; ilgisiz alan kişiyi değiştirmez; pozisyon değişince yeniden iter', async () => {
    const k = await kisiAc('Eski Ad');
    const ilk = await yaz({ kisiId: k }, null);
    assert.deepEqual({ ...(await kisi(k)), surum: 0 }, { ad: 'Ayşe Deneme', sicil_no: 'S-10', gorev: 'Ayarcı', aktif: true, ozluk_ik: true, cikis: null, surum: 0 });
    const surum = (await kisi(k))!.surum;
    const ikinci = await yaz({ kisiId: k, telefon: '0000' }, ilk.kayit.surum);
    assert.equal((await kisi(k))!.surum, surum);
    await yaz({ kisiId: k, telefon: '0000', pozisyon: 'Usta' }, ikinci.kayit.surum);
    assert.equal((await kisi(k))!.gorev, 'Usta');
  });

  test('bağ başka kişiye geçince eski kişi serbest kalır; kart iptal edilince bağlı kişi serbest kalır, değerler durur', async () => {
    const a = await kisiAc('A'), b = await kisiAc('B');
    const ilk = await yaz({ kisiId: a }, null);
    const ikinci = await yaz({ kisiId: b }, ilk.kayit.surum);
    assert.deepEqual([(await kisi(a))!.ozluk_ik, (await kisi(b))!.ozluk_ik, (await kisi(b))!.ad], [false, true, 'Ayşe Deneme']);
    await o().vt.tx((db) => iptalEt(db, yon, 'personel', 'emp_a', ikinci.kayit.surum));
    assert.deepEqual([(await kisi(b))!.ozluk_ik, (await kisi(b))!.ad], [false, 'Ayşe Deneme']);
  });

  test('geçmiş çıkış kişiyi pasife alır; ileri tarih aktif bırakır ve saklanır', async () => {
    const gecmis = await kisiAc('Geçmiş'), ileri = await kisiAc('İleri');
    await yaz({ kisiId: gecmis, cikisTarihi: '2026-01-31' }, null);
    await o().vt.tx((db) => kaydet(db, yon, 'personel', 'emp_b', personel({ id: 'emp_b', sicilNo: 'S-11', kisiId: ileri, cikisTarihi: '2999-12-31' }), null));
    assert.deepEqual([(await kisi(gecmis))!.aktif, (await kisi(gecmis))!.cikis], [false, '2026-01-31']);
    assert.deepEqual([(await kisi(ileri))!.aktif, (await kisi(ileri))!.cikis], [true, '2999-12-31']);
  });

  test('son yönetici çıkışla pasife alınmaz, kayıt yazılır ve uyarı döner', async () => {
    const r = await yaz({ kisiId: yon.id, cikisTarihi: '2026-01-31' }, null);
    assert.equal((await kisi(yon.id))!.aktif, true);
    assert.match(r.uyari ?? '', new RegExp(OZLUK_SON_YONETICI_UYARISI));
  });

  test('itme reddedilirse personel kaydı da yazılmaz: yönetici olmayan yönetici hesabına itemez; sicil başka kişide', async () => {
    const ikci = await kisiAc('İK Uzmanı');
    const ik: Kullanici = { ...yon, id: ikci, ad: 'İK Uzmanı' };
    await assert.rejects(yaz({ kisiId: yon.id }, null, ik), (h: unknown) => h instanceof UygulamaHatasi && h.durum === 403);
    assert.equal(await o().sahip.tek("SELECT 1 FROM ik_personel WHERE kimlik = 'emp_a'"), null);
    assert.equal((await kisi(yon.id))!.ozluk_ik, false);

    await o().vt.tx((db) => db.sorgu("INSERT INTO kisi (ad, sicil_no) VALUES ('Sicilli', 'S-10')"));
    const k = await kisiAc('Hedef');
    await assert.rejects(yaz({ kisiId: k }, null), (h: unknown) => h instanceof UygulamaHatasi && h.durum === 409);
    assert.equal(await o().sahip.tek("SELECT 1 FROM ik_personel WHERE kimlik = 'emp_a'"), null);
    assert.equal((await kisi(k))!.ad, 'Hedef');
  });
});
