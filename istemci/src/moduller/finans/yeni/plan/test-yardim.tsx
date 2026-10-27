import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ComponentType } from 'react';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { ornekHamVeri } from '../ornek-ham-veri.ts';
import { finansiKur, type FinansYetkisi } from '../veri.ts';

// F2 ekran testlerinin kurulumu: ekran doğrudan, sabit günle kurulmuş finans verisiyle çizilir (sayılar güne bağlıdır).
// Yazmalar test-ortak.tsx'teki sunucuKur ile yakalanır. Tuval bağlamı yoktur; grafik çizilmez, sayılar tabloda kalır.
export const BUGUN = '2026-10-15';
export const finansKur = (ham = ornekHamVeri()) => finansiKur(ham, BUGUN);

const yetkiKur = (y: Partial<FinansYetkisi>): FinansYetkisi => ({ oku: true, yaz: false, yonet: false, kurYaz: false, firmaOku: true, firmaYaz: false, ...y });
export const OKUR = yetkiKur({});
export const YAZAR = yetkiKur({ yaz: true });
export const YONETICI = yetkiKur({ yaz: true, yonet: true });

export function tuvalsiz() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as never);
}

export function ekranAc(Ekran: ComponentType<EkranOzellikleri>, yetki: FinansYetkisi, finans = finansKur()) {
  const kayitGir = vi.fn();
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={istemci}>
        <BildirimSaglayici>
          <Ekran finans={finans} yetki={yetki} kayitGir={kayitGir} />
        </BildirimSaglayici>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { kayitGir, finans };
}
