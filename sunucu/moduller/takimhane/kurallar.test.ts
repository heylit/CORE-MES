import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { aktarimOnizle, aparatAyirmalari, aparatUyumu, type AparatIstegi, bosDagilim, dagilimToplami, dagilimaEkle, konumGrubu, stokDurumu, takimKoduMu } from './kurallar.ts';

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

  describe('aparat ayırma (3651)', () => {
    const saat = (g: number): number => Date.UTC(2026, 10, 26, g);
    const istek = (emirId: number, adet: number, bas: number | null, bit: number | null, o: Partial<AparatIstegi> = {}): AparatIstegi =>
      ({ emirId, kartId: 1, adet, baslangic: bas === null ? null : saat(bas), bitis: bit === null ? null : saat(bit), disarida: 0, yolda: 0, disaridaYeri: null, ...o });

    test('pencereleri örtüşen iki emir rafı paylaşır; sonra başlayan eksik kalır', () => {
      const r = aparatAyirmalari([istek(1, 2, 8, 14), istek(2, 2, 10, 16)], new Map([[1, 3]]));
      assert.deepEqual(r.map((x) => [x.durum, x.ayrilan, x.eksik]), [['ayrildi', 2, 0], ['eksik', 1, 1]]);
    });

    test('zamanda ayrık iki emir aynı adedi yeniden kullanır, birbirini eksik göstermez', () => {
      const r = aparatAyirmalari([istek(1, 3, 8, 12), istek(2, 3, 12, 18)], new Map([[1, 3]]));
      assert.deepEqual(r.map((x) => x.durum), ['ayrildi', 'ayrildi']);
    });

    test('plan yerleştirmemiş istek ayırma sayılmaz ve rafı tutmaz', () => {
      const r = aparatAyirmalari([istek(1, 2, null, null), istek(2, 3, 8, 12)], new Map([[1, 3]]));
      assert.deepEqual(r.map((x) => [x.durum, x.ayrilan]), [['plan-bekliyor', 0], ['ayrildi', 3]]);
    });

    test('çıkmış adet raftan düşmüştür: tamamı çıkmışsa durum yeridir, kısmen çıkmışsa kalan ayrılır', () => {
      const r = aparatAyirmalari([
        istek(1, 2, 8, 12, { disarida: 2, disaridaYeri: 'kisi' }), istek(2, 2, 8, 12, { disarida: 1, disaridaYeri: 'istasyon' }), istek(3, 1, 9, 11, { disarida: 1, disaridaYeri: 'istasyon' }),
      ], new Map([[1, 1]]));
      assert.deepEqual(r.map((x) => [x.durum, x.ayrilan, x.eksik]), [['kisi', 0, 0], ['ayrildi', 1, 0], ['tezgahta', 0, 0]]);
    });

    test('rafta hiç yoksa eksik; yolda olan çıkış kalanı karşılıyorsa durum yolda', () => {
      assert.deepEqual(aparatAyirmalari([istek(1, 2, 8, 12)], new Map()).map((x) => [x.durum, x.eksik]), [['eksik', 2]]);
      assert.equal(aparatAyirmalari([istek(1, 2, 8, 12, { yolda: 2 })], new Map([[1, 2]]))[0]!.durum, 'yolda');
    });

    test('plan kapasitesi stoğu aşarsa işaretlenir; bakımdaki ayrıca not edilir', () => {
      assert.deepEqual([aparatUyumu(4, 3, 0), aparatUyumu(1, 1, 1), aparatUyumu(2, 5, 0)], ['plan-fazla', 'bakimda', 'uyumlu']);
    });
  });
});
