import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { geometriSureCevabi, geometriSureKatsayilariCevabi } from '#paylasilan/sozlesme/geometri.ts';
import type { GeometriSureCevabi, GeometriSureKatsayilariCevabi } from '#paylasilan/sozlesme/geometri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kalibrasyonOnbellegiTemizle } from './servis.ts';

// Başlangıç katsayıları ve tasarım seçimi uçları (3363): elle yazma, sınır reddi, yerleşiğe dönme, revizyonun yüzey ve toleransı,
// yetki (yazma geometri.kalibrasyon, okuma geometri.oku). Gerçek PostgreSQL, gerçek giriş; tek küp model (prizmatik).
const yakin = (x: number | null | undefined, beklenen: number, m = ''): void =>
  assert.ok(x != null && Math.abs(x - beklenen) <= Math.abs(beklenen) * 1e-3, `${m} ${String(x)} != ${String(beklenen)}`);

describe('geometri başlangıç katsayıları ucu (3363; gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let yoneticiId = 0;
  let revizyonId = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const istek = (yontem: 'GET' | 'POST', yol: string, govde?: unknown, c = cerez): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: c, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, payload: govde as object | undefined });
  const tamam = (r: LightMyRequestResponse): unknown => { assert.equal(r.statusCode, 200, r.body); return r.json(); };
  const katsayilar = async (c = cerez): Promise<GeometriSureKatsayilariCevabi> => geometriSureKatsayilariCevabi.parse(tamam(await istek('GET', '/geometri/sure-katsayilari', undefined, c)));
  const katsayi = (k: GeometriSureKatsayilariCevabi, anahtar: string) => k.katsayilar.find((x) => x.anahtar === anahtar);
  const sure = async (): Promise<GeometriSureCevabi> => {
    kalibrasyonOnbellegiTemizle();
    return geometriSureCevabi.parse(tamam(await istek('GET', `/geometri/sure-tahmini/${String(revizyonId)}`)));
  };

  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const rol = await o().vt.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await o().vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  }

  before(async () => {
    ortam = await testVeritabaniKur('geometri_onsel');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const secilen = (await modulOrnekVerileriniKesfet()).filter((t) => t.modul === 'malzemeler' || t.modul === 'kisiler');
    assert.equal((await ornekVeriYukle(ortam.vt, secilen, { ortam: 'test', bildir: () => undefined })).durum, 'yuklendi');
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    cerez = String(r.headers['set-cookie']).split(';')[0] ?? '';
    const icerik = Buffer.from('ISO-10303-21;\n/* kup.step */\nEND-ISO-10303-21;\n');
    const ozet = createHash('sha256').update(icerik).digest('hex');
    tamam(await istek('POST', `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') }));
    const no = (await o().sahip.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti ORDER BY no LIMIT 1'))?.no ?? 0;
    const c = tamam(await istek('POST', `/cizimler/malzemeler/${String(no)}/belge-ekle`, { ad: 'Model kup', tur: '3b-model', ozet, dosyaAdi: 'kup.step' })) as
      { belgeler: { id: number; ad: string; surum: number; revizyonlar: { id: number }[] }[] };
    const b = c.belgeler.find((x) => x.ad === 'Model kup');
    assert.ok(b);
    revizyonId = b.revizyonlar[0]?.id ?? 0;
    tamam(await istek('POST', `/cizimler/${String(b.id)}/revizyonlar/${String(revizyonId)}/yayinla`, { surum: b.surum }));
    await o().sahip.sorgu(
      `INSERT INTO geometri_analiz (revizyon_id, belge_id, ozet, motor, kutu_x_mm, kutu_y_mm, kutu_z_mm, obb_a_mm, obb_b_mm, obb_c_mm, cap_mm, obb_yon,
         hacim_mm3, alan_mm2, govde_sayisi, kapali, ucgen_sayisi, hesap_suresi_ms)
       VALUES ($1, $2, $3, 'deneme', 40, 20, 10, 40, 20, 10, 22.3607, '{1,0,0,0,1,0,0,0,1}', 8000, 2800, 1, true, 12, 1)`,
      [revizyonId, b.id, ozet],
    );
  });

  after(async () => { await ortam?.kaldir(); });

  test('GEO-OU1 okuma: yerleşik tablo, elle yok; süre başlangıç tahmini taşır (prizmatik, varsayılan Ra 3,2 ve genel)', async () => {
    const k = await katsayilar();
    assert.ok(k.katsayilar.length > 30, 'malzeme, tasarım, geometri ve kesme satırları');
    assert.ok(k.katsayilar.every((x) => x.elle === null && x.deger === x.yerlesik));
    assert.deepEqual(katsayi(k, 'kesme.pay') && [katsayi(k, 'kesme.pay')!.deger, katsayi(k, 'kesme.pay')!.iso], [0.7, null]);
    assert.equal(katsayi(k, 'malzeme.kaba.metal/karbon')?.iso, 'P', 'malzeme satırında sınıfın ISO grubu');
    const s = await sure();
    assert.ok(s.onsel !== null && s.ortaDk !== null);
    assert.deepEqual([s.onsel.tip, s.onsel.tasarim], ['prizmatik', { ra: '3.2', tolerans: 'genel', kayitli: false }]);
    assert.ok(s.onsel.ortaDk > s.ortaDk, 'kesme dışı pay ve tutma başlangıç tahminini kalibresizden büyütür');
    assert.deepEqual(s.onsel.dokum.map((d) => d.tur), ['kaba', 'finis', 'geometri', 'kesme', 'baglama'], 'özellik okunmadı: delik satırı yok');
  });

  test('GEO-OU2 elle yazma yerleşiğin yerine geçer, tahmini değiştirir, kişi ve notu tutar; yerleşiğe dön siler', async () => {
    const once = (await sure()).onsel!;
    const k = geometriSureKatsayilariCevabi.parse(tamam(await istek('POST', '/geometri/sure-katsayilari/yaz', { degerler: [{ anahtar: 'kesme.pay', deger: 0.5 }], not: 'ORN atölye ölçümü' })));
    const e = katsayi(k, 'kesme.pay');
    assert.deepEqual(e && [e.deger, e.yerlesik, e.elle?.deger, e.elle?.not, e.elle?.kisi], [0.5, 0.7, 0.5, 'ORN atölye ölçümü', 'Deneme Yönetici']);
    const sonra = (await sure()).onsel!;
    const kesme = (x: typeof once) => x.dokum.find((d) => d.tur === 'kesme')!;
    const baglama = (x: typeof once) => x.dokum.find((d) => d.tur === 'baglama')!;
    yakin(kesme(sonra).araToplamDk, kesme(once).araToplamDk * 0.7 / 0.5, 'kesme ara toplamı ÷0,5');
    yakin(baglama(sonra).araToplamDk - kesme(sonra).araToplamDk, baglama(once).araToplamDk - kesme(once).araToplamDk, 'tutma değişmez');
    const geri = geometriSureKatsayilariCevabi.parse(tamam(await istek('POST', '/geometri/sure-katsayilari/yerlesige-don', { anahtarlar: ['kesme.pay'] })));
    assert.deepEqual([katsayi(geri, 'kesme.pay')?.deger, katsayi(geri, 'kesme.pay')?.elle], [0.7, null]);
    yakin((await sure()).onsel?.ortaDk, once.ortaDk, 'yerleşiğe dönünce tahmin eski');
    assert.equal((await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM geometri_sure_katsayi'))?.n, 0);
  });

  test('GEO-OU3 sınır dışı ve bilinmeyen anahtar reddedilir; satırın biri reddedilirse hiçbiri yazılmaz', async () => {
    const yaz = (degerler: { anahtar: string; deger: number }[]) => istek('POST', '/geometri/sure-katsayilari/yaz', { degerler, not: null });
    assert.equal((await yaz([{ anahtar: 'kesme.pay', deger: 1.5 }])).statusCode, 400);
    assert.equal((await yaz([{ anahtar: 'tutma.0', deger: 31 }])).statusCode, 400);
    assert.equal((await yaz([{ anahtar: 'yuzey.1.6', deger: 0.01 }])).statusCode, 400);
    assert.equal((await yaz([{ anahtar: 'bilinmeyen.kat', deger: 1 }])).statusCode, 400);
    assert.equal((await yaz([{ anahtar: 'malzeme.kaba.metal/karbon', deger: 1.2 }, { anahtar: 'malzeme.finis.metal/karbon', deger: 25 }])).statusCode, 400);
    assert.equal((await istek('POST', '/geometri/sure-katsayilari/yerlesige-don', { anahtarlar: ['bilinmeyen.kat'] })).statusCode, 400);
    assert.equal((await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM geometri_sure_katsayi'))?.n, 0);
    const iki = geometriSureKatsayilariCevabi.parse(tamam(await yaz([{ anahtar: 'malzeme.kaba.metal/karbon', deger: 1.2 }, { anahtar: 'malzeme.finis.metal/karbon', deger: 1.4 }])));
    assert.deepEqual([katsayi(iki, 'malzeme.kaba.metal/karbon')?.deger, katsayi(iki, 'malzeme.finis.metal/karbon')?.deger], [1.2, 1.4]);
    tamam(await istek('POST', '/geometri/sure-katsayilari/yerlesige-don', { anahtarlar: ['malzeme.kaba.metal/karbon', 'malzeme.finis.metal/karbon'] }));
    // 3379: ölçüm grubunun bütün sınıfları tek komutla (en çok 40 değer).
    const p = (await katsayilar()).katsayilar.filter((x) => x.iso === 'P').map((x) => ({ anahtar: x.anahtar, deger: 1.5 }));
    assert.ok(p.length > 10, 'P grubunda 10\'dan çok değer');
    const grup = geometriSureKatsayilariCevabi.parse(tamam(await yaz(p)));
    assert.ok(p.every((d) => katsayi(grup, d.anahtar)?.deger === 1.5));
    tamam(await istek('POST', '/geometri/sure-katsayilari/yerlesige-don', { anahtarlar: p.map((d) => d.anahtar) }));
    const fazla = Array.from({ length: 41 }, () => ({ anahtar: 'kesme.pay', deger: 0.7 }));
    assert.equal((await yaz(fazla)).statusCode, 400);
    assert.equal((await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM geometri_sure_katsayi'))?.n, 0);
  });

  test('GEO-OU4 yüzey ve tolerans revizyona yazılır, tahmini büyütür; yeniden yazmak günceller; olmayan revizyon 404', async () => {
    const once = (await sure()).onsel!;
    const c = tamam(await istek('POST', `/geometri/sure-tahmini/${String(revizyonId)}/tasarim`, { ra: '0.8', tolerans: 'hassas' }));
    assert.deepEqual(c, { revizyonId, ra: '0.8', tolerans: 'hassas' });
    const sonra = (await sure()).onsel!;
    assert.deepEqual(sonra.tasarim, { ra: '0.8', tolerans: 'hassas', kayitli: true });
    assert.ok(sonra.ortaDk > once.ortaDk, 'ince yüzey ve hassas tolerans finişi uzatır');
    const finis = sonra.dokum.find((d) => d.tur === 'finis');
    assert.ok(finis?.tur === 'finis');
    assert.deepEqual(finis.carpanlar.map((x) => x.anahtar), ['yuzey.0.8', 'tolerans.hassas']);
    tamam(await istek('POST', `/geometri/sure-tahmini/${String(revizyonId)}/tasarim`, { ra: '3.2', tolerans: 'genel' }));
    assert.deepEqual((await sure()).onsel?.tasarim, { ra: '3.2', tolerans: 'genel', kayitli: true });
    assert.equal((await istek('POST', '/geometri/sure-tahmini/999999/tasarim', { ra: '3.2', tolerans: 'genel' })).statusCode, 404);
    assert.equal((await istek('POST', `/geometri/sure-tahmini/${String(revizyonId)}/tasarim`, { ra: '2.5', tolerans: 'genel' })).statusCode, 400);
  });

  test('GEO-OU5 yetki: geometri.oku tabloyu okur, yazamaz; geometri.kalibrasyon yazar; girişsiz 401', async () => {
    const okur = await islemliKisi('onselokur', ['sayfa.geometri', 'geometri.oku']);
    assert.ok((await katsayilar(okur)).katsayilar.length > 0);
    assert.equal((await istek('POST', '/geometri/sure-katsayilari/yaz', { degerler: [{ anahtar: 'kesme.pay', deger: 0.6 }], not: null }, okur)).statusCode, 403);
    assert.equal((await istek('POST', '/geometri/sure-katsayilari/yerlesige-don', { anahtarlar: ['kesme.pay'] }, okur)).statusCode, 403);
    assert.equal((await istek('POST', `/geometri/sure-tahmini/${String(revizyonId)}/tasarim`, { ra: '1.6', tolerans: 'genel' }, okur)).statusCode, 403);
    const muhendis = await islemliKisi('onselmuh', ['sayfa.geometri', 'geometri.oku', 'geometri.kalibrasyon']);
    const k = geometriSureKatsayilariCevabi.parse(tamam(await istek('POST', '/geometri/sure-katsayilari/yaz', { degerler: [{ anahtar: 'kesme.pay', deger: 0.6 }], not: null }, muhendis)));
    assert.equal(katsayi(k, 'kesme.pay')?.elle?.kisi, 'Deneme onselmuh');
    tamam(await istek('POST', '/geometri/sure-katsayilari/yerlesige-don', { anahtarlar: ['kesme.pay'] }, muhendis));
    assert.equal((await app.inject({ method: 'GET', url: '/api/geometri/sure-katsayilari' })).statusCode, 401);
  });
});

const PAROLA = 'Deneme-Parola-12345';
