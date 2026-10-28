import { describe, expect, it } from 'vitest';
import type { Alet } from '#paylasilan/sozlesme/kalibrasyon.ts';
import { aletlerCsv } from './gosterim.ts';

describe('ölçü aletleri CSV', () => {
  it('formül gibi başlayan metin \' ile başlar', () => {
    const alet = { no: '=1+1', tur: 'Kumpas', ad: '@ad', olcmeAraligi: '-10', yer: 'Kalite', periyotGun: 365, sonKalibrasyon: null, vade: null } as unknown as Alet;
    const satir = aletlerCsv([alet]).slice(1).split('\r\n')[1] ?? '';
    expect(satir.startsWith(`"'=1+1";"Kumpas";"'@ad";"-10";"Kalite";"365"`)).toBe(true);
  });
});
