import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { MOTOR_HAZIRLANIYOR } from '../motor.ts';
import type * as MotorModulu from '../motor.ts';
import { ikAc } from '../test-ortak.tsx';

// Motor kurulamazsa (kaynak yok) ekran sifir ya da tahmin yazmaz, "hazirlaniyor" der.
vi.mock('../motor.ts', async (asil) => ({ ...await asil<typeof MotorModulu>(), motorKur: () => null, ikSabitleri: () => null }));

afterEach(cleanup);

describe('P2 motorsuz', () => {
  it('bakiye ve form "hazırlanıyor" der, sıfır yazmaz', async () => {
    ikAc('/ik/yeni/izinler');
    await screen.findByText('Mehmet Deneme');
    fireEvent.click(screen.getByRole('tab', { name: 'Bakiyeler' }));
    expect(await screen.findByText(MOTOR_HAZIRLANIYOR)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'İzin talebi' }));
    expect(within(await screen.findByRole('dialog')).getByText(MOTOR_HAZIRLANIYOR)).toBeTruthy();
  });
});
