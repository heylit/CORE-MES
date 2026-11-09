import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KmKategoriDugumu, KmKategoriOnayi, KmKategoriOnaylariCevabi } from '#paylasilan/sozlesme/kalite-merkezi-kategori-onayi.ts';
import { kmKategoriKarariGovdesi } from '#paylasilan/sozlesme/kalite-merkezi-kategori-onayi.ts';
import { denetimYaz } from '../../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../../kisiler/disari.ts';
import { kimlikCozucu } from '../../oturum/disari.ts';
import { kategoriOnaylari } from '../disari.ts';
import { askidakiFirmalar, gecerliKararlar, kategoriReddi, KATEGORI_ILETILERI } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

describe('Kategori onayı kuralları (2466)', () => {
  const agac: KmKategoriDugumu[] = [
    { tur: 'hizmet', kod: 'isil', ad: 'Isıl işlem', ustAd: 'Hizmet', aktif: true },
    { tur: 'sarf', kod: 'eski', ad: 'Eski sarf', ustAd: 'Sarf', aktif: false },
  ];

  test('KMK-1: yeni karar yalnız ağaçtaki aktif kategoriye; var olan karar her durumda değiştirilir', () => {
    assert.equal(kategoriReddi(agac, 'hizmet', 'isil', true), null);
    assert.equal(kategoriReddi(agac, 'sarf', 'eski', true), KATEGORI_ILETILERI.kategoriPasif);
    assert.equal(kategoriReddi(agac, 'hizmet', 'yok', true), KATEGORI_ILETILERI.kategoriYok);
    assert.equal(kategoriReddi(agac, 'hammadde', 'isil', true), KATEGORI_ILETILERI.kategoriYok);
    assert.equal(kategoriReddi(agac, 'sarf', 'eski', false), null);
    assert.equal(kategoriReddi(agac, 'hizmet', 'yok', false), null);
  });

  const firmalar = [{ id: 1, kod: 'T-1', ad: 'Bir' }, { id: 2, kod: null, ad: 'İki' }];
  test('KMK-2: askı tarihi firmayı askıya bağlayan kayıtların en sonu; en kısıtlayıcı durum Askıda değilse askı yok', () => {
    const m = askidakiFirmalar([
      { firmaId: 1, kod: null, ad: 'a', onay: 'Askıda', degisti: '2026-11-01T10:00:00+00:00' },
      { firmaId: null, kod: 't-1', ad: 'b', onay: 'Askıda', degisti: '2026-11-03T10:00:00+00:00' },
      { firmaId: 2, kod: null, ad: 'c', onay: 'Onaylı', degisti: '2026-11-05T10:00:00+00:00' },
    ], firmalar);
    assert.deepEqual([...m], [[1, '2026-11-03T10:00:00+00:00']]);
    assert.deepEqual([...askidakiFirmalar([{ firmaId: 2, kod: null, ad: 'c', onay: 'Aday', degisti: '2026-11-05T10:00:00+00:00' }], firmalar)], []);
  });

  test('KMK-3: askıda her karar onaysız ve kaynağı firma askısı; askı yoksa karar aynen', () => {
    const k: KmKategoriOnayi = { kategoriTuru: 'hizmet', kategoriKodu: 'isil', durum: 'onayli', kaynak: 'kategori', tarih: '2026-10-02T08:00:00+00:00', kisiAd: 'X', aciklama: null, surum: 1 };
    assert.deepEqual(gecerliKararlar([k], null), [k]);
    assert.deepEqual(gecerliKararlar([k], '2026-11-03T10:00:00+00:00'), [{ ...k, durum: 'onaysiz', kaynak: 'firma_askida', tarih: '2026-11-03T10:00:00+00:00' }]);
  });

  test('gövde: şartlı kararda şart zorunlu; boş açıklama boştur', () => {
    const g = { firmaId: 1, kategoriTuru: 'hizmet', kategoriKodu: 'isil', surum: null };
    assert.equal(kmKategoriKarariGovdesi.safeParse({ ...g, durum: 'sartli', aciklama: '  ' }).success, false);
    assert.equal(kmKategoriKarariGovdesi.safeParse({ ...g, durum: 'sartli', aciklama: 'İlk partide tam kontrol' }).success, true);
    const o = kmKategoriKarariGovdesi.parse({ ...g, durum: 'onayli', aciklama: '' });
    assert.equal(o.aciklama, null);
  });
});

