import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uclariKaydet } from '#cekirdek/uc.ts';
import { hataYonetiminiKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from './disari.ts';
import { CIHAZ_PENCERESI_DK, CIHAZ_SINIRI } from './kurallar.ts';
import { oturumUclari } from './uclar.ts';

const PAROLA = 'dogru-parola-1';
const HATALI_ILETI = 'Kullanıcı adı, PIN ya da parola hatalı.';
const cihazIletisi = (dk: number): string => `Bu cihazdan çok sayıda hatalı deneme. Giriş ${dk} dk sonra yeniden denenebilir.`;

// Hesap kilidi bir adı korur; ortak tabletten adları sırayla deneyen biri her ada 9 deneme yapıp hiçbirini kilitlemeden
// sürdürebilirdi. Cihaz sınırı o cihazdan bütün adlara gelen hatalı denemeleri sayar (kullanıcı kararı, soru 66).
describe('cihaz başına giriş sınırı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let saat = new Date();
  const ilerle = (sn: number): void => { saat = new Date(saat.getTime() + sn * 1000); };
  let sayac = 0;

  const giris = (kullaniciAdi: string, parola: string, ip: string) =>
    app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola }, remoteAddress: ip });
  const kisiEkle = async (): Promise<string> => {
    const ad = `cihaz-${++sayac}`;
    await ortam!.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi: ad, parola: PAROLA }));
    return ad;
  };
  // Her deneme ayrı ada: ad ve cihaz başına bekleme ile hesap kilidi devreye girmez, yalnız cihaz sınırı sınanır.
  const adlaraHatali = async (ip: string, kez: number): Promise<void> => {
    for (let i = 0; i < kez; i += 1) {
      const cevap = await giris(`olmayan-${++sayac}`, 'yanlis-parola', ip);
      assert.equal(cevap.json().mesaj, HATALI_ILETI, `deneme ${i + 1}`);
    }
  };

  before(async () => {
    ortam = await testVeritabaniKur('oturum_cihaz');
    app = Fastify();
    hataYonetiminiKur(app);
    uclariKaydet(app, oturumUclari(() => saat), { vt: ortam.vt, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('sınır 15 dk içinde 20 hatalı deneme', () => {
    assert.equal(CIHAZ_SINIRI, 20);
    assert.equal(CIHAZ_PENCERESI_DK, 15);
  });

  test('bir cihazdan farklı adlara 20 hatalı denemeden sonra o cihazda doğru parola da reddedilir; başka cihaz etkilenmez', async () => {
    const ad = await kisiEkle();
    await adlaraHatali('10.20.0.1', 19);
    assert.equal((await giris(ad, PAROLA, '10.20.0.1')).statusCode, 200, '19 hatalı deneme sınırı aşmaz');
    await adlaraHatali('10.20.0.1', 1);
    const red = await giris(ad, PAROLA, '10.20.0.1');
    assert.equal(red.statusCode, 401);
    assert.deepEqual(red.json(), { kod: 'OTURUM_YOK', mesaj: cihazIletisi(15) });
    assert.equal(red.headers['set-cookie'], undefined);
    assert.equal((await giris(ad, PAROLA, '10.20.0.2')).statusCode, 200);
  });

  test('pencereden düşen deneme sayılmaz: en eski deneme 15 dk dolunca cihaz açılır', async () => {
    const ad = await kisiEkle();
    await adlaraHatali('10.20.1.1', 20);
    ilerle(14 * 60);
    assert.equal((await giris(ad, PAROLA, '10.20.1.1')).json().mesaj, cihazIletisi(1));
    ilerle(61);
    assert.equal((await giris(ad, PAROLA, '10.20.1.1')).statusCode, 200);
  });

  test('başarılı giriş cihaz sayacını sıfırlamaz: kendi hesabıyla giren sayacı temizleyip denemeyi sürdüremez', async () => {
    const ad = await kisiEkle();
    await adlaraHatali('10.20.2.1', 10);
    assert.equal((await giris(ad, PAROLA, '10.20.2.1')).statusCode, 200);
    await adlaraHatali('10.20.2.1', 10);
    assert.equal((await giris(ad, PAROLA, '10.20.2.1')).json().mesaj, cihazIletisi(15));
  });

  test('aynı cihazdan farklı adlara eşzamanlı denemeler sınırı aşamaz: sınırın bir altındayken yalnız biri parolaya bakar', async () => {
    await adlaraHatali('10.20.3.1', 19);
    const cevaplar = await Promise.all(Array.from({ length: 10 }, () => giris(`olmayan-${++sayac}`, 'yanlis-parola', '10.20.3.1')));
    const mesajlar = cevaplar.map((c) => c.json().mesaj as string);
    assert.equal(mesajlar.filter((m) => m === HATALI_ILETI).length, 1, JSON.stringify(mesajlar));
    const kayit = await ortam!.vt.tek<{ sayi: number }>(
      "SELECT count(*)::int AS sayi FROM giris_denemesi WHERE ip = '10.20.3.1' AND sonuc = 'hatali'",
    );
    assert.equal(kayit?.sayi, CIHAZ_SINIRI);
  });
});
