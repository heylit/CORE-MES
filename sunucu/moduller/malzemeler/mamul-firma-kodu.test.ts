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
  const kaydet = async (kimlik: string, tur: string, kod: string): Promise<string> => {
    const c = await istek(`/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
      kayit: { id: kimlik, tur, ...(tur === 'hammadde' ? { fam: 'metal' } : {}), com: { kod, birim: 'adet' }, onay: { durum: 'taslak' } },
      ozet: { benzersiz_anahtar: `${tur}|firma|${kimlik}`, mukerrer_gerekcesi: null }, surum: null,
    });
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
    assert.equal((await genel({ firmaKodu: 'ABC' })).statusCode, 200);
    assert.equal(await vt().tx((db) => firmaKodu(db)), 'ABC', 'kart #802: dışa verilen firma kodu');
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
    assert.equal(await vt().tx((db) => firmaKodu(db)), 'ABC', 'firma kodunu göndermeyen kayıt onu silmez');
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

  test('geçersiz firma kodu 400; kayıtlı ayar değişmez', async () => {
    for (const firmaKodu of ['A', 'abc', 'HM', 'ABCDEF']) {
      const c = await genel({ firmaKodu });
      assert.equal(c.statusCode, 400, `${firmaKodu}: ${c.body}`);
    }
    assert.equal(await kaydet('fk6', 'mamul', 'MM-GEN-00000'), 'ABC-MM-00003');
  });

  test('taslakta tür mamule dönünce FİRMA-MM- alır; firma kodunu göndermeyen genel ayar kaydı onu silmez', async () => {
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
    assert.equal((c.json() as KatalogKartiKaydetCevabi).stok_kodu, 'ABC-MM-00004');
    assert.equal((await genel({ onayAkisi: true })).statusCode, 200);
    assert.equal(await kaydet('fk9', 'mamul', 'MM-GEN-00000'), 'ABC-MM-00005');
  });

  test('firma kodu boşaltılınca mamul eski yapıya döner; var olan kod değişmez', async () => {
    assert.equal((await genel({ firmaKodu: '' })).statusCode, 200);
    assert.equal(await vt().tx((db) => firmaKodu(db)), null, 'kart #802: boşaltılınca null');
    assert.equal(await kaydet('fk7', 'mamul', 'MM-GEN-00000'), 'MM-GEN-00002');
    assert.equal(await kaydet('fy7', 'yarimamul', 'YM-TAL-00000'), 'YM-TAL-00003');
    const r = await vt().tek<{ stok_kodu: string }>('SELECT stok_kodu FROM malzeme_katalog_karti WHERE kimlik = $1', ['fk2']);
    assert.equal(r?.stok_kodu, 'ABC-MM-00001');
  });
});
