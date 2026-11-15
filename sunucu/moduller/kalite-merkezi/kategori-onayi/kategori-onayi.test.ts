import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KmKategoriDugumu, KmKategoriOnayi, KmKategoriOnaylariCevabi } from '#paylasilan/sozlesme/kalite-merkezi-kategori-onayi.ts';
import { kmKategoriKarariGovdesi, kmTedarikciOnayiGovdesi } from '#paylasilan/sozlesme/kalite-merkezi-kategori-onayi.ts';
import type { KmTedarikciOnaylariCevabi } from '#paylasilan/sozlesme/kalite-merkezi-kategori-onayi.ts';
import { denetimYaz } from '../../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../../kisiler/disari.ts';
import { kimlikCozucu } from '../../oturum/disari.ts';
import { kategoriOnaylari, onayliListe } from '../disari.ts';
import { askidakiFirmalar, gecerliKararlar, kapsamiDuzenle, kategoriReddi, KATEGORI_ILETILERI, listeFirmalari, onayGecerliligi } from './kurallar.ts';

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

  test('onaylı liste (3279 a): kayıt alanları ve geçerli kararlar; ad ile eşlenen işaretli; kaydı ve kararı olmayan firma yok', async () => {
    const s = await istek(kalite, '/kalite-merkezi/kayitlar/sup/sup_liste/onayla', {
      govde: { ad: 'Deneme', onay: 'Onaylı', firmaId: f.ted, kritik: 'Kritik', serts: ['AS9100', 7, ''], sertBitis: '2027-01-31', sonDenetim: 'dün' }, surum: null,
    });
    assert.equal(s.statusCode, 200, s.body);
    const adla = await firma('Deneme Adla', 'tedarikci');
    const a = await istek(kalite, '/kalite-merkezi/kayitlar/sup/sup_adla/onayla', { govde: { ad: 'deneme adla', onay: 'Şartlı onaylı' }, surum: null });
    assert.equal(a.statusCode, 200, a.body);
    const m = await vt().tx((db) => onayliListe(db));
    assert.deepEqual(m.get(f.ted), {
      durum: 'Onaylı', firmaAskida: null, adIleEslendi: false, kritiklik: 'Kritik', sertifikalar: ['AS9100'], sertifikaBitisi: '2027-01-31', sonDenetim: null,
      kategoriler: m.get(f.ted)!.kategoriler, onaylar: [],
    });
    assert.ok(m.get(f.ted)!.kategoriler.every((k) => k.kisiAd !== null), 'karari veren listede');
    assert.deepEqual(m.get(f.ted)!.kategoriler.map((k) => [k.kategoriKodu, k.durum, k.aciklama]), [['isil', 'sartli', 'İlk partide tam kontrol'], ['yuzey', 'onayli', null]]);
    assert.equal(m.get(adla)?.durum, 'Şartlı onaylı');
    assert.equal(m.get(adla)?.adIleEslendi, true);
    assert.equal(m.has(f.pasif), false);
    assert.equal(m.has(f.musteri), false);
    const ask = await istek(kalite, '/kalite-merkezi/kayitlar/sup/sup_liste/onayla', { govde: { ad: 'Deneme', onay: 'Askıda', firmaId: f.ted }, surum: (s.json() as { surum: number }).surum });
    assert.equal(ask.statusCode, 200, ask.body);
    const m2 = await vt().tx((db) => onayliListe(db));
    assert.notEqual(m2.get(f.ted)!.firmaAskida, null);
    assert.deepEqual(m2.get(f.ted)!.kategoriler.map((k) => [k.durum, k.tarih]), m2.get(f.ted)!.kategoriler.map(() => ['onaysiz', m2.get(f.ted)!.firmaAskida]));
  });

  // 3279-2 a: şirket dışı onaylar.
  const onay = (cerez: string, g: Record<string, unknown>) => istek(cerez, '/kalite-merkezi/tedarikci-onaylari/kaydet', {
    id: null, firmaId: f.ted, tur: 'musteri', musteriFirmaId: f.musteri, ad: null, kapsamTumu: false, kapsam: [{ kategoriTuru: 'hizmet', kategoriKodu: 'isil' }],
    durum: 'onayli', aciklama: null, bitis: null, belgeKimligi: null, surum: null, ...g,
  });
  const onaylar = async (): Promise<KmTedarikciOnaylariCevabi> => {
    const r = await istek(kalite, `/kalite-merkezi/tedarikci-onaylari?firmaId=${f.ted}`);
    assert.equal(r.statusCode, 200, r.body);
    return r.json() as KmTedarikciOnaylariCevabi;
  };

  test('3279-2 yetki: yalnız onay işlemi okur ve yazar; yazan ve okuyan 403', async () => {
    for (const c of [yazan, okuyan]) {
      assert.equal((await onay(c, {})).statusCode, 403);
      assert.equal((await istek(c, `/kalite-merkezi/tedarikci-onaylari?firmaId=${f.ted}`)).statusCode, 403);
    }
    const e = await onaylar();
    assert.deepEqual(e.onaylar, []);
    assert.ok(e.musteriler.some((m) => m.id === f.musteri));
    assert.ok(!e.musteriler.some((m) => m.id === f.ted));
  });

  test('3279-2 müşteri ve diğer onay: kişi sunucudan, kapsam ve geçmiş yazılır; değiştirme sürümle, firma ve tür değişmez', async () => {
    // Belge firmanın tedarikçi kaydına bağlıdır (belge.bagli -> sup kaydı -> firmaId).
    const belgeKur = async (sup: string, firmaId: number, belge: string) => {
      await vt().sorgu("INSERT INTO kalite_merkezi_belge (koleksiyon, kimlik, govde, degistiren_id) VALUES ('sup', $1, jsonb_build_object('ad', 'Deneme', 'firmaId', $2::int), $3)", [sup, firmaId, yonId]);
      await vt().sorgu("INSERT INTO kalite_merkezi_belge (koleksiyon, kimlik, govde, degistiren_id) VALUES ('belge', $1, jsonb_build_object('ad', 'Deneme.pdf', 'bagli', jsonb_build_object('col', 'sup', 'id', $2::text)), $3)", [belge, sup, yonId]);
    };
    await belgeKur('sup_onay_belge', f.ted, 'blg_onay');
    await belgeKur('sup_baska_belge', f.musteri, 'blg_baska');
    const r = await onay(kalite, { belgeKimligi: 'blg_onay', bitis: '2027-12-31' });
    assert.equal(r.statusCode, 200, r.body);
    const { id } = r.json() as { id: number; surum: number };
    const d = await onay(kalite, { tur: 'diger', musteriFirmaId: null, ad: 'Deneme sınıf onayı', kapsamTumu: true, kapsam: [], durum: 'sartli', aciklama: 'Deneme şart' });
    assert.equal(d.statusCode, 200, d.body);
    const e = await onaylar();
    assert.deepEqual(e.onaylar.map((o) => [o.tur, o.musteriAd, o.ad, o.kapsamTumu, o.kapsam.map((k) => k.kategoriKodu), o.durum, o.bitis, o.belgeKimligi, o.kisiAd]), [
      ['musteri', 'Deneme Müşteri', null, false, ['isil'], 'onayli', '2027-12-31', 'blg_onay', 'Deneme kko-kalite'],
      ['diger', null, 'Deneme sınıf onayı', true, [], 'sartli', null, null, 'Deneme kko-kalite'],
    ]);
    const g = await onay(kalite, { id, surum: 1, durum: 'onaysiz', belgeKimligi: 'blg_onay', kapsam: [{ kategoriTuru: 'hizmet', kategoriKodu: 'isil' }, { kategoriTuru: 'hizmet', kategoriKodu: 'yuzey' }] });
    assert.equal(g.statusCode, 200, g.body);
    assert.deepEqual(g.json(), { id, surum: 2 });
    assert.equal((await onay(kalite, { id, surum: 1 })).statusCode, 409);
    assert.equal((await onay(kalite, { id, surum: 2, tur: 'diger', musteriFirmaId: null, ad: 'X' })).statusCode, 400);
    assert.equal((await onay(kalite, { id: 2147480000, surum: 1 })).statusCode, 404);
    const gecmis = await vt().sorgu<{ onceki_durum: string | null; durum: string; kapsam: string[] }>(
      'SELECT onceki_durum, durum, kapsam FROM kalite_merkezi_tedarikci_onayi_gecmisi WHERE onay_id = $1 ORDER BY id', [id]);
    assert.deepEqual(gecmis, [{ onceki_durum: null, durum: 'onayli', kapsam: ['hizmet|isil'] }, { onceki_durum: 'onayli', durum: 'onaysiz', kapsam: ['hizmet|isil', 'hizmet|yuzey'] }]);
    await assert.rejects(vt().sorgu('DELETE FROM kalite_merkezi_tedarikci_onayi_gecmisi WHERE onay_id = $1', [id]));
    await assert.rejects(vt().sorgu("UPDATE kalite_merkezi_tedarikci_onayi SET musteri_firma_id = NULL WHERE id = $1", [id]), /kalite_merkezi_tedarikci_onayi_musteri_turu/);
  });

  test('3279-2 red: müşterisiz müşteri onayı, müşteri olmayan müşteri, kendisi, olmayan belge ve kategori, şartsız şartlı, kapsamsız 400', async () => {
    const red = async (g: Record<string, unknown>, alan: string) => {
      const r = await onay(kalite, g);
      assert.equal(r.statusCode, 400, r.body);
      assert.equal((r.json() as { alan?: string }).alan, alan, r.body);
    };
    await red({ musteriFirmaId: null }, 'musteriFirmaId');
    await red({ musteriFirmaId: f.pasif }, 'musteriFirmaId');
    await red({ musteriFirmaId: f.ted }, 'musteriFirmaId');
    await red({ firmaId: f.musteri, musteriFirmaId: f.musteri }, 'firmaId');
    await red({ belgeKimligi: 'blg_yok' }, 'belgeKimligi');
    // Başka firmanın tedarikçi kaydına bağlı belge bu firmanın onayına bağlanamaz (Risk N1).
    await red({ belgeKimligi: 'blg_baska' }, 'belgeKimligi');
    await red({ kapsam: [{ kategoriTuru: 'hizmet', kategoriKodu: 'olmayan' }] }, 'kapsam');
    await red({ kapsam: [] }, 'kapsam');
    await red({ durum: 'sartli' }, 'aciklama');
    await red({ tur: 'diger', musteriFirmaId: null }, 'ad');
  });

  test('3279-2 onaylı liste: şirket dışı onaylar belge yerine yalnız var mı ile; süresi geçen onaysız; Askıda reddi gevşemez (K4)', async () => {
    await vt().sorgu("UPDATE kalite_merkezi_tedarikci_onayi SET bitis = DATE '2020-01-01' WHERE tur = 'diger' AND firma_id = $1", [f.ted]);
    const m = (await vt().tx((db) => onayliListe(db))).get(f.ted)!;
    assert.deepEqual(m.onaylar.map((o) => [o.tur, o.musteriAd, o.durum, o.suresiGecti, o.belgeVar]), [['musteri', 'Deneme Müşteri', 'onaysiz', false, true], ['diger', null, 'onaysiz', true, false]]);
    assert.ok(!('belgeKimligi' in m.onaylar[0]!));
    const s = await istek(kalite, '/kalite-merkezi/kayitlar/sup/sup_liste/onayla', { govde: { ad: 'Deneme', onay: 'Askıda', firmaId: f.ted }, surum: (await vt().tek<{ surum: string }>("SELECT surum FROM kalite_merkezi_belge WHERE koleksiyon = 'sup' AND kimlik = 'sup_liste'"))!.surum });
    assert.equal(s.statusCode, 200, s.body);
    const askida = (await vt().tx((db) => onayliListe(db))).get(f.ted)!;
    assert.equal(askida.durum, 'Askıda');
    assert.ok(askida.kategoriler.every((k) => k.durum === 'onaysiz'));
  });
});

