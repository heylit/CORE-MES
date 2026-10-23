import { describe, expect, it } from 'vitest';
import { cakisanAdlar, gorunumEkrani, PARCALAR } from './sekmeler.ts';

describe('görünüm kaydı', () => {
  it('iki parça aynı görünüm adını bildirmez', () => {
    expect(cakisanAdlar(PARCALAR)).toEqual([]);
    const sahte = () => null;
    expect(cakisanAdlar({ a: { sorders: sahte }, b: { sorders: sahte, home: sahte } })).toEqual(['sorders', 'home']);
  });

  it('iş merkezi kayıtlı; kaydı olmayan görünüm null döner', () => {
    expect(gorunumEkrani('home')).not.toBeNull();
    expect(gorunumEkrani('olmayan')).toBeNull();
  });
});
