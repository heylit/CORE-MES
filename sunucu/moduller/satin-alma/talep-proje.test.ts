import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ILETILER, birlesikTalep, birlesmeProjesiReddi, projeReddi, satirYolu, siparisDagilimi, type DagilimSatiri } from './kurallar.ts';

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
    // 25 (hizmetin yarısı) + 30 (kartsız) + 20 x 80 / 200 = 8.
    assert.deepEqual(siparisDagilimi(satirlar, 20), { hedefler: [{ yol: 'proje', hedefId: 5, deger: 63 }], genelGiderOrani: 0 });
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
});
