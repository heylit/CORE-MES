import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { gorunus, renkImzasi, renklendirPiksel, RENK_SURUMU, type RenkAyari } from './pdf-renk.ts';

// ADR 0032: tablet ve sunucunun ortak renklendirmesi. Pikseller uydurmadır.
const AYAR: RenkAyari = { koyu: false, look: 'net', bold: 0, lo: false, renk: [0x14, 0x17, 0x1c] };

function tek(r: number, g: number, b: number, a: Partial<RenkAyari> = {}): number[] {
  const hedef = new Uint8ClampedArray(4);
  renklendirPiksel(new Uint8ClampedArray([r, g, b, 255]), 1, 1, hedef, { ...AYAR, ...a });
  return [...hedef];
}

describe('PDF renklendirme (paylaşılan)', () => {
  test('imza sürümle başlar ve her alanı taşır; alanlardan biri değişince imza değişir', () => {
    const imza = renkImzasi(AYAR);
    assert.equal(imza, `${RENK_SURUMU}.a.net.b0.hi.14171c`);
    const degisenler: Partial<RenkAyari>[] = [{ koyu: true }, { look: 'blue' }, { bold: 2 }, { lo: true }, { renk: [0x14, 0x17, 0x1d] }];
    for (const d of degisenler) assert.notEqual(renkImzasi({ ...AYAR, ...d }), imza, JSON.stringify(d));
    assert.equal(renkImzasi({ ...AYAR, bold: Number.NaN }), `${RENK_SURUMU}.a.net.b1.hi.14171c`);
  });

  test('görünüş: yalnız blue ve orig korunur, gerisi net', () => {
    assert.deepEqual([gorunus('blue'), gorunus('orig'), gorunus('net'), gorunus(undefined), gorunus('x')], ['blue', 'orig', 'net', 'net', 'net']);
  });

  test('beyaz zemin saydam olur, siyah çizgi mürekkep rengine tam örtülü döner', () => {
    assert.deepEqual(tek(255, 255, 255), [0, 0, 0, 0]);
    assert.deepEqual(tek(0, 0, 0), [0x14, 0x17, 0x1c, 255]);
  });

  test('net görünüşte kırmızı eksen çizgisi renkli kalır, mavi çizgi mürekkebe döner; blue görünüşte renkli çizgi korunur', () => {
    const kirmizi = tek(220, 30, 30);
    assert.deepEqual(kirmizi.slice(0, 3), [220, 30, 30]);
    assert.deepEqual(tek(30, 30, 220).slice(0, 3), [0x14, 0x17, 0x1c]);
    assert.deepEqual(tek(30, 30, 220, { look: 'blue' }).slice(0, 3), [30, 30, 220]);
    // Koyu temada renkli çizgi açılır (koyu zeminde okunsun).
    assert.ok(tek(220, 30, 30, { koyu: true })[1]! > 30);
  });

  test('orig görünüşte pikseller aynen kopyalanır', () => {
    assert.deepEqual(tek(10, 200, 30, { look: 'orig' }), [10, 200, 30, 255]);
  });

  test('kalınlaştırma ince çizgiyi komşu piksele yayar; lo görüntüde bir kademe az uygulanır', () => {
    const W = 5, H = 3, kaynak = new Uint8ClampedArray(W * H * 4).fill(255);
    const o = 4 * (1 * W + 2);
    kaynak[o] = 0; kaynak[o + 1] = 0; kaynak[o + 2] = 0;
    const alfa = (a: Partial<RenkAyari>): number => {
      const hedef = new Uint8ClampedArray(kaynak.length);
      renklendirPiksel(kaynak, W, H, hedef, { ...AYAR, ...a });
      return hedef[4 * (1 * W + 1) + 3]!;
    };
    assert.equal(alfa({ bold: 0 }), 0);
    assert.ok(alfa({ bold: 1 }) > 200);
    assert.equal(alfa({ bold: 1, lo: true }), 0);
  });
});
