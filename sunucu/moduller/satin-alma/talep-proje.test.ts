import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ILETILER, birlesikTalep, birlesmeProjesiReddi, projeAlimDegeri, projeReddi, siparisUretimeGiderMi } from './kurallar.ts';

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

  test('Maliyet C1: yalnız stoğa girmeyen satır sayılır; hizmet teslim değeriyle, kartsız sipariş tutarıyla; masraf sayılanın mal payı kadar', () => {
    // Stok 100 (teslim 10/10), hizmet 50 (teslim 1/2), kartsız 30 (teslimsiz), fason 20; masraf 20, bütün mal 200.
    const satirlar = [
      { tur: 'stok' as const, mal: 100, miktar: 10, teslim: 10 },
      { tur: 'hizmet' as const, mal: 50, miktar: 2, teslim: 1 },
      { tur: 'kartsiz' as const, mal: 30, miktar: 3, teslim: 0 },
      { tur: 'fason' as const, mal: 20, miktar: 1, teslim: 1 },
    ];
    // 25 (hizmetin yarısı) + 30 (kartsız) + 20 x 80 / 200 = 8.
    assert.equal(projeAlimDegeri(satirlar, 20), 63);
    // Yalnız stok ve fason: projeye bir şey gitmez, masraf da gitmez.
    assert.equal(projeAlimDegeri([satirlar[0]!, satirlar[3]!], 20), 0);
    // N2: hizmet satırı teslimsizse değeri yok, masraf da girmez.
    assert.equal(projeAlimDegeri([{ tur: 'hizmet', mal: 50, miktar: 2, teslim: 0 }], 10), 0);
    // Varsayım 7: kartsız satır teslim kaydı olamadığı için teslimsiz de tam sayılır; masrafın tamamı onundur.
    assert.equal(projeAlimDegeri([{ tur: 'kartsiz', mal: 30, miktar: 3, teslim: 0 }], 10), 40);
  });

  test('2620 a (Finans): sipariş üretime ya da projeye gider: proje, emir, fason bağı ya da stoğa giren kart; kartsız ve hizmet tek başına gitmez', () => {
    const bos = { projeId: null, uretimEmriId: null };
    const kartsiz = { fasonBagli: false, kartTuru: null };
    const hizmet = { fasonBagli: false, kartTuru: 'hizmet' };
    assert.equal(siparisUretimeGiderMi({ projeId: 2, uretimEmriId: null }, [kartsiz]), true);
    assert.equal(siparisUretimeGiderMi({ projeId: null, uretimEmriId: 9 }, [kartsiz]), true);
    assert.equal(siparisUretimeGiderMi(bos, [hizmet, { fasonBagli: true, kartTuru: 'hizmet' }]), true);
    assert.equal(siparisUretimeGiderMi(bos, [kartsiz, { fasonBagli: false, kartTuru: 'hammadde' }]), true);
    assert.equal(siparisUretimeGiderMi(bos, [kartsiz, hizmet]), false);
    assert.equal(siparisUretimeGiderMi(bos, []), false);
    // 2624 b, Mimar N1: kaynağı emirli kalem (birleşik talep emirsiz olsa da) siparişi üretime götürür.
    assert.equal(siparisUretimeGiderMi(bos, [{ ...kartsiz, emirli: true }]), true);
    assert.equal(siparisUretimeGiderMi(bos, [{ ...hizmet, emirli: false }]), false);
  });
});
