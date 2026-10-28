import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANAHTAR_DEGISKENI, SERTIFIKA_DEGISKENI } from '../../istemci/src/ortak/pwa/https.ts';
import { IZLENEN_SERTIFIKA_DEGISKENI, httpsDurumuOku, izlenenSertifikaOku } from './https-durumu.ts';

// Yalnız bu test için üretilmiş, kendinden imzalı sertifika; anahtarı yoktur ve hiçbir yerde kullanılmaz.
const SERTIFIKA = `-----BEGIN CERTIFICATE-----
MIIBfzCCASWgAwIBAgIUPnOo/hwOdSsOuCVpsW1NY63vmuAwCgYIKoZIzj0EAwIw
FTETMBEGA1UEAwwKdG1pLWRlbmVtZTAeFw0yNjEwMjExNDU2MTdaFw0zNjEwMTgx
NDU2MTdaMBUxEzARBgNVBAMMCnRtaS1kZW5lbWUwWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAATZOQi4j1hRj2ypEnDtUjd1XesFzkPJQOch6sqrdvnopcplffPiAqty
mnR51NjmhrSNU6aCSymFg54Vr59RkO1po1MwUTAdBgNVHQ4EFgQUERNiLUcOsEzt
I5m8mh+ViDEEYB8wHwYDVR0jBBgwFoAUERNiLUcOsEztI5m8mh+ViDEEYB8wDwYD
VR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNIADBFAiEAz9l61dZ5QJrhfzcXAA+U
rQxZ2j8S1Q42n2U8Cqk98EICIGAsSRhLqv+DtTrHpJ1uATeAdXDJVr2e9xz3B+ht
Ysd2
-----END CERTIFICATE-----
`;
const IKISI = { [SERTIFIKA_DEGISKENI]: '/sertifika/tmi.crt', [ANAHTAR_DEGISKENI]: '/sertifika/tmi.key' };

test('HTTPS değişkenleri yoksa kapı düz HTTP, bitiş yok; dosya okunmaz', () => {
  const oku = (): Buffer => { throw new Error('okunmamalı'); };
  assert.deepEqual(httpsDurumuOku({}, oku), { acik: false, sertifikaBitis: null });
  assert.deepEqual(httpsDurumuOku({ [SERTIFIKA_DEGISKENI]: '  ', [ANAHTAR_DEGISKENI]: '/a.key' }, oku), { acik: false, sertifikaBitis: null });
});

test('sertifikanın bitişi dosyadaki sertifikadan okunur', () => {
  const okunan: string[] = [];
  const durum = httpsDurumuOku(IKISI, (yol) => { okunan.push(yol); return Buffer.from(SERTIFIKA); });
  assert.deepEqual(okunan, ['/sertifika/tmi.crt']);
  assert.equal(durum.acik, true);
  assert.equal(durum.sertifikaBitis?.toISOString(), '2036-10-18T14:56:17.000Z');
});

test('okunamayan ya da bozuk sertifikada HTTPS açık, bitiş bilinmiyor (uydurulmaz)', () => {
  assert.deepEqual(httpsDurumuOku(IKISI, () => { throw new Error('izin yok'); }), { acik: true, sertifikaBitis: null });
  assert.deepEqual(httpsDurumuOku(IKISI, () => Buffer.from('bozuk')), { acik: true, sertifikaBitis: null });
});

test('izlenen vekil sertifikası: değişken boşsa tanımlı değil; dosyadan bitiş okunur; bozuksa bilinmiyor', () => {
  const oku = (): Buffer => Buffer.from(SERTIFIKA);
  assert.deepEqual(izlenenSertifikaOku({ [IZLENEN_SERTIFIKA_DEGISKENI]: ' ' }, () => { throw new Error('okunmamalı'); }), { tanimli: false, bitis: null });
  assert.equal(izlenenSertifikaOku({ [IZLENEN_SERTIFIKA_DEGISKENI]: 'D:/vekil.cer' }, oku).bitis?.toISOString(), '2036-10-18T14:56:17.000Z');
  assert.deepEqual(izlenenSertifikaOku({ [IZLENEN_SERTIFIKA_DEGISKENI]: 'D:/vekil.cer' }, () => Buffer.from('bozuk')), { tanimli: true, bitis: null });
});
