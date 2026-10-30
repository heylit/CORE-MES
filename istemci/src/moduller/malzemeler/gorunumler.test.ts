import { describe, expect, it } from 'vitest';
import { matchPath } from 'react-router-dom';
import { DIS_SAYFALAR, ETIKET_SECIM_SINIRI, GORUNUM_YOLLARI, malzemeEtiketiYolu } from './gorunumler.ts';
import { rotalar } from './rotalar.tsx';

// Menünün geçerliliği ve maddelerin kime görünür olduğu sunucu tarafındaki `ikinci-menu.test.ts`'tedir (istemci menüyü değer olarak
// yalnız toplayıcıdan alır); buradaki tablo menüye tiple bağlıdır.
describe('malzemeler ikinci menü', () => {
  it('her görünüm bir rotaya düşer', () => {
    for (const yol of Object.values(GORUNUM_YOLLARI)) {
      expect(rotalar.some((r) => matchPath(r.yol, yol) !== null), yol).toBe(true);
    }
  });

  it('operasyonlar görünümü yok (kart #544); dış sayfalar sahibinin adresidir', () => {
    expect(Object.values(GORUNUM_YOLLARI)).not.toContain('/malzemeler/operasyonlar');
    expect(DIS_SAYFALAR).toEqual({ 'operasyon-tipleri': '/istasyonlar/operasyon-tipleri', 'rota-sablonlari': '/rota/sablonlar', 'urun-rotalari': '/recete-rota/schema' });
  });

  it('269 a: kartın etiketi Etiket Merkezi\'nde kart no ile açılır; geçersiz no için adres yok', () => {
    expect(malzemeEtiketiYolu([1001])).toBe('/etiket-merkezi?tur=malzeme&id=1001');
    for (const no of [0, -3, 1.5, '1001', null, undefined, Number.NaN]) expect(malzemeEtiketiYolu([no])).toBeNull();
  });

  it('1288: seçili kartların etiketleri tek adreste; geçersiz no düşer, tekrar edilen no bir kez; sınırı aşan seçim adres kurmaz', () => {
    expect(malzemeEtiketiYolu([1001, 0, 1002, 1001])).toBe('/etiket-merkezi?tur=malzeme&id=1001,1002');
    expect(malzemeEtiketiYolu([])).toBeNull();
    expect(malzemeEtiketiYolu(Array.from({ length: ETIKET_SECIM_SINIRI }, (_, i) => i + 1))).not.toBeNull();
    expect(malzemeEtiketiYolu(Array.from({ length: ETIKET_SECIM_SINIRI + 1 }, (_, i) => i + 1))).toBeNull();
  });
});
