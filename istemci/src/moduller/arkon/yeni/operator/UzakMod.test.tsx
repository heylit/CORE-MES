import { describe, expect, it } from 'vitest';
import { uzakBasliklari } from './UzakMod.tsx';

// Uzak mod başlıkları: kullanıcının verdiği sıra ve adlar; boş alan yazılmaz. Değerler uydurmadır.
describe('uzakBasliklari', () => {
  const pkg = { partNo: 'DN-1', rev: 'A' } as Parameters<typeof uzakBasliklari>[0]['pkg'];

  it('projesiz pakette üretim emri, op, parça no, parça adı ve revizyonu bu sırayla verir', () => {
    expect(uzakBasliklari({ no: 'UE-DENEME-1', op: 'Op 10 · Torna', part: 'Deneme parça', pkg })).toEqual([
      ['Üretim emri', 'UE-DENEME-1'], ['Op', 'Op 10 · Torna'], ['Parça no', 'DN-1'], ['Parça adı', 'Deneme parça'], ['Rev', 'A'],
    ]);
  });

  it('proje varsa en başa koyar', () => {
    const projeli = { ...pkg, proje: 'Deneme proje' } as typeof pkg;
    expect(uzakBasliklari({ no: 'UE-DENEME-1', op: 'Op 10 · Torna', part: 'Deneme parça', pkg: projeli })[0]).toEqual(['Proje', 'Deneme proje']);
  });

  it('boş, yer tutucu ya da paketsiz alanları atlar', () => {
    expect(uzakBasliklari({ no: '—', op: ' ', part: 'Deneme parça' })).toEqual([['Parça adı', 'Deneme parça']]);
  });
});
