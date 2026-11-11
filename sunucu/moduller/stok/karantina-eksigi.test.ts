import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { GKK_KARANTINA_KONUMU_YOK, KARANTINA_KONUMU_YOK, karantinaEksigi, karantinaYokIletisi } from './kurallar.ts';
import type { HaritaAlani, HaritaDeposu, HaritaKonumu } from './kurallar.ts';

// 2884: mal kabul karantina konumu bulamayınca ileti nedeni ayırır; haritada alan yoksa bugünkü ileti kalır.
const alan = (id: number, salonId: number, tur = 'karantina'): HaritaAlani => ({ id, salonId, tur, ad: `Deneme alan ${id}` });
const depo = (id: number, kod: string, salonId: number | null, aktif = true): HaritaDeposu => ({ id, kod, salonId, aktif });
const konum = (alanId: number, x: Partial<HaritaKonumu> = {}): HaritaKonumu => ({
  id: 100 + alanId, kod: `ALAN-${alanId}`, tur: 'karantina', depoId: 1, aktif: true, rafId: null, gozId: null, alanId, satirSayisi: 0, ...x,
});
const ANA = depo(1, 'ANA', null);

describe('karantina konumu eksiğinin nedeni (2884)', () => {
  test('haritada karantina alanı yok: bugünkü ileti aynen', () => {
    const n = karantinaEksigi({ alanlar: [alan(1, 5, 'bolge')], depolar: [ANA], konumlar: [] });
    assert.equal(n, 'haritada_yok');
    assert.equal(karantinaYokIletisi(n, 'gkk'), GKK_KARANTINA_KONUMU_YOK);
    assert.equal(karantinaYokIletisi(n, 'fason'), KARANTINA_KONUMU_YOK);
  });

  test('alan var, konum yok ya da pasif: eşleme gerekir; ileti haritaya alan eklemeyi söylemez', () => {
    for (const konumlar of [[], [konum(1, { aktif: false })]]) {
      const n = karantinaEksigi({ alanlar: [alan(1, 5)], depolar: [depo(2, 'DP1', 5)], konumlar });
      assert.equal(n, 'eslenmemis');
      const m = karantinaYokIletisi(n, 'gkk');
      assert.match(m, /^Karantina alanı haritada var ama stok konumu değil; giriş kalite kontrolü için Stok > Ayarlar'da "Haritadan eşle"/);
      assert.doesNotMatch(m, /alanı ekleyin/);
    }
    assert.match(karantinaYokIletisi('eslenmemis', 'fason'), /fason dönüşü için/);
  });

  test('bölüm deposuz alan ANA depoya bağlanır; ANA da yoksa (ya da pasifse) neden deposuz', () => {
    assert.equal(karantinaEksigi({ alanlar: [alan(1, 5)], depolar: [ANA], konumlar: [] }), 'eslenmemis');
    for (const depolar of [[], [depo(1, 'ANA', null, false)], [depo(2, 'DP1', 5, false)], [depo(3, 'DP9', 9)]]) {
      assert.equal(karantinaEksigi({ alanlar: [alan(1, 5)], depolar, konumlar: [] }), 'deposuz');
    }
    assert.match(karantinaYokIletisi('deposuz', 'gkk'), /stok deposu değil ve ANA depo yok/);
  });

  test('konum stoklu ve türü başka: eşleme türü değiştirmez, stok taşınmalı; bir alan çözülebiliyorsa eşleme yeter', () => {
    const takili = konum(1, { tur: 'bolge', satirSayisi: 2 });
    assert.equal(karantinaEksigi({ alanlar: [alan(1, 5)], depolar: [ANA], konumlar: [takili] }), 'stoklu_tur');
    assert.equal(karantinaEksigi({ alanlar: [alan(1, 5)], depolar: [ANA], konumlar: [{ ...takili, satirSayisi: 0 }] }), 'eslenmemis');
    assert.equal(karantinaEksigi({ alanlar: [alan(1, 5), alan(2, 5)], depolar: [ANA], konumlar: [takili] }), 'eslenmemis');
    assert.match(karantinaYokIletisi('stoklu_tur', 'fason'), /stoğu taşıyın/);
  });
});
