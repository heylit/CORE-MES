import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ara, aramaDiziniKur, konumCoz, sadelestir } from './arama.ts';
import type { AramaVerisi } from './arama.ts';

// Uydurma arama verisi (gerçek yer adı değildir).
const VERI: AramaVerisi = {
  bbox: [32.7, 39.9, 32.86, 40.02], q: 100000, cats: ['Semt', 'Cadde', 'İşyeri'], ctx: ['Deneme Semti', 'Örnek Semti'],
  items: [
    ['Deneme Semti', 2000, 3000, 0, -1],
    ['Çınar Caddesi', 1000, 1000, 1, 0],
    ['Çınar Caddesi', 9000, 9000, 1, 1],
    ['Işık Sokağı', 5000, 5000, 1, 0],
    ['Örnek Atölye', 4000, 2000, 2, 1],
  ],
};
const dizin = aramaDiziniKur(VERI);
const NOKTALAR = [{ id: 3, ad: 'Ana Depo', adres: 'Çınar Caddesi', boylam: 32.71, enlem: 39.91 }];

test('Türkçe harf ve büyük/küçük harf duyarsızdır', () => {
  assert.equal(sadelestir('IŞIK Sokağı'), 'isik sokagi');
  assert.equal(sadelestir('ÇINAR'), 'cinar');
  assert.deepEqual(ara(dizin, [], 'isik').map((s) => s.ad), ['Işık Sokağı']);
});

test('kayıtlı nokta önce gelir; ad ve adres kelimeleriyle bulunur', () => {
  const s = ara(dizin, NOKTALAR, 'cinar');
  assert.equal(s[0]!.tur, 'nokta');
  assert.equal(s[0]!.noktaId, 3);
});

test('aynı adlı yerler bağlamıyla ayrılır; bağlam kelimesi aramayı daraltır', () => {
  assert.equal(ara(dizin, [], 'cinar').length, 2);
  const s = ara(dizin, [], 'cinar ornek');
  assert.equal(s.length, 1);
  assert.equal(s[0]!.baglam, 'Örnek Semti');
  assert.ok(Math.abs(s[0]!.boylam - 32.79) < 1e-9 && Math.abs(s[0]!.enlem - 39.99) < 1e-9);
});

test('sonuç sayısı sınırlıdır; boş metin sonuç vermez', () => {
  assert.equal(ara(dizin, [], 'c', 1).length, 1);
  assert.deepEqual(ara(dizin, NOKTALAR, '   '), []);
});

test('koordinat ve harita bağlantısından konum çözülür; kısa bağlantı ağa çıkmadan çözülemez', () => {
  assert.deepEqual(konumCoz('39.95, 32.80'), { enlem: 39.95, boylam: 32.8 });
  assert.deepEqual(konumCoz('32.80, 39.95', VERI.bbox), { enlem: 39.95, boylam: 32.8 }, 'sıra harita sınırıyla çözülür');
  assert.deepEqual(konumCoz('32.80, 39.95'), { enlem: 32.8, boylam: 39.95 }, 'sınır yoksa enlem önce');
  assert.deepEqual(konumCoz('https://www.google.com/maps/place/x/@39.95,32.8,17z'), { enlem: 39.95, boylam: 32.8 });
  assert.deepEqual(konumCoz('https://yandex.com.tr/harita/?ll=32.8%2C39.95&z=16'), { enlem: 39.95, boylam: 32.8 });
  assert.equal(konumCoz('https://maps.app.goo.gl/abc'), 'kisa');
  assert.equal(konumCoz('rastgele metin'), null);
  assert.equal(ara(dizin, [], '39.95, 32.80')[0]!.tur, 'koordinat');
  assert.equal(ara(null, [], '32.80, 39.95', 8, VERI.bbox)[0]!.enlem, 39.95);
});

test('arama verisi yoksa yalnız kayıtlı noktalar aranır', () => {
  assert.deepEqual(ara(null, NOKTALAR, 'depo').map((s) => s.ad), ['Ana Depo']);
  assert.deepEqual(ara(null, NOKTALAR, 'isik'), []);
});
