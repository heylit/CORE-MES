import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cm1Coz } from '#paylasilan/etiket-kodu.ts';
import { kodTuru } from '#paylasilan/kod-sozlugu.ts';
import { KOD_MODUL_EN_AZ_MM, KOD_MODUL_UYARI_MM, kodModulu, sablonHatalari, yerlesim } from './kurallar.ts';
import { basimKodu, cm1Sigdir, cm1Yaz, kodMetni, kodUstSiniri } from './kod-yaz.ts';
import { kodMatrisi } from './kod-matrisi.ts';
import { HAZIR_SABLONLAR, ORNEK_DEGERLER } from './sablonlar.ts';

// Sabit basım günü (tesis günü 19.10.2026).
const B = new Date('2026-10-18T22:30:00.000Z');

describe('kod-yaz: özet kodun (CM1) yazılışı', () => {
  test('kimlik ilk, basım tarihi son alandır; değeri olmayan alan yazılmaz', () => {
    const k = cm1Yaz({ anahtar: 'LOT', deger: 'L-0001' }, { MLZ: 'ORN-0001', MIK: null, SKT: '' }, B);
    assert.equal(k.startsWith('CM1/LOT:L-0001/'), true);
    assert.equal(k.endsWith('/BT:261019'), true);
    assert.equal(k.includes('MIK:'), false);
    assert.equal(k.includes('SKT:'), false);
  });

  test('yazılan kod okunur ve kimliği korur; Türkçe harf ASCII büyük harfe döner, ayraç karakteri tire olur', () => {
    assert.equal(kodMetni('şişe/kapak:ığ'), 'SISE-KAPAK-IG');
    const k = cm1Yaz({ anahtar: 'LOT', deger: 'ORN 1/2' }, {}, B);
    const o = cm1Coz(k);
    assert.ok(o);
    assert.equal(o.kimlik.anahtar, 'LOT');
    assert.equal(o.kimlik.deger, 'ORN1-2');
    assert.equal(kodTuru(k) !== null, true);
    assert.equal(basimKodu(B), '261019');
  });

  test('sığdırma: üst sınır içinde kalır, kimlik ve BT düşmez, düşen alan sayısı "+N" ile yazılır', () => {
    const sira = ['LOT', 'MLZ', 'MIK', 'KPY', 'SKT'];
    const uzun = cm1Yaz({ anahtar: 'LOT', deger: 'ORN-LOT-000123' }, { MLZ: 'ORN-MALZEME-0001-UZUN-AD', MIK: '12345 ADET', KPY: 'ORN-KAPI-A-01', SKT: '301231' }, B, sira);
    const s = cm1Sigdir(uzun, 26);
    assert.ok(s.n <= 26 || s.eksik.length > 0, `${s.n}`);
    assert.ok(s.metin.startsWith('CM1/LOT:ORN-LOT-000123'));
    assert.ok(s.metin.includes('/BT:261019'));
    const bol = cm1Sigdir('CM1/LOT:ORN-1/BT:261019', 26);
    assert.deepEqual(bol.eksik, []);
    assert.equal(bol.metin, 'CM1/LOT:ORN-1/BT:261019');
  });

  test('üst sınır etiket boyuna göre artar', () => {
    assert.ok(kodUstSiniri(50, 25) < kodUstSiniri(100, 50));
    assert.ok(kodUstSiniri(100, 50) <= kodUstSiniri(100, 100));
  });

  test('basılan matris kare ve sıfırdan büyük; QR ayrı simgedir', () => {
    const dm = kodMatrisi('CM1/LOT:ORN-1/BT:261019', 'dm');
    assert.equal(dm.length, dm[0]?.length);
    const qr = kodMatrisi('CM1/LOT:ORN-1/BT:261019', 'qr');
    assert.equal(qr.length, qr[0]?.length);
    assert.notEqual(dm.length, qr.length);
  });
});

describe('yerlesimler: üretilen her yerleşim', () => {
  const uretilen = HAZIR_SABLONLAR.filter((s) => s.yerlesim !== 'serit');

  test('yerleşim varyantları var ve anahtarı geçerli, tabanı bir şerit şablondur', () => {
    assert.ok(uretilen.length > 0);
    const serit = new Set(HAZIR_SABLONLAR.filter((s) => s.yerlesim === 'serit').map((s) => s.anahtar));
    for (const s of uretilen) {
      assert.match(s.anahtar, /^[a-z0-9-]{1,40}$/, s.anahtar);
      assert.ok(s.taban !== undefined && serit.has(s.taban), s.anahtar);
      assert.equal(s.anahtar, `${s.taban}-${s.yerlesim}`);
    }
    assert.equal(new Set(HAZIR_SABLONLAR.map((s) => s.anahtar)).size, HAZIR_SABLONLAR.length);
  });

  test('şablon denetiminden temiz geçer; örnek değerle yazı kesilmez, kod modülü okunur sınırın altına inmez', () => {
    for (const s of uretilen) {
      assert.deepEqual(sablonHatalari(s), [], s.anahtar);
      const ogeler = yerlesim(s, ORNEK_DEGERLER[s.tur], false);
      for (const o of ogeler) {
        if (o.tur === 'metin') assert.deepEqual(o.satirlar.filter((x) => x.endsWith('...')), [], s.anahtar);
        if (o.tur === 'kod') assert.ok(kodModulu(o) >= KOD_MODUL_EN_AZ_MM - 1e-9, `${s.anahtar} modül ${kodModulu(o)}`);
      }
      assert.ok(ogeler.some((o) => o.tur === 'kod'), s.anahtar);
      for (const o of s.ogeler) {
        if (o.tur !== 'metin') continue;
        assert.ok(o.yaziMm >= (o.alan === 'kodBaslik' ? 3 : 1.8) - 1e-9, `${s.anahtar} ${o.alan} ${o.yaziMm}`);
      }
    }
  });

  test('0,375 mm altındaki modül uyarı sınırıdır, 0,25 mm altı engel sınırıdır', () => {
    assert.equal(KOD_MODUL_EN_AZ_MM, 0.25);
    assert.equal(KOD_MODUL_UYARI_MM, 0.375);
  });
});
