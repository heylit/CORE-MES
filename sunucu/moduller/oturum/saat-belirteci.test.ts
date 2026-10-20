import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { saatCihazlariCevabi, saatIstegiCevabi, saatIstegiSorCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from './disari.ts';
import { HESAP_KILIDI_ESIGI, SAAT_ISTEGI_GENEL_SINIR, SAAT_ISTEGI_IP_SINIRI, anahtarOzeti, belirtecOku, saatBelirteciGecerMi, saatKoduUret } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

describe('saat kuralları (kart #1632)', () => {
  test('belirteç yalnız GET ve /api/saat/ kalıbında geçer', () => {
    assert.equal(saatBelirteciGecerMi('GET', '/api/saat/istasyonlar'), true);
    assert.equal(saatBelirteciGecerMi('GET', '/api/saat/emirler/:id'), true);
    assert.equal(saatBelirteciGecerMi('POST', '/api/saat/istasyonlar'), false);
    assert.equal(saatBelirteciGecerMi('GET', '/api/saatler'), false);
    assert.equal(saatBelirteciGecerMi('GET', '/api/uretim-emirleri'), false);
    assert.equal(saatBelirteciGecerMi('GET', undefined), false);
  });

  test('296 a: belirteçle tek yazma ucu emri durdurmaktır; başka POST ve başka yöntem geçmez', () => {
    assert.equal(saatBelirteciGecerMi('POST', '/api/saat/emirler/:id/durdur'), true);
    assert.equal(saatBelirteciGecerMi('POST', '/api/saat/emirler/:id/baska'), false);
    assert.equal(saatBelirteciGecerMi('POST', '/api/saat/emirler/:id/durdur/'), false);
    assert.equal(saatBelirteciGecerMi('POST', '/api/saat/emirler/:emirId/durdur'), false);
    assert.equal(saatBelirteciGecerMi('POST', '/api/uretim-emirleri/:id/durdur'), false);
    assert.equal(saatBelirteciGecerMi('POST', '/api/terminal/emirler/:id/durdur'), false);
    assert.equal(saatBelirteciGecerMi('PUT', '/api/saat/emirler/:id/durdur'), false);
    assert.equal(saatBelirteciGecerMi('DELETE', '/api/saat/emirler/:id/durdur'), false);
    assert.equal(saatBelirteciGecerMi('POST', undefined), false);
  });

  test('yalnız "Bearer <belirteç>" okunur', () => {
    const b = 'a'.repeat(43);
    assert.equal(belirtecOku(`Bearer ${b}`), b);
    assert.equal(belirtecOku(`bearer ${b}`), null);
    assert.equal(belirtecOku(`Bearer ${b} x`), null);
    assert.equal(belirtecOku('Bearer kisa'), null);
    assert.equal(belirtecOku(undefined), null);
  });

  test('kod 6 rakamdır, baştaki sıfırlar korunur', () => {
    assert.equal(saatKoduUret(() => 42), '000042');
    assert.equal(saatKoduUret(() => 999999), '999999');
  });
});

describe('saat eşleşmesi ve belirteci (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let ipSayaci = 0;
  const cerezler = new Map<string, string>();
  const kimlikler = new Map<string, number>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  // Her deneme ayrı cihazdan: cihaz başına bekleme, testin ardışık denemelerini reddetmesin.
  const yeniIp = (): string => { ipSayaci += 1; return `10.8.${ipSayaci >> 8}.${ipSayaci & 255}`; };

  async function cerezli(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown) {
    const basliklar: Record<string, string> = { cookie: cerezler.get(ad) ?? '' };
    if (yontem === 'POST') basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as unknown };
  }
  async function belirtecli(belirtec: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown) {
    const basliklar: Record<string, string> = { authorization: `Bearer ${belirtec}` };
    if (yontem === 'POST') basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as unknown };
  }
  // Saat tarafı: istek açar, sorar. Her saat ayrı cihazdan (cihaz başına bekleyen istek sınırı testleri durdurmasın).
  async function istekAc(ip = yeniIp()) {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/saat-istegi', remoteAddress: ip });
    return { durum: c.statusCode, govde: c.statusCode === 200 ? saatIstegiCevabi.parse(c.json()) : null };
  }
  const sorHam = (istek: string, ip = yeniIp()) =>
    app.inject({ method: 'POST', url: '/api/oturum/saat-istegi/sor', payload: { istek }, remoteAddress: ip });
  async function sor(istek: string) {
    const c = await sorHam(istek);
    assert.equal(c.statusCode, 200, c.body);
    return saatIstegiSorCevabi.parse(c.json());
  }
  const sorDenetimSayisi = async () =>
    (await o().sahip.tek<{ n: number }>("SELECT count(*)::int AS n FROM denetim_kaydi WHERE yol = '/oturum/saat-istegi/sor'"))?.n ?? 0;
  const onayla = (ad: string, kod: string) => {
    const basliklar = { cookie: cerezler.get(ad) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() };
    return app.inject({ method: 'POST', url: '/api/hesabim/saat-onayla', headers: basliklar, payload: { kod }, remoteAddress: yeniIp() });
  };

  async function giris(kullaniciAdi: string, parola = PAROLA): Promise<void> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola }, remoteAddress: yeniIp() });
    assert.equal(c.statusCode, 200, c.body);
    cerezler.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }
  async function kisiEkle(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const id = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return yeni;
    });
    kimlikler.set(kullaniciAdi, id);
    await giris(kullaniciAdi);
  }
  async function eslesmis(ad: string): Promise<string> {
    const { govde } = await istekAc();
    assert.ok(govde);
    const onay = await onayla(ad, govde.kod);
    assert.equal(onay.statusCode, 200, onay.body);
    const c = await sor(govde.istek);
    assert.equal(c.durum, 'onaylandi');
    return c.durum === 'onaylandi' ? c.belirtec : '';
  }

  before(async () => {
    ortam = await testVeritabaniKur('saat_oturum');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    kimlikler.set('yonetici', yoneticiId);
    await giris('yonetici');
    await kisiEkle('planci', 'planlama_proje');
    await kisiEkle('planci2', 'planlama_proje');
  });
  after(async () => { await ortam?.kaldir(); });

  test('saat istek açar ve bekler; onay oturum ister; onaylanınca belirteç bir kez verilir; hepsi yalnız özetle saklanır', async () => {
    const { durum, govde } = await istekAc();
    assert.equal(durum, 200);
    assert.ok(govde);
    assert.match(govde.kod, /^[0-9]{6}$/);
    assert.deepEqual(await sor(govde.istek), { durum: 'bekliyor' });
    assert.equal((await sorHam(govde.istek)).statusCode, 429, 'bekleyen istek aralıktan sık sorulamaz');

    const oturumsuz = await app.inject({
      method: 'POST', url: '/api/hesabim/saat-onayla', headers: { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, payload: { kod: govde.kod },
    });
    assert.equal(oturumsuz.statusCode, 401);
    assert.equal((await onayla('planci', govde.kod)).statusCode, 200);
    assert.equal((await onayla('planci2', govde.kod)).statusCode, 400, 'aynı istek ikinci kez onaylanmaz');

    const satirlar = await o().sahip.sorgu<{ gizli_ozeti: string; kod_ozeti: string }>('SELECT gizli_ozeti, kod_ozeti FROM oturum_saat_istegi');
    assert.deepEqual(satirlar.map((r) => [r.gizli_ozeti, r.kod_ozeti]), [[anahtarOzeti(govde.istek), anahtarOzeti(govde.kod)]]);

    const c = await sor(govde.istek);
    assert.equal(c.durum, 'onaylandi');
    if (c.durum !== 'onaylandi') return;
    assert.equal(c.kisi.ad, 'Deneme planci');
    assert.equal((await sorHam(govde.istek)).statusCode, 401, 'belirteç ikinci kez verilmez');

    const b = await o().sahip.tek<{ ozet: string; saat: number }>(
      'SELECT belirtec_ozeti AS ozet, extract(epoch FROM son - acildi)::int AS saat FROM oturum_saat_belirteci ORDER BY id DESC LIMIT 1');
    assert.equal(b?.ozet, anahtarOzeti(c.belirtec));
    assert.equal(b?.saat, 12 * 60 * 60);
  });

  test('kodu bilen ama isteğin gizli anahtarını tutmayan belirteç alamaz; kod ve anahtar denetim kaydına girmez', async () => {
    const { govde } = await istekAc();
    assert.ok(govde);
    assert.equal((await onayla('planci', govde.kod)).statusCode, 200);
    assert.equal((await sorHam('c'.repeat(43))).statusCode, 401);
    const kayitlar = await o().sahip.sorgu<{ govde: unknown }>(
      "SELECT govde FROM denetim_kaydi WHERE yol IN ('/hesabim/saat-onayla', '/oturum/saat-istegi/sor')");
    assert.equal(kayitlar.length > 0, true);
    const metin = JSON.stringify(kayitlar);
    assert.equal(metin.includes(govde.kod) || metin.includes('c'.repeat(43)), false);
  });

  test('bilinmeyen anahtarla soru cihazın hatalı denemesidir, denetim kaydı bırakmaz; erken soru da kayıt bırakmaz', async () => {
    const ip = yeniIp();
    const once = await sorDenetimSayisi();
    const ilk = await sorHam('d'.repeat(43), ip);
    assert.equal(ilk.statusCode, 401, ilk.body);
    const deneme = await o().sahip.tek<{ n: number }>(
      "SELECT count(*)::int AS n FROM giris_denemesi WHERE kullanici_adi = $1 AND sonuc = 'hatali'", [`#saat-sor-${ip}`]);
    assert.equal(deneme?.n, 1);
    const ikinci = await sorHam('e'.repeat(43), ip);
    assert.equal(ikinci.statusCode, 401);
    assert.match(String(ikinci.json().mesaj), /Çok sık deneme/);

    const { govde } = await istekAc();
    assert.ok(govde);
    assert.equal((await sorHam(govde.istek, ip)).statusCode, 401, 'beklemedeki cihaz geçerli anahtarla da soramaz');
    assert.equal((await sorHam(govde.istek)).statusCode, 200, 'başka cihaz etkilenmez');
    assert.equal((await sorHam(govde.istek)).statusCode, 429);
    assert.equal(await sorDenetimSayisi(), once + 1, 'yalnız geçerli ve zamanında soru kayıt bırakır');
    await o().sahip.sorgu("UPDATE oturum_saat_istegi SET son_soru = now() - interval '11 seconds' WHERE gizli_ozeti = $1", [anahtarOzeti(govde.istek)]);
    assert.deepEqual(await sor(govde.istek), { durum: 'bekliyor' });
  });

  test('bekleyen isteklerin hepsi genel sınırı doldurunca yeni istek açılmaz', async () => {
    await o().sahip.sorgu(
      `INSERT INTO oturum_saat_istegi (gizli_ozeti, kod_ozeti, ip, olusturma, son)
       SELECT 'genel-g-' || i, 'genel-k-' || i, '10.99.0.' || i, now(), now() + interval '5 minutes' FROM generate_series(1, $1::int) i`,
      [SAAT_ISTEGI_GENEL_SINIR]);
    try {
      assert.equal((await istekAc()).durum, 429);
    } finally {
      await o().sahip.sorgu("DELETE FROM oturum_saat_istegi WHERE gizli_ozeti LIKE 'genel-g-%'");
    }
    assert.equal((await istekAc()).durum, 200);
  });

  test('onaylayan kişi belirteç alınmadan pasife alınırsa saat belirteç alamaz', async () => {
    await kisiEkle('pasif2', 'planlama_proje');
    const { govde } = await istekAc();
    assert.ok(govde);
    assert.equal((await onayla('pasif2', govde.kod)).statusCode, 200);
    await o().vt.sorgu('UPDATE kisi SET aktif = false WHERE id = $1', [kimlikler.get('pasif2')]);
    assert.equal((await sorHam(govde.istek)).statusCode, 401);
    const b = await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM oturum_saat_belirteci WHERE kisi_id = $1', [kimlikler.get('pasif2')]);
    assert.equal(b?.n, 0);
  });

  test('bir cihaz en çok sınır kadar bekleyen istek açar', async () => {
    const ip = yeniIp();
    for (let i = 0; i < SAAT_ISTEGI_IP_SINIRI; i += 1) assert.equal((await istekAc(ip)).durum, 200);
    assert.equal((await istekAc(ip)).durum, 429);
    assert.equal((await istekAc()).durum, 200, 'başka cihaz etkilenmez');
  });

  test('belirteç saat okuma uçlarını açar; başka hiçbir ucu ve hiçbir yazma komutunu açmaz', async () => {
    const b = await eslesmis('planci');
    assert.equal((await belirtecli(b, 'GET', '/saat/istasyonlar')).durum, 200);
    assert.equal((await belirtecli(b, 'GET', '/saat/uyarilar')).durum, 200);
    assert.equal((await belirtecli(b, 'GET', '/uretim-emirleri')).durum, 401);
    assert.equal((await belirtecli(b, 'GET', '/uretim-emirleri?x=/api/saat/istasyonlar')).durum, 401);
    assert.equal((await belirtecli(b, 'GET', '/hesabim/saat-cihazlari')).durum, 401);
    assert.equal((await belirtecli(b, 'POST', '/hesabim/saat-onayla', { kod: '123456' })).durum, 401);
    assert.equal((await belirtecli(b, 'POST', '/uretim-emirleri', { parcaNo: 'X', parcaAd: 'X', adet: 1, istasyonId: 1 })).durum, 401);
    const oturum = await belirtecli(b, 'GET', '/oturum');
    assert.deepEqual(oturum.govde, { kullanici: null });
    assert.equal((await belirtecli('b'.repeat(43), 'GET', '/saat/istasyonlar')).durum, 401);
    const head = await app.inject({ method: 'HEAD', url: '/api/saat/istasyonlar', headers: { authorization: `Bearer ${b}` } });
    assert.notEqual(head.statusCode, 200);
    // Çerez gelince belirteç hiç okunmaz: geçersiz çerez belirtece düşmez.
    const bozuk = await app.inject({ method: 'GET', url: '/api/saat/istasyonlar', headers: { authorization: `Bearer ${b}`, cookie: 'tmiv2_oturum=bozuk' } });
    assert.equal(bozuk.statusCode, 401);
  });

  test('296 a: istek kimliği başlıklı durdur isteğinde belirteç kişiyi çözer; başlık başka POST\'u açmaz', async () => {
    const b = await eslesmis('planci');
    const cozucu = kimlikCozucu(o().vt);
    const istek = (url: string, yontem = 'POST') => ({
      method: yontem,
      headers: { authorization: `Bearer ${b}`, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() },
      routeOptions: { url },
    }) as unknown as Parameters<typeof cozucu>[0];
    assert.equal((await cozucu(istek('/api/saat/emirler/:id/durdur')))?.id, kimlikler.get('planci'));
    assert.equal(await cozucu(istek('/api/saat/emirler/:id/baska')), null);
    assert.equal(await cozucu(istek('/api/uretim-emirleri/:id/durdur')), null);
    assert.equal(await cozucu(istek('/api/saat/emirler/:id/durdur', 'PUT')), null);
  });

  test('süresi dolan belirteç ve istek geçmez; 12 saati aşan belirteç yazılamaz', async () => {
    const b = await eslesmis('planci');
    await o().sahip.sorgu(
      "UPDATE oturum_saat_belirteci SET acildi = now() - interval '13 hours', son = now() - interval '1 hour' WHERE belirtec_ozeti = $1",
      [anahtarOzeti(b)]);
    assert.equal((await belirtecli(b, 'GET', '/saat/istasyonlar')).durum, 401);

    const { govde } = await istekAc();
    assert.ok(govde);
    await o().sahip.sorgu(
      "UPDATE oturum_saat_istegi SET olusturma = now() - interval '11 minutes', son = now() - interval '1 minute' WHERE kod_ozeti = $1",
      [anahtarOzeti(govde.kod)]);
    assert.equal((await onayla('planci', govde.kod)).statusCode, 400);
    assert.equal((await sorHam(govde.istek)).statusCode, 401);

    await assert.rejects(
      o().sahip.sorgu(
        "INSERT INTO oturum_saat_belirteci (belirtec_ozeti, kisi_id, acildi, son) VALUES ('x', $1, now(), now() + interval '13 hours')", [yoneticiId]),
      /oturum_saat_belirteci_sure/,
    );
  });

  test('kişi kendi saatini kapatır, başkasınınkini kapatamaz; rol yöneten herkesinkini görür ve kapatır', async () => {
    const b1 = await eslesmis('planci2');
    const benim = saatCihazlariCevabi.parse((await cerezli('planci2', 'GET', '/hesabim/saat-cihazlari')).govde).cihazlar;
    assert.equal(benim.length, 1);
    const id = benim[0]!.id;
    assert.equal((await cerezli('planci', 'POST', `/hesabim/saat-cihazlari/${id}/kapat`)).durum, 404);
    assert.equal((await cerezli('planci', 'GET', '/oturum/saat-cihazlari')).durum, 403);
    { const k = await cerezli('planci2', 'POST', `/hesabim/saat-cihazlari/${id}/kapat`); assert.equal(k.durum, 200, JSON.stringify(k.govde)); }
    assert.equal((await belirtecli(b1, 'GET', '/saat/istasyonlar')).durum, 401);

    const b2 = await eslesmis('planci2');
    const hepsi = saatCihazlariCevabi.parse((await cerezli('yonetici', 'GET', '/oturum/saat-cihazlari')).govde).cihazlar;
    const hedef = hepsi.find((c) => c.kisiId === kimlikler.get('planci2'));
    assert.ok(hedef);
    assert.equal((await cerezli('yonetici', 'POST', `/oturum/saat-cihazlari/${hedef.id}/kapat`)).durum, 200);
    assert.equal((await belirtecli(b2, 'GET', '/saat/istasyonlar')).durum, 401);
  });

  test('parola ya da PIN değişince saat belirteci de geçersiz olur', async () => {
    const b = await eslesmis('planci2');
    assert.equal((await belirtecli(b, 'GET', '/saat/istasyonlar')).durum, 200);
    const d = await cerezli('planci2', 'POST', '/hesabim/parola-degistir', { eskiParola: PAROLA, yeniParola: 'yeni-parola-22' });
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    assert.equal((await belirtecli(b, 'GET', '/saat/istasyonlar')).durum, 401);

    const kisiId = kimlikler.get('planci2');
    const surum = (await o().vt.tek<{ surum: number }>('SELECT surum FROM kisi WHERE id = $1', [kisiId]))?.surum ?? 1;
    assert.equal((await cerezli('yonetici', 'POST', `/kisiler/${kisiId}/pin-ver`, { pin: '482913', surum })).durum, 200);
    const pb = await app.inject({
      method: 'POST', url: '/api/oturum/pin-belirle', payload: { kullaniciAdi: 'planci2', geciciPin: '482913', yeniPin: '730514' }, remoteAddress: yeniIp(),
    });
    assert.equal(pb.statusCode, 200, pb.body);
    cerezler.set('planci2', String(pb.headers['set-cookie']).split(';')[0] ?? '');
    const b2 = await eslesmis('planci2');
    const p = await cerezli('planci2', 'POST', '/hesabim/pin-degistir', { eski: '730514', yeniPin: '615208' });
    assert.equal(p.durum, 200, JSON.stringify(p.govde));
    assert.equal((await belirtecli(b2, 'GET', '/saat/istasyonlar')).durum, 401);
  });

  test('pasife alınan kişinin saati açmaz ve listede görünmez', async () => {
    await kisiEkle('pasif', 'planlama_proje');
    const b = await eslesmis('pasif');
    await o().vt.sorgu('UPDATE kisi SET aktif = false WHERE id = $1', [kimlikler.get('pasif')]);
    assert.equal((await belirtecli(b, 'GET', '/saat/istasyonlar')).durum, 401);
    const hepsi = saatCihazlariCevabi.parse((await cerezli('yonetici', 'GET', '/oturum/saat-cihazlari')).govde).cihazlar;
    assert.equal(hepsi.some((c) => c.kisiId === kimlikler.get('pasif')), false);
  });

  test('hatalı onaylar yalnız o kişiyi kilitler; başarılı onay sayacı sıfırlamaz; başka kişi etkilenmez', async () => {
    await kisiEkle('tahminci', 'planlama_proje');
    for (let i = 0; i < HESAP_KILIDI_ESIGI - 1; i += 1) assert.equal((await onayla('tahminci', '000000')).statusCode, 400);
    const kendi = await istekAc();
    assert.ok(kendi.govde);
    assert.equal((await onayla('tahminci', kendi.govde.kod)).statusCode, 200);
    assert.equal((await onayla('tahminci', '000000')).statusCode, 400);

    const { govde } = await istekAc();
    assert.ok(govde);
    const kilitli = await onayla('tahminci', govde.kod);
    assert.equal(kilitli.statusCode, 401);
    assert.match(String(kilitli.json().mesaj), /Çok sayıda hatalı deneme/);
    assert.equal((await onayla('planci', govde.kod)).statusCode, 200, 'kilit başkasının onayını kapatmaz');
  });
});
