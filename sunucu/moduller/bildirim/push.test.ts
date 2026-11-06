import assert from 'node:assert/strict';
import { createECDH, createPublicKey, verify } from 'node:crypto';
import { describe, test } from 'node:test';
import { izinliUcNoktaMi, pushAyariOku, sinyalGonder, vapidBasligi } from './push.ts';
import type { Getir } from './push.ts';

// ADR 0031: Web Push yalnız izin listesine, gövdesiz, VAPID imzalı sinyal atar; kapalıyken hiç ayar yoktur.
const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const OZEL = ecdh.getPrivateKey().toString('base64url');
const ACIK = ecdh.getPublicKey().toString('base64url');
const ACIK_ORTAM = { TMIV2_PUSH_ACIK: '1', TMIV2_PUSH_VAPID_OZEL: OZEL, TMIV2_PUSH_KONU: 'mailto:yonetici@ornek.invalid' };
const UC = 'https://fcm.googleapis.com/fcm/send/deneme-abonelik';

describe('Web Push ayarı', () => {
  test('TMIV2_PUSH_ACIK=1 yoksa kapalı (null); anahtar verilmiş olsa da', () => {
    assert.equal(pushAyariOku({}), null);
    assert.equal(pushAyariOku({ ...ACIK_ORTAM, TMIV2_PUSH_ACIK: '0' }), null);
    assert.equal(pushAyariOku({ ...ACIK_ORTAM, TMIV2_PUSH_ACIK: undefined }), null);
  });

  test('açıkken anahtardan açık anahtar türetilir', () => {
    const a = pushAyariOku(ACIK_ORTAM);
    assert.ok(a);
    assert.equal(a.acikAnahtar, ACIK);
    assert.equal(a.konu, 'mailto:yonetici@ornek.invalid');
  });

  test('açık ama eksik ya da geçersiz değer açılışı durdurur; ileti değeri söylemez', () => {
    assert.throws(() => pushAyariOku({ ...ACIK_ORTAM, TMIV2_PUSH_VAPID_OZEL: '' }), /TMIV2_PUSH_VAPID_OZEL/);
    assert.throws(() => pushAyariOku({ ...ACIK_ORTAM, TMIV2_PUSH_VAPID_OZEL: 'kisa' }), (h: Error) => /TMIV2_PUSH_VAPID_OZEL/.test(h.message) && !h.message.includes('kisa'));
    assert.throws(() => pushAyariOku({ ...ACIK_ORTAM, TMIV2_PUSH_KONU: '' }), /TMIV2_PUSH_KONU/);
    assert.throws(() => pushAyariOku({ ...ACIK_ORTAM, TMIV2_PUSH_KONU: 'http://ornek.invalid' }), /TMIV2_PUSH_KONU/);
  });
});

describe('izin listesi', () => {
  test('yalnız yayımlanmış push servisleri, https ve varsayılan kapı', () => {
    for (const adres of [
      UC, 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/abc', 'https://wns2-ornek.notify.windows.com/w/?token=x',
    ]) assert.equal(izinliUcNoktaMi(adres), true, adres);
    for (const adres of [
      'http://fcm.googleapis.com/fcm/send/x', 'https://fcm.googleapis.com:8443/x', 'https://ornek.invalid/x', 'https://fcm.googleapis.com.ornek.invalid/x',
      'https://kotupush.apple.com.ornek.invalid/x', 'https://push.apple.com/x', 'https://notify.windows.com/x', 'https://kisi:parola@fcm.googleapis.com/x',
      'adres-degil', '',
    ]) assert.equal(izinliUcNoktaMi(adres), false, adres);
  });
});

describe('sinyal', () => {
  const ayar = pushAyariOku(ACIK_ORTAM);
  assert.ok(ayar);
  const simdi = new Date('2026-11-06T12:00:00Z');

  test('VAPID başlığı hedef kökene bağlı, ES256 imzalı ve açık anahtarla doğrulanır', () => {
    const b = vapidBasligi(ayar, UC, simdi);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(b);
    assert.ok(m);
    const [, bas = '', yuk = '', imza = '', k = ''] = m;
    assert.equal(k, ACIK);
    const govde = JSON.parse(Buffer.from(yuk, 'base64url').toString()) as { aud: string; exp: number; sub: string };
    assert.deepEqual(govde, { aud: 'https://fcm.googleapis.com', exp: Math.floor(simdi.getTime() / 1000) + 12 * 3600, sub: 'mailto:yonetici@ornek.invalid' });
    const acik = Buffer.from(ACIK, 'base64url');
    const anahtar = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: acik.subarray(1, 33).toString('base64url'), y: acik.subarray(33).toString('base64url') }, format: 'jwk' });
    assert.equal(verify('sha256', Buffer.from(`${bas}.${yuk}`), { key: anahtar, dsaEncoding: 'ieee-p1363' }, Buffer.from(imza, 'base64url')), true);
  });

  test('istek gövdesizdir ve içerik taşımaz; 201 tamam, 404/410 abonelik bitti, diğerleri hata', async () => {
    const istekler: { adres: string; ayar: Parameters<Getir>[1] }[] = [];
    let durum = 201;
    const getir: Getir = async (adres, a) => { istekler.push({ adres, ayar: a }); return { status: durum }; };
    assert.equal(await sinyalGonder(ayar, UC, getir, simdi), 'tamam');
    const ilk = istekler[0];
    assert.ok(ilk);
    assert.equal(ilk.adres, UC);
    assert.equal(ilk.ayar.method, 'POST');
    assert.equal('body' in ilk.ayar, false);
    assert.deepEqual(Object.keys(ilk.ayar.headers).sort(), ['Authorization', 'TTL', 'Urgency']);
    durum = 410;
    assert.equal(await sinyalGonder(ayar, UC, getir, simdi), 'abonelik-bitti');
    durum = 404;
    assert.equal(await sinyalGonder(ayar, UC, getir, simdi), 'abonelik-bitti');
    durum = 500;
    assert.equal(await sinyalGonder(ayar, UC, getir, simdi), 'hata');
  });

  test('ağ hatası ya da zaman aşımı hata döner, atmaz; liste dışı adrese istek atılmaz', async () => {
    assert.equal(await sinyalGonder(ayar, UC, () => Promise.reject(new Error('zaman aşımı')), simdi), 'hata');
    let cagrildi = false;
    assert.equal(await sinyalGonder(ayar, 'https://ornek.invalid/x', async () => { cagrildi = true; return { status: 201 }; }, simdi), 'hata');
    assert.equal(cagrildi, false);
  });
});
