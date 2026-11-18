import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KatalogKartiKaydetCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { firmaKodu } from './disari.ts';
import { katalogFirmaKodu, katalogFirmaKoduGecerliMi, katalogFirmaKoduTurleriGecerliMi, katalogFirmaOneki } from './kurallar.ts';
import { tamGovde } from './test-kart.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

test('kart #652: firma kodu 2-5 büyük harf ya da rakam; tür kısaltması olamaz; boş geçerli', () => {
  for (const d of [undefined, null, '', 'AB', 'ABC', 'A1B2C']) assert.equal(katalogFirmaKoduGecerliMi(d), true, String(d));
  for (const d of ['A', 'ABCDEF', 'abc', 'AB-C', 'ÇAM', 'HM', 'MM', 'YM', 'SF', 'DB', 'HZ', 12]) assert.equal(katalogFirmaKoduGecerliMi(d), false, String(d));
  assert.equal(katalogFirmaOneki({ firmaKodu: 'ABC' }, 'mamul'), 'ABC-MM-');
  assert.equal(katalogFirmaOneki({ firmaKodu: 'ABC' }, 'yarimamul'), 'ABC-YM-');
  for (const tur of ['hammadde', 'sarf', 'demirbas', 'hizmet', 'ticari_mal']) assert.equal(katalogFirmaOneki({ firmaKodu: 'ABC' }, tur), null, tur);
  assert.equal(katalogFirmaOneki({ firmaKodu: '' }, 'mamul'), null);
  assert.equal(katalogFirmaOneki({ firmaKodu: 'HM' }, 'yarimamul'), null);
  assert.equal(katalogFirmaOneki(null, 'mamul'), null);
  assert.equal(katalogFirmaOneki({ firmaKodu: 'ABC', firmaKoduTurleri: ['hammadde'] }, 'hammadde'), 'ABC-HM-');
  assert.equal(katalogFirmaOneki({ firmaKodu: 'ABC', firmaKoduTurleri: ['hammadde'] }, 'mamul'), null);
  assert.equal(katalogFirmaOneki({ firmaKodu: 'ABC', firmaKoduTurleri: [] }, 'mamul'), null);
  assert.equal(katalogFirmaOneki({ firmaKodu: 'ABC', firmaKoduTurleri: ['yok'] }, 'mamul'), 'ABC-MM-', 'geçersiz liste varsayılana döner');
  for (const d of [undefined, null, [], ['mamul'], ['hammadde', 'ticari_mal']]) assert.equal(katalogFirmaKoduTurleriGecerliMi(d), true, JSON.stringify(d));
  for (const d of ['mamul', ['mamul', 'mamul'], ['yok'], [1], {}]) assert.equal(katalogFirmaKoduTurleriGecerliMi(d), false, JSON.stringify(d));
  assert.equal(katalogFirmaKodu({ firmaKodu: 'ABC' }), 'ABC');
  for (const genel of [{ firmaKodu: '' }, { firmaKodu: 'HM' }, { firmaKodu: 12 }, {}, null]) assert.equal(katalogFirmaKodu(genel), null, JSON.stringify(genel));
});

