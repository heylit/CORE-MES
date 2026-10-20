import { describe, expect, it } from 'vitest';
import type { YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import { bolumIcinde, bolumeCevir, fabrikaKutusu, fabrikayaCevir, ogeninBolumu } from './fabrika.ts';
import { dondur, fabrikaGovdesi, fabrikaTaslagiKur, tasi } from './duzenleyici-durumu.ts';
import { uygula, yerelle, yerlestir } from './kroki.ts';

const yakin = (a: { x: number; z: number }, b: { x: number; z: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.z).toBeCloseTo(b.z, 6);
};

const bolum = (id: number, fabrika: { x: string; z: string; donus: string }, g = '20.00', d = '10.00'): YerlesimCevabi => ({
  salon: {
    id, kod: `S${id}`, ad: `Deneme ${id}`, genislik: g, derinlik: d, hucreBoyu: '5.00', surum: id, fabrika, giris: { x: '1.00', z: '2.00' },
    kaydeden: { id: 1, ad: null }, kaydedildi: '', sutunlar: [], satirlar: [],
  },
  makineYerleri: [],
  istasyonYerleri: [{ istasyonId: 10 + id, kod: `CNC-${id}`, ad: 'Deneme', tip: 'talasli', aktif: true, x: '4.00', z: '3.00', donus: '0.0', genislik: '3.00', derinlik: '2.00', hucre: 'A1', makineler: [], model: null, merkezModeli: null }],
  raflar: [], alanlar: [], duvarlar: [{ id: 30 + id, basX: '0.00', basZ: '5.00', sonX: '6.00', sonZ: '5.00', kalinlik: '0.20', cam: false }], gecisler: [],
});

describe('fabrika koordinatı', () => {
  it('bölüm noktası sol üst köşe çevresinde dönerek fabrikaya gider ve geri gelir', () => {
    const k = { x: 70, z: 0, donus: 90 };
    yakin(fabrikayaCevir(k, { x: 5, z: 2 }), { x: 68, z: 5 });
    yakin(bolumeCevir(k, { x: 68, z: 5 }), { x: 5, z: 2 });
    expect(bolumIcinde(k, 20, 10, { x: 65, z: 19 })).toBe(true);
    expect(bolumIcinde(k, 20, 10, { x: 71, z: 5 })).toBe(false);
    expect(fabrikaKutusu([{ konum: k, g: 20, d: 10 }])).toEqual({ x0: 60, z0: 0, x1: 70, z1: 20 });
  });

  it('bölüm krokisinin hizalaması fabrikaya taşınır; fabrika krokisi bölüme getirilir (aynı nokta)', () => {
    const h = { olcek: 0.05, donus: 10, x: -3, z: 4 };
    const k = { x: 12, z: -7, donus: 35 };
    const p = { u: 120, v: 80 };
    yakin(uygula(yerlestir(h, k), p), fabrikayaCevir(k, uygula(h, p)));
    const geri = yerelle(yerlestir(h, k), k);
    yakin(geri, h);
    expect(geri.donus).toBeCloseTo(10, 9);
  });

  it('seçim anahtarının bölümü bulunur', () => {
    const l = [bolum(1, { x: '0.00', z: '0.00', donus: '0.0' }), bolum(2, { x: '30.00', z: '0.00', donus: '0.0' })];
    expect(ogeninBolumu(l, 'istasyon:12')?.salon.id).toBe(2);
    expect(ogeninBolumu(l, 'bolum:1')?.salon.id).toBe(1);
    expect(ogeninBolumu(l, 'raf:99')).toBeUndefined();
  });
});

describe('fabrika taslağı', () => {
  const l = [bolum(1, { x: '0.00', z: '0.00', donus: '0.0' }), bolum(2, { x: '50.00', z: '0.00', donus: '90.0' })];

  it('öğeler fabrika metresine çevrilir, kayıtta geri bölüm metresine; değişmeyen taslak aynı gövdeyi verir', () => {
    const t = fabrikaTaslagiKur(l);
    const ist = t.istasyonlar.find((i) => i.istasyonId === 12);
    expect(ist).toMatchObject({ x: 47, z: 4, donus: 90 });
    expect(t.bolumler?.[1]?.giris).toEqual({ x: 48, z: 1 });
    const h = fabrikaGovdesi(t);
    expect(h.disarida).toEqual([]);
    const b = h.govde.bolumler[1];
    expect(b?.fabrika).toEqual({ x: 50, z: 0, donus: 90 });
    expect(b?.yerlesim.istasyonYerleri[0]).toMatchObject({ istasyonId: 12, x: 4, z: 3, donus: 0 });
    expect(b?.yerlesim.duvarlar[0]).toMatchObject({ basX: 0, basZ: 5, sonX: 6, sonZ: 5 });
    expect(b?.yerlesim.salon.giris).toEqual({ x: 1, z: 2 });
    expect(h.eslesme.get('salon:2/giris')).toBe('giris:2');
    expect(h.eslesme.get('bolum:2')).toBe('bolum:2');
  });

  it('bölüm taşınınca ve döndürülünce içindekiler birlikte gider; bölüm metresindeki yerleri değişmez', () => {
    let t = fabrikaTaslagiKur(l);
    t = tasi(t, 'bolum:2', 60, 5);
    t = dondur(t, 'bolum:2', 90);
    const b = t.bolumler?.[1];
    expect(b?.donus).toBe(180);
    // Orta sabit: 90°'de orta (45, 10); 180°'de köşe ortanın +g/2, +d/2 ötesinde.
    expect(b).toMatchObject({ x: 65, z: 20 });
    const g = fabrikaGovdesi(t).govde.bolumler[1];
    expect(g?.yerlesim.istasyonYerleri[0]).toMatchObject({ x: 4, z: 3, donus: 0 });
    // Bölüm 1 yerinde.
    expect(t.istasyonlar.find((i) => i.istasyonId === 11)).toMatchObject({ x: 4, z: 3, donus: 0 });
  });

  it('90\'ın katı olmayan dönüşte bölüm kenarındaki duvar yuvarlamaya rağmen kayda girer (KD-031)', () => {
    const egik = bolum(3, { x: '3.00', z: '7.00', donus: '1.0' });
    egik.duvarlar = [{ id: 40, basX: '0.00', basZ: '0.00', sonX: '7.00', sonZ: '0.00', kalinlik: '0.20', cam: false }];
    for (const donus of ['1.0', '30.0', '137.5']) {
      egik.salon.fabrika.donus = donus;
      const h = fabrikaGovdesi(fabrikaTaslagiKur([egik]));
      expect(h.disarida).toEqual([]);
      const d = h.govde.bolumler[0]?.yerlesim.duvarlar[0];
      expect(Math.abs(Number(d?.basZ))).toBeLessThanOrEqual(0.01);
      expect(Math.abs(Number(d?.sonZ))).toBeLessThanOrEqual(0.01);
    }
  });

  it('bölüm dışına konan öğe kayda girmez', () => {
    const t = tasi(fabrikaTaslagiKur(l), 'istasyon:11', 25, 3);
    expect(fabrikaGovdesi(t).disarida).toEqual(['istasyon:11']);
  });
});
