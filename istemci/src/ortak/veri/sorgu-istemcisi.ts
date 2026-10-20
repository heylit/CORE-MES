import { QueryClient } from '@tanstack/react-query';

// Ana sayfa ve menü onlarca uçtan okur; veri 30 sn taze sayılmazsa her sayfa dönüşünde hepsi yeniden çekilir.
// Yazmadan sonra ekranlar kendi anahtarını geçersiz kılar; bu süre yalnız kendiliğinden yeniden okumayı seyreltir.
export const VARSAYILAN_TAZELIK_MS = 30_000;

export function sorguIstemcisi(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: VARSAYILAN_TAZELIK_MS } },
  });
}
