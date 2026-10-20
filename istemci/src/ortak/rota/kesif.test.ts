import { describe, expect, it } from 'vitest';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import { rotaPlani, rotalariTopla } from './kesif.ts';

const Ekran = () => null;
const sayfa = (yol: string) => SAYFALAR.filter((s) => s.yol === yol);

describe('rotalariTopla', () => {
  it('her modul dosyasinin rotalarini toplar', () => {
    const rotalar = rotalariTopla({
      '../../moduller/b/rotalar.tsx': { rotalar: [{ yol: '/b', ekran: Ekran }] },
      '../../moduller/a/rotalar.tsx': { rotalar: [{ yol: '/a', ekran: Ekran }, { yol: '/a/:id', ekran: Ekran }] },
    });
    expect(rotalar.map((r) => r.yol)).toEqual(['/a', '/a/:id', '/b']);
  });

  it('ayni yola iki modul rota verirse yolu ve iki dosyayi soyleyerek hata verir', () => {
    const tek = { '../../moduller/a/rotalar.tsx': { rotalar: [{ yol: '/ortak', ekran: Ekran }] } };
    expect(rotalariTopla(tek).map((r) => r.yol)).toEqual(['/ortak']);
    expect(() => rotalariTopla({ ...tek, '../../moduller/b/rotalar.tsx': { rotalar: [{ yol: '/ortak', ekran: Ekran }] } }))
      .toThrow(/\/ortak .*moduller\/a\/rotalar\.tsx.*moduller\/b\/rotalar\.tsx/);
  });

  it('parametre adi farkli olsa da ayni adrese dusen iki rota cakisir; farkli adres cakismaz', () => {
    const a = { '../../moduller/a/rotalar.tsx': { rotalar: [{ yol: '/a/:id', ekran: Ekran }] } };
    const b = (yol: string) => ({ ...a, '../../moduller/b/rotalar.tsx': { rotalar: [{ yol, ekran: Ekran }] } });
    expect(rotalariTopla(b('/a/:id/adim')).map((r) => r.yol)).toEqual(['/a/:id', '/a/:id/adim']);
    expect(() => rotalariTopla(b('/a/:no'))).toThrow(/\/a\/:no .*moduller\/a\/rotalar\.tsx.*moduller\/b\/rotalar\.tsx/);
  });

  it('bicime uyan yolu kabul eder; uymayani yolu ve dosyayi soyleyerek reddeder', () => {
    const dosya = (yol: string) => ({ '../../moduller/a/rotalar.tsx': { rotalar: [{ yol, ekran: Ekran }] } });
    for (const yol of ['/stok', '/stok/:id', '/uretim-emirleri/:emirId/adim-2']) {
      expect(rotalariTopla(dosya(yol)).map((r) => r.yol)).toEqual([yol]);
    }
    for (const yol of ['stok', '/stok/', '/Stok', '/stok//5', '/stok/:', '/st ok', '', '/:id', '/:id/stok']) {
      expect(() => rotalariTopla(dosya(yol)), yol).toThrow(/biçime uymuyor.*moduller\/a\/rotalar\.tsx/);
    }
  });

  it('ana sayfayi modul rotasi olarak reddeder: ana sayfa kabugundur, modul kart bildirir', () => {
    expect(() => rotalariTopla({ '../../moduller/a/rotalar.tsx': { rotalar: [{ yol: '/', ekran: Ekran }] } }))
      .toThrow(/Ana sayfa kabuğundur.*moduller\/a\/rotalar\.tsx/);
  });

  it('rota dizisi vermeyen dosyada dosyayi soyleyerek hata verir', () => {
    expect(() => rotalariTopla({ '../../moduller/a/rotalar.tsx': { rota: [] } })).toThrow(/moduller\/a\/rotalar\.tsx/);
  });
});

describe('rotaPlani', () => {
  const rotalar = [{ yol: '/', ekran: Ekran }, { yol: '/terminal', ekran: Ekran }, { yol: '/stok', ekran: Ekran }];

  it('gorunen sayfanin rotasini kurar, gorunmeyeninkini kurmaz; sayfa listesi disindaki yol herkese aciktir', () => {
    expect(rotaPlani(rotalar, sayfa('/terminal')).ekranlar.map((r) => r.yol)).toEqual(['/', '/terminal']);
    expect(rotaPlani(rotalar, SAYFALAR).ekranlar.map((r) => r.yol)).toEqual(['/', '/terminal', '/stok']);
    expect(rotaPlani(rotalar, []).ekranlar.map((r) => r.yol)).toEqual(['/']);
  });

  it('sayfanin alt yolu o sayfaya aittir: sayfayi goren icin kurulur, gormeyen icin kurulmaz', () => {
    const altYollar = [{ yol: '/stok/:id', ekran: Ekran }, { yol: '/stok/:id/hareket', ekran: Ekran }, { yol: '/stoklar', ekran: Ekran }];
    expect(rotaPlani(altYollar, sayfa('/stok')).ekranlar.map((r) => r.yol)).toEqual(['/stok/:id', '/stok/:id/hareket', '/stoklar']);
    expect(rotaPlani(altYollar, sayfa('/terminal')).ekranlar.map((r) => r.yol)).toEqual(['/stoklar']);
  });

  it('rota verilmeyen gorunur sayfa yer tutucuda kalir; verilen kalmaz', () => {
    const gorunur = SAYFALAR.filter((s) => s.yol === '/terminal' || s.yol === '/kuyruk');
    expect(rotaPlani(rotalar, gorunur).yerTutucular.map((s) => s.yol)).toEqual(['/kuyruk']);
    expect(rotaPlani([], gorunur).yerTutucular.map((s) => s.yol)).toEqual(['/terminal', '/kuyruk']);
  });
});
