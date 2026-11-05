import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { geometriAnalizCevabi, geometriModelListeCevabi, geometriMontajCevabi } from '#paylasilan/sozlesme/geometri.ts';
import type { GeometriMontajCevabi } from '#paylasilan/sozlesme/geometri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { MOTOR } from './kurallar.ts';
import { geometriTuru } from './servis.ts';
import { geometriSureciKur } from './surec.ts';
import type { GeometriSureci } from './surec.ts';
import { kutuStep, montajStep } from './test-ortak.ts';

// Montaj ağacı (kart 2109, M1): sentetik montaj ayrı hesap sürecinde okunur, ağaç ve bileşen listesi uçtan gelir.
const PAROLA = 'dogru-parola-1';
const sessiz = { uyar: () => undefined, hata: () => undefined };

describe('geometri: montaj ağacı (gerçek PostgreSQL, gerçek giriş, gerçek hesap süreci)', () => {
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
  const montaj = async (revizyonId: number, ad = 'okur'): Promise<GeometriMontajCevabi> =>
    geometriMontajCevabi.parse(tamam(await istek(ad, 'GET', `/geometri/montaj/${String(revizyonId)}`)));
  const tur = (): Promise<number> => geometriTuru(o().vt, surec, sessiz);

  before(async () => {
    ortam = await testVeritabaniKur('geometri_montaj');
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

  test('GEO-MO-A1 sentetik montaj: ağaç, adetli bileşen listesi ve dünya kutuları; yalnız öneri; okur görür, işlemsiz 403, oturumsuz 401', async () => {
    const mil = await o().vt.tx(async (db) => (await ornekMalzemeNo(db, 'mil'))!);
    const rev = await modelEkle(mil, Buffer.from(montajStep()), 'govde.step');
    const yol = `/geometri/montaj/${String(rev)}`;
    assert.deepEqual(await montaj(rev), { revizyonId: rev, oneri: true, motor: null, montaj: null, dugumler: null, bilesenler: null, neden: 'analiz-yok' });
    await tur();
    const c = await montaj(rev);
    assert.equal(c.neden, null);
    assert.equal(c.motor, MOTOR);
    assert.equal(c.montaj, true);
    assert.equal(c.oneri, true);
    const d = c.dugumler ?? [];
    assert.deepEqual(d.map((x) => [x.sira, x.ust, x.tur, x.ad]), [
      [1, null, 'montaj', 'govde'], [2, 1, 'parca', 'taban'], [3, 1, 'parca', 'pim'], [4, 1, 'parca', 'pim'],
      [5, 1, 'montaj', 'tutucu-montaji'], [6, 5, 'parca', 'tutucu'], [7, 5, 'parca', 'pim'],
      [8, 1, 'montaj', 'tutucu-montaji'], [9, 8, 'parca', 'tutucu'], [10, 8, 'parca', 'pim'],
    ]);
    assert.deepEqual([d[0]!.kutuEn, d[0]!.kutuUst], [[0, 0, 0], [100, 60, 60]], 'kök bütün montajı kapsar');
    assert.deepEqual([d[3]!.kutuEn, d[3]!.kutuUst], [[70, 40, 10], [80, 50, 40]], 'döndürülmüş pim dünya koordinatında');
    assert.deepEqual([d[7]!.kutuEn, d[7]!.kutuUst], [[40, 40, 10], [60, 60, 60]], 'ikinci alt montaj kendi yerinde');
    assert.deepEqual(c.bilesenler?.map((b) => [b.sira, b.ad, b.adet, b.obb, b.hacimMm3, b.kapali, b.dugumler]), [
      [1, 'taban', 1, { a: 100, b: 60, c: 10 }, 60000, true, [2]],
      [2, 'pim', 4, { a: 30, b: 10, c: 10 }, 3000, true, [3, 4, 7, 10]],
      [3, 'tutucu', 2, { a: 20, b: 20, c: 20 }, 8000, true, [6, 9]],
    ]);
    assert.equal((await istek('yetkisiz', 'GET', yol)).statusCode, 403);
    assert.equal((await istek(null, 'GET', yol)).statusCode, 401);
    assert.equal((await istek('okur', 'GET', '/geometri/montaj/999999')).statusCode, 404, 'bağsız revizyon');

    const an = geometriAnalizCevabi.parse(tamam(await istek('hesaplar', 'GET', `/geometri/analizler/${String(rev)}`)));
    tamam(await istek('hesaplar', 'POST', `/geometri/analizler/${String(rev)}/yeniden-hesapla`, { surum: an.is?.surum ?? null }));
    await tur();
    const say = await o().vt.sorgu<{ n: number }>('SELECT count(*)::int AS n FROM geometri_montaj WHERE revizyon_id = $1', [rev]);
    assert.equal(say[0]!.n, 10, 'yeniden hesapta satırlar yinelenmez');
  });

  test('GEO-MO-A2 tek parçalı model tek düğümdür (montaj false); montajı okunmamış eski analiz "montaj-yok" verir', async () => {
    const flans = await o().vt.tx(async (db) => (await ornekMalzemeNo(db, 'flans'))!);
    const rev = await modelEkle(flans, Buffer.from(kutuStep(40, 20, 10)), 'kutu.step');
    await tur();
    const c = await montaj(rev);
    assert.equal(c.montaj, false);
    assert.deepEqual(c.dugumler?.map((x) => [x.sira, x.ust, x.tur, x.ad, x.obb]), [[1, null, 'parca', 'kutu', { a: 40, b: 20, c: 10 }]]);
    assert.deepEqual(c.bilesenler?.map((b) => [b.ad, b.adet]), [['kutu', 1]]);
    await o().vt.sorgu('DELETE FROM geometri_montaj WHERE revizyon_id = $1', [rev]);
    assert.equal((await montaj(rev)).neden, 'montaj-yok');
  });
});