describe('Kategori onayı uçları ve okuma (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonId = 0;
  let kalite = '';
  let yazan = '';
  let okuyan = '';
  const f = { ted: 0, musteri: 0, pasif: 0 };
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (cerez: string, url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: govde === undefined ? 'GET' : 'POST', url: `/api${url}`, headers: { cookie: cerez }, ...(govde === undefined ? {} : { payload: govde as object }) });
  const karar = (cerez: string, g: Record<string, unknown>) =>
    istek(cerez, '/kalite-merkezi/kategori-onaylari/karar', { kategoriTuru: 'hizmet', kategoriKodu: 'isil', aciklama: null, surum: null, ...g });
  const ekran = async (firmaId: number): Promise<KmKategoriOnaylariCevabi> => {
    const r = await istek(kalite, `/kalite-merkezi/kategori-onaylari?firmaId=${firmaId}`);
    assert.equal(r.statusCode, 200, r.body);
    return r.json() as KmKategoriOnaylariCevabi;
  };
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
  const firma = async (ad: string, tur: string, aktif = true): Promise<number> =>
    (await vt().tek<{ id: number }>('INSERT INTO musteri_tedarikci_firma (ad, tur, aktif, olusturan_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [ad, tur, aktif, yonId]))!.id;

  before(async () => {
    ortam = await testVeritabaniKur('km_kategori_onayi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yonId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'kko-yon', parola: PAROLA }));
    kalite = (await girisYap('kko-kalite', 'kalite')).cerez;
    const y = await girisYap('kko-yazan', 'operator');
    await vt().sorgu("INSERT INTO kisi_islemi (kisi_id, islem, veren_id) VALUES ($1, 'kalite-merkezi.oku', $2), ($1, 'kalite-merkezi.yaz', $2)", [y.id, yonId]);
    yazan = y.cerez;
    const o = await girisYap('kko-okuyan', 'operator');
    await vt().sorgu("INSERT INTO kisi_islemi (kisi_id, islem, veren_id) VALUES ($1, 'kalite-merkezi.oku', $2)", [o.id, yonId]);
    okuyan = o.cerez;
    f.ted = await firma('Deneme Tedarik', 'tedarikci');
    f.musteri = await firma('Deneme Müşteri', 'musteri');
    f.pasif = await firma('Deneme Pasif', 'tedarikci', false);
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('yetki: onay işlemi karar verir ve ekranı açar; yalnız yazan ya da okuyan 403 alır, karar yazılmaz', async () => {
    for (const c of [yazan, okuyan]) {
      assert.equal((await karar(c, { firmaId: f.ted, durum: 'onayli' })).statusCode, 403);
      assert.equal((await istek(c, `/kalite-merkezi/kategori-onaylari?firmaId=${f.ted}`)).statusCode, 403);
    }
    assert.deepEqual((await ekran(f.ted)).onaylar, []);
  });

  test('yeni karar: kişi ve zaman sunucudan; geçmişe yazılır; ikinci yeni karar 409', async () => {
    const r = await karar(kalite, { firmaId: f.ted, durum: 'onayli', kisiId: 999, zaman: '2000-01-01T00:00:00Z' });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json(), { surum: 1 });
    const e = await ekran(f.ted);
    assert.equal(e.onaylar.length, 1);
    assert.equal(e.onaylar[0]!.kisiAd, 'Deneme kko-kalite');
    assert.equal(e.onaylar[0]!.kaynak, 'kategori');
    assert.ok(Date.now() - Date.parse(e.onaylar[0]!.tarih) < 60_000);
    assert.ok(e.agac.some((d) => d.tur === 'hizmet' && d.kod === 'isil'));
    assert.equal((await karar(kalite, { firmaId: f.ted, durum: 'onaysiz' })).statusCode, 409);
    const g = await vt().sorgu<{ onceki_durum: string | null; durum: string }>('SELECT onceki_durum, durum FROM kalite_merkezi_kategori_onayi_gecmisi WHERE firma_id = $1 ORDER BY id', [f.ted]);
    assert.deepEqual(g, [{ onceki_durum: null, durum: 'onayli' }]);
  });

  test('değiştirme: okunan sürümle yazılır, eski sürüm 409; olmayan karar 404; geçmiş önceki durumu tutar', async () => {
    const r = await karar(kalite, { firmaId: f.ted, durum: 'sartli', aciklama: 'İlk partide tam kontrol', surum: 1 });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json(), { surum: 2 });
    assert.equal((await karar(kalite, { firmaId: f.ted, durum: 'onaysiz', surum: 1 })).statusCode, 409);
    assert.equal((await karar(kalite, { firmaId: f.ted, kategoriKodu: 'yuzey', durum: 'onaysiz', surum: 1 })).statusCode, 404);
    const g = await vt().sorgu<{ onceki_durum: string | null; durum: string; aciklama: string | null }>(
      'SELECT onceki_durum, durum, aciklama FROM kalite_merkezi_kategori_onayi_gecmisi WHERE firma_id = $1 ORDER BY id', [f.ted]);
    assert.deepEqual(g.at(-1), { onceki_durum: 'onayli', durum: 'sartli', aciklama: 'İlk partide tam kontrol' });
    await assert.rejects(vt().sorgu('DELETE FROM kalite_merkezi_kategori_onayi_gecmisi WHERE firma_id = $1', [f.ted]));
  });

  test('red: şartsız şartlı, müşteri ve pasif firma, ağaçta olmayan ya da pasif kategori 400', async () => {
    assert.equal((await karar(kalite, { firmaId: f.ted, kategoriKodu: 'yuzey', durum: 'sartli' })).statusCode, 400);
    for (const firmaId of [f.musteri, f.pasif, 999999]) {
      const r = await karar(kalite, { firmaId, kategoriKodu: 'yuzey', durum: 'onayli' });
      assert.equal(r.statusCode, 400, r.body);
      assert.equal((r.json() as { alan?: string }).alan, 'firmaId');
    }
    const yok = await karar(kalite, { firmaId: f.ted, kategoriKodu: 'olmayan', durum: 'onayli' });
    assert.equal(yok.statusCode, 400, yok.body);
    assert.equal((yok.json() as { alan?: string }).alan, 'kategoriKodu');
    await vt().sorgu("UPDATE malzeme_kategorisi SET aktif = false WHERE tur = 'hizmet' AND kod = 'yuzey'");
    assert.equal((await karar(kalite, { firmaId: f.ted, kategoriKodu: 'yuzey', durum: 'onayli' })).statusCode, 400);
    await vt().sorgu("UPDATE malzeme_kategorisi SET aktif = true WHERE tur = 'hizmet' AND kod = 'yuzey'");
    assert.equal((await karar(kalite, { firmaId: f.ted, kategoriKodu: 'yuzey', durum: 'onayli' })).statusCode, 200);
  });

  test('ihraç (2466-2 a): firma askıdaysa her karar onaysız, kaynağı firma askısı; askı kalkınca karar aynen; boş istek boş', async () => {
    const once = (await vt().tx((db) => kategoriOnaylari(db, [f.ted, f.pasif])));
    assert.equal(once.get(f.ted)!.firmaAskida, null);
    assert.deepEqual(once.get(f.ted)!.kategoriler.map((k) => [k.kategoriKodu, k.durum, k.kaynak]), [['isil', 'sartli', 'kategori'], ['yuzey', 'onayli', 'kategori']]);
    assert.deepEqual(once.get(f.pasif), { firmaAskida: null, kategoriler: [] });
    const s = await istek(kalite, '/kalite-merkezi/kayitlar/sup/sup_aski/onayla', { govde: { ad: 'Deneme', onay: 'Askıda', firmaId: f.ted }, surum: null });
    assert.equal(s.statusCode, 200, s.body);
    const aski = (await vt().tx((db) => kategoriOnaylari(db, [f.ted]))).get(f.ted)!;
    assert.ok(aski.firmaAskida !== null);
    assert.deepEqual(aski.kategoriler.map((k) => [k.kategoriKodu, k.durum, k.kaynak, k.tarih]),
      [['isil', 'onaysiz', 'firma_askida', aski.firmaAskida.tarih], ['yuzey', 'onaysiz', 'firma_askida', aski.firmaAskida.tarih]]);
    assert.ok((await ekran(f.ted)).firmaAskida !== null);
    const g = await istek(kalite, '/kalite-merkezi/kayitlar/sup/sup_aski/onayla', { govde: { ad: 'Deneme', onay: 'Onaylı', firmaId: f.ted }, surum: (s.json() as { surum: number }).surum });
    assert.equal(g.statusCode, 200, g.body);
    const sonra = (await vt().tx((db) => kategoriOnaylari(db, [f.ted]))).get(f.ted)!;
    assert.equal(sonra.firmaAskida, null);
    assert.deepEqual(sonra.kategoriler.map((k) => k.durum), ['sartli', 'onayli']);
    assert.deepEqual([...await vt().tx((db) => kategoriOnaylari(db, []))], []);
  });
});
