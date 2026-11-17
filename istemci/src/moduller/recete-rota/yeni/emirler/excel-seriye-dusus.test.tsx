import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../../../ortak/arayuz/Bildirim.tsx';
import type { RrDurumu } from '../veri.ts';
import { EmirExcelMenusu } from './ExcelGirisi.tsx';

// Test T2 (3411 a): Excel toplu girişte türünün yürürlükte rotası olmadığı için Seri rotasıyla açılan emirler sayıyla bildirilir.
// Pencere ve yazma sahtedir; ölçülen yalnız sunucu cevabındaki sayının bildirime dönmesidir.
const yazma = vi.hoisted(() => ({ seriyeDusen: 0 }));
vi.mock('../../../../ortak/excel/ExcelPenceresi.tsx', () => ({
  ExcelPenceresi: ({ yaz }: { yaz: (satirlar: readonly unknown[], istekKimligi: string) => Promise<unknown> }) => (
    <button type="button" onClick={() => { void yaz([], 'deneme'); }}>Sahte yaz</button>
  ),
}));
vi.mock('./excel.ts', () => ({
  emirTanimi: () => ({}), emirKaynagi: () => ({}), emirGuncelleTanimi: () => ({}), emirGuncelleYaz: () => Promise.resolve({}),
  emirYaz: () => Promise.resolve({ acilan: 3, seriyeDusen: yazma.seriyeDusen }),
}));
afterEach(() => { cleanup(); });

const ac = async (seriyeDusen: number) => {
  yazma.seriyeDusen = seriyeDusen;
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <BildirimSaglayici>
          <EmirExcelMenusu durum={{ items: [] } as unknown as RrDurumu} acabilir guncelleyebilir={false} acilis="yeni" />
        </BildirimSaglayici>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Sahte yaz' }));
};

describe('3411 Excel toplu girişte Seri düşüşü', () => {
  it('Seri rotasıyla açılan emir varsa sayısıyla bildirilir', async () => {
    await ac(2);
    expect(await screen.findByText('2 emir, türünün yürürlükte rotası olmadığı için Seri rotasıyla açıldı.')).toBeTruthy();
  });
  it('Seri rotasına düşen yoksa bildirim çıkmaz', async () => {
    await ac(0);
    await waitFor(() => { expect(screen.queryByText(/Seri rotasıyla açıldı/)).toBeNull(); });
  });
});
