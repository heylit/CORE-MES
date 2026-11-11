import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { geometriAnalizCevabi, geometriModelListeCevabi, geometriYuzeyCevabi } from '#paylasilan/sozlesme/geometri.ts';
import type { GeometriYuzeyAdimi, GeometriYuzeyCevabi } from '#paylasilan/sozlesme/geometri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { yuzeyAdimlariCozucusu } from './disari.ts';
import type { YuzeyAdimlariCozucusu } from './disari.ts';
import { geometriTuru } from './servis.ts';
import { geometriSureciKur } from './surec.ts';
import type { GeometriSureci } from './surec.ts';
import { kutuStep } from './test-ortak.ts';

// Yüzey işaretleri (kart 2144): sentetik kutunun altı düzlemi ayrı hesap sürecinde okunur; rota adımları test çözücüsünden gelir
// (gerçek bağ kablolama.ts'dedir).
const PAROLA = 'dogru-parola-1';
const sessiz = { uyar: () => undefined, hata: () => undefined };
const ADIM: GeometriYuzeyAdimi = {
  opNo: 40, adimAdi: 'Toz boya', fason: true, talimatVar: false, sartname: { id: 7, kod: 'BYA-TOZ', ad: 'Toz boya', kategoriKodu: 'BYA' },
  parametreler: [{ anahtar: 'kalinlik', ad: 'Kalınlık', birim: 'µm', deger: 80 }],
};
const boya = { tur: 'rota', opNo: 40, sartnameId: 7 } as const;
const maske = { tur: 'maske' } as const;

