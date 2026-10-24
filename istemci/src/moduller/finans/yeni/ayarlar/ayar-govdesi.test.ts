import { describe, expect, it } from 'vitest';
import { ayarGovdesi, onerilenEsik, type Ayar } from './ayar-govdesi.ts';

const ayar: Ayar = {
  sirketAdi: 'Deneme', sektor: 'uretim', nakitEsigi: '100000.00', beklenenAylikSatis: '0', beklenenTahsilGunu: null,
  riskToleransi: 5, simulasyonSayisi: 1000, cekKarsiliksizOlasiligi: '3.00', batikGunu: 180, anomaliEsigi: '3.5',
  agirlikLikidite: 25, agirlikNakit: 25, agirlikKarlilik: 20, agirlikVerimlilik: 15, agirlikBorcluluk: 15,
  bilancoDonen: '500000', bilancoStok: null, bilancoKvb: '0', bilancoToplamBorc: null, bilancoOzkaynak: null, bilancoBirikmisKar: null,
  kurulumTamam: true, caprazKurPayi: '2.00', surum: 3,
} as Ayar;

describe('F4 ayar govdesi', () => {
  it('kayitli ayari sunucu semasina uygun govdeye cevirir; bos tutar null olur', () => {
    const g = ayarGovdesi(ayar, null);
    expect(g.beklenenAylikSatis).toBeNull();
    expect(g.bilancoKvb).toBeNull();
    expect(g.bilancoDonen).toBe(500000);
    expect(g.nakitEsigi).toBe(100000);
    expect(g).not.toHaveProperty('caprazKurPayi');
  });
  it('satin almadaki sirket adi ve degisiklik ustune yazilir', () => {
    const g = ayarGovdesi(ayar, 'Satin Alma Adi', { riskToleransi: 10, caprazKurPayi: 1.5 });
    expect(g.sirketAdi).toBe('Satin Alma Adi');
    expect(g.riskToleransi).toBe(10);
    expect(g.caprazKurPayi).toBe(1.5);
    expect(g.surum).toBe(3);
  });
  it('esik onerisi 10.000e yuvarlanir', () => {
    expect(onerilenEsik(184_999)).toBe(180_000);
    expect(onerilenEsik(185_000)).toBe(190_000);
  });
});
