import { describe, expect, it } from 'vitest';
import type { KmAlan } from './AdimliForm.tsx';
import { gunEkle, hizliTarihler, oneriler, otomatikMi, secimDugmeleri, sorular, soruGorunur, yanitMetni } from './tektek.ts';

const A: KmAlan[] = [
  { k: 'no', etiket: 'No' }, { k: 'mrb', etiket: 'MRB', tur: 'secim', secenekler: ['Karar bekliyor', 'Hurda'] },
  { k: 'mrbGerekce', etiket: 'Gerekçe' }, { k: 'tamam', etiket: 'Tamam mı', tur: 'evet' },
];

describe('tek tek sor kuralları', () => {
  const q = sorular([{ baslik: 'B', alanlar: ['no', 'mrb', 'mrbGerekce', 'tamam'], icerik: () => null }], A, new Map(A.map((a) => [a.k, 0])));

  it('alanları adım sırasıyla, ek içeriği sonda sorar', () => {
    expect(q.map((x) => (x.tur === 'alan' ? x.alan.k : 'ek'))).toEqual(['no', 'mrb', 'mrbGerekce', 'tamam', 'ek']);
  });

  it('koşullu soru bağlı yanıta göre görünür', () => {
    expect(soruGorunur(q[2]!, { mrb: 'Karar bekliyor' })).toBe(false);
    expect(soruGorunur(q[2]!, { mrb: 'Hurda' })).toBe(true);
    expect(soruGorunur({ tur: 'alan', alan: { k: 'x', etiket: 'X', gorunur: () => false }, adim: 0 }, {})).toBe(false);
  });

  it('yeni kayıtta dolu otomatik alan ve ön dolgu sorulmaz', () => {
    expect(otomatikMi(q[0]!, true, { no: 'U-1' }, null)).toBe(true);
    expect(otomatikMi(q[0]!, false, { no: 'U-1' }, null)).toBe(false);
    expect(otomatikMi(q[1]!, true, {}, { mrb: 'Hurda' })).toBe(true);
  });

  it('yanıt metni, seçim düğmeleri, hızlı tarih ve öneri', () => {
    expect(yanitMetni(q[3]!, { tamam: false })).toBe('Hayır');
    expect(secimDugmeleri(A[1]!)?.map((b) => b.baslik)).toEqual(['Karar bekliyor', 'Hurda']);
    expect(hizliTarihler('termin').map((t) => t.gun)).toEqual([7, 30, 91]);
    expect(hizliTarihler('tarih').map((t) => t.gun)).toEqual([0, -1]);
    expect(oneriler(['Ali', 'Ayşe', 'Veli'], 'a')).toEqual(['Ali', 'Ayşe']);
  });
});

describe('hızlı tarih', () => {
  it('gece yarısından sonra "Bugün" ve "Dün" tesis gününü verir', () => {
    // Tesiste 29 Ekim 01:30; UTC'de hâlâ 28 Ekim.
    const simdi = new Date('2026-10-28T22:30:00Z');
    expect(gunEkle(0, simdi)).toBe('2026-10-29');
    expect(gunEkle(-1, simdi)).toBe('2026-10-28');
  });
});