describe('geometri: yüzey işaretleri (gerçek PostgreSQL, gerçek giriş, gerçek hesap süreci)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonId = 0;
  let surec: GeometriSureci;
  let oncekiCozucu: YuzeyAdimlariCozucusu | null = null;
  const cerez = new Map<string, string>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const istek = (ad: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<LightMyRequestResponse> => {
    const basliklar: Record<string, string> = ad === null ? {} : { cookie: cerez.get(ad) ?? '' };
    if (yontem === 'POST') basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    return app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
  };
  const tamam = (r: LightMyRequestResponse): unknown => { assert.equal(r.statusCode, 200, r.body); return r.json(); };
  async function giris(kullaniciAdi: string): Promise<void> {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    cerez.set(kullaniciAdi, String(r.headers['set-cookie']).split(';')[0] ?? '');
  }
  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<void> {
    const rol = (await o().vt.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]))!.id;
    for (const islem of islemler) await o().vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol, islem]);
    const yonRolu = (await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!.id;
    await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yonId, yeni, rol);
      await rolAl(db, yonId, yeni, yonRolu);
    });
    await giris(kullaniciAdi);
  }
  // Gerçek rol (3030 a): kişi yalnız o rolle girer; işlem listesi rol göçünden gelir.
  async function rolluKisi(kullaniciAdi: string, rolKodu: string): Promise<number> {
    const rol = (await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]))!.id;
    const yonRolu = (await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!.id;
    const id = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yonId, yeni, rol);
      await rolAl(db, yonId, yeni, yonRolu);
      return yeni;
    });
    await giris(kullaniciAdi);
    return id;
  }
  const yukle = async (icerik: Buffer): Promise<string> => {
    const ozet = createHash('sha256').update(icerik).digest('hex');
    tamam(await istek('yonetici', 'POST', `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') }));
    return ozet;
  };
  async function modelEkle(malzemeNo: number, icerik: Buffer, dosyaAdi: string): Promise<{ revizyonId: number; belgeId: number }> {
    const ozet = await yukle(icerik);
    const ad = `Model ${dosyaAdi}`;
    const c = tamam(await istek('yonetici', 'POST', `/cizimler/malzemeler/${String(malzemeNo)}/belge-ekle`, { ad, tur: '3b-model', ozet, dosyaAdi })) as
      { belgeler: { id: number; ad: string; surum: number; revizyonlar: { id: number }[] }[] };
    const b = c.belgeler.find((x) => x.ad === ad);
    assert.ok(b);
    tamam(await istek('yonetici', 'POST', `/cizimler/${String(b.id)}/revizyonlar/${String(b.revizyonlar[0]?.id)}/yayinla`, { surum: b.surum }));
    const s = geometriModelListeCevabi.parse(tamam(await istek('yonetici', 'GET', '/geometri/modeller'))).satirlar
      .find((x) => x.malzemeNo === malzemeNo && x.belgeAdi === ad);
    assert.ok(s);
    return { revizyonId: s.revizyonId, belgeId: s.belgeId };
  }
  async function revizyonYayinla(belgeId: number, icerik: Buffer, dosyaAdi: string): Promise<number> {
    const ozet = await yukle(icerik);
    const belge = tamam(await istek('yonetici', 'GET', `/cizimler/${String(belgeId)}`)) as { surum: number };
    const e = tamam(await istek('yonetici', 'POST', `/cizimler/${String(belgeId)}/revizyon-ekle`, { ozet, dosyaAdi, surum: belge.surum })) as
      { surum: number; revizyonlar: { id: number; durum: string }[] };
    const taslak = e.revizyonlar.find((r) => r.durum === 'taslak');
    assert.ok(taslak);
    tamam(await istek('yonetici', 'POST', `/cizimler/${String(belgeId)}/revizyonlar/${String(taslak.id)}/yayinla`, { surum: e.surum }));
    return taslak.id;
  }
  const yuzey = async (rev: number, ad = 'okur'): Promise<GeometriYuzeyCevabi> =>
    geometriYuzeyCevabi.parse(tamam(await istek(ad, 'GET', `/geometri/yuzey/${String(rev)}`)));
  const kaydet = (rev: number, govde: unknown, ad: string | null = 'boyaci'): Promise<LightMyRequestResponse> =>
    istek(ad, 'POST', `/geometri/yuzey/${String(rev)}/kaydet`, govde);
  const tur = (): Promise<number> => geometriTuru(o().vt, surec, sessiz);
  const yaklasik = (a: number, b: number): void => assert.ok(Math.abs(a - b) < 0.5, `${String(a)} ~ ${String(b)}`);

  before(async () => {
    ortam = await testVeritabaniKur('geometri_yuzey');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yonId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const secilen = (await modulOrnekVerileriniKesfet()).filter((t) => t.modul === 'malzemeler' || t.modul === 'kisiler');
    assert.equal((await ornekVeriYukle(ortam.vt, secilen, { ortam: 'test', bildir: () => undefined })).durum, 'yuklendi');
    await giris('yonetici');
    await islemliKisi('okur', ['sayfa.geometri', 'geometri.oku']);
    await islemliKisi('boyaci', ['sayfa.geometri', 'geometri.oku', 'geometri.yuzey-yaz']);
    await islemliKisi('yazarokumaz', ['geometri.yuzey-yaz']);
    await islemliKisi('yetkisiz', ['sayfa.geometri']);
    await islemliKisi('taslakci', ['sayfa.geometri', 'geometri.oku', 'belge-merkezi.yaz']);
    await islemliKisi('yayinci', ['sayfa.geometri', 'geometri.oku', 'belge-merkezi.yayinla']);
    surec = geometriSureciKur();
    oncekiCozucu = yuzeyAdimlariCozucusu(null);
  });

  after(async () => {
    yuzeyAdimlariCozucusu(oncekiCozucu);
    surec?.kapat();
    await ortam?.kaldir();
  });

  test('GEO-YZ-A1 kutunun 6 düzlemi ve alanı; analizden önce "analiz-yok"; maske kaydı sürümlü, kişi sunucudan; okur yazamaz, işlemsiz 403, oturumsuz 401', async () => {
    const mil = await o().vt.tx(async (db) => (await ornekMalzemeNo(db, 'mil'))!);
    const { revizyonId: rev } = await modelEkle(mil, Buffer.from(kutuStep(40, 20, 10)), 'yuzey-a1.step');
    const once = await yuzey(rev);
    assert.deepEqual([once.neden, once.yuzler.length, once.surum], ['analiz-yok', 0, null]);
    assert.equal((await kaydet(rev, { surum: null, isaretler: [] })).statusCode, 422, 'analiz yokken yazılmaz');
    await tur();
    const c = await yuzey(rev);
    assert.deepEqual([c.neden, c.yuzler.length, c.rota.durum, c.rota.adimlar, c.isaretler, c.surum, c.tasima], [null, 6, 'rota-bagli-degil', [], [], null, null]);
    assert.ok(c.yuzler.every((y) => y.tur === 'duzlem'));
    yaklasik(c.toplamMm2, 2800);
    yaklasik(c.isaretsizMm2, 2800);

    const kucukler = c.yuzler.filter((y) => Math.abs(y.alanMm2 - 200) < 0.5).map((y) => y.sira);
    assert.equal(kucukler.length, 2);
    const govde = { surum: null, isaretler: kucukler.map((yuzSira) => ({ yuzSira, islem: maske, oneri: false })) };
    assert.equal((await kaydet(rev, govde, 'okur')).statusCode, 403, 'okuyan yazamaz');
    assert.equal((await kaydet(rev, govde, 'yetkisiz')).statusCode, 403);
    assert.equal((await kaydet(rev, govde, null)).statusCode, 401);
    assert.equal((await istek('yetkisiz', 'GET', `/geometri/yuzey/${String(rev)}`)).statusCode, 403);
    assert.equal((await istek(null, 'GET', `/geometri/yuzey/${String(rev)}`)).statusCode, 401);
    assert.equal((await istek('yazarokumaz', 'GET', `/geometri/yuzey/${String(rev)}`)).statusCode, 403, 'yazma işlemi okumayı açmaz');

    const k = geometriYuzeyCevabi.parse(tamam(await kaydet(rev, govde)));
    assert.equal(k.surum, 1);
    assert.equal(k.guncelleyen?.ad, 'Deneme boyaci');
    assert.ok(k.guncelleme !== null);
    assert.deepEqual(k.alanlar.map((x) => [x.islem.tur, x.yuzSayisi, x.oneriVar]), [['maske', 2, false]]);
    yaklasik(k.alanlar[0]!.alanMm2, 400);
    yaklasik(k.isaretsizMm2, 2400);
    assert.ok(k.isaretler.every((x) => x.rotadaVar && !x.oneri));
    assert.equal((await kaydet(rev, govde)).statusCode, 409, 'ilk kayıt iki kez açılmaz');
    assert.equal((await kaydet(rev, { ...govde, surum: 5 })).statusCode, 409, 'eski sürüm');
    const bos = geometriYuzeyCevabi.parse(tamam(await kaydet(rev, { surum: 1, isaretler: [] })));
    assert.deepEqual([bos.surum, bos.isaretler, bos.alanlar], [2, [], []]);
    assert.equal((await istek('okur', 'GET', '/geometri/yuzey/999999')).statusCode, 404, 'bağsız revizyon');
  });

  test('GEO-YZ-A2 reddedilen girdi: modelde olmayan yüz, aynı yüz iki kez, bağ kurulmamışken rota işlemi, tanımsız işlem türü', async () => {
    const mil = await o().vt.tx(async (db) => (await ornekMalzemeNo(db, 'mil'))!);
    const { revizyonId: rev } = await modelEkle(mil, Buffer.from(kutuStep(30, 20, 10)), 'yuzey-a2.step');
    await tur();
    const red = async (govde: unknown, kod: number): Promise<void> => {
      const r = await kaydet(rev, govde);
      assert.equal(r.statusCode, kod, r.body);
    };
    await red({ surum: null, isaretler: [{ yuzSira: 99, islem: maske, oneri: false }] }, 400);
    await red({ surum: null, isaretler: [{ yuzSira: 1, islem: maske, oneri: false }, { yuzSira: 1, islem: maske, oneri: false }] }, 400);
    await red({ surum: null, isaretler: [{ yuzSira: 1, islem: boya, oneri: false }] }, 400);
    await red({ surum: null, isaretler: [{ yuzSira: 1, islem: { tur: 'boya' }, oneri: false }] }, 400);
    await red({ surum: null, isaretler: [{ yuzSira: 1, islem: maske, oneri: false }], fazla: 1 }, 400);
    assert.equal((await yuzey(rev)).surum, null, 'reddedilen komut kayıt açmaz');
  });

  test('GEO-YZ-A3 işlem listesi rotadan: adım atanır, rotadan kalkınca işaret uyarıyla kalır, o adıma yeni yüz atanamaz; rota yoksa "rota-yok"', async () => {
    let adimlar: GeometriYuzeyAdimi[] | null = [ADIM];
    yuzeyAdimlariCozucusu(() => Promise.resolve(adimlar));
    try {
      const mil = await o().vt.tx(async (db) => (await ornekMalzemeNo(db, 'mil'))!);
      const { revizyonId: rev } = await modelEkle(mil, Buffer.from(kutuStep(50, 20, 10)), 'yuzey-a3.step');
      await tur();
      const c = await yuzey(rev);
      assert.deepEqual([c.rota.durum, c.rota.adimlar], ['bagli', [ADIM]]);
      const k = geometriYuzeyCevabi.parse(tamam(await kaydet(rev, { surum: null, isaretler: [{ yuzSira: 1, islem: boya, oneri: false }, { yuzSira: 2, islem: maske, oneri: false }] })));
      assert.deepEqual(k.isaretler.map((x) => [x.yuzSira, x.islem.tur, x.rotadaVar]), [[1, 'rota', true], [2, 'maske', true]]);
      adimlar = [];
      const kalkti = await yuzey(rev);
      assert.deepEqual(kalkti.isaretler.map((x) => [x.yuzSira, x.rotadaVar]), [[1, false], [2, true]]);
      tamam(await kaydet(rev, { surum: 1, isaretler: [{ yuzSira: 1, islem: boya, oneri: false }] }));
      const r = await kaydet(rev, { surum: 2, isaretler: [{ yuzSira: 1, islem: boya, oneri: false }, { yuzSira: 3, islem: boya, oneri: false }] });
      assert.equal(r.statusCode, 400, r.body);
      adimlar = null;
      assert.equal((await yuzey(rev)).rota.durum, 'rota-yok');
    } finally {
      yuzeyAdimlariCozucusu(null);
    }
  });

  test('GEO-YZ-A4 yeni revizyonda işaretler eşleşen yüzlere öneri olarak gelir, kaydedilmez; onaylanınca öneri kalkar', async () => {
    const flans = await o().vt.tx(async (db) => (await ornekMalzemeNo(db, 'flans'))!);
    const { revizyonId: rev1, belgeId } = await modelEkle(flans, Buffer.from(kutuStep(40, 20, 10)), 'yuzey-a4.step');
    await tur();
    const ilk = await yuzey(rev1);
    tamam(await kaydet(rev1, { surum: null, isaretler: ilk.yuzler.map((y) => ({ yuzSira: y.sira, islem: maske, oneri: false })) }));
    const rev2 = await revizyonYayinla(belgeId, Buffer.from(kutuStep(40, 20, 12)), 'yuzey-a4-b.step');
    await tur();
    const c = await yuzey(rev2);
    assert.equal(c.surum, null);
    assert.ok(c.tasima !== null);
    assert.equal(c.tasima.kaynakRevizyonId, rev1);
        // Yükseklik 10'dan 12'ye çıkınca yalnız alt yüz aynı kalır: üst yüz yer değiştirdi, dört yan yüzün alanı değişti.
    assert.deepEqual([c.tasima.eslesen, c.tasima.eslesmeyen], [1, 5]);
    assert.ok(c.isaretler.every((x) => x.oneri));
    assert.ok(c.alanlar.every((x) => x.oneriVar));
    const say = await o().vt.sorgu<{ n: number }>('SELECT count(*)::int AS n FROM geometri_yuzey_islem WHERE revizyon_id = $1', [rev2]);
    assert.equal(say[0]!.n, 0, 'öneri okumada yazılmaz');
    const onay = geometriYuzeyCevabi.parse(tamam(await kaydet(rev2, { surum: null, isaretler: c.isaretler.map((x) => ({ yuzSira: x.yuzSira, islem: x.islem, oneri: false })) })));
    assert.deepEqual([onay.tasima, onay.surum, onay.isaretler.length, onay.isaretler.some((x) => x.oneri)], [null, 1, c.tasima.eslesen, false]);
  });
  test('GEO-YZ-A5 roller (3030 a): CAM ve Kalite yeniden hesaplatır, Planlama ve Müdür hesaplatamaz; boya kaydı yalnız CAM\'da; Müdür görür', async () => {
    const camId = await rolluKisi('r-cam', 'cam');
    await rolluKisi('r-kalite', 'kalite');
    await rolluKisi('r-mudur', 'mudur');
    await rolluKisi('r-planlama', 'planlama_proje');
    const mil = await o().vt.tx(async (db) => (await ornekMalzemeNo(db, 'mil'))!);
    const { revizyonId: rev } = await modelEkle(mil, Buffer.from(kutuStep(45, 20, 10)), 'yuzey-a5.step');
    await tur();

    for (const ad of ['r-cam', 'r-kalite', 'r-mudur', 'r-planlama']) {
      assert.equal((await istek(ad, 'GET', '/geometri/modeller')).statusCode, 200, `${ad} listeyi görür`);
      assert.equal((await istek(ad, 'GET', `/geometri/analizler/${String(rev)}`)).statusCode, 200, `${ad} analizi görür`);
      assert.equal((await istek(ad, 'GET', `/geometri/yuzey/${String(rev)}`)).statusCode, 200, `${ad} yüzeyleri görür`);
    }

    const hesapYolu = `/geometri/analizler/${String(rev)}/yeniden-hesapla`;
    const isSurumu = async (): Promise<number> => geometriAnalizCevabi.parse(tamam(await istek('r-cam', 'GET', `/geometri/analizler/${String(rev)}`))).is!.surum;
    for (const ad of ['r-mudur', 'r-planlama']) {
      assert.equal((await istek(ad, 'POST', hesapYolu, { surum: await isSurumu() })).statusCode, 403, `${ad} hesaplatamaz`);
    }
    for (const ad of ['r-cam', 'r-kalite']) {
      const r = geometriAnalizCevabi.parse(tamam(await istek(ad, 'POST', hesapYolu, { surum: await isSurumu() })));
      assert.equal(r.durum, 'bekliyor', `${ad} hesaplatır`);
      await tur();
    }

    const c = await yuzey(rev, 'r-cam');
    const ilk = { surum: null, isaretler: c.yuzler.slice(0, 2).map((y) => ({ yuzSira: y.sira, islem: maske, oneri: false })) };
    for (const ad of ['r-kalite', 'r-mudur', 'r-planlama']) assert.equal((await kaydet(rev, ilk, ad)).statusCode, 403, `${ad} boya kaydı yazamaz`);
    assert.equal((await yuzey(rev)).surum, null, 'reddedilen kayıt iz bırakmaz');
    assert.equal(geometriYuzeyCevabi.parse(tamam(await kaydet(rev, ilk, 'r-cam'))).surum, 1, 'CAM boya kaydı yazar');

    // Güvenlik K2: her kayıt gövdesiyle tam olarak denetim kaydına girer; önceki hâl oradan okunup geri yazılabilir.
    const ikinci = { surum: 1, isaretler: c.yuzler.slice(2, 3).map((y) => ({ yuzSira: y.sira, islem: maske, oneri: false })) };
    tamam(await kaydet(rev, ikinci, 'r-cam'));
    const izler = await o().vt.sorgu<{ kisi_id: number; govde: unknown; yetki: string | null }>(
      "SELECT kisi_id, govde, yetki FROM denetim_kaydi WHERE yol = '/geometri/yuzey/:revizyonId/kaydet' AND parametre->>'revizyonId' = $1 ORDER BY id",
      [String(rev)],
    );
    assert.deepEqual(izler.map((x) => [x.kisi_id, x.yetki]), [[camId, 'geometri.yuzey-yaz'], [camId, 'geometri.yuzey-yaz']], 'reddedilenler yazmadı, iki kayıt CAM adına');
    assert.deepEqual(izler.map((x) => x.govde), [ilk, ikinci], 'gövde kısaltılmadan yazılır');
    const onceki = izler[0]!.govde as typeof ilk;
    const geri = geometriYuzeyCevabi.parse(tamam(await kaydet(rev, { surum: 2, isaretler: onceki.isaretler }, 'r-cam')));
    assert.deepEqual(geri.isaretler.map((x) => x.yuzSira).sort(), ilk.isaretler.map((x) => x.yuzSira).sort(), 'önceki hâl denetim kaydından geri yazıldı');
  });
  test('GEO-YZ-A6 taslak model (3028 b): listede yalnız yazana ve yayıncıya "yayinda: false" satırıdır; ölçülmez, hiçbir geometri ucu vermez; yayınlanınca herkese ve ölçüme açılır', async () => {
    const mil = await o().vt.tx(async (db) => (await ornekMalzemeNo(db, 'mil'))!);
    const ozet = await yukle(Buffer.from(kutuStep(35, 25, 15)));
    const ad = 'Model taslak-a6';
    const c = tamam(await istek('yonetici', 'POST', `/cizimler/malzemeler/${String(mil)}/belge-ekle`, { ad, tur: '3b-model', ozet, dosyaAdi: 'taslak-a6.step' })) as
      { belgeler: { id: number; ad: string; surum: number; revizyonlar: { id: number; durum: string }[] }[] };
    const b = c.belgeler.find((x) => x.ad === ad)!;
    const rev = b.revizyonlar[0]!.id;
    assert.equal(b.revizyonlar[0]!.durum, 'taslak');
    const satir = async (kim: string, sorgu = ''): Promise<{ yayinda?: boolean | undefined; durum: string } | undefined> =>
      geometriModelListeCevabi.parse(tamam(await istek(kim, 'GET', `/geometri/modeller${sorgu}`))).satirlar.find((x) => x.revizyonId === rev);

    for (const kim of ['taslakci', 'yayinci', 'yonetici']) {
      const t = await satir(kim);
      assert.deepEqual([t?.yayinda, t?.durum], [false, 'yok'], `${kim} taslağı görür`);
      assert.equal((await satir(kim, '?ara=taslak-a6'))?.yayinda, false, `${kim} aramada taslağı bulur`);
      assert.equal(await satir(kim, '?durum=yok'), undefined, 'durum süzgecinde taslak yok');
    }
    for (const kim of ['okur', 'boyaci']) assert.equal(await satir(kim), undefined, `${kim} taslağı görmez`);

    await tur();
    for (const yol of [
      `/geometri/modeller/${String(rev)}/dosya`, `/geometri/analizler/${String(rev)}`, `/geometri/ozellikler/${String(rev)}`,
      `/geometri/montaj/${String(rev)}`, `/geometri/saglik/${String(rev)}`, `/geometri/yuzey/${String(rev)}`, `/geometri/ham-onerisi/${String(rev)}`,
    ]) assert.equal((await istek('yonetici', 'GET', yol)).statusCode, 404, `taslakta ${yol} boş`);
    assert.equal((await istek('yonetici', 'POST', `/geometri/analizler/${String(rev)}/yeniden-hesapla`, { surum: null })).statusCode, 404);
    assert.equal((await kaydet(rev, { surum: null, isaretler: [] }, 'yonetici')).statusCode, 404);
    const iz = await o().vt.tek<{ sayi: number }>('SELECT count(*)::int AS sayi FROM geometri_is WHERE revizyon_id = $1', [rev]);
    assert.equal(iz?.sayi, 0, 'taslak kuyruğa girmez');

    const belge = tamam(await istek('yonetici', 'GET', `/cizimler/${String(b.id)}`)) as { surum: number };
    tamam(await istek('yayinci', 'POST', `/cizimler/${String(b.id)}/revizyonlar/${String(rev)}/yayinla`, { surum: belge.surum }));
    assert.equal((await satir('okur'))?.yayinda, true, 'yayınlanınca okur da görür');
    await tur();
    const a = geometriAnalizCevabi.parse(tamam(await istek('okur', 'GET', `/geometri/analizler/${String(rev)}`)));
    assert.equal(a.durum, 'bitti', 'yayından sonra ölçülür');
  });
});
