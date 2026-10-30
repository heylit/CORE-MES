import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uclariKaydet } from '#cekirdek/uc.ts';
import { hataYonetiminiKur, uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from './disari.ts';
import { CIHAZ_CEREZI, HESAP_KILIDI_ESIGI } from './kurallar.ts';
import { oturumUclari } from './uclar.ts';

// Kart #1326 (kararlar 1327 a, 1328 a): istasyonda kart + kişinin kendi PIN'i. Kişi, kart ve cihaz adları uydurmadır.
const PAROLA = 'dogru-parola-1';
const GECICI = '482913';
const PIN = '730514';
const YOL = '/api/oturum/kart-giris';

describe('istasyonda kart + PIN girişi (gerçek PostgreSQL, saat elde)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let saatli: FastifyInstance;
  let saat = new Date();
  const ilerle = (sn: number): void => { saat = new Date(saat.getTime() + sn * 1000); };
  let yoneticiId = 0;
  let yoneticiCerezi = '';
  let istasyon = '';
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const cerezAl = (cevap: LightMyRequestResponse): string => String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  const rolId = async (kod: string): Promise<number> => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
  const yonetici = (yol: string, payload: object) =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload, headers: { cookie: yoneticiCerezi, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } });

  // Her test kendi operatörünü ve kartını kullanır: bekleme ve kilit kullanıcı adına bağlıdır. belirle false ise kişi geçici PIN'de kalır.
  async function kartliOperator(belirle = true): Promise<{ id: number; ad: string; kart: string }> {
    const ad = `kartli-${++sayac}`;
    const kart = `00041234${String(sayac).padStart(2, '0')}`;
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi: ad, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, await rolId('operator'));
      await rolAl(db, yoneticiId, yeni, await rolId('yonetici'));
      return yeni;
    });
    const surum = (await vt().tek<{ surum: number }>('SELECT surum FROM kisi WHERE id = $1', [id]))!.surum;
    assert.equal((await yonetici(`/kisiler/${id}/pin-ver`, { pin: GECICI, surum })).statusCode, 200);
    if (belirle) {
      const c = await app.inject({ method: 'POST', url: '/api/oturum/pin-belirle', payload: { kullaniciAdi: ad, geciciPin: GECICI, yeniPin: PIN } });
      assert.equal(c.statusCode, 200, c.body);
    }
    const k = await yonetici('/nizamiye/personel-kartlari', { kisiId: id, kartNo: kart });
    assert.equal(k.statusCode, 200, k.body);
    return { id, ad, kart };
  }
  const kartGiris = (kart: string, pin: string, cihaz: string | null = istasyon, ip = '10.8.0.1') =>
    saatli.inject({
      method: 'POST', url: YOL, payload: { kart, pin }, remoteAddress: ip, ...(cihaz === null ? {} : { headers: { cookie: `${CIHAZ_CEREZI}=${cihaz}` } }),
    });

  before(async () => {
    ortam = await testVeritabaniKur('oturum_kart');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    saatli = Fastify();
    hataYonetiminiKur(saatli);
    uclariKaydet(saatli, oturumUclari(() => saat), { vt: ortam.vt, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    assert.equal(cevap.statusCode, 200, cevap.body);
    yoneticiCerezi = cerezAl(cevap);
    const cihaz = await yonetici('/oturum/ortak-cihazlar', { ad: 'Deneme istasyon' });
    assert.equal(cihaz.statusCode, 200, cihaz.body);
    istasyon = String(cihaz.headers['set-cookie']).split(';')[0]!.slice(CIHAZ_CEREZI.length + 1);
  });
  after(async () => {
    await app?.close();
    await saatli?.close();
    await ortam?.kaldir();
  });

  test('ortak cihazda kayıtlı kart ve kişinin PIN\'i oturum açar; kişisel cihazda kart yolu kapalı ve hiçbir şey yazılmaz', async () => {
    const kisi = await kartliOperator();
    const once = (await vt().tek<{ sayi: number }>('SELECT count(*)::int AS sayi FROM giris_denemesi'))!.sayi;
    const kisisel = await kartGiris(kisi.kart, PIN, null);
    assert.equal(kisisel.statusCode, 403);
    assert.match(kisisel.json().mesaj, /istasyon olarak kayıtlı cihazda/);
    assert.equal((await kartGiris(kisi.kart, PIN, 'x'.repeat(43))).statusCode, 403);
    assert.equal((await vt().tek<{ sayi: number }>('SELECT count(*)::int AS sayi FROM giris_denemesi'))!.sayi, once);

    const cevap = await kartGiris(` ${kisi.kart} `, PIN);
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.equal(cevap.json().kullanici.id, kisi.id);
    const oturum = await saatli.inject({ method: 'GET', url: '/api/oturum', headers: { cookie: cerezAl(cevap) } });
    assert.equal(oturum.json().kullanici.id, kisi.id);
  });

  test('kart tek başına yetmez: yanlış PIN ile kayıtsız kart aynı cevabı alır; kart ve PIN denetim kaydına girmez', async () => {
    const kisi = await kartliOperator();
    const yanlis = await kartGiris(kisi.kart, '111111');
    ilerle(120);
    const kayitsiz = await kartGiris('99999999', PIN);
    assert.equal(yanlis.statusCode, 401);
    assert.equal(kayitsiz.statusCode, 401);
    assert.equal(yanlis.json().mesaj, kayitsiz.json().mesaj);
    const metin = (await vt().tek<{ metin: string | null }>(
      "SELECT string_agg(govde::text, ' ') AS metin FROM denetim_kaydi WHERE yol = '/oturum/kart-giris'"))!.metin ?? '';
    assert.doesNotMatch(metin, new RegExp(`${kisi.kart}|111111|99999999`));
  });

  test('kart ve kullanıcı adı yolu tek sayaçtır: kartla art arda hatalı PIN hesabı kilitler, doğru PIN de geçmez', async () => {
    const kisi = await kartliOperator();
    for (let i = 0; i < HESAP_KILIDI_ESIGI; i += 1) {
      assert.equal((await kartGiris(kisi.kart, '111111', istasyon, `10.8.1.${String(i + 1)}`)).statusCode, 401);
      ilerle(120);
    }
    assert.equal((await kartGiris(kisi.kart, PIN, istasyon, '10.8.2.1')).statusCode, 401);
    const adla = await saatli.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: kisi.ad, pin: PIN }, remoteAddress: '10.8.2.2' });
    assert.equal(adla.statusCode, 401);
    assert.match(adla.json().mesaj, /Çok sayıda hatalı deneme/);
  });

  test('ilk PIN\'ini belirlememiş kişi, parolayla giren yönetici ve kartı kaldırılan kişi kartla giremez', async () => {
    const gecici = await kartliOperator(false);
    const c = await kartGiris(gecici.kart, GECICI);
    assert.equal(c.statusCode, 401);
    assert.match(c.json().mesaj, /İlk PIN/);

    ilerle(120);
    assert.equal((await yonetici('/nizamiye/personel-kartlari', { kisiId: yoneticiId, kartNo: 'ABCDEF01' })).statusCode, 200);
    assert.equal((await kartGiris('ABCDEF01', PAROLA, istasyon, '10.8.3.1')).statusCode, 401);

    const kisi = await kartliOperator();
    const kart = (await app.inject({ method: 'GET', url: '/api/nizamiye/personel-kartlari', headers: { cookie: yoneticiCerezi } }))
      .json().kartlar.find((k: { kisiId: number }) => k.kisiId === kisi.id) as { id: number; surum: number };
    assert.equal((await yonetici(`/nizamiye/personel-kartlari/${kart.id}/kaldir`, { surum: kart.surum })).statusCode, 200);
    assert.equal((await kartGiris(kisi.kart, PIN, istasyon, '10.8.3.2')).statusCode, 401);
  });
});
