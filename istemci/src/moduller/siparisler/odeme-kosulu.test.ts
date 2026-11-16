import { describe, expect, it } from 'vitest';
import { odemeHatasi, odemeMetni, odemeSecimi, type OdemeSecimi } from './odeme-kosulu.ts';

const sec = (s: Partial<OdemeSecimi>): OdemeSecimi => ({ tur: '', sure: '30', birim: 'gun', metin: '', ...s });

describe('teklif ödeme koşulu', () => {
  it('seçimden metin yazılır; boş seçim ve boş "Diğer" null', () => {
    expect(odemeMetni(sec({ tur: 'simdi-pesin' }))).toBe('Şimdi peşin');
    expect(odemeMetni(sec({ tur: 'termin-pesin' }))).toBe('Terminde peşin');
    expect(odemeMetni(sec({ tur: 'termin-vade', sure: '45' }))).toBe('Terminden itibaren 45 gün vadeli');
    expect(odemeMetni(sec({ tur: 'simdi-vade', sure: '2', birim: 'ay' }))).toBe('Şimdiden itibaren 2 ay vadeli');
    expect(odemeMetni(sec({ tur: 'diger', metin: ' %50 avans ' }))).toBe('%50 avans');
    expect(odemeMetni(sec({}))).toBeNull();
    expect(odemeMetni(sec({ tur: 'diger' }))).toBeNull();
  });

  it('yazılan metin seçime geri çözülür; başka metin "Diğer" olarak kalır', () => {
    for (const s of [sec({ tur: 'simdi-pesin' }), sec({ tur: 'termin-pesin' }), sec({ tur: 'termin-vade', sure: '60' }), sec({ tur: 'simdi-vade', sure: '3', birim: 'ay' })]) {
      expect(odemeSecimi(odemeMetni(s))).toEqual(s);
    }
    expect(odemeSecimi('30 gün vadeli')).toEqual(sec({ tur: 'diger', metin: '30 gün vadeli' }));
    expect(odemeSecimi(null)).toEqual(sec({}));
  });

  it('vadeli seçimde süre 1-999 tam sayı', () => {
    expect(odemeHatasi(sec({ tur: 'termin-vade', sure: '0' }))).not.toBeNull();
    expect(odemeHatasi(sec({ tur: 'termin-vade', sure: '1,5' }))).not.toBeNull();
    expect(odemeHatasi(sec({ tur: 'simdi-vade', sure: '' }))).not.toBeNull();
    expect(odemeHatasi(sec({ tur: 'simdi-vade', sure: '90' }))).toBeNull();
    expect(odemeHatasi(sec({ tur: 'simdi-pesin', sure: '' }))).toBeNull();
  });
});
