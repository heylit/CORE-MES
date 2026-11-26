import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ayniParcaRevizyonuMu, kartinYeniParcaRevizyonu, PARCA_REVIZYONU_KAPALI, PARCA_REVIZYONU_SABIT, parcaRevizyonuMetni, parcaRevizyonuSecimIhlali,
  rotaCizimFarkiUyarisi, rotaninCizimRevizyonu, varsayilanParcaRevizyonu,
} from './kurallar.ts';
import type { ParcaRevizyonuSecenegi } from './kurallar.ts';

const r00: ParcaRevizyonuSecenegi = { revizyonId: 10, durum: 'eski', revKodu: '00', yayinlandi: '2026-10-02T08:00:00Z' };
const r01: ParcaRevizyonuSecenegi = { revizyonId: 11, durum: 'yayinda', revKodu: 'R01', yayinlandi: '2026-11-20T08:00:00Z' };

describe('parça revizyonu kuralları (3755)', () => {
  test('tek gösterim kuralı: baştaki R ya da Rev atılır, R00 ile 00 aynıdır', () => {
    assert.equal(parcaRevizyonuMetni('R00'), '00');
    assert.equal(parcaRevizyonuMetni(' Rev. 01 '), '01');
    assert.equal(parcaRevizyonuMetni('00'), '00');
    assert.equal(parcaRevizyonuMetni('B'), 'B');
    assert.equal(parcaRevizyonuMetni('R'), 'R');
    assert.equal(parcaRevizyonuMetni('  '), null);
    assert.equal(parcaRevizyonuMetni(null), null);
    assert.equal(ayniParcaRevizyonuMu('R00', '00'), true);
    assert.equal(ayniParcaRevizyonuMu('R01', '00'), false);
    assert.equal(ayniParcaRevizyonuMu(null, '00'), false);
  });

  test('varsayılan yayındaki revizyondur; yayında yoksa null', () => {
    assert.equal(varsayilanParcaRevizyonu([r01, r00])?.revizyonId, 11);
    assert.equal(varsayilanParcaRevizyonu([r00]), null);
  });

  test('rotanın çizimi yürürlüğe alındığı anda yayında olan revizyondur', () => {
    assert.equal(rotaninCizimRevizyonu([r01, r00], '2026-11-01T00:00:00Z')?.revizyonId, 10);
    assert.equal(rotaninCizimRevizyonu([r01, r00], '2026-11-25T00:00:00Z')?.revizyonId, 11);
    assert.equal(rotaninCizimRevizyonu([r01, r00], '2026-09-01T00:00:00Z'), null);
    assert.equal(rotaninCizimRevizyonu([r01, r00], null), null);
  });

  test('rota çizimi seçilenden farklıysa uyarı, aynıysa ya da bilinmiyorsa yok', () => {
    assert.equal(rotaCizimFarkiUyarisi('B', r01, r00),
      'Rota B, Rev 01 çizimi yayındayken yürürlüğe alındı; seçilen Rev 00. Emir yine açılır; operasyonların Rev 00 çizimine uyduğunu kontrol edin.');
    assert.equal(rotaCizimFarkiUyarisi('B', r00, r00), null);
    assert.equal(rotaCizimFarkiUyarisi('B', null, r00), null);
  });

  test('seçim yalnız açık ve revizyonu boş emirde', () => {
    assert.equal(parcaRevizyonuSecimIhlali('planli', false, null), null);
    assert.equal(parcaRevizyonuSecimIhlali('basladi', false, null), null);
    assert.equal(parcaRevizyonuSecimIhlali('taslak', false, null), null);
    assert.equal(parcaRevizyonuSecimIhlali('bitti', false, null), PARCA_REVIZYONU_KAPALI);
    assert.equal(parcaRevizyonuSecimIhlali('iptal', false, null), PARCA_REVIZYONU_KAPALI);
    assert.equal(parcaRevizyonuSecimIhlali('planli', true, null), PARCA_REVIZYONU_KAPALI);
    assert.equal(parcaRevizyonuSecimIhlali('planli', false, 10), PARCA_REVIZYONU_SABIT);
  });

  test('kartta başka revizyon yayındaysa yeni revizyon kodu döner', () => {
    assert.equal(kartinYeniParcaRevizyonu(10, [r01, r00]), 'Rev 01');
    assert.equal(kartinYeniParcaRevizyonu(11, [r01, r00]), null);
    assert.equal(kartinYeniParcaRevizyonu(null, [r01, r00]), null);
  });
});
