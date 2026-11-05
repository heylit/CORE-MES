import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { geometriModelListeCevabi, geometriSaglikCevabi } from '#paylasilan/sozlesme/geometri.ts';
import type { GeometriSaglikCevabi } from '#paylasilan/sozlesme/geometri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { YUZ_MOTORU } from './kurallar.ts';
import { geometriTuru } from './servis.ts';
import { geometriSureciKur } from './surec.ts';
import type { GeometriSureci } from './surec.ts';
import { acikKutuStep, incKutuStep, kaymisYuzluKutuStep, kutuStep } from './test-ortak.ts';

// Dosya sağlık raporu (kart 2143): bozukluğu bilinen sentetik kutular ayrı hesap sürecinde okunur, rapor uçtan gelir.
const PAROLA = 'dogru-parola-1';
const sessiz = { uyar: () => undefined, hata: () => undefined };

describe('geometri: dosya sağlık raporu (gerçek PostgreSQL, gerçek giriş, gerçek hesap süreci)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonId = 0;
  let surec: GeometriSureci;
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
  // Model, malzeme kartından Çizim Merkezi'nin kendi ucuyla eklenir ve yayına alınır; revizyon kimliği listeden okunur.
  async function modelEkle(malzemeNo: number, icerik: Buffer, dosyaAdi: string): Promise<number> {
    const ozet = createHash('sha256').update(icerik).digest('hex');
    tamam(await istek('yonetici', 'POST', `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') }));
    const ad = `Model ${dosyaAdi}`;
    const c = tamam(await istek('yonetici', 'POST', `/cizimler/malzemeler/${String(malzemeNo)}/belge-ekle`, { ad, tur: '3b-model', ozet, dosyaAdi })) as
      { belgeler: { id: number; ad: string; surum: number; revizyonlar: { id: number }[] }[] };
    const b = c.belgeler.find((x) => x.ad === ad);
    assert.ok(b);
    tamam(await istek('yonetici', 'POST', `/cizimler/${String(b.id)}/revizyonlar/${String(b.revizyonlar[0]?.id)}/yayinla`, { surum: b.surum }));
    const s = geometriModelListeCevabi.parse(tamam(await istek('yonetici', 'GET', '/geometri/modeller'))).satirlar
      .find((x) => x.malzemeNo === malzemeNo && x.belgeAdi === ad);
    assert.ok(s);
    return s.revizyonId;
  }
  const saglik = async (revizyonId: number, ad = 'okur'): Promise<GeometriSaglikCevabi> =>
    geometriSaglikCevabi.parse(tamam(await istek(ad, 'GET', `/geometri/saglik/${String(revizyonId)}`)));
  const kodlar = (c: GeometriSaglikCevabi): string[] => c.bulgular.map((b) => b.kod);
  const tur = (): Promise<number> => geometriTuru(o().vt, surec, sessiz);

  before(async () => {
    ortam = await testVeritabaniKur('geometri_saglik');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yonId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const secilen = (await modulOrnekVerileriniKesfet()).filter((t) => t.modul === 'malzemeler' || t.modul === 'kisiler');
    assert.equal((await ornekVeriYukle(ortam.vt, secilen, { ortam: 'test', bildir: () => undefined })).durum, 'yuklendi');
    await giris('yonetici');
    await islemliKisi('okur', ['sayfa.geometri', 'geometri.oku']);
    await islemliKisi('hesaplar', ['geometri.oku', 'geometri.hesapla']);
    await islemliKisi('yetkisiz', ['sayfa.geometri']);
    surec = geometriSureciKur();
  });

  after(async () => {
    surec?.kapat();
    await ortam?.kaldir();
  });

  test('GEO-SA-A1 temiz kutu "iyi": açık kenar yok, şekil geçerli, birim millimetre; analizden önce "analiz-yok"; okur görür, işlemsiz 403, oturumsuz 401, bağsız 404', async () => {
    const mil = await o().vt.tx(async (db) => (await ornekMalzemeNo(db, 'mil'))!);
    const rev = await modelEkle(mil, Buffer.from(kutuStep(40, 20, 10)), 'saglam.step');
    const yol = `/geometri/saglik/${String(rev)}`;
    const once = await saglik(rev);
    assert.equal(once.neden, 'analiz-yok');
    assert.equal(once.durum, null);
    assert.deepEqual(once.bulgular, []);
    await tur();
    const c = await saglik(rev);
    assert.deepEqual(
      [c.neden, c.durum, c.motor, c.oneri, c.acikKenarSayisi, c.acikSinirSayisi, c.gecersizYuzSayisi, c.sekilGecerli, c.kucukKenarSayisi, c.dosyaBirimi, c.kapali],
      [null, 'iyi', YUZ_MOTORU, true, 0, 0, 0, true, 0, 'millimetre', true],
    );
    assert.ok(c.enBuyukToleransMm !== null && c.enBuyukToleransMm < 1e-3, String(c.enBuyukToleransMm));
    assert.deepEqual(c.bulgular, []);
    assert.equal((await istek('yetkisiz', 'GET', yol)).statusCode, 403);
    assert.equal((await istek(null, 'GET', yol)).statusCode, 401);
    assert.equal((await istek('okur', 'GET', '/geometri/saglik/999999')).statusCode, 404, 'bağsız revizyon');
    assert.equal((await istek('okur', 'GET', '/geometri/saglik/0')).statusCode, 400, 'geçersiz kimlik');
  });

  test('GEO-SA-A2 alt yüzü olmayan kutu "guvenme": 4 açık kenar, 1 açık sınır; hacim boş', async () => {
    const mil = await o().vt.tx(async (db) => (await ornekMalzemeNo(db, 'mil'))!);
    const rev = await modelEkle(mil, Buffer.from(acikKutuStep(40, 20, 10)), 'acik.step');
    await tur();
    const c = await saglik(rev);
    assert.deepEqual([c.durum, c.acikKenarSayisi, c.acikSinirSayisi, c.kapali], ['guvenme', 4, 1, false]);
    assert.deepEqual(kodlar(c), ['acik-kenar']);
  });

  test('GEO-SA-A3 inç dosya "dikkat": birim INCH, ölçü mm\'ye çevrilmiş (40 inç = 1016 mm)', async () => {
    const mil = await o().vt.tx(async (db) => (await ornekMalzemeNo(db, 'mil'))!);
    const rev = await modelEkle(mil, Buffer.from(incKutuStep(40, 20, 10)), 'inc.step');
    await tur();
    const c = await saglik(rev);
    assert.deepEqual([c.durum, c.dosyaBirimi, c.acikKenarSayisi], ['dikkat', 'INCH', 0]);
    assert.deepEqual(kodlar(c), ['birim-mm-degil']);
    const a = await o().vt.tek<{ x: number }>('SELECT kutu_x_mm::float8 AS x FROM geometri_analiz WHERE revizyon_id = $1', [rev]);
    assert.equal(a?.x, 1016);
  });

  test('GEO-SA-A4 üst yüzü 5 mm kaymış kutu "guvenme": okuyucu onarımı toleransı 5 mm\'ye büyütür', async () => {
    const mil = await o().vt.tx(async (db) => (await ornekMalzemeNo(db, 'mil'))!);
    const rev = await modelEkle(mil, Buffer.from(kaymisYuzluKutuStep(40, 20, 10, 5)), 'kaymis.step');
    await tur();
    const c = await saglik(rev);
    assert.equal(c.durum, 'guvenme');
    assert.ok(c.enBuyukToleransMm !== null && Math.abs(c.enBuyukToleransMm - 5) < 0.01, String(c.enBuyukToleransMm));
    assert.ok(kodlar(c).includes('buyuk-tolerans'), kodlar(c).join(','));
  });

  test('GEO-SA-A5 sağlık satırı olmayan eski analiz "saglik-yok" verir; yeniden hesapta satır yinelenmez', async () => {
    const mil = await o().vt.tx(async (db) => (await ornekMalzemeNo(db, 'mil'))!);
    const rev = await modelEkle(mil, Buffer.from(kutuStep(30, 20, 10)), 'eski.step');
    await tur();
    await o().vt.sorgu('DELETE FROM geometri_saglik WHERE revizyon_id = $1', [rev]);
    const c = await saglik(rev);
    assert.deepEqual([c.neden, c.durum, c.kapali, c.bulgular], ['saglik-yok', null, true, []]);
    const an = tamam(await istek('hesaplar', 'GET', `/geometri/analizler/${String(rev)}`)) as { is: { surum: number } | null };
    tamam(await istek('hesaplar', 'POST', `/geometri/analizler/${String(rev)}/yeniden-hesapla`, { surum: an.is?.surum ?? null }));
    await tur();
    assert.equal((await saglik(rev)).durum, 'iyi');
    const say = await o().vt.sorgu<{ n: number }>('SELECT count(*)::int AS n FROM geometri_saglik WHERE revizyon_id = $1', [rev]);
    assert.equal(say[0]!.n, 1);
  });
});