describe('Mamul stok kodu firma koduyla (kart #652, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = async (url: string, govde: unknown) =>
    app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: cerez }, payload: (await surumlu(vt(), url, tamGovde(url, govde))) as object });
  const genel = (deger: Record<string, unknown>) => istek('/malzeme-katalogu-ayarlari/genel/kaydet', { deger });
  const firmaEkle = (kod: string, varsayilan: boolean) =>
    app.inject({ method: 'POST', url: '/api/firma-kodlari/ekle', headers: { cookie: cerez }, payload: { kod, ad: `Deneme ${kod}`, varsayilan } });
  const kaydetHam = (kimlik: string, tur: string, firma?: string, kod = 'MM-GEN-00000') => istek(`/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
    kayit: { id: kimlik, tur, ...(tur === 'hammadde' ? { fam: 'metal' } : {}), com: { kod, birim: 'adet', ...(firma === undefined ? {} : { firmaKodu: firma }) }, onay: { durum: 'taslak' } },
    ozet: { benzersiz_anahtar: `${tur}|firma|${kimlik}`, mukerrer_gerekcesi: null }, surum: null,
  });
  const kaydet = async (kimlik: string, tur: string, kod: string, firma?: string): Promise<string> => {
    const c = await kaydetHam(kimlik, tur, firma, kod);
    assert.equal(c.statusCode, 200, c.body);
    return (c.json() as KatalogKartiKaydetCevabi).stok_kodu;
  };

  before(async () => {
    ortam = await testVeritabaniKur('mamulfirma');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme firma', kullaniciAdi: 'fk-yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'fk-yonetici', parola: PAROLA } });
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('firma kodu yokken mamul tür-grup-sıra alır', async () => {
    assert.equal(await vt().tx((db) => firmaKodu(db)), null, 'kart #802: ayar yokken null');
    assert.equal(await kaydet('fk1', 'mamul', 'MM-GEN-00000'), 'MM-GEN-00001');
  });

  test('firma kodu yokken yarı mamul tür-grup-sıra alır', async () => {
    assert.equal(await kaydet('fy0', 'yarimamul', 'YM-TAL-00000'), 'YM-TAL-00001');
  });

  test('firma kodu ayarlıyken mamul ve yarı mamul FİRMA-TÜR-sıra alır; sayaçlar ayrı; ekranın öneki yok sayılır; öteki türler değişmez', async () => {
    assert.equal((await firmaEkle('ABC', true)).statusCode, 200);
    assert.equal(await vt().tx((db) => firmaKodu(db)), 'ABC', 'kart #802: dışa verilen firma kodu varsayılan koddur');
    assert.equal(await kaydet('fk2', 'mamul', 'ABC-MM-00000'), 'ABC-MM-00001');
    assert.equal(await kaydet('fk3', 'mamul', 'MM-GEN-00000'), 'ABC-MM-00002');
    assert.equal(await kaydet('fk4', 'yarimamul', 'YM-TAL-00000'), 'ABC-YM-00001');
    assert.equal(await kaydet('fk4b', 'yarimamul', 'ABC-YM-00000'), 'ABC-YM-00002');
    assert.equal(await kaydet('fk5', 'hammadde', 'HM-PAS-00000'), 'HM-PAS-00001');
    // Kural 1a (kullanıcı kartı 17.10): taslakta önek yenileme firma kodlu türde gelen kodu okumaz; önek ayardan gelir, kod aynı kalır.
    const surum = (await vt().tek<{ surum: number }>('SELECT surum FROM malzeme_katalog_karti WHERE kimlik = $1', ['fk3']))!.surum;
    const c = await istek('/malzeme-katalogu-kartlari/fk3/kaydet', {
      kayit: { id: 'fk3', tur: 'mamul', com: { kod: 'MM-YNI-00000', birim: 'adet' }, onay: { durum: 'taslak' } },
      ozet: { benzersiz_anahtar: 'mamul|firma|fk3', mukerrer_gerekcesi: null }, surum,
    });
    assert.equal(c.statusCode, 200, c.body);
    assert.equal((c.json() as KatalogKartiKaydetCevabi).stok_kodu, 'ABC-MM-00002');
  });

  test('eşzamanlı yeni kartlar aynı numarayı almaz', async () => {
    const kodlar = await Promise.all(['fe1', 'fe2', 'fe3', 'fe4', 'fe5', 'fe6'].map((k) => kaydet(k, 'yarimamul', 'YM-TAL-00000')));
    assert.equal(new Set(kodlar).size, kodlar.length, kodlar.join(','));
    for (const kod of kodlar) assert.match(kod, /^ABC-YM-\d{5}$/);
  });

  test('firma kodlu türler ayarı: seçilen tür firma kodu alır, çıkarılan tür eski yapıya döner, geçersiz liste 400', async () => {
    assert.equal((await genel({ firmaKoduTurleri: ['mamul', 'yarimamul', 'hammadde'] })).statusCode, 200);
    assert.equal(await kaydet('ft1', 'hammadde', 'HM-PAS-00000'), 'ABC-HM-00001');
    for (const firmaKoduTurleri of [['yok'], ['mamul', 'mamul'], 'mamul']) {
      const c = await genel({ firmaKoduTurleri });
      assert.equal(c.statusCode, 400, `${JSON.stringify(firmaKoduTurleri)}: ${c.body}`);
    }
    assert.equal((await genel({ onayAkisi: true })).statusCode, 200);
    assert.equal(await kaydet('ft2', 'hammadde', 'HM-PAS-00000'), 'ABC-HM-00002', 'listeyi göndermeyen kayıt onu silmez');
    assert.equal((await genel({ firmaKoduTurleri: ['mamul'] })).statusCode, 200);
    assert.equal(await kaydet('ft3', 'yarimamul', 'YM-TAL-00000'), 'YM-TAL-00002');
    assert.equal(await kaydet('ft4', 'hammadde', 'HM-PAS-00000'), 'HM-PAS-00002');
    assert.equal((await genel({ firmaKoduTurleri: ['mamul', 'yarimamul'] })).statusCode, 200);
  });

  test('3399 a: malzeme ayarı firma kodunu artık yazmaz; okumada varsayılan kod ve liste gelir, kayda geçmez', async () => {
    assert.equal((await genel({ firmaKodu: 'XYZ', firmaKodlari: [] })).statusCode, 200);
    assert.equal(await vt().tx((db) => firmaKodu(db)), 'ABC');
    const g = await app.inject({ method: 'GET', url: '/api/malzeme-katalogu-ayarlari', headers: { cookie: cerez } });
    assert.equal(g.statusCode, 200, g.body);
    const deger = (g.json() as { genel: Record<string, unknown> }).genel;
    assert.equal(deger['firmaKodu'], 'ABC');
    assert.deepEqual((deger['firmaKodlari'] as { kod: string }[]).map((k) => k.kod), ['ABC']);
    const kayitli = await vt().tek<{ deger: Record<string, unknown> }>("SELECT deger FROM malzeme_katalog_ayari WHERE anahtar = 'genel'");
    assert.equal(kayitli?.deger['firmaKodlari'], undefined);
    assert.notEqual(kayitli?.deger['firmaKodu'], 'XYZ');
  });

  test('taslakta tür mamule dönünce FİRMA-MM- alır', async () => {
    const ilk = await istek('/malzeme-katalogu-kartlari/fk8/kaydet', {
      kayit: { id: 'fk8', tur: 'yarimamul', com: { kod: 'YM-TAL-00000', birim: 'adet' }, onay: { durum: 'taslak' } },
      ozet: { benzersiz_anahtar: 'yarimamul|firma|fk8', mukerrer_gerekcesi: null }, surum: null,
    });
    assert.equal(ilk.statusCode, 200, ilk.body);
    const r = ilk.json() as KatalogKartiKaydetCevabi;
    assert.equal(r.stok_kodu, 'ABC-YM-00009');
    const c = await istek('/malzeme-katalogu-kartlari/fk8/kaydet', {
      kayit: { id: 'fk8', tur: 'mamul', com: { kod: 'MM-GEN-00000', birim: 'adet' }, onay: { durum: 'taslak' } },
      ozet: { benzersiz_anahtar: 'mamul|firma|fk8', mukerrer_gerekcesi: null }, surum: r.surum,
    });
    assert.equal(c.statusCode, 200, c.body);
    assert.equal((c.json() as KatalogKartiKaydetCevabi).stok_kodu, 'ABC-MM-00003');
  });

  test('3399 a: kartta seçilen firma kodu stok kodunun başı olur, sırası ayrı; pasif ya da bilinmeyen kod 400; kayıtlı kartın kodu değişmez', async () => {
    assert.equal((await firmaEkle('ORN', false)).statusCode, 200);
    assert.equal(await kaydet('fo1', 'mamul', 'MM-GEN-00000', 'ORN'), 'ORN-MM-00001');
    assert.equal(await kaydet('fo2', 'mamul', 'MM-GEN-00000', 'ORN'), 'ORN-MM-00002');
    assert.equal(await kaydet('fo3', 'mamul', 'MM-GEN-00000'), 'ABC-MM-00004', 'seçilmeyen kart varsayılan kodu alır');
    assert.equal((await kaydetHam('fo4', 'mamul', 'YOK')).statusCode, 400);
    const surum = (await vt().tek<{ surum: number }>('SELECT surum FROM malzeme_katalog_karti WHERE kimlik = $1', ['fo1']))!.surum;
    const c = await istek('/malzeme-katalogu-kartlari/fo1/kaydet', {
      kayit: { id: 'fo1', tur: 'mamul', com: { kod: 'ORN-MM-00001', birim: 'adet', firmaKodu: 'ABC' }, onay: { durum: 'taslak' } },
      ozet: { benzersiz_anahtar: 'mamul|firma|fo1', mukerrer_gerekcesi: null }, surum,
    });
    assert.equal(c.statusCode, 200, c.body);
    assert.equal((c.json() as KatalogKartiKaydetCevabi).stok_kodu, 'ORN-MM-00001', 'kayıtlı kartın önek ve sırası korunur');
    const ym = await kaydetHam('fo6', 'yarimamul', 'ORN', 'YM-TAL-00000');
    assert.equal(ym.statusCode, 200, ym.body);
    assert.equal((ym.json() as KatalogKartiKaydetCevabi).stok_kodu, 'ORN-YM-00001');
    // Kod pasife alınınca o koddaki kart düzenlenir; stok kodu değişmez, yeni karta seçilemez.
    const kodlar = (await app.inject({ method: 'GET', url: '/api/firma-kodlari', headers: { cookie: cerez } })).json() as { firmaKodlari: { id: number; kod: string; surum: number }[] };
    const orn = kodlar.firmaKodlari.find((k) => k.kod === 'ORN');
    assert.ok(orn);
    const p = await app.inject({ method: 'POST', url: `/api/firma-kodlari/${String(orn.id)}/duzenle`, headers: { cookie: cerez }, payload: { ad: 'Deneme ORN', varsayilan: false, aktif: false, surum: orn.surum } });
    assert.equal(p.statusCode, 200, p.body);
    const surum2 = (await vt().tek<{ surum: number }>('SELECT surum FROM malzeme_katalog_karti WHERE kimlik = $1', ['fo2']))!.surum;
    const d = await istek('/malzeme-katalogu-kartlari/fo2/kaydet', {
      kayit: { id: 'fo2', tur: 'mamul', com: { kod: 'ORN-MM-00002', birim: 'adet', firmaKodu: 'ORN' }, onay: { durum: 'taslak' } },
      ozet: { benzersiz_anahtar: 'mamul|firma|fo2', mukerrer_gerekcesi: null }, surum: surum2,
    });
    assert.equal(d.statusCode, 200, d.body);
    assert.equal((d.json() as KatalogKartiKaydetCevabi).stok_kodu, 'ORN-MM-00002');
    assert.equal((await kaydetHam('fo5', 'mamul', 'ORN')).statusCode, 400, 'pasif kod yeni karta seçilemez');
    // Taslakta tür değişince önek yeniden kurulur: kartın kendi pasif kodu korunur (yeni seçim sayılmaz).
    const ymSurum = (ym.json() as KatalogKartiKaydetCevabi).surum;
    const t = await istek('/malzeme-katalogu-kartlari/fo6/kaydet', {
      kayit: { id: 'fo6', tur: 'mamul', com: { kod: 'ORN-YM-00001', birim: 'adet', firmaKodu: 'ORN' }, onay: { durum: 'taslak' } },
      ozet: { benzersiz_anahtar: 'mamul|firma|fo6', mukerrer_gerekcesi: null }, surum: ymSurum,
    });
    assert.equal(t.statusCode, 200, t.body);
    assert.equal((t.json() as KatalogKartiKaydetCevabi).stok_kodu, 'ORN-MM-00003');
  });
});
