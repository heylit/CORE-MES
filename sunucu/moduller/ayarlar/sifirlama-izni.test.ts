import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import {
  SIFIRLAMA_ACIK_ANAHTARI, SIFIRLAMA_IZIN_SURESI_MS, SIFIRLAMA_PARMAK_IZI, imzaGecerliMi, izniCoz, parmakIzi, sifirlamaIstekMetni, yeniSifirlamaIstegi,
} from './sifirlama-izni.ts';

// 3728: imzalı sıfırlama izni. Anahtarlar test içinde üretilir; kurulum kimliği uydurmadır.
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const acik = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const izin = (metin: string) => ({ istek: Buffer.from(metin).toString('base64'), imza: sign(null, Buffer.from(metin), privateKey).toString('base64') });

test('koddaki açık anahtar Ed25519 ve parmak izi yazılanla aynı', () => {
  assert.notEqual(SIFIRLAMA_ACIK_ANAHTARI, null);
  assert.equal(parmakIzi(SIFIRLAMA_ACIK_ANAHTARI!), SIFIRLAMA_PARMAK_IZI);
});

test('istek bir saat geçerli, sayısı her seferinde farklı; metin alan sırası sabit', () => {
  const simdi = new Date('2026-11-26T06:00:00Z');
  const a = yeniSifirlamaIstegi('00000000-0000-4000-8000-000000000001', 'test', simdi);
  const b = yeniSifirlamaIstegi('00000000-0000-4000-8000-000000000001', 'test', simdi);
  assert.notEqual(a.sayi, b.sayi);
  assert.equal(Date.parse(a.son) - simdi.getTime(), SIFIRLAMA_IZIN_SURESI_MS);
  assert.equal(Object.keys(JSON.parse(sifirlamaIstekMetni(a)) as object).join(','), 'tur,surum,kurulum,ortam,sayi,son');
});

test('doğru imza geçer; değişen metin, başka anahtar ve bozuk izin geçmez', () => {
  const metin = sifirlamaIstekMetni(yeniSifirlamaIstegi('00000000-0000-4000-8000-000000000001', 'canli', new Date()));
  const c = izniCoz(izin(metin));
  assert.ok(c);
  assert.equal(c.metin, metin);
  assert.equal(imzaGecerliMi(c.metin, c.imza, acik), true);
  assert.equal(imzaGecerliMi(metin.replace('canli', 'test'), c.imza, acik), false);
  assert.equal(imzaGecerliMi(metin, c.imza, SIFIRLAMA_ACIK_ANAHTARI!), false, 'başka anahtar');
  assert.equal(imzaGecerliMi(metin, c.imza, 'bozuk'), false);
  assert.equal(izniCoz({ istek: Buffer.from('{}').toString('base64'), imza: c.imza.toString('base64') }), null);
  assert.equal(izniCoz({ istek: Buffer.from('bozuk').toString('base64'), imza: c.imza.toString('base64') }), null);
  assert.equal(izniCoz({ istek: Buffer.from(metin).toString('base64'), imza: 'AAAA' }), null);
});
