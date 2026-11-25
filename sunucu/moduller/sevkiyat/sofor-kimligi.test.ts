import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { KIMLIK_ANAHTARI_DEGISKENI, kimlikCoz, kimlikGecerliMi, kimlikSifrele } from './kimlik-sifre.ts';
import { soforKimlikleriniTemizle } from './servis.ts';

// Kart 3694-4: şoför kimlik no'su uçları (gerçek PostgreSQL). Numara sentetiktir (sağlama haneleri tutan örnek), gerçek kişiye ait değildir.
const PAROLA = 'dogru-parola-1';
const KIMLIK = '12345678950';
const ANAHTAR = randomBytes(32).toString('base64');

describe('şoför kimlik no uçları (3694-4)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let isleyen = '';
  let isId = 0;
  let digerIsId = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const giris = async (kullaniciAdi: string): Promise<string> => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return String(c.headers['set-cookie'] ?? '').split(';')[0] ?? '';
  };
  const iste = (method: 'GET' | 'POST', url: string, cerez: string, payload?: unknown) =>
    app.inject({
      method, url: `/api${url}`, ...(payload === undefined ? {} : { payload: payload as object }),
      headers: { cookie: cerez, ...(method === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) },
    });

  before(async () => {
    process.env[KIMLIK_ANAHTARI_DEGISKENI] = ANAHTAR;
    ortam = await testVeritabaniKur('soforkimlik');
    app = await uygulamaKur({ vt: vt(), ayar: ortam.ayar, kimlik: kimlikCozucu(vt()), denetle: denetimYaz, tekrar: tekrarDeposu });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'sk-yonetici', parola: PAROLA }));
    const kisiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Isleyen', kullaniciAdi: 'sk-isleyen', parola: PAROLA }));
    await vt().sorgu("INSERT INTO rol (kod, ad) VALUES ('sk_isleyen', 'Isleyen')");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, i FROM rol, unnest(ARRAY['sevkiyat.oku', 'sevkiyat.is-yaz']) AS i WHERE kod = 'sk_isleyen'");
    await vt().sorgu("UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = 'sk_isleyen') WHERE kisi_id = $1", [kisiId]);
    yonetici = await giris('sk-yonetici');
    isleyen = await giris('sk-isleyen');
    const nokta = async (ad: string): Promise<number> =>
      (await iste('POST', '/sevkiyat/noktalar/ekle', yonetici, { ad, tur: 'diger', enlem: 39.95, boylam: 32.8, adres: null, durakSuresiDakika: 10 })).json().nokta.id as number;
    const a = await nokta('Nokta A');
    const b = await nokta('Nokta B');
    const is = async (): Promise<number> => {
      const c = await iste('POST', '/sevkiyat/isler/ekle', yonetici, {
        tarih: '2026-10-08', tur: 'aktarma', alisNoktasiId: a, birakisNoktasiId: b, agirlikKilogram: 10, paletSayisi: 0, durakSuresiDakika: null,
        alisEnErken: '09:00', alisEnGec: '12:00', birakisEnErken: null, birakisEnGec: null, belgeNo: null, aciklama: null, sabitAracId: null,
      });
      assert.equal(c.statusCode, 200, c.body);
      return c.json().is.id as number;
    };
    isId = await is();
    digerIsId = await is();
  });
  after(async () => { delete process.env[KIMLIK_ANAHTARI_DEGISKENI]; await app?.close(); await ortam?.kaldir(); });

  test('örnek numara sağlama hanelerini tutar, bozuk olanlar tutmaz', () => {
    assert.equal(kimlikGecerliMi(KIMLIK), true);
    for (const k of ['12345678951', '02345678950', '1234567895', '123456789500', 'abcdefghijk']) assert.equal(kimlikGecerliMi(k), false, k);
  });

  test('ek doğrulama verisi (AAD): başka satıra taşınan değer çözülmez', () => {
    const anahtar = Buffer.from(ANAHTAR, 'base64');
    const s = kimlikSifrele(KIMLIK, anahtar, 'sevkiyat_isi:1');
    assert.equal(kimlikCoz(s, anahtar, 'sevkiyat_isi:1'), KIMLIK);
    assert.equal(kimlikCoz(s, anahtar, 'sevkiyat_isi:2'), null);
    assert.equal(kimlikCoz(s, anahtar), null);
  });

  test('anahtar yoksa alan kapalı: durum acik=false, yazma reddedilir', async () => {
    delete process.env[KIMLIK_ANAHTARI_DEGISKENI];
    try {
      const d = await iste('GET', `/sevkiyat/isler/${isId}/sofor-kimligi`, yonetici);
      assert.deepEqual([d.statusCode, d.json().acik], [200, false]);
      const y = await iste('POST', `/sevkiyat/isler/${isId}/sofor-kimligi`, yonetici, { kimlik: KIMLIK });
      assert.equal(y.statusCode, 422, y.body);
    } finally { process.env[KIMLIK_ANAHTARI_DEGISKENI] = ANAHTAR; }
  });

  test('yazma: yalnız geçerli numara; liste yalnız maske verir, tam değer cevapta yok', async () => {
    const kotu = await iste('POST', `/sevkiyat/isler/${isId}/sofor-kimligi`, isleyen, { kimlik: '12345678951' });
    assert.equal(kotu.statusCode, 400, kotu.body);
    const y = await iste('POST', `/sevkiyat/isler/${isId}/sofor-kimligi`, isleyen, { kimlik: KIMLIK });
    assert.equal(y.statusCode, 200, y.body);
    assert.deepEqual([y.json().acik, y.json().var, y.json().maskeli], [true, true, '********950']);
    const d = await iste('GET', `/sevkiyat/isler/${isId}/sofor-kimligi`, isleyen);
    assert.equal(d.body.includes(KIMLIK), false);
    const hamSatir = await vt().tek<{ sifreli: string; son_uc: string }>('SELECT sifreli, son_uc FROM sevkiyat_sofor_kimligi WHERE sevkiyat_isi_id = $1', [isId]);
    assert.equal(hamSatir?.sifreli.includes(KIMLIK), false, 'düz metin saklanmaz');
    assert.equal(hamSatir?.son_uc, '950');
  });

  test('tam okuma yalnız sevkiyat.sofor-kimlik-oku olanda (yönetici); işleyen 403; değer denetim izine ve tekrar deposuna girmez', async () => {
    assert.equal((await iste('POST', `/sevkiyat/isler/${isId}/sofor-kimligi/oku`, isleyen)).statusCode, 403);
    const o = await iste('POST', `/sevkiyat/isler/${isId}/sofor-kimligi/oku`, yonetici);
    assert.equal(o.statusCode, 200, o.body);
    assert.equal(o.json().kimlik, KIMLIK);
    const iz = await vt().sorgu<{ yol: string }>("SELECT yol FROM denetim_kaydi WHERE yol LIKE '%sofor-kimligi/oku%'");
    assert.ok(iz.length >= 1, 'her tam okuma denetim kaydına düşer');
    const yazmaIzi = await vt().tek<{ govde: string | null }>("SELECT govde::text AS govde FROM denetim_kaydi WHERE yol = $1 AND yontem = 'POST' ORDER BY id DESC LIMIT 1", ['/sevkiyat/isler/:id/sofor-kimligi']);
    assert.ok(yazmaIzi, 'yazma da denetim kaydı bırakır');
    assert.equal((yazmaIzi.govde ?? '').includes(KIMLIK), false, 'gizli işaretli alan değeriyle girmez');
    assert.match(yazmaIzi.govde ?? '', /\[gizli\]/);
    // Veritabanındaki hiçbir tabloda düz kimlik no'su geçmez (denetim, tekrar deposu, günlükler dahil).
    const tablolar = await vt().sorgu<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    for (const { tablename } of tablolar) {
      const n = await vt().tek<{ n: string }>(`SELECT count(*) AS n FROM "${tablename}" t WHERE t::text LIKE $1`, [`%${KIMLIK}%`]);
      assert.equal(Number(n?.n), 0, `${tablename} düz kimlik içeriyor`);
    }
  });

  test('başka işe kopyalanan şifreli değer çözülmez; kimlik olmayan iş 404', async () => {
    await vt().sorgu(
      'INSERT INTO sevkiyat_sofor_kimligi (sevkiyat_isi_id, sifreli, son_uc, yazan_kisi_id) SELECT $2, sifreli, son_uc, yazan_kisi_id FROM sevkiyat_sofor_kimligi WHERE sevkiyat_isi_id = $1',
      [isId, digerIsId]);
    const c = await iste('POST', `/sevkiyat/isler/${digerIsId}/sofor-kimligi/oku`, yonetici);
    assert.equal(c.statusCode, 422, c.body);
    await vt().sorgu('DELETE FROM sevkiyat_sofor_kimligi WHERE sevkiyat_isi_id = $1', [digerIsId]);
    assert.equal((await iste('POST', `/sevkiyat/isler/${digerIsId}/sofor-kimligi/oku`, yonetici)).statusCode, 404);
  });

  test('silme komutu kimliği siler; süresi dolan kimlikler sevk tarihinden 90 gün sonra silinir', async () => {
    const s = await iste('POST', `/sevkiyat/isler/${isId}/sofor-kimligi/sil`, isleyen);
    assert.deepEqual([s.statusCode, s.json().var], [200, false]);
    await iste('POST', `/sevkiyat/isler/${isId}/sofor-kimligi`, isleyen, { kimlik: KIMLIK });
    // İş tarihi 2026-10-08: 89. gün durur, 91. gün silinir.
    assert.equal(await vt().tx((db) => soforKimlikleriniTemizle(db, '2027-01-05')), 0);
    assert.equal(await vt().tx((db) => soforKimlikleriniTemizle(db, '2027-01-07')), 1);
    assert.equal((await iste('GET', `/sevkiyat/isler/${isId}/sofor-kimligi`, isleyen)).json().var, false);
  });
});
