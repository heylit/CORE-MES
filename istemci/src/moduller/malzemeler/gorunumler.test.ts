import { describe, expect, it } from 'vitest';
import { matchPath } from 'react-router-dom';
import { GORUNUM_YOLLARI, adrestekiGorunum, disSayfaYolu, malzemeEtiketiYolu } from './gorunumler.ts';
import { rotalar } from './rotalar.tsx';

// Menünün geçerliliği ve maddelerin kime görünür olduğu sunucu tarafındaki `ikinci-menu.test.ts`'tedir (istemci menüyü değer olarak
// yalnız toplayıcıdan alır); buradaki tablo menüye tiple bağlıdır.
describe('malzemeler ikinci menü', () => {
  it('her görünüm bir rotaya düşer ve adresi kendi görünümünü verir', () => {
    for (const [anahtar, yol] of Object.entries(GORUNUM_YOLLARI)) {
      expect(adrestekiGorunum(yol)).toBe(anahtar);
      expect(rotalar.some((r) => matchPath(r.yol, yol) !== null), yol).toBe(true);
    }
  });

  it('kök katalogdur; sondaki eğik çizgi aynı görünümdür; tanımsız alt yol görünüm değildir', () => {
    expect(adrestekiGorunum('/malzemeler')).toBe('cat');
    expect(adrestekiGorunum('/malzemeler/sablonlar/')).toBe('tpl');
    expect(adrestekiGorunum('/malzemeler/bilinmeyen')).toBeNull();
    expect(adrestekiGorunum('/malzemeler/yeni/fazla')).toBeNull();
  });

  it('operasyonlar görünümü yok (kart #544); dış sayfa yalnız bilinen anahtarla, istasyonların operasyon tiplerine', () => {
    expect(adrestekiGorunum('/malzemeler/operasyonlar')).toBeNull();
    expect(disSayfaYolu('operasyon-tipleri')).toBe('/istasyonlar/operasyon-tipleri');
    expect(disSayfaYolu('rota-sablonlari')).toBe('/rota/sablonlar');
    expect(disSayfaYolu('urun-rotalari')).toBe('/recete-rota/schema');
    expect([disSayfaYolu('toString'), disSayfaYolu('/yonetim'), disSayfaYolu(3)]).toEqual([null, null, null]);
  });

  it('269 a: kartın etiketi Etiket Merkezi\'nde kart no ile açılır; geçersiz no için adres yok', () => {
    expect(malzemeEtiketiYolu(1001)).toBe('/etiket-merkezi?tur=malzeme&id=1001');
    for (const no of [0, -3, 1.5, '1001', null, undefined, Number.NaN]) expect(malzemeEtiketiYolu(no)).toBeNull();
  });
});
