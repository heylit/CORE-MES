import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KmTedarikciFirmalariCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tedarikciOnayDurumlari } from './disari.ts';
import * as sorgular from './sorgular.ts';
import { tedarikciFirmaKimligi, tedarikciFirmalari, tedarikciOnayDurumlari as durumlar } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

// 236 a: tedarikçi onay durumunun sahibi Kalite Merkezi'dir; satın alma firma kimliğiyle okur.
describe('Tedarikçi onay durumu kuralları (236 a)', () => {
  const firmalar = [{ id: 1, kod: 'T-1', ad: 'Deneme Bir' }, { id: 2, kod: null, ad: 'Deneme İki' }, { id: 3, kod: 'T-3', ad: 'Deneme Bir' }];

  test('firma kimliği olan kayıt yalnız o firmaya bağlanır; ad ya da kod başka firmayı tutmaz', () => {
    const m = durumlar([{ firmaId: 2, kod: 'T-1', ad: 'Deneme Bir', onay: 'Askıda' }], firmalar);
    assert.deepEqual([...m], [[2, 'Askıda']]);
  });

  test('kimliksiz eski kayıt iki tarafta kod varsa kodla, yoksa adla bağlanır; boşluk ve büyük-küçük harf sayılmaz', () => {
    assert.deepEqual([...durumlar([{ firmaId: null, kod: ' t-3 ', ad: 'Başka', onay: 'Aday' }], firmalar)], [[3, 'Aday']]);
    assert.deepEqual([...durumlar([{ firmaId: null, kod: null, ad: ' DENEME İKİ ', onay: 'Onaylı' }], firmalar)], [[2, 'Onaylı']]);
    // Kaydın kodu yok: aynı adlı iki firma da bağlanır (bugünkü eşleme).
    assert.deepEqual([...durumlar([{ firmaId: null, kod: null, ad: 'Deneme Bir', onay: 'Askıda' }], firmalar)].sort(), [[1, 'Askıda'], [3, 'Askıda']]);
  });

  test('aynı firmaya birden çok kayıt: en kısıtlayıcı durum geçerli; geçersiz ya da boş onay durum vermez', () => {
    const m = durumlar([
      { firmaId: 1, kod: null, ad: 'x', onay: 'Onaylı' },
      { firmaId: null, kod: 'T-1', ad: 'y', onay: 'Aday' },
      { firmaId: 1, kod: null, ad: 'z', onay: 'Şartlı onaylı' },
      { firmaId: 2, kod: null, ad: 'w', onay: 'Bilinmiyor' },
      { firmaId: 3, kod: null, ad: 'v', onay: null },
    ], firmalar);
    assert.deepEqual([...m], [[1, 'Aday']]);
  });

  test('firma kimliği alanı: yok ya da null boş bağdır; pozitif tam sayı dışı her değer geçersizdir', () => {
    assert.equal(tedarikciFirmaKimligi(null), null);
    assert.equal(tedarikciFirmaKimligi({}), null);
    assert.equal(tedarikciFirmaKimligi({ firmaId: null }), null);
    assert.equal(tedarikciFirmaKimligi({ firmaId: 7 }), 7);
    for (const d of ['7', 0, -1, 1.5, true, {}]) assert.equal(tedarikciFirmaKimligi({ firmaId: d }), 'gecersiz', String(d));
  });

  test('seçicide yalnız aktif tedarikçi firmalar, adla sıralı', () => {
    assert.deepEqual(tedarikciFirmalari([
      { id: 1, kod: null, ad: 'Zeta', aktif: true, tur: 'tedarikci' },
      { id: 2, kod: 'K', ad: 'Alfa', aktif: true, tur: 'ikisi' },
      { id: 3, kod: null, ad: 'Beta', aktif: true, tur: 'musteri' },
      { id: 4, kod: null, ad: 'Gama', aktif: false, tur: 'tedarikci' },
    ]), [{ id: 2, kod: 'K', ad: 'Alfa' }, { id: 1, kod: null, ad: 'Zeta' }]);
  });
});

