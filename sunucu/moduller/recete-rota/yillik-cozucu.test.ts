import assert from 'node:assert/strict';
import { after, afterEach, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { YillikCozumu } from '#paylasilan/sozlesme/recete-rota.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { ESZAMANLI_AZAMI, SONUC_OMRU_MS, modelCoz, yillikCozBaslat, yillikCozDurumu, yillikIsleriSifirla } from './yillik-cozucu.ts';

// Yıllık plan çözücüsü (454/6 a). Modeller uydurmadır: iki ürünlü küçük doğrusal ve tamsayılı model.
const LP = 'Maximize\n obj: 3 x + 2 y\nSubject To\n c1: x + y <= 4\n c2: x + 3 y <= 6\nBounds\n x <= 3\nEnd\n';
const MIP = 'Maximize\n obj: 5 a + 4 b\nSubject To\n c1: 6 a + 4 b <= 24\n c2: a + 2 b <= 6\nBinary\n a b\nEnd\n';
const BOZUK = 'Maximize\n obj: x +\nSubject\nEnd\n';
const COZUM: YillikCozumu = { s: 7, ob: 1, val: { x: 1 }, dual: { x: null } };

afterEach(() => { yillikIsleriSifirla(); });

describe('yıllık plan çözücüsü', () => {
  test('YC-01: doğrusal model gerçek HiGHS ile çözülür; istenen sütunun değeri ve indirgenmiş maliyeti gelir', async () => {
    const r = await modelCoz({ lp: LP, sure: 10, want: ['x', 'y', 'yok'] });
    assert.equal(r.s, 7);
    assert.equal(r.ob, 11);
    assert.deepEqual(r.val, { x: 3, y: 1 });
    assert.equal(typeof r.dual?.['x'], 'number');
    assert.equal(r.dual?.['yok'], null);
  });

  test('YC-02: tamsayılı model en iyiye çözülür; bozuk model en iyi durumla dönmez', async () => {
    const r = await modelCoz({ lp: MIP, sure: 10, want: ['a', 'b'] });
    assert.equal(r.s, 7);
    assert.equal(r.ob, 9);
    assert.deepEqual(r.val, { a: 1, b: 1 });
    // Okunamayan metni HiGHS reddetmez, model durumuyla bildirir (en iyi değil); sayfa durumu gösterir.
    assert.notEqual((await modelCoz({ lp: BOZUK, sure: 5, want: [] })).s, 7);
  });

  test('YC-03: süre aşılınca iş parçacığı durdurulur ve çağrı reddedilir', async () => {
    await assert.rejects(modelCoz({ lp: MIP, sure: 1, want: [] }, 1), /saniyede çözülemedi/);
  });

  test('YC-04: başlatma hemen döner; sonuç yalnız başlatana, bir kez verilir', async () => {
    let bitir: (c: YillikCozumu) => void = () => undefined;
    const { is } = yillikCozBaslat(1, { lp: LP, sure: 5, want: [] }, Date.now(), () => new Promise((c) => { bitir = c; }));
    assert.deepEqual(yillikCozDurumu(1, is), { durum: 'suruyor' });
    assert.throws(() => yillikCozDurumu(2, is), /bulunamadı/);
    bitir(COZUM);
    await Promise.resolve();
    assert.deepEqual(yillikCozDurumu(1, is), { durum: 'bitti', cozum: COZUM });
    assert.throws(() => yillikCozDurumu(1, is), /bulunamadı/);
  });

  test('YC-05: kişi başına tek çözüm, sunucuda en çok iki; hata sonucu iletisiyle döner; okunmayan sonuç süresi dolunca silinir', async () => {
    const asili = () => new Promise<YillikCozumu>(() => undefined);
    const g = { lp: LP, sure: 5, want: [] };
    yillikCozBaslat(1, g, Date.now(), asili);
    assert.throws(() => yillikCozBaslat(1, g, Date.now(), asili), /sürüyor/);
    for (let k = 2; k <= ESZAMANLI_AZAMI; k++) yillikCozBaslat(k, g, Date.now(), asili);
    assert.throws(() => yillikCozBaslat(99, g, Date.now(), asili), /dolu/);
    yillikIsleriSifirla();
    const { is } = yillikCozBaslat(3, g, Date.now(), () => Promise.reject(new Error('HiGHS modeli çözemedi: deneme')));
    await new Promise((c) => { setImmediate(c); });
    assert.deepEqual(yillikCozDurumu(3, is), { durum: 'hata', mesaj: 'HiGHS modeli çözemedi: deneme' });
    const ikinci = yillikCozBaslat(3, g, Date.now(), () => Promise.resolve(COZUM));
    await new Promise((c) => { setImmediate(c); });
    assert.throws(() => yillikCozDurumu(3, ikinci.is, Date.now() + SONUC_OMRU_MS + 1000), /bulunamadı/);
  });
});

const PAROLA = 'dogru-parola-1';

describe('yıllık plan çözüm ucu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let planlamaci = '';
  let baskasi = '';
  let gormeyen = '';
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  const baslat = (cerez: string, payload: object) => app.inject({ method: 'POST', url: '/api/recete-rota/yillik-plan/coz', headers: { cookie: cerez }, payload });
  const oku = (cerez: string, is: string) => app.inject({ method: 'GET', url: `/api/recete-rota/yillik-plan/coz/${is}`, headers: { cookie: cerez } });
  async function sonuc(cerez: string, is: string): Promise<unknown> {
    for (let k = 0; k < 200; k++) {
      const c = await oku(cerez, is);
      assert.equal(c.statusCode, 200, c.body);
      const g = c.json() as { durum: string };
      if (g.durum !== 'suruyor') return g;
      await new Promise((t) => { setTimeout(t, 50); });
    }
    throw new Error('çözüm bitmedi');
  }

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_yillik_coz');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    planlamaci = await islemliKisi('planlamaci', ['recete-rota.planlama-oku']);
    baskasi = await islemliKisi('baskasi', ['recete-rota.planlama-oku']);
    gormeyen = await islemliKisi('gormeyen', ['recete-rota.oku', 'recete-rota.yaz']);
  });
  after(async () => { await ortam?.kaldir(); });

  test('YC-10: planlamayı gören kişi başlatır ve sonucu bir kez okur; başkası okuyamaz; istek deftere girer', async () => {
    const b = await baslat(planlamaci, { lp: LP, sure: 10, want: ['x', 'y'] });
    assert.equal(b.statusCode, 200, b.body);
    const { is } = b.json() as { is: string };
    assert.equal((await oku(baskasi, is)).statusCode, 404);
    const r = await sonuc(planlamaci, is) as { durum: string; cozum: YillikCozumu };
    assert.equal(r.durum, 'bitti');
    assert.equal(r.cozum.s, 7);
    assert.deepEqual(r.cozum.val, { x: 3, y: 1 });
    assert.equal((await oku(planlamaci, is)).statusCode, 404);
    const d = await vt().sorgu<{ metin: string }>(
      "SELECT row_to_json(d)::text AS metin FROM denetim_kaydi d WHERE yol LIKE '%/recete-rota/yillik-plan/coz' ORDER BY id DESC LIMIT 1");
    assert.equal(d.length, 1);
    assert.match(d[0]?.metin ?? '', /Maximize/);
  });

  test('YC-11: bozuk model ve modelde olmayan sütun sunucuyu düşürmez: durum kodu döner, sütun boş kalır', async () => {
    const b = await baslat(planlamaci, { lp: BOZUK, sure: 5, want: ['yok'] });
    assert.equal(b.statusCode, 200, b.body);
    const r = await sonuc(planlamaci, (b.json() as { is: string }).is) as { durum: string; cozum: YillikCozumu };
    assert.equal(r.durum, 'bitti');
    assert.notEqual(r.cozum.s, 7);
    assert.deepEqual(r.cozum.dual, { yok: null });
  });

  test('YC-12: planlamayı görmeyen kişi başlatamaz ve okuyamaz (403); geçersiz gövde 400', async () => {
    const b = await baslat(gormeyen, { lp: LP, sure: 10, want: [] });
    assert.equal(b.statusCode, 403, b.body);
    assert.equal((await oku(gormeyen, '00000000-0000-4000-8000-000000000000')).statusCode, 403);
    for (const g of [{ lp: '', sure: 10, want: [] }, { lp: LP, sure: 61, want: [] }, { lp: LP, sure: 10 }, { lp: 'x'.repeat(900_001), sure: 10, want: [] }]) {
      assert.equal((await baslat(planlamaci, g)).statusCode, 400);
    }
    assert.equal((await oku(planlamaci, 'kimlik-degil')).statusCode, 400);
  });
});
