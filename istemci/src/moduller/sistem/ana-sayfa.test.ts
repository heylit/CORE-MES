import { describe, expect, it } from 'vitest';
import { gorunenKartlar } from '../../ortak/rota/ana-sayfa.ts';
import { anaSayfaKartlari } from './ana-sayfa.tsx';

describe('sistem ana sayfa karti', () => {
  it('sistem durumu ve zamanlanmis isler yoneticinin panosunda da durmaz', () => {
    expect(gorunenKartlar(anaSayfaKartlari, ['saglik.ayrinti-oku', 'ayarlar.yaz']).map((k) => k.anahtar)).toEqual([]);
  });
});
