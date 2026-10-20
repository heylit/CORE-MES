import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uclariKaydet } from '#cekirdek/uc.ts';
import { hataYonetiminiKur } from '#cekirdek/uygulama.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from './disari.ts';
import { oturumUclari } from './uclar.ts';

const PAROLA = 'dogru-parola-1';
const YENI = 'yeni-parola-9';
const IP = '10.0.0.8';
const YOL = '/api/hesabim/parola-degistir';

describe('kendi parolasını değiştirme (gerçek PostgreSQL, gerçek giriş, saat elde)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let saat = new Date();
  const ilerle = (sn: number): void => { saat = new Date(saat.getTime() + sn * 1000); };
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  // Her test kendi kullanıcısını kullanır: bekleme sayacı kullanıcı adı ve IP'ye bağlıdır.
  const kisi = async (): Promise<string> => {
    const kullaniciAdi = `parolali-${++sayac}`;
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi, parola: PAROLA }));
    return kullaniciAdi;
  };
  const giris = (kullaniciAdi: string, parola: string) =>
    app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola }, remoteAddress: IP });
  const oturumAc = async (kullaniciAdi: string, parola = PAROLA): Promise<string> => {
    const cevap = await giris(kullaniciAdi, parola);
    assert.equal(cevap.statusCode, 200, cevap.body);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  };
  const degistir = (cerez: string | null, eski: string, yeni: string) =>
    app.inject({
      method: 'POST', url: YOL, payload: { eskiParola: eski, yeniParola: yeni }, remoteAddress: IP,
      ...(cerez === null ? {} : { headers: { cookie: cerez } }),
    });
  const acikMi = async (cerez: string): Promise<boolean> =>
    (await app.inject({ method: 'GET', url: '/api/oturum', headers: { cookie: cerez } })).json().kullanici !== null;

  before(async () => {
    ortam = await testVeritabaniKur('oturum_parola');
    app = Fastify();
    hataYonetiminiKur(app);
    uclariKaydet(app, oturumUclari(() => saat), { vt: ortam.vt, kimlik: kimlikCozucu(ortam.vt) });
  });
  after(async () => {
    await ortam?.kaldir();
  });

  test('oturum ister; doğru eski parolayla değişir, yeni parola geçerli olur', async () => {
    const ad = await kisi();
    assert.equal((await degistir(null, PAROLA, YENI)).statusCode, 401);

    const cerez = await oturumAc(ad);
    const cevap = await degistir(cerez, PAROLA, YENI);
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.deepEqual(cevap.json(), { tamam: true });
    await oturumAc(ad, YENI);
    ilerle(5);
    assert.equal((await giris(ad, PAROLA)).statusCode, 401);
  });

  test('o anki oturum kalır, kişinin öbür oturumları kapanır; başkasının oturumuna dokunulmaz', async () => {
    const ad = await kisi();
    const baska = await kisi();
    const simdiki = await oturumAc(ad);
    const oteki = await oturumAc(ad);
    const baskasi = await oturumAc(baska);

    assert.equal((await degistir(simdiki, PAROLA, YENI)).statusCode, 200);
    assert.equal(await acikMi(simdiki), true);
    assert.equal(await acikMi(oteki), false);
    assert.equal(await acikMi(baskasi), true);
  });

  test('yanlış eski parola reddedilir ve parola değişmez; kısa yeni parola sayılmaz', async () => {
    const ad = await kisi();
    const cerez = await oturumAc(ad);

    const kisa = await degistir(cerez, PAROLA, 'kisa');
    assert.equal(kisa.statusCode, 400);
    assert.equal(kisa.json().alan, 'yeniParola');
    // Kısa yeni parola sayılmaz: hemen ardından yanlış eski parola beklemeye takılmadan 400 alır.
    const yanlis = await degistir(cerez, 'yanlis-parola-1', YENI);
    assert.equal(yanlis.statusCode, 400);
    assert.equal(yanlis.json().alan, 'eskiParola');

    ilerle(5);
    await oturumAc(ad, PAROLA);
  });

  test('yanlış eski parola girişteki beklemeyi başlatır: bekleme dolmadan doğru parola da reddedilir, dolunca kabul edilir', async () => {
    const ad = await kisi();
    const cerez = await oturumAc(ad);

    assert.equal((await degistir(cerez, 'yanlis-parola-1', YENI)).statusCode, 400);
    const beklemede = await degistir(cerez, PAROLA, YENI);
    assert.equal(beklemede.statusCode, 401);
    assert.equal(beklemede.json().mesaj, 'Çok sık deneme. 1 sn sonra yeniden deneyin.');
    // Aynı sayaç girişi de bekletir.
    const girisBekleme = await giris(ad, PAROLA);
    assert.equal(girisBekleme.statusCode, 401);
    assert.equal(girisBekleme.json().mesaj, 'Çok sık deneme. 1 sn sonra yeniden deneyin.');
    assert.equal(await acikMi(cerez), true, 'bekleme yanıtı oturumu bitirmemeli');

    ilerle(1);
    assert.equal((await degistir(cerez, PAROLA, YENI)).statusCode, 200);
  });

  test('başarı sayacı sıfırlar: sonraki tek hata yine 1 sn bekletir', async () => {
    const ad = await kisi();
    const cerez = await oturumAc(ad);
    assert.equal((await degistir(cerez, 'yanlis-parola-1', YENI)).statusCode, 400);
    ilerle(1);
    assert.equal((await degistir(cerez, PAROLA, YENI)).statusCode, 200);

    assert.equal((await degistir(cerez, 'yanlis-parola-1', 'baska-parola-9')).statusCode, 400);
    ilerle(1);
    // Sıfırlanmasaydı seri 2 olur, bekleme 2 sn sürerdi.
    assert.equal((await degistir(cerez, YENI, 'baska-parola-9')).statusCode, 200);
  });

  test('giriş hatası da aynı sayaca yazar: yanlış girişten sonra parola değişimi bekletilir', async () => {
    const ad = await kisi();
    const cerez = await oturumAc(ad);
    assert.equal((await giris(ad, 'yanlis-parola-1')).statusCode, 401);

    const beklemede = await degistir(cerez, PAROLA, YENI);
    assert.equal(beklemede.statusCode, 401);
    assert.match(beklemede.json().mesaj, /sn sonra/);
  });
});
