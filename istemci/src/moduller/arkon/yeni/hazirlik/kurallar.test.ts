import { describe, expect, it } from 'vitest';
import {
  kalemBitti, kodaUyanKalem, olcuUygun, olcumYontemi, toplamaSirasi, torkUygun, yapistirilanKalemler, type DepoKalemi,
} from './kurallar.ts';
import { takimKullanimi } from './TakimKarti.tsx';

// İstasyon panellerinin eski ekranda satır içi olan hesapları (istasyonlar.ts DepoPanel, MontajPanel, KalitePanel; kurallar.ts ToolsCard).
// Beklenen değerler eski ifadelerden elle çıkarıldı. Kodlar uydurmadır.

const K = (id: string, code: string, qty: number, loc: string): DepoKalemi => ({ id, code, name: '', qty, unit: 'adet', loc });

describe('A2 istasyon paneli hesapları', () => {
  it('toplama: kalem bitti, okutulan kod, sıra', () => {
    const L = [K('a', 'AB 12', 3, 'B-02'), K('b', 'CD-7', 1, 'A-01'), K('c', 'CD-77', 2, 'A-03')];
    expect(kalemBitti(L[0]!, { a: 3 }, {})).toBe(true);
    expect(kalemBitti(L[0]!, { a: 2 }, {})).toBe(false);
    expect(kalemBitti(L[0]!, {}, { a: { at: 1, got: 0 } })).toBe(true);
    expect(kodaUyanKalem(L, ' ab12 ')?.id).toBe('a');
    expect(kodaUyanKalem(L, 'cd-77')?.id).toBe('c');
    // Tam eşleşme yoksa kodu içeren ilk kalem (eski ekranda da böyleydi).
    expect(kodaUyanKalem(L, 'LOT-CD-7-X')?.id).toBe('b');
    expect(kodaUyanKalem(L, 'XYZ')).toBeNull();
    const bitti = (it: DepoKalemi) => it.id === 'b';
    expect(toplamaSirasi(L, bitti).map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });

  it('tork ve ölçü toleransı sınırda kabul eder', () => {
    expect(torkUygun({ nm: 25, tol: 2 }, 27)).toBe(true);
    expect(torkUygun({ nm: 25, tol: 2 }, 27.01)).toBe(false);
    expect(torkUygun({ nm: 25, tol: 2 }, null)).toBe(false);
    expect(olcuUygun({ min: 9.9, max: 10.1 }, 10.1)).toBe(true);
    expect(olcuUygun({ min: 9.9, max: 10.1 }, 9.89)).toBe(false);
    expect(olcumYontemi({ tool: 'CMM' })).toBe('cmm');
    expect(olcumYontemi({ tool: 'CMM', m: 'man' })).toBe('man');
    expect(olcumYontemi({ tool: 'Kumpas' })).toBe('man');
  });

  it('yapıştırılan satırlar: sekme ya da noktalı virgül, boş satır atlanır, miktar virgüllü olabilir', () => {
    let n = 0;
    const L = yapistirilanKalemler('K-1\tBir\t12\tadet\tB-02\n\nK-2;İki;2,5;kg\nK-3', () => 'k' + ++n);
    expect(L).toEqual([
      { id: 'k1', code: 'K-1', name: 'Bir', qty: 12, unit: 'adet', loc: 'B-02' },
      { id: 'k2', code: 'K-2', name: 'İki', qty: 2.5, unit: 'kg', loc: '' },
      { id: 'k3', code: 'K-3', name: '', qty: 1, unit: 'adet', loc: '' },
    ]);
  });

  it('takım ömrü: kullanılan, yüzde ve renk eşiği', () => {
    const t = { id: 't', life: 100, warnPct: 80 };
    expect(takimKullanimi(t, { good: 50, toolsAt: { t: 10 } })).toEqual({ kullanilan: 40, yuzde: 40, ton: 'run' });
    expect(takimKullanimi(t, { good: 90 })).toEqual({ kullanilan: 90, yuzde: 90, ton: 'hazard' });
    expect(takimKullanimi(t, { good: 150 })).toEqual({ kullanilan: 150, yuzde: 100, ton: 'stop' });
    expect(takimKullanimi(t, { good: 5, toolsAt: { t: 20 } }).kullanilan).toBe(0);
  });
});
