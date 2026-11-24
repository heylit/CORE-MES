import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { aktarimOnizle, bosDagilim, dagilimToplami, dagilimaEkle, konumGrubu, stokDurumu, takimKoduMu } from './kurallar.ts';

describe('takimhane kuralları (saf)', () => {
  test('sipariş noktası yoksa durum uydurulmaz: yalnız sıfır bilinir, kalan eşiksiz', () => {
    assert.equal(stokDurumu(0, null), 'sifir');
    assert.equal(stokDurumu(3, null), 'esiksiz');
    assert.equal(stokDurumu(3, 3), 'kritik');
    assert.equal(stokDurumu(4, 3), 'yeterli');
    assert.equal(stokDurumu(0, 3), 'sifir');
  });

  test('konum türü gruba döner; hurda ve yolda gruba girmez; boş dağılım null, toplam sıfır uydurmaz', () => {
    assert.deepEqual(['raf_gozu', 'istasyon', 'kisi', 'fason', 'ara_alan', 'hurda', 'yolda'].map(konumGrubu), ['raf', 'tezgah', 'kisi', 'bileme', 'ara', null, null]);
    const d = bosDagilim();
    assert.equal(d.raf, null);
    dagilimaEkle(d, 'raf', 4); dagilimaEkle(d, 'raf', 1); dagilimaEkle(d, 'kisi', 2);
    assert.deepEqual([d.raf, d.kisi, d.tezgah, dagilimToplami(d)], [5, 2, null, 7]);
  });

  test('takım kartı TKM koduyla tanınır', () => {
    assert.equal(takimKoduMu('TKM-000012'), true);
    assert.equal(takimKoduMu(' tkm-1'), true);
    assert.equal(takimKoduMu('CNC-TKM-1'), false);
  });

  test('başlangıç ön izlemesi: yinelenen kod toplanmaz, kategorisiz yazmayı engeller, boşluk engellemez', () => {
    const o = aktarimOnizle([
      { kod: 'A-1', ad: 'x', kategori: 'K', adet: 1, rafKodu: null },
      { kod: 'a-1', ad: 'y', kategori: 'K', adet: 1, rafKodu: null },
    ]);
    assert.equal(o.uygun, false);
    assert.deepEqual(o.satirlar.map((s) => s.bulgu), ['yinelenen-kod', 'yinelenen-kod']);
    const b = aktarimOnizle([{ kod: ' B-1 ', ad: 'z', kategori: 'K', adet: 1, rafKodu: null }]);
    assert.equal(b.uygun, true);
    assert.equal(b.satirlar[0]?.bulgu, 'bosluk');
    assert.equal(b.satirlar[0]?.kod, 'B-1');
    assert.equal(aktarimOnizle([{ kod: 'C', ad: 'z', kategori: '  ', adet: 1, rafKodu: null }]).uygun, false);
  });
});
