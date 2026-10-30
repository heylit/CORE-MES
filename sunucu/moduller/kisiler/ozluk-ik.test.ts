import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { sifirlamaHazirla, testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { ozlukBaginiKaldir, ozluguIkdenYaz, yoneticiOlustur } from './disari.ts';
import { isler } from './isler.ts';
import { ILETILER, cikisPasifiReddi, cikisliAktiflikReddi, ozlukDuzenlemeReddi, ozlukItmeReddi } from './kurallar.ts';
import { cikisiGelenleriPasifeAl, hesapAc, kisiEkle } from './servis.ts';

const PAROLA = 'dogru-parola-1';

describe('KS-8 - KS-10 kuralları (saf)', () => {
  const alan = { ad: 'Ayşe Deneme', sicilNo: 'S-1', gorev: 'Ayarcı' };
  test('KS-8: İK\'ya bağlı kişide alan değişikliği reddedilir, aynı değer geçer; bağsız kişide her değişiklik geçer', () => {
    assert.equal(ozlukDuzenlemeReddi({ ozlukIk: true, ...alan }, alan), null);
    assert.deepEqual(ozlukDuzenlemeReddi({ ozlukIk: true, ...alan }, { ...alan, gorev: 'Operatör' }), { tur: 'gecersiz', ileti: ILETILER.ozlukIkte });
    assert.deepEqual(ozlukDuzenlemeReddi({ ozlukIk: true, ...alan }, { ...alan, sicilNo: null }), { tur: 'gecersiz', ileti: ILETILER.ozlukIkte });
    assert.equal(ozlukDuzenlemeReddi({ ozlukIk: false, ...alan }, { ...alan, ad: 'Başka' }), null);
  });
  test('KS-9: çıkışı geçmiş kişi aktif yapılmaz', () => {
    assert.deepEqual(cikisliAktiflikReddi({ cikisGecti: true }), { tur: 'gecersiz', ileti: ILETILER.cikisVar });
    assert.equal(cikisliAktiflikReddi({ cikisGecti: false }), null);
  });
  test('KS-10: bayraklı kişiye yalnız bayraklı aktör iter; son bayraklı kullanıcı çıkışla pasife alınmaz', () => {
    assert.deepEqual(ozlukItmeReddi({ hedefBayrakli: true, aktorBayrakli: false }), { tur: 'yetki', ileti: ILETILER.ozlukBayrakliYetkisiz });
    assert.equal(ozlukItmeReddi({ hedefBayrakli: true, aktorBayrakli: true }), null);
    assert.equal(ozlukItmeReddi({ hedefBayrakli: false, aktorBayrakli: false }), null);
    assert.equal(cikisPasifiReddi({ hedefSayiliyor: true, kalanBayrakli: 0 }), true);
    assert.equal(cikisPasifiReddi({ hedefSayiliyor: true, kalanBayrakli: 1 }), false);
    assert.equal(cikisPasifiReddi({ hedefSayiliyor: false, kalanBayrakli: 0 }), false);
  });
});

// 1302 a ve 1315 a: İK bağlı kişiye ad, sicil, görev ve çıkış tarihini iter; tarih gelince kişi pasif olur. Veriler uydurmadır.
describe('İK özlük itmesi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let uygulama: FastifyInstance | undefined;
  let sifirla: (() => Promise<void>) | undefined;
  let adminId = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const app = (): FastifyInstance => {
    if (!uygulama) throw new Error('Uygulama kurulmadı.');
    return uygulama;
  };

  before(async () => {
    ortam = await testVeritabaniKur('kisiler_ozluk');
    sifirla = await sifirlamaHazirla(ortam);
  });
  after(async () => { await ortam?.kaldir(); });
  beforeEach(async () => {
    await sifirla!();
    uygulama = await uygulamaKur({ vt: o().vt, ayar: o().ayar, kimlik: kimlikCozucu(o().vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    adminId = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
  });
  afterEach(async () => {
    await uygulama?.close();
    uygulama = undefined;
  });

  const rolId = async (kod: string): Promise<number> => (await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
  const girisli = async (kullaniciAdi: string, rol: string): Promise<number> => {
    const r = await rolId(rol);
    return o().vt.tx(async (db) => {
      const id = await kisiEkle(db, { ad: `Kişi ${kullaniciAdi}` });
      await hesapAc(db, adminId, id, { kullaniciAdi, parola: PAROLA, rolId: r });
      return id;
    });
  };
  const cerez = async (kullaniciAdi: string): Promise<string> => {
    const cevap = await app().inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  };
  const satir = (id: number) => o().vt.tek<{ ad: string; sicil_no: string | null; gorev: string | null; aktif: boolean; ozluk_ik: boolean; cikis: string | null; surum: number }>(
    'SELECT ad, sicil_no, gorev, aktif, ozluk_ik, ozluk_cikis_tarihi::text AS cikis, surum FROM kisi WHERE id = $1', [id],
  );
  const it = (aktor: number, kisi: number, cikisTarihi: string | null, ek: Partial<{ ad: string; sicilNo: string | null; gorev: string | null }> = {}) =>
    o().vt.tx((db) => ozluguIkdenYaz(db, aktor, kisi, { ad: 'Ayşe Deneme', sicilNo: 'S-10', gorev: 'Ayarcı', cikisTarihi, ...ek }));
  const reddeder = (kod: string, mesaj: string) => (hata: unknown): boolean => {
    assert.ok(hata instanceof UygulamaHatasi, String(hata));
    assert.deepEqual(hata.govde(), { kod, mesaj });
    return true;
  };

  test('itme alanları yazar, kişiyi bağlar, sürümü artırır; Kişiler\'den değişiklik reddedilir, aynı değer geçer; bağ kalkınca sicil düşer, düzenlenir', async () => {
    const kisi = await o().vt.tx((db) => kisiEkle(db, { ad: 'Eski Ad' }));
    const once = await satir(kisi);
    assert.equal(await it(adminId, kisi, null), 'cikis-yok');
    const sonra = await satir(kisi);
    assert.deepEqual({ ...sonra, surum: undefined }, { ad: 'Ayşe Deneme', sicil_no: 'S-10', gorev: 'Ayarcı', aktif: true, ozluk_ik: true, cikis: null, surum: undefined });
    assert.ok(sonra!.surum > once!.surum);

    const yazar = await cerez((await girisli('ik-yazar', 'insan_kaynaklari'), 'ik-yazar'));
    const duzenle = (govde: object) => app().inject({ method: 'POST', url: `/api/kisiler/${String(kisi)}/duzenle`, headers: { cookie: yazar }, payload: govde });
    const s = (await satir(kisi))!.surum;
    const red = await duzenle({ ad: 'Başka Ad', sicilNo: 'S-10', gorev: 'Ayarcı', surum: s });
    assert.equal(red.statusCode, 422, red.body);
    assert.equal(red.json().mesaj, ILETILER.ozlukIkte);
    assert.equal((await satir(kisi))!.ad, 'Ayşe Deneme');
    assert.equal((await duzenle({ ad: 'Ayşe Deneme', sicilNo: 'S-10', gorev: 'Ayarcı', surum: s })).statusCode, 200);

    const liste = await app().inject({ method: 'GET', url: '/api/kisiler', headers: { cookie: yazar } });
    const ozet = (liste.json().kisiler as { id: number; ozlukIk: boolean; ozlukCikisTarihi: string | null }[]).find((k) => k.id === kisi);
    assert.deepEqual({ ozlukIk: ozet?.ozlukIk, ozlukCikisTarihi: ozet?.ozlukCikisTarihi }, { ozlukIk: true, ozlukCikisTarihi: null });

    await o().vt.tx((db) => ozlukBaginiKaldir(db, kisi));
    assert.deepEqual(
      { ik: (await satir(kisi))!.ozluk_ik, ad: (await satir(kisi))!.ad, sicil: (await satir(kisi))!.sicil_no, gorev: (await satir(kisi))!.gorev },
      { ik: false, ad: 'Ayşe Deneme', sicil: null, gorev: 'Ayarcı' },
    );
    assert.equal((await duzenle({ ad: 'Başka Ad', surum: (await satir(kisi))!.surum })).statusCode, 200);
  });

  test('geçmiş çıkış tarihi kişiyi hemen pasife alır ve oturumunu kapatır; aktif yap reddedilir; çıkış kalkınca aktif yapılabilir', async () => {
    const op = await girisli('op-cikis', 'operator');
    const opCerezi = await cerez('op-cikis');
    assert.equal(await it(adminId, op, '2026-01-01'), 'pasif');
    assert.deepEqual({ aktif: (await satir(op))!.aktif, cikis: (await satir(op))!.cikis }, { aktif: false, cikis: '2026-01-01' });
    assert.equal((await app().inject({ method: 'GET', url: '/api/kisiler', headers: { cookie: opCerezi } })).statusCode, 401);
    assert.equal(await it(adminId, op, '2026-01-01'), 'zaten-pasif');

    const yonetici = await cerez('yonetici');
    const aktifYap = () => app().inject({
      method: 'POST', url: `/api/kisiler/${String(op)}/aktif-yap`, headers: { cookie: yonetici }, payload: { surum: 0 },
    });
    const surumlu = async () => app().inject({
      method: 'POST', url: `/api/kisiler/${String(op)}/aktif-yap`, headers: { cookie: yonetici }, payload: { surum: (await satir(op))!.surum },
    });
    assert.notEqual((await aktifYap()).statusCode, 200);
    const red = await surumlu();
    assert.equal(red.statusCode, 422, red.body);
    assert.equal(red.json().mesaj, ILETILER.cikisVar);
    assert.equal((await satir(op))!.aktif, false);

    assert.equal(await it(adminId, op, null), 'cikis-yok');
    assert.equal((await surumlu()).statusCode, 200);
    assert.equal((await satir(op))!.aktif, true);
  });

  test('ileri tarihli çıkış kişiyi aktif bırakır; tarih gelince günlük iş pasife alır; çıkışsız ve bağsız kişiye dokunmaz', async () => {
    const ileri = await o().vt.tx((db) => kisiEkle(db, { ad: 'İleri' }));
    const gelen = await o().vt.tx((db) => kisiEkle(db, { ad: 'Gelen' }));
    const bagsiz = await o().vt.tx((db) => kisiEkle(db, { ad: 'Bağsız' }));
    assert.equal(await it(adminId, ileri, '2999-12-31', { sicilNo: 'S-11' }), 'cikis-yok');
    assert.equal(await it(adminId, gelen, '2999-12-30', { sicilNo: 'S-12' }), 'cikis-yok');
    assert.equal((await satir(gelen))!.aktif, true);
    // Gün dönümü: tarih geriye çekilir (İK'nın yaptığı gibi değil; zamanı ilerletmek yerine satır hazırlanır).
    await o().sahip.sorgu("UPDATE kisi SET ozluk_cikis_tarihi = CURRENT_DATE WHERE id = $1", [gelen]);

    const is = isler.find((i) => i.ad === 'kisiler-cikis-pasif');
    assert.ok(is?.calis);
    const uyarilar: string[] = [];
    await o().vt.tx((db) => is.calis!(db, { uyar: (m) => uyarilar.push(m), hata: () => undefined }));
    assert.deepEqual(
      [(await satir(ileri))!.aktif, (await satir(gelen))!.aktif, (await satir(bagsiz))!.aktif],
      [true, false, true],
    );
    assert.deepEqual(uyarilar, []);
    assert.deepEqual(await o().vt.tx((db) => cikisiGelenleriPasifeAl(db)), { pasif: [], sonYonetici: [] });
  });

  test('son yönetici çıkışla pasife alınmaz, iş günlüğe yazar; bayraklı kişiye bayraksız aktör itemez', async () => {
    const ik = await girisli('ik-itme', 'insan_kaynaklari');
    await assert.rejects(it(ik, adminId, null), reddeder('YETKI_YOK', ILETILER.ozlukBayrakliYetkisiz));
    assert.equal((await satir(adminId))!.ozluk_ik, false);

    assert.equal(await it(adminId, adminId, '2026-01-01', { ad: 'Deneme Yönetici', sicilNo: 'S-1' }), 'son-yonetici');
    assert.equal((await satir(adminId))!.aktif, true);
    const uyarilar: string[] = [];
    await o().vt.tx((db) => isler[0]!.calis!(db, { uyar: (m) => uyarilar.push(m), hata: () => undefined }));
    assert.equal((await satir(adminId))!.aktif, true);
    assert.equal(uyarilar.length, 1);
    assert.match(uyarilar[0]!, new RegExp(`son yönetici.*${String(adminId)}`));
  });

  test('sicil başka kişide varsa itme çakışmayla reddedilir, hiçbir alan değişmez; olmayan kişi bulunamaz', async () => {
    await o().vt.tx((db) => kisiEkle(db, { ad: 'Sicilli', sicilNo: 'S-99' }));
    const kisi = await o().vt.tx((db) => kisiEkle(db, { ad: 'Hedef' }));
    await assert.rejects(it(adminId, kisi, null, { sicilNo: 'S-99' }), reddeder('CAKISMA', ILETILER.sicilVar));
    assert.deepEqual({ ad: (await satir(kisi))!.ad, ik: (await satir(kisi))!.ozluk_ik }, { ad: 'Hedef', ik: false });
    await assert.rejects(it(adminId, 2147480000, null), reddeder('BULUNAMADI', ILETILER.kisiYok));
    await assert.rejects(o().sahip.sorgu('UPDATE kisi SET ozluk_cikis_tarihi = CURRENT_DATE WHERE id = $1', [kisi]), /kisi_ozluk_cikisi_ik_bagli/);
  });
});
