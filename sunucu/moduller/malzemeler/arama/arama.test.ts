import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { aramaSade, basDeseni, icindeDeseni } from '#paylasilan/kayit-aramasi.ts';
import type { KayitAramaSonucu } from '#paylasilan/sayfa-tanimi.ts';
import { denetimYaz } from '../../denetim/disari.ts';
import { yoneticiOlustur } from '../../kisiler/disari.ts';
import { kimlikCozucu } from '../../oturum/disari.ts';
import { kayitAramaKaynaklari } from '../disari.ts';
import { tamGovde } from '../test-kart.ts';
import { surumlu } from '../test-surum.ts';

const PAROLA = 'dogru-parola-1';

describe('malzemeler genel arama kaynağı (kart #1221, #1244, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let sayac = 0;
  let kisiId = 0;
  const kaynak = kayitAramaKaynaklari.find((k) => k.tur === 'malzeme')!;
  const ara = async (q: string, sinir = 5): Promise<KayitAramaSonucu[]> => [...await vt().okumaTx((db) => kaynak.ara(db, {
    q, sade: aramaSade(q), icindeDeseni: icindeDeseni(q), basDeseni: basDeseni(q), sinir, kullanici: { id: kisiId, islemler: ['sayfa.malzemeler'] },
  }))];

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = async (cerez: string | null, yontem: 'GET' | 'POST', url: string, govde?: unknown) => {
    const c = await app.inject({ method: yontem, url: `/api${url}`, headers: cerez ? { cookie: cerez } : {}, ...(govde === undefined ? {} : { payload: (await surumlu(vt(), url, tamGovde(url, govde))) as object }) });
    return { durum: c.statusCode, govde: c.json() as unknown };
  };
  const giris = async (kullaniciAdi: string): Promise<string> => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  };
  async function kartAc(o: { tur: string; kod: string; ad: string; durum?: string; com?: Record<string, unknown> }): Promise<number> {
    const kimlik = `ar${++sayac}`;
    const c = await istek(yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
      kayit: { id: kimlik, tur: o.tur, fam: 'metal', com: { kod: o.kod, ad: o.ad, birim: 'adet', ...o.com }, onay: { durum: o.durum ?? 'aktif' } },
      ozet: { benzersiz_anahtar: `${o.tur}|arama|${kimlik}`, mukerrer_gerekcesi: null },
      surum: null,
    });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return (await vt().tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.no;
  }

  before(async () => {
    ortam = await testVeritabaniKur('malzemearama');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    const yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'ar-yonetici', parola: PAROLA }));
    kisiId = yoneticiId;
    yonetici = await giris('ar-yonetici');
    const ayar = await istek(yonetici, 'POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } });
    assert.equal(ayar.durum, 200, JSON.stringify(ayar.govde));
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('kod ya da adda geçen kart katalog sayfasına giden sonuç olarak döner; başlık kod; en çok sınır kadar satır', async () => {
    const mil = await kartAc({ tur: 'mamul', kod: 'MM-ARM-00001', ad: 'Arama Mili' });
    const taslak = await kartAc({ tur: 'hammadde', kod: 'HM-ARM-00001', ad: 'Arama Çubuğu', durum: 'taslak' });
    const sonuclar = await ara('arama');
    assert.deepEqual(sonuclar.map((s) => s.anahtar).sort(), [String(mil), String(taslak)].sort());
    const milSatiri = sonuclar.find((s) => s.anahtar === String(mil));
    assert.match(milSatiri?.baslik ?? '', /^MM-ARM-/);
    assert.deepEqual({ ...milSatiri, baslik: '' }, { anahtar: String(mil), baslik: '', aciklama: 'Arama Mili · Mamul', yol: '/malzemeler' });
    assert.equal(sonuclar.find((s) => s.anahtar === String(taslak))?.aciklama, 'Arama Çubuğu · Hammadde · taslak');
    for (let i = 0; i < 5; i += 1) await kartAc({ tur: 'sarf', kod: 'SF-ARM-00001', ad: `Arama Sarf ${i}` });
    assert.equal((await ara('arama')).length, 5);
    assert.equal((await ara('arama', 25)).length, 7);
  });

  test('tam kod önce, sonra koddan başlayan, sonra yalnız adda geçen', async () => {
    const adda = await kartAc({ tur: 'mamul', kod: 'MM-SRA-00001', ad: 'Sıra MM-SRB parçası' });
    const bas = await kartAc({ tur: 'mamul', kod: 'MM-SRB-00001', ad: 'Sıra B' });
    const kod = (await vt().tek<{ stok_kodu: string }>('SELECT stok_kodu FROM malzeme_katalog_karti WHERE no = $1', [bas]))!.stok_kodu;
    assert.deepEqual((await ara('MM-SRB')).map((s) => s.anahtar), [String(bas), String(adda)]);
    assert.equal((await ara(kod.toLowerCase()))[0]?.anahtar, String(bas));
  });

  // Test raporu bölüm 3: katalog araması "ERP kodu" diyor, üst arama eski/ERP koduyla bulmuyordu.
  test('eski / ERP kodu ya da tedarikçi koduyla aranan kart bulunur; eşleşmeyen kod ve joker boş döner', async () => {
    const erp = await kartAc({ tur: 'hammadde', kod: 'HM-ERP-00001', ad: 'Erp Çubuğu', com: { eskiKod: 'ESK-4711', tkod: 'TED-K-93' } });
    const anahtarlar = async (q: string) => (await ara(q)).map((s) => s.anahtar);
    assert.deepEqual(await anahtarlar('esk-4711'), [String(erp)]);
    assert.deepEqual(await anahtarlar('TED-K-93'), [String(erp)]);
    assert.deepEqual(await anahtarlar('ESK-9999'), []);
    assert.deepEqual(await anahtarlar('%%'), []);
  });

  // C.UTF-8'de ILIKE 'I' ile 'ı'yı, 'İ' ile 'i'yi eşlemiyordu (1233).
  test('Türkçe harf: büyük-küçük ve noktalı-noktasız fark gözetilmez', async () => {
    const isik = await kartAc({ tur: 'mamul', kod: 'MM-ISK-00001', ad: 'IŞIKLI İĞNE' });
    for (const q of ['ışıklı', 'IŞIKLI', 'isikli', 'iğne', 'İĞNE']) assert.deepEqual((await ara(q)).map((s) => s.anahtar), [String(isik)], q);
  });

  test('iptal kart dönmez; kaynak malzemeler sayfasının okuma işlemini ister (reddi çekirdek uygular)', async () => {
    const no = await kartAc({ tur: 'mamul', kod: 'MM-IPT-00001', ad: 'İptal Edilecek' });
    assert.deepEqual((await ara('İptal Edilecek')).map((s) => s.anahtar), [String(no)]);
    await vt().sorgu("UPDATE malzeme_katalog_karti SET onay_durumu = 'iptal' WHERE no = $1", [no]);
    assert.deepEqual(await ara('İptal Edilecek'), []);
    assert.deepEqual(kaynak.yetki, ['sayfa.malzemeler']);
  });
});
