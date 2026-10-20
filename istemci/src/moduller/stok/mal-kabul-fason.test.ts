import { describe, expect, it } from 'vitest';
import { fasonOnerilenAdet } from './MalKabul.tsx';

describe('fason dönüşü önerilen adet (319)', () => {
  it('firmada kalanı önerir: gönderilen − dönen − hurda', () => {
    expect(fasonOnerilenAdet({ gonderilen: 100, donen: 30, hurda: 5 })).toBe('65');
  });
  it('firmada parça kalmadıysa öneri boş kalır; sıfır uydurulmaz', () => {
    expect(fasonOnerilenAdet({ gonderilen: 10, donen: 8, hurda: 2 })).toBe('');
    expect(fasonOnerilenAdet({ gonderilen: 10, donen: 9, hurda: 3 })).toBe('');
  });
});
