import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { AltKartAilesiCevabi } from '#paylasilan/sozlesme/malzeme-alt-kart.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { revizyonBilgileri } from './disari.ts';
import { altBagHatasi, bagKaldirmaHatasi, revizyonBagDurumlari, yururlugeAlmaHatasi, type AltKartBilgisi } from './alt-kart/kurallar.ts';
import { tamGovde } from './test-kart.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

const bilgi = (o: Partial<AltKartBilgisi>): AltKartBilgisi => ({
  no: 1, tur: 'mamul', onayDurumu: 'aktif', anaKartNo: null, altTur: null, altEtiket: null, revDurumu: null, cizimRev: null, altSayisi: 0, ...o,
});

describe('3438 a: alt kart kuralları (saf)', () => {
  test('tek seviye, aynı tür ve ailede tekil etiket', () => {
    const ana = bilgi({ no: 1, cizimRev: 'R01' });
    assert.equal(altBagHatasi(bilgi({ no: 2 }), ana, 'revizyon', 'R02', [ana]), null);
    assert.match(altBagHatasi(bilgi({ no: 2 }), ana, 'revizyon', 'r01', [ana]) ?? '', /zaten var/);
    assert.match(altBagHatasi(bilgi({ no: 2, anaKartNo: 5 }), ana, 'revizyon', 'R02', [ana]) ?? '', /zaten bir ana/);
    assert.match(altBagHatasi(bilgi({ no: 2, altSayisi: 1 }), ana, 'revizyon', 'R02', [ana]) ?? '', /tek seviye/);
    assert.match(altBagHatasi(bilgi({ no: 2 }), bilgi({ no: 1, anaKartNo: 9 }), 'revizyon', 'R02', [ana]) ?? '', /ana kart da bir alt kart/);
    assert.match(altBagHatasi(bilgi({ no: 2, tur: 'yarimamul' }), ana, 'revizyon', 'R02', [ana]) ?? '', /aynı türde/);
    assert.match(altBagHatasi(bilgi({ no: 1 }), ana, 'revizyon', 'R02', [ana]) ?? '', /kendi altına/);
  });
  test('ilk revizyon bağında ana kart yürürlükte olur; eski kart eski girer', () => {
    assert.deepEqual(revizyonBagDurumlari(bilgi({}), false), { kart: 'taslak', ana: 'yururlukte' });
    assert.deepEqual(revizyonBagDurumlari(bilgi({ revDurumu: 'yururlukte' }), true), { kart: 'eski', ana: null });
  });
  test('yürürlüğe alma yalnız aktif revizyonda; bağ yalnız yürürlüğe girmemiş revizyondan kalkar', () => {
    assert.equal(yururlugeAlmaHatasi(bilgi({ revDurumu: 'taslak', altTur: 'revizyon', anaKartNo: 1 })), null);
    assert.match(yururlugeAlmaHatasi(bilgi({ revDurumu: 'taslak', onayDurumu: 'onayda' })) ?? '', /aktif/);
    assert.match(yururlugeAlmaHatasi(bilgi({})) ?? '', /revizyon ailesi yok/);
    assert.match(bagKaldirmaHatasi(bilgi({ anaKartNo: 1, altTur: 'revizyon', revDurumu: 'yururlukte' })) ?? '', /kaldırılmaz/);
    assert.equal(bagKaldirmaHatasi(bilgi({ anaKartNo: 1, altTur: 'revizyon', revDurumu: 'eski' })), null);
    assert.equal(bagKaldirmaHatasi(bilgi({ anaKartNo: 1, altTur: 'revizyon', revDurumu: 'taslak' })), null);
  });
});