describe('Tedarikçi onay durumu ve firma seçici (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonId = 0;
  let kalite = '';
  let muayeneci = '';
  const f: Record<'ted' | 'ikisi' | 'musteri' | 'pasif' | 'eski', number> = { ted: 0, ikisi: 0, musteri: 0, pasif: 0, eski: 0 };
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (cerez: string, url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: govde === undefined ? 'GET' : 'POST', url: `/api${url}`, headers: { cookie: cerez }, ...(govde === undefined ? {} : { payload: govde as object }) });
  const sup = (kimlik: string, govde: Record<string, unknown>, surum: number | null = null) =>
    istek(kalite, `/kalite-merkezi/kayitlar/sup/${kimlik}/onayla`, { govde, surum });
  async function girisYap(kullaniciAdi: string, rolKodu: string): Promise<{ id: number; cerez: string }> {
    const rol = async (kod: string) => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yonId, yeni, await rol(rolKodu));
      await rolAl(db, yonId, yeni, await rol('yonetici'));
      return yeni;
    });
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return { id, cerez: String(r.headers['set-cookie']).split(';')[0] ?? '' };
  }
  const firma = async (ad: string, tur: string, aktif = true, kod: string | null = null): Promise<number> =>
    (await vt().tek<{ id: number }>('INSERT INTO musteri_tedarikci_firma (ad, kod, tur, aktif, olusturan_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [ad, kod, tur, aktif, yonId]))!.id;

  before(async () => {
    ortam = await testVeritabaniKur('km_tedarikci_durumu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yonId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'kmt-yon', parola: PAROLA }));
    kalite = (await girisYap('kmt-kalite', 'kalite')).cerez;
    const m = await girisYap('kmt-muayeneci', 'operator');
    await vt().sorgu("INSERT INTO kisi_islemi (kisi_id, islem, veren_id) VALUES ($1, 'kalite-merkezi.oku', $2), ($1, 'kalite-merkezi.yaz', $2)", [m.id, yonId]);
    muayeneci = m.cerez;
    f.ted = await firma('Deneme Tedarik', 'tedarikci', true, 'DT-1');
    f.ikisi = await firma('Deneme Alfa', 'ikisi');
    f.musteri = await firma('Deneme Müşteri', 'musteri');
    f.pasif = await firma('Deneme Pasif', 'tedarikci', false);
    f.eski = await firma('Deneme Eski', 'tedarikci', true, 'DE-9');
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('seçici ucu: onay işlemiyle aktif tedarikçi firmalar döner; yalnız yazan reddedilir', async () => {
    const r = await istek(kalite, '/kalite-merkezi/tedarikci-firmalari');
    assert.equal(r.statusCode, 200, r.body);
    const ids = (r.json() as KmTedarikciFirmalariCevabi).firmalar.map((x) => x.id);
    assert.ok(ids.includes(f.ted) && ids.includes(f.ikisi) && ids.includes(f.eski));
    assert.ok(!ids.includes(f.musteri) && !ids.includes(f.pasif));
    assert.equal((await istek(muayeneci, '/kalite-merkezi/tedarikci-firmalari')).statusCode, 403);
  });

  test('kayda firma bağı: aktif tedarikçi firma yazılır; müşteri, pasif, olmayan ve sayı olmayan kimlik 400', async () => {
    const r = await sup('sup_ted', { ad: 'Kalitedeki ad', kod: 'X-1', onay: 'Aday', firmaId: f.ted });
    assert.equal(r.statusCode, 200, r.body);
    for (const [kimlik, firmaId] of [['sup_m', f.musteri], ['sup_p', f.pasif], ['sup_y', 999999], ['sup_s', String(f.ted)]] as const) {
      const ret = await sup(kimlik, { ad: 'Deneme', onay: 'Onaylı', firmaId });
      assert.equal(ret.statusCode, 400, `${kimlik}: ${ret.body}`);
      assert.equal((ret.json() as { alan?: string }).alan, 'firmaId');
    }
  });

  test('bağlı firma sonradan pasifleşse de kaydın öteki alanları yazılır', async () => {
    const id = await firma('Deneme Sonra Pasif', 'tedarikci');
    const r = await sup('sup_sp', { ad: 'Deneme', onay: 'Onaylı', firmaId: id });
    assert.equal(r.statusCode, 200, r.body);
    await vt().sorgu('UPDATE musteri_tedarikci_firma SET aktif = false WHERE id = $1', [id]);
    const g = await sup('sup_sp', { ad: 'Deneme', onay: 'Askıda', firmaId: id }, (r.json() as { surum: number }).surum);
    assert.equal(g.statusCode, 200, g.body);
  });

  test('ihraç: firma kimliğiyle durum; kimliksiz eski kayıt kodla bağlanır; kaydı olmayan firma haritada yok', async () => {
    assert.equal((await sup('sup_eski', { ad: 'Başka ad', kod: 'de-9', onay: 'Askıda' })).statusCode, 200);
    const m = await vt().tx((db) => tedarikciOnayDurumlari(db, [f.ted, f.eski, f.ikisi]));
    assert.equal(m.get(f.ted), 'Aday');
    assert.equal(m.get(f.eski), 'Askıda');
    assert.equal(m.has(f.ikisi), false);
    assert.deepEqual([...await vt().tx((db) => tedarikciOnayDurumlari(db, []))], []);
  });

  test('silinen kayıt durum vermez', async () => {
    const id = await firma('Deneme Silinen', 'tedarikci');
    const r = await sup('sup_sil', { ad: 'Deneme', onay: 'Askıda', firmaId: id });
    assert.equal(r.statusCode, 200, r.body);
    await vt().tx((db) => sorgular.sil(db, 'sup', 'sup_sil', yonId, (r.json() as { surum: number }).surum));
    assert.equal((await vt().tx((db) => tedarikciOnayDurumlari(db, [id]))).has(id), false);
  });
});
