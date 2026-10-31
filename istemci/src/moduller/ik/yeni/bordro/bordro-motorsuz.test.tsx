import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import type * as MotorModulu from '../motor.ts';
import { MOTOR_HAZIRLANIYOR } from '../motor.ts';
import { ikAc } from '../test-ortak.tsx';

vi.mock('../motor.ts', async (asil) => ({ ...await asil<typeof MotorModulu>(), motorKur: () => null, ikSabitleri: () => null }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('P3 motor yüklenmeden', () => {
  it.each(['/ik/yeni/bordro', '/ik/yeni/hesaplamalar', '/ik/yeni/maliyet-plani', '/ik/yeni/ayarlar'])('%s hazırlanıyor iletisi gösterir, tutar uydurmaz', async (adres) => {
    const { yazmalar } = ikAc(adres);
    expect(await screen.findByText(MOTOR_HAZIRLANIYOR)).toBeTruthy();
    expect(screen.queryByText(/₺/)).toBeNull();
    expect(yazmalar).toHaveLength(0);
  });
});
