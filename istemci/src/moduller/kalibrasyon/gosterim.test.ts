import { describe, expect, it } from 'vitest';
import type { Alet } from '#paylasilan/sozlesme/kalibrasyon.ts';
import { aletlerCsv, vadeMetni } from './gosterim.ts';

describe('ölçü aletleri CSV', () => {
  it('formül gibi başlayan metin \' ile başlar', () => {
    const alet = { no: '=1+1', tur: 'Kumpas', ad: '@ad', olcmeAraligi: '-10', yer: 'Kalite', periyotGun: 365, sonKalibrasyon: null, vade: null } as unknown as Alet;
    const satir = aletlerCsv([alet]).slice(1).split('\r\n')[1] ?? '';
    expect(satir.startsWith(`"'=1+1";"Kumpas";"'@ad";"-10";"Kalite";"365"`)).toBe(true);
  });
});

describe('vade gösterimi', () => {
  it('kullanım dışı aletin vadesi gösterilmez, CSV\'de de boş kalır', () => {
    const disi = { no: 'DNM-9', tur: 'Kumpas', ad: null, olcmeAraligi: null, yer: null, periyotGun: 180, sonKalibrasyon: '2026-11-02', vade: '2027-05-01', kalanGun: 180, durum: 'kullanim-disi' } as unknown as Alet;
    expect(vadeMetni(disi)).toBeNull();
    expect(vadeMetni({ durum: 'gecerli', vade: '2027-05-01' })).toBe('01.05.2027');
    expect(vadeMetni({ durum: 'kayit-yok', vade: null })).toBeNull();
    expect(aletlerCsv([disi]).slice(1).split('\r\n')[1]).toBe('"DNM-9";"Kumpas";"";"";"";"180";"02.11.2026";"";"Kullanım dışı";""');
  });
});
