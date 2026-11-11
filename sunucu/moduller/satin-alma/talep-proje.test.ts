import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ILETILER, belgeGenelGiderOrani, birlesikTalep, birlesmeProjesiReddi, genelGiderOrani, projeReddi, satirYolu, siparisDagilimi, type DagilimSatiri } from './kurallar.ts';

describe('2611 a, 2614 1/2 a, 2620 a: talebin projesi (saf kurallar)', () => {
  test('proje yalnız emirsiz talepte; yeni seçilen proje aktif, değişmeyen eski proje durumu değişse de kalır', () => {
    assert.equal(projeReddi({ projeId: null, uretimEmriId: 7 }, null, false), null);
    assert.equal(projeReddi({ projeId: undefined, uretimEmriId: 7 }, null, false), null);
    assert.equal(projeReddi({ projeId: 3, uretimEmriId: 7 }, 3, true), ILETILER.projeEmirli);
    assert.equal(projeReddi({ projeId: 3, uretimEmriId: null }, null, false), ILETILER.projeAktifDegil);
    assert.equal(projeReddi({ projeId: 3, uretimEmriId: null }, null, true), null);
    assert.equal(projeReddi({ projeId: 3, uretimEmriId: null }, 3, false), null);
  });

  test('Veri 2: farklı projeli kaynaklar birleşmez; birleşik talep ortak projeyi taşır', () => {
    const k = (no: string, id: number | null) => ({ no, ihtiyacTarihi: null, oncelik: 'normal' as const, uretimEmriId: null, proje: id === null ? null : { id, kod: `P${id}`, ad: '' } });
    assert.equal(birlesmeProjesiReddi([k('T-1', 4), k('T-2', 5)]), ILETILER.birlesmeProjesi);
    assert.equal(birlesmeProjesiReddi([k('T-1', 4), k('T-2', null)]), ILETILER.birlesmeProjesi);
    assert.equal(birlesmeProjesiReddi([k('T-1', 4), k('T-2', 4)]), null);
    assert.equal(birlesmeProjesiReddi([k('T-1', null), k('T-2', null)]), null);
    assert.equal(birlesikTalep('00000000-0000-4000-8000-000000000001', [k('T-1', 4), k('T-2', 4)]).projeId, 4);
    assert.equal(birlesikTalep('00000000-0000-4000-8000-000000000001', [k('T-1', null), k('T-2', null)]).projeId, null);
  });

  const satir = (o: Partial<DagilimSatiri>): DagilimSatiri => ({ fason: false, kartTuru: null, emirId: null, emirProjeli: false, projeId: null, mal: 0, miktar: 1, teslim: 0, ...o });

  test('2637 a, 2638: satırın tek yolu; öncelik fason > stok > emir (projeli emir) > proje > genel gider', () => {
    const tam = { fason: true, kartTuru: 'hammadde', emirId: 9, emirProjeli: true, projeId: 4 };
    assert.equal(satirYolu(tam), 'fason');
    assert.equal(satirYolu({ ...tam, fason: false }), 'stok');
    assert.equal(satirYolu({ ...tam, fason: false, kartTuru: 'hizmet' }), 'emir');
    assert.equal(satirYolu({ ...tam, fason: false, kartTuru: null }), 'emir');
    assert.equal(satirYolu({ ...tam, fason: false, kartTuru: 'hizmet', emirId: null }), 'proje');
    assert.equal(satirYolu({ fason: false, kartTuru: 'hizmet', emirId: null, emirProjeli: false, projeId: null }), 'genel_gider');
    // Maliyet C1: projesi olmayan emrin hizmet satırı genel gidere gider (emir maliyeti projeye bağlanamaz).
    assert.equal(satirYolu({ fason: false, kartTuru: 'hizmet', emirId: 9, emirProjeli: false, projeId: null }), 'genel_gider');
    // Mimar N2: kartı bulunamayan satırın yolu bilinmiyor, stok varsayılmaz; fason bağı yine önce gelir.
    assert.equal(satirYolu({ fason: false, kartTuru: null, kartBulunamadi: true, emirId: 9, emirProjeli: true, projeId: null }), 'bilinmiyor');
    assert.equal(satirYolu({ fason: true, kartTuru: null, kartBulunamadi: true, emirId: null, emirProjeli: false, projeId: null }), 'fason');
  });

  test('2611 Maliyet C1 korunur: proje değeri hizmet teslim değeriyle, kartsız sipariş tutarıyla; masraf sayılanın mal payı kadar', () => {
    // Stok 100 (teslim 10/10), hizmet 50 (teslim 1/2), kartsız 30 (teslimsiz), fason 20; masraf 20, bütün mal 200; hepsi proje 5.
    const p = { projeId: 5 };
    const satirlar = [
      satir({ ...p, kartTuru: 'hammadde', mal: 100, miktar: 10, teslim: 10 }),
      satir({ ...p, kartTuru: 'hizmet', mal: 50, miktar: 2, teslim: 1 }),
      satir({ ...p, mal: 30, miktar: 3 }),
      satir({ ...p, fason: true, kartTuru: 'hizmet', mal: 20, teslim: 1 }),
    ];
    // 25 (hizmetin yarısı) + 30 (kartsız) + 20 x 80 / 200 = 8. 2600 3/3 b: fasonun masraf payı (20 x 20 / 200 = 2) genel gidere: 2 / 220.
    assert.deepEqual(siparisDagilimi(satirlar, 20), { hedefler: [{ yol: 'proje', hedefId: 5, deger: 63 }], genelGiderOrani: 0.009091 });
    // Yalnız stok ve fason: projeye bir şey gitmez, masraf da gitmez.
    assert.deepEqual(siparisDagilimi([satirlar[0]!, satirlar[3]!], 20).hedefler, []);
    // N2: hizmet satırı teslimsizse değeri yok, masraf da girmez.
    assert.deepEqual(siparisDagilimi([satir({ ...p, kartTuru: 'hizmet', mal: 50, miktar: 2 })], 10).hedefler, []);
    // Varsayım 7: kartsız satır teslimsiz de tam sayılır; masrafın tamamı onundur.
    assert.deepEqual(siparisDagilimi([satir({ ...p, mal: 30, miktar: 3 })], 10).hedefler, [{ yol: 'proje', hedefId: 5, deger: 40 }]);
  });

  test('2638: emirli talepte hizmet satırı emre yazılır, projeye değil; emirli talepte genel gider payı 0', () => {
    const d = siparisDagilimi([satir({ kartTuru: 'hizmet', emirId: 9, emirProjeli: true, projeId: null, mal: 40, miktar: 1, teslim: 1 })], 0);
    assert.deepEqual(d, { hedefler: [{ yol: 'emir', hedefId: 9, deger: 40 }], genelGiderOrani: 0 });
  });

  test('2637 a: genel gidere giren oran mal payıdır (Maliyet örneği 80/180); malı 0 olan sipariş null (Veri 1)', () => {
    const satirlar = [
      satir({ kartTuru: 'hammadde', mal: 100, miktar: 10, teslim: 10 }),
      satir({ kartTuru: 'hizmet', mal: 50, miktar: 2, teslim: 2 }),
      satir({ mal: 30, miktar: 3 }),
    ];
    const d = siparisDagilimi(satirlar, 18);
    assert.equal(d.genelGiderOrani, 0.444444);
    // Masraf payı (18 x 80 / 180 = 8) tutar olarak verilmez; Finans fatura tutarını oranla çarpınca içinde gelir.
    assert.deepEqual(d.hedefler, []);
    assert.equal(siparisDagilimi([satir({ kartTuru: 'hizmet', mal: 0 })], 5).genelGiderOrani, null);
    assert.equal(siparisDagilimi([], 0).genelGiderOrani, null);
    // Yalnız genel gider: oran 1. Projeli talep: 0. Projesiz emir (C1): 1.
    assert.equal(siparisDagilimi([satir({ kartTuru: 'hizmet', mal: 10 })], 0).genelGiderOrani, 1);
    assert.equal(siparisDagilimi([satir({ kartTuru: 'hizmet', mal: 10, projeId: 3 })], 0).genelGiderOrani, 0);
    assert.equal(siparisDagilimi([satir({ kartTuru: 'hizmet', mal: 10, emirId: 9 })], 0).genelGiderOrani, 1);
    // Mimar N2: yolu bilinmeyen satır varsa oran null; bilinen proje tutarı yine verilir.
    const b = siparisDagilimi([satir({ kartTuru: 'hizmet', mal: 10, miktar: 1, teslim: 1, projeId: 3 }), satir({ kartBulunamadi: true, mal: 10, projeId: 3 })], 0);
    assert.deepEqual(b, { hedefler: [{ yol: 'proje', hedefId: 3, deger: 10 }], genelGiderOrani: null });
  });

  test('2600 3/3 b: fason siparişinin masrafı genel gidere girer, fason malı girmez (Maliyet örneği)', () => {
    // Emir A 6.000 ve emir B 4.000 kaplama, nakliye 500: genel gidere 500, belge 10.500.
    const fason = [
      satir({ fason: true, kartTuru: 'hizmet', emirId: 1, emirProjeli: true, mal: 6000, miktar: 1, teslim: 1 }),
      satir({ fason: true, kartTuru: 'hizmet', emirId: 2, emirProjeli: true, mal: 4000, miktar: 1, teslim: 1 }),
    ];
    assert.deepEqual(siparisDagilimi(fason, 500), { hedefler: [], genelGiderOrani: 0.047619 });
    assert.equal(siparisDagilimi(fason, 0).genelGiderOrani, 0);
    // Karışık: genel 100, fason 100, stok 200, masraf 40 (mal 400). Pay 100 + 40 x 200 / 400 = 120; payda 440. Stokun masraf payı (20) düşer.
    const karisik = [satir({ kartTuru: 'hizmet', mal: 100 }), satir({ fason: true, kartTuru: 'hizmet', mal: 100 }), satir({ kartTuru: 'hammadde', mal: 200 })];
    assert.equal(siparisDagilimi(karisik, 40).genelGiderOrani, 0.272727);
    // Yolu bilinmeyen satır fasonla birlikte de oranı bilinmez yapar.
    assert.equal(siparisDagilimi([fason[0]!, satir({ kartBulunamadi: true, mal: 10 })], 500).genelGiderOrani, null);
  });

  test('2642 b Maliyet C1: belgede kalan, siparişin eşlenmemiş kısmının oranıyla çarpılır', () => {
    const fason = [
      satir({ fason: true, kartTuru: 'hizmet', emirId: 1, emirProjeli: true, mal: 6000 }),
      satir({ fason: true, kartTuru: 'hizmet', emirId: 2, emirProjeli: true, mal: 4000 }),
    ];
    // İki fason satırı eşlendi, kalan nakliye 500: kalanın oranı 1, belge oranı 500 / 10.500.
    const kalanOrani = genelGiderOrani(fason, 500, new Set([0, 1]));
    assert.equal(kalanOrani, 1);
    const eslemeler = [{ tutar: '6000.00', yol: 'fason' as const }, { tutar: '4000.00', yol: 'fason' as const }];
    assert.deepEqual(belgeGenelGiderOrani({ belgeTutari: '10500.00', kalanOrani, eslemeler }), { oran: 0.047619, esleme: 'kismi' });
    // Eşleme yoksa sipariş oranıyla aynı.
    assert.equal(genelGiderOrani(fason, 500, new Set()), siparisDagilimi(fason, 500).genelGiderOrani);
    // Hepsi eşlenmiş, masraf yok: payda 0, oran tanımsız (kalan da yoktur).
    assert.equal(genelGiderOrani(fason, 0, new Set([0, 1])), null);
  });
});
