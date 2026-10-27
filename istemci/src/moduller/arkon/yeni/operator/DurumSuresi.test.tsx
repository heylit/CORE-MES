import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BILINMEYEN_SURE, DurumSuresi } from './DurumSuresi.tsx';

afterEach(() => { cleanup(); });

describe('797: durum süresi', () => {
  it('başlangıç bilinmiyorsa "—" yazar, sıfırdan saymaz', () => {
    render(<DurumSuresi durum="running" since={null} />);
    expect(screen.getByTitle(BILINMEYEN_SURE).textContent).toBe('—');
    expect(screen.getByRole('status').textContent).toContain('Çalışıyor');
  });

  it('başlangıç biliniyorsa geçen süreyi saat:dakika:saniye yazar', () => {
    render(<DurumSuresi durum="paused" since={Date.now() - 90_000} />);
    expect(screen.getByTitle('Bu durumda geçen süre').textContent).toMatch(/^00:01:3\d$/);
  });
});