describe('Şirket dışı onay kuralları (3279-2)', () => {
  const agac: KmKategoriDugumu[] = [
    { tur: 'hizmet', kod: 'isil', ad: 'Isıl işlem', ustAd: 'Hizmet', aktif: true },
    { tur: 'sarf', kod: 'eski', ad: 'Eski sarf', ustAd: 'Sarf', aktif: false },
  ];
  test('KMK-5: kapsam tekil ve sıralı; bütün kategoride boş; yeni pasif kategori reddedilir, eskiden kapsamdaki kalır', () => {
    const isil = { kategoriTuru: 'hizmet', kategoriKodu: 'isil' } as const;
    const eski = { kategoriTuru: 'sarf', kategoriKodu: 'eski' } as const;
    assert.deepEqual(kapsamiDuzenle(agac, true, [isil], []), { kapsam: [], red: null });
    assert.deepEqual(kapsamiDuzenle(agac, false, [isil, isil], []), { kapsam: [isil], red: null });
    assert.equal(kapsamiDuzenle(agac, false, [eski], []).red, KATEGORI_ILETILERI.kategoriPasif);
    assert.deepEqual(kapsamiDuzenle(agac, false, [isil, eski], ['sarf|eski']), { kapsam: [isil, eski], red: null });
  });
  test('KMK-6: bitişi bugünden önce olan onaysız; bugün biten ve süresiz geçerli', () => {
    assert.deepEqual(onayGecerliligi('onayli', '2026-11-14', '2026-11-15'), { durum: 'onaysiz', suresiGecti: true });
    assert.deepEqual(onayGecerliligi('sartli', '2026-11-15', '2026-11-15'), { durum: 'sartli', suresiGecti: false });
    assert.deepEqual(onayGecerliligi('onayli', null, '2026-11-15'), { durum: 'onayli', suresiGecti: false });
  });
  test('gövde: yeni onayda sürüm yok, değiştirmede var; boş ad ve açıklama boştur', () => {
    const g = { id: null, firmaId: 1, tur: 'diger', musteriFirmaId: null, ad: ' Deneme ', kapsamTumu: true, kapsam: [], durum: 'onayli', aciklama: '', bitis: null, belgeKimligi: null, surum: null };
    const o = kmTedarikciOnayiGovdesi.parse(g);
    assert.deepEqual([o.ad, o.aciklama], ['Deneme', null]);
    assert.equal(kmTedarikciOnayiGovdesi.safeParse({ ...g, surum: 1 }).success, false);
    assert.equal(kmTedarikciOnayiGovdesi.safeParse({ ...g, id: 3, surum: 1 }).success, true);
    assert.equal(kmTedarikciOnayiGovdesi.safeParse({ ...g, ad: '' }).success, false);
    assert.equal(kmTedarikciOnayiGovdesi.safeParse({ ...g, bitis: '2026-02-30' }).success, false);
  });
});

