import { describe, expect, it } from 'vitest';
import { ornekCalisma } from '../motor/ornek.ts';
import { AYAR_ALANLARI, alanYaz, ayarTaslagi, ayarlariYaz, etkiSatirlari, farklar, kisitYaz, ozetOku, sayiOku } from './ayarlar.ts';

const alan = (k: string) => {
  const a = AYAR_ALANLARI.find((x) => x.k === k);
  if (!a) throw new Error(k);
  return a;
};

describe('Kokpit ayarları (3282 1b)', () => {
  it('taslak çalışmanın değerlerinden kurulur; değişmeyen taslakta fark yok, yazmak değiştirmez', () => {
    const c = ornekCalisma();
    const t = ayarTaslagi(c);
    expect(t.alan['w.dondurma']).toBe(4);
    expect(t.alan['param.tampon']).toBe(true);
    expect(t.acik.personel).toBe(true);
    expect(farklar(c, t)).toEqual([]);
    expect(ayarlariYaz(c, t)).toBe(false);
  });

  it('değişen alan ve kısıt okunur satır olur; yazınca çalışmada yerini alır', () => {
    const c = ornekCalisma();
    let t = alanYaz(ayarTaslagi(c), alan('dondurma'), 8);
    t = alanYaz(t, alan('tampon'), false);
    t = kisitYaz(t, 'personel', false);
    expect(farklar(c, t)).toEqual(['Dondurulmuş bölge: 4 sa → 8 sa', 'Arıza payı ve termin tamponu: açık → kapalı', 'Operatör sayısı: açık → kapalı']);
    expect(ayarlariYaz(c, t)).toBe(true);
    expect(c.w.dondurma).toBe(8);
    expect(c.param.tampon).toBe(false);
    expect(c.kapali).toEqual(['personel']);
    expect(farklar(c, t)).toEqual([]);
  });

  it('sayı girdisi sınır dışında ya da boşsa hata verir; virgüllü ondalık okunur', () => {
    const z = alan('tamponZ');
    if (z.tur !== 'sayi') throw new Error('tur');
    expect(sayiOku(z, '1,5')).toEqual({ deger: 1.5 });
    expect(sayiOku(z, '4')).toEqual({ hata: '0 ile 3 arasında olmalı.' });
    expect(sayiOku(z, '')).toEqual({ hata: '0 ile 3 arasında olmalı.' });
  });

  it('etki satırları önce ve sonrayı yönüyle verir; önce yoksa yalnız sonra', () => {
    const c = ornekCalisma();
    const once = ozetOku(c.plan);
    expect(once).toEqual({ wT: expect.any(Number) as unknown, late: 1, n: 2 });
    const l = etkiSatirlari(once, { wT: 10, late: 0, n: 2 });
    expect(l[0]).toEqual({ ad: 'Geciken iş', once: '1 / 2', sonra: '0 / 2', yon: 'iyi' });
    expect(l[1]?.yon).toBe('iyi');
    expect(etkiSatirlari(null, { wT: 10, late: 3, n: 4 })[0]).toEqual({ ad: 'Geciken iş', once: null, sonra: '3 / 4', yon: 'ayni' });
    expect(ozetOku({ ozet: { late: 1 } })).toBeNull();
    expect(etkiSatirlari({ wT: 20, late: 1, n: null }, { wT: 8, late: 0, n: null })[0]).toEqual({ ad: 'Geciken iş', once: '1', sonra: '0', yon: 'iyi' });
  });
});
