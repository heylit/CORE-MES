import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KayitAramaCevabi } from '#paylasilan/sayfa-tanimi.ts';
import { denetimYaz } from '../../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../../kisiler/disari.ts';
import { kimlikCozucu } from '../../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

describe('üretim emirleri genel arama ucu (kart #1221, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yetkisiz = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = async (cerez: string | null, yontem: 'GET' | 'POST', url: string, govde?: unknown) => {
    const c = await app.inject({ method: yontem, url: `/api${url}`, headers: cerez ? { cookie: cerez } : {}, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: c.json() as unknown };
  };
  const giris = async (kullaniciAdi: string): Promise<string> => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  };
  before(async () => {
    ortam = await testVeritabaniKur('emirarama');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    const yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'ue-yonetici', parola: PAROLA }));
    // İşlemsiz rol: emir listesini okuyamaz.
    const bos = await vt().tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_bos', 'Geçici Boş') RETURNING id");
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    await vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme Yetkisiz', kullaniciAdi: 'ue-yetkisiz', parola: PAROLA });
      await rolAta(db, yoneticiId, id, bos!.id);
      await rolAl(db, yoneticiId, id, yoneticiRolu!.id);
    });
    yonetici = await giris('ue-yonetici');
    yetkisiz = await giris('ue-yetkisiz');
    const sahip = ortam.sahip;
    const im = await sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('UEIM', 'Deneme Merkezi') RETURNING id");
    const ist = await sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('UEIS', 'Deneme İstasyonu', $1) RETURNING id", [im!.id]);
    for (const [parcaNo, parcaAd] of [['P-ARA-1', 'Arama Flanşı'], ['P-ARA-2', 'Arama Mili']]) {
      await sahip.sorgu('INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id) VALUES ($1, $2, 5, $3, $4)', [parcaNo, parcaAd, ist!.id, yoneticiId]);
    }
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  const ara = async (q: string) => {
    const c = await istek(yonetici, 'GET', `/uretim-emirleri/ara?q=${encodeURIComponent(q)}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return (c.govde as KayitAramaCevabi).sonuclar;
  };

  test('emir no, parça no ya da parça adında geçen emir yeniden eskiye döner; sonuç emrin ayrıntısını açar', async () => {
    const satirlar = await vt().sorgu<{ id: number; emirNo: string }>('SELECT id, emir_no AS "emirNo" FROM uretim_emri ORDER BY id');
    const [ilk, ikinci] = satirlar;
    assert.deepEqual(await ara('arama'), [
      { anahtar: String(ikinci!.id), baslik: ikinci!.emirNo, aciklama: 'P-ARA-2 Arama Mili · Planlı', yol: `/uretim-emirleri/${ikinci!.id}` },
      { anahtar: String(ilk!.id), baslik: ilk!.emirNo, aciklama: 'P-ARA-1 Arama Flanşı · Planlı', yol: `/uretim-emirleri/${ilk!.id}` },
    ]);
    assert.deepEqual((await ara('p-ara-1')).map((s) => s.anahtar), [String(ilk!.id)]);
    assert.deepEqual((await ara(ilk!.emirNo.toLowerCase())).map((s) => s.anahtar)[0], String(ilk!.id));
  });

  // Test raporu K2: adımlı emirde satır adımlar arasında 'planli' kalır; arama emir listesiyle aynı görünen durumu yazar.
  test('adımlı emirde bir iş emri başladıysa durum "Başladı", hiçbiri başlamadıysa "Planlı" görünür', async () => {
    const sahip = ortam!.sahip;
    const acan = await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'ue-yonetici'");
    const ist = await sahip.tek<{ id: number }>("SELECT id FROM istasyon WHERE kod = 'UEIS'");
    const tip = await sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('UET', 'Deneme tipi', 'TAL') RETURNING id");
    const ekle = async (parcaNo: string, isDurumu: string) => {
      const e = await sahip.tek<{ id: number }>("INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id) VALUES ($1, 'Durum Mili', 5, $2, $3) RETURNING id", [parcaNo, ist!.id, acan!.id]);
      await sahip.sorgu(`INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, istasyon_id, durum, baslama)
        VALUES ($1, 1, 10, $2, 'OP 10', $3, $4::text, CASE WHEN $4::text = 'calisiyor' THEN now() END)`, [e!.id, tip!.id, ist!.id, isDurumu]);
      return e!.id;
    };
    const baslamis = await ekle('P-DUR-1', 'calisiyor');
    const bekleyen = await ekle('P-DUR-2', 'bekliyor');
    const sonuclar = await ara('p-dur');
    assert.deepEqual(sonuclar.map((s) => [s.anahtar, s.aciklama]), [
      [String(bekleyen), 'P-DUR-2 Durum Mili · Planlı'],
      [String(baslamis), 'P-DUR-1 Durum Mili · Başladı'],
    ]);
  });

  test('reddedilen: emir listesini okuyamayan 403, oturumsuz 401, kısa sorgu 400; eşleşmeyen sorgu boş döner', async () => {
    assert.equal((await istek(yetkisiz, 'GET', '/uretim-emirleri/ara?q=arama')).durum, 403);
    assert.equal((await istek(null, 'GET', '/uretim-emirleri/ara?q=arama')).durum, 401);
    assert.equal((await istek(yonetici, 'GET', '/uretim-emirleri/ara?q=a')).durum, 400);
    assert.deepEqual(await ara('yok-boyle-emir'), []);
  });
});

describe('üretim emirleri genel arama ucu: operatörün kendi istasyonu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let atanmis = '';
  let atanmamis = '';
  const emir: Record<'adimsiz' | 'adimli' | 'baska' | 'iptal', number> = { adimsiz: 0, adimli: 0, baska: 0, iptal: 0 };

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const giris = async (kullaniciAdi: string): Promise<string> => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  };
  const ara = async (cerez: string, q: string) => {
    const c = await app.inject({ method: 'GET', url: `/api/uretim-emirleri/ara?q=${encodeURIComponent(q)}`, headers: { cookie: cerez } });
    assert.equal(c.statusCode, 200, c.body);
    return (c.json() as KayitAramaCevabi).sonuclar;
  };
  before(async () => {
    ortam = await testVeritabaniKur('emirarama_ist');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    const yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'ui-yonetici', parola: PAROLA }));
    const rol = await vt().tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_arayan', 'Geçici Arayan') RETURNING id");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'uretim-emirleri.ara-istasyon')", [rol!.id]);
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const kisiler = await vt().tx(async (db) => Promise.all(['ui-atanmis', 'ui-atanmamis'].map(async (kullaniciAdi) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, id, rol!.id);
      await rolAl(db, yoneticiId, id, yoneticiRolu!.id);
      return id;
    })));
    const sahip = ortam.sahip;
    const im = await sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('UIIM', 'Deneme Merkezi') RETURNING id");
    const [benim, baska] = await Promise.all(['UIA', 'UIB'].map(async (kod) =>
      (await sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $1, $2) RETURNING id", [kod, im!.id]))!.id));
    await sahip.sorgu("INSERT INTO istasyon_kisi (istasyon_id, kisi_id, baslangic, yuzde) VALUES ($1, $2, '2000-01-01', 100)", [benim, kisiler[0]]);
    const ekle = async (parcaNo: string, istasyonId: number) =>
      (await sahip.tek<{ id: number }>("INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id) VALUES ($1, 'Arama Parçası', 5, $2, $3) RETURNING id", [parcaNo, istasyonId, yoneticiId]))!.id;
    emir.adimsiz = await ekle('P-IST-1', benim!);
    emir.adimli = await ekle('P-IST-2', baska!);
    emir.baska = await ekle('P-IST-3', baska!);
    emir.iptal = await ekle('P-IST-4', benim!);
    await sahip.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now() WHERE id = $1", [emir.iptal]);
    const tip = await sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('UIT', 'Deneme tipi', 'TAL') RETURNING id");
    await sahip.sorgu("INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, istasyon_id) VALUES ($1, 1, 10, $2, 'OP 10', $3)", [emir.adimli, tip!.id, benim]);
    atanmis = await giris('ui-atanmis');
    atanmamis = await giris('ui-atanmamis');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('yalnız bugün atandığı istasyonda adımı olan açık emir döner; sonuç Üretim Terminali\'ni o emir seçili açar', async () => {
    const sonuclar = await ara(atanmis, 'p-ist');
    assert.deepEqual(sonuclar.map((s) => s.anahtar), [String(emir.adimli), String(emir.adimsiz)]);
    assert.deepEqual(sonuclar.map((s) => s.yol), [`/uretim-terminali?emir=${emir.adimli}`, `/uretim-terminali?emir=${emir.adimsiz}`]);
    assert.equal(sonuclar[0]?.aciklama, 'P-IST-2 Arama Parçası · Planlı');
  });

  test('istasyon ataması olmayan kişi boş sonuç alır', async () => {
    assert.deepEqual(await ara(atanmamis, 'p-ist'), []);
  });
});
