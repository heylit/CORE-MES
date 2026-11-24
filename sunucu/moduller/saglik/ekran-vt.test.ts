import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uclariKaydet } from '#cekirdek/uc.ts';
import { hataYonetiminiKur, uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { ekranHatasiHiziniSifirla, ekranHatasiTemizligi } from './ekran-hatasi.ts';
import { dizinEksikOlabilirMi, ekranHatasiHizAsildiMi, ekranHatasiParmagi } from './kurallar.ts';
import { saglikUclari } from './uclar.ts';

const PAROLA = 'dogru-parola-1';
const HATA = { sayfa: '/uretim-emirleri?ara=gizli#a', hata: 'TypeError: Cannot read properties of undefined', yigin: 'TypeError: x\n  at Satir (a.js:1)\n  at b (b.js:2)', surum: '0.9.14' };

describe('ekran hatası ve veritabanı kuralları (saf)', () => {
  test('hız sınırı: pencere içinde 20 istekten sonra reddeder, pencere geçince açılır', () => {
    const anlar = Array.from({ length: 20 }, (_, i) => 1000 + i);
    assert.equal(ekranHatasiHizAsildiMi(anlar.slice(1), 2000), false);
    assert.equal(ekranHatasiHizAsildiMi(anlar, 2000), true);
    assert.equal(ekranHatasiHizAsildiMi(anlar, 1000 + 60_000), false);
  });

  test('parmak izi yığının ilk satırına bakar, ikinci satırdan sonrası gruplamayı bozmaz', () => {
    const a = ekranHatasiParmagi('/x', 'H', 'H\n  at a (1)\n  at b (2)');
    assert.equal(a, ekranHatasiParmagi('/x', 'H', 'H\n  at a (1)\n  at c (99)'));
    assert.notEqual(a, ekranHatasiParmagi('/x', 'H', 'H\n  at z (1)'));
    assert.notEqual(a, ekranHatasiParmagi('/y', 'H', 'H\n  at a (1)'));
  });

  test('dizin eksik olabilir: küçük tabloda ya da dizin taraması baskınsa işaret yok', () => {
    assert.equal(dizinEksikOlabilirMi({ tamTarama: 5000, dizinTaramasi: 10, canliSatir: 50 }), false);
    assert.equal(dizinEksikOlabilirMi({ tamTarama: 50, dizinTaramasi: 1, canliSatir: 50_000 }), false);
    assert.equal(dizinEksikOlabilirMi({ tamTarama: 5000, dizinTaramasi: 9000, canliSatir: 50_000 }), false);
    assert.equal(dizinEksikOlabilirMi({ tamTarama: 5000, dizinTaramasi: 10, canliSatir: 50_000 }), true);
    assert.equal(dizinEksikOlabilirMi({ tamTarama: 5000, dizinTaramasi: null, canliSatir: 50_000 }), true);
  });
});

describe('ekran hatası ve veritabanı uçları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let uyg: FastifyInstance;
  let yonetici = '';
  let izleyen = '';
  let izleyenId = 0;
  const acik = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam; };
  const post = (cookie: string, govde: unknown) => uyg.inject({ method: 'POST', url: '/api/saglik/ekran-hatalari', headers: { cookie }, payload: govde as object });
  const liste = async (donem: string) => (await uyg.inject({ method: 'GET', url: `/api/saglik/ekran-hatalari?donem=${donem}`, headers: { cookie: yonetici } })).json();

  before(async () => {
    ortam = await testVeritabaniKur('saglikekran');
    const tam = await uygulamaKur({ vt: acik().vt, ayar: acik().ayar, kimlik: kimlikCozucu(acik().vt), denetle: denetimYaz });
    await acik().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    izleyenId = await acik().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi: 'izleyen', parola: PAROLA }));
    await acik().vt.sorgu("INSERT INTO rol (kod, ad) VALUES ('izleyen', 'İzleyen')");
    await acik().vt.sorgu("UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = 'izleyen') WHERE kisi_id = $1", [izleyenId]);
    const giris = async (kullaniciAdi: string): Promise<string> => {
      const c = await tam.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
      assert.equal(c.statusCode, 200, c.body);
      return String(c.headers['set-cookie'] ?? '').split(';')[0] ?? '';
    };
    yonetici = await giris('yonetici');
    izleyen = await giris('izleyen');
    await tam.close();
    uyg = Fastify();
    hataYonetiminiKur(uyg);
    uclariKaydet(uyg, saglikUclari(30, { ayarOku: () => ({ commit: null, ortam: 'test' }), gitOku: async () => null }), { vt: acik().vt, kimlik: kimlikCozucu(acik().vt), denetle: denetimYaz });
  });
  after(async () => {
    await uyg.close();
    await ortam?.kaldir();
  });

  test('yazma: kimliksiz 401; her oturum yazar; aynı hata tek satırda sayılır, ayrı kişi sayısı artar; sorgu ve parça adresten atılır', async () => {
    assert.equal((await uyg.inject({ method: 'POST', url: '/api/saglik/ekran-hatalari', payload: HATA })).statusCode, 401);
    assert.equal((await post(izleyen, HATA)).statusCode, 200);
    assert.equal((await post(izleyen, HATA)).statusCode, 200);
    assert.equal((await post(yonetici, HATA)).statusCode, 200);
    const l = await liste('24s');
    assert.equal(l.satirlar.length, 1);
    assert.deepEqual({ kez: l.satirlar[0].kez, kisi: l.satirlar[0].kisiSayisi, sayfa: l.satirlar[0].sayfa }, { kez: 3, kisi: 2, sayfa: '/uretim-emirleri' });
    assert.equal(l.son24Saat, 1);
    await post(izleyen, { ...HATA, hata: 'Başka hata' });
    assert.equal((await liste('24s')).satirlar.length, 2);
  });

  test('gövde sınırı ve okuma yetkisi: uzun ileti 400, izleyen listeyi okuyamaz (403), kişi gövdeden seçilemez', async () => {
    assert.equal((await post(izleyen, { ...HATA, hata: 'x'.repeat(301) })).statusCode, 400);
    assert.equal((await post(izleyen, { ...HATA, hata: '' })).statusCode, 400);
    assert.equal((await uyg.inject({ method: 'GET', url: '/api/saglik/ekran-hatalari', headers: { cookie: izleyen } })).statusCode, 403);
    assert.equal((await uyg.inject({ method: 'GET', url: '/api/saglik/ekran-hatalari?donem=1g', headers: { cookie: yonetici } })).statusCode, 400);
    await post(izleyen, { ...HATA, hata: 'Kişi seçme denemesi', kisiId: 999_999 });
    const son = (await liste('90g')).satirlar.find((x: { hata: string }) => x.hata === 'Kişi seçme denemesi');
    assert.equal(son.sonKisiId, izleyenId);
  });

  test('dönem süzgeci ve 90 gün temizliği', async () => {
    await acik().sahip.sorgu("UPDATE saglik_ekran_hatasi SET son_an = now() - interval '3 days' WHERE hata = 'Başka hata'");
    assert.equal((await liste('24s')).satirlar.length, 2);
    assert.equal((await liste('7g')).satirlar.length, 3);
    await acik().sahip.sorgu("UPDATE saglik_ekran_hatasi SET son_an = now() - interval '91 days' WHERE hata = 'Başka hata'");
    assert.equal((await liste('90g')).satirlar.length, 2);
    assert.equal(await acik().vt.tx((db) => ekranHatasiTemizligi(db, new Date())), 1);
  });

  test('veritabanı ucu: yalnız ayrıntı işlemi; eklenti yoksa durum söylenir, tablolar gelir', async () => {
    assert.equal((await uyg.inject({ method: 'GET', url: '/api/saglik/veritabani', headers: { cookie: izleyen } })).statusCode, 403);
    const c = await uyg.inject({ method: 'GET', url: '/api/saglik/veritabani', headers: { cookie: yonetici } });
    assert.equal(c.statusCode, 200, c.body);
    const g = c.json();
    assert.ok(['var', 'yok', 'yetkisiz'].includes(g.eklenti));
    if (g.eklenti !== 'var') assert.deepEqual(g.sorgular, []);
    assert.ok(g.tablolar.length > 0);
    assert.ok(g.tablolar.every((t: { ad: string; dizinEksikOlabilir: boolean }) => typeof t.ad === 'string' && typeof t.dizinEksikOlabilir === 'boolean'));
  });

  test('hız sınırı ucu: kişi başına dakikada 20, aşan 429; denetim defterine gövde girmez', async () => {
    ekranHatasiHiziniSifirla();
    const kodlar: number[] = [];
    for (let i = 0; i < 22; i++) kodlar.push((await post(izleyen, { ...HATA, hata: `Sınır ${i}` })).statusCode);
    assert.equal(kodlar.filter((k) => k === 200).length, 20);
    assert.deepEqual(kodlar.slice(20), [429, 429]);
    assert.equal((await post(yonetici, { ...HATA, hata: 'Başka kişi' })).statusCode, 200);
    const d = await acik().vt.sorgu<{ metin: string }>("SELECT row_to_json(x)::text AS metin FROM denetim_kaydi x WHERE yol LIKE '%/saglik/ekran-hatalari'");
    assert.ok(d.length >= 20);
    assert.ok(d.every((x) => !x.metin.includes('Sınır ')));
    ekranHatasiHiziniSifirla();
  });
});