describe('Onaylı liste Kalite parçası (3279 a)', () => {
  const firmalar = [{ id: 1, kod: 'T-1', ad: 'Bir' }, { id: 2, kod: null, ad: 'İki' }, { id: 3, kod: null, ad: 'Üç' }];
  const kayit = (k: Partial<Parameters<typeof listeFirmalari>[0][number]>) => ({
    firmaId: null, kod: null, ad: '', onay: null, kritik: null, serts: [], sertBitis: null, sonDenetim: null, ...k,
  });

  test('KMK-4: kayıtlar firmada birleşir; kimliksiz eşleşme işaretlenir; kaydı olmayan firma yok', () => {
    const m = listeFirmalari([
      kayit({ firmaId: 1, onay: 'Onaylı', kritik: 'Önemli', serts: ['ISO 9001'], sertBitis: '2027-03-01', sonDenetim: '2026-01-10' }),
      kayit({ kod: 't-1', ad: 'x', onay: 'Şartlı onaylı', kritik: 'Kritik', serts: ['AS9100', 'ISO 9001'], sertBitis: '2026-12-01', sonDenetim: '2025-05-01' }),
      kayit({ ad: 'iki', onay: 'Onaylı', kritik: 'yanlış', sertBitis: null }),
    ], firmalar);
    assert.deepEqual([...m.keys()].sort(), [1, 2]);
    assert.deepEqual(m.get(1), {
      durum: 'Şartlı onaylı', adIleEslendi: false, kritiklik: 'Kritik', sertifikalar: ['AS9100', 'ISO 9001'], sertifikaBitisi: '2026-12-01', sonDenetim: '2026-01-10',
    });
    assert.deepEqual(m.get(2), { durum: 'Onaylı', adIleEslendi: true, kritiklik: null, sertifikalar: [], sertifikaBitisi: null, sonDenetim: null });
  });

  test('KMK-4: onayı boş ya da tanımsız kayıt firmaya bağlanır ama durum uydurmaz', () => {
    const m = listeFirmalari([kayit({ firmaId: 3, onay: null, serts: ['NADCAP'] }), kayit({ firmaId: 99, onay: 'Onaylı' })], firmalar);
    assert.deepEqual([...m.keys()], [3]);
    assert.equal(m.get(3)?.durum, null);
    assert.deepEqual(m.get(3)?.sertifikalar, ['NADCAP']);
  });
});