describe('3438 a: alt kart uçları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  async function istek(yontem: 'GET' | 'POST', url: string, govde?: unknown) {
    const kaydet = url.endsWith('/kaydet');
    const payload = govde === undefined ? undefined : kaydet ? (await surumlu(vt(), url, tamGovde(url, govde))) as object : govde as object;
    return app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: yonetici }, ...(payload === undefined ? {} : { payload }) });
  }
  let sira = 0;
  const kartAc = async (rev: string, durum: 'aktif' | 'taslak' = 'aktif', tur = 'mamul'): Promise<{ kimlik: string; no: number }> => {
    sira += 1;
    const kimlik = `ak${sira}`;
    const kayit = { id: kimlik, tur, com: { kod: 'MM-MIL-00001', ad: `ORN Mil ${sira}`, birim: 'adet' }, g: { resim: 'ORN-DWG-1', rev }, onay: { durum } };
    const c = await istek('POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, { kayit, ozet: { benzersiz_anahtar: null, mukerrer_gerekcesi: null }, surum: null });
    assert.equal(c.statusCode, 200, c.body);
    return { kimlik, no: (await vt().tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.no };
  };
  const aile = async (kimlik: string): Promise<AltKartAilesiCevabi> => {
    const c = await istek('GET', `/malzeme-katalogu-kartlari/${kimlik}/alt-kartlar`);
    assert.equal(c.statusCode, 200, c.body);
    return c.json();
  };

  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi.replaceAll('-', '_')}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  }
  const surumu = async (no: number) => (await vt().tek<{ surum: number }>('SELECT surum FROM malzeme_katalog_karti WHERE no = $1', [no]))!.surum;

  before(async () => {
    ortam = await testVeritabaniKur('malzemealtkart');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme alt kart', kullaniciAdi: 'ak-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'ak-yonetici', parola: PAROLA } });
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
    const a = await istek('POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } });
    assert.equal(a.statusCode, 200, a.body);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('revizyon bağı, yürürlüğe alma ve öteki modüllerin okuması', async () => {
    const ana = await kartAc('R01');
    const r2 = await kartAc('R02');
    const bos = await aile(ana.kimlik);
    assert.equal(bos.ana.revDurumu, null);
    assert.deepEqual(bos.revizyonlar, []);

    const b = await istek('POST', `/malzeme-katalogu-kartlari/${r2.kimlik}/revizyon-olarak-bagla`, { anaKimlik: ana.kimlik, etiket: 'R02' });
    assert.equal(b.statusCode, 200, b.body);
    const a1 = await aile(r2.kimlik);
    assert.equal(a1.ana.kimlik, ana.kimlik);
    assert.equal(a1.ana.revDurumu, 'yururlukte');
    assert.equal(a1.ana.etiket, 'R01');
    assert.deepEqual(a1.revizyonlar.map((k) => [k.kimlik, k.etiket, k.revDurumu]), [[r2.kimlik, 'R02', 'taslak']]);

    // Yürürlükteki revizyon ana karttır; alt kart da ailenin yürürlükteki kartını gösterir.
    let y = await vt().tx((db) => revizyonBilgileri(db, [ana.no, r2.no]));
    assert.equal(y.get(ana.no)?.yururlukteki.no, ana.no);
    assert.equal(y.get(r2.no)?.yururlukteki.no, ana.no);
    assert.deepEqual([y.get(r2.no)?.etiket, y.get(r2.no)?.durum], ['R02', 'taslak']);

    const al = await istek('POST', `/malzeme-katalogu-kartlari/${r2.kimlik}/yururluge-al`);
    assert.equal(al.statusCode, 200, al.body);
    const a2 = await aile(ana.kimlik);
    assert.equal(a2.ana.revDurumu, 'eski');
    assert.equal(a2.revizyonlar[0]?.revDurumu, 'yururlukte');
    y = await vt().tx((db) => revizyonBilgileri(db, [ana.no]));
    assert.equal(y.get(ana.no)?.durum, 'eski');
    assert.deepEqual(y.get(ana.no)?.yururlukteki, { no: r2.no, stokKodu: (await vt().tek<{ s: string }>('SELECT stok_kodu AS s FROM malzeme_katalog_karti WHERE no = $1', [r2.no]))!.s, etiket: 'R02' });

    // Yürürlükteki revizyonun bağı kaldırılmaz.
    const yururluktekiKaldir = await istek('POST', `/malzeme-katalogu-kartlari/${r2.kimlik}/alt-bagi-kaldir`);
    assert.equal(yururluktekiKaldir.statusCode, 422, yururluktekiKaldir.body);

    // Eski ana kart yeniden yürürlüğe alınabilir (geri dönüş); eskiye düşen revizyonun bağı kaldırılır, aile revizyonsuz kalır.
    const geri = await istek('POST', `/malzeme-katalogu-kartlari/${ana.kimlik}/yururluge-al`);
    assert.equal(geri.statusCode, 200, geri.body);
    assert.equal((await aile(ana.kimlik)).ana.revDurumu, 'yururlukte');
    const kaldir = await istek('POST', `/malzeme-katalogu-kartlari/${r2.kimlik}/alt-bagi-kaldir`);
    assert.equal(kaldir.statusCode, 200, kaldir.body);
    const son = await aile(ana.kimlik);
    assert.deepEqual([son.ana.revDurumu, son.revizyonlar.length], [null, 0]);
  });

  test('aynı etiket, alt kartın altı ve onaylanmamış kartın yürürlüğe alınması reddedilir; taslak revizyonun bağı kalkar', async () => {
    const ana = await kartAc('A');
    const b = await kartAc('B', 'taslak');
    const c = await kartAc('C');
    assert.equal((await istek('POST', `/malzeme-katalogu-kartlari/${b.kimlik}/revizyon-olarak-bagla`, { anaKimlik: ana.kimlik, etiket: 'b' })).statusCode, 200);
    const ayni = await istek('POST', `/malzeme-katalogu-kartlari/${c.kimlik}/revizyon-olarak-bagla`, { anaKimlik: ana.kimlik, etiket: 'B' });
    assert.equal(ayni.statusCode, 422, ayni.body);
    const altinAlti = await istek('POST', `/malzeme-katalogu-kartlari/${c.kimlik}/revizyon-olarak-bagla`, { anaKimlik: b.kimlik, etiket: 'C' });
    assert.equal(altinAlti.statusCode, 422, altinAlti.body);
    const onaysiz = await istek('POST', `/malzeme-katalogu-kartlari/${b.kimlik}/yururluge-al`);
    assert.equal(onaysiz.statusCode, 422, onaysiz.body);

    // Veritabanı da tek seviyeyi tutar (servisi atlayan yol).
    await assert.rejects(vt().tx((db) => db.sorgu("UPDATE malzeme_katalog_karti SET ana_kart_no = $1, alt_tur = 'revizyon', alt_etiket = 'X', rev_durumu = 'taslak' WHERE no = $2", [b.no, c.no])),
      /tek_seviye|alt kartı olmaz/i);

    const kaldir = await istek('POST', `/malzeme-katalogu-kartlari/${b.kimlik}/alt-bagi-kaldir`);
    assert.equal(kaldir.statusCode, 200, kaldir.body);
    const a = await aile(ana.kimlik);
    assert.deepEqual(a.revizyonlar, []);
    assert.equal(a.ana.revDurumu, null);
  });

  test('yetki: yürürlüğe alma yalnız onaylayan, bağlama ve bağ kaldırma yalnız yazan', async () => {
    const ana = await kartAc('Y1');
    const r2 = await kartAc('Y2');
    const okuyan = await islemliKisi('ak-okuyan', ['sayfa.malzemeler']);
    const yazan = await islemliKisi('ak-yazan', ['sayfa.malzemeler', 'malzemeler.yaz']);
    const gonder = (cerez: string, url: string, govde?: unknown) =>
      app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: cerez }, ...(govde === undefined ? {} : { payload: govde as object }) });
    const bagla = `/malzeme-katalogu-kartlari/${r2.kimlik}/revizyon-olarak-bagla`;
    assert.equal((await gonder(okuyan, bagla, { anaKimlik: ana.kimlik, etiket: 'Y2' })).statusCode, 403);
    assert.equal((await gonder(yazan, bagla, { anaKimlik: ana.kimlik, etiket: 'Y2' })).statusCode, 200);
    assert.equal((await gonder(yazan, `/malzeme-katalogu-kartlari/${r2.kimlik}/yururluge-al`)).statusCode, 403);
    assert.equal((await gonder(okuyan, `/malzeme-katalogu-kartlari/${r2.kimlik}/alt-bagi-kaldir`)).statusCode, 403);
    assert.equal((await gonder(yazan, `/malzeme-katalogu-kartlari/${r2.kimlik}/alt-bagi-kaldir`)).statusCode, 200);
  });

  test('iki revizyonlu ailede taslak bağı kalkınca ana kart yürürlükte kalır; yazımlar sürüm artırır', async () => {
    const ana = await kartAc('S1');
    const r2 = await kartAc('S2');
    const r3 = await kartAc('S3');
    const [anaS, r2S] = [await surumu(ana.no), await surumu(r2.no)];
    assert.equal((await istek('POST', `/malzeme-katalogu-kartlari/${r2.kimlik}/revizyon-olarak-bagla`, { anaKimlik: ana.kimlik, etiket: 'S2' })).statusCode, 200);
    assert.ok(await surumu(r2.no) > r2S, 'bağlanan kartın sürümü artar');
    assert.ok(await surumu(ana.no) > anaS, 'yürürlüğe giren ana kartın sürümü artar');
    assert.equal((await istek('POST', `/malzeme-katalogu-kartlari/${r3.kimlik}/revizyon-olarak-bagla`, { anaKimlik: ana.kimlik, etiket: 'S3' })).statusCode, 200);
    const [anaS2, r2S2] = [await surumu(ana.no), await surumu(r2.no)];
    assert.equal((await istek('POST', `/malzeme-katalogu-kartlari/${r2.kimlik}/yururluge-al`)).statusCode, 200);
    assert.ok(await surumu(r2.no) > r2S2 && await surumu(ana.no) > anaS2, 'yürürlüğe alma iki kartın da sürümünü artırır');
    assert.equal((await istek('POST', `/malzeme-katalogu-kartlari/${ana.kimlik}/yururluge-al`)).statusCode, 200);
    assert.equal((await istek('POST', `/malzeme-katalogu-kartlari/${r3.kimlik}/alt-bagi-kaldir`)).statusCode, 200);
    const a = await aile(ana.kimlik);
    assert.equal(a.ana.revDurumu, 'yururlukte');
    assert.deepEqual(a.revizyonlar.map((k) => [k.kimlik, k.revDurumu]), [[r2.kimlik, 'eski']]);
  });

  test('revizyon ailesindeki alternatif kart revizyon bilgisinde yoktur', async () => {
    const ana = await kartAc('L1');
    const r2 = await kartAc('L2');
    const alt = await kartAc('L3');
    assert.equal((await istek('POST', `/malzeme-katalogu-kartlari/${r2.kimlik}/revizyon-olarak-bagla`, { anaKimlik: ana.kimlik, etiket: 'L2' })).statusCode, 200);
    await vt().sorgu("UPDATE malzeme_katalog_karti SET ana_kart_no = $1, alt_tur = 'alternatif', alt_etiket = 'ALT1' WHERE no = $2", [ana.no, alt.no]);
    const y = await vt().tx((db) => revizyonBilgileri(db, [ana.no, r2.no, alt.no]));
    assert.deepEqual([y.has(ana.no), y.has(r2.no), y.has(alt.no)], [true, true, false]);
  });
});
